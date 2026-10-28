// Pure source contracts only. No SQL/client, SDK, fixture QA, worker or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
// Enforced before loading the new module. This file runs in an isolated test
// process, or with --test-isolation=none when it is the only selected test file.
const forbidden=()=>{throw new Error('ANNUL_LEDGER_PURE_TEST_EXTERNAL_IO_FORBIDDEN');};
net.connect=net.createConnection=net.Socket.prototype.connect=tls.connect=forbidden;
http.request=http.get=https.request=https.get=forbidden;globalThis.fetch=forbidden;
for(const name of Object.keys(dns))if(/^(?:lookup|resolve|reverse)/.test(name)&&typeof dns[name]==='function')dns[name]=forbidden;
for(const name of Object.keys(dns.promises))if(typeof dns.promises[name]==='function')dns.promises[name]=forbidden;
for(const name of['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])childProcess[name]=forbidden;
syncBuiltinESMExports();
const{buildOwnAnnulmentLedgerContract,OWN_ANNULMENT_LEDGER_CONTRACT_VERSION,OWN_ANNULMENT_LEDGER_SOURCE_PINS,OWN_ANNULMENT_LEDGER_TABLE_NAMES}=await import('../scripts/lib/own-annulment-ledger-contract.mjs');
const readRaw=file=>fs.readFileSync(new URL('../'+file,import.meta.url));
const sourceCommit='fb71f4c38029004ed5c064cff7a70520c3b0ad2d';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const build=(reader=readRaw)=>buildOwnAnnulmentLedgerContract({readRaw:reader,sourceCommit});
const names={
 own_payroll_run_capture:['id','tenant_id','source_binding_id','actor_membership_id','actor_person_id','actor_email','actor_session_id','actor_session_version','release_sha','request_key','body','body_sha256','algorithm_sha256','payload','payload_sha256','created_at'],
 own_payroll_run_result:['capture_id','algorithm_sha256','input','result','input_sha256','result_sha256','recorded_at'],
 own_payroll_liquidation_event:['id','tenant_id','source_binding_id','capture_id','command','actor_membership_id','actor_person_id','actor_email','actor_label','actor_session_id','actor_session_version','release_sha','request_key','body','body_sha256','changes','receipt','recorded_at'],
 own_payroll_close_event:['id','tenant_id','source_binding_id','group_id','command','period','liquidation_type','actor_membership_id','actor_person_id','actor_email','actor_label','actor_session_id','actor_session_version','release_sha','request_key','body','body_sha256','snapshot','snapshot_sha256','receipt','recorded_at'],
 own_payroll_annul_event:['id','tenant_id','source_binding_id','actor_membership_id','actor_person_id','actor_email','actor_label','actor_session_id','actor_session_version','release_sha','request_key','body','body_sha256','receipt','recorded_at']
};

test('all77 columns retain source order, exact types and primary-key nullability across all five tables',()=>{
 const contract=build();assert.equal(contract.version,OWN_ANNULMENT_LEDGER_CONTRACT_VERSION);
 assert.deepEqual(contract.tables.map(t=>t.name),Object.keys(names));assert.deepEqual(OWN_ANNULMENT_LEDGER_TABLE_NAMES,Object.keys(names));
 assert.equal(contract.tables.reduce((n,t)=>n+t.columns.length,0),77);
 for(const table of contract.tables){
  assert.deepEqual(table.columns.map(c=>c.name),names[table.name],table.name+' complete declared column list');
  assert.deepEqual(table.columns.map(c=>c.position),names[table.name].map((_,i)=>i+1));
  assert.ok(table.columns.every(c=>c.notNull),'PRIMARY KEY also implies NOT NULL');
  assert.ok(table.columns.every(c=>c.typmod===-1&&c.identity===''&&c.generated===''&&c.collation==='declared-type-default'));
 }
 const column=(table,name)=>contract.tables.find(t=>t.name===table).columns.find(c=>c.name===name);
 assert.equal(column('own_payroll_run_capture','id').type,'pg_catalog.uuid');
 assert.equal(column('own_payroll_run_capture','actor_session_version').type,'pg_catalog.int4');
 assert.equal(column('own_payroll_close_event','period').type,'pg_catalog.text');
 assert.equal(column('own_payroll_run_result','result').type,'pg_catalog.jsonb');
 assert.equal(column('own_payroll_run_capture','created_at').type,'pg_catalog.timestamptz');
 assert.equal(column('own_payroll_run_capture','created_at').displayType,'timestamp with time zone');
 assert.equal(column('own_payroll_run_result','capture_id').default.kind,'none','referenced capture PK must not generate a new ID');
});

test('four UUID and five timestamp defaults are resolved to pg_catalog without an observed dependency requirement',()=>{
 const contract=build(),defaults=contract.tables.flatMap(t=>t.columns.filter(c=>c.default.kind!=='none').map(c=>({table:t.name,...c.default})));
 assert.equal(defaults.length,9);
 assert.deepEqual(defaults.filter(d=>d.qualifiedFunction==='pg_catalog.gen_random_uuid()').map(d=>d.table),['own_payroll_run_capture','own_payroll_liquidation_event','own_payroll_close_event','own_payroll_annul_event']);
 assert.equal(defaults.filter(d=>d.qualifiedFunction==='pg_catalog.clock_timestamp()').length,5);
 for(const value of defaults){assert.equal(value.qualifiedFunction.slice('pg_catalog.'.length),value.sourceExpression);assert.equal(value.expression,value.sourceExpression);assert.equal(value.dependencyRequired,false);}
 assert.equal(contract.defaultResolution.catalogDependencyRequired,false);
 assert.equal(contract.defaultResolution.settingsSource,'scripts/prepare-own-payroll-installation.mjs');
 assert.equal(contract.defaultResolution.qualifiedBuiltinUuid,'pg_catalog.gen_random_uuid()');
 // A missing builtin pg_depend edge is normal. The binding guard instead uses
 // the qualified function identity, exact deparse and the FuncExpr root OID.
 assert.match(contract.guard,/to_regprocedure\(x->>'defaultFunction'\)/);
 assert.match(contract.guard,/FUNCEXPR :funcid/);assert.match(contract.guard,/expected_function::text/);
 assert.doesNotMatch(contract.guard,/\b(?:3432|32789)\b|public\.gen_random_uuid\(\)/);
 assert.doesNotMatch(contract.guard,/count\([^)]*\)[\s\S]{0,100}FROM pg_catalog\.pg_depend/);
 assert.doesNotMatch(contract.guard,/replace\(|regexp_replace\(/,'no indiscriminate default expression normalization');
});

test('source authority is complete RAW custody, with exact extraction inverses and only the six201 CHECK alterations',()=>{
 const contract=build();assert.equal(Object.keys(contract.sourceHashes).length,7);
 for(const[file,pin]of Object.entries(OWN_ANNULMENT_LEDGER_SOURCE_PINS)){
  const raw=readRaw(file);assert.equal(raw.length,pin.bytes);assert.equal(hash(raw),pin.sha256);assert.equal(contract.sourceHashes[file],pin.sha256);
 }
 const spans=contract.tables.flatMap(t=>[...t.sources,...t.columns.map(c=>c.source)]).concat(contract.changes201.flatMap(c=>c.sources));
 for(const span of spans){
  const raw=readRaw(span.file),extracted=raw.subarray(span.startByte,span.startByte+span.bytes);
  assert.equal(hash(extracted),span.sha256);assert.equal(extracted.toString('utf8'),span.text);
  const inverse=Buffer.concat([raw.subarray(0,span.startByte),Buffer.from(span.text),raw.subarray(span.startByte+span.bytes)]);assert.deepEqual(inverse,raw);
 }
 assert.deepEqual(contract.changes201.map(({table,column,constraint,limit,changesColumns})=>({table,column,constraint,limit,changesColumns})),[
  {table:'own_payroll_close_event',column:'snapshot',constraint:'own_payroll_close_event_snapshot_check',limit:33546240,changesColumns:false},
  {table:'own_payroll_close_event',column:'receipt',constraint:'own_payroll_close_event_receipt_check',limit:33554432,changesColumns:false},
  {table:'own_payroll_annul_event',column:'receipt',constraint:'own_payroll_annul_event_receipt_check',limit:33554432,changesColumns:false}
 ]);
 assert.equal(contract.changes201.flatMap(c=>c.sources).length,6);
 assert.ok(contract.derivation.columnSplitInverseVerified&&contract.derivation.sourceSpanInverseVerified&&contract.derivation.defaultQualificationInverseVerified);
});

test('rejects drift in every source, CRLF/truncation and non-RAW readers before producing any guard',()=>{
 for(const file of Object.keys(OWN_ANNULMENT_LEDGER_SOURCE_PINS)){
  assert.throws(()=>build(name=>{const raw=readRaw(name);if(name!==file)return raw;const changed=Buffer.from(raw);changed[0]^=1;return changed;}),/ANNUL_LEDGER_SOURCE_SHA:/,file+' changed bytes');
  assert.throws(()=>build(name=>name===file?Buffer.concat([readRaw(name),Buffer.from('\n')]):readRaw(name)),/ANNUL_LEDGER_SOURCE_BYTES:/,file+' extra bytes');
 }
 const first=Object.keys(OWN_ANNULMENT_LEDGER_SOURCE_PINS)[0];
 assert.throws(()=>build(name=>name===first?Buffer.from(readRaw(name).toString('utf8').replaceAll('\n','\r\n')):readRaw(name)),/ANNUL_LEDGER_SOURCE_BYTES:/);
 assert.throws(()=>build(name=>readRaw(name).toString('utf8')),/ANNUL_LEDGER_RAW_BUFFER:/);
 let reads=0;const reader=file=>{reads++;return readRaw(file);};
 assert.throws(()=>buildOwnAnnulmentLedgerContract({readRaw:reader,sourceCommit:'x'.repeat(40)}),/ANNUL_LEDGER_COMMIT/);assert.equal(reads,0);
 for(const foreign of [{catalog:{}},{expectedTables:[]},{schema:'mc_qa_fixed_092_'+'a'.repeat(32)},{passed:true}]){
  assert.throws(()=>buildOwnAnnulmentLedgerContract({readRaw:reader,sourceCommit,...foreign}),/ANNUL_LEDGER_SOURCE_INPUTS_ONLY/);
 }
 assert.equal(reads,0);
});

test('the emitted single guard only reads catalogue, covers every metadata dimension and never evaluates defaults',()=>{
 const contract=build();assert.deepEqual(contract.statements,[contract.guard]);assert.equal(splitPostgresStatements(contract.guard).length,1);
 const sql=contract.guard.replace(/'(?:[^']|'')*'/g,"''");
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|EXECUTE|PERFORM|CALL|COPY|LOCK|COMMIT|ROLLBACK)\b/i);
 assert.doesNotMatch(sql,/\bFROM\s+public\.|\bJOIN\s+public\.|\b(?:gen_random_uuid|clock_timestamp)\s*\(/i);
 for(const metadata of ['attname','attnum','atttypid','atttypmod','attnotnull','attidentity','attgenerated','attisdropped','attacl','attcollation','typcollation','atthasdef','adbin','pg_get_expr','pg_depend','relowner','relkind','relpersistence','relrowsecurity','relforcerowsecurity','relispartition','reloptions','relreplident','pg_policy','pg_inherits','aclexplode']){
  assert.match(sql,new RegExp('\\b'+metadata+'\\b'),metadata+' has a catalogue guard');
 }
 const payload=/FOR t IN SELECT value FROM pg_catalog\.jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/.exec(contract.guard);assert.ok(payload);
 const embedded=JSON.parse(payload[1].replaceAll("''","'"));assert.equal(embedded.length,5);assert.equal(embedded.flatMap(t=>t.columns).length,77);
 for(const table of embedded){assert.deepEqual(table.columns.map(c=>c.name),names[table.name]);assert.ok(table.columns.every(c=>c.type.startsWith('pg_catalog.')));}
 assert.deepEqual(contract.scope,{columns:true,defaults:true,tableSecurity:true,constraints:false,triggers:false,requiresExisting209TriggerGuard:true,requiresExisting201215ConstraintGuards:true});
 assert.equal(contract.executionAdmitted,false);assert.equal(contract.executesSql,false);assert.equal(contract.connects,false);assert.equal(contract.readOnly,true);assert.equal(contract.observedCatalogUsed,false);
 assert.equal(contract.businessWrites,0);assert.equal(contract.nominalRowsReturned,0);
});

test('contracts are deeply frozen and source bookend rejects a later byte change without a database',()=>{
 let changed=false;const first=Object.keys(OWN_ANNULMENT_LEDGER_SOURCE_PINS)[0];
 const contract=build(file=>{const raw=readRaw(file);return changed&&file===first?Buffer.concat([raw,Buffer.from('unreviewed')]):raw;});
 for(const value of[contract,contract.tables,contract.tables[0],contract.tables[0].columns,contract.tables[0].columns[0],contract.tables[0].columns[0].default,contract.sourceHashes,contract.changes201,OWN_ANNULMENT_LEDGER_SOURCE_PINS])assert.ok(Object.isFrozen(value));
 assert.throws(()=>{contract.tables[0].columns[0].default.expression='public.gen_random_uuid()';},TypeError);
 assert.throws(()=>{contract.tables.push({});},TypeError);
 assert.deepEqual(contract.sourceBookend(),{sourceCommit,sourceHashes:{...contract.sourceHashes},sourceOnly:true});
 changed=true;assert.throws(()=>contract.sourceBookend(),/ANNUL_LEDGER_SOURCE_BYTES:/);
});
