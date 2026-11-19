// SPDX-License-Identifier: GPL-2.0-only
// Distinguish inability to open a TCP session from failures after authentication.
// Only explicit reader evidence allows unattended recovery; never clear stored blocks.
const CONNECT_ERRORS=new Set(['CONNECT_TIMEOUT','ECONNRESET','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT']);
export function beforeClockSession(result){
 const r=result?.report;
 return r?.schemaVersion==='municontrol.attendance-download-pilot.v4.1'
  &&r.status==='CONNECTION_OR_AUTH_FAILED'&&r.tcpConnected===false
  &&r.authenticationAccepted===false&&r.credentialAttempts===0
  &&r.error?.phase==='TCP_CONNECT'&&r.diagnostics?.lastPhase==='TCP_CONNECT'
  &&CONNECT_ERRORS.has(r.error?.code);
}
// TCP opened but the reader never answered the first unauthenticated exchange (the class already reviewed for manual
// recovery as preauth-connect-timeout.v1). No credential left this host, so the attempt is not ambiguous. The report must
// be the one of this very clock: the same serial the manual recovery class demands.
export function beforeAuthentication(result,clock){
 const r=result?.report;
 return typeof clock?.serial==='string'&&clock.serial.length>0
  &&r?.schemaVersion==='municontrol.attendance-download-pilot.v4.1'&&r.expectedSerial===clock.serial
  &&r.status==='CONNECTION_OR_AUTH_FAILED'&&r.tcpConnected===true
  &&r.authenticationAccepted===false&&r.credentialAttempts===0&&r.attendanceTransferComplete===false
  &&r.error?.code==='RESPONSE_TIMEOUT'&&r.error?.phase==='CONNECT'&&r.diagnostics?.lastPhase==='CONNECT'
  &&Array.isArray(r.exchanges)&&r.exchanges.length===1&&r.exchanges[0]?.code===1000
  &&r.configurationChanged===false&&r.attendanceDeleted===false&&r.biometricTemplatesRead===false&&r.userDirectoryRead===false;
}
// Coherent evidence, in the status bound to this identity, that the reader already delivered a complete verified capture:
// when it finished, the hash of that snapshot and how many records it held. A complete capture that was empty or repeated
// earlier records is still a capture. Nothing here expires with time.
const INSTANT=/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
const count=value=>Number.isSafeInteger(value)&&value>=0;
export function verifiedPriorCapture(state,clock){
 return state?.schema==='clock-fleet-status.v1'&&typeof clock?.clockId==='string'&&state.clockId===clock.clockId
  &&typeof clock.serial==='string'&&clock.serial.length>0&&state.serial===clock.serial
  &&typeof state.lastCaptureAt==='string'&&INSTANT.test(state.lastCaptureAt)&&Number.isFinite(Date.parse(state.lastCaptureAt))
  &&new Date(state.lastCaptureAt.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===state.lastCaptureAt.slice(0,10)
  &&typeof state.lastCaptureSha256==='string'&&/^[a-f0-9]{64}$/.test(state.lastCaptureSha256)
  &&count(state.snapshotRecordCount)&&count(state.newUniqueRecordsLastCycle)&&state.newUniqueRecordsLastCycle<=state.snapshotRecordCount
  &&count(state.uniqueLocalRecords)&&state.uniqueLocalRecords>=state.newUniqueRecordsLastCycle;
}
// A reader with that evidence keeps being polled through the pre-authentication class: it waits like an unreachable
// reader instead of spending the six-failure budget. Stored blocks are never cleared here.
export function unattendedRetryAllowed(state,result,clock){
 return beforeClockSession(result)||(state?.blocked!==true&&verifiedPriorCapture(state,clock)&&beforeAuthentication(result,clock));
}
export function nextCaptureFailure(state,{code,network,cancelled,preconnect,transient,pollSeconds,now,storageWait=false}){
 if(storageWait===true&&code==='DISK_SPACE_LOW'&&!cancelled&&!state.blocked){
  return {failureCount:state.failureCount,connectionFailureCount:state.connectionFailureCount??0,blocked:false,status:'storage_wait',lastError:code,
   nextPollAt:new Date(now.getTime()+Math.max(60,Math.min(900,pollSeconds))*1000).toISOString()};
 }
 const priorConnection=state.connectionFailureCount??0;
 const failureCount=network||cancelled||preconnect?state.failureCount:Math.min(1000,state.failureCount+1);
 const connectionFailureCount=preconnect?Math.min(1000,priorConnection+1):priorConnection;
 const blocked=!network&&!cancelled&&!preconnect&&(!transient||failureCount>=6);
 const steps=preconnect?connectionFailureCount:failureCount;
 const delay=Math.min(900,pollSeconds*2**Math.min(Math.max(0,steps-1),4));
 return{failureCount,connectionFailureCount,blocked,status:cancelled?'stopped':network?'network_wait':blocked?'blocked':'retry_wait',lastError:code,nextPollAt:blocked?null:new Date(now.getTime()+delay*1000).toISOString()};
}
