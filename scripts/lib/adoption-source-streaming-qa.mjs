// Runs after every original administrative/operational scenario. Synthetic only.
import assert from 'node:assert/strict';
import {buildAdoptionSourceStreamingInstallation,coreStreamingPinsCheck} from './adoption-source-streaming-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {adoptionPreparationOperation} from '../../lib/internal-employment-adoption.js';
import {createEmploymentAdoptionHandler} from '../../api/internal-employment-adoption.js';
import {verifyAdoptionAdministrativeBrowser} from './adoption-administrative-identity-browser.mjs';
import fs from 'node:fs';import path from 'node:path';

export async function relocateAdoptionStreaming(batch,qa,db,previous){
 const n=qa.normalized,actualPin=d=>{const p=ownInstallationFunctionPin(d.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.'));return {...p,signature:p.signature.replace('public.',qa.schema+'.'),runtime:false};};
 const oldSource=n(batch.originals[0]),newSource=n(batch.changed[0]),helper=n(batch.helper);
 const beforeSource=actualPin(oldSource),afterSource=actualPin(newSource),helperPin=actualPin(helper);
 // The inherited suite deliberately uses a fictional predecessor adapter.
 // Its source metadata is inspected here; SQL061 equivalence is separately
 // tested with the canonical predecessor and both real delta layers.
 const corePins=await db.run(`SELECT jsonb_agg(jsonb_build_object('name',p.proname,'signature',${q(qa.schema)}||'.'||p.proname||'(uuid,text)','sha256',encode(public.digest(p.prosrc,'sha256'),'hex'),'argNames',p.proargnames,'modes',p.proargmodes,'result',pg_get_function_result(p.oid),'language',l.lanname,'config',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),'volatility',p.provolatile,'runtime',false) ORDER BY p.proname) FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.pronamespace=${q(qa.schema)}::regnamespace AND p.proname IN('grh_core_source_base_rows_v1','grh_core_source_unsealed_rows_v1')`);
 assert.equal(corePins.length,2);assert.equal(corePins.find(p=>p.name==='grh_core_source_base_rows_v1').sha256,ownBodyHash(n(batch.coreDefinitions[0])));
 const coreCheck=coreStreamingPinsCheck(corePins),readyBefore=previous.readyDefinition;
 const oldSourceHash=readyBefore.includes(beforeSource.sha256)?beforeSource.sha256:batch.beforePins[0].sha256;
 // Existing relocated readiness checks normalize schema-qualified bodies back
 // to public before hashing. New direct pins use the actual synthetic body.
 const newSourceHash=oldSourceHash===beforeSource.sha256?afterSource.sha256:batch.afterPins[0].sha256;
 assert.ok(readyBefore.includes(oldSourceHash),'QA_STREAMING_OLD_SOURCE_PIN_MISSING');
 assert.equal(readyBefore.split(' BEGIN ').length,2);
 const readyAfter=readyBefore.replaceAll(oldSourceHash,newSourceHash).replace(' BEGIN ',()=> ' BEGIN EXECUTE '+q(coreCheck+';'+pinsCheck([helperPin],'ADOPTION_STREAMING_HELPER_METADATA'))+';');
 const readyPin=actualPin(readyAfter),beforeCheck=previous.afterCheck+';'+coreCheck+';'+pinsCheck([beforeSource,previous.readyPin],'ADOPTION_STREAMING_BEFORE_METADATA');
 const afterCheck=previous.afterCheck.replaceAll(oldSourceHash,newSourceHash).replaceAll(previous.readyPin.sha256,readyPin.sha256)+';'+coreCheck+';'+pinsCheck([afterSource,readyPin,helperPin],'ADOPTION_STREAMING_AFTER_METADATA');
 const check=`DO $check$ BEGIN IF current_setting('municontrol_adoption_streaming.mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $check$`;
 const mutations=[helper,n(batch.mutations[1]),newSource.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '),readyAfter.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ')];
 const apply=`DO $apply$ BEGIN IF current_setting('municontrol_adoption_streaming.mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 return{beforeCheck,afterCheck,helperPin,corePins,statements:batch.statements.map((s,i)=>i===1?check:i===3?apply:i===4?afterCheck:n(s)),verification:batch.verification.map((s,i)=>i===0?afterCheck:n(s))};
}
function ownBodyHash(definition){const body=/AS (\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(definition);assert.ok(body);return ownInstallationFunctionPin(definition.replace(/CREATE OR REPLACE FUNCTION [\w]+\./,'CREATE OR REPLACE FUNCTION public.').replace(/RETURNS TABLE\([^)]*\)/,'RETURNS jsonb')).sha256;}

export async function adoptionSourceStreamingQaScenario({options,qa,db,run,tx,ok,administrative,principal,session,key,body,saved,key7,saved7,adminContract,browser,output}){
 const b=buildAdoptionSourceStreamingInstallation(options),r=await relocateAdoptionStreaming(b,qa,db,administrative),n=qa.normalized;
 // The original administrative scenario adds an extra fictional archived
 // contract solely to exercise audit identity. Remove that test-only duplicate
 // before comparing the exact 2452-source roster; keep the same audit person
 // through their canonical contract. Original administrative checks ran first;
 // the independent adoption decision follows this additional scenario.
 assert.match(adminContract,/^[a-f0-9-]{36}$/);
 run(tx([n(`UPDATE public.tenant_action_employment_link SET employment_contract_id=${q(qa.ids.makerContract)}::uuid WHERE employment_contract_id=${q(adminContract)}::uuid;ALTER TABLE public.employment_contract DISABLE TRIGGER grh_effective_baseline_rows;DELETE FROM public.employment_contract WHERE id=${q(adminContract)}::uuid AND legacy_legajo='ADMIN-QA';SET CONSTRAINTS ALL IMMEDIATE;ALTER TABLE public.employment_contract ENABLE TRIGGER grh_effective_baseline_rows`)]));
 const before=await adoptionPreparationOperation(db,principal,session,'operational-bootstrap',{revisionId:qa.revision,packageSha256:qa.packageSha});
 const fingerprint=()=>db.run(`SELECT jsonb_object_agg(e,${qa.schema}.grh_final_source_fingerprint_v1(${q(qa.revision)}::uuid,e,false)) FROM unnest(${qa.schema}.grh_final_source_entities_v1()) e`),beforeFingerprints=await fingerprint();
 assert.equal(Object.keys(beforeFingerprints).length,10);ok(true,'streaming baseline has all ten independently sealed domains');
 run(tx(r.statements,'ROLLBACK'));run(tx([r.beforeCheck]));ok(true,'streaming rehearsal rolls back the new private helper and both changed bodies');
 run(tx([n(b.helper),...r.statements]),'METADATA');run(tx([r.beforeCheck]));ok(true,'partial helper installation is refused and rolled back');
 const installed=JSON.parse(run(tx(r.statements))),durable=JSON.parse(run(tx(r.verification))),repeated=JSON.parse(run(tx(r.statements)));
 assert.equal(installed.mode,'install');assert.equal(repeated.mode,'verify');assert.equal(installed.preservationSha256,durable.preservationSha256);assert.equal(installed.preservationSha256,repeated.preservationSha256);ok(true,'conservative streaming installation is durable, repeatable and preserves every prior row and ACL');
 const observed=await db.run(`SELECT jsonb_object_agg(e,${qa.schema}.adoption_source_streaming_fingerprint_v1(${q(qa.revision)}::uuid,e)) FROM unnest(${qa.schema}.grh_final_source_entities_v1()) e`);assert.deepEqual(observed,beforeFingerprints);ok(true,'new helper equals the original complete fingerprint of all ten sets');
 const after=await adoptionPreparationOperation(db,principal,session,'operational-bootstrap',{revisionId:qa.revision,packageSha256:qa.packageSha});
 // The observation time is fresh for each read. Every source token, snapshot,
 // row, quantity, authority and pending attempt must still match exactly.
 assert.ok(Number.isFinite(Date.parse(before.review.queriedAt))&&Number.isFinite(Date.parse(after.review.queriedAt)));
 const compared=value=>({...value,review:{...value.review,queriedAt:null}});
 assert.deepEqual(compared(after),compared(before));ok(true,'actual SQL and application return the identical 855 scope, source token, facts and administrative authority');
 const old=await adoptionPreparationOperation(db,principal,session,'attempt',{key}),newer=await adoptionPreparationOperation(db,principal,session,'attempt',{key:key7});assert.equal(old.bodySha256,saved.bodySha256);assert.equal(newer.bodySha256,saved7.bodySha256);assert.equal((await adoptionPreparationOperation(db,principal,session,'propose',{key,body})).receipt.replayed,true);ok(true,'prior full-source and operational attempts recover with their unchanged bodies and keys');
 for(const [entity,table,column] of [['core/movements','employment_movement','quantity'],['core/payrollMonthly','payroll_monthly_fact','net_payable']]){
  const savedTable=qa.schema+'.qa_stream_restore_'+table;
  run(tx([`CREATE TABLE ${savedTable} AS TABLE ${qa.schema}.${table}`,n(`UPDATE public.${table} SET ${column}=${column}+0.01`)]));
  await assert.rejects(adoptionPreparationOperation(db,principal,session,'operational-bootstrap',{revisionId:qa.revision,packageSha256:qa.packageSha}),/fuente|SOURCE_CHANGED/);
  run(tx([`DELETE FROM ${qa.schema}.${table};INSERT INTO ${qa.schema}.${table} SELECT * FROM ${savedTable};DROP TABLE ${savedTable}`]));
  await adoptionPreparationOperation(db,principal,session,'operational-bootstrap',{revisionId:qa.revision,packageSha256:qa.packageSha});ok(true,entity+' changed data cannot pass the existing full source seal');
 }
 const fallback='core/payrollRuns',priorRow=await db.run(`SELECT to_jsonb(r) FROM ${qa.schema}.qa_base_rows r WHERE entity=${q(fallback)} LIMIT 1`);
 run(tx([`UPDATE ${qa.schema}.qa_base_rows SET record=record||'{"QA_DRIFT":true}'::jsonb WHERE entity=${q(fallback)}`]));await assert.rejects(adoptionPreparationOperation(db,principal,session,'operational-bootstrap',{revisionId:qa.revision,packageSha256:qa.packageSha}),/fuente|SOURCE_CHANGED/);
 run(tx([`UPDATE ${qa.schema}.qa_base_rows SET record=${q(JSON.stringify(priorRow.record))}::jsonb WHERE entity=${q(fallback)} AND row_key=${q(priorRow.row_key)}`]));await adoptionPreparationOperation(db,principal,session,'operational-bootstrap',{revisionId:qa.revision,packageSha256:qa.packageSha});ok(true,'an unoptimized domain still refuses altered bytes; none of the ten checks is skipped');
 const permission=await db.run(`SELECT jsonb_build_object('public',has_function_privilege('public',${q(r.helperPin.signature)},'EXECUTE'),'runtime',has_function_privilege('municontrol_actions_runtime_app',${q(r.helperPin.signature)},'EXECUTE'))`);assert.deepEqual(permission,{public:false,runtime:false});ok(true,'streaming remains private, without a new public or runtime entry point');
 run(tx(['GRANT EXECUTE ON FUNCTION '+r.helperPin.signature+' TO municontrol_actions_runtime_app',...r.statements]),'METADATA');run(tx(r.verification));ok(true,'widened helper permissions are rejected and rolled back without altering the installation');
 for(const p of r.corePins){run(tx(['ALTER FUNCTION '+p.signature+' COST 101',...r.verification]),'ADOPTION_STREAMING_CORE_METADATA');run(tx(r.verification));ok(true,p.name+' metadata drift cannot bypass complete source verification');}
 const sid=q(qa.actors.maker.actorSessionId)+'::uuid',mid=q(qa.ids.maker)+'::uuid';
 run(tx([`UPDATE ${qa.schema}.tenant_identity_session SET status='revoked' WHERE id=${sid}`]));
 try{await assert.rejects(adoptionPreparationOperation(db,principal,session,'operational-bootstrap',{revisionId:qa.revision,packageSha256:qa.packageSha}),/sesión|SESSION_INVALID/);ok(true,'session revocation still rejects optimized preparation with stale client authority');}finally{run(tx([`UPDATE ${qa.schema}.tenant_identity_session SET status='active' WHERE id=${sid}`]));}
 run(tx([`DELETE FROM ${qa.schema}.capabilities WHERE membership_id=${mid} AND capability_key IN('employee.record.propose','employee.record.approve')`]));
 try{await assert.rejects(adoptionPreparationOperation(db,principal,session,'attempt',{key}),/No se encontró|NOT_FOUND/);ok(true,'database permission revocation still prevents recovering the immutable pending request');}finally{run(tx([`INSERT INTO ${qa.schema}.capabilities SELECT ${mid},v FROM unnest(ARRAY['employee.record.propose','employee.record.approve']) v`]));}
 if(browser!=='none'){
  const folder=path.join(output,'streaming-browser');fs.mkdirSync(folder);
  const handler=createEmploymentAdoptionHandler({env:{INTERNAL_APP_ORIGIN:'https://adoption-admin-qa.example'},requireAccess:()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:()=>db});
  const fullBrowserReview=await adoptionPreparationOperation(db,principal,session,'final-active-bootstrap',{revisionId:qa.revision,packageSha256:qa.packageSha});
  assert.equal(fullBrowserReview.review.total,869);
  await verifyAdoptionAdministrativeBrowser({handler,review:fullBrowserReview.review,actor:qa.actors.maker,policy:'operative',check:(v,label)=>ok(v,'after streaming: '+label.replace('archived administrative author','administrative author')),browserName:browser,output:folder,revoke:async()=>run(tx([`UPDATE ${qa.schema}.tenant_action_employment_link SET active=false WHERE membership_id=${mid}`])),restore:async()=>run(tx([`UPDATE ${qa.schema}.tenant_action_employment_link SET active=true WHERE membership_id=${mid}`]))});
 }
 assert.deepEqual(await fingerprint(),beforeFingerprints);ok(true,'all original fingerprints remain unchanged after the refusal scenarios');
 return{installed,durable,repeated,allDomainsVerified:10,sourceTokenChanged:false,municipalOperations:0};
}
