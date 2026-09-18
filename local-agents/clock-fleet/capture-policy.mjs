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
export function nextCaptureFailure(state,{code,network,cancelled,preconnect,transient,pollSeconds,now}){
 const priorConnection=state.connectionFailureCount??0;
 const failureCount=network||cancelled||preconnect?state.failureCount:Math.min(1000,state.failureCount+1);
 const connectionFailureCount=preconnect?Math.min(1000,priorConnection+1):priorConnection;
 const blocked=!network&&!cancelled&&!preconnect&&(!transient||failureCount>=6);
 const steps=preconnect?connectionFailureCount:failureCount;
 const delay=Math.min(900,pollSeconds*2**Math.min(Math.max(0,steps-1),4));
 return{failureCount,connectionFailureCount,blocked,status:cancelled?'stopped':network?'network_wait':blocked?'blocked':'retry_wait',lastError:code,nextPollAt:blocked?null:new Date(now.getTime()+delay*1000).toISOString()};
}
