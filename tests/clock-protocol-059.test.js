// SPDX-License-Identifier: GPL-2.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {collect,CHUNK_BYTES} from '../services/pm10-collector/lector-fichadas.mjs';
import {withClock,fakeKey} from './fixtures/collector-059/fixture.mjs';
const run=(port,extra={})=>collect({host:'127.0.0.1',port,commKey:fakeKey(),approved:true,pacingMs:0,timeoutMs:500,totalMs:5000,...extra});

test('regresion sintetica: 444364 bytes/11109 registros con DATA session=0 reply=0',()=>withClock({},async(port,cmds,raw)=>{
 const r=await run(port);assert.equal(r.report.status,'ATTENDANCE_DOWNLOADED_FOR_REVIEW');
 assert.deepEqual(r.raw,raw);assert.equal(r.report.transfer.receivedBytes,444364);
 assert.equal(r.report.transfer.completedChunks,Math.ceil(444364/CHUNK_BYTES));
 assert.equal(r.parsed.recordCount,11109);assert.ok(r.report.transfer.neutralSessionDataFrames>0);
 assert.equal(r.report.cleanup.bufferReleaseConfirmed,true);assert.equal(r.report.cleanup.exitConfirmed,true);
 assert.ok(cmds.slice(1).every(c=>c.session===12345));
 assert.equal(cmds.filter(c=>c.code===1102).length,1);
 for(let i=1;i<cmds.length;i++)assert.equal(cmds[i].reply,(cmds[i-1].reply+1)%65535);
}));
test('DATA neutra con reply anterior al comando sigue rechazada',()=>withClock({count:2,dataReply:5},async port=>{
 // First READ_ATTENDANCE_CHUNK uses reply 6; reply 5 is stale.
 const r=await run(port);assert.equal(r.report.error?.code,'REPLY_MISMATCH');
}));
test('fragmentacion TCP y envelopes coalescidos con session neutra',()=>withClock({fragment:true},async(port,cmds,raw)=>{
 const r=await run(port);assert.deepEqual(r.raw,raw);assert.equal(r.parsed.recordCount,11109);
}));
test('session activa y secuencia incremental conservan ACK final',()=>withClock({count:1200,dataSid:12345,increment:true},async port=>{
 const r=await run(port);assert.equal(r.report.status,'ATTENDANCE_DOWNLOADED_FOR_REVIEW');assert.equal(r.report.transfer.neutralSessionDataFrames,0);
}));
test('DATA con session no neutra ajena falla y registra valores',()=>withClock({count:4,dataSid:321},async(port,cmds)=>{
 const r=await run(port);assert.equal(r.report.error.code,'SESSION_MISMATCH');assert.equal(r.report.error.details.expectedSessionId,12345);
 assert.equal(r.report.error.details.receivedSessionId,321);assert.equal(r.report.error.details.phase,'CHUNK_DATA');
 assert.equal(r.report.error.details.responseCode,1501);assert.ok(r.report.diagnostics.headerTrace.some(h=>h.sessionId===321));
 assert.ok(!cmds.some(c=>c.code===1502||c.code===1001));assert.equal(r.report.cleanup.skippedReason,'STREAM_UNSYNCHRONIZED_OR_CLOSED');
}));
test('metadato de sesion distinta sigue bloqueado',()=>withClock({count:4,wrongControl:11},async(port,cmds)=>{
 const r=await run(port);assert.equal(r.report.error.code,'SESSION_MISMATCH');assert.equal(r.report.error.details.phase,'SERIAL_READ');
 assert.ok(!cmds.some(c=>c.code===1503||c.code===1502||c.code===1001));
}));
test('ACK terminal sesion 0 NO se tolera por pertenecer a control',()=>withClock({count:4,ackSid:0},async(port,cmds,raw)=>{
 const r=await run(port);assert.equal(r.report.error.code,'SESSION_MISMATCH');assert.equal(r.report.error.details.phase,'CHUNK_FINAL_ACK');
 assert.equal(r.report.attendanceTransferComplete,false);assert.deepEqual(r.raw,raw);assert.equal(r.report.transfer.confirmedChunkBytes,0);
 assert.ok(!cmds.some(c=>c.code===1502||c.code===1001));
}));
test('no confunde un ACK tardio con respuesta de FREE o EXIT',()=>withClock({count:4,dataSid:7654},async(port,cmds)=>{
 const r=await run(port);assert.equal(r.report.cleanup.exitConfirmed,false);assert.equal(r.report.cleanup.bufferReleaseConfirmed,false);
 assert.ok(!cmds.some(c=>[1502,1001].includes(c.code)));
}));
test('checksum incorrecto continua siendo rechazo estricto con diagnostico',()=>withClock({count:4,badChecksum:true},async(port,cmds)=>{
 const r=await run(port);assert.equal(r.report.error.code,'CHECKSUM_MISMATCH');
 assert.ok(r.report.diagnostics.headerTrace.some(f=>f.checksumValidated===false));
 assert.ok(!cmds.some(c=>c.code===1502||c.code===1001));
}));
test('conserva bytes parciales sin declarar completa si falta ACK',()=>withClock({count:4,omitAck:true},async(port,cmds,raw)=>{
 const r=await run(port,{timeoutMs:70});assert.equal(r.report.error.code,'RESPONSE_TIMEOUT');
 assert.deepEqual(r.raw,raw);assert.equal(r.report.transfer.receivedBytes,raw.length);
 assert.equal(r.report.transfer.confirmedChunkBytes,0);assert.equal(r.report.attendanceTransferComplete,false);
 assert.equal(r.report.transfer.completedChunks,0);assert.ok(!cmds.some(c=>[1502,1001].includes(c.code)));
}));
test('conserva bloque confirmado ante timeout del siguiente bloque',()=>withClock({count:900,stallSecond:true},async(port,cmds)=>{
 const r=await run(port,{timeoutMs:70});assert.equal(r.report.error.code,'RESPONSE_TIMEOUT');assert.equal(r.report.transfer.receivedBytes,CHUNK_BYTES);
 assert.equal(r.report.transfer.completedChunks,1);assert.equal(r.raw.length,CHUNK_BYTES);assert.equal(cmds.filter(c=>c.code===1504).length,2);
}));
test('un opcode que no es DATA no entra como datos',()=>withClock({count:4,dataCode:500},async port=>{
 const r=await run(port);assert.equal(r.report.error.code,'DATA_OUT_OF_CONTEXT');assert.equal(r.report.attendanceTransferComplete,false);
}));
test('ACK terminal con payload no se acepta',()=>withClock({count:4,ackBody:Buffer.from([1])},async port=>{
 const r=await run(port);assert.equal(r.report.error.code,'CHUNK_ACK_MISSING');assert.equal(r.report.attendanceTransferComplete,false);
}));
test('ACK terminal con reply ajeno no se acepta',()=>withClock({count:4,ackReply:4321},async port=>{
 const r=await run(port);assert.equal(r.report.error.code,'REPLY_MISMATCH');assert.equal(r.report.error.details.receivedReplyId,4321);
}));
test('DATA neutra con reply inesperado se rechaza',()=>withClock({count:4,dataReply:4567},async port=>{
 const r=await run(port);assert.equal(r.report.error.code,'REPLY_MISMATCH');assert.equal(r.report.error.details.receivedSessionId,0);
}));
test('DATA inmediata neutral mantiene control para FREE, contador y EXIT',()=>withClock({count:4,immediate:true},async(port,cmds,raw)=>{
 const r=await run(port);assert.deepEqual(r.raw,raw);assert.equal(r.report.cleanup.exitConfirmed,true);assert.ok(cmds.slice(1).every(c=>c.session===12345));
}));
test('una cabecera PREPARE ajena no se acepta',()=>withClock({count:4,wrongControl:1503},async(port,cmds)=>{
 const r=await run(port);assert.equal(r.report.error.code,'SESSION_MISMATCH');assert.ok(!cmds.some(c=>c.code===1504));
}));
test('buffer local de clave se limpia incluso con mismatch en DATA',()=>withClock({count:4,dataSid:555},async port=>{
 const key=fakeKey();await run(port,{commKey:key});assert.ok(key.every(v=>v===0));
}));
test('clave sintetica no aparece en reportes ni headers',()=>withClock({count:4},async port=>{
 const r=await run(port);assert.ok(!JSON.stringify(r.report).includes('876543'));assert.ok(!JSON.stringify(r.report.diagnostics).includes('authPayload'));
}));
test('informe incluye diferencia bytes TCP vs payload de fichadas',()=>withClock({count:4,dataSid:555},async port=>{
 const r=await run(port);assert.equal(r.report.transfer.receivedBytes,0);assert.ok(r.report.diagnostics.wireBytesReceived>0);
}));
test('todos los comandos siguen limitados al piloto ATTLOG',()=>withClock({count:30},async(port,cmds)=>{
 await run(port);assert.ok(cmds.every(c=>[1000,1102,11,50,201,1503,1504,1502,1001].includes(c.code)));
}));
test('cancelacion previa no conecta y limpia clave',async()=>{
 const c=new AbortController();c.abort();const key=fakeKey();
 const r=await run(65534,{commKey:key,signal:c.signal});assert.equal(r.report.error.code,'CANCELLED');assert.equal(r.report.tcpConnected,false);assert.ok(key.every(v=>v===0));
});
test('entrada/identificador de version presentes en paquete',async()=>{
 const code=await readFile(new URL('../services/pm10-collector/lector-fichadas.mjs',import.meta.url),'utf8');assert.match(code,/4\.1\.0/);assert.match(code,/neutralSessionDataFrames/);
});

test('DATA neutra con reply igual al READ se admite',()=>withClock({count:4,dataReply:6},async(port,cmds)=>{
 const r=await run(port);assert.equal(r.report.status,'ATTENDANCE_DOWNLOADED_FOR_REVIEW');
 assert.ok(cmds.slice(1).every(c=>c.session===12345));assert.equal(r.report.cleanup.exitConfirmed,true);
}));
