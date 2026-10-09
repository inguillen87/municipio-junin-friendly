// Schema-only upgrade of the installed jurisdiction/adoption/close composition.
// Original capture/result rows, hashes, keys and existing function ACL stay fixed.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {buildOwnJurisdictionInstallation} from './own-payroll-jurisdiction-installation.mjs';
import {buildActiveSourceDeclarationsInstallation} from './active-source-declarations-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'RUN_DATE_SOURCE_CHANGED: '+a.slice(0,70));return s.replace(a,()=>b);};
export function declaredDateCapture(definition){
 let value=once(definition," IF NOT public.own_program_exact_v1(body,ARRAY['period','liquidationType','selection','scopeVersion','programVersion','populationDomain'])",` IF body ? 'version' THEN
  IF body->>'version' IS DISTINCT FROM 'own-payroll-run-command.v2' OR jsonb_typeof(body->'liquidationDate') IS DISTINCT FROM 'string' OR body->>'liquidationDate'!~'^(19|20)[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
  BEGIN
   IF to_char((body->>'liquidationDate')::date,'YYYY-MM-DD') IS DISTINCT FROM body->>'liquidationDate' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END;
 END IF;
 IF NOT public.own_program_exact_v1(body,ARRAY['period','liquidationType','selection','scopeVersion','programVersion','populationDomain']||CASE WHEN body ? 'version' THEN ARRAY['version','liquidationDate'] ELSE ARRAY[]::text[] END)`);
 return value.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ');
}
export function declaredDateReceipt(definition){return once(definition,"'version','own-payroll-run.v1'","'version',CASE WHEN c.body->>'version'='own-payroll-run-command.v2' THEN 'own-payroll-run.v2' ELSE 'own-payroll-run.v1' END").replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ');}
export function buildOwnRunDateInstallation(options){
 assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const previous=buildOwnJurisdictionInstallation(options),declared=buildActiveSourceDeclarationsInstallation(options),currentReady=declared.afterDefinitions.at(-1),read=f=>options.read('scripts/migrations/'+f).replace(/\r\n?/g,'\n');
 const original=splitPostgresStatements(read('123-own-payroll-runs.sql'));
 const receipt=original.find(s=>s.startsWith('CREATE FUNCTION public.own_run_receipt_v1(')),bootstrap=original.find(s=>s.startsWith('CREATE FUNCTION public.own_run_bootstrap_v1('));assert.ok(receipt&&bootstrap);
 const oldCapture=previous.migration.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_run_capture_v1('));assert.ok(oldCapture);
 const pin=(s,runtime=false)=>({...ownInstallationFunctionPin(s),runtime});
 const beforeDefinitions=[oldCapture,receipt,currentReady],beforePins=beforeDefinitions.map(s=>pin(s,s===oldCapture));
 const capture=declaredDateCapture(oldCapture),updatedReceipt=declaredDateReceipt(receipt);
 const newSource=read('145-own-declared-liquidation-date.sql'),newStatements=splitPostgresStatements(newSource),newDefinition=newStatements.find(s=>s.includes('CREATE FUNCTION public.own_run_bootstrap_v2('));assert.ok(newDefinition);
 const newPin=pin(newDefinition,true),bootstrapPin=pin(bootstrap,true),capturePin=pin(capture,true),receiptPin=pin(updatedReceipt);
 let ready=currentReady;assert.ok(ready.includes(beforePins[0].sha256));ready=ready.replaceAll(beforePins[0].sha256,capturePin.sha256);
 ready=once(ready,' BEGIN ',' BEGIN EXECUTE '+q(pinsCheck([receiptPin,newPin],'RUN_DATE_PROTOCOL_CHANGED'))+'; ');
 const afterPins=[capturePin,receiptPin,pin(ready)];for(let i=0;i<3;i++)assert.deepEqual({...beforePins[i],sha256:null},{...afterPins[i],sha256:null});
 const sourceHashes={...previous.sourceHashes,...declared.sourceHashes,'123-own-payroll-runs.sql':hash(read('123-own-payroll-runs.sql')),'145-own-declared-liquidation-date.sql':hash(newSource)};
 const ids=beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(','),prefix='municontrol_run_date.';
 const newName="s.nspname='public' AND p.proname='own_run_bootstrap_v2'";
 const snapshot=slot=>preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("s.nspname='public' AND p.proname LIKE 'native_leave_%'",newName).replace('to_jsonb(p)::text',`(CASE WHEN p.oid IN(${ids}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`).replaceAll('municontrol_sql111.',prefix);
 const beforeCheck=pinsCheck([...beforePins,bootstrapPin],'RUN_DATE_BEFORE_CHANGED'),afterCheck=pinsCheck([...afterPins,newPin,bootstrapPin],'RUN_DATE_AFTER_CHANGED');
 const migration=[capture,updatedReceipt,...newStatements,ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ')];
 const mode=`DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'RUN_DATE_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132142);PERFORM pg_advisory_xact_lock(132143);PERFORM pg_advisory_xact_lock(143);PERFORM pg_advisory_xact_lock(132149);PERFORM pg_advisory_xact_lock(132150);PERFORM pg_advisory_xact_lock(145);PERFORM set_config('${prefix}mode',CASE WHEN to_regprocedure('public.own_run_bootstrap_v2(jsonb)') IS NULL THEN 'first' ELSE 'repeat' END,true);END $mode$`;
 const initial=`DO $initial$ BEGIN IF current_setting('${prefix}mode')='first' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $initial$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'RUN_DATE_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const proof=`SELECT jsonb_build_object('version','own-run-date-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'adaptedFunctions',3,'newRuntimeFunctions',1,'newTables',0,'existingAclChanges',0,'businessOperations',0,'nominalRowsReturned',0,'priorFingerprint',public.own_run_hash_v1(current_setting('${prefix}after')::jsonb),'objectFingerprint',public.own_run_hash_v1((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${ids},to_regprocedure('public.own_run_bootstrap_v2(jsonb)'))))) AS proof`;
 return {sourceCommit:options.sourceCommit,sourceHashes,beforeDefinitions,beforePins,afterPins,newPin,bootstrapPin,migration,installation:[mode,initial,snapshot('before'),apply,afterCheck,snapshot('after'),audit,proof],durableVerification:[afterCheck,snapshot('after'),proof]};
}
export function assertOwnRunDateDurability({installed,durable,batch}){
 assert.deepEqual(installed,durable);assert.equal(installed.version,'own-run-date-installation.v1');assert.equal(installed.sourceCommit,batch.sourceCommit);assert.deepEqual(installed.sourceHashes,batch.sourceHashes);
 for(const[k,v]of Object.entries({adaptedFunctions:3,newRuntimeFunctions:1,newTables:0,existingAclChanges:0,businessOperations:0,nominalRowsReturned:0}))assert.equal(installed[k],v);
 for(const key of ['priorFingerprint','objectFingerprint'])assert.match(installed[key],/^[a-f0-9]{64}$/);return {passed:true,priorStatePreserved:true,independentDurabilityVerified:true};
}
