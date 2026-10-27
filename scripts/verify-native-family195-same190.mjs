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
