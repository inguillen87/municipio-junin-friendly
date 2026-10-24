// Pure source construction for an EXISTING ART158/159 + decision201 upgrade.
// No connection, execution, fresh ART installation or municipal data operation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {artDaysTableCheck} from './own-art-installation.mjs';
import {SALARY_ADMINISTRATIVE_CONTEXT} from './salary-administrative-identity-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';

export const SQL211_SHA='233f92b535fe6452d8c8d778029974b4f704e8aaea066c046c5d8a79fa701e1e';
export const ART_FULL_PREDECESSOR='own-art158159-post201-upgrade.v1';
export const ART_FULL_SOURCE_SHA=Object.freeze({
 'scripts/migrations/007-action-center-read-facades.sql':'d0e04ca20e3b67518d1340fe38d409fc3c7b339da4dee20e7a6850ebadbc8a1e',
 'scripts/migrations/112-native-salary-definitions.sql':'da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3',
 'scripts/migrations/122-own-payroll-programs.sql':'edaf70ef87f9ac3de170e079c460d38c4188b36de349b5c58808f5a09a9f9785',
 'scripts/migrations/123-own-payroll-runs.sql':'a9fe1129e921bb7c01985b8caadb009f6086aef9866e2298398175f7f25b4b6b',
 'scripts/migrations/125-own-payroll-close.sql':'443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5',
 'scripts/migrations/138-adopted-fixed-novelties.sql':'da7bc276e367dc3c0377c99e3c687747665a53c0c186eb457f27ab9032803469',
 'scripts/migrations/158-own-art-days.sql':'c718f2480a28e4fdf566675146002dabb75b8fbb6b44a0bc56851520e74ce509',
 'scripts/migrations/159-own-art-report.sql':'789d1cead7ef09d16a6bc61ec714c8d77e669fb8cc51d37f095c429672561b7a',
 'scripts/migrations/176-own-payroll-administrative-operator.sql':'f75fa2cddf6fe2e837044e73c6465eecdf41fbad7ec740745527e1bd54b94732',
 'scripts/migrations/201-own-full-payroll-decision-capacity.sql':'46de1308360a076eff1453f57a9e4f4d6c14ba176d73cf8531b7b0821ed35b1b',
 // Only its exported table-shape assertion is reused. No historic installer,
 // beforeCheck, empty-table condition or install/verify selector is called.
 'scripts/lib/own-art-installation.mjs':'cfec57dc64ac80dd59b296f6be7d7ca06f17112a72375b5f07aa4f933bd47a57',
 'scripts/lib/salary-administrative-identity-installation.mjs':'eb898f02b87eeeeca5edde201c9a0a7d9b03d777fce80ef6a22eac7d93820a71',
});
const prefix='municontrol_art_full.',signature='public.own_art_report_source_full_v1(jsonb,jsonb)';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>v.replace(/\r\n?/g,'\n');
const clean=v=>v.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const once=(source,from,to)=>{assert.equal(source.split(from).length,2,'OWN_ART_FULL_SOURCE_ANCHOR');return source.replace(from,()=>to);};
const groupHashes=Object.freeze({
 own_close_group_capacity_core_v2:'af9061d40d2569082254c2fe52cc3ebb1bcbb3689d53cb24450db881faabcb92',
 own_close_group_v1:'028777cf3e85c7d3f7b78995da2b1f2aea4da8a7914fddaed0585d19964744f6',
 own_close_group_full_v1:'2bb9b017085a8441e44f70dfe8545ed52a7fda9ce4258e4829baf2b9b7e36c91',
});
const oldRuntime=new Set(['own_art_days_bootstrap_v1','own_art_days_detail_v1','own_art_days_attempt_v1','own_art_days_command_v1','own_art_report_source_v1']);
const fixed=Object.freeze({allChecksPassed:true,newTables:0,newFunctions:1,adaptedFunctions:0,runtimeFacades:1,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,existingAclChanges:0,businessOperations:0,nominalRowsReturned:0,artHistoryPreserved:true});
const fields=['version','sourceCommit','sourceHashes','predecessorVersion',...Object.keys(fixed),'priorFingerprint','objectFingerprint'];

