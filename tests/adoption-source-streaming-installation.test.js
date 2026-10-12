import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildAdoptionSourceStreamingInstallation,coreStreamingPin} from '../scripts/lib/adoption-source-streaming-installation.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {adoptionPreparationError} from '../lib/internal-employment-adoption.js';
import {relocateAdoptionStreaming} from '../scripts/lib/adoption-source-streaming-qa.mjs';
import {buildFinalAdoptionQa} from '../scripts/lib/final-contract-adoption-qa.mjs';
import {createHash} from 'node:crypto';
const options={sourceCommit:'a'.repeat(40),read:p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')};
test('complete source validation changes only the fingerprint call, never the ten domains or source/context checks',()=>{
 const b=buildAdoptionSourceStreamingInstallation(options),source=b.originals[0],changed=b.changed[0];
 assert.equal(changed.replace('public.adoption_source_streaming_fingerprint_v1(selected_revision.id,entity)','public.grh_final_source_fingerprint_v1(selected_revision.id,entity,false)'),source);
 assert.match(changed,/FOREACH entity IN ARRAY public\.grh_final_source_entities_v1\(\)/);
 assert.match(changed,/observed IS DISTINCT FROM seal\.fingerprints->entity/);
 assert.ok(b.administrative.afterCheck.includes("proname LIKE 'grh_final_source_%')<>9"));
 assert.ok(!b.helperPin.name.startsWith('grh_final_source_'));
 assert.deepEqual(b.changed.map(s=>ownInstallationFunctionPin(s).name),['employment_adoption_final_source_v1','municipal_adoption_ready_v1']);
});
test('helper and canonical predecessor projections are privately pinned without changing permissions',()=>{
 const b=buildAdoptionSourceStreamingInstallation(options);
 assert.deepEqual(b.corePins.map(p=>p.name),['grh_core_source_base_rows_v1','grh_core_source_unsealed_rows_v1']);
 assert.deepEqual(b.corePins[0].modes,['i','i','t','t']);assert.deepEqual(b.corePins[0].config,['search_path=public, pg_temp']);
 assert.match(b.coreCheck,/ADOPTION_STREAMING_CORE_METADATA/);assert.match(b.coreCheck,/has_function_privilege\('public'/);
 for(const p of [...b.corePins,b.helperPin])assert.ok(b.changed[1].includes(p.sha256),p.name);
 assert.ok(b.mutations.includes('REVOKE ALL ON FUNCTION public.adoption_source_streaming_fingerprint_v1(uuid,text) FROM PUBLIC,municontrol_actions_runtime_app'));
 assert.doesNotMatch(b.mutations.join('\n'),/GRANT |CREATE TABLE|ALTER TABLE|INSERT INTO|UPDATE public\.|DELETE FROM/);
});
test('source and readiness metadata are the only prior fields excluded from whole-state preservation',()=>{
 const b=buildAdoptionSourceStreamingInstallation(options);
 assert.ok(b.before.includes("to_regprocedure('public.adoption_source_streaming_fingerprint_v1(uuid,text)')"));
 assert.ok(b.before.includes("to_jsonb(p)-'prosrc'"));assert.ok(b.before.includes('public.employment_adoption_final_source_v1(jsonb,uuid,text)'));
 assert.match(b.audit,/ADOPTION_STREAMING_PRIOR_STATE_CHANGED/);assert.match(b.mode,/repeatable read/);assert.match(b.mode,/pg_advisory_xact_lock\(164\)/);
 assert.match(b.apply,/='install'/);assert.match(b.runtimeCheck,/municipal_adoption_ready_v1/);
 b.beforePins.forEach((p,i)=>assert.deepEqual({...p,sha256:null},{...b.afterPins[i],sha256:null}));
 assert.equal(b.connects,false);assert.equal(b.executesSql,false);
});
test('unchanged administrative authority and separately installed command guards survive the source optimization',()=>{
 const b=buildAdoptionSourceStreamingInstallation(options);
 assert.ok(b.changed[1].includes(b.administrative.helperPin.sha256));
 for(const p of b.administrative.afterPins.slice(0,-1))assert.ok(b.changed[1].includes(p.sha256),p.name);
 for(const pair of b.administrative.commands.pairs){assert.ok(b.afterCheck.includes(pair.afterPin.sha256));assert.ok(!b.mutations.some(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.'+pair.afterPin.name+'(')));}
 assert.match(b.proof("'verify'"),/'newFunctions',1,'adaptedFunctions',2/);
});
test('changed projection anchors or malformed predecessor metadata refuse generation',()=>{
 assert.throws(()=>buildAdoptionSourceStreamingInstallation({...options,read:p=>options.read(p).replace("ELSIF p_entity='movements'","ELSIF p_entity='different'")}),/STREAMED_PROJECTION_ANCHOR_CHANGED/);
 assert.throws(()=>coreStreamingPin('CREATE FUNCTION invalid(x text) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL $$'),/CORE_HEADER_CHANGED/);
});
test('an incomplete source upgrade is reported as installation readiness, preserving the existing attempt',()=>{
 const result=adoptionPreparationError(new Error('ADOPTION_STREAMING_HELPER_METADATA'));
 assert.equal(result.status,503);assert.equal(result.code,'EMPLOYMENT_ADOPTION_NOT_READY');
});
test('synthetic relocation preserves the normalized source pin and independently pins actual helper bodies',async()=>{
 const b=buildAdoptionSourceStreamingInstallation({...options,legacyIdentityComparison:true}),qa=buildFinalAdoptionQa(17),n=qa.normalized;
 const core=b.coreDefinitions.map(d=>{
  const p=coreStreamingPin(d),body=/AS (\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(n(d))[2];
  return{...p,signature:p.signature.replace('public.',qa.schema+'.'),sha256:createHash('sha256').update(body).digest('hex')};
 });
 const ready=n(`CREATE FUNCTION public.municipal_adoption_ready_v1() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN PERFORM '${b.beforePins[0].sha256}'::text; END $$`);
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:qa.schema+'.municipal_adoption_ready_v1()',runtime:false};
 const previous={readyDefinition:ready,readyPin,afterCheck:`SELECT '${b.beforePins[0].sha256}','${readyPin.sha256}'`};
 const relocated=await relocateAdoptionStreaming(b,qa,{run:async()=>core},previous);
 assert.ok(relocated.afterCheck.includes(b.afterPins[0].sha256));
 assert.ok(!relocated.afterCheck.includes(b.beforePins[0].sha256));
 assert.ok(relocated.afterCheck.includes(relocated.helperPin.sha256));
 assert.equal(relocated.corePins.length,2);
});
