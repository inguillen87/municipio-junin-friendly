// Private OOXML ZIP reader. Inspection completes before any allocation/inflation.
export const ZIP_LIMITS=Object.freeze({compressed:8*1024*1024,expanded:32*1024*1024,
  part:4*1024*1024,entries:256});
export function need(ok,code){if(!ok)throw Object.assign(Error('CAJAS_'+code),{code:'CAJAS_'+code});}
const utf8=new TextDecoder('utf-8',{fatal:true});
export function safePart(name){
  need(typeof name==='string'&&name.length>0&&name.length<=240
    &&!/[\\:%?#\u0000-\u001f\u007f]/.test(name)&&!name.startsWith('/')
    &&name.split('/').every(p=>p&&p!=='.'&&p!=='..')
    &&name===name.normalize('NFC'),'ZIP_PATH');
  need(!/(?:^|\/)(?:vbaProject\.bin|activeX|embeddings|ctrlProps)(?:\/|$)/i.test(name),'ZIP_ACTIVE_CONTENT');
  return name;
}
function extraFields(view,start,length){
  let pos=start;const end=start+length;
  while(pos<end){need(pos+4<=end,'ZIP_EXTRA');const type=view.getUint16(pos,true),n=view.getUint16(pos+2,true);
    need(type!==1&&pos+4+n<=end,'ZIP64_OR_EXTRA');pos+=4+n;}
}
export function inspectZip(input){
  need(input instanceof Uint8Array&&input.length>=22&&input.length<=ZIP_LIMITS.compressed,'ZIP_LIMIT');
  const view=new DataView(input.buffer,input.byteOffset,input.byteLength);
  let end=-1;
  for(let i=input.length-22;i>=Math.max(0,input.length-65557);i--){
    if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===input.length){end=i;break;}
  }
  need(end>=0,'ZIP_END');
  const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
  need(view.getUint16(end+4,true)===0&&view.getUint16(end+6,true)===0
    &&view.getUint16(end+8,true)===count&&count>0&&count<=ZIP_LIMITS.entries
    &&count!==65535&&size!==0xffffffff&&offset!==0xffffffff
    &&offset+size===end,'ZIP_DIRECTORY');
  let pos=offset,total=0;const names=new Set(),entries=[],ranges=[];
  for(let index=0;index<count;index++){
    need(pos+46<=end&&view.getUint32(pos,true)===0x02014b50,'ZIP_DIRECTORY');
    const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true);
    const crc=view.getUint32(pos+16,true),compressed=view.getUint32(pos+20,true),expanded=view.getUint32(pos+24,true);
    const n=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
    const local=view.getUint32(pos+42,true);
    need(pos+46+n+extra+comment<=end&&n>0,'ZIP_DIRECTORY');
    let name;try{name=safePart(utf8.decode(input.subarray(pos+46,pos+46+n)));}catch(e){if(e.code)throw e;need(false,'ZIP_FILENAME_UTF8');}
    const normalized=name.toLocaleLowerCase('en-US');
    need(!names.has(normalized),'ZIP_DUPLICATE_PATH');names.add(normalized);
    need(!(flags&1)&&[0,8].includes(method)&&view.getUint16(pos+34,true)===0,'ZIP_METHOD_OR_ENCRYPTION');
    need(expanded<=ZIP_LIMITS.part&&compressed<=ZIP_LIMITS.compressed
      &&expanded!==0xffffffff&&compressed!==0xffffffff,'ZIP_EXPANDED_LIMIT');
    total+=expanded;need(total<=ZIP_LIMITS.expanded,'ZIP_EXPANDED_LIMIT');
    extraFields(view,pos+46+n,extra);
    need(local+30<=offset&&view.getUint32(local,true)===0x04034b50,'ZIP_LOCAL');
    const localFlags=view.getUint16(local+6,true),localMethod=view.getUint16(local+8,true);
    const localN=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true);
    const start=local+30+localN+localExtra,finish=start+compressed;
    need(start<=offset&&finish<=offset&&localFlags===flags&&localMethod===method,'ZIP_LOCAL');
    need(utf8.decode(input.subarray(local+30,local+30+localN))===name,'ZIP_LOCAL_FILENAME');
    extraFields(view,local+30+localN,localExtra);
    if(!(flags&8))need(view.getUint32(local+14,true)===crc
      &&view.getUint32(local+18,true)===compressed&&view.getUint32(local+22,true)===expanded,'ZIP_LOCAL_SIZE');
    if(method===0)need(compressed===expanded,'ZIP_STORED_SIZE');
    for(const [a,b]of ranges)need(finish<=a||local>=b,'ZIP_OVERLAP');
    ranges.push([local,finish]);
    entries.push({name,flags,method,crc,compressed,expanded,start,finish});pos+=46+n+extra+comment;
  }
  need(pos===end,'ZIP_DIRECTORY');
  return {entries,expandedBytes:total,compressedBytes:input.length};
}
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function inflateZip(input,Inflate){
  const scan=inspectZip(input),parts=[];
  for(const entry of scan.entries){
    const compressed=input.subarray(entry.start,entry.finish);let data;
    if(entry.method===0)data=compressed.slice();
    else{
      need(typeof Inflate==='function','ZIP_READER_UNAVAILABLE');
      let length=0,finished=false;const chunks=[];
      const stream=new Inflate((chunk,final)=>{
        length+=chunk.length;
        need(length<=entry.expanded&&length<=ZIP_LIMITS.part,'ZIP_INFLATE_OVERRUN');
        chunks.push(chunk.slice());finished=final;
      });
      // A declared-size lie cannot cause a whole-stream output allocation.
      // Bounded input chunks also bound transient output of the DEFLATE decoder.
      if(!compressed.length)stream.push(new Uint8Array(),true);
      for(let pos=0;pos<compressed.length;pos+=256){
        stream.push(compressed.subarray(pos,pos+256),pos+256>=compressed.length);
      }
      need(finished&&length===entry.expanded,'ZIP_INFLATE_SIZE');
      data=new Uint8Array(length);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}
    }
    need(data.length===entry.expanded&&crc32(data)===entry.crc,'ZIP_CRC_OR_SIZE');
    parts.push({name:entry.name,compressedBytes:entry.compressed,bytes:data.length,
      sha256:await sha256(data),data:data.buffer});
  }
  return {sourceSha256:await sha256(input),compressedBytes:input.length,expandedBytes:scan.expandedBytes,parts};
}
