// Pure reviewable technical protocol. Never connects or executes SQL.
import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{splitPostgresStatements}from'./sql-statements.mjs';
import{ownInstallationFunctionPin}from'./own-payroll-installation.mjs';
import{pinsCheck,preservationSnapshot}from'./native-leave-installation.mjs';
import{installationPriorMetadataFingerprint}from'./installation-prior-metadata.mjs';
import{SALARY_ADMINISTRATIVE_CONTEXT}from'./salary-administrative-identity-installation.mjs';
import{buildMunicipalOwnerAdoptionAuthorityInstallation,ownerAdoptionAuthorityInstallationOptions}from'./municipal-owner-adoption-authority-installation.mjs';
import{buildOwnPeriodClassificationInstallation}from'./own-period-classification-installation.mjs';
export const MONTHLY189_SQL='scripts/migrations/189-own-monthly-participation-source.sql';
export const MONTHLY189_SIGNATURE='public.own_monthly_participation_source_v1(jsonb,uuid,text)';
export const MONTHLY189_SOURCE_PINS=Object.freeze({
 "scripts/migrations/189-own-monthly-participation-source.sql": "fff7a82983b369a358b0aeed9855d2cf7baa9eeb6e80ba644993b1fa143cc759",
 "scripts/migrations/004-tenant-iam-control-plane.sql": "d22712fc9179d529bcec4d8347a9d845ed873dabee9c005db44b507c731a2195",
 "scripts/migrations/007-action-center-read-facades.sql": "d0e04ca20e3b67518d1340fe38d409fc3c7b339da4dee20e7a6850ebadbc8a1e",
 "scripts/migrations/067-native-employee-registration.sql": "aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749",
 "scripts/migrations/095-native-employee-jurisdiction.sql": "48aecdd294bf11ec7f2a956b30eb455f2acc5be7d8825669249fed8ada7d90b5",
 "scripts/migrations/103-native-employment-catalog.sql": "759bde35236dc0add938e55664f0addb3c301f79e4ecfdf0771300dbd9795cd6",
 "scripts/migrations/104-native-employment-changes.sql": "0f3e408bb12ef64c0d197826ce4331b263987c6d7f36719e528648f4b750de4a",
 "scripts/migrations/110-native-employment-lifecycle.sql": "e31ee11235b8ac2579e2d0d4c863627a146d062e883faef48420e4d39fb66219",
 "scripts/migrations/112-native-salary-definitions.sql": "da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3",
 "scripts/migrations/136-adopted-employment-lifecycle.sql": "577f0c7aee2d594ec67153810e052190b1a055b17d4d0a6ba96065f68ea1870a",
 "scripts/migrations/138-adopted-fixed-novelties.sql": "da7bc276e367dc3c0377c99e3c687747665a53c0c186eb457f27ab9032803469",
 "scripts/migrations/157-own-period-participation.sql": "06b5fdcce0c55e5b768d43af0491f1498728bf762febffe81cb6df9763d96548",
 "scripts/lib/salary-administrative-identity-installation.mjs": "eb898f02b87eeeeca5edde201c9a0a7d9b03d777fce80ef6a22eac7d93820a71",
 "scripts/lib/native-leave-installation.mjs": "57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef",
 "scripts/lib/own-payroll-installation.mjs": "6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0",
 "scripts/lib/sql-statements.mjs": "d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2",
 "scripts/lib/installation-prior-metadata.mjs": "b86d85a76a3c61bf963f61b9a991df65b1caec6056a74fe0c7396db4e808f8c9",
 "scripts/lib/municipal-owner-adoption-authority-installation.mjs":"10f5fb42aef999deebb9d43deb0fcc903cb6913a973a93a9ebad95f4f76eb012",
 "scripts/lib/own-period-classification-installation.mjs":"fc256e947a505dcb6606c95372575b9755af4a426888db783573e1737e95def6",
 "scripts/migrations/137-adopted-operator-context.sql":"b1db803f7d50d6a744cfdf8bf5fcc8af08395ca9b6d67f8704cde4b7eab64d0f"
});
const hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>v.replace(/\r\n?/g,'\n'),q=v=>"'"+String(v).replaceAll("'","''")+"'",prefix='municontrol_monthly189.';
const once=(v,a,b)=>{assert.equal(v.split(a).length,2,'MONTHLY189_SNAPSHOT_ANCHOR_CHANGED');return v.replace(a,()=>b);};
function definition(source,name){const re=new RegExp('\\bCREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\('),rows=splitPostgresStatements(source).filter(s=>re.test(s));assert.equal(rows.length,1,'MONTHLY189_FUNCTION_SOURCE_CHANGED:'+name);return rows[0].slice(rows[0].search(re));}
//136 publishes this dispatch facade to the runtime role. Derive that existing
//ACL from the pinned source;189 does not grant or revoke a predecessor.
export function monthlyLifecycleReadRuntime(source){
 const signature='public.native_employment_lifecycle_read_v2(jsonb,uuid)',statements=splitPostgresStatements(source),grant=statements.filter(s=>/^GRANT EXECUTE ON FUNCTION[\s\S]+ TO municontrol_actions_runtime_app$/.test(s)&&s.replace(/\s+/g,'').includes(signature)),revoke=statements.filter(s=>/^REVOKE ALL ON FUNCTION[\s\S]+ FROM PUBLIC,municontrol_actions_runtime_app$/.test(s)&&s.replace(/\s+/g,'').includes(signature));
 assert.equal(grant.length,1,'MONTHLY189_LIFECYCLE_ACL_SOURCE_CHANGED');assert.equal(revoke.length,1,'MONTHLY189_LIFECYCLE_ACL_SOURCE_CHANGED');
 const signatures=s=>[...s.matchAll(/public\.[a-z0-9_]+\([^)]*\)/g)].map(m=>m[0].replace(/\s+/g,''));
 assert.equal(signatures(grant[0]).filter(s=>s===signature).length,1,'MONTHLY189_LIFECYCLE_ACL_SOURCE_CHANGED');assert.equal(signatures(revoke[0]).filter(s=>s===signature).length,1,'MONTHLY189_LIFECYCLE_ACL_SOURCE_CHANGED');
 return{signature,runtime:true};
}
export function monthlyParticipationSnapshot(slot){
 let s=preservationSnapshot(slot),excluded=" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";assert.equal(s.split(excluded).length,3);s=s.replaceAll(excluded,'');
 s=once(s,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND p.oid IS DISTINCT FROM to_regprocedure('+q(MONTHLY189_SIGNATURE)+')');
 s=once(s,"p.relkind IN ('r','p')","p.relkind IN ('r','p','m')");return s.replaceAll('municontrol_sql111.',prefix);
}
export function buildOwnMonthlyParticipationInstallation(options){
 const{read,sourceCommit,operationalPairBaseline}=ownerAdoptionAuthorityInstallationOptions(options);
 const sources={},sourceHashes={};for(const[f,pin]of Object.entries(MONTHLY189_SOURCE_PINS)){const v=read(f);assert.equal(typeof v,'string');sources[f]=lf(v);sourceHashes[f]=hash(sources[f]);assert.equal(sourceHashes[f],pin,'MONTHLY189_SOURCE_CHANGED:'+f);}
 const migration=splitPostgresStatements(sources[MONTHLY189_SQL]).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,''));assert.equal(migration.length,3);const newDefinition=definition(sources[MONTHLY189_SQL],'own_monthly_participation_source_v1'),newPin={...ownInstallationFunctionPin(newDefinition),runtime:true};newPin.config.push('lock_timeout=2s');assert.equal(newPin.signature,MONTHLY189_SIGNATURE);
 assert.equal(migration[0],newDefinition);assert.equal(migration[1],'REVOKE ALL ON FUNCTION '+MONTHLY189_SIGNATURE+' FROM PUBLIC,municontrol_actions_runtime_app');assert.equal(migration[2],'GRANT EXECUTE ON FUNCTION '+MONTHLY189_SIGNATURE+' TO municontrol_actions_runtime_app');
 const specs={
  '004-tenant-iam-control-plane.sql':['tenant_iam_assert_no_sod_conflict'],
  '007-action-center-read-facades.sql':['action_center_assert_tenant_read_session_v2','action_center_context_has_capability'],
  '067-native-employee-registration.sql':['native_employee_context_v1'],
  '103-native-employment-catalog.sql':['native_employment_catalog_lock_v1'],
  '104-native-employment-changes.sql':['native_employment_change_context_v1','native_employment_change_lock_v1'],
  '110-native-employment-lifecycle.sql':['native_employment_lifecycle_lock_v1','native_employment_lifecycle_subject_v1','native_employment_lifecycle_state_v1'],
  '112-native-salary-definitions.sql':['native_salary_lock_v1','native_salary_scope_v1','native_salary_serialized_v1'],
  '136-adopted-employment-lifecycle.sql':['native_employee_read_projection_v1','native_employment_lifecycle_read_v2','native_employment_lifecycle_adopted_context_v2','native_employment_lifecycle_adopted_read_v2','native_employment_lifecycle_fresh_read_v2','native_employment_lifecycle_adopted_subject_v2','native_employment_lifecycle_adopted_state_v2'],
  '138-adopted-fixed-novelties.sql':['payroll_fixed_registry_subject_v2','payroll_fixed_registry_adopted_subject_v1','payroll_fixed_registry_range_v2'],
  '157-own-period-participation.sql':['own_participation_lock_v1','own_participation_source_v1','own_participation_scope_v1','own_participation_current_v1','own_participation_summary_v1','own_participation_bootstrap_v1'],
 };
 // The184 builder derives published IAM bytes only. Neither its owner RPC nor
 // its authority policy is called by189 or required from an operator of157.
 const checkedRead=f=>{const v=lf(read(f));sourceHashes[f]=hash(v);return v;},iam=buildMunicipalOwnerAdoptionAuthorityInstallation({read:checkedRead,sourceCommit,operationalPairBaseline}),classification=buildOwnPeriodClassificationInstallation({read:checkedRead,sourceCommit});
 Object.assign(sourceHashes,iam.sourceHashes,classification.sourceHashes);
 const changeOriginal=definition(sources['scripts/migrations/104-native-employment-changes.sql'],'native_employment_change_context_v1'),patch137=sources['scripts/migrations/137-adopted-operator-context.sql'];
 const calls=[...patch137.matchAll(/(?:old_call|new_call) text:='((?:[^']|'')*)';/g)].map(m=>m[1].replaceAll("''","'"));assert.equal(calls.length,2,'MONTHLY189_OPERATOR137_SOURCE_CHANGED');
 const currentChange=once(changeOriginal,calls[0],calls[1]),range=classification.changed.filter(d=>ownInstallationFunctionPin(d).name==='payroll_fixed_registry_range_v2');assert.equal(range.length,1);
 const current=new Map([iam.prerequisiteDefinitions[2],iam.prerequisiteDefinitions[4],currentChange,classification.lifecyclePrerequisiteDefinitions[0],range[0]].map(d=>[ownInstallationFunctionPin(d).name,d]));
 const raw=[SALARY_ADMINISTRATIVE_CONTEXT,...Object.entries(specs).flatMap(([f,names])=>names.map(n=>current.get(n)??definition(sources['scripts/migrations/'+f],n))),...iam.supportDefinitions,...classification.lifecyclePrerequisiteDefinitions,definition(classification.migration.join(';'),'own_period_classification_lifecycle_subject_v1')];
 const definitions=new Map();for(const d of raw){const p=ownInstallationFunctionPin(d),previous=definitions.get(p.signature);if(previous)assert.equal(ownInstallationFunctionPin(previous).sha256,p.sha256,'MONTHLY189_PREREQUISITE_DUPLICATE_CHANGED');else definitions.set(p.signature,d);}
 const lifecycleAccess=monthlyLifecycleReadRuntime(sources['scripts/migrations/136-adopted-employment-lifecycle.sql']);
 const prerequisiteDefinitions=[...definitions.values()],prerequisitePins=prerequisiteDefinitions.map(d=>{const pin=ownInstallationFunctionPin(d);if(pin.name==='native_employee_context_v1'){assert.equal(pin.sha256,'30d651a79381467d916475803e5d8ad3d5bd49b8fe611729fb159063d10fd6ed');assert.ok(sources['scripts/migrations/095-native-employee-jurisdiction.sql'].includes("('native_employee_context_v1','jsonb,boolean','"+pin.sha256+"','"+pin.sha256+"','0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c')"));pin.sha256='0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c';}return{...pin,runtime:pin.signature===lifecycleAccess.signature?lifecycleAccess.runtime:['native_employee_read_projection_v1','own_participation_bootstrap_v1'].includes(pin.name)};});
 assert.equal(new Set(prerequisitePins.map(p=>p.signature)).size,prerequisitePins.length);
 const tableGuard=iam.prerequisiteCheck.split(';DO $capability_source$');assert.equal(tableGuard.length,2,'MONTHLY189_CAPABILITY_SOURCE_CHECK_CHANGED');
 const prerequisiteCheck=pinsCheck(prerequisitePins,'MONTHLY189_PREREQUISITE_CHANGED')+';DO $capability_source$'+tableGuard[1];
 const absent=`DO $absent$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_monthly_participation_source_v1') THEN RAISE EXCEPTION 'MONTHLY189_EXPECTED_ABSENT';END IF;END $absent$`;
 const count=`DO $count$ BEGIN IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_monthly_participation_source_v1')<>1 THEN RAISE EXCEPTION 'MONTHLY189_UNEXPECTED_OVERLOAD';END IF;END $count$`;
 const beforeCheck=prerequisiteCheck+';'+absent,afterCheck=prerequisiteCheck+';'+count+';'+pinsCheck([newPin],'MONTHLY189_AFTER_CHANGED');
 const mode=`DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'MONTHLY189_INSTALL_ISOLATION_REQUIRED';END IF;IF NOT pg_try_advisory_xact_lock(189) THEN RAISE EXCEPTION 'MONTHLY189_BUSY';END IF;PERFORM set_config('${prefix}mode',CASE WHEN to_regprocedure(${q(MONTHLY189_SIGNATURE)}) IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$`;
 const required=m=>`DO $phase$ BEGIN IF current_setting('${prefix}mode')<>${q(m)} THEN RAISE EXCEPTION 'MONTHLY189_PHASE_REQUIRED';END IF;END $phase$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const before=monthlyParticipationSnapshot('before'),after=monthlyParticipationSnapshot('after'),audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'MONTHLY189_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const proof=(m,preserved)=>`SELECT jsonb_build_object('version','own-monthly-participation-installation.v1','sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',${m},'newFunctions',1,'newTables',0,'adaptedFunctions',0,'businessWrites',0,'identityWrites',0,'iamWrites',0,'existingAclChanges',0,'nominalRowsReturned',0,'transactionDataPreserved',${preserved},'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix+'after')},'objectSha256',encode(public.digest((SELECT to_jsonb(p)::text FROM pg_proc p WHERE p.oid=to_regprocedure(${q(MONTHLY189_SIGNATURE)})),'sha256'),'hex')) AS proof`;
 const sequence=m=>[mode,required(m),choose,before,apply,afterCheck,after,audit,proof("current_setting('"+prefix+"mode')",true)],readOnly="DO $readonly$ BEGIN IF current_setting('transaction_read_only')<>'on' THEN RAISE EXCEPTION 'MONTHLY189_READONLY_REQUIRED';END IF;END $readonly$";
 const noConsumers=`DO $consumers$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND p.oid<>to_regprocedure(${q(MONTHLY189_SIGNATURE)}) AND position('own_monthly_participation_source_v1' in p.prosrc)>0) THEN RAISE EXCEPTION 'MONTHLY189_IN_USE';END IF;END $consumers$`;
 return{version:'own-monthly-participation-installation.v1',sourceCommit,operationalPairBaseline,sourceHashes,migration,newDefinition,newPin,prerequisitePins,prerequisiteDefinitions,beforeCheck,afterCheck,mode,choose,apply,before,after,audit,rehearsal:sequence('install'),installation:sequence('install'),repetition:sequence('verify'),verification:[readOnly,afterCheck,after,proof("'verify'",false)],rollback:[afterCheck,noConsumers,before,'DROP FUNCTION '+MONTHLY189_SIGNATURE,beforeCheck,after,audit],rollbackVerification:[readOnly,beforeCheck],transactionContract:{technical:'REPEATABLE READ',runtime:'READ COMMITTED',runtimeReadOnlyCompatible:false},newFunctions:1,newTables:0,adaptedFunctions:0,businessWrites:0,identityWrites:0,iamWrites:0,connects:false,executesSql:false};
}
export function assertOwnMonthlyParticipationDurability({installed,durable,repeated,batch}){
 const counters={newFunctions:1,newTables:0,adaptedFunctions:0,businessWrites:0,identityWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0},keys=['version','sourceCommit','sourceHashes','mode',...Object.keys(counters),'preservationSha256','priorMetadataSha256','objectSha256','transactionDataPreserved'].sort();
 for(const[p,mode,preserved]of[[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]]){assert.ok(p&&typeof p==='object');assert.deepEqual(Reflect.ownKeys(p).sort(),keys);assert.equal(p.version,batch.version);assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);assert.equal(p.mode,mode);assert.equal(p.transactionDataPreserved,preserved);for(const[k,v]of Object.entries(counters))assert.equal(p[k],v);for(const k of['preservationSha256','priorMetadataSha256','objectSha256']){assert.equal(typeof p[k],'string');assert.equal(p[k].length,64);assert.match(p[k],/^[a-f0-9]{64}$/);}for(const k of['priorMetadataSha256','objectSha256'])assert.equal(p[k],installed[k]);}
 return{ok:true,version:batch.version,sourceCommit:batch.sourceCommit,transactionDataPreserved:true,wholeDatabaseStaticAcrossConnections:false,priorMetadataSha256:installed.priorMetadataSha256,objectSha256:installed.objectSha256};
}
