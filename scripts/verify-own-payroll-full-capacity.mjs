// SOURCE ONLY. Future entry reuses one existing190 schema/transport/finally.
// No optional report UI/profile, alternate executor or independent installer.
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {verifyMunicipalOwnerProgram} from './verify-municipal-owner-program.mjs';
import {ownerAuthorityQaOptions} from './verify-municipal-owner-adoption-authority.mjs';
import {runOwnFullCapacity190Continuation} from './lib/own-payroll-full-capacity-190-continuation.mjs';
import {OWN_ACCOUNTING_IMPUTATION_190_SOURCE_ENTRIES} from './lib/own-accounting-imputation-190-installation.mjs';
import {OWN_RECEIPT126_BACKEND_SOURCE_ENTRIES} from './lib/own-payroll-receipt126-backend-190-continuation.mjs';
export {OWN_RECEIPT126_BACKEND_SOURCE_ENTRIES};
const entries=['scripts/lib/own-payroll-expected-native-rpc.mjs','tests/own-payroll-expected-native-rpc.test.js','scripts/verify-own-payroll-full-capacity.mjs','scripts/lib/own-payroll-full-capacity-190-continuation.mjs','scripts/lib/own-payroll-close-native-browser.mjs','assets/own-payroll-close-panel.css','scripts/lib/own-payroll-capacity-literal-additions.mjs','tests/own-payroll-capacity-literal-additions.test.js','scripts/lib/own-payroll-full-capacity-190-installation.mjs','scripts/lib/own-payroll-full-capacity-190-rpc.mjs','scripts/migrations/200-own-payroll-report-census.sql','scripts/migrations/201-own-full-payroll-decision-capacity.sql','tests/own-payroll-full-capacity-190-source.test.js','tests/fixtures/own-payroll-full-capacity-190-source-projection.js','scripts/lib/own-accounting-imputation-190-continuation.mjs','scripts/lib/own-journal-full-capacity-190-continuation.mjs','tests/own-accounting-imputation-190-source.test.js','tests/fixtures/own-accounting-imputation-190-source-projection.js','tests/own-accounting-imputation-190-installation-source.test.js','tests/fixtures/own-accounting-imputation-190-source-contract.json','tests/own-journal-full-capacity-190-tail-source.test.js',...OWN_ACCOUNTING_IMPUTATION_190_SOURCE_ENTRIES,...OWN_RECEIPT126_BACKEND_SOURCE_ENTRIES];
export {entries as OWN_FULL_CAPACITY_190_QA_ENTRIES};
export async function verifyOwnPayrollFullCapacity(options){
 assert.ok(options.operationalPairBaseline===undefined||options.operationalPairBaseline==='published107','M7_190_PUBLISHED107_REQUIRED');
 const report=await verifyMunicipalOwnerProgram({...options,operationalPairBaseline:'published107'},{continuation:runOwnFullCapacity190Continuation,continuationEntries:entries});
 assert.equal(report.passed,true);assert.equal(report.continuation?.passed,true);assert.equal(report.priorDatabasePreserved,true);assert.equal(report.syntheticSchemaRemoved,true);assert.equal(report.sourceAfter?.passed,true);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))verifyOwnPayrollFullCapacity(ownerAuthorityQaOptions(process.argv.slice(2))).then(report=>console.log(JSON.stringify({passed:report.passed,major:report.major,sourceCommit:report.sourceCommit,fullCapacity:report.continuation.passed,municipalAcceptance:false}))).catch(error=>{console.error(error.stack);for(const cause of error.errors??[])console.error(cause.stack);process.exitCode=1;});
