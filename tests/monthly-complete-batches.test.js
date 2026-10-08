import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {reviewGrhImport,prepareGrhImport} from '../lib/internal-grh-import.js';
import {grhFileRequest,grhPreview,grhWriteAttempt,grhReceipt} from '../assets/payroll-grh-import-model.js';
import {normalizePayrollNoveltyDraft,PAYROLL_NOVELTY_MAX_ROWS} from '../lib/internal-payroll-novelty.js';
import {MONTHLY_BATCH_MAX_ROWS} from '../assets/payroll-native-monthly-model.js';
import {fixture,id,principal,session} from './fixtures/grh-import-synthetic.js';
import {buildMonthlyBatchCapacityInstallation} from '../scripts/lib/monthly-batch-capacity-installation.mjs';
const envelope=data=>({ok:true,replayed:false,data});
const review=f=>reviewGrhImport(f.readSql,f.runtime,principal(),session(),f.payload);
const save=f=>prepareGrhImport(f.readSql,f.runtime,principal(),session(),f.payload,id(90));
for(const count of [501,759,2000])test(`complete ${count}-row Junin preview, write and receipt`,async()=>{
 const f=fixture(count);f.state.writerLimit=2000;const expected=await grhFileRequest(Buffer.from(f.payload.contentBase64,'base64'),{concept:f.payload.concept,periodMonth:f.payload.periodMonth});
 const result=(await review(f)).data,p=grhPreview(envelope(result),expected);assert.equal(p.writerLimit,2000);assert.equal(p.readyToPrepare,true);assert.equal(p.rows.length,count);assert.equal(f.state.writes,0);
 f.payload.previewToken=p.previewToken;const receipt=await save(f),verified=await grhReceipt(envelope(receipt.data),expected,p);
 assert.equal(f.state.writes,1);assert.equal(verified.savedRows,count);assert.equal(verified.omittedRows,0);assert.equal(verified.batch.rows.at(-1).rowOrdinal,count);assert.equal(verified.payrollCalculated,false);
});
test('old 500-row database capacity remains an explicit whole-file gate',async()=>{const f=fixture(759),p=(await review(f)).data;assert.equal(p.writerLimit,500);assert.equal(p.readyToPrepare,false);f.payload.previewToken=p.previewToken;await assert.rejects(save(f),{code:'PAYROLL_NOVELTY_VALIDATION_REQUIRED'});assert.equal(f.state.writes,0);});
test('capacity expansion preserves an existing attempt body, key and preview token',async()=>{
 const f=fixture(12),expected=await grhFileRequest(Buffer.from(f.payload.contentBase64,'base64'),{concept:f.payload.concept,periodMonth:f.payload.periodMonth}),old=grhPreview(envelope((await review(f)).data),expected);
 const attempt=grhWriteAttempt(expected,old,id(90),'same scope');f.state.writerLimit=2000;const next=grhPreview(envelope((await review(f)).data),expected),after=grhWriteAttempt(expected,next,id(90),'same scope');
 assert.equal(next.previewToken,old.previewToken);assert.deepEqual(after,attempt);
});
for(const capacity of [undefined,null,0,501,1999,2001,'2000'])test(`unknown capacity ${capacity} cannot enable a write`,async()=>{const f=fixture();f.state.writerLimit=capacity;await assert.rejects(review(f),{code:'PAYROLL_NOVELTY_CONTRACT_DRIFT'});assert.equal(f.state.writes,0);});
test('last-row link failure blocks all 759 rows',async()=>{const f=fixture(759);f.state.writerLimit=2000;f.state.records.pop();const p=(await review(f)).data;assert.equal(p.rows.length,759);assert.equal(p.rows.at(-1).status,'not_found');f.payload.previewToken=p.previewToken;await assert.rejects(save(f),{code:'PAYROLL_NOVELTY_VALIDATION_REQUIRED'});assert.equal(f.state.writes,0);});
test('last-row identity changes roll back the whole expanded import',async()=>{const f=fixture(759);f.state.writerLimit=2000;f.payload.previewToken=(await review(f)).data.previewToken;f.state.guardFailure=true;await assert.rejects(save(f),{code:'PAYROLL_NOVELTY_IDENTITY_CHANGED'});assert.equal(f.state.writes,0);});
test('shared maximum and normalization reject 2001 without splitting',()=>{
 assert.equal(PAYROLL_NOVELTY_MAX_ROWS,MONTHLY_BATCH_MAX_ROWS);const row={rowOrdinal:1,legajo:'1',conceptSourceId:'614',costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:null,amountCents:'1',movementType:null,legalInstrument:null,observation:null,forced:false};
 const rows=Array.from({length:2001},(_,n)=>({...row,rowOrdinal:n+1,legajo:String(n+1)}));assert.throws(()=>normalizePayrollNoveltyDraft({sourceMode:'bulk',periodMonth:'2026-08-01',payrollType:'monthly',rows}));
});
test('installation pins only reviewed definitions, preserves all prior data and grants',()=>{
 const batch=buildMonthlyBatchCapacityInstallation({read:f=>fs.readFileSync(f,'utf8'),sourceCommit:'a'.repeat(40)});assert.equal(batch.changed.length,3);assert.equal(batch.constraints.length,3);assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);
 assert.ok(batch.changed[0].includes('length(observation_text) NOT BETWEEN 1 AND 500'));assert.ok(batch.changed[0].includes('row_ordinal_text::integer NOT BETWEEN 1 AND 2000'));
 assert.ok(batch.changed[0].includes("row_ordinal_text !~ '^[1-9][0-9]{0,3}$'"));assert.ok(batch.oldConstraints.includes('definition17'));assert.ok(batch.newConstraints.includes('<= 2000'));
 assert.ok(batch.before.includes("to_jsonb(p)-'prosrc'"));assert.ok(!batch.before.includes("proname LIKE 'native_leave_%'"));assert.match(batch.conservation,/IS DISTINCT FROM/);assert.ok(batch.statements.every(s=>!/^\s*(?:GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|CREATE TABLE|DROP TABLE)\b/i.test(s)));
});
