// Proposed public SOURCE factory208. No h/db, QA seed, actor, SQL execution or target admission.
//209 remains outside this factory until its public predecessor closure and receipt issuer are reviewed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {SALARY_ADMINISTRATIVE_CONTEXT} from './salary-administrative-identity-installation.mjs';
import {MONTHLY193_PREREQUISITES} from './own-monthly-day-declaration-installation.mjs';
import {buildOwnNoveltySuccessionInstallation} from './own-novelty-succession-installation.mjs';
import {composeOwnFullCapacity190PublicInstallation} from './own-full-capacity-190-public-installation.mjs';
import {composeOwnCloseSnapshot215Raw} from './own-m7-public-successors213215.mjs';
import {projectOwnFullCapacity190PublicPostflight} from './own-m7-public-successors201-bridge.mjs';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';
export const OWN_PUBLIC_ANNUL208_VERSION='own-annulment-review208-public-source-plan.v1';
export const OWN_ANNUL_REVIEW208_SQL='scripts/migrations/208-own-annulment-review-index.sql';
export const OWN_ANNUL_REVIEW208_SQL_SHA256='2f0b030f12570f37ea3357707309422754522af66dc85475fd81e9a473c1b402';
const OWN_FULL_CAPACITY_190_SQL='scripts/migrations/201-own-full-payroll-decision-capacity.sql';
const prefix='municontrol_annul_review208.',version='own-annulment-review208-installation-proof.v1';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const SHA=/^[a-f0-9]{64}$/;
export const OWN_M7_RUNTIME_ROLE='municontrol_actions_runtime_app';
// BEGIN_UNCHANGED_PUBLIC_PREREQUISITES
// Public lineage of the eight193 prerequisites: last source that defines each one.
// native_salary_administrative_context_v1 is JS-held by its own institutional installer.
export const OWN_M7_PREREQUISITE_SOURCES=Object.freeze([
 'scripts/migrations/007-action-center-read-facades.sql',
 'scripts/migrations/112-native-salary-definitions.sql',
 'scripts/migrations/122-own-payroll-programs.sql',
 'scripts/migrations/157-own-period-participation.sql'
]);
const hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>String(v).replace(/\r\n?/g,'\n');
const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const definitionsOf=sql=>splitPostgresStatements(sql).map(clean).filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION /.test(s));
const prerequisiteName=d=>{const m=/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?([a-z0-9_]+)\(/.exec(d);return m?m[1]:null;};
// GRANT/REVOKE statements of the same sources decide runtime membership; the
// signature list is split at ')' boundaries and whitespace-normalised. Unqualified
// names (007) resolve to public, like the builders' own regex does.
const aclSignatures=list=>list.replace(/\s+/g,' ').split(/\)\s*,\s*/).map((part,i,all)=>(i<all.length-1?part+')':part).trim()).map(s=>s.replace(/\s*\(\s*/,'(').replace(/\s*\)\s*$/,')').replace(/\s*,\s*/g,',')).map(s=>/^[a-z_][a-z0-9_]*\./i.test(s)?s:'public.'+s);
export const OWN_M7_ADMINISTRATIVE_SOURCE='scripts/lib/salary-administrative-identity-installation.mjs';
export function publicPrerequisiteAclEvidence(sources,origins=sources.map((_,i)=>'source['+i+']')){
 const evidence=new Map();assert.equal(sources.length,origins.length);
 for(let index=0;index<sources.length;index++)for(const statement of splitPostgresStatements(sources[index]).map(clean)){
  const sql=statement.replace(/;\s*$/,'');
  if(!/^(?:GRANT|REVOKE)\b/.test(sql)||!sql.includes(' ON FUNCTION '))continue;
  const m=/^(GRANT EXECUTE|REVOKE ALL(?: PRIVILEGES)?) ON FUNCTION ([\s\S]+?) (?:TO|FROM) ([a-zA-Z_,\s]+)$/.exec(sql);
  assert.ok(m,'OWN_M7_ACL_STATEMENT_SOURCE_PENDING');
  const roles=m[3].split(',').map(s=>s.trim());
  for(const signature of aclSignatures(m[2])){
   const row=evidence.get(signature)??{};
   for(const role of roles)if(role==='PUBLIC'||role===OWN_M7_RUNTIME_ROLE)row[role]={granted:m[1]==='GRANT EXECUTE',source:origins[index],statement:sql};
   evidence.set(signature,row);
  }
 }
 return evidence;
}
export function publicPrerequisiteRuntime(sources){
 return new Set([...publicPrerequisiteAclEvidence(sources)].filter(([,row])=>row[OWN_M7_RUNTIME_ROLE]?.granted===true).map(([signature])=>signature));
}
export function publicPrerequisiteDefinitions(read){
 const sources=OWN_M7_PREREQUISITE_SOURCES.map(file=>lf(read(file)));
 const administrative=lf(read(OWN_M7_ADMINISTRATIVE_SOURCE));
 // Read the actual mutation literal from its pinned institutional source.
 // No invented REVOKE or absent grant is treated as evidence of owner-only ACL.
 const declarations=[...administrative.matchAll(/const mutations=\[SALARY_ADMINISTRATIVE_CONTEXT,'([^']+)',\.\.\.changed\];/g)];
 assert.equal(declarations.length,1,'OWN_M7_ADMINISTRATIVE_ACL_SOURCE_PENDING');
 const adminAcl=declarations[0][1];
 assert.equal(adminAcl,'REVOKE ALL ON FUNCTION public.native_salary_administrative_context_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app','OWN_M7_ADMINISTRATIVE_ACL_SOURCE_PENDING');
 const wanted=new Set(MONTHLY193_PREREQUISITES),found=new Map();
 for(const d of [...sources.flatMap(definitionsOf),clean(SALARY_ADMINISTRATIVE_CONTEXT)]){
  const name=prerequisiteName(d);if(!name||!wanted.has(name))continue;
  const previous=found.get(name);if(previous)assert.deepEqual(ownInstallationFunctionPin(previous),ownInstallationFunctionPin(d),'OWN_M7_AMBIGUOUS_PREREQUISITE:'+name);else found.set(name,d);
 }
 assert.deepEqual([...found.keys()].sort(),[...MONTHLY193_PREREQUISITES].sort(),'OWN_M7_PREREQUISITE_SOURCE_MISSING');
 const evidence=publicPrerequisiteAclEvidence([...sources,adminAcl],[...OWN_M7_PREREQUISITE_SOURCES,OWN_M7_ADMINISTRATIVE_SOURCE]);
 const prerequisiteDefinitions=Object.freeze([...found.values()]),prerequisiteRuntime=[],aclEvidence=[];
 for(const definition of prerequisiteDefinitions){
  const signature=ownInstallationFunctionPin(definition).signature,row=evidence.get(signature);
  assert.equal(typeof row?.PUBLIC?.granted,'boolean','OWN_M7_PUBLIC_ACL_SOURCE_PENDING:'+signature);
  assert.equal(row.PUBLIC.granted,false,'OWN_M7_PUBLIC_EXECUTE_SOURCE_PENDING:'+signature);
  assert.equal(typeof row?.[OWN_M7_RUNTIME_ROLE]?.granted,'boolean','OWN_M7_RUNTIME_ACL_SOURCE_PENDING:'+signature);
  if(row[OWN_M7_RUNTIME_ROLE].granted)prerequisiteRuntime.push(signature);
  aclEvidence.push({signature,public:row.PUBLIC,runtime:row[OWN_M7_RUNTIME_ROLE]});
 }
 return Object.freeze({prerequisiteDefinitions,prerequisiteRuntime:Object.freeze(prerequisiteRuntime),aclEvidence:Object.freeze(aclEvidence),
  sourceHashes:Object.freeze({...Object.fromEntries(OWN_M7_PREREQUISITE_SOURCES.map((file,i)=>[file,hash(sources[i])])),[OWN_M7_ADMINISTRATIVE_SOURCE]:hash(administrative)})});
}


// END_UNCHANGED_PUBLIC_PREREQUISITES
const SOURCE_PINS=Object.freeze({"scripts/lib/own-payroll-annulment-review-v2-installation.mjs":"bafce87773c968269fd49bf875b7c18bf275acd23bbd9e575626f5e40a437f29","scripts/lib/own-m7-public-schema-batch.mjs":"cc7c57b5ab83f767736d29922f4cd0959ed8d521582b29163ada491cd7a5b6de","scripts/lib/own-full-capacity-190-public-installation.mjs":"f220a79c990dc7f303fe52c49b3436af9c6b5924a5e1167810d8811127ee5378","scripts/lib/own-m7-public-successors213215.mjs":"3b5e0185975533d7b0752e24ad9f3cb5dac18109a420b4164bd31489fd2db9cb","scripts/lib/own-m7-public-successors201-bridge.mjs":"b8e583dff5ad34d5e54e28cf16b9a23a3a2f963a37d0bd44a92363296abc980c","scripts/lib/own-novelty-succession-installation.mjs":"627ffea8e252311f31b87abe46346bd76578e583de34b606a74aa53eacb494d0","scripts/lib/own-payroll-installation.mjs":"6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0","scripts/lib/native-leave-installation.mjs":"57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef","scripts/verify-documentary-roster-performance.mjs":"e058f3450118b23bf16ee1cf7e75b866624153246ce163aed3bf3c96d5f96124","scripts/migrations/208-own-annulment-review-index.sql":"2f0b030f12570f37ea3357707309422754522af66dc85475fd81e9a473c1b402","scripts/migrations/201-own-full-payroll-decision-capacity.sql":"46de1308360a076eff1453f57a9e4f4d6c14ba176d73cf8531b7b0821ed35b1b","scripts/migrations/197-own-novelty-succession.sql":"13ad516bfd653a03b5fae8987486abeef1c13a5d629264b0c680d57c5a5bb43c","scripts/migrations/112-native-salary-definitions.sql":"da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3","scripts/migrations/122-own-payroll-programs.sql":"edaf70ef87f9ac3de170e079c460d38c4188b36de349b5c58808f5a09a9f9785","scripts/migrations/124-own-payroll-liquidation-decisions.sql":"03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a","scripts/lib/sql-statements.mjs":"d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2","scripts/lib/salary-administrative-identity-installation.mjs":"eb898f02b87eeeeca5edde201c9a0a7d9b03d777fce80ef6a22eac7d93820a71","scripts/lib/own-monthly-day-declaration-installation.mjs":"f916ef4687638fdd565e5f02cba25178beedbe8ce234418ea650c0728829d680"});
const ACL_POLICY_SHA256='da4634fbe90c083d1079632899c9866d368b76a6a33ab484baf3da76277aa0fa';
const publicPlans=new WeakSet();
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m,'PUBLIC208_BODY_REQUIRED');return m[2];};
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'PUBLIC208_UNIQUE_SOURCE_ANCHOR');return s.replace(a,()=>b);};
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
function preservation(slot){
 assert.ok(['before','after'].includes(slot));let source=performancePreservationSnapshot();
 const anchor="FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema'";
 source=once(source,anchor,anchor+` AND NOT(s.nspname=${q('public')} AND p.proname=ANY(ARRAY[${signatures.map(([n])=>q(n)).join(',')}]))`);
 source=once(source,'municontrol_documentary_install.after',prefix+slot);
 return source;
}
function proofCheck(value,plan){
 assert.equal(value?.version,version);assert.equal(value.sourceCommit,plan.sourceCommit);assert.equal(value.sourceSqlSha256,OWN_ANNUL_REVIEW208_SQL_SHA256);assert.equal(value.predecessorPinsSha256,plan.predecessorPinsSha256);assert.deepEqual(value.sourceHashes,plan.sourceHashes);
 for(const [key,count]of Object.entries({newFunctions:7,privateHelpers:3,runtimeFacades:4,newTables:0,adaptedFunctions:0,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(value[key],count,key);
 for(const key of ['priorStateSha256','objectSha256'])assert.match(value[key],SHA);assert.ok(['install','verify'].includes(value.mode));
 assert.equal(Math.trunc(Number(value.native?.serverVersionNum)/10000),plan.major);assert.ok(Number.isSafeInteger(value.native.pid));assert.equal(typeof value.native.backendStart,'string');
}


function publicPredecessors208({novelty,capacity,load,source}){
 const start=source.indexOf(' FOREACH expected_signature IN ARRAY ARRAY['),end=source.indexOf(' END LOOP;',start);
 assert.ok(start>=0&&end>start,'PUBLIC208_ACL_POLICY_REQUIRED');
 const policy=source.slice(start,end+' END LOOP;'.length);assert.equal(hash(policy),ACL_POLICY_SHA256,'PUBLIC208_ACL_POLICY_CHANGED');
 const list=/FOREACH expected_signature IN ARRAY ARRAY\[([^]*?)\] LOOP/.exec(policy);assert.ok(list);
 const declared=[...list[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);assert.deepEqual(declared,required.map(row=>row[1]),'PUBLIC208_REQUIRED_IDENTITY_SET_CHANGED');
 // The WHOLE pinned208 policy explicitly allows runtime ONLY for this one signature.
 assert.equal(policy.split("expected_signature='public.own_liquidation_command_v1(jsonb,jsonb,uuid)'").length,3,'PUBLIC208_EXACT_RUNTIME_POLICY');
 const baseFiles={own_liquidation_context_v1:'scripts/migrations/124-own-payroll-liquidation-decisions.sql',own_liquidation_capture_v1:'scripts/migrations/124-own-payroll-liquidation-decisions.sql',native_salary_scope_v1:'scripts/migrations/112-native-salary-definitions.sql',own_program_exact_v1:'scripts/migrations/122-own-payroll-programs.sql'};
 const full201=sourceDefinitions201(load(OWN_FULL_CAPACITY_190_SQL)),predecessorPins=[],provenance=[];
 for(const [name,signature,origin,runtime]of required){
  let definition,expected;
  if(origin==='after197'){definition=oneDefinition(novelty.adapted,name);expected=novelty.afterPins.find(p=>p.signature===signature);}
  else if(origin==='support197'){definition=oneDefinition(novelty.supportDefinitions,name);expected=novelty.supportPins.find(p=>p.signature===signature);}
  else if(origin==='capacity201'){definition=oneDefinition(full201,name);const record=capacity.post.find(p=>p.signature===signature);assert.ok(record);assert.equal(record.kind,'core');expected={...ownInstallationFunctionPin(definition),runtime:record.runtime};assert.equal(expected.sha256,record.bodySha256);}
  else{assert.ok(Object.hasOwn(baseFiles,name),'PUBLIC208_UNRESOLVED_PUBLIC_SOURCE');definition=oneDefinition(definitionsOf(load(baseFiles[name])),name);}
  const actual={...ownInstallationFunctionPin(definition),runtime};assert.equal(actual.signature,signature,'PUBLIC208_PREDECESSOR_SIGNATURE_CHANGED');
  if(expected)assert.deepEqual(actual,expected,'PUBLIC208_SOURCE_PREDECESSOR_METADATA_CHANGED');
  assert.equal(runtime,signature==='public.own_liquidation_command_v1(jsonb,jsonb,uuid)','PUBLIC208_RUNTIME_POLICY_CHANGED');
  predecessorPins.push(actual);provenance.push({name,signature,origin:origin==='graph190'?'public-migration':origin,source:baseFiles[name]??(origin==='capacity201'?OWN_FULL_CAPACITY_190_SQL:'scripts/lib/own-novelty-succession-installation.mjs'),runtime,sourceDefinitionSha256:hash(definition),sourceBodySha256:hash(body(definition)),aclPolicySource:OWN_ANNUL_REVIEW208_SQL,aclPolicySha256:ACL_POLICY_SHA256});
 }
 assert.equal(predecessorPins.length,13);assert.equal(new Set(predecessorPins.map(p=>p.signature)).size,13);return{predecessorPins,provenance};
}

export function composeOwnAnnulmentReview208PublicSource({read,sourceCommit,major}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok([17,18].includes(major));
 const seen=new Map(),sourceHashes={},load=file=>{const text=lf(read(file)),digest=hash(text);if(Object.hasOwn(SOURCE_PINS,file))assert.equal(digest,SOURCE_PINS[file],'PUBLIC208_SOURCE_CHANGED:'+file);if(seen.has(file))assert.equal(seen.get(file),text,'PUBLIC208_SOURCE_DRIFT:'+file);seen.set(file,text);sourceHashes[file]=digest;return text;};
 for(const file of Object.keys(SOURCE_PINS))load(file);
 const prerequisite=publicPrerequisiteDefinitions(load);
 const novelty=buildOwnNoveltySuccessionInstallation({read:load,sourceCommit,operationalPairBaseline:'published107',prerequisiteDefinitions:[...prerequisite.prerequisiteDefinitions],prerequisiteRuntime:[...prerequisite.prerequisiteRuntime]});
 const capacity=composeOwnFullCapacity190PublicInstallation({read:load,sourceCommit});
 const raw215=composeOwnCloseSnapshot215Raw({major,sourceCommit,read:load});
 const capacity215=projectOwnFullCapacity190PublicPostflight({capacityPlan:capacity,raw:raw215,postflight:capacity.verification[0],read:load,sourceCommit});
 assert.equal(capacity215.unchangedOtherRecords,26);assert.equal(capacity215.wholeGuardInverse,true);
 const source=load(OWN_ANNUL_REVIEW208_SQL),{predecessorPins,provenance}=publicPredecessors208({novelty,capacity,load,source});
 const sources={sourceHashes,bookend:()=>{for(const[file,text]of seen)assert.equal(hash(lf(read(file))),hash(text),'PUBLIC208_SOURCE_BOOKEND_CHANGED:'+file);return{sourceCommit,sourceHashes:{...sourceHashes},sourceMetadataOnly:true,observedMetadataUsed:false};}};
 const definitions=[...source.matchAll(/EXECUTE \$definition_208\$(CREATE FUNCTION public\.[\s\S]*?)\$definition_208\$;/g)].map(m=>m[1]);assert.equal(definitions.length,7,'ANNUL208_EXACT_SEVEN_SOURCE_FUNCTIONS_REQUIRED');
 const ownPins=definitions.map((definition,n)=>{const[name,args,runtime]=signatures[n],pin=ownInstallationFunctionPin(definition);assert.equal(pin.name,name);assert.equal(pin.signature,'public.'+name+'('+args+')');assert.equal(pin.resultType,'jsonb');assert.deepEqual(pin.config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']);return {...pin,runtime};});
 assert.equal(ownPins.filter(p=>p.runtime).length,4);assert.equal(ownPins.filter(p=>!p.runtime).length,3);
 const predecessorCheck=[capacity215.afterPostflight,pinsCheck(predecessorPins,'ANNUL208_PREREQUISITE_SOURCE_CHANGED'),aclAndOverloads(predecessorPins,'ANNUL208_PREREQUISITE_ACL_CHANGED')].join(';\n');
 const ownCheck=[pinsCheck(ownPins,'ANNUL208_NEW_FUNCTION_SOURCE_CHANGED'),aclAndOverloads(ownPins,'ANNUL208_NEW_FUNCTION_ACL_CHANGED')].join(';\n');
 const names=signatures.map(([name])=>q(name)).join(','),s='public';
 const context=readOnly=>`DO $annul208_context$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(readOnly?'on':'off')} OR current_setting('standard_conforming_strings')<>'on' OR current_setting('server_version_num')::integer/10000<>${major} THEN RAISE EXCEPTION 'ANNUL208_NATIVE_CONTEXT_REQUIRED';END IF;END $annul208_context$`;
 const mode=`DO $annul208_mode$ DECLARE n integer;BEGIN PERFORM set_config('lock_timeout','5s',true);PERFORM set_config('statement_timeout','180s',true);PERFORM pg_advisory_xact_lock(208);SELECT count(*) INTO n FROM pg_proc WHERE pronamespace=${q(s)}::regnamespace AND proname=ANY(ARRAY[${names}]);IF n=0 THEN PERFORM set_config('${prefix}mode','install',true);ELSIF n=7 THEN PERFORM set_config('${prefix}mode','verify',true);ELSE RAISE EXCEPTION 'ANNUL208_PARTIAL_OR_FOREIGN_STATE';END IF;END $annul208_mode$`;
 const defaults=`DO $annul208_defaults$ DECLARE value aclitem[];runtime_oid oid:=to_regrole('municontrol_actions_runtime_app');BEGIN value:=coalesce((SELECT defaclacl FROM pg_default_acl WHERE defaclrole=current_user::regrole AND defaclobjtype='f' AND defaclnamespace=0),acldefault('f',current_user::regrole))||coalesce((SELECT defaclacl FROM pg_default_acl WHERE defaclrole=current_user::regrole AND defaclobjtype='f' AND defaclnamespace=${q(s)}::regnamespace),'{}'::aclitem[]);IF runtime_oid IS NULL OR runtime_oid=current_user::regrole OR EXISTS(SELECT 1 FROM aclexplode(value) a WHERE a.grantor<>current_user::regrole OR a.grantee NOT IN(0,current_user::regrole,runtime_oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable) OR NOT EXISTS(SELECT 1 FROM aclexplode(value) a WHERE a.grantee=current_user::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_DEFAULT_ACL_CHANGED';END IF;END $annul208_defaults$`;
 const choose=`DO $annul208_choose$ BEGIN IF current_setting('${prefix}mode')='verify' THEN EXECUTE ${q(ownCheck)};END IF;END $annul208_choose$`;
 const local=source,apply=`DO $annul208_apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(local)};END IF;END $annul208_apply$`;
 const before=preservation('before'),after=preservation('after'),compare=`DO $annul208_preserved$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'ANNUL208_FULL_PRIOR_STATE_CHANGED';END IF;END $annul208_preserved$`;
 const predecessorPinsSha256=hash(JSON.stringify(predecessorPins)),objectSha256=`(SELECT encode(public.digest(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]')::text,'sha256'),'hex') FROM pg_proc p WHERE p.pronamespace=${q(s)}::regnamespace AND p.proname=ANY(ARRAY[${names}]))`;
 const functionProof=`SELECT jsonb_build_object('version','own-annulment-review208-function-bookend.v1','sourceCommit',${q(sourceCommit)},'sourceSqlSha256',${q(OWN_ANNUL_REVIEW208_SQL_SHA256)},'predecessorPinsSha256',${q(predecessorPinsSha256)},'objectSha256',${objectSha256}) AS proof`;
 const proof=initial=>`SELECT jsonb_build_object('version',${q(version)},'sourceCommit',${q(sourceCommit)},'sourceSqlSha256',${q(OWN_ANNUL_REVIEW208_SQL_SHA256)},'sourceHashes',${q(JSON.stringify(sources.sourceHashes))}::jsonb,'predecessorPinsSha256',${q(predecessorPinsSha256)},'mode',${initial?"current_setting('"+prefix+"mode')":"'verify'"},'newFunctions',7,'privateHelpers',3,'runtimeFacades',4,'newTables',0,'adaptedFunctions',0,'existingAclChanges',0,'roleAssignmentsAdded',0,'businessWrites',0,'nominalRowsReturned',0,'transactionDataPreserved',${initial},'priorStateSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectSha256',${objectSha256},'native',jsonb_build_object('pid',pg_backend_pid(),'backendStart',(SELECT backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()),'serverVersionNum',current_setting('server_version_num'))${initial?",'beforeStateSha256',encode(public.digest(current_setting('"+prefix+"before')::jsonb::text,'sha256'),'hex')":''}) AS proof`;
 const plan={version:'own-annulment-review208-public-source-plan.v1',sourceCommit,major,schema:s,sourceSqlSha256:OWN_ANNUL_REVIEW208_SQL_SHA256,sourceHashes:sources.sourceHashes,predecessorPins,predecessorPinsSha256,provenance,ownPins,postflight:[context(true),predecessorCheck,ownCheck,functionProof],statements:[context(false),mode,defaults,predecessorCheck,choose,before,apply,predecessorCheck,ownCheck,after,compare,proof(true)],verification:[context(true),predecessorCheck,ownCheck,after,proof(false)],sourceBookend:sources.bookend,whole201SourceGuardIncluded:true,capacity215GuardSha256:hash(capacity215.afterPostflight),qaPoolUsed:false,relocated:false,createsActors:false,roleAssignmentsAdded:0,requiresReviewedPublicTransport:true,connects:false,executesSql:false,executionAdmitted:false};
 freeze(plan);publicPlans.add(plan);return plan;
}

export function assertOwnAnnulmentReview208PublicProof({proof,batch}){
 assert.ok(publicPlans.has(batch),'PUBLIC208_SOURCE_PLAN_REQUIRED');assert.equal(batch.schema,'public');proofCheck(proof,batch);return{phaseProofValidated:true,sourceCommit:batch.sourceCommit};
}
// Closed receipt comparison, copied from the existing208 coordinator. These
// must be actual independently observed receipts; this function issues no receipt.
export function assertOwnAnnulmentReview208PublicDurability({batch,rehearsal,installed,durable,repeated}){
 for(const proof of[rehearsal,installed,durable,repeated])assertOwnAnnulmentReview208PublicProof({proof,batch});
 assert.equal(rehearsal.mode,'install');assert.equal(installed.mode,'install');assert.equal(durable.mode,'verify');assert.equal(repeated.mode,'verify');
 for(const value of[rehearsal,installed,repeated]){assert.equal(value.transactionDataPreserved,true);assert.equal(value.beforeStateSha256,value.priorStateSha256,'PUBLIC208_PRIOR_STATE_NOT_CONSERVED');}
 assert.equal(durable.transactionDataPreserved,false);
 for(const key of['priorStateSha256','objectSha256']){assert.equal(installed[key],durable[key],'PUBLIC208_NOT_DURABLE:'+key);assert.equal(installed[key],repeated[key],'PUBLIC208_REPEAT_CHANGED:'+key);}
 assert.equal(new Set([rehearsal,installed,durable,repeated].map(p=>p.native.pid+':'+p.native.backendStart)).size,4,'PUBLIC208_INDEPENDENT_CONNECTIONS_REQUIRED');
 batch.sourceBookend();return{sourceCommit:batch.sourceCommit,priorStatePreserved:true,independentDurabilityVerified:true,observationOnly:false};
}
