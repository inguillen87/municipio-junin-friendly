// SPDX-License-Identifier: GPL-2.0-only
// Synthetic private files only. No municipal config, device or HTTP request.
import test from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';import os from 'node:os';import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readGatewayOverview} from '../../clock-fleet/gateway-config.mjs';
import {main} from '../../clock-fleet/gateway.mjs';
import {CaptureStore,hash} from '../store.mjs';
import {DeliveryStore,partPayload} from '../delivery.mjs';
import {SourceDeliveryStore} from '../../clock-fleet/source-delivery.mjs';
import {fleetPartPayload,FleetDeliveryStore} from '../../clock-fleet/delivery.mjs';
import {TARGET,PORT,SERIAL} from '../reader/lector-fichadas.mjs';
const at='2026-09-21T12:00:00.000Z',ackAt='2026-09-21T12:10:00.123Z',now=()=>new Date('2026-09-23T12:00:00.000Z'),tenantId='11111111-1111-4111-8111-111111111111';
const write=async(file,v)=>{await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,JSON.stringify(v),{mode:0o600});};
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'gateway-overview-'));try{
  const fleetRoot=path.join(root,'fleet'),legacyRoot=path.join(root,'old-clock'),coordinator=path.join(root,'coordinator');
  const clocks=Array.from({length:5},(_,i)=>({clockId:'clock-'+i,label:'Equipo de prueba '+i,host:'172.100.126.'+(200+i),port:4370,serial:'SYNTHETIC-'+i,credentialFile:path.join(root,'NEVER_READ_KEY_'+i),pollSeconds:900,enabled:true}));
  const senders=clocks.map((c,i)=>({clockId:c.clockId,serial:c.serial,connectorKey:'synthetic-connector-'+i,tokenFile:path.join(root,'NEVER_READ_TOKEN_'+i),enabled:true}));
  const files={fleet:path.join(root,'fleet.json'),source:path.join(root,'source.json'),old:path.join(root,'old.json'),sender:path.join(root,'sender.json'),gateway:path.join(root,'gateway.json')};
  await write(files.fleet,{schema:'municontrol-clock-fleet.v1',approved:true,stateDir:fleetRoot,maxQueueMiB:64,minFreeMiB:64,clocks});
  await write(files.source,{schema:'clock-fleet-source-config.v1',approved:true,enabled:true,stateDir:fleetRoot,tenantId,windowSeconds:900,clocks:senders});
  await write(files.old,{schema:'pm10-capture-agent.v1',mode:'capture_only',approved:true,host:TARGET,port:PORT,serial:SERIAL,stateDir:legacyRoot,credentialFile:path.join(root,'NEVER_READ_OLD_KEY'),pollSeconds:900,maxQueueMiB:64,minFreeMiB:64});
  await write(files.sender,{schema:'pm10-delivery-config.v1',approved:true,stateDir:legacyRoot,tokenFile:path.join(root,'NEVER_READ_OLD_TOKEN'),connectorKey:'synthetic-old-connector',pollSeconds:900});
  const config={schema:'municipal-clock-gateway.v1',approved:true,approvedHost:os.hostname(),stateDir:coordinator,workers:[{kind:'fleet-capture',configFile:files.fleet,enabled:true},{kind:'fleet-source-delivery',configFile:files.source,enabled:true},{kind:'legacy-capture',configFile:files.old,enabled:true},{kind:'legacy-delivery',configFile:files.sender,enabled:true}]};
  await write(files.gateway,config);const prepared=[];
  for(let i=0;i<6;i++){
   const legacy=i===5,c=legacy?{clockId:null,serial:SERIAL}:clocks[i],dir=legacy?legacyRoot:path.join(fleetRoot,c.clockId);
   const raw=Buffer.alloc(4+3*40);raw.writeUInt32LE(120);for(let j=0;j<3;j++)raw.writeUInt16LE(j+1,4+j*40);
   const store=await new CaptureStore(dir,{identity:legacy?null:{clockId:c.clockId,serial:c.serial},freeBytes:async()=>1e10}).init();const saved=await store.save(raw,{capturedAt:at});
   if(!legacy)await write(path.join(dir,'identity.json'),{schema:'clock-fleet-identity.v1',clockId:c.clockId,serial:c.serial});
   const manifest=await read(path.join(dir,'pending',saved.batchId,'manifest.json')),bytes=await fs.readFile(path.join(dir,'pending',saved.batchId,'records.bin'));
   const capture={...(legacy?{schema:'pm10-local-status.v1',mode:'capture_only',version:'0.1.3',cloudReception:'not_connected',cloudConfirmedRecords:0}:{schema:'clock-fleet-status.v1',clockId:c.clockId,serial:c.serial,cloudReception:'not_configured'}),status:'captured_locally',blocked:false,failureCount:0,lastError:null,lastAttemptAt:at,lastCaptureAt:at,lastCaptureSha256:saved.snapshotSha256,snapshotRecordCount:3,nextPollAt:'2026-09-21T12:15:00.000Z',uniqueLocalRecords:3};
   await write(path.join(dir,'status.json'),capture);
   const sender=legacy?await new DeliveryStore(dir).init():await new SourceDeliveryStore(dir,{clockId:c.clockId,serial:c.serial,connectorKey:senders[i].connectorKey,tenantId}).init();
   const payload=legacy?partPayload(manifest,bytes,0):fleetPartPayload(manifest,bytes,0);
   const receipt={version:legacy?'pm10-receipt.v1':'clock-source-receipt.v1',receiptId:'22222222-2222-4222-8222-'+String(i).padStart(12,'0'),batchId:payload.batchId,partStart:0,partSha256:payload.partSha256,snapshotSha256:payload.snapshotSha256,count:3,receivedAt:ackAt,persisted:true,payrollModified:false,replayed:false,...(legacy?{newCanonical:3,observed:0,duplicates:0}:{tenantId,serial:c.serial,recordsSha256:payload.recordsSha256,scope:'source_only'})};
   await sender.confirm(payload,receipt);
   const status=legacy?{version:'pm10-sender-status.v1',state:'queue_confirmed',updatedAt:ackAt,sent:1,confirmedRecords:3,remainingParts:0,lastReceiptAt:ackAt,captureFilesRemoved:false,physicalClockVerified:false}:{version:'clock-source-sender-status.v1',clockId:c.clockId,state:'source_stored',updatedAt:ackAt,failures:0,code:null,sent:1,sourceStoredRecords:3,remainingParts:0,lastReceiptAt:ackAt,lastReconciledAt:ackAt,scope:'source_only',payrollModified:false,captureFilesRemoved:false,physicalClockVerified:false};
   await write(path.join(sender.root,'status.json'),status);prepared.push({c,dir,capture,sender,payload,receipt,status});
  }
  await fn({root,config,files,clocks,senders,prepared});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
async function fingerprint(root){const rows=[];async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else rows.push([path.relative(root,p),hash(await fs.readFile(p))]);}}await walk(root);return createHash('sha256').update(JSON.stringify(rows.sort())).digest('hex');}
test('six identities including Edificio Viejo share one collection; old capture and ACK remain distinct',()=>fixture(async({config})=>{
 const v=await readGatewayOverview(config,{now,desiredState:'running'});assert.equal(v.schema,'municipal-clock-overview.v1');assert.deepEqual(v.counts,{configured:6,captured:6,needsReview:0,withReceipt:6});
 const old=v.clocks.find(c=>c.clockId===null);assert.equal(old.label,'Edificio Viejo');assert.equal(old.capture.lastCaptureAt,at);assert.equal(old.delivery.lastReceiptAt,ackAt);assert.equal(old.delivery.scope,'canonical');assert.ok(v.clocks.slice(0,5).every(c=>c.delivery.scope==='source_only'));
 assert.equal(v.updatedAt,now().toISOString());assert.notEqual(old.capture.lastCaptureAt,v.updatedAt);assert.equal(v.networkTested,false);assert.equal(v.realWrites,0);
}));
test('read-only replay changes no files, reads no tokens, sends nothing and redacts routing/identities/unknown error text',()=>fixture(async({root,config,prepared})=>{
 const p=prepared[5];await write(path.join(p.dir,'status.json'),{...p.capture,blocked:true,status:'blocked',lastError:'PRIVATE_PERSON_NAME'});
 const before=await fingerprint(root),original=globalThis.fetch;globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};try{
  const a=await readGatewayOverview(config,{now}),b=await readGatewayOverview(config,{now});assert.deepEqual(a,b);assert.equal(before,await fingerprint(root));
  const text=JSON.stringify(a);for(const privateValue of [root,SERIAL,'SYNTHETIC-','synthetic-connector','172.100.','NEVER_READ','PRIVATE_PERSON_NAME','recordsBase64','records.bin'])assert.ok(!text.includes(privateValue),privateValue);
  assert.equal(a.clocks[5].capture.blocked,true);assert.equal(a.clocks[5].capture.lastError,'REVIEW_REQUIRED');assert.equal(a.counts.needsReview,1);
 }finally{globalThis.fetch=original;}
}));
test('a blocked PM10 sender retains its previously stored ACK without turning it into a fresh capture',()=>fixture(async({config,prepared})=>{
 const p=prepared[5];await write(path.join(p.sender.root,'status.json'),{version:'pm10-sender-status.v1',state:'blocked',updatedAt:'2026-09-22T12:00:00.000Z',code:'DELIVERY_AUTH_BLOCKED',failures:1,nextAttemptAt:null,physicalClockVerified:false});
 await write(path.join(p.dir,'status.json'),{...p.capture,status:'blocked',blocked:true,lastError:'TRANSFER_NOT_CONFIRMED'});
 const c=(await readGatewayOverview(config,{now})).clocks[5];assert.equal(c.delivery.state,'blocked');assert.equal(c.delivery.lastReceiptAt,ackAt);assert.equal(c.delivery.confirmedRecords,3);assert.equal(c.capture.lastCaptureAt,at);assert.equal(c.capture.blocked,true);assert.equal(c.capture.lastError,'TRANSFER_NOT_CONFIRMED');
}));
test('same-shaped receipt from another serial or tenant never becomes confirmation',()=>fixture(async({config,prepared})=>{
 const p=prepared[0],file=p.sender.receiptFile(p.payload),original=await read(file);
 for(const patch of [{serial:'ANOTHER-CLOCK'},{tenantId:'33333333-3333-4333-8333-333333333333'},{version:'zk40-receipt.v1'},{batchId:'f'.repeat(64)}]){
  await write(file,{...original,receipt:{...original.receipt,...patch}});const c=(await readGatewayOverview(config,{now})).clocks[0];assert.equal(c.delivery.evidenceState,'invalid');assert.equal(c.delivery.lastReceiptAt,null);assert.equal(c.capture.lastCaptureAt,at);
 }
}));
test('wrong queue identity and delivery enrollment fail closed without clearing evidence',()=>fixture(async({config,prepared,root})=>{
 const p=prepared[0],identityFile=path.join(p.dir,'identity.json');await write(identityFile,{schema:'clock-fleet-identity.v1',clockId:p.c.clockId,serial:'ANOTHER-CLOCK'});
 const before=await fingerprint(root),c=(await readGatewayOverview(config,{now})).clocks[0];assert.equal(c.evidenceState,'invalid');assert.equal(c.capture.lastCaptureAt,null);assert.equal(c.delivery.lastReceiptAt,null);assert.equal(before,await fingerprint(root));
}));
test('missing or malformed metadata is unknown, never zero or a successful connection',()=>fixture(async({config,prepared})=>{
 await fs.unlink(path.join(prepared[0].dir,'status.json'));await write(path.join(prepared[1].dir,'status.json'),{...prepared[1].capture,lastCaptureAt:'2026-02-30T12:00:00.000Z'});
 const v=await readGatewayOverview(config,{now});assert.equal(v.clocks[0].capture.evidenceState,'missing');assert.equal(v.clocks[0].capture.records,null);assert.equal(v.clocks[0].delivery.confirmedRecords,3);assert.equal(v.clocks[1].capture.evidenceState,'invalid');assert.equal(v.clocks[1].capture.lastCaptureAt,null);
}));
test('disabled workers stay visible and duplicates or an unapproved host cannot be hidden in overview',()=>fixture(async({config})=>{
 const disabled={...config,workers:config.workers.map(w=>({...w,enabled:false}))};const v=await readGatewayOverview(disabled,{now});assert.equal(v.clocks.length,6);assert.ok(v.clocks.every(c=>!c.enabled&&!c.delivery.enabled));
 await assert.rejects(readGatewayOverview({...config,approved:false}));await assert.rejects(readGatewayOverview({...config,approvedHost:'unapproved-other-host'}));await assert.rejects(readGatewayOverview({...config,workers:[...config.workers,config.workers[0]]}));
}));
test('changed connector cannot claim receipts from the previous configured enrollment',()=>fixture(async({config,files})=>{
 const source=await read(files.source);source.clocks[0].connectorKey='changed-connector';await write(files.source,source);const c=(await readGatewayOverview(config,{now})).clocks[0];assert.equal(c.delivery.evidenceState,'invalid');assert.equal(c.delivery.confirmedRecords,null);
}));
test('summary counts unsupported by stored receipts are rejected',()=>fixture(async({config,prepared})=>{
 const p=prepared[0];await write(path.join(p.sender.root,'status.json'),{...p.status,sourceStoredRecords:99});const c=(await readGatewayOverview(config,{now})).clocks[0];assert.equal(c.delivery.evidenceState,'invalid');assert.equal(c.delivery.lastReceiptAt,null);
}));
test('JSON CLI snapshot has no start, lock, control file, queue or network side effect',()=>fixture(async({root,files})=>{
 const before=await fingerprint(root),log=console.log,lines=[];console.log=v=>lines.push(v);try{const v=await main(['snapshot','--config',files.gateway]);assert.equal(v.desiredState,'stopped');assert.equal(JSON.parse(lines[0]).counts.configured,6);}finally{console.log=log;}
 assert.equal(await fingerprint(root),before);await assert.rejects(fs.stat(path.join(root,'coordinator')),{code:'ENOENT'});
}));

