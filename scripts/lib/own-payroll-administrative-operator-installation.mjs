// Pure, reviewable generation. No connection, SQL execution or environment access.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {buildOwnContractSalaryConditionsInstallation} from './own-contract-salary-conditions-installation.mjs';
import {SALARY_ADMINISTRATIVE_CONTEXT} from './salary-administrative-identity-installation.mjs';

const q=v=>"'"+String(v).replaceAll("'","''")+"'",lf=s=>s.replace(/\r\n?/g,'\n'),hash=s=>createHash('sha256').update(s).digest('hex');
const prefix='municontrol_own_admin_operator.';
export const OWN_ADMIN_OPERATOR_MIGRATION='scripts/migrations/176-own-payroll-administrative-operator.sql';
export const OWN_ADMIN_OPERATOR_SOURCE_PINS=Object.freeze({
 'scripts/migrations/123-own-payroll-runs.sql':'a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b',
 'scripts/migrations/130-own-bulk-novelties.sql':'27bfed41ea1449b964fc8719c4d71a145ba9693b9c86086e2fa5db2fd14a9e4d',
 'scripts/lib/salary-administrative-identity-installation.mjs':'eb898f02b87eeeeca5edde201c9a0a7d9b03d777fce80ef6a22eac7d93820a71',
});
const targetNames=['own_run_context_v1','own_run_bootstrap_v1','own_novelty_sources_v1'];
const originalHashes=['86ab4abf6a5ee55f6e3432a301febe55967884eda4131b76430db79d9dfa0f33','e0041b8884d869fe257810190ad7df0fa97e78eab802ae65e3361550804acb27','b2b0a8339bd275e511f2e7fe53c74d1b02763fcf19ddd61772a74dca0d6ed2e0'];
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'OWN_ADMIN_OPERATOR_SOURCE_ANCHOR: '+a);return s.replace(a,()=>b);};
const pin=s=>{const p=ownInstallationFunctionPin(s);return{...p,runtime:p.name==='own_run_bootstrap_v1'};};
const contextReplacement=` IF nominal OR write_access THEN
  IF ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL THEN
   ctx:=ctx||jsonb_build_object('parameterActorVerified',true);
  ELSE
   ctx:=public.native_salary_administrative_context_v1(p);
  END IF;
  IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) THEN RAISE EXCEPTION 'OWN_RUN_EMPLOYMENT_REQUIRED';END IF;
 END IF;`;
const bootstrapReplacement=`DECLARE ctx jsonb;rows_json jsonb;nominal_ready boolean;actor_ready boolean:=false;
BEGIN ctx:=public.own_run_context_v1(p);
 nominal_ready:=public.action_center_context_has_capability(ctx,'payroll.calculation.nominal.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.nominal.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.export');
 IF nominal_ready THEN
  BEGIN
   ctx:=public.own_run_context_v1(p,true,false);
   actor_ready:=ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'parameterActorVerified')::boolean,false);
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT IN('OWN_RUN_EMPLOYMENT_REQUIRED','NATIVE_SALARY_IDENTITY_CHANGED') THEN RAISE;END IF;
  END;
 END IF;
 PERFORM public.own_run_lock_v1(ctx);`;
const calculateBefore="ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'payroll.calculation.prepare') AND public.action_center_context_has_capability(ctx,'payroll.calculation.nominal.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.nominal.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.export')";

