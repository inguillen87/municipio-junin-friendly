import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {verifyGzipSource} from '../scripts/verify-grh-backup-candidate.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
test('streaming backup verification binds exact compressed and decompressed bytes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'grh-candidate-'));
 try{const source=Buffer.from('CREATE TABLE synthetic_qa (id integer);\n'),gzip=gzipSync(source),file=path.join(dir,'qa.sql.gz');await fs.writeFile(file,gzip);
 const expected={gzipBytes:gzip.length,logicalBytes:source.length,gzipSha256:digest(gzip),sha256:digest(source)};
 const result=await verifyGzipSource(file,expected);assert.equal(result.logicalBytes,source.length);assert.equal(result.sourceSha256,expected.sha256);
 for(const patch of [{gzipBytes:gzip.length+1},{logicalBytes:source.length-1},{logicalBytes:source.length+1},{gzipSha256:'a'.repeat(64)},{sha256:'b'.repeat(64)}])await assert.rejects(verifyGzipSource(file,{...expected,...patch}));
 const truncated=gzip.subarray(0,-4);await fs.writeFile(file,truncated);await assert.rejects(verifyGzipSource(file,{...expected,gzipBytes:truncated.length,gzipSha256:digest(truncated)}));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
