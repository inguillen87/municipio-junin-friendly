// Prospective integration of the received R4 source. This is new application
// code, not an installation receipt or proof of a genuine runtime destination.
import {ACTION_RUNTIME_ROLE,ACTION_RUNTIME_IDENTITY_SQL,actionRuntimeDestinationFromTarget,assertActionRuntimeDestination,recordActionRuntimeIdentity,invalidateActionRuntimeIdentity} from './action-runtime-identity.js';
import {parseScopedPrivateJson} from './private-json-body.js';
import {OwnReceiptError} from './internal-own-payroll-receipts.js';

export const RECEIPT_ACTIONS_TARGET_ENV='INTERNAL_RECEIPT_ACTIONS_TARGET';
export const RECEIPT_RUNTIME_BINDING_VERSION='own-receipt-runtime-binding.v1';
const destinationKeys=Object.freeze(['major','projectId','branchId','endpointId','database']);
const targetKeys=Object.freeze([...destinationKeys,'role']);
const identityKeys=Object.freeze(['currentUser','sessionUser',...destinationKeys]);
export const receiptBindingUnavailable=()=>new OwnReceiptError('BINDING_UNAVAILABLE',503,'No se verificó el destino de datos del recibo. Volvé a consultar.');
const need=condition=>{if(!condition)throw receiptBindingUnavailable();};
const exactData=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))
 &&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable;});
const boundedString=value=>typeof value==='string'&&value.length>0&&value.length<=256&&value===value.trim()&&!/[\u0000-\u001f\u007f]/u.test(value);
function destination(value){
 need(exactData(value,destinationKeys)&&[17,18].includes(value.major)&&destinationKeys.slice(1).every(key=>boundedString(value[key])));
 return Object.freeze(Object.fromEntries(destinationKeys.map(key=>[key,value[key]])));
}
export function receiptExpectedDestination(env){
 try{
  need(env&&Object.hasOwn(env,RECEIPT_ACTIONS_TARGET_ENV));
  const source=env[RECEIPT_ACTIONS_TARGET_ENV];need(typeof source==='string'&&source.length>0&&Buffer.byteLength(source,'utf8')<=4096);
  const target=parseScopedPrivateJson(source,{maxDepth:1});
  need(exactData(target,targetKeys)&&target.role===ACTION_RUNTIME_ROLE&&[17,18].includes(target.major)&&targetKeys.filter(key=>key!=='major').every(key=>boundedString(target[key])));
  return actionRuntimeDestinationFromTarget(target);
 }catch{throw receiptBindingUnavailable();}
}
// This identifies the application artifact only. It is never a releaseSha or
// certified data-plane contract and is not written into the municipal context.
export function receiptApplicationCommit(env){
 try{const value=env?.VERCEL_GIT_COMMIT_SHA;need(typeof value==='string'&&/^[a-f0-9]{40}$/.test(value));return value;}catch{throw receiptBindingUnavailable();}
}
export async function receiptRuntimeBinding(sql,expectedDestination,env){
 let readStarted=false;
 try{
  const expected=destination(expectedDestination),applicationCommit=receiptApplicationCommit(env);
  assertActionRuntimeDestination(sql,expected);
  need(typeof sql?.query==='function');
  readStarted=true;
  const rows=await sql.query(ACTION_RUNTIME_IDENTITY_SQL);
  need(Array.isArray(rows)&&rows.length===1&&exactData(rows[0],identityKeys));
  const identity=Object.fromEntries(identityKeys.map(key=>[key,rows[0][key]]));
  need(identity.currentUser===ACTION_RUNTIME_ROLE&&identity.sessionUser===ACTION_RUNTIME_ROLE);
  destination(Object.fromEntries(destinationKeys.map(key=>[key,identity[key]])));
  // This SELECT has exactly seven named columns. Plain SDK rows and rows with
  // a null prototype are admitted; accessors and unsolicited columns are not.
  // Another read must not erase or replace this client's identity while we wait.
  assertActionRuntimeDestination(sql,expected);
  recordActionRuntimeIdentity(sql,identity);
  assertActionRuntimeDestination(sql,expected);
  return Object.freeze({version:RECEIPT_RUNTIME_BINDING_VERSION,applicationCommit,bindingVerified:true,observedAtUtc:new Date().toISOString()});
 }catch{
  if(readStarted)invalidateActionRuntimeIdentity(sql);
  throw receiptBindingUnavailable();
 }
}
