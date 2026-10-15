import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAdoptedDocumentaryInstallation,assertAdoptedDocumentaryDurability,documentaryInstallationSnapshot,DOCUMENTARY_INSTALL_FILE,DOCUMENTARY_INSTALL_SQL_SHA256,DOCUMENTARY_INSTALL_HELPER_SHA256} from '../scripts/lib/adopted-documentary-installation.mjs';

const sourceCommit='a'.repeat(40),read=file=>fs.readFileSync(file,'utf8');
const build=major=>buildAdoptedDocumentaryInstallation({read,sourceCommit,major});
const proof=(mode='first',major=17)=>({version:'adopted-documentary-installation.v1',sourceCommit,sqlSha256:DOCUMENTARY_INSTALL_SQL_SHA256,targetMajor:major,allChecksPassed:true,mode,newTables:0,newFunctions:1,adaptedReaders:3,runtimeHelpers:0,nominalRowsReturned:0,priorTableCount:96,...(mode==='verify'?{}:{beforeFingerprint:'b'.repeat(64)}),priorFingerprint:'b'.repeat(64),objectsFingerprint:'c'.repeat(64),dataFingerprint:'d'.repeat(64)});
const attest=(changes={},major=17)=>assertAdoptedDocumentaryDurability({installed:proof('first',major),durable:proof('verify',major),repeated:proof('repeat',major),sourceCommit,major,...changes});

test('review builder reads only pinned178 and never connects or executes SQL',()=>{
 for(const major of [17,18]){
  const files=[];const batch=buildAdoptedDocumentaryInstallation({read:file=>{files.push(file);return read(file);},sourceCommit,major});
  assert.deepEqual(files,[DOCUMENTARY_INSTALL_FILE]);assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);assert.equal(batch.sourceCommit,sourceCommit);assert.equal(batch.sqlSha256,DOCUMENTARY_INSTALL_SQL_SHA256);
  assert.equal(batch.migration.length,1);assert.equal(batch.beforePins.length,3);assert.equal(batch.afterPins.length,3);assert.equal(batch.helperPin.sha256,DOCUMENTARY_INSTALL_HELPER_SHA256);assert.equal(batch.helperPin.runtime,false);
  assert.ok(batch.beforePins.every(p=>p.runtime&&p.definer&&p.resultType==='jsonb'));
  assert.equal(batch.target.databaseOid,major===17?16395:16396);
 }
});

test('existing destinations accept only their exact observed before/after cohorts',()=>{
 const pg17=build(17),pg18=build(18);
 assert.deepEqual(pg17.pairs.map(p=>p.beforeHash),['ad5c9ce9df693d51e326b1708c79977e11fb1c49901be1c8d17d013d3fb4109c','fbb185e0809d25c0244c841d07b8fe44f26c6780115f8a36be3d692d7c3f50b9','4e38106e906d20e220b1ab58037474ab3d931f06c1e6af114f1b8a465363b3f1']);
 assert.deepEqual(pg18.pairs.map(p=>p.beforeHash),['80c11c8410657b17a0739d41d11fe45c398ec309f26d5db3ea819c83eda1b827','726d9068326a7dbc9659f2509f958d2ae062a546e0a7cd91b7b5e6abcb4cbb25','4e38106e906d20e220b1ab58037474ab3d931f06c1e6af114f1b8a465363b3f1']);
 for(const batch of [pg17,pg18]){
  assert.equal(batch.afterPins[2].sha256,'35fd9c09629bfb49687c446c0293aa8ea748aefa4e4d66031d0358bb87a6702b');
  const state=batch.installation.find(s=>s.startsWith('DO $state178$'));
  for(const value of ['transaction_isolation','pg_advisory_xact_lock(178)','all_before','all_after','DOCUMENTARY_INSTALL_PARTIAL_OR_UNREVIEWED_STATE'])assert.ok(state.includes(value),value);
  assert.ok(batch.pairs.every(p=>state.includes(p.beforeHash)&&state.includes(p.afterHash)));
 }
 assert.notEqual(pg17.beforePins[0].sha256,pg18.beforePins[0].sha256);
});

