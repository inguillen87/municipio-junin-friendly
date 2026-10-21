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
 for(const name of['own_run_capture_v1','own_close_roster_v1','own_run_jurisdictions_v1','payroll_fixed_registry_range_v2']){
  const p=batch.afterConsumerPins.find(p=>p.name===name);assert.ok(artifact.afterDefinition.includes(p.sha256));
 }
});

test('the artifact preserves all mutations and requires the existing synthetic destination',()=>{
 assert.equal(artifact.connects,false);assert.equal(artifact.executesSql,false);
 assert.equal(artifact.statements.length,batch.statements.length+1);assert.equal(artifact.verification.length,batch.verification.length+1);
 assert.equal(artifact.mutations.length,batch.mutations.length);
 assert.equal(batch.beforePins.length,6);assert.equal(batch.afterConsumerPins.length,6);assert.equal(batch.newPins.length,22);assert.equal(batch.afterPins.length,28);
 assert.equal(batch.beforePins.find(p=>p.name==='payroll_fixed_registry_range_v2').sha256,'30afb71e97988bd4862d98d3d56d84603252bbb600812d5f40c63a5596a69546');
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
 const lifecycle=definitions.find(s=>s.includes('FUNCTION '+qa.schema+'.own_period_classification_lifecycle_subject_v1('));
 const lifecyclePin=sourcePin(lifecycle.replaceAll(qa.schema,'public'));
 assert.equal(lifecyclePin.sha256,batch.newPins.find(p=>p.name==='own_period_classification_lifecycle_subject_v1').sha256);
 assert.equal(lifecyclePin.defaults,'false');
 assert.match(lifecycle,/SET timezone='UTC'/);
 const strict=batch.prerequisitePins.find(p=>p.name==='payroll_fixed_registry_adopted_subject_v1');
 assert.equal(strict.sha256,'47aa5dda0e474a3efa9279d526d86855d670dce0f0c47097cd6d97e7e4e32672');
 assert.ok(artifact.beforeCheck.includes(strict.sha256)&&artifact.afterCheck.includes(strict.sha256));
 assert.ok(!definitions.some(s=>s.includes('FUNCTION '+qa.schema+'.payroll_fixed_registry_adopted_subject_v1(')),'strict salary subject remains an unchanged prerequisite');
});

test('source drift, lost guards and database-derived alternatives are refused',()=>{
 for(const patch of[{schema:'public'},{sourceCommit:'master'},{readyDefinition:'BEGIN NULL;END'},{fixtureBeforeSha256:'a'.repeat(64)},{databaseBody:'BEGIN NULL;END'}])assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,...patch}));
 assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,read:p=>read(p)+(p==='scripts/verify-own-period-participation.mjs'?'\n-- drift':'')}),/FIXTURE_SOURCE_CHANGED/);
 assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,read:p=>read(p)+(p==='scripts/lib/noelia-payroll-circuit-qa.mjs'?'\n-- unreviewed Noelia source drift':'')}),/FIXTURE_SOURCE_CHANGED/);
 assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,relocate:s=>relocate(s).replaceAll('SQL130_NEW_OBJECTS_NOT_EMPTY','lost')}),/READY_GUARD_LOST/);
 assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,batch:{...batch,beforePins:batch.beforePins.map(p=>p.name==='municipal_adoption_ready_v1'?{...p,sha256:'b'.repeat(64)}:p)}}));
});

