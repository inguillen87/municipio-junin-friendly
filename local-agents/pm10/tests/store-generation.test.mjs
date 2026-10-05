// SPDX-License-Identifier: GPL-2.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,utimes} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {acquireLock,atomicJson,replacedOwnerGeneration,windowsProcessStartTicks} from '../store.mjs';
const ticks='639005000000000000',ns=(BigInt(ticks)-621355968000000000n)*100n;
async function fixture(fn){const root=await mkdtemp(path.join(os.tmpdir(),'pm10-generation-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
async function seed(root,extra={}){await mkdir(path.join(root,'process.lock'),{mode:0o700});const owner={pid:process.pid,hostname:os.hostname(),token:'synthetic-previous-generation',...extra};await atomicJson(path.join(root,'process.lock','owner.json'),owner);return owner;}
test('a PID remains occupied for the same or an older observed generation',()=>{
 assert.equal(replacedOwnerGeneration({processStartTicks:ticks},ticks,ns),false);
 assert.equal(replacedOwnerGeneration({processStartTicks:ticks},String(BigInt(ticks)-1n),ns),false);
 assert.equal(replacedOwnerGeneration({processStartTicks:ticks},String(BigInt(ticks)+1n),ns),true);
});
test('legacy PID requires birth strictly after the owner file and conservative margin',()=>{
 assert.equal(replacedOwnerGeneration({},ticks,ns-10000000001n),true);
 for(const modified of [ns-10000000000n,ns-1n,ns,ns+1n])assert.equal(replacedOwnerGeneration({},ticks,modified),false);
});
test('unavailable, rounded or malformed process identity never unlocks the owner',()=>{
 for(const value of [null,undefined,Number(ticks),0,'1','-1',ticks+'x'])assert.equal(replacedOwnerGeneration({},value,ns),false);
 for(const value of [null,Number(ticks),'invalid'])assert.equal(replacedOwnerGeneration({processStartTicks:value},ticks,ns),false);
 for(const value of [0n,-1n,null,Number(ns)])assert.equal(replacedOwnerGeneration({},ticks,value),false);
});
test('malformed generation retains the original lock and source bytes',()=>fixture(async root=>{
 await seed(root,{processStartTicks:Number(ticks)});const file=path.join(root,'process.lock','owner.json'),before=await readFile(file);await writeFile(path.join(root,'source.bin'),Buffer.from('synthetic immutable source'));
 await assert.rejects(acquireLock(root),{code:'LOCK_NEEDS_REVIEW'});assert.deepEqual(await readFile(file),before);assert.equal(await readFile(path.join(root,'source.bin'),'utf8'),'synthetic immutable source');assert.equal((await readdir(root)).filter(n=>n.startsWith('recovered-lock-')).length,0);
}));
test('a live legacy owner with a current file is never taken over',()=>fixture(async root=>{
 await seed(root);const file=path.join(root,'process.lock','owner.json'),before=await readFile(file);
 await assert.rejects(acquireLock(root),{code:'ALREADY_RUNNING'});assert.deepEqual(await readFile(file),before);
}));
test('native Windows identity of this process is stable and rejects invalid PID',{skip:process.platform!=='win32'},async()=>{
 const first=await windowsProcessStartTicks(process.pid);assert.equal(await windowsProcessStartTicks(process.pid),first);
 for(const pid of [0,-1,1.5,'1'])await assert.rejects(windowsProcessStartTicks(pid),{code:'LOCK_IDENTITY_UNAVAILABLE'});
});
test('native Windows generation retains a live owner byte for byte',{skip:process.platform!=='win32'},()=>fixture(async root=>{
 const processStartTicks=await windowsProcessStartTicks(process.pid);await seed(root,{processStartTicks});const file=path.join(root,'process.lock','owner.json'),before=await readFile(file);
 await assert.rejects(acquireLock(root),{code:'ALREADY_RUNNING'});assert.deepEqual(await readFile(file),before);
}));
test('legacy reused PID is recovered under the gate while every source is retained',{skip:process.platform!=='win32'},()=>fixture(async root=>{
 const birth=await windowsProcessStartTicks(process.pid),birthMs=Number((BigInt(birth)-621355968000000000n)/10000n),oldOwner=await seed(root),file=path.join(root,'process.lock','owner.json');
 await utimes(file,new Date(birthMs-60000),new Date(birthMs-60000));await mkdir(path.join(root,'receipts'));await writeFile(path.join(root,'receipts','synthetic.json'),'UNCHANGED RECEIPT');await writeFile(path.join(root,'pending.bin'),'UNCHANGED SOURCE');
 const release=await acquireLock(root),retained=(await readdir(root)).filter(n=>n.startsWith('recovered-lock-'));
 assert.equal(retained.length,1);assert.deepEqual(JSON.parse(await readFile(path.join(root,retained[0],'owner.json'),'utf8')),oldOwner);
 assert.equal(JSON.parse(await readFile(file,'utf8')).processStartTicks,birth);
 await assert.rejects(acquireLock(root),{code:'ALREADY_RUNNING'});await release();
 assert.equal(await readFile(path.join(root,'pending.bin'),'utf8'),'UNCHANGED SOURCE');assert.equal(await readFile(path.join(root,'receipts','synthetic.json'),'utf8'),'UNCHANGED RECEIPT');
}));
test('an explicit older generation is retained and replaced by the native generation',{skip:process.platform!=='win32'},()=>fixture(async root=>{
 const birth=await windowsProcessStartTicks(process.pid),oldOwner=await seed(root,{processStartTicks:String(BigInt(birth)-10000n)}),release=await acquireLock(root);
 const retained=(await readdir(root)).filter(n=>n.startsWith('recovered-lock-'));assert.equal(retained.length,1);assert.deepEqual(JSON.parse(await readFile(path.join(root,retained[0],'owner.json'),'utf8')),oldOwner);await release();
}));
test('an interrupted transition with an old PID generation is still never recovered',{skip:process.platform!=='win32'},()=>fixture(async root=>{
 const birth=await windowsProcessStartTicks(process.pid);await mkdir(path.join(root,'process.lock.transition'));const owner={pid:process.pid,hostname:os.hostname(),token:'synthetic-gate',processStartTicks:String(BigInt(birth)-10000n)};
 await atomicJson(path.join(root,'process.lock.transition','owner.json'),owner);await assert.rejects(acquireLock(root),{code:'LOCK_NEEDS_REVIEW'});assert.deepEqual(JSON.parse(await readFile(path.join(root,'process.lock.transition','owner.json'),'utf8')),owner);assert.equal((await readdir(root)).includes('process.lock'),false);
}));
const contenderCode=`
import {existsSync} from 'node:fs';
import {acquireLock} from ${JSON.stringify(new URL('../store.mjs',import.meta.url).href)};
const [root,pidText,resumeFile,paused]=process.argv.slice(1),pid=Number(pidText),originalKill=process.kill.bind(process),waitBuffer=new Int32Array(new SharedArrayBuffer(4));
process.kill=(target,signal)=>{const result=originalKill(target,signal);if(paused==='yes'&&target===pid&&signal===0){process.send({phase:'observed-live-pid'});const deadline=Date.now()+15000;while(!existsSync(resumeFile)){if(Date.now()>deadline)throw Error('Pause expired');Atomics.wait(waitBuffer,0,0,10);}}return result;};
try{const release=await acquireLock(root);process.send({phase:'acquired'});process.once('message',async()=>{await release();process.disconnect();});}
catch(e){process.send({phase:'failed',code:e.code??e.message});process.disconnect();}
`;
function contender(root,resumeFile,paused){
 const child=spawn(process.execPath,['--input-type=module','-e',contenderCode,root,String(process.pid),resumeFile,paused?'yes':'no'],{stdio:['ignore','ignore','pipe','ipc']}),messages=[],waiters=[];let stderr='';child.stderr.on('data',b=>stderr+=b);
 child.on('message',m=>{const waiting=waiters.shift();if(waiting)waiting(m);else messages.push(m);});
 return {child,next:()=>messages.length?Promise.resolve(messages.shift()):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Child timeout: '+stderr)),20000);waiters.push(m=>{clearTimeout(timer);resolve(m);});})};
}
async function close(child){if(child.exitCode!==null||child.signalCode!==null)return;const exited=once(child,'exit');child.kill();await exited;}
test('two real processes cannot both recover one legacy reused Windows PID',{skip:process.platform!=='win32',timeout:30000},()=>fixture(async root=>{
 const oldOwner=await seed(root),file=path.join(root,'process.lock','owner.json'),resumeFile=path.join(root,'resume-test');await utimes(file,new Date('2020-01-01Z'),new Date('2020-01-01Z'));
 const first=contender(root,resumeFile,true);let second;
 try{
  assert.deepEqual(await first.next(),{phase:'observed-live-pid'});second=contender(root,resumeFile,false);assert.deepEqual(await second.next(),{phase:'failed',code:'ALREADY_RUNNING'});
  await writeFile(resumeFile,'resume');assert.deepEqual(await first.next(),{phase:'acquired'});assert.equal(JSON.parse(await readFile(file,'utf8')).pid,first.child.pid);
  const retained=(await readdir(root)).filter(n=>n.startsWith('recovered-lock-'));assert.equal(retained.length,1);assert.deepEqual(JSON.parse(await readFile(path.join(root,retained[0],'owner.json'),'utf8')),oldOwner);
  const exited=once(first.child,'exit');first.child.send('release');await exited;
 }finally{await writeFile(resumeFile,'resume');await close(first.child);if(second)await close(second.child);}
}));
