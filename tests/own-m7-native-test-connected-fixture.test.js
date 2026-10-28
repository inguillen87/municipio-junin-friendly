// Pure source checks only; fabricated unit bootstraps/row tags prove no SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import child from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const blocked=()=>{throw Error('UNIT_IO_FORBIDDEN');};
for(const[module,keys]of [[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[dns,['lookup','resolve']],[child,['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']]])for(const key of keys)module[key]=blocked;
globalThis.fetch=blocked;syncBuiltinESMExports();
const connected=await import('../scripts/lib/own-m7-native-test-connected-fixture.mjs'),base=await import('../scripts/lib/own-m7-native-test-fixture.mjs');
const {buildOwnM7NativeTestConnectedFixturePlan,assertOwnM7NativeTestConnectedFixturePlan,bookendOwnM7NativeTestConnectedFixture,materializeOwnM7NativeTestConnectedEmployee,assertOwnM7NativeTestConnectedSeedObservation,OWN_M7_NATIVE_TEST_CONNECTED_TEMPLATE_PIN}=connected;
const root=new URL('../',import.meta.url),readRaw=file=>fs.readFileSync(new URL(file,root)),copy=value=>JSON.parse(JSON.stringify(value));
const targetAdmission=()=>({version:'own-release-annulment-atomic-test-target.v1',kind:'test',target:{major:17,projectId:'noisy-poetry-54471701',branchId:'br-connected-unit-only',database:'neondb',role:'neondb_owner',guardOid:532699,host:'ep-connected-unit-only.sa-east-1.aws.neon.tech',endpointId:'ep-connected-unit-only',kind:'test',parentBranchId:'br-plain-dust-acpjgebb'},parentBranchId:'br-plain-dust-acpjgebb',branchCreation:{bytes:100,sha256:'b'.repeat(64)}});
const options=(patch={})=>({readRaw,sourceCommit:'2501a42d2524cb72568d06c74d41e29d6b36185b',testTargetAdmission:targetAdmission(),runId:'connected-unit-20261028',...patch});
const build=(patch={})=>buildOwnM7NativeTestConnectedFixturePlan(options(patch));

test('new retained-seed contract preserves all v1 fixture data and leaves v1 semantics intact',()=>{
 const p=build(),v1=base.buildOwnM7NativeTestFixturePlan(options());assert.equal(assertOwnM7NativeTestConnectedFixturePlan(p),p);assert.equal(bookendOwnM7NativeTestConnectedFixture(p),true);
 assert.equal(p.version,'own-m7-native-test-connected-fixture.v2');assert.equal(p.template.version,v1.version);assert.equal(p.template.executedAsProtocol,false);assert.equal(Object.hasOwn(p,'transaction'),false);assert.equal(Object.hasOwn(p,'basePlan'),false);
 assert.equal(v1.transaction.end,'ROLLBACK');assert.equal(v1.transaction.retentionExpected,false);assert.equal(p.seedEnd,'COMMIT');assert.equal(p.seedRetentionExpected,true);assert.equal(p.retentionExpected,true);assert.equal(p.businessEnd,'ROLLBACK');
 for(const field of ['scope','actors','subjects','canonical','seededCatalog','bootstrapOwner','authentication','expectedCounts','pending','issuer'])assert.deepEqual(p[field],v1[field]);
 assert.equal(p.bootstrapOwner.statements.length,46);assert.equal(p.bootstrapOwner.expectedSha256,v1.bootstrapOwner.expectedSha256);assert.deepEqual(p.bootstrapOwner.expectedCommands,v1.bootstrapOwner.expectedCommands);assert.deepEqual(p.bootstrapOwner.expectedRowCounts,v1.bootstrapOwner.expectedRowCounts);
 assert.equal(Object.keys(p.sourceHashes).length,50);assert.equal(p.sourceHashes[OWN_M7_NATIVE_TEST_CONNECTED_TEMPLATE_PIN.path],OWN_M7_NATIVE_TEST_CONNECTED_TEMPLATE_PIN.sha256);assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.transactions.business)&&Object.isFrozen(p.bootstrapOwner.statements[0].values));
});

