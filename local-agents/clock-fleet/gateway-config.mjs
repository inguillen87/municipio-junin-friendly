// SPDX-License-Identifier: GPL-2.0-only
// One host coordinator for existing verified workers; no arbitrary executables or remote commands.
import path from 'node:path';import os from 'node:os';import {lstat,readFile} from 'node:fs/promises';
import {fault} from '../pm10/config.mjs';import {loadConfig} from '../pm10/config.mjs';
import {loadSenderConfig} from '../pm10/delivery.mjs';import {loadFleetConfig} from './runner.mjs';
export const WORKERS=Object.freeze({'fleet-capture':'runner.mjs','legacy-capture':'../pm10/service.mjs','legacy-delivery':'../pm10/sender.mjs'});
const plain=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===keys.sort().join();
export function absoluteLocal(value){if(typeof value!=='string'||!path.isAbsolute(value)||/[\x00-\x1f"]/.test(value)||value.startsWith('\\\\')||path.resolve(value)===path.parse(value).root)throw fault('GATEWAY_PATH_INVALID');return path.resolve(value);}
export function gatewayConfig(value,hostname=os.hostname()){
 if(!plain(value,['schema','approved','approvedHost','stateDir','workers'])||value.schema!=='municipal-clock-gateway.v1'||value.approved!==true||typeof value.approvedHost!=='string'||!value.approvedHost.trim()||value.approvedHost.toLowerCase()!==hostname.toLowerCase()||!Array.isArray(value.workers)||value.workers.length<1||value.workers.length>3)throw fault('GATEWAY_HOST_CONFIG_INVALID');
 const seen=new Set();const workers=value.workers.map(w=>{if(!plain(w,['kind','configFile','enabled'])||!Object.hasOwn(WORKERS,w.kind)||seen.has(w.kind)||typeof w.enabled!=='boolean')throw fault('GATEWAY_WORKER_INVALID');seen.add(w.kind);return Object.freeze({...w,configFile:absoluteLocal(w.configFile)});});
 return Object.freeze({...value,stateDir:absoluteLocal(value.stateDir),workers:Object.freeze(workers)});
}
export async function safeJson(file,max=8192){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size<2||s.size>max||(process.platform!=='win32'&&(s.mode&0o077)))throw fault('GATEWAY_FILE_UNSAFE');return JSON.parse(await readFile(file,'utf8'));}
export async function loadGateway(file){return gatewayConfig(await safeJson(absoluteLocal(file)));}
export function validateOwnership(specs){
 const captures=specs.filter(x=>x.capture),seenSerial=new Set(),seenQueue=new Set();
 for(const s of captures){if(seenSerial.has(s.serial.toLowerCase())||seenQueue.has(s.stateDir.toLowerCase()))throw fault('GATEWAY_DUPLICATE_CAPTURE');seenSerial.add(s.serial.toLowerCase());seenQueue.add(s.stateDir.toLowerCase());}
 for(const s of specs.filter(x=>!x.capture))if(!captures.some(c=>c.serial===s.serial&&c.stateDir===s.stateDir))throw fault('GATEWAY_DELIVERY_WITHOUT_CAPTURE');
 return {captureIdentities:captures.length,deliveryIdentities:specs.filter(x=>!x.capture).length,allSendersConfigured:captures.length>0&&captures.every(c=>specs.some(d=>!d.capture&&d.stateDir===c.stateDir&&d.serial===c.serial))};
}
export async function inspectGateway(config){
 const identities=[];for(const w of config.workers){if(!w.enabled)continue;if(w.kind==='fleet-capture'){const f=await loadFleetConfig(w.configFile);for(const c of f.clocks.filter(c=>c.enabled))identities.push({capture:true,serial:c.serial,stateDir:path.join(f.stateDir,c.clockId)});}
 else if(w.kind==='legacy-capture'){const c=await loadConfig(w.configFile);identities.push({capture:true,serial:c.serial,stateDir:c.stateDir});}
 else{const d=await loadSenderConfig(w.configFile);const {SERIAL}=await import('../pm10/reader/lector-fichadas.mjs');identities.push({capture:false,serial:SERIAL,stateDir:d.stateDir});}}
 for(const item of identities){const a=path.resolve(config.stateDir),b=path.resolve(item.stateDir);if(a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep))throw fault('GATEWAY_STATE_OVERLAP');}
 return {schema:'municipal-clock-gateway-preflight.v1',...validateOwnership(identities),automaticHostRole:'requires_external_municipal_host',operationWhileLoggedOutVerified:false,networkTested:false,realWrites:0};
}
