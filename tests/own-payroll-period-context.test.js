import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {OWN_PAYROLL_PERIOD_CONTEXT_VERSION,ownProgramPeriodContext,periodContextFields,periodContextCapture,createPeriodContext,verifiedPeriodContextCapture} from '../assets/own-payroll-period-context.js';
const nodeHash=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
test('declared month is canonical across ordinary, year-end and leap-year periods; WebCrypto equals the canonical Node hash',async()=>{
 for(const[period,month]of[['1900-01','1'],['2026-09','9'],['2026-12','12'],['2028-02','2'],['2099-12','12']]){
  const fields={version:OWN_PAYROLL_PERIOD_CONTEXT_VERSION,period,monthNumber:month},value=await createPeriodContext(period);
  assert.deepEqual(periodContextFields(period),fields);assert.deepEqual(value,{...fields,sha256:nodeHash(fields)});assert.equal(await verifiedPeriodContextCapture(value,period),value);
 }
});
test('period context never infers a period or month from a Date, timestamp, number, unpadded month or external date fields',()=>{
 for(const invalid of[null,undefined,9,202609,new Date('2026-09-01'),'2026-9','2026-00','2026-13','1899-12','2100-01','2026-09-30',' 2026-09','2026-09 ',...['\n','\r','\u2028','\u2029'].map(c=>'2026-09'+c),{period:'2026-09',date:'2026-12-31'}])assert.throws(()=>periodContextFields(invalid),e=>e.code==='PERIOD_CONTEXT_INVALID');
});
test('strict capture rejects noncanonical numbers, shifted month, other version, extra fields and accessors without invoking them',async()=>{
 const value=await createPeriodContext('2026-09');
 for(const patch of[{monthNumber:9},{monthNumber:'09'},{monthNumber:'0'},{monthNumber:'12'},{period:'2026-12'},{version:'own-payroll-period-context.v2'},{sha256:null},{liquidationDate:'2026-09-30'},{paymentDate:'2026-09-30'}])assert.throws(()=>periodContextCapture({...value,...patch},'2026-09'));
 let touched=0;const accessor={...value};Object.defineProperty(accessor,'monthNumber',{enumerable:true,get(){touched++;return'9';}});assert.throws(()=>periodContextCapture(accessor,'2026-09'));assert.equal(touched,0);
 const symbolic={...value,[Symbol('extra')]:true};assert.throws(()=>periodContextCapture(symbolic,'2026-09'));
 for(const c of['\n','\r','\u2028','\u2029'])assert.throws(()=>periodContextCapture({...value,monthNumber:'9'+c},'2026-09'),e=>e.code==='PERIOD_CONTEXT_INVALID');
});
test('context hash is independent of object order but not of the declared period, month, version or tampered hash',async()=>{
 const a=await createPeriodContext('2026-09'),b=await createPeriodContext('2027-09');assert.notEqual(a.sha256,b.sha256);
 await verifiedPeriodContextCapture({sha256:a.sha256,monthNumber:'9',period:'2026-09',version:OWN_PAYROLL_PERIOD_CONTEXT_VERSION},'2026-09');
 await assert.rejects(()=>verifiedPeriodContextCapture({...a,sha256:'a'.repeat(64)},'2026-09'),e=>e.code==='SOURCE_VERSION_INVALID');
 await assert.rejects(()=>verifiedPeriodContextCapture({...a,sha256:nodeHash({...periodContextFields('2026-09'),monthNumber:'12'})},'2026-09'),e=>e.code==='SOURCE_VERSION_INVALID');
});
test('programme context requires one exact explicit opt-in and never reads an accessor',()=>{
 assert.equal(ownProgramPeriodContext({}),false);assert.equal(ownProgramPeriodContext({periodContextVersion:null}),false);assert.equal(ownProgramPeriodContext({periodContextVersion:OWN_PAYROLL_PERIOD_CONTEXT_VERSION}),true);
 const p={};Object.defineProperty(p,'periodContextVersion',{get(){throw Error('accessor must not run');}});assert.equal(ownProgramPeriodContext(p),false);
});
