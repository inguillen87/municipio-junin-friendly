// Source metadata only; reuses the canonical184/participation auth boundary.
// Conditional identity readers remain preserved at that admitted boundary; no new transitive admission gate.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';

export const CENSUS_AUTH_SOURCE_PINS=Object.freeze({
 'scripts/migrations/006-tenant-action-authority.sql':'0d00147d965884f163b614d2fc1f8f167c27dd91060b101495c08b2275563e4a',
 'scripts/migrations/007-action-center-read-facades.sql':'d0e04ca20e3b67518d1340fe38d409fc3c7b339da4dee20e7a6850ebadbc8a1e',
 'scripts/migrations/067-native-employee-registration.sql':'aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749',
 'scripts/migrations/095-native-employee-jurisdiction.sql':'48aecdd294bf11ec7f2a956b30eb455f2acc5be7d8825669249fed8ada7d90b5',
 'scripts/migrations/104-native-employment-changes.sql':'0f3e408bb12ef64c0d197826ce4331b263987c6d7f36719e528648f4b750de4a',
 'scripts/migrations/107-operational-profile-catalog.sql':'39dc65af0105c7c407a20d13a3d70f4220d873e00f94602a42f6f4ed9c7062fe',
 'scripts/migrations/112-native-salary-definitions.sql':'da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3',
 'scripts/migrations/113-native-employee-self-access.sql':'9c896bcdfeec974e665243460783dfb0d936c51fcb7f327b6b0b2aeea651b1d7',
 'scripts/migrations/136-adopted-employment-lifecycle.sql':'577f0c7aee2d594ec67153810e052190b1a055b17d4d0a6ba96065f68ea1870a',
 'scripts/migrations/137-adopted-operator-context.sql':'b1db803f7d50d6a744cfdf8bf5fcc8af08395ca9b6d67f8704cde4b7eab64d0f',
 'scripts/migrations/176-own-payroll-administrative-operator.sql':'f75fa2cddf6fe2e837044e73c6465eecdf41fbad7ec740745527e1bd54b94732',
 'scripts/lib/salary-administrative-identity-installation.mjs':'eb898f02b87eeeeca5edde201c9a0a7d9b03d777fce80ef6a22eac7d93820a71',
 'scripts/fixtures/operational-profile-before.sql':'2550ca71cec7a46948b255e113e564ac1c8272eef6dab76b2bef1c07b7ae7b00',
 'scripts/lib/own-payroll-installation.mjs':'6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0',
 'scripts/lib/sql-statements.mjs':'d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2'
});
const hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>v.replace(/\r\n?/g,'\n');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'CENSUS_AUTH_SOURCE_ANCHOR');return s.replace(a,()=>b);};
function definition(text,name){
 const re=new RegExp('\\bCREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\(');
 const rows=splitPostgresStatements(text).filter(s=>re.test(s));assert.equal(rows.length,1,'CENSUS_AUTH_FUNCTION_SOURCE:'+name);
 return rows[0].slice(rows[0].search(re));
}
function normalized(definition){
 const at=definition.search(/\bAS\s+\$[\w]*\$/);assert.ok(at>0);
 return definition.slice(0,at).replace("SET search_path TO 'public', 'pg_temp'",'SET search_path=public,pg_temp').replace(/\s+/g,' ')+definition.slice(at);
}
const authExpected=Object.freeze({
 own_run_context_v1:'7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30',
 native_salary_context_v1:'7aad8fc0ecba5ccd2045746b36671104e1911d0783cdf611f6a66c99949ec5de',
 native_salary_administrative_context_v1:'346e45cc443193a34b8f000d988cd8e5b4356ec961173a82df91350fd0159451',
 native_employment_change_context_v1:'2e333bd185ce509f3f4715d83f48ce6a37341dfd32ef3e56e21942ff6995fe7b',
 native_employment_lifecycle_adopted_context_v2:'dcb84a3d2932f297d2b9ed755e6f17b47b9c3f11391dec6a93cc003ae2bc326d',
 native_employee_read_projection_v1:'c9ecbb8303550a20ce5487f92e03c943e60be835997049a31d06bda24c61fb25',
 action_center_assert_tenant_read_session_v2:'bf2c0d9114c1c3f66636ba8d89f49a96133c9f4addcb49cee32cd5d17cc0e0bc',
 action_center_context_has_capability:'2c11f52b97664769613495b4929de39ac008181fbaa5ab701c028e92f9d82df8',
 tenant_iam_assert_no_sod_conflict:'64fa3435a21de7151ee5c6c71ada0e78afcc088621601a7f9e6a7083a1de148c',
 native_account_contract_v1:'09afd04c00e7c6e2ac726cf18b277889e20b9019085b00080f4f3a169ffe79bc'
});
export function deriveClosedReportAuthorizationSource(options){
 assert.ok(options&&typeof options==='object');assert.deepEqual(Object.keys(options).sort(),['operationalPairBaseline','read']);
 const {read,operationalPairBaseline}=options;assert.equal(typeof read,'function');
 assert.ok(['pre107','published107'].includes(operationalPairBaseline),'CENSUS_AUTH_BASELINE_REQUIRED');
 const sources={},sourceHashes={};for(const[file,expected]of Object.entries(CENSUS_AUTH_SOURCE_PINS)){
  const text=read(file);assert.equal(typeof text,'string');sources[file]=lf(text);sourceHashes[file]=hash(sources[file]);assert.equal(sourceHashes[file],expected,'CENSUS_AUTH_SOURCE_CHANGED:'+file);
 }
 const get=(file,name)=>definition(sources['scripts/migrations/'+file],name);
 const raw=[
  get('176-own-payroll-administrative-operator.sql','own_run_context_v1'),
  get('112-native-salary-definitions.sql','native_salary_context_v1'),
  get('136-adopted-employment-lifecycle.sql','native_employment_lifecycle_adopted_context_v2'),
  get('136-adopted-employment-lifecycle.sql','native_employee_read_projection_v1'),
  get('007-action-center-read-facades.sql','action_center_context_has_capability'),
  get('113-native-employee-self-access.sql','native_account_contract_v1')
 ];
 const helperSource=sources['scripts/lib/salary-administrative-identity-installation.mjs'],quote=String.fromCharCode(96),marker='export const SALARY_ADMINISTRATIVE_CONTEXT='+quote,start=helperSource.indexOf(marker),end=helperSource.indexOf(quote+';',start+marker.length);
 assert.ok(start>=0&&end>start);const helper=helperSource.slice(start+marker.length,end);assert.ok(!helper.includes('$'+'{'));raw.push(helper);
 const patch137=sources['scripts/migrations/137-adopted-operator-context.sql'],calls=[...patch137.matchAll(/(?:old_call|new_call) text:='((?:[^']|'')*)';/g)].map(m=>m[1].replaceAll("''","'"));
 assert.equal(calls.length,2);raw.push(once(get('104-native-employment-changes.sql','native_employment_change_context_v1'),calls[0],calls[1]));
 const source113=sources['scripts/migrations/113-native-employee-self-access.sql'],patches=[...source113.matchAll(/\('public\.action_center_assert_tenant_read_session_v2\([^']+\)','3efaa78aa8a792b7701ac3f6981d1478101040dc0f1e26e10911117fba4bc1df',\s*\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$\)/g)];
 assert.equal(patches.length,1);const session=get('007-action-center-read-facades.sql','action_center_assert_tenant_read_session_v2');assert.equal(ownInstallationFunctionPin(session).sha256,'3efaa78aa8a792b7701ac3f6981d1478101040dc0f1e26e10911117fba4bc1df');
 raw.push(once(session,patches[0][1],patches[0][2]));
 const fixture=sources['scripts/fixtures/operational-profile-before.sql'];raw.push(definition(fixture,'tenant_iam_assert_no_sod_conflict'));
 const pair=definition(operationalPairBaseline==='pre107'?fixture:sources['scripts/migrations/107-operational-profile-catalog.sql'],'tenant_iam_reviewed_operational_pair_v1');
 const pairPin=ownInstallationFunctionPin(normalized(pair));assert.equal(pairPin.sha256,operationalPairBaseline==='pre107'?'53e1c2b9cbfcd287fa4c0cdb1333bcd25d8a224e9f222ab3badefe1e601888dd':'0da6f93827fc83001121e191e17885eae2ffc73814178e6e26ca8efe7276f759');
 assert.equal(pairPin.definer,false);raw.push(pair);
 const pins=raw.map(d=>{const p=ownInstallationFunctionPin(normalized(d));if(p.name!=='tenant_iam_reviewed_operational_pair_v1')assert.equal(p.sha256,authExpected[p.name],'CENSUS_AUTH_BODY_CHANGED:'+p.name);return {...p,runtime:p.name==='native_employee_read_projection_v1'};});
 const nativeDefinition=get('067-native-employee-registration.sql','native_employee_context_v1'),nativePin=ownInstallationFunctionPin(nativeDefinition);
 assert.equal(nativePin.sha256,'30d651a79381467d916475803e5d8ad3d5bd49b8fe611729fb159063d10fd6ed');
 assert.ok(sources['scripts/migrations/095-native-employee-jurisdiction.sql'].includes("('native_employee_context_v1','jsonb,boolean','"+nativePin.sha256+"','"+nativePin.sha256+"','0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c')"));
 pins.push({...nativePin,sha256:'0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c',runtime:false});
 const capabilityDefinition=get('006-tenant-action-authority.sql','tenant_iam_effective_capabilities'),body=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(capabilityDefinition);assert.ok(body);assert.match(capabilityDefinition,/RETURNS TABLE\s*\(capability_key varchar\(96\)\)/);
 const capabilitySourcePin={name:'tenant_iam_effective_capabilities',signature:'public.tenant_iam_effective_capabilities(uuid)',sha256:hash(body[2]),argNames:['p_membership_id','capability_key'],argModes:['i','t'],allArgTypes:['uuid','varchar'],resultType:'varchar',returnsSet:true,strict:false,definer:true,language:'sql',volatility:'s',config:['search_path=public, pg_temp'],defaults:'',runtime:false};
 assert.equal(capabilitySourcePin.sha256,'33cbd5bc0308793ac77ded577740bbaa1347cb3c19dfda73f77a5652d8485b71');
 const all=[...pins,capabilitySourcePin];assert.equal(new Set(all.map(p=>p.signature)).size,all.length);
 return {version:'closed-report-authorization-source.v1',operationalPairBaseline,sourceHashes,definitions:raw,pins,capabilityDefinition,capabilitySourcePin,connects:false,executesSql:false};
}

