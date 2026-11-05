import test from 'node:test';
import assert from 'node:assert/strict';
import { configurationCollector, StrictConfigScanner, TABLES, SOURCE_CONTRACT, validateConfigurationProfile, validateConfigurationCustody, parseArgs, hash, scanConfigurationSource, writeConfigurationResult } from '../scripts/extract-grh-payroll-configuration.mjs';
import { Readable } from 'node:stream';
import { createHash as createHashForTest } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtemp, open, readFile, readdir, rm, writeFile, link as linkForTest } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BackupProfileError, profileSqlFile, profileSqlSourceStream } from '../scripts/profile-grh-backup.mjs';
// Entirely fictional configuration. Never replace with municipal rows.
const expected = TABLES.map(name => ({ name, rowCount: 2, columns: [{ name: 'ID', type: 'int', nullable: false }, { name: 'VALUE', type: 'varchar(240)', nullable: true }], primaryKey: ['ID'] }));
const fixture = TABLES.map(t => `CREATE TABLE \`${t}\` (\`ID\` int NOT NULL,\`VALUE\` varchar(240),PRIMARY KEY (\`ID\`));INSERT INTO \`${t}\` VALUES (1,NULL),(2,'a''b\\n\\\\c\\\'d,; 0.010000');`).join('\n');
function collect(text, size = 23, contract = expected) {
  const c = configurationCollector(contract), s = new StrictConfigScanner(c.onStatement);
  for (let i = 0; i < text.length; i += size) s.feed(text.slice(i, i + size));
  s.feed('', true); return c.finish({ sha256: 'synthetic' }, s.audit);
}
test('complete four-table recovery preserves NULL, empty, exact decimal and keys without source execution', () => {
  const a = collect(fixture);
  assert.equal(a.tables.length, 4); assert.equal(a.approved, false); assert.equal(a.payrollExecutionAllowed, false);
  for (const t of a.tables) { assert.equal(t.rows[0].VALUE, null); assert.equal(t.rows[1].VALUE, "a'b\n\\c'd,; 0.010000"); }
  const adjusted = fixture.replace("(1,NULL)", "(1,'')"); assert.equal(collect(adjusted).tables[0].rows[0].VALUE, '');
  assert.equal(a.effectiveFrom, null); assert.equal(a.effectiveUntil, null);
});
test('chunk boundaries/comments and nominal table bodies cannot enter result', () => {
  const safe = `-- hi\n/* harmless */\nCREATE TABLE \`persona\` (\`ID\` int,\`name\` text);INSERT INTO \`persona\` VALUES (1,'FAKE_PRIVATE_PERSON; INSERT INTO codliq (999)');\n${fixture}\n# end`;
  const a = collect(safe, 4096);
  for (const size of [1, 2, 3, 7, 31]) assert.deepEqual(collect(safe, size), a);
  assert.doesNotMatch(JSON.stringify(a), /FAKE_PRIVATE_PERSON|persona|"name":"name"/);
  assert.deepEqual(a.audit, { statements: 10, creates: 5, inserts: 5 });
});
test('COPY/REPLACE/LOAD/UPDATE/DELETE/TRUNCATE cannot be silently mistaken for INSERT evidence', () => {
  for (const op of ['COPY', 'REPLACE', 'LOAD', 'UPDATE', 'DELETE', 'TRUNCATE']) assert.throws(() => collect(`${fixture}\n${op} codliq FROM 'synthetic';`), /CONFIG_DATA_DIALECT_UNSUPPORTED/);
});
test('complete schema/count/key guards reject omission, duplicates, changed columns and truncation', () => {
  assert.throws(() => collect(fixture.replace('(1,NULL),(2,', '(2,')), /ROW_COUNT_MISMATCH/);
  assert.throws(() => collect(fixture.replace('(2,', '(1,')), /DUPLICATE_KEY/);
  assert.throws(() => collect(fixture.replace('varchar(240)', 'varchar(241)')), /SCHEMA_DRIFT/);
  assert.throws(() => collect(fixture.slice(0, -1)), /SQL_TRUNCATED/);
  assert.throws(() => collect(fixture.replace('VALUES (1,NULL),(2,', '(`ID`) VALUES (1),(2,')), /INCOMPLETE_ROW/);
});
test('unquoted/qualified INSERT or executable expressions are rejected instead of assumed compatible', () => {
  assert.throws(() => collect(fixture.replace('INSERT INTO `codliq`', 'INSERT INTO codliq')), /HEADER_UNSUPPORTED/);
  assert.throws(() => collect(fixture.replace('INSERT INTO `codliq`', 'INSERT INTO `db`.`codliq`')), /ROW_COUNT_MISMATCH/);
  assert.throws(() => collect(fixture.replace('(1,NULL)', '(1,SLEEP(1))')), /EXPRESSION_NOT_ALLOWED/);
});

