import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {validateFleetConfig,captureClock,seedFleetSummary} from '../../clock-fleet/runner.mjs';import {dataSet} from './fixture.mjs';
function config(root){return validateFleetConfig({schema:'municontrol-clock-fleet.v1',approved:true,stateDir:root,maxQueueMiB:64,minFreeMiB:64,clocks:['one','two'].map((id,n)=>({clockId:'qa-'+id,label:'PM-0'+(n+1)+' · QA',serial:'TEST-'+id,host:'172.100.126.'+(241+n),port:4370,credentialFile:path.join(root,id+'.key'),pollSeconds:60,enabled:true}))});}
const raw=dataSet(2),time='2026-09-18T10:00:00.000Z';
const io={now:()=>new Date(time),route:async()=>({localLookup:true}),credential:async()=>Buffer.from('0'),collect:async c=>({raw,parsed:{layout:'legacy-40-byte-candidate'},report:{authenticationAccepted:true,finishedAt:time,metadata:{serialNumber:c.serial},transfer:{plannedBytes:raw.length,receivedBytes:raw.length,confirmedChunkBytes:raw.length},attendanceTransferComplete:true,cleanup:{bufferReleaseConfirmed:true,exitConfirmed:true}}})};
test('a slow sibling retains its own capture evidence while another clock finishes',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fleet-seed-'));try{const c=config(root);for(const clock of c.clocks)await captureClock(c,clock,io);
 const before=await readFile(path.join(root,c.clocks[1].clockId,'status.json'),'utf8'),seed=await seedFleetSummary(c);
 assert.equal(seed.size,2);assert.equal(seed.get('qa-two').lastCaptureAt,time);assert.equal(seed.get('qa-two').uniqueLocalRecords,2);
 seed.set('qa-one',{clockId:'qa-one',status:'retry_wait'});assert.equal(seed.size,2);assert.equal(seed.get('qa-two').lastCaptureAt,time);
 assert.equal(await readFile(path.join(root,c.clocks[1].clockId,'status.json'),'utf8'),before);assert.equal(seed.get('qa-two').cloudReception,'not_configured');
 assert.ok(!JSON.stringify([...seed.values()]).includes('TEST-'));assert.ok(!JSON.stringify([...seed.values()]).includes('172.100'));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('missing state is waiting, disabled remains disabled, and corrupt evidence is not overwritten',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fleet-seed-'));try{const c=config(root);let seed=await seedFleetSummary(c);assert.equal(seed.size,2);assert.equal(seed.get('qa-one').status,'waiting');
 await captureClock(c,c.clocks[0],io);const file=path.join(root,c.clocks[0].clockId,'status.json');await writeFile(file,'{broken');
 const modified={...c,clocks:[c.clocks[0],{...c.clocks[1],enabled:false}]};seed=await seedFleetSummary(modified);
 assert.equal(seed.get('qa-one').status,'review_required');assert.equal(seed.get('qa-one').lastError,'FLEET_STATE_INVALID');assert.equal(seed.get('qa-two').status,'disabled');assert.equal(await readFile(file,'utf8'),'{broken');
 }finally{await rm(root,{recursive:true,force:true});}
});
