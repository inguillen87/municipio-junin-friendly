#!/usr/bin/env node
// SPDX-License-Identifier: GPL-2.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {Store,Collector,config,seal,readKey,fail} from './core.mjs';
import {promptCommKey} from './vendor/zk-core-v3.mjs';
export const LOCK_PORT=19470;
export async function lock(){
 const server=net.createServer(socket=>socket.destroy());
 await new Promise((resolve,reject)=>{server.once('error',()=>reject(Object.assign(new Error('SINGLE_INSTANCE_REQUIRED'),{code:'SINGLE_INSTANCE_REQUIRED'})));server.listen({host:'127.0.0.1',port:LOCK_PORT,exclusive:true},resolve)});
 return ()=>new Promise(resolve=>server.close(resolve));
}
function parse(args){
 const [command,...rest]=args;const allowed=new Set(['init','run','once','status','resume']);
 if(!allowed.has(command)||rest.length<2||rest[0]!=='--root'||!path.isAbsolute(rest[1])||rest.length>3||rest.length===3&&rest[2]!=='--ack-reviewed'||command==='resume'&&rest[2]!=='--ack-reviewed'||command!=='resume'&&rest.length!==2)fail('USAGE');
 return {command,root:path.resolve(rest[1])};
}
export async function runLoop(collector,{signal,onCycle=()=>{},sleep=delay}={}){
 while(!signal?.aborted){const outcome=await collector.tick(signal);onCycle(outcome);if(['DISABLED','BLOCKED','STOPPED'].includes(outcome.outcome))return outcome;try{await sleep(outcome.waitSeconds*1000,undefined,{signal})}catch(e){if(signal?.aborted)return {outcome:'STOPPED'};throw e}}
 return {outcome:'STOPPED'};
}
async function initialize(root){
 // Root is provisioned and ACL-protected by the installer BEFORE asking for a credential.
 const st=await fs.lstat(root);if(!st.isDirectory()||st.isSymbolicLink())fail('PRIVATE_ROOT_REQUIRED');
 for(const f of ['storage.key','commkey.enc']){try{await fs.access(path.join(root,'secrets',f));fail('SECRETS_ALREADY_EXIST')}catch(e){if(e.code!=='ENOENT')throw e}}
 await fs.mkdir(path.join(root,'secrets'),{mode:0o700});
 await fs.mkdir(path.join(root,'data','captures'),{recursive:true,mode:0o700});
 const key=randomBytes(32);let secret;
 try{secret=await promptCommKey();await fs.writeFile(path.join(root,'secrets','storage.key'),key,{flag:'wx',mode:0o600});await fs.writeFile(path.join(root,'secrets','commkey.enc'),seal(secret,key,'credential'),{flag:'wx',mode:0o600});}
 finally{key.fill(0);secret?.fill(0)}
 console.log('Credencial local guardada cifrada. No hubo conexión al reloj ni envío a la nube.');
}
export async function main(args=process.argv.slice(2)){
 if(Number(process.versions.node.split('.')[0])<22)fail('NODE_22_REQUIRED');
 const {command,root}=parse(args);
 if(command==='init')return initialize(root);
 const settings=config(JSON.parse(await fs.readFile(path.join(root,'config.json'),'utf8'))),key=await readKey(root);let release;
 try{
  const store=new Store(root,key,settings);await store.open();
  if(command==='status'){console.log(JSON.stringify(await store.status(),null,2));return}
  release=await lock();
  if(command==='resume'){const s=await store.state();await store.save({...s,blocked:null,failures:0,lastOutcome:'OPERATOR_REVIEWED'});console.log('Bloqueo local liberado después de la revisión. No se inició una lectura.');return}
  const ac=new AbortController(),stop=()=>ac.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{const collector=new Collector(store);const log=value=>console.log(JSON.stringify({at:new Date().toISOString(),site:'pm-10',...value,cloudAccepted:false}));
   if(command==='once')log(await collector.tick(ac.signal));else await runLoop(collector,{signal:ac.signal,onCycle:log});
  }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop)}
 }finally{await release?.();key.fill(0)}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){main().catch(e=>{
 // Do not print exception details, credential strings, names, documents, IPs or payloads.
 const safe=new Set(['USAGE','CONFIG_INVALID','SECRETS_ALREADY_EXIST','PRIVATE_ROOT_REQUIRED','INTERACTIVE_TERMINAL_REQUIRED','COMMKEY_FORMAT_INVALID','KEY_MISMATCH','PRIVATE_PERMISSIONS_REQUIRED','PRIVATE_FILE_INVALID','STATE_INVALID','STORAGE_SYMLINK_REJECTED','SINGLE_INSTANCE_REQUIRED','NODE_22_REQUIRED','ENOENT']);
 console.error(JSON.stringify({outcome:'START_FAILED',code:safe.has(e.code)?e.code:'LOCAL_REVIEW_REQUIRED',cloudAccepted:false}));process.exitCode=1;
})}