// Technical synthetic metadata only. No municipal amount or formula appears here.
function profileFixture() {
  return {source:{container:'gzip',sha256:SOURCE_CONTRACT.gzipSha256,bytes:SOURCE_CONTRACT.bytes,logicalBytes:SOURCE_CONTRACT.logicalBytes},sql:{dialect:'MariaDB/MySQL',statementCount:15,createTableStatements:6,alterTableStatements:1,insertStatements:7},tables:TABLES.map(name=>({name,rowCount:SOURCE_CONTRACT.rowCounts[name],columns:[{name:'ID',type:'int',nullable:false},{name:'VALUE',type:'varchar(240)',nullable:true}],primaryKey:['ID']}))};
}
const custodyFixture = () => ({sha256:SOURCE_CONTRACT.gzipSha256,sqlSha256:SOURCE_CONTRACT.sqlSha256,bytes:SOURCE_CONTRACT.bytes,logicalBytes:SOURCE_CONTRACT.logicalBytes,audit:{statements:15,creates:6,inserts:7}});
test('full recovery retains non-modeled CREATE evidence without interpreting DEFAULT or CHECK',()=>{
  const q=String.fromCharCode(96);
  const ddl=fixture.replaceAll(q+'VALUE'+q+' varchar(240),PRIMARY KEY',q+'VALUE'+q+" varchar(240) DEFAULT 'opaque',CHECK ("+q+'ID'+q+' > 0),PRIMARY KEY');
  const result=collect(ddl,3);
  for(const table of result.tables){
    assert.ok(table.createStatement.includes("DEFAULT 'opaque'"));assert.ok(table.createStatement.includes('CHECK ('+q+'ID'+q+' > 0)'));
    assert.equal(table.createStatementSha256,hash(table.createStatement));assert.equal(table.createStatementFormat,'scanner_statement_without_comments_or_terminator');
    assert.equal(table.rows.length,2);assert.equal(table.rows[0].VALUE,null);
  }
});
test('full recovery keeps exact cell values and schema PK independently of column-list order',()=>{
  const q=String.fromCharCode(96);
  const sql=TABLES.map(t=>'CREATE TABLE '+q+t+q+' ('+q+'ID'+q+' int NOT NULL,'+q+'VALUE'+q+' varchar(240),PRIMARY KEY ('+q+'ID'+q+'));INSERT INTO '+q+t+q+' ('+q+'VALUE'+q+','+q+'ID'+q+") VALUES ('',1),('0.010000',2);").join('\n');
  const result=collect(sql,1);for(const t of result.tables){assert.equal(t.rows[0].VALUE,'');assert.equal(t.rows[1].VALUE,'0.010000');assert.equal(t.rows[0].ID,'1');assert.deepEqual(t.schema.primaryKey,['ID']);}
});
test('Oct28 profile admission rejects wrong source or dialect before the extraction pass',()=>{
  const good=profileFixture(),before=structuredClone(good);assert.equal(validateConfigurationProfile(good).length,4);assert.deepEqual(good,before);
  for(const mutate of[p=>p.source.sha256='0'.repeat(64),p=>p.source.bytes--,p=>p.source.logicalBytes--,p=>p.source.container='plain-sql',p=>p.sql.dialect='PostgreSQL']){
    const bad=profileFixture();mutate(bad);assert.throws(()=>validateConfigurationProfile(bad),/CONFIG_SOURCE_PROFILE_MISMATCH/);
  }
});
test('Oct28 profile rejects omitted, duplicate, miscounted or keyless configuration tables',()=>{
  for(const mutate of[p=>p.tables.pop(),p=>p.tables[1]=structuredClone(p.tables[0]),p=>p.tables[0].rowCount--,p=>p.tables[0].primaryKey=[],p=>p.tables[0].columns.push(structuredClone(p.tables[0].columns[0])),p=>p.tables[0].primaryKey=['ABSENT']]){
    const bad=profileFixture();mutate(bad);assert.throws(()=>validateConfigurationProfile(bad),/CONFIG_EXPECTED_SCHEMA_INVALID/);
  }
  for(const mutate of[p=>p.sql.statementCount=-1,p=>p.sql.createTableStatements='6',p=>p.sql.insertStatements=Number.MAX_SAFE_INTEGER+1,p=>p.sql.alterTableStatements=null]){
    const bad=profileFixture();mutate(bad);assert.throws(()=>validateConfigurationProfile(bad),/CONFIG_PROFILE_AUDIT_INVALID/);
  }
});
test('second pass needs gzip AND complete logical SQL hashes plus both exact byte counts',()=>{
  assert.doesNotThrow(()=>validateConfigurationCustody(custodyFixture(),profileFixture()));
  for(const mutate of[c=>c.sha256='0'.repeat(64),c=>c.sqlSha256='0'.repeat(64),c=>c.bytes--,c=>c.logicalBytes--]){
    const bad=custodyFixture();mutate(bad);assert.throws(()=>validateConfigurationCustody(bad,profileFixture()),/CONFIG_SOURCE_HASH_OR_COUNT_MISMATCH/);
  }
  for(const field of['statements','creates','inserts']){const bad=custodyFixture();bad.audit[field]--;assert.throws(()=>validateConfigurationCustody(bad,profileFixture()),/CONFIG_STATEMENT_COUNT_MISMATCH/);}
});
test('CLI cannot choose a different profile, omit output, repeat flags or add an execution option',()=>{
  assert.deepEqual(parseArgs(['--input','source.gz','--output','private.json']),{input:'source.gz',output:'private.json'});
  assert.deepEqual(parseArgs(['--output','private.json','--input','source.gz']),{output:'private.json',input:'source.gz'});
  for(const args of[[],['--input','source.gz'],['--input','a','--input','b'],['--profile','old.json','--output','b'],['--input','a','--output','b','--execute','true'],['--input','','--output','b']])assert.throws(()=>parseArgs(args),/CONFIG_/);
});

