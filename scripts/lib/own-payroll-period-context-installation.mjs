// Pure182 installation plan. Only four existing function bodies may change.
// No database, new relation, helper, role, grant or municipal decision.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {preservationSnapshot} from './native-leave-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {derivePayrollPeriodContextConsumers} from './own-payroll-period-context-consumers.mjs';
export const PAYROLL_PERIOD_CONTEXT_SQL_SHA256='80321aaa63a3b572127bfed926302a66acb4b3d479ebbfd3a876c9c665d88068';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex'),prefix='municontrol_period_context182.';
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'PERIOD_CONTEXT_INSTALL_SOURCE_CHANGED: '+a.slice(0,90));return s.replace(a,()=>b);};
export function buildPayrollPeriodContextInstallation({read,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);const sourceHashes={};const load=file=>{const s=read(file).replace(/\r\n?/g,'\n');sourceHashes[file]=hash(s);return s;};
 const consumers=derivePayrollPeriodContextConsumers({read:load,sourceCommit}),source=load('scripts/migrations/182-own-payroll-period-context.sql');
 assert.equal(hash(source),PAYROLL_PERIOD_CONTEXT_SQL_SHA256,'PERIOD_CONTEXT_INSTALL_SQL_CHANGED');
 const mutations=splitPostgresStatements(source).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim());assert.equal(mutations.length,4);assert.deepEqual(mutations,consumers.changed.map(s=>s.trim()),'PERIOD_CONTEXT_INSTALL_DERIVATION_CHANGED');
 for(const file of['scripts/lib/own-payroll-period-context-installation.mjs','scripts/lib/own-payroll-period-context-consumers.mjs','assets/own-payroll-period-context.js','assets/own-payroll-program-model.js','assets/own-payroll-run-model.js','assets/own-payroll-run-workspace-model.js','lib/own-payroll-approved-input.js','lib/internal-own-payroll-run.js'])load(file);
 const beforePins=consumers.prior.afterConsumerPins,afterPins=mutations.map((s,i)=>{const old=ownInstallationFunctionPin(consumers.originals[i]),next=ownInstallationFunctionPin(s);assert.deepEqual({...old,sha256:null},{...next,sha256:null},'PERIOD_CONTEXT_INSTALL_HEADER_CHANGED');return{...beforePins[i],sha256:next.sha256};});
 assert.equal(beforePins.length,4);assert.deepEqual(beforePins.map(p=>p.name),['own_program_definition_v1','own_program_command_v1','own_run_capture_v1','municipal_adoption_ready_v1']);
 const prerequisites=[...consumers.prior.prerequisitePins,...consumers.prior.newPins];assert.equal(new Set(prerequisites.map(p=>p.signature)).size,prerequisites.length);
 // Reuse the complete179 postcondition, including its ledger ACL/RLS/shape
 // and family-count guards. Function pins alone cannot certify the foundation.
 const beforeCheck=consumers.prior.afterCheck;let afterCheck=beforeCheck;
 for(let i=0;i<beforePins.length;i++)afterCheck=once(afterCheck,beforePins[i].sha256,afterPins[i].sha256);
 const ids=beforePins.map(p=>q(p.signature)+'::regprocedure').join(',');
 const snapshot=slot=>{
  let sql=preservationSnapshot(slot).replaceAll('municontrol_sql111.',prefix);const exclusion=" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";assert.equal(sql.split(exclusion).length-1,2);sql=sql.replaceAll(exclusion,'');
  sql=once(sql," AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'');
  sql=once(sql,"public.digest(to_jsonb(p)::text,'sha256')","public.digest((CASE WHEN p.oid IN("+ids+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");
  sql=once(sql,' BEGIN\n FOR c'," BEGIN\n IF EXISTS(SELECT 1 FROM pg_class period_context_relation JOIN pg_namespace period_context_namespace ON period_context_namespace.oid=period_context_relation.relnamespace WHERE period_context_namespace.nspname NOT LIKE 'pg_%' AND period_context_namespace.nspname<>'information_schema' AND period_context_relation.relkind IN('m','f')) OR EXISTS(SELECT 1 FROM pg_event_trigger) THEN RAISE EXCEPTION 'PERIOD_CONTEXT_INSTALL_UNAUDITED_OBJECT_SCOPE';END IF;\n FOR c");
  return sql;
 };
 const before=snapshot('before'),after=snapshot('after');
 const matches=pins=>pins.map(p=>"EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure("+q(p.signature)+") AND encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')="+q(p.sha256)+')').join(' AND ');
 const mode="DO $period_context_mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off' OR current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'PERIOD_CONTEXT_INSTALL_TRANSACTION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(182);PERFORM pg_advisory_xact_lock(179);PERFORM pg_advisory_xact_lock(177);IF "+matches(beforePins)+" THEN PERFORM set_config('"+prefix+"mode','install',true);ELSIF "+matches(afterPins)+" THEN PERFORM set_config('"+prefix+"mode','verify',true);ELSE RAISE EXCEPTION 'PERIOD_CONTEXT_INSTALL_CONSUMER_SET_CHANGED';END IF;END $period_context_mode$";
 const choose="DO $period_context_choose$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN EXECUTE "+q(beforeCheck)+";ELSE EXECUTE "+q(afterCheck)+";END IF;END $period_context_choose$";
 const apply="DO $period_context_apply$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN "+mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')+' END IF;END $period_context_apply$';
 const conservation="DO $period_context_conservation$ BEGIN IF current_setting('"+prefix+"before')::jsonb IS DISTINCT FROM current_setting('"+prefix+"after')::jsonb THEN RAISE EXCEPTION 'PERIOD_CONTEXT_INSTALL_PRIOR_STATE_CHANGED';END IF;END $period_context_conservation$";
 const objectFingerprint="encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN("+ids+"))::text,'sha256'),'hex')";
 const priorMetadata="encode(public.digest(jsonb_build_object('objects',current_setting('"+prefix+"after')::jsonb-'tables'-'sequences','tables',(SELECT jsonb_agg(v-'rows'-'rowsSha256' ORDER BY v->>'schema',v->>'name') FROM jsonb_array_elements(current_setting('"+prefix+"after')::jsonb->'tables') v),'sequences',(SELECT jsonb_agg(jsonb_build_object('definition',to_jsonb(seq),'owner',relation.relowner,'acl',relation.relacl,'options',relation.reloptions) ORDER BY seq.seqrelid) FROM pg_sequence seq JOIN pg_class relation ON relation.oid=seq.seqrelid JOIN pg_namespace ns ON ns.oid=relation.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema'))::text,'sha256'),'hex')";
 const proof=(mode,transaction)=>"SELECT jsonb_build_object('version','own-payroll-period-context-installation.v1','sourceCommit',"+q(sourceCommit)+",'sourceHashes',"+q(JSON.stringify(sourceHashes))+"::jsonb,'mode',"+mode+",'newTables',0,'newFunctions',0,'adaptedFunctions',4,'existingAclChanges',0,'roleAssignmentsAdded',0,'associationWrites',0,'businessWrites',0,'nominalRowsReturned',0,'transactionDataPreserved',"+transaction+",'preservationSha256',encode(public.digest(current_setting('"+prefix+"after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',"+priorMetadata+",'objectFingerprint',"+objectFingerprint+') AS proof';
 const readOnly="DO $period_context_readonly$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'on' OR current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'PERIOD_CONTEXT_INSTALL_READONLY_REQUIRED';END IF;END $period_context_readonly$";
 const statements=[mode,choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+prefix+"mode')",true)];
 const phaseCheck=expected=>"DO $period_context_phase$ BEGIN IF current_setting('"+prefix+"mode')<>"+q(expected)+" THEN RAISE EXCEPTION 'PERIOD_CONTEXT_INSTALL_PHASE_CHANGED';END IF;END $period_context_phase$";
 const installation=[mode,phaseCheck('install'),...statements.slice(1)],repetition=[mode,phaseCheck('verify'),...statements.slice(1)];
 return{sourceCommit,sourceHashes,prerequisites,beforePins,afterPins,beforeCheck,afterCheck,before,after,mode,choose,apply,conservation,mutations,statements,rehearsal:installation,installation,repetition,verification:[readOnly,afterCheck,after,proof("'verify'",false)],capture180Preserved:consumers.capture180Preserved,connects:false,executesSql:false};
}
export function assertPayrollPeriodContextDurability({installed,durable,batch}){
 for(const p of[installed,durable]){assert.equal(p.version,'own-payroll-period-context-installation.v1');assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);for(const[k,v]of Object.entries({newTables:0,newFunctions:0,adaptedFunctions:4,existingAclChanges:0,roleAssignmentsAdded:0,associationWrites:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(p[k],v);for(const key of['preservationSha256','priorMetadataSha256','objectFingerprint'])assert.match(p[key],/^[a-f0-9]{64}$/);}
 assert.ok(['install','verify'].includes(installed.mode));assert.equal(durable.mode,'verify');assert.equal(installed.transactionDataPreserved,true);assert.equal(durable.transactionDataPreserved,false);assert.equal(installed.priorMetadataSha256,durable.priorMetadataSha256);assert.equal(installed.objectFingerprint,durable.objectFingerprint);return{passed:true,transactionDataPreserved:true,priorMetadataPreserved:true,wholeDatabaseStaticAcrossConnections:false,businessWrites:0};
}
