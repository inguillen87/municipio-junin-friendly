// Private integration candidate. Its author did not import or execute it.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {SALARY_ADMINISTRATIVE_CONTEXT} from './salary-administrative-identity-installation.mjs';

export const OWN_LIQUIDATION_BOOTSTRAP213_SQL='scripts/migrations/213-own-liquidation-bootstrap-administrative-operator.sql';
export const OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS=Object.freeze({
 'scripts/migrations/124-own-payroll-liquidation-decisions.sql':'03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a',
 'scripts/migrations/176-own-payroll-administrative-operator.sql':'f75fa2cddf6fe2e837044e73c6465eecdf41fbad7ec740745527e1bd54b94732',
 [OWN_LIQUIDATION_BOOTSTRAP213_SQL]:'9b69ee169010a853e05172498355bbc96f577e4b16d9d3d2fbf3e68544346c95',
 'scripts/lib/native-leave-installation.mjs':'57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef',
 'scripts/lib/own-payroll-installation.mjs':'6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0',
 'scripts/lib/sql-statements.mjs':'d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2',
 'scripts/lib/salary-administrative-identity-installation.mjs':'eb898f02b87eeeeca5edde201c9a0a7d9b03d777fce80ef6a22eac7d93820a71'
});
export const OWN_LIQUIDATION_BOOTSTRAP213_ENTRIES=Object.freeze([
 'scripts/lib/own-liquidation-bootstrap213-installation.mjs',
 'tests/own-liquidation-bootstrap213-installation.test.js',
 ...Object.keys(OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS)
]);
const PREFIX='municontrol_liq_bootstrap213.',VERSION='own-liquidation-bootstrap213-installation.v1';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const lf=value=>{assert.equal(typeof value,'string');return value.replace(/\r\n?/g,'\n');};
const clean=value=>value.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const once=(text,old,next)=>{assert.equal(text.split(old).length,2,'LIQ_BOOT213_SOURCE_ANCHOR_CHANGED');return text.replace(old,()=>next);};
const body=definition=>{const match=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(definition);assert.ok(match,'LIQ_BOOT213_FUNCTION_BODY_REQUIRED');return match[2];};
const one=(source,name)=>{const rows=splitPostgresStatements(source).map(clean).filter(value=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\(').test(value));assert.equal(rows.length,1,'LIQ_BOOT213_UNIQUE_FUNCTION_REQUIRED:'+name);return rows[0];};
const plans=new WeakMap();

const oldDeclaration='DECLARE ctx jsonb;rows_value jsonb;BEGIN ctx:=public.own_liquidation_context_v1(p);';
const newDeclaration=`DECLARE ctx jsonb;rows_value jsonb;nominal_ready boolean;actor_ready boolean:=false;
BEGIN ctx:=public.own_liquidation_context_v1(p);
 nominal_ready:=public.action_center_context_has_capability(ctx,'payroll.calculation.nominal.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.nominal.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.export');
 IF nominal_ready THEN
  BEGIN
   ctx:=public.own_liquidation_context_v1(p,true);
   actor_ready:=ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'parameterActorVerified')::boolean,false);
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT IN('OWN_RUN_EMPLOYMENT_REQUIRED','NATIVE_SALARY_IDENTITY_CHANGED') THEN RAISE;END IF;
  END;
 END IF;`;
const oldEligibility="ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export']) cap WHERE NOT public.action_center_context_has_capability(ctx,cap))";

// The full historical declaration is the preimage, including its original
// complete tenant/binding query, ordering,1000 bound and ownership disjunction.
export function deriveOwnLiquidationBootstrap213(original){
 const before={...ownInstallationFunctionPin(original),runtime:true};
 assert.equal(before.signature,'public.own_liquidation_bootstrap_v1(jsonb)');
 assert.equal(before.sha256,'cb2ff7973e93ad71e32045b2566a9bced4bac8a29fe71335aaf67b7482cc7a3b','LIQ_BOOT213_PREIMAGE_CHANGED');
 assert.deepEqual({...before,sha256:null},{name:'own_liquidation_bootstrap_v1',signature:'public.own_liquidation_bootstrap_v1(jsonb)',sha256:null,argNames:['p'],defaults:'',resultType:'jsonb',language:'plpgsql',returnsSet:false,strict:false,definer:true,volatility:'v',config:['search_path=pg_catalog, public, pg_temp','TimeZone=UTC'],runtime:true},'LIQ_BOOT213_PREIMAGE_METADATA_CHANGED');
 let next=once(original,'CREATE FUNCTION public.own_liquidation_bootstrap_v1(','CREATE OR REPLACE FUNCTION public.own_liquidation_bootstrap_v1(');
 next=once(next,oldDeclaration,newDeclaration);next=once(next,oldEligibility,'actor_ready AND nominal_ready');
 assert.deepEqual({...ownInstallationFunctionPin(next),runtime:true,sha256:null},{...before,sha256:null},'LIQ_BOOT213_METADATA_CHANGED');
 return next;
}

function snapshot(slot){
 let value=preservationSnapshot(slot);
 const excluded="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(value.split(excluded).length,3);value=value.replaceAll(excluded,'true');
 value=once(value,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND true');
 value=once(value,"public.digest(to_jsonb(p)::text,'sha256')","public.digest((CASE WHEN p.oid=to_regprocedure('public.own_liquidation_bootstrap_v1(jsonb)') THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");
 return value.replaceAll('municontrol_sql111.',PREFIX);
}

export function composeOwnLiquidationBootstrap213Plan({foundation,major,sourceCommit,read}){
 assert.ok(foundation&&foundation.major===major&&foundation.sourceCommit===sourceCommit,'LIQ_BOOT213_FOUNDATION_CHANGED');
 assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.match(foundation.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.equal(foundation.operationalPairBaseline,'published107');assert.equal(typeof foundation.normalized,'function');assert.equal(typeof read,'function');
 const texts={};for(const [file,sha256]of Object.entries(OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS)){texts[file]=lf(read(file));assert.equal(hash(texts[file]),sha256,'LIQ_BOOT213_SOURCE_CHANGED:'+file);}
 const source124=texts['scripts/migrations/124-own-payroll-liquidation-decisions.sql'];
 const original=one(source124,'own_liquidation_bootstrap_v1'),changed=deriveOwnLiquidationBootstrap213(original);
 const statements=splitPostgresStatements(texts[OWN_LIQUIDATION_BOOTSTRAP213_SQL]).map(clean);
 assert.deepEqual(statements,[changed],'LIQ_BOOT213_UNREVIEWED_FORWARD_DEFINITION');
 const rawBefore={...ownInstallationFunctionPin(original),runtime:true},rawAfter={...ownInstallationFunctionPin(changed),runtime:true};
 const rawPrerequisites=[
  {...ownInstallationFunctionPin(one(source124,'own_liquidation_context_v1')),runtime:false},
  {...ownInstallationFunctionPin(one(texts['scripts/migrations/176-own-payroll-administrative-operator.sql'],'own_run_context_v1')),runtime:false},
  {...ownInstallationFunctionPin(SALARY_ADMINISTRATIVE_CONTEXT),runtime:false}
 ];
 assert.equal(rawPrerequisites[2].sha256,'346e45cc443193a34b8f000d988cd8e5b4356ec961173a82df91350fd0159451');
 const rawDefinitions=[original,changed,one(source124,'own_liquidation_context_v1'),one(texts['scripts/migrations/176-own-payroll-administrative-operator.sql'],'own_run_context_v1'),SALARY_ADMINISTRATIVE_CONTEXT];
 const localDefinitions=rawDefinitions.map(value=>foundation.normalized(value));
 const newLocalDigest=hash(body(localDefinitions[1]));
 // A new local digest is a private extension. No foundation/hash-map mutation.
 const normalize=value=>foundation.normalized(value).replaceAll(rawAfter.sha256,newLocalDigest);
 const localPin=(raw,definition)=>({...raw,signature:raw.signature.replace('public.',foundation.schema+'.'),config:raw.config.map(value=>value.replace('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+foundation.schema+', public, pg_temp')),sha256:hash(body(definition))});
 const beforePin=localPin(rawBefore,localDefinitions[0]),afterPin=localPin(rawAfter,localDefinitions[1]),prerequisites=rawPrerequisites.map((pin,index)=>localPin(pin,localDefinitions[index+2]));
 const beforeCheck=pinsCheck([...prerequisites,beforePin],'LIQ_BOOT213_PREREQUISITE_CHANGED'),afterCheck=pinsCheck([...prerequisites,afterPin],'LIQ_BOOT213_FUNCTION_CHANGED');
 const schema=foundation.schema,signature=afterPin.signature;
 const environment=readOnly=>`DO $liq_boot213_environment$ BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')}
  OR current_setting('server_version_num')::integer/10000<>${major}
  OR NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.oid=${q(schema)}::regnamespace AND n.nspowner=current_user::regrole)
 THEN RAISE EXCEPTION 'LIQ_BOOT213_OWNER_TRANSACTION_REQUIRED';END IF;
 END $liq_boot213_environment$`;
 const digest=`(SELECT encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure(${q(signature)}))`;
 const mode=`DO $liq_boot213_mode$ BEGIN
 IF NOT pg_try_advisory_xact_lock(213) THEN RAISE EXCEPTION 'LIQ_BOOT213_BUSY';END IF;
 IF ${digest}=${q(beforePin.sha256)} THEN PERFORM set_config('${PREFIX}mode','install',true);
 ELSIF ${digest}=${q(afterPin.sha256)} THEN PERFORM set_config('${PREFIX}mode','verify',true);
 ELSE RAISE EXCEPTION 'LIQ_BOOT213_PARTIAL_OR_DRIFTED';END IF;
 END $liq_boot213_mode$`;
 const choose=`DO $liq_boot213_choose$ BEGIN IF current_setting('${PREFIX}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $liq_boot213_choose$`;
 const before=normalize(snapshot('before')),after=normalize(snapshot('after'));
 const apply=`DO $liq_boot213_apply$ BEGIN IF current_setting('${PREFIX}mode')='install' THEN EXECUTE ${q(localDefinitions[1])};END IF;END $liq_boot213_apply$`;
 const conservation=`DO $liq_boot213_conserved$ BEGIN IF current_setting('${PREFIX}before')::jsonb IS DISTINCT FROM current_setting('${PREFIX}after')::jsonb THEN RAISE EXCEPTION 'LIQ_BOOT213_PRIOR_STATE_CHANGED';END IF;END $liq_boot213_conserved$`;
 const proof=modeValue=>`SELECT jsonb_build_object('version',${q(VERSION)},'sourceCommit',${q(sourceCommit)},'schema',${q(schema)},'mode',${modeValue},'sourceHashes',${q(JSON.stringify(OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS))}::jsonb,'newTables',0,'newFunctions',0,'adaptedFunctions',1,'newCapabilities',0,'roleAssignmentsAdded',0,'existingAclChanges',0,'associationWrites',0,'businessWrites',0,'priorStatePreserved',true,'priorFingerprint',encode(public.digest(current_setting('${PREFIX}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',(SELECT encode(public.digest(to_jsonb(p)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure(${q(signature)})))`;
 const plan=Object.freeze({version:VERSION,foundation,major,sourceCommit,schema,sourceEntries:OWN_LIQUIDATION_BOOTSTRAP213_ENTRIES,sourceHashes:OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS,rawBefore,rawAfter,beforePin,afterPin,prerequisites:Object.freeze(prerequisites),original,changed,normalize,
  installation:Object.freeze([environment(false),mode,choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+PREFIX+"mode')")]),
  verification:Object.freeze([environment(true),afterCheck,after,proof("'verify'")])});
 plans.set(plan,{read,sourceHashes:OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS});return plan;
}

export function assertOwnLiquidationBootstrap213Proof(value,plan){
 assert.deepEqual(Reflect.ownKeys(value).sort(),['version','sourceCommit','schema','mode','sourceHashes','newTables','newFunctions','adaptedFunctions','newCapabilities','roleAssignmentsAdded','existingAclChanges','associationWrites','businessWrites','priorStatePreserved','priorFingerprint','objectFingerprint'].sort());
 assert.equal(value.version,VERSION);assert.equal(value.sourceCommit,plan.sourceCommit);assert.equal(value.schema,plan.schema);assert.ok(['install','verify'].includes(value.mode));
 assert.deepEqual(value.sourceHashes,plan.sourceHashes);
 for(const [key,wanted]of Object.entries({newTables:0,newFunctions:0,adaptedFunctions:1,newCapabilities:0,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,priorStatePreserved:true}))assert.equal(value[key],wanted,'LIQ_BOOT213_PROOF_CHANGED:'+key);
 for(const key of ['priorFingerprint','objectFingerprint'])assert.match(value[key],/^[a-f0-9]{64}$/);
 return value;
}

export function installOwnLiquidationBootstrap213(h){
 const plan=h.prepared?.liquidationBootstrap213,record=plans.get(plan);assert.ok(record,'LIQ_BOOT213_UNMINTED_PLAN');
 assert.strictEqual(plan.foundation,h.qa);assert.equal(plan.major,h.major);assert.equal(plan.schema,h.qa.schema);assert.equal(plan.sourceCommit,h.sourceCommit);
 assert.equal(h.sourceCustody?.sourceCommit,h.sourceCommit,'LIQ_BOOT213_SOURCE_CUSTODY_REQUIRED');
 for(const [file,expected]of Object.entries(record.sourceHashes))assert.equal(hash(lf(record.read(file))),expected,'LIQ_BOOT213_SOURCE_CHANGED:'+file);
 const baseline=h.readFullSnapshot();h.setPhase('liquidation-bootstrap213-rehearsal');
 const rehearsal=h.json(plan.installation,{end:'ROLLBACK',fullJson:true});assertOwnLiquidationBootstrap213Proof(rehearsal,plan);assert.equal(rehearsal.mode,'install');
 assert.deepEqual(h.readFullSnapshot(),baseline,'LIQ_BOOT213_REHEARSAL_CHANGED_STATE');
 h.setPhase('liquidation-bootstrap213-installation');const installed=h.json(plan.installation,{fullJson:true});assertOwnLiquidationBootstrap213Proof(installed,plan);assert.equal(installed.mode,'install');
 const committed=h.readFullSnapshot();h.setPhase('liquidation-bootstrap213-durable-readonly');const durable=h.json(plan.verification,{readOnly:true,fullJson:true});assertOwnLiquidationBootstrap213Proof(durable,plan);assert.equal(durable.mode,'verify');
 assert.deepEqual({...durable,mode:'install'},installed,'LIQ_BOOT213_DURABILITY_CHANGED');assert.deepEqual(h.readFullSnapshot(),committed,'LIQ_BOOT213_READBACK_CHANGED_STATE');
 h.setPhase('liquidation-bootstrap213-repetition');const repeated=h.json(plan.installation,{fullJson:true});assertOwnLiquidationBootstrap213Proof(repeated,plan);assert.equal(repeated.mode,'verify');assert.deepEqual(repeated,durable,'LIQ_BOOT213_REPETITION_CHANGED');assert.deepEqual(h.readFullSnapshot(),committed,'LIQ_BOOT213_REPETITION_CHANGED_STATE');
 h.check('forward213 aligns liquidation history authority with verified administrative detail, preserving all rows/OIDs/ACL and old RPC/DTO before capacity business');
 return Object.freeze({version:'own-liquidation-bootstrap213-admission.v1',passed:true,sourceCommit:h.sourceCommit,rehearsal,installed,durable,repeated,sourceHashes:plan.sourceHashes,production:false});
}
