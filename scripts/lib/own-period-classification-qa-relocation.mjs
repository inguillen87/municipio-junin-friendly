// A fixture-only, deterministic artifact. Never reads database bodies or hashes,
// connects, executes SQL, or accepts an alternate production prerequisite.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildOwnPeriodParticipationSql} from './own-period-participation-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {buildOwnPeriodClassificationInstallation} from './own-period-classification-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';

export const OWN_PERIOD_CLASSIFICATION_QA_FIXTURE_CHAIN='legacy-native-payroll-without-final-source.v1';
const files=Object.freeze({
 'scripts/lib/own-period-participation-installation.mjs':'2274e017f769ea4b490de36cb473360c26fdd7104fe528bf4fac8e669755b713',
 'scripts/lib/noelia-payroll-circuit-qa.mjs':'1c97fc17c27c5a971eda61a347099bf4ec955cd699a477cf41d85690c547ee73',
 'scripts/verify-salary-auxiliary-namespace.mjs':'04807f61392adc55e0b3c7ab0ba2a2f3cc5409a0b7d6402dd0fa1f81eee64680',
 'scripts/verify-own-salary-seniority.mjs':'2435a7fde224545dab0f4ce26f16a94a6ffd5f60bd79ad9eb97882915c6cc1e7',
 'scripts/verify-own-period-participation.mjs':'9cdb8083d1f46a03187c7ad6ed8bff171fc20205ed071c3fbfed79bf6d4b2a16',
 'scripts/migrations/138-adopted-fixed-novelties.sql':'da7bc276e367dc3c0377c99e3c687747665a53c0c186eb457f27ab9032803469',
});
const hash=s=>createHash('sha256').update(s).digest('hex'),lf=s=>s.replace(/\r\n?/g,'\n');
const q=s=>"'"+s.replaceAll("'","''")+"'";
const body=s=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(s);assert.ok(m,'PERIOD_CLASSIFICATION_QA_FUNCTION_BODY_REQUIRED');return m[2];};
// pg_get_functiondef uses SET ... TO in its preface. The existing fixture
// relocator recognizes SET ... =; normalize only that preface, never prosrc.
const functionPreface=s=>{
 if(!/^\s*CREATE(?: OR REPLACE)? FUNCTION\b/i.test(s))return s;
 const marker=/\bAS\s+\$[\w]*\$/.exec(s);assert.ok(marker,'PERIOD_CLASSIFICATION_QA_FUNCTION_BODY_REQUIRED');
 const header=s.slice(0,marker.index)
  .replaceAll("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp')
  .replaceAll('SET "TimeZone" TO \'UTC\'',"SET timezone='UTC'");
 return header+s.slice(marker.index);
};
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'PERIOD_CLASSIFICATION_QA_READY_ANCHOR_CHANGED: '+a);return s.replace(a,()=>b);};
const sourceHashes=(read)=>Object.fromEntries(Object.entries(files).map(([p,expected])=>{const observed=hash(lf(read(p)));assert.equal(observed,expected,'PERIOD_CLASSIFICATION_QA_FIXTURE_SOURCE_CHANGED: '+p);return[p,observed];}));

