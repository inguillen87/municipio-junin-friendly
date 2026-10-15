// Generate rollback-only metadata SQL. The authenticated 054 projection is tested
// here through the real batch module; its SQL/adoption is exercised by the 178 QA.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import {parseArgs} from 'node:util';
import {batchFixture,batchPreview,BATCH_DATASET,BATCH_TENANT,BATCH_BINDING,batchBinding} from '../tests/fixtures/payroll-document-selection-synthetic.js';
import {stableBatchValue,verifyBatchPreview} from '../assets/payroll-document-batch-model.js';
import {verifiedDocumentaryDirectory} from '../lib/internal-payroll-roster.js';
const literal=v=>Array.isArray(v)?'ARRAY['+v.map(literal).join(',')+']':v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const render=(entry,overrides={})=>entry.text.replace(/\$(\d+)/g,(_,i)=>literal(Object.hasOwn(overrides,i)?overrides[i]:entry.values[Number(i)-1]));
export async function buildPayrollSelectionPostgresQa({fixture=batchFixture}={}){
 const rows=[];let f,first,metadataRead;
 for(const page of ['1','2','3']){
  const current=fixture(),responses=[],readRoster=current.readRoster;
  const response=await batchPreview({page}, {...current,readRoster:async()=>{const result=await readRoster();responses.push(structuredClone(result));return result;}});
  assert.equal(response.status,200,'PAYROLL_SELECTION_QA_PREVIEW_FAILED');const data=verifyBatchPreview(response.payload.data);
  assert.equal(current.calls.length,1,'PAYROLL_SELECTION_QA_SQL_QUERY_COUNT_CHANGED');assert.equal(current.rosterReads,2,'PAYROLL_SELECTION_QA_ROSTER_READ_COUNT_CHANGED');
  const entry=current.calls[0];assert.match(entry.text,/\/\* payroll-batch:metadata \*\//);assert.doesNotMatch(entry.text,/payroll-batch:directory|FROM employment_contract|\b(?:UPDATE|DELETE|INSERT|ALTER|GRANT)\b/i);
  assert.deepEqual(entry.values,[BATCH_DATASET,BATCH_TENANT,batchBinding.database,batchBinding.companyId]);
  assert.equal(current.metadata.bindingId,BATCH_BINDING);assert.equal(current.metadata.directoryCutoff,'2026-09-10T18:17:30Z');assert.equal(current.records.length,62);
  for(const result of responses){
   const directory=verifiedDocumentaryDirectory(result.documentaryDirectory,{tenantId:BATCH_TENANT,datasetId:BATCH_DATASET,bindingId:BATCH_BINDING,database:batchBinding.database,companyId:batchBinding.companyId,cutoff:current.metadata.directoryCutoff,rows:result.payload.data.rows});
   const {readVersion,...projection}=directory;assert.equal(createHash('sha256').update(stableBatchValue(projection)).digest('hex'),readVersion);assert.deepEqual(directory.records,current.records);
   assert.equal(directory.records.filter(r=>r.assignments.length===0).length,1);assert.equal(directory.records.filter(r=>r.assignments.length===2).length,1);
   assert.equal(result.payload.data.documentaryDirectory,undefined);
  }
  assert.deepEqual(responses[0].documentaryDirectory,responses[1].documentaryDirectory);
  assert.deepEqual(data.counts,{dataset:62,selected:62,eligible:59,review:3,unclassifiedSector:3});assert.equal(data.pagination.pages,3);assert.equal(data.pagination.page,Number(page));
  if(first){assert.equal(data.selectionHash,first.selectionHash);assert.deepEqual(current.metadata,f.metadata);assert.deepEqual(entry,metadataRead);}else{f=current;first=data;metadataRead=entry;}
  rows.push(...data.rows);
 }
 assert.equal(rows.length,62);assert.equal(new Set(rows.map(r=>r.number)).size,62);
 for(const [index,row]of rows.entries()){
  const number=String(index+1).padStart(4,'0'),record=f.records[index];assert.equal(row.number,number);
  const state=number==='0059'?'unmapped':number==='0060'?'ambiguous':number==='0061'?'identity_incomplete':'ready';assert.equal(row.state,state);
  const assignment=record.assignments.length===1?record.assignments[0]:null;
  assert.deepEqual(row,{number,contractId:state==='ready'?assignment.contractId:null,name:assignment?.name??null,sectorCode:assignment?.sectorCode??null,sectorLabel:assignment?.sectorLabel??null,state});
 }
 const batch='55555555-5555-4555-8555-555555555555',binding=BATCH_BINDING;
let sql=`BEGIN;
DO $guard$ BEGIN IF current_database()<>'payroll_selection_qa' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_QA_DATABASE_REQUIRED'; END IF; END $guard$;
SET LOCAL statement_timeout='15s';
SET LOCAL search_path=pg_temp,pg_catalog;
CREATE TEMP TABLE platform_tenant_source_binding(id uuid,tenant_id uuid,source_database text,source_company_id bigint,source_system text,verified boolean);
CREATE TEMP TABLE qa_source_batch(id uuid,source_database text,source_system text,source_cutoff timestamptz,validation_state text);
CREATE TEMP VIEW grh_effective_source_batch_v1 AS SELECT id,source_database,source_system,source_cutoff FROM qa_source_batch WHERE validation_state='published';
CREATE TEMP TABLE payroll_detail_dataset(id uuid,tenant_id uuid,source_binding_id uuid,source_database text,company_id bigint,payroll_date date,source_period int,source_month int,payroll_type text,source_closed_flag int,payload_sha256 text,source_sha256 text,source_label text,statement_count int);
CREATE TEMP TABLE qa_checks(label text);
CREATE FUNCTION pg_temp.selection_ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $f$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'SELECTION_QA_FAILED: %',label;END IF;INSERT INTO qa_checks VALUES(label);END $f$;
INSERT INTO platform_tenant_source_binding VALUES('${binding}','${BATCH_TENANT}','grh_qa',101,'GRH',true);
INSERT INTO qa_source_batch VALUES('${batch}','grh_qa','GRH','2026-09-10 15:17:30-03:00','published');
INSERT INTO payroll_detail_dataset VALUES('${BATCH_DATASET}','${BATCH_TENANT}','${binding}','grh_qa',101,'2026-08-31',2026,8,'M',1,'${'b'.repeat(64)}','${'c'.repeat(64)}','Detalle QA',62);
`;
sql+=`WITH actual AS (${render(metadataRead)}) SELECT pg_temp.selection_ok((SELECT count(*)=1 AND bool_and(to_jsonb(actual)=${literal(JSON.stringify(f.metadata))}::jsonb) FROM actual),'complete dataset metadata, binding and UTC cutoff');\n`;
for(const [name,override]of [['tenant',{2:'99999999-9999-4999-8999-999999999999'}],['database',{3:'other_source'}],['company',{4:202}]]){
 sql+=`WITH actual AS (${render(metadataRead,override)}) SELECT pg_temp.selection_ok((SELECT count(*)=0 FROM actual),'foreign ${name} rejected');\n`;
}
sql+=`UPDATE platform_tenant_source_binding SET verified=false;\nWITH actual AS (${render(metadataRead)}) SELECT pg_temp.selection_ok((SELECT count(*)=0 FROM actual),'unverified binding rejected');
UPDATE platform_tenant_source_binding SET verified=true,id='99999999-9999-4999-8999-999999999999';
WITH actual AS (${render(metadataRead)}) SELECT pg_temp.selection_ok((SELECT count(*)=0 FROM actual),'foreign binding rejected');
UPDATE platform_tenant_source_binding SET id='${binding}';
UPDATE qa_source_batch SET validation_state='pending';
WITH actual AS (${render(metadataRead)}) SELECT pg_temp.selection_ok((SELECT count(*)=0 FROM actual),'unpublished source rejected');
UPDATE qa_source_batch SET validation_state='published';
WITH actual AS (${render(metadataRead)}) SELECT pg_temp.selection_ok((SELECT count(*)=1 AND bool_and(to_jsonb(actual)=${literal(JSON.stringify(f.metadata))}::jsonb) FROM actual),'complete metadata restored after negative cases');
`;
sql+=`SELECT jsonb_build_object('ok',true,'checksPassed',count(*),'synthetic',true,'municipalWrites',0,'projectionRowsVerified',62,'previewPagesVerified',3,'sqlQueriesPerPreview',1,'rosterReadsPerPreview',2) FROM qa_checks;
ROLLBACK;
SELECT to_regclass('pg_temp.payroll_detail_dataset') IS NULL AND to_regclass('pg_temp.platform_tenant_source_binding') IS NULL AND to_regclass('pg_temp.qa_source_batch') IS NULL AND to_regclass('pg_temp.grh_effective_source_batch_v1') IS NULL AND to_regclass('pg_temp.qa_checks') IS NULL AND to_regprocedure('pg_temp.selection_ok(boolean,text)') IS NULL AS temporary_schema_reverted;
`;
 return{sql,proof:{synthetic:true,rollback:true,sqlExecuted:false,sqlChecks:8,projectionRowsVerified:62,previewPagesVerified:3,sqlQueriesPerPreview:1,rosterReadsPerPreview:2}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const {values}=parseArgs({options:{'write-sql':{type:'string'}},strict:true});if(!values['write-sql'])throw Error('QA_SQL_OUTPUT_REQUIRED');
 const {sql,proof}=await buildPayrollSelectionPostgresQa();fs.writeFileSync(path.resolve(values['write-sql']),sql);console.log(JSON.stringify({generated:true,...proof}));
}