test('unreviewed source, wrong target and invalid release commit cannot generate a batch',()=>{
 assert.throws(()=>buildAdoptedDocumentaryInstallation({read:file=>read(file)+'\n-- drift',sourceCommit,major:17}),/Unreviewed documentary migration/);
 for(const major of [16,19,'17',null])assert.throws(()=>buildAdoptedDocumentaryInstallation({read,sourceCommit,major}),/DOCUMENTARY_INSTALL_TARGET_INVALID/);
 for(const commit of ['HEAD','',sourceCommit+'0','A'.repeat(40)])assert.throws(()=>buildAdoptedDocumentaryInstallation({read,sourceCommit:commit,major:17}));
});

test('conservation includes all old tables, leave records, functions, ACLs and sequences',()=>{
 for(const slot of ['before','after']){
  const sql=documentaryInstallationSnapshot(slot);
  assert.doesNotMatch(sql,/IS DISTINCT FROM to_regclass\('public\.native_leave_event'\)|proname LIKE 'native_leave_%'|NOT IN\s*\(SELECT oid FROM pg_class/);
  assert.match(sql,/p\.relkind IN \('r','p','m'\)/);assert.match(sql,/p\.oid IS DISTINCT FROM to_regprocedure\('public\.payroll_document_subject_v1\(jsonb,uuid\)'\)/);
  assert.equal((sql.match(/THEN to_jsonb\(p\)-'prosrc'/g)||[]).length,1);assert.equal((sql.match(/to_regprocedure\('public\.employee_payroll_detail_v1/g)||[]).length,1);
  for(const value of ['rowsSha256','metaSha256','pg_sequence','last_value','is_called','relacl','pg_depend','pg_default_acl','pg_auth_members','pg_roles','pg_policy','pg_get_viewdef','pg_type','pg_attribute','pg_get_indexdef','pg_event_trigger','DOCUMENTARY_INSTALL_FOREIGN_TABLE_UNAUDITED'])assert.ok(sql.includes(value),value);
  const additions=sql.slice(sql.indexOf(' result:=result||jsonb_build_object('));
  assert.doesNotMatch(additions,/\b(?:FROM|JOIN) pg_(?:class|namespace) [cn]\b/);assert.doesNotMatch(additions,/\b[cn]\.(?:oid|relname|relkind|nspname)/);
  assert.match(sql,/IF EXISTS\(SELECT 1 FROM pg_class documentary_relation JOIN pg_namespace documentary_namespace/);
  assert.ok(sql.includes('municontrol_documentary_install.'+slot));assert.doesNotMatch(sql,/municontrol_sql111\./);
 }
 assert.throws(()=>documentaryInstallationSnapshot('invalid'));
});

test('all facade metadata and owner-only helper ACL are checked before any commit',()=>{
 const b=build(17);
 for(const value of ['proowner<>current_user::regrole','proargmodes','proallargtypes','proargnames','pg_get_expr(p.proargdefaults','proconfig','provolatile','proparallel','proleakproof','prosupport','procost','prorows','aclexplode','a.grantee<>p.proowner',DOCUMENTARY_INSTALL_HELPER_SHA256])assert.ok(b.finalCheck.includes(value),value);
 assert.equal(b.installation.at(-2),b.finalCheck);assert.equal(b.repetition.at(-2),b.finalCheck);
 assert.ok(b.finalCheck.includes('"runtime":false'));
 assert.equal(b.helperPin.defaults,'');assert.deepEqual(b.helperPin.config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']);
 assert.match(b.audit,/\.before'\)::jsonb IS DISTINCT FROM current_setting\('municontrol_documentary_install\.after'\)::jsonb/);
});

test('transaction plans separate rollback rehearsal, durable read-only and idempotent repeat',()=>{
 for(const major of [17,18]){
  const b=build(major),t=b.transactions;
  assert.equal(t.rehearsal.completion,'ROLLBACK');assert.equal(t.install.completion,'COMMIT');assert.equal(t.durable.completion,'COMMIT');assert.equal(t.durable.readOnly,true);assert.equal(t.repeat.completion,'COMMIT');
  assert.equal(t.durable.statements[0],'SET TRANSACTION READ ONLY');assert.equal(t.rehearsal.begin,'BEGIN');assert.deepEqual(t.rehearsal.statements,t.install.statements);
  for(const statements of [b.installation,b.durableVerification,b.repetition]){
   const sql=statements.join('\n');
   for(const value of [b.target.projectId,b.target.branchId,b.target.endpointId,String(b.target.guardOid),String(b.target.databaseOid),'REPEATABLE READ',"timezone='UTC'",'has_schema_privilege','DOCUMENTARY_INSTALL_DATABASE_OID'])assert.ok(sql.includes(value),value);
   assert.ok(statements.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
  }
  const verify=b.durableVerification.join('\n');assert.ok(verify.includes('DOCUMENTARY_INSTALL_READ_ONLY_REQUIRED'));assert.doesNotMatch(verify,/CREATE FUNCTION|CREATE OR REPLACE FUNCTION|REVOKE|GRANT /i);
  const repeat=b.repetition.find(s=>s.startsWith('DO $state178$'));assert.ok(repeat.includes('AND false'));assert.ok(repeat.includes(".mode','repeat'"));
 }
});

test('read-only adapter preserves cutoff type and raw helper creation rejects inherited third-party ACL',()=>{
 const sql=read(DOCUMENTARY_INSTALL_FILE);assert.match(sql,/sourceCutoff'\)::timestamptz/);assert.doesNotMatch(sql,/sourceCutoff'\)::timestamp\)/);
 const final=sql.slice(sql.lastIndexOf(" IF has_function_privilege('municontrol_actions_runtime_app'"));
 assert.match(final,/aclexplode/);assert.match(final,/a\.grantee<>p\.proowner/);assert.match(final,/PAYROLL_DOCUMENT_HELPER_EXPOSED/);
});

test('durability accepts aggregate exact installation, read-only and unchanged repetition',()=>{
 for(const major of [17,18]){const result=attest({},major);assert.equal(result.passed,true);assert.equal(result.nominalRowsReturned,0);assert.equal(result.major,major);}
 assert.equal(attest({installed:proof('repeat')}).passed,true);
});

test('durability rejects changed data, metadata, source, rows, scope, counts and nominal proof extras',()=>{
 const changes=[{sourceCommit:'f'.repeat(40)},{sqlSha256:'0'.repeat(64)},{targetMajor:18},{allChecksPassed:false},{mode:'first'},{newTables:1},{newFunctions:2},{adaptedReaders:2},{runtimeHelpers:1},{nominalRowsReturned:1},{priorTableCount:0},{priorTableCount:97},{priorFingerprint:'e'.repeat(64)},{objectsFingerprint:'e'.repeat(64)},{dataFingerprint:'e'.repeat(64)},{dataFingerprint:'not-a-hash'},{nominalIdentity:'PRIVATE'},{beforeFingerprint:'b'.repeat(64)}];
 for(const change of changes)assert.throws(()=>attest({durable:{...proof('verify'),...change}}),JSON.stringify(change));
 assert.throws(()=>attest({installed:{...proof(),beforeFingerprint:'e'.repeat(64)}}));
 assert.throws(()=>attest({repeated:{...proof('repeat'),beforeFingerprint:'e'.repeat(64)}}));
 assert.throws(()=>attest({repeated:{...proof('repeat'),mode:'verify'}}));
 assert.throws(()=>attest({repeated:null}));
 assert.throws(()=>attest({major:19}));
});
