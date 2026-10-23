// Finite backend126 continuation on the SAME canonical190. No browser or new executor.
// Source authorship/adoption never grants native execution or releases GLOBAL_SQL_STOP.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildReceipt126Same190Support} from './own-payroll-receipt126-same190-support.mjs';
import {buildOwnReceipt126Same190Shape,assertOwnReceipt126Same190ShapeProof,receipt126ExactForeignTriggerExclusion} from './own-payroll-receipt126-same190-shape.mjs';
import {buildOwnReceipt126Same190Installation,assertOwnReceipt126Same190InstallationProof,receipt126InstallationFailure} from './own-payroll-receipt126-same190-installation.mjs';
import {buildOwnReceipt126Same190Actors,assertOwnReceipt126Same190ActorsProof,buildOwnReceipt126Same190CheckerRestore} from './own-payroll-receipt126-same190-actors.mjs';
import {runOwnReceipt126Same190Circuit} from './own-payroll-receipt126-same190-circuit.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {ownFullCapacity190Snapshot} from './own-payroll-full-capacity-190-installation.mjs';
import {ownerProgramQaAccess} from './municipal-owner-program-qa.mjs';
import {createOwnReceiptHandler} from '../../api/internal-own-payroll-receipts.js';
import {ownReceiptParams,ownReceiptCommand,verifiedOwnReceiptPreview,ownReceiptBatch,ownReceiptSelf,ownReceiptVisibleRecords,ownReceiptPresentation} from '../../assets/own-payroll-receipt-model.js';
import {createOwnReceiptPdf} from '../../assets/own-payroll-receipt-pdf.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';

// Explicit RAW dependencies not discoverable from JavaScript imports (including HTML/SQL).
export const OWN_RECEIPT126_BACKEND_SOURCE_ENTRIES=Object.freeze([
 'api/internal-own-payroll-receipts.js',
 'assets/own-payroll-close-model.js',
 'assets/own-payroll-receipt-model.js',
 'assets/own-payroll-receipt-panel.js',
 'assets/own-payroll-receipt-pdf.js',
 'assets/own-payroll-receipt-self.js',
 'assets/own-payroll-report-model.js',
 'assets/own-payroll-response.js',
 'assets/own-payroll-run-workspace-model.js',
 'assets/payroll-detail-export.js',
 'centro-acciones.html',
 'lib/internal-native-employees.js',
 'lib/internal-own-payroll-receipts.js',
 'lib/municipal-document-issuer.js',
 'lib/own-payroll-response.js',
 'lib/private-json-body.js',
 'scripts/internal-schema.sql',
 'scripts/lib/municipal-owner-adoption-decision-qa.mjs',
 'scripts/lib/municipal-owner-program-qa.mjs',
 'scripts/lib/native-leave-installation.mjs',
 'scripts/lib/own-annulment-preparation-209-actors-fixture.mjs',
 'scripts/lib/own-monthly-day-engine-circuit-fixture.mjs',
 'scripts/lib/own-payroll-canonical190-browser-host-qa.mjs',
 'scripts/lib/own-payroll-full-capacity-190-continuation.mjs',
 'scripts/lib/own-payroll-full-capacity-190-installation.mjs',
 'scripts/lib/own-payroll-full-capacity-190-rpc.mjs',
 'scripts/lib/own-payroll-installation.mjs',
 'scripts/lib/own-payroll-receipt-installation.mjs',
 'scripts/lib/own-payroll-receipt126-backend-190-continuation.mjs',
 'scripts/lib/own-payroll-receipt126-inventory-model.mjs',
 'scripts/lib/own-payroll-receipt126-same190-actors.mjs',
 'scripts/lib/own-payroll-receipt126-same190-circuit.mjs',
 'scripts/lib/own-payroll-receipt126-same190-installation.mjs',
 'scripts/lib/own-payroll-receipt126-same190-inventory.mjs',
 'scripts/lib/own-payroll-receipt126-same190-shape.mjs',
 'scripts/lib/own-payroll-receipt126-same190-support.mjs',
 'scripts/lib/own-payroll-report-census-190-iam-fixture.mjs',
 'scripts/lib/owner-qa-source-closure-reader.mjs',
 'scripts/lib/salary-auxiliary-namespace-installation.mjs',
 'scripts/migrations/004-tenant-iam-control-plane.sql',
 'scripts/migrations/005-tenant-identity-gateway.sql',
 'scripts/migrations/006-tenant-action-authority.sql',
 'scripts/migrations/009-tenant-lifecycle-hardening.sql',
 'scripts/migrations/013-existing-identity-membership-governance.sql',
 'scripts/migrations/026-governed-payroll-novelties.sql',
 'scripts/migrations/041-governed-payroll-parameters.sql',
 'scripts/migrations/067-native-employee-registration.sql',
 'scripts/migrations/104-native-employment-changes.sql',
 'scripts/migrations/112-native-salary-definitions.sql',
 'scripts/migrations/113-native-employee-self-access.sql',
 'scripts/migrations/123-own-payroll-runs.sql',
 'scripts/migrations/124-own-payroll-liquidation-decisions.sql',
 'scripts/migrations/126-own-payroll-receipts.sql',
 'scripts/migrations/142-adopted-own-payroll-receipts.sql',
 'scripts/migrations/176-own-payroll-administrative-operator.sql',
 'scripts/migrations/201-own-full-payroll-decision-capacity.sql',
 'scripts/verify-municipal-owner-adoption-authority.mjs',
 'scripts/verify-municipal-owner-adoption-decision.mjs',
 'scripts/verify-municipal-owner-program.mjs',
 'scripts/verify-own-payroll-annulment-v2-full-capacity.mjs',
 'scripts/verify-own-payroll-full-capacity.mjs',
 'tests/own-payroll-receipt126-pdf-oracle.test.js',
 'tests/owner-qa-source-closure-reader.test.js'
]);

