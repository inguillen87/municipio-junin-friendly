// SPDX-License-Identifier: GPL-2.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,rm,writeFile,readFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {acquireLock,atomicJson} from '../store.mjs';

async function temp(fn){const root=await mkdtemp(path.join(os.tmpdir(),'pm10-lock-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
async function deadPid(){
 const child=spawn(process.execPath,['-e','process.exit(0)'],{stdio:'ignore'}),pid=child.pid;
 await once(child,'exit');assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});return pid;
}
async function seedOwner(root,pid,name='process.lock'){
 const dir=path.join(root,name);await mkdir(dir,{mode:0o700});
 const owner={pid,hostname:os.hostname(),token:'synthetic-old-owner'};
 await atomicJson(path.join(dir,'owner.json'),owner);return owner;
}

// Pause a REAL contender immediately after it observes ESRCH. The second
// process attempts the same stale lock while the first has not yet renamed it.
// Without the transition gate both processes report acquired in this schedule.
const worker=`
import {existsSync} from 'node:fs';
import {acquireLock} from ${JSON.stringify(new URL('../store.mjs',import.meta.url).href)};
const [root,pidText,resumeFile,pause]=process.argv.slice(1),pid=Number(pidText);
const originalKill=process.kill.bind(process),waitBuffer=new Int32Array(new SharedArrayBuffer(4));
process.kill=(target,signal)=>{
 try{return originalKill(target,signal);}catch(e){
  if(pause==='yes'&&target===pid&&signal===0&&e.code==='ESRCH'){
   process.send({phase:'observed-dead'});
   const deadline=Date.now()+15000;
   while(!existsSync(resumeFile)){if(Date.now()>deadline)throw Error('Test pause expired');Atomics.wait(waitBuffer,0,0,10);}
  }
  throw e;
 }
};
try{
 const release=await acquireLock(root);process.send({phase:'acquired'});
 process.once('message',async()=>{await release();process.disconnect();});
}catch(e){process.send({phase:'failed',code:e.code??e.message});process.disconnect();}
`;
function contender(root,pid,resumeFile,pause){
 const child=spawn(process.execPath,['--input-type=module','-e',worker,root,String(pid),resumeFile,pause?'yes':'no'],{stdio:['ignore','ignore','pipe','ipc']});
 const messages=[],waiters=[];let stderr='';child.stderr.on('data',b=>stderr+=b);
 child.on('message',m=>{const waiting=waiters.shift();if(waiting)waiting(m);else messages.push(m);});
 return {child,next:()=>messages.length?Promise.resolve(messages.shift()):new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Child message timeout: '+stderr)),20000);
  waiters.push(m=>{clearTimeout(timer);resolve(m);});
 })};
}
async function closeChild(child){
 if(child.exitCode!==null||child.signalCode!==null)return;
 const closed=once(child,'exit');child.kill();await closed;
}

test('two real processes cannot both recover the same dead owner',{timeout:30000},()=>temp(async root=>{
 const pid=await deadPid(),oldOwner=await seedOwner(root,pid),resumeFile=path.join(root,'resume-test');
 const first=contender(root,pid,resumeFile,true);let second;
 try{
  assert.deepEqual(await first.next(),{phase:'observed-dead'});
  second=contender(root,pid,resumeFile,false);const secondResult=await second.next();
  await writeFile(resumeFile,'resume');const firstResult=await first.next();
  assert.deepEqual(firstResult,{phase:'acquired'});
  assert.deepEqual(secondResult,{phase:'failed',code:'ALREADY_RUNNING'});
  const live=JSON.parse(await readFile(path.join(root,'process.lock','owner.json'),'utf8'));
  assert.equal(live.pid,first.child.pid);
  const retained=(await readdir(root)).filter(n=>n.startsWith('recovered-lock-'));
  assert.equal(retained.length,1);
  assert.deepEqual(JSON.parse(await readFile(path.join(root,retained[0],'owner.json'),'utf8')),oldOwner);
  const exited=once(first.child,'exit');first.child.send('release');await exited;
  const release=await acquireLock(root);await release();
 }finally{await writeFile(resumeFile,'resume');await closeChild(first.child);if(second)await closeChild(second.child);}
}));

test('interrupted lock transition is retained for review instead of being stolen',()=>temp(async root=>{
 const pid=await deadPid(),owner=await seedOwner(root,pid,'process.lock.transition');
 await assert.rejects(acquireLock(root),{code:'LOCK_NEEDS_REVIEW'});
 assert.deepEqual(JSON.parse(await readFile(path.join(root,'process.lock.transition','owner.json'),'utf8')),owner);
 assert.equal((await readdir(root)).includes('process.lock'),false);
}));

test('simultaneous and repeated release cannot remove a later owner',()=>temp(async root=>{
 const release=await acquireLock(root);await Promise.all([release(),release()]);
 const next=await acquireLock(root),before=await readFile(path.join(root,'process.lock','owner.json'),'utf8');
 await release();assert.equal(await readFile(path.join(root,'process.lock','owner.json'),'utf8'),before);await next();
}));

test('incomplete transition fails closed without creating or replacing a process lock',()=>temp(async root=>{
 await mkdir(path.join(root,'process.lock.transition'),{mode:0o700});
 await assert.rejects(acquireLock(root),{code:'LOCK_NEEDS_REVIEW'});
 assert.deepEqual(await readdir(root),['process.lock.transition']);
}));
