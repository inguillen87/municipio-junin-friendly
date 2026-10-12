// Exact complete fingerprints for adoption. Builds SQL only; never connects.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {buildAdoptionAdministrativeIdentityInstallation} from './adoption-administrative-identity-installation.mjs';
import {finalSourceStreamingFingerprintDefinition} from './final-source-fingerprint-streaming.mjs';
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'ADOPTION_STREAMING_ANCHOR_CHANGED');return s.replace(a,()=>b);};
const prefix='municontrol_adoption_streaming.';

// SQL061 has table-returning functions. Their output argument names/modes and
// the original search path are part of the prerequisite, not inferred at install.
export function coreStreamingPin(definition){
 const m=/CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?(\w+)\(([^)]*)\)\s*RETURNS TABLE\(([^)]*)\)\s*LANGUAGE (\w+)/.exec(definition);
 assert.ok(m,'ADOPTION_STREAMING_CORE_HEADER_CHANGED');
 const input=m[2].split(',').map(v=>v.trim().split(/\s+/)),output=m[3].split(',').map(v=>v.trim().split(/\s+/));
 assert.ok(input.every(v=>v.length===2)&&output.every(v=>v.length===2));
 const body=/AS (\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(definition);assert.ok(body);
 const header=definition.slice(0,body.index),configs=[...header.matchAll(/SET search_path=([^\n]*?)(?=\s+AS|$)/g)].map(m=>'search_path='+m[1].split(',').map(s=>s.trim()).join(', '));
 return{name:m[1],signature:'public.'+m[1]+'('+input.map(v=>v[1]).join(',')+')',sha256:createHash('sha256').update(body[2]).digest('hex'),argNames:[...input,...output].map(v=>v[0]),modes:[...input.map(()=>'i'),...output.map(()=>'t')],result:'TABLE('+output.map(v=>v.join(' ')).join(', ')+')',language:m[4],config:configs,volatility:/\bSTABLE\b/.test(header)?'s':'v',runtime:false};
}
export function coreStreamingPinsCheck(pins){return `DO $streaming_core$ DECLARE x jsonb;p pg_proc;BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
 IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR p.prosecdef OR p.proisstrict OR NOT p.proretset
 OR pg_get_function_result(p.oid)<>x->>'result' OR p.provolatile<>x->>'volatility' OR p.proparallel<>'u' OR p.proleakproof OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>1000
 OR coalesce(to_jsonb(p.proargmodes),'null'::jsonb) IS DISTINCT FROM x->'modes'
 OR coalesce(to_jsonb(p.proargnames),'[]'::jsonb) IS DISTINCT FROM x->'argNames' OR p.pronargdefaults<>0
 OR coalesce(to_jsonb(p.proconfig),'[]'::jsonb) IS DISTINCT FROM x->'config'
 OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>x->>'language'
 OR encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')<>x->>'sha256'
 OR has_function_privilege('public',p.oid,'EXECUTE') OR has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE')
 THEN RAISE EXCEPTION 'ADOPTION_STREAMING_CORE_METADATA' USING DETAIL=x->>'signature';END IF;END LOOP;END $streaming_core$`;}

export function buildAdoptionSourceStreamingInstallation(options){
 assert.equal(typeof options.read,'function');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const sourceHashes={},read=p=>{const s=options.read(p).replace(/\r\n?/g,'\n');sourceHashes[p]=createHash('sha256').update(s).digest('hex');return s;};
 const administrative=buildAdoptionAdministrativeIdentityInstallation({...options,read});
 const find=(defs,name)=>{const d=defs.filter(s=>new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.'+name+'\\(').test(s));assert.equal(d.length,1);return d[0];};
 const source=find(administrative.final.newDefinitions,'employment_adoption_final_source_v1'),ready=administrative.changed.at(-1);
 const originalCall='observed:=public.grh_final_source_fingerprint_v1(selected_revision.id,entity,false);';
 const updatedSource=once(source,originalCall,'observed:=public.adoption_source_streaming_fingerprint_v1(selected_revision.id,entity);');
 const helper=finalSourceStreamingFingerprintDefinition(read),pin=d=>({...ownInstallationFunctionPin(d),runtime:false});
 const helperPin=pin(helper),beforePins=[pin(source),pin(ready)],sourcePin=pin(updatedSource);
 assert.ok(ready.includes(beforePins[0].sha256),'ADOPTION_STREAMING_READY_SOURCE_PIN_MISSING');
 const coreDefinitions=splitPostgresStatements(read('scripts/migrations/061-grh-core-source-version.sql')).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,'' )).filter(s=>/^CREATE OR REPLACE FUNCTION grh_core_source_(?:base|unsealed)_rows_v1\(/.test(s));assert.equal(coreDefinitions.length,2);
 const corePins=coreDefinitions.map(coreStreamingPin),coreCheck=coreStreamingPinsCheck(corePins);
 const updatedReady=once(ready.replaceAll(beforePins[0].sha256,sourcePin.sha256),' BEGIN ',' BEGIN EXECUTE '+q(coreCheck+';'+pinsCheck([helperPin],'ADOPTION_STREAMING_HELPER_METADATA'))+';');
 const originals=[source,ready],changed=[updatedSource,updatedReady],afterPins=changed.map(pin);
 beforePins.forEach((p,i)=>assert.deepEqual({...p,sha256:null},{...afterPins[i],sha256:null}));
 const beforeCheck=administrative.afterCheck+';'+coreCheck+';'+pinsCheck(beforePins,'ADOPTION_STREAMING_BEFORE_METADATA');
 const replace=s=>beforePins.reduce((v,p,i)=>v.replaceAll(p.sha256,afterPins[i].sha256),s);
 const afterCheck=replace(administrative.afterCheck)+';'+coreCheck+';'+pinsCheck([...afterPins,helperPin],'ADOPTION_STREAMING_AFTER_METADATA');
 const mode=`DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'ADOPTION_STREAMING_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(164);PERFORM set_config('${prefix}mode',CASE WHEN to_regprocedure(${q(helperPin.signature)}) IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$`;
 const check=`DO $check$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $check$`;
 const mutations=[helper,`REVOKE ALL ON FUNCTION ${helperPin.signature} FROM PUBLIC,municontrol_actions_runtime_app`,...changed.map(s=>s.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '))];
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const snapshot=slot=>{
  let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND p.oid IS DISTINCT FROM to_regprocedure('+q(helperPin.signature)+')');
  s=once(s,'to_jsonb(p)::text',`(CASE WHEN p.oid IN(${beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);
  return s.replaceAll('municontrol_sql111.',prefix);
 };
 const before=snapshot('before'),after=snapshot('after'),audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'ADOPTION_STREAMING_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const runtimeCheck='DO $runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $runtime$';
 read('scripts/lib/final-source-fingerprint-streaming.mjs');read('scripts/lib/adoption-source-streaming-installation.mjs');
 const proof=modeValue=>`SELECT jsonb_build_object('version','adoption-source-streaming-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',${modeValue},'newTables',0,'newFunctions',1,'adaptedFunctions',2,'associationWrites',0,'existingAclChanges',0,'businessWrites',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return{administrative,sourceHashes,coreDefinitions,corePins,coreCheck,helper,helperPin,originals,changed,beforePins,afterPins,beforeCheck,afterCheck,mode,check,mutations,apply,before,after,audit,runtimeCheck,proof,statements:[mode,check,before,apply,afterCheck,runtimeCheck,after,audit,proof("current_setting('"+prefix+"mode')")],verification:[afterCheck,runtimeCheck,after,proof("'verify'")],connects:false,executesSql:false};
}
