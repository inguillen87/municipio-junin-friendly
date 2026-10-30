// Explicit joint source-owned216 browser entry; no action occurs on import.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ownerAuthorityQaOptions} from './verify-municipal-owner-adoption-authority.mjs';
import {verifyOwnAnnulmentV2FullCapacity} from './verify-own-payroll-annulment-v2-full-capacity.mjs';
export const verifyAdministrative216Same190=options=>verifyOwnAnnulmentV2FullCapacity(options,{family195:true,positions210:true,administrative216:true});
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 verifyAdministrative216Same190(ownerAuthorityQaOptions(process.argv.slice(2)))
 .then(report=>console.log(JSON.stringify({passed:report.passed,sourceCommit:report.sourceCommit,administrative216:report.continuation.capacity.positions210.administrative216Browser.passed,production:false,municipalAcceptance:false})))
 .catch(error=>{console.error(error.stack);process.exitCode=1;});
}