// IO qualification proposals: temporary fictional files only; never the pinned backup.
async function withIoTemp(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), 'mc-config-reader-io-'));
  try { return await callback(directory); }
  finally {
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('mc-config-reader-io-'));
    await rm(directory, {recursive:true,force:true});
  }
}
function failingReadable(message = 'SYNTHETIC_PRIVATE_ERROR') {
  return new Readable({read() { this.destroy(new Error(message)); }});
}
function hangingReadable(firstChunk) {
  let sent = false;
  return new Readable({read() { if (!sent) { sent = true; this.push(firstChunk); } }});
}
test('profiler API keeps exact synthetic gzip/plain metadata and excludes row literals', async()=>{
  await withIoTemp(async directory=>{
    const plain=path.join(directory,'synthetic.sql'), compressed=path.join(directory,'synthetic.sql.gz');
    await writeFile(plain,fixture,'utf8');await writeFile(compressed,gzipSync(Buffer.from(fixture)));
    const a=await profileSqlFile(plain),b=await profileSqlFile(compressed);
    assert.deepEqual(a.tables,b.tables);assert.deepEqual(a.sql,b.sql);
    assert.equal(a.source.logicalBytes,Buffer.byteLength(fixture));assert.equal(b.source.logicalBytes,a.source.logicalBytes);
    assert.equal(a.source.sha256,hash(fixture));assert.equal(b.source.sha256,hashBytes(gzipSync(Buffer.from(fixture))));
    assert.equal(b.summary.rowCount,8);assert.doesNotMatch(JSON.stringify(b),/0\.010000|a'b/);
  });
});
function hashBytes(value) { return createHashForTest('sha256').update(value).digest('hex'); }
test('profiler catches an upstream read error and destroys its source for plain and gzip',async()=>{
  for(const isGzip of[false,true]){
    const input=failingReadable();
    await assert.rejects(profileSqlSourceStream(input,{isGzip,sourceBytes:128}),error=>error instanceof BackupProfileError && !error.message.includes('SYNTHETIC_PRIVATE_ERROR'));
    assert.equal(input.destroyed,true);
  }
});
test('profiler consumer/parser failure destroys a still-open synthetic source',{timeout:5000},async()=>{
  const input=hangingReadable(Buffer.from('CREATE TABLE `x` (`ID` int);INSERT INTO `x` VALUES nope;   '));
  await assert.rejects(profileSqlSourceStream(input,{isGzip:false,sourceBytes:256}),BackupProfileError);
  assert.equal(input.destroyed,true);
});
test('profiler rejects corrupt gzip through the pipeline and destroys the source',async()=>{
  const input=Readable.from([Buffer.from('not gzip')]);
  await assert.rejects(profileSqlSourceStream(input,{isGzip:true,sourceBytes:8}),BackupProfileError);
  assert.equal(input.destroyed,true);
});
test('second-pass pipeline measures exact synthetic bytes and hashes without weakening final custody',async()=>{
  const compressed=gzipSync(Buffer.from(fixture)),c=configurationCollector(expected),input=Readable.from([compressed]);
  const custody=await scanConfigurationSource(input,c.onStatement),result=c.finish({sha256:'synthetic'},custody.audit);
  assert.equal(input.destroyed,true);assert.equal(custody.sha256,hashBytes(compressed));assert.equal(custody.sqlSha256,hash(fixture));
  assert.equal(custody.bytes,compressed.length);assert.equal(custody.logicalBytes,Buffer.byteLength(fixture));assert.equal(result.tables.length,4);
  assert.throws(()=>validateConfigurationCustody(custody,profileFixture()),/CONFIG_SOURCE_HASH_OR_COUNT_MISMATCH/);
});
test('second-pass upstream and collector failures destroy the source and produce no output',async()=>{
  const broken=failingReadable();await assert.rejects(scanConfigurationSource(broken,()=>{}));assert.equal(broken.destroyed,true);
  const input=Readable.from([gzipSync(Buffer.from(fixture))]);
  await assert.rejects(scanConfigurationSource(input,()=>{throw new Error('SYNTHETIC_COLLECTOR_FAILURE');}),/SYNTHETIC_COLLECTOR_FAILURE/);
  assert.equal(input.destroyed,true);
});
test('private delivery closes and syncs a wx0600 temporary before exclusive promotion',async()=>{
  await withIoTemp(async directory=>{
    const output=path.join(directory,'result.json'),events=[];let temporary;
    const result={version:'synthetic',approved:false};
    await writeConfigurationResult(output,result,{openFile:async(p,flags,mode)=>{
      temporary=p;assert.equal(flags,'wx');assert.equal(mode,0o600);assert.equal(path.dirname(p),directory);events.push('open');
      const h=await open(p,flags,mode);return{writeFile:async(...args)=>{events.push('write');return h.writeFile(...args);},sync:async()=>{events.push('sync');return h.sync();},close:async()=>{events.push('close');return h.close();}};
    },linkFile:async(from,to)=>{assert.equal(from,temporary);assert.equal(to,output);assert.deepEqual(events,['open','write','sync','close']);return linkForTest(from,to);}});
    assert.equal(await readFile(output,'utf8'),`${JSON.stringify(result,null,2)}\n`);assert.deepEqual(await readdir(directory),['result.json']);
  });
});
test('an existing destination is never overwritten and the completed temporary is removed',async()=>{
  await withIoTemp(async directory=>{
    const output=path.join(directory,'result.json');await writeFile(output,'EXISTING_SYNTHETIC_BYTES','utf8');
    await assert.rejects(writeConfigurationResult(output,{new:true}),error=>error.code==='EEXIST');
    assert.equal(await readFile(output,'utf8'),'EXISTING_SYNTHETIC_BYTES');assert.deepEqual(await readdir(directory),['result.json']);
  });
});
test('partial write failure leaves neither final result nor partial temporary and closes the handle',async()=>{
  await withIoTemp(async directory=>{
    const output=path.join(directory,'result.json');let closed=false,links=0;
    await assert.rejects(writeConfigurationResult(output,{synthetic:true},{openFile:async(p,flags,mode)=>{
      const h=await open(p,flags,mode);return{writeFile:async()=>{await h.writeFile('{"partial":');throw new Error('SYNTHETIC_DISK_FULL');},sync:()=>h.sync(),close:async()=>{closed=true;return h.close();}};
    },linkFile:async()=>{links++;}}),/SYNTHETIC_DISK_FULL/);
    assert.equal(closed,true);assert.equal(links,0);assert.deepEqual(await readdir(directory),[]);
  });
});
test('destination creation immediately before promotion still wins without TOCTOU replacement',async()=>{
  await withIoTemp(async directory=>{
    const output=path.join(directory,'result.json');
    await assert.rejects(writeConfigurationResult(output,{synthetic:true},{linkFile:async(from,to)=>{
      await writeFile(to,'SYNTHETIC_RACE_WINNER',{flag:'wx'});return linkForTest(from,to);
    }}),error=>error.code==='EEXIST');
    assert.equal(await readFile(output,'utf8'),'SYNTHETIC_RACE_WINNER');assert.deepEqual(await readdir(directory),['result.json']);
  });
});
test('unsupported exclusive hardlink fails closed without a rename or copy fallback',async()=>{
  await withIoTemp(async directory=>{
    const output=path.join(directory,'result.json');
    await assert.rejects(writeConfigurationResult(output,{synthetic:true},{linkFile:async()=>{throw Object.assign(new Error('SYNTHETIC_LINK_UNSUPPORTED'),{code:'ENOSYS'});}}),error=>error.code==='ENOSYS');
    assert.deepEqual(await readdir(directory),[]);
  });
});
test('cleanup failure after delivery is explicit and preserves the complete final artifact',async()=>{
  await withIoTemp(async directory=>{
    const output=path.join(directory,'result.json'),result={synthetic:true};
    await assert.rejects(writeConfigurationResult(output,result,{unlinkFile:async()=>{throw new Error('SYNTHETIC_UNLINK_DENIED');}}),/CONFIG_OUTPUT_DELIVERED_TEMP_CLEANUP_REQUIRED/);
    assert.deepEqual(JSON.parse(await readFile(output,'utf8')),result);assert.equal((await readdir(directory)).length,2);
  });
});
