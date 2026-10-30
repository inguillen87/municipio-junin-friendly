// Synthetic approved sources only. No API, SQL or municipal approval.
import test from 'node:test';import assert from 'node:assert/strict';
import{approvedSyntheticSources}from'./fixtures/own-monthly-days-approved-synthetic.js';
import{prepareOwnPayrollInput,prepareOwnPayrollInputComplete}from'../lib/own-payroll-approved-input.js';
import{createOwnPayrollSnapshot}from'../lib/own-payroll-snapshot.js';
const adapters=[['legacy',prepareOwnPayrollInput],['fixed-v2',prepareOwnPayrollInputComplete]];
test('approved193 full30 plus forced amount completes without an unrelated157 source and conserves provenance',()=>{for(const[mode,prepare]of adapters){const s=approvedSyntheticSources('sql193',{mode,forcedFixed:true}),before=JSON.stringify(s);assert.equal(Object.hasOwn(s,'periodParticipation'),false);const input=prepare(s),result=createOwnPayrollSnapshot(input).result;assert.equal(result.rows.find(r=>r.conceptCode==='107').amount,'25000.00');assert.equal(input.employees[0].fixedForcedAmounts[0].sourceRowSha256.length,64);assert.equal(input.employees[0].fixedForcedAmounts[0].recordId,s.fixed.export.data.rows[0].recordId);assert.equal(JSON.stringify(s),before);}});
test('approved193 partial16 plus forced amount still rejects implicit proration atomically',()=>{for(const[mode,prepare]of adapters){const s=approvedSyntheticSources('sql193',{mode,recognizedDays:'16',forcedFixed:true}),before=JSON.stringify(s);assert.throws(()=>prepare(s),e=>e.code==='PRORATION_REQUIRED');assert.equal(JSON.stringify(s),before);}});