test('the declared QA predecessor adapts only exact138 salary83 to published47 and preserves the already strict readiness',()=>{
 const p=artifact.predecessor;assert.equal(p.productionCompatible,false);assert.equal(p.connects,false);assert.equal(p.executesSql,false);
 assert.equal(p.priorSalaryPin.sha256,'83b3f8944c437424ed97ba277094af4a68d4b14af197e9371223eedb40d5f4fa');assert.equal(p.afterSalaryPin.sha256,'47aa5dda0e474a3efa9279d526d86855d670dce0f0c47097cd6d97e7e4e32672');
 assert.deepEqual({...p.priorSalaryPin,sha256:null},{...p.afterSalaryPin,sha256:null});assert.equal(p.priorSalaryPin.runtime,false);
 assert.equal(p.mutations.length,1);const definition=p.mutations[0];assert.match(definition,new RegExp('^CREATE OR REPLACE FUNCTION '+qa.schema+'\\.payroll_fixed_registry_adopted_subject_v1\\('));
 assert.equal(sourcePin(definition.replaceAll(qa.schema,'public')).sha256,p.afterSalaryPin.sha256);assert.match(definition,/IF c\.jurisdiction_code IS NULL THEN RAISE EXCEPTION 'PAYROLL_FIXED_JURISDICTION_REQUIRED'/);
 assert.equal(p.priorFixtureReadySha256,artifact.fixtureBeforeSha256);assert.ok(artifact.beforeDefinition.includes(p.afterSalaryPin.sha256));assert.ok(!artifact.beforeDefinition.includes(p.priorSalaryPin.sha256));
 assert.ok(p.beforeCheck.includes(p.priorSalaryPin.sha256)&&p.beforeCheck.includes(p.priorFixtureReadySha256));assert.ok(p.afterCheck.includes(p.afterSalaryPin.sha256)&&p.afterCheck.includes(p.priorFixtureReadySha256));
 assert.match(p.statements[0],/current_database\(\)<>'own_payroll_run_qa'/);assert.match(p.statements[0],/current_setting\('neon.project_id',true\)/);
 assert.match(p.beforeCheck,/aclexplode/);assert.match(p.afterCheck,/has_function_privilege/);
 const snapshots=p.statements.filter(s=>s.includes('DO $snapshot$'));assert.equal(snapshots.length,2);
 for(const s of snapshots){assert.ok(s.includes("to_jsonb(p)-'prosrc'"));assert.ok(s.includes(p.priorSalaryPin.signature.replace('public.',qa.schema+'.')));assert.ok(!s.includes("NOT(s.nspname='"+qa.schema+"' AND p.proname LIKE 'native_leave_%')"));assert.match(s,/'tables',tables/);assert.match(s,/'roles'/);assert.match(s,/'memberships'/);assert.match(s,/'defaultAcl'/);}
 assert.ok(p.statements.some(s=>s.includes('PERIOD_CLASSIFICATION_QA_PREDECESSOR_STATE_CHANGED')));
 assert.ok(!p.mutations.some(s=>s.includes('FUNCTION '+qa.schema+'.municipal_adoption_ready_v1(')));assert.doesNotMatch(p.mutations.join('\n'),/\b(?:GRANT|REVOKE|INSERT INTO|UPDATE public\.|DELETE FROM)\b/);
 assert.equal(batch.prerequisitePins.length,41);assert.equal(batch.prerequisitePins.find(x=>x.name===p.afterSalaryPin.name).sha256,p.afterSalaryPin.sha256);assert.ok(batch.beforeCheck.includes(p.afterSalaryPin.sha256)&&!batch.beforeCheck.includes(p.priorSalaryPin.sha256));
});

test('the QA predecessor refuses altered138, altered strict body, public grants and alternate observed authority',()=>{
 assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,read:p=>read(p)+(p==='scripts/migrations/138-adopted-fixed-novelties.sql'?'\n-- drift':'')}),/FIXTURE_SOURCE_CHANGED/);
 assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,batch:{...batch,lifecyclePrerequisiteDefinitions:batch.lifecyclePrerequisiteDefinitions.map((s,i)=>i===0?s.replace("IF c.jurisdiction_code IS NULL THEN RAISE EXCEPTION 'PAYROLL_FIXED_JURISDICTION_REQUIRED';END IF;",''):s)}}));
 assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,batch:{...batch,prerequisitePins:batch.prerequisitePins.map(p=>p.name==='payroll_fixed_registry_adopted_subject_v1'?{...p,runtime:true}:p)}}));
 assert.throws(()=>buildOwnPeriodClassificationQaRelocation({...options,predecessorDefinition:'BEGIN NULL;END'}),/UNKNOWN_OPTION/);
});
