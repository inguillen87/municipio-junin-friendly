// Reuses the existing canonical190 guarded runner and only its published107
// profile. There is no new database, process, network transport or executor.
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {verifyMunicipalOwnerProgram} from './verify-municipal-owner-program.mjs';
import {ownerAuthorityQaOptions} from './verify-municipal-owner-adoption-authority.mjs';
import {runOwnReportCensus190Continuation} from './lib/own-payroll-report-census-190-continuation.mjs';
const entries=['scripts/verify-own-payroll-report-census.mjs','scripts/lib/own-payroll-report-census-190-continuation.mjs','scripts/lib/own-payroll-report-census-190-iam-fixture.mjs','scripts/lib/own-payroll-report-census-qa-rpc.mjs','tests/own-payroll-report-census-qa-rpc.test.js','tests/own-payroll-report-census-190-iam-fixture.test.js'];
export async function verifyOwnReportCensus(options){
 assert.ok(options.operationalPairBaseline===undefined||options.operationalPairBaseline==='published107','CENSUS190_PUBLISHED107_REQUIRED');
 const report=await verifyMunicipalOwnerProgram({...options,operationalPairBaseline:'published107'},{continuation:runOwnReportCensus190Continuation,continuationEntries:entries});
 assert.equal(report.passed,true);assert.equal(report.continuation?.passed,true);assert.equal(report.priorDatabasePreserved,true);assert.equal(report.syntheticSchemaRemoved,true);assert.equal(report.sourceAfter?.passed,true);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))verifyOwnReportCensus(ownerAuthorityQaOptions(process.argv.slice(2))).then(report=>console.log(JSON.stringify({passed:report.passed,major:report.major,sourceCommit:report.sourceCommit,census:report.continuation.passed,municipalAcceptance:false}))).catch(error=>{console.error(error.stack);for(const cause of error.errors??[])console.error(cause.stack);process.exitCode=1;});
