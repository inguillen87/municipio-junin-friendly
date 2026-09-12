// SPDX-License-Identifier: GPL-2.0-only
// MuniControl 4.1: own read-only pilot, limited to the authenticated clock.
// See REFERENCIAS.md. No raw command CLI, no credential search, no writes to stored data.
import net from 'node:net';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {checksum16, makeAuthPayload, validateCommKey, decodeClock, decodeCounts} from './zk-core-v3.mjs';

export const VERSION = '4.1.0';
export const TARGET = '172.100.97.131';
export const PORT = 4370;
export const SERIAL = 'CQTU225360168';
export const MAX_BYTES = 4 * 1024 * 1024;
export const CHUNK_BYTES = 16384;
const MAX_FRAME = MAX_BYTES + 8;
const MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);
const NAMES = new Map([
  [1000,'CONNECT'], [1102,'AUTH'], [11,'SERIAL_READ'], [50,'COUNTS_READ'],
  [201,'TIME_READ'], [1001,'EXIT'], [1503,'PREPARE_ATTENDANCE_BUFFER'],
  [1504,'READ_ATTENDANCE_CHUNK'], [1502,'RELEASE_TRANSFER_BUFFER'],
]);
const sha = b => createHash('sha256').update(b).digest('hex');
const uint = (n,max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
function fail(code, message = code, details = undefined) {
  throw Object.assign(new Error(message), {code, details});
}
function safeCode(e) {
  return typeof e?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(e.code)
    ? e.code : 'UNEXPECTED';
}
const nextReply = r => (r + 1) % 65535;
const clean = b => b.toString('latin1').split('\0')[0].replace(/[\x00-\x1f\x7f-\x9f]/g,'?').trim();

export function makePacket(cmd,session,reply,payload=Buffer.alloc(0)) {
  if(!NAMES.has(cmd)) fail('COMMAND_NOT_ALLOWED','Comando fuera del perfil de lectura.');
  if(!uint(session,65535) || !uint(reply,65535) || !Buffer.isBuffer(payload)) fail('INVALID_ARGUMENT');
  if(cmd===1102) {
    if(payload.length!==4) fail('INVALID_PAYLOAD');
  } else if(cmd===11) {
    if(!payload.equals(Buffer.from('~SerialNumber\0'))) fail('OPTION_NOT_ALLOWED');
  } else if(cmd===1503) {
    const allow=Buffer.alloc(11); allow[0]=1; allow.writeInt16LE(13,1);
    if(!payload.equals(allow)) fail('DATASET_NOT_ALLOWED');
  } else if(cmd===1504) {
    if(payload.length!==8) fail('INVALID_PAYLOAD');
    const start=payload.readUInt32LE(),len=payload.readUInt32LE(4);
    if(!len || len>CHUNK_BYTES || start+len>MAX_BYTES) fail('LIMIT_EXCEEDED');
  } else if(payload.length) fail('INVALID_PAYLOAD');
  const inner=Buffer.alloc(payload.length+8);
  inner.writeUInt16LE(cmd); inner.writeUInt16LE(session,4); inner.writeUInt16LE(reply,6);
  payload.copy(inner,8); inner.writeUInt16LE(checksum16(inner),2);
  const top=Buffer.alloc(8); MAGIC.copy(top); top.writeUInt32LE(inner.length,4);
  return Buffer.concat([top,inner]);
}

/** The transport never changes session/reply state. It only reassembles TCP
 * envelopes and validates lengths/checksums. Diagnostics store headers, not payloads. */
class Channel {
  constructor(socket,onHeader) {
    this.socket=socket; this.onHeader=onHeader; this.buffer=Buffer.alloc(0);
    this.pending=null; this.error=null; this.wireBytes=0;
    socket.on('data',b=>{
      this.wireBytes+=b.length;
      if(this.buffer.length+b.length>MAX_FRAME+65536) {this.abort('BUFFER_LIMIT');return;}
      this.buffer=Buffer.concat([this.buffer,b]); this.pump();
    });
    socket.on('error',e=>this.abort(safeCode(e)));
    socket.on('end',()=>this.abort('CONNECTION_ENDED'));
    socket.on('close',()=>this.abort('CONNECTION_CLOSED'));
  }
  abort(code) {
    this.error ??= Object.assign(new Error(code),{code});
    if(this.pending) {
      const p=this.pending; this.pending=null; clearTimeout(p.timer); p.reject(this.error);
    }
    this.socket.destroy();
  }
  pump() {
    if(!this.pending || this.buffer.length<8) return;
    if(!this.buffer.subarray(0,4).equals(MAGIC)) {this.abort('BAD_TCP_MAGIC');return;}
    const length=this.buffer.readUInt32LE(4);
    if(length<8 || length>MAX_FRAME) {this.abort('FRAME_LIMIT');return;}
    if(this.buffer.length<length+8) return;
    const inner=Buffer.from(this.buffer.subarray(8,length+8));
    this.buffer=this.buffer.subarray(length+8);
    const frame={code:inner.readUInt16LE(0),session:inner.readUInt16LE(4),
      reply:inner.readUInt16LE(6),payload:inner.subarray(8),
      checksumValid:checksum16(inner)===0};
    // Record even rejected frame headers; never dump data or AUTH bytes.
    this.onHeader(frame);
    if(!frame.checksumValid) {this.abort('CHECKSUM_MISMATCH');return;}
    const p=this.pending; this.pending=null; clearTimeout(p.timer); p.resolve(frame);
  }
  next(ms) {
    if(this.error) return Promise.reject(this.error);
    if(this.pending) return Promise.reject(Object.assign(new Error('CONCURRENT_READ'),{code:'CONCURRENT_READ'}));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.abort('RESPONSE_TIMEOUT'),ms);
      this.pending={resolve,reject,timer}; this.pump();
    });
  }
  request(packet,ms) {
    if(this.error) return Promise.reject(this.error);
    const p=this.next(ms);
    this.socket.write(packet);
    return p;
  }
}

