// Reviewable upgrade of two existing command bodies. No connection or business operation.
import assert from'node:assert/strict';
import{buildOwnFiscalFactsInstallation}from'./own-fiscal-facts-installation.mjs';
import{buildOwnPeriodParticipationSql}from'./own-period-participation-installation.mjs';
import{buildOwnSalarySenioritySql}from'./own-salary-seniority-installation.mjs';
import{ownInstallationFunctionPin}from'./own-payroll-installation.mjs';
import{pinsCheck,preservationSnapshot}from'./native-leave-installation.mjs';
import{splitPostgresStatements}from'./sql-statements.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",prefix='municontrol_participation_guard.';
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'PARTICIPATION_GUARD_SNAPSHOT_ANCHOR');return s.replace(a,()=>b);};
export function buildParticipationCommandGuardInstallation(options){
 assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const old=buildOwnFiscalFactsInstallation({...options,commandContentionGuard:false}),next=buildOwnFiscalFactsInstallation({...options,commandContentionGuard:true});
 const beforeBatch=buildOwnPeriodParticipationSql({...options,commandContentionGuard:false}),afterBatch=buildOwnPeriodParticipationSql({...options,commandContentionGuard:true});
 const get=b=>b.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_participation_command_v1('));
 const original=get(beforeBatch),replacement=get(afterBatch);assert.ok(original);assert.ok(replacement);
 const beforePin={...ownInstallationFunctionPin(original),runtime:true},afterPin={...ownInstallationFunctionPin(replacement),runtime:true};
 assert.deepEqual({...beforePin,sha256:null},{...afterPin,sha256:null});assert.notEqual(beforePin.sha256,afterPin.sha256);
 for(const p of beforeBatch.newPins){const n=afterBatch.newPins.find(n=>n.signature===p.signature);assert.ok(n);if(p.name!=='own_participation_command_v1')assert.deepEqual(n,p);}
 assert.deepEqual(beforeBatch.changed,afterBatch.changed,'existing readiness and payroll consumers must remain byte-identical');
 const beforeSeniority=buildOwnSalarySenioritySql({...options,commandContentionGuard:false}),afterSeniority=buildOwnSalarySenioritySql({...options,commandContentionGuard:true});
 const seniorityOriginal=beforeSeniority.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_seniority_command_v1(')),seniorityReplacement=afterSeniority.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_seniority_command_v1('));
 assert.ok(seniorityOriginal);assert.ok(seniorityReplacement);
 const seniorityBeforePin={...ownInstallationFunctionPin(seniorityOriginal),runtime:true},seniorityAfterPin={...ownInstallationFunctionPin(seniorityReplacement),runtime:true};
 assert.deepEqual({...seniorityBeforePin,sha256:null},{...seniorityAfterPin,sha256:null});assert.notEqual(seniorityBeforePin.sha256,seniorityAfterPin.sha256);
 for(const p of beforeSeniority.newPins){const n=afterSeniority.newPins.find(n=>n.signature===p.signature);assert.ok(n);if(p.name!=='own_seniority_command_v1')assert.deepEqual(n,p);}
 assert.deepEqual(beforeSeniority.changed,afterSeniority.changed,'seniority consumers must remain byte-identical');
 const pairs=[{original,replacement,beforePin,afterPin},{original:seniorityOriginal,replacement:seniorityReplacement,beforePin:seniorityBeforePin,afterPin:seniorityAfterPin}];
 const beforeCheck=old.afterCheck+';'+pinsCheck(pairs.map(p=>p.beforePin),'COMMAND_GUARD_FUNCTION_CHANGED'),afterCheck=next.afterCheck+';'+pinsCheck(pairs.map(p=>p.afterPin),'COMMAND_GUARD_FUNCTION_CHANGED');
 const snapshot=slot=>{
  let s=preservationSnapshot(slot).replaceAll('native_leave_event','mc_participation_guard_no_excluded_table').replaceAll('native_leave_%','mc_participation_guard_no_excluded_function_%').replaceAll('municontrol_sql111.',prefix);
  s=once(s,'public.digest(to_jsonb(p)::text,',"public.digest((CASE WHEN p.oid IN('public.own_participation_command_v1(jsonb,jsonb,uuid)'::regprocedure,'public.own_seniority_command_v1(jsonb,jsonb,uuid)'::regprocedure) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,");
  return s;
 };
 const before=snapshot('before'),after=snapshot('after');
 const mode=`DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'PARTICIPATION_GUARD_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(161);BEGIN EXECUTE ${q(beforeCheck)};PERFORM set_config('${prefix}mode','install',true);EXCEPTION WHEN OTHERS THEN EXECUTE ${q(afterCheck)};PERFORM set_config('${prefix}mode','verify',true);END;END $mode$`;
 const mutation=replacement.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ');
 const mutations=pairs.map(p=>p.replacement.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '));
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join(' ')}END IF;END $apply$`;
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'PARTICIPATION_GUARD_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const fingerprint="encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text FROM pg_proc p WHERE p.oid IN('public.own_participation_command_v1(jsonb,jsonb,uuid)'::regprocedure,'public.own_seniority_command_v1(jsonb,jsonb,uuid)'::regprocedure)),'sha256'),'hex')";
 const proof=modeValue=>`SELECT jsonb_build_object('version','participation-command-guard-installation.v2','sourceCommit',${q(options.sourceCommit)},'mode',${modeValue},'sourceHashes',${q(JSON.stringify(next.sourceHashes))}::jsonb,'newTables',0,'newFunctions',0,'adaptedFunctions',2,'existingAclChanges',0,'businessWrites',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',${fingerprint}) AS proof`;
 return{sourceCommit:options.sourceCommit,sourceHashes:next.sourceHashes,original,replacement,beforePin,afterPin,pairs,beforeCheck,afterCheck,before,after,mode,apply,conservation,mutation,mutations,statements:splitPostgresStatements([mode,before,apply,afterCheck,after,conservation,proof("current_setting('"+prefix+"mode')")].join(';\n')),verification:splitPostgresStatements([afterCheck,after,proof("'verify'")].join(';\n')),connects:false,executesSql:false};
}
export function assertParticipationCommandGuardDurability({installed,durable,batch}){
 for(const p of[installed,durable]){
  assert.equal(p.version,'participation-command-guard-installation.v2');assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);
  for(const[k,v]of Object.entries({newTables:0,newFunctions:0,adaptedFunctions:2,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(p[k],v,k);
  for(const k of['preservationSha256','objectFingerprint'])assert.match(p[k],/^[a-f0-9]{64}$/);
 }
 const{mode,...a}=installed,{mode:next,...b}=durable;assert.ok(['install','verify'].includes(mode));assert.equal(next,'verify');assert.deepEqual(a,b);return{passed:true,businessWrites:0};
}
