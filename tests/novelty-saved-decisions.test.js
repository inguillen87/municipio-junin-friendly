// Runs the actual workbench read/decision/retry functions with synthetic API data.
// No browser layout or PostgreSQL execution is claimed by this harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../assets/payroll-native-monthly-model.js';
import {batch,bootstrap,id} from './fixtures/novelty-saved-review-synthetic.js';
const source=fs.readFileSync('assets/payroll-novelty-workbench.js','utf8');
const functions=source.slice(source.indexOf('function transitionInput('),source.indexOf('async function exportBatch('));

function harness(command='submit'){
  const original=batch();if(['approve','reject'].includes(command)){original.status='submitted';original.version=2;original.allowedCommands=['approve','reject'];}
  const reviewed=model.savedNoveltyBatch(original),requests=[],messages=[],confirms=[],renders=[];
  const state={fresh:bootstrap(),current:structuredClone(original),confirm:true,fail:null,hook:null,loads:0};
  const fields=new Map([['rejectReason',{value:'invalid_rows'}]]);
  const context={...model,crypto,encodeURIComponent,TYPE_LABELS:{monthly:'Mensual'},
    API_URL:'/api/internal-payroll-novelties',bootstrapState:bootstrap(),reviewedBatch:reviewed,selectedBatchId:original.id,
    document:{hidden:false,body:{dataset:{busy:'false'}}},readBlocked:false,requestEpoch:0,detailReadVersion:1,
    pendingWrite:null,pendingTransitionAttempts:new Map(),byId:key=>fields.get(key),
    principalKey:p=>p?[p.tenantId,p.membershipId,p.certifiedBindingId].join('|'):'',
    hasCapability:(cap,p=context.bootstrapState.principal)=>!context.readBlocked&&p.capabilities.includes(cap),
    setBusy:value=>{context.document.body.dataset.busy=String(value);},applyMonthlyLocks(){},clearMessage(){},
    actionLabel:command=>({submit:'Enviar a aprobación',approve:'Aprobar para exportar',reject:'Rechazar',cancel:'Cancelar lote'})[command],
    showMessage:(...args)=>messages.push(args),errorMessage:error=>error.message,
    window:{confirm:message=>{confirms.push(message);return state.confirm;}},
    clearBatchDetail:()=>{context.detailReadVersion++;context.reviewedBatch=null;},
    clearConsulted:()=>{context.requestEpoch++;context.readBlocked=true;context.clearBatchDetail();},
    renderBatchDetail:payload=>{context.reviewedBatch=model.savedNoveltyBatch(payload.data);renders.push(payload.data);},
    loadBootstrap:async()=>{state.loads++;},
    api:async(url,options)=>{
      requests.push({url,...options});await state.hook?.(url,options);
      if(state.fail)throw Object.assign(Error('Respuesta incierta sintética'),state.fail);
      if(url.includes('resource=bootstrap'))return structuredClone(state.fresh);
      if(url.includes('resource=detail'))return {data:structuredClone(state.current)};
      const data=structuredClone(original);data.version++;data.status={submit:'submitted',approve:'approved',reject:'rejected',cancel:'cancelled'}[JSON.parse(options.body).command];
      return {ok:true,data};
    },
  };
  vm.createContext(context);vm.runInContext(functions,context);
  return{context,state,requests,messages,confirms,renders,reviewed,
    run:()=>context.applyTransition(reviewed,command),retry:()=>context.sendPendingWrite(),
    posts:()=>requests.filter(r=>r.method==='POST')};
}

for(const command of ['submit','approve','reject','cancel'])test(command+' checks fresh authority and all 60 rows before confirmation and a single write',async()=>{
  const h=harness(command);await h.run();
  assert.equal(h.requests.length,3);assert.ok(h.requests[0].url.includes('bootstrap'));assert.ok(h.requests[1].url.includes('detail'));
  assert.equal(h.confirms.length,1);assert.match(h.confirms[0],/60 filas/);assert.match(h.confirms[0],/2026-09/);
  assert.equal(h.posts().length,1);const body=JSON.parse(h.posts()[0].body);
  assert.equal(body.command,command);assert.equal(body.payload.batchId,id(1));assert.equal(body.payload.expectedVersion,h.reviewed.version);
  assert.equal(h.state.loads,1);assert.equal(h.context.pendingWrite,null);
});