// Same special RETURNS TABLE guard as canonical184. It cannot be passed to
// pinsCheck as a scalar function or omitted from the authorization boundary.
function capabilitySourceCheck(pin){
 const q=v=>"'"+String(v).replaceAll("'","''")+"'";
 return `DO $census_capability_source$ DECLARE p pg_proc;BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.tenant_iam_effective_capabilities(uuid)');
 IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR NOT p.prosecdef OR p.proisstrict OR NOT p.proretset
 OR p.prorettype<>'varchar'::regtype OR p.provolatile<>'s' OR p.proparallel<>'u' OR p.proleakproof OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>1000
 OR p.proargnames IS DISTINCT FROM ARRAY['p_membership_id','capability_key']::text[]
 OR p.proargmodes IS DISTINCT FROM ARRAY['i','t']::"char"[] OR p.proallargtypes IS DISTINCT FROM ARRAY['uuid'::regtype::oid,'varchar'::regtype::oid]
 OR p.pronargdefaults<>0 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
 OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>'sql'
 OR encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')<>${q(pin.sha256)}
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
 THEN RAISE EXCEPTION 'CENSUS_AUTH_CAPABILITY_SOURCE_CHANGED';END IF;END $census_capability_source$`;
}

// Exactly one source IAM profile. This does not infer a live baseline or accept
// pre107 as an alternative when published107 is expected.
export function buildOwnReportCensusAuthorityPins(options){
 assert.ok(options&&typeof options==='object');assert.deepEqual(Object.keys(options),['read']);
 const value=deriveClosedReportAuthorizationSource({read:options.read,operationalPairBaseline:'published107'});
 return {pins:value.pins,sourceHashes:value.sourceHashes,checks:[capabilitySourceCheck(value.capabilitySourcePin)]};
}
