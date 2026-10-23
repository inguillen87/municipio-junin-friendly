import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ownFullCapacity190SourceProjection as p} from './fixtures/own-payroll-full-capacity-190-source-projection.js';
import {OWN_ANNUL_OUTCOME_SOURCE_PINS,projectOwnAnnulOutcomeToHead,OWN_ANNUL_OUTCOME_208_SOURCE_PINS,projectOwnAnnulOutcome208ToHead,OWN_ANNULMENT29_SOURCE_PINS,projectOwnAnnulment29SourceToParent,OWN_CLOSE_BROWSER_SOURCE_PINS,projectOwnCloseBrowserSourceToParent,OWN_CLOSE_BROWSER_CONSUMER_SOURCE_PINS,projectOwnCloseBrowserConsumerSourceToParent,OWN_NOVELTY197_ALIAS_SOURCE_PINS,projectOwnNovelty197AliasSourceToParent,OWN_CLAUDE209_HANDOFF_SOURCE_PINS,OWN_CLAUDE209_HANDOFF_NEW_SOURCE_PINS,projectOwnClaude209HandoffSourceToParent,OWN_INDIVIDUAL_HANDOFF_SOURCE_PINS,projectOwnIndividualHandoffSourceToParent} from './fixtures/own-payroll-annulment-preparation-source-projection.js';
const read=file=>projectOwnD7ArtifactWorkflowToParent(file,projectOwnClaude209HandoffSourceToParent(file,projectOwnIndividualHandoffSourceToParent(file,fs.readFileSync(new URL('../'+file,import.meta.url),'utf8')))),hash=value=>createHash('sha256').update(value).digest('hex');
// Inert workflow custody only. Existing source guards receive their exact9e6 parent.
function projectOwnD7ArtifactWorkflowToParent(file,value){
 if(file!=='.github/workflows/own-payroll-full-capacity.yml')return value;
 assert.equal(Buffer.byteLength(value,'utf8'),7434,'D7_ARTIFACT_WORKFLOW_BYTES');
 assert.equal(hash(value),'517373ba398ab1507cd7882a8d161ecba19dde94e0b4baa57899b10e43db6c71','D7_ARTIFACT_WORKFLOW_SHA');
 const entry='            scripts/lib/own-payroll-annulment-preparation-209-native-browser.mjs\n';
 assert.equal(value.split(entry).length,2,'D7_ARTIFACT_EXACT_ENTRY_REQUIRED');
 const parent=value.replace(entry,'');
 assert.equal(Buffer.byteLength(parent,'utf8'),7353,'D7_ARTIFACT_PARENT_BYTES');
 assert.equal(hash(parent),'9e6a9d9e75a4c8452209d3dd0da750fc1c822d4f6e111e5179098b7f9619eb14','D7_ARTIFACT_COMPLETE_PARENT');
 return parent;
}

test('Vercel bundle retains every pinned full-capacity source while private inputs stay excluded',()=>{
 const rules=read('.vercelignore').split(/\r?\n/).map(rule=>rule.trim()).filter(rule=>rule&&!rule.startsWith('#'));
 const included=file=>{let keep=true;for(const rule of rules){const neg=rule.startsWith('!'),pattern=neg?rule.slice(1):rule;if(pattern.endsWith('/')?file.startsWith(pattern):path.matchesGlob(file,pattern)||!pattern.includes('/')&&path.matchesGlob(path.basename(file),pattern))keep=neg;}return keep;};
 for(const file of Object.keys({...p.candidatePins,...p.dependencies}))assert.ok(included(file),'Build dependency excluded: '+file);
 for(const file of ['.handoff/result.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/result.json','source.sql','source.sql.gz','private.backup_2026100115_plataforma.sql.gz'])assert.equal(included(file),false,file);
});
test('M7 source bytes pin the exact canonical190 overlay and admitted source dependencies',()=>{
 for(const[file,digest]of Object.entries({...p.candidatePins,...p.dependencies}))assert.equal(hash(fs.readFileSync(new URL('../'+file,import.meta.url))),digest,file);
});

test('phase-text source admission changes only the reviewed test entry in the canonical monthly runner',()=>{
 const source=read('scripts/verify-own-monthly-day-engine-source.mjs'),entry="'tests/own-monthly-day-engine-source-phase-text.test.js',";
 assert.equal(source.split(entry).length,2,'the reviewed source entry must occur exactly once');
 assert.equal(hash(source.replace(entry,'')),'02d0239ba2f0bb101985257021710c7f1bd31a26181ca87caca4635eb5364726','every other canonical runner byte must retain the admitted predecessor');
});

