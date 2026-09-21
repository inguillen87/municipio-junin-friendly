// SPDX-License-Identifier: GPL-2.0-only
// One host coordinator for existing verified workers; no arbitrary executables or remote commands.
import path from 'node:path';import os from 'node:os';import {lstat,readFile} from 'node:fs/promises';
import {fault} from '../pm10/config.mjs';import {loadConfig} from '../pm10/config.mjs';
import {loadSenderConfig} from '../pm10/delivery.mjs';import {loadFleetConfig} from './runner.mjs';
export const WORKERS=Object.freeze({'fleet-capture':'runner.mjs','legacy-capture':'../pm10/service.mjs','legacy-delivery':'../pm10/sender.mjs','fleet-delivery':'sender.mjs'});
const plain=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===keys.sort().join();
export function absoluteLocal(value){if(typeof value!=='string'||!path.isAbsolute(value)||/[\x00-\x1f"]/.test(value)||value.startsWith('\\\\')||path.resolve(value)===path.parse(value).root)throw fault('GATEWAY_PATH_INVALID');return path.resolve(value);}
export function gatewayConfig(value,hostname=os.hostname()){
 if(!plain(value,['schema','approved','approvedHost','stateDir','workers'])||value.schema!=='municipal-clock-gateway.v1'||value.approved!==true||typeof value.approvedHost!=='string'||!value.approvedHost.trim()||value.approvedHost.toLowerCase()!==hostname.toLowerCase()||!Array.isArray(value.workers)||value.workers.length<1||value.workers.length>4)throw fault('GATEWAY_HOST_CONFIG_INVALID');
 const seen=new Set();const workers=value.workers.map(w=>{if(!plain(w,['kind','configFile','enabled'])||!Object.hasOwn(WORKERS,w.kind)||seen.has(w.kind)||typeof w.enabled!=='boolean')throw fault('GATEWAY_WORKER_INVALID');seen.add(w.kind);return Object.freeze({...w,configFile:absoluteLocal(w.configFile)});});
 return Object.freeze({...value,stateDir:absoluteLocal(value.stateDir),workers:Object.freeze(workers)});
}
export async function safeJson(file,max=8192){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size<2||s.size>max||(process.platform!=='win32'&&(s.mode&0o077)))throw fault('GATEWAY_FILE_UNSAFE');return JSON.parse(await readFile(file,'utf8'));}
export async function loadGateway(file){return gatewayConfig(await safeJson(absoluteLocal(file)));}
const queueKey=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
const overlaps=(a,b)=>a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep);
export function validateOwnership(specs){
 const captures=specs.filter(x=>x.capture),deliveries=specs.filter(x=>!x.capture),seenSerial=new Set(),captureQueues=[];
 for(const s of captures){const queue=queueKey(s.stateDir);if(seenSerial.has(s.serial.toLowerCase())||captureQueues.some(other=>overlaps(other,queue)))throw fault('GATEWAY_DUPLICATE_CAPTURE');seenSerial.add(s.serial.toLowerCase());captureQueues.push(queue);}
 const deliverySerial=new Set(),deliveryQueue=new Set(),connectors=new Set();
 const matches=(c,d)=>c.serial===d.serial&&queueKey(c.stateDir)===queueKey(d.stateDir)&&(c.clockId??null)===(d.clockId??null);
 for(const s of deliveries){
  if(!captures.some(c=>matches(c,s)))throw fault('GATEWAY_DELIVERY_WITHOUT_CAPTURE');
  if(typeof s.connectorKey!=='string'||!/^[a-z0-9][a-z0-9._-]{7,127}$/.test(s.connectorKey))throw fault('GATEWAY_DELIVERY_CONNECTOR_INVALID');
  const queue=queueKey(s.stateDir);if(deliverySerial.has(s.serial.toLowerCase())||deliveryQueue.has(queue)||connectors.has(s.connectorKey))throw fault('GATEWAY_DUPLICATE_DELIVERY');
  deliverySerial.add(s.serial.toLowerCase());deliveryQueue.add(queue);connectors.add(s.connectorKey);
 }
 return {captureIdentities:captures.length,deliveryIdentities:deliveries.length,allSendersConfigured:captures.length>0&&captures.every(c=>deliveries.some(d=>matches(c,d)))};
}
export async function inspectGateway(config){
 const identities=[],workerRoots=[];
 for(const w of config.workers){if(!w.enabled)continue;
  if(w.kind==='fleet-capture'){const f=await loadFleetConfig(w.configFile);workerRoots.push(f.stateDir);for(const c of f.clocks.filter(c=>c.enabled))identities.push({capture:true,clockId:c.clockId,serial:c.serial,stateDir:path.join(f.stateDir,c.clockId)});}
  else if(w.kind==='legacy-capture'){const c=await loadConfig(w.configFile);workerRoots.push(c.stateDir);identities.push({capture:true,clockId:null,serial:c.serial,stateDir:c.stateDir});}
  else if(w.kind==='fleet-delivery'){const {loadFleetSenderConfig}=await import('./delivery.mjs');const d=await loadFleetSenderConfig(w.configFile);workerRoots.push(d.stateDir);for(const c of d.clocks.filter(c=>c.enabled))identities.push({capture:false,clockId:c.clockId,serial:c.serial,stateDir:path.join(d.stateDir,c.clockId),connectorKey:c.connectorKey});}
  else{const d=await loadSenderConfig(w.configFile);const {SERIAL}=await import('../pm10/reader/lector-fichadas.mjs');workerRoots.push(d.stateDir);identities.push({capture:false,clockId:null,serial:SERIAL,stateDir:d.stateDir,connectorKey:d.connectorKey});}
 }
 for(const root of workerRoots)if(overlaps(queueKey(config.stateDir),queueKey(root)))throw fault('GATEWAY_STATE_OVERLAP');
 return {schema:'municipal-clock-gateway-preflight.v1',...validateOwnership(identities),automaticHostRole:'requires_external_municipal_host',operationWhileLoggedOutVerified:false,networkTested:false,realWrites:0};
}
