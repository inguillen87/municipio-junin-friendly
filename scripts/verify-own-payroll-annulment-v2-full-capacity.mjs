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
  'scripts/lib/own-payroll-annulment-preparation-209-native-browser.mjs',
  'scripts/lib/own-payroll-receipt126-inventory-model.mjs',
  'scripts/lib/own-payroll-receipt126-same190-inventory.mjs',
  'tests/own-payroll-receipt126-inventory-model.test.js',
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
  assert.equal(tail.historyRunsBefore29,8);assert.equal(tail.historyRuns,10);
  const selected29=tail.selected29;
  assert.equal(selected29?.version,'own-annulment29-same190-native-browser-qa.v1');assert.equal(selected29.passed,true);
  assert.equal(selected29.population,29);assert.equal(selected29.rosterPopulation,855);assert.deepEqual(selected29.partitions,[14,15]);
  assert.deepEqual(selected29.dates,['2026-10-15','2026-10-20']);assert.equal(selected29.completeCaptures,2);assert.equal(selected29.conceptRowsPerCapture,17100);
  assert.equal(selected29.historyRunsBefore,8);assert.equal(selected29.historyRunsAfter,10);
  assert.equal(selected29.addedCaptures,2);assert.equal(selected29.addedSavedResults,2);assert.equal(selected29.addedLiquidationDecisions,4);assert.equal(selected29.addedAnnulmentParents,1);assert.equal(selected29.addedCloseEvents,0);
  assert.equal(selected29.previousEightRunStatesPreserved,true);assert.equal(selected29.previousRowsPreserved,true);assert.equal(selected29.realReceiptVersionsCompared,true);
  assert.equal(selected29.browser?.selected29AnnulmentBrowserProven,true);assert.equal(selected29.browser.fullAnnulmentBrowserProven,false);
  assert.equal(selected29.browser.historicalOutcome.population,29);assert.equal(selected29.browser.historicalOutcome.runs,2);assert.equal(selected29.browser.historicalOutcome.pages,2);
  assert.equal(selected29.browser.historicalOutcome.newBusinessHttpPosts,0);assert.equal(selected29.receiptToPreparationBrowserProven,false);
  assert.equal(selected29.actualSql,true);assert.equal(selected29.actualHttp,true);assert.equal(selected29.monthlyBusinessCovered,false);assert.equal(selected29.productionWrites,0);assert.equal(selected29.paymentExecuted,false);assert.equal(selected29.municipalAcceptance,false);
  const preparation=tail.preparation209;
  assert.equal(preparation?.passed,true);assert.equal(preparation.actualSql,true);assert.equal(preparation.actualApiHandler,true);
  assert.equal(preparation.receiptToPreparationNativeProven,true);
  const handoff209Browser=preparation.handoffBrowser;
  assert.equal(handoff209Browser?.version,'own-annul-preparation209-live190-native-browser.v1');assert.equal(handoff209Browser.passed,true);assert.equal(handoff209Browser.phase,'handoff');
  assert.equal(handoff209Browser.sourceCommit,report.sourceCommit);assert.equal(handoff209Browser.major,report.major);
  assert.equal(handoff209Browser.actualSql,true);assert.equal(handoff209Browser.actualHttp,true);assert.equal(handoff209Browser.actualBrowser,true);assert.equal(handoff209Browser.receiptToPreparationBrowserProven,true);
  assert.equal(handoff209Browser.affected,855);assert.equal(handoff209Browser.projectedRuns,2);assert.equal(handoff209Browser.draftCount,285);
  assert.equal(handoff209Browser.pagePosts,0);assert.equal(handoff209Browser.calculationPosts,0);assert.equal(handoff209Browser.mutations,0);
  assert.equal(preparation.actualHttp,handoff209Browser.actualHttp);assert.equal(preparation.actualBrowser,handoff209Browser.actualBrowser);assert.equal(preparation.receiptToPreparationBrowserProven,handoff209Browser.receiptToPreparationBrowserProven);
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
  assert.equal(recalculation.before.captures,14);assert.equal(recalculation.before.saved,12);
  assert.equal(recalculation.after.captures,16);assert.equal(recalculation.after.saved,14);
  assert.equal(recalculation.recoveryAndReplayAddedRows,0);assert.equal(recalculation.previousRowsPreserved,true);
  assert.equal(recalculation.fresh209ReadAfterFirstCapture,true);
  assert.equal(recalculation.measurements.length,2);
  assert.deepEqual(recalculation.measurements.map(row=>[row.date,row.employeeCount,row.conceptRows]),preparation.dates.map((date,index)=>[date,[285,570][index],[5700,11400][index]]));
  for(const row of recalculation.measurements){assert.equal(row.recoveredIdentityAndHashesExact,true);assert.equal(row.replayedIdentityAndHashesExact,true);assert.equal(row.recoveryAndReplayAddedRows,0);}
  assert.equal(recalculation.actualCalculationApiHandler,false);assert.equal(recalculation.actualHttp,false);assert.equal(recalculation.actualBrowser,false);
  assert.equal(recalculation.atomicGetToCalculation,false);assert.equal(recalculation.durableReceiptLinkCreated,false);assert.equal(recalculation.receiptLinkedRecalculationExecuted,false);
  assert.equal(recalculation.automaticRecalculation,false);assert.equal(recalculation.monthlyBusinessCovered,false);
  assert.equal(recalculation.productionWrites,0);assert.equal(recalculation.paymentExecuted,false);assert.equal(recalculation.municipalAcceptance,false);
  // A further explicit reviewer phase; the previous recalculation phase stays unchanged.
  const confirmationClose=preparation.postPreparationConfirmationClose;
  assert.equal(confirmationClose?.version,'own-annul-preparation-explicit-confirm-close.v1');assert.equal(confirmationClose.passed,true);
  assert.equal(confirmationClose.actualSql,true);assert.equal(confirmationClose.actualLiquidationService,true);assert.equal(confirmationClose.actualCloseService,true);
  assert.equal(confirmationClose.sourceRunIds.length,2);assert.equal(new Set(confirmationClose.sourceRunIds).size,2);assert.equal(confirmationClose.exactNewRunIds,true);
  assert.equal(confirmationClose.confirmedRuns,2);assert.equal(confirmationClose.confirmedPopulation,855);assert.equal(confirmationClose.closedPopulation,855);assert.equal(confirmationClose.closedConceptRows,17100);
  assert.equal(confirmationClose.addedCaptures,0);assert.equal(confirmationClose.addedSavedResults,0);assert.equal(confirmationClose.addedLiquidationDecisions,2);assert.equal(confirmationClose.addedCloseEvents,1);
  assert.deepEqual(confirmationClose.before,recalculation.after);assert.equal(confirmationClose.after.captures,16);assert.equal(confirmationClose.after.saved,14);
  assert.equal(confirmationClose.after.liquidationEvents,confirmationClose.before.liquidationEvents+2);assert.equal(confirmationClose.after.closeEvents,confirmationClose.before.closeEvents+1);assert.equal(confirmationClose.after.creators,confirmationClose.before.creators);
  assert.equal(confirmationClose.confirmationMeasurements.length,2);assert.deepEqual(confirmationClose.confirmationMeasurements.map(row=>[row.date,row.employeeCount]),preparation.dates.map((date,index)=>[date,[285,570][index]]));
  for(const row of confirmationClose.confirmationMeasurements){assert.ok(confirmationClose.sourceRunIds.includes(row.runId));assert.equal(row.recoveryAndReplayAddedRows,0);assert.equal(row.storedIdentityAndHashesExact,true);for(const key of['detailBytes','receiptBytes','recoveryBytes','replayBytes'])assert.ok(Number.isSafeInteger(row[key])&&row[key]>0&&row[key]<=32*1024*1024);}
  assert.equal(confirmationClose.closeRecoveryMeasurements.length,3);assert.deepEqual(confirmationClose.closeRecoveryMeasurements.map(row=>row.operation),['group','attempt','command']);
  for(const row of confirmationClose.closeRecoveryMeasurements){assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=32*1024*1024);assert.equal(row.recoveryAndReplayAddedRows,0);assert.equal(row.storedIdentityAndHashesExact,true);}
  for(const key of['closeDetailBytes','closeReceiptBytes'])assert.ok(Number.isSafeInteger(confirmationClose[key])&&confirmationClose[key]>0&&confirmationClose[key]<=32*1024*1024);
  assert.equal(confirmationClose.legacyDetailRejected,confirmationClose.closeDetailBytes>4*1024*1024);assert.equal(confirmationClose.legacyReceiptRejections,confirmationClose.closeRecoveryMeasurements.filter(row=>row.bytes>4*1024*1024).length);
  assert.equal(confirmationClose.recoveryAndReplayAddedRows,0);assert.equal(confirmationClose.previousRunStatesPreserved,true);assert.equal(confirmationClose.previousRowsPreserved,true);assert.equal(confirmationClose.oldGroupPreserved,true);assert.equal(confirmationClose.originalPreparationRejectedByCurrentState,true);
  assert.equal(confirmationClose.actualApiHandler,false);assert.equal(confirmationClose.actualHttp,false);assert.equal(confirmationClose.actualBrowser,false);assert.equal(confirmationClose.atomicGetToCalculation,false);assert.equal(confirmationClose.durableReceiptLinkCreated,false);assert.equal(confirmationClose.receiptLinkedRecalculationExecuted,false);
  assert.equal(confirmationClose.monthlyBusinessCovered,false);assert.equal(confirmationClose.ownPayrollReceiptsPrepared,false);assert.equal(confirmationClose.productionWrites,0);assert.equal(confirmationClose.paymentExecuted,false);assert.equal(confirmationClose.municipalAcceptance,false);
  // Inventory presence is diagnostic; these are never installation/workflow gates.
  const receipt126Inventory=preparation.receipt126Inventory;
  assert.equal(receipt126Inventory?.version,'own-receipt126-inventory-classification.v1');assert.equal(receipt126Inventory.formValidated,true);
  assert.equal(receipt126Inventory.sameCanonical190,true);assert.equal(receipt126Inventory.observedBy,'existing_h_json_readonly_full');assert.equal(receipt126Inventory.queryCount,1);
  assert.equal(receipt126Inventory.metadataOnly,true);assert.equal(receipt126Inventory.installationAllowed,false);assert.equal(receipt126Inventory.receiptWorkflowExecuted,false);
  assert.ok(['ausente','parcial','objetos_presentes_sin_admision'].includes(receipt126Inventory.classification));
  assert.ok([0,1].includes(receipt126Inventory.counts.tables));for(const field of['functions','capabilityDefinitions'])assert.ok(Number.isSafeInteger(receipt126Inventory.counts[field])&&receipt126Inventory.counts[field]>=0);
  assert.match(receipt126Inventory.inventory.schema.name,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(receipt126Inventory.inventory.bodyHashBasis,'pg_proc.prosrc_utf8_lf');
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
