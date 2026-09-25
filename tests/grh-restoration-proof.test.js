import test from 'node:test';import assert from 'node:assert/strict';
import {RESTORATION_VERSION,restorationHash,quoteRestorationIdentifier,restorationRowsSql,validateRestorationImage,compareRestorationImages,captureRestorationImage,RESTORATION_IDENTITY_SQL,RESTORATION_TABLES_SQL,RESTORATION_ROUTINES_SQL,RESTORATION_VIEWS_SQL,RESTORATION_INDEXES_SQL} from '../scripts/lib/grh-restoration-proof.mjs';
const hash='a'.repeat(64),other='b'.repeat(64),target={projectId:'project-qa',branchId:'br-source-qa',databaseName:'neondb'};
function signed(value){const {imageSha256,...body}=value;return{...body,imageSha256:restorationHash(body)};}
function fixture(mode='source'){
 return signed({version:RESTORATION_VERSION,mode,metadata:{database:mode==='source'?'neondb':'municontrol_recovery_qa',project:mode==='source'?target.projectId:null,branch:mode==='source'?target.branchId:null,read_only:'on',isolation:'repeatable read',major:17,host:'127.0.0.1',port:55472,database_bytes:'1000000'},
 tables:[{schema:'public',name:'example',kind:'r',bytes:'1000',definition_sha256:hash,rows:'5',sha256:hash}],
 routines:[{schema:'public',name:'normalize_digits(input text)',configuration:null,definition_sha256:hash},{schema:'public',name:'is_valid_cuil(input text)',configuration:null,definition_sha256:hash},{schema:'public',name:'independent_rule()',configuration:null,definition_sha256:hash}],
 views:[{schema:'public',name:'example_view',definition_sha256:hash}],indexes:[{schema:'public',name:'example_pkey',table:'example',bytes:'100',definition_sha256:hash,valid:true,ready:true}],containsPersonalRows:false});
}
test('row and object hashes compare the whole captured database, not table counts alone',()=>{
 const a=fixture(),b=fixture('isolated_restore');const r=compareRestorationImages(a,b);assert.equal(r.matched,true);assert.equal(r.tables,1);assert.equal(r.routines,3);assert.equal(r.publicationAuthorized,false);assert.equal(r.serviceCredentialsRestored,false);assert.equal(r.sequenceStateVerified,false);
});
for(const group of ['tables','routines','views','indexes']){
 test('missing '+group+' cannot certify restoration',()=>{const b=fixture('isolated_restore');b[group].pop();if(group==='tables'){assert.throws(()=>compareRestorationImages(fixture(),signed(b)));return;}const r=compareRestorationImages(fixture(),signed(b));assert.equal(r.matched,false);assert.equal(r.findings[0].reason,'missing');});
 test('additional '+group+' cannot certify restoration',()=>{const b=fixture('isolated_restore');b[group].push({...b[group][0],name:'unexpected'});const r=compareRestorationImages(fixture(),signed(b));assert.equal(r.matched,false);assert.equal(r.findings[0].reason,'unexpected');});
 test('changed '+group+' definition cannot certify restoration',()=>{const b=fixture('isolated_restore');b[group][0].definition_sha256=other;const r=compareRestorationImages(fixture(),signed(b));assert.equal(r.matched,false);assert.equal(r.findings[0].reason,'definition_changed');});
}
for(const field of ['rows','sha256'])test('same table inventory with altered '+field+' fails',()=>{
 const b=fixture('isolated_restore');b.tables[0][field]=field==='rows'?'6':other;assert.equal(compareRestorationImages(fixture(),signed(b)).findings[0].reason,'rows_changed');
});
test('smaller rebuilt indexes are measured, never labeled as production savings already achieved',()=>{
 const b=fixture('isolated_restore');b.indexes[0].bytes='50';b.tables[0].bytes='900';b.metadata.database_bytes='900000';const r=compareRestorationImages(fixture(),signed(b));assert.equal(r.matched,true);assert.equal(r.indexChanges[0].differenceBytes,50);assert.equal(r.sourceProductionWrites,0);assert.equal(r.publicationAuthorized,false);
});
test('only both exact known restore configurations can be explicitly accepted',()=>{
 const b=fixture('isolated_restore');b.routines[0].configuration=b.routines[1].configuration=['search_path=pg_catalog, public, pg_temp'];
 assert.equal(compareRestorationImages(fixture(),signed(b)).matched,false);const allowed=compareRestorationImages(fixture(),signed(b),{allowIdentityRepair:true});assert.equal(allowed.matched,true);assert.equal(allowed.localIdentityRepairs.length,2);
});
for(const mutation of [b=>b.routines[0].definition_sha256=other,b=>b.routines[0].configuration=['search_path=public, pg_temp'],b=>b.routines[2].configuration=['search_path=pg_catalog, public, pg_temp']])test('repair permission does not excuse a changed function or arbitrary configuration',()=>{
 const b=fixture('isolated_restore');mutation(b);assert.equal(compareRestorationImages(fixture(),signed(b),{allowIdentityRepair:true}).matched,false);
});
for(const field of ['tables','routines','indexes'])test('duplicate '+field+' object keys are rejected',()=>{const b=fixture();b[field].push({...b[field][0]});assert.throws(()=>validateRestorationImage(signed(b)));});
for(const kind of ['p','m','f'])test('unsupported relation kind '+kind+' cannot be silently omitted',()=>{const b=fixture();b.tables[0].kind=kind;assert.throws(()=>validateRestorationImage(signed(b)));});
for(const value of [null,'','a\nb','a\u0000b','x'.repeat(64),'á'.repeat(32),12,{}])test('unsafe identifier '+JSON.stringify(value)+' is rejected',()=>assert.throws(()=>quoteRestorationIdentifier(value)));
test('quoted identifiers cannot become statements',()=>{
 assert.equal(quoteRestorationIdentifier('test"name'),'"test""name"');const sql=restorationRowsSql('public','table"name');assert.ok(sql.includes('FROM "public"."table""name" r'));assert.match(sql,/ORDER BY h.digest COLLATE "C"/);assert.match(sql,/sha256\(convert_to\(to_jsonb\(r\)::text/);
});
for(const mutation of [b=>b.tables[0].sha256='bad',b=>b.tables[0].rows='-1',b=>b.metadata.major=18,b=>b.metadata.read_only='off',b=>b.metadata.isolation='read committed',b=>b.indexes[0].valid=false,b=>b.indexes[0].ready=false,b=>b.metadata.database_bytes='9007199254740992'])test('invalid proof metadata is refused',()=>{const b=fixture();mutation(b);assert.throws(()=>validateRestorationImage(signed(b)));});
test('manifest tampering without recomputing the content hash is refused',()=>{const b=fixture();b.tables[0].rows='6';assert.throws(()=>validateRestorationImage(b),{code:'RESTORATION_IMAGE_HASH'});});
function clientFor(image){const calls=[];return {calls,query:async text=>{calls.push(text);if(text===RESTORATION_IDENTITY_SQL)return {rows:[image.metadata]};if(text.startsWith('SET LOCAL'))return {rows:[]};if(text===RESTORATION_TABLES_SQL)return {rows:image.tables.map(({rows,sha256,...r})=>r)};if(text===RESTORATION_ROUTINES_SQL)return{rows:image.routines};if(text===RESTORATION_VIEWS_SQL)return{rows:image.views};if(text===RESTORATION_INDEXES_SQL)return{rows:image.indexes};if(text===restorationRowsSql('public','example'))return{rows:[{rows:'5',sha256:hash}]};throw Error('UNEXPECTED_QUERY');}};}
test('capture uses the caller-owned read-only snapshot and never returns records',async()=>{
 const c=clientFor(fixture());const image=await captureRestorationImage(c,{mode:'source',target});assert.equal(image.tables[0].rows,'5');assert.equal(image.containsPersonalRows,false);assert.equal(c.calls.filter(x=>x===RESTORATION_IDENTITY_SQL).length,2);assert.ok(c.calls.every(x=>x.startsWith('SELECT')||x.startsWith('SET LOCAL')));assert.doesNotMatch(JSON.stringify(image),/definition_source|personalName|password/);
});
for(const field of ['project','branch','database','read_only','isolation','major'])test('capture rejects wrong '+field+' before table access',async()=>{
 const image=fixture();image.metadata[field]=field==='major'?18:'WRONG';const c=clientFor(image);await assert.rejects(captureRestorationImage(c,{mode:'source',target}));assert.equal(c.calls.length,1);
});
test('restored capture refuses a live Neon identifier even on a loopback-looking connection',async()=>{
 const image=fixture('isolated_restore');image.metadata.project='neon-project';const c=clientFor(image);await assert.rejects(captureRestorationImage(c,{mode:'isolated_restore'}));assert.equal(c.calls.length,1);
});
test('aborted capture never starts inspecting a database',async()=>{
 const c=clientFor(fixture()),abort=new AbortController();abort.abort();await assert.rejects(captureRestorationImage(c,{mode:'source',target,signal:abort.signal}));assert.equal(c.calls.length,0);
});
test('unsupported table kinds and mutated target are rejected',async()=>{
 const image=fixture();image.tables[0].kind='f';const c=clientFor(image);await assert.rejects(captureRestorationImage(c,{mode:'source',target}));assert.ok(!c.calls.some(q=>q.includes('FROM "public"."example"')));
 const normal=clientFor(fixture());let reads=0;const wrapped={query:async q=>{const r=await normal.query(q);if(q===RESTORATION_IDENTITY_SQL&&++reads===2)r.rows[0]={...r.rows[0],branch:'other'};return r;}};await assert.rejects(captureRestorationImage(wrapped,{mode:'source',target}),{code:'RESTORATION_TARGET_CHANGED'});
});
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {parseRestorationArgs,verifyRestorationFiles} from '../scripts/verify-grh-restoration.mjs';
function files(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-restoration-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const source=fixture(),restored=fixture('isolated_restore'),archive=Buffer.from('PGDMP synthetic archive marker');const digest=createHash('sha256').update(archive).digest('hex');
 const a={'source-image':path.join(dir,'source.json'),'restored-image':path.join(dir,'restored.json'),archive:path.join(dir,'archive.dump'),'backup-receipt':path.join(dir,'receipt.json'),'expect-archive-sha256':digest};
 fs.writeFileSync(a['source-image'],JSON.stringify(source));fs.writeFileSync(a['restored-image'],JSON.stringify(restored));fs.writeFileSync(a.archive,archive);
 fs.writeFileSync(a['backup-receipt'],JSON.stringify({version:'municontrol-current-backup.v1',sourceImageSha256:source.imageSha256,archiveSha256:digest,archiveBytes:archive.length,sourceWrites:0,source:target}));return a;
}
test('offline evidence verifier binds archive bytes to the original capture and does not authorize staging',async t=>{
 const args=files(t),report=await verifyRestorationFiles(args);assert.equal(report.matched,true);assert.equal(report.productionWrites,0);assert.equal(report.stagingAuthorized,false);assert.equal(report.sourcePromoted,false);assert.equal(report.credentialsRestored,false);assert.equal(report.sequenceStateVerified,false);
 assert.doesNotMatch(JSON.stringify(report),/source.json|archive.dump|neondb_owner/);
});
test('changing archived bytes or mixing another capture rejects the report',async t=>{
 const args=files(t);fs.appendFileSync(args.archive,'other');await assert.rejects(verifyRestorationFiles(args),{code:'RESTORATION_ARCHIVE_CHANGED'});
 const receipt=JSON.parse(fs.readFileSync(args['backup-receipt']));receipt.sourceImageSha256=other;fs.writeFileSync(args['backup-receipt'],JSON.stringify(receipt));await assert.rejects(verifyRestorationFiles(args),{code:'RESTORATION_ARCHIVE_BINDING_INVALID'});
});
test('CLI requires absolute local evidence paths and exact archive hash',t=>{
 const args=files(t),argv=Object.entries(args).flatMap(([k,v])=>['--'+k,v]);assert.deepEqual({...parseRestorationArgs(argv)},args);
 for(const bad of [[],['--source-image','relative.json'],[...argv,'--database-url','private'],[...argv,'--commit'],[...argv,'--source-definitions',args['source-image']]])assert.throws(()=>parseRestorationArgs(bad));
});
test('oversized and malformed evidence files are not consumed as restoration proof',async t=>{
 const args=files(t);fs.writeFileSync(args['source-image'],'{broken');await assert.rejects(verifyRestorationFiles(args));fs.writeFileSync(args['source-image'],'x'.repeat(8*1024*1024+1));await assert.rejects(verifyRestorationFiles(args),{code:'RESTORATION_FILE_INVALID'});
});
