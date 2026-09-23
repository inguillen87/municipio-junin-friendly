// SPDX-License-Identifier: GPL-2.0-only
// Task Scheduler entry point. Manual stop survives subsequent timer invocations.
import path from 'node:path';import {pathToFileURL} from 'node:url';
import {lstat,readFile,open} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {main as fleetMain,loadFleetConfig} from './runner.mjs';
import {safeDirectory,atomicJson} from '../pm10/store.mjs';
import {replaceFile} from '../pm10/file-replacement.mjs';
import {safeCode,fault} from '../pm10/config.mjs';import {fleetOverview} from './overview.mjs';
import {loadDeliveryStatus} from '../pm10/delivery-status.mjs';import {stamp} from './delivery.mjs';
export async function boundedJson(file,max=65536){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw fault('FLEET_CONTROL_INVALID');try{return JSON.parse(await readFile(file,'utf8'));}catch{throw fault('FLEET_CONTROL_INVALID');}}
export function desiredState(value){if(value?.schema!=='clock-fleet-desired.v1'||!['running','stopped'].includes(value.state)||!Number.isFinite(Date.parse(value.updatedAt)))throw fault('FLEET_CONTROL_INVALID');return value.state;}
export function pm10CaptureOverview(v){
 const count=n=>Number.isSafeInteger(n)&&n>=0,nullableDate=d=>d===null||stamp(d);
 if(!v||v.schema!=='pm10-local-status.v1'||v.mode!=='capture_only'||v.cloudReception!=='not_connected'||v.cloudConfirmedRecords!==0
  ||!['waiting','captured_locally','network_wait','connection_wait','retry_wait','blocked','review_required','disabled','stopped'].includes(v.status)
  ||typeof v.blocked!=='boolean'||!count(v.failureCount)||v.failureCount>1000||!nullableDate(v.lastAttemptAt)||!nullableDate(v.lastCaptureAt)||!nullableDate(v.nextPollAt)
  ||(v.uniqueLocalRecords!==undefined&&!count(v.uniqueLocalRecords))||(v.lastCaptureAt!==null&&(!/^[a-f0-9]{64}$/.test(v.lastCaptureSha256)||!count(v.snapshotRecordCount)))
  ||(v.status==='captured_locally'&&v.lastCaptureAt===null)||(v.status==='blocked'&&!v.blocked))throw fault('FLEET_CONTROL_INVALID');
 const known=['AUTH_NOT_ACCEPTED','AUTHENTICATION_UNVERIFIED','SERIAL_MISMATCH','LAYOUT_NOT_CONFIRMED','TRANSFER_NOT_CONFIRMED'];
 return {state:v.status,blocked:v.blocked,lastError:v.lastError==null?null:known.includes(v.lastError)?v.lastError:'REVIEW_REQUIRED',
  checkedAt:null,lastAttemptAt:v.lastAttemptAt,lastCaptureAt:v.lastCaptureAt,nextPollAt:v.nextPollAt,records:v.uniqueLocalRecords??null,evidenceState:'verified'};
}
async function writeView(base,config,state,error){
 let summary={updatedAt:null,clocks:[]},pm10=null;try{summary=await boundedJson(path.join(config.stateDir,'fleet-summary.json'));}catch(e){if(e.code!=='ENOENT')error=error||safeCode(e);}
 const root=path.join(path.dirname(base),'PM10','state');let capture={evidenceState:'missing'};
 try{capture=pm10CaptureOverview(await boundedJson(path.join(root,'status.json'),32768));}catch(e){if(e.code!=='ENOENT')capture={evidenceState:'invalid'};}
 const delivery=await loadDeliveryStatus(root);
 if(capture.evidenceState!=='missing'||delivery.availability!=='missing')pm10={capture,delivery:{
  state:delivery.state,enabled:true,scope:'canonical',evidenceState:delivery.availability==='available'?'verified':delivery.availability,
  checkedAt:delivery.updatedAt??null,lastReceiptAt:delivery.lastReceiptAt??null,confirmedRecords:delivery.confirmedRecords??null,
  pendingParts:delivery.remainingParts??null,nextAttemptAt:delivery.nextAttemptAt??null}};
 const temp=path.join(base,'.estado-'+randomUUID()+'.html'),handle=await open(temp,'wx',0o600);
 try{await handle.writeFile(fleetOverview(config,summary,{pm10,desired:state,error}));await handle.sync();}finally{await handle.close();}
 await replaceFile(temp,path.join(base,'estado.html'));
}
export async function control(argv=process.argv.slice(2),{execute=fleetMain}={}){
 if(!['start','stop','tick','status'].includes(argv[0])||argv[1]!=='--base'||argv.length!==3||!path.isAbsolute(argv[2])||/[\x00-\x1f"]/.test(argv[2]))throw fault('FLEET_CONTROL_USAGE');
 const base=path.resolve(argv[2]);if(base===path.parse(base).root)throw fault('FLEET_PATH_INVALID');
 const cfgFile=path.join(base,'config','fleet.json'),config=await loadFleetConfig(cfgFile);
 if(config.stateDir!==path.join(base,'state'))throw fault('FLEET_PATH_INVALID');
 await safeDirectory(path.join(base,'control'));const desiredFile=path.join(base,'control','desired.json');
 let state='stopped';try{state=desiredState(await boundedJson(desiredFile,1024));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(argv[0]==='start'||argv[0]==='stop'){state=argv[0]==='start'?'running':'stopped';await atomicJson(desiredFile,{schema:'clock-fleet-desired.v1',state,updatedAt:new Date().toISOString()});}
 let error=null;
 if(argv[0]==='tick'&&state==='running')try{await execute(['once','--config',cfgFile]);}catch(e){error=safeCode(e);if(error==='ALREADY_RUNNING')return{ok:true,state:'cycle_already_running'};}
 try{state=desiredState(await boundedJson(desiredFile,1024));}catch(e){if(e.code!=='ENOENT')throw e;}
 await writeView(base,config,state,error);if(error)throw fault(error);
 return{ok:true,state,configuredClocks:config.clocks.length,cloudSenderConfigured:false};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){try{console.log(JSON.stringify(await control()));}catch(e){console.error(JSON.stringify({error:safeCode(e)}));process.exitCode=2;}}
