// FS-only source contracts. No application module, SQL parser or builder import.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {projectOwner190QaReconciliationRawSourceToParent} from './fixtures/owner190-qa-source-reconciliation.js';
import {projectZeroDifferenceAllRawSourceToParent} from './fixtures/zero-difference-source-projection.js';
const read=p=>projectOwner190QaReconciliationRawSourceToParent(p,projectZeroDifferenceAllRawSourceToParent(p,fs.readFileSync(new URL('../'+p,import.meta.url)))).toString('utf8').replace(/\r\n?/g,'\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
const fixture=JSON.parse(read('tests/fixtures/own-accounting-imputation-190-source-contract.json'));
const source=read('scripts/lib/own-accounting-imputation-190-installation.mjs');
const body=(text,name)=>{const m=new RegExp('CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\([\\s\\S]*?\\bAS\\s+(\\$[\\w]*\\$)([\\s\\S]*?)\\1').exec(text);assert.ok(m,'known source function '+name);return m[2];};
const metadata=text=>[...text.matchAll(/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/g)].map(m=>JSON.parse(m[1].replaceAll("''","'")));

test('accounting190 closes source inputs and preserves the three original protocols byte for byte',()=>{
 for(const[path,digest]of Object.entries(fixture.sourcePins))assert.equal(hash(read(path)),digest,path);
 const pins=read('scripts/lib/own-accounting-imputation-190-source-pins.mjs');
 assert.deepEqual(JSON.parse(/Object\.freeze\((\{[\s\S]*?\})\);/.exec(pins)[1]),fixture.sourcePins);
 assert.match(source,/graph=qa\.foundation\.foundation\.foundation\.owner\.graph/);
 assert.match(source,/const decision=composeOwnFullCapacity190Installation\(\{\.\.\.h,read\}\)/);
 assert.match(source,/authorityChecks=\[decision\.postflight,/);
 assert.doesNotMatch(source,/buildOwnerProgramQa\(|new Pool\(|new Client\(|createServer\(|spawnSync\(|GRANT (?:[A-Z_]+ TO|[a-z_]+ TO)/);
});

test('the only predecessor bridge uses the complete known176 body and keeps other metadata',()=>{
 const old=read('scripts/migrations/123-own-payroll-runs.sql'),current=read('scripts/migrations/176-own-payroll-administrative-operator.sql');
 assert.equal(hash(body(old,'own_run_context_v1')),fixture.contextBridge.from);
 assert.equal(hash(body(current,'own_run_context_v1')),fixture.contextBridge.to);
 assert.ok(source.includes("const OLD_RUN_CONTEXT='"+fixture.contextBridge.from+"'"));
 assert.ok(source.includes("const CURRENT_RUN_CONTEXT='"+fixture.contextBridge.to+"'"));
 assert.match(source,/assert\.deepEqual\(\{\.\.\.corrected,sha256:pin\.sha256\},pin,'ACCOUNTING190_ONLY_KNOWN_CONTEXT_BODY_TRANSITION'\)/);
 assert.match(source,/batch\.installation\.map\(replacePre\)/);
 assert.match(source,/verification:\[\.\.\.authorityChecks,currentCheck\(records\),\.\.\.batch\.durableVerification\.map\(replacePre\)\]/);
});

test('successor epochs are distinct and the final union uses203 detail instead of207 old detail',()=>{
 assert.match(source,/epochs\.map\(p=>p\.id\),\[147,148,152,204,205,207,203,206\]/);
 const post207=metadata(read('scripts/migrations/207-own-journal-preparation-authorization.sql'))[1];
 const post203=metadata(read('scripts/migrations/203-own-imputation-full-capacity.sql'))[1];
 const old=post207.find(p=>p.name==='own_imputation_detail_v1'),current=post203.find(p=>p.name==='own_imputation_detail_v1');
 assert.ok(old&&current);assert.notEqual(old.bodySha256,current.bodySha256);
 assert.match(source,/known\.set\(record\.signature,record\)/);
 assert.match(source,/known\.get\('public\.own_imputation_detail_v1\(jsonb,uuid\)'\)\.bodySha256/);
 assert.match(source,/journalFullCapacity:receipts\.some\(epoch=>epoch\.id===206\)/);
});

test('normalization and conservation derive expected bodies from source and keep canonical budgets',()=>{
 assert.match(source,/ACCOUNTING190_WHOLE_LOCAL_SOURCE_DIGEST/);
 assert.match(source,/ACCOUNTING190_METADATA_LOCAL_BODY_MISMATCH/);
 assert.match(source,/ACCOUNTING190_SOURCE_DIGEST_GRAPH_UNRESOLVED/);
 assert.match(source,/coalesce\(pg_get_expr\(actual\.proargdefaults,0\),''\) IS DISTINCT FROM expected->>'defaultExpressions'/);
 assert.match(source,/actual\.proacl,acldefault\('f',actual\.proowner\)/);
 assert.match(source,/identity=h\.json\(epoch\.identity,\{readOnly:true,fullJson:true\}\)/);
 assert.match(source,/ACCOUNTING190_REHEARSAL_MUST_ROLL_BACK/);
 assert.match(source,/octet_lengthallocation::text<=16777216','octet_lengthallocation::text<=33554432'/);
 assert.match(source,/ACCOUNTING190_THREE203_NAMED_CHECKS/);
 assert.match(source,/ownFullCapacity190Snapshot\(h\)/);
 assert.equal(fixture.scope.nativeSqlExecuted,false);assert.equal(fixture.scope.testsExecuted,false);
});


test('206 admission follows the exact current203 union and evolves only known journal checks',()=>{
 const pre206=metadata(read('scripts/migrations/206-own-journal-full-capacity.sql'));
 assert.deepEqual(pre206.map(p=>p.length),[44,50]);
 const current=new Map();for(const id of[204,205,207,203])for(const p of metadata(read(fixture.overlays[id]))[1])current.set(p.signature,p);
 const fields=p=>({name:p.name,signature:p.signature,argNames:p.argNames,result:p.result,language:p.language,defaults:p.defaults,defaultExpressions:p.defaultExpressions,config:p.config,runtime:p.runtime,volatility:p.volatility,bodySha256:p.bodySha256});
 for(const p of pre206[0])assert.deepEqual(fields(current.get(p.signature)),fields(p),p.signature);
 assert.match(source,/if\(id===206\)rawTables\.set\(152,finalJournalTableCheck/);
 assert.match(source,/ACCOUNTING190_THREE206_NAMED_CHECKS/);
 assert.match(source,/checkTable='own_payroll_imputation_event'/);
 assert.match(source,/octet_lengthsource_snapshot::text<=16777216','octet_lengthsource_snapshot::text<=33554432'/);
 assert.match(source,/octet_lengthjournal_snapshot::text<=16777216','octet_lengthjournal_snapshot::text<=33554432'/);
 assert.match(source,/own_journal_%'\)<>13","proname LIKE 'own_journal_%'\)<>19/);
});

test('post-command function bookend excludes empty-ledger checks and reuses the admitted identity',()=>{
 assert.match(source,/finalFunctionVerification=\[\.\.\.authorityChecks,currentCheck\(records\),finalIdentity\]/);
 assert.match(source,/finalVerification=\[\.\.\.authorityChecks,currentCheck\(records\),\.\.\.currentTables\(\),finalIdentity\]/);
 const at=source.indexOf('export function assertOwnAccountingImputation190SourceBookend(');assert.ok(at>=0);
 const bookend=source.slice(at);assert.ok(!bookend.includes('currentTables('));assert.ok(!bookend.includes('plan.finalVerification'));
 for(const token of ["installation?.sourceCommit,h.sourceCommit","installation?.schema,h.qa.schema","composeOwnAccountingImputation190(h)","h.json(plan.finalFunctionVerification,{readOnly:true,fullJson:true})","assert.deepEqual(identity,installation.final",'identity.knownFunctionCount,plan.knownFunctionCount','ledgerEmptinessRequired:false'])assert.ok(bookend.includes(token),token);
});