export function buildOwnArtFullInstallation(options){
 assert.equal(typeof options?.read,'function');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const sql211=lf(options.read('scripts/migrations/211-own-art-full-source.sql'));
 assert.equal(hash(sql211),SQL211_SHA,'Unreviewed SQL211 ART full source');
 const texts={},parts={},sourceHashes={'scripts/migrations/211-own-art-full-source.sql':SQL211_SHA};
 for(const [file,sha]of Object.entries(ART_FULL_SOURCE_SHA)){
  const text=lf(options.read(file));assert.equal(hash(text),sha,'OWN_ART_FULL_SOURCE_CHANGED: '+file);texts[file]=text;sourceHashes[file]=sha;
  if(file.endsWith('.sql'))parts[file]=splitPostgresStatements(text).map(clean);
 }
 const get=(file,name,runtime=false)=>{
  const definitions=parts['scripts/migrations/'+file].filter(s=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\s*\\(').test(s));
  assert.equal(definitions.length,1,'OWN_ART_FULL_UNIQUE_SOURCE: '+name);return {definition:definitions[0],pin:{...ownInstallationFunctionPin(definitions[0]),runtime}};
 };
 const oldDefinitions=['158-own-art-days.sql','159-own-art-report.sql'].flatMap(file=>parts['scripts/migrations/'+file].filter(s=>/^CREATE FUNCTION public\.own_art_/.test(s)));
 const previousPins=oldDefinitions.map(d=>{const p=ownInstallationFunctionPin(d);return {...p,runtime:oldRuntime.has(p.name)};});
 assert.equal(previousPins.length,12);assert.equal(previousPins.filter(p=>p.runtime).length,5);
 const legacy=get('159-own-art-report.sql','own_art_report_source_v1',true);
 const derived=once(once(legacy.definition,'CREATE FUNCTION public.own_art_report_source_v1(','CREATE FUNCTION public.own_art_report_source_full_v1('),'public.own_close_group_v1(p,g.id)','public.own_close_group_full_v1(p,g.id)');
 const groups=Object.entries(groupHashes).map(([name,sha])=>{const d=get('201-own-full-payroll-decision-capacity.sql',name,name!=='own_close_group_capacity_core_v2');assert.equal(d.pin.sha256,sha,'OWN_ART_FULL_201_BODY_CHANGED');return d.pin;});
 const dependencies=[
  get('007-action-center-read-facades.sql','action_center_context_has_capability').pin,
  get('112-native-salary-definitions.sql','native_salary_scope_v1').pin,
  get('112-native-salary-definitions.sql','native_salary_serialized_v1').pin,
  get('112-native-salary-definitions.sql','native_salary_lock_v1').pin,
  get('122-own-payroll-programs.sql','own_program_exact_v1').pin,
  get('123-own-payroll-runs.sql','own_run_hash_v1').pin,
  get('123-own-payroll-runs.sql','own_run_lock_v1').pin,
  get('125-own-payroll-close.sql','own_close_context_v1').pin,
  get('138-adopted-fixed-novelties.sql','payroll_fixed_registry_subject_v2').pin,
  get('138-adopted-fixed-novelties.sql','payroll_fixed_registry_range_v2').pin,
  get('176-own-payroll-administrative-operator.sql','own_run_context_v1').pin,
  {...ownInstallationFunctionPin(SALARY_ADMINISTRATIVE_CONTEXT),runtime:false},
 ];
 assert.equal(dependencies.find(p=>p.name==='own_run_context_v1').sha256,'7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30');
 assert.equal(dependencies.find(p=>p.name==='payroll_fixed_registry_subject_v2').sha256,'bf3a113d0924b18b9330f11f8b41c445ae6b38a9c5c14d8afae913e34d3f39e7');
 const prerequisitePins=[...previousPins,...groups,...dependencies];assert.equal(prerequisitePins.length,27);assert.equal(new Set(prerequisitePins.map(p=>p.signature)).size,27);
 const migration=splitPostgresStatements(sql211).map(clean);assert.equal(migration.length,4,'Only preflight, one function, revoke and grant');
 assert.match(migration[0],/^DO \$art_full_preflight\$/);assert.equal(migration[1],derived,'OWN_ART_FULL_EXACT_TWO_LITERAL_DERIVATION');
 assert.equal(migration[2],'REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC,municontrol_actions_runtime_app');
 assert.equal(migration[3],'GRANT EXECUTE ON FUNCTION '+signature+' TO municontrol_actions_runtime_app');
 assert.ok(migration.every(s=>!/^(?:BEGIN|COMMIT|ROLLBACK|CREATE OR REPLACE|CREATE TABLE|ALTER TABLE|INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(s)));
 const ownPins=[{...ownInstallationFunctionPin(derived),runtime:true}];assert.equal(ownPins[0].signature,signature);
 // One existing epoch only. The durable verification below never executes this
 // installation preflight or applies any CREATE/GRANT statement.
 const familyCount="(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_art_%')";
 const newCount="(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_art_report_source_full_v1')";
 const isolation="DO $isolation$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'OWN_ART_FULL_ISOLATION_REQUIRED';END IF;END $isolation$";
 const installationGuard=`DO $upgrade$ BEGIN PERFORM pg_advisory_xact_lock(158);PERFORM pg_advisory_xact_lock(159);PERFORM pg_advisory_xact_lock(211);IF ${familyCount}<>12 OR ${newCount}<>0 OR to_regprocedure(${q(signature)}) IS NOT NULL THEN RAISE EXCEPTION 'OWN_ART_FULL_EXISTING_PREDECESSOR_REQUIRED';END IF;END $upgrade$`;
 const familyAfter=`DO $family$ BEGIN IF ${familyCount}<>13 OR ${newCount}<>1 OR to_regprocedure(${q(signature)}) IS NULL THEN RAISE EXCEPTION 'OWN_ART_FULL_FAMILY_CHANGED';END IF;END $family$`;
 const prerequisiteCheck=pinsCheck(prerequisitePins,'OWN_ART_FULL_PREDECESSOR_CHANGED'),shapeCheck=artDaysTableCheck(),ownCheck=pinsCheck(ownPins,'OWN_ART_FULL_NEW_FUNCTION_CHANGED');
 const beforeCheck=[prerequisiteCheck,shapeCheck].join(';\n'),afterCheck=[prerequisiteCheck,shapeCheck,ownCheck,familyAfter].join(';\n');
 const snapshot=slot=>{
  let value=preservationSnapshot(slot),oldTable="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
  assert.equal(value.split(oldTable).length,3);value=value.replaceAll(oldTable,'true');
  value=once(value,"NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')","p.oid IS DISTINCT FROM to_regprocedure("+q(signature)+")");
  value=value.replaceAll('municontrol_sql111.',prefix);assert.ok(!value.includes('native_leave_'));assert.ok(!value.includes("-'prosrc'"));return value;
 };
 const before=snapshot('before'),after=snapshot('after');
 const priorAudit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'OWN_ART_FULL_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const objectFingerprint=`encode(public.digest((SELECT to_jsonb(p)::text FROM pg_proc p WHERE p.oid=to_regprocedure(${q(signature)})),'sha256'),'hex')`;
 const proof=`SELECT jsonb_build_object('version','own-art-full-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'predecessorVersion',${q(ART_FULL_PREDECESSOR)},${Object.entries(fixed).map(([key,value])=>q(key)+','+String(value)).join(',')},'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',${objectFingerprint}) AS proof`;
 return {sourceCommit:options.sourceCommit,sourceHashes,predecessorVersion:ART_FULL_PREDECESSOR,connects:false,executesSql:false,previousPins,groupPins:groups,dependencies,prerequisitePins,ownPins,legacyDefinition:legacy.definition,definition:derived,migration,isolation,installationGuard,beforeCheck,afterCheck,before,after,priorAudit,proof,
  derivation:{version:'own-art-full-two-literals.v1',legacyDefinitionSha256:hash(legacy.definition),fullDefinitionSha256:hash(derived),inverse:[['CREATE FUNCTION public.own_art_report_source_full_v1(','CREATE FUNCTION public.own_art_report_source_v1('],['public.own_close_group_full_v1(p,g.id)','public.own_close_group_v1(p,g.id)']]},
  installation:[isolation,installationGuard,beforeCheck,before,...migration,afterCheck,after,priorAudit,proof],
  durableVerification:['SET TRANSACTION READ ONLY',isolation,afterCheck,after,proof]};
}

export function assertOwnArtFullDurability({installed,durable,batch}){
 for(const p of [installed,durable]){
  assert.deepEqual(Object.keys(p).sort(),[...fields].sort());assert.equal(p.version,'own-art-full-installation.v1');assert.equal(p.predecessorVersion,ART_FULL_PREDECESSOR);assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);
  for(const [key,value]of Object.entries(fixed))assert.equal(p[key],value,key);for(const key of ['priorFingerprint','objectFingerprint'])assert.match(p[key],/^[a-f0-9]{64}$/);
 }
 assert.deepEqual(installed,durable,'OWN_ART_FULL_DURABILITY_CHANGED');return {passed:true,priorStatePreserved:true,artHistoryPreserved:true,independentDurabilityVerified:true,nominalRowsReturned:0};
}
