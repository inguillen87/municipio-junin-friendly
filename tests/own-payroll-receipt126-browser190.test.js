// Pure witness focals. No PostgreSQL, HTTP server, browser, grant or actor setup.
// These DTOs are synthetic boundary records, not native execution evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertReceipt126BrowserCommandExchange as fresh,assertReceipt126BrowserReplayExchange as replay} from '../scripts/lib/own-payroll-receipt126-browser190.mjs';
import {ownReceiptCommand,ownReceiptParams} from '../assets/own-payroll-receipt-model.js';
const KEY='22222222-2222-4222-8222-222222222222',BATCH='33333333-3333-4333-8333-333333333333';
const params=ownReceiptParams({period:'2026-10',types:['monthly'],filters:{employeeFrom:'',employeeTo:'',departmentFrom:'',departmentTo:'',agreementFrom:'',agreementTo:''},issuer:{name:'MUNICIPIO EXCLUSIVAMENTE SINTETICO QA126',taxId:'00000000000',address:'DOMICILIO EXCLUSIVAMENTE FICTICIO QA126'},paymentDate:null,legend:'Emisión exclusivamente sintética para revisión QA126; sin firma ni pago'});
const body=kind=>ownReceiptCommand({command:kind,scopeVersion:'a'.repeat(64),sourceVersion:'b'.repeat(64),params:kind==='prepare'?params:null,batchId:kind==='prepare'?null:BATCH,batchSha256:kind==='prepare'?null:'c'.repeat(64),reason:'Motivo exclusivamente sintético de revisión de recibos completos',reviewConfirmed:kind!=='prepare'});
function specimen(kind='prepare'){
 const expectedBody=body(kind),event={version:'own-receipt-event.v1',id:BATCH,batchId:BATCH,key:KEY,body:expectedBody,replayed:false};
 return{actor:kind==='prepare'?'preparer':'reviewer',kind,expectedBody,sentBody:{operation:'command',payload:structuredClone(expectedBody)},key:KEY,status:201,headerReplayed:false,value:{ok:true,data:event}};
}
function repeated(kind='prepare'){
 const packet=specimen(kind);return{expectedEvent:packet.value.data,key:KEY,body:packet.expectedBody,status:200,headerReplayed:true,value:{ok:true,data:{...packet.value.data,replayed:true}}};
}
test('prepare and independent approve retain the UI body/key, without normalizing the witness',()=>{
 for(const kind of['prepare','approve']){const packet=specimen(kind),before=structuredClone(packet);const proof=fresh(packet);assert.equal(proof.key,KEY);assert.strictEqual(proof.body,packet.expectedBody);assert.strictEqual(proof.event,packet.value.data);assert.deepEqual(packet,before);}
});
test('the two UI decisions cannot be relabeled as another actor or as withdrawal',()=>{
 for(const kind of['prepare','approve']){const packet=specimen(kind);assert.throws(()=>fresh({...packet,actor:kind==='prepare'?'reviewer':'preparer'}),/INDEPENDENT_COMMAND_ACTOR/);}
 assert.throws(()=>fresh({...specimen('approve'),kind:'withdraw'}),/EXISTING_DECISIONS_ONLY/);
});
test('changed original parameters, changed reason or an extra HTTP property cannot adopt a fresh receipt',()=>{
 for(const mutate of[
  packet=>{packet.sentBody.payload.reason+=' distinto';},
  packet=>{packet.sentBody.payload.params.issuer.name='OTRO MUNICIPIO SINTETICO';},
  packet=>{packet.sentBody.actor='reviewer';}
 ]){const packet=specimen();mutate(packet);assert.throws(()=>fresh(packet));}
});
test('the retained UI key must be a lower-case crypto.randomUUID v4 value and match the event',()=>{
 for(const key of['not-a-key','22222222-2222-1222-8222-222222222222','ABCDEFAB-2222-4222-8222-222222222222'])assert.throws(()=>fresh({...specimen(),key}));
 const packet=specimen();packet.value.data.key='55555555-5555-4555-8555-555555555555';assert.throws(()=>fresh(packet));
});
test('transport/server errors, missing receipts or an already replayed reply cannot count as a fresh decision',()=>{
 for(const mutate of[
  packet=>{packet.status=503;packet.value={ok:false,error:'Synthetic unavailable'};},
  packet=>{packet.status=403;packet.value={ok:false,code:'OWN_RECEIPT_FORBIDDEN'};},
  packet=>{packet.value={ok:true};},
  packet=>{packet.status=200;packet.headerReplayed=true;packet.value.data.replayed=true;},
  packet=>{packet.headerReplayed=true;}
 ]){const packet=specimen();mutate(packet);assert.throws(()=>fresh(packet));}
});
test('HTTP replay and retained-attempt read must preserve the COMPLETE original event',()=>{
 for(const kind of['prepare','approve']){const packet=repeated(kind),before=structuredClone(packet);assert.deepEqual(replay(packet),packet.value.data);assert.deepEqual(packet,before);}
});
test('a repeated key with another body/event cannot be normalized into an admitted replay',()=>{
 for(const mutate of[
  packet=>{packet.key='55555555-5555-4555-8555-555555555555';},
  packet=>{packet.body={...packet.body,reason:packet.body.reason+' diferente'};},
  packet=>{packet.value.data={...packet.value.data,id:'55555555-5555-4555-8555-555555555555'};},
  packet=>{packet.value.data.extraAuthority=true;}
 ]){const packet=repeated();mutate(packet);assert.throws(()=>replay(packet));}
});
test('an event replayed flag cannot replace the actual HTTP replay header, status or retained original',()=>{
 for(const mutate of[
  packet=>{packet.headerReplayed=false;},
  packet=>{packet.status=201;},
  packet=>{packet.status=503;packet.value={ok:false,error:'Synthetic transport failure'};},
  packet=>{packet.expectedEvent={...packet.expectedEvent,replayed:true};}
 ]){const packet=repeated();mutate(packet);assert.throws(()=>replay(packet));}
});