export function decodeAttendance(raw,beforeCount,afterCount){
 const result={status:'LAYOUT_UNRESOLVED',layout:null,rawBytes:raw.length,bodyBytes:null,recordCount:null,invalidTimestampCount:0,nonDniOrUidCount:0,records:[]};
 if(raw.length<4){result.reason='No hay cabecera de longitud de cuatro bytes';return result;}
 const bodyBytes=raw.readUInt32LE();result.bodyBytes=bodyBytes;
 if(bodyBytes!==raw.length-4){result.reason='La longitud interna no coincide con los bytes recibidos';return result;}
 if(bodyBytes===0){result.status='DECODED_EMPTY';result.recordCount=0;return result;}
 const counts=[...new Set([beforeCount,afterCount].filter(n=>Number.isSafeInteger(n)&&n>0))];
 const candidates=[8,16,40].filter(size=>counts.some(n=>bodyBytes===size*n));
 if(candidates.length!==1){result.reason='Sin longitud de registro unica compatible con los contadores de referencia';return result;}
 const size=candidates[0];result.layout=`legacy-${size}-byte-candidate`;result.recordCount=bodyBytes/size;
 for(let offset=4,index=0;offset<raw.length;offset+=size,index++){
  const row=raw.subarray(offset,offset+size);let userId=null,uid=null,tm,status,punch,workcode=null;
  if(size===40){
   uid=row.readUInt16LE(0);const u=row.subarray(2,26);const end=u.indexOf(0);userId=u.subarray(0,end<0?24:end).toString('latin1');status=row[26];tm=row.subarray(27,31);punch=row[31];
  }else if(size===16){userId=String(row.readUInt32LE(0));tm=row.subarray(4,8);status=row[8];punch=row[9];workcode=row.readUInt32LE(12);}
  else{uid=row.readUInt16LE(0);status=row[2];tm=row.subarray(3,7);punch=row[7];}
  let local=null,timeError=null;try{local=decodeClock(tm);}catch{timeError='INVALID_DEVICE_TIMESTAMP';result.invalidTimestampCount++;}
  const dniCandidate=typeof userId==='string'&&/^[0-9]{6,8}$/.test(userId);
  if(!dniCandidate)result.nonDniOrUidCount++;
  result.records.push({recordIndexInDownload:index+1,rawRecordSha256:sha(row),userIdFromRecord:userId,internalUid:uid,dniFormatCandidate:dniCandidate,occurredAtDeviceLocal:local,rawTimestampHex:tm.toString('hex'),timestampError:timeError,verificationCodeRaw:status,punchCodeRaw:punch,workCodeRaw:workcode,identityState:size===8?'UID_REQUIRES_MAPPING':'DNI_REQUIRES_CANONICAL_MATCH',direction:'unknown',method:'unknown'});
 }
 result.status='DECODED_CANDIDATE';return result;
}

