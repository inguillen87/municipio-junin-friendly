// SPDX-License-Identifier: GPL-2.0-only
// A single durable, aligned schedule for the whole fleet. Never five retry loops.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {loadSourceSenderConfig,validateSourceSenderConfig,SourceDeliveryStore,ensureSourceDirectory} from './source-delivery.mjs';
import {loadFleetToken,privateJson,stamp} from './delivery.mjs';
import {bindSenderShutdown} from './sender.mjs';
import {atomicJson,acquireLock,hash} from '../pm10/store.mjs';
import {fault,safeCode} from '../pm10/config.mjs';
const fail=code=>{throw fault('CLOCK_SOURCE_DELIVERY_'+code);};
// A bounded window limits activity, not cost: provider idle time and other
// clients still count. A request can use the final reserved twenty seconds.
export const SOURCE_WINDOW_WORK_MS=120000;
export function nextSourceWindowMs(nowMs,windowSeconds,{strict=false}={}){
 if(!Number.isSafeInteger(nowMs)||nowMs<0||!Number.isSafeInteger(windowSeconds)||windowSeconds<900||windowSeconds>3600||windowSeconds%900)fail('STATE_CORRUPT');
 const interval=windowSeconds*1000;return (strict?Math.floor(nowMs/interval)+1:Math.ceil(nowMs/interval))*interval;
}
const fresh=(clock,now)=>({version:'clock-source-sender-status.v1',clockId:clock.clockId,state:'ready',updatedAt:now().toISOString(),failures:0,code:null,sent:0,sourceStoredRecords:null,remainingParts:null,lastReceiptAt:null,lastReconciledAt:null,scope:'source_only',payrollModified:false,captureFilesRemoved:false,physicalClockVerified:false});
function validStatus(s,clock){
 if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).sort().join()!==Object.keys(fresh(clock,()=>new Date(0))).sort().join()||s.version!=='clock-source-sender-status.v1'||s.clockId!==clock.clockId||!['ready','pending','source_stored','retry_wait','blocked'].includes(s.state)||!stamp(s.updatedAt)||s.scope!=='source_only'||s.payrollModified!==false||s.captureFilesRemoved!==false||s.physicalClockVerified!==false||!Number.isSafeInteger(s.failures)||s.failures<0||s.failures>1000||!(s.code===null||typeof s.code==='string'&&/^[A-Z][A-Z0-9_]{0,70}$/.test(s.code))||!Number.isInteger(s.sent)||s.sent<0||s.sent>4||!['sourceStoredRecords','remainingParts'].every(k=>s[k]===null||Number.isSafeInteger(s[k])&&s[k]>=0)||!(s.lastReceiptAt===null||stamp(s.lastReceiptAt))||!(s.lastReconciledAt===null||stamp(s.lastReconciledAt)))fail('STATE_CORRUPT');
 if(s.state==='retry_wait'&&(s.code!=='CLOCK_SOURCE_DELIVERY_NETWORK_RETRY'||s.failures<1)||s.state==='blocked'&&(!s.code||s.failures<1)||['ready','pending','source_stored'].includes(s.state)&&(s.code!==null||s.failures!==0))fail('STATE_CORRUPT');return s;
}
export function sourceSenderBrief(s){return{clockId:s.clockId,state:s.state,code:s.code??null,updatedAt:s.updatedAt??null,sourceStoredRecords:s.sourceStoredRecords??null,remainingParts:s.remainingParts??null,lastReceiptAt:s.lastReceiptAt??null,lastReconciledAt:s.lastReconciledAt??null,scope:'source_only',payrollModified:false,physicalClockVerified:false};}
async function clockWindow(config,clock,{fetchImpl,signal,now,onStatus,preflightError,checkToken,beforeSend,resume=false}){
 const store=await new SourceDeliveryStore(path.join(config.stateDir,clock.clockId),{clockId:clock.clockId,serial:clock.serial,connectorKey:clock.connectorKey,tenantId:config.tenantId}).init();
 const release=await acquireLock(store.root),file=path.join(store.root,'status.json');let state;
 const publish=async next=>{await atomicJson(file,next);state=validStatus(await privateJson(file),clock);await onStatus(sourceSenderBrief(state));};
 try{
  try{state=validStatus(await privateJson(file),clock);}catch(e){if(e.code!=='ENOENT')throw e;state=fresh(clock,now);}
  if(resume){if(state.state!=='blocked')fail('RESUME_NOT_BLOCKED');await publish({...state,state:'ready',updatedAt:now().toISOString(),failures:0,code:null,sent:0});return sourceSenderBrief(state);}
  if(state.state==='blocked'){await onStatus(sourceSenderBrief(state));return sourceSenderBrief(state);}
  try{
   if(preflightError)throw fault(preflightError);const token=await loadFleetToken(clock.tokenFile);checkToken(clock.clockId,token);
   const result=await store.deliver({token,fetchImpl,signal,beforeSend});
   await publish({...state,...result,state:result.remainingParts?'pending':'source_stored',updatedAt:now().toISOString(),lastReconciledAt:now().toISOString(),failures:0,code:null});
  }catch(e){
   if(e.code==='CLOCK_SOURCE_DELIVERY_STOPPED'&&signal?.aborted)return sourceSenderBrief(state);
   const code=safeCode(e),transient=code==='CLOCK_SOURCE_DELIVERY_NETWORK_RETRY';
   await publish({...state,state:transient?'retry_wait':'blocked',updatedAt:now().toISOString(),failures:Math.min(1000,state.failures+1),code,sent:0});
  }
  return sourceSenderBrief(state);
 }finally{await release();}
}
function validSchedule(s,config){
 if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).sort().join()!=='cursor,nextWindowAt,schema,tenantId,windowSeconds'||s.schema!=='clock-source-schedule.v1'||s.tenantId!==config.tenantId||s.windowSeconds!==config.windowSeconds||!Number.isSafeInteger(s.cursor)||s.cursor<0||s.cursor>15||typeof s.nextWindowAt!=='string'||!stamp(s.nextWindowAt)||new Date(s.nextWindowAt).toISOString()!==s.nextWindowAt||Date.parse(s.nextWindowAt)%(config.windowSeconds*1000))fail('SCHEDULE_CORRUPT');return s;
}
export async function runSourceSender(raw,{once=false,resumeClock=null,fetchImpl=fetch,signal,now=()=>new Date(),sleep=delay,onStatus=async()=>{}}={}){
 const config=validateSourceSenderConfig(raw),results=new Map(config.clocks.map(c=>[c.clockId,sourceSenderBrief({clockId:c.clockId,state:config.enabled&&c.enabled?'scheduled':'disabled'})]));
 const summary=nextWindowAt=>({version:'clock-source-fleet-result.v1',enabled:config.enabled,nextWindowAt,clocks:config.clocks.map(c=>results.get(c.clockId)),scope:'source_only',payrollModified:false,allClockReceptionVerified:false});
 if(!config.enabled||signal?.aborted)return summary(null);
 await ensureSourceDirectory(config.stateDir);const coordinator=path.join(config.stateDir,'.delivery-source');await ensureSourceDirectory(coordinator);const release=await acquireLock(coordinator),scheduleFile=path.join(coordinator,'schedule.json');let schedule;
 const publish=async s=>{results.set(s.clockId,s);await onStatus(s);};
 try{
  try{schedule=validSchedule(await privateJson(scheduleFile),config);}catch(e){if(e.code!=='ENOENT')throw e;schedule={schema:'clock-source-schedule.v1',tenantId:config.tenantId,windowSeconds:config.windowSeconds,nextWindowAt:new Date(nextSourceWindowMs(now().getTime(),config.windowSeconds)).toISOString(),cursor:0};await atomicJson(scheduleFile,schedule);}
  if(resumeClock!==null){
   const clock=config.clocks.find(c=>c.clockId===resumeClock&&c.enabled);if(!clock)fail('CONFIG_INVALID');
   await clockWindow(config,clock,{resume:true,now,onStatus:publish});return summary(schedule.nextWindowAt);
  }
  while(!signal?.aborted){
   let time=now().getTime(),deadline=Date.parse(schedule.nextWindowAt),windowStart=Math.floor(time/(config.windowSeconds*1000))*config.windowSeconds*1000;
   // A delayed process skips a missed window instead of waking compute at an
   // arbitrary minute. Once also respects this durable shared deadline.
   if(time>=deadline&&time>=windowStart+SOURCE_WINDOW_WORK_MS-20000){schedule={...schedule,nextWindowAt:new Date(nextSourceWindowMs(time,config.windowSeconds,{strict:true})).toISOString()};await atomicJson(scheduleFile,schedule);deadline=Date.parse(schedule.nextWindowAt);}
   if(time<deadline){if(once)break;try{await sleep(Math.min(60000,deadline-time),undefined,{signal});}catch(e){if(!signal?.aborted)throw e;}continue;}
   const cursor=schedule.cursor%config.clocks.length;
   // Claim BEFORE any request. A lost response or killed process cannot cause a
   // restart storm in this window; the exact raw part retries in the next one.
   schedule={...schedule,nextWindowAt:new Date(nextSourceWindowMs(time,config.windowSeconds,{strict:true})).toISOString(),cursor:(cursor+1)%config.clocks.length};await atomicJson(scheduleFile,schedule);
   const tokenOwners=new Map(),preflightErrors=new Map();
   for(const c of config.clocks.filter(c=>c.enabled)){
    try{const digest=hash(await loadFleetToken(c.tokenFile)),owner=tokenOwners.get(digest);if(owner){preflightErrors.set(owner,'CLOCK_SOURCE_DELIVERY_DUPLICATE_TOKEN');preflightErrors.set(c.clockId,'CLOCK_SOURCE_DELIVERY_DUPLICATE_TOKEN');}else tokenOwners.set(digest,c.clockId);}
    catch(e){preflightErrors.set(c.clockId,safeCode(e));}
   }
   const checkToken=(clockId,token)=>{const digest=hash(token),owner=tokenOwners.get(digest);if(owner&&owner!==clockId)fail('DUPLICATE_TOKEN');tokenOwners.set(digest,clockId);};
   const beforeSend=()=>!signal?.aborted&&now().getTime()<windowStart+SOURCE_WINDOW_WORK_MS-20000;
   for(let n=0;n<config.clocks.length&&!signal?.aborted;n++){
    const clock=config.clocks[(cursor+n)%config.clocks.length];if(!clock.enabled)continue;
    try{results.set(clock.clockId,await clockWindow(config,clock,{fetchImpl,signal,now,onStatus:publish,preflightError:preflightErrors.get(clock.clockId)||null,checkToken,beforeSend}));}
    catch(e){await publish(sourceSenderBrief({clockId:clock.clockId,state:'review_required',code:safeCode(e)}));}
   }
   if(once)break;
  }
  return summary(schedule.nextWindowAt);
 }finally{await release();}
}
export async function main(argv=process.argv.slice(2)){
 const resume=argv[0]==='resume';if((!resume&&(argv.length!==3||!['once','run'].includes(argv[0])))||(resume&&(argv.length!==5||argv[3]!=='--clock'))||argv[1]!=='--config')fail('USAGE');
 const config=await loadSourceSenderConfig(argv[2]),controller=new AbortController(),unbind=bindSenderShutdown(controller);
 try{return await runSourceSender(config,{once:argv[0]==='once',resumeClock:resume?argv[4]:null,signal:controller.signal,onStatus:async s=>console.log(JSON.stringify(s))});}finally{unbind();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(JSON.stringify({error:safeCode(e),scope:'source_only',allClocksVerified:false}));process.exitCode=2;});
