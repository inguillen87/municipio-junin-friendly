import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createGrhEntityDelta,projectGrhVersionRecord,readGrhSourceVersionEntity,importGrhSourceVersionWithinTransaction} from '../scripts/lib/grh-core-source-version.mjs';
import {rehearseGrhSourceVersion} from '../scripts/rehearse-grh-source-version.mjs';
import {getGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {stableJson} from '../scripts/lib/canonical-import.mjs';
const contexts={baseline:{currentPayrollDate:'2026-08-31'},candidate:{currentPayrollDate:'2026-09-30'}};
const monthly=(legajo,net='123.4500')=>({sourceKey:{companyCode:'101',employeeNumber:legajo,payrollDate:'2026-08-31',period:2026,month:8,payrollType:'M'},
 itemCount:3,quantitySum:'0.0000',technicalSourceAmountSum:'1000.00',sourceTotals:{netPayable:net},dominantAgreementCode:'1',dominantSectorCode:null,distinctConcepts:3});
test('monthly delta retains corrected and missing historical keys without modifying the baseline',async()=>{
 const baseline=[monthly('1'),monthly('2'),monthly('3')],before=JSON.stringify(baseline),candidate=[monthly('1'),monthly('2','124.45'),monthly('4')];
 const result=await createGrhEntityDelta('payrollMonthly',baseline,candidate,contexts);
 assert.deepEqual(result.counts,{baseline:3,candidate:3,added:1,changed:1,removed:1,unchanged:1});
 assert.equal(JSON.stringify(baseline),before);assert.equal(result.changes.find(r=>r.operation==='replace').record.net_payable,'124.45');
 const removed=result.changes.find(r=>r.operation==='remove');assert.equal(removed.record,null);assert.match(removed.previousSourceSha256,/^[a-f0-9]{64}$/);
 assert.notEqual(result.baselineProjectionSha256,result.candidateProjectionSha256);
});
test('version projections preserve exact decimals and missing amounts, without summing technical concepts',()=>{
 const row=projectGrhVersionRecord('payrollMonthly',monthly('1','9007199254740993.12'),contexts.candidate);
 assert.equal(row.net_payable,'9007199254740993.12');assert.equal(row.net,null);assert.equal(row.quantity_sum,'0');assert.equal(row.technical_source_amount_sum,'1000');
});
test('same source rows keep the same entity digest independent of iteration order',async()=>{
 const a=[monthly('1'),monthly('2')],first=await createGrhEntityDelta('payrollMonthly',a,a,contexts),second=await createGrhEntityDelta('payrollMonthly',[...a].reverse(),a,contexts);
 assert.equal(first.baselineProjectionSha256,second.baselineProjectionSha256);assert.equal(first.baselineProjectionSha256,first.candidateProjectionSha256);assert.equal(first.changes.length,0);
});
test('source differences that normalize equally are still retained as literal evidence',async()=>{
 const a=monthly('1','123.45'),b=monthly('1','123.4500'),r=await createGrhEntityDelta('payrollMonthly',[a],[b],contexts);
 assert.equal(r.counts.changed,1);assert.equal(r.baselineProjectionSha256,r.candidateProjectionSha256);assert.equal(r.changes[0].sourcePayload.sourceTotals.netPayable,'123.4500');
});
test('reconciliation relies on source evidence, never treats snapshot absence as termination',()=>{
 const row={sourceKey:{companyCode:'101',employeeNumber:'1'},administrativeActive:true,liquidatedCurrent:false,evidenceStatus:'ACTIVE_NOT_LIQUIDATED',lastPayrollDate:'2026-08-31'};
 assert.deepEqual(projectGrhVersionRecord('employmentReconciliation',row,contexts.baseline),projectGrhVersionRecord('employmentReconciliation',row,contexts.candidate));
 const projected=projectGrhVersionRecord('employmentReconciliation',row,contexts.candidate);assert.equal(projected.administrative_active,true);assert.equal(projected.liquidated_current,false);assert.equal(projected.evidence_status,'ACTIVE_NOT_LIQUIDATED');
});
test('duplicate keys, malformed numbers and unknown entity are rejected',async()=>{
 await assert.rejects(()=>createGrhEntityDelta('payrollMonthly',[monthly('1'),monthly('1')],[],contexts),/GRH_VERSION_DUPLICATE_BASELINE/);
 await assert.rejects(()=>createGrhEntityDelta('payrollMonthly',[],[monthly('1'),monthly('1')],contexts),/GRH_VERSION_DUPLICATE_CANDIDATE/);
 assert.throws(()=>projectGrhVersionRecord('payrollMonthly',monthly('1','1e8'),contexts.candidate),/GRH_VERSION_VALUE_INVALID/);
 assert.throws(()=>projectGrhVersionRecord('unknown',monthly('1'),contexts.candidate),/GRH_VERSION_ENTITY_INVALID/);
});
test('complete entity reader requires an explicit version and binds parameters',async()=>{
 const calls=[],client={query:async(sql,args)=>{calls.push({sql,args});return{rows:[{record:{synthetic:true}}]}}},versionId='11111111-1111-4111-8111-111111111111';
 await assert.rejects(()=>readGrhSourceVersionEntity({client,entity:'payrollMonthly'}),/GRH_VERSION_QUERY_INVALID/);
 assert.equal(calls.length,0);assert.equal((await readGrhSourceVersionEntity({client,versionId,entity:'payrollMonthly'})).length,1);
 assert.deepEqual(calls[0].args,[versionId,'payrollMonthly','candidate']);assert.doesNotMatch(calls[0].sql,/latest|max\(/i);
});
test('tampered private package fails before opening a database transaction',async()=>{
 const id='11111111-1111-4111-8111-111111111111';await assert.rejects(()=>importGrhSourceVersionWithinTransaction({client:{query:()=>assert.fail('No SQL allowed')},
 prepared:{version:'grh-core-source-version.v1',payloadSha256:'a'.repeat(64)},baselineBatchId:id,baselineImportRunId:'3',tenantId:id,sourceBindingId:id}),/GRH_VERSION_PAYLOAD_DRIFT/);
});
test('migration is additive, protects all private tables and offers no implicit active-source switch',()=>{
 const sql=readFileSync(new URL('../scripts/migrations/061-grh-core-source-version.sql',import.meta.url),'utf8');
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE FROM|INSERT INTO|ALTER TABLE|TRUNCATE)\s+(?:public\.)?(?:payroll_monthly_fact|employment_movement|payroll_run|payroll_snapshot_assignment|employment_status_snapshot)\b/i);
 assert.match(sql,/GRH_VERSION_ALREADY_SEALED/);assert.match(sql,/GRH_VERSION_BASELINE_DRIFT/);assert.match(sql,/GRH_VERSION_CONTENT_DRIFT/);assert.match(sql,/BEFORE TRUNCATE/);
 assert.match(sql,/FROM PUBLIC,municontrol_actions_runtime_app/);assert.doesNotMatch(sql,/GRANT EXECUTE|CREATE OR REPLACE VIEW vw_/);
});
test('rehearsal rejects an operational target before BEGIN or source access',async()=>{
 const calls=[],client={query:async sql=>{calls.push(sql);return{rows:[{database:'neondb',host:'10.0.0.1',port:5432,role:'neondb_owner',branch:'br-live'}]}}};
 await assert.rejects(()=>rehearseGrhSourceVersion({client}),/GRH_VERSION_LOCAL_TARGET_REQUIRED/);assert.equal(calls.length,1);assert.match(calls[0],/^SELECT/);
});
test('a mixed canonical cohort cannot be used as the certified baseline even with matching source hashes',async()=>{
 const source=id=>{const p=getGrhSourceProfile(id);return{profileId:p.id,sourceSha256:p.source.sha256.toLowerCase(),cutoff:p.source.cutoff,sourceDatabase:p.source.database}};
 const payload={version:'grh-core-source-version.v1',baseline:source('grh-junin-2026-08-06'),candidate:source('grh-junin-2026-09-10'),
  entities:Object.fromEntries(['payrollRuns','payrollSnapshot','movements','payrollMonthly','employmentReconciliation'].map(e=>[e,{}])),changes:[]};
 const digest=createHash('sha256').update(stableJson(payload)).digest('hex'),id='11111111-1111-4111-8111-111111111111',calls=[];
 const client={query:async sql=>{calls.push(sql);return{rows:sql.includes('pg_try_advisory')?[{acquired:true}]:sql.includes('platform_tenant_source_binding')?[{company:'101',canonical_batches:2,canonical_batch_id:id}]:[]}}};
 await assert.rejects(()=>importGrhSourceVersionWithinTransaction({client,prepared:{...payload,payloadSha256:digest},expectedPayloadSha256:digest,
  baselineBatchId:id,baselineImportRunId:'3',tenantId:id,sourceBindingId:id}),/GRH_VERSION_BINDING_MISMATCH/);
 assert.equal(calls.some(sql=>/INSERT INTO/i.test(sql)),false);
});
