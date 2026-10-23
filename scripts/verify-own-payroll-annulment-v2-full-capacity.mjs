// SOURCE CANDIDATE. One canonical190 owner, source custody, cleanup and DB transport.
// This entry does not install another foundation or dispatch CI on its own.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyMunicipalOwnerProgram} from './verify-municipal-owner-program.mjs';
import {ownerAuthorityQaOptions} from './verify-municipal-owner-adoption-authority.mjs';
import {OWN_MONTHLY_FULL_CAPACITY_QA_ENTRIES,prepareOwnMonthlyFullCapacity,continueOwnMonthlyFullCapacity} from './verify-own-monthly-payroll-full-capacity.mjs';

// The served product is read through fs by browser124, so every one of its
// twelve raw source assets is an explicit entry before the owner source bookend.
const decision124Assets=Object.freeze([
  'assets/own-payroll-liquidation-panel.js',
  'assets/own-payroll-liquidation-model.js',
  'assets/own-payroll-run-panel.js',
  'assets/own-payroll-run-workspace-model.js',
  'assets/own-payroll-annulment-preparation-link.js',
  'assets/payroll-navigation.js',
  'assets/own-payroll-readiness-model.js',
  'assets/own-payroll-response.js',
  'assets/native-salary-catalog-model.js',
  'assets/own-payroll-run-model.js',
  'assets/own-payroll-run-date.js',
  'assets/own-payroll-individual-panel.js'
]);

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
  'scripts/lib/own-payroll-liquidation-decision-124-native-browser.mjs',
  'scripts/lib/own-payroll-liquidation-current190-regressions-browser.mjs',
  'scripts/lib/own-payroll-liquidation-current190-continuation-browser.mjs',
  'scripts/lib/own-payroll-initial-empty-current190-browser.mjs',
  'scripts/lib/own-payroll-sql-revocation-current190-browser.mjs',
  'tests/fixtures/current190-revocation-source-projection.js',
  'tests/fixtures/current190-ui-source-projection.js',
  'scripts/lib/own-payroll-agreement-annulment-current190-browser.mjs',
  'scripts/lib/own-payroll-canonical190-browser-host-qa.mjs',
  ...decision124Assets,
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

