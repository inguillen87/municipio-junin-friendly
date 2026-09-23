// SPDX-License-Identifier: GPL-2.0-only
// Bounded local presentation fixtures only; no device, token, receiver or service.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {publishGatewayOverview,runGatewayOverviewPublisher,writeGatewayOverviewHtml,OVERVIEW_INTERVAL_MS} from '../../clock-fleet/gateway.mjs';
const at='2026-09-23T12:00:00.000Z';
const snapshot=(value=3,updatedAt=at)=>({schema:'municipal-clock-overview.v1',updatedAt,desiredState:'running',networkTested:false,realWrites:0,
 clocks:[{clockId:'synthetic-a',label:'Sede de prueba',enabled:true,evidenceState:'missing',capture:{state:'captured_locally',blocked:false,lastCaptureAt:at,records:value,evidenceState:'verified'},delivery:{evidenceState:'missing'}}]});
const readDesired=async()=> 'running';
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(fn){const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'gateway-publisher-')));try{await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}

test('publisher reads a fresh cut immediately and every 30 seconds without overlapping work',()=>fixture(async dir=>{
 const stateDir=path.join(dir,'coordinator'),source=path.join(dir,'synthetic-status.json');await fs.mkdir(stateDir,{mode:0o700});await fs.writeFile(source,JSON.stringify(snapshot()),{mode:0o600});
 const controller=new AbortController(),html=[],intervals=[],outcomes=[];let active=0,maxActive=0,reads=0;
 await runGatewayOverviewPublisher({stateDir},{signal:controller.signal,readDesired,readOverview:async()=>{active++;maxActive=Math.max(maxActive,active);reads++;await tick();const v=JSON.parse(await fs.readFile(source));active--;return v;},
  writeHtml:async(root,content)=>{active++;maxActive=Math.max(maxActive,active);await writeGatewayOverviewHtml(root,content);html.push(content);active--;},
  wait:async ms=>{assert.equal(active,0);intervals.push(ms);if(html.length===1)await fs.writeFile(source,JSON.stringify(snapshot(7,'2026-09-23T12:00:30.000Z')));else controller.abort();},onResult:r=>outcomes.push(r)});
 assert.equal(reads,2);assert.equal(maxActive,1);assert.deepEqual(intervals,[30000,30000]);assert.equal(OVERVIEW_INTERVAL_MS,30000);
 assert.match(html[0],/Registros locales únicos<\/dt><dd>3/);assert.match(html[1],/Registros locales únicos<\/dt><dd>7/);assert.notEqual(html[0],html[1]);
 assert.equal(await fs.readFile(path.join(stateDir,'estado.html'),'utf8'),html[1]);assert.deepEqual(await fs.readdir(stateDir),['estado.html']);assert.deepEqual(outcomes,[{state:'published'},{state:'published'}]);
}));

test('real overview reader writes only the presentation file, never credentials, controls or queues',()=>fixture(async dir=>{
 const stateDir=path.join(dir,'coordinator'),captureDir=path.join(dir,'capture'),configFile=path.join(dir,'fleet.json');await fs.mkdir(stateDir,{mode:0o700});await fs.mkdir(captureDir,{mode:0o700});
 const raw=JSON.stringify({schema:'municontrol-clock-fleet.v1',approved:true,stateDir:captureDir,maxQueueMiB:64,minFreeMiB:64,clocks:[{clockId:'clock-a',label:'Prueba',host:'172.100.126.241',port:4370,serial:'SYNTHETIC-A',credentialFile:path.join(dir,'NEVER_READ.key'),pollSeconds:900,enabled:true}]});
 await fs.writeFile(configFile,raw,{mode:0o600});
 const config={schema:'municipal-clock-gateway.v1',approved:true,approvedHost:os.hostname(),stateDir,workers:[{kind:'fleet-capture',configFile,enabled:true}]};
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
 try{assert.deepEqual(await publishGatewayOverview(config,{now:()=>new Date(at)}),{state:'published'});}finally{globalThis.fetch=original;}
 assert.deepEqual(await fs.readdir(stateDir),['estado.html']);assert.deepEqual(await fs.readdir(captureDir),[]);assert.equal(await fs.readFile(configFile,'utf8'),raw);
 await assert.rejects(fs.stat(path.join(dir,'NEVER_READ.key')),{code:'ENOENT'});assert.match(await fs.readFile(path.join(stateDir,'estado.html'),'utf8'),/Recepción no consultada/);
}));

