// SPDX-License-Identifier: GPL-2.0-only
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';import {readFile} from 'node:fs/promises';
import {loadGateway,inspectGateway,WORKERS,safeJson} from './gateway-config.mjs';
import {acquireLock,atomicJson,safeDirectory} from '../pm10/store.mjs';import {fault,safeCode} from '../pm10/config.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
export function nextWorkerState(previous,{exitCode,uptimeMs,nowMs,stopping=false}){
 if(!Number.isFinite(nowMs)||!Number.isFinite(uptimeMs)||uptimeMs<0)throw fault('GATEWAY_STATE_INVALID');
 const failures=uptimeMs>=300000?0:Math.min(8,(previous?.failures||0)+1);
 if(stopping)return{state:'stopped',failures:previous?.failures||0,nextAttemptAt:null,exitCode};
 // Configuration or evidence rejection (exit 2) is not repaired by restarting a worker.
 if(exitCode===2||failures>=5)return{state:'review_required',failures,nextAttemptAt:null,exitCode};
 return{state:'retry_wait',failures,nextAttemptAt:new Date(nowMs+Math.min(900000,60000*2**Math.min(failures,4))).toISOString(),exitCode};
}
export function workerArgs(worker){if(!Object.hasOwn(WORKERS,worker.kind))throw fault('GATEWAY_WORKER_INVALID');return [path.resolve(ROOT,WORKERS[worker.kind]),'run','--config',worker.configFile];}
export async function supervise(config,{signal,spawnImpl=spawn,now=()=>Date.now(),wait=sleep,onSnapshot=async()=>{}}={}){
 const children=new Map(),states=new Map(),controller=new AbortController();let stopping=false;
 const stop=()=>{stopping=true;controller.abort();for(const child of children.values())child.kill('SIGTERM');};signal?.addEventListener('abort',stop,{once:true});
 const publish=()=>onSnapshot({schema:'municipal-clock-gateway-status.v1',updatedAt:new Date(now()).toISOString(),workers:[...states].map(([kind,state])=>({kind,...state})),allClockReceptionVerified:false,operationWhileLoggedOutVerified:false});
 async function run(worker){let previous={failures:0};while(!stopping){const started=now();states.set(worker.kind,{state:'running',failures:previous.failures,startedAt:new Date(started).toISOString()});await publish();
  const exit=await new Promise(resolve=>{let child;try{child=spawnImpl(process.execPath,workerArgs(worker),{stdio:'ignore',windowsHide:true,shell:false});children.set(worker.kind,child);}catch{resolve(1);return;}
   let settled=false;const done=code=>{if(settled)return;settled=true;children.delete(worker.kind);resolve(code);};child.once('error',()=>done(1));child.once('exit',code=>done(code));if(stopping)child.kill('SIGTERM');});
  previous=nextWorkerState(previous,{exitCode:exit,uptimeMs:now()-started,nowMs:now(),stopping});states.set(worker.kind,previous);await publish();if(stopping||previous.state==='review_required')break;
  try{await wait(Math.max(1000,Date.parse(previous.nextAttemptAt)-now()),undefined,{signal:controller.signal});}catch{break;}
 }}
 try{if(signal?.aborted)stop();await Promise.all(config.workers.filter(w=>w.enabled).map(run));}
 finally{stop();signal?.removeEventListener('abort',stop);await publish();}
 return [...states].map(([kind,state])=>({kind,...state}));
}
export async function main(argv=process.argv.slice(2)){
 if(argv.length!==3||!['check','run','status'].includes(argv[0])||argv[1]!=='--config')throw fault('GATEWAY_USAGE');
 const config=await loadGateway(argv[2]),preflight=await inspectGateway(config);
 if(argv[0]==='check'){console.log(JSON.stringify(preflight));return preflight;}
 const statusFile=path.join(config.stateDir,'gateway-status.json');
 if(argv[0]==='status'){const value=await safeJson(statusFile,16384);console.log(JSON.stringify(value));return value;}
 if(!config.workers.some(w=>w.enabled)||preflight.captureIdentities<1)throw fault('GATEWAY_NO_CAPTURE_CONFIGURED');
 await safeDirectory(config.stateDir);const release=await acquireLock(config.stateDir),controller=new AbortController();
 const stop=()=>controller.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);let write=Promise.resolve();
 const snapshot=value=>{write=write.then(()=>atomicJson(statusFile,value));return write;};
 try{await supervise(config,{signal:controller.signal,onSnapshot:snapshot});await write;}
 finally{stop();process.off('SIGTERM',stop);process.off('SIGINT',stop);await release();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(JSON.stringify({error:safeCode(e),allClocksVerified:false}));process.exitCode=2;});
