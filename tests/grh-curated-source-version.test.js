import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGrhCuratedVersionDelta,normalizeGrhCuratedVersionRecord,createGrhCuratedRecordPatch,applyGrhCuratedRecordPatch,
 importGrhCuratedSourceVersionWithinTransaction,readGrhCuratedSourceVersionEntity} from '../scripts/lib/grh-curated-source-version.mjs';
import {buildGrhCuratedSourceQa,buildGrhCuratedSourceQaSetup} from '../scripts/verify-grh-curated-source-postgres.mjs';
const employee=(legajo,nombre='Sintético')=>({company_id:101,legajo,person_id:'9007199254740993',activo:true,nombre,source_payload:JSON.stringify({identity:{name:nombre},sourceKey:{employeeNumber:legajo}})});
test('sparse delta preserves unchanged rows, changes and source absences separately',()=>{
 const baseline=[employee('1'),employee('2'),employee('3')],candidate=[employee('1'),employee('2','Cambio'),employee('4')];
 const result=createGrhCuratedVersionDelta('grh_employees',baseline,candidate);
 assert.deepEqual(result.counts,{baseline:3,candidate:3,added:1,changed:1,removed:1,unchanged:1});
 assert.equal(result.changes.find(r=>r.operation==='replace').record,null);assert.equal(result.changes.find(r=>r.operation==='remove').patch,null);
 assert.deepEqual(result.changes.find(r=>r.operation==='replace').keyFields,{company_id:101,legajo:'2'});
 assert.deepEqual(applyGrhCuratedRecordPatch(normalizeGrhCuratedVersionRecord('grh_employees',baseline[1]),result.changes.find(r=>r.operation==='replace').patch),normalizeGrhCuratedVersionRecord('grh_employees',candidate[1]));
});
test('patch distinguishes absent values, null, arrays and empty objects',()=>{
 const a={one:null,two:[1,2],nested:{value:'before',gone:1},gone:{key:null}},b={two:[2,1],nested:{value:null,added:{}},fresh:null};
 const before=structuredClone(a),patch=createGrhCuratedRecordPatch(a,b);
 assert.deepEqual(applyGrhCuratedRecordPatch(a,patch),b);assert.deepEqual(a,before);assert.ok(patch.some(r=>r.op==='remove'));
});
test('prototype-like source keys remain literal data',()=>{
 const a=JSON.parse('{"__proto__":{"safe":1}}'),b=JSON.parse('{"__proto__":{"safe":2},"constructor":null}');
 assert.deepEqual(applyGrhCuratedRecordPatch(a,createGrhCuratedRecordPatch(a,b)),b);assert.equal({}.safe,undefined);
});
test('large source identifiers and exact decimals are not rounded',()=>{
 assert.equal(normalizeGrhCuratedVersionRecord('grh_employees',employee('1')).person_id,'9007199254740993');
 const row=normalizeGrhCuratedVersionRecord('grh_absences',{company_id:101,legajo:'1',fecha:'2026-08-01',cantidad:'9007199254740993.0100',dias:'-0.00',source_payload:{}});
 assert.equal(row.cantidad,'9007199254740993.01');assert.equal(row.dias,'0');
});
test('duplicate keys and patches outside existing object paths fail',()=>{
 assert.throws(()=>createGrhCuratedVersionDelta('grh_employees',[employee('1'),employee('1')],[]),/DUPLICATE_KEY/);
 assert.throws(()=>applyGrhCuratedRecordPatch({},[{op:'set',path:['missing','key'],value:1}]),/PATCH_INVALID/);
 assert.throws(()=>applyGrhCuratedRecordPatch({},[{op:'remove',path:['missing']}]),/PATCH_INVALID/);
});
test('permutation does not change source projection digests',()=>{
 const a=[employee('1'),employee('2')];assert.equal(createGrhCuratedVersionDelta('grh_employees',a,a).candidateProjectionSha256,
 createGrhCuratedVersionDelta('grh_employees',[...a].reverse(),a).baselineProjectionSha256);
});
test('payload drift and implicit latest fail before SQL',async()=>{
 const id='11111111-1111-4111-8111-111111111111',client={query:()=>assert.fail('No SQL allowed')};
 await assert.rejects(()=>importGrhCuratedSourceVersionWithinTransaction({client,prepared:{},coreVersionId:id,tenantId:id,sourceBindingId:id,baselineBatchId:id,baselineImportRunId:'3',candidateBatchId:'22222222-2222-4222-8222-222222222222',candidateImportRunId:'4'}),/PAYLOAD_DRIFT/);
 await assert.rejects(()=>readGrhCuratedSourceVersionEntity({client,versionId:id,entity:'grh_employees',revision:'latest'}),/QUERY_INVALID/);
});
test('migration protects version data, offers complete staging and never changes current consumers',()=>{
 const sql=readFileSync(new URL('../scripts/migrations/098-grh-curated-source-version.sql',import.meta.url),'utf8');
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE FROM|INSERT INTO|ALTER TABLE|TRUNCATE)\s+(?:public\.)?(?:grh_employees|grh_family|grh_absences|grh_leaves|source_staging_row|employment_contract)\b/i);
 assert.match(sql,/grh_curated_source_staging_v1/);assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/);assert.match(sql,/BEFORE TRUNCATE/);
 assert.doesNotMatch(sql,/GRANT EXECUTE|CREATE OR REPLACE VIEW vw_/);
});
test('curated real SQL QA is bounded to loopback, rolls back, and supports PostgreSQL 17 and 18',()=>{
 for(const expectedMajor of [17,18]){
  const sql=buildGrhCuratedSourceQa({expectedMajor});
  assert.ok(sql.startsWith('BEGIN;'));assert.ok(sql.includes("current_setting('server_version_num')::integer/10000<>"+expectedMajor));
  assert.match(sql,/current_database\(\)<>'effective_source_qa'/);assert.match(sql,/inet_server_addr\(\) NOT IN/);
  assert.match(sql,/ROLLBACK;\nSELECT to_regnamespace\('grh_effective_qa_curated'\) IS NULL AS rollback_schema_absent;/);
  assert.doesNotMatch(sql,/__ROWS__|__CHANGES__|__EVIDENCE__|\bCOMMIT\s*;/);
 }
 assert.throws(()=>buildGrhCuratedSourceQaSetup({schema:'public'}),/Invalid QA target/);
});
