// Synthetic contracts and the actual UI handlers; no DOM, network or SQL runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {ownNoveltyDetail,ownNoveltyWriteAttempt,ownNoveltyReceipt} from '../assets/own-payroll-novelties-model.js';
import {ownNoveltyHash,verifyOwnNoveltyHashes} from '../lib/internal-own-payroll-novelties.js';
import {batch,prepare} from './fixtures/own-payroll-novelties-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';

const reviewer={membershipId:uid(21003),personId:uid(21004)};
const original=(command,count=759)=>batch(count,command==='submit'
 ? {status:'draft',revision:1,decidedBy:null,approvals:[]}
 : command==='cancel'?{}:{status:'submitted',revision:2,decidedBy:null,approvals:[]});
const bodyFor=(reviewed,command)=>({command,batchId:reviewed.id,expectedRevision:reviewed.revision,
 reasonReference:['reject','cancel'].includes(command)?'ref:'+uid(24001):null,reviewConfirmed:true});
const attemptFor=(reviewed,command)=>ownNoveltyWriteAttempt({key:uid(23001),body:bodyFor(reviewed,command),accessKey:'synthetic-scope'},reviewed);
function receiptFor(attempt){
 const snapshot=structuredClone(attempt.reviewedBatch),command=attempt.body.command;
 snapshot.revision++;snapshot.status={submit:'submitted',approve:'approved',reject:'rejected',cancel:'cancelled'}[command];
 if(command==='approve'){snapshot.approvals=[reviewer];snapshot.decidedBy=reviewer;}
 if(command==='reject')snapshot.decidedBy=reviewer;
 return {version:'own-payroll-novelty-receipt.v1',requestKey:attempt.key,requestSha256:ownNoveltyHash(attempt.body),body:attempt.body,snapshot,replayed:false};
}
const rehash=snapshot=>{snapshot.rowsSha256=ownNoveltyHash(snapshot.rows.map(({values,subject})=>({values,subject})));return snapshot;};

test('a complete self-consistent detail must belong to the requested batch',()=>{
 const full=batch(759);assert.equal(ownNoveltyDetail(full,full.id),full);
 assert.throws(()=>ownNoveltyDetail(full,uid(25000)),{code:'OWN_NOVELTY_CONTRACT_INVALID'});
 assert.throws(()=>verifyOwnNoveltyHashes(full,uid(25000)),{code:'OWN_NOVELTY_CONTRACT_INVALID',status:503});
});

test('a decision attempt keeps a detached, frozen complete review and unchanged command bytes',()=>{
 const reviewed=original('approve'),body=bodyFor(reviewed,'approve'),before=JSON.stringify(body);
 const attempt=ownNoveltyWriteAttempt({key:uid(23001),body,accessKey:'synthetic-scope'},reviewed);
 assert.equal(JSON.stringify(attempt.body),before);assert.equal(attempt.key,uid(23001));
 assert.equal(attempt.reviewedBatch.rowCount,759);assert.equal(attempt.reviewedBatch.rows.at(-1).values.rowOrdinal,759);
 assert.ok(Object.isFrozen(attempt));assert.ok(Object.isFrozen(attempt.reviewedBatch.rows.at(-1).subject));
 reviewed.rows.at(-1).values.amountCents='9999';body.expectedRevision=99;
 assert.equal(attempt.reviewedBatch.rows.at(-1).values.amountCents,'2000');assert.equal(attempt.body.expectedRevision,2);
 assert.throws(()=>{attempt.reviewedBatch.rows.pop();},TypeError);
 assert.throws(()=>ownNoveltyWriteAttempt({key:uid(23001),body:bodyFor(original('approve'),'approve'),accessKey:'synthetic-scope'},{...original('approve'),id:uid(25000)}),{code:'OWN_NOVELTY_CONTRACT_INVALID'});
 assert.throws(()=>ownNoveltyWriteAttempt({key:uid(23001),body:bodyFor(original('approve'),'approve'),accessKey:'synthetic-scope'},{...original('approve'),revision:3}),{code:'OWN_NOVELTY_VERSION_CHANGED'});
 const prepared=ownNoveltyWriteAttempt({key:uid(23001),body:prepare(759),accessKey:'synthetic-scope'});
 assert.equal(prepared.body.rows.length,759);assert.equal(Object.hasOwn(prepared,'reviewedBatch'),false);
});

