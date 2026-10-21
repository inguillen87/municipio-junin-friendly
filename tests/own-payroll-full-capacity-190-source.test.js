import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ownFullCapacity190SourceProjection as p} from './fixtures/own-payroll-full-capacity-190-source-projection.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),hash=value=>createHash('sha256').update(value).digest('hex');

test('Vercel bundle retains every pinned full-capacity source while private inputs stay excluded',()=>{
 const rules=read('.vercelignore').split(/\r?\n/).map(rule=>rule.trim()).filter(rule=>rule&&!rule.startsWith('#'));
 const included=file=>{let keep=true;for(const rule of rules){const neg=rule.startsWith('!'),pattern=neg?rule.slice(1):rule;if(pattern.endsWith('/')?file.startsWith(pattern):path.matchesGlob(file,pattern)||!pattern.includes('/')&&path.matchesGlob(path.basename(file),pattern))keep=neg;}return keep;};
 for(const file of Object.keys({...p.candidatePins,...p.dependencies}))assert.ok(included(file),'Build dependency excluded: '+file);
 for(const file of ['.handoff/result.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/result.json','source.sql','source.sql.gz','private.backup_2026100115_plataforma.sql.gz'])assert.equal(included(file),false,file);
});
test('M7 source bytes pin the exact canonical190 overlay and admitted source dependencies',()=>{
 for(const[file,digest]of Object.entries({...p.candidatePins,...p.dependencies}))assert.equal(hash(fs.readFileSync(new URL('../'+file,import.meta.url))),digest,file);
});

