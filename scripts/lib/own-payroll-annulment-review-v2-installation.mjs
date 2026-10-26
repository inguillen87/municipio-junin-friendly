// SOURCE CANDIDATE: installs only inside the caller's already admitted canonical190.
// No top-level construction, connection, native execution or observed expected pins.
// Constructor/native admission remains reserved for separately reviewed CI.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {ownFullCapacity190Snapshot,OWN_FULL_CAPACITY_190_SQL,OWN_FULL_CAPACITY_190_SQL_SHA256} from './own-payroll-full-capacity-190-installation.mjs';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';

export const OWN_ANNUL_REVIEW208_SQL='scripts/migrations/208-own-annulment-review-index.sql';
export const OWN_ANNUL_REVIEW208_SQL_SHA256='2f0b030f12570f37ea3357707309422754522af66dc85475fd81e9a473c1b402';
const NOVELTY197_SQL='scripts/migrations/197-own-novelty-succession.sql';
const NOVELTY197_SHA256='13ad516bfd653a03b5fae8987486abeef1c13a5d629264b0c680d57c5a5bb43c';
const prefix='municontrol_annul_review208.',version='own-annulment-review208-installation-proof.v1';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",lf=v=>v.replace(/\r\n?/g,'\n');
const hash=v=>createHash('sha256').update(v).digest('hex');
const SHA=/^[a-f0-9]{64}$/,SCHEMA=/^mc_qa_fixed_092_[a-f0-9]{32}$/;
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const once=(source,old,next)=>{assert.equal(source.split(old).length,2,'ANNUL208_SOURCE_ANCHOR_CHANGED');return source.replace(old,()=>next);};
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m,'ANNUL208_SOURCE_BODY_REQUIRED');return m[2];};
const signatures=Object.freeze([
 ['own_annul_review_core_v2','jsonb,text,text,integer',false],
 ['own_annul_selected_index_v2','jsonb,jsonb,jsonb',false],
 ['own_annul_command_index_core_v2','jsonb,jsonb,uuid,integer',false],
 ['own_annul_review_v2','jsonb,text,text',true],
 ['own_annul_review_full_v2','jsonb,text,text',true],
 ['own_annul_command_v2','jsonb,jsonb,uuid',true],
 ['own_annul_command_full_v2','jsonb,jsonb,uuid',true]
]);
const required=Object.freeze([
 ['own_liquidation_context_v1','public.own_liquidation_context_v1(jsonb,boolean,text)','graph190',false],
 ['own_liquidation_capture_v1','public.own_liquidation_capture_v1(jsonb,uuid)','graph190',false],
 ['own_liquidation_current_v1','public.own_liquidation_current_v1(jsonb,text,text)','support197',false],
 ['own_liquidation_rows_v1','public.own_liquidation_rows_v1(jsonb,public.own_payroll_run_capture)','after197',false],
 ['own_liquidation_state_v1','public.own_liquidation_state_v1(jsonb,public.own_payroll_run_capture)','after197',false],
 ['own_liquidation_command_v1','public.own_liquidation_command_v1(jsonb,jsonb,uuid)','after197',true],
 ['own_annul_attempt_capacity_core_v2','public.own_annul_attempt_capacity_core_v2(jsonb,uuid,integer)','capacity201',false],
 ['own_close_active_v1','public.own_close_active_v1(jsonb,text,text)','support197',false],
 ['own_close_guard_v1','public.own_close_guard_v1(jsonb,text,text,uuid[])','support197',false],
 ['own_run_hash_v1','public.own_run_hash_v1(jsonb)','support197',false],
 ['own_run_lock_v1','public.own_run_lock_v1(jsonb)','support197',false],
 ['native_salary_scope_v1','public.native_salary_scope_v1(jsonb)','graph190',false],
 ['own_program_exact_v1','public.own_program_exact_v1(jsonb,text[])','graph190',false]
]);
const SOURCE_PINS=Object.freeze({
  "scripts/lib/own-payroll-full-capacity-190-installation.mjs": "f88d5a1979201c17572ae3c6932675dc991641cb736b9480895fd2ff761153eb",
  "scripts/lib/own-payroll-installation.mjs": "6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0",
  "scripts/lib/native-leave-installation.mjs": "57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef",
  "scripts/lib/own-novelty-succession-qa.mjs": "f49b9d3c07fa92734be9f23689dc0aa425ce7b827a951bec436f10ea3f95b929",
  "scripts/lib/own-novelty-succession-installation.mjs": "627ffea8e252311f31b87abe46346bd76578e583de34b606a74aa53eacb494d0",
  "scripts/lib/municipal-owner-adoption-decision-qa.mjs": "3818ada20ee500085c8045e683b29c9bb55a4eaa03fc2137f7d817228f72136a",
  "scripts/verify-documentary-roster-performance.mjs": "e058f3450118b23bf16ee1cf7e75b866624153246ce163aed3bf3c96d5f96124",
  "scripts/lib/adopted-documentary-installation.mjs": "9d420e046e9debbef0e584aa47f965f495214bdb4fa6db5de4564edb917d707b"
});
const plans=new WeakMap();

