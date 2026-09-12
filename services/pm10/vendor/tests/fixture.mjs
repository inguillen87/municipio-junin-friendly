// SPDX-License-Identifier: GPL-2.0-only
// Synthetic data, public test key, loopback only. Not municipal records.
import net from 'node:net';
import {checksum16,makeAuthPayload} from '../zk-core-v3.mjs';
import {SERIAL} from '../lector-fichadas.mjs';
export const fakeKey=()=>Buffer.from('876543');
export function packedTime(year=2026,month=9,day=10,hour=7,minute=0,second=0) {
 const b=Buffer.alloc(4);b.writeUInt32LE((((((year-2000)*12+month-1)*31+day-1)*24+hour)*60+minute)*60+second);return b;
}
export function dataSet(n=11109) {
 const raw=Buffer.alloc(4+n*40);raw.writeUInt32LE(n*40);
 for(let i=0;i<n;i++) {const r=raw.subarray(4+i*40,4+(i+1)*40);r.writeUInt16LE((i%80)+1);r.write(String(99000001+i%80),2,'ascii');r[26]=1;packedTime(2026,9,10,7,i%60,i%60).copy(r,27);r[31]=255;}
 return raw;
}
export function packet(code,session,reply,p=Buffer.alloc(0)) {
 const inner=Buffer.alloc(p.length+8);inner.writeUInt16LE(code);inner.writeUInt16LE(session,4);inner.writeUInt16LE(reply,6);p.copy(inner,8);inner.writeUInt16LE(checksum16(inner),2);
 const top=Buffer.from([0x50,0x50,0x82,0x7d,0,0,0,0]);top.writeUInt32LE(inner.length,4);return Buffer.concat([top,inner]);
}
export async function withClock(opts,run) {
 const raw=opts.raw??dataSet(opts.count??11109);const sid=opts.sid??12345;
 const commands=[],sockets=new Set(),timers=new Set();let countQueries=0,requests=0,body=null;
 const later=(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);fn();},ms);timers.add(t);};
 const server=net.createServer(sock=>{
  sockets.add(sock);sock.on('error',()=>{});sock.on('close',()=>sockets.delete(sock));
  let b=Buffer.alloc(0);
  sock.on('data',incoming=>{
   b=Buffer.concat([b,incoming]);
   while(b.length>=8 && b.length>=b.readUInt32LE(4)+8) {
    const len=b.readUInt32LE(4),f=Buffer.from(b.subarray(8,8+len));b=b.subarray(8+len);
    const code=f.readUInt16LE(),requestSid=f.readUInt16LE(4),reply=f.readUInt16LE(6),p=f.subarray(8);
    commands.push({code,session:requestSid,reply});
    let rc=2000,responseBody=Buffer.alloc(0),out,rs=sid,rr=reply;
    if(code===1000)rc=2005;
    else if(code===1102)rc=p.equals(makeAuthPayload(fakeKey(),sid))?2000:2005;
    else if(code===11)responseBody=Buffer.from('~SerialNumber='+SERIAL+'\0');
    else if(code===50) {responseBody=Buffer.alloc(112);responseBody.writeInt32LE(80,16);responseBody.writeInt32LE((countQueries++&&opts.afterCount!=null)?opts.afterCount:(opts.count??11109),32);}
    else if(code===201)responseBody=packedTime();
    else if(code===1503) {responseBody=Buffer.alloc(13);responseBody.writeUInt32LE(raw.length,1);responseBody.writeUInt32LE(raw.length,5);if(opts.immediate){rc=1501;responseBody=raw;rs=opts.dataSid??0;rr=opts.dataReply??0;}}
    else if(code===1504) {
     requests++;const start=p.readUInt32LE(),size=p.readUInt32LE(4);body=raw.subarray(start,start+size);
     const sizep=Buffer.alloc(8);sizep.writeUInt32LE(size);sizep.writeUInt32LE(4096,4);
     const parts=[],dataSid=opts.dataSid??0;
     const partSize=opts.partSize??8192;let count=0;
     for(let at=0;at<body.length;at+=partSize){count++;
      const dr=opts.dataReply??(opts.increment?((reply+count)%65535):0);
      const slice=body.subarray(at,Math.min(body.length,at+partSize));
      const one=packet(opts.dataCode??1501,dataSid,dr,slice);
      if(opts.badChecksum&&count===1)one[10]^=1;
      parts.push(one);
     }
     const ack=packet(opts.ackCode??2000,opts.ackSid??sid,opts.ackReply??(opts.increment?(reply+count+1)%65535:reply),opts.ackBody??Buffer.alloc(0));
     const initial=packet(1500,sid,reply,sizep);
     out=Buffer.concat([initial,...parts,...(opts.omitAck?[]:[ack])]);
     if(opts.stallSecond&&requests===2)continue;
    }else if(![1502,1001].includes(code))rc=2001;
    if(opts.wrongControl===code)rs=sid+1;
    out??=packet(rc,rs,rr,responseBody);
    if(opts.fragment && code===1504) {
     const cut=[5,13,79,1001,out.length];let at=0;
     cut.forEach((end,i)=>{const fragment=out.subarray(at,Math.min(end,out.length));at=end;if(fragment.length)later(()=>{if(!sock.destroyed)sock.write(fragment);},i*2);});
    }else sock.write(out);
   }
  });
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{return await run(server.address().port,commands,raw);}finally{
  for(const t of timers)clearTimeout(t);for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));
 }
}
