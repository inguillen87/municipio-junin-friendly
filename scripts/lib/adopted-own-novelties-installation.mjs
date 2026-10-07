// Compose the reviewed SQL130 writer with the installed SQL132–142/operator
// contracts. No municipal connection, formula, identity or business command.
import assert from 'node:assert/strict';
import {buildOwnNoveltyInstallation,assertOwnNoveltyDurability} from './own-novelties-installation.mjs';
import {ownNoveltyCaptureSql} from './own-novelties-sql.mjs';
import {buildMunicipalAdoptionOperatorInstallation} from './municipal-adoption-operator-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'ADOPTED_NOVELTY_ANCHOR_CHANGED');return s.replace(a,()=>b);};
export function adoptedOwnNoveltyCapture(read){
 let sql=ownNoveltyCaptureSql(read);
 const replace=(from,to,count)=>{assert.equal(sql.split(from).length,count+1,'ADOPTED_NOVELTY_CAPTURE_CHANGED');sql=sql.replaceAll(from,to);};
 // The same reviewed substitutions as SQL140, keeping all four SQL130 additions.
 replace('public.native_employment_lifecycle_range_v1','public.payroll_fixed_registry_range_v2',2);
 replace('public.payroll_fixed_registry_range_v2(ctx,reg.employment_contract_id,',"public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),reg.employment_contract_id,",2);
 replace('public.payroll_fixed_registry_subject_by_contract_v1','public.payroll_fixed_registry_subject_v2',1);
 replace('public.native_employment_lifecycle_review,public.native_salary_event','public.native_employment_lifecycle_review,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal,public.native_salary_event',1);
 return sql;
}
export function buildAdoptedOwnNoveltyInstallation(options){
 const operator=buildMunicipalAdoptionOperatorInstallation(options),novelty=buildOwnNoveltyInstallation(options);
 const capture=adoptedOwnNoveltyCapture(options.read),capturePin={...ownInstallationFunctionPin(capture.replace(/;\s*$/,'')),runtime:true};
 const previousCapture=operator.consumers.afterPins.find(p=>p.name==='own_run_capture_v1');assert.ok(previousCapture);
 assert.deepEqual({...capturePin,sha256:null},{...previousCapture,sha256:null});
 const mapCapture=s=>once(s,previousCapture.sha256,capturePin.sha256);
 const consumerChecks=operator.consumers.postChecks.map(s=>s.includes(previousCapture.sha256)?mapCapture(s):s);
 const prerequisites=novelty.prerequisitePins.map(p=>operator.consumers.afterPins.find(a=>a.name===p.name)??p);
 const originalEmpty=novelty.preflight[0];
 const before=once(novelty.before,"p.proname='own_run_capture_v1'","p.proname IN('own_run_capture_v1','municipal_adoption_ready_v1')");
 const after=once(novelty.after,"p.proname='own_run_capture_v1'","p.proname IN('own_run_capture_v1','municipal_adoption_ready_v1')");
 const definitions=novelty.installation.slice(novelty.preflight.length+1,-5);
 assert.equal(definitions.filter(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_run_capture_v1(')).length,1);
 const migration=definitions.map(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_run_capture_v1(')?capture.replace(/;\s*$/,''):s.startsWith('CREATE FUNCTION public.own_novelty_bootstrap_v1(')?once(s,'public.payroll_fixed_registry_subject_by_contract_v1','public.payroll_fixed_registry_subject_v2'):s);
 const newPins=migration.filter(s=>s.startsWith('CREATE FUNCTION public.own_novelty_')).map(s=>({...ownInstallationFunctionPin(s),runtime:novelty.newPins.find(p=>p.name===ownInstallationFunctionPin(s).name).runtime}));assert.equal(newPins.length,16);
 const runtimeObjects=once(novelty.objectsCheck,'IF EXISTS(SELECT 1 FROM public.own_payroll_novelty_event) OR','IF');
 const readyChecks=[...consumerChecks,pinsCheck(newPins,'ADOPTED_NOVELTY_WRITER_METADATA'),runtimeObjects];
 const ready=operator.definitions[0].slice(0,operator.definitions[0].indexOf(' BEGIN '))+' BEGIN '+readyChecks.map(s=>'EXECUTE '+q(s)+';').join('\n')+' END $operator$',readyPin={...ownInstallationFunctionPin(ready),runtime:false};
 assert.deepEqual({...readyPin,sha256:null},{...operator.pins[0],sha256:null});
 const finalOperatorPins=operator.pins.map(p=>p.name===readyPin.name?readyPin:p);
 migration.push(ready.replace('CREATE FUNCTION public.','CREATE OR REPLACE FUNCTION public.'));
 const signatures=[capturePin.signature,readyPin.signature],ids=signatures.map(s=>'to_regprocedure('+q(s)+')').join(',');
 const metadata=()=>`SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${ids})`;
 const saveMetadata=`SELECT set_config('municontrol_adopted_novelty.metadata',(${metadata()})::text,true)`;
 const auditMetadata=`DO $metadata$ BEGIN IF current_setting('municontrol_adopted_novelty.metadata')::jsonb IS DISTINCT FROM (${metadata()}) THEN RAISE EXCEPTION 'ADOPTED_NOVELTY_PRIOR_FUNCTION_CHANGED';END IF;END $metadata$`;
 const finalPins=[...newPins,capturePin,...prerequisites.filter(p=>p.name!==capturePin.name),...finalOperatorPins];
 const afterPins=pinsCheck(finalPins,'ADOPTED_NOVELTY_FUNCTION_METADATA');
 const sourceHashes={...operator.consumers.sourceHashes,'130-own-bulk-novelties.sql':novelty.sql130Sha256};
 const proof=first=>{
  let s=(first?novelty.installation:novelty.durableVerification).at(-1);
  s=once(s,"proname='own_run_capture_v1'","proname IN('own_run_capture_v1','municipal_adoption_ready_v1')");
  s=once(s,"'consumersAdapted',1","'consumersAdapted',2");
  return once(s,"'sourceCommit',",`'version','adopted-own-novelties-installation.v1','sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'adoptedCaptureSha256',${q(capturePin.sha256)},'operatorReadySha256',${q(readyPin.sha256)},'adoptionWriterGranted',false,'sourceCommit',`);
 };
 const state=`DO $state$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'ADOPTED_NOVELTY_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132142);PERFORM pg_advisory_xact_lock(132143);PERFORM pg_advisory_xact_lock(130);END $state$`;
 return {sourceCommit:options.sourceCommit,sourceHashes,operator,novelty,capture,capturePin,ready,readyPin,readyChecks,runtimeObjects,newPins,finalOperatorPins,consumerChecks,finalPins,migration,before,after,
  installation:[state,...operator.consumers.postChecks,pinsCheck(operator.pins,'ADOPTED_NOVELTY_OPERATOR_PREREQUISITE'),originalEmpty,pinsCheck(prerequisites,'ADOPTED_NOVELTY_PREREQUISITE'),before,saveMetadata,...migration,after,novelty.priorAudit,auditMetadata,novelty.objectsCheck,...consumerChecks,afterPins,proof(true)],
  durableVerification:['SET TRANSACTION READ ONLY',state,after,novelty.objectsCheck,...consumerChecks,afterPins,proof(false)]};
}
export function assertAdoptedOwnNoveltyDurability({installed,durable,batch,sourceCommit}){
 const keys=['version','sourceCommit','sourceHashes','sql130Sha256','allChecksPassed','newTables','newFunctions','runtimeFacades','consumersAdapted','oldRowGuardsAdded','noveltyEvents','capabilityDefinitionsAdded','roleAssignmentsAdded','nominalRowsReturned','adoptionWriterGranted','adoptedCaptureSha256','operatorReadySha256','beforeFingerprint','afterFingerprint','newObjectFingerprint'];
 assert.deepEqual(Object.keys(installed).sort(),keys.sort());
 for(const field of ['beforeFingerprint','afterFingerprint','newObjectFingerprint'])assert.match(installed[field],/^[a-f0-9]{64}$/);
 for(const field of ['noveltyEvents','capabilityDefinitionsAdded','roleAssignmentsAdded','nominalRowsReturned'])assert.equal(installed[field],0);
 assert.equal(installed.oldRowGuardsAdded,1);
 const prior=assertOwnNoveltyDurability({installed,durable,sourceCommit});
 assert.equal(installed.version,'adopted-own-novelties-installation.v1');assert.deepEqual(installed.sourceHashes,batch.sourceHashes);
 assert.equal(installed.adoptedCaptureSha256,batch.capturePin.sha256);assert.equal(installed.operatorReadySha256,batch.readyPin.sha256);
 assert.equal(installed.consumersAdapted,2);assert.equal(installed.adoptionWriterGranted,false);
 assert.equal(installed.newTables,1);assert.equal(installed.newFunctions,16);assert.equal(installed.runtimeFacades,4);
 return {...prior,adoptedCapturePreserved:true,operatorReadinessUpdated:true};
}
