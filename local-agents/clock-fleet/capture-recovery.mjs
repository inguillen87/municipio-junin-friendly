// SPDX-License-Identifier: GPL-2.0-only
// A reviewed request is consumed by the existing owner. This module never opens a clock.
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {mkdir,lstat,readFile,open} from 'node:fs/promises';
import {acquireLock,atomicJson,safeDirectory} from '../pm10/store.mjs';
import {fault,safeCode} from '../pm10/config.mjs';

const owners=new WeakMap();
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX=/^[a-f0-9]{64}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function requireValue(value,code){if(!value)throw fault(code);}
function exact(value,keys){requireValue(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys.sort().join(),'CAPTURE_RECOVERY_INPUT_INVALID');}
async function bounded(file,limit){
  const stat=await lstat(file);
  requireValue(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=limit,'CAPTURE_RECOVERY_EVIDENCE_INVALID');
  return readFile(file);
}
async function optionalJson(file,limit=32768){
  try{return JSON.parse((await bounded(file,limit)).toString('utf8'));}
  catch(error){if(error.code==='ENOENT')return null;throw fault('CAPTURE_RECOVERY_EVIDENCE_INVALID');}
}
async function syncDirectory(directory){
  if(process.platform==='win32')return;
  const handle=await open(directory,'r');try{await handle.sync();}finally{await handle.close();}
}
async function writeOnce(file,bytes){
  const handle=await open(file,'wx',0o600);
  try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  await syncDirectory(path.dirname(file));
}
function clockRoot(fleet,clock){
  requireValue(fleet?.schema==='municontrol-clock-fleet.v1'&&fleet.approved===true&&path.isAbsolute(fleet.stateDir),'CAPTURE_RECOVERY_CONFIG_INVALID');
  requireValue(clock?.enabled===true&&fleet.clocks.some(value=>JSON.stringify(canonical(value))===JSON.stringify(canonical(clock))),'CAPTURE_RECOVERY_CLOCK_INVALID');
  requireValue(/^[a-z][a-z0-9-]{1,63}$/.test(clock.clockId),'CAPTURE_RECOVERY_CLOCK_INVALID');
  return path.join(fleet.stateDir,clock.clockId);
}
export function recoveryConfigurationHash(fleet){return hash(JSON.stringify(canonical(fleet)));}
function eligible(state,report,clock){
  requireValue(state.schema==='clock-fleet-status.v1'&&state.clockId===clock.clockId&&state.serial===clock.serial&&state.cloudReception==='not_configured', 'CAPTURE_RECOVERY_IDENTITY_CHANGED');
  requireValue(state.blocked===true&&state.status==='blocked'&&state.lastError==='RESPONSE_TIMEOUT'&&Number.isSafeInteger(state.failureCount)&&state.failureCount>=6&&state.failureCount<=1000
    &&(state.connectionFailureCount===undefined||Number.isSafeInteger(state.connectionFailureCount)&&state.connectionFailureCount>=0&&state.connectionFailureCount<=1000)&&state.nextPollAt===null,'CAPTURE_RECOVERY_CLASS_NOT_REVIEWED');
  requireValue(report?.schemaVersion==='municontrol.attendance-download-pilot.v4.1'&&report.expectedSerial===clock.serial
    &&report.status==='CONNECTION_OR_AUTH_FAILED'&&report.tcpConnected===true&&report.authenticationAccepted===false&&report.credentialAttempts===0
    &&report.attendanceTransferComplete===false&&report.error?.code==='RESPONSE_TIMEOUT'&&report.error?.phase==='CONNECT'
    &&report.diagnostics?.lastPhase==='CONNECT'&&Array.isArray(report.exchanges)&&report.exchanges.length===1&&report.exchanges[0].code===1000
    &&report.configurationChanged===false&&report.attendanceDeleted===false&&report.biometricTemplatesRead===false&&report.userDirectoryRead===false,
    'CAPTURE_RECOVERY_CLASS_NOT_REVIEWED');
}
async function snapshot(fleet,clock){
  const root=clockRoot(fleet,clock);
  const [identityBytes,statusBytes,reportBytes]=await Promise.all([
    bounded(path.join(root,'identity.json'),1024),bounded(path.join(root,'status.json'),32768),bounded(path.join(root,'attempt-report.json'),4*1024*1024),
  ]);
  let identity,state,report;
  try{identity=JSON.parse(identityBytes);state=JSON.parse(statusBytes);report=JSON.parse(reportBytes);}catch{throw fault('CAPTURE_RECOVERY_EVIDENCE_INVALID');}
  exact(identity,['schema','clockId','serial']);
  requireValue(identity.schema==='clock-fleet-identity.v1'&&identity.clockId===clock.clockId&&identity.serial===clock.serial,'CAPTURE_RECOVERY_IDENTITY_CHANGED');
  return {root,identityBytes,statusBytes,reportBytes,state,report,
    configurationSha256:recoveryConfigurationHash(fleet),statusSha256:hash(statusBytes),reportSha256:hash(reportBytes)};
}
export async function captureRecoveryReadiness(fleet,clock){
  const value=await snapshot(fleet,clock);eligible(value.state,value.report,clock);
  return {version:'clock-capture-recovery-readiness.v1',clockId:clock.clockId,serial:clock.serial,
    configurationSha256:value.configurationSha256,statusSha256:value.statusSha256,reportSha256:value.reportSha256,
    reviewedClass:'preauth-connect-timeout.v1',eligibleForOperatorReview:true,clockConnections:0,credentialReads:0};
}
function reviewInput(value){
  exact(value,['version','requestId','clockId','serial','configurationSha256','statusSha256','reportSha256','reason']);
  requireValue(value.version==='clock-capture-recovery-review.v1'&&UUID.test(value.requestId),'CAPTURE_RECOVERY_INPUT_INVALID');
  requireValue([value.configurationSha256,value.statusSha256,value.reportSha256].every(item=>typeof item==='string'&&HEX.test(item)),'CAPTURE_RECOVERY_INPUT_INVALID');
  requireValue(typeof value.reason==='string'&&value.reason===value.reason.trim()&&value.reason.length>=10&&value.reason.length<=1000&&!/[\u0000-\u001f\u007f]/u.test(value.reason),'CAPTURE_RECOVERY_INPUT_INVALID');
}
export async function readCaptureRecoveryReview(file){
  requireValue(path.isAbsolute(file),'CAPTURE_RECOVERY_INPUT_INVALID');
  let value;try{value=JSON.parse(await bounded(file,8192));}catch{throw fault('CAPTURE_RECOVERY_INPUT_INVALID');}
  reviewInput(value);return value;
}
async function activeOperation(root){
  const directory=path.join(root,'capture-recovery'),active=await optionalJson(path.join(directory,'active.json'),1024);
  if(!active)return null;
  exact(active,['version','requestId','requestSha256']);
  requireValue(active.version==='clock-capture-recovery-active.v1'&&UUID.test(active.requestId)&&HEX.test(active.requestSha256),'CAPTURE_RECOVERY_EVIDENCE_INVALID');
  const operation=path.join(directory,active.requestId),bytes=await bounded(path.join(operation,'request.json'),8192);
  requireValue(hash(bytes)===active.requestSha256,'CAPTURE_RECOVERY_EVIDENCE_INVALID');
  let request;try{request=JSON.parse(bytes);}catch{throw fault('CAPTURE_RECOVERY_EVIDENCE_INVALID');}
  exact(request,['version','review','requestedAt','identitySha256']);reviewInput(request.review);
  requireValue(request.version==='clock-capture-recovery-request.v1'&&request.review.requestId===active.requestId&&HEX.test(request.identitySha256),'CAPTURE_RECOVERY_EVIDENCE_INVALID');
  return {operation,request,requestSha256:active.requestSha256};
}
function checkedConsumed(value,active){
  exact(value,['version','requestId','requestSha256','consumedAt']);
  requireValue(value.version==='clock-capture-recovery-consumed.v1'&&value.requestId===active.request.review.requestId
    &&value.requestSha256===active.requestSha256&&typeof value.consumedAt==='string'&&Number.isFinite(Date.parse(value.consumedAt)),
    'CAPTURE_RECOVERY_EVIDENCE_INVALID');
}
export async function requestCaptureRecovery(fleet,clock,review,{loadState,now=()=>new Date()}={}){
  reviewInput(review);review=structuredClone(review);const root=clockRoot(fleet,clock);
  requireValue(review.clockId===clock.clockId&&review.serial===clock.serial,'CAPTURE_RECOVERY_IDENTITY_CHANGED');
  requireValue(typeof loadState==='function','CAPTURE_RECOVERY_STATE_LOADER_REQUIRED');
  const release=await acquireLock(root);
  try{
    const current=await snapshot(fleet,clock);
    await loadState(root,clock);eligible(current.state,current.report,clock);
    requireValue(['configurationSha256','statusSha256','reportSha256'].every(key=>review[key]===current[key]),'CAPTURE_RECOVERY_PREIMAGE_CHANGED');
    const previous=await activeOperation(root);
    if(previous){
      const consumed=await optionalJson(path.join(previous.operation,'consumed.json'));
      requireValue(consumed!==null,'CAPTURE_RECOVERY_REQUEST_PENDING');checkedConsumed(consumed,previous);
      const result=await optionalJson(path.join(previous.operation,'result.json'));
      requireValue(result!==null,'CAPTURE_RECOVERY_INTERRUPTED_REVIEW');
      requireValue(result.version==='clock-capture-recovery-result.v1'&&result.requestId===previous.request.review.requestId
        &&result.requestSha256===previous.requestSha256&&result.clockId===previous.request.review.clockId
        &&['capture_complete','blocked'].includes(result.outcome)&&result.automaticRetry===false,'CAPTURE_RECOVERY_EVIDENCE_INVALID');
    }
    const directory=path.join(root,'capture-recovery');await safeDirectory(directory);
    const operation=path.join(directory,review.requestId);
    try{await mkdir(operation,{mode:0o700});}catch(error){if(error.code==='EEXIST')throw fault('CAPTURE_RECOVERY_REQUEST_REPLAY');throw error;}
    await syncDirectory(directory);
    await writeOnce(path.join(operation,'identity-before.json'),current.identityBytes);
    await writeOnce(path.join(operation,'status-before.json'),current.statusBytes);
    await writeOnce(path.join(operation,'attempt-before.json'),current.reportBytes);
    const request={version:'clock-capture-recovery-request.v1',review,requestedAt:now().toISOString(),identitySha256:hash(current.identityBytes)};
    const bytes=jsonBytes(request);await writeOnce(path.join(operation,'request.json'),bytes);
    await atomicJson(path.join(directory,'active.json'),{version:'clock-capture-recovery-active.v1',requestId:review.requestId,requestSha256:hash(bytes)});
    return {ok:true,requestId:review.requestId,clockId:clock.clockId,state:'pending_reviewed_attempt',clockConnections:0,credentialReads:0};
  }finally{await release();}
}
export async function acquireCaptureRecoveryOwner(fleet){
  const releaseLock=await acquireLock(fleet.stateDir),owner=Object.freeze({});
  owners.set(owner,{root:fleet.stateDir,configurationSha256:recoveryConfigurationHash(fleet)});
  let released=false;
  return {owner,release:async()=>{if(released)return;released=true;owners.delete(owner);await releaseLock();}};
}
async function assertClockOwner(root){
  const owner=await optionalJson(path.join(root,'process.lock','owner.json'),4096);
  requireValue(owner&&owner.pid===process.pid&&owner.hostname===os.hostname()&&typeof owner.token==='string'&&owner.token.length>0,'CAPTURE_RECOVERY_CLOCK_OWNER_REQUIRED');
}
export async function beginCaptureRecovery(fleet,clock,state,{owner,signal,now=()=>new Date()}={}){
  const owned=owners.get(owner);
  if(!owned)return null;
  requireValue(owned.root===fleet.stateDir&&owned.configurationSha256===recoveryConfigurationHash(fleet),'CAPTURE_RECOVERY_COLLECTOR_CHANGED');
  const root=clockRoot(fleet,clock);await assertClockOwner(root);
  const active=await activeOperation(root);if(!active)return null;
  const prior=await optionalJson(path.join(active.operation,'consumed.json'));
  if(prior){checkedConsumed(prior,active);return null;}
  const {review}=active.request;
  requireValue(review.clockId===clock.clockId&&review.serial===clock.serial,'CAPTURE_RECOVERY_IDENTITY_CHANGED');
  const [identityBefore,statusBefore,reportBefore]=await Promise.all([
    bounded(path.join(active.operation,'identity-before.json'),1024),bounded(path.join(active.operation,'status-before.json'),32768),
    bounded(path.join(active.operation,'attempt-before.json'),4*1024*1024),
  ]);
  requireValue(hash(identityBefore)===active.request.identitySha256&&hash(statusBefore)===review.statusSha256&&hash(reportBefore)===review.reportSha256,'CAPTURE_RECOVERY_EVIDENCE_INVALID');
  const consumed={version:'clock-capture-recovery-consumed.v1',requestId:review.requestId,requestSha256:active.requestSha256,consumedAt:now().toISOString()};
  await writeOnce(path.join(active.operation,'consumed.json'),jsonBytes(consumed));
  let allowed=true,code=null,current;
  try{
    current=await snapshot(fleet,clock);eligible(current.state,current.report,clock);
    requireValue(JSON.stringify(canonical(state))===JSON.stringify(canonical({...state,...current.state})),'CAPTURE_RECOVERY_PREIMAGE_CHANGED');
    requireValue(hash(current.identityBytes)===active.request.identitySha256&&['configurationSha256','statusSha256','reportSha256'].every(key=>current[key]===review[key]),'CAPTURE_RECOVERY_PREIMAGE_CHANGED');
    if(signal?.aborted)throw fault('CANCELLED');
  }catch(error){allowed=false;code=safeCode(error);}
  return {...active,allowed,code,consumedAt:consumed.consumedAt,statusFile:path.join(root,'status.json')};
}
export async function finishCaptureRecovery(attempt,state,{succeeded=false,code=null,statusWillBeWritten=false,now=()=>new Date()}={}){
  requireValue(attempt&&typeof attempt.operation==='string','CAPTURE_RECOVERY_ATTEMPT_REQUIRED');
  const before=await bounded(path.join(attempt.operation,'status-before.json'),32768);
  let afterBytes;
  try{afterBytes=statusWillBeWritten?jsonBytes(state):await bounded(attempt.statusFile,32768);}
  catch(error){if(error.code!=='ENOENT')throw error;afterBytes=null;}
  const result={version:'clock-capture-recovery-result.v1',requestId:attempt.request.review.requestId,
    requestSha256:attempt.requestSha256,clockId:state.clockId,outcome:succeeded?'capture_complete':'blocked',
    code:succeeded?null:(code??attempt.code??'CAPTURE_RECOVERY_NOT_COMPLETED'),finishedAt:now().toISOString(),
    statusBeforeSha256:hash(before),statusAfterSha256:afterBytes?hash(afterBytes):null,
    captureSha256:succeeded?state.lastCaptureSha256:null,records:succeeded?state.snapshotRecordCount:null,
    automaticRetry:false};
  await writeOnce(path.join(attempt.operation,'result.json'),jsonBytes(result));
  return result;
}
