import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ownFullCapacity190SourceProjection as p} from './fixtures/own-payroll-full-capacity-190-source-projection.js';
import {OWN_ANNUL_OUTCOME_SOURCE_PINS,projectOwnAnnulOutcomeToHead,OWN_ANNUL_OUTCOME_208_SOURCE_PINS,projectOwnAnnulOutcome208ToHead,OWN_ANNULMENT29_SOURCE_PINS,projectOwnAnnulment29SourceToParent,OWN_CLOSE_BROWSER_SOURCE_PINS,projectOwnCloseBrowserSourceToParent,OWN_CLOSE_BROWSER_CONSUMER_SOURCE_PINS,projectOwnCloseBrowserConsumerSourceToParent,OWN_NOVELTY197_ALIAS_SOURCE_PINS,projectOwnNovelty197AliasSourceToParent,OWN_CLAUDE209_HANDOFF_SOURCE_PINS,OWN_CLAUDE209_HANDOFF_NEW_SOURCE_PINS,projectOwnClaude209HandoffSourceToParent,OWN_INDIVIDUAL_HANDOFF_SOURCE_PINS,projectOwnIndividualHandoffSourceToParent,OWN_CLAUDE124_ENTRY_SOURCE_PINS,OWN_CLAUDE124_NEW_SOURCE_PINS,projectOwnClaude124EntrySourceToParent,OWN_MONETARY_SOURCE_PINS,OWN_MONETARY_NEW_SOURCE_PINS,OWN_MONETARY_REFERENCE_SOURCE_PINS,projectOwnMonetarySourceToParent} from './fixtures/own-payroll-annulment-preparation-source-projection.js';
import {OWN_NATIVE645_CAUSAL_SOURCE_PINS,projectOwnNative645RawSourceToParent} from './fixtures/native645-causal-source-projection.js';
import {OWNER_READER_CALLER_SOURCE_PINS,OWNER_READER_CALLER_NEW_SOURCE_PINS,projectOwnerReaderCallerRawSourceToParent} from './fixtures/owner-reader-callers-source-projection.js';
import {OWN_CURRENT190_UI_SOURCE_PINS,OWN_CURRENT190_UI_NEW_SOURCE_PINS,projectCurrent190UiRawSourceToParent} from './fixtures/current190-ui-source-projection.js';
import {OWN_CURRENT190_REVOCATION_SOURCE_PINS,OWN_CURRENT190_REVOCATION_NEW_SOURCE_PINS,projectCurrent190RevocationRawSourceToParent} from './fixtures/current190-revocation-source-projection.js';
import {OWN_RECEIPT126_CONSUMER_SOURCE_PINS,OWN_RECEIPT126_NEW_SOURCE_PINS,projectReceipt126ConsumerRawSourceToParent} from './fixtures/receipt126-source-consumer-succession.js';
import {OWNER190_NATIVE_OUTCOME_SOURCE_PINS,OWNER190_NATIVE_OUTCOME_NEW_SOURCE_PINS,projectOwner190NativeOutcomeRawSourceToParent} from './fixtures/owner190-native-outcome-source-projection.js';
const owner190OutcomeParentRaw=file=>projectOwner190NativeOutcomeRawSourceToParent(file,fs.readFileSync(new URL('../'+file,import.meta.url)));
const receipt126ParentRaw=file=>projectReceipt126ConsumerRawSourceToParent(file,owner190OutcomeParentRaw(file));
const historicalRaw=(file,encoding)=>{const current=projectOwnerReaderCallerRawSourceToParent(file,projectCurrent190UiRawSourceToParent(file,projectCurrent190RevocationRawSourceToParent(file,receipt126ParentRaw(file)))),parent=projectOwnNative645RawSourceToParent(file,current);assert.ok(encoding===undefined||encoding==='utf8');return encoding?parent.toString('utf8'):parent;};
const read=file=>projectOwnD7ArtifactWorkflowToParent(file,projectOwnClaude209HandoffSourceToParent(file,projectOwnIndividualHandoffSourceToParent(file,projectOwnClaude124EntrySourceToParent(file,projectOwnMonetarySourceToParent(file,historicalRaw(file,'utf8')))))),hash=value=>createHash('sha256').update(value).digest('hex');
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
 const rules=fs.readFileSync(new URL('../.vercelignore',import.meta.url),'utf8').split(/\r?\n/).map(rule=>rule.trim()).filter(rule=>rule&&!rule.startsWith('#'));
 const included=file=>{let keep=true;for(const rule of rules){const neg=rule.startsWith('!'),pattern=neg?rule.slice(1):rule;if(pattern.endsWith('/')?file.startsWith(pattern):path.matchesGlob(file,pattern)||!pattern.includes('/')&&path.matchesGlob(path.basename(file),pattern))keep=neg;}return keep;};
 for(const file of [...Object.keys({...p.candidatePins,...p.dependencies}),'tests/fixtures/native645-causal-source-projection.js','tests/fixtures/owner-reader-callers-source-projection.js','tests/fixtures/current190-ui-source-projection.js','tests/fixtures/current190-revocation-source-projection.js',...Object.keys(OWN_CURRENT190_UI_NEW_SOURCE_PINS),...Object.keys(OWN_CURRENT190_REVOCATION_NEW_SOURCE_PINS),'scripts/lib/owner-qa-source-closure-reader.mjs','tests/owner-qa-source-closure-reader.test.js'])assert.ok(included(file),'Build dependency excluded: '+file);
 for(const file of ['.handoff/result.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/result.json','source.sql','source.sql.gz','private.backup_2026100115_plataforma.sql.gz'])assert.equal(included(file),false,file);
});
test('M7 source bytes pin the exact canonical190 overlay and admitted source dependencies',()=>{
 for(const[file,digest]of Object.entries({...p.candidatePins,...p.dependencies}))assert.equal(hash(historicalRaw(file)),digest,file);
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
 const current=file=>projectOwnIndividualHandoffSourceToParent(file,projectOwnClaude124EntrySourceToParent(file,historicalRaw(file,'utf8')));
 for(const[file,pin]of Object.entries(expected)){
  const source=current(file);assert.equal(hash(source),pin.after);
  assert.equal(hash(projectOwnClaude209HandoffSourceToParent(file,source)),pin.before);
  assert.throws(()=>projectOwnClaude209HandoffSourceToParent(file,source+' '),/CLAUDE209_HANDOFF_SOURCE_BYTES/);
 }
 for(const[file,pin]of Object.entries(newSources)){const source=historicalRaw(file);assert.equal(source.length,pin.bytes);assert.equal(hash(source),pin.sha256);}
});
// This is a finite source contract; it neither parses YAML nor starts a workflow.
test('D7 source artifact preserves the complete workflow parent before every previous source guard',()=>{
 const file='.github/workflows/own-payroll-full-capacity.yml',source=projectOwnClaude124EntrySourceToParent(file,historicalRaw(file,'utf8'));
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
  const rawSource=historicalRaw(file,'utf8');
  assert.equal(hash(rawSource),p.candidatePins[file],file+' selected raw candidate pin before124 projection');
  const source=projectOwnClaude124EntrySourceToParent(file,rawSource);
  assert.equal(hash(source),pin.after,file+' complete4ea individual13 source after124 projection');
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
 const file='assets/own-payroll-liquidation-panel.js',source=historicalRaw(file,'utf8');
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

// Pure filesystem source contracts; no124/host/entry/module is imported.
test('browser124 entry sources recover complete4ea before133 operations and both new modules retain independent raw pins',()=>{
 const expected={"scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs":{"before":"2f5e1d8bff67a4c1c18482e2ddbe4e7c0e3e8bf2b596959fb7bdd0794f7229ff","after":"c8cd92e1e025d9cf7bdccb2b74d25d6d03641bb3e9986563910971a5b6ebee34"},"scripts/verify-own-payroll-annulment-v2-full-capacity.mjs":{"before":"1d611b0e175fd884d70cef9d99bda8a355fcac9b83a1146cce7a6c92ef2f955b","after":"40f902a0f94ebc91fb10f987206326863a82e3d62328b5954bc7a56294eeb40d"},".github/workflows/own-payroll-full-capacity.yml":{"before":"517373ba398ab1507cd7882a8d161ecba19dde94e0b4baa57899b10e43db6c71","after":"f99273a2358d7a45c496181b41878e575cde6e640b3c862765733c47dc646b19"},"tests/own-payroll-annulment-preparation-panel.test.js":{"before":"d4be44a48e685c38791a99265a982c61337224624064ba791f7c27cbc6a38a67","after":"87d62a5a78981e90601de2f526c14b85a576b0e9e00418183edbc37e68913644"}},newSources={"scripts/lib/own-payroll-canonical190-browser-host-qa.mjs":{"sha256":"a9e5cccf1630e97069844436b25dad45227b1121f17a6d16f5c6fcfe333205cc","bytes":9958},"scripts/lib/own-payroll-liquidation-decision-124-native-browser.mjs":{"sha256":"2d2665563af6ede9ac7ce2ada6d7e69f469cb9f26f1b22679b4df94eec501b9a","bytes":30441}};
 assert.equal(Object.keys(expected).length,4);assert.deepEqual(OWN_CLAUDE124_ENTRY_SOURCE_PINS,expected);
 assert.equal(Object.keys(newSources).length,2);assert.deepEqual(OWN_CLAUDE124_NEW_SOURCE_PINS,newSources);
 for(const[file,pin]of Object.entries(expected)){
  const source=historicalRaw(file,'utf8');assert.equal(hash(source),pin.after);assert.equal(p.candidatePins[file],pin.after);
  assert.equal(hash(projectOwnClaude124EntrySourceToParent(file,source)),pin.before,file+' complete4ea source, not a rewritten historical expectation');
  assert.throws(()=>projectOwnClaude124EntrySourceToParent(file,source+' '),/CLAUDE124_ENTRY_SOURCE_BYTES/);
  const changed=Buffer.from(source,'utf8');changed[0]^=1;assert.throws(()=>projectOwnClaude124EntrySourceToParent(file,changed.toString('utf8')),/CLAUDE124_ENTRY_WHOLE_SOURCE_PIN/);
 }
 const requireNew=(file,source,pin)=>{assert.equal(source.length,pin.bytes);assert.equal(hash(source),pin.sha256);assert.equal(p.candidatePins[file],pin.sha256);};
 for(const[file,pin]of Object.entries(newSources)){
  const source=historicalRaw(file);requireNew(file,source,pin);
  assert.equal(Object.hasOwn(OWN_CLAUDE124_ENTRY_SOURCE_PINS,file),false,'new124 modules never acquire a fabricated public parent');
  assert.equal(projectOwnClaude124EntrySourceToParent(file,source.toString('utf8')),source.toString('utf8'));
  assert.throws(()=>requireNew(file,Buffer.concat([source,Buffer.from(' ')]),pin),assert.AssertionError);
 }
 assert.equal(projectOwnClaude124EntrySourceToParent('assets/unknown124.js','distinct source'),'distinct source');
});

test('124 literal reader maps retain the real host, both phases and committed source bookend before SQL without importing them',()=>{
 const current=file=>historicalRaw(file,'utf8');
 const entryFile='scripts/verify-own-payroll-annulment-v2-full-capacity.mjs',hostFile='scripts/lib/own-payroll-canonical190-browser-host-qa.mjs',browserFile='scripts/lib/own-payroll-liquidation-decision-124-native-browser.mjs',nativeFile='scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs';
 const entry=current(entryFile),host=current(hostFile),browser=current(browserFile),native=current(nativeFile),owner=current('scripts/verify-municipal-owner-program.mjs'),authority=current('scripts/verify-municipal-owner-adoption-authority.mjs'),workflow=current('.github/workflows/own-payroll-full-capacity.yml');
 const assets=['assets/own-payroll-liquidation-panel.js','assets/own-payroll-liquidation-model.js','assets/own-payroll-run-panel.js','assets/own-payroll-run-workspace-model.js','assets/own-payroll-annulment-preparation-link.js','assets/payroll-navigation.js','assets/own-payroll-readiness-model.js','assets/own-payroll-response.js','assets/native-salary-catalog-model.js','assets/own-payroll-run-model.js','assets/own-payroll-run-date.js','assets/own-payroll-individual-panel.js'];
 const mapped=(source,pattern)=>{const match=pattern.exec(source);assert.ok(match);return[...match[1].matchAll(/'([^']+)'/g)].map(row=>row[1]);};
 const requireMaps=(entrySource,hostSource,browserSource,nativeSource)=>{
  assert.deepEqual(mapped(entrySource,/const decision124Assets=Object.freeze\(\[([\s\S]*?)\]\);/),assets,'entry asset map');
  assert.deepEqual(mapped(browserSource,/for\(const file of\[([\s\S]*?)\]\)\{/).map(file=>'assets/'+file),assets,'actual browser source/public byte map');
  for(const file of [hostFile,browserFile])assert.ok(entrySource.includes("'"+file+"'"),'literal entry includes '+file);
  for(const token of ['report.sourceBefore.committedBytesVerified,true','report.sourceAfter.rawBytesVerified,true','proof.sourceCommit,report.sourceCommit','proof.major,report.major','proof.sourceBookend.length,12','row.sha256,report.sourceClosure.files[row.path]','individual124.individualDecisionBrowserProven&&blocked124.blockedDecisionBrowserProven','new Map(negatives124.map(row=>[row.name,row]))','individual124.withdrawalNegatives,6','negativeByName124.size,6','blocked124.withdrawalNegatives,0','annulment855:tail.browser.fullAnnulmentBrowserProven','preparation209Native:preparation.receiptToPreparationNativeProven','individualDecision124Browser:preparation.individualDecisionBrowserProven'])assert.ok(entrySource.includes(token),'reader map: '+token);
  assert.ok(hostSource.includes('const actor=byMembership(access.principal);assert.ok(actor,\'CANONICAL190_BROWSER_FOREIGN_PRINCIPAL\');return actor.session;'),'session stays attached to the authorised cookie principal');
  assert.ok(hostSource.includes("const match=String(req.headers?.cookie??'').match(/(?:^|;\\s*)qa_actor=([a-z]+)(?:;|$)/)"),'actor map uses the actual cookie');
  for(const name of ['native_employment_catalog_bootstrap_v1','native_employee_directory_snapshot_v1','own_program_bootstrap_v1','noeliaCircuitRosterRead(text,values,schema)'])assert.ok(hostSource.includes(name),'same four read-only calculation refresh mappings');
  for(const token of ["from './own-payroll-canonical190-browser-host-qa.mjs'",'createCanonical190BrowserHost({h,actors,getSql:async()=>instrumentedDb',"outputName:'liquidation-decision-124-browser-'+phase",'sqlLevelRevocation:false','completeAuthenticationHandler:false','receiptLinkedRecalculationExecuted:false'])assert.ok(browserSource.includes(token),token);
  assert.equal((nativeSource.match(/await verifyOwnLiquidationDecision124BrowserOn190\(/g)??[]).length,2,'two real calls, not an alternate host');
  for(const token of ["reason,phase:'handoff'","reason,phase:'blocked',decisionId:decisionReceipt.id",'const projectionPostIndividual124=await preparation(receipt.id);','assert.deepEqual(post124Unchanged,h1Unchanged);','assertSameOwnAnnulPreparation(projectionPostIndividual124,await preparation(receipt.id));','previous=projectionPostIndividual124;census=decisionCensus;'])assert.ok(nativeSource.includes(token),'phase/epoch map: '+token);
 };
 requireMaps(entry,host,browser,native);
 assert.throws(()=>requireMaps(entry.replace('row.sha256,report.sourceClosure.files[row.path]','row.sha256,row.sha256'),host,browser,native),assert.AssertionError,'observed source cannot replace the committed pre-SQL expectation');
 assert.throws(()=>requireMaps(entry,host.replace('return actor.session;','return access.session;'),browser,native),assert.AssertionError,'the authorised principal/session map cannot be removed');
 assert.throws(()=>requireMaps(entry,host,browser,native.replace("reason,phase:'blocked',decisionId:decisionReceipt.id","reason,phase:'handoff',decisionId:decisionReceipt.id")),assert.AssertionError,'the blocked phase cannot be relabelled as a second handoff');
 assert.ok(owner.includes('entries:[...OWNER_PROGRAM_QA_ENTRIES,...continuationEntries,...preparedContinuation.sourceEntries]'));
 const requireOwnerSourceBookends=source=>{
  const before='const sourceBefore=assertOwnerAuthorityQaSourceBookend(sourceClosure,{committedBytes});',after='const sourceAfter=assertOwnerAuthorityQaSourceBookend(sourceClosure,{committedBytes});',firstSql='const beforeGuard=guard();';
  for(const token of [before,after,firstSql,'if(report)report.sourceAfter=sourceAfter;'])assert.ok(source.includes(token),'actual raw and committed source bookend: '+token);
  assert.ok(source.indexOf(before)<source.indexOf(firstSql),'committed source verification stays before the first SQL guard');
  assert.ok(source.indexOf(after)>source.indexOf(firstSql),'the post-SQL source bookend stays distinct from the preflight');
 };
 requireOwnerSourceBookends(owner);
 assert.throws(()=>requireOwnerSourceBookends(owner.replace('const sourceBefore=assertOwnerAuthorityQaSourceBookend(sourceClosure,{committedBytes});','const sourceBefore=assertOwnerAuthorityQaSourceBookend(sourceClosure);')),assert.AssertionError,'raw bytes alone cannot replace pre-SQL committed bytes');
 assert.throws(()=>requireOwnerSourceBookends(owner.replace('const sourceAfter=assertOwnerAuthorityQaSourceBookend(sourceClosure,{committedBytes});','const sourceAfter=assertOwnerAuthorityQaSourceBookend(sourceClosure);')),assert.AssertionError,'raw bytes alone cannot replace post-SQL committed bytes');
 assert.throws(()=>requireOwnerSourceBookends(owner.replace('const sourceBefore=assertOwnerAuthorityQaSourceBookend(sourceClosure,{committedBytes});','')+'const sourceBefore=assertOwnerAuthorityQaSourceBookend(sourceClosure,{committedBytes});'),assert.AssertionError,'the pre-SQL committed bookend cannot be deferred until after SQL');
 assert.ok(authority.includes('imports=moduleSpecifiers(bytes.toString(\'utf8\'),file)'));assert.ok(authority.includes('bytes.equals(committedBytes(file))'));
 for(const file of [...assets,hostFile,browserFile]){assert.ok(workflow.split(/\r?\n/).some(line=>line.trim()===file),'artifact source '+file);assert.equal(hash(historicalRaw(file)),p.candidatePins[file]??p.dependencies[file],'explicit raw pin '+file);}
 assert.ok(workflow.includes('verification/own-full-capacity-pg${{ matrix.pg }}/'));
 for(const token of ['4*1024*1024','32*1024*1024'])assert.ok(native.includes(token),'existing response budget '+token);
});
test('the two invalid decision variants await their own harness teardown and restore all seven global descriptors',()=>{
 const file='tests/own-payroll-annulment-preparation-panel.test.js',source=historicalRaw(file,'utf8');
 const requireOwnedTeardown=value=>{
  const start=value.indexOf("test('a decision id that belongs to a confirmation or to no contract of the run prepares nothing'"),end=value.indexOf("test('the decision reference survives the login destination",start);
  assert.ok(start>=0&&end>start,'the original invalid-decision parent and following case remain');
  const block=value.slice(start,end),globals=/const globals=\[([^\]]+)\],before=new Map\(globals.map\(name=>\[name,Object.getOwnPropertyDescriptor\(globalThis,name\)\]\)\);/.exec(block);
  assert.ok(globals);assert.deepEqual([...globals[1].matchAll(/'([^']+)'/g)].map(row=>row[1]),['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval']);
  assert.ok(block.includes("['confirmation',d=>"));assert.ok(block.includes("['unknown',d=>"));
  assert.equal(block.split('await t.test(label,async subcase=>{').length,2,'each variant is an awaited child');
  assert.equal(block.split('const h=harness(subcase);').length,2,'the harness belongs to that child');
  assert.ok(!block.includes('harness(t)'),'the parent cannot own both deferred teardown hooks');
  for(const token of ['for(const [name,descriptor]of before){','const restored=Object.getOwnPropertyDescriptor(globalThis,name);','assert.equal(restored===undefined,descriptor===undefined','assert.deepEqual(Reflect.ownKeys(restored),Reflect.ownKeys(descriptor)','for(const key of Reflect.ownKeys(descriptor))assert.strictEqual(restored[key],descriptor[key]'])assert.ok(block.includes(token),token);
 };
 requireOwnedTeardown(source);
 assert.equal(p.candidatePins[file],hash(source),'the entire fixed test stays raw-pinned');
 assert.equal(hash(projectOwnClaude124EntrySourceToParent(file,source)),'d4be44a48e685c38791a99265a982c61337224624064ba791f7c27cbc6a38a67','teardown fix recovers complete4ea before its unchanged individual13 guard');
 assert.throws(()=>requireOwnedTeardown(source.replace('const h=harness(subcase);','const h=harness(t);')),assert.AssertionError,'putting both harnesses back on the parent must be rejected as source');
});

test('monetary source custody raw-pins the complete33 operational selection and restores ten real parents before every older domain',()=>{
 const expected={"scripts/verify-own-monthly-payroll-full-capacity.mjs":{"before":"c60eecd2a3e772731e49b795edd0f2d929ccba378a692795493da71ada6c368e","after":"5f5d9f5839be134d8eb923c88b67fcee1396099fd678a729722145c85c00a60e"},"assets/own-payroll-program-model.js":{"before":"9dad4a519d4922595d4ad04b9f29656262fe808727b4a1f5226506e1c2cbf73d","after":"f4b3101fb8cf050dbe8f11fb61b46065706c7a7e231a52cf126019f04d9701a8"},"lib/internal-own-payroll-program.js":{"before":"1f75c564e6f0c50e50bb897b1b3c4eeb747cef4b88c667a35dae8b7a38dddb3b","after":"311d94add3940a69b5e7e4f2f3e606137cad7686b1507bd40267af85a3de8b5a"},"assets/own-payroll-program-workspace-model.js":{"before":"42eaedd49899f6290113647255ca82fd779e5e49a3bb347825ea7561ff6838e8","after":"81c812f960a6ae9e62d2e9faa740e4af2bbd2f4a8d3a3f21030ff43c2b10fe1a"},"scripts/verify-municipal-owner-program.mjs":{"before":"7497c123404f13ae0291b917786324a468ed551453f7bca39ff0c4f53c1f6a58","after":"abfee9c7033d6db8c0c0e3699bd89ad37ac4a1430ebff7bea241ed3b3b7cd85c"},"lib/own-payroll-approved-input.js":{"before":"c5d6eb7418c0fc41ec45ba405317eac029742f128cb4534399898b1cbd27375e","after":"df80132c620ab9c60d9427ccc46daa44851495f34c9c3607ab00e329d661a03a"},"lib/internal-own-payroll-run.js":{"before":"758c9c87a0fc05cb5be7883cc02fc5972299a4b2c2471f20ba9173aaf92947ba","after":"5ae996ad4bb48d35136fa5fc45d2c434ec4b8c8a064c1e80ec325a05033201ad"},"assets/own-payroll-program-panel.js":{"before":"8c4bff924cac3ce864bf6a963ef879f24d1f55f6ecba2d2a5bbb960bf3c8db0d","after":"6b2b60837ed03c6833dc3680b4da31a519a49adaf02288ed45d8028283d5fc64"},".vercelignore":{"before":"25f470251326587e3208b62f370b0f52403674a6f70a9ef0b12857ff22752a2c","after":"54d4ceec7980e7cfe7b83fded7bf67588ed6c9ecd7f2d27715a1edaa7a3f9abd"},"scripts/build-friendly.mjs":{"before":"0afb528065ca0c0fc49ecd319fc6880bd710a99c6c9906c5d95da93163d4b110","after":"361e56e0ab83de87dc38bcbd508614cb23f9d5215c82272332fd34385b9ec80b"}},newSources={"tests/own-monetary-program-qa-foundation-source.test.js":{"sha256":"97dcf04f8f3153ec460c1ceca2d294e82626ab1484929bb4a20c417def8a7230","bytes":6297},"assets/own-payroll-monetary-manifest.js":{"sha256":"70f67119f767586c050fe200303528d1f4a3f18e195326d2312e25d25b005b3b","bytes":5732},"tests/own-monetary-program-technical-epoch-source.test.js":{"sha256":"cf13daac1058d3eff4f6f3b8b7acee8d983d87b7ba41b7515d9d58ded4ab2093","bytes":6426},"scripts/sql/own-monetary-manifest.sql":{"sha256":"e5a011238fe0bf7b204a9ec527158a5fa5b48a48c4a6a513749e3ee2b24cc237","bytes":21161},"scripts/lib/own-monetary-program-qa-projection.mjs":{"sha256":"90dba05d5c0f5163707cb452c0f5da599284b35319d732a50ebcd7dfeb44d1b5","bytes":23251},"lib/own-payroll-monetary-verification.js":{"sha256":"0c0e1bf1dd7ed1047b35ef4d0218a6e030ac0172036d48b6f06c4946d85135d4","bytes":847},"tests/own-payroll-monetary-policy.test.js":{"sha256":"5ae10bdc48d4d444b9d09e138faac7323ea094d7baca34b863a5dfa39447e24e","bytes":14059},"tests/own-payroll-monetary-program-service.test.js":{"sha256":"fe5a23d9334cebd445bc2ae939f290975174d4acacde7b34f119f5764565eba3","bytes":11603},"scripts/sql/own-monetary-program-definition.sql":{"sha256":"fcd076b5e2532371b7871ed0a5a2b7c1a14ccbc093abedf1eae1f8a8aff03529","bytes":24349},"assets/own-payroll-program-monetary-review.js":{"sha256":"678ee1d63aebf133d61e18821cb5754ac57d77ae32b12b16482dfb2566c1b2b0","bytes":5364},"scripts/lib/own-monetary-program-guarded-installation.mjs":{"sha256":"0c55c03740a792e86061dbd8bcc05fb80969d46a5d2ca58969d5789532ecd243","bytes":21135},"tests/own-payroll-monetary-manifest.test.js":{"sha256":"066fc73396b6cc356c7734fdefc8a531359f8cd52900696f0935900c1535ec00","bytes":10006},"tests/own-payroll-monetary-runtime.test.js":{"sha256":"6b7b7f5c67b207d5473df08d7259263f9dd22687f89f7be3ca276def7979b1a1","bytes":8769},"assets/own-payroll-monetary-policy.js":{"sha256":"a4979613ccb5f21cfa5aff49cfe07fda593f657cb112587f1d0f712eca09c09c","bytes":17113},"scripts/sql/own-monetary-program-command-core.sql":{"sha256":"c2090eacfdbe060d35a32d0b8dffb6e7d8ea688998974240751614115a34bc2f","bytes":16297},"tests/own-payroll-monetary-jsonb-text.test.js":{"sha256":"06108308af7d86b301f617b613e12c0a5d73451f24c725decbecc5f62865a1b0","bytes":5060},"tests/own-payroll-monetary-program-model.test.js":{"sha256":"c749f790465305a6a7cdc3959aa7b8adc6df695ba2ca927e923850c0e5440681","bytes":10158},"tests/own-payroll-monetary-captured-input.test.js":{"sha256":"fa2ad3e1065ee2fde01802eaa5342dd395b4f141f7df4220443bc6c9257a97ab","bytes":16749},"scripts/lib/own-monetary-program-technical-epoch.mjs":{"sha256":"38bd71fdfe70998f2aed7a50fb23d1f97ee95eed60a6d8cdc7720c9c800b2c15","bytes":20283},"tests/own-payroll-monetary-workspace.test.js":{"sha256":"59a291e1bb52c9805ec92e92554f01fe4b555fe68c6df5f5d28ac55d2bd33d2c","bytes":6049},"tests/own-payroll-monetary-review.test.js":{"sha256":"90d40653eaccc7781c0a0ec558981cfc3f7e6ff1e77b69ff095fd8226cadc019","bytes":8121}},references={"assets/own-payroll-exact.js":{"sha256":"975d7192e2b407ba149bff185fae6bd60ed85f085ac48e788c432e97d1855666","bytes":3892},"assets/native-salary-catalog-model.js":{"sha256":"0277d8e93a362e4bdfd3f2b698d84b6903ef2bb7f774d932423e2088dcfea908","bytes":10782}};
 const manifest={"tests/own-monetary-program-qa-foundation-source.test.js":{"sha256":"97dcf04f8f3153ec460c1ceca2d294e82626ab1484929bb4a20c417def8a7230","bytes":6297},"assets/own-payroll-monetary-manifest.js":{"sha256":"70f67119f767586c050fe200303528d1f4a3f18e195326d2312e25d25b005b3b","bytes":5732},"scripts/verify-own-monthly-payroll-full-capacity.mjs":{"sha256":"5f5d9f5839be134d8eb923c88b67fcee1396099fd678a729722145c85c00a60e","bytes":13114},"tests/own-monetary-program-technical-epoch-source.test.js":{"sha256":"cf13daac1058d3eff4f6f3b8b7acee8d983d87b7ba41b7515d9d58ded4ab2093","bytes":6426},"scripts/sql/own-monetary-manifest.sql":{"sha256":"e5a011238fe0bf7b204a9ec527158a5fa5b48a48c4a6a513749e3ee2b24cc237","bytes":21161},"scripts/lib/own-monetary-program-qa-projection.mjs":{"sha256":"90dba05d5c0f5163707cb452c0f5da599284b35319d732a50ebcd7dfeb44d1b5","bytes":23251},"assets/own-payroll-program-model.js":{"sha256":"f4b3101fb8cf050dbe8f11fb61b46065706c7a7e231a52cf126019f04d9701a8","bytes":23492},"lib/internal-own-payroll-program.js":{"sha256":"311d94add3940a69b5e7e4f2f3e606137cad7686b1507bd40267af85a3de8b5a","bytes":7539},"lib/own-payroll-monetary-verification.js":{"sha256":"0c0e1bf1dd7ed1047b35ef4d0218a6e030ac0172036d48b6f06c4946d85135d4","bytes":847},"tests/own-payroll-monetary-policy.test.js":{"sha256":"5ae10bdc48d4d444b9d09e138faac7323ea094d7baca34b863a5dfa39447e24e","bytes":14059},"tests/own-payroll-monetary-program-service.test.js":{"sha256":"fe5a23d9334cebd445bc2ae939f290975174d4acacde7b34f119f5764565eba3","bytes":11603},"assets/own-payroll-program-workspace-model.js":{"sha256":"81c812f960a6ae9e62d2e9faa740e4af2bbd2f4a8d3a3f21030ff43c2b10fe1a","bytes":18165},"scripts/sql/own-monetary-program-definition.sql":{"sha256":"fcd076b5e2532371b7871ed0a5a2b7c1a14ccbc093abedf1eae1f8a8aff03529","bytes":24349},"assets/own-payroll-program-monetary-review.js":{"sha256":"678ee1d63aebf133d61e18821cb5754ac57d77ae32b12b16482dfb2566c1b2b0","bytes":5364},"scripts/lib/own-monetary-program-guarded-installation.mjs":{"sha256":"0c55c03740a792e86061dbd8bcc05fb80969d46a5d2ca58969d5789532ecd243","bytes":21135},"tests/own-payroll-monetary-manifest.test.js":{"sha256":"066fc73396b6cc356c7734fdefc8a531359f8cd52900696f0935900c1535ec00","bytes":10006},"tests/own-payroll-monetary-runtime.test.js":{"sha256":"6b7b7f5c67b207d5473df08d7259263f9dd22687f89f7be3ca276def7979b1a1","bytes":8769},"assets/own-payroll-monetary-policy.js":{"sha256":"a4979613ccb5f21cfa5aff49cfe07fda593f657cb112587f1d0f712eca09c09c","bytes":17113},"scripts/sql/own-monetary-program-command-core.sql":{"sha256":"c2090eacfdbe060d35a32d0b8dffb6e7d8ea688998974240751614115a34bc2f","bytes":16297},"tests/own-payroll-monetary-jsonb-text.test.js":{"sha256":"06108308af7d86b301f617b613e12c0a5d73451f24c725decbecc5f62865a1b0","bytes":5060},"scripts/verify-municipal-owner-program.mjs":{"sha256":"abfee9c7033d6db8c0c0e3699bd89ad37ac4a1430ebff7bea241ed3b3b7cd85c","bytes":37904},"tests/own-payroll-monetary-program-model.test.js":{"sha256":"c749f790465305a6a7cdc3959aa7b8adc6df695ba2ca927e923850c0e5440681","bytes":10158},"lib/own-payroll-approved-input.js":{"sha256":"df80132c620ab9c60d9427ccc46daa44851495f34c9c3607ab00e329d661a03a","bytes":28785},"lib/internal-own-payroll-run.js":{"sha256":"5ae996ad4bb48d35136fa5fc45d2c434ec4b8c8a064c1e80ec325a05033201ad","bytes":28238},"tests/own-payroll-monetary-captured-input.test.js":{"sha256":"fa2ad3e1065ee2fde01802eaa5342dd395b4f141f7df4220443bc6c9257a97ab","bytes":16749},"assets/own-payroll-exact.js":{"sha256":"975d7192e2b407ba149bff185fae6bd60ed85f085ac48e788c432e97d1855666","bytes":3892},"assets/native-salary-catalog-model.js":{"sha256":"0277d8e93a362e4bdfd3f2b698d84b6903ef2bb7f774d932423e2088dcfea908","bytes":10782},"scripts/lib/own-monetary-program-technical-epoch.mjs":{"sha256":"38bd71fdfe70998f2aed7a50fb23d1f97ee95eed60a6d8cdc7720c9c800b2c15","bytes":20283},"tests/own-payroll-monetary-workspace.test.js":{"sha256":"59a291e1bb52c9805ec92e92554f01fe4b555fe68c6df5f5d28ac55d2bd33d2c","bytes":6049},"assets/own-payroll-program-panel.js":{"sha256":"6b2b60837ed03c6833dc3680b4da31a519a49adaf02288ed45d8028283d5fc64","bytes":81143},"tests/own-payroll-monetary-review.test.js":{"sha256":"90d40653eaccc7781c0a0ec558981cfc3f7e6ff1e77b69ff095fd8226cadc019","bytes":8121},".vercelignore":{"sha256":"54d4ceec7980e7cfe7b83fded7bf67588ed6c9ecd7f2d27715a1edaa7a3f9abd","bytes":17278},"scripts/build-friendly.mjs":{"sha256":"361e56e0ab83de87dc38bcbd508614cb23f9d5215c82272332fd34385b9ec80b","bytes":27595}};
 assert.equal(Object.keys(expected).length,10);assert.deepEqual(OWN_MONETARY_SOURCE_PINS,expected);
 assert.equal(Object.keys(newSources).length,21);assert.deepEqual(OWN_MONETARY_NEW_SOURCE_PINS,newSources);
 assert.equal(Object.keys(references).length,2);assert.deepEqual(OWN_MONETARY_REFERENCE_SOURCE_PINS,references);
 assert.equal(Object.keys(manifest).length,33);
 const build=fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8');
 const shellStart=build.indexOf('const shellFiles = ['),shellEnd=build.indexOf('\n];',shellStart);
 assert.ok(shellStart>=0&&shellEnd>shellStart,'the existing explicit shellFiles literal is present');
 const shell=build.slice(shellStart,shellEnd+3);
 for(const file of ['assets/own-payroll-monetary-manifest.js','assets/own-payroll-program-monetary-review.js','assets/own-payroll-monetary-policy.js'])assert.equal(shell.split("'"+file+"'").length,2,file+' exactly once in the real raw public copier');
 assert.ok(build.includes('for (const file of [...shellFiles, ...pwaFiles]) {\n  const destination = path.join(output, file);\n  fs.mkdirSync(path.dirname(destination), { recursive: true });\n  fs.copyFileSync(path.join(root, file), destination);\n}'),'the entire public copy loop stays unchanged');
 assert.deepEqual(Object.keys(manifest).sort(),[...Object.keys(expected),...Object.keys(newSources),...Object.keys(references)].sort(),'complete selection: no omitted or fabricated source identity');
 for(const[file,pin]of Object.entries(manifest)){
  const source=historicalRaw(file);
  assert.equal(source.length,pin.bytes,file+' raw selected bytes');assert.equal(hash(source),pin.sha256,file+' raw whole selected source');
 }
 for(const[file,pin]of Object.entries(expected)){
  const source=historicalRaw(file,'utf8');
  assert.equal(hash(source),pin.after,file+' raw monetary candidate before any parent projection');
  assert.equal(hash(projectOwnMonetarySourceToParent(file,source)),pin.before,file+' exact complete public645 parent');
  assert.throws(()=>projectOwnMonetarySourceToParent(file,source+' '),/MONETARY_SOURCE_BYTES/);
  const changed=Buffer.from(source,'utf8');changed[0]^=1;
  assert.throws(()=>projectOwnMonetarySourceToParent(file,changed.toString('utf8')),/MONETARY_WHOLE_SOURCE_PIN/);
 }
 for(const file of [...Object.keys(newSources),...Object.keys(references)]){
  const source=historicalRaw(file,'utf8');
  assert.equal(Object.hasOwn(OWN_MONETARY_SOURCE_PINS,file),false,'new or byte-identical source never acquires an invented parent');
  assert.equal(projectOwnMonetarySourceToParent(file,source),source,file+' stays byte exact');
 }
 assert.equal(projectOwnMonetarySourceToParent('assets/unknown-monetary-source.js','distinct source'),'distinct source');
});

test('native645 causal source custody pins every current source and restores complete bcae parents before older domains',()=>{
 const expected=["scripts/lib/municipal-owner-adoption-decision-qa.mjs","tests/municipal-owner-adoption-decision-qa.test.js","scripts/lib/monthly-native-full-circuit-iam-fixture.mjs","tests/monthly-native-full-circuit-iam-fixture.test.js","scripts/lib/owner-program-qa-continuation-preparation.mjs","tests/owner-program-qa-continuation-preparation.test.js","scripts/lib/own-accounting-imputation-190-source-pins.mjs","scripts/lib/own-annulment-preparation-209-actors-fixture.mjs","scripts/lib/own-payroll-annulment-review-v2-installation.mjs","scripts/lib/own-payroll-annulment-preparation-209-installation.mjs","scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs","tests/fixtures/own-accounting-imputation-190-source-contract.json","tests/fixtures/own-payroll-full-capacity-190-source-projection.js"];
 assert.equal(expected.length,13);assert.equal(new Set(expected).size,13);assert.deepEqual(Object.keys(OWN_NATIVE645_CAUSAL_SOURCE_PINS).sort(),expected.sort());
 assert.equal(Object.keys(p.candidatePins).length,102);assert.equal(Object.keys(p.dependencies).length,51);
 for(const [file,pin] of Object.entries(OWN_NATIVE645_CAUSAL_SOURCE_PINS)){
  const current=projectOwnerReaderCallerRawSourceToParent(file,projectCurrent190UiRawSourceToParent(file,projectCurrent190RevocationRawSourceToParent(file,receipt126ParentRaw(file))));assert.equal(current.length,pin.afterBytes,file+' exact raw current bytes');assert.equal(hash(current),pin.after,file+' complete raw current SHA');
  const parent=projectOwnNative645RawSourceToParent(file,current);assert.equal(parent.length,pin.beforeBytes);assert.equal(hash(parent),pin.before,file+' complete bcae parent');
  assert.throws(()=>projectOwnNative645RawSourceToParent(file,Buffer.concat([current,Buffer.from('\n-- unreviewed trailer')])));
  const changed=Buffer.from(current);changed[0]^=1;assert.throws(()=>projectOwnNative645RawSourceToParent(file,changed));
  assert.throws(()=>projectOwnNative645RawSourceToParent(file,parent),undefined,file+' cannot mix old and new source epochs');
 }
 const unknown=Buffer.from('unrelated inert bytes');assert.strictEqual(projectOwnNative645RawSourceToParent('tests/unknown-native645-source.js',unknown),unknown);
});

test('owner raw-reader successors retain exact current bytes, complete overlay17 parents and both new reviewed sources',()=>{
 const expected=["scripts/verify-municipal-owner-program.mjs","scripts/verify-municipal-owner-adoption-authority.mjs","scripts/lib/own-monetary-program-qa-projection.mjs","scripts/lib/own-monetary-program-technical-epoch.mjs","tests/own-monetary-program-technical-epoch-source.test.js","tests/own-monetary-program-qa-foundation-source.test.js","tests/municipal-owner-adoption-authority-qa.test.js","tests/fixtures/own-payroll-full-capacity-190-source-projection.js"];
 assert.equal(expected.length,8);assert.equal(new Set(expected).size,8);assert.deepEqual(Object.keys(OWNER_READER_CALLER_SOURCE_PINS).sort(),expected.sort());
 assert.equal(Object.keys(OWN_NATIVE645_CAUSAL_SOURCE_PINS).length,13);assert.equal(Object.keys(p.candidatePins).length,102);assert.equal(Object.keys(p.dependencies).length,51);
 for(const [file,pin]of Object.entries(OWNER_READER_CALLER_SOURCE_PINS)){
  const current=projectCurrent190UiRawSourceToParent(file,projectCurrent190RevocationRawSourceToParent(file,receipt126ParentRaw(file)));assert.equal(current.length,pin.afterBytes,file+' reader14 parent raw bytes after UI succession');assert.equal(hash(current),pin.after,file+' reader14 parent raw SHA after UI succession');
  const parent=projectOwnerReaderCallerRawSourceToParent(file,current);assert.equal(parent.length,pin.beforeBytes,file+' complete overlay17 parent bytes');assert.equal(hash(parent),pin.before,file+' complete overlay17 parent SHA');
  assert.throws(()=>projectOwnerReaderCallerRawSourceToParent(file,Buffer.concat([current,Buffer.from('\n-- unreviewed trailer')])));
  const changed=Buffer.from(current);changed[0]^=1;assert.throws(()=>projectOwnerReaderCallerRawSourceToParent(file,changed));assert.throws(()=>projectOwnerReaderCallerRawSourceToParent(file,parent));
 }
 const added=['scripts/lib/owner-qa-source-closure-reader.mjs','tests/owner-qa-source-closure-reader.test.js'];assert.deepEqual(Object.keys(OWNER_READER_CALLER_NEW_SOURCE_PINS).sort(),added.sort());
 for(const[file,pin]of Object.entries(OWNER_READER_CALLER_NEW_SOURCE_PINS)){const bytes=receipt126ParentRaw(file);assert.equal(bytes.length,pin.bytes);assert.equal(hash(bytes),pin.sha256,file+' unchanged reviewed raw-reader source');}
 const unknown=Buffer.from('unrelated raw source');assert.strictEqual(projectOwnerReaderCallerRawSourceToParent('tests/unknown-owner-reader-source.js',unknown),unknown);
});
test('current190 UI succession pins exact physical sources and restores complete reader14 parents without widening old epochs',()=>{
 const expected=['scripts/lib/own-payroll-full-capacity-190-continuation.mjs','scripts/lib/own-annulment-preparation-209-actors-fixture.mjs','scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs','scripts/verify-own-payroll-annulment-v2-full-capacity.mjs','tests/fixtures/own-payroll-full-capacity-190-source-projection.js'];
 assert.equal(expected.length,5);assert.deepEqual(Object.keys(OWN_CURRENT190_UI_SOURCE_PINS).sort(),expected.sort());
 assert.equal(Object.keys(OWNER_READER_CALLER_SOURCE_PINS).length,8);assert.equal(Object.keys(OWN_NATIVE645_CAUSAL_SOURCE_PINS).length,13);assert.equal(Object.keys(p.candidatePins).length,102);assert.equal(Object.keys(p.dependencies).length,51);
 for(const[file,pin]of Object.entries(OWN_CURRENT190_UI_SOURCE_PINS)){
  const current=projectCurrent190RevocationRawSourceToParent(file,receipt126ParentRaw(file));assert.equal(current.length,pin.afterBytes,file+' complete UI074 parent raw bytes');assert.equal(hash(current),pin.after,file+' complete UI074 parent raw SHA');
  const parent=projectCurrent190UiRawSourceToParent(file,current);assert.equal(parent.length,pin.beforeBytes);assert.equal(hash(parent),pin.before,file+' complete reader14 parent');
  assert.throws(()=>projectCurrent190UiRawSourceToParent(file,Buffer.concat([current,Buffer.from('\n-- unreviewed trailer')])));
  const changed=Buffer.from(current);changed[0]^=1;assert.throws(()=>projectCurrent190UiRawSourceToParent(file,changed));assert.throws(()=>projectCurrent190UiRawSourceToParent(file,parent),undefined,file+' old epoch cannot stand in for the current source');
 }
 const added=['scripts/lib/own-payroll-liquidation-current190-regressions-browser.mjs','scripts/lib/own-payroll-liquidation-current190-continuation-browser.mjs','scripts/lib/own-payroll-initial-empty-current190-browser.mjs','scripts/lib/own-payroll-agreement-annulment-current190-browser.mjs'];assert.equal(added.length,4);assert.deepEqual(Object.keys(OWN_CURRENT190_UI_NEW_SOURCE_PINS).sort(),added.sort());
 for(const[file,pin]of Object.entries(OWN_CURRENT190_UI_NEW_SOURCE_PINS)){const raw=receipt126ParentRaw(file);assert.equal(raw.length,pin.bytes);assert.equal(hash(raw),pin.sha256,file+' complete new UI source');}
 // The five actual writers have closed, different source-asset profiles. This
 // FS-only assertion compares declarations; it does not invoke an artifact reader.
 const artifactSource=projectCurrent190RevocationRawSourceToParent('scripts/verify-own-payroll-annulment-v2-full-capacity.mjs',fs.readFileSync(new URL('../scripts/verify-own-payroll-annulment-v2-full-capacity.mjs',import.meta.url))).toString('utf8');
 function artifactProfiles(source){
  const match=/^const current190UiArtifactProfiles=Object.freeze\((\{[^\n]+\})\);$/m.exec(source);assert.ok(match,'literal closed artifact profiles required');
  assert.ok(source.includes('const profile=current190UiArtifactProfiles[relative]'));
  assert.ok(source.includes('assert.equal(decoded.sourceBookend.length,profile.length)'),'each writer must use its own exact profile');
  assert.ok(source.includes('assert.deepEqual(decoded.sourceBookend.map(row=>row.path).sort(),[...profile].sort())'),'length alone is insufficient');
  return JSON.parse(match[1]);
 }
 const profiles=artifactProfiles(artifactSource),writers=[
  ['liquidation124-initial-verified-empty-browser/report.json','scripts/lib/own-payroll-initial-empty-current190-browser.mjs',/const ASSETS=Object.freeze\((\[[\s\S]*?\])\);/,12],
  ['liquidation124-current-regressions-browser/report.json','scripts/lib/own-payroll-liquidation-current190-regressions-browser.mjs',/for\(const file of(\[[^\n]+\])\)\{/,7],
  ['liquidation124-calculation-recovery-browser/report.json','scripts/lib/own-payroll-liquidation-current190-continuation-browser.mjs',/const assets=Object.freeze\((\[[^\n]+\])\);/,12],
  ['liquidation124-positive-department-browser/report.json','scripts/lib/own-payroll-liquidation-current190-continuation-browser.mjs',/const assets=Object.freeze\((\[[^\n]+\])\);/,12],
  ['liquidation190-positive-agreement-loss-before-browser/report.json','scripts/lib/own-payroll-agreement-annulment-current190-browser.mjs',/const assets=Object.freeze\((\[[^\n]+\])\);/,7]
 ];
 assert.deepEqual(Object.keys(profiles).sort(),writers.map(row=>row[0]).sort());
 for(const[relative,file,pattern,count]of writers){const writer=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),match=pattern.exec(writer);assert.ok(match,file+' literal writer asset declaration');const declared=[...match[1].matchAll(/'([^']+\.js)'/g)].map(row=>'assets/'+row[1]);assert.equal(declared.length,count);assert.equal(new Set(declared).size,count);assert.deepEqual([...profiles[relative]].sort(),declared.sort(),relative+' exact writer source set');}
 assert.throws(()=>artifactProfiles(artifactSource.replace('assert.equal(decoded.sourceBookend.length,profile.length)','assert.equal(decoded.sourceBookend.length,12)')),assert.AssertionError,'the universal12 predecessor is a causal source-contract failure');
 const unknown=Buffer.from('unrelated inert UI bytes');assert.strictEqual(projectCurrent190UiRawSourceToParent('tests/unknown-current190-ui-source.js',unknown),unknown);
});
test('actual SQL revocation source succession keeps five previous artifacts and admits its exact sixth writer profile',()=>{
 const expected=['scripts/lib/own-payroll-full-capacity-190-continuation.mjs','scripts/lib/own-annulment-preparation-209-actors-fixture.mjs','scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs','scripts/verify-own-payroll-annulment-v2-full-capacity.mjs','tests/fixtures/own-payroll-full-capacity-190-source-projection.js'];
 assert.deepEqual(Object.keys(OWN_CURRENT190_REVOCATION_SOURCE_PINS).sort(),expected.sort());assert.equal(Object.keys(OWN_CURRENT190_UI_SOURCE_PINS).length,5);assert.equal(Object.keys(OWNER_READER_CALLER_SOURCE_PINS).length,8);assert.equal(Object.keys(OWN_NATIVE645_CAUSAL_SOURCE_PINS).length,13);
 for(const[file,pin]of Object.entries(OWN_CURRENT190_REVOCATION_SOURCE_PINS)){
  const raw=receipt126ParentRaw(file);assert.equal(raw.length,pin.afterBytes);assert.equal(hash(raw),pin.after,file+' current revocation raw bytes');
  const parent=projectCurrent190RevocationRawSourceToParent(file,raw);assert.equal(parent.length,pin.beforeBytes);assert.equal(hash(parent),pin.before,file+' complete074 parent');
  assert.throws(()=>projectCurrent190RevocationRawSourceToParent(file,Buffer.concat([raw,Buffer.from('\n-- unreviewed')])));const changed=Buffer.from(raw);changed[0]^=1;assert.throws(()=>projectCurrent190RevocationRawSourceToParent(file,changed));assert.throws(()=>projectCurrent190RevocationRawSourceToParent(file,parent));
 }
 const file='scripts/lib/own-payroll-sql-revocation-current190-browser.mjs';assert.deepEqual(Object.keys(OWN_CURRENT190_REVOCATION_NEW_SOURCE_PINS),[file]);const raw=receipt126ParentRaw(file),pin=OWN_CURRENT190_REVOCATION_NEW_SOURCE_PINS[file];assert.equal(raw.length,pin.bytes);assert.equal(hash(raw),pin.sha256);
 const entry='scripts/verify-own-payroll-annulment-v2-full-capacity.mjs',entryRaw=fs.readFileSync(new URL('../'+entry,import.meta.url)),source=entryRaw.toString('utf8'),parent=projectCurrent190RevocationRawSourceToParent(entry,entryRaw).toString('utf8');
 const profiles=text=>{const match=/^const current190UiArtifactProfiles=Object.freeze\((\{[^\n]+\})\);$/m.exec(text);assert.ok(match);return JSON.parse(match[1]);},current=profiles(source),previous=profiles(parent),sixth='liquidation124-actual-sql-revocation-browser/report.json';
 assert.equal(Object.keys(current).length,6);assert.equal(Object.keys(previous).length,5);const{[sixth]:revocationProfile,...preserved}=current;assert.deepEqual(preserved,previous,'the first five writer profiles are identical to074');
 const assets=/const ASSETS=Object.freeze\((\[[\s\S]*?\])\);/.exec(raw.toString('utf8'));assert.ok(assets);const declared=[...assets[1].matchAll(/'([^']+\.js)'/g)].map(row=>'assets/'+row[1]);assert.equal(declared.length,7);assert.deepEqual([...revocationProfile].sort(),declared.sort());
 for(const token of ["reconcileCurrent190UiArtifact(destination,'liquidation124-actual-sql-revocation-browser/report.json',revocationWriter,sqlRevocation.captureReference,report)",'assert.equal(current190UiArtifacts.length,6)','const {capture:revocationCapture,...revocationWriter}=sqlRevocation','assert.deepEqual(sqlRevocation.captureReference,browserArtifactCaptureReference(sqlRevocation.capture))'])assert.ok(source.includes(token),token);
 const unknown=Buffer.from('unrelated revocation source');assert.strictEqual(projectCurrent190RevocationRawSourceToParent('tests/unknown-revocation.js',unknown),unknown);
});

test('receipt126 finite RAW succession retains eleven complete parents and all eight new source files',()=>{
 const expected=[
  'scripts/lib/own-payroll-full-capacity-190-continuation.mjs',
  'scripts/verify-municipal-owner-program.mjs',
  'scripts/lib/own-payroll-full-capacity-190-rpc.mjs',
  'scripts/verify-own-payroll-full-capacity.mjs',
  'scripts/lib/owner-qa-source-closure-reader.mjs',
  'tests/owner-qa-source-closure-reader.test.js',
  'scripts/lib/own-annulment-preparation-209-actors-fixture.mjs',
  'scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs',
  'tests/own-payroll-full-capacity-190-source.test.js',
  'tests/own-accounting-imputation-190-source.test.js',
  'tests/own-novelty-succession-source-projection.test.js'
 ];
 assert.deepEqual(Object.keys(OWN_RECEIPT126_CONSUMER_SOURCE_PINS).sort(),expected.sort());
 for(const[file,pin]of Object.entries(OWN_RECEIPT126_CONSUMER_SOURCE_PINS)){
  const current=owner190OutcomeParentRaw(file);
  assert.equal(current.length,pin.afterBytes,file+' complete current raw bytes');assert.equal(hash(current),pin.after,file+' complete current raw SHA');
  const parent=projectReceipt126ConsumerRawSourceToParent(file,current);
  assert.equal(parent.length,pin.beforeBytes,file+' complete historical parent raw bytes');assert.equal(hash(parent),pin.before,file+' complete historical parent raw SHA');
  assert.throws(()=>projectReceipt126ConsumerRawSourceToParent(file,Buffer.concat([current,Buffer.from('\n-- unreviewed trailer')])));
  const changed=Buffer.from(current);changed[0]^=1;assert.throws(()=>projectReceipt126ConsumerRawSourceToParent(file,changed));
  assert.throws(()=>projectReceipt126ConsumerRawSourceToParent(file,parent));
 }
 const additions=[
  'scripts/lib/own-payroll-receipt126-same190-support.mjs',
  'scripts/lib/own-payroll-receipt126-same190-shape.mjs',
  'scripts/lib/own-payroll-receipt126-same190-installation.mjs',
  'scripts/lib/own-payroll-receipt126-same190-actors.mjs',
  'scripts/lib/own-payroll-receipt126-same190-circuit.mjs',
  'scripts/lib/own-payroll-receipt126-backend-190-continuation.mjs',
  'tests/receipt126/own-payroll-receipt126-pdf-oracle.test.mjs',
  'tests/own-payroll-receipt126-pdf-oracle.test.js'
 ];
 assert.deepEqual(Object.keys(OWN_RECEIPT126_NEW_SOURCE_PINS).sort(),additions.sort());
 for(const[file,pin]of Object.entries(OWN_RECEIPT126_NEW_SOURCE_PINS)){
  const bytes=owner190OutcomeParentRaw(file);assert.equal(bytes.length,pin.bytes);assert.equal(hash(bytes),pin.sha256,file+' complete newly reviewed raw source');
 }
 const unrelated=Buffer.from('unrelated source remains the exact input');assert.strictEqual(projectReceipt126ConsumerRawSourceToParent('tests/unrelated-receipt126-source.js',unrelated),unrelated);
});

test('owner190 native outcome RAW succession preserves five complete d7 parents and two new source files',()=>{
 const expected=[
  'scripts/verify-municipal-owner-program.mjs',
  'scripts/lib/own-payroll-receipt126-same190-installation.mjs',
  'tests/own-payroll-full-capacity-190-source.test.js',
  'tests/own-accounting-imputation-190-source.test.js',
  'tests/own-novelty-succession-source-projection.test.js'
 ];
 assert.deepEqual(Object.keys(OWNER190_NATIVE_OUTCOME_SOURCE_PINS).sort(),expected.sort());
 for(const[file,pin]of Object.entries(OWNER190_NATIVE_OUTCOME_SOURCE_PINS)){
  const current=fs.readFileSync(new URL('../'+file,import.meta.url));
  assert.equal(current.length,pin.afterBytes,file+' complete reviewed current RAW bytes');assert.equal(hash(current),pin.after,file+' complete reviewed current RAW SHA');
  const parent=projectOwner190NativeOutcomeRawSourceToParent(file,current);
  assert.equal(parent.length,pin.beforeBytes,file+' complete d7 parent RAW bytes');assert.equal(hash(parent),pin.before,file+' complete d7 parent RAW SHA');
  assert.throws(()=>projectOwner190NativeOutcomeRawSourceToParent(file,Buffer.concat([current,Buffer.from('\n-- unreviewed outcome source trailer')])));
  const changed=Buffer.from(current);changed[0]^=1;assert.throws(()=>projectOwner190NativeOutcomeRawSourceToParent(file,changed));
  assert.throws(()=>projectOwner190NativeOutcomeRawSourceToParent(file,parent));
 }
 const additions=['scripts/lib/owner190-native-outcome.mjs','tests/owner190-native-outcome.test.js'];
 assert.deepEqual(Object.keys(OWNER190_NATIVE_OUTCOME_NEW_SOURCE_PINS).sort(),additions.sort());
 for(const[file,pin]of Object.entries(OWNER190_NATIVE_OUTCOME_NEW_SOURCE_PINS)){
  assert.equal(Object.hasOwn(OWNER190_NATIVE_OUTCOME_SOURCE_PINS,file),false,'new source has no fabricated ancestor');
  const source=fs.readFileSync(new URL('../'+file,import.meta.url));assert.equal(source.length,pin.bytes);assert.equal(hash(source),pin.sha256,file+' reviewed new source exact RAW pin');
 }
 assert.equal(Object.keys(OWN_RECEIPT126_CONSUMER_SOURCE_PINS).length,11);assert.equal(Object.keys(OWN_RECEIPT126_NEW_SOURCE_PINS).length,8);
 const unrelated=Buffer.from('unrelated outcome source remains the exact input');assert.strictEqual(projectOwner190NativeOutcomeRawSourceToParent('tests/unrelated-owner190-source.js',unrelated),unrelated);
 assert.throws(()=>projectOwner190NativeOutcomeRawSourceToParent(expected[0],'not raw bytes'));
});