test('failed metadata refresh replaces old figures with unavailable HTML and never renders the raw error',()=>fixture(async stateDir=>{
 await publishGatewayOverview({stateDir},{readDesired,readOverview:async()=>snapshot(987654321)});
 const result=await publishGatewayOverview({stateDir},{readDesired,readOverview:async()=>{throw Error('PRIVATE_TOKEN_AND_PERSON');},now:()=>new Date(at)});
 const html=await fs.readFile(path.join(stateDir,'estado.html'),'utf8');assert.deepEqual(result,{state:'unavailable'});assert.match(html,/Consulta local no disponible/);assert.match(html,/Intento de consulta/);
 assert.doesNotMatch(html,/987654321|PRIVATE_TOKEN_AND_PERSON|data-metric/);assert.ok(html.includes(at));
}));

test('bad desired-state metadata also fails closed without manufacturing a current operating state',()=>fixture(async stateDir=>{
 let reads=0;const result=await publishGatewayOverview({stateDir},{readDesired:async()=>{throw Error('PRIVATE_PATH');},readOverview:async()=>{reads++;return snapshot();},now:()=>new Date(at)});
 assert.equal(reads,0);assert.equal(result.state,'unavailable');assert.doesNotMatch(await fs.readFile(path.join(stateDir,'estado.html'),'utf8'),/PRIVATE_PATH|Habilitada/);
}));

test('write failure keeps the old cut, reports only a fixed code and retries without disturbing other work',()=>fixture(async stateDir=>{
 await fs.writeFile(path.join(stateDir,'estado.html'),'old dated cut',{mode:0o600});const controller=new AbortController(),results=[];let writes=0;
 await runGatewayOverviewPublisher({stateDir},{signal:controller.signal,readDesired,readOverview:async()=>snapshot(),writeHtml:async(dir,html)=>{writes++;if(writes===1)throw Error('PRIVATE_DISK_PATH');return writeGatewayOverviewHtml(dir,html);},
  wait:async()=>{if(writes===1)assert.equal(await fs.readFile(path.join(stateDir,'estado.html'),'utf8'),'old dated cut');else controller.abort();},onResult:r=>results.push(r)});
 assert.deepEqual(results,[{state:'write_failed',code:'GATEWAY_OVERVIEW_WRITE_FAILED'},{state:'published'}]);assert.doesNotMatch(JSON.stringify(results),/PRIVATE_DISK_PATH/);assert.match(await fs.readFile(path.join(stateDir,'estado.html'),'utf8'),/Central de relojes/);
}));

test('a signal already aborted performs no metadata read, write or wait',async()=>{
 const c=new AbortController();c.abort();let calls=0;const forbidden=async()=>{calls++;throw Error('UNEXPECTED');};
 await runGatewayOverviewPublisher({stateDir:'unused'},{signal:c.signal,readDesired:forbidden,readOverview:forbidden,writeHtml:forbidden,wait:forbidden});assert.equal(calls,0);
});

test('shutdown drains an in-flight read and does not publish its late result',async()=>{
 const c=new AbortController(),started=defer(),finish=defer();let done=false,writes=0;
 const job=runGatewayOverviewPublisher({stateDir:'unused'},{signal:c.signal,readDesired,readOverview:async()=>{started.resolve();await finish.promise;return snapshot();},writeHtml:async()=>writes++,wait:async()=>assert.fail('wait after abort')}).then(()=>{done=true;});
 await started.promise;c.abort();await tick();assert.equal(done,false);finish.resolve();await job;assert.equal(writes,0);
});

