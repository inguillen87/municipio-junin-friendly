// PROPOSED by Claude (source only; never run by Claude). Target: scripts/lib/release-zip-entries.mjs
// Pure, bounded reader for GitHub Actions artifact ZIPs (single disk, no ZIP64, no encryption).
// Sizes come from the central directory, because upload-artifact streams entries with data descriptors.
// Nothing is extracted to disk and nothing is executed.
import zlib from 'node:zlib';

const fail=code=>{throw Object.assign(new Error(code),{code});};
const LIMITS=Object.freeze({maxEntries:20000,maxEntryBytes:16*1024*1024});

/** Map name -> central-directory record. Any layout outside the plain subset is rejected. */
export function zipEntries(input,{maxEntries=LIMITS.maxEntries}={}){
 const b=Buffer.from(input.buffer,input.byteOffset,input.byteLength);
 if(b.length<22)fail('ZIP_TOO_SHORT');
 let eocd=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-22-65535);i--)if(b.readUInt32LE(i)===0x06054b50){eocd=i;break;}
 if(eocd<0)fail('ZIP_EOCD_MISSING');
 const disk=b.readUInt16LE(eocd+4),cdDisk=b.readUInt16LE(eocd+6),diskCount=b.readUInt16LE(eocd+8),count=b.readUInt16LE(eocd+10),
  cdSize=b.readUInt32LE(eocd+12),cdOffset=b.readUInt32LE(eocd+16),commentLength=b.readUInt16LE(eocd+20);
 if(disk!==0||cdDisk!==0||diskCount!==count||count===0xffff||cdSize===0xffffffff||cdOffset===0xffffffff)fail('ZIP_LAYOUT_UNSUPPORTED');
 if(eocd+22+commentLength!==b.length||cdOffset+cdSize!==eocd||count>maxEntries)fail('ZIP_LAYOUT_UNSUPPORTED');
 const entries=new Map();let p=cdOffset;
 for(let n=0;n<count;n++){
  if(p+46>eocd||b.readUInt32LE(p)!==0x02014b50)fail('ZIP_CENTRAL_INVALID');
  const flags=b.readUInt16LE(p+8),method=b.readUInt16LE(p+10),crc=b.readUInt32LE(p+16),compressedSize=b.readUInt32LE(p+20),size=b.readUInt32LE(p+24),
   nameLength=b.readUInt16LE(p+28),extraLength=b.readUInt16LE(p+30),entryCommentLength=b.readUInt16LE(p+32),local=b.readUInt32LE(p+42);
  if(p+46+nameLength+extraLength+entryCommentLength>eocd)fail('ZIP_CENTRAL_INVALID');
  const name=new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(p+46,p+46+nameLength));
  p+=46+nameLength+extraLength+entryCommentLength;
  if(flags&0x1)fail('ZIP_ENCRYPTED');
  if(compressedSize===0xffffffff||size===0xffffffff||local===0xffffffff)fail('ZIP64_UNSUPPORTED');
  if(!name||name.startsWith('/')||name.includes('\\')||name.split('/').includes('..'))fail('ZIP_ENTRY_PATH');
  if(entries.has(name))fail('ZIP_ENTRY_DUPLICATE');
  if(local>=cdOffset)fail('ZIP_CENTRAL_INVALID');
  entries.set(name,Object.freeze({name,flags,method,crc,compressedSize,size,local}));
 }
 if(p!==eocd)fail('ZIP_CENTRAL_INVALID');
 return entries;
}

/** Bytes of one entry, inflated in memory with an output cap and CRC-32 check. */
export function zipEntryBytes(input,entry,{maxEntryBytes=LIMITS.maxEntryBytes}={}){
 const b=Buffer.from(input.buffer,input.byteOffset,input.byteLength),p=entry?.local;
 if(!Number.isSafeInteger(p)||p+30>b.length||b.readUInt32LE(p)!==0x04034b50)fail('ZIP_LOCAL_INVALID');
 const nameLength=b.readUInt16LE(p+26),extraLength=b.readUInt16LE(p+28);
 if(b.subarray(p+30,p+30+nameLength).toString('utf8')!==entry.name)fail('ZIP_LOCAL_NAME');
 if(entry.size>maxEntryBytes)fail('ZIP_ENTRY_TOO_LARGE');
 const start=p+30+nameLength+extraLength,data=b.subarray(start,start+entry.compressedSize);
 if(data.length!==entry.compressedSize)fail('ZIP_ENTRY_TRUNCATED');
 let out;
 if(entry.method===0)out=Buffer.from(data);
 else if(entry.method===8){try{out=zlib.inflateRawSync(data,{maxOutputLength:Math.max(1,maxEntryBytes)});}catch{fail('ZIP_INFLATE_FAILED');}}
 else fail('ZIP_METHOD_UNSUPPORTED');
 if(out.length!==entry.size||zlib.crc32(out)!==entry.crc)fail('ZIP_ENTRY_CRC');
 return new Uint8Array(out);
}
