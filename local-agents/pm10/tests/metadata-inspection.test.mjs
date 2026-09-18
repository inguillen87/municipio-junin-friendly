import test from 'node:test';import assert from 'node:assert/strict';
import {readDeviceMetadata,makePacket} from '../reader/lector-fichadas.mjs';import {withClock} from './fixture.mjs';
test('known key 0 reads serial/model/firmware only and exits without attendance or biometric commands',async()=>{
 await withClock({serial:'QA-SIX-CLOCK',commKey:'0',model:'QA-K20',firmware:'QA 1.0'},async(port,commands)=>{
  const key=Buffer.from('0'),out=await readDeviceMetadata({approved:true,host:'127.0.0.1',port,serial:'QA-SIX-CLOCK'},{approved:true,commKey:key,pacingMs:0});
  assert.equal(out.report.authenticationAccepted,true);assert.equal(out.report.metadata.model,'QA-K20');assert.equal(out.report.metadata.firmwareVersion,'QA 1.0');assert.equal(out.report.cleanup.exitConfirmed,true);assert.equal(out.raw,null);assert.equal(out.report.attendanceTransferComplete,false);assert.ok(key.every(b=>b===0));
  assert.deepEqual(commands.map(x=>x.code),[1000,1102,11,1100,11,1001]);
 });
});
test('a serial mismatch stops inspection before firmware/model reads',async()=>{
 await withClock({serial:'QA-OTHER',commKey:'0'},async(port,commands)=>{const out=await readDeviceMetadata({approved:true,host:'127.0.0.1',port,serial:'QA-EXPECTED'},{approved:true,commKey:Buffer.from('0'),pacingMs:0});assert.equal(out.report.error.code,'SERIAL_MISMATCH');assert.equal(commands.some(x=>x.code===1100),false);});
});
test('metadata option whitelist still excludes writes, restart, users and templates',()=>{for(const cmd of [1002,1003,1004,5,8,18,103,1103])assert.throws(()=>makePacket(cmd,0,0));for(const key of ['~CommKey\0','~IP\0','~DeviceName=x\0'])assert.throws(()=>makePacket(11,0,0,Buffer.from(key)));});
test('firmware outside the metadata bound remains unresolved',async()=>{
 await withClock({serial:'QA-META',commKey:'0',firmware:'x'.repeat(121)},async port=>{const out=await readDeviceMetadata({approved:true,host:'127.0.0.1',port,serial:'QA-META'},{approved:true,commKey:Buffer.from('0'),pacingMs:0});assert.equal(out.report.error.code,'METADATA_UNRESOLVED');assert.equal(out.report.metadataReadComplete,undefined);});
});