const SHAPE=Object.freeze({assertShape:assertOwnReceipt126Same190ShapeProof,exactForeignTriggerExclusion:receipt126ExactForeignTriggerExclusion});
const INSTALL=Object.freeze({buildSupport:buildReceipt126Same190Support,buildShape:buildOwnReceipt126Same190Shape,...SHAPE,splitStatements:splitPostgresStatements,functionPin:ownInstallationFunctionPin,pinsCheck});
const errorState=(error)=>({name:error?.name??'Error',message:String(error?.message??error)});

export async function runOwnReceipt126Backend190Continuation(context){
 const {h,db,qa,maker,contracts,second,closed,closedCensus}=context;
 assert.strictEqual(h.qa,qa);assert.equal(context.version,'own-receipt126-backend-after-closed127.v1');
 assert.equal(typeof h.readRaw,'function','RECEIPT126_GOVERNED_RAW_READER_REQUIRED');
 for(const name of ['json','expectRollback'])assert.equal(typeof h[name],'function','RECEIPT126_EXISTING_EXECUTOR_REQUIRED:'+name);
 for(const name of ['run','query'])assert.equal(typeof db?.[name],'function','RECEIPT126_SAME190_BRIDGE_REQUIRED:'+name);
 assert.ok(h.sourceCustody&&h.sourceCustody.sourceCommit===h.sourceCommit,'RECEIPT126_SOURCE_CUSTODY_REQUIRED');
 assert.equal(h.major,qa.major);assert.equal(h.sourceCommit,qa.sourceCommit);
 const readRaw=h.readRaw,graph=qa.foundation.foundation.foundation.owner.graph,foundationSeed=qa.seed,normalized=qa.normalized;
 assert.ok(graph.pool instanceof Map);assert.equal(typeof foundationSeed,'string');assert.equal(typeof normalized,'function');
 const closeReference={groupId:closed.groupId,snapshotSha256:closed.snapshotSha256,period:closed.body.period,liquidationType:closed.body.liquidationType,employeeCount:closed.snapshot.employeeCount,conceptCount:closed.snapshot.conceptCount,populationComplete:closed.snapshot.populationComplete};
 const installationPlan=buildOwnReceipt126Same190Installation({schema:qa.schema,major:h.major,sourceCommit:h.sourceCommit,closeReference,foundationSeed,graph,normalized,readRaw,dependencies:INSTALL});
 const native=[],counts={installationRollbacks:0,installationLateFaultRollbacks:0,installationCommits:0,actorSetupCommits:0,checkerRestoreCommits:0},installation={plan:installationPlan,rehearsal:null,verifiedRehearsal:null,lateFaultRollback:null,proof:null,verified:null};
 let primary=null,restoreError=null,actorsPlan=null,actorsProof=null,setupAttempted=false,setupReturned=false,setupVerified=false,restorePlan=null,restoreAttempted=false,restoreReturned=false,restoreProof=null,tail=null;
 const invoke=(phase,statements,{end='COMMIT'}={})=>{
  const record={phase,requestedEnd:end,attempted:true,returned:false,proof:null,failure:null};native.push(record);
  try{const proof=h.json(statements,{end,fullJson:true});record.returned=true;record.proof=proof;return proof;}
  catch(error){record.failure=errorState(error);const failure=new AggregateError([error],'RECEIPT126_NATIVE_RETURN_UNCERTAIN:'+phase,{cause:error});failure.receipt126Native=record;failure.GLOBAL_SQL_STOP=true;throw failure;}
 };
 const restore=async({h:givenH,plan,actorsPlan:givenPlan,actorsProof:givenProof})=>{
  assert.strictEqual(givenH,h);assert.strictEqual(givenPlan,actorsPlan);assert.strictEqual(givenProof,actorsProof);assert.strictEqual(plan,restorePlan);
  assert.equal(setupVerified,true);assert.equal(restoreAttempted,false,'RECEIPT126_RESTORE_ALREADY_ATTEMPTED');
  restoreAttempted=true;counts.checkerRestoreCommits++;
  restoreProof=invoke('checker-restore',restorePlan.statements);restoreReturned=true;
  assert.equal(restoreProof.version,'own-receipt126-same190-checker-restore.v1');assert.equal(restoreProof.exactOverrideRemoved,true);assert.equal(restoreProof.allMembershipSodChecked,true);
  assert.equal(restoreProof.actorRowsDeleted,0);assert.equal(restoreProof.receiptRowsChanged,0);assert.deepEqual(restoreProof.before,restoreProof.after);assert.deepEqual(restoreProof.checkerCapabilities,actorsProof.checkerCapabilitiesBefore);
  return restoreProof;
 };
 try{
  // Each rollback has its OWN closed native proof/OIDs; no rehearsal proof is reused as installed.
  const before=ownFullCapacity190Snapshot(h);counts.installationRollbacks++;
  installation.rehearsal=invoke('installation-rehearsal',installationPlan.statements,{end:'ROLLBACK'});
  installation.verifiedRehearsal=assertOwnReceipt126Same190InstallationProof(installationPlan,installation.rehearsal,{requestedEnd:'ROLLBACK',dependencies:SHAPE});
  assert.deepEqual(ownFullCapacity190Snapshot(h),before,'RECEIPT126_REHEARSAL_STATE_CHANGED');
  // Fault BEFORE the final large proof SELECT keeps the existing expected-error profile finite.
  const late=[...installationPlan.statements.slice(0,-1),installationPlan.lateFaultStatement,installationPlan.statements.at(-1)];
  counts.installationLateFaultRollbacks++;
  const fault=h.expectRollback(late,'QA_RECEIPT126_INSTALL_LATE_FAULT');
  installation.lateFaultRollback=fault;
  assert.equal(fault.status,3);assert.deepEqual(ownFullCapacity190Snapshot(h),before,'RECEIPT126_LATE_FAULT_STATE_CHANGED');
  counts.installationCommits++;
  try{installation.proof=invoke('installation-commit',installationPlan.statements);installation.verified=assertOwnReceipt126Same190InstallationProof(installationPlan,installation.proof,{requestedEnd:'COMMIT',dependencies:SHAPE});}
  catch(error){const record=native.find(row=>row.phase==='installation-commit');error.receipt126Installation=receipt126InstallationFailure({primary:errorState(error),nativeAttempted:Boolean(record),nativeReturned:record?.returned===true,requestedEnd:'COMMIT'});throw error;}
  // Caller owns restoration custody from BEFORE setup, including failure before entry into circuit.
  actorsPlan=buildOwnReceipt126Same190Actors({qa,contracts,readRaw,dependencies:{randomUUID}});
  setupAttempted=true;counts.actorSetupCommits++;
  actorsProof=invoke('actor-setup',actorsPlan.statements);setupReturned=true;
  assertOwnReceipt126Same190ActorsProof(actorsPlan,actorsProof);setupVerified=true;
  restorePlan=buildOwnReceipt126Same190CheckerRestore(actorsPlan,actorsProof);
  const dependencies={verifyInstallation:({h:givenH,plan,proof,phase})=>{
   assert.strictEqual(givenH,h);assert.strictEqual(plan,installationPlan);assert.strictEqual(proof,installation.proof);assert.equal(phase,'before-receipt-circuit');
   assert.equal(native.find(row=>row.phase==='installation-commit')?.returned,true);
   return assertOwnReceipt126Same190InstallationProof(plan,proof,{requestedEnd:'COMMIT',dependencies:SHAPE});
  },assertActorsProof:assertOwnReceipt126Same190ActorsProof,buildCheckerRestore:(plan,proof)=>{assert.strictEqual(plan,actorsPlan);assert.strictEqual(proof,actorsProof);assert.ok(restorePlan);return restorePlan;},executeCheckerRestore:restore,ownerProgramQaAccess,createOwnReceiptHandler,ownReceiptParams,ownReceiptCommand,verifiedOwnReceiptPreview,ownReceiptBatch,ownReceiptSelf,ownReceiptVisibleRecords,ownReceiptPresentation,createOwnReceiptPdf,ownRunHash,randomUUID};
  tail=await runOwnReceipt126Same190Circuit({version:'own-receipt126-after-closed127-context.v1',h,db,qa,maker,contracts,second,closed,closedCensus,actorsPlan,actorsProof,installationPlan,installationProof:installation.proof,readRaw},dependencies);
  assert.strictEqual(tail.checkerRestore,restoreProof);assert.equal(restoreAttempted,true);assert.equal(restoreReturned,true);
 }catch(error){primary=error;}
 finally{
  if(setupVerified&&!restoreAttempted&&restorePlan){try{await restore({h,plan:restorePlan,actorsPlan,actorsProof});}catch(error){restoreError=error;}}
  else if(setupAttempted&&(!setupReturned||!setupVerified||!restorePlan)){restoreError=Error('RECEIPT126_SETUP_OR_RESTORE_PLAN_UNCERTAIN_NO_AUTOMATIC_RESTORE');}
 }
 if(restoreError){const error=new AggregateError([primary,restoreError].filter(Boolean),'RECEIPT126_BACKEND_PRIMARY_AND_RESTORE_UNCERTAIN',{cause:primary??restoreError});error.cleanupUncertain=true;error.receipt126={counts,native,setupAttempted,setupReturned,setupVerified,restoreAttempted,restoreReturned,restoreProof,GLOBAL_SQL_STOP:true};throw error;}
 if(primary){primary.receipt126={counts,native,setupAttempted,setupReturned,setupVerified,restoreAttempted,restoreReturned,restoreProof,GLOBAL_SQL_STOP:true};throw primary;}
 assert.ok(tail);assert.equal(counts.actorSetupCommits,1);assert.equal(counts.checkerRestoreCommits,1);
 let reopenedDone=false,disposed=false;
 return Object.freeze({
  approved:tail,installation,actorsPlan,actorsProof,checkerRestore:restoreProof,
  afterReopen:async reopened=>{
   assert.equal(disposed,false);assert.equal(reopenedDone,false,'RECEIPT126_BACKEND_REOPEN_ALREADY_CONSUMED');reopenedDone=true;
   const completed=await tail.afterReopen(reopened);
   assert.equal(completed.receiptEventsTotal,3);assert.equal(completed.receiptBatches,1);for(const key of ['additionalCaptures','additionalSavedResults','additionalLiquidationDecisions','additionalAnnulments','additionalCloseEvents','additionalReopens'])assert.equal(completed[key],0);
   assert.strictEqual(completed.checkerRestore,restoreProof);
   return{version:'own-receipt126-same190-backend-result.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,schema:qa.schema,circuit:completed,installation,actorsPlan,actorsProof,checkerRestore:restoreProof,native,counts,actualSql:true,realHandlerInvoked:true,actualNetworkHttp:false,browserProven:false,paymentExecuted:false,municipalAcceptance:false,GLOBAL_SQL_STOP:true};
  },
  dispose:async()=>{if(disposed)return{closed:true,alreadyDisposed:true};disposed=true;return tail.dispose();}
 });
}