test('shutdown waits for an atomic publication already in flight before resolving',async()=>{
 const c=new AbortController(),started=defer(),finish=defer();let done=false,writes=0;
 const job=runGatewayOverviewPublisher({stateDir:'unused'},{signal:c.signal,readDesired,readOverview:async()=>snapshot(),writeHtml:async()=>{writes++;started.resolve();await finish.promise;},wait:async()=>assert.fail('wait after abort')}).then(()=>{done=true;});
 await started.promise;c.abort();await tick();assert.equal(done,false);finish.resolve();await job;assert.equal(writes,1);
});

test('shutdown cancels the actual 30-second timer promptly',async()=>{
 const c=new AbortController(),first=defer();let writes=0;
 const job=runGatewayOverviewPublisher({stateDir:'unused'},{signal:c.signal,readDesired,readOverview:async()=>snapshot(),writeHtml:async()=>{writes++;first.resolve();}});
 await first.promise;await tick();const begin=Date.now();c.abort();await job;assert.ok(Date.now()-begin<1000);assert.equal(writes,1);
});

test('presentation writer refuses a linked coordinator directory without touching its target',()=>fixture(async dir=>{
 const target=path.join(dir,'target'),link=path.join(dir,'link');await fs.mkdir(target,{mode:0o700});await fs.writeFile(path.join(target,'estado.html'),'unchanged',{mode:0o600});await fs.symlink(target,link,process.platform==='win32'?'junction':'dir');
 await assert.rejects(writeGatewayOverviewHtml(link,'new'),{code:'GATEWAY_OVERVIEW_PATH_UNSAFE'});assert.equal(await fs.readFile(path.join(target,'estado.html'),'utf8'),'unchanged');assert.deepEqual(await fs.readdir(target),['estado.html']);
}));

test('presentation writer refuses a linked destination without replacing it or touching its target',()=>fixture(async dir=>{
 const stateDir=path.join(dir,'coordinator'),target=path.join(dir,'target');await fs.mkdir(stateDir,{mode:0o700});await fs.mkdir(target,{mode:0o700});await fs.writeFile(path.join(target,'kept'),'unchanged');
 const dest=path.join(stateDir,'estado.html');await fs.symlink(target,dest,process.platform==='win32'?'junction':'dir');
 await assert.rejects(writeGatewayOverviewHtml(stateDir,'new'),{code:'GATEWAY_OVERVIEW_PATH_UNSAFE'});assert.equal((await fs.lstat(dest)).isSymbolicLink(),true);assert.equal(await fs.readFile(path.join(target,'kept'),'utf8'),'unchanged');assert.deepEqual(await fs.readdir(stateDir),['estado.html']);
}));

test('presentation writer rejects an unsafe or oversized destination before creating temporary files',()=>fixture(async stateDir=>{
 await assert.rejects(writeGatewayOverviewHtml(stateDir,'x'.repeat(1024*1024+1)),{code:'GATEWAY_OVERVIEW_HTML_INVALID'});assert.deepEqual(await fs.readdir(stateDir),[]);
 await fs.mkdir(path.join(stateDir,'estado.html'));await assert.rejects(writeGatewayOverviewHtml(stateDir,'new'),{code:'GATEWAY_OVERVIEW_PATH_UNSAFE'});assert.deepEqual(await fs.readdir(stateDir),['estado.html']);
}));

test('Linux presentation file remains private and rejects a publicly writable state directory',{skip:process.platform==='win32'},()=>fixture(async stateDir=>{
 await writeGatewayOverviewHtml(stateDir,'private');assert.equal((await fs.stat(path.join(stateDir,'estado.html'))).mode&0o077,0);
 await fs.chmod(stateDir,0o777);await assert.rejects(writeGatewayOverviewHtml(stateDir,'unsafe'),{code:'GATEWAY_OVERVIEW_PATH_UNSAFE'});assert.equal(await fs.readFile(path.join(stateDir,'estado.html'),'utf8'),'private');await fs.chmod(stateDir,0o700);
}));
