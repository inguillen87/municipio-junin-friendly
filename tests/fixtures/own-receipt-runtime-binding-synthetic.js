// Entirely invented identifiers. No published, private or municipal target.
import {ACTION_RUNTIME_ROLE,recordActionRuntimeIdentity} from '../../lib/action-runtime-identity.js';
export const syntheticReceiptTarget=(patch={})=>({major:17,projectId:'qa-receipt-project',branchId:'br-qa-receipt-branch',endpointId:'ep-qa-receipt-endpoint',database:'qa_receipt_database',role:ACTION_RUNTIME_ROLE,...patch});
export const syntheticReceiptBindingEnv=(patch={})=>({INTERNAL_APP_ORIGIN:'http://localhost:8080',INTERNAL_RECEIPT_ACTIONS_TARGET:JSON.stringify(syntheticReceiptTarget()),VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),...patch});
export const syntheticReceiptIdentity=(patch={})=>{const {role,...target}=syntheticReceiptTarget();return {...target,currentUser:role,sessionUser:role,...patch};};
export function syntheticReceiptClient(query){const sql={query};recordActionRuntimeIdentity(sql,syntheticReceiptIdentity());return sql;}