test('fleet canonical receipts retain their own scope and cannot consume source ACKs',()=>fixture(async({config,files,prepared,senders})=>{
 const source=await read(files.source);await write(files.source,{schema:'clock-fleet-delivery-config.v1',approved:true,stateDir:source.stateDir,pollSeconds:900,clocks:senders});
 const canonical={...config,workers:config.workers.map(w=>w.kind==='fleet-source-delivery'?{...w,kind:'fleet-delivery'}:w)};
 const p=prepared[0],store=await new FleetDeliveryStore(p.dir,{clockId:p.c.clockId,serial:p.c.serial,connectorKey:senders[0].connectorKey}).init();
 const {tenantId:unusedTenant,recordsSha256:unusedRecords,scope:unusedScope,...shared}=p.receipt;
 await store.confirm(p.payload,{...shared,version:'zk40-receipt.v1',newCanonical:3,observed:0,duplicates:0});
 const {sourceStoredRecords:unusedCount,scope:unusedScopeStatus,payrollModified:unusedPayroll,...status}=p.status;
 await write(path.join(store.root,'status.json'),{...status,version:'zk40-sender-status.v1',state:'queue_confirmed',confirmedRecords:3,nextAttemptAt:null});
 const v=await readGatewayOverview(canonical,{now});assert.equal(v.clocks[0].delivery.scope,'canonical');assert.equal(v.clocks[0].delivery.confirmedRecords,3);assert.equal(v.clocks[1].delivery.evidenceState,'missing');assert.equal(v.clocks[1].delivery.lastReceiptAt,null);
}));

