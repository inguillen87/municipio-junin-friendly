// Optional local forensic tests. RAW255 remains private, immutable and inadmissible.
// No filesystem writes, SQL, constructor or subprocess. CI skips absent evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwner190NativeOutcomeLatch} from '../scripts/lib/owner190-native-outcome.mjs';
import {tokenizeOwner190CleanupNotice,evaluateOwner190CleanupProfile} from '../scripts/lib/owner190-cleanup-profile.mjs';
const root=path.resolve(import.meta.dirname,'..'),folder=path.join(root,'verification/authorized-qa-pg17-bb9925bd-r1');
const exists=fs.existsSync(path.join(folder,'255.sql.stderr.log'));
const hash=b=>createHash('sha256').update(b).digest('hex');
test('immutable RAW255 syntax is known but cannot retrospectively satisfy the new cleanup profile',{skip:!exists},()=>{
 const pins={
  '255.sql.stdout.log':{bytes:158,sha:'656476736048d3b88aef55fca572c7799ea0fda6392d92c734b416730a4c0722'},
  '255.sql.stderr.log':{bytes:5313,sha:'f626721532bd5afce9375e4bf870a334083980fa008768209a682c4491d04e89'},
  '255.sql.uncertain.json':{bytes:7794,sha:'227115ea3764624e328aa318ab9a3fc5918cd88f17feed0f0fdf6cf1979d3a22'}
 };
 const read=file=>fs.readFileSync(path.join(folder,file)),saved=new Map();
 for(const [file,pin]of Object.entries(pins)){const raw=read(file);assert.equal(raw.length,pin.bytes);assert.equal(hash(raw),pin.sha);saved.set(file,Buffer.from(raw));}
 const stdout=new TextDecoder('utf-8',{fatal:true}).decode(saved.get('255.sql.stdout.log'));
 const stderr=new TextDecoder('utf-8',{fatal:true}).decode(saved.get('255.sql.stderr.log'));
 const syntax=tokenizeOwner190CleanupNotice(stderr,{sqlFile:path.join(folder,'255.sql'),dropLine:54});
 assert.equal(syntax.announcedObjects,692);assert.equal(syntax.listedObjects,100);assert.equal(syntax.truncatedObjects,592);
 // Tokenization proves grammar only. No inventory is fabricated from stderr.
 const lines=stdout.split(/\r?\n/).filter(line=>line.trim());
 assert.throws(()=>evaluateOwner190CleanupProfile({profile:{kind:'cleanup'},lines,stderr}),/TWO_PROOFS_REQUIRED/);
 const token='08038d66-e431-4dce-9c74-0130a4d7dc88';
 const framed=read('255.sql').toString('utf8').split('\n'),sql=framed.slice(2,-2).join('\n');
 const latch=createOwner190NativeOutcomeLatch(),attempt=latch.begin({sql,end:'COMMIT',token});
 latch.markInvoked(attempt);
 const result={status:0,signal:null,error:undefined,stdout:saved.get('255.sql.stdout.log'),stderr:saved.get('255.sql.stderr.log')};
 latch.recordReturn(attempt,result);
 assert.throws(()=>latch.evaluate(attempt,result,{stdout:true,stderr:true,capture:true}),/STDERR_NONEMPTY/);
 for(const [file,raw]of saved)assert.deepEqual(read(file),raw);
});
