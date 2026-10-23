// Concrete server verifier of declared data, not authority or payroll execution.
// No request or caller can choose a hasher or supply a verification result.
import {createHash} from 'node:crypto';
import {beginOwnMonetaryPolicyVerification} from '../assets/own-payroll-monetary-policy.js';
import {beginOwnMonetaryProgrammeVerification} from '../assets/own-payroll-monetary-manifest.js';
function drive(steps){
 let current=steps.next();
 while(!current.done){const hash=createHash('sha256').update(current.value,'utf8').digest('hex');current=steps.next(hash);}
 return current.value;
}
export function verifyOwnMonetaryPolicySync(policy,source){return drive(beginOwnMonetaryPolicyVerification(policy,source));}
export function verifyOwnMonetaryProgrammeManifestSync(definition){return drive(beginOwnMonetaryProgrammeVerification(definition));}