/** Read one snapshot, no automatic reconnection. Numeric credential must already
 * be known. A neutral session (0) is accepted ONLY on CMD_DATA inside a pending,
 * authenticated ATTLOG transfer on the same socket and after serial verification.
 * It never overwrites the control session. Other mismatches stop the connection. */
export async function collect({commKey,approved=false,host=TARGET,port=PORT,
  timeoutMs=10000,pacingMs=200,totalMs=180000,signal=null,onProgress=()=>{}}={}) {
  try {
    if(!approved) fail('APPROVAL_REQUIRED');
    if(!((host===TARGET&&port===PORT)||(host==='127.0.0.1'&&uint(port,65535)&&port>0))) fail('TARGET_NOT_ALLOWED');
    validateCommKey(commKey);
    if(!uint(timeoutMs,15000)||timeoutMs<50||!uint(pacingMs,5000)||!uint(totalMs,180000)||totalMs<50) fail('INVALID_LIMIT');
  } catch(e) {if(Buffer.isBuffer(commKey))commKey.fill(0);throw e;}

  const report={
    schemaVersion:'municontrol.attendance-download-pilot.v4.1',clientVersion:VERSION,
    startedAt:new Date().toISOString(),finishedAt:null,endpoint:{host,port,transport:'tcp'},
    expectedSerial:SERIAL,status:'STARTED',tcpConnected:false,authenticationAccepted:false,
    credentialAttempts:0,attendanceTransferComplete:false,biometricTemplatesRead:false,
    userDirectoryRead:false,configurationChanged:false,attendanceDeleted:false,metadata:{},
    transfer:{plannedBytes:null,receivedBytes:0,confirmedChunkBytes:0,completedChunks:0,
      chunkSizeLimit:CHUNK_BYTES,neutralSessionDataFrames:0},
    diagnostics:{lastPhase:'STARTED',headerTrace:[],headersOmitted:0,wireBytesReceived:0},
    cleanup:{bufferReleaseConfirmed:false,exitConfirmed:false,skippedReason:null},
    exchanges:[],observations:[],error:null,
  };
  let session=0,reply=65534,opened=false,serialVerified=false,bufferAllocated=false;
  let synchronized=true,phase='STARTED',raw=null,parsed=null,received=[],receivedBytes=0;
  let activeChunk=null,deadlineExpired=false;
  const socket=new net.Socket();
  const setPhase=p=>{phase=p;report.diagnostics.lastPhase=p;};
  const channel=new Channel(socket,f=>{
    const row={receivedAt:new Date().toISOString(),phase,code:f.code,
      sessionId:f.session,replyId:f.reply,payloadBytes:f.payload.length,
      checksumValidated:f.checksumValid};
    if(activeChunk) {row.chunkOffset=activeChunk.start;row.chunkRequestedBytes=activeChunk.wanted;}
    if(report.diagnostics.headerTrace.length>=96) {
      report.diagnostics.headerTrace.shift(); report.diagnostics.headersOmitted++;
    }
    report.diagnostics.headerTrace.push(row);
  });
  const deadline=setTimeout(()=>{deadlineExpired=true;channel.abort('TOTAL_TIMEOUT');},totalMs);
  const onAbort=()=>channel.abort('CANCELLED');
  if(signal) {if(signal.aborted)onAbort();else signal.addEventListener('abort',onAbort,{once:true});}

  const mismatch=(code,f,expectedReply=null)=>{
    synchronized=false;
    const details={phase,expectedSessionId:session,receivedSessionId:f.session,
      expectedReplyId:expectedReply,receivedReplyId:f.reply,
      responseCode:f.code,payloadBytes:f.payload.length,checksumValidated:f.checksumValid};
    channel.abort(code);
    fail(code,'La cabecera no coincide con el contexto de transferencia.',details);
  };
  const checkControl=(f,sent)=>{
    if(f.session!==session) mismatch('SESSION_MISMATCH',f,sent);
    if(f.reply!==sent) mismatch('REPLY_MISMATCH',f,sent);
    reply=f.reply;
  };
  const checkData=(f,baseReply,frameIndex)=>{
    if(!opened || !serialVerified || f.code!==1501) mismatch('DATA_OUT_OF_CONTEXT',f,baseReply);
    if(f.session!==session && f.session!==0) mismatch('SESSION_MISMATCH',f,baseReply);
    // Repeated reply number is the documented flow; sequential numbers are
    // supported by previous pilot tests. 0 is allowed only with neutral DATA.
    const sequential=(baseReply+frameIndex)%65535;
    if(f.reply!==baseReply && f.reply!==sequential && !(f.session===0&&f.reply===0))
      mismatch('REPLY_MISMATCH',f,baseReply);
    if(f.session===0 && session!==0) report.transfer.neutralSessionDataFrames++;
    // IMPORTANT: no assignment to control session or reply from a DATA header.
  };
  const request=async(cmd,payload=Buffer.alloc(0))=>{
    if(!synchronized) fail('UNSYNCHRONIZED_STREAM','No se envia otro comando con datos pendientes.');
    if(channel.error) throw channel.error;
    if(cmd!==1000&&pacingMs) await delay(pacingMs);
    if(channel.error) throw channel.error;
    const sent=nextReply(reply),packet=makePacket(cmd,session,sent,payload);
    setPhase(NAMES.get(cmd)); synchronized=false;
    const trace={command:NAMES.get(cmd),code:cmd,startedAt:new Date().toISOString(),requestReplyId:sent};
    report.exchanges.push(trace);
    try {
      const f=await channel.request(packet,timeoutMs);
      // Attach header info before semantic checks so a mismatch is diagnosable.
      Object.assign(trace,{responseCode:f.code,responseSessionId:f.session,
        responseReplyId:f.reply,payloadBytes:f.payload.length,checksumValidated:true});
      if(cmd===1000) session=f.session;
      if([1503,1504].includes(cmd)&&f.code===1501) {
        checkData(f,sent,0); reply=sent;
      } else checkControl(f,sent);
      synchronized=true;
      return f;
    } catch(e) {trace.errorCode=safeCode(e);throw e;}
    finally {if(cmd===1102)packet.fill(0);}
  };
  const ok=f=>{if(f.code!==2000)fail('COMMAND_REJECTED',`Respuesta ${f.code}.`);return f;};
  const sizes=async()=>decodeCounts(ok(await request(50)).payload);
  const retainData=p=>{
    if(receivedBytes+p.length>MAX_BYTES)fail('TRANSFER_LIMIT');
    received.push(Buffer.from(p));receivedBytes+=p.length;report.transfer.receivedBytes=receivedBytes;
  };
  const materializeRaw=()=>{
    if(!raw && receivedBytes) raw=Buffer.concat(received);
  };

  try {
    if(channel.error)throw channel.error;
    setPhase('TCP_CONNECT');
    await new Promise((resolve,reject)=>{
      const onError=e=>{clearTimeout(timer);reject(e);};
      const timer=setTimeout(()=>{
        channel.abort('CONNECT_TIMEOUT');reject(Object.assign(new Error('CONNECT_TIMEOUT'),{code:'CONNECT_TIMEOUT'}));
      },timeoutMs);
      socket.once('error',onError);
      socket.connect({host,port,family:4},()=>{
        clearTimeout(timer);socket.off('error',onError);resolve();
      });
    });
    report.tcpConnected=true;
    const hello=await request(1000);
    if(hello.code===2005) {
      const auth=makeAuthPayload(commKey,session); commKey.fill(0);let r;
      try {report.credentialAttempts=1;r=await request(1102,auth);}finally{auth.fill(0);}
      if(r.code!==2000) {report.status='AUTH_NOT_ACCEPTED';return {report,raw,parsed};}
      report.authenticationAccepted=true;
    } else if(hello.code===2000) report.observations.push('Sesion aceptada sin AUTH; comprobar configuracion local.');
    else fail('SESSION_REJECTED');
    commKey.fill(0);opened=true;
    const serialFrame=ok(await request(11,Buffer.from('~SerialNumber\0')));
    report.metadata.serialNumber=clean(serialFrame.payload).replace(/^~SerialNumber=/,'');
    if(report.metadata.serialNumber!==SERIAL) fail('SERIAL_MISMATCH','No se solicitan fichadas de otro equipo.');
    serialVerified=true;
    report.metadata.countsBefore=await sizes();
    report.metadata.deviceTimeBefore=decodeClock(ok(await request(201)).payload);
    const before=report.metadata.countsBefore?.counts?.attendanceRecordsReported;
    if(!Number.isSafeInteger(before)||before<0||before>100000) fail('COUNT_LIMIT');

    const prepare=Buffer.alloc(11);prepare[0]=1;prepare.writeInt16LE(13,1);
    const ready=await request(1503,prepare);
    if(![2000,1501].includes(ready.code)) fail('BUFFER_PREPARE_REJECTED');
    bufferAllocated=true;
    if(ready.code===1501) {
      if(ready.payload.length<4 || ready.payload.length>MAX_BYTES)fail('TRANSFER_LIMIT');
      report.transfer.plannedBytes=ready.payload.length;retainData(ready.payload);
      report.transfer.confirmedChunkBytes=ready.payload.length;
    } else {
      if(ready.payload.length<5)fail('PREPARE_LAYOUT_UNKNOWN');
      const total=ready.payload.readUInt32LE(1);report.transfer.plannedBytes=total;
      if(total<4 || total>MAX_BYTES)fail('TRANSFER_LIMIT');
      for(let start=0;start<total;) {
        const wanted=Math.min(CHUNK_BYTES,total-start),req=Buffer.alloc(8);
        req.writeUInt32LE(start);req.writeUInt32LE(wanted,4);
        activeChunk={start,wanted};
        const first=await request(1504,req),baseReply=reply;
        let n=0,frames=0;
        if(first.code===1501) {
          if(first.payload.length!==wanted) {synchronized=false;channel.abort('CHUNK_SIZE_MISMATCH');fail('CHUNK_SIZE_MISMATCH');}
          retainData(first.payload);n=first.payload.length;
        } else if(first.code===1500) {
          synchronized=false; // The transfer includes DATA and a terminal ACK.
          if(first.payload.length<4 || first.payload.readUInt32LE()!==wanted) {
            channel.abort('CHUNK_SIZE_MISMATCH');fail('CHUNK_SIZE_MISMATCH');
          }
          while(n<wanted) {
            setPhase('CHUNK_DATA');
            if(++frames>1024) {channel.abort('FRAME_COUNT_LIMIT');fail('FRAME_COUNT_LIMIT');}
            const f=await channel.next(timeoutMs);
            checkData(f,baseReply,frames);
            if(!f.payload.length || n+f.payload.length>wanted) {
              channel.abort('CHUNK_SIZE_MISMATCH');fail('CHUNK_SIZE_MISMATCH');
            }
            retainData(f.payload);n+=f.payload.length;
          }
          setPhase('CHUNK_FINAL_ACK');
          const end=await channel.next(timeoutMs);
          // Keep the session check strict on control acknowledgements.
          if(end.session!==session)mismatch('SESSION_MISMATCH',end,baseReply);
          if(end.code!==2000 || end.payload.length!==0) {
            channel.abort('CHUNK_ACK_MISSING');fail('CHUNK_ACK_MISSING');
          }
          const sequential=(baseReply+frames+1)%65535;
          if(end.reply!==baseReply && end.reply!==sequential)mismatch('REPLY_MISMATCH',end,baseReply);
          reply=end.reply;synchronized=true;
        } else fail('CHUNK_REJECTED',`Codigo ${first.code}.`);
        if(n!==wanted)fail('CHUNK_SIZE_MISMATCH');
        start+=n;report.transfer.confirmedChunkBytes+=n;report.transfer.completedChunks++;
        activeChunk=null;
        try {onProgress({receivedBytes,totalBytes:total});}catch {report.observations.push('No se pudo actualizar el indicador local de progreso.');}
      }
    }
    materializeRaw();
    if(!raw || raw.length!==report.transfer.plannedBytes) fail('TOTAL_SIZE_MISMATCH');
    report.transfer.rawSha256=sha(raw);report.attendanceTransferComplete=true;
    ok(await request(1502));bufferAllocated=false;report.cleanup.bufferReleaseConfirmed=true;
    report.metadata.countsAfter=await sizes();
    const after=report.metadata.countsAfter?.counts?.attendanceRecordsReported;
    if(before!==after) report.observations.push('El contador cambio durante la lectura: revisar concurrencia y cobertura. No se deshabilito el reloj.');
    parsed=decodeAttendance(raw,before,after);report.parse={...parsed,records:undefined};
    report.status=parsed.status==='LAYOUT_UNRESOLVED'?'RAW_DOWNLOADED_LAYOUT_PENDING':'ATTENDANCE_DOWNLOADED_FOR_REVIEW';
    report.observations.push('No se declaro cobertura completa, no se interpreto entrada/salida y no se envio a Neon.');
    return {report,raw,parsed};
  } catch(e) {
    report.error={code:safeCode(e),message:safeCode(e),phase,...(e.details?{details:e.details}:{})};
    report.status=report.attendanceTransferComplete?'RAW_DOWNLOADED_POSTCHECK_FAILED'
      :(report.authenticationAccepted?'READ_NOT_COMPLETED':'CONNECTION_OR_AUTH_FAILED');
    materializeRaw();
    if(raw&&!report.attendanceTransferComplete)report.transfer.partialSha256=sha(raw);
    // A failure in the bulk phase must not turn queued DATA into a false
    // acknowledgement of FREE_DATA/EXIT. Close instead of attempting cleanup.
    if(!synchronized)channel.abort(safeCode(e));
    return {report,raw,parsed:null};
  } finally {
    commKey.fill(0);
    if(opened && synchronized && !channel.error && !deadlineExpired && !signal?.aborted) {
      if(bufferAllocated) {
        try {ok(await request(1502));bufferAllocated=false;report.cleanup.bufferReleaseConfirmed=true;}
        catch(e) {report.cleanup.skippedReason='BUFFER_RELEASE_NOT_CONFIRMED';channel.abort(safeCode(e));}
      }
      if(synchronized && !channel.error) {
        try {ok(await request(1001));report.cleanup.exitConfirmed=true;}
        catch(e) {report.cleanup.skippedReason='EXIT_NOT_CONFIRMED';channel.abort(safeCode(e));}
      }
    } else if(opened) report.cleanup.skippedReason='STREAM_UNSYNCHRONIZED_OR_CLOSED';
    if(bufferAllocated && !report.cleanup.bufferReleaseConfirmed)
      report.observations.push('Liberacion del buffer temporal no confirmada; se cerro el socket. No se envio borrado de fichadas ni reinicio.');
    if(report.transfer.neutralSessionDataFrames)
      report.observations.push('CMD_DATA con sesion neutra 0 aceptado solo dentro de transferencia autenticada; sesion de control conservada.');
    report.diagnostics.wireBytesReceived=channel.wireBytes;
    clearTimeout(deadline);signal?.removeEventListener('abort',onAbort);socket.destroy();
    report.finishedAt=new Date().toISOString();
  }
}
