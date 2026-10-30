// JOINT SOURCE CANDIDATE: same QA190 for M7, receipt126 browser, Family195 and positions210/211/212.
// Existing post209 asserts remain; bank reports, digital signature and municipal acceptance are outside this entry.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ownerAuthorityQaOptions} from './verify-municipal-owner-adoption-authority.mjs';
import {verifyOwnAnnulmentV2FullCapacity} from './verify-own-payroll-annulment-v2-full-capacity.mjs';
export async function verifyNativeFamily195Same190(options){
 const report=await verifyOwnAnnulmentV2FullCapacity(options,{family195:true,positions210:true});
 assert.equal(report.continuation?.family195Technical?.passed,true);
 if(options.major===17){
  const layout=report.continuation.family195Technical.publicTableLayout;
  assert.equal(layout?.version,'native-family195-public-layout-native-qa.v1');assert.equal(layout.passed,true);
  assert.equal(layout.major,17);assert.equal(layout.sourceCommit,report.sourceCommit);assert.equal(layout.constraints,60);
  assert.equal(layout.mutations,11);assert.equal(layout.results.length,11);assert.equal(new Set(layout.results.map(x=>x.name)).size,11);
  assert.ok(layout.results.every(x=>x.rollbackReadbackVerified===true));
  for(const key of ['foreignSearchPathRejected','nonzeroPolicyGenerationAccepted','nonemptyFamilyHistoryAccepted'])assert.equal(layout[key],true);
  assert.equal(layout.identitiesAdded,0);assert.equal(layout.production,false);assert.equal(layout.productionWrites,0);
 }

 assert.equal(report.continuation?.family195Business?.passed,true);
 assert.strictEqual(report.continuation.family195Business,report.continuation.capacity.family195Business);
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 verifyNativeFamily195Same190(ownerAuthorityQaOptions(process.argv.slice(2)))
 .then(report=>console.log(JSON.stringify({passed:report.passed,sourceCommit:report.sourceCommit,
  major:report.major,family195Technical:report.continuation.family195Technical.passed,
  family195Business:report.continuation.family195Business.passed,
  family195Browser:report.continuation.family195Business.browser.passed,
  sameCanonical190:true,authenticationFixture:true,completeAuthenticationHandler:false,
  iamRevocationProven:false,productionWrites:0,paymentExecuted:false,municipalAcceptance:false})))
 .catch(error=>{console.error(error.stack);for(const cause of error.errors??[])console.error(cause.stack);process.exitCode=1;});
}
