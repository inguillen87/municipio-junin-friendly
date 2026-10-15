import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPayrollSelectionPostgresQa} from '../scripts/verify-payroll-selection-postgres.mjs';
import {batchFixture,BATCH_BINDING} from './fixtures/payroll-document-selection-synthetic.js';

test('selection PostgreSQL generator verifies the complete authenticated projection and exactly one metadata read per page',async()=>{
 const fixtures=[];const {sql,proof}=await buildPayrollSelectionPostgresQa({fixture:()=>{const f=batchFixture();fixtures.push(f);return f;}});
 assert.deepEqual(proof,{synthetic:true,rollback:true,sqlExecuted:false,sqlChecks:8,projectionRowsVerified:62,previewPagesVerified:3,sqlQueriesPerPreview:1,rosterReadsPerPreview:2});
 assert.equal(fixtures.length,3);for(const f of fixtures){assert.equal(f.calls.length,1);assert.equal(f.rosterReads,2);}
 assert.match(sql,/^BEGIN;/);assert.match(sql,/current_database\(\)<>'payroll_selection_qa'/);assert.match(sql,/inet_server_addr\(\) IS DISTINCT FROM '127\.0\.0\.1'::inet/);
 assert.match(sql,/SET LOCAL search_path=pg_temp,pg_catalog/);assert.match(sql,/\nROLLBACK;\n/);assert.match(sql,/AS temporary_schema_reverted/);
 assert.doesNotMatch(sql,/CREATE (?:TEMP )?TABLE (?:employment_contract|grh_effective_employees_v1)|payroll-batch:directory|FROM employment_contract/);
 assert.match(sql,/to_regprocedure\('pg_temp\.selection_ok\(boolean,text\)'\) IS NULL/);
});

test('real metadata SQL compares every fixture field including the certified binding and UTC cutoff',async()=>{
 const f=batchFixture(),{sql}=await buildPayrollSelectionPostgresQa();
 assert.equal(f.metadata.bindingId,BATCH_BINDING);assert.ok(sql.includes(JSON.stringify(f.metadata)));
 assert.match(sql,/bool_and\(to_jsonb\(actual\)=/);assert.ok(sql.includes('"bindingId":"'+BATCH_BINDING+'"'));
 assert.ok(sql.includes('"directoryCutoff":"2026-09-10T18:17:30Z"'));assert.match(sql,/source_cutoff AT TIME ZONE 'UTC'/);
 for(const label of ['foreign tenant rejected','foreign database rejected','foreign company rejected','unverified binding rejected','foreign binding rejected','unpublished source rejected','complete metadata restored after negative cases'])assert.ok(sql.includes(label));
 assert.equal((sql.match(/SELECT pg_temp\.selection_ok\(/g)||[]).length,8);
 assert.match(sql,/CREATE TEMP VIEW grh_effective_source_batch_v1[\s\S]*validation_state='published'/);
});

test('generator rejects a resurrected legacy SQL fallback instead of lowering its query-count assertion',async()=>{
 await assert.rejects(buildPayrollSelectionPostgresQa({fixture:()=>{const f=batchFixture();f.calls.push({text:'/* payroll-batch:directory */ SELECT 1',values:[]});return f;}}),/PAYROLL_SELECTION_QA_SQL_QUERY_COUNT_CHANGED/);
});

test('generator requires both initial and final roster authorization',async()=>{
 await assert.rejects(buildPayrollSelectionPostgresQa({fixture:()=>{const f=batchFixture();Object.defineProperty(f,'rosterReads',{get:()=>1});return f;}}),/PAYROLL_SELECTION_QA_ROSTER_READ_COUNT_CHANGED/);
});

test('generator does not accept a changed private projection under the old content hash',async()=>{
 await assert.rejects(buildPayrollSelectionPostgresQa({fixture:()=>{const f=batchFixture(),read=f.readRoster;f.readRoster=async()=>{const response=await read();response.documentaryDirectory.records[0].assignments[0].sectorCode='10';return response;};return f;}}),{code:'PAYROLL_BATCH_DIRECTORY_DRIFT'});
});

test('all 62 source records and their review states remain required across all three pages',async()=>{
 for(const mutate of [f=>f.records.pop(),f=>f.records[59].assignments.pop(),f=>f.records[60].assignments[0].name='Complete QA']){
  await assert.rejects(buildPayrollSelectionPostgresQa({fixture:()=>{const f=batchFixture();mutate(f);return f;}}));
 }
});

test('metadata binding must agree with the authenticated projection',async()=>{
 await assert.rejects(buildPayrollSelectionPostgresQa({fixture:()=>{const f=batchFixture();f.metadata.bindingId='99999999-9999-4999-8999-999999999999';return f;}}),{code:'PAYROLL_BATCH_DIRECTORY_DRIFT'});
});
