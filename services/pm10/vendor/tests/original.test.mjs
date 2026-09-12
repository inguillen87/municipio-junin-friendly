// SPDX-License-Identifier: GPL-2.0-only
// Synthetic fixtures only. No real municipality credentials or DNI.
import test from 'node:test';import assert from 'node:assert/strict';import net from 'node:net';
import {collect,makePacket,decodeAttendance,SERIAL,MAX_BYTES} from '../lector-fichadas.mjs';
import {checksum16,makeAuthPayload} from '../zk-core-v3.mjs';
import {promptDigits} from '../entrada-local.mjs';
import {EventEmitter} from 'node:events';
const fakeKey=()=>Buffer.from('876543'); // artificial test fixture, never sent outside loopback
function packedTime(year=2026,month=9,day=10,hour=7,minute=0,second=0){const b=Buffer.alloc(4);b.writeUInt32LE((((((year-2000)*12+month-1)*31+day-1)*24+hour)*60+minute)*60+second);return b;}
function dataset(size=40,n=3){const raw=Buffer.alloc(4+n*size);raw.writeUInt32LE(n*size);for(let i=0;i<n;i++){const r=raw.subarray(4+i*size,4+(i+1)*size);if(size===40){r.writeUInt16LE(i+1);r.write(String(99000001+i),2,'ascii');r[26]=15;packedTime().copy(r,27);r[31]=255;}else if(size===16){r.writeUInt32LE(99000001+i);packedTime().copy(r,4);r[8]=1;r[9]=0;r.writeUInt32LE(12,12);}else if(size===8){r.writeUInt16LE(i+1);r[2]=1;packedTime().copy(r,3);r[7]=0;}}return raw;}
function response(code,session,reply,payload=Buffer.alloc(0)){const inner=Buffer.alloc(payload.length+8);inner.writeUInt16LE(code);inner.writeUInt16LE(session,4);inner.writeUInt16LE(reply,6);payload.copy(inner,8);inner.writeUInt16LE(checksum16(inner),2);const top=Buffer.from([0x50,0x50,0x82,0x7d,0,0,0,0]);top.writeUInt32LE(inner.length,4);return Buffer.concat([top,inner]);}
async function mock(options,run){
 const raw=options.raw??dataset(),count=options.count??3;const commands=[],sockets=new Set();let countQueries=0;
 const server=net.createServer(sock=>{sockets.add(sock);sock.on('close',()=>sockets.delete(sock));let buffer=Buffer.alloc(0);
  sock.on('data',b=>{buffer=Buffer.concat([buffer,b]);while(buffer.length>=8&&buffer.length>=8+buffer.readUInt32LE(4)){
   const len=buffer.readUInt32LE(4),inner=buffer.subarray(8,8+len);buffer=buffer.subarray(8+len);const cmd=inner.readUInt16LE(),reply=inner.readUInt16LE(6),payload=inner.subarray(8),sid=543;commands.push(cmd);
   if(options.stall===cmd)continue;
   let code=2000,p=Buffer.alloc(0),out=null;
   if(cmd===1000)code=2005;
   else if(cmd===1102){code=options.authReject?2005:(payload.equals(makeAuthPayload(fakeKey(),sid))?2000:2005);}
   else if(cmd===11)p=Buffer.from('~SerialNumber='+(options.serial??SERIAL)+'\0');
   else if(cmd===50){p=Buffer.alloc(112);p.writeInt32LE(80,16);p.writeInt32LE(countQueries++===0?count:(options.afterCount??count),32);}
   else if(cmd===201)p=packedTime(2026,9,10,11,13,40);
   else if(cmd===1503){if(options.immediate){code=1501;p=raw;}else{p=Buffer.alloc(5);p[0]=1;p.writeUInt32LE(options.announcedBytes??raw.length,1);}}
   else if(cmd===1504){
    const offset=payload.readUInt32LE(),size=payload.readUInt32LE(4);p=raw.subarray(offset,offset+size);code=1501;
    if(options.chunkShort)p=p.subarray(0,Math.max(0,p.length-1));
    if(options.stream){const sizep=Buffer.alloc(4);sizep.writeUInt32LE(size);const cut=Math.floor(p.length/2);out=Buffer.concat([response(1500,sid,reply,sizep),response(1501,sid,options.increment?reply+1:reply,p.subarray(0,cut)),response(1501,sid,options.increment?reply+2:reply,p.subarray(cut)),response(2000,sid,options.increment?reply+3:reply)]);}
   }else if(![1502,1001].includes(cmd))code=2001;
   out??=response(code,options.wrongSession&&cmd===11?sid+1:sid,reply,p);
   if(options.badChecksum&&cmd===1504)out[out.length-1]^=1;
   if(options.fragment){sock.write(out.subarray(0,3));setTimeout(()=>sock.write(out.subarray(3,11)),1);setTimeout(()=>sock.write(out.subarray(11)),3);}else sock.write(out);
  }});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{return await run(server.address().port,commands);}finally{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}
}
const run=(port,options={})=>collect({host:'127.0.0.1',port,commKey:fakeKey(),approved:true,pacingMs:0,timeoutMs:300,totalMs:5000,...options});
for(const cmd of [8,9,10,12,14,15,18,19,20,31,202,1003,1004,1005])test(`bloquea comando ${cmd}`,()=>assert.throws(()=>makePacket(cmd,1,1),{code:'COMMAND_NOT_ALLOWED'}));
test('bloquea otro dataset de buffer',()=>{const b=Buffer.alloc(11);b[0]=1;b.writeInt16LE(9,1);assert.throws(()=>makePacket(1503,1,1,b),{code:'DATASET_NOT_ALLOWED'});});
test('bloquea configuracion arbitraria',()=>assert.throws(()=>makePacket(11,1,1,Buffer.from('CommKey\0')),{code:'OPTION_NOT_ALLOWED'}));
test('bloquea chunks grandes',()=>{const p=Buffer.alloc(8);p.writeUInt32LE(20000,4);assert.throws(()=>makePacket(1504,1,1,p));});
test('bloquea destino no aprobado',async()=>await assert.rejects(collect({host:'192.0.2.1',commKey:fakeKey(),approved:true}),{code:'TARGET_NOT_ALLOWED'}));
test('exige aprobacion',async()=>await assert.rejects(collect({commKey:fakeKey()}),{code:'APPROVAL_REQUIRED'}));
test('decoder 40 conserva userid, uid y codigos sin interpretar',()=>{const r=decodeAttendance(dataset(),3,3);assert.equal(r.recordCount,3);assert.equal(r.records[0].userIdFromRecord,'99000001');assert.equal(r.records[0].verificationCodeRaw,15);assert.equal(r.records[0].direction,'unknown');assert.equal(r.records[0].method,'unknown');});
test('decoder 16 conserva workcode',()=>{const r=decodeAttendance(dataset(16),3,3);assert.equal(r.records[0].workCodeRaw,12);});
test('decoder 8 no inventa DNI desde uid',()=>{const r=decodeAttendance(dataset(8),3,3);assert.equal(r.records[0].userIdFromRecord,null);assert.equal(r.records[0].identityState,'UID_REQUIRES_MAPPING');});
test('decoder vacio',()=>assert.equal(decodeAttendance(dataset(40,0),0,0).recordCount,0));
test('longitud interna incorrecta no decodifica',()=>{const d=dataset();d.writeUInt32LE(8);assert.equal(decodeAttendance(d,3,3).status,'LAYOUT_UNRESOLVED');});
test('layout ambiguo se retiene',()=>assert.equal(decodeAttendance(dataset(40,2),2,5).status,'LAYOUT_UNRESOLVED'));
test('conteo distinto no se infiere libremente',()=>assert.equal(decodeAttendance(dataset(),17,17).status,'LAYOUT_UNRESOLVED'));
test('retiene fecha civil invalida',()=>{const d=dataset();packedTime(2026,2,31).copy(d,4+27);assert.equal(decodeAttendance(d,3,3).invalidTimestampCount,1);});
test('no elimina dos registros iguales',()=>{const d=dataset();d.copy(d,44,4,44);assert.equal(decodeAttendance(d,3,3).recordCount,3);});
test('descarga directa por buffer completo',async()=>mock({},async(port,cmds)=>{const r=await run(port);assert.equal(r.report.status,'ATTENDANCE_DOWNLOADED_FOR_REVIEW');assert.equal(r.raw.length,124);assert.equal(r.parsed.recordCount,3);assert.equal(r.report.credentialAttempts,1);assert.ok(cmds.includes(1502));assert.equal(cmds.at(-1),1001);assert.equal(cmds.filter(x=>x===1102).length,1);}));
test('descarga respuesta DATA inmediata',async()=>mock({immediate:true},async port=>{const r=await run(port);assert.equal(r.parsed.recordCount,3);}));
test('tramas TCP fragmentadas',async()=>mock({fragment:true},async port=>{const r=await run(port);assert.equal(r.report.status,'ATTENDANCE_DOWNLOADED_FOR_REVIEW');}));
test('PREPARE DATA fragmentos y ACK coalescidos',async()=>mock({stream:true},async port=>{const r=await run(port);assert.equal(r.parsed.recordCount,3);}));
test('reply incremental en stream',async()=>mock({stream:true,increment:true},async port=>{const r=await run(port);assert.equal(r.parsed.recordCount,3);}));
test('descarga varios chunks',async()=>mock({raw:dataset(40,1000),count:1000,stream:true},async port=>{const r=await run(port);assert.equal(r.parsed.recordCount,1000);assert.equal(r.report.transfer.completedChunks,3);}));
test('rechazo AUTH un solo intento sin lectura',async()=>mock({authReject:true},async(port,cmds)=>{const r=await run(port);assert.equal(r.report.status,'AUTH_NOT_ACCEPTED');assert.deepEqual(cmds,[1000,1102]);assert.equal(r.raw,null);}));
test('serial distinto bloquea download',async()=>mock({serial:'OTRO'},async(port,cmds)=>{const r=await run(port);assert.equal(r.report.error.code,'SERIAL_MISMATCH');assert.ok(!cmds.includes(1503));}));
test('sesion incorrecta bloquea',async()=>mock({wrongSession:true},async port=>{const r=await run(port);assert.equal(r.report.error.code,'SESSION_MISMATCH');}));
test('buffer excedido aborta antes de chunks',async()=>mock({announcedBytes:MAX_BYTES+1},async(port,cmds)=>{const r=await run(port);assert.equal(r.report.error.code,'TRANSFER_LIMIT');assert.ok(!cmds.includes(1504));}));
test('checksum invalido falla cerrado',async()=>mock({badChecksum:true},async port=>{const r=await run(port);assert.equal(r.report.error.code,'CHECKSUM_MISMATCH');assert.equal(r.report.attendanceTransferComplete,false);}));
test('chunk truncado no es una descarga completa',async()=>mock({chunkShort:true},async port=>{const r=await run(port);assert.equal(r.report.error.code,'CHUNK_SIZE_MISMATCH');assert.equal(r.report.attendanceTransferComplete,false);}));
test('timeout no relanza descarga',async()=>mock({stall:1504},async(port,cmds)=>{const r=await run(port,{timeoutMs:60});assert.equal(r.report.error.code,'RESPONSE_TIMEOUT');assert.equal(cmds.filter(x=>x===1504).length,1);}));
test('contador cambia: conserva advertencia',async()=>mock({afterCount:4},async port=>{const r=await run(port);assert.ok(r.report.observations.some(x=>x.includes('contador cambio')));}));
test('layout desconocido conserva binario',async()=>mock({raw:dataset(28,3)},async port=>{const r=await run(port);assert.equal(r.report.status,'RAW_DOWNLOADED_LAYOUT_PENDING');assert.equal(r.raw.length,88);}));
test('se borra buffer de clave aportada',async()=>mock({},async port=>{const k=fakeKey();await run(port,{commKey:k});assert.equal(k.every(x=>x===0),true);}));
test('informe no guarda clave ni AUTH payload',async()=>mock({},async port=>{const r=await run(port);assert.ok(!JSON.stringify(r.report).includes('876543'));assert.ok(!JSON.stringify(r.report).includes('authPayload'));}));
test('sin ordenes de escritura en sesion completa',async()=>mock({},async(port,cmds)=>{await run(port);assert.ok(cmds.every(x=>[1000,1102,11,50,201,1503,1504,1502,1001].includes(x)));}));
test('teclado mascara y entrega clave a memoria',async()=>{const input=new EventEmitter();input.isTTY=true;input.setRawMode=()=>{};input.resume=()=>{};input.pause=()=>{};let outputText='';const output={isTTY:true,write:s=>outputText+=s};const p=promptDigits({label:'Clave: ',secret:true,input,output});input.emit('data',Buffer.from('876543\r'));const b=await p;assert.equal(b.toString(),'876543');assert.ok(outputText.includes('******'));assert.ok(!outputText.includes('876543'));b.fill(0);});
