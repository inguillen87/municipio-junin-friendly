import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {isPayrollRecordIdentity} from '../assets/payroll-record-identity.js';
import {reviewGrhImport,prepareGrhImport,grhImportContext} from '../lib/internal-grh-import.js';
import {grhFileRequest,grhPreview,grhWriteAttempt,grhReceipt} from '../assets/payroll-grh-import-model.js';
import {fixture,id,principal,session} from './fixtures/grh-import-synthetic.js';
const record=(a='f',b='0',n=1)=>`ad1cde33-0169-${a}97a-${b}256-${String(n).padStart(12,'0')}`;
const review=f=>reviewGrhImport(f.readSql,f.runtime,principal(),session(),f.payload);
const save=f=>prepareGrhImport(f.readSql,f.runtime,principal(),session(),f.payload,id(90));
const client=f=>grhFileRequest(new Uint8Array(Buffer.from(f.payload.contentBase64,'base64')),{concept:f.payload.concept,periodMonth:f.payload.periodMonth,choices:f.payload.choices});
for(const a of '0123456789abcdef')test('record keys preserve all generator nibbles: '+a,()=>{for(const b of '0123456789abcdef')assert.equal(isPayrollRecordIdentity(record(a,b)),true);});
for(const value of [null,undefined,1,{},[], '', '00000000-0000-0000-0000-000000000000',' '+record(),record()+' ',record().toUpperCase(),record().replaceAll('-',''),'{'+record()+'}',record().replace('f97a','z97a'),record()+"' OR true --",record()+'\n'])test('noncanonical or empty identity is rejected: '+JSON.stringify(value),()=>assert.equal(isPayrollRecordIdentity(value),false));
test('twelve stored record identities complete preview, guarded preparation and client receipt without rewriting keys',async()=>{
 const f=fixture(12);for(let i=0;i<12;i++){f.state.records[i].contractId=record('e','1',i+1);f.state.records[i].personId=record('0','c',i+101);}
 const expected=await client(f),p=(await review(f)).data,view=grhPreview({ok:true,replayed:false,data:p},expected);
 assert.equal(view.resolvedRows,12);assert.equal(view.readyToPrepare,true);assert.equal(f.state.writes,0);f.payload.previewToken=p.previewToken;
 const attempt=grhWriteAttempt(expected,view,id(90),'own-tenant');assert.equal(attempt.headers['Idempotency-Key'],id(90));
 const result=await save(f),receipt=await grhReceipt({ok:true,...result},expected,view);
 assert.equal(receipt.savedRows,12);assert.equal(receipt.omittedRows,0);assert.equal(f.state.writes,1);
 assert.deepEqual(receipt.batch.rows.map(r=>r.employmentContractId),f.state.records.map(r=>r.contractId));assert.equal(receipt.payrollCalculated,false);
});
test('opaque hashed record keys remain legal without accepting them as managed session keys',async()=>{
 const f=fixture();const h=createHash('md5').update('MuniControl synthetic only; no municipal identifiers').digest('hex');const hashed=h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
 f.state.records[0].contractId=hashed;f.state.records[0].personId=record();assert.equal((await review(f)).data.rows[0].contractId,hashed);
 assert.throws(()=>grhImportContext(principal(),{...session(),id:record()}),{code:'PAYROLL_NOVELTY_SESSION_INVALID'});
});
test('explicit selection among stored contracts of one person uses the exact chosen key',async()=>{
 const f=fixture();f.state.records[0].contractId=record('f','0',1);f.state.records[0].personId=record('0','f',1);f.state.records.push({...f.state.records[0],contractId:record('9','3',2),legajo:'2001'});
 assert.equal((await review(f)).data.readyToPrepare,false);f.payload.choices=[{rowOrdinal:1,contractId:record('9','3',2)}];
 const expected=await client(f),p=(await review(f)).data;grhPreview({ok:true,replayed:false,data:p},expected);f.payload.previewToken=p.previewToken;
 assert.equal((await save(f)).data.batch.rows[0].employmentContractId,record('9','3',2));assert.equal(f.state.writes,1);
});
test('different persons sharing a DNI stay unresolved, regardless of key format',async()=>{
 const f=fixture();f.state.records[0].contractId=record();f.state.records[0].personId=record('f','0',101);f.state.records.push({...f.state.records[0],contractId:record('9','2'),personId:record('f','0',102),legajo:'2001'});
 const p=(await review(f)).data;assert.equal(p.rows[0].status,'identity_review');assert.equal(p.readyToPrepare,false);await assert.rejects(save(f));assert.equal(f.state.writes,0);
});
for(const field of ['contractId','personId'])test('database '+field+' cannot be the empty UUID',async()=>{
 const f=fixture();f.state.records[0][field]='00000000-0000-0000-0000-000000000000';await assert.rejects(review(f),{code:'PAYROLL_NOVELTY_CONTRACT_DRIFT'});assert.equal(f.state.writes,0);
});
test('well-formed foreign chosen ID is not authority to use another contract',async()=>{const f=fixture();f.payload.choices=[{rowOrdinal:1,contractId:record()}];await assert.rejects(review(f),{code:'PAYROLL_NOVELTY_IDENTITY_CHANGED'});assert.equal(f.state.writes,0);});
test('changed source or identity still invalidates a stored-key preview before writing',async()=>{for(const kind of ['source','identity']){const f=fixture();f.state.records[0].contractId=record();f.payload.previewToken=(await review(f)).data.previewToken;if(kind==='source')f.state.sourceToken='e'.repeat(64);else f.state.subjectPatch={identityToken:'e'.repeat(64)};await assert.rejects(save(f),{code:'PAYROLL_NOVELTY_IDENTITY_CHANGED'});assert.equal(f.state.writes,0);}});
test('a different valid stored key cannot be substituted into the final receipt',async()=>{const f=fixture();f.state.records[0].contractId=record();const expected=await client(f),p=(await review(f)).data;f.payload.previewToken=p.previewToken;const result=await save(f);result.data.batch.rows[0].employmentContractId=record('f','0',2);await assert.rejects(grhReceipt({ok:true,...result},expected,p));});
test('record identity compatibility does not bypass missing nominal capability',async()=>{const f=fixture(),p=principal();p.tenant.effectiveCapabilities=p.tenant.effectiveCapabilities.filter(c=>c!=='payroll.novelty.nominal.read');f.state.records[0].contractId=record();await assert.rejects(reviewGrhImport(f.readSql,f.runtime,p,session(),f.payload),{code:'PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED'});assert.equal(f.state.readCalls.length+f.state.runtimeCalls.length,0);});
