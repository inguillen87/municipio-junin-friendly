// Adopted from the reviewed Claude receipt-preparer forward proposal.
// Shared receipt-module access predicate for API handler and panel. Mirrors the
// forward SQL context: read = nominal + (receipt.prepare OR calculation.approve);
// prepare = nominal + receipt.prepare; approve/withdraw keep OWN_RECEIPT_APPROVE.
import {OWN_RUN_NOMINAL} from './own-payroll-run-workspace-model.js';

export const OWN_RECEIPT_NOMINAL=Object.freeze([...OWN_RUN_NOMINAL]);
export const OWN_RECEIPT_PREPARER=Object.freeze([...OWN_RECEIPT_NOMINAL,'payroll.receipt.prepare']);
export const OWN_RECEIPT_REVIEW_READ=Object.freeze([...OWN_RECEIPT_NOMINAL,'payroll.calculation.approve']);
const holds=(caps,capability)=>caps instanceof Set?caps.has(capability):Array.isArray(caps)&&caps.includes(capability);
const holdsAll=(caps,required)=>required.every(capability=>holds(caps,capability));
/** caps: Set (panel) or array (principal.tenant.effectiveCapabilities). */
export function ownReceiptModuleAccess(caps){return holdsAll(caps,OWN_RECEIPT_PREPARER)||holdsAll(caps,OWN_RECEIPT_REVIEW_READ);}
