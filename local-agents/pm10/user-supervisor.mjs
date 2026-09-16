// SPDX-License-Identifier: GPL-2.0-only
// Optional current-user launcher. Capture and delivery keep their existing locks and rules.
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {readFile,lstat,mkdir} from 'node:fs/promises';
import {spawn,fork} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {acquireLock,atomicJson} from './store.mjs';
import {fault,safeCode} from './config.mjs';
import {readOperationStatus} from './operation-status.mjs';

const SELF=fileURLToPath(import.meta.url);
export function pathsFor(base){
 if(typeof base!=='string'||!path.isAbsolute(base)||path.resolve(base)===path.parse(base).root||/[\x00-\x1f]/.test(base))throw fault('USER_BASE_INVALID');
 const root=path.resolve(base),control=path.join(root,'control');
 return {root,control,desired:path.join(control,'desired.json'),status:path.join(control,'status.json'),capture:path.join(root,'config.json'),sender:path.join(root,'sender.json')};
}
async function json(file,optional=false){
 try{const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>8192)throw fault('USER_CONTROL_INVALID');return JSON.parse(await readFile(file,'utf8'));}
 catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}
}
async function desiredState(p){
 const v=await json(p.desired,true);if(v===null)return 'stopped';
 if(v.schema!=='pm10-user-control.v1'||!['running','stopped'].includes(v.desired))throw fault('USER_CONTROL_INVALID');
 return v.desired;
}
async function exists(file){try{const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink())throw fault('USER_CONFIG_INVALID');return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function setDesired(base,desired){
 if(!['running','stopped'].includes(desired))throw fault('USER_CONTROL_INVALID');
 const p=pathsFor(base);await mkdir(p.control,{recursive:true,mode:0o700});
 await atomicJson(p.desired,{schema:'pm10-user-control.v1',desired,requestedAt:new Date().toISOString()});return p;
}
export async function readUserStatus(base){
 const p=pathsFor(base),status=await json(p.status,true);let processPresent=false;
 if(status&&Number.isSafeInteger(status.pid)&&status.pid>0){try{process.kill(status.pid,0);processPresent=true;}catch{}}
 return {desired:await desiredState(p),processPresent,status,operation:await readOperationStatus(p.root),
  scope:'current_user_session',runsWhenComputerOff:false,operationWhileLoggedOutVerified:false};
}

// Capture main installs its own SIGTERM listener after asynchronous initialization.
// Queue IPC stop/disconnect until that listener exists; never hard-kill a normal stop.
async function captureWorker(config){
 let stopRequested=false,delivered=false;
 const stop=()=>{stopRequested=true;};process.on('message',m=>{if(m?.command==='stop')stop();});process.on('disconnect',stop);
 const timer=setInterval(()=>{if(stopRequested&&!delivered&&process.listenerCount('SIGTERM')>0){delivered=true;process.emit('SIGTERM');}},25);
 try{const {main}=await import('./service.mjs');await main(['run','--config',config]);}
 finally{clearInterval(timer);if(process.connected)process.disconnect();}
}
async function senderWorker(config){
 const controller=new AbortController(),stop=()=>controller.abort();
 process.on('message',m=>{if(m?.command==='stop')stop();});process.on('disconnect',stop);
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{const {loadSenderConfig}=await import('./delivery.mjs'),{runSender}=await import('./sender.mjs');await runSender(await loadSenderConfig(config),{signal:controller.signal});}
 finally{if(process.connected)process.disconnect();}
}

export async function supervise(base,{launch=fork,sleep=delay,now=()=>Date.now()}={}){
 const p=pathsFor(base);await mkdir(p.control,{recursive:true,mode:0o700});
 const release=await acquireLock(p.control),workers=new Map();let stopping=false;
 const stop=()=>{stopping=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 const state={schema:'pm10-user-supervisor.v1',pid:process.pid,state:'starting',startedAt:new Date(now()).toISOString(),
  scope:'current_user_session',runsWhenComputerOff:false,operationWhileLoggedOutVerified:false,workers:{}};
 let nextObservation=0;
 async function save(){
  const timestamp=now();
  if(timestamp>=nextObservation){state.operation=await readOperationStatus(p.root,{now:()=>new Date(timestamp)});nextObservation=timestamp+30000;}
  state.updatedAt=new Date(timestamp).toISOString();await atomicJson(p.status,state);
 }
 function launchWorker(name,config){
  const prior=state.workers[name],attempts=(prior?.starts??0)+1;
  const child=launch(SELF,['worker-'+name,'--config',config],{execPath:process.execPath,cwd:path.dirname(SELF),windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  const row={pid:child.pid??null,state:'running',starts:attempts,lastExitCode:null,restartAt:null};
  state.workers[name]=row;workers.set(name,child);
  let ended=false;
  const end=(code,error)=>{if(ended)return;ended=true;workers.delete(name);row.state=stopping?'stopped':'exited';row.lastExitCode=Number.isInteger(code)?code:null;
   row.error=error?'USER_WORKER_START_FAILED':null;row.restartAt=attempts<3?new Date(now()+60000).toISOString():null;};
  child.once('error',()=>end(null,true));child.once('exit',code=>end(code,false));
 }
 try{
  while(!stopping&&await desiredState(p)==='running'){
   for(const [name,config] of [['capture',p.capture],['sender',p.sender]]){
    if(workers.has(name))continue;
    const previous=state.workers[name];if(previous?.starts>=3)continue;
    if(previous?.restartAt&&Date.parse(previous.restartAt)>now())continue;
    if(await exists(config))launchWorker(name,config);
    else state.workers[name]={state:'waiting_for_configuration',starts:0,pid:null};
   }
   state.state='running';await save();await sleep(1000);
  }
 }finally{
  stopping=true;state.state='stopping';
  // Stop children even if saving supervisor status fails (for example disk full).
  for(const child of workers.values()){try{if(child.connected)child.send({command:'stop'},()=>{});}catch{}}
  try{await save();}catch{}
  // Existing reader deadlines bound capture cleanup. Do not release the supervisor
  // lock while a child still holds capture/delivery ownership.
  while(workers.size)await sleep(100);
  state.state='stopped';try{await save();}finally{
   process.off('SIGINT',stop);process.off('SIGTERM',stop);await release();
  }
 }
}
// Invoked by the independent Windows scheduler. Never changes the user's
// requested state; ownership is decided by the existing atomic process lock,
// not by a possibly stale status snapshot or a PID copied from that snapshot.
export async function watchdog(base,{run=supervise}={}){
 if(await desiredState(pathsFor(base))!=='running')return 'stopped';
 try{await run(base);return 'stopped';}
 catch(e){if(e.code==='ALREADY_RUNNING')return 'already_running';throw e;}
}
export async function main(argv=process.argv.slice(2)){
 if(argv.length!==3)throw fault('USER_SUPERVISOR_USAGE');
 const [mode,flag,value]=argv;
 if(mode==='worker-capture'&&flag==='--config')return captureWorker(value);
 if(mode==='worker-sender'&&flag==='--config')return senderWorker(value);
 if(flag!=='--base'||!['run','watchdog','start','stop','status'].includes(mode))throw fault('USER_SUPERVISOR_USAGE');
 pathsFor(value);
 if(mode==='status'){console.log(JSON.stringify(await readUserStatus(value),null,2));return;}
 if(mode==='stop'){await setDesired(value,'stopped');console.log('PM10_USER_STOP_REQUESTED');return;}
 if(mode==='watchdog')return watchdog(value);
 if(mode==='start'){
  await setDesired(value,'running');
  const child=spawn(process.execPath,[SELF,'run','--base',value],{detached:true,windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
  console.log('PM10_USER_START_REQUESTED');return;
 }
 return supervise(value);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{await main();}catch(e){console.error(JSON.stringify({error:safeCode(e),scope:'current_user_session'}));process.exitCode=2;}
}
