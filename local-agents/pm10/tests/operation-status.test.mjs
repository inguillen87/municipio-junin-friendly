// SPDX-License-Identifier: GPL-2.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {readOperationStatus} from '../operation-status.mjs';
import {initialState} from '../service.mjs';
import {TARGET,PORT,SERIAL} from '../reader/lector-fichadas.mjs';
const clock=()=>new Date('2026-09-16T10:00:00Z');
async function fixture(fn){const base=await mkdtemp(path.join(os.tmpdir(),'pm10-operation-'));try{
 const state=path.join(base,'state');await mkdir(path.join(state,'delivery'),{recursive:true});
 await writeFile(path.join(base,'config.json'),JSON.stringify({schema:'pm10-capture-agent.v1',mode:'capture_only',approved:true,host:TARGET,port:PORT,serial:SERIAL,stateDir:state,credentialFile:path.join(base,'never-created-secret'),pollSeconds:60,maxQueueMiB:256,minFreeMiB:16}));
 await fn(base,state);
}finally{await rm(base,{recursive:true,force:true});}}
test('a living supervisor cannot hide a blocked capture behind its process state',()=>fixture(async(base,state)=>{
 const saved=JSON.stringify({...initialState(),blocked:true,status:'blocked',lastError:'ECONNABORTED'});
 await writeFile(path.join(state,'status.json'),saved);
 const result=await readOperationStatus(base,{now:clock});
 assert.equal(result.capture.state,'blocked');assert.equal(result.capture.blocked,true);
 assert.equal(result.capture.lastError,'ECONNABORTED');assert.equal(result.delivery.availability,'missing');
 assert.equal(await readFile(path.join(state,'status.json'),'utf8'),saved);
 assert.equal(result.checkedAt,clock().toISOString());
 assert.doesNotMatch(JSON.stringify(result),/never-created-secret|4370|CQTU/);
}));
test('capture and delivery are independent and old receipt dates remain visible',()=>fixture(async(base,state)=>{
 await writeFile(path.join(state,'status.json'),JSON.stringify({...initialState(),status:'captured_locally',lastCaptureAt:'2026-09-15T10:00:00Z'}));
 await writeFile(path.join(state,'delivery/status.json'),JSON.stringify({version:'pm10-sender-status.v1',state:'blocked',updatedAt:'2026-09-15T10:00:00Z',code:'DELIVERY_AUTH_BLOCKED',physicalClockVerified:false}));
 const result=await readOperationStatus(base,{now:clock});
 assert.equal(result.capture.state,'captured_locally');assert.equal(result.delivery.state,'blocked');
 assert.equal(result.capture.lastCaptureAt,'2026-09-15T10:00:00Z');
 assert.equal(result.delivery.updatedAt,'2026-09-15T10:00:00Z');
 assert.equal(result.delivery.code,'DELIVERY_AUTH_BLOCKED');
 assert.equal(result.healthy,undefined);
}));
test('malformed capture state is explicit instead of reporting a working collector',()=>fixture(async(base,state)=>{
 await writeFile(path.join(state,'status.json'),'invalid-json');
 const result=await readOperationStatus(base,{now:clock});assert.equal(result.capture.availability,'invalid');
}));
test('missing configuration is an observation, not a supervisor crash',()=>fixture(async base=>{
 await rm(path.join(base,'config.json'));
 const result=await readOperationStatus(base,{now:clock});assert.equal(result.capture.availability,'unavailable');
}));
test('status reports liveness and operation separately without changing a running control file',()=>fixture(async(base,state)=>{
 const {readUserStatus,setDesired}=await import('../user-supervisor.mjs');await setDesired(base,'running');
 const control=JSON.stringify({schema:'pm10-user-supervisor.v1',pid:process.pid,state:'running'});
 await writeFile(path.join(base,'control/status.json'),control);
 await writeFile(path.join(state,'status.json'),JSON.stringify({...initialState(),status:'blocked',blocked:true,lastError:'AUTH_NOT_ACCEPTED'}));
 const result=await readUserStatus(base);assert.equal(result.processPresent,true);assert.equal(result.status.state,'running');
 assert.equal(result.operation.capture.blocked,true);assert.equal(result.operation.capture.lastError,'AUTH_NOT_ACCEPTED');
 assert.equal(await readFile(path.join(base,'control/status.json'),'utf8'),control);
}));

test('current-user installer includes the supervisor operational-status dependency',async()=>{
 const source=await readFile(new URL('../install/install-user-windows.ps1',import.meta.url),'utf8');
 assert.match(source,/'user-supervisor\.mjs','operation-status\.mjs'/);
});
