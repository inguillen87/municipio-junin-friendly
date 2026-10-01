import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {savedNoveltyBatch} from '../assets/payroll-native-monthly-model.js';
import {batch,id} from './fixtures/novelty-saved-review-synthetic.js';
const source=fs.readFileSync('assets/payroll-novelty-workbench.js','utf8');
const readFunctions=source.slice(source.indexOf('async function openBatch('),source.indexOf('function transitionInput('));
const clearFunctions=source.slice(source.indexOf('function clearBatchDetail('),source.indexOf('function renderBatchDetail('));

function harness(){
  const fields=new Map(),renders=[],errors=[],waiting=[];
  const q=id=>{if(!fields.has(id))fields.set(id,{textContent:'dato sintético',hidden:false,replaceChildren(){this.textContent='';}});return fields.get(id);};
  const context={document:{hidden:false},API_URL:'/api/internal-payroll-novelties',readBlocked:false,detailReadVersion:0,reviewedBatch:null,
    byId:q,savedReviewPanel:{clear(){q('savedRows').textContent='';}},hasCapability:()=>true,setBusy(){},
    encodeURIComponent,renderBatchDetail:payload=>{context.reviewedBatch=savedNoveltyBatch(payload.data);renders.push(payload.data);},
    showMessage:(...args)=>errors.push(args),errorMessage:error=>error.message,
    api:()=>new Promise((resolve,reject)=>waiting.push({resolve,reject})),
  };
  vm.createContext(context);vm.runInContext(clearFunctions+readFunctions,context);
  return{context,q,renders,errors,waiting};
}

test('a slow previous detail cannot replace the batch requested afterwards',async()=>{
  const h=harness(),first=h.context.openBatch(id(1)),second=h.context.openBatch(id(2)),b=batch();b.id=id(2);
  h.waiting[1].resolve({data:b});await second;h.waiting[0].resolve({data:batch()});await first;
  assert.equal(h.renders.length,1);assert.equal(h.context.reviewedBatch.id,id(2));
});

for(const retire of [h=>h.context.clearBatchDetail(),h=>h.context.document.hidden=true,h=>h.context.readBlocked=true])test('a response after closing, hiding or revocation does not render: '+retire,async()=>{
  const h=harness(),request=h.context.openBatch(id(1));retire(h);h.waiting[0].resolve({data:batch()});await request;
  assert.equal(h.renders.length,0);assert.equal(h.context.reviewedBatch,null);
});

test('failed replacement cannot leave the previous lot available for a decision',async()=>{
  const h=harness();h.context.reviewedBatch=savedNoveltyBatch(batch());
  const request=h.context.openBatch(id(2));assert.equal(h.context.reviewedBatch,null);
  h.waiting[0].reject(Error('Fallo sintético'));await request;
  assert.equal(h.context.reviewedBatch,null);assert.equal(h.q('detailPanel').hidden,true);assert.equal(h.q('detailActions').textContent,'');
});

test('hiding and returning a cached page withdraws nominal data but retains the exact uncertain attempt',()=>{
  const elements=new Map(),listeners=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'Dato sintético',value:'',hidden:false,querySelectorAll:()=>[],replaceChildren(){this.textContent='';}});return elements.get(id);};
  const pending=Object.freeze({attempt:Object.freeze({body:'synthetic pending request',key:id(80)}),uncertain:true});
  const panel={clear(){},clearLookupLabels(){},deny(){},close(){}};
  const context={pendingWrite:pending,reviewedBatch:savedNoveltyBatch(batch()),detailReadVersion:0,requestEpoch:0,lookupEpoch:0,
    readBlocked:false,suspendedFields:null,byId:element,cancelFileRead(){},savedReviewPanel:panel,reviewPanel:panel,issuesPanel:panel,
    employeePicker:panel,monthlyPicker:panel,attendancePreparte:panel,sheetEditor:panel,fixedNovelties:panel,nativeMonthlyReview:panel,preparedNativeReview:{},
    applyMonthlyLocks(){},showMessage(){},monthlySubject:null,monthlyContractId:null,agileDraftRows:[],agileTemplate:null,
    clearAgileInput(){},invalidatePreparedDraft(){},renderAgileRows(){},
    document:{hidden:true,addEventListener:(type,fn)=>listeners.set(type,fn)},window:{addEventListener:(type,fn)=>listeners.set(type,fn)}};
  vm.createContext(context);
  vm.runInContext(clearFunctions+source.slice(source.indexOf('function clearConsulted('),source.indexOf('function discardLocalDraft(')),context);
  vm.runInContext(source.slice(source.indexOf("  document.addEventListener('visibilitychange'"),source.indexOf("  window.addEventListener('beforeunload'")),context);
  listeners.get('visibilitychange')();assert.equal(context.pendingWrite,pending);assert.equal(context.readBlocked,true);
  assert.equal(context.reviewedBatch,null);assert.equal(element('detailRows').textContent,'');assert.equal(element('detailPanel').hidden,true);
  assert.equal(context.preparedNativeReview,null);
  listeners.get('pagehide')();assert.equal(context.pendingWrite,pending);
  context.document.hidden=false;listeners.get('visibilitychange')();assert.equal(context.pendingWrite,pending);assert.equal(context.readBlocked,true);
});
