// Pure connected-fixture plan. The v1 fixture supplies audited data only;
// its single-transaction rollback contract is not claimed to have executed.
// No SDK, connection, role switch, SQL executor, end command or receipt mint.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildOwnM7NativeTestFixturePlan,assertOwnM7NativeTestFixturePlan,materializeOwnM7NativeTestEmployee,assertOwnM7NativeTestSeedObservation} from './own-m7-native-test-fixture.mjs';

export const OWN_M7_NATIVE_TEST_CONNECTED_FIXTURE_VERSION='own-m7-native-test-connected-fixture.v2';
export const OWN_M7_NATIVE_TEST_CONNECTED_TEMPLATE_PIN=Object.freeze({path:'scripts/lib/own-m7-native-test-fixture.mjs',sha256:'223e586024a2ca0bf2f21d505e7efef4e4616c35fccfa2e8f84e9e86276ee2de'});
const minted=new WeakMap(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const exact=(value,keys,code)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),code);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),code);};
const baseline=Object.freeze({tenant:1,binding:1,policy:1,users:2,roles:2,roleCapabilities:25,memberships:2,authority:2,sessions:2,persons:2,contracts:2,registrations:2,links:2,catalogProposal:1,catalogReview:1});

/** A separate owner seed COMMIT is explicitly expected to retain two synthetic
 * operators/catalog1. Runtime LOGIN business later rolls back in its own RC
 * transaction. An external root controller owns all admission and SQL. */
export function buildOwnM7NativeTestConnectedFixturePlan(options){
 exact(options,['readRaw','sourceCommit','testTargetAdmission','runId'],'M7_CONNECTED_FIXTURE_OPTIONS');
 const pin=OWN_M7_NATIVE_TEST_CONNECTED_TEMPLATE_PIN,readRaw=options.readRaw;assert.equal(typeof readRaw,'function','M7_CONNECTED_FIXTURE_RAW_READER');
 const observed=readRaw(pin.path);assert.ok(Buffer.isBuffer(observed),'M7_CONNECTED_FIXTURE_BUFFER_REQUIRED');const templateRaw=Buffer.from(observed);assert.equal(sha(templateRaw),pin.sha256,'M7_CONNECTED_FIXTURE_TEMPLATE_CHANGED');
 const base=buildOwnM7NativeTestFixturePlan(options);assert.equal(base.version,'own-m7-native-test-fixture.v1');assert.equal(base.kind,'test');assert.equal(base.transaction.end,'ROLLBACK');assert.equal(base.transaction.retentionExpected,false);
 assert.equal(base.bootstrapOwner.statements.length,46);assert.equal(base.bootstrapOwner.expectedCommands.filter(c=>c==='INSERT').length,45);assert.equal(base.bootstrapOwner.expectedCommands.filter(c=>c==='UPDATE').length,1);assert.equal(base.expectedCounts.actors,2);
 const sourceHashes={...base.sourceHashes,[pin.path]:pin.sha256},sourceInputs={...base.sourceInputs,[pin.path]:{bytes:templateRaw.length,sha256:pin.sha256}};
 const steps=[
  {id:'seed-preconditions',role:'owner-login',batch:'bootstrapOwner',isolation:'read committed',readOnly:false,end:'COMMIT',mustBeObserved:true,seedOnly:true,retentionExpected:true},
  {id:'seed-baseline',role:'observer-owner-login',isolation:'repeatable read',readOnly:true,end:'COMMIT',freshTransaction:true,expectedCounts:'baselineExpectedCounts'},
  {id:'begin-business',role:'runtime-login',isolation:'read committed',readOnly:false,sessionUser:'municontrol_actions_runtime_app',currentUser:'municontrol_actions_runtime_app'},
  ...base.steps.filter(step=>!['seed-preconditions','rollback'].includes(step.id)).map(step=>({...step,...(['calculate','recalculate'].includes(step.id)?{deps:{fullJson:true},selection:'beneficiary-contract-only',protocol:'published-monthly-fixed-v1'}:{}),...(step.id==='close'?{expectedEmployees:1,expectedPopulationTotal:3,expectedComplete:false}:{}),...(step.id==='annul-v2'?{deps:{fullJson:true},requiresRealReviewV2:true}:{})})),
  {id:'receipt-preview',actor:'checker',service:'lib/internal-own-payroll-receipts.js',export:'ownReceiptOperation',operation:'preview',requiresRealResult:true,preparesOrApproves:false},
  {id:'business-rollback',role:'runtime-login',end:'ROLLBACK',mustBeObserved:true},
  {id:'post-rollback-baseline',role:'same-observer-owner-login',isolation:'repeatable read',readOnly:true,end:'COMMIT',freshTransaction:true,expectedCounts:'postRollbackExpectedCounts',compareActualSeedBaseline:true,beneficiaryAbsent:true},
 ];
 const plan=freeze({
  version:OWN_M7_NATIVE_TEST_CONNECTED_FIXTURE_VERSION,kind:'test',schema:'public',sourceCommit:base.sourceCommit,runId:base.runId,target:base.target,branchCreation:base.branchCreation,
  template:{version:base.version,source:pin,usage:'data-and-input-validation-only',executedAsProtocol:false},
  scope:base.scope,actors:base.actors,subjects:base.subjects,canonical:base.canonical,seededCatalog:base.seededCatalog,bootstrapOwner:base.bootstrapOwner,steps,
  seedEnd:'COMMIT',seedRetentionExpected:true,retentionExpected:true,businessEnd:'ROLLBACK',protocol:'published-monthly-fixed-v1',fullfixedV2Pending:true,
  transactions:{seed:{isolation:'read committed',readOnly:false,end:'COMMIT',observedEndRequired:true,seedOnly:true,retentionExpected:true},seedObserver:{isolation:'repeatable read',readOnly:true,end:'COMMIT',freshTransaction:true},business:{isolation:'read committed',readOnly:false,end:'ROLLBACK',observedEndRequired:true,runtimeLoginRequired:true},rollbackObserver:{isolation:'repeatable read',readOnly:true,end:'COMMIT',freshTransaction:true,sameObserverClient:true}},
  baselineExpectedCounts:{...baseline},postRollbackExpectedCounts:{...baseline},
  businessScenario:{selection:'beneficiary-contract-only',selectionContracts:1,rosterTotal:3,closeEmployees:1,closePopulationTotal:3,closeComplete:false,runDependencies:{fullJson:true},protocol:'published-monthly-fixed-v1',fullfixedV2Pending:true,entryPoint:'library-services',httpDefaultCovered:false,receiptPreview:true,receiptPrepare:false,receiptApprove:false,beneficiarySelfReceipt:false},
  beneficiaryExpectedAfterRollback:{person:0,contract:0,registration:0},
  expectedCounts:base.expectedCounts,authentication:base.authentication,issuer:base.issuer,pending:base.pending,
  sourceHashes,sourceInputs,sourceManifestSha256:sha(JSON.stringify(sourceInputs)),
  noNewPermissions:true,roleSwitchUsed:false,seedIsBusinessEvidence:false,automaticCleanup:false,automaticRetry:false,
  sourceOnly:true,productionAdmitted:false,executionAdmitted:false,connects:false,executesSql:false,
 });
 minted.set(plan,{base,readRaw,templateRaw});assertOwnM7NativeTestConnectedFixturePlan(plan);return plan;
}

