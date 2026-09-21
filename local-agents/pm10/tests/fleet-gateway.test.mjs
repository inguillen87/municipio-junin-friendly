// SPDX-License-Identifier: GPL-2.0-only
// Host/process fixtures only. These tests never contact municipal devices or endpoints.
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import path from 'node:path';import os from 'node:os';import fs from 'node:fs/promises';
import {gatewayConfig,absoluteLocal,validateOwnership,loadGateway,inspectGateway} from '../../clock-fleet/gateway-config.mjs';
import {nextWorkerState,workerArgs,supervise,captureWorker,deliveryWorker,desiredState,setDesiredState,monitorDesiredState,main} from '../../clock-fleet/gateway.mjs';
const root=path.join(os.tmpdir(),'gateway-synthetic');
const config=()=>({schema:'municipal-clock-gateway.v1',approved:true,approvedHost:'qa-host',stateDir:path.join(root,'coordinator'),workers:[{kind:'fleet-capture',configFile:path.join(root,'fleet.json'),enabled:true}]});
const worker=kind=>({kind,configFile:path.join(root,kind+'.json'),enabled:true});
test('host approval is explicit and never inferred from user name',()=>{
 assert.equal(gatewayConfig(config(),'QA-HOST').workers.length,1);
 for(const patch of [{approved:false},{approvedHost:'other'},{schema:'unknown'},{extra:'unexpected'}])assert.throws(()=>gatewayConfig({...config(),...patch},'qa-host'));
});
test('only known capture/delivery modules can be supervised, with exact argument arrays',()=>{
 for(const kind of ['fleet-capture','legacy-capture','legacy-delivery','fleet-delivery']){const args=workerArgs(worker(kind));assert.equal(args[1],'worker');assert.equal(args[2],kind);assert.equal(args[3],'--config');assert.equal(args[4],worker(kind).configFile);assert.ok(path.isAbsolute(args[0]));}
 for(const kind of ['shell','__proto__','../other','arbitrary-delivery'])assert.throws(()=>gatewayConfig({...config(),workers:[worker(kind)]},'qa-host'));
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
 assert.deepEqual(validateOwnership([a,{...a,capture:false,connectorKey:'synthetic-clock-a'}]),{captureIdentities:1,deliveryIdentities:1,allSendersConfigured:true});
});
test('delivery pins clock, exact serial, queue and a connector unique across adapters',()=>{
 const a={capture:true,clockId:'clock-a',serial:'SYNTHETIC-A',stateDir:path.join(root,'a')},b={capture:true,clockId:'clock-b',serial:'SYNTHETIC-B',stateDir:path.join(root,'b')};
 const d={...a,capture:false,connectorKey:'synthetic-connector-a'};
 for(const patch of [{clockId:'clock-b'},{serial:'synthetic-a'},{stateDir:b.stateDir}])assert.throws(()=>validateOwnership([a,b,{...d,...patch}]),{code:'GATEWAY_DELIVERY_WITHOUT_CAPTURE'});
 assert.throws(()=>validateOwnership([a,b,d,{...b,capture:false,connectorKey:d.connectorKey}]),{code:'GATEWAY_DUPLICATE_DELIVERY'});
 assert.throws(()=>validateOwnership([a,d,d]),{code:'GATEWAY_DUPLICATE_DELIVERY'});
 assert.throws(()=>validateOwnership([a,{...b,stateDir:path.join(a.stateDir,'nested')}]),{code:'GATEWAY_DUPLICATE_CAPTURE'});
 assert.deepEqual(validateOwnership([a,b,d,{...b,capture:false,connectorKey:'synthetic-connector-b'}]),{captureIdentities:2,deliveryIdentities:2,allSendersConfigured:true});
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
function fakeProcess(){const e=new EventEmitter();e.pid=1234;e.connected=true;e.messages=[];e.kills=[];e.kill=signal=>{e.kills.push(signal);throw Error('Hard kill is forbidden');};e.send=(message,callback)=>{e.messages.push(message);queueMicrotask(()=>{e.emit('exit',0);callback?.();});};e.disconnect=()=>{e.connected=false;queueMicrotask(()=>e.emit('exit',0));};queueMicrotask(()=>e.emit('message',{type:'worker-ready'}));return e;}
test('two failed workers exhaust independent budgets without a shell or diagnostic data forwarding',async()=>{
 const calls=[],snapshots=[];let n=0;const fakeSpawn=(exe,args,opts)=>{calls.push({exe,args,opts});const child=fakeProcess();queueMicrotask(()=>child.emit('exit',1));return child;};
 const result=await supervise({workers:[worker('fleet-capture'),worker('legacy-delivery')]},{spawnImpl:fakeSpawn,wait:async()=>{},now:()=>++n,onSnapshot:async s=>snapshots.push(s)});
 assert.equal(calls.length,10);assert.ok(result.every(s=>s.state==='review_required'));
 assert.ok(calls.every(c=>c.exe===process.execPath&&c.opts.shell===false&&c.opts.stdio.join(',')==='ignore,ignore,ignore,ipc'&&c.opts.windowsHide));
 assert.ok(snapshots.every(s=>s.allClockReceptionVerified===false&&s.operationWhileLoggedOutVerified===false));
 assert.doesNotMatch(JSON.stringify(snapshots),/configFile|password|recordsBase64/);
});
test('one rejected worker does not stop its healthy sibling; explicit shutdown terminates the sibling',async()=>{
 const controller=new AbortController(),children=[];let siblingRunning=false;
 const result=await supervise({workers:[worker('fleet-capture'),worker('legacy-delivery')]},{signal:controller.signal,spawnImpl:(_e,args)=>{const c=fakeProcess();children.push(c);if(args[2]==='fleet-capture')setTimeout(()=>c.emit('exit',2),0);else siblingRunning=true;return c;},onSnapshot:async s=>{if(s.workers.some(w=>w.state==='review_required')&&s.workers.some(w=>w.state==='running'))controller.abort();}});
 assert.equal(siblingRunning,true);assert.equal(result.find(r=>r.kind==='fleet-capture').state,'review_required');assert.equal(result.find(r=>r.kind==='legacy-delivery').state,'stopped');assert.deepEqual(children[1].messages,[{command:'stop'}]);assert.deepEqual(children[1].kills,[]);
});
test('a signal already aborted starts no worker',async()=>{const c=new AbortController();c.abort();let spawned=0;await supervise({workers:[worker('fleet-capture')]},{signal:c.signal,spawnImpl:()=>spawned++});assert.equal(spawned,0);});
test('stop during initial snapshot does not start an unnecessary worker',async()=>{
 const c=new AbortController();let spawned=0;await supervise({workers:[worker('fleet-capture')]},{signal:c.signal,spawnImpl:()=>spawned++,onSnapshot:async()=>c.abort()});assert.equal(spawned,0);
});
test('early stop waits for the child IPC handshake and its actual exit',async()=>{
 const c=new AbortController(),child=new EventEmitter();child.pid=222;child.connected=true;const messages=[];
 child.send=message=>messages.push(message);let completed=false;
 const done=supervise({workers:[worker('fleet-capture')]},{signal:c.signal,spawnImpl:()=>{c.abort();return child;}}).then(()=>{completed=true;});
 await new Promise(r=>setImmediate(r));assert.deepEqual(messages,[]);assert.equal(completed,false);
 child.emit('message',{type:'worker-ready'});assert.deepEqual(messages,[{command:'stop'}]);
 await new Promise(r=>setImmediate(r));assert.equal(completed,false);child.emit('exit',0);await done;
});
test('failed status persistence stops siblings and waits for their ownership cleanup',async()=>{
 let live;const pending=supervise({workers:[worker('fleet-capture'),worker('legacy-delivery')]},{spawnImpl:(_e,args)=>{
  const child=fakeProcess();if(args[2]==='fleet-capture')setTimeout(()=>child.emit('exit',2),0);else{live=child;child.send=message=>child.messages.push(message);}return child;
 },onSnapshot:async state=>{if(state.workers.some(w=>w.state==='review_required'))throw Error('SYNTHETIC_DISK_FULL');}});
 let settled=false;const observed=pending.then(()=>{settled=true;},error=>{settled=true;return error;});
 await new Promise(r=>setTimeout(r,20));assert.deepEqual(live.messages,[{command:'stop'}]);assert.equal(settled,false);
 live.emit('exit',0);assert.match((await observed).message,/SYNTHETIC_DISK_FULL/);assert.deepEqual(live.kills,[]);
});
test('capture IPC stop queued during initialization reaches the reader and removes listeners',async()=>{
 for(const signal of ['message','disconnect']){
  const proc=new EventEmitter();proc.connected=true;let stopped=0;
  await captureWorker(async()=>{proc.emit(signal,{command:'stop'});await Promise.resolve();await new Promise(resolve=>{
   proc.once('SIGTERM',()=>{stopped++;resolve();});
  });},'synthetic-config',{processLike:proc});
  assert.equal(stopped,1);for(const name of ['message','disconnect','newListener','SIGTERM'])assert.equal(proc.listenerCount(name),0);
 }
});
test('delivery IPC stop is retained during configuration loading and parent loss',async()=>{
 for(const message of [{command:'stop'},{type:'shutdown'}]){
  const proc=new EventEmitter();proc.connected=true;
  await deliveryWorker(async()=>{proc.emit('message',message);return {};},async(_c,{signal})=>assert.equal(signal.aborted,true),'synthetic-config',{processLike:proc});
  for(const name of ['message','disconnect','SIGTERM','SIGINT'])assert.equal(proc.listenerCount(name),0);
 }
 const disconnecting=new EventEmitter();disconnecting.connected=true;
 await deliveryWorker(async()=>{disconnecting.emit('disconnect');return {};},async(_c,{signal})=>assert.equal(signal.aborted,true),'synthetic-config',{processLike:disconnecting});
 const lost=new EventEmitter();lost.connected=false;let ran=false;await captureWorker(()=>{ran=true;},'synthetic-config',{processLike:lost});assert.equal(ran,false);
});
test('missing or stopped desired state cannot be revived by a scheduled run',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gateway-stopped-qa-'));try{
  const file=path.join(dir,'gateway.json'),captureFile=path.join(dir,'capture.json'),stateDir=path.join(dir,'coordinator');
  await fs.writeFile(captureFile,JSON.stringify({schema:'municontrol-clock-fleet.v1',approved:true,stateDir:path.join(dir,'captures'),maxQueueMiB:64,minFreeMiB:64,clocks:[{clockId:'clock-a',label:'Synthetic A',host:'172.100.126.241',port:4370,serial:'SYNTHETIC-A',credentialFile:path.join(dir,'no-key'),pollSeconds:60,enabled:true}]}),{mode:0o600});
  await fs.writeFile(file,JSON.stringify({...config(),approvedHost:os.hostname(),stateDir,workers:[{kind:'fleet-capture',configFile:captureFile,enabled:true}]}),{mode:0o600});
  assert.equal(await desiredState(stateDir),'stopped');await main(['run','--config',file]);await assert.rejects(fs.stat(stateDir),{code:'ENOENT'});
  await main(['start','--config',file]);assert.equal(await desiredState(stateDir),'running');await assert.rejects(fs.stat(path.join(stateDir,'process.lock')),{code:'ENOENT'});
  // A broken worker configuration must not prevent a durable stop command.
  await fs.rm(captureFile);await main(['stop','--config',file]);assert.equal(await desiredState(stateDir),'stopped');
  await assert.rejects(main(['start','--config',file]));assert.equal(await desiredState(stateDir),'stopped');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('desired stop or corrupted control aborts setup monitoring without clearing evidence',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gateway-monitor-qa-'));try{
  await setDesiredState(dir,'running');const c=new AbortController();await monitorDesiredState(dir,c,{wait:async()=>setDesiredState(dir,'stopped')});assert.equal(c.signal.aborted,true);
  await setDesiredState(dir,'running');const broken=new AbortController(),file=path.join(dir,'desired.json');
  await assert.rejects(monitorDesiredState(dir,broken,{wait:async()=>fs.writeFile(file,'{interrupted')}));assert.equal(broken.signal.aborted,true);assert.equal(await fs.readFile(file,'utf8'),'{interrupted');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('real Node IPC shutdown waits for synthetic worker cleanup on this operating system',{timeout:5000},async()=>{
 // This child has no imports, files, clock configuration or network APIs.
 const source="process.on('message',m=>{if(m.command==='stop'){process.send({type:'stopping'});setTimeout(()=>{process.send({type:'cleanup-complete'},()=>process.disconnect());},80);}});process.send({type:'worker-ready'});";
 const controller=new AbortController(),events=[];let child,stoppedAt;
 try{
  const result=await supervise({workers:[worker('fleet-capture')]},{signal:controller.signal,spawnImpl:(exe,_args,options)=>{
   child=spawn(exe,['-e',source],options);child.on('message',m=>{events.push(m.type);if(m.type==='worker-ready'){stoppedAt=Date.now();controller.abort();}});return child;
  }});
  assert.deepEqual(events,['worker-ready','stopping','cleanup-complete']);assert.ok(Date.now()-stoppedAt>=70);
  assert.equal(child.exitCode,0);assert.equal(child.signalCode,null);assert.equal(result[0].state,'stopped');
 }finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
});
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
test('fleet delivery preflight matches the capture queue without reading token bytes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gateway-delivery-qa-'));try{
  const captureFile=path.join(dir,'capture.json'),senderFile=path.join(dir,'sender.json'),stateDir=path.join(dir,'fleet');
  const capture={schema:'municontrol-clock-fleet.v1',approved:true,stateDir,maxQueueMiB:64,minFreeMiB:64,clocks:[{clockId:'clock-a',label:'Synthetic A',host:'172.100.126.241',port:4370,serial:'SYNTHETIC-A',credentialFile:path.join(dir,'never-read.key'),pollSeconds:60,enabled:true}]};
  const sender={schema:'clock-fleet-delivery-config.v1',approved:true,stateDir,pollSeconds:60,clocks:[{clockId:'clock-a',serial:'SYNTHETIC-A',tokenFile:path.join(dir,'never-read.token'),connectorKey:'synthetic-connector-a',enabled:true}]};
  await fs.writeFile(captureFile,JSON.stringify(capture),{mode:0o600});await fs.writeFile(senderFile,JSON.stringify(sender),{mode:0o600});
  const cfg={...config(),stateDir:path.join(dir,'coordinator'),workers:[{kind:'fleet-capture',configFile:captureFile,enabled:true},{kind:'fleet-delivery',configFile:senderFile,enabled:true}]};
  const report=await inspectGateway(cfg);assert.equal(report.allSendersConfigured,true);assert.equal(report.deliveryIdentities,1);assert.equal(report.networkTested,false);
  await assert.rejects(fs.stat(sender.clocks[0].tokenFile),{code:'ENOENT'});
  sender.clocks[0].clockId='clock-b';await fs.writeFile(senderFile,JSON.stringify(sender));await assert.rejects(inspectGateway(cfg),{code:'GATEWAY_DELIVERY_WITHOUT_CAPTURE'});
  await assert.rejects(inspectGateway({...cfg,stateDir:path.join(stateDir,'coordinator')}),{code:'GATEWAY_STATE_OVERLAP'});
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Windows deployment defaults to disabled and local-service identity rather than personal login',async()=>{
 const source=await fs.readFile(new URL('../../clock-fleet/install-machine-windows.ps1',import.meta.url),'utf8');
 assert.match(source,/#Requires -RunAsAdministrator/);assert.match(source,/LogonType ServiceAccount -RunLevel Limited/);assert.match(source,/New-ScheduledTaskTrigger -AtStartup/);assert.match(source,/Settings.Enabled=\[bool\]\$Activate/);assert.match(source,/GATEWAY_STOP_PREVIOUS_COLLECTORS_FIRST/);assert.match(source,/GATEWAY_RUNTIME_SIGNATURE_INVALID/);assert.match(source,/GATEWAY_STATE_MUST_BE_ISOLATED/);
 assert.doesNotMatch(source,/-Password|LogonType Interactive|Set-NetRoute|New-NetFirewallRule|Start-ScheduledTask/);
 assert.match(source,/if\(\$clock.tokenFile\)/);assert.match(source,/GATEWAY_SECRET_IN_WRITABLE_STATE/);assert.match(source,/sourceDirty -ne \$false/);
});
test('Linux installer verifies protected staging and leaves services and all queues disabled or unchanged',async()=>{
 const source=await fs.readFile(new URL('../../clock-fleet/install-machine-linux.sh',import.meta.url),'utf8');
 for(const text of ['GATEWAY_SERVICE_ACCOUNT_REQUIRED','GATEWAY_SERVICE_EXISTS_REVIEW_REQUIRED','GATEWAY_STOP_PREVIOUS_COLLECTORS_FIRST','GATEWAY_RELEASE_NOT_CLEAN','-perm /022','s.mode&0o077','runuser -u','GATEWAY_SERVICE_NOT_DISABLED'])assert.ok(source.includes(text),text);
 assert.doesNotMatch(source,/systemctl\s+(?:enable|start)|\b(?:useradd|chmod|chown|rm|cp)\s/);
 assert.ok(source.indexOf('systemd-analyze verify')<source.indexOf('install -o root'));
});
test('Linux deployment isolates state and credentials and does not enable itself',async()=>{
 const source=await fs.readFile(new URL('../../clock-fleet/municontrol-clock-gateway.service',import.meta.url),'utf8');for(const text of ['User=municontrol-clock','NoNewPrivileges=true','ProtectSystem=strict','UMask=0077','RestartPreventExitStatus=2','KillMode=mixed','AF_NETLINK','ReadWritePaths=/var/lib/municontrol/clock-gateway'])assert.ok(source.includes(text));assert.doesNotMatch(source,/User=root|ExecStart=.*sh -c/);
});
