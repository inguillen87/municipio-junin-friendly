// SOURCE CANDIDATE. One canonical190 owner, source custody, cleanup and DB transport.
// This entry does not install another foundation or dispatch CI on its own.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyMunicipalOwnerProgram} from './verify-municipal-owner-program.mjs';
import {ownerAuthorityQaOptions} from './verify-municipal-owner-adoption-authority.mjs';
import {OWN_MONTHLY_FULL_CAPACITY_QA_ENTRIES,prepareOwnMonthlyFullCapacity,continueOwnMonthlyFullCapacity} from './verify-own-monthly-payroll-full-capacity.mjs';

const entries=[...OWN_MONTHLY_FULL_CAPACITY_QA_ENTRIES,
  'scripts/verify-own-payroll-annulment-v2-full-capacity.mjs',
  'scripts/lib/own-payroll-annulment-review-v2-installation.mjs',
  'scripts/lib/own-payroll-annulment-v2-native-continuation.mjs',
  'scripts/lib/own-payroll-annulment-v2-native-browser.mjs',
  'scripts/migrations/208-own-annulment-review-index.sql',
  'assets/own-payroll-annulment-review-model.js',
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
  'tests/own-payroll-full-decision-capacity-source.test.js'
];

export async function verifyOwnAnnulmentV2FullCapacity(options){
  assert.ok(options.operationalPairBaseline===undefined||options.operationalPairBaseline==='published107');
  const report=await verifyMunicipalOwnerProgram({...options,operationalPairBaseline:'published107'},{
    prepareContinuation:prepareOwnMonthlyFullCapacity,
    continuation:h=>continueOwnMonthlyFullCapacity(h,{annulmentV2Browser:true,annulmentPreparation:true}),
    continuationEntries:entries
  });
  assert.equal(report.passed,true);assert.equal(report.priorDatabasePreserved,true);
  assert.equal(report.syntheticSchemaRemoved,true);assert.equal(report.sourceAfter?.passed,true);
  assert.equal(report.continuation?.monthlyTechnical?.passed,true);
  assert.equal(report.continuation?.capacity?.passed,true);
  assert.equal(report.continuation?.capacity?.population,855);
  assert.equal(report.continuation?.capacity?.conceptRows,17100);
  const tail=report.continuation.capacity.annulmentV2Browser;
  assert.equal(tail?.passed,true);assert.equal(tail.actualSql,true);
  assert.equal(tail.browser?.passed,true);assert.equal(tail.browser.actualHttp,true);
  assert.equal(tail.browser.fullAnnulmentBrowserProven,true);
  assert.equal(tail.browser.fullCapacityBrowserProven,false);
  assert.equal(tail.browser.receiptToPreparationBrowserProven,false);
  const preparation=tail.preparation209;
  assert.equal(preparation?.passed,true);assert.equal(preparation.actualSql,true);assert.equal(preparation.actualApiHandler,true);
  assert.equal(preparation.receiptToPreparationNativeProven,true);assert.equal(preparation.receiptToPreparationBrowserProven,false);
  assert.equal(preparation.population,855);assert.equal(preparation.conceptRowsPerRun,17100);assert.equal(preparation.receiverIsThirdManagedPreparer,true);
  assert.equal(preparation.atomicGetToCalculation,false);assert.equal(preparation.receiptLinkedRecalculationExecuted,false);assert.equal(preparation.monthlyBusinessCovered,false);
  assert.equal(preparation.productionWrites,0);assert.equal(preparation.municipalAcceptance,false);
  // Separate explicit post-draft actions; preparation itself stays unconfirmed.
  // These assertions are mandatory, not a browser/HTTP or monthly-business claim.
  assert.equal(preparation.newSavedCaptures,4);assert.equal(preparation.preparationPhaseSavedCaptures,2);
  const recalculation=preparation.postPreparationRecalculation;
  assert.equal(recalculation?.version,'own-annul-preparation-explicit-recalculation.v1');
  assert.equal(recalculation.passed,true);assert.equal(recalculation.actualSql,true);assert.equal(recalculation.actualCalculationService,true);
  assert.deepEqual(recalculation.dates,preparation.dates);assert.deepEqual(recalculation.partitions,[285,570]);
  assert.equal(recalculation.populationUnion,855);assert.equal(recalculation.conceptRowsUnion,17100);
  assert.equal(recalculation.addedCaptures,2);assert.equal(recalculation.addedSavedResults,2);
  assert.equal(recalculation.addedLiquidationDecisions,0);assert.equal(recalculation.addedCloseEvents,0);
  assert.equal(recalculation.before.captures,12);assert.equal(recalculation.before.saved,10);
  assert.equal(recalculation.after.captures,14);assert.equal(recalculation.after.saved,12);
  assert.equal(recalculation.recoveryAndReplayAddedRows,0);assert.equal(recalculation.previousRowsPreserved,true);
  assert.equal(recalculation.fresh209ReadAfterFirstCapture,true);
  assert.equal(recalculation.measurements.length,2);
  assert.deepEqual(recalculation.measurements.map(row=>[row.date,row.employeeCount,row.conceptRows]),preparation.dates.map((date,index)=>[date,[285,570][index],[5700,11400][index]]));
  for(const row of recalculation.measurements){assert.equal(row.recoveredIdentityAndHashesExact,true);assert.equal(row.replayedIdentityAndHashesExact,true);assert.equal(row.recoveryAndReplayAddedRows,0);}
  assert.equal(recalculation.actualCalculationApiHandler,false);assert.equal(recalculation.actualHttp,false);assert.equal(recalculation.actualBrowser,false);
  assert.equal(recalculation.atomicGetToCalculation,false);assert.equal(recalculation.durableReceiptLinkCreated,false);assert.equal(recalculation.receiptLinkedRecalculationExecuted,false);
  assert.equal(recalculation.automaticRecalculation,false);assert.equal(recalculation.monthlyBusinessCovered,false);
  assert.equal(recalculation.productionWrites,0);assert.equal(recalculation.paymentExecuted,false);assert.equal(recalculation.municipalAcceptance,false);
  assert.equal(report.continuation.monthlyBusinessCovered,false);
  assert.equal(report.productionWrites,0);assert.equal(report.municipalAcceptance,false);
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  verifyOwnAnnulmentV2FullCapacity(ownerAuthorityQaOptions(process.argv.slice(2)))
    .then(report=>console.log(JSON.stringify({passed:report.passed,sourceCommit:report.sourceCommit,
      major:report.major,annulment855:true,preparation209Native:true,completeMunicipalCircuit:false,monthlyBusiness:false,municipalAcceptance:false})))
    .catch(error=>{console.error(error.stack);for(const cause of error.errors??[])console.error(cause.stack);process.exitCode=1;});
}
