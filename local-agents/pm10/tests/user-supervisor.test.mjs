// SPDX-License-Identifier: GPL-2.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {mkdtemp,writeFile,readFile,rm,mkdir,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setDesired,supervise,readUserStatus,pathsFor,watchdog} from '../user-supervisor.mjs';
import {acquireLock,atomicJson} from '../store.mjs';

async function fixture(fn){const root=await mkdtemp(path.join(os.tmpdir(),'pm10-user-supervisor-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
test('prepared or durably stopped supervisor does not launch workers',()=>fixture(async root=>{
 let launches=0;await supervise(root,{launch(){launches++;throw Error('No worker expected');}});
 assert.equal(launches,0);const status=await readUserStatus(root);
 assert.equal(status.desired,'stopped');assert.equal(status.status.state,'stopped');
 assert.equal(status.runsWhenComputerOff,false);assert.equal(status.operationWhileLoggedOutVerified,false);
}));
test('one capture and sender stop through IPC while configs remain unchanged',()=>fixture(async root=>{
 await writeFile(path.join(root,'config.json'),'SYNTHETIC_CAPTURE_CONFIG');await writeFile(path.join(root,'sender.json'),'SYNTHETIC_SENDER_CONFIG');
 await setDesired(root,'running');const children=[],messages=[];
 function launch(file,args,options){
  assert.equal(options.windowsHide,true);assert.equal(options.stdio.at(-1),'ipc');
  const child=new EventEmitter();child.pid=1234+children.length;child.connected=true;
  child.send=(message,callback)=>{messages.push(message);child.connected=false;child.emit('exit',0);callback?.();};
  children.push({child,args});return child;
 }
 await supervise(root,{launch,sleep:async ms=>{if(ms===1000)await setDesired(root,'stopped');}});
 assert.deepEqual(children.map(c=>c.args[0]),['worker-capture','worker-sender']);
 assert.deepEqual(messages,[{command:'stop'},{command:'stop'}]);
 assert.equal((await readUserStatus(root)).status.state,'stopped');
 assert.equal(await readFile(path.join(root,'config.json'),'utf8'),'SYNTHETIC_CAPTURE_CONFIG');
 assert.equal(await readFile(path.join(root,'sender.json'),'utf8'),'SYNTHETIC_SENDER_CONFIG');
}));
test('supervisor requires an absolute non-root base',()=>{
 for(const base of ['relative',path.parse(process.cwd()).root,'\u0000'])assert.throws(()=>pathsFor(base),{code:'USER_BASE_INVALID'});
});
test('watchdog never changes a missing or manually stopped desired state',()=>fixture(async root=>{
 let launches=0;const run=()=>{launches++;throw Error('Unexpected supervisor');};
 assert.equal(await watchdog(root,{run}),'stopped');
 assert.deepEqual(await readdir(root),[]);
 await setDesired(root,'stopped');const file=pathsFor(root).desired,before=await readFile(file,'utf8');
 assert.equal(await watchdog(root,{run}),'stopped');assert.equal(launches,0);
 assert.equal(await readFile(file,'utf8'),before);
}));
test('watchdog defers to a live owner even when status falsely says absent',()=>fixture(async root=>{
 await setDesired(root,'running');const p=pathsFor(root),release=await acquireLock(p.control);
 try{
  await atomicJson(p.status,{schema:'pm10-user-supervisor.v1',pid:0,state:'stopped'});
  const before=await readFile(p.status,'utf8'),desired=await readFile(p.desired,'utf8');
  assert.equal(await watchdog(root),'already_running');
  assert.equal(await readFile(p.status,'utf8'),before);assert.equal(await readFile(p.desired,'utf8'),desired);
 }finally{await release();}
}));
test('watchdog preserves malformed desired state and interrupted transition for review',()=>fixture(async root=>{
 const p=await setDesired(root,'running');await writeFile(p.desired,'{"schema":"invalid","desired":"running"}');
 await assert.rejects(watchdog(root),{code:'USER_CONTROL_INVALID'});
 await setDesired(root,'running');await mkdir(path.join(p.control,'process.lock.transition'));
 await assert.rejects(watchdog(root),{code:'LOCK_NEEDS_REVIEW'});
 assert.deepEqual(await readdir(path.join(p.control,'process.lock.transition')),[]);
}));
test('manual stop between watchdog check and lock acquisition still prevents workers',()=>fixture(async root=>{
 await setDesired(root,'running');let launched=false;
 assert.equal(await watchdog(root,{run:async base=>{
  await setDesired(base,'stopped');return supervise(base,{launch:()=>{launched=true;}});
 }}),'stopped');assert.equal(launched,false);
}));
const supervisorFile=fileURLToPath(new URL('../user-supervisor.mjs',import.meta.url));
async function until(check){
 const deadline=Date.now()+12000;
 while(Date.now()<deadline){if(await check())return;await delay(30);}
 throw Error('Synthetic supervisor did not reach the expected state');
}
function realWatchdog(root){
 const child=spawn(process.execPath,[supervisorFile,'watchdog','--base',root],{stdio:'ignore',windowsHide:true});
 const exit=once(child,'exit');return {child,exit};
}
async function cleanupChild(worker){
 if(worker.child.exitCode===null&&worker.child.signalCode===null)worker.child.kill();
 await worker.exit;
}
test('real watchdogs keep one live owner, recover its crash, and preserve manual stop',{timeout:30000},()=>fixture(async root=>{
 // No device or sender configuration: this process test cannot contact a clock.
 const p=await setDesired(root,'running');let first,second,recovered;
 try{
  first=realWatchdog(root);
  await until(async()=>{const s=await readUserStatus(root);return s.status?.pid===first.child.pid&&s.status.state==='running';});
  const owner=await readFile(path.join(p.control,'process.lock','owner.json'),'utf8');
  second=realWatchdog(root);assert.deepEqual(await second.exit,[0,null]);
  process.kill(first.child.pid,0);assert.equal(await readFile(path.join(p.control,'process.lock','owner.json'),'utf8'),owner);
  // SIGTERM is a graceful stop on POSIX and correctly releases the lock.
  // This fixture explicitly simulates a crash of its own synthetic process.
  first.child.kill('SIGKILL');await first.exit;assert.throws(()=>process.kill(first.child.pid,0),{code:'ESRCH'});
  recovered=realWatchdog(root);
  await until(async()=>{const s=await readUserStatus(root);return s.status?.pid===recovered.child.pid&&s.status.state==='running';});
  assert.equal((await readdir(p.control)).filter(n=>n.startsWith('recovered-lock-')).length,1);
  await setDesired(root,'stopped');assert.deepEqual(await recovered.exit,[0,null]);
  const before=await readFile(p.desired,'utf8');assert.equal(await watchdog(root),'stopped');
  assert.equal(await readFile(p.desired,'utf8'),before);assert.equal((await readUserStatus(root)).status.state,'stopped');
 }finally{for(const worker of [first,second,recovered].filter(Boolean))await cleanupChild(worker);}
}));
