import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseWorkdaySchemaArguments,verifyWorkdaySchemaConnection,verifyWorkdayFunctionDefinition,prepareWorkdaySchema,WORKDAY_SCHEMA_TARGET} from '../scripts/apply-continuous-workdays-schema.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const checksum=digest(fs.readFileSync('scripts/migrations/065-clock-workday-source-continuous.sql'));
const url=`postgresql://neondb_owner:synthetic-only@${WORKDAY_SCHEMA_TARGET.host}/neondb?sslmode=require`;
const args=backup=>[`--confirm-operational-branch=${WORKDAY_SCHEMA_TARGET.branchId}`,`--backup-report=${backup}`,`--expected-checksum=${checksum}`];
test('applier arguments demand target, reviewed bytes and backup without default commit',()=>{
 assert.equal(parseWorkdaySchemaArguments(args('synthetic.json')).apply,undefined);
 for(const bad of [[],args('x').slice(1),[...args('x'),'--apply=yes'],[...args('x'),'--apply=true','--apply=false'],[...args('x'),'--force=true']])assert.throws(()=>parseWorkdaySchemaArguments(bad));
});
test('applier rejects other endpoints and connection routing rather than rewriting the target',()=>{
 assert.equal(verifyWorkdaySchemaConnection(url).hostname,WORKDAY_SCHEMA_TARGET.host);
 for(const bad of [url.replace(WORKDAY_SCHEMA_TARGET.host,'other.example.test'),url.replace('/neondb','/other'),url.replace('neondb_owner','runtime'),url.replace('sslmode=require','sslmode=disable'),url+'&options=endpoint%3Dother',url+'&sslmode=require'])assert.throws(()=>verifyWorkdaySchemaConnection(bad));
});
test('a matching ledger cannot hide changed installed function code or execution context',()=>{
 const sql=fs.readFileSync('scripts/migrations/065-clock-workday-source-continuous.sql','utf8');
 const valid={body:/AS \$\$([\s\S]+?)\$\$;/.exec(sql)[1],owner:'neondb_owner',language:'plpgsql',config:['search_path=public, pg_temp']};
 verifyWorkdayFunctionDefinition(valid,sql);
 for(const patch of [{body:'BEGIN RETURN NULL; END'},{owner:'other'},{language:'sql'},{config:['search_path=pg_temp, public']}])
  assert.throws(()=>verifyWorkdayFunctionDefinition({...valid,...patch},sql));
});
test('offline preflight proves recent restored backup and exact migration/backup bytes before opening any DB',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'workday-backup-test-'));
 try {
  const archive=path.join(directory,'synthetic-backup.bin'),report=path.join(directory,'report.json'),bytes=Buffer.from('synthetic backup proof');fs.writeFileSync(archive,bytes);
  const now=Date.now(),valid={branchId:WORKDAY_SCHEMA_TARGET.branchId,projectId:WORKDAY_SCHEMA_TARGET.projectId,restorationVerified:true,completedAt:new Date(now-1000).toISOString(),file:path.basename(archive),sha256:digest(bytes)};
  const write=value=>fs.writeFileSync(report,JSON.stringify(value));write(valid);
  const prepared=await prepareWorkdaySchema(args(report),{DATABASE_URL:url},now);
  assert.equal(prepared.apply,false);assert.equal(prepared.checksum,checksum);
  for(const patch of [{restorationVerified:false},{branchId:'other'},{completedAt:new Date(now+1000).toISOString()},{completedAt:new Date(now-86400001).toISOString()},{file:'../synthetic-backup.bin'},{sha256:'a'.repeat(64)}]){
   write({...valid,...patch});await assert.rejects(()=>prepareWorkdaySchema(args(report),{DATABASE_URL:url},now));
  }
  write(valid);await assert.rejects(()=>prepareWorkdaySchema(args(report).map(a=>a.startsWith('--expected-checksum=')?'--expected-checksum='+'a'.repeat(64):a),{DATABASE_URL:url},now),/REVIEWED_MIGRATION_CHANGED/);
 }finally{
  assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('workday-backup-test-'));
  fs.rmSync(directory,{recursive:true,force:true});
 }
});
