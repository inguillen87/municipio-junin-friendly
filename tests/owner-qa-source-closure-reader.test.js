import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertOwnerQaSourcePath,createRecordingSourceReader,assertConsumedWithinClosure,createClosureSourceReader} from '../scripts/lib/owner-qa-source-closure-reader.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const file='scripts/sql/synthetic.sql';

test('raw reader preserves CRLF bytes and shares the text reader evidence without exposing its source buffer',()=>{
 const bytes=Buffer.from('SELECT 1;\r\n'),reader=createRecordingSourceReader({readBytes:()=>bytes});
 assert.equal(typeof reader.readRaw,'function');const first=reader.readRaw(file);assert.ok(Buffer.isBuffer(first));assert.deepEqual(first,bytes);assert.notStrictEqual(first,bytes);
 first.fill(0);assert.equal(reader.read(file),'SELECT 1;\n');assert.deepEqual(reader.readRaw(file),bytes);
 assert.deepEqual(reader.consumed(),[{file,sha256:hash(bytes),bytes:bytes.length}]);assert.equal(assertConsumedWithinClosure(reader.consumed(),{files:{[file]:hash(bytes)}}).consumedRawBytesMatched,true);
});

test('raw reader enforces the frozen closure before IO and never turns normalized text into new expected bytes',()=>{
 let bytes=Buffer.from('SELECT 1;\r\n'),reads=0;const reader=createClosureSourceReader({closure:{files:{[file]:hash(bytes)}},readBytes:()=>{reads++;return bytes;}});
 assert.equal(typeof reader.readRaw,'function');assert.throws(()=>reader.readRaw('scripts/sql/outside.sql'),/READ_OUTSIDE_CLOSURE/);assert.equal(reads,0);
 const returned=reader.readRaw(file);returned.fill(0);assert.equal(reader.read(file),'SELECT 1;\n');assert.deepEqual(reader.readRaw(file),bytes);assert.equal(reader.consumed().length,1);
 bytes=Buffer.from('SELECT 1;\n');assert.throws(()=>reader.readRaw(file),/CHANGED_DURING_RUN/);assert.equal(reader.consumed()[0].sha256,hash(Buffer.from('SELECT 1;\r\n')));
});

test('raw reader rejects invalid paths, invalid UTF8 and changed bytes using the same rules as text reads',()=>{
 let bytes=Buffer.from('SELECT 1;\r\n');const reader=createRecordingSourceReader({readBytes:()=>bytes});assert.equal(typeof reader.readRaw,'function');
 for(const invalid of ['../x','C:/x','a\\x','a/../x'])assert.throws(()=>reader.readRaw(invalid),/PATH_INVALID/);
 reader.read(file);bytes=Buffer.from('SELECT 2;\r\n');assert.throws(()=>reader.readRaw(file),/CHANGED_BETWEEN_READS/);
 assert.throws(()=>createRecordingSourceReader({readBytes:()=>Buffer.from([0xff])}).readRaw(file),/UTF8_REQUIRED/);
 assert.throws(()=>createClosureSourceReader({closure:{files:{[file]:hash(Buffer.from([0xff]))}},readBytes:()=>Buffer.from([0xff])}).readRaw(file),/UTF8_REQUIRED/);
});
test('recorded raw A is rejected when a later closure and commit contain B, despite identical path',()=>{
 let bytes=Buffer.from('SELECT 1;\n');
 const recorder=createRecordingSourceReader({readBytes:()=>bytes});
 assert.equal(recorder.read(file),'SELECT 1;\n');
 const consumed=recorder.consumed();bytes=Buffer.from('SELECT 2;\n');
 assert.throws(()=>assertConsumedWithinClosure(consumed,{files:{[file]:hash(bytes)}}),/CONSUMED_BYTES_CHANGED/);
 assert.throws(()=>recorder.read(file),/CHANGED_BETWEEN_READS/);
 assert.equal(consumed[0].sha256,hash(Buffer.from('SELECT 1;\n')));
});
test('CRLF is normalized for constructors only after raw-byte evidence has been captured',()=>{
 const raw=Buffer.from('SELECT 1;\r\n'),reader=createRecordingSourceReader({readBytes:()=>raw});
 assert.equal(reader.read(file),'SELECT 1;\n');
 assert.deepEqual(reader.consumed(),[{file,sha256:hash(raw),bytes:raw.length}]);
 assert.equal(assertConsumedWithinClosure(reader.consumed(),{files:{[file]:hash(raw)}}).consumedRawBytesMatched,true);
 assert.throws(()=>assertConsumedWithinClosure(reader.consumed(),{files:{[file]:hash(Buffer.from('SELECT 1;\n'))}}),/CONSUMED_BYTES_CHANGED/);
});
test('recording preserves the full read set and rejects path-only, duplicate and missing evidence',()=>{
 const bytes=Buffer.from('synthetic source\n'),reader=createRecordingSourceReader({readBytes:()=>bytes});
 reader.read(file);reader.read('assets/synthetic.js');reader.read(file);
 assert.equal(reader.consumed().length,2);
 assert.throws(()=>assertConsumedWithinClosure([file],{files:{[file]:hash(bytes)}}),/RAW_RECORD_REQUIRED/);
 assert.throws(()=>assertConsumedWithinClosure([...reader.consumed(),reader.consumed()[0]],{files:{[file]:hash(bytes),'assets/synthetic.js':hash(bytes)}}),/DUPLICATE_READ_RECORD/);
 assert.throws(()=>assertConsumedWithinClosure(reader.consumed(),{files:{[file]:hash(bytes)}}),/READ_OUTSIDE_CLOSURE:assets\/synthetic.js/);
 for(const invalid of ['', '../x','a/../x','/x','C:/x','a\\x','a//x','a/./x','a/','a\0x'])assert.throws(()=>assertOwnerQaSourcePath(invalid),/PATH_INVALID/);
 assert.throws(()=>createRecordingSourceReader({readBytes:()=>Buffer.from([0xff])}).read(file),/UTF8_REQUIRED/);
});
test('continuations retain raw closure hashes and cannot mutate the snapshotted scope',()=>{
 let bytes=Buffer.from('SELECT 1;\r\n'),closure={files:{[file]:hash(bytes)}};
 const reader=createClosureSourceReader({closure,readBytes:()=>bytes});
 closure.files['scripts/sql/outside.sql']=hash(bytes);closure.files[file]=hash(Buffer.from('other'));
 assert.equal(reader.read(file),'SELECT 1;\n');
 assert.throws(()=>reader.read('scripts/sql/outside.sql'),/READ_OUTSIDE_CLOSURE/);
 bytes=Buffer.from('SELECT 1;\n');assert.throws(()=>reader.read(file),/CHANGED_DURING_RUN/);
 assert.equal(reader.consumed().length,1);
 assert.equal(Object.isFrozen(reader.consumed()),true);assert.equal(Object.isFrozen(reader.consumed()[0]),true);
});
