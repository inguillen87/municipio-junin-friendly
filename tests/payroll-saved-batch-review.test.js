import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {requestedNoveltyBatch,verifyMonthlyBatch} from '../assets/payroll-native-monthly-model.js';
import {fixture,id,principal,session} from './fixtures/grh-import-synthetic.js';
import {reviewGrhImport,prepareGrhImport} from '../lib/internal-grh-import.js';

test('a saved batch link selects only one exact opaque batch, independently of other view filters',()=>{
 assert.equal(requestedNoveltyBatch('?batchId='+id(900)+'&period=2026-08'),id(900));
 assert.equal(requestedNoveltyBatch('?batchId=AB111111-1111-4111-8111-000000000900'),'ab111111-1111-4111-8111-000000000900');
 assert.equal(requestedNoveltyBatch(''),null);assert.equal(requestedNoveltyBatch('?monthlyContractId='+id(100)),null);
});

for(const query of ['?batchId=', '?batchId=undefined', '?batchId='+id(900)+'&batchId='+id(901), '?batchId='+id(900)+'&batchId='+id(900), '?batchId='+id(900)+'&monthlyContractId=', '?batchId='+id(900)+'&monthlyContractId='+id(100), '?batchId=00000000-0000-0000-0000-000000000000', '?batchId='+id(900)+'%0A', '?batchId=https%3A%2F%2Fexample.invalid', '?batchId=%3Cscript%3E'])test('ambiguous or forged batch destination is rejected: '+query,()=>{
 assert.throws(()=>requestedNoveltyBatch(query),/único lote válido/);
});

async function reader({query='?batchId='+id(900),capabilities=['payroll.novelty.read','payroll.novelty.nominal.read'],blocked=false,responseId=id(900),denied=false}={}){
 const f=fixture(60),preview=(await reviewGrhImport(f.readSql,f.runtime,principal(),session(),f.payload)).data;
 f.payload.previewToken=preview.previewToken;
 const receipt=await prepareGrhImport(f.readSql,f.runtime,principal(),session(),f.payload,id(99));
 const detail={...receipt.data.batch,id:responseId,allowedCommands:['submit','cancel'],canExport:false};
 const requests=[],renders=[],messages=[];
 const source=fs.readFileSync('assets/payroll-novelty-workbench.js','utf8');
 const begin=source.indexOf('async function openBatch('),end=source.indexOf('\nfunction transitionInput(',begin);
 assert.ok(begin>0&&end>begin);
 const context={requestedNoveltyBatch,URL,encodeURIComponent,document:{hidden:false},detailReadVersion:0,clearBatchDetail(){context.detailReadVersion++;},location:{href:'https://municontrol.test/novedades-nomina.html'+query},API_URL:'/api/internal-payroll-novelties',readBlocked:blocked,hasCapability:cap=>capabilities.includes(cap),setBusy(){},showMessage:(...args)=>messages.push(args),errorMessage:error=>error.message,renderBatchDetail:payload=>{verifyMonthlyBatch(payload.data,{mode:'detail'});renders.push(payload.data);},api:async(...args)=>{requests.push(args);if(denied)throw Object.assign(Error('No autorizado'),{status:403});return{ok:true,data:detail};}};
 vm.runInNewContext(source.slice(begin,end)+'\nthis.openRequestedBatch=openRequestedBatch;',context);
 await context.openRequestedBatch();return{requests,renders,messages,f};
}

test('opening the saved import retrieves all 60 rows of the exact batch without another write',async()=>{
 const h=await reader();assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0],['/api/internal-payroll-novelties?resource=detail&version=2&id='+id(900)]);
 assert.equal(h.renders.length,1);assert.equal(h.renders[0].rows.length,60);assert.equal(h.renders[0].rows.at(-1).rowOrdinal,60);assert.equal(h.f.state.writes,1,'only the synthetic setup import');
 assert.deepEqual(h.renders[0].allowedCommands,['submit','cancel']);assert.equal(h.renders[0].payrollCalculated,false);
});

test('the detail may only come from the batch selected by the verified receipt',async()=>{
 const h=await reader({responseId:id(901)});assert.equal(h.renders.length,0);assert.match(h.messages[0][2],/otro lote/);
});

for(const options of [{capabilities:['payroll.novelty.read']},{capabilities:['payroll.novelty.nominal.read']},{blocked:true},{query:'?batchId='+id(900)+'&monthlyContractId='+id(100)}])test('unavailable authority or ambiguous destination does not even request the detail: '+JSON.stringify(options),async()=>{
 const h=await reader(options);assert.equal(h.requests.length,0);assert.equal(h.renders.length,0);
});

test('server refusal does not restore detail or run any action',async()=>{
 const h=await reader({denied:true});assert.equal(h.requests.length,1);assert.equal(h.renders.length,0);assert.match(h.messages[0][2],/No autorizado/);assert.equal(h.f.state.writes,1);
});

test('explicit saved-batch entry cannot consume a previous preparation handoff',()=>{
 const source=fs.readFileSync('assets/payroll-novelty-workbench.js','utf8');
 assert.match(source,/if \(!requestedMonthlyContract && !hasRequestedBatch\) consumePayrollNoveltyHandoff\(\)/);
 assert.match(source,/loadBootstrap\(\)\.then\(\(\)=> \{\s*if \(hasRequestedBatch\) return openRequestedBatch\(\)/);
});
