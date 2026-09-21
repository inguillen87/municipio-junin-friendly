// SPDX-License-Identifier: GPL-2.0-only
// Independent durable retries per enrolled clock. Never clears another worker's state.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {loadFleetSenderConfig,validateFleetSenderConfig,loadFleetToken,FleetDeliveryStore,privateJson,stamp} from './delivery.mjs';
import {atomicJson,acquireLock,hash} from '../pm10/store.mjs';
import {fault,safeCode} from '../pm10/config.mjs';
const fail=code=>{throw fault('ZK40_DELIVERY_'+code);};
export function fleetRetryDelayMs(failures,random=Math.random){if(!Number.isSafeInteger(failures)||failures<1||failures>1000)fail('STATE_CORRUPT');const sample=random();if(!Number.isFinite(sample)||sample<0||sample>=1)fail('RETRY_INVALID');const ceiling=Math.min(900000,60000*2**Math.min(failures,4));return Math.floor(ceiling/2+sample*ceiling/2);}
const fresh=(clock,now)=>({version:'zk40-sender-status.v1',clockId:clock.clockId,state:'ready',updatedAt:now().toISOString(),failures:0,code:null,nextAttemptAt:null,sent:0,confirmedRecords:null,remainingParts:null,lastReceiptAt:null,lastReconciledAt:null,captureFilesRemoved:false,physicalClockVerified:false});
function validState(s,clock){
 const keys=Object.keys(fresh(clock,()=>new Date(0)));
 if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).sort().join()!==keys.sort().join()||s.version!=='zk40-sender-status.v1'||s.clockId!==clock.clockId||!['ready','pending','queue_confirmed','retry_wait','blocked'].includes(s.state)||!stamp(s.updatedAt)||s.captureFilesRemoved!==false||s.physicalClockVerified!==false||!Number.isSafeInteger(s.failures)||s.failures<0||s.failures>1000||!(s.code===null||typeof s.code==='string'&&/^[A-Z][A-Z0-9_]{0,70}$/.test(s.code))||!(s.nextAttemptAt===null||stamp(s.nextAttemptAt))||!Number.isInteger(s.sent)||s.sent<0||s.sent>4||!['confirmedRecords','remainingParts'].every(k=>s[k]===null||Number.isSafeInteger(s[k])&&s[k]>=0)||!(s.lastReceiptAt===null||stamp(s.lastReceiptAt))||!(s.lastReconciledAt===null||stamp(s.lastReconciledAt)))fail('STATE_CORRUPT');
 if(s.state==='retry_wait'&&(s.code!=='ZK40_DELIVERY_NETWORK_RETRY'||s.failures<1||!s.nextAttemptAt)||s.state!=='retry_wait'&&s.nextAttemptAt!==null||s.state==='blocked'&&(!s.code||s.failures<1)||['ready','pending','queue_confirmed'].includes(s.state)&&(s.code!==null||s.failures!==0))fail('STATE_CORRUPT');return s;
}
export function fleetSenderBrief(s){return{clockId:s.clockId,state:s.state,code:s.code??null,updatedAt:s.updatedAt??null,nextAttemptAt:s.nextAttemptAt??null,confirmedRecords:s.confirmedRecords??null,remainingParts:s.remainingParts??null,lastReceiptAt:s.lastReceiptAt??null,lastReconciledAt:s.lastReconciledAt??null,physicalClockVerified:false};}
export async function runClockSender(config,clock,{once=false,resume=false,fetchImpl=fetch,signal,now=()=>new Date(),sleep=delay,random=Math.random,onStatus=async()=>{},preflightError=null,checkToken=()=>{}}={}){
 if(!clock.enabled)return fleetSenderBrief({clockId:clock.clockId,state:'disabled'});
 const store=await new FleetDeliveryStore(path.join(config.stateDir,clock.clockId),{clockId:clock.clockId,serial:clock.serial,connectorKey:clock.connectorKey}).init();
 const release=await acquireLock(store.root),statusFile=path.join(store.root,'status.json');let state;
 const publish=async next=>{await atomicJson(statusFile,next);state=validState(await privateJson(statusFile),clock);await onStatus(fleetSenderBrief(state));};
 try{
  try{state=validState(await privateJson(statusFile),clock);}catch(e){if(e.code!=='ENOENT')throw e;state=fresh(clock,now);}
  if(resume){if(state.state!=='blocked')fail('RESUME_NOT_BLOCKED');await publish({...state,state:'ready',updatedAt:now().toISOString(),failures:0,code:null,nextAttemptAt:null,sent:0});return fleetSenderBrief(state);}
  if(state.state==='blocked'){await onStatus(fleetSenderBrief(state));return fleetSenderBrief(state);}
  if(state.state==='retry_wait'){
   const remaining=Math.min(900000,Date.parse(state.nextAttemptAt)-now().getTime());
   if(remaining>0){if(once)return fleetSenderBrief(state);try{await sleep(remaining,undefined,{signal});}catch(e){if(!signal?.aborted)throw e;}}
  }
  while(!signal?.aborted){let wait=config.pollSeconds*1000;
   try{if(preflightError)throw fault(preflightError);const token=await loadFleetToken(clock.tokenFile);checkToken(clock.clockId,token);const result=await store.deliver({token,fetchImpl,signal});
    await publish({...state,...result,state:result.remainingParts?'pending':'queue_confirmed',updatedAt:now().toISOString(),lastReconciledAt:now().toISOString(),failures:0,code:null,nextAttemptAt:null});
   }catch(e){if(e.code==='ZK40_DELIVERY_STOPPED'&&signal?.aborted)break;
    const code=safeCode(e),transient=code==='ZK40_DELIVERY_NETWORK_RETRY',failures=Math.min(1000,state.failures+1);wait=transient?fleetRetryDelayMs(failures,random):0;
    await publish({...state,state:transient?'retry_wait':'blocked',updatedAt:now().toISOString(),failures,code,nextAttemptAt:transient?new Date(now().getTime()+wait).toISOString():null,sent:0});
    if(!transient||once)return fleetSenderBrief(state);
   }
   if(once)break;try{await sleep(wait,undefined,{signal});}catch(e){if(!signal?.aborted)throw e;}
  }
  return fleetSenderBrief(state);
 }finally{await release();}
}
export async function runFleetSender(raw,options={}){
 const config=validateFleetSenderConfig(raw),results=new Map(),tokenOwners=new Map(),preflightErrors=new Map();
 // Detect duplicated credentials before any device sends. Fingerprints remain
 // local to this process and are never persisted or included in its reports.
 for(const c of config.clocks.filter(c=>c.enabled)){
  try{const digest=hash(await loadFleetToken(c.tokenFile)),owner=tokenOwners.get(digest);if(owner){preflightErrors.set(owner,'ZK40_DELIVERY_DUPLICATE_TOKEN');preflightErrors.set(c.clockId,'ZK40_DELIVERY_DUPLICATE_TOKEN');}else tokenOwners.set(digest,c.clockId);}
  catch(e){preflightErrors.set(c.clockId,safeCode(e));}
 }
 const checkToken=(clockId,token)=>{const digest=hash(token),owner=tokenOwners.get(digest);if(owner&&owner!==clockId)fail('DUPLICATE_TOKEN');tokenOwners.set(digest,clockId);};
 await Promise.all(config.clocks.map(async clock=>{
  try{const result=await runClockSender(config,clock,{...options,preflightError:preflightErrors.get(clock.clockId)||null,checkToken,onStatus:async s=>{results.set(clock.clockId,s);await options.onStatus?.(s);}});results.set(clock.clockId,result);}
  catch(e){const result=fleetSenderBrief({clockId:clock.clockId,state:'review_required',code:safeCode(e)});results.set(clock.clockId,result);await options.onStatus?.(result);}
 }));
 // If every clock needs review, keep the supervised process idle. Restarting is
 // not a review and must not turn permanent failures into repeated network work.
 if(!options.once&&!options.resume){while(!options.signal?.aborted){try{await (options.sleep||delay)(60000,undefined,{signal:options.signal});}catch(e){if(!options.signal?.aborted)throw e;}}}
 return{version:'zk40-fleet-sender-result.v1',clocks:config.clocks.map(c=>results.get(c.clockId)),allClockReceptionVerified:false};
}
export function bindSenderShutdown(controller,emitter=process){
 const stop=()=>controller.abort(),message=value=>{if(value?.command==='stop'||value?.type==='shutdown')stop();};
 emitter.on('SIGTERM',stop);emitter.on('SIGINT',stop);emitter.on('disconnect',stop);emitter.on('message',message);
 return()=>{emitter.off('SIGTERM',stop);emitter.off('SIGINT',stop);emitter.off('disconnect',stop);emitter.off('message',message);};
}
export async function main(argv=process.argv.slice(2)){
 const resume=argv[0]==='resume';if((!resume&&(argv.length!==3||!['once','run'].includes(argv[0])))||(resume&&(argv.length!==5||argv[3]!=='--clock'))||argv[1]!=='--config')fail('USAGE');
 const config=await loadFleetSenderConfig(argv[2]),controller=new AbortController(),unbind=bindSenderShutdown(controller);
 try{if(resume){const clock=config.clocks.find(c=>c.clockId===argv[4]);if(!clock||!clock.enabled)fail('CONFIG_INVALID');const result=await runClockSender(config,clock,{resume:true,signal:controller.signal});console.log(JSON.stringify(result));return result;}
  return await runFleetSender(config,{once:argv[0]==='once',signal:controller.signal,onStatus:async s=>console.log(JSON.stringify(s))});
 }finally{unbind();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(JSON.stringify({error:safeCode(e),allClocksVerified:false}));process.exitCode=2;});
