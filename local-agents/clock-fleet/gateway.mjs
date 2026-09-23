// SPDX-License-Identifier: GPL-2.0-only
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {lstat,realpath,open,unlink} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {loadGateway,inspectGateway,readGatewayOverview,WORKERS,safeJson,absoluteLocal} from './gateway-config.mjs';
import {acquireLock,atomicJson,safeDirectory} from '../pm10/store.mjs';import {fault,safeCode} from '../pm10/config.mjs';
import {replaceFile} from '../pm10/file-replacement.mjs';import {renderGatewayOverview} from './overview.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
export const OVERVIEW_INTERVAL_MS=30000;
const pathKey=p=>process.platform==='win32'?p.toLowerCase():p;
async function overviewDirectory(dir){
 const s=await lstat(dir);
 if(!s.isDirectory()||s.isSymbolicLink()||pathKey(await realpath(dir))!==pathKey(dir)||(process.platform!=='win32'&&(s.mode&0o077)))throw fault('GATEWAY_OVERVIEW_PATH_UNSAFE');
 return s;
}
async function overviewDestination(file){
 try{const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||(process.platform!=='win32'&&(s.mode&0o077)))throw fault('GATEWAY_OVERVIEW_PATH_UNSAFE');}
 catch(error){if(error.code!=='ENOENT')throw error;}
}
// Only the coordinator's fixed presentation file is writable here. No queue,
// credential, capture/delivery status or control file is opened for writing.
export async function writeGatewayOverviewHtml(stateDir,html){
 const dir=absoluteLocal(stateDir),file=path.join(dir,'estado.html');
 if(typeof html!=='string'||Buffer.byteLength(html)>1024*1024)throw fault('GATEWAY_OVERVIEW_HTML_INVALID');
 const before=await overviewDirectory(dir);await overviewDestination(file);
 const temp=path.join(dir,'.overview-'+randomUUID()+'.tmp');let created=false;
 try{
  const h=await open(temp,'wx',0o600);created=true;
  try{await h.writeFile(html);await h.sync();}finally{await h.close();}
  const after=await overviewDirectory(dir);if(before.dev!==after.dev||before.ino!==after.ino)throw fault('GATEWAY_OVERVIEW_PATH_UNSAFE');
  await overviewDestination(file);await replaceFile(temp,file);created=false;
  if(process.platform!=='win32'){const h=await open(dir,'r');try{await h.sync();}finally{await h.close();}}
 }finally{
  // Remove only this operation's temporary file, and only in the same directory.
  if(created)try{const current=await overviewDirectory(dir);if(current.dev===before.dev&&current.ino===before.ino)await unlink(temp);}catch{}
 }
}
function unavailableOverview(now){
 const at=now().toISOString();
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>MuniControl · Central de relojes</title><style>body{margin:0;background:#f3f7f6;color:#173d45;font:16px/1.6 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:24px}section{padding:24px;background:white;border:1px solid #ccdedb;border-radius:12px}h1{font-size:28px;line-height:1.2}time{overflow-wrap:anywhere}</style></head><body><main><h1>Central de relojes</h1><section role="status"><h2>Consulta local no disponible</h2><p>No se pudo preparar este corte. No se muestran cifras anteriores como actuales.</p><p>Intento de consulta: <time datetime="${at}">${at}</time></p><p>Mientras el coordinador esté en ejecución, volverá a consultar los archivos de estado. Revisá el diagnóstico si el aviso continúa.</p><p>Este aviso no modifica ni descarta las colas, capturas o acuses. No acredita una conexión en vivo.</p></section></main></body></html>`;
}
export async function publishGatewayOverview(config,{signal,now=()=>new Date(),readOverview=readGatewayOverview,readDesired=desiredState,writeHtml=writeGatewayOverviewHtml}={}){
 if(signal?.aborted)return {state:'cancelled'};
 let html,available=true;
 try{const desired=await readDesired(config.stateDir);const snapshot=await readOverview(config,{now,desiredState:desired});html=renderGatewayOverview(snapshot);}
 catch{available=false;html=unavailableOverview(now);}
 if(signal?.aborted)return {state:'cancelled'};
 await writeHtml(config.stateDir,html);
 return {state:available?'published':'unavailable'};
}
export async function runGatewayOverviewPublisher(config,{signal,wait=sleep,onResult=()=>{},...options}={}){
 while(!signal?.aborted){
  let result;try{result=await publishGatewayOverview(config,{...options,signal});}
  catch{result={state:'write_failed',code:'GATEWAY_OVERVIEW_WRITE_FAILED'};}
  onResult(result);if(signal?.aborted)break;
  try{await wait(OVERVIEW_INTERVAL_MS,undefined,{signal});}catch(error){if(signal?.aborted)break;throw error;}
 }
}
export function nextWorkerState(previous,{exitCode,uptimeMs,nowMs,stopping=false}){
 if(!Number.isFinite(nowMs)||!Number.isFinite(uptimeMs)||uptimeMs<0)throw fault('GATEWAY_STATE_INVALID');
 const failures=uptimeMs>=300000?0:Math.min(8,(previous?.failures||0)+1);
 if(stopping)return{state:'stopped',failures:previous?.failures||0,nextAttemptAt:null,exitCode};
 // Configuration or evidence rejection (exit 2) is not repaired by restarting a worker.
 if(exitCode===2||failures>=5)return{state:'review_required',failures,nextAttemptAt:null,exitCode};
 return{state:'retry_wait',failures,nextAttemptAt:new Date(nowMs+Math.min(900000,60000*2**Math.min(failures,4))).toISOString(),exitCode};
}
const SELF=fileURLToPath(import.meta.url);
const shutdownMessage=m=>m?.command==='stop'||m?.type==='shutdown';
export async function desiredState(stateDir){
 let value;try{value=await safeJson(path.join(stateDir,'desired.json'),1024);}catch(error){if(error.code==='ENOENT')return 'stopped';throw error;}
 if(!value||Object.keys(value).sort().join()!=='requestedAt,schema,state'||value.schema!=='municipal-clock-gateway-control.v1'
  ||!['running','stopped'].includes(value.state)||typeof value.requestedAt!=='string'||!Number.isFinite(Date.parse(value.requestedAt))
  ||new Date(value.requestedAt).toISOString()!==value.requestedAt)throw fault('GATEWAY_CONTROL_INVALID');
 return value.state;
}
export async function setDesiredState(stateDir,state){
 if(!['running','stopped'].includes(state))throw fault('GATEWAY_CONTROL_INVALID');
 await safeDirectory(stateDir);await atomicJson(path.join(stateDir,'desired.json'),{schema:'municipal-clock-gateway-control.v1',state,requestedAt:new Date().toISOString()});
}
export async function monitorDesiredState(stateDir,controller,{wait=sleep,intervalMs=1000}={}){
 while(!controller.signal.aborted){
  try{await wait(intervalMs,undefined,{signal:controller.signal});}catch(error){if(controller.signal.aborted)return;throw error;}
  if(controller.signal.aborted)return;
  try{if(await desiredState(stateDir)!=='running'){controller.abort();return;}}
  catch(error){controller.abort();throw error;}
 }
}
// Match the existing PM10 supervisor: request stop through IPC, never terminate
// a healthy worker process while it still owns a capture/delivery transaction.
export function workerArgs(worker){if(!Object.hasOwn(WORKERS,worker.kind))throw fault('GATEWAY_WORKER_INVALID');return [SELF,'worker',worker.kind,'--config',absoluteLocal(worker.configFile)];}
export async function captureWorker(run,config,{processLike=process}={}){
 let requested=false,delivered=false;
 const deliver=()=>{if(requested&&!delivered&&processLike.listenerCount('SIGTERM')>0){delivered=true;processLike.emit('SIGTERM');}};
 const stop=()=>{requested=true;deliver();};
 const message=m=>{if(shutdownMessage(m))stop();};
 // A stop may arrive before the reader finishes asynchronous initialization.
 const listener=name=>{if(name==='SIGTERM'&&requested)queueMicrotask(deliver);};
 processLike.on('message',message);processLike.on('disconnect',stop);processLike.on('newListener',listener);
 try{if(processLike.connected===false)return;processLike.send?.({type:'worker-ready'},()=>{});await run(['run','--config',config]);}
 finally{processLike.off('message',message);processLike.off('disconnect',stop);processLike.off('newListener',listener);}
}
export async function deliveryWorker(load,run,config,{processLike=process}={}){
 const controller=new AbortController(),stop=()=>controller.abort(),message=m=>{if(shutdownMessage(m))stop();};
 processLike.on('message',message);processLike.on('disconnect',stop);processLike.once('SIGTERM',stop);processLike.once('SIGINT',stop);
 try{if(processLike.connected===false)return;processLike.send?.({type:'worker-ready'},()=>{});await run(await load(config),{signal:controller.signal});}
 finally{processLike.off('message',message);processLike.off('disconnect',stop);processLike.off('SIGTERM',stop);processLike.off('SIGINT',stop);}
}
async function runWorker(kind,config){
 if(!Object.hasOwn(WORKERS,kind)||typeof process.send!=='function')throw fault('GATEWAY_WORKER_INVALID');
 try{
  if(kind==='fleet-capture'||kind==='legacy-capture'){await captureWorker(async args=>{const {main}=await import(pathToFileURL(path.resolve(ROOT,WORKERS[kind])).href);return main(args);},config);}
  else if(kind==='legacy-delivery'){const {loadSenderConfig}=await import('../pm10/delivery.mjs'),{runSender}=await import('../pm10/sender.mjs');await deliveryWorker(loadSenderConfig,runSender,config);}
  else if(kind==='fleet-source-delivery'){const {loadSourceSenderConfig}=await import('./source-delivery.mjs'),{runSourceSender}=await import('./source-sender.mjs');await deliveryWorker(loadSourceSenderConfig,runSourceSender,config);}
  else{const {loadFleetSenderConfig}=await import('./delivery.mjs'),{runFleetSender}=await import('./sender.mjs');await deliveryWorker(loadFleetSenderConfig,runFleetSender,config);}
 }finally{if(process.connected)process.disconnect();}
}
export async function supervise(config,{signal,spawnImpl=spawn,now=()=>Date.now(),wait=sleep,onSnapshot=async()=>{}}={}){
 const children=new Map(),states=new Map(),controller=new AbortController(),stopSent=new WeakSet(),ready=new WeakSet();let stopping=false;
 const requestStop=child=>{if(!ready.has(child)||stopSent.has(child))return;stopSent.add(child);try{if(child.connected)child.send({command:'stop'},error=>{if(error&&child.connected)child.disconnect();});}catch{try{if(child.connected)child.disconnect();}catch{}}};
 const stop=()=>{stopping=true;controller.abort();for(const child of children.values())requestStop(child);};signal?.addEventListener('abort',stop,{once:true});
 const publish=()=>onSnapshot({schema:'municipal-clock-gateway-status.v1',updatedAt:new Date(now()).toISOString(),workers:[...states].map(([kind,state])=>({kind,...state})),allClockReceptionVerified:false,operationWhileLoggedOutVerified:false});
 async function run(worker){let previous={failures:0};while(!stopping){const started=now();states.set(worker.kind,{state:'running',failures:previous.failures,startedAt:new Date(started).toISOString()});await publish();if(stopping)break;
  const exit=await new Promise(resolve=>{let child;try{child=spawnImpl(process.execPath,workerArgs(worker),{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,shell:false});children.set(worker.kind,child);}catch{resolve(1);return;}
   let settled=false;const done=code=>{if(settled)return;settled=true;children.delete(worker.kind);resolve(code);};
   // An error after spawn (for example failed IPC) is not proof that the process
   // exited. Keep ownership until exit; disconnect requests worker cleanup.
   child.on('message',message=>{if(message?.type==='worker-ready'){ready.add(child);if(stopping)requestStop(child);}});
   child.on('error',()=>{if(!child.pid)done(1);else{try{if(child.connected)child.disconnect();}catch{}}});child.once('exit',code=>done(code));if(stopping)requestStop(child);});
  previous=nextWorkerState(previous,{exitCode:exit,uptimeMs:now()-started,nowMs:now(),stopping});states.set(worker.kind,previous);await publish();if(stopping||previous.state==='review_required')break;
  try{await wait(Math.max(1000,Date.parse(previous.nextAttemptAt)-now()),undefined,{signal:controller.signal});}catch{break;}
 }}
 let results;
 try{
  if(signal?.aborted)stop();
  results=await Promise.allSettled(config.workers.filter(w=>w.enabled).map(w=>run(w).catch(error=>{stop();throw error;})));
 }finally{stop();signal?.removeEventListener('abort',stop);}
 // allSettled waits for every sibling to finish even if status persistence fails.
 // main releases the coordinator lock only after this point.
 const failure=results?.find(result=>result.status==='rejected');
 if(failure)throw failure.reason;
 await publish();return [...states].map(([kind,state])=>({kind,...state}));
}
export async function main(argv=process.argv.slice(2)){
 if(argv.length===4&&argv[0]==='worker'&&argv[2]==='--config')return runWorker(argv[1],absoluteLocal(argv[3]));
 if(argv.length!==3||!['check','run','status','snapshot','overview','start','stop'].includes(argv[0])||argv[1]!=='--config')throw fault('GATEWAY_USAGE');
 const config=await loadGateway(argv[2]);
 if(['snapshot','overview'].includes(argv[0])){
  let desired='unknown';try{desired=await desiredState(config.stateDir);}catch{}
  const snapshot=await readGatewayOverview(config,{desiredState:desired});
  if(argv[0]==='overview')console.log(renderGatewayOverview(snapshot));else console.log(JSON.stringify(snapshot));
  return snapshot;
 }
 // Stopping remains available even if a worker config later becomes invalid.
 if(argv[0]==='stop'){await setDesiredState(config.stateDir,'stopped');console.log('GATEWAY_STOP_REQUESTED');return;}
 const preflight=await inspectGateway(config);
 if(argv[0]==='check'){console.log(JSON.stringify(preflight));return preflight;}
 const statusFile=path.join(config.stateDir,'gateway-status.json');
 if(argv[0]==='status'){const value=await safeJson(statusFile,16384);console.log(JSON.stringify(value));return value;}
 if(!config.workers.some(w=>w.enabled)||preflight.captureIdentities<1)throw fault('GATEWAY_NO_CAPTURE_CONFIGURED');
 if(argv[0]==='start'){await setDesiredState(config.stateDir,'running');console.log('GATEWAY_START_ENABLED');return;}
 if(await desiredState(config.stateDir)!=='running'){console.log('GATEWAY_DURABLY_STOPPED');return;}
 await safeDirectory(config.stateDir);const release=await acquireLock(config.stateDir),controller=new AbortController();
 const stop=()=>controller.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);let write=Promise.resolve();
 const snapshot=value=>{write=write.then(()=>atomicJson(statusFile,value));return write;};
 let monitoring,monitorError,publishing;
 try{
  // A stop between the initial read and ownership acquisition must still win.
  if(await desiredState(config.stateDir)!=='running')return;
  monitoring=monitorDesiredState(config.stateDir,controller).catch(error=>{monitorError=error;stop();});
  publishing=runGatewayOverviewPublisher(config,{signal:controller.signal,onResult:result=>{if(result.state==='write_failed')console.error(JSON.stringify({error:'GATEWAY_OVERVIEW_WRITE_FAILED'}));}})
   .catch(()=>console.error(JSON.stringify({error:'GATEWAY_OVERVIEW_PUBLISHER_STOPPED'})));
  await supervise(config,{signal:controller.signal,onSnapshot:snapshot});await write;
  if(monitorError)throw monitorError;
 }finally{stop();await Promise.allSettled([monitoring,publishing]);process.off('SIGTERM',stop);process.off('SIGINT',stop);await release();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(JSON.stringify({error:safeCode(e),allClocksVerified:false}));process.exitCode=2;});
