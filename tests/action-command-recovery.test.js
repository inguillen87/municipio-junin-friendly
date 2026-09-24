import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createHash} from 'node:crypto';
import '../assets/action-command-recovery.js';
const api=globalThis.MuniControlCommandRecovery;
const id='12345678-1234-4234-8234-123456789abc';
const command=(type='leave_request',cmd='create')=>({caseType:type,command:cmd,...(cmd==='create'?{payload:{note:'PRIVATE_FORM_TEXT'}}:{caseId:id,expectedVersion:3})});
const receipt=(type='leave_request',cmd='create',replayed=false)=>({ok:true,caseType:type,replayed,data:{id,caseNumber:'123',caseType:type,status:{create:'draft',update_draft:'draft',submit:'submitted',approve:type==='overtime_entry'?'pending_time_rules':'approved',reject:'rejected',cancel:'cancelled'}[cmd],version:cmd==='create'?1:4,...(type==='overtime_entry'?{payrollImpact:{amount:null,rate:null,calculated:false,posted:false,attendanceReconciled:false}}:{})}});
for(const type of ['leave_request','overtime_entry'])for(const cmd of ['create','update_draft','submit','approve','reject','cancel'])test('verifies native '+type+' / '+cmd+' receipt without authorizing the operation',()=>{
 const input=receipt(type,cmd),before=structuredClone(input);assert.equal(api.verifyReceipt(input,cmd==='update_draft'?'PATCH':'POST',command(type,cmd)),input);assert.deepEqual(input,before);
});
test('replay must match the stored event, not substitute a later case version',()=>{
 const r=receipt();r.replayed=true;assert.equal(api.verifyReceipt(r,'POST',command()).data.version,1);r.data.status='approved';r.data.version=9;assert.throws(()=>api.verifyReceipt(r,'POST',command()),{code:'ACTION_RECEIPT_UNVERIFIED'});
});
const invalid={
 empty:r=>{for(const k of Object.keys(r))delete r[k];}, noConfirmation:r=>delete r.ok, falseConfirmation:r=>r.ok=false, missingReplay:r=>delete r.replayed,
 wrongType:r=>r.caseType='overtime_entry', payloadType:r=>r.data.caseType='overtime_entry',invalidId:r=>r.data.id='other-case', nominalField:r=>r.data.employeeName='PRIVATE_PERSON',
 extraEnvelope:r=>r.debug='PRIVATE_SQL', zeroNumber:r=>r.data.caseNumber='0',numericNumber:r=>r.data.caseNumber=123, numberInjection:r=>r.data.caseNumber='<script>',
 negativeVersion:r=>r.data.version=-1,stringVersion:r=>r.data.version='1',unknownStatus:r=>r.data.status='paid',wrongCreation:r=>r.data.status='submitted',advancedNonReplay:r=>r.data.version=2,
 dataList:r=>r.data=[],hugeNumber:r=>r.data.caseNumber='1'.repeat(22)
};
for(const [name,mutate]of Object.entries(invalid))test('unconfirmed '+name+' is a recoverable unknown outcome',()=>{
 const r=receipt();mutate(r);assert.throws(()=>api.verifyReceipt(r,'POST',command()),e=>e.code==='ACTION_RECEIPT_UNVERIFIED'&&e.status===502&&e.outcomeUnknown===true&&!/PRIVATE|script/.test(e.message));
});
test('editing and transitions cannot acknowledge another case or stale version',()=>{
 for(const mutate of [r=>r.data.id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',r=>r.data.version=3,r=>r.data.version=7,r=>r.data.status='approved']){const r=receipt('leave_request','submit');mutate(r);assert.throws(()=>api.verifyReceipt(r,'POST',command('leave_request','submit')),/comprobante válido/);}
 const r=receipt('leave_request','submit',true);r.data.version=7;r.data.status='approved';assert.throws(()=>api.verifyReceipt(r,'POST',command('leave_request','submit')),{code:'ACTION_RECEIPT_UNVERIFIED'});
});
for(const key of ['amount','rate','calculated','posted','attendanceReconciled'])test('overtime confirmation cannot assert '+key+' payroll effect',()=>{
 const r=receipt('overtime_entry');r.data.payrollImpact[key]=key==='amount'||key==='rate'?100:true;assert.throws(()=>api.verifyReceipt(r,'POST',command('overtime_entry')),/comprobante válido/);
});
test('receipt body is bounded, native JSON and valid UTF-8 before interpretation',async()=>{
 const r=receipt();assert.deepEqual(await api.readReceiptPayload(new Response(JSON.stringify(r),{status:201,headers:{'content-type':'application/json; charset=utf-8'}})),r);
 for(const response of [new Response(null,{status:204}),new Response('<html>Proxy</html>',{headers:{'content-type':'text/html'}}),new Response('{}'),new Response('bad',{headers:{'content-type':'application/json'}}),new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}}),new Response('x'.repeat(16385),{headers:{'content-type':'application/json'}})])await assert.rejects(api.readReceiptPayload(response),{code:'ACTION_RECEIPT_UNVERIFIED'});
});
test('overlarge receipt stream is cancelled, not retained or displayed',async()=>{
 let cancelled=false;const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(17000));},cancel(){cancelled=true;}});
 await assert.rejects(api.readReceiptPayload(new Response(stream,{headers:{'content-type':'application/json'}})),{code:'ACTION_RECEIPT_UNVERIFIED'});assert.equal(cancelled,true);
});
test('network ambiguity differs from explicit validation or permission rejection',()=>{
 for(const status of [undefined,0,408,500,502,503])assert.equal(api.needsRecovery({status}),true);
 for(const status of [400,401,403,409,422,423,425,429])assert.equal(api.needsRecovery({status}),false);
 assert.equal(api.needsRecovery({status:200,outcomeUnknown:true}),true);
});
test('recovery retains an immutable copy of the confirmed request, not later form edits',()=>{
 const c=command(),copy=api.copyCommand('POST',c);c.payload.note='LATER_CHANGE';assert.equal(copy.payload.note,'PRIVATE_FORM_TEXT');assert.ok(Object.isFrozen(copy.payload));
 assert.throws(()=>api.copyCommand('GET',c));assert.throws(()=>api.copyCommand('POST',{caseType:'time_source',command:'create'}));
});
function harness(request){
 const html=fs.readFileSync(new URL('../centro-acciones.html',import.meta.url),'utf8'),start=html.indexOf('      async function actionCommand(method, body) {'),end=html.indexOf('      function renderActionRecovery()',start);assert.ok(start>0&&end>start);
 let nextKey=0,notices=0;const box={state:{redirecting:false},actionRecovery:null,actionCommandRunning:false,actionPageGeneration:0,commandRecovery:api,pendingMutationKeys:new Map(),mutationFingerprint:async(method,body)=>createHash('sha256').update(JSON.stringify([method,body])).digest('hex'),idempotencyKey:()=>`00000000-0000-4000-8000-${String(++nextKey).padStart(12,'0')}`,persistPendingMutationKeys(){},renderActionRecovery(){notices++;},isActionBusy:e=>e.code==='ACTION_SESSION_BUSY',requestJson:request,ACTIONS_URL:'/api/internal-actions',AbortSignal};vm.createContext(box);vm.runInContext(html.slice(start,end),box);return {box,run:(m,b)=>box.actionCommand(m,b),keys:()=>nextKey,notices:()=>notices};
}
for(const mode of ['network','empty-receipt','wrong-case'])test('same-key recovery after '+mode+' never changes the confirmed operation',async()=>{
 const sent=[];let attempt=0;const h=harness(async(_url,options)=>{sent.push(options);if(++attempt===1){if(mode==='network')throw TypeError('network');if(mode==='empty-receipt')return {};const bad=receipt('leave_request','submit');bad.data.id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';return bad;}return receipt('leave_request',mode==='wrong-case'?'submit':'create',true);});
 const body=command('leave_request',mode==='wrong-case'?'submit':'create');await assert.rejects(h.run('POST',body));assert.equal(h.box.pendingMutationKeys.size,1);assert.ok(h.box.actionRecovery);
 const changed={...body,payload:{note:'CHANGED'}};await assert.rejects(h.run('POST',changed),{code:'ACTION_COMMAND_UNRESOLVED'});assert.equal(sent.length,1);
 const result=await h.run('POST',body);assert.equal(result.ok,true);assert.equal(sent.length,2);assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);assert.equal(sent[0].body,sent[1].body);assert.equal(h.keys(),1);assert.equal(h.box.pendingMutationKeys.size,0);assert.equal(h.box.actionRecovery,null);assert.equal(h.box.actionCommandRunning,false);
});
test('simultaneous commands do not create a second key or request',async()=>{
 let resolve,entered;const started=new Promise(r=>entered=r),h=harness(()=>{entered();return new Promise(r=>resolve=r);});const first=h.run('POST',command());await started;
 await assert.rejects(h.run('POST',command()),{code:'ACTION_COMMAND_IN_FLIGHT'});assert.equal(h.keys(),1);resolve(receipt());await first;assert.equal(h.box.actionCommandRunning,false);
});
test('a fresh explicit refusal is not portrayed as successful or ambiguous',async()=>{
 const h=harness(async()=>{throw Object.assign(Error('server refusal'),{status:403,code:'ACTION_CAPABILITY_REQUIRED'});});
 await assert.rejects(h.run('POST',command()),{status:403});assert.equal(h.box.pendingMutationKeys.size,0);assert.equal(h.box.actionRecovery,null);assert.equal(h.box.actionCommandRunning,false);
});
test('denied retry removes its private in-memory body but does not discard the prior uncertain key',async()=>{
 let n=0;const h=harness(async()=>{if(n++===0)throw TypeError('lost response');throw Object.assign(Error('revoked'),{status:403});});
 await assert.rejects(h.run('POST',command()));await assert.rejects(h.run('POST',command()),{status:403});assert.equal(h.box.actionRecovery,null);assert.equal(h.box.pendingMutationKeys.size,1);
});
test('a busy authorization lock preserves its idempotency key without inventing an accepted write',async()=>{
 const h=harness(async()=>{throw Object.assign(Error('busy'),{status:409,code:'ACTION_SESSION_BUSY'});});await assert.rejects(h.run('POST',command()));assert.equal(h.box.pendingMutationKeys.size,1);assert.equal(h.box.actionRecovery,null);
});
for(const status of [409,422,428])test('refused recovery '+status+' keeps the prior uncertain key and blocks a different command',async()=>{
 let n=0;const h=harness(async()=>{if(n++===0)throw TypeError('lost response');throw Object.assign(Error('refused replay'),{status,code:'ACTION_VERSION_CONFLICT'});});
 await assert.rejects(h.run('POST',command()));const pending=h.box.actionRecovery;
 await assert.rejects(h.run('POST',command()),{status});assert.equal(h.box.pendingMutationKeys.size,1);assert.equal(h.box.actionRecovery,pending);
 await assert.rejects(h.run('POST',{...command(),payload:{note:'OTHER_REQUEST'}}),{code:'ACTION_COMMAND_UNRESOLVED'});assert.equal(n,2);assert.equal(h.keys(),1);
});
test('a confirmed response arriving after page exit cannot restore a case or its recovery body',async()=>{
 let release,entered;const started=new Promise(r=>entered=r),h=harness(()=>{entered();return new Promise(r=>release=r);});const pending=h.run('POST',command());await started;h.box.actionPageGeneration++;
 release(receipt());await assert.rejects(pending,e=>e.unauthorized===true);assert.equal(h.box.actionRecovery,null);assert.equal(h.box.pendingMutationKeys.size,1);assert.equal(h.box.actionCommandRunning,false);
});
test('page exit during an interrupted request does not repopulate private recovery data',async()=>{
 let reject,entered;const started=new Promise(r=>entered=r),h=harness(()=>{entered();return new Promise((_,r)=>reject=r);});const pending=h.run('POST',command());await started;h.box.actionPageGeneration++;
 reject(TypeError('network'));await assert.rejects(pending,e=>e.unauthorized===true);assert.equal(h.box.actionRecovery,null);assert.equal(h.box.pendingMutationKeys.size,1);
});
test('a page already redirecting cannot dispatch a new native command',async()=>{
 let calls=0;const h=harness(async()=>{calls++;return receipt();});h.box.state.redirecting=true;await assert.rejects(h.run('POST',command()),e=>e.unauthorized===true);assert.equal(calls,0);assert.equal(h.keys(),0);
});
import '../assets/action-calendar-date.js';
const calendar=globalThis.MuniControlCalendarDate;
for(const [date,expected]of [['2026-10-01',/01.*oct.*2026/],['2024-02-29',/29.*feb.*2024/],['2026-01-01',/01.*ene.*2026/],['2026-12-31',/31.*dic.*2026/]])test('civil day remains '+date,()=>assert.match(calendar.label(date),expected));
for(const value of ['2026-02-29','2026-02-30','2026-04-31','2026-00-01','2026-13-01','0000-01-01','2026-1-01','2026-10-01T00:00:00Z','PRIVATE_MARKER',null])test('civil parser does not silently normalize '+value,()=>assert.equal(calendar.parse(value),null));
for(const zone of ['America/Argentina/Buenos_Aires','America/Los_Angeles','Pacific/Auckland','UTC'])test('calendar rendering ignores the browser default timezone '+zone,()=>{
 const source=fs.readFileSync(new URL('../assets/action-calendar-date.js',import.meta.url),'utf8'),box={Intl:{DateTimeFormat:function(locale,options){return new Intl.DateTimeFormat(locale,{timeZone:zone,...options});}},Date};vm.runInNewContext(source,box);assert.match(box.MuniControlCalendarDate.label('2026-10-01'),/01.*oct.*2026/);
});
