// Real exporter/model for file cases; scope cases are explicitly manufactured
// boundary inputs, not native receipts, SQL results or admission evidence.
import test from 'node:test';import assert from 'node:assert/strict';
import {prepareBankOutput,createBankOutputTxt} from '../assets/own-bank-output-model.js';
import {bankOutputFixture,syntheticNet} from './fixtures/own-bank-output-synthetic.js';
import {syntheticCbu,syntheticBankAccountsDefinition} from './fixtures/own-bank-accounts-synthetic.js';
import {nativeFinancial350BnaProfile,decodeNativeBna200,assertNativeBna200File,assertNativeFinancial350BnaScope} from '../scripts/lib/own-novelty-succession-bna-output-qa.mjs';
const uid=n=>'bbbbbbbb-0000-4000-8000-'+String(n).padStart(12,'0');
async function realFile(){const f=bankOutputFixture(1);syntheticNet(f,'350.00');const review=await prepareBankOutput(f.batch,f.accounts,f.profile,f.closes),file=createBankOutputTxt(review);return {f,review,file,input:{profile:f.profile,issuerTaxId:f.batch.snapshot.params.issuer.taxId,record:f.batch.snapshot.records[0],account:f.accounts.configuration.definition.accounts[0],expectedCents:'35000'}};}
function editLines(bytes,change){const lines=new TextDecoder().decode(bytes).split('\r\n');change(lines);return new TextEncoder().encode(lines.join('\r\n'));}
const field=(line,from,until,value)=>{assert.equal(value.length,until-from);return line.slice(0,from)+value+line.slice(until);};

test('real BNA exporter retains declared all scope, approved999/typeNULL and one original350 detail in200-byte records',async()=>{
 const {f,review,file,input}=await realFile(),before=structuredClone(f);assert.deepEqual(nativeFinancial350BnaProfile(),f.profile);assert.equal(review.ready,true);assert.equal(input.account.accountType,null);assert.ok(input.account.cbu.startsWith('999'));
 const decoded=assertNativeBna200File(file.bytes,input);assert.equal(decoded.recordBytes,200);assert.equal(decoded.bytes,606);assert.equal(decoded.details[0].cents,'35000');assert.equal(decoded.details[0].cbu,input.account.cbu);assert.equal(decoded.trailer.totalCents,'35000');assert.equal(decoded.trailer.recordCount,1);assert.deepEqual(f,before);assert.equal(review.bankSubmitted,false);assert.equal(review.paymentExecuted,false);
});
test('decoder rejects malformed framing, nonASCII and a mismatched trailer without recoding or partial output',async()=>{
 const {file}=await realFile();assert.throws(()=>decodeNativeBna200(file.bytes.slice(0,-1)),/QA_BNA200/);const unicode=Uint8Array.from(file.bytes);unicode[150]=233;assert.throws(()=>decodeNativeBna200(unicode),/QA_BNA200_ASCII/);
 assert.throws(()=>decodeNativeBna200(editLines(file.bytes,lines=>{lines[2]=field(lines[2],16,23,'0000002');})),/QA_BNA200_COUNT/);assert.throws(()=>decodeNativeBna200(editLines(file.bytes,lines=>{lines[2]=field(lines[2],1,16,'000000000034500');})),/QA_BNA200_TOTAL/);
});
test('coherent345 detail and trailer cannot replace the immutable350 source even when the file totals reconcile',async()=>{
 const {file,input}=await realFile(),changed=editLines(file.bytes,lines=>{lines[1]=field(lines[1],24,34,'0000034500');lines[2]=field(lines[2],1,16,'000000000034500');});assert.equal(decodeNativeBna200(changed).trailer.totalCents,'34500');assert.throws(()=>assertNativeBna200File(changed,input),/QA_BNA350_ORIGINAL_CENTS/);
});
test('independent decoder binds CBU, CUIL and declared payer/profile fields to their original inputs',async()=>{
 const {file,input}=await realFile();for(const mutate of [lines=>{lines[1]=field(lines[1],2,24,syntheticCbu('9990001','0000000000002'));},lines=>{lines[1]=field(field(lines[1],49,60,'20111111111'),74,85,'20111111111');},lines=>{lines[0]=field(lines[0],63,73,'0000000001');}])assert.throws(()=>assertNativeBna200File(editLines(file.bytes,mutate),input));
});

