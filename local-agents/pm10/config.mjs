// SPDX-License-Identifier: GPL-2.0-only
import path from 'node:path';
import {lstat, readFile} from 'node:fs/promises';
import {TARGET, PORT, SERIAL} from './reader/lector-fichadas.mjs';
import {validateCommKey} from './reader/zk-core-v3.mjs';
export const VERSION='0.1.1';
export const SCHEMA='pm10-capture-agent.v1';
export function fault(code){return Object.assign(new Error(code),{code});}
export function safeCode(e){return typeof e?.code==='string'&&/^[A-Z][A-Z0-9_]{0,70}$/.test(e.code)?e.code:'LOCAL_ERROR';}
export function validateConfig(input){
 const fields=['schema','mode','approved','host','port','serial','stateDir','credentialFile','pollSeconds','maxQueueMiB','minFreeMiB'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(input,k)))throw fault('CONFIG_INVALID');
 if(input.schema!==SCHEMA||input.mode!=='capture_only'||input.approved!==true)throw fault('LOCAL_CAPTURE_APPROVAL_REQUIRED');
 if(input.host!==TARGET||input.port!==PORT||input.serial!==SERIAL)throw fault('TARGET_NOT_ALLOWED');
 for(const k of ['stateDir','credentialFile'])if(typeof input[k]!=='string'||!path.isAbsolute(input[k])||/[\x00-\x1f]/.test(input[k]))throw fault('PATH_INVALID');
 if(path.resolve(input.stateDir)===path.parse(input.stateDir).root)throw fault('PATH_INVALID');
 for(const [k,min,max] of [['pollSeconds',60,3600],['maxQueueMiB',16,4096],['minFreeMiB',16,4096]])if(!Number.isSafeInteger(input[k])||input[k]<min||input[k]>max)throw fault('CONFIG_LIMIT_INVALID');
 return Object.freeze({...input,stateDir:path.resolve(input.stateDir),credentialFile:path.resolve(input.credentialFile)});
}
export async function readCredential(file){
 const s=await lstat(file);
 if(!s.isFile()||s.isSymbolicLink()||s.size<1||s.size>12)throw fault('CREDENTIAL_FILE_INVALID');
 if(process.platform!=='win32'&&(s.mode&0o077)!==0)throw fault('CREDENTIAL_PERMISSIONS_UNSAFE');
 const bytes=await readFile(file);let key;
 try{
  let end=bytes.length;
  if(bytes[end-1]===10)end--;
  if(bytes[end-1]===13)end--;
  key=Buffer.from(bytes.subarray(0,end));
  validateCommKey(key);
  return key;
 }catch{key?.fill(0);throw fault('CREDENTIAL_FILE_INVALID');}finally{bytes.fill(0);}
}
export async function loadConfig(file){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>8192)throw fault('CONFIG_INVALID');return validateConfig(JSON.parse(await readFile(file,'utf8')));}
