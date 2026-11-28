import test from 'node:test';
import assert from 'node:assert/strict';
import {officialCapture,officialCloseDetail,officialCloseReceipt} from './fixtures/own-payroll-official-close-synthetic.js';
import {closeDetail,closeReceipt} from './fixtures/own-payroll-close-synthetic.js';
import {ownCloseSnapshot,verifiedOwnCloseDetail,verifiedOwnCloseReceipt} from '../assets/own-payroll-close-model.js';
import {verifiedOwnOfficialCapture,verifiedOwnOfficialEconomicSource,verifiedOwnOfficialCloseSnapshot} from '../assets/own-payroll-official-snapshot-model.js';

// The digest is always the real WebCrypto SHA-256. Only the first await is
// paused, so the caller can mutate its own object while validation is pending.
async function duringFirstDigest(verify,source,mutate){
 const before=structuredClone(source),descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),original=globalThis.crypto;
 const digest=original.subtle.digest.bind(original.subtle);let entered,release,calls=0;
 const reached=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{async digest(...args){if(++calls===1){entered();await gate;}return digest(...args);}}}});
 try{
  const pending=verify(source);await reached;mutate(source);release();
  const result=await pending;
  assert.notEqual(result,source);assert.deepEqual(result,before);assert.notDeepEqual(source,before);assert.ok(calls>0);
 }finally{release();Object.defineProperty(globalThis,'crypto',descriptor);}
}
const snapshot=()=>ownCloseSnapshot(officialCloseDetail('tariff_v2_eligible_two'),{kind:'all',values:[]});
test('verified official capture returns an isolated copy while source totals and metadata change',async()=>{
 await duringFirstDigest(verifiedOwnOfficialCapture,officialCapture('tariff_v2_eligible_two'),c=>{c.saved.result.employeeTotals[0].net='0.00';c.payload.familyPayrollFacts.records[0].definition.quantities.primary='999';c.createdAt='changed during await';});
});
test('verified economic source isolates its policy table and metadata before hashing',async()=>{
 await duringFirstDigest(verifiedOwnOfficialEconomicSource,snapshot().sources[0],s=>{s.familyTariffCaptureMetadata.policies[0].rows[0].amount='999';s.inputSha256='f'.repeat(64);});
});
test('verified official snapshot returns the original validated totals and metadata copy',async()=>{
 await duringFirstDigest(verifiedOwnOfficialCloseSnapshot,snapshot(),s=>{s.employees[0].totals.net='0.00';s.sources[0].familyTariffCaptureMetadata.policySha256='f'.repeat(64);});
});
test('verified close detail isolates both decision rows and saved captures',async()=>{
 await duringFirstDigest(verifiedOwnCloseDetail,officialCloseDetail('tariff_v2_eligible_two'),d=>{d.rows[0].canClose=false;d.captures[0].saved.result.employeeTotals[0].net='0.00';d.captures[0].payload.programState.program.definition.familyTariffPolicies[0].rows[0].amount='999';});
});
test('verified close receipt isolates body, snapshot totals and tariff metadata',async()=>{
 await duringFirstDigest(verifiedOwnCloseReceipt,officialCloseReceipt(snapshot()),r=>{r.body.reason='Modificado durante la espera';r.snapshot.totals.net='0.00';r.snapshot.sources[0].familyTariffCaptureMetadata.policySha256='f'.repeat(64);});
});
test('historical close detail also returns an isolated copy without reinterpreting its result',async()=>{
 await duringFirstDigest(verifiedOwnCloseDetail,closeDetail(),d=>{d.rows[0].canClose=false;d.captures[0].saved.result.employeeTotals[0].net='0.00';});
});
test('historical close receipt also isolates its original body and snapshot',async()=>{
 await duringFirstDigest(verifiedOwnCloseReceipt,closeReceipt(),r=>{r.body.reason='Modificado durante la espera';r.snapshot.totals.net='0.00';});
});
