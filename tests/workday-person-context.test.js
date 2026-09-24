import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {getAttendanceWorkdaysV2} from '../lib/internal-attendance-workdays.js';
import {workdayPersonReference,personContextOptions} from '../lib/workday-person-context.js';
import {verifyWorkdayResponse,sameWorkdayCut} from '../assets/workday-panel-model.js';
import {workdayCsv,workdayXlsx} from '../assets/workday-export.js';
const h=x=>createHash('sha256').update(x).digest('hex'),tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',member='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',cut='cccccccc-cccc-5ccc-8ccc-cccccccccccc';
const principal={user:{email:'qa@example.test'},tenant:{source:'membership',id:tenant,membershipId:member,certifiedReleaseSha:'a'.repeat(40)}};
const session={id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',email:'qa@example.test',version:1,releaseSha:'a'.repeat(40)};
const options={source:'continuous',site:'pm-10',from:'2026-09-01',to:'2026-09-30',page:1,pageSize:25,status:'all',search:'',cause:'all',context:'person'};
function source(){
 const events=[];for(const [stream,legajo,device,days]of [['one','9001','main',30],['other-contract','9002','main',1],['other-device','9001','other',1]])for(let d=1;d<=days;d++)for(const [code,time]of [[0,'07:00:00'],[1,'13:00:00']]){const date='2026-09-'+String(d).padStart(2,'0');events.push({eventRef:h(stream+d+code),deviceKey:h(device),source:{kind:'receipt',id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',ordinal:events.length+1},model:'K20/ID',personKey:h('same-person'),streamKey:h(stream),personLabel:'Agente de prueba idéntico',legajo,identityState:'mapped',code,issues:[],occurredAt:date+'T'+time+'-03:00',localTimestamp:date+' '+time});}
 return {version:'clock-workday-source.v2',generatedAt:'2026-09-30T20:00:00Z',sourceMode:'continuous',revision:cut,rulesVersion:'declared-intervals.v2',site:{key:'pm-10',label:'Punto QA'},timezone:'America/Argentina/Mendoza',nominalReadAllowed:true,filters:{from:options.from,to:options.to,anchoredToLatest:false},context:{from:'2026-08-31',to:'2026-10-01',recordCount:events.length,eventCount:events.length,observationCount:0},collection:{status:'continuous_receipts',sourceComplete:true,captureCount:0,receiptCount:1,batchCount:1,lastReceiptAt:'2026-09-30T19:00:00Z',periodCoverageCertified:false,automaticCollectorVerified:false},events,observations:[]};
}
const get=async(raw=source(),query={},p=principal)=>({ok:true,...await getAttendanceWorkdaysV2({query:async()=>[{result:raw}]},p,{...options,...query},session)});
test('context reference is the same across dates but different for another contract, device, site, tenant or revision',()=>{
 const binding={tenantId:tenant,siteKey:'pm-10',revision:cut},row={key:h('one')+':2026-09-01'},ref=workdayPersonReference(binding,row);
 assert.equal(workdayPersonReference(binding,{key:h('one')+':2026-09-02'}),ref);
 for(const [key,value]of [['tenantId','other'],['siteKey','pm-02'],['revision','other']])assert.notEqual(workdayPersonReference({...binding,[key]:value},row),ref);
 assert.notEqual(workdayPersonReference(binding,{key:h('other-contract')+':2026-09-01'}),ref);assert.notEqual(workdayPersonReference(binding,{key:h('other-device')+':2026-09-01'}),ref);
});
test('exact context filters the full reconstructed period before pagination and never merges equal names or another device',async()=>{
 const first=await get(),ref=first.rows[0].personContextRef,selected=await get(source(),{personRef:ref,snapshot:cut});
 assert.equal(first.pagination.total,32);assert.equal(selected.pagination.total,30);assert.equal(selected.rows.length,25);assert.equal(selected.summary.ordinarySeconds,30*21600);assert.equal(selected.summary.people,1);
 assert.ok(selected.rows.every(r=>r.personContextRef===ref&&r.legajo==='9001'));assert.ok(selected.rows.every(r=>!('personKey'in r)&&!('streamKey'in r)));
 const next=await get(source(),{personRef:ref,snapshot:cut,page:2});assert.equal(next.rows.length,5);assert.ok(sameWorkdayCut(selected,next));assert.equal(next.rows.at(-1).day,'2026-09-01');
});
test('nominal permission is required for a selected context and references are not exposed by pseudonymous reads',async()=>{
 const raw=source();raw.nominalReadAllowed=false;raw.events.forEach(e=>{e.legajo=null;e.personLabel='Persona 00000001';});
 const anonym=await get(raw);assert.ok(anonym.rows.every(r=>r.personContextRef===null));
 const ref=(await get()).rows[0].personContextRef;await assert.rejects(get(raw,{personRef:ref,snapshot:cut}),e=>e.code==='ATTENDANCE_CAPABILITY_REQUIRED');
});
test('invalid or unpinned references fail before querying the source',async()=>{
 for(const query of [{personRef:'bad'},{context:'all'},{personRef:'a'.repeat(64)},{context:'',personRef:'a'.repeat(64),snapshot:cut}]){
  let called=0;await assert.rejects(getAttendanceWorkdaysV2({query:async()=>{called++;return[];}},principal,{...options,...query},session),e=>e.code==='ATTENDANCE_PERSON_CONTEXT_INVALID');assert.equal(called,0);
 }
});
test('unknown or stale references return a conflict, never another person or a misleading empty success',async()=>{
 await assert.rejects(get(source(),{personRef:'f'.repeat(64),snapshot:cut}),e=>e.code==='ATTENDANCE_PERSON_CONTEXT_CHANGED');
 const ref=(await get()).rows[0].personContextRef,changed=source();changed.revision='cccccccc-cccc-5ccc-8ccc-cccccccccccd';
 await assert.rejects(get(changed,{personRef:ref,snapshot:cut}));
});
test('response guard rejects a different context row and legacy noncontext requests keep their response shape',async()=>{
 const initial=await get(),ref=initial.rows[0].personContextRef,q=new URLSearchParams({...options,resource:'clock-workdays-v2',personRef:ref,snapshot:cut}),d=await get(source(),{personRef:ref,snapshot:cut});
 assert.equal(verifyWorkdayResponse(d,q),d);const mixed=structuredClone(d);mixed.rows[0].personContextRef='0'.repeat(64);assert.throws(()=>verifyWorkdayResponse(mixed,q));
 const legacy=await get(source(),{context:undefined});assert.equal(legacy.personContext,undefined);assert.ok(legacy.rows.every(r=>!('personContextRef'in r)));
});
test('CSV and workbook control metadata retain the exact selected context without changing observed time',async()=>{
 const ref=(await get()).rows[0].personContextRef,d=await get(source(),{personRef:ref,snapshot:cut,pageSize:100});
 const csv=workdayCsv(d.rows,d);assert.match(csv,/Contexto del vínculo/);assert.ok(csv.includes(ref));assert.equal(csv.trim().split('\r\n').length,31);
 const workbook=workdayXlsx(d,d.rows);assert.ok(Buffer.from(workbook).includes(Buffer.from(ref)));assert.equal(d.summary.ordinarySeconds,30*21600);assert.equal(d.payrollEligible,false);
});
test('context values remain strict strings rather than coercible arrays or objects',()=>{
 for(const options of [{context:['person']},{context:'person',personRef:['a'.repeat(64)],snapshot:cut},{context:'person',personRef:{toString:()=> 'a'.repeat(64)},snapshot:cut}])assert.throws(()=>personContextOptions(options),/ATTENDANCE_PERSON_CONTEXT_INVALID/);
});
