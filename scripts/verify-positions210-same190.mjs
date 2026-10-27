// Opt-in entry delegates the complete208/209 entry and all its post-cleanup assertions.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ownerAuthorityQaOptions} from './verify-municipal-owner-adoption-authority.mjs';
import {verifyOwnAnnulmentV2FullCapacity} from './verify-own-payroll-annulment-v2-full-capacity.mjs';
export const verifyPositions210Same190=options=>verifyOwnAnnulmentV2FullCapacity(options,{positions210:true});
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 verifyPositions210Same190(ownerAuthorityQaOptions(process.argv.slice(2)))
  .then(report=>console.log(JSON.stringify({passed:report.passed,sourceCommit:report.sourceCommit,positions210:report.continuation.capacity.positions210?.passed===true,municipalAcceptance:false})))
  .catch(error=>{console.error(error.stack);for(const cause of error.errors??[])console.error(cause.stack);process.exitCode=1;});
}