export function buildOwnPeriodClassificationQaRelocation(options){
 assert.ok(options&&typeof options==='object');assert.ok(Object.keys(options).every(k=>['read','sourceCommit','schema','relocate','batch'].includes(k)),'PERIOD_CLASSIFICATION_QA_UNKNOWN_OPTION');
 const{read,sourceCommit,schema,relocate,batch}=options;
 assert.equal(typeof read,'function');assert.equal(typeof relocate,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'PERIOD_CLASSIFICATION_QA_SCHEMA_REQUIRED');
 const fixtureSourceHashes=sourceHashes(read),live=batch??buildOwnPeriodClassificationInstallation({read,sourceCommit});
 assert.equal(live.sourceCommit,sourceCommit);assert.equal(live.connects,false);assert.equal(live.executesSql,false);
 const beforeLive=live.beforePins.find(p=>p.name==='municipal_adoption_ready_v1'),afterLive=live.afterConsumerPins.find(p=>p.name==='municipal_adoption_ready_v1');
 assert.equal(beforeLive.sha256,'c4546ebd3e2dacfff29aad1edfea16b6dc4061774598110e7b10c58f264fdb08');
 assert.equal(live.beforePins.length,6);assert.equal(live.newPins.length,22);assert.equal(live.afterPins.length,28);
 const priorReadySource=buildOwnPeriodParticipationSql({read,sourceCommit}).changed.find(s=>s.includes('FUNCTION public.municipal_adoption_ready_v1('));
 const beforeSourcePin=ownInstallationFunctionPin(priorReadySource);
 assert.equal(beforeSourcePin.sha256,'a8240fc907a5f4091b673a438f10207c19db49985cc5edf392c454c8683e74b6','PERIOD_CLASSIFICATION_QA_READY_SOURCE_CHANGED');
 assert.deepEqual({...beforeSourcePin,sha256:null},{...beforeLive,sha256:null});
 const salaryPrior=splitPostgresStatements(lf(read('scripts/migrations/138-adopted-fixed-novelties.sql'))).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim()).find(s=>s.startsWith('CREATE FUNCTION public.payroll_fixed_registry_adopted_subject_v1('));assert.ok(salaryPrior);
 const salaryAfter=live.lifecyclePrerequisiteDefinitions[0];assert.ok(salaryAfter?.startsWith('CREATE FUNCTION public.payroll_fixed_registry_adopted_subject_v1('));
 const priorSalaryPin={...ownInstallationFunctionPin(salaryPrior),runtime:false},afterSalaryPin={...ownInstallationFunctionPin(salaryAfter),runtime:false};
 assert.equal(priorSalaryPin.sha256,'83b3f8944c437424ed97ba277094af4a68d4b14af197e9371223eedb40d5f4fa');
 assert.equal(afterSalaryPin.sha256,'47aa5dda0e474a3efa9279d526d86855d670dce0f0c47097cd6d97e7e4e32672');
 assert.deepEqual({...priorSalaryPin,sha256:null},{...afterSalaryPin,sha256:null},'PERIOD_CLASSIFICATION_QA_PREDECESSOR_METADATA_CHANGED');
 assert.deepEqual(afterSalaryPin,live.prerequisitePins.find(p=>p.name===afterSalaryPin.name));
 // This old synthetic chain predates the published salary jurisdiction guard.
 // Its known readiness already pins47aa. Adapt only the old function, before
 // installing177, and keep that readiness byte-for-byte. Never substitute
 // its83b3 hash for the production47aa prerequisite.
 assert.ok(!priorReadySource.includes(priorSalaryPin.sha256),'PERIOD_CLASSIFICATION_QA_READY_PREDECESSOR_CHANGED');
 assert.equal(priorReadySource.split(afterSalaryPin.sha256).length,2,'PERIOD_CLASSIFICATION_QA_READY_SALARY_PIN_CHANGED');
 const beforeSource=priorReadySource;
 let afterSource=beforeSource;
 for(const [name,prior]of[
  ['own_run_capture_v1','18061aa38556ee715edf0413b9583cd8717d58717c1cfa0ff24fddc8c778ff6d'],
  ['own_close_roster_v1','aa89d27c43d147d9150f141522350445d3ef6e48203f88b63531992b3945d84d'],
  ['own_run_jurisdictions_v1','dab6d819db8c361600b7676787c1a8deb7fd01939edc938f97558d627e0fb93a'],
  ['payroll_fixed_registry_range_v2','30afb71e97988bd4862d98d3d56d84603252bbb600812d5f40c63a5596a69546'],
 ]){
  const current=live.afterConsumerPins.find(p=>p.name===name);assert.ok(current);
  afterSource=once(afterSource,prior,current.sha256);
 }
 // Same canonicalization used by the existing namespace/seniority/participation
 // verifier: the fixture hardens one old search_path, while all checks survive.
 const canonical=s=>s.replaceAll('search_path=pg_catalog, '+schema+', public, pg_temp','search_path=pg_catalog, public, pg_temp').replaceAll(schema,'public');
 const priorReadyDefinition=relocate(functionPreface(priorReadySource)),priorFixtureReadySha256=hash(body(canonical(priorReadyDefinition)));
 const beforeDefinition=relocate(functionPreface(beforeSource)),afterDefinition=relocate(functionPreface(afterSource));
 for(const definition of[beforeDefinition,afterDefinition]){
  assert.ok(definition.includes('FUNCTION '+schema+'.municipal_adoption_ready_v1('));
  for(const marker of['ADOPTED_CONSUMERS_AFTER_METADATA','SQL130_NEW_OBJECTS_NOT_EMPTY','own_close_roster_v1','own_run_jurisdictions_v1','own_run_capture_v1','payroll_fixed_registry_range_v2'])assert.ok(definition.includes(marker),'PERIOD_CLASSIFICATION_QA_READY_GUARD_LOST: '+marker);
 }
 const fixtureBeforeSha256=hash(body(canonical(beforeDefinition))),fixtureAfterSha256=hash(body(canonical(afterDefinition)));
 assert.notEqual(fixtureBeforeSha256,fixtureAfterSha256);
 const map=s=>relocate(functionPreface(s)).replaceAll(beforeLive.sha256,fixtureBeforeSha256).replaceAll(afterLive.sha256,fixtureAfterSha256);
 const beforeCheck=map(live.beforeCheck),afterCheck=map(live.afterCheck);
 const mutations=live.mutations.map(s=>s.includes('FUNCTION public.municipal_adoption_ready_v1(')?afterDefinition:map(s));
 assert.equal(mutations.length,live.mutations.length);assert.equal(mutations.filter(s=>s.includes('FUNCTION '+schema+'.municipal_adoption_ready_v1(')).length,1);
 const guard="DO $fixture_only$ BEGIN IF current_database()<>'own_payroll_run_qa' OR current_setting('neon.project_id',true) IS NOT NULL OR current_setting('neon.branch_id',true) IS NOT NULL THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_QA_ONLY';END IF;END $fixture_only$";
 const predecessorBeforeCheck=relocate(pinsCheck([priorSalaryPin,{...beforeLive,sha256:priorFixtureReadySha256}],'PERIOD_CLASSIFICATION_QA_PREDECESSOR_CHANGED'));
 const predecessorAfterCheck=relocate(pinsCheck([afterSalaryPin,{...beforeLive,sha256:fixtureBeforeSha256}],'PERIOD_CLASSIFICATION_QA_PREDECESSOR_AFTER_CHANGED'));
 const predecessorMutations=[relocate(functionPreface(salaryAfter.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION ')))];
 const predecessorPrefix='municontrol_period_classification_qa_predecessor.';
 const predecessorIds=q(priorSalaryPin.signature)+'::regprocedure';
 const predecessorSnapshot=slot=>{
  let s=preservationSnapshot(slot).replaceAll('municontrol_sql111.',predecessorPrefix);
  s=once(s,"public.digest(to_jsonb(p)::text,'sha256')","public.digest((CASE WHEN p.oid IN("+predecessorIds+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");
  s=once(s," AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'');
  const priorTableExclusion=" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";assert.equal(s.split(priorTableExclusion).length,3);s=s.replaceAll(priorTableExclusion,'');
  return relocate(s);
 };
 const predecessorAudit="DO $predecessor_audit$ BEGIN IF current_setting('"+predecessorPrefix+"before')::jsonb IS DISTINCT FROM current_setting('"+predecessorPrefix+"after')::jsonb THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_QA_PREDECESSOR_STATE_CHANGED';END IF;END $predecessor_audit$";
 const predecessorProof="SELECT jsonb_build_object('version','own-period-classification-qa-predecessor.v1','sourceCommit',"+q(sourceCommit)+",'productionCompatible',false,'priorSubjectSha256',"+q(priorSalaryPin.sha256)+",'afterSubjectSha256',"+q(afterSalaryPin.sha256)+",'adaptedFunctions',1,'permissionChanges',0,'businessWrites',0,'nominalRowsReturned',0,'preserved',true,'beforeFingerprint',encode(public.digest(current_setting('"+predecessorPrefix+"before'),'sha256'),'hex'),'afterFingerprint',encode(public.digest(current_setting('"+predecessorPrefix+"after'),'sha256'),'hex')) AS proof";
 const predecessor={version:'own-period-classification-qa-predecessor.v1',productionCompatible:false,priorSalaryPin,afterSalaryPin,priorFixtureReadySha256,beforeCheck:predecessorBeforeCheck,afterCheck:predecessorAfterCheck,mutations:predecessorMutations,statements:[guard,predecessorBeforeCheck,predecessorSnapshot('before'),...predecessorMutations,predecessorAfterCheck,predecessorSnapshot('after'),predecessorAudit,predecessorProof],verification:[guard,predecessorAfterCheck],connects:false,executesSql:false};
 const choose="DO $choose$ BEGIN IF current_setting('municontrol_period_classification.mode')='install' THEN EXECUTE "+q(beforeCheck)+";ELSE EXECUTE "+q(afterCheck)+";END IF;END $choose$";
 const apply="DO $apply$ BEGIN IF current_setting('municontrol_period_classification.mode')='install' THEN "+mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')+"IF(SELECT count(*) FROM "+schema+".own_period_classification_event)<>0 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_NEW_TABLE_NOT_EMPTY';END IF;END IF;END $apply$";
 const statements=live.statements.map(s=>s===live.choose?choose:s===live.apply?apply:s===live.afterCheck?afterCheck:map(s));
 statements.unshift(guard);
 const verification=[guard,...live.verification.map(s=>s===live.afterCheck?afterCheck:map(s))];
 return{fixtureChain:OWN_PERIOD_CLASSIFICATION_QA_FIXTURE_CHAIN,productionCompatible:false,normal165Installed:false,finalSourceFixture:false,sourceCommit,sourceHashes:live.sourceHashes,fixtureSourceHashes,liveBeforeReadinessSha256:beforeLive.sha256,fixtureBeforeSha256,fixtureAfterSha256,beforeDefinition,afterDefinition,beforeCheck,afterCheck,mutations,statements,verification,predecessor,connects:false,executesSql:false};
}
