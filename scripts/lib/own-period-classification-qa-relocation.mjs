// A fixture-only, deterministic artifact. Never reads database bodies or hashes,
// connects, executes SQL, or accepts an alternate production prerequisite.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildOwnPeriodParticipationSql} from './own-period-participation-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {buildOwnPeriodClassificationInstallation} from './own-period-classification-installation.mjs';

export const OWN_PERIOD_CLASSIFICATION_QA_FIXTURE_CHAIN='legacy-native-payroll-without-final-source.v1';
const files=Object.freeze({
 'scripts/lib/own-period-participation-installation.mjs':'2274e017f769ea4b490de36cb473360c26fdd7104fe528bf4fac8e669755b713',
 'scripts/lib/noelia-payroll-circuit-qa.mjs':'228621341050679184566f01c6110435af624d269d730a719c75993764b640f8',
 'scripts/verify-salary-auxiliary-namespace.mjs':'04807f61392adc55e0b3c7ab0ba2a2f3cc5409a0b7d6402dd0fa1f81eee64680',
 'scripts/verify-own-salary-seniority.mjs':'2435a7fde224545dab0f4ce26f16a94a6ffd5f60bd79ad9eb97882915c6cc1e7',
 'scripts/verify-own-period-participation.mjs':'9cdb8083d1f46a03187c7ad6ed8bff171fc20205ed071c3fbfed79bf6d4b2a16',
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
 assert.equal(live.beforePins.length,5);assert.equal(live.newPins.length,21);assert.equal(live.afterPins.length,26);
 const beforeSource=buildOwnPeriodParticipationSql({read,sourceCommit}).changed.find(s=>s.includes('FUNCTION public.municipal_adoption_ready_v1('));
 const beforeSourcePin=ownInstallationFunctionPin(beforeSource);
 assert.equal(beforeSourcePin.sha256,'a8240fc907a5f4091b673a438f10207c19db49985cc5edf392c454c8683e74b6','PERIOD_CLASSIFICATION_QA_READY_SOURCE_CHANGED');
 assert.deepEqual({...beforeSourcePin,sha256:null},{...beforeLive,sha256:null});
 let afterSource=beforeSource;
 for(const [name,prior]of[
  ['own_run_capture_v1','18061aa38556ee715edf0413b9583cd8717d58717c1cfa0ff24fddc8c778ff6d'],
  ['own_close_roster_v1','aa89d27c43d147d9150f141522350445d3ef6e48203f88b63531992b3945d84d'],
  ['own_run_jurisdictions_v1','dab6d819db8c361600b7676787c1a8deb7fd01939edc938f97558d627e0fb93a'],
 ]){
  const current=live.afterConsumerPins.find(p=>p.name===name);assert.ok(current);
  afterSource=once(afterSource,prior,current.sha256);
 }
 // Same canonicalization used by the existing namespace/seniority/participation
 // verifier: the fixture hardens one old search_path, while all checks survive.
 const canonical=s=>s.replaceAll('search_path=pg_catalog, '+schema+', public, pg_temp','search_path=pg_catalog, public, pg_temp').replaceAll(schema,'public');
 const beforeDefinition=relocate(functionPreface(beforeSource)),afterDefinition=relocate(functionPreface(afterSource));
 for(const definition of[beforeDefinition,afterDefinition]){
  assert.ok(definition.includes('FUNCTION '+schema+'.municipal_adoption_ready_v1('));
  for(const marker of['ADOPTED_CONSUMERS_AFTER_METADATA','SQL130_NEW_OBJECTS_NOT_EMPTY','own_close_roster_v1','own_run_jurisdictions_v1','own_run_capture_v1'])assert.ok(definition.includes(marker),'PERIOD_CLASSIFICATION_QA_READY_GUARD_LOST: '+marker);
 }
 const fixtureBeforeSha256=hash(body(canonical(beforeDefinition))),fixtureAfterSha256=hash(body(canonical(afterDefinition)));
 assert.notEqual(fixtureBeforeSha256,fixtureAfterSha256);
 const map=s=>relocate(functionPreface(s)).replaceAll(beforeLive.sha256,fixtureBeforeSha256).replaceAll(afterLive.sha256,fixtureAfterSha256);
 const beforeCheck=map(live.beforeCheck),afterCheck=map(live.afterCheck);
 const mutations=live.mutations.map(s=>s.includes('FUNCTION public.municipal_adoption_ready_v1(')?afterDefinition:map(s));
 assert.equal(mutations.length,live.mutations.length);assert.equal(mutations.filter(s=>s.includes('FUNCTION '+schema+'.municipal_adoption_ready_v1(')).length,1);
 const guard="DO $fixture_only$ BEGIN IF current_database()<>'own_payroll_run_qa' OR current_setting('neon.project_id',true) IS NOT NULL OR current_setting('neon.branch_id',true) IS NOT NULL THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_QA_ONLY';END IF;END $fixture_only$";
 const choose="DO $choose$ BEGIN IF current_setting('municontrol_period_classification.mode')='install' THEN EXECUTE "+q(beforeCheck)+";ELSE EXECUTE "+q(afterCheck)+";END IF;END $choose$";
 const apply="DO $apply$ BEGIN IF current_setting('municontrol_period_classification.mode')='install' THEN "+mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')+"IF(SELECT count(*) FROM "+schema+".own_period_classification_event)<>0 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_NEW_TABLE_NOT_EMPTY';END IF;END IF;END $apply$";
 const statements=live.statements.map(s=>s===live.choose?choose:s===live.apply?apply:s===live.afterCheck?afterCheck:map(s));
 statements.unshift(guard);
 const verification=[guard,...live.verification.map(s=>s===live.afterCheck?afterCheck:map(s))];
 return{fixtureChain:OWN_PERIOD_CLASSIFICATION_QA_FIXTURE_CHAIN,productionCompatible:false,normal165Installed:false,finalSourceFixture:false,sourceCommit,sourceHashes:live.sourceHashes,fixtureSourceHashes,liveBeforeReadinessSha256:beforeLive.sha256,fixtureBeforeSha256,fixtureAfterSha256,beforeDefinition,afterDefinition,beforeCheck,afterCheck,mutations,statements,verification,connects:false,executesSql:false};
}
