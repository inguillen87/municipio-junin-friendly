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
  'tests/own-payroll-annulment-hidden-active.test.js'
];

export async function verifyOwnAnnulmentV2FullCapacity(options){
  assert.ok(options.operationalPairBaseline===undefined||options.operationalPairBaseline==='published107');
  const report=await verifyMunicipalOwnerProgram({...options,operationalPairBaseline:'published107'},{
    prepareContinuation:prepareOwnMonthlyFullCapacity,
    continuation:h=>continueOwnMonthlyFullCapacity(h,{annulmentV2Browser:true}),
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
  assert.equal(report.continuation.monthlyBusinessCovered,false);
  assert.equal(report.productionWrites,0);assert.equal(report.municipalAcceptance,false);
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  verifyOwnAnnulmentV2FullCapacity(ownerAuthorityQaOptions(process.argv.slice(2)))
    .then(report=>console.log(JSON.stringify({passed:report.passed,sourceCommit:report.sourceCommit,
      major:report.major,annulment855:true,completeMunicipalCircuit:false,monthlyBusiness:false,municipalAcceptance:false})))
    .catch(error=>{console.error(error.stack);for(const cause of error.errors??[])console.error(cause.stack);process.exitCode=1;});
}
