// SPDX-License-Identifier: GPL-2.0-only
// Synthetic queues and injected capacity only. Never fills a disk or contacts municipal equipment.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {CaptureStore,atomicJson} from '../store.mjs';
import {runCycle,initialState,loadState,statusHtml} from '../service.mjs';
import {captureClock,validateFleetConfig} from '../../clock-fleet/runner.mjs';
import {nextCaptureFailure} from '../../clock-fleet/capture-policy.mjs';
import {pm10CaptureOverview} from '../../clock-fleet/control.mjs';
import {fleetOverview} from '../../clock-fleet/overview.mjs';import {captureHelp} from '../../clock-fleet/operator-help.mjs';
import {SERIAL,MAX_BYTES} from '../reader/lector-fichadas.mjs';import {dataSet} from './fixture.mjs';
const at='2026-09-29T06:00:00.000Z',floor=64*1048576,reserve=MAX_BYTES+1048576;
const fault=code=>Object.assign(Error(code),{code});
async function temp(fn){const root=await mkdtemp(path.join(os.tmpdir(),'mc-storage-qa-'));try{return await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
function harness(){let time=new Date(at);const calls={route:0,key:0,clock:0};return{calls,now:()=>time,advance:iso=>time=new Date(iso),route:async()=>{calls.route++;return{localLookup:true};},credential:async()=>{calls.key++;return Buffer.from('0');},collect:async(serial=SERIAL)=>{calls.clock++;const raw=dataSet(3);return{raw,parsed:{layout:'legacy-40-byte-candidate'},report:{authenticationAccepted:true,attendanceTransferComplete:true,finishedAt:time.toISOString(),metadata:{serialNumber:serial},transfer:{plannedBytes:raw.length,receivedBytes:raw.length,confirmedChunkBytes:raw.length},cleanup:{bufferReleaseConfirmed:true,exitConfirmed:true}}};}};}
const pmConfig=root=>({stateDir:root,credentialFile:path.join(root,'never-read.key'),pollSeconds:60});
const pmDeps=h=>({routeCheck:h.route,credentialReader:h.credential,collectImpl:()=>h.collect(),now:h.now});
const fleetConfig=root=>validateFleetConfig({schema:'municontrol-clock-fleet.v1',approved:true,stateDir:root,maxQueueMiB:64,minFreeMiB:64,clocks:[{clockId:'synthetic-clock',label:'Reloj QA',serial:'QA-STORAGE',host:'172.100.126.245',port:4370,credentialFile:path.join(root,'never-read.key'),pollSeconds:60,enabled:true}]});
const fleetDeps=(h,freeBytes)=>({route:h.route,credential:h.credential,collect:c=>h.collect(c.serial),now:h.now,freeBytes});
test('PM10 insufficient preflight capacity waits without route, key, clock or retry-budget consumption',()=>temp(async root=>{
 const h=harness(),store=await new CaptureStore(root,{minFreeBytes:floor,freeBytes:async()=>floor+reserve-1}).init();
 let s={...initialState(),failureCount:3,connectionFailureCount:4};
 for(let i=0;i<9;i++){s=await runCycle(pmConfig(root),store,s,pmDeps(h));assert.equal(s.status,'storage_wait');assert.equal(s.blocked,false);assert.equal(s.failureCount,3);assert.equal(s.connectionFailureCount,4);assert.equal(s.lastError,'DISK_SPACE_LOW');assert.equal(Date.parse(s.nextPollAt)-h.now().getTime(),60000);h.advance(s.nextPollAt);}
 assert.deepEqual(h.calls,{route:0,key:0,clock:0});assert.equal(store.summary().uniqueLocalRecords,0);
}));
test('PM10 deadline survives restart; exact reserve recovers one complete capture, replay adds no rows',()=>temp(async root=>{
 let available=0;const h=harness(),make=()=>new CaptureStore(root,{minFreeBytes:floor,freeBytes:async()=>available}).init();let store=await make();
 let s=await runCycle(pmConfig(root),store,initialState(),pmDeps(h));await atomicJson(path.join(root,'status.json'),s);store=await make();
 available=floor+reserve;await runCycle(pmConfig(root),store,await loadState(root),pmDeps(h));assert.equal(h.calls.clock,0);
 h.advance(s.nextPollAt);s=await runCycle(pmConfig(root),store,await loadState(root),pmDeps(h));assert.equal(s.status,'captured_locally');assert.equal(s.uniqueLocalRecords,3);
 const before=store.summary();h.advance(s.nextPollAt);s=await runCycle(pmConfig(root),store,s,pmDeps(h));assert.equal(h.calls.clock,2);assert.equal(s.newUniqueRecordsLastCycle,0);assert.deepEqual(store.summary(),before);
}));
for(const code of ['DISK_SPACE_LOW','QUEUE_CAPACITY_REACHED','AUTH_NOT_ACCEPTED','SERIAL_MISMATCH','QUEUE_CORRUPT'])test('PM10 persisted block '+code+' is never cleared by free disk',()=>temp(async root=>{
 const h=harness(),store=await new CaptureStore(root,{freeBytes:async()=>1e10}).init(),prior={...initialState(),blocked:true,status:'blocked',failureCount:1,lastError:code};
 const s=await runCycle(pmConfig(root),store,prior,pmDeps(h));assert.equal(s.blocked,true);assert.equal(s.lastError,code);assert.deepEqual(h.calls,{route:0,key:0,clock:0});
}));
for(const code of ['DISK_SPACE_LOW','ENOSPC'])test('PM10 '+code+' after preflight remains a blocking IO failure',()=>temp(async root=>{
 const h=harness(),store=await new CaptureStore(root,{freeBytes:async()=>1e10}).init();store.save=async()=>{throw fault(code);};
 const s=await runCycle(pmConfig(root),store,initialState(),pmDeps(h));assert.equal(s.blocked,true);assert.equal(s.status,'blocked');assert.equal(h.calls.clock,1);assert.equal(s.lastCaptureAt,null);assert.equal(store.summary().uniqueLocalRecords,0);
}));
test('fleet waits only on explicit local capacity preflight, then resumes through the normal reader',()=>temp(async root=>{
 const h=harness(),cfg=fleetConfig(root),clock=cfg.clocks[0];let free=0;const deps=fleetDeps(h,async()=>free);
 let s=await captureClock(cfg,clock,deps);assert.equal(s.status,'storage_wait');assert.equal(s.failureCount,0);assert.deepEqual(h.calls,{route:0,key:0,clock:0});
 const file=path.join(root,clock.clockId,'status.json'),before=await readFile(file,'utf8');free=floor+reserve;await captureClock(cfg,clock,deps);assert.equal(await readFile(file,'utf8'),before);assert.equal(h.calls.clock,0);
 h.advance(s.nextPollAt);s=await captureClock(cfg,clock,deps);assert.equal(s.status,'captured_locally');assert.equal(s.uniqueLocalRecords,3);h.advance(s.nextPollAt);s=await captureClock(cfg,clock,deps);assert.equal(s.newUniqueRecordsLastCycle,0);assert.equal(s.uniqueLocalRecords,3);
}));
test('fleet reader-supplied DISK_SPACE_LOW cannot masquerade as the local preflight',()=>temp(async root=>{
 const h=harness(),cfg=fleetConfig(root),deps=fleetDeps(h,async()=>1e10);deps.collect=async()=>{throw fault('DISK_SPACE_LOW');};
 const s=await captureClock(cfg,cfg.clocks[0],deps);assert.equal(s.blocked,true);assert.equal(s.status,'blocked');assert.equal(s.failureCount,1);
}));
test('fleet existing storage block remains unchanged after restart and capacity recovery',()=>temp(async root=>{
 const h=harness(),cfg=fleetConfig(root),clock=cfg.clocks[0],deps=fleetDeps(h,async()=>0);let s=await captureClock(cfg,clock,deps);
 const file=path.join(root,clock.clockId,'status.json');s={...s,blocked:true,status:'blocked',failureCount:1,nextPollAt:null};await atomicJson(file,s);const before=await readFile(file,'utf8');h.advance('2026-09-30T00:00:00Z');
 const actual=await captureClock(cfg,clock,fleetDeps(h,async()=>1e10));assert.equal(actual.blocked,true);assert.equal(await readFile(file,'utf8'),before);assert.equal(h.calls.clock,0);
}));
for(const patch of [{blocked:true},{lastError:'AUTH_NOT_ACCEPTED'},{nextPollAt:null}])test('inconsistent storage state rejected by readers and local overview '+JSON.stringify(patch),()=>temp(async root=>{
 const h=harness(),cfg=fleetConfig(root),clock=cfg.clocks[0];const fleetState=await captureClock(cfg,clock,fleetDeps(h,async()=>0));
 const file=path.join(root,clock.clockId,'status.json');await atomicJson(file,{...fleetState,...patch});const before=await readFile(file,'utf8');await assert.rejects(captureClock(cfg,clock,fleetDeps(h,async()=>1e10)),{code:'FLEET_STATE_INVALID'});assert.equal(await readFile(file,'utf8'),before);
 const pmState={...initialState(),status:'storage_wait',lastError:'DISK_SPACE_LOW',nextPollAt:'2026-09-29T06:01:00.000Z',...patch};await atomicJson(path.join(root,'status.json'),pmState);await assert.rejects(loadState(root),{code:'STATE_CORRUPT'});assert.throws(()=>pm10CaptureOverview(pmState),{code:'FLEET_CONTROL_INVALID'});
}));
for(const pollSeconds of [60,900,3600])test('bounded storage probe delay for configured interval '+pollSeconds,()=>{
 const s=nextCaptureFailure({failureCount:5,connectionFailureCount:6,blocked:false},{code:'DISK_SPACE_LOW',storageWait:true,pollSeconds,now:new Date(at)});
 assert.equal(s.failureCount,5);assert.equal(s.connectionFailureCount,6);assert.equal(Date.parse(s.nextPollAt)-Date.parse(at),Math.min(900,pollSeconds)*1000);assert.equal(s.blocked,false);
});
for(const code of ['QUEUE_CAPACITY_REACHED','ENOSPC','AUTH_NOT_ACCEPTED','SERIAL_MISMATCH','CHECKSUM_MISMATCH'])test('storage marker cannot relax '+code,()=>{
 const s=nextCaptureFailure({failureCount:0,connectionFailureCount:0},{code,storageWait:true,pollSeconds:60,now:new Date(at)});assert.equal(s.blocked,true);assert.equal(s.status,'blocked');
});
test('stopping while waiting does not begin a capacity probe, key read or clock session',()=>temp(async root=>{
 const h=harness(),store=await new CaptureStore(root,{freeBytes:async()=>0}).init(),signal=AbortSignal.abort();let probes=0;store.capacity=async()=>{probes++;};
 const s=await runCycle(pmConfig(root),store,{...initialState(),status:'storage_wait',lastError:'DISK_SPACE_LOW',nextPollAt:at},{...pmDeps(h),signal});
 assert.equal(s.status,'stopped');assert.equal(probes,0);assert.deepEqual(h.calls,{route:0,key:0,clock:0});
}));
test('both operator panels show the storage wait and old receipt independently',()=>{
 const s={...initialState(),status:'storage_wait',lastError:'DISK_SPACE_LOW',nextPollAt:'2026-09-29T06:01:00.000Z'};
 const html=statusHtml(s),capture=pm10CaptureOverview(s);assert.equal(capture.state,'storage_wait');assert.match(html,/Captura pausada por capacidad/);assert.match(html,/reintentará automáticamente/);
 assert.match(captureHelp(s),/sin reducir límites ni borrar fichadas/);
 const view=fleetOverview({clocks:[]},{updatedAt:at,clocks:[]},{desired:'running',pm10:{capture,delivery:{state:'queue_confirmed',enabled:true,scope:'canonical',checkedAt:at,lastReceiptAt:at,confirmedRecords:17,pendingParts:0,nextAttemptAt:null,evidenceState:'verified'}}});
 assert.match(view,/Captura en espera por falta de espacio/);assert.match(view,/data-metric="needsReview"><strong>1/);assert.match(view,/Acuse guardado/);assert.doesNotMatch(view,/Captura detenida para revisión/);
});