for(const command of ['submit','approve','reject','cancel'])test(`${command} preserves all 759 reviewed rows through confirmation and replay`,()=>{
 const reviewed=original(command),attempt=attemptFor(reviewed,command),value=receiptFor(attempt);
 if(['reject','cancel'].includes(command)){
  // A current detail may report stale identity; the immutable event receipt
  // still retains its original flag. Rejection/cancellation remain readable.
  reviewed.rows.at(-1).identityCurrent=false;
  const staleAttempt=attemptFor(reviewed,command);
  assert.equal(ownNoveltyReceipt(value,staleAttempt).snapshot.rowCount,759);
 }
 assert.equal(ownNoveltyReceipt(value,attempt).snapshot.revision,reviewed.revision+1);
 assert.equal(ownNoveltyReceipt({...value,replayed:true},attempt).snapshot.rows.length,759);
});

for(const [label,mutate] of [
 ['last amount',b=>b.rows.at(-1).values.amountCents='2001'],
 ['last null quantity',b=>b.rows.at(-1).values.quantityDecimal='0'],
 ['last subject',b=>b.rows.at(-1).subject.employeeName='Otro nombre sintético'],
 ['last identity',b=>{b.rows.at(-1).values.identityToken='a'.repeat(64);b.rows.at(-1).subject.identityToken='a'.repeat(64);}],
 ['last row omitted',b=>{b.rows.pop();b.rowCount--;}],
 ['row order',b=>{[b.rows[0],b.rows[1]]=[b.rows[1],b.rows[0]];b.rows[0].values.rowOrdinal=1;b.rows[1].values.rowOrdinal=2;}],
 ['period',b=>b.periodMonth='2026-11-01'],
 ['type',b=>b.payrollType='sac'],
 ['preparer',b=>b.preparedBy={membershipId:uid(25001),personId:uid(25002)}],
])test(`a receipt cannot replace ${label} even with a recomputed valid hash`,()=>{
 const attempt=attemptFor(original('approve'),'approve'),value=receiptFor(attempt);
 mutate(value.snapshot);rehash(value.snapshot);verifyOwnNoveltyHashes(value.snapshot);
 // Structure and a self-consistent hash alone do not bind a later receipt to
 // what the operator reviewed before sending the decision.
 ownNoveltyReceipt(value);
 assert.throws(()=>ownNoveltyReceipt(value,attempt),{code:'OWN_NOVELTY_CONTRACT_INVALID'});
});

test('historical forced first-review receipts and explicit reconfirmation preserve review binding',()=>{
 const reviewed=original('approve',2);reviewed.rows[0].values.forced=true;reviewed.rows[0].values.observation='Fundamento de prueba sintética';rehash(reviewed);
 const first=attemptFor(reviewed,'approve'),historic=receiptFor(first);
 historic.snapshot.status='submitted';historic.snapshot.decidedBy=null;historic.replayed=true;
 assert.equal(ownNoveltyReceipt(historic,first).snapshot.status,'submitted');
 const confirmation=attemptFor(historic.snapshot,'approve'),final=receiptFor(confirmation);
 assert.equal(ownNoveltyReceipt(final,confirmation).snapshot.status,'approved');
 assert.equal(final.snapshot.revision,4);assert.equal(final.snapshot.approvals.length,1);
});