test('reviewed calculation presentation and draft guard recover their exact previously pinned panel',()=>{
 let source=read('assets/own-payroll-run-panel.js');
 const changes=[
  ["ownRunWorkspaceCsv,formatOwnRunDecimal,formatOwnRunValue}","ownRunWorkspaceCsv,formatOwnRunDecimal}"],
  ["r.employeeNumber,r.conceptCode+' · '+(view.labelOf(r)??'Descripción no conservada en la captura'),OWN_RUN_NATURES[r.nature],formatOwnRunValue(r.amount,r.unit),r.ruleReference","r.employeeNumber,r.conceptCode,OWN_RUN_NATURES[r.nature],formatOwnRunDecimal(r.amount,r.unit==='money')+(r.unit==='money'?'':' · '+r.unit),r.ruleReference"]
 ];
 for(const[after,before]of changes){
  assert.equal(source.split(after).length,2,'each reviewed presentation change must occur exactly once');
  source=source.replace(after,before);
 }
 assert.equal(hash(source),'fdd49abc260b5ca278958771611f9e84fa089631644cad9069d107d1cce26e3f','presentation inverses must recover the exact admitted P0 panel');
 const after='else if(!suspendedPreparation&&!attempt&&access&&hasOwnRunAccess(access.caps,OWN_RUN_NOMINAL))suspendedPreparation=preparationDraft();',before='else if(!attempt&&access&&hasOwnRunAccess(access.caps,OWN_RUN_NOMINAL))suspendedPreparation=preparationDraft();';
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

test('registered annulment outcome sources recover exact05031ab before209 and208/full transport without weakening their whole-source guards',()=>{
 const beforePins={
  'assets/own-payroll-annulment-panel.js':'cadab6e28e5a664f119d3d590efb1cbeff33686a103982d7b9bb9d830d410c99',
  'assets/own-payroll-annulment-review-model.js':'fae1416085d1b49bda6fca2039962a9f4e8f05dd0ec575eb50260454c51d912d',
  'tests/own-payroll-annulment-review.test.js':'d76253308c06713f86e75ea186368ba0ea63fdd50e9f72dd9be2a518e3b90cf7'
 };
 assert.deepEqual(Object.keys(OWN_ANNUL_OUTCOME_SOURCE_PINS).sort(),Object.keys(beforePins).sort());
 for(const[file,digest]of Object.entries(beforePins)){
  const source=read(file),pin=OWN_ANNUL_OUTCOME_SOURCE_PINS[file];
  assert.equal(pin.before,digest,file+' exact05031ab ancestor');
  assert.equal(hash(source),pin.after,file+' whole candidate');
  assert.equal(hash(projectOwnAnnulOutcomeToHead(file,source)),digest,file+' complete outcome inverse');
  assert.throws(()=>projectOwnAnnulOutcomeToHead(file,source+' '),assert.AssertionError,file+' whole-source mismatch must reject');
 }
});

test('canonical208 QA source reverses exactR2 and reviewedR1 before the unchanged public208 source; appended bytes reject without importing208',()=>{
 const expected={
  'scripts/lib/own-payroll-annulment-v2-native-browser.mjs':{before:'ab12aa395f712400843a0a70fcd6db2d6b45c0188acd3703f03c4f4c545af24e',reviewedR1:'29748f03853a2272572434f3784af2557042705035174d13a520bd5971543545',after:'bba93c75b0b8095cd97acfd90a66387a70bab7c6dba8fade3c81381abb49a472'},
  'scripts/lib/own-payroll-annulment-v2-native-continuation.mjs':{before:'909dc8084015ec937b94eeb7e031d113a92bda26767bdf7e88cbd483482fecd9',reviewedR1:'5012ca314c5e286348fefcdb4b0f15fa46702c11fe3a7f624bdd4f9dc3662a30',after:'5ac17d7261e45010c9851b8fb962fe8e5b6e03af1523a190e26765723565f122'}
 };
 assert.deepEqual(OWN_ANNUL_OUTCOME_208_SOURCE_PINS,expected);
 for(const[file,pin]of Object.entries(expected)){
  const source=projectOwnAnnulment29SourceToParent(file,read(file));assert.equal(hash(source),pin.after,file+' selectedR2 whole source');
  assert.equal(hash(projectOwnAnnulOutcome208ToHead(file,source)),pin.before,file+' complete two-epoch inverse');
  assert.throws(()=>projectOwnAnnulOutcome208ToHead(file,source+' '),assert.AssertionError,file+' appended208 bytes must reject as source, never execute');
 }
});

test('separate29 sources recover their exact80b99 parents before the unchanged208 R2/R1 chain; extra bytes reject without importing any QA',()=>{
 const expected={
  'scripts/lib/own-payroll-annulment-v2-native-browser.mjs':{before:'bba93c75b0b8095cd97acfd90a66387a70bab7c6dba8fade3c81381abb49a472',after:'7971eea8333e9835adc58e03c4d977837763509b3dd280d89ddf3f27e997f781'},
  'scripts/lib/own-payroll-annulment-v2-native-continuation.mjs':{before:'5ac17d7261e45010c9851b8fb962fe8e5b6e03af1523a190e26765723565f122',after:'d1256108192967f6c1cbaaf9264d8a8b36e58d11bf87c81f57a56071df7b063e'},
  'scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs':{before:'3301a251da59ed655f4d2e8c61df0868070568418cba3282cd64e61d5821f36e',after:'6c76b32d52fe8e2465dc1390257db996b188f2bd03c047d306353f74789a37bd'},
  'scripts/verify-own-payroll-annulment-v2-full-capacity.mjs':{before:'43fb1609653705d24a62433a8e4a2e28afcd90916e59f583bbd9461933d5d9fe',after:'39612895ad26772e411c3f27043d3df64c696097ec31010b30b99b7a53d9f3d2'}
 };
 const afterSelected208Projection={
  'scripts/lib/own-payroll-annulment-v2-native-browser.mjs':'ab12aa395f712400843a0a70fcd6db2d6b45c0188acd3703f03c4f4c545af24e',
  'scripts/lib/own-payroll-annulment-v2-native-continuation.mjs':'909dc8084015ec937b94eeb7e031d113a92bda26767bdf7e88cbd483482fecd9',
  'scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs':'3301a251da59ed655f4d2e8c61df0868070568418cba3282cd64e61d5821f36e',
  'scripts/verify-own-payroll-annulment-v2-full-capacity.mjs':'43fb1609653705d24a62433a8e4a2e28afcd90916e59f583bbd9461933d5d9fe'
 };
 assert.deepEqual(OWN_ANNULMENT29_SOURCE_PINS,expected);
 for(const[file,pin]of Object.entries(expected)){
  const source=projectOwnCloseBrowserConsumerSourceToParent(file,projectOwnNovelty197AliasSourceToParent(file,read(file)));assert.equal(hash(source),pin.after,file+' selected29 whole source');
  const parent=projectOwnAnnulment29SourceToParent(file,source);
  assert.equal(hash(parent),pin.before,file+' exact80b99 selected parent');
  assert.equal(hash(projectOwnAnnulOutcome208ToHead(file,parent)),afterSelected208Projection[file],file+' ordered29 then selected208 R2/R1 source custody');
  assert.throws(()=>projectOwnAnnulment29SourceToParent(file,source+' '),assert.AssertionError,file+' appended29 bytes reject before parent projection');
 }
});

test('close browser sources retain exact selected190 parents, independent new-file pins and prior accounting projections without importing browser QA',()=>{
 const expected={"scripts/lib/own-payroll-full-capacity-190-continuation.mjs":{"before":"4271a0ecb062848c8635b5e65ffaea6deb95aad5b30172a9cce021e17b53f6d3","after":"ff73b91aa144c9a39fc77d9b380974c1870473e3ee01330e478fd7a5a78886a6"},"scripts/verify-own-payroll-full-capacity.mjs":{"before":"92bcf4f71d93ccad9943a671811c1986e6d0b7172f1d414158937b8f0d0e0e00","after":"86f57a555d5c53539a41a481fffcb1206792b97703b066c6335cb697cb97fbd4"},"scripts/lib/own-annulment-preparation-209-actors-fixture.mjs":{"before":"e7e7b754d80cab939973511128067ee4e8202715ba8513a396c504bc9e349f3c","after":"7bc54fa600f47b0e7c56e99810b92914d2dd50ec5cf5cca889a72d120c58ea36"}};
 assert.deepEqual(OWN_CLOSE_BROWSER_SOURCE_PINS,expected);
 for(const[file,pin]of Object.entries(expected)){
  const source=read(file);assert.equal(hash(source),pin.after,file+' selected close source');
  assert.equal(hash(projectOwnCloseBrowserSourceToParent(file,source)),pin.before,file+' complete selected parent');
  assert.throws(()=>projectOwnCloseBrowserSourceToParent(file,source+' '),assert.AssertionError,file+' appended close bytes reject');
 }
 const consumerFile='scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs',consumer=projectOwnNovelty197AliasSourceToParent(consumerFile,read(consumerFile));
 const consumerPins={'scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs':{before:'6c76b32d52fe8e2465dc1390257db996b188f2bd03c047d306353f74789a37bd',after:'cbd2793901881665fb910c8ee31b68f27ea411652a7151884427787ce889e311'}};
 assert.deepEqual(OWN_CLOSE_BROWSER_CONSUMER_SOURCE_PINS,consumerPins,'the new domain owns only the exact native209 consumer');
 assert.equal(hash(consumer),consumerPins[consumerFile].after,'consumer retains the selected close actor source');
 assert.equal(hash(projectOwnCloseBrowserConsumerSourceToParent(consumerFile,consumer)),consumerPins[consumerFile].before,'native209 recovers complete selected29 before its earlier expected map');
 assert.throws(()=>projectOwnCloseBrowserConsumerSourceToParent(consumerFile,consumer+' '),assert.AssertionError,'extra consumer bytes reject before all ancestor guards');
 const browser=read('scripts/lib/own-payroll-close-native-browser.mjs'),style=read('assets/own-payroll-close-panel.css');
 assert.equal(hash(browser),'1c32672ef8f973b82be6cdd7c2a4935bbf8a320aab6a996d3d4d57a442ef77fc','new browser is pinned independently, not projected into a nonexistent original');
 assert.equal(hash(style),'25457df604fa7371e6012c074a0d62b3bb44d98cd0b274c211ab5c8161a55a0f','built close stylesheet is retained in the exact source bookend');
 assert.equal(Object.hasOwn(OWN_CLOSE_BROWSER_SOURCE_PINS,'scripts/lib/own-payroll-close-native-browser.mjs'),false,'new browser has no fabricated predecessor');
 assert.equal(hash(projectOwnCloseBrowserSourceToParent('scripts/lib/own-payroll-close-native-browser.mjs',browser)),hash(browser),'unknown projection domain never deletes a new file');
 const entry=read('scripts/verify-own-payroll-full-capacity.mjs');
 for(const file of ['scripts/lib/own-payroll-close-native-browser.mjs','assets/own-payroll-close-panel.css']){assert.ok(entry.includes("'"+file+"'"),file+' finite runtime source entry');assert.equal(p.candidatePins[file],hash(read(file)),file+' full source pin');}
 const source=read('scripts/lib/own-payroll-full-capacity-190-continuation.mjs');
 assert.ok(source.includes("import {verifyOwnCloseBrowserOn190} from './own-payroll-close-native-browser.mjs';"));
 assert.ok(source.indexOf('const closeBrowser=await verifyOwnCloseBrowserOn190')>source.indexOf('const baselineReport='));
 assert.ok(source.indexOf('const closeBrowser=await verifyOwnCloseBrowserOn190')<source.indexOf('const context=Object.freeze'));
 assert.ok(source.includes('baselineSnapshot:closeBrowserSnapshot'));
 assert.ok(source.includes('assert.equal(closeBrowser.finalCloseEvents,6)'));
});

// Literal source custody only: no197 SQL/parser, constructor or QA module is imported.
test('alias-only197 and its full-source readers recover exact closeR2/base parents before all historical domains; appended bytes reject',()=>{
 const expected={"scripts/migrations/197-own-novelty-succession.sql":{"before":"de81915cb3b17df45f9906072f8125e23f19e462ef61e881057f757a519f9eb4","after":"13ad516bfd653a03b5fae8987486abeef1c13a5d629264b0c680d57c5a5bb43c"},"scripts/lib/own-novelty-succession-installation.mjs":{"before":"5d6e7a52307c7ec3cc28ee56941a255e60c88b8238c909eefca869c0e4c801bb","after":"627ffea8e252311f31b87abe46346bd76578e583de34b606a74aa53eacb494d0"},"scripts/lib/own-payroll-annulment-review-v2-installation.mjs":{"before":"e5673a20f7547cc7bb6060715920b4dccfc1713f3ef9f6844f1a86840f921fd8","after":"da780e1f3cb426e2f9d189ac98fbab22f5f61e7cd99eb313eab320390fc93344"},"scripts/lib/own-payroll-annulment-preparation-209-installation.mjs":{"before":"a81fd29b59897191fca9c5dd4f7c2a9b0cd3ca02c5315ba6ec07d0a5fc5997b8","after":"36cc80c2828c9d508d99d3dc07bdc1832de83ce6d0f4bd6b2097abb5358a65a3"},"scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs":{"before":"cbd2793901881665fb910c8ee31b68f27ea411652a7151884427787ce889e311","after":"84ffdc4bd1d0c280c6d7a3058d8983d2239d1d5d80f8d14aa2dfadabed23a3c5"}};
 assert.deepEqual(OWN_NOVELTY197_ALIAS_SOURCE_PINS,expected);
 for(const[file,pin]of Object.entries(expected)){
  const source=read(file);assert.equal(hash(source),pin.after,file+' complete197 alias candidate');
  assert.equal(hash(projectOwnNovelty197AliasSourceToParent(file,source)),pin.before,file+' complete selected closeR2/base parent');
  assert.throws(()=>projectOwnNovelty197AliasSourceToParent(file,source+' '),assert.AssertionError,file+' appended bytes reject before ancestry');
 }
 const native=read('scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs');
 assert.ok(native.includes("'scripts/lib/own-annulment-preparation-209-actors-fixture.mjs':'7bc54fa600f47b0e7c56e99810b92914d2dd50ec5cf5cca889a72d120c58ea36'"),'the selected close actor pin is preserved');
 assert.ok(native.includes("'scripts/lib/own-payroll-annulment-preparation-209-installation.mjs':'36cc80c2828c9d508d99d3dc07bdc1832de83ce6d0f4bd6b2097abb5358a65a3'"),'the real full-source209 installer hash is selected');
 for(const file of ['scripts/migrations/197-own-novelty-succession.sql','scripts/lib/own-novelty-succession-installation.mjs'])assert.equal(p.candidatePins[file],hash(read(file)),file+' explicit finite source pin');
});

test('Claude209 source custody recovers complete197 parents before all prior domains; new browser has an independent exact pin',()=>{
 const expected={"assets/own-payroll-run-panel.js":{"before":"a00d19a57d3774767bbc62de0d148a7adc705d0bb27b01c2f524a05f7bc440f4","after":"cc00a75b28f4afbb5fa6438f0ef85e65cdef708bb9bda848e190aa84b87aff9b"},"tests/own-payroll-annulment-preparation-panel.test.js":{"before":"47441ba51a51cb312589ac6ca68cd884ef726eca0ad800686a95fb0820a1afee","after":"5c0108f187d4463cfc66d5a97e79afad708bd690cfc5f35ad23de42d88f39663"},"scripts/lib/own-payroll-annulment-v2-native-browser.mjs":{"before":"7971eea8333e9835adc58e03c4d977837763509b3dd280d89ddf3f27e997f781","after":"df8765da8a10c6fd5f2a008c4a74a04d9ab4232639de9023988018d161286c92"},"scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs":{"before":"84ffdc4bd1d0c280c6d7a3058d8983d2239d1d5d80f8d14aa2dfadabed23a3c5","after":"2f5e1d8bff67a4c1c18482e2ddbe4e7c0e3e8bf2b596959fb7bdd0794f7229ff"},"scripts/lib/own-payroll-annulment-v2-native-continuation.mjs":{"before":"d1256108192967f6c1cbaaf9264d8a8b36e58d11bf87c81f57a56071df7b063e","after":"4a9b2eec8c45419af7f9c370a6bd2e391c89c7e4006fec5cae803853dc57cc57"},"scripts/verify-own-payroll-annulment-v2-full-capacity.mjs":{"before":"39612895ad26772e411c3f27043d3df64c696097ec31010b30b99b7a53d9f3d2","after":"1d611b0e175fd884d70cef9d99bda8a355fcac9b83a1146cce7a6c92ef2f955b"}};
 const newSources={"scripts/lib/own-payroll-annulment-preparation-209-native-browser.mjs":{"sha256":"d7d754ebafbe07b2c76282f7c9807eb8dbb290689f416c7119d4f83cb8ddc659","bytes":28952}};
 assert.deepEqual(OWN_CLAUDE209_HANDOFF_SOURCE_PINS,expected);
 assert.deepEqual(OWN_CLAUDE209_HANDOFF_NEW_SOURCE_PINS,newSources);
 const current=file=>projectOwnIndividualHandoffSourceToParent(file,fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 for(const[file,pin]of Object.entries(expected)){
  const source=current(file);assert.equal(hash(source),pin.after);
  assert.equal(hash(projectOwnClaude209HandoffSourceToParent(file,source)),pin.before);
  assert.throws(()=>projectOwnClaude209HandoffSourceToParent(file,source+' '),/CLAUDE209_HANDOFF_SOURCE_BYTES/);
 }
 for(const[file,pin]of Object.entries(newSources)){const source=fs.readFileSync(new URL('../'+file,import.meta.url));assert.equal(source.length,pin.bytes);assert.equal(hash(source),pin.sha256);}
});
// This is a finite source contract; it neither parses YAML nor starts a workflow.
test('D7 source artifact preserves the complete workflow parent before every previous source guard',()=>{
 const file='.github/workflows/own-payroll-full-capacity.yml',source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const entry='            scripts/lib/own-payroll-annulment-preparation-209-native-browser.mjs\n';
 assert.equal(hash(source),'517373ba398ab1507cd7882a8d161ecba19dde94e0b4baa57899b10e43db6c71');
 assert.equal(source.split(entry).length,2);
 assert.ok(source.slice(source.indexOf('path: |')).includes(entry),'the exact D7 source is an artifact input');
 assert.equal(hash(projectOwnD7ArtifactWorkflowToParent(file,source)),'9e6a9d9e75a4c8452209d3dd0da750fc1c822d4f6e111e5179098b7f9619eb14');
 assert.equal(hash(read(file)),'9e6a9d9e75a4c8452209d3dd0da750fc1c822d4f6e111e5179098b7f9619eb14','older guards retain the complete original workflow');
 assert.throws(()=>projectOwnD7ArtifactWorkflowToParent(file,source+' '),/D7_ARTIFACT_WORKFLOW_BYTES/);
 assert.equal(projectOwnD7ArtifactWorkflowToParent('assets/unknown-source.js',source),source,'a distinct source is never projected as a workflow');
});

// Only filesystem bytes are read; none of the13 product/test modules is imported.
test('individual handoff13 has exact raw pins and complete590 parents before H0, with byte tampering rejected',()=>{
 const expected={"assets/own-payroll-annulment-panel.js":{"before":"feb82ec69cf2f1c1bc16b6999a6c5621d42caa376bfe99661115ff10fb1687e5","after":"f7d3c250d654fe17e6ca921ec0e3667bcb46ea7fc4f6203fc60ee2506b8ffbe5"},"assets/own-payroll-annulment-preparation-link.js":{"before":"7cda5c1507fb6fdc65fb2757326a4cbd42e9baa26e1b694d60cf0564a23f5b4f","after":"491412e6140a5e61af27e5af80f4ad1e4197e8f87500fc952ff5551dd9f9e98a"},"assets/own-payroll-annulment-review-model.js":{"before":"0deb7c1a52c65b437e982bb7daa3b79c58c53962e05e23a16ead4484bde7ce1d","after":"b673b603c748ec3ab45a2e8594b0d4a837e83532d00de5e317b1da22ff9b8d9b"},"assets/own-payroll-liquidation-model.js":{"before":"a2a4d20e2741e6afdf2dbe178417dd7164904585ce506760a69225e5cd11ab91","after":"0e973eb78222c15ee5327af50d3c14ef933e598bc888608a2687a84ecbf7e93d"},"assets/own-payroll-liquidation-panel.js":{"before":"886692d1f4a7c536bc7a983ad528d902f0f17d1ebf8d56f88f5b544cfb381a08","after":"c0cca01d24949776d9302694b3204b84b9f1da5fbeab87f681b1f6e7c85612e6"},"assets/own-payroll-run-panel.js":{"before":"cc00a75b28f4afbb5fa6438f0ef85e65cdef708bb9bda848e190aa84b87aff9b","after":"bd436dc3f1dc000d3f89a94df924b9f7fb826dc8764ff1cdbe5589e5d936a1b1"},"assets/payroll-navigation.js":{"before":"771686c4d4da942a6369d2b3fc50d27b3e2c8d06609b470bd7f88bbc405acc09","after":"ae02527ca046a6572555ff64a80a0bdf58ca705bf405f4ea73f3c671d76aeb60"},"tests/own-payroll-annulment-hidden-active.test.js":{"before":"3ed8c682628906d914f9d5e41d6f6400f3b202f8246be90d6c36a2caa64626b6","after":"5eca53c5584d441ae3d74a119170bf757fe92bb2154866e181aceb0feb0e7542"},"tests/own-payroll-annulment-preparation-link.test.js":{"before":"67557e9f6a72bd855a1eead91ddc1dc6cd05e79506a43c362ce42ad89628de74","after":"0a7e639a3fd40c282117a603e337a5eb5d4bad91c03c38c38f1055c30e789f69"},"tests/own-payroll-annulment-preparation-panel.test.js":{"before":"5c0108f187d4463cfc66d5a97e79afad708bd690cfc5f35ad23de42d88f39663","after":"d4be44a48e685c38791a99265a982c61337224624064ba791f7c27cbc6a38a67"},"tests/own-payroll-annulment-review.test.js":{"before":"3d3a6469ba39ad4fa8c9b23f4e9544cb846b538d4d30eca5997e7134de60d007","after":"b5ad2ae663a9a45642c1e2d13d2f433c96c9a01ac56db5a77f1babfad672be1a"},"tests/own-payroll-individual.test.js":{"before":"732214646d257bdc16481f65b2c746788ffb94a67a94469b37120dcebd5c0de2","after":"d2893a9289f21b313544f5309484fa9a2bc28e7284264a9e6d5f2e7975602d46"},"tests/own-payroll-comparison-labels.test.js":{"before":"753afc33ff147a2d48362718dc37d9b12e91f4f3ab3d614c42c2459199d4c042","after":"984b9ec1765c5bd6e5f9f753bd35266978317660302e0abf16656a2a86d02c0c"}};
 assert.equal(Object.keys(expected).length,13);
 assert.deepEqual(OWN_INDIVIDUAL_HANDOFF_SOURCE_PINS,expected);
 for(const[file,pin]of Object.entries(expected)){
  const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.equal(hash(source),pin.after,file+' selected whole source');
  assert.equal(p.candidatePins[file],pin.after,file+' explicit raw candidate pin');
  const parent=projectOwnIndividualHandoffSourceToParent(file,source);
  assert.equal(hash(parent),pin.before,file+' complete590 before every older source layer');
  assert.equal(read(file),projectOwnClaude209HandoffSourceToParent(file,parent),file+' individual layer precedes H0');
  assert.throws(()=>projectOwnIndividualHandoffSourceToParent(file,source+' '),/INDIVIDUAL_HANDOFF_SOURCE_BYTES/);
  const tampered=Buffer.from(source,'utf8');tampered[0]^=1;
  assert.throws(()=>projectOwnIndividualHandoffSourceToParent(file,tampered.toString('utf8')),/INDIVIDUAL_HANDOFF_WHOLE_SOURCE_PIN/);
 }
 const foreign='assets/unknown-individual-source.js',value='unrelated source';
 assert.equal(projectOwnIndividualHandoffSourceToParent(foreign,value),value,'a distinct path never acquires a fabricated predecessor');
});

test('the actual individual handoff source retires both reference visibility and value without live nominal access',()=>{
 const file='assets/own-payroll-liquidation-panel.js',source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const guard="const handoff=receipt?.body.command==='annul'&&can(OWN_LIQ_NOMINAL);";
 const requireRetirement=value=>{
  assert.ok(value.includes('const live=()=>active&&!stopped&&!document.hidden&&host.isConnected,can=caps=>live()&&hasOwnRunAccess(access?.caps,caps);'),'access must remain live and nominal');
  assert.equal(value.split(guard).length,2,'one reviewed nominal handoff guard');
  assert.ok(value.includes("$('handoff').hidden=!handoff;"),'reference section retires');
  assert.ok(value.includes("$('decision-link').value=handoff?new URL(ownLiquidationDecisionLink(receipt.runId,receipt.id),location.origin).href:'';"),'reference value clears');
  assert.ok(value.includes("$('copy-link').disabled=busy||!handoff||!can(OWN_LIQ_NOMINAL);"),'copy retains its own live nominal guard');
 };
 requireRetirement(source);
 assert.throws(()=>requireRetirement(source.replace(guard,"const handoff=receipt?.body.command==='annul'&&!!access;")),assert.AssertionError,'copy-disabled alone does not retire the reference and its value');
});
