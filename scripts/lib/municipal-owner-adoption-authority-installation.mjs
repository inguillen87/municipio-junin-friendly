// Pure technical preparation. No connection, environment reads or SQL execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {ADOPTION_ADMINISTRATIVE_CONTEXT} from './adoption-administrative-identity-installation.mjs';
import {MUNICIPAL_OWNER_ADOPTION_POLICY,MUNICIPAL_OWNER_ADOPTION_POLICY_CANONICAL} from '../../lib/municipal-owner-adoption-policy.js';
import {installationPriorMetadataFingerprint} from './installation-prior-metadata.mjs';

export const OWNER_ADOPTION_AUTHORITY_SQL='scripts/migrations/184-municipal-owner-adoption-authority.sql';
export const OWNER_ADOPTION_AUTHORITY_SIGNATURE='public.municipal_owner_adoption_authority_v1(jsonb)';
export const OWNER_ADOPTION_AUTHORITY_SOURCE_PINS=Object.freeze({
 'scripts/lib/installation-prior-metadata.mjs':'b86d85a76a3c61bf963f61b9a991df65b1caec6056a74fe0c7396db4e808f8c9',
 'lib/municipal-owner-adoption-policy.js':'8534ccdbd89d9b21c144e7fe3e3362a54a202e88bc58360564399a08c6a68f3c',
 [OWNER_ADOPTION_AUTHORITY_SQL]:'386088bfb11d620d23957d745530c291bf554f4df5e26b5bc4c3822edaee85e2',
 'scripts/migrations/004-tenant-iam-control-plane.sql':'d22712fc9179d529bcec4d8347a9d845ed873dabee9c005db44b507c731a2195',
 'scripts/migrations/005-tenant-identity-gateway.sql':'dca8ae5d6dd0c5481bd4b0b8ec9799048e813df8f2248d5533e6d34b49fb7392',
 'scripts/migrations/006-tenant-action-authority.sql':'0d00147d965884f163b614d2fc1f8f167c27dd91060b101495c08b2275563e4a',
 'scripts/migrations/007-action-center-read-facades.sql':'d0e04ca20e3b67518d1340fe38d409fc3c7b339da4dee20e7a6850ebadbc8a1e',
 'scripts/migrations/012-platform-owner-governance.sql':'91396a7b02e4a46c8702137b3282c428735b33a9be52a47dd46f70741a95772d',
 'scripts/migrations/067-native-employee-registration.sql':'aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749',
 'scripts/migrations/095-native-employee-jurisdiction.sql':'48aecdd294bf11ec7f2a956b30eb455f2acc5be7d8825669249fed8ada7d90b5',
 'scripts/migrations/107-operational-profile-catalog.sql':'39dc65af0105c7c407a20d13a3d70f4220d873e00f94602a42f6f4ed9c7062fe',
 'scripts/migrations/113-native-employee-self-access.sql':'9c896bcdfeec974e665243460783dfb0d936c51fcb7f327b6b0b2aeea651b1d7',
 'scripts/fixtures/operational-profile-before.sql':'2550ca71cec7a46948b255e113e564ac1c8272eef6dab76b2bef1c07b7ae7b00',
 'scripts/migrations/136-adopted-employment-lifecycle.sql':'577f0c7aee2d594ec67153810e052190b1a055b17d4d0a6ba96065f68ea1870a',
 'scripts/lib/adoption-administrative-identity-installation.mjs':'117ec0b92d3974da2a82a2154709413b79d56398bf042e86153a71eab878c022',
 'scripts/lib/native-leave-installation.mjs':'57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef',
 'scripts/lib/own-payroll-installation.mjs':'6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0',
 'scripts/lib/sql-statements.mjs':'d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2',
});
const q=v=>"'"+String(v).replaceAll("'","''")+"'",lf=v=>v.replace(/\r\n?/g,'\n'),hash=v=>createHash('sha256').update(v).digest('hex');
const prefix='municontrol_owner_authority184.',name='municipal_owner_adoption_authority_v1';
const once=(value,needle,replacement)=>{assert.equal(value.split(needle).length,2,'OWNER_AUTHORITY184_SNAPSHOT_ANCHOR_CHANGED');return value.replace(needle,()=>replacement);};
function definition(source,functionName){
 const marker=new RegExp('\\bCREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+functionName+'\\(');
 const matches=splitPostgresStatements(source).filter(s=>marker.test(s));assert.equal(matches.length,1,'OWNER_AUTHORITY184_FUNCTION_SOURCE_CHANGED:'+functionName);
 return matches[0].slice(matches[0].search(marker));
}

// Reconstruct the single published IAM baseline from reviewed source. This is
// pure preparation: none of these existing functions is installed or replaced.
// The captured pg_get_functiondef headers use SET ... TO; normalize that syntax
// only for the closed metadata parser, preserving every byte of each body.
function publishedAuthorityDependencies(sources){
 const oldSession='3efaa78aa8a792b7701ac3f6981d1478101040dc0f1e26e10911117fba4bc1df',sessionSha='bf2c0d9114c1c3f66636ba8d89f49a96133c9f4addcb49cee32cd5d17cc0e0bc';
 const source113=sources['scripts/migrations/113-native-employee-self-access.sql'],fixture=sources['scripts/fixtures/operational-profile-before.sql'],source107=sources['scripts/migrations/107-operational-profile-catalog.sql'];
 let session=definition(sources['scripts/migrations/007-action-center-read-facades.sql'],'action_center_assert_tenant_read_session_v2');
 assert.equal(ownInstallationFunctionPin(session).sha256,oldSession);
 const patches=[...source113.matchAll(/\('public\.action_center_assert_tenant_read_session_v2\([^']+\)','3efaa78aa8a792b7701ac3f6981d1478101040dc0f1e26e10911117fba4bc1df',\s*\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$\)/g)];
 assert.equal(patches.length,1,'OWNER_AUTHORITY184_SESSION113_SOURCE_CHANGED');session=once(session,patches[0][1],patches[0][2]);assert.equal(ownInstallationFunctionPin(session).sha256,sessionSha);
 const captured=name=>{const value=definition(fixture,name),at=value.search(/\bAS\s+\$[\w]*\$/);assert.ok(at>0);return once(value.slice(0,at),"SET search_path TO 'public', 'pg_temp'",'SET search_path=public,pg_temp').replace(/\s+/g,' ')+value.slice(at);};
 for(const [signature,sha]of[['tenant_iam_assert_no_sod_conflict(uuid)','60e5a0b4cd6dc1d70621b260ebaaa9077bd42fb36548c36bc69704ed844671e9'],['tenant_iam_reviewed_operational_pair_v1(text,text,text)','15541c633ec2a356dbab8931cf4f0ca60258ab823dc8930cafab40d7098732fa']])assert.ok(source107.includes("pg_get_functiondef('public."+signature+"'::regprocedure),'UTF8')),'hex') IS DISTINCT FROM '"+sha+"'"),'OWNER_AUTHORITY184_PRE107_SOURCE_CHANGED:'+signature);
 const sod=captured('tenant_iam_assert_no_sod_conflict'),reviewedPair=captured('tenant_iam_reviewed_operational_pair_v1'),nativeAccount=definition(source113,'native_account_contract_v1');
 assert.equal(ownInstallationFunctionPin(sod).sha256,'64fa3435a21de7151ee5c6c71ada0e78afcc088621601a7f9e6a7083a1de148c');
 assert.equal(ownInstallationFunctionPin(reviewedPair).sha256,'53e1c2b9cbfcd287fa4c0cdb1333bcd25d8a224e9f222ab3badefe1e601888dd');
 assert.equal(ownInstallationFunctionPin(nativeAccount).sha256,'09afd04c00e7c6e2ac726cf18b277889e20b9019085b00080f4f3a169ffe79bc');
 return{session,sod,supportDefinitions:[reviewedPair,nativeAccount]};
}

// All previous functions, tables, leave rows, triggers and IAM state remain in
// the proof. Only this one new function is excluded and independently audited.
export function ownerAdoptionAuthoritySnapshot(slot){
 let value=preservationSnapshot(slot),leave=" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(value.split(leave).length,3);value=value.replaceAll(leave,'');
 value=once(value,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND p.oid IS DISTINCT FROM to_regprocedure('+q(OWNER_ADOPTION_AUTHORITY_SIGNATURE)+')');
 value=once(value,"p.relkind IN ('r','p')","p.relkind IN ('r','p','m')");
 return value.replaceAll('municontrol_sql111.',prefix);
}

// The capability source has a TABLE output argument; do not strip its modes or
// pretend it has the scalar metadata expected by pinsCheck.
function capabilitySourceCheck(source){
 const d=definition(source,'tenant_iam_effective_capabilities'),body=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(d);assert.ok(body);
 assert.match(d,/RETURNS TABLE\s*\(capability_key varchar\(96\)\)/);
 return `DO $capability_source$ DECLARE p pg_proc;BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.tenant_iam_effective_capabilities(uuid)');
 IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR NOT p.prosecdef OR p.proisstrict OR NOT p.proretset
 OR p.prorettype<>'varchar'::regtype OR p.provolatile<>'s' OR p.proparallel<>'u' OR p.proleakproof OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>1000
 OR p.proargnames IS DISTINCT FROM ARRAY['p_membership_id','capability_key']::text[]
 OR p.proargmodes IS DISTINCT FROM ARRAY['i','t']::"char"[] OR p.proallargtypes IS DISTINCT FROM ARRAY['uuid'::regtype::oid,'varchar'::regtype::oid]
 OR p.pronargdefaults<>0 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
 OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>'sql'
 OR encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')<>${q(hash(body[2]))}
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
 THEN RAISE EXCEPTION 'OWNER_AUTHORITY184_CAPABILITY_SOURCE_CHANGED';END IF;END $capability_source$`;
}

export function buildMunicipalOwnerAdoptionAuthorityInstallation(options){
 assert.ok(options&&typeof options==='object'&&!Array.isArray(options));assert.deepEqual(Object.keys(options).sort(),['read','sourceCommit']);
 const {read,sourceCommit}=options;assert.equal(typeof read,'function');assert.equal(typeof sourceCommit,'string');assert.equal(sourceCommit.length,40);assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const sources={},sourceHashes={};for(const[file,pin]of Object.entries(OWNER_ADOPTION_AUTHORITY_SOURCE_PINS)){const value=read(file);assert.equal(typeof value,'string');sources[file]=lf(value);sourceHashes[file]=hash(sources[file]);assert.equal(sourceHashes[file],pin,'OWNER_AUTHORITY184_SOURCE_CHANGED:'+file);}
 assert.equal(MUNICIPAL_OWNER_ADOPTION_POLICY.version,'tenant-owner-adoption-policy.v1');assert.equal(hash(MUNICIPAL_OWNER_ADOPTION_POLICY_CANONICAL),MUNICIPAL_OWNER_ADOPTION_POLICY.sha256,'OWNER_AUTHORITY184_POLICY_CHANGED');
 const migration=splitPostgresStatements(sources[OWNER_ADOPTION_AUTHORITY_SQL]).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,''));assert.equal(migration.length,3);
 const newDefinition=definition(sources[OWNER_ADOPTION_AUTHORITY_SQL],name),newPin={...ownInstallationFunctionPin(newDefinition),runtime:true};assert.equal(newPin.signature,OWNER_ADOPTION_AUTHORITY_SIGNATURE);
 // The old generic pin parser handles search_path/timezone only. Audit this
 // exact additional setting too: inherited FOR SHARE waits are bounded, and
 // PostgreSQL restores the caller's setting when this function returns.
 assert.ok(newDefinition.includes("SET timezone='UTC' SET lock_timeout='2s' AS $$"));newPin.config.push('lock_timeout=2s');
 assert.ok(newDefinition.includes("'policySha256',"+q(MUNICIPAL_OWNER_ADOPTION_POLICY.sha256)));assert.ok(newDefinition.includes("'policyVersion',"+q(MUNICIPAL_OWNER_ADOPTION_POLICY.version)));
 assert.equal(migration[0],newDefinition);assert.equal(migration[1],'REVOKE ALL ON FUNCTION '+OWNER_ADOPTION_AUTHORITY_SIGNATURE+' FROM PUBLIC,municontrol_actions_runtime_app');assert.equal(migration[2],'GRANT EXECUTE ON FUNCTION '+OWNER_ADOPTION_AUTHORITY_SIGNATURE+' TO municontrol_actions_runtime_app');
 const published=publishedAuthorityDependencies(sources),dependencies=[
  ADOPTION_ADMINISTRATIVE_CONTEXT,
  definition(sources['scripts/migrations/067-native-employee-registration.sql'],'native_employee_context_v1'),
  published.session,
  definition(sources['scripts/migrations/007-action-center-read-facades.sql'],'action_center_context_has_capability'),
  published.sod,
  definition(sources['scripts/migrations/136-adopted-employment-lifecycle.sql'],'native_employee_read_projection_v1'),
 ];
 const prerequisitePins=dependencies.map(d=>{const pin=ownInstallationFunctionPin(d);
  // 095 records the exact already-published compact067 context. Later guards
  // 103/104/110/132 require that body, while retaining067's signature/metadata.
  // Do not replace it with the older source body or accept either one loosely.
  if(pin.name==='native_employee_context_v1'){
   assert.equal(pin.sha256,'30d651a79381467d916475803e5d8ad3d5bd49b8fe611729fb159063d10fd6ed');
   assert.ok(sources['scripts/migrations/095-native-employee-jurisdiction.sql'].includes("('native_employee_context_v1','jsonb,boolean','"+pin.sha256+"','"+pin.sha256+"','0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c')"));
   pin.sha256='0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c';
  }
  return{...pin,runtime:pin.name==='native_employee_read_projection_v1'};
 });
 assert.equal(prerequisitePins[0].sha256,'45c74402dff395e2795b525a16136150171964ec73d9bb3be830ac1ff8a1e12a');
 const supportDefinitions=published.supportDefinitions,supportPins=supportDefinitions.map(d=>({...ownInstallationFunctionPin(d),runtime:false}));
 const prerequisiteCheck=pinsCheck([...prerequisitePins,...supportPins],'OWNER_AUTHORITY184_PREREQUISITE_CHANGED')+';'+capabilitySourceCheck(sources['scripts/migrations/006-tenant-action-authority.sql']);
 const absent=`DO $absent$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=${q(name)}) THEN RAISE EXCEPTION 'OWNER_AUTHORITY184_EXPECTED_ABSENT';END IF;END $absent$`;
 const count=`DO $count$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=${q(name)})<>1 THEN RAISE EXCEPTION 'OWNER_AUTHORITY184_UNEXPECTED_OVERLOAD';END IF;END $count$`;
 const beforeCheck=prerequisiteCheck+';'+absent,afterCheck=prerequisiteCheck+';'+count+';'+pinsCheck([newPin],'OWNER_AUTHORITY184_AFTER_CHANGED');
 const mode=`DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'OWNER_AUTHORITY184_ISOLATION_REQUIRED';END IF;IF NOT pg_try_advisory_xact_lock(184) THEN RAISE EXCEPTION 'OWNER_AUTHORITY184_BUSY';END IF;PERFORM set_config('${prefix}mode',CASE WHEN to_regprocedure(${q(OWNER_ADOPTION_AUTHORITY_SIGNATURE)}) IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$`;
 const required=expected=>`DO $phase$ BEGIN IF current_setting('${prefix}mode')<>${q(expected)} THEN RAISE EXCEPTION 'OWNER_AUTHORITY184_PHASE_REQUIRED';END IF;END $phase$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const before=ownerAdoptionAuthoritySnapshot('before'),after=ownerAdoptionAuthoritySnapshot('after'),audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'OWNER_AUTHORITY184_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const proof=(modeValue,preserved)=>`SELECT jsonb_build_object('version','municipal-owner-adoption-authority-installation.v1','sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',${modeValue},'policy',${q(JSON.stringify(MUNICIPAL_OWNER_ADOPTION_POLICY))}::jsonb,'newFunctions',1,'newTables',0,'adaptedFunctions',0,'businessWrites',0,'identityWrites',0,'iamWrites',0,'existingAclChanges',0,'nominalRowsReturned',0,'transactionDataPreserved',${preserved},'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix+'after')},'objectSha256',encode(public.digest((SELECT to_jsonb(p)::text FROM pg_proc p WHERE p.oid=to_regprocedure(${q(OWNER_ADOPTION_AUTHORITY_SIGNATURE)})),'sha256'),'hex')) AS proof`;
 const sequence=expected=>[mode,required(expected),choose,before,apply,afterCheck,after,audit,proof("current_setting('"+prefix+"mode')",true)];
 const readOnly="DO $readonly$ BEGIN IF current_setting('transaction_read_only')<>'on' THEN RAISE EXCEPTION 'OWNER_AUTHORITY184_READONLY_REQUIRED';END IF;END $readonly$";
 // Rollback is technical only and refuses a later SQL integration. Never use
 // CASCADE, delete a receipt, or loosen a prerequisite to make removal succeed.
 const noConsumers=`DO $consumers$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND p.oid<>to_regprocedure(${q(OWNER_ADOPTION_AUTHORITY_SIGNATURE)}) AND position(${q(name)} in p.prosrc)>0) THEN RAISE EXCEPTION 'OWNER_AUTHORITY184_IN_USE';END IF;END $consumers$`;
 return{version:'municipal-owner-adoption-authority-installation.v1',sourceCommit,sourceHashes,policy:MUNICIPAL_OWNER_ADOPTION_POLICY,prerequisitePins,prerequisiteDefinitions:dependencies,supportPins,supportDefinitions,newPin,newDefinition,migration,prerequisiteCheck,beforeCheck,afterCheck,mode,choose,apply,before,after,audit,
  rehearsal:sequence('install'),installation:sequence('install'),repetition:sequence('verify'),verification:[readOnly,afterCheck,after,proof("'verify'",false)],
  rollback:[afterCheck,noConsumers,before,'DROP FUNCTION '+OWNER_ADOPTION_AUTHORITY_SIGNATURE,beforeCheck,after,audit],rollbackVerification:[readOnly,beforeCheck],
  transactionContract:{rehearsal:'ROLLBACK',installation:'COMMIT',repetition:'COMMIT',verification:'READ ONLY',resolverReadOnlyTransactionCompatible:false},
  newFunctions:1,newTables:0,adaptedFunctions:0,businessWrites:0,identityWrites:0,iamWrites:0,existingAclChanges:0,connects:false,executesSql:false};
}

// Compare independently returned database proofs. Generating a batch or
// accepting a synthetic fixture is never evidence that SQL was executed.
export function assertMunicipalOwnerAdoptionAuthorityDurability({installed,durable,repeated,batch}){
 assert.equal(batch.version,'municipal-owner-adoption-authority-installation.v1');
 const counters={newFunctions:1,newTables:0,adaptedFunctions:0,businessWrites:0,identityWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0};
 const keys=['version','sourceCommit','sourceHashes','mode','policy',...Object.keys(counters),'preservationSha256','priorMetadataSha256','objectSha256','transactionDataPreserved'].sort();
 for(const[proof,mode,preserved]of[[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]]){
  assert.ok(proof&&typeof proof==='object'&&!Array.isArray(proof));assert.deepEqual(Reflect.ownKeys(proof).sort(),keys);
  assert.equal(proof.version,batch.version);assert.equal(proof.sourceCommit,batch.sourceCommit);assert.deepEqual(proof.sourceHashes,batch.sourceHashes);assert.deepEqual(proof.policy,batch.policy);assert.equal(proof.mode,mode);
  for(const[key,value]of Object.entries(counters))assert.equal(proof[key],value);
  assert.equal(proof.transactionDataPreserved,preserved);
  for(const key of['preservationSha256','priorMetadataSha256','objectSha256']){assert.equal(typeof proof[key],'string');assert.equal(proof[key].length,64);assert.match(proof[key],/^[a-f0-9]{64}$/);}
  for(const key of['priorMetadataSha256','objectSha256'])assert.equal(proof[key],installed[key]);
 }
 return{ok:true,version:batch.version,sourceCommit:batch.sourceCommit,transactionDataPreserved:true,wholeDatabaseStaticAcrossConnections:false,priorMetadataSha256:installed.priorMetadataSha256,objectSha256:installed.objectSha256};
}