const source=fs.readFileSync(new URL('../assets/own-payroll-novelties-panel.js',import.meta.url),'utf8');
function sourceFunction(name){
 const start=source.indexOf('async function '+name+'(');assert.ok(start>=0,name);
 const open=source.indexOf('{',start);let depth=0;
 for(let i=open;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);}
 assert.fail('Unclosed source function '+name);
}
function ui(value,attempt){
 const shown=[],messages=[],confirmation={hidden:false},context={sequence:0,endpoint:'/synthetic',
  ownNoveltyDetail,ownNoveltyReceipt,sha:ownNoveltyHash,live:()=>true,request:async()=>({data:value}),
  attempt,receipt:null,prepared:attempt?.body,notFound:false,$:()=>confirmation,
  showDetail:b=>shown.push(b),status:text=>messages.push(text),controls:()=>{},labels:{approved:'Aprobado'},countWords:n=>String(n)};
 vm.createContext(context);vm.runInContext(sourceFunction('verifiedDetail')+'\n'+sourceFunction('accept'),context);
 return {context,shown,messages,confirmation};
}

test('the actual UI detail loader rejects a different complete batch before showing it',async()=>{
 const full=batch(759),f=ui(full,null);
 await assert.rejects(f.context.verifiedDetail(uid(25000)),{code:'OWN_NOVELTY_CONTRACT_INVALID'});
 assert.equal(f.shown.length,0);
 assert.equal((await f.context.verifiedDetail(full.id)).rows.length,759);
});

test('the actual UI receipt handler retains the pending attempt when the last reviewed row changes',async()=>{
 const attempt=attemptFor(original('approve'),'approve'),value=receiptFor(attempt);
 value.snapshot.rows.at(-1).values.amountCents='2001';rehash(value.snapshot);
 const f=ui(value,attempt);
 await assert.rejects(f.context.accept(value),{code:'OWN_NOVELTY_CONTRACT_INVALID'});
 assert.equal(f.context.receipt,null);assert.equal(f.context.attempt,attempt);assert.equal(f.shown.length,0);assert.equal(f.messages.length,0);
 const originalReceipt=receiptFor(attempt);originalReceipt.replayed=true;
 await f.context.accept(originalReceipt);
 assert.equal(f.context.receipt,originalReceipt);assert.equal(f.shown[0].rowCount,759);assert.equal(f.confirmation.hidden,true);
});

test('the actual send handler reauthorizes every retry and keeps original body, key and complete review',async()=>{
 const reviewed=original('approve'),body=bodyFor(reviewed,'approve'),calls=[],listeners=new Map();let auth=0,reads=0;
 const context={prepared:body,detail:reviewed,attempt:null,access:{key:'synthetic-scope'},rows:[],selected:new Set(),notFound:false,sequence:0,
  ownNoveltyWriteAttempt,salarySerialized:JSON.stringify,crypto:{randomUUID:()=>uid(23001)},endpoint:'/synthetic',
  authorized:async()=>{auth++;},verifiedDetail:async()=>{reads++;return reviewed;},
  work:operation=>operation(),renderRows:()=>{},renderPeople:()=>{},controls:()=>{},live:()=>true,
  $:name=>name==='confirm'?{checked:true}:{addEventListener:(_event,handler)=>listeners.set(name,handler)},
  request:async(_url,options)=>{calls.push(options);if(calls.length===1)throw Error('Synthetic timeout');return {data:receiptFor(context.attempt)};},
  accept:async value=>ownNoveltyReceipt(value,context.attempt)};
 vm.createContext(context);
 const start=source.indexOf("$('send').addEventListener('click',"),end=source.indexOf("$('recover').addEventListener('click',",start);
 assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),context);
 await assert.rejects(listeners.get('send')(),/Synthetic timeout/);
 const attempt=context.attempt;assert.equal(attempt.reviewedBatch.rows.length,759);
 context.detail={...batch(1),id:uid(25000)};context.prepared=null;
 await listeners.get('send')();assert.equal(auth,2);assert.equal(reads,1);assert.equal(context.attempt,attempt);
 assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
 assert.deepEqual(JSON.parse(calls[0].body),{operation:'command',payload:body});
 context.authorized=async()=>{throw Object.assign(Error('Synthetic revocation'),{status:403});};
 await assert.rejects(listeners.get('send')(),{status:403});assert.equal(calls.length,2);assert.equal(context.attempt,attempt);
});
