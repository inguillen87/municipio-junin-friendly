// SPDX-License-Identifier: GPL-2.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setDesired,supervise,readUserStatus,pathsFor} from '../user-supervisor.mjs';

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
