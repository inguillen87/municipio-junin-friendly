// PROPOSED by Claude (R3; source only; never imported or run by Claude). Target: lib/own-payroll-zero-difference.js
// Concrete server driver of the pure zero-differences check (same pattern as lib/own-payroll-monetary-verification.js):
// the hasher is node:crypto here, never chosen by a request. No SQL, no authority, no payroll execution.
import {createHash} from 'node:crypto';
import {beginOwnZeroDifferenceCheck} from '../assets/own-payroll-zero-difference.js';
export function verifyOwnZeroDifferenceSync(options){
 const steps=beginOwnZeroDifferenceCheck(options);let current=steps.next();
 while(!current.done){const hash=createHash('sha256').update(current.value,'utf8').digest('hex');current=steps.next(hash);}
 return current.value;
}