export function assertOwnM7NativeTestConnectedFixturePlan(plan){
 const state=minted.get(plan);assert.ok(state,'M7_CONNECTED_FIXTURE_MINTED_REQUIRED');assert.equal(plan.version,OWN_M7_NATIVE_TEST_CONNECTED_FIXTURE_VERSION);assert.equal(plan.seedEnd,'COMMIT');assert.equal(plan.seedRetentionExpected,true);assert.equal(plan.businessEnd,'ROLLBACK');assert.equal(plan.protocol,'published-monthly-fixed-v1');assert.equal(plan.fullfixedV2Pending,true);assert.deepEqual(plan.businessScenario.runDependencies,{fullJson:true});
 assertOwnM7NativeTestFixturePlan(state.base);const after=state.readRaw(OWN_M7_NATIVE_TEST_CONNECTED_TEMPLATE_PIN.path);assert.ok(Buffer.isBuffer(after),'M7_CONNECTED_FIXTURE_BUFFER_REQUIRED');assert.ok(state.templateRaw.equals(after),'M7_CONNECTED_FIXTURE_TEMPLATE_RAW_DRIFT');return plan;
}
export function bookendOwnM7NativeTestConnectedFixture(plan){assertOwnM7NativeTestConnectedFixturePlan(plan);return true;}

export function materializeOwnM7NativeTestConnectedEmployee(options){
 exact(options,['plan','subject','bootstrap'],'M7_CONNECTED_FIXTURE_EMPLOYEE_OPTIONS');assertOwnM7NativeTestConnectedFixturePlan(options.plan);
 return materializeOwnM7NativeTestEmployee({plan:minted.get(options.plan).base,subject:options.subject,bootstrap:options.bootstrap});
}

/** Count/tag validation is structural only; an actual transport and root
 * custody must establish whether a seed COMMIT was observed and is durable. */
export function assertOwnM7NativeTestConnectedSeedObservation(plan,observations){
 assertOwnM7NativeTestConnectedFixturePlan(plan);return assertOwnM7NativeTestSeedObservation(minted.get(plan).base,observations);
}
