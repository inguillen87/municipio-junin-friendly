import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildNoeliaCircuitQa} from '../scripts/lib/noelia-payroll-circuit-qa.mjs';
import {buildOwnPeriodClassificationInstallation} from '../scripts/lib/own-period-classification-installation.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {buildOwnPeriodClassificationQaRelocation,OWN_PERIOD_CLASSIFICATION_QA_FIXTURE_CHAIN} from '../scripts/lib/own-period-classification-qa-relocation.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),sourceCommit='aaf35dfe5b9dec5529090607c5ba753f42ba1917';
const qa=buildNoeliaCircuitQa(17),q=s=>"'"+s.replaceAll("'","''")+"'";
const relocate=s=>qa.normalized(s).replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q('search_path=pg_catalog, '+qa.schema+', public, pg_temp')+",'search_path=pg_catalog, public, pg_temp'),"+q(qa.schema)+",'public')");
const batch=buildOwnPeriodClassificationInstallation({read,sourceCommit}),options={read,sourceCommit,schema:qa.schema,relocate,batch};
const artifact=buildOwnPeriodClassificationQaRelocation(options);
const sourcePin=definition=>{
 const marker=/\bAS\s+\$[\w]*\$/.exec(definition);assert.ok(marker);
 return ownInstallationFunctionPin(definition.slice(0,marker.index).replace(/\s+/g,' ')+definition.slice(marker.index));
};

test('fixture readiness is derived from the exact old chain and keeps production prerequisites unchanged',()=>{
 assert.equal(artifact.fixtureChain,OWN_PERIOD_CLASSIFICATION_QA_FIXTURE_CHAIN);assert.equal(artifact.productionCompatible,false);assert.equal(artifact.normal165Installed,false);assert.equal(artifact.finalSourceFixture,false);
 assert.equal(artifact.liveBeforeReadinessSha256,'c4546ebd3e2dacfff29aad1edfea16b6dc4061774598110e7b10c58f264fdb08');
 assert.match(artifact.fixtureBeforeSha256,/^[a-f0-9]{64}$/);assert.match(artifact.fixtureAfterSha256,/^[a-f0-9]{64}$/);assert.notEqual(artifact.fixtureBeforeSha256,artifact.fixtureAfterSha256);
 assert.equal(batch.beforePins.find(p=>p.name==='municipal_adoption_ready_v1').sha256,artifact.liveBeforeReadinessSha256);
 assert.ok(batch.beforeCheck.includes(artifact.liveBeforeReadinessSha256));assert.ok(!batch.beforeCheck.includes(artifact.fixtureBeforeSha256));
 for(const name of['ADOPTED_CONSUMERS_AFTER_METADATA','SQL130_NEW_OBJECTS_NOT_EMPTY'])assert.ok(artifact.beforeDefinition.includes(name)&&artifact.afterDefinition.includes(name));
 for(const name of['own_run_capture_v1','own_close_roster_v1','own_run_jurisdictions_v1']){
  const p=batch.afterConsumerPins.find(p=>p.name===name);assert.ok(artifact.afterDefinition.includes(p.sha256));
 }
});

test('the artifact preserves all mutations and requires the existing synthetic destination',()=>{
 assert.equal(artifact.connects,false);assert.equal(artifact.executesSql,false);
 assert.equal(artifact.statements.length,batch.statements.length+1);assert.equal(artifact.verification.length,batch.verification.length+1);
 assert.equal(artifact.mutations.length,batch.mutations.length);
 assert.match(artifact.statements[0],/current_database\(\)<>'own_payroll_run_qa'/);
 assert.match(artifact.verification[0],/current_setting\('neon.project_id',true\) IS NOT NULL/);
 assert.match(artifact.verification[0],/current_setting\('neon.branch_id',true\) IS NOT NULL/);
 assert.ok(artifact.beforeCheck.includes(artifact.fixtureBeforeSha256));assert.ok(artifact.afterCheck.includes(artifact.fixtureAfterSha256));
 assert.equal(artifact.mutations.filter(s=>s.includes('FUNCTION '+qa.schema+'.municipal_adoption_ready_v1(')).length,1);
 assert.ok(artifact.afterCheck.includes('PERIOD_CLASSIFICATION_FOREIGN_SHAPE'));
 for(const p of batch.prerequisitePins.filter(p=>p.name.startsWith('own_run_complete')))assert.ok(artifact.beforeCheck.includes(p.sha256)&&artifact.afterCheck.includes(p.sha256));
});

test('relocated function metadata matches the checked schema and preserves canonical source bodies',()=>{
 const definitions=artifact.mutations.filter(s=>/^CREATE(?: OR REPLACE)? FUNCTION\b/.test(s));
 assert.equal(definitions.length,batch.afterPins.length);
 for(const definition of definitions){
  const pin=sourcePin(definition.replace('FUNCTION '+qa.schema+'.','FUNCTION public.'));
  const expected=batch.afterPins.find(p=>p.name===pin.name);assert.ok(expected);
  assert.deepEqual(pin.config,expected.config.map(v=>v.startsWith('search_path=')?'search_path=pg_catalog, '+qa.schema+', public, pg_temp':v),pin.name+' search_path/TimeZone');
  for(const attr of['argNames','defaults','resultType','language','returnsSet','strict','definer','volatility'])assert.deepEqual(pin[attr],expected[attr],pin.name+' '+attr);
  if(pin.name==='municipal_adoption_ready_v1')continue; // This older fixture readiness has its own source-derived pin.
  const canonical=sourcePin(definition.replaceAll(qa.schema,'public'));
  assert.equal(canonical.sha256,expected.sha256,pin.name+' body changed');
 }
 const capture=definitions.find(s=>s.includes('FUNCTION '+qa.schema+'.own_run_capture_v1('));
 assert.match(capture,/SET search_path=pg_catalog,[^\n]*,public,pg_temp/);
 assert.match(capture,/SET timezone='UTC'/);
 assert.ok(batch.mutations.find(s=>s.includes('FUNCTION public.own_run_capture_v1(')).includes("SET search_path TO 'pg_catalog', 'public', 'pg_temp'"));
});

test('source drift, lost guards and database-derived alternatives are refused',()=>{
 for(const patch of[{schema:'public'},{sourceCommit:'master'},{readyDefinition:'BEGIN NULL;END'},{fixtureBeforeSha256:'a'.repeat(64)},{databaseBody:'BEGIN NULL;END'}])assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,...patch}));
 assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,read:p=>read(p)+(p==='scripts/verify-own-period-participation.mjs'?'\n-- drift':'')}),/FIXTURE_SOURCE_CHANGED/);
 assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,relocate:s=>relocate(s).replaceAll('SQL130_NEW_OBJECTS_NOT_EMPTY','lost')}),/READY_GUARD_LOST/);
 assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,batch:{...batch,beforePins:batch.beforePins.map(p=>p.name==='municipal_adoption_ready_v1'?{...p,sha256:'b'.repeat(64)}:p)}}));
});