test('source expectations describe retained seed and exact post-rollback baseline, not admission',()=>{
 const p=build();assert.deepEqual(p.baselineExpectedCounts,{tenant:1,binding:1,policy:1,users:2,roles:2,roleCapabilities:25,memberships:2,authority:2,sessions:2,persons:2,contracts:2,registrations:2,links:2,catalogProposal:1,catalogReview:1});assert.deepEqual(p.postRollbackExpectedCounts,p.baselineExpectedCounts);assert.deepEqual(p.beneficiaryExpectedAfterRollback,{person:0,contract:0,registration:0});
 assert.equal(p.transactions.seed.end,'COMMIT');assert.equal(p.transactions.seed.retentionExpected,true);assert.equal(p.transactions.business.end,'ROLLBACK');assert.equal(p.transactions.business.runtimeLoginRequired,true);assert.equal(p.transactions.rollbackObserver.sameObserverClient,true);assert.equal(p.transactions.rollbackObserver.freshTransaction,true);assert.equal(p.transactions.seedObserver.readOnly,true);
 assert.equal(p.seedIsBusinessEvidence,false);assert.equal(p.sourceOnly,true);assert.equal(p.productionAdmitted,false);assert.equal(p.executionAdmitted,false);assert.equal(p.executesSql,false);assert.equal(p.connects,false);assert.equal(p.roleSwitchUsed,false);assert.equal(p.noNewPermissions,true);assert.equal(p.automaticCleanup,false);
 assert.equal(p.authentication.businessSyntheticAuth,true);assert.equal(p.authentication.completeAuthenticationHandler,false);assert.equal(p.authentication.realMfaVerified,false);
 assert.equal(p.businessScenario.selectionContracts,1);assert.equal(p.businessScenario.rosterTotal,3);assert.equal(p.businessScenario.closeEmployees,1);assert.equal(p.businessScenario.closePopulationTotal,3);assert.equal(p.businessScenario.closeComplete,false);assert.deepEqual(p.businessScenario.runDependencies,{fullJson:true});assert.equal(p.businessScenario.httpDefaultCovered,false);assert.equal(p.businessScenario.receiptPreview,true);assert.equal(p.businessScenario.receiptPrepare,false);assert.equal(p.businessScenario.receiptApprove,false);assert.equal(p.businessScenario.beneficiarySelfReceipt,false);
 assert.equal(p.protocol,'published-monthly-fixed-v1');assert.equal(p.fullfixedV2Pending,true);assert.equal(p.businessScenario.protocol,p.protocol);assert.equal(p.businessScenario.fullfixedV2Pending,true);
 for(const id of ['calculate','recalculate']){const step=p.steps.find(s=>s.id===id);assert.deepEqual(step.deps,{fullJson:true});assert.equal(Object.hasOwn(step.deps,'fixedV2'),false);assert.equal(step.protocol,'published-monthly-fixed-v1');}
 assert.equal(p.steps.find(s=>s.id==='receipt-preview').actor,'checker');assert.equal(p.steps.find(s=>s.id==='receipt-preview').preparesOrApproves,false);assert.equal(p.steps.find(s=>s.id==='business-rollback').end,'ROLLBACK');
 assert.equal(p.actors.maker.capabilities.includes('payroll.calculation.approve'),false);assert.equal([...p.actors.maker.capabilities,...p.actors.checker.capabilities].some(c=>c.startsWith('payroll.receipt.')),false);
});

test('v1 plans, clones, passed injections and production adaptations cannot become connected plans',()=>{
 const p=build(),v1=base.buildOwnM7NativeTestFixturePlan(options());for(const value of [v1,copy(p),{...p,version:'own-m7-native-test-connected-fixture.v1'},{...p,passed:true},{...p,seedEnd:'ROLLBACK'}])assert.throws(()=>assertOwnM7NativeTestConnectedFixturePlan(value),/MINTED/);
 const a=targetAdmission();a.target.kind='production';assert.throws(()=>build({testTargetAdmission:a}));const b=targetAdmission();b.target.database='qa-fake';assert.throws(()=>build({testTargetAdmission:b}));const c=targetAdmission();c.target.branchId='br-plain-dust-acpjgebb';assert.throws(()=>build({testTargetAdmission:c}));
 assert.throws(()=>buildOwnM7NativeTestConnectedFixturePlan({...options(),seedRetentionExpected:false}),/OPTIONS/);
});

