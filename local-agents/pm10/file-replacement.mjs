// SPDX-License-Identifier: GPL-2.0-only
// Bounded retries for transient Windows sharing locks. Never delete the destination.
import {rename,lstat} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
const TRANSIENT=new Set(['EPERM','EACCES','EBUSY']);
const WAITS=Object.freeze([25,50,100,200,400,800]);
export async function replaceFile(source,destination,{platform=process.platform,renameFile=rename,inspect=lstat,sleep=delay}={}){
 for(let attempt=0;;attempt++){
  try{await renameFile(source,destination);return;}
  catch(error){
   if(platform!=='win32'||!TRANSIENT.has(error?.code)||attempt>=WAITS.length)throw error;
   // This helper is for a closed, same-directory temporary regular file only.
   const input=await inspect(source);
   if(!input.isFile()||input.isSymbolicLink())throw error;
   try{const output=await inspect(destination);if(!output.isFile()||output.isSymbolicLink())throw error;}
   catch(check){if(check.code!=='ENOENT')throw check;}
   await sleep(WAITS[attempt]);
  }
 }
}
