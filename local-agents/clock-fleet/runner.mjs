// SPDX-License-Identifier: GPL-2.0-only
// One program, explicitly approved identities, separate durable queues. NO cloud sender.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {lstat,readFile,open} from 'node:fs/promises';
import {setTimeout as wait} from 'node:timers/promises';
import {collectConfigured,MAX_BYTES} from '../pm10/reader/lector-fichadas.mjs';
import {fault,safeCode,readCredential} from '../pm10/config.mjs';
import {CaptureStore,acquireLock,atomicJson,safeDirectory} from '../pm10/store.mjs';
import {ensureCapture,nextDelaySeconds} from '../pm10/service.mjs';
import {readMunicipalRoute,requireMunicipalPrefix,MUNICIPAL_PREFIX,ROUTE_ERRORS} from '../pm10/route-guard.mjs';
const ID=/^[a-z][a-z0-9-]{1,63}$/,SERIAL=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TRANSIENT=new Set(['CONNECT_TIMEOUT','RESPONSE_TIMEOUT','ECONNRESET','ECONNABORTED','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT','CONNECTION_ENDED','CONNECTION_CLOSED','DEADLINE_EXCEEDED','TOTAL_TIMEOUT']);
function exact(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join()!==keys.sort().join())throw fault('FLEET_CONFIG_INVALID');}
function absolute(v){if(typeof v!=='string'||!path.isAbsolute(v)||/[\x00-\x1f]/.test(v)||path.resolve(v)===path.parse(v).root)throw fault('FLEET_PATH_INVALID');return path.resolve(v);}
export function validateFleetConfig(v){
 exact(v,['schema','approved','stateDir','maxQueueMiB','minFreeMiB','clocks']);
 if(v.schema!=='municontrol-clock-fleet.v1'||v.approved!==true||!Array.isArray(v.clocks)||v.clocks.length<1||v.clocks.length>16)throw fault('FLEET_CONFIG_INVALID');
 for(const k of ['maxQueueMiB','minFreeMiB'])if(!Number.isSafeInteger(v[k])||v[k]<64||v[k]>1024)throw fault('FLEET_CONFIG_INVALID');
 const ids=new Set(),serials=new Set(),endpoints=new Set();
 const clocks=v.clocks.map(c=>{
  exact(c,['clockId','label','host','port','serial','credentialFile','pollSeconds','enabled']);
  if(typeof c.clockId!=='string'||typeof c.serial!=='string'||!ID.test(c.clockId)||!SERIAL.test(c.serial)||typeof c.label!=='string'||!c.label.trim()||c.label.length>100||/[\x00-\x1f]/.test(c.label)||typeof c.enabled!=='boolean'||c.port!==4370||!Number.isSafeInteger(c.pollSeconds)||c.pollSeconds<60||c.pollSeconds>3600)throw fault('FLEET_CONFIG_INVALID');
  requireMunicipalPrefix(MUNICIPAL_PREFIX,c.host);
  if(ids.has(c.clockId)||serials.has(c.serial.toLowerCase())||endpoints.has(c.host+':'+c.port))throw fault('FLEET_DUPLICATE_IDENTITY');
  ids.add(c.clockId);serials.add(c.serial.toLowerCase());endpoints.add(c.host+':'+c.port);
  return Object.freeze({...c,credentialFile:absolute(c.credentialFile)});
 });
 return Object.freeze({...v,stateDir:absolute(v.stateDir),clocks:Object.freeze(clocks)});
}
export async function loadFleetConfig(file){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>65536)throw fault('FLEET_CONFIG_INVALID');return validateFleetConfig(JSON.parse(await readFile(file,'utf8')));}
const fresh=c=>({schema:'clock-fleet-status.v1',clockId:c.clockId,serial:c.serial,status:'waiting',blocked:false,failureCount:0,lastAttemptAt:null,lastCaptureAt:null,nextPollAt:null,lastError:null,uniqueLocalRecords:0,pendingLocalBatches:0,cloudReception:'not_configured'});
async function boundState(root,c){
 await safeDirectory(root);const file=path.join(root,'identity.json');
 const identity={schema:'clock-fleet-identity.v1',clockId:c.clockId,serial:c.serial};
 try{const handle=await open(file,'wx',0o600);try{await handle.writeFile(JSON.stringify(identity));await handle.sync();}finally{await handle.close();}}
 catch(e){if(e.code!=='EEXIST')throw e;const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>1024)throw fault('FLEET_IDENTITY_MISMATCH');let previous;try{previous=JSON.parse(await readFile(file,'utf8'));}catch{throw fault('FLEET_IDENTITY_MISMATCH');}if(JSON.stringify(previous)!==JSON.stringify(identity))throw fault('FLEET_IDENTITY_MISMATCH');}
 try{const statusFile=path.join(root,'status.json'),st=await lstat(statusFile);if(!st.isFile()||st.isSymbolicLink()||st.size>32768)throw fault('FLEET_STATE_INVALID');let s;try{s=JSON.parse(await readFile(statusFile,'utf8'));}catch{throw fault('FLEET_STATE_INVALID');}if(s.schema!=='clock-fleet-status.v1'||s.clockId!==c.clockId||s.serial!==c.serial||s.cloudReception!=='not_configured'||typeof s.blocked!=='boolean'||!Number.isSafeInteger(s.failureCount)||s.failureCount<0||s.failureCount>1000||(s.nextPollAt!==null&&!Number.isFinite(Date.parse(s.nextPollAt))))throw fault('FLEET_STATE_INVALID');return s;}
 catch(e){if(e.code==='ENOENT')return fresh(c);throw e;}
}
export async function captureClock(fleet,c,{collect=collectConfigured,credential=readCredential,route=readMunicipalRoute,now=()=>new Date(),signal}={}){
 const root=path.join(fleet.stateDir,c.clockId);let release,key,state=fresh(c),store,persist=false;
 try{
  release=await acquireLock(root);state=await boundState(root,c);
  if(!c.enabled){state={...state,status:'disabled'};persist=true;return state;}
  if(state.blocked||signal?.aborted)return state;
  if(state.nextPollAt&&Date.parse(state.nextPollAt)>now().getTime())return state;
  store=await new CaptureStore(root,{identity:{clockId:c.clockId,serial:c.serial},maxQueueBytes:fleet.maxQueueMiB*1048576,minFreeBytes:fleet.minFreeMiB*1048576}).init();
  persist=true;state={...state,lastAttemptAt:now().toISOString()};await store.capacity(MAX_BYTES+1048576);
  const network=await route({target:c.host});if(network?.localLookup!==true)throw fault('ROUTE_OUTPUT_INVALID');
  key=await credential(c.credentialFile);
  const result=await collect({approved:true,host:c.host,port:c.port,serial:c.serial},{commKey:key,approved:true,signal,totalMs:900000});
  await atomicJson(path.join(root,'attempt-report.json'),result.report);
  const report=ensureCapture(result,c.serial),saved=await store.save(result.raw,{capturedAt:report.finishedAt??now().toISOString(),deviceTimeLocal:report.metadata.deviceTimeBefore});
  state={...state,...store.summary(),status:'captured_locally',failureCount:0,blocked:false,lastError:null,lastCaptureAt:report.finishedAt??now().toISOString(),snapshotRecordCount:saved.snapshotRecordCount,newUniqueRecordsLastCycle:saved.newUniqueRecords,lastCaptureSha256:saved.snapshotSha256,nextPollAt:new Date(now().getTime()+c.pollSeconds*1000).toISOString()};
 }catch(e){
  const code=safeCode(e);if(!release)throw e;
  // Corruption/identity failures never overwrite the previous state or rebind a queue.
  if(['FLEET_IDENTITY_MISMATCH','FLEET_STATE_INVALID','QUEUE_CORRUPT'].includes(code)){persist=false;throw e;}
  persist=true;
  const transient=TRANSIENT.has(code),network=ROUTE_ERRORS.has(code),cancelled=signal?.aborted;
  const failures=network||cancelled?state.failureCount:Math.min(1000,state.failureCount+1);
  const blocked=!network&&!cancelled&&(!transient||failures>=6);
  state={...state,...store?.summary(),status:cancelled?'stopped':network?'network_wait':blocked?'blocked':'retry_wait',blocked,failureCount:failures,lastError:code,nextPollAt:blocked?null:new Date(now().getTime()+nextDelaySeconds(failures,c.pollSeconds)*1000).toISOString()};
 }finally{key?.fill(0);if(release){try{if(persist&&state.schema==='clock-fleet-status.v1')await atomicJson(path.join(root,'status.json'),state);}finally{await release();}}}
 return state;
}
function brief(s){return {clockId:s.clockId,status:s.status,blocked:s.blocked,lastAttemptAt:s.lastAttemptAt,lastCaptureAt:s.lastCaptureAt,lastError:s.lastError,uniqueLocalRecords:s.uniqueLocalRecords,nextPollAt:s.nextPollAt,cloudReception:'not_configured'};}
export async function main(argv=process.argv.slice(2)){
 if(!['once','run'].includes(argv[0])||argv[1]!=='--config'||argv.length!==3)throw fault('USAGE_FLEET_RUN_ONCE_CONFIG');
 const config=await loadFleetConfig(path.resolve(argv[2]));await safeDirectory(config.stateDir);
 const release=await acquireLock(config.stateDir),controller=new AbortController(),stop=()=>controller.abort();
 process.once('SIGINT',stop);process.once('SIGTERM',stop);const results=new Map();let writing=Promise.resolve();
 const summary=()=>{writing=writing.then(()=>atomicJson(path.join(config.stateDir,'fleet-summary.json'),{schema:'clock-fleet-summary.v1',updatedAt:new Date().toISOString(),clocks:[...results.values()],cloudReception:'not_configured'}));return writing;};
 async function loop(c){do{try{const s=await captureClock(config,c,{signal:controller.signal});results.set(c.clockId,brief(s));console.log(JSON.stringify(brief(s)));await summary();}
  catch(e){results.set(c.clockId,{clockId:c.clockId,status:'review_required',lastError:safeCode(e),cloudReception:'not_configured'});console.error(JSON.stringify(results.get(c.clockId)));await summary();return;}
  if(argv[0]==='once'||!c.enabled)break;
  try{await wait(Math.max(1000,results.get(c.clockId)?.nextPollAt?Date.parse(results.get(c.clockId).nextPollAt)-Date.now():60000),undefined,{signal:controller.signal});}catch{break;}
 }while(!controller.signal.aborted);}
 try{await Promise.all(config.clocks.map(loop));}
 finally{try{await summary();}finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);await release();}}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){try{await main();}catch(e){console.error(JSON.stringify({error:safeCode(e)}));process.exitCode=2;}}
