// SPDX-License-Identifier: GPL-2.0-only
// Host/process fixtures only. These tests never contact municipal devices or endpoints.
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import path from 'node:path';import os from 'node:os';import fs from 'node:fs/promises';
import {gatewayConfig,absoluteLocal,validateOwnership,loadGateway,inspectGateway} from '../../clock-fleet/gateway-config.mjs';
import {nextWorkerState,workerArgs,supervise} from '../../clock-fleet/gateway.mjs';
const root=path.join(os.tmpdir(),'gateway-synthetic');
const config=()=>({schema:'municipal-clock-gateway.v1',approved:true,approvedHost:'qa-host',stateDir:path.join(root,'coordinator'),workers:[{kind:'fleet-capture',configFile:path.join(root,'fleet.json'),enabled:true}]});
const worker=kind=>({kind,configFile:path.join(root,kind+'.json'),enabled:true});
test('host approval is explicit and never inferred from user name',()=>{
 assert.equal(gatewayConfig(config(),'QA-HOST').workers.length,1);
 for(const patch of [{approved:false},{approvedHost:'other'},{schema:'unknown'},{extra:'unexpected'}])assert.throws(()=>gatewayConfig({...config(),...patch},'qa-host'));
});
test('only known capture/delivery modules can be supervised, with exact argument arrays',()=>{
 for(const kind of ['fleet-capture','legacy-capture','legacy-delivery']){const args=workerArgs(worker(kind));assert.equal(args[1],'run');assert.equal(args[2],'--config');assert.equal(args[3],worker(kind).configFile);assert.ok(path.isAbsolute(args[0]));}
 for(const kind of ['shell','__proto__','../other','fleet-delivery'])assert.throws(()=>gatewayConfig({...config(),workers:[worker(kind)]},'qa-host'));
 const c=config();c.workers.push(c.workers[0]);assert.throws(()=>gatewayConfig(c,'qa-host'));
});
test('relative paths, roots, control characters and network shares are rejected',()=>{
 for(const p of ['relative/file.json',path.parse(root).root,'\\\\host\\share\\file.json',root+'\nfile',root+'"file'])assert.throws(()=>absoluteLocal(p));
});
test('capture identity and queue duplication blocks a double reader',()=>{
 const a={capture:true,serial:'SYNTHETIC-A',stateDir:path.join(root,'a')},b={capture:true,serial:'SYNTHETIC-B',stateDir:path.join(root,'b')};
 assert.equal(validateOwnership([a,b]).allSendersConfigured,false);
 assert.throws(()=>validateOwnership([a,{...b,serial:a.serial}]));assert.throws(()=>validateOwnership([a,{...b,stateDir:a.stateDir}]));
 assert.throws(()=>validateOwnership([a,{capture:false,serial:b.serial,stateDir:b.stateDir}]));
 assert.deepEqual(validateOwnership([a,{...a,capture:false}]),{captureIdentities:1,deliveryIdentities:1,allSendersConfigured:true});
});
test('configuration rejection does not trigger repeated worker attempts',()=>{
 const stopped=nextWorkerState({failures:0},{exitCode:2,uptimeMs:1,nowMs:Date.now()});assert.equal(stopped.state,'review_required');assert.equal(stopped.nextAttemptAt,null);
});
test('worker crash retry grows within a bounded budget, and intentional stop does not retry',()=>{
 const nowMs=Date.now(),a=nextWorkerState({failures:0},{exitCode:1,uptimeMs:1,nowMs});assert.equal(Date.parse(a.nextAttemptAt)-nowMs,120000);
 const b=nextWorkerState({failures:4},{exitCode:1,uptimeMs:1,nowMs});assert.equal(b.state,'review_required');
 assert.equal(nextWorkerState({failures:2},{exitCode:null,uptimeMs:1,nowMs,stopping:true}).state,'stopped');
 assert.equal(nextWorkerState({failures:4},{exitCode:1,uptimeMs:300000,nowMs}).failures,0);
 assert.throws(()=>nextWorkerState({}, {exitCode:1,uptimeMs:-1,nowMs}));
});
function fakeProcess(){const e=new EventEmitter();e.kills=[];e.kill=signal=>{e.kills.push(signal);queueMicrotask(()=>e.emit('exit',null,signal));return true;};return e;}
test('two failed workers exhaust independent budgets without a shell or diagnostic data forwarding',async()=>{
 const calls=[],snapshots=[];let n=0;const fakeSpawn=(exe,args,opts)=>{calls.push({exe,args,opts});const child=fakeProcess();queueMicrotask(()=>child.emit('exit',1));return child;};
 const result=await supervise({workers:[worker('fleet-capture'),worker('legacy-delivery')]},{spawnImpl:fakeSpawn,wait:async()=>{},now:()=>++n,onSnapshot:async s=>snapshots.push(s)});
 assert.equal(calls.length,10);assert.ok(result.every(s=>s.state==='review_required'));
 assert.ok(calls.every(c=>c.exe===process.execPath&&c.opts.shell===false&&c.opts.stdio==='ignore'&&c.opts.windowsHide));
 assert.ok(snapshots.every(s=>s.allClockReceptionVerified===false&&s.operationWhileLoggedOutVerified===false));
 assert.doesNotMatch(JSON.stringify(snapshots),/configFile|password|recordsBase64/);
});
test('one rejected worker does not stop its healthy sibling; explicit shutdown terminates the sibling',async()=>{
 const controller=new AbortController(),children=[];let siblingRunning=false;
 const result=await supervise({workers:[worker('fleet-capture'),worker('legacy-delivery')]},{signal:controller.signal,spawnImpl:(_e,args)=>{const c=fakeProcess();children.push(c);if(args[0].endsWith('runner.mjs'))setTimeout(()=>c.emit('exit',2),0);else siblingRunning=true;return c;},onSnapshot:async s=>{if(s.workers.some(w=>w.state==='review_required')&&s.workers.some(w=>w.state==='running'))controller.abort();}});
 assert.equal(siblingRunning,true);assert.equal(result.find(r=>r.kind==='fleet-capture').state,'review_required');assert.equal(result.find(r=>r.kind==='legacy-delivery').state,'stopped');assert.ok(children[1].kills.includes('SIGTERM'));
});
test('a signal already aborted starts no worker',async()=>{const c=new AbortController();c.abort();let spawned=0;await supervise({workers:[worker('fleet-capture')]},{signal:c.signal,spawnImpl:()=>spawned++});assert.equal(spawned,0);});
test('preflight reads approved configs without reading clock credentials or making network requests',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gateway-config-qa-'));try{
  const fleetFile=path.join(dir,'fleet.json'),gatewayFile=path.join(dir,'gateway.json');
  const fleet={schema:'municontrol-clock-fleet.v1',approved:true,stateDir:path.join(dir,'captures'),maxQueueMiB:64,minFreeMiB:64,clocks:[{clockId:'clock-a',label:'Synthetic A',host:'172.100.126.241',port:4370,serial:'SYNTHETIC-A',credentialFile:path.join(dir,'not-created.key'),pollSeconds:60,enabled:true}]};
  await fs.writeFile(fleetFile,JSON.stringify(fleet),{mode:0o600});const raw={...config(),approvedHost:os.hostname(),stateDir:path.join(dir,'coordinator'),workers:[{kind:'fleet-capture',configFile:fleetFile,enabled:true}]};await fs.writeFile(gatewayFile,JSON.stringify(raw),{mode:0o600});
  const report=await inspectGateway(await loadGateway(gatewayFile));assert.equal(report.captureIdentities,1);assert.equal(report.deliveryIdentities,0);assert.equal(report.networkTested,false);assert.equal(report.operationWhileLoggedOutVerified,false);assert.equal(report.realWrites,0);
  await assert.rejects(fs.stat(fleet.clocks[0].credentialFile),{code:'ENOENT'});
  await assert.rejects(inspectGateway({...raw,stateDir:path.join(dir,'captures','clock-a')}),e=>e.code==='GATEWAY_STATE_OVERLAP');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Windows deployment defaults to disabled and local-service identity rather than personal login',async()=>{
 const source=await fs.readFile(new URL('../../clock-fleet/install-machine-windows.ps1',import.meta.url),'utf8');
 assert.match(source,/#Requires -RunAsAdministrator/);assert.match(source,/LogonType ServiceAccount -RunLevel Limited/);assert.match(source,/New-ScheduledTaskTrigger -AtStartup/);assert.match(source,/Settings.Enabled=\[bool\]\$Activate/);assert.match(source,/GATEWAY_STOP_PREVIOUS_COLLECTORS_FIRST/);assert.match(source,/GATEWAY_RUNTIME_SIGNATURE_INVALID/);assert.match(source,/GATEWAY_STATE_MUST_BE_ISOLATED/);
 assert.doesNotMatch(source,/-Password|LogonType Interactive|Set-NetRoute|New-NetFirewallRule|Start-ScheduledTask/);
});
test('Linux deployment isolates state and credentials and does not enable itself',async()=>{
 const source=await fs.readFile(new URL('../../clock-fleet/municontrol-clock-gateway.service',import.meta.url),'utf8');for(const text of ['User=municontrol-clock','NoNewPrivileges=true','ProtectSystem=strict','UMask=0077','RestartPreventExitStatus=2','KillMode=control-group','ReadWritePaths=/var/lib/municontrol/clock-gateway'])assert.ok(source.includes(text));assert.doesNotMatch(source,/User=root|ExecStart=.*sh -c/);
});
