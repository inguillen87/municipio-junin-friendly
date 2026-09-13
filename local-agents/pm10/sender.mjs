// SPDX-License-Identifier: GPL-2.0-only
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {readFile,lstat} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {loadSenderConfig,loadToken,DeliveryStore} from './delivery.mjs';
import {atomicJson,acquireLock} from './store.mjs';
import {safeCode,fault} from './config.mjs';
export async function runSender(config,{once=false,resume=false,fetchImpl=fetch,signal,now=()=>new Date(),sleep=delay}={}){
 const store=await new DeliveryStore(config.stateDir).init(),release=await acquireLock(store.root);
 const statusFile=path.join(store.root,'status.json');let failures=0;
 try{
  let previous;
  try{const st=await lstat(statusFile);if(!st.isFile()||st.isSymbolicLink()||st.size>8192)throw fault('DELIVERY_STATE_CORRUPT');previous=JSON.parse(await readFile(statusFile,'utf8'));}
  catch(e){if(e.code!=='ENOENT')throw e;}
  if(previous&&(previous.version!=='pm10-sender-status.v1'||!['ready','pending','queue_confirmed','retry_wait','blocked'].includes(previous.state)))throw fault('DELIVERY_STATE_CORRUPT');
  if(previous?.state==='blocked'&&!resume)throw fault('DELIVERY_REVIEW_REQUIRED');
  if(resume){await atomicJson(statusFile,{version:'pm10-sender-status.v1',state:'ready',updatedAt:now().toISOString(),physicalClockVerified:false});return;}
  if(previous?.state==='retry_wait'){
   if(!Number.isInteger(previous.failures)||previous.failures<1||!Number.isFinite(Date.parse(previous.nextAttemptAt)))throw fault('DELIVERY_STATE_CORRUPT');
   failures=previous.failures;const wait=Math.min(900000,Date.parse(previous.nextAttemptAt)-now().getTime());
   if(wait>0){if(once)return;try{await sleep(wait,undefined,{signal});}catch(e){if(!signal?.aborted)throw e;}}
  }
  while(!signal?.aborted){
   let wait=config.pollSeconds*1000;
   try{
    const token=await loadToken(config.tokenFile);
    const result=await store.deliver({token,connectorKey:config.connectorKey,fetchImpl});failures=0;
    await atomicJson(statusFile,{version:'pm10-sender-status.v1',state:result.remainingParts?'pending':'queue_confirmed',updatedAt:now().toISOString(),...result});
   }catch(e){
    const code=safeCode(e),transient=code==='DELIVERY_NETWORK_RETRY';failures=Math.min(1000,failures+1);
    wait=Math.min(900000,config.pollSeconds*1000*2**Math.min(failures-1,6));
    await atomicJson(statusFile,{version:'pm10-sender-status.v1',state:transient?'retry_wait':'blocked',updatedAt:now().toISOString(),code,failures,nextAttemptAt:transient?new Date(now().getTime()+wait).toISOString():null,physicalClockVerified:false});
    if(!transient||once)throw e;
   }
   if(once)break;
   try{await sleep(wait,undefined,{signal});}catch(e){if(!signal?.aborted)throw e;}
  }
 }finally{await release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(args.length!==3||!['run','once','resume'].includes(args[0])||args[1]!=='--config'){console.error('Uso: node sender.mjs run|once|resume --config ruta-config.json');process.exitCode=2;}
 else{const c=new AbortController();process.once('SIGTERM',()=>c.abort());process.once('SIGINT',()=>c.abort());try{await runSender(await loadSenderConfig(args[2]),{once:args[0]==='once',resume:args[0]==='resume',signal:c.signal});}catch(e){console.error('Envío detenido:',safeCode(e));process.exitCode=2;}}
}