function localPin(definition,normalize,schema,runtime){
 const local=normalize(definition),at=local.search(/\bAS\s+\$/);assert.ok(at>0,'ANNUL208_LOCAL_HEADER_REQUIRED');
 const header=once(local.slice(0,at),'FUNCTION '+schema+'.','FUNCTION public.');
 const pin=ownInstallationFunctionPin(header+local.slice(at));
 return {...pin,signature:pin.signature.replace(/^public\./,schema+'.'),runtime};
}
function oneDefinition(definitions,name){
 assert.ok(Array.isArray(definitions),'ANNUL208_CANONICAL_DEFINITIONS_REQUIRED');
 const rows=definitions.filter(d=>typeof d==='string'&&new RegExp('^CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\(').test(d));
 assert.equal(rows.length,1,'ANNUL208_EXACT_SOURCE_DEFINITION_REQUIRED:'+name);return rows[0];
}
function sourceDefinitions201(source){
 const definitions=[];
 for(const m of source.matchAll(/\bCREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\(([\s\S]*?)\bAS\s+(\$[\w]*\$)([\s\S]*?)\3/g))definitions.push(m[0]);
 assert.equal(definitions.length,25,'ANNUL208_WHOLE_201_SOURCE_REQUIRED');return definitions;
}
function checkedSources(h,monthly){
 const expected=new Map();
 for(const map of [h.qa.sourceHashes,monthly.sourceHashes,SOURCE_PINS,{[OWN_FULL_CAPACITY_190_SQL]:OWN_FULL_CAPACITY_190_SQL_SHA256,[NOVELTY197_SQL]:NOVELTY197_SHA256,[OWN_ANNUL_REVIEW208_SQL]:OWN_ANNUL_REVIEW208_SQL_SHA256}]){
  assert.ok(map&&typeof map==='object'&&!Array.isArray(map),'ANNUL208_SOURCE_HASHES_REQUIRED');
  for(const [file,digest]of Object.entries(map)){assert.match(file,/^(?:scripts|tests|assets|lib|api)\/[A-Za-z0-9_./-]+$/,'ANNUL208_SOURCE_PATH_REQUIRED');assert.ok(!file.split('/').includes('..'));assert.match(digest,SHA,'ANNUL208_REVIEWED_SOURCE_PIN_REQUIRED:'+file);if(expected.has(file))assert.equal(expected.get(file),digest,'ANNUL208_SOURCE_PIN_CONFLICT:'+file);expected.set(file,digest);}
 }
 const texts=new Map(),sourceHashes={};
 for(const [file,digest]of expected){const text=lf(h.read(file));assert.equal(hash(text),digest,'ANNUL208_SOURCE_CHANGED:'+file);texts.set(file,text);sourceHashes[file]=digest;}
 return {texts,sourceHashes,bookend:()=>{for(const [file,digest]of expected)assert.equal(hash(lf(h.read(file))),digest,'ANNUL208_SOURCE_BOOKEND_CHANGED:'+file);return {version:'own-annulment-review208-source-bookend.v1',passed:true,sourceCommit:h.sourceCommit,sourceHashes:{...sourceHashes},sourceMetadataOnly:true,observedMetadataUsed:false};}};
}
function predecessorSourcePins(h,admission,sources){
 const monthly=admission.monthly,capacity=admission.capacityPlan,graph=h.qa.foundation?.foundation?.foundation?.owner?.graph;
 assert.ok(graph?.pool instanceof Map&&Array.isArray(graph.definitions),'ANNUL208_SAME190_GRAPH_REQUIRED');
 assert.ok(capacity&&typeof capacity==='object','ANNUL208_EXISTING201_PLAN_REQUIRED');
 for(const key of ['afterPins','supportPins','adapted','supportDefinitions'])assert.ok(Array.isArray(monthly.novelty197?.[key]),'ANNUL208_CANONICAL197_SOURCE_REQUIRED:'+key);
 for(const key of ['expectedQaAfterPins','expectedQaSupportPins'])assert.ok(Array.isArray(monthly[key]),'ANNUL208_CANONICAL197_LOCAL_PINS_REQUIRED:'+key);
 assert.equal(capacity.sourceSha256,OWN_FULL_CAPACITY_190_SQL_SHA256,'ANNUL208_WHOLE201_SOURCE_REQUIRED');
 assert.ok(Array.isArray(capacity.postLocal)&&capacity.postLocal.length===27,'ANNUL208_EXACT201_PLAN_REQUIRED');
 const definitions201=sourceDefinitions201(sources.texts.get(OWN_FULL_CAPACITY_190_SQL));
 const predecessorPins=[],provenance=[];
 for(const [name,signature,origin,runtime]of required){
  let definition,normalize=h.qa.normalized,expectedSource,expectedLocal;
  if(origin==='after197'){
   definition=oneDefinition(monthly.novelty197?.adapted,name);normalize=monthly.normalized;
   expectedSource=monthly.novelty197.afterPins.find(p=>p.signature===signature);expectedLocal=monthly.expectedQaAfterPins.find(p=>p.name===name);
  }else if(origin==='support197'){
   definition=oneDefinition(monthly.novelty197?.supportDefinitions,name);normalize=monthly.normalized;
   expectedSource=monthly.novelty197.supportPins.find(p=>p.signature===signature);expectedLocal=monthly.expectedQaSupportPins.find(p=>p.name===name);
  }else if(origin==='capacity201'){
   definition=oneDefinition(definitions201,name);const record=capacity.postLocal.find(p=>p.name===name);assert.ok(record,'ANNUL208_SOURCE201_PIN_REQUIRED');
   expectedLocal={record};
  }else{
   definition=oneDefinition(graph.definitions,name);
   const candidate=ownInstallationFunctionPin(definition);
   assert.equal(graph.pool.get(signature+'|'+candidate.sha256),definition,'ANNUL208_GRAPH_DEFINITION_UNSEALED:'+name);
   // The four private support ACLs are an explicit208 prerequisite, not learned from a live installation.
   const hint=graph.pinHints?.get(signature+'|'+candidate.sha256);if(hint)assert.equal(hint.runtime,runtime,'ANNUL208_GRAPH_SOURCE_ACL_CONFLICT:'+name);
  }
  const sourcePin={...ownInstallationFunctionPin(definition),runtime};assert.equal(sourcePin.signature,signature,'ANNUL208_PREREQUISITE_SIGNATURE');
  if(expectedSource)assert.deepEqual(sourcePin,expectedSource,'ANNUL208_CANONICAL197_SOURCE_CHANGED:'+name);
  else assert.ok(origin==='graph190'||origin==='capacity201','ANNUL208_EXPECTED_SOURCE_PIN_REQUIRED:'+name);
  const pin=localPin(definition,normalize,h.qa.schema,runtime);
  if(expectedLocal?.record){
   //201 core records intentionally contain no result/language columns. Check
   // their WHOLE exact shape, and seal the full header independently by source.
   assert.deepEqual({...sourcePin,sha256:null},{name:'own_annul_attempt_capacity_core_v2',signature:'public.own_annul_attempt_capacity_core_v2(jsonb,uuid,integer)',sha256:null,argNames:['p','key','maximum_bytes'],defaults:'',resultType:'jsonb',language:'plpgsql',returnsSet:false,strict:false,definer:true,volatility:'v',config:['search_path=pg_catalog, public, pg_temp'],runtime:false},'ANNUL208_EXACT201_CORE_HEADER_REQUIRED');
   assert.deepEqual(expectedLocal.record,{name:pin.name,signature:pin.signature,argNames:pin.argNames,config:pin.config,runtime:pin.runtime,bodySha256:pin.sha256,volatility:pin.volatility,kind:'core'},'ANNUL208_EXACT201_POST_LOCAL_RECORD_REQUIRED');
  }
  else if(expectedLocal)assert.deepEqual(pin,expectedLocal,'ANNUL208_CANONICAL197_LOCAL_CHANGED:'+name);
  else assert.equal(origin,'graph190');
  predecessorPins.push(pin);provenance.push({name,signature,origin,runtime,sourceDefinitionSha256:hash(definition),sourceBodySha256:hash(body(definition)),localDefinitionSha256:hash(normalize(definition)),localBodySha256:pin.sha256});
 }
 assert.equal(predecessorPins.length,13);assert.equal(new Set(predecessorPins.map(p=>p.signature)).size,13);return {predecessorPins,provenance};
}
function aclAndOverloads(pins,code){
 return `DO $annul208_acl$ DECLARE x jsonb;p pg_proc;runtime_oid oid:=to_regrole('municontrol_actions_runtime_app');BEGIN
 IF runtime_oid IS NULL OR runtime_oid=current_user::regrole THEN RAISE EXCEPTION '${code}';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
 IF p.oid IS NULL OR(SELECT count(*) FROM pg_proc other WHERE other.pronamespace=p.pronamespace AND other.proname=p.proname)<>1
 OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor=p.proowner AND a.grantee=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR(a.grantee<>p.proowner AND NOT((x->>'runtime')::boolean AND a.grantee=runtime_oid)))
 THEN RAISE EXCEPTION '${code}' USING DETAIL=x->>'signature';END IF;END LOOP;END $annul208_acl$`;
}
function preservation(h,slot){
 assert.ok(['before','after'].includes(slot));let source=performancePreservationSnapshot();
 const anchor="FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema'";
 source=once(source,anchor,anchor+` AND NOT(s.nspname=${q(h.qa.schema)} AND p.proname=ANY(ARRAY[${signatures.map(([n])=>q(n)).join(',')}]))`);
 source=once(source,'municontrol_documentary_install.after',prefix+slot);
 return h.qa.normalized(source);
}
function proofCheck(value,plan){
 assert.equal(value?.version,version);assert.equal(value.sourceCommit,plan.sourceCommit);assert.equal(value.sourceSqlSha256,OWN_ANNUL_REVIEW208_SQL_SHA256);assert.equal(value.predecessorPinsSha256,plan.predecessorPinsSha256);assert.deepEqual(value.sourceHashes,plan.sourceHashes);
 for(const [key,count]of Object.entries({newFunctions:7,privateHelpers:3,runtimeFacades:4,newTables:0,adaptedFunctions:0,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(value[key],count,key);
 for(const key of ['priorStateSha256','objectSha256'])assert.match(value[key],SHA);assert.ok(['install','verify'].includes(value.mode));
 assert.equal(Math.trunc(Number(value.native?.serverVersionNum)/10000),plan.major);assert.ok(Number.isSafeInteger(value.native.pid));assert.equal(typeof value.native.backendStart,'string');
}

// Construct only after all closed canonical/source inputs have been validated.
// This function is NOT an execution/admission result.
export function composeOwnAnnulmentReviewV2On190({h,db,admission}){
 assert.ok(h&&h.qa&&typeof h.read==='function'&&typeof h.json==='function'&&typeof h.check==='function');assert.ok(db&&typeof db.query==='function'&&typeof db.run==='function','ANNUL208_EXISTING_TRANSPORT_REQUIRED');
 assert.ok([17,18].includes(h.major));assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(h.qa.sourceCommit,h.sourceCommit);assert.equal(h.qa.operationalPairBaseline,'published107');assert.match(h.qa.schema,SCHEMA);
 exact(admission,['version','sourceCommit','monthly','capacityPlan'],'ANNUL208_CANONICAL_SOURCE_ADMISSION_REQUIRED');assert.equal(admission.version,'own-annulment-review208-canonical-source.v1');assert.equal(admission.sourceCommit,h.sourceCommit);
 const monthly=admission.monthly;assert.strictEqual(monthly,h.prepared?.monthly,'ANNUL208_SAME_PREPARED_MONTHLY_REQUIRED');assert.equal(monthly?.version,'own-novelty-succession-qa.v1');assert.equal(monthly.sourceCommit,h.sourceCommit);assert.equal(monthly.schema,h.qa.schema);assert.strictEqual(monthly.qa192?.qa,h.qa,'ANNUL208_FOUNDATION_REBUILT');assert.strictEqual(monthly.actor,h.qa.actor);assert.strictEqual(monthly.checker,h.qa.checker);assert.equal(typeof monthly.normalized,'function');
 const sources=checkedSources(h,monthly),{predecessorPins,provenance}=predecessorSourcePins(h,admission,sources),source=sources.texts.get(OWN_ANNUL_REVIEW208_SQL);
 const definitions=[...source.matchAll(/EXECUTE \$definition_208\$(CREATE FUNCTION public\.[\s\S]*?)\$definition_208\$;/g)].map(m=>m[1]);assert.equal(definitions.length,7,'ANNUL208_EXACT_SEVEN_SOURCE_FUNCTIONS_REQUIRED');
 const ownPins=definitions.map((definition,n)=>{const[name,args,runtime]=signatures[n],pin=ownInstallationFunctionPin(definition);assert.equal(pin.name,name);assert.equal(pin.signature,'public.'+name+'('+args+')');assert.equal(pin.resultType,'jsonb');assert.deepEqual(pin.config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']);return localPin(definition,h.qa.normalized,h.qa.schema,runtime);});
 assert.equal(ownPins.filter(p=>p.runtime).length,4);assert.equal(ownPins.filter(p=>!p.runtime).length,3);
 const predecessorCheck=[pinsCheck(predecessorPins,'ANNUL208_PREREQUISITE_SOURCE_CHANGED'),aclAndOverloads(predecessorPins,'ANNUL208_PREREQUISITE_ACL_CHANGED')].join(';\n');
 const ownCheck=[pinsCheck(ownPins,'ANNUL208_NEW_FUNCTION_SOURCE_CHANGED'),aclAndOverloads(ownPins,'ANNUL208_NEW_FUNCTION_ACL_CHANGED')].join(';\n');
 const names=signatures.map(([name])=>q(name)).join(','),s=h.qa.schema;
 const context=readOnly=>`DO $annul208_context$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} OR current_setting('standard_conforming_strings')<>'on' OR current_setting('server_version_num')::integer/10000<>${h.major} THEN RAISE EXCEPTION 'ANNUL208_NATIVE_CONTEXT_REQUIRED';END IF;END $annul208_context$`;
 const mode=`DO $annul208_mode$ DECLARE n integer;BEGIN PERFORM set_config('lock_timeout','5s',true);PERFORM set_config('statement_timeout','180s',true);PERFORM pg_advisory_xact_lock(208);SELECT count(*) INTO n FROM pg_proc WHERE pronamespace=${q(s)}::regnamespace AND proname=ANY(ARRAY[${names}]);IF n=0 THEN PERFORM set_config('${prefix}mode','install',true);ELSIF n=7 THEN PERFORM set_config('${prefix}mode','verify',true);ELSE RAISE EXCEPTION 'ANNUL208_PARTIAL_OR_FOREIGN_STATE';END IF;END $annul208_mode$`;
 const defaults=`DO $annul208_defaults$ DECLARE value aclitem[];runtime_oid oid:=to_regrole('municontrol_actions_runtime_app');BEGIN value:=coalesce((SELECT defaclacl FROM pg_default_acl WHERE defaclrole=current_user::regrole AND defaclobjtype='f' AND defaclnamespace=0),acldefault('f',current_user::regrole))||coalesce((SELECT defaclacl FROM pg_default_acl WHERE defaclrole=current_user::regrole AND defaclobjtype='f' AND defaclnamespace=${q(s)}::regnamespace),'{}'::aclitem[]);IF runtime_oid IS NULL OR runtime_oid=current_user::regrole OR EXISTS(SELECT 1 FROM aclexplode(value) a WHERE a.grantor<>current_user::regrole OR a.grantee NOT IN(0,current_user::regrole,runtime_oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable) OR NOT EXISTS(SELECT 1 FROM aclexplode(value) a WHERE a.grantee=current_user::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_DEFAULT_ACL_CHANGED';END IF;END $annul208_defaults$`;
 const choose=`DO $annul208_choose$ BEGIN IF current_setting('${prefix}mode')='verify' THEN EXECUTE ${q(ownCheck)};END IF;END $annul208_choose$`;
 const local=h.qa.normalized(source),apply=`DO $annul208_apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(local)};END IF;END $annul208_apply$`;
 const before=preservation(h,'before'),after=preservation(h,'after'),compare=`DO $annul208_preserved$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'ANNUL208_FULL_PRIOR_STATE_CHANGED';END IF;END $annul208_preserved$`;
 const predecessorPinsSha256=hash(JSON.stringify(predecessorPins)),objectSha256=`(SELECT encode(public.digest(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]')::text,'sha256'),'hex') FROM pg_proc p WHERE p.pronamespace=${q(s)}::regnamespace AND p.proname=ANY(ARRAY[${names}]))`;
 const functionProof=`SELECT jsonb_build_object('version','own-annulment-review208-function-bookend.v1','sourceCommit',${q(h.sourceCommit)},'sourceSqlSha256',${q(OWN_ANNUL_REVIEW208_SQL_SHA256)},'predecessorPinsSha256',${q(predecessorPinsSha256)},'objectSha256',${objectSha256}) AS proof`;
 const proof=initial=>`SELECT jsonb_build_object('version',${q(version)},'sourceCommit',${q(h.sourceCommit)},'sourceSqlSha256',${q(OWN_ANNUL_REVIEW208_SQL_SHA256)},'sourceHashes',${q(JSON.stringify(sources.sourceHashes))}::jsonb,'predecessorPinsSha256',${q(predecessorPinsSha256)},'mode',${initial?"current_setting('"+prefix+"mode')":"'verify'"},'newFunctions',7,'privateHelpers',3,'runtimeFacades',4,'newTables',0,'adaptedFunctions',0,'existingAclChanges',0,'roleAssignmentsAdded',0,'businessWrites',0,'nominalRowsReturned',0,'transactionDataPreserved',${initial},'priorStateSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectSha256',${objectSha256},'native',jsonb_build_object('pid',pg_backend_pid(),'backendStart',(SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()),'serverVersionNum',current_setting('server_version_num'))${initial?",'beforeStateSha256',encode(public.digest(current_setting('"+prefix+"before')::jsonb::text,'sha256'),'hex')":''}) AS proof`;
 return {version:'own-annulment-review208-source-plan.v1',sourceCommit:h.sourceCommit,major:h.major,schema:s,sourceSqlSha256:OWN_ANNUL_REVIEW208_SQL_SHA256,sourceHashes:sources.sourceHashes,predecessorPins,predecessorPinsSha256,provenance,ownPins,postflight:[context(true),predecessorCheck,ownCheck,functionProof],statements:[context(false),mode,defaults,predecessorCheck,choose,before,apply,predecessorCheck,ownCheck,after,compare,proof(true)],verification:[context(true),predecessorCheck,ownCheck,after,proof(false)],sourceBookend:sources.bookend,connects:false,executesSql:false,executionAdmitted:false};
}

export async function installOwnAnnulmentReviewV2On190({h,db,baselineSnapshot,admission}){
 const plan=composeOwnAnnulmentReviewV2On190({h,db,admission});assert.ok(baselineSnapshot&&typeof baselineSnapshot==='object','ANNUL208_VERIFIED_BASELINE_SNAPSHOT_REQUIRED');assert.deepEqual(ownFullCapacity190Snapshot(h),baselineSnapshot,'ANNUL208_BASELINE_CHANGED_BEFORE_INSTALL');
 const rehearsal=h.json(plan.statements,{end:'ROLLBACK',fullJson:true});proofCheck(rehearsal,plan);assert.equal(rehearsal.mode,'install');assert.equal(rehearsal.transactionDataPreserved,true);assert.equal(rehearsal.beforeStateSha256,rehearsal.priorStateSha256);assert.deepEqual(ownFullCapacity190Snapshot(h),baselineSnapshot,'ANNUL208_REHEARSAL_NOT_ROLLED_BACK');
 const late='DO $annul208_late$ BEGIN RAISE EXCEPTION \'ANNUL208_LATE_INSTALL_FAILURE\';END $annul208_late$';
 const rejectedLate=h.expectRollback([...plan.statements,late],'ANNUL208_LATE_INSTALL_FAILURE');assert.equal(rejectedLate.status,3);assert.match(rejectedLate.stderr,/\bERROR:[^\r\n]*\bANNUL208_LATE_INSTALL_FAILURE\b/);assert.deepEqual(ownFullCapacity190Snapshot(h),baselineSnapshot,'ANNUL208_LATE_INSTALL_ROLLBACK_CHANGED_STATE');
 const rejectedDefaults=h.expectRollback([`ALTER DEFAULT PRIVILEGES IN SCHEMA ${h.qa.schema} GRANT EXECUTE ON FUNCTIONS TO pg_monitor`,...plan.statements],'OWN_ANNUL_REVIEW_DEFAULT_ACL_CHANGED');assert.equal(rejectedDefaults.status,3);assert.match(rejectedDefaults.stderr,/\bERROR:[^\r\n]*\bOWN_ANNUL_REVIEW_DEFAULT_ACL_CHANGED\b/);assert.deepEqual(ownFullCapacity190Snapshot(h),baselineSnapshot,'ANNUL208_DEFAULT_ACL_ROLLBACK_CHANGED_STATE');
 const installed=h.json(plan.statements,{fullJson:true}),durable=h.json(plan.verification,{readOnly:true,fullJson:true}),repeated=h.json(plan.statements,{fullJson:true});
 for(const value of [installed,durable,repeated])proofCheck(value,plan);
 assert.equal(installed.mode,'install');assert.equal(durable.mode,'verify');assert.equal(repeated.mode,'verify');assert.equal(installed.transactionDataPreserved,true);assert.equal(repeated.transactionDataPreserved,true);assert.equal(durable.transactionDataPreserved,false);
 for(const value of [installed,repeated])assert.equal(value.beforeStateSha256,value.priorStateSha256,'ANNUL208_FULL_PRIOR_STATE_NOT_CONSERVED');
 for(const key of ['priorStateSha256','objectSha256']){assert.equal(installed[key],durable[key],'ANNUL208_NOT_DURABLE:'+key);assert.equal(installed[key],repeated[key],'ANNUL208_REPEAT_CHANGED:'+key);}
 assert.equal(new Set([rehearsal,installed,durable,repeated].map(p=>p.native.pid+':'+p.native.backendStart)).size,4,'ANNUL208_INDEPENDENT_CONNECTIONS_REQUIRED');
 const sourceBookend=plan.sourceBookend(),result={version:'own-annulment-review208-canonical190-installation.v1',passed:true,sourceCommit:h.sourceCommit,sourceSqlSha256:OWN_ANNUL_REVIEW208_SQL_SHA256,predecessorPins:plan.predecessorPins,predecessorSources:plan.provenance,sourceBookend,proofs:{rehearsal,installed,durable,repeated,lateInstallRollback:true,inheritedDefaultAclRejected:true},synthetic:true,productionWrites:0,municipalAcceptance:false};
 plans.set(result,{h,db,plan});h.check('208 exact source prerequisites and seven new functions preserve the full canonical190 foundation through rollback, commit, fresh verification and replay');return result;
}

// A final function/source bookend after legitimate business tests. It does not
// compare the old business-row fingerprint after intentional decisions.
export function assertOwnAnnulmentReviewV2SourceBookend({h,db,installation}){
 const saved=plans.get(installation);assert.ok(saved,'ANNUL208_EXACT_INSTALLATION_REQUIRED');assert.strictEqual(saved.h,h);assert.strictEqual(saved.db,db);const source=saved.plan.sourceBookend();
 const proof=h.json(saved.plan.postflight,{readOnly:true,fullJson:true});
 assert.equal(proof?.version,'own-annulment-review208-function-bookend.v1');assert.equal(proof.sourceCommit,h.sourceCommit);assert.equal(proof.sourceSqlSha256,OWN_ANNUL_REVIEW208_SQL_SHA256);assert.equal(proof.predecessorPinsSha256,saved.plan.predecessorPinsSha256);assert.equal(proof.objectSha256,installation.proofs.installed.objectSha256,'ANNUL208_FUNCTION_METADATA_CHANGED_AFTER_BUSINESS');
 return {...source,sourceMetadataOnly:false,metadataPostflightVerified:true,priorBusinessRowsRecompared:false,functionProof:proof};
}