test('the reviewed calculation draft guard is the only change from its previously pinned panel',()=>{
 const source=read('assets/own-payroll-run-panel.js'),after='else if(!suspendedPreparation&&!attempt&&access&&hasOwnRunAccess(access.caps,OWN_RUN_NOMINAL))suspendedPreparation=preparationDraft();',before='else if(!attempt&&access&&hasOwnRunAccess(access.caps,OWN_RUN_NOMINAL))suspendedPreparation=preparationDraft();';
 assert.equal(source.split(after).length,2,'the reviewed guard must occur exactly once');
 assert.equal(hash(source.replace(after,before)),'5705172114c625dd2ad657ed3ba32c714e869866e230c83389910378a7d358ed','all other panel bytes must retain the previously admitted source');
});
test('trusted full transport leaves every other190 source byte equal to its parent',()=>{
 let source=read('scripts/verify-municipal-owner-program.mjs').replace(/\r\n/g,'\n');
 const changes=[
  ["import {prepareOwnerProgramQaContinuation} from './lib/owner-program-qa-continuation-preparation.mjs';\n",''],
  ['export async function verifyMunicipalOwnerProgram(options,{continuation=null,continuationEntries=[],prepareContinuation=null}={}){','export async function verifyMunicipalOwnerProgram(options,{continuation=null,continuationEntries=[]}={}){'],
  [" assert.ok(prepareContinuation===null||typeof prepareContinuation==='function','OWNER_PROGRAM_QA_PREPARATION_INVALID');assert.ok(prepareContinuation===null||continuation!==null,'OWNER_PROGRAM_QA_PREPARATION_REQUIRES_CONTINUATION');\n",''],
  [' const preparedContinuation=prepareOwnerProgramQaContinuation(prepareContinuation,{qa,major,sourceCommit,read});\n',''],
  ['...continuationEntries,...preparedContinuation.sourceEntries','...continuationEntries'],
  ['   let continuationResult=null;if(continuation){','  let continuationResult=null;if(continuation){'],
  ['destination,prepared:preparedContinuation.context,json:','destination,json:'],
  ["expectRollback:(statements,code,options={})=>{assert.match(code,/^[A-Z][A-Z0-9_]{2,80}$/,'OWNER_PROGRAM_QA_EXPECTED_CODE_INVALID');return run(tx(statements,{...options,end:'ROLLBACK'}),code);},readFullSnapshot:snapshot,setPhase:value=>{assert.equal(typeof value,'string');phase=value;},",''],
  ["const run=(sql,expected,{fullJson=false}={})=>{assert.equal(typeof fullJson,'boolean','OWNER_PROGRAM_QA_FULL_PROFILE_INVALID');",'const run=(sql,expected)=>{'],
  ['maxBuffer:fullJson===true?40*1024*1024:20*1024*1024','maxBuffer:20*1024*1024'],
  ["json:(statements,{fullJson=false,...options}={})=>{assert.equal(typeof fullJson,'boolean','OWNER_PROGRAM_QA_FULL_PROFILE_INVALID');return run(tx(statements,options),undefined,{fullJson});}",'json:(statements,options={})=>run(tx(statements,options))']
 ];
 for(const[after,before]of changes){assert.equal(source.split(after).length,2);source=source.replace(after,()=>before);}assert.equal(hash(source),p.parentRunnerLfSha256);
});
test('M7 uses the existing190 caller, fixed published107 and whole201R4 after separate200 admission',()=>{
 const wrapper=read('scripts/verify-own-payroll-full-capacity.mjs'),install=read('scripts/lib/own-payroll-full-capacity-190-installation.mjs');
 assert.equal((wrapper.match(/await verifyMunicipalOwnerProgram\(/g)??[]).length,1);assert.ok(wrapper.includes('continuation:runOwnFullCapacity190Continuation'));assert.ok(wrapper.includes("operationalPairBaseline:'published107'"));
 assert.ok(install.includes('graph.pool.get(p.signature+\'|\'+p.bodySha256)'));assert.ok(install.includes("assert.equal(pre.items.length,11);assert.equal(post.items.length,27)"));assert.ok(install.includes('statements:[keep.before,local,keep.after,keep.compare,keep.proof]'));
 assert.ok(install.indexOf('const installed=h.json(plan.censusStatements)')<install.indexOf('fullRehearsal=h.json(plan.statements'));assert.ok(install.includes('verification:[postflight,keep.after,keep.proof]'));
 const later=install.slice(install.indexOf('const fullInstalled='));assert.ok(!later.includes('plan.censusVerification'));assert.ok(!/child_process|spawn\(|execFile\(|ownerAdoptionQaTransport\(/.test(install));
});
test('855 lifecycle uses actual IAM, preserves the current programme and keeps runtime JSON opaque',()=>{
 const source=read('scripts/lib/own-payroll-full-capacity-190-continuation.mjs'),rpc=read('scripts/lib/own-payroll-full-capacity-190-rpc.mjs');
 const binding=source.slice(source.indexOf('function bind('),source.indexOf('function access('));assert.ok(!binding.includes('qa.normalized'));assert.ok(binding.includes('const statement=text'));assert.ok(rpc.includes("text.replace('public.'+entry.name,schema+'.'+entry.name).replace("));
 for(const value of['buildOwnReportCensus190IamFixture','ownerProgramQaAccess','tenant_membership_capability_override','M7_190_EXISTING_APPROVED_EVOLUTION_REQUIRED','M7_190_REAL_PERIOD_BINDING_REQUIRED','M7_CAPACITY_LITERAL_ADDITIONS_COUNT','length:855','native_employee_create_v1','17100','QA_M7_CAPACITY_LATE_ANNUL_FAULT','reopenedCensus.sourceVersion,closedCensus.sourceVersion'])assert.ok(source.includes(value),value);
 assert.ok(!/FROM capabilities|DELETE FROM capabilities|INSERT INTO capabilities/.test(source));assert.ok(!/ALTER.*DISABLE|CREATE SCHEMA|CREATE DATABASE|ownerAdoptionQaTransport\(/.test(source));
 assert.ok(source.includes("'SELECT own_annul_command_full_v1('+j(qa.checker)"));assert.ok(source.includes('assert.deepEqual(reopenedCensus.events.map(e=>e.id).sort(),[closed.id,reopened.id].sort())'));
 const workflow=read('.github/workflows/own-payroll-full-capacity.yml');for(const value of['pg: [17, 18]','--transport=ci','--operational-pair-baseline=published107','--source-commit=${{ github.sha }}','--output=verification/own-full-capacity-pg${{ matrix.pg }}','own-full-capacity-pg${{ matrix.pg }}-published107-${{ github.sha }}'])assert.ok(workflow.includes(value),value);
});

test('the real literal helper keeps18 exact references in the frozen runtime closure and focal precision proof',()=>{
 const source=read('scripts/lib/own-payroll-full-capacity-190-continuation.mjs'),literal=read('scripts/lib/own-payroll-capacity-literal-additions.mjs'),pure=read('tests/own-payroll-capacity-literal-additions.test.js'),wrapper=read('scripts/verify-own-payroll-full-capacity.mjs'),workflow=read('.github/workflows/own-payroll-full-capacity.yml');
 assert.ok(source.includes("import {ownCapacityLiteralAdditions} from './own-payroll-capacity-literal-additions.mjs';"));
 assert.ok(source.includes("const additions=ownCapacityLiteralAdditions();assert.equal(additions.length,18,'M7_CAPACITY_LITERAL_ADDITIONS_COUNT');"));
 for(const token of ["import {rule, lit} from '../../tests/fixtures/own-payroll-synthetic.js';",'export function ownCapacityLiteralAdditions()',"Array.from({length: 18}, (_, n) => rule(String(700 + n), lit('1.00', 'money'),","rounding: {precision: 2, mode: 'exact'}","ruleReference: 'Caso inventado M7 ' + String(n + 1)"])assert.ok(literal.includes(token),token);
 for(const file of ['scripts/lib/own-payroll-capacity-literal-additions.mjs','tests/own-payroll-capacity-literal-additions.test.js']){assert.ok(wrapper.includes("'"+file+"'"),file);assert.ok(Object.hasOwn(p.candidatePins,file),file);assert.ok(workflow.slice(workflow.indexOf('path: |')).includes(file),file);}
 for(const token of ['requireExactProgramChanges(before, oldCandidate)','requireExactProgramChanges(before, candidate)','assert.equal(next.length, 18)','assert.equal(new Set(next.map(value => value.code)).size, 18)',"assert.deepEqual(next[n].expression, {op: 'literal', value: '1.00', unit: 'money'})",'assert.equal(exact.employeeCount, 855)','assert.equal(exact.rowCount, 17100)',"assert.equal(employee.net, '118.20')","error.code === 'ROUNDING_NEEDED'"])assert.ok(pure.includes(token),token);
 const focal=/run: node --test ([^\n]+)/.exec(workflow);assert.ok(focal);assert.ok(focal[1].split(/\s+/).includes('tests/own-payroll-capacity-literal-additions.test.js'));
});

test('every continuation entry satisfies the unchanged exact190 entry guard',()=>{
 const wrapper=read('scripts/verify-own-payroll-full-capacity.mjs'),runner=read('scripts/verify-municipal-owner-program.mjs'),match=/const entries=\[([\s\S]*?)\];/.exec(wrapper);assert.ok(match);
 const entries=[...match[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);assert.ok(entries.length>0);
 assert.ok(runner.includes("Array.isArray(continuationEntries)&&continuationEntries.every(value=>typeof value==='string'&&!value.startsWith('.')&&!value.includes('..'))"));
 assert.ok(Array.isArray(entries)&&entries.every(value=>typeof value==='string'&&!value.startsWith('.')&&!value.includes('..')),'the real190 guard must admit every declared continuation entry');
 assert.ok(!entries.includes('.github/workflows/own-payroll-full-capacity.yml'));assert.ok(Object.hasOwn(p.candidatePins,'.github/workflows/own-payroll-full-capacity.yml'),'workflow stays pinned separately as non-runtime source metadata');
});

test('the joint CI entry shares the existing190 foundation and unchanged855 continuation without claiming monthly business coverage',()=>{
 const source=read('scripts/verify-own-monthly-payroll-full-capacity.mjs'),host=read('scripts/verify-municipal-owner-program.mjs'),wrapper=read('scripts/verify-own-payroll-full-capacity.mjs');
 assert.ok(source.includes("import {OWN_FULL_CAPACITY_190_QA_ENTRIES} from './verify-own-payroll-full-capacity.mjs'"));
 assert.ok(wrapper.includes('export {entries as OWN_FULL_CAPACITY_190_QA_ENTRIES};'));
 assert.ok(source.includes('foundation: h.qa'));assert.ok(source.includes('schema: h.qa.schema'));
 for(const token of ['assert.strictEqual(monthly.qa192.qa, h.qa','assert.strictEqual(monthly.actor, h.qa.actor','assert.strictEqual(monthly.checker, h.qa.checker','sourceEntries: Object.keys(monthly.sourceHashes)','prepareContinuation: prepareMonthly, continuation: monthlyThenFull','monthlyBusinessCovered: false','capacity.population, 855','capacity.conceptRows, 17100'])assert.ok(source.includes(token),token);
 assert.equal((source.match(/await runOwnFullCapacity190Continuation\(h\)/g)??[]).length,1);
 assert.equal((source.match(/await verifyMunicipalOwnerProgram\(/g)??[]).length,1);
 assert.ok(!/buildOwnerProgramQa\(|ownerAdoptionQaTransport\(|CREATE SCHEMA|CREATE DATABASE|capabilitySeed/.test(source));
 assert.ok(!/(?:h\.)?(?:json|expectRollback)\([^;\n]*(?:\.seed\b|predecessorInstallation|qa\.local\.installation)/.test(source),'the joint entry must not execute another foundation seed or installation');
 for(const token of ["h.qa.seed, h.qa.predecessorInstallation.join(';\\n'), h.qa.local.installation.join(';\\n')",'h.qa.foundation.foundation.foundation.owner.definitions','monthly.qa193.foundation.base.definitions, monthly.qa193.foundation.seed','expected: monthly.batch.declaration.prerequisitePins','assertOwnMonthlyDaySharedPrerequisites({','nativeExecutionProven, false'])assert.ok(source.includes(token),token);
 assert.ok(source.indexOf('verifyOwnMonthlyDayTechnicalEpochs({')<source.indexOf('await runOwnFullCapacity190Continuation(h)'));
 assert.ok(host.indexOf('const preparedContinuation=prepareOwnerProgramQaContinuation(')<host.indexOf('const sourceClosure='));
 assert.ok(host.includes('...continuationEntries,...preparedContinuation.sourceEntries'));
 assert.ok(host.includes("run(tx(statements,{...options,end:'ROLLBACK'}),code)"));
 assert.ok(host.includes('readFullSnapshot:snapshot'));assert.ok(host.includes('prepared:preparedContinuation.context'));
});

test('normal full-capacity CI selects the shared entry while the independent monthly four-cell business flow stays declared',()=>{
 const workflow=read('.github/workflows/own-payroll-full-capacity.yml'),monthly=read('.github/workflows/own-monthly-day-engine-source.yml');
 const commands=[...workflow.matchAll(/run: node (scripts\/verify-[^\n]+)/g)].map(match=>match[1]);
 assert.deepEqual(commands,['scripts/verify-own-payroll-annulment-v2-full-capacity.mjs --major=${{ matrix.pg }} --transport=ci --source-commit=${{ github.sha }} --operational-pair-baseline=published107 --output=verification/own-full-capacity-pg${{ matrix.pg }}']);
 for(const file of ['tests/own-payroll-full-capacity-190-source.test.js','tests/own-payroll-capacity-literal-additions.test.js','tests/owner-program-qa-continuation-preparation.test.js','tests/own-monthly-day-qa-foundation.test.js','tests/own-monthly-day-technical-epochs.test.js','tests/own-monthly-day-shared-prerequisites.test.js'])assert.ok(workflow.includes(file),file);
 for(const file of ['scripts/lib/own-payroll-capacity-literal-additions.mjs','scripts/verify-own-monthly-payroll-full-capacity.mjs','scripts/verify-municipal-owner-program.mjs','scripts/verify-own-monthly-day-engine-source.mjs','scripts/lib/owner-program-qa-continuation-preparation.mjs','scripts/lib/own-monthly-day-qa-foundation.mjs','scripts/lib/own-monthly-day-technical-epochs.mjs','scripts/lib/own-monthly-day-shared-prerequisites.mjs'])assert.ok(workflow.slice(workflow.indexOf('path: |')).includes(file),file);
 assert.ok(monthly.includes('pg: [17, 18]'));assert.ok(monthly.includes('operational_pair_baseline: [pre107, published107]'));
 assert.ok(monthly.includes('node scripts/verify-own-monthly-day-engine-source.mjs --fixed-composition=196 --novelty-succession=197'));
 assert.ok(monthly.includes('--operational-pair-baseline=${{ matrix.operational_pair_baseline }}'));
});


test('208 and209 CI opt-ins preserve the fixed monthly default and do not claim a complete municipal circuit',()=>{
 const entry=read('scripts/verify-own-payroll-annulment-v2-full-capacity.mjs'),monthly=read('scripts/verify-own-monthly-payroll-full-capacity.mjs'),workflow=read('.github/workflows/own-payroll-full-capacity.yml');
 assert.equal((entry.match(/await verifyMunicipalOwnerProgram\(/g)??[]).length,1);
 for(const token of ["import {OWN_MONTHLY_FULL_CAPACITY_QA_ENTRIES,prepareOwnMonthlyFullCapacity,continueOwnMonthlyFullCapacity} from './verify-own-monthly-payroll-full-capacity.mjs';",'...OWN_MONTHLY_FULL_CAPACITY_QA_ENTRIES','prepareContinuation:prepareOwnMonthlyFullCapacity','continuation:h=>continueOwnMonthlyFullCapacity(h,{annulmentV2Browser:true,annulmentPreparation:true})',"operationalPairBaseline:'published107'"])assert.ok(entry.includes(token),token);
 for(const token of ['async function monthlyThenFull(h, settings = {})','Reflect.ownKeys(settings).every(key => key === \'annulmentV2Browser\' || key === \'annulmentPreparation\')','const annulmentPreparation = Object.hasOwn(settings, \'annulmentPreparation\') ? settings.annulmentPreparation : false',"assert.equal(typeof annulmentV2Browser, 'boolean')",'? await runOwnFullCapacity190Continuation(h, {annulmentV2Browser: true, annulmentPreparation})',': await runOwnFullCapacity190Continuation(h);','entries as OWN_MONTHLY_FULL_CAPACITY_QA_ENTRIES, prepareMonthly as prepareOwnMonthlyFullCapacity, monthlyThenFull as continueOwnMonthlyFullCapacity','prepareContinuation: prepareMonthly, continuation: monthlyThenFull'])assert.ok(monthly.includes(token),token);
 assert.ok(!/buildOwnerProgramQa\(|ownerAdoptionQaTransport\(|CREATE SCHEMA|CREATE DATABASE|capabilitySeed|\.\.\.settings/.test(entry));
 for(const token of ['report.priorDatabasePreserved,true','report.syntheticSchemaRemoved,true','report.sourceAfter?.passed,true','report.continuation?.monthlyTechnical?.passed,true','report.continuation?.capacity?.passed,true','report.continuation?.capacity?.population,855','report.continuation?.capacity?.conceptRows,17100','tail?.passed,true','tail.actualSql,true','tail.browser?.passed,true','tail.browser.actualHttp,true','tail.browser.fullAnnulmentBrowserProven,true','tail.browser.fullCapacityBrowserProven,false','tail.browser.receiptToPreparationBrowserProven,false','report.continuation.monthlyBusinessCovered,false','report.productionWrites,0','report.municipalAcceptance,false','completeMunicipalCircuit:false','monthlyBusiness:false'])assert.ok(entry.includes(token),token);
 const declared=/const entries=\[([\s\S]*?)\];/.exec(entry);assert.ok(declared);const entries=[...declared[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
 assert.ok(entries.length>0);assert.ok(entries.every(file=>!file.startsWith('.')&&!file.includes('..')),'every208 entry must pass the unchanged190 runtime source guard');
 assert.ok(!entries.includes('.github/workflows/own-payroll-full-capacity.yml'),'the workflow is metadata, never a runtime continuation entry');
 const artifacts=workflow.slice(workflow.indexOf('path: |'));
 for(const file of [
  'scripts/verify-own-payroll-annulment-v2-full-capacity.mjs',
  'scripts/lib/own-payroll-annulment-review-v2-installation.mjs',
  'scripts/lib/own-payroll-annulment-v2-native-continuation.mjs',
  'scripts/lib/own-payroll-annulment-v2-native-browser.mjs',
  'scripts/migrations/208-own-annulment-review-index.sql',
  'api/internal-own-payroll-annulment.js',
  'lib/internal-own-payroll-annulment.js',
  'assets/own-payroll-annulment-review-model.js',
  'assets/own-payroll-annulment-panel.js',
  'assets/own-payroll-run-panel.js',
  'tests/fixtures/own-payroll-annulment-review-synthetic.js',
  'tests/own-payroll-annulment-review-api.test.js',
  'tests/own-payroll-annulment-review-service.test.js',
  'tests/own-payroll-annulment-review.test.js',
  'tests/own-payroll-annulment-hidden-active.test.js',
  'scripts/lib/own-payroll-annulment-preparation-209-installation.mjs',
  'scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs',
  'scripts/lib/own-annulment-preparation-209-actors-fixture.mjs',
  'scripts/migrations/209-own-annulment-preparation-projection.sql',
  'api/internal-own-payroll-annulment-preparation.js',
  'lib/internal-own-payroll-annulment-preparation.js',
  'assets/own-payroll-annulment-preparation-model.js',
  'assets/own-payroll-annulment-preparation-link.js',
  'tests/fixtures/own-payroll-annulment-preparation-synthetic.js',
  'tests/own-payroll-annulment-preparation-model.test.js',
  'tests/own-payroll-annulment-preparation-service.test.js',
  'tests/own-payroll-annulment-preparation-api.test.js',
  'tests/own-payroll-annulment-preparation-link.test.js',
  'tests/own-payroll-annulment-preparation-panel.test.js',
  'tests/own-payroll-annulment-preparation-ui-source.test.js',
  'tests/fixtures/own-payroll-annulment-preparation-source-projection.js',
  'tests/own-payroll-full-decision-capacity-source.test.js',
 ])assert.ok(artifacts.split(/\r?\n/).some(line=>line.trim()===file),file);
 for(const file of ['scripts/verify-own-payroll-annulment-v2-full-capacity.mjs','scripts/lib/own-payroll-annulment-review-v2-installation.mjs','scripts/lib/own-payroll-annulment-v2-native-continuation.mjs','scripts/lib/own-payroll-annulment-v2-native-browser.mjs','scripts/migrations/208-own-annulment-review-index.sql','assets/own-payroll-annulment-review-model.js','tests/own-payroll-annulment-review-api.test.js','tests/own-payroll-annulment-review-service.test.js','tests/own-payroll-annulment-review.test.js','tests/own-payroll-annulment-hidden-active.test.js','scripts/lib/own-payroll-annulment-preparation-209-installation.mjs','scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs','scripts/lib/own-annulment-preparation-209-actors-fixture.mjs','scripts/migrations/209-own-annulment-preparation-projection.sql','api/internal-own-payroll-annulment-preparation.js','lib/internal-own-payroll-annulment-preparation.js','assets/own-payroll-annulment-preparation-model.js','assets/own-payroll-annulment-preparation-link.js','tests/fixtures/own-payroll-annulment-preparation-synthetic.js','tests/own-payroll-annulment-preparation-model.test.js','tests/own-payroll-annulment-preparation-service.test.js','tests/own-payroll-annulment-preparation-api.test.js','tests/own-payroll-annulment-preparation-link.test.js','tests/own-payroll-annulment-preparation-panel.test.js','tests/own-payroll-annulment-preparation-ui-source.test.js','tests/fixtures/own-payroll-annulment-preparation-source-projection.js','tests/own-payroll-full-decision-capacity-source.test.js'])assert.ok(entries.includes(file),file);
 assert.ok(!/^[ \t]+\.handoff\//m.test(artifacts),'private continuity is never uploaded');
});
