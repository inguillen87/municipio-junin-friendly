// Source-only candidate. No execution admission is implied by this module.
// Record raw bytes before text normalization and bind those actual reads to the
// committed closure AFTER its existing raw/committed bookend, before any SQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const lf=text=>text.replace(/\r\n?/g,'\n');
export function assertOwnerQaSourcePath(file){
 assert.equal(typeof file,'string','OWNER_QA_SOURCE_PATH_INVALID');
 assert.ok(file.length>0&&!file.includes('\\')&&!file.includes('\0')&&!/^[A-Za-z]:/.test(file)&&!path.posix.isAbsolute(file)&&file.split('/').every(part=>part!==''&&part!=='.'&&part!=='..'),'OWNER_QA_SOURCE_PATH_INVALID:'+file);
 return file;
}
function sourceText(bytes,file){
 assert.ok(Buffer.isBuffer(bytes),'OWNER_QA_SOURCE_BYTES_REQUIRED:'+file);
 const text=bytes.toString('utf8');
 assert.ok(Buffer.from(text,'utf8').equals(bytes),'OWNER_QA_SOURCE_UTF8_REQUIRED:'+file);
 return lf(text);
}
function rawRecord(file,bytes){return Object.freeze({file,sha256:hash(bytes),bytes:bytes.length});}
function remember(consumed,record){
 const prior=consumed.get(record.file);
 if(prior)assert.ok(prior.sha256===record.sha256&&prior.bytes===record.bytes,'OWNER_QA_SOURCE_CHANGED_BETWEEN_READS:'+record.file);
 else consumed.set(record.file,record);
}
const snapshot=consumed=>Object.freeze([...consumed.values()].sort((a,b)=>a.file.localeCompare(b.file)));
function closureFiles(closure){
 assert.ok(closure&&closure.files&&typeof closure.files==='object'&&!Array.isArray(closure.files),'OWNER_QA_SOURCE_CLOSURE_REQUIRED');
 return Object.freeze({...closure.files});
}
export function createRecordingSourceReader({root,readBytes=file=>fs.readFileSync(path.join(root,file))}={}){
 assert.equal(typeof readBytes,'function');
 const consumed=new Map();
 const read=file=>{
  assertOwnerQaSourcePath(file);const bytes=readBytes(file);
  const text=sourceText(bytes,file);remember(consumed,rawRecord(file,bytes));return text;
 };
 return Object.freeze({read,consumed:()=>snapshot(consumed)});
}
// Called only after the host has checked the same closure against committed
// bytes. A path-only witness is rejected: read A / committed B must not pass.
export function assertConsumedWithinClosure(consumed,closure){
 assert.ok(Array.isArray(consumed),'OWNER_QA_SOURCE_READ_RECORDS_REQUIRED');
 const files=closureFiles(closure),seen=new Set(),missing=[],changed=[];
 for(const record of consumed){
  assert.ok(record&&typeof record==='object'&&!Array.isArray(record),'OWNER_QA_SOURCE_RAW_RECORD_REQUIRED');
  const file=assertOwnerQaSourcePath(record.file);
  assert.match(record.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(record.bytes)&&record.bytes>=0,'OWNER_QA_SOURCE_RAW_BYTES_REQUIRED');
  assert.ok(!seen.has(file),'OWNER_QA_SOURCE_DUPLICATE_READ_RECORD:'+file);seen.add(file);
  if(!Object.hasOwn(files,file))missing.push(file);else if(files[file]!==record.sha256)changed.push(file);
 }
 assert.equal(missing.length,0,'OWNER_QA_SOURCE_READ_OUTSIDE_CLOSURE:'+missing.sort().join(','));
 assert.equal(changed.length,0,'OWNER_QA_SOURCE_CONSUMED_BYTES_CHANGED:'+changed.sort().join(','));
 return Object.freeze({consumedCount:seen.size,allWithinClosure:true,consumedRawBytesMatched:true});
}
export function createClosureSourceReader({root,closure,readBytes=file=>fs.readFileSync(path.join(root,file))}={}){
 const files=closureFiles(closure),consumed=new Map();assert.equal(typeof readBytes,'function');
 const read=file=>{
  assertOwnerQaSourcePath(file);assert.ok(Object.hasOwn(files,file),'OWNER_QA_SOURCE_READ_OUTSIDE_CLOSURE:'+file);
  const bytes=readBytes(file),text=sourceText(bytes,file),record=rawRecord(file,bytes);
  assert.equal(record.sha256,files[file],'OWNER_QA_SOURCE_CHANGED_DURING_RUN:'+file);
  remember(consumed,record);return text;
 };
 return Object.freeze({read,consumed:()=>snapshot(consumed)});
}