test('uncommitted atomic receipt files do not become ACKs or erase committed evidence',()=>fixture(async({config,prepared})=>{
 const p=prepared[0];await fs.writeFile(p.sender.receiptFile(p.payload)+'.tmp-11111111-1111-4111-8111-111111111111','unfinished',{mode:0o600});
 const c=(await readGatewayOverview(config,{now})).clocks[0];assert.equal(c.delivery.evidenceState,'verified');assert.equal(c.delivery.confirmedRecords,3);
}));

test('oversized metadata and unexpected source retry fields never flow to sanitized JSON',()=>fixture(async({config,prepared})=>{
 await write(path.join(prepared[0].dir,'status.json'),{...prepared[0].capture,padding:'x'.repeat(32768)});
 await write(path.join(prepared[1].sender.root,'status.json'),{...prepared[1].status,nextAttemptAt:'PRIVATE_PATH_OR_PERSON'});
 const v=await readGatewayOverview(config,{now});assert.equal(v.clocks[0].capture.evidenceState,'invalid');assert.equal(v.clocks[1].delivery.evidenceState,'invalid');assert.ok(!JSON.stringify(v).includes('PRIVATE_PATH_OR_PERSON'));
}));

test('receipt filename, manifest identity and impossible confirmed state are rejected',()=>fixture(async({config,prepared})=>{
 const p=prepared[0],file=p.sender.receiptFile(p.payload);await fs.rename(file,file.replace('-0.json','-1.json'));
 const second=prepared[1],mfile=path.join(second.dir,'pending',hash(second.c.clockId+':'+second.c.serial+':'+second.payload.snapshotSha256+':'+second.payload.recordsSha256),'manifest.json');await write(mfile,{...await read(mfile),serial:'ANOTHER-CLOCK'});
 await write(path.join(prepared[2].sender.root,'status.json'),{...prepared[2].status,remainingParts:1});
 const v=await readGatewayOverview(config,{now});for(const c of v.clocks.slice(0,3)){assert.equal(c.delivery.evidenceState,'invalid');assert.equal(c.delivery.confirmedRecords,null);}
}));

test('a junction to another queue is rejected, without reading or changing its status',()=>fixture(async({config,prepared,root})=>{
 const p=prepared[0],target=path.join(root,'other-queue');await fs.rename(p.dir,target);await fs.symlink(target,p.dir,process.platform==='win32'?'junction':'dir');
 const before=await fs.readFile(path.join(target,'status.json'),'utf8'),c=(await readGatewayOverview(config,{now})).clocks[0];
 assert.equal(c.capture.evidenceState,'invalid');assert.equal(c.delivery.evidenceState,'invalid');assert.equal(await fs.readFile(path.join(target,'status.json'),'utf8'),before);
}));

test('HTML CLI overview keeps all six cards and has the same read-only behavior',()=>fixture(async({root,files})=>{
 const before=await fingerprint(root),log=console.log,lines=[];console.log=v=>lines.push(v);try{await main(['overview','--config',files.gateway]);}finally{console.log=log;}
 assert.equal((lines[0].match(/class="clock-card"/g)||[]).length,6);assert.ok(lines[0].includes('Edificio Viejo'));assert.ok(!lines[0].includes(SERIAL));assert.equal(await fingerprint(root),before);await assert.rejects(fs.stat(path.join(root,'coordinator')),{code:'ENOENT'});
}));