test('declining confirmation leaves the batch intact and creates no retry key or write',async()=>{
  const h=harness();h.state.confirm=false;await h.run();assert.equal(h.posts().length,0);assert.equal(h.context.pendingTransitionAttempts.size,0);
  assert.equal(h.context.reviewedBatch,h.reviewed);
});

for(const change of [h=>h.state.current.version++,h=>h.state.current.rows[59].amountCents='0',
  h=>h.state.current.allowedCommands=['cancel'],h=>h.state.current.rows[59].issues.push({code:'conflict',severity:'error',blocking:true})])test('changed evidence requires review again without silently applying a decision: '+change,async()=>{
  const h=harness();change(h);await h.run();assert.equal(h.posts().length,0);assert.equal(h.confirms.length,0);
  assert.equal(h.renders.length,1);assert.match(h.messages.at(-1)[1],/lote cambió/);
});

for(const change of [h=>h.state.fresh.principal.membershipId=id(55),h=>h.state.fresh.principal.certifiedBindingId=id(55),
  h=>h.state.fresh.principal.capabilities=h.state.fresh.principal.capabilities.filter(c=>c!=='payroll.novelty.nominal.read'),
  h=>h.state.fresh.principal.capabilities=h.state.fresh.principal.capabilities.filter(c=>c!=='payroll.novelty.prepare')])test('changed access retires the review before consulting or writing detail: '+change,async()=>{
  const h=harness();change(h);await h.run();assert.equal(h.requests.length,1);assert.equal(h.posts().length,0);
  assert.equal(h.context.reviewedBatch,null);assert.equal(h.context.readBlocked,true);
});

for(const mutation of [h=>h.context.document.hidden=true,h=>h.context.clearBatchDetail(),h=>h.context.clearConsulted()])test('late validation cannot restore a hidden, closed or revoked review: '+mutation,async()=>{
  const h=harness();h.state.hook=async(url)=>{if(url.includes('detail'))mutation(h);};
  await h.run();assert.equal(h.posts().length,0);assert.equal(h.confirms.length,0);assert.equal(h.renders.length,0);
});

test('another batch response retires the review and cannot generate an operation',async()=>{
  const h=harness();h.state.current.id=id(99);await h.run();assert.equal(h.posts().length,0);assert.equal(h.confirms.length,0);
  assert.equal(h.context.reviewedBatch,null);assert.match(h.messages.at(-1)[2],/otro lote/);
});

test('a double click cannot create parallel validation or writes',async()=>{
  const h=harness();let release;h.state.hook=()=>new Promise(resolve=>{release=resolve;});
  const pending=h.run();await h.run();assert.equal(h.requests.length,1);
  h.state.hook=null;release();await pending;assert.equal(h.posts().length,1);
});

test('a lost receipt recovers the identical command, version, content and key without another decision',async()=>{
  const h=harness('reject');h.state.hook=async(url,options)=>{if(options?.method==='POST')h.state.fail={};};
  await h.run();assert.ok(h.context.pendingWrite?.uncertain);const first=h.posts()[0];
  h.context.byId('rejectReason').value='duplicate_or_conflict';
  await h.run();assert.equal(h.posts().length,1,'a pending operation blocks a different decision');
  h.state.hook=null;h.state.fail=null;await h.retry();
  assert.equal(h.posts().length,2);assert.equal(h.posts()[1].body,first.body);
  assert.equal(h.posts()[1].headers['Idempotency-Key'],first.headers['Idempotency-Key']);
  assert.equal(h.confirms.length,1);assert.equal(h.context.pendingWrite,null);
});

test('read failure before confirmation never creates a write attempt',async()=>{
  const h=harness();h.state.fail={status:503};await h.run();
  assert.equal(h.posts().length,0);assert.equal(h.context.pendingWrite,null);assert.equal(h.context.pendingTransitionAttempts.size,0);
});

test('loss of nominal access blocks recovery of a saved-batch decision without changing its key',async()=>{
  const h=harness();h.state.hook=async(url,options)=>{if(options?.method==='POST')h.state.fail={};};
  await h.run();const pending=h.context.pendingWrite,first=h.posts()[0];
  h.context.bootstrapState.principal.capabilities=h.context.bootstrapState.principal.capabilities.filter(c=>c!=='payroll.novelty.nominal.read');
  h.state.fail=null;h.state.hook=null;await h.retry();assert.equal(h.posts().length,1);
  assert.equal(h.context.pendingWrite,pending);assert.equal(pending.attempt.key,first.headers['Idempotency-Key']);
});
