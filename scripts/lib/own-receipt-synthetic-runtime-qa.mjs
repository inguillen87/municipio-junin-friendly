// QA only. These invented values simulate runtime identity for the existing
// psql adapters; they do not observe an SDK, connection or real destination.
// Production modules must never import this helper.
import assert from 'node:assert/strict';
import {ACTION_RUNTIME_IDENTITY_SQL,ACTION_RUNTIME_ROLE,actionRuntimeDestinationFromTarget,assertActionRuntimeDestination,recordActionRuntimeIdentity} from '../../lib/action-runtime-identity.js';

export const OWN_RECEIPT_SYNTHETIC_RUNTIME_EVIDENCE=Object.freeze({
 mode:'synthetic-fixture',identityQuery:'simulated',applicationCommit:'synthetic',
 genuineSdkVerified:false,actualDestinationVerified:false,
});

export function createOwnReceiptSyntheticRuntimeQa({sql,major}){
 assert.ok([17,18].includes(major),'RECEIPT_QA_RUNTIME_MAJOR');
 assert.equal(typeof sql?.query,'function','RECEIPT_QA_QUERY_ADAPTER_REQUIRED');
 const target=Object.freeze({major,projectId:'synthetic-receipt-qa-project',branchId:'br-synthetic-receipt-qa',endpointId:'ep-synthetic-receipt-qa',database:'synthetic_receipt_qa_database',role:ACTION_RUNTIME_ROLE});
 const expectedDestination=actionRuntimeDestinationFromTarget(target);
 const identity=Object.freeze({...expectedDestination,currentUser:ACTION_RUNTIME_ROLE,sessionUser:ACTION_RUNTIME_ROLE});
 const env=Object.freeze({INTERNAL_RECEIPT_ACTIONS_TARGET:JSON.stringify(target),VERCEL_GIT_COMMIT_SHA:'c'.repeat(40)});
 const client=Object.freeze({query(...args){
  if(args[0]===ACTION_RUNTIME_IDENTITY_SQL){
   assert.equal(args.length,1,'RECEIPT_QA_IDENTITY_PARAMETERS');
   return Promise.resolve([{...identity}]);
  }
  // Preserve the original adapter's receiver, query, arguments, result and
  // failures. Its SQL guards, pins, transaction and retry policy stay in force.
  return Reflect.apply(sql.query,sql,args);
 }});
 recordActionRuntimeIdentity(client,identity);
 const getSql=(_env,{expectedDestination:expected}={})=>{
  assert.deepEqual(expected,expectedDestination,'RECEIPT_QA_EXPECTED_DESTINATION');
  return assertActionRuntimeDestination(client,expected);
 };
 return Object.freeze({env,getSql,sql:client,evidence:OWN_RECEIPT_SYNTHETIC_RUNTIME_EVIDENCE});
}