function scopeBoundary(){
 const profile=nativeFinancial350BnaProfile(),pins=[1,2,3].map((population,index)=>({id:uid(index+1),snapshotSha256:String(index+1).repeat(64),period:'2026-10',type:'monthly',employeeCount:1,populationCount:population,selectedCount:index===2?1:0})),journey={contractId:uid(4),registrationId:uid(5),secondRunId:uid(6),closeGroupId:pins[2].id,receiptBatchId:uid(7),receiptSnapshotSha256:'a'.repeat(64),legajo:'718905',nativeFinancialContinuation:{sourcePins:pins}},record={contractId:journey.contractId,registrationId:journey.registrationId,runId:journey.secondRunId,liquidationVersion:2,sourceGroupId:journey.closeGroupId,employeeNumber:journey.legajo,cuil:'20111111111',totals:{net:'350.00'}};
 const account={...syntheticBankAccountsDefinition().accounts[0],contractId:journey.contractId,cbu:syntheticCbu('9990001','0000000000350'),accountNumber:'00350/00'},configuration={version:'b'.repeat(64),approvalId:uid(8),definition:{accounts:[account]}},batch={id:journey.receiptBatchId,snapshotSha256:journey.receiptSnapshotSha256,state:'approved',sourceCurrent:true,permissions:{canDownload:true},snapshot:{sources:structuredClone(pins),records:[record],recordCount:1}},sources={batch,accounts:{configuration},closes:pins.map(pin=>({groupId:pin.id,snapshotSha256:pin.snapshotSha256,snapshot:{employeeCount:pin.employeeCount,populationCount:pin.populationCount}}))},review={kind:'bna',ready:true,recordCount:1,selectedCount:1,rows:[{...record,selected:true,issues:[],account:structuredClone(account),jurisdiction:{code:'42'}}],issues:[],totalCents:'35000',receiptId:batch.id,receiptSha256:batch.snapshotSha256,accountsVersion:configuration.version,accountsApprovalId:configuration.approvalId,profile:structuredClone(profile)};
 return {journey,sources,review,profile,expectedCents:'35000'};
}
test('three-source boundary keeps complete0/0/1 scope and account999/typeNULL; omission, retarget or selection drift is rejected',()=>{
 const input=scopeBoundary(),before=structuredClone(input),scope=assertNativeFinancial350BnaScope(input);assert.deepEqual(scope.sourcePins.map(pin=>pin.selectedCount),[0,0,1]);assert.deepEqual(input,before);
 for(const mutate of [v=>v.sources.batch.snapshot.sources.shift(),v=>v.sources.closes.shift(),v=>{v.sources.batch.snapshot.sources[0].selectedCount=1;},v=>{v.sources.accounts.configuration.definition.accounts[0].cbu=syntheticCbu('0110001');},v=>{v.sources.accounts.configuration.definition.accounts[0].accountType='CA';},v=>{v.journey.secondRunId=uid(99);},v=>{v.sources.accounts.configuration.approvalId=uid(98);},v=>{v.profile.destinationScope='nacion_ca';}]){const changed=structuredClone(input);mutate(changed);assert.throws(()=>assertNativeFinancial350BnaScope(changed));}
});
test('the existing NaciónCA guard still rejects999 recipients without inventing their account type',async()=>{
 const {f}=await realFile(),before=structuredClone(f.accounts);f.profile.destinationScope='nacion_ca';const review=await prepareBankOutput(f.batch,f.accounts,f.profile,f.closes);assert.equal(review.selectedCount,0);assert.equal(review.ready,false);assert.ok(review.issues.includes('EMPTY_DESTINATION'));assert.throws(()=>createBankOutputTxt(review));assert.deepEqual(f.accounts,before);
});