// Runtime artifacts are outputs of the admitted native run, never source inputs.
// Each path and each omission below mirrors one exact writer in this entry's
// closed source epoch. Full receipt/capture DTOs remain in the parent report.
const browserArtifactDecisionReference=receipt=>({id:receipt.id,keyJsonSha256:jsonSha(receipt.key),runId:receipt.runId,resultSha256:receipt.resultSha256,bodySha256:receipt.bodySha256,command:receipt.body.command,affectedCount:receipt.affected.length,affectedJsonSha256:jsonSha(receipt.affected)});
const browserArtifactCaptureReference=capture=>({id:capture.id,keyJsonSha256:jsonSha(capture.key),bodySha256:capture.bodySha256,payloadSha256:capture.payloadSha256,algorithmSha256:capture.algorithmSha256,inputSha256:capture.saved.inputSha256,resultSha256:capture.saved.resultSha256,employeeCount:capture.saved.result.employeeCount,conceptRowCount:capture.saved.result.rowCount});
const jsonSha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const current190UiArtifactProfiles=Object.freeze({"liquidation124-initial-verified-empty-browser/report.json":["assets/own-payroll-liquidation-panel.js","assets/own-payroll-liquidation-model.js","assets/own-payroll-run-panel.js","assets/own-payroll-run-workspace-model.js","assets/own-payroll-annulment-preparation-link.js","assets/payroll-navigation.js","assets/own-payroll-readiness-model.js","assets/own-payroll-response.js","assets/native-salary-catalog-model.js","assets/own-payroll-run-model.js","assets/own-payroll-run-date.js","assets/own-payroll-individual-panel.js"],"liquidation124-current-regressions-browser/report.json":["assets/own-payroll-liquidation-panel.js","assets/own-payroll-liquidation-model.js","assets/own-payroll-run-workspace-model.js","assets/own-payroll-run-model.js","assets/own-payroll-response.js","assets/own-payroll-individual-panel.js","assets/native-salary-catalog-model.js"],"liquidation124-calculation-recovery-browser/report.json":["assets/own-payroll-liquidation-panel.js","assets/own-payroll-liquidation-model.js","assets/own-payroll-run-panel.js","assets/own-payroll-run-workspace-model.js","assets/own-payroll-annulment-preparation-link.js","assets/payroll-navigation.js","assets/own-payroll-readiness-model.js","assets/own-payroll-response.js","assets/native-salary-catalog-model.js","assets/own-payroll-run-model.js","assets/own-payroll-run-date.js","assets/own-payroll-individual-panel.js"],"liquidation124-positive-department-browser/report.json":["assets/own-payroll-liquidation-panel.js","assets/own-payroll-liquidation-model.js","assets/own-payroll-run-panel.js","assets/own-payroll-run-workspace-model.js","assets/own-payroll-annulment-preparation-link.js","assets/payroll-navigation.js","assets/own-payroll-readiness-model.js","assets/own-payroll-response.js","assets/native-salary-catalog-model.js","assets/own-payroll-run-model.js","assets/own-payroll-run-date.js","assets/own-payroll-individual-panel.js"],"liquidation190-positive-agreement-loss-before-browser/report.json":["assets/own-payroll-liquidation-panel.js","assets/own-payroll-liquidation-model.js","assets/own-payroll-run-workspace-model.js","assets/own-payroll-run-model.js","assets/own-payroll-response.js","assets/own-payroll-individual-panel.js","assets/native-salary-catalog-model.js"],"liquidation124-actual-sql-revocation-browser/report.json":["assets/own-payroll-liquidation-panel.js","assets/own-payroll-liquidation-model.js","assets/own-payroll-individual-panel.js","assets/own-payroll-response.js","assets/own-payroll-run-workspace-model.js","assets/native-salary-catalog-model.js","assets/payroll-navigation.js"]});
function reconcileCurrent190UiArtifact(destination,relative,expected,operationReference,report){
 const allowed=['liquidation124-initial-verified-empty-browser/report.json','liquidation124-current-regressions-browser/report.json','liquidation124-calculation-recovery-browser/report.json','liquidation124-positive-department-browser/report.json','liquidation190-positive-agreement-loss-before-browser/report.json','liquidation124-actual-sql-revocation-browser/report.json'];
 assert.ok(allowed.includes(relative));assert.equal(allowed.length,6);
 const profile=current190UiArtifactProfiles[relative];assert.ok(Array.isArray(profile));assert.equal(new Set(profile).size,profile.length);
 const directory=fs.realpathSync(destination),file=path.resolve(directory,relative),child=path.dirname(file);
 assert.equal(path.relative(directory,file).split(path.sep).join('/'),relative);assert.equal(path.dirname(child),directory);
 const folder=fs.lstatSync(child),entry=fs.lstatSync(file);assert.ok(folder.isDirectory()&&!folder.isSymbolicLink());assert.ok(entry.isFile()&&!entry.isSymbolicLink());
 assert.equal(fs.realpathSync(child),child);assert.equal(fs.realpathSync(file),file);assert.ok(entry.size>0&&entry.size<=1024*1024,'CURRENT190_UI_ARTIFACT_METADATA_PROFILE');
 const raw=fs.readFileSync(file);assert.equal(raw.length,entry.size);const text=raw.toString('utf8');assert.deepEqual(Buffer.from(text,'utf8'),raw,'CURRENT190_UI_ARTIFACT_UTF8');
 const decoded=JSON.parse(text),writerText=JSON.stringify(expected,null,2)+'\n';
 // Exact serialization is stronger than dropping arbitrary fields or comparing
 // only counts: duplicate keys, trailers and a different writer DTO all reject.
 assert.deepEqual(raw,Buffer.from(writerText,'utf8'),'CURRENT190_UI_EXACT_WRITER_BYTES:'+relative);assert.deepEqual(decoded,JSON.parse(JSON.stringify(expected)),'CURRENT190_UI_EXACT_WRITER_PROJECTION:'+relative);
 assert.equal(decoded.passed,true);assert.equal(decoded.sourceCommit,report.sourceCommit);assert.equal(decoded.major,report.major);
 for(const field of ['actualSql','actualHttp','actualBrowser'])assert.equal(decoded[field],true);
 assert.equal(decoded.synthetic,true);assert.equal(decoded.allLegacyDecisionUiCasesCovered,false);assert.equal(decoded.productionWrites,0);assert.equal(decoded.paymentExecuted,false);assert.equal(decoded.municipalAcceptance,false);
 assert.equal(decoded.sourceBookend.length,profile.length);assert.equal(new Set(decoded.sourceBookend.map(row=>row.path)).size,profile.length);assert.deepEqual(decoded.sourceBookend.map(row=>row.path).sort(),[...profile].sort());
 for(const row of decoded.sourceBookend)assert.equal(row.sha256,report.sourceClosure.files[row.path],'CURRENT190_UI_ARTIFACT_SOURCE_CUSTODY:'+row.path);
 assert.equal(report.sourceAfter?.passed,true);
 return Object.freeze({relative,rawSha256:createHash('sha256').update(raw).digest('hex'),bytes:raw.length,profile:'literal-utf8-json-metadata-max1MiB',version:decoded.version,sourceCommit:decoded.sourceCommit,major:decoded.major,sourceAssetBookend:decoded.sourceBookend,exactWriterProjection:true,operationReference,sourceAuthority:false,fullParentDtosPreserved:true});
}

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
  // Separate browser124 phases on the same canonical190: handoff after H1,
  // then a read-only blocked phase after the later explicit confirmations.
  // The zero calculation count belongs to each browser phase, not the full tail.
  const individual124=preparation.individualDecisionBrowser,blocked124=preparation.blockedDecisionBrowser;
  assert.equal(report.sourceBefore?.passed,true);assert.equal(report.sourceBefore.committedBytesVerified,true);
  assert.equal(report.sourceAfter.rawBytesVerified,true);
  for(const file of ['scripts/lib/own-payroll-liquidation-decision-124-native-browser.mjs','scripts/lib/own-payroll-liquidation-current190-regressions-browser.mjs','scripts/lib/own-payroll-liquidation-current190-continuation-browser.mjs','scripts/lib/own-payroll-canonical190-browser-host-qa.mjs','scripts/lib/own-payroll-annulment-preparation-209-native-continuation.mjs'])assert.match(report.sourceClosure.files[file],/^[a-f0-9]{64}$/,'complete committed source closure includes '+file);
  for(const [proof,phase]of [[individual124,'handoff'],[blocked124,'blocked']]){
    assert.equal(proof?.version,'own-liquidation-decision124-live190-native-browser.v1');assert.equal(proof.phase,phase);assert.equal(proof.passed,true);
    assert.equal(proof.sourceCommit,report.sourceCommit);assert.equal(proof.major,report.major);assert.equal(proof.affected,10);
    assert.equal(proof.actualSql,true);assert.equal(proof.actualHttp,true);assert.equal(proof.actualBrowser,true);
    assert.equal(proof.authenticationFixture,true);assert.equal(proof.completeAuthenticationHandler,false);
    assert.equal(proof.sourceMode,'public_build_with_twelve_handoff_modules_byte_checked');assert.equal(proof.fullBuildValidation,false);
    assert.equal(proof.calculationPosts,0);assert.equal(proof.receiverForbidden,true);assert.equal(proof.sqlLevelRevocation,false);
    assert.equal(proof.automaticRecalculation,false);assert.equal(proof.receiptLinkedRecalculationExecuted,false);
    assert.equal(proof.productionWrites,0);assert.equal(proof.paymentExecuted,false);assert.equal(proof.municipalAcceptance,false);
    assert.equal(proof.sourceBookend.length,12);assert.deepEqual(proof.sourceBookend.map(row=>row.path).sort(),[...decision124Assets].sort());
    for(const row of proof.sourceBookend){assert.match(row.sha256,/^[a-f0-9]{64}$/);assert.equal(row.sha256,report.sourceClosure.files[row.path],'built browser asset equals the source committed before SQL: '+row.path);}
  }
  assert.equal(individual124.individualDecisionBrowserProven,true);assert.equal(individual124.blockedDecisionBrowserProven,false);
  assert.equal(individual124.pagePosts,1);assert.equal(individual124.decisionPosts,1);assert.equal(individual124.mutations,1);assert.equal(individual124.foreignAttemptNotFound,true);
  assert.equal(blocked124.blockedDecisionBrowserProven,true);assert.equal(blocked124.individualDecisionBrowserProven,false);
  assert.equal(blocked124.pagePosts,0);assert.equal(blocked124.decisionPosts,0);assert.equal(blocked124.mutations,0);
  assert.equal(preparation.individualDecisionBrowserProven,individual124.individualDecisionBrowserProven&&blocked124.blockedDecisionBrowserProven);
  assert.equal(preparation.individualDecisionBrowserProven,true);
  const negatives124=individual124.negatives;
  const negativeNames124=['reviewer-read-only-refresh','hide-after-draft','hide-pending','task-change','capability-withdrawal','late-response-after-withdrawal'];
  assert.equal(individual124.withdrawalNegatives,6);assert.equal(negatives124.length,6);
  assert.deepEqual(negatives124.map(row=>row.name).sort(),[...negativeNames124].sort());
  const negativeByName124=new Map(negatives124.map(row=>[row.name,row]));assert.equal(negativeByName124.size,6);
  for(const row of negatives124){assert.equal(row.retired,true);assert.equal(row.newPosts,0);}
  for(const name of ['hide-pending','task-change','capability-withdrawal','late-response-after-withdrawal'])assert.equal(negativeByName124.get(name).restoreReads,1);
  for(const name of ['hide-after-draft','hide-pending','task-change','capability-withdrawal'])assert.equal(negativeByName124.get(name).detailReadsDuring,0);
  assert.equal(negativeByName124.get('late-response-after-withdrawal').detailReadsDuring,1);
  // N0's zero-GET annotation is not an independent counter; do not promote it
  // into a measured GET claim. Its retirement and no-POST assertions live in R4.
  assert.equal(blocked124.withdrawalNegatives,0);assert.deepEqual(blocked124.negatives,[]);
  const censusBefore124=preparation.measurements.census.filter(row=>row.stage==='after-two-creator-annulment'),censusAfter124=preparation.measurements.census.filter(row=>row.stage==='after-individual124-decision');
  assert.equal(censusBefore124.length,1);assert.equal(censusAfter124.length,1);
  for(const row of [censusBefore124[0],censusAfter124[0]]){assert.equal(row.captures,12);assert.equal(row.saved,12);assert.equal(row.creators,2);}
  assert.equal(censusAfter124[0].liquidationEvents,censusBefore124[0].liquidationEvents+2,'R1 browser confirmation plus original browser annul; still exactly two native events');
  assert.equal(censusAfter124[0].closeEvents,censusBefore124[0].closeEvents);
  // R2 retains the original12/12/+2 decision epoch immediately above. Its
  // effectful creator continuation is a NEW13/13 epoch and must not be relabelled
  // a zero-write draft/12-capture assertion. Two later pending + two saved follow.
  const regression124=preparation.confirmationRegressionBrowser,recovery124=preparation.calculationRecoveryBrowser,department124=preparation.departmentConfirmationBrowser;
  assert.equal(regression124?.version,'own-liquidation-current190-regressions-browser.v1');assert.equal(regression124.passed,true);assert.equal(regression124.firstConfirmationBrowserProven,true);assert.equal(regression124.immutableDecisionRetryBrowserProven,true);assert.equal(regression124.mixedSelectionRejected,true);assert.equal(regression124.allConceptPagesCompared,true);assert.equal(regression124.conceptRows,17100);assert.equal(regression124.conceptPages,684);assert.equal(regression124.addedLiquidationDecisions,1);assert.equal(regression124.addedCaptures,0);assert.equal(regression124.addedSavedResults,0);
  assert.equal(recovery124?.version,'own-decision124-calculation-recovery-live190-browser.v1');assert.equal(recovery124.passed,true);assert.equal(recovery124.affected,10);assert.equal(recovery124.conceptRows,200);assert.equal(recovery124.conceptPages,8);assert.equal(recovery124.calculationContinuationProven,true);assert.equal(recovery124.lostCalculationAcknowledgementProven,true);assert.equal(recovery124.pendingAttemptSurvivesTaskChange,true);assert.equal(recovery124.originalDateRestored,true);
  assert.equal(recovery124.pagePosts,1);assert.equal(recovery124.captureRpcCalls,1);assert.equal(recovery124.completionRpcCalls,1);assert.equal(recovery124.addedCaptures,1);assert.equal(recovery124.addedSavedResults,1);assert.equal(recovery124.addedLiquidationDecisions,0);assert.equal(recovery124.addedCloseEvents,0);assert.equal(recovery124.recoveryAddedRows,0);assert.equal(recovery124.sourceReferenceStored,false);assert.equal(recovery124.atomicGetToCalculation,false);assert.equal(recovery124.durableReceiptLinkCreated,false);assert.equal(recovery124.automaticRecalculation,false);
  const recoveryEpoch=preparation.measurements.census.filter(row=>row.stage==='after-individual124-calculation-recovery');assert.equal(recoveryEpoch.length,1);assert.equal(recoveryEpoch[0].captures,13);assert.equal(recoveryEpoch[0].saved,13);assert.equal(recoveryEpoch[0].creators,2);assert.equal(recoveryEpoch[0].liquidationEvents,censusAfter124[0].liquidationEvents);assert.equal(recoveryEpoch[0].closeEvents,censusAfter124[0].closeEvents);
  assert.equal(department124?.version,'own-department-confirmation-live190-browser.v1');assert.equal(department124.passed,true);assert.equal(department124.population,285);assert.equal(department124.conceptRows,5700);assert.equal(department124.reviewPages,12);assert.equal(department124.positiveDepartmentConfirmationProven,true);assert.equal(department124.pagePosts,1);assert.equal(department124.decisionRpcCalls,1);assert.equal(department124.addedCaptures,0);assert.equal(department124.addedSavedResults,0);assert.equal(department124.addedLiquidationDecisions,1);assert.equal(department124.addedCloseEvents,0);assert.equal(department124.recoveryAddedRows,0);assert.equal(department124.reviewerPrepareGranted,false);
  for(const proof of[regression124,recovery124,department124,preparation.agreementAnnulmentBrowser]){assert.equal(proof.sourceCommit,report.sourceCommit);assert.equal(proof.major,report.major);assert.equal(proof.actualSql,true);assert.equal(proof.actualHttp,true);assert.equal(proof.actualBrowser,true);assert.equal(proof.allLegacyDecisionUiCasesCovered,false);assert.equal(proof.productionWrites,0);assert.equal(proof.paymentExecuted,false);assert.equal(proof.municipalAcceptance,false);for(const row of proof.sourceBookend){assert.equal(row.sha256,report.sourceClosure.files[row.path]);}}
  // Separate explicit post-draft actions; preparation itself stays unconfirmed.
  // These285/570 calculations remain service-only; the separate10-person browser proof does not relabel them.
  assert.equal(preparation.sourceCandidateRevision,'decision124-r3-positive-agreement');assert.equal(preparation.newSavedCaptures,6);assert.equal(preparation.postAgreementReplacementSavedCaptures,1);assert.equal(preparation.preparationPhaseSavedCaptures,2);assert.equal(preparation.individual124SavedCaptures,1);
  const recalculation=preparation.postPreparationRecalculation;
  assert.equal(recalculation?.version,'own-annul-preparation-explicit-recalculation.v1');
  assert.equal(recalculation.passed,true);assert.equal(recalculation.actualSql,true);assert.equal(recalculation.actualCalculationService,true);
  assert.deepEqual(recalculation.dates,preparation.dates);assert.deepEqual(recalculation.partitions,[285,570]);
  assert.equal(recalculation.populationUnion,855);assert.equal(recalculation.conceptRowsUnion,17100);
  assert.equal(recalculation.addedCaptures,2);assert.equal(recalculation.addedSavedResults,2);
  assert.equal(recalculation.addedLiquidationDecisions,0);assert.equal(recalculation.addedCloseEvents,0);
  assert.equal(recalculation.before.captures,15);assert.equal(recalculation.before.saved,13);
  assert.equal(recalculation.after.captures,17);assert.equal(recalculation.after.saved,15);
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
  assert.equal(confirmationClose.actualSql,true);assert.equal(confirmationClose.actualLiquidationService,true);assert.equal(confirmationClose.actualCloseService,true);assert.equal(confirmationClose.departmentConfirmationBrowser.positiveDepartmentConfirmationProven,true);
  assert.equal(confirmationClose.sourceRunIds.length,2);assert.equal(new Set(confirmationClose.sourceRunIds).size,2);assert.equal(confirmationClose.exactNewRunIds,true);
  assert.equal(confirmationClose.confirmedRuns,2);assert.equal(confirmationClose.confirmedPopulation,855);assert.equal(confirmationClose.closedPopulation,855);assert.equal(confirmationClose.closedConceptRows,17100);
  assert.equal(confirmationClose.addedCaptures,1);assert.equal(confirmationClose.addedSavedResults,1);assert.equal(confirmationClose.addedLiquidationDecisions,4);assert.equal(confirmationClose.initialConfirmationDecisions,2);assert.equal(confirmationClose.agreementContinuationAddedDecisions,2);assert.equal(confirmationClose.addedCloseEvents,1);
  assert.deepEqual(confirmationClose.before,recalculation.after);assert.equal(confirmationClose.after.captures,18);assert.equal(confirmationClose.after.saved,16);
  assert.equal(confirmationClose.after.liquidationEvents,confirmationClose.before.liquidationEvents+4);assert.equal(confirmationClose.after.closeEvents,confirmationClose.before.closeEvents+1);assert.equal(confirmationClose.after.creators,confirmationClose.before.creators);
  assert.equal(confirmationClose.confirmationMeasurements.length,2);assert.deepEqual(confirmationClose.confirmationMeasurements.map(row=>[row.date,row.employeeCount]),preparation.dates.map((date,index)=>[date,[285,570][index]]));
  for(const row of confirmationClose.confirmationMeasurements){assert.ok(confirmationClose.initialConfirmationRunIds.includes(row.runId));assert.equal(row.recoveryAndReplayAddedRows,0);assert.equal(row.storedIdentityAndHashesExact,true);for(const key of['detailBytes','receiptBytes','recoveryBytes','replayBytes'])assert.ok(Number.isSafeInteger(row[key])&&row[key]>0&&row[key]<=32*1024*1024);}
  assert.equal(confirmationClose.closeRecoveryMeasurements.length,3);assert.deepEqual(confirmationClose.closeRecoveryMeasurements.map(row=>row.operation),['group','attempt','command']);
  for(const row of confirmationClose.closeRecoveryMeasurements){assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=32*1024*1024);assert.equal(row.recoveryAndReplayAddedRows,0);assert.equal(row.storedIdentityAndHashesExact,true);}
  for(const key of['closeDetailBytes','closeReceiptBytes'])assert.ok(Number.isSafeInteger(confirmationClose[key])&&confirmationClose[key]>0&&confirmationClose[key]<=32*1024*1024);
  assert.equal(confirmationClose.legacyDetailRejected,confirmationClose.closeDetailBytes>4*1024*1024);assert.equal(confirmationClose.legacyReceiptRejections,confirmationClose.closeRecoveryMeasurements.filter(row=>row.bytes>4*1024*1024).length);
  assert.equal(confirmationClose.recoveryAndReplayAddedRows,0);assert.equal(confirmationClose.previousRunStatesPreserved,true);assert.equal(confirmationClose.previousRunStatesScope,'thirteen historical runs preceding the original two confirmations');assert.equal(confirmationClose.retiredAgreementRunIntentionallyAnnulled,true);assert.equal(confirmationClose.previousRowsPreserved,true);assert.equal(confirmationClose.oldGroupPreserved,true);assert.equal(confirmationClose.originalPreparationRejectedByCurrentState,true);
  assert.equal(confirmationClose.actualApiHandler,true);assert.equal(confirmationClose.actualHttp,true);assert.equal(confirmationClose.actualBrowser,true);assert.equal(confirmationClose.actualCloseApiHandler,false);assert.equal(confirmationClose.actualCloseHttp,false);assert.equal(confirmationClose.actualCloseBrowser,false);assert.equal(confirmationClose.atomicGetToCalculation,false);assert.equal(confirmationClose.durableReceiptLinkCreated,false);assert.equal(confirmationClose.receiptLinkedRecalculationExecuted,false);
  assert.equal(confirmationClose.monthlyBusinessCovered,false);assert.equal(confirmationClose.ownPayrollReceiptsPrepared,false);assert.equal(confirmationClose.productionWrites,0);assert.equal(confirmationClose.paymentExecuted,false);assert.equal(confirmationClose.municipalAcceptance,false);
 // Positive legacy agreement annulment is a separate effectful epoch. It adds
 // one new285/5700 saved capture and two decisions; no earlier12/12 or17/15
 // observation is rewritten as18/16. The source run remains annulled forever.
 const agreement190=preparation.agreementAnnulmentContinuation,agreementBrowser190=preparation.agreementAnnulmentBrowser;
 assert.equal(agreementBrowser190.version,'own-agreement-annulment-loss-before-live190-browser.v1');assert.equal(agreementBrowser190.passed,true);assert.equal(agreementBrowser190.positiveAgreementAnnulmentProven,true);assert.equal(agreementBrowser190.lostBeforeSqlRecovered,true);assert.equal(agreementBrowser190.originalBodyAndKeyRetained,true);assert.equal(agreementBrowser190.hiddenNominalDataCleared,true);
 assert.equal(agreementBrowser190.population,285);assert.equal(agreementBrowser190.conceptRows,5700);assert.equal(agreementBrowser190.agreementCode,'1');assert.equal(agreementBrowser190.reviewPages,12);assert.equal(agreementBrowser190.reviewedUniqueEmployees,285);assert.equal(agreementBrowser190.pagePosts,2);assert.equal(agreementBrowser190.decisionRpcAttempts,2);assert.equal(agreementBrowser190.decisionRpcReachedSql,1);assert.equal(agreementBrowser190.addedLiquidationDecisions,1);assert.equal(agreementBrowser190.addedCaptures,0);assert.equal(agreementBrowser190.addedSavedResults,0);assert.equal(agreementBrowser190.addedConsolidatedAnnulments,0);assert.equal(agreementBrowser190.addedCloseEvents,0);assert.equal(agreementBrowser190.recoveryAddedRows,0);assert.equal(agreementBrowser190.reviewerPrepareGranted,false);
 assert.deepEqual(agreementBrowser190.decisionReference,{id:agreementBrowser190.receipt.id,bodySha256:agreementBrowser190.receipt.bodySha256,runId:agreementBrowser190.receipt.runId,resultSha256:agreementBrowser190.receipt.resultSha256,affectedCount:agreementBrowser190.receipt.affected.length});assert.equal(agreementBrowser190.captureReference.id,agreement190.retiredRunId);assert.equal(agreementBrowser190.captureReference.resultSha256,agreementBrowser190.receipt.resultSha256);assert.equal(agreementBrowser190.captureReference.employeeCount,285);assert.equal(agreementBrowser190.captureReference.rowCount,5700);for(const field of['bodySha256','payloadSha256','inputSha256','resultSha256'])assert.match(agreementBrowser190.captureReference[field],/^[a-f0-9]{64}$/);
 assert.equal(agreement190?.version,'own-agreement-annulment-explicit-restoration190.v1');assert.equal(agreement190.passed,true);assert.equal(agreement190.population,285);assert.equal(agreement190.conceptRows,5700);assert.equal(agreement190.agreementCode,'1');assert.equal(agreement190.addedCaptures,1);assert.equal(agreement190.addedSavedResults,1);assert.equal(agreement190.addedLiquidationDecisions,2);assert.equal(agreement190.addedConsolidatedAnnulments,0);assert.equal(agreement190.addedCloseEvents,0);assert.equal(agreement190.recoveryAddedRows,0);assert.equal(agreement190.initialConfirmationDecisionsPreserved,2);
 assert.deepEqual(agreement190.before,{...recalculation.after,liquidationEvents:recalculation.after.liquidationEvents+2});assert.deepEqual(agreement190.afterAnnul,{...agreement190.before,liquidationEvents:agreement190.before.liquidationEvents+1});assert.deepEqual(agreement190.afterCalculation,{...agreement190.afterAnnul,captures:18,saved:16});assert.deepEqual(agreement190.after,{...agreement190.before,captures:18,saved:16,liquidationEvents:agreement190.before.liquidationEvents+2});assert.equal(agreement190.after.creators,3);
 assert.equal(agreement190.annulledSourceReconfirmationRejectedByCurrentContract,true);assert.equal(agreement190.replacementConfirmedVersions.length,285);assert.equal(new Set(agreement190.replacementConfirmedVersions.map(row=>row.contractId)).size,285);assert.ok(agreement190.replacementConfirmedVersions.every(row=>Number.isSafeInteger(row.version)&&row.version>0&&Number.isSafeInteger(row.liquidationVersion)&&row.liquidationVersion>0));
 assert.equal(agreement190.activeSourceRunIds.length,2);assert.ok(!agreement190.activeSourceRunIds.includes(agreement190.retiredRunId));assert.ok(agreement190.activeSourceRunIds.includes(agreement190.replacementRunId));assert.deepEqual(agreement190.activeSourceRunIds,confirmationClose.sourceRunIds);assert.equal(confirmationClose.initialConfirmationRunIds.length,2);assert.ok(confirmationClose.initialConfirmationRunIds.includes(agreement190.retiredRunId));
 assert.equal(agreement190.sourceSavedBytesPreserved,true);assert.equal(agreement190.historicalThirteenRunsPreserved,true);assert.equal(agreement190.replacementCalculationService,true);assert.equal(agreement190.replacementCalculationBrowser,false);assert.equal(agreement190.replacementConfirmationService,true);assert.equal(agreement190.replacementConfirmationBrowser,false);assert.deepEqual(confirmationClose.agreementAnnulmentContinuation,agreement190);
 assert.deepEqual(confirmationClose.after,{...agreement190.after,closeEvents:agreement190.after.closeEvents+1});
 const agreementEpoch=preparation.measurements.census.filter(row=>row.stage==='after-positive-agreement-annul-replacement');assert.equal(agreementEpoch.length,1);const{stage:agreementStage,...agreementCensus}=agreementEpoch[0];assert.deepEqual(agreementCensus,agreement190.after);assert.equal(agreement190.productionWrites,0);assert.equal(agreement190.paymentExecuted,false);assert.equal(agreement190.municipalAcceptance,false);
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
  const initial190=report.continuation.capacity.initialEmptyBrowser;
  assert.equal(initial190?.version,'own-initial-verified-empty-live190-browser.v1');assert.equal(initial190.passed,true);assert.equal(initial190.initialVerifiedEmptyBrowserProven,true);assert.equal(initial190.ownRosterComplete,855);
  for(const field of ['initialCaptures','initialSavedResults','initialLiquidationEvents','initialAnnulEvents','initialCloseEvents','httpWrites','addedCaptures','addedSavedResults','addedLiquidationDecisions','addedAnnulments','addedCloseEvents'])assert.equal(initial190[field],0);
  assert.deepEqual(initial190.before,initial190.after);assert.equal(initial190.originalRowsAndIamPreserved,true);assert.equal(initial190.preparationReadyWithoutCalculation,true);assert.equal(initial190.fabricatedPendingState,false);assert.equal(initial190.invalidatedEmptyStateWithdrawn,true);
  assert.deepEqual(regression124.decisionReference,browserArtifactDecisionReference(regression124.receipt));assert.equal(regression124.receipt.body.command,'confirm');assert.equal(regression124.receipt.affected.length,10);
  assert.deepEqual(recovery124.captureReference,browserArtifactCaptureReference(recovery124.capture));assert.equal(recovery124.capture.saved.result.employeeCount,10);assert.equal(recovery124.capture.saved.result.rowCount,200);assert.notEqual(recovery124.capture.id,regression124.receipt.runId);
  assert.deepEqual(department124.decisionReference,browserArtifactDecisionReference(department124.receipt));assert.equal(department124.receipt.body.command,'confirm');assert.equal(department124.receipt.affected.length,285);
  assert.equal(agreementBrowser190.receipt.runId,department124.receipt.runId);assert.equal(agreementBrowser190.receipt.resultSha256,department124.receipt.resultSha256);assert.equal(agreementBrowser190.receipt.body.command,'annul');
  const {receipt:regressionReceipt,...regressionWriter}=regression124,{capture:recoveryCapture,...recoveryWriter}=recovery124,{receipt:departmentReceipt,...departmentWriter}=department124,{receipt:agreementReceipt,...agreementWriter}=agreementBrowser190;
  // These four complete DTOs remain in report.continuation. Only the local
  // comparison projection mirrors what each exact writer explicitly omits.
  assert.strictEqual(regressionReceipt,regression124.receipt);assert.strictEqual(recoveryCapture,recovery124.capture);assert.strictEqual(departmentReceipt,department124.receipt);assert.strictEqual(agreementReceipt,agreementBrowser190.receipt);
  const sqlRevocation=report.continuation.capacity.sqlRevocationBrowser;
  assert.equal(sqlRevocation?.version,'own-actual-sql-revocation-live190-browser.v1');assert.equal(sqlRevocation.passed,true);assert.equal(sqlRevocation.sqlLevelRevocationProven,true);
  assert.equal(sqlRevocation.sourceCommit,report.sourceCommit);assert.equal(sqlRevocation.major,report.major);assert.ok(Number.isSafeInteger(sqlRevocation.realSqlDenials)&&sqlRevocation.realSqlDenials>=2);
  assert.equal(sqlRevocation.temporaryIamWriteCalls,4);assert.equal(sqlRevocation.existingOverrideRowsRestored,2);
  for(const field of ['staleClientPrincipalPreserved','sessionVersionsPreserved','originalRowsAndMetadataRestored','actualSql','actualApiHandler','actualHttp','actualBrowser','authenticationFixture'])assert.equal(sqlRevocation[field],true);
  assert.equal(sqlRevocation.completeAuthenticationHandler,false);assert.equal(sqlRevocation.allLegacyDecisionUiCasesCovered,false);
  for(const field of ['addedCaptures','addedSavedResults','addedLiquidationDecisions','addedAnnulments','addedCloseEvents','businessHttpPosts','newRoles','newGrants','newSessions','newIdentities','newRpcDescriptors'])assert.equal(sqlRevocation[field],0);
  assert.deepEqual(sqlRevocation.cases.map(row=>[row.capability,row.nativeCode]),[['payroll.calculation.approve','OWN_LIQ_FORBIDDEN'],['payroll.calculation.nominal.read','OWN_RUN_FORBIDDEN']]);
  for(const row of sqlRevocation.cases){assert.equal(row.httpStatus,403);assert.equal(row.loadedPopulation,855);assert.equal(row.loadedConcepts,17100);assert.equal(row.individualConcepts,20);assert.equal(row.clientPrincipalPreserved,true);assert.equal(row.sessionPreserved,true);assert.equal(row.nominalViewsWithdrawn,true);assert.equal(row.businessHttpPosts,0);}
  assert.deepEqual(sqlRevocation.captureReference,browserArtifactCaptureReference(sqlRevocation.capture));assert.equal(sqlRevocation.capture.saved.result.employeeCount,855);assert.equal(sqlRevocation.capture.saved.result.rowCount,17100);assert.equal(sqlRevocation.capture.saved.resultSha256,report.continuation.capacity.fullResultSha256);
  const {capture:revocationCapture,...revocationWriter}=sqlRevocation;assert.strictEqual(revocationCapture,sqlRevocation.capture);
  const destination=path.resolve(import.meta.dirname,'..',options.output);
  const current190UiArtifacts=Object.freeze([
    reconcileCurrent190UiArtifact(destination,'liquidation124-initial-verified-empty-browser/report.json',initial190,{state:'verified_empty_before_first_capture',ownRosterComplete:855,captures:0,saved:0,liquidationEvents:0,annulEvents:0,closeEvents:0},report),
    reconcileCurrent190UiArtifact(destination,'liquidation124-current-regressions-browser/report.json',regressionWriter,regression124.decisionReference,report),
    reconcileCurrent190UiArtifact(destination,'liquidation124-calculation-recovery-browser/report.json',recoveryWriter,recovery124.captureReference,report),
    reconcileCurrent190UiArtifact(destination,'liquidation124-positive-department-browser/report.json',departmentWriter,department124.decisionReference,report),
    reconcileCurrent190UiArtifact(destination,'liquidation190-positive-agreement-loss-before-browser/report.json',agreementWriter,{capture:agreementBrowser190.captureReference,decision:agreementBrowser190.decisionReference},report),
    reconcileCurrent190UiArtifact(destination,'liquidation124-actual-sql-revocation-browser/report.json',revocationWriter,sqlRevocation.captureReference,report)
  ]);
  assert.equal(current190UiArtifacts.length,6);assert.equal(new Set(current190UiArtifacts.map(row=>row.relative)).size,6);
  // The owner already wrote result.json. Preserve it and return derived read
  // evidence for stdout without rewriting its result or resealing sources.
  return {...report,current190UiArtifacts,allLegacyDecisionUiCasesCovered:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  verifyOwnAnnulmentV2FullCapacity(ownerAuthorityQaOptions(process.argv.slice(2)))
    .then(report=>{const tail=report.continuation.capacity.annulmentV2Browser,preparation=tail.preparation209;
      console.log(JSON.stringify({passed:report.passed,sourceCommit:report.sourceCommit,major:report.major,
        annulment855:tail.browser.fullAnnulmentBrowserProven,preparation209Native:preparation.receiptToPreparationNativeProven,
        individualDecision124Browser:preparation.individualDecisionBrowserProven,blockedDecision124Browser:preparation.blockedDecisionBrowser.blockedDecisionBrowserProven,
        withdrawalNegatives124:preparation.individualDecisionBrowser.withdrawalNegatives,current190UiArtifacts:report.current190UiArtifacts,allLegacyDecisionUiCasesCovered:false,completeMunicipalCircuit:false,monthlyBusiness:false,municipalAcceptance:false}));})
    .catch(error=>{console.error(error.stack);for(const cause of error.errors??[])console.error(cause.stack);process.exitCode=1;});
}
