// The expected ACTIONS destination is private server configuration, never HTTP or IAM metadata.
import {ACTION_RUNTIME_ROLE,ACTION_RUNTIME_IDENTITY_SQL,actionRuntimeDestinationFromTarget,assertActionRuntimeDestination,recordActionRuntimeIdentity,invalidateActionRuntimeIdentity} from './action-runtime-identity.mjs';
import {parseScopedPrivateJson} from '../../../lib/private-json-body.js';
import {OwnReceiptError} from '../../../lib/internal-own-payroll-receipts.js';

export const RECEIPT_ACTIONS_TARGET_ENV='INTERNAL_RECEIPT_ACTIONS_TARGET';
export const RECEIPT_RUNTIME_BINDING_VERSION='own-receipt-runtime-binding.v1';
const unavailable=()=>new OwnReceiptError('BINDING_UNAVAILABLE',503,'No se verificó el destino de datos del recibo. Volvé a consultar.');
const destinationKeys=['major','projectId','branchId','endpointId','database'];
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');

export function receiptExpectedDestination(env){
 try{
  if(!env||!Object.hasOwn(env,RECEIPT_ACTIONS_TARGET_ENV))throw unavailable();
  const raw=env[RECEIPT_ACTIONS_TARGET_ENV];
  if(typeof raw!=='string'||raw.length===0||Buffer.byteLength(raw,'utf8')>4096)throw unavailable();
  const target=parseScopedPrivateJson(raw,{maxDepth:1});
  if(!exact(target,[...destinationKeys,'role'])||target.role!==ACTION_RUNTIME_ROLE)throw unavailable();
  for(const key of destinationKeys.slice(1))if(typeof target[key]!=='string'||target[key].length>256||/[\u0000-\u001f\u007f]/.test(target[key]))throw unavailable();
  return actionRuntimeDestinationFromTarget(target);
 }catch{throw unavailable();}
}

export async function receiptRuntimeBinding(sql,expectedDestination,env){
 let observing=false;
 try{
  if(!exact(expectedDestination,destinationKeys))throw unavailable();
  const applicationCommit=env?.VERCEL_GIT_COMMIT_SHA;
  if(typeof applicationCommit!=='string'||!/^[a-f0-9]{40}$/.test(applicationCommit))throw unavailable();
  // getActionCenterSql must have recorded this very SDK client, not client-owned properties.
  assertActionRuntimeDestination(sql,expectedDestination);
  if(typeof sql?.query!=='function')throw unavailable();
  observing=true;
  const rows=await sql.query(ACTION_RUNTIME_IDENTITY_SQL);
  if(!Array.isArray(rows)||rows.length!==1)throw unavailable();
  assertActionRuntimeDestination(sql,expectedDestination);
  recordActionRuntimeIdentity(sql,rows[0]);
  assertActionRuntimeDestination(sql,expectedDestination);
  return Object.freeze({version:RECEIPT_RUNTIME_BINDING_VERSION,applicationCommit,bindingVerified:true,observedAtUtc:new Date().toISOString()});
 }catch{if(observing)invalidateActionRuntimeIdentity(sql);throw unavailable();}
}