test('both template and all original RAW source bytes are guarded, with no normalization',()=>{
 const template=OWN_M7_NATIVE_TEST_CONNECTED_TEMPLATE_PIN.path;assert.throws(()=>build({readRaw:f=>f===template?Buffer.concat([readRaw(f),Buffer.from('\n')]):readRaw(f)}),/TEMPLATE_CHANGED/);assert.throws(()=>build({readRaw:f=>readRaw(f).toString('utf8')}),/BUFFER_REQUIRED/);
 let changed=null;const p=build({readRaw:f=>f===changed?Buffer.concat([readRaw(f),Buffer.from('\n')]):readRaw(f)});changed=template;assert.throws(()=>bookendOwnM7NativeTestConnectedFixture(p),/TEMPLATE_RAW_DRIFT/);
 changed=null;const q=build({readRaw:f=>f===changed?Buffer.concat([readRaw(f),Buffer.from('\n')]):readRaw(f)});changed='assets/native-employee-contract.js';assert.throws(()=>bookendOwnM7NativeTestConnectedFixture(q),/RAW_DRIFT/);
});

test('employee input materialization delegates to the genuine private v1 plan without minting results',()=>{
 const p=build(),bootstrap={version:'native-employee.v1',canCreate:true,today:'2026-10-28',suggestedLegajo:'3',scope:{tenantId:p.scope.tenantId,membershipId:p.actors.maker.membershipId},catalog:{version:'c'.repeat(64),items:copy(p.canonical.classification),origin:'MUNICONTROL',revision:1}};
 const input=materializeOwnM7NativeTestConnectedEmployee({plan:p,subject:'beneficiary',bootstrap});assert.deepEqual(Object.keys(input),['key','body']);assert.equal(input.key,p.subjects[2].requestKey);assert.deepEqual(input.body.draft,p.subjects[2].draft);assert.equal(input.body.catalogVersion,bootstrap.catalog.version);assert.equal(Object.hasOwn(p.subjects[2],'contractId'),false);
 assert.throws(()=>materializeOwnM7NativeTestConnectedEmployee({plan:copy(p),subject:'beneficiary',bootstrap}),/MINTED/);assert.throws(()=>materializeOwnM7NativeTestConnectedEmployee({plan:p,subject:'maker',bootstrap}),/ONLY_API_BENEFICIARY/);assert.throws(()=>materializeOwnM7NativeTestConnectedEmployee({plan:p,subject:'beneficiary',bootstrap:{...bootstrap,today:'2026-11-01'}}),/CANONICAL_PERIOD_EXPIRED/);
});

test('seed row/tag checking remains strict and produces no committed or durable receipt',()=>{
 const p=build(),unit=p.bootstrapOwner.expectedCommands.map(command=>({command,rowCount:1,rows:[]}));assert.equal(assertOwnM7NativeTestConnectedSeedObservation(p,unit),true);
 const wrong=copy(unit);wrong[4].rowCount=0;assert.throws(()=>assertOwnM7NativeTestConnectedSeedObservation(p,wrong),/SEED_ROW_COUNT/);assert.throws(()=>assertOwnM7NativeTestConnectedSeedObservation(p,unit.map(v=>({...v,passed:true}))));assert.throws(()=>assertOwnM7NativeTestConnectedSeedObservation(copy(p),unit),/MINTED/);
 const source=readRaw('scripts/lib/own-m7-native-test-connected-fixture.mjs').toString('utf8');assert.doesNotMatch(source,/from ['"](?:node:(?:fs|net|tls|http|https|child_process)|@neondatabase|pg['"])/);assert.doesNotMatch(source,/\.query\s*\(|\b(?:fetch|execFile|createOwnM7NativeTestBusinessSession)\s*\(/);assert.doesNotMatch(source,/SET LOCAL ROLE|RESET ROLE|\bGRANT\b/);
});