export function deriveOwnPayrollAdministrativeOperator(originals){
 assert.equal(originals.length,3);
 originals.forEach((s,i)=>{const p=pin(s);assert.equal(p.name,targetNames[i]);assert.equal(p.sha256,originalHashes[i],'OWN_ADMIN_OPERATOR_ORIGINAL_BODY_CHANGED');});
 const changed=[
  once(originals[0]," IF (nominal OR write_access) AND(ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL) THEN RAISE EXCEPTION 'OWN_RUN_EMPLOYMENT_REQUIRED';END IF;",contextReplacement),
  once(once(originals[1],'DECLARE ctx jsonb;rows_json jsonb;BEGIN ctx:=public.own_run_context_v1(p);PERFORM public.own_run_lock_v1(ctx);',bootstrapReplacement),calculateBefore,"actor_ready AND nominal_ready AND public.action_center_context_has_capability(ctx,'payroll.calculation.prepare')"),
  once(originals[2],"ctx:=public.own_novelty_context_v1(p,'payroll.novelty.export');",'ctx:=public.own_run_context_v1(p,true,true);'),
 ].map(s=>s.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '));
 changed.forEach((s,i)=>assert.deepEqual({...pin(s),sha256:null},{...pin(originals[i]),sha256:null},'OWN_ADMIN_OPERATOR_HEADER_CHANGED'));
 return changed;
}

export function buildOwnPayrollAdministrativeOperatorInstallation({read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const texts={},sourceHashes={};for(const [file,expected]of Object.entries(OWN_ADMIN_OPERATOR_SOURCE_PINS)){
  texts[file]=lf(read(file));assert.equal(hash(texts[file]),expected,'OWN_ADMIN_OPERATOR_SOURCE_CHANGED: '+file);sourceHashes[file]=expected;
 }
 const statements=[...splitPostgresStatements(texts['scripts/migrations/123-own-payroll-runs.sql']),...splitPostgresStatements(texts['scripts/migrations/130-own-bulk-novelties.sql'])];
 const originals=targetNames.map(name=>{const found=statements.filter(s=>s.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(found.length,1);return found[0];});
 const changed=deriveOwnPayrollAdministrativeOperator(originals),source=lf(read(OWN_ADMIN_OPERATOR_MIGRATION));
 // The splitter retains leading review comments on its first statement. Only
 // discard that preface; comments/whitespace inside a function remain exact.
 const migration=splitPostgresStatements(source).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim());
 assert.deepEqual(migration,changed,'OWN_ADMIN_OPERATOR_UNREVIEWED_MIGRATION');sourceHashes[OWN_ADMIN_OPERATOR_MIGRATION]=hash(source);
 assert.equal(migration.length,3);assert.ok(migration.every(s=>/^CREATE OR REPLACE FUNCTION public\./.test(s)));
 const previous=buildOwnContractSalaryConditionsInstallation({read,sourceCommit});Object.assign(sourceHashes,previous.sourceHashes);
 const helperPin={...ownInstallationFunctionPin(lf(SALARY_ADMINISTRATIVE_CONTEXT)),runtime:false};assert.equal(helperPin.sha256,'346e45cc443193a34b8f000d988cd8e5b4356ec961173a82df91350fd0159451');
 const prerequisitePins=previous.afterPins.filter(p=>!targetNames.includes(p.name));
 const existing=prerequisitePins.find(p=>p.signature===helperPin.signature);if(existing)assert.deepEqual(existing,helperPin);else prerequisitePins.push(helperPin);
 // SQL123 is whole-file pinned above. The published chain changes capture,
 // receipt and completion, but leaves ownership and attempt bodies intact.
 // Preservation alone cannot certify those prior authorization bodies.
 for(const name of['own_run_owned_v1','own_run_attempt_v1']){
  const definitions=statements.filter(s=>s.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(definitions.length,1,'OWN_ADMIN_OPERATOR_OWNERSHIP_SOURCE_MISSING');
  const p=ownInstallationFunctionPin(definitions[0]),old=prerequisitePins.find(x=>x.signature===p.signature);if(old)assert.deepEqual(old,p);else prerequisitePins.push(p);
 }
 for(const[name,expected]of Object.entries({own_run_capture_v1:'ab89246306b8b5b337b40b8508f0d36e4890a5f6c5aef3ea997cff6e396e3af3',own_run_complete_v1:'f303a27603c035919449d05a1b4af9228a512a79b7667a4ede34011c2f334dc7',own_run_complete_full_v1:'1b2198ac93bd66ed5f7191ffabb69000de340e20d115cbddd1e32e85db6a8d37'}))assert.equal(prerequisitePins.find(p=>p.name===name)?.sha256,expected,'OWN_ADMIN_OPERATOR_FINALIZER_CHANGED');
 const beforePins=originals.map(pin),afterPins=changed.map(pin),allBefore=[...prerequisitePins,...beforePins],allAfter=[...prerequisitePins,...afterPins];
 assert.equal(new Set(allBefore.map(p=>p.signature)).size,allBefore.length);
 const beforeCheck=pinsCheck(allBefore,'OWN_ADMIN_OPERATOR_PREREQUISITE_CHANGED'),afterCheck=pinsCheck(allAfter,'OWN_ADMIN_OPERATOR_FUNCTION_CHANGED');
 const ids=beforePins.map(p=>q(p.signature)+'::regprocedure').join(',');
 const snapshot=slot=>{
  let s=preservationSnapshot(slot);
  s=s.replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true');
  s=once(s,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND true');
  s=once(s,"public.digest(to_jsonb(p)::text,'sha256')","public.digest((CASE WHEN p.oid IN("+ids+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");
  return s.replaceAll('municontrol_sql111.',prefix);
 };
 const before=snapshot('before'),after=snapshot('after');
 const modes=rows=>rows.map(p=>`(SELECT encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') FROM pg_proc p WHERE oid=to_regprocedure(${q(p.signature)}))=${q(p.sha256)}`).join(' AND ');
 const mode=`DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'OWN_ADMIN_OPERATOR_ISOLATION_REQUIRED';END IF;IF current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'OWN_ADMIN_OPERATOR_SERVER_UNREVIEWED';END IF;PERFORM set_config('lock_timeout','5s',true);PERFORM set_config('statement_timeout','180s',true);${[132142,132143,143,132149,132150,145,132164,156,132166,171,176].map(k=>'PERFORM pg_advisory_xact_lock('+k+');').join('')}IF ${modes(beforePins)} THEN PERFORM set_config('${prefix}mode','install',true);ELSIF ${modes(afterPins)} THEN PERFORM set_config('${prefix}mode','verify',true);ELSE RAISE EXCEPTION 'OWN_ADMIN_OPERATOR_PARTIAL_OR_DRIFTED';END IF;END $mode$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'OWN_ADMIN_OPERATOR_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const priorMetadata=`encode(public.digest(jsonb_build_object('objects',current_setting('${prefix}after')::jsonb-'tables'-'sequences','tables',(SELECT jsonb_agg(v-'rows'-'rowsSha256' ORDER BY v->>'schema',v->>'name') FROM jsonb_array_elements(current_setting('${prefix}after')::jsonb->'tables') v),'sequences',(SELECT jsonb_agg(jsonb_build_object('definition',to_jsonb(s),'owner',c.relowner,'acl',c.relacl,'options',c.reloptions) ORDER BY s.seqrelid) FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'))::text,'sha256'),'hex')`;
 const objectFingerprint=`encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${ids}))::text,'sha256'),'hex')`;
 const proof=(modeValue,tx)=>`SELECT jsonb_build_object('version','own-payroll-administrative-operator-installation.v1','sourceCommit',${q(sourceCommit)},'mode',${modeValue},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'newTables',0,'newFunctions',0,'adaptedFunctions',3,'roleAssignmentsAdded',0,'existingAclChanges',0,'associationWrites',0,'businessWrites',0,'nominalRowsReturned',0,'transactionDataPreserved',${tx},'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',${priorMetadata},'objectFingerprint',${objectFingerprint}) AS proof`;
 return{sourceCommit,sourceHashes,originals,migration,changed,beforePins,afterPins,prerequisitePins,beforeCheck,afterCheck,before,after,mode,choose,apply,conservation,statements:[mode,choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+prefix+"mode')",true)],verification:[afterCheck,after,proof("'verify'",false)],connects:false,executesSql:false};
}

export function assertOwnPayrollAdministrativeOperatorDurability({installed,durable,batch}){
 for(const p of[installed,durable]){
  assert.equal(p.version,'own-payroll-administrative-operator-installation.v1');assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);
  for(const[k,v]of Object.entries({newTables:0,newFunctions:0,adaptedFunctions:3,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(p[k],v);
  for(const k of['preservationSha256','priorMetadataSha256','objectFingerprint'])assert.match(p[k],/^[a-f0-9]{64}$/);
 }
 assert.equal(installed.transactionDataPreserved,true);assert.equal(durable.transactionDataPreserved,false);
 const{mode,transactionDataPreserved:tx,preservationSha256:data,...a}=installed,{mode:other,transactionDataPreserved:readTx,preservationSha256:later,...b}=durable;
 assert.ok(['install','verify'].includes(mode));assert.equal(other,'verify');assert.deepEqual(a,b,'OWN_ADMIN_OPERATOR_INSTALL_NOT_DURABLE');
}
