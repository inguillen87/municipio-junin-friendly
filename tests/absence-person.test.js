import test from 'node:test';import assert from 'node:assert/strict';
import {parseAbsencePersonQuery,verifyAbsencePersonResponse} from '../assets/absence-person-model.js';
import {internalAbsencePerson} from '../lib/internal-absence-person.js';
import {createInternalDataHandler} from '../api/internal-data.js';
import {personFixture,personQuery,PERSON_CONTRACT,PERSON_TENANT,PERSON_SNAPSHOT} from './fixtures/absence-person-synthetic.js';
const queryStrings=q=>Object.fromEntries(Object.entries(q).filter(([,v])=>v!==null).map(([k,v])=>[k,String(v)]));
const binding={tenantId:PERSON_TENANT,companyId:101,database:'GRH_QA'};
function fixture(){
 const calls=[],q=personQuery(),data=personFixture(q);
 const sql={query:async(text,values)=>{
  calls.push({text,values});
  if(text.includes('absence-person:contract'))return[{contractId:PERSON_CONTRACT,number:'1001',name:data.person.name,sector:data.person.sector}];
  if(text.includes('absence-person:summary'))return[data.summary];
  throw Error('Unexpected SQL');
 }};
 const readEvents=async(_sql,req)=>{calls.push({eventQuery:req.query});const d=personFixture({...q,page:Number(req.query.page),limit:Number(req.query.limit)});
  return{status:200,payload:{pagination:d.pagination,range:d.range,quality:{sourceCutoff:d.sourceCutoff},data:d.events.map(e=>({contractId:PERSON_CONTRACT,companyId:101,legajo:'1001',eventDate:e.date,untilDate:e.untilDate,reasonCode:e.reasonCode,reason:e.reason,sourceDeclaredDays:e.declaredDays,sourceQuantity:e.quantity,rangeIntegrity:e.rangeIntegrity}))}};
 };
 return{sql,calls,readEvents};
}
test('exact contract response has all-period totals before pagination, no remarks or extra identifiers',async()=>{
 const f=fixture(),r=await internalAbsencePerson(f.sql,{query:queryStrings(personQuery())},binding,PERSON_SNAPSHOT,f);
 assert.equal(r.status,200);assert.equal(r.payload.data.summary.events,61);assert.equal(r.payload.data.events.length,25);
 assert.equal(r.payload.data.summary.reportedDaysEvents,52);assert.equal(r.payload.data.events[0].declaredDays,null);
 assert.doesNotMatch(JSON.stringify(r.payload),/comentario|dni|cuil|source_payload|diagnosis/);
 const statement=f.calls[0];assert.deepEqual(statement.values,[PERSON_CONTRACT,101,'GRH_QA']);assert.match(statement.text,/c\.id=\$1::uuid/);assert.match(statement.text,/c\.legacy_company_id=\$2/);assert.match(statement.text,/b\.id=c\.source_batch_id/);
});
for(const change of [q=>q.contractId='wrong',q=>q.page='2.5',q=>q.page='0',q=>q.limit='51',q=>q.from='2026-02-30',q=>q.from='2030-01-01',q=>q.contractId=[PERSON_CONTRACT],q=>q.from='1989-01-01',q=>q.extra='ignored',q=>{q.page='2';delete q.snapshot;}])test('invalid exact-context query fails before private data queries',async()=>{
 const f=fixture(),q=queryStrings(personQuery());change(q);const result=await internalAbsencePerson(f.sql,{query:q},binding,PERSON_SNAPSHOT,f);assert.equal(result.status,400);assert.equal(f.calls.length,0);
});
test('revisiting another source is a conflict, not empty history',async()=>{
 const f=fixture(),q=queryStrings(personQuery());q.snapshot='b'.repeat(64);
 const r=await internalAbsencePerson(f.sql,{query:q},binding,PERSON_SNAPSHOT,f);assert.equal(r.status,409);assert.equal(f.calls.length,0);assert.equal(r.payload.data,undefined);
});
test('missing or duplicate contract lookup never falls back to a displayed name or legajo',async()=>{
 for(const people of [[],[{contractId:PERSON_CONTRACT},{contractId:PERSON_CONTRACT}]]){
  const f=fixture();f.sql.query=async()=>people;f.readEvents=()=>{throw Error('Must not read')};const r=await internalAbsencePerson(f.sql,{query:queryStrings(personQuery())},binding,PERSON_SNAPSHOT,f);assert.equal(r.status,404);
 }
});
test('row identity drift is rejected before a response is emitted',async()=>{
 const f=fixture(),base=f.readEvents;f.readEvents=async(...a)=>{const r=await base(...a);r.payload.data[0].contractId='33333333-3333-4333-8333-333333333333';return r;};
 await assert.rejects(internalAbsencePerson(f.sql,{query:queryStrings(personQuery())},binding,PERSON_SNAPSHOT,f),/ABSENCE_PERSON_SCOPE_DRIFT/);
});
for(const change of [d=>d.snapshot='b'.repeat(64),d=>d.person.contractId='33333333-3333-4333-8333-333333333333',d=>d.summary.events++,d=>d.pagination.total=0,d=>d.events.push(d.events[0]),d=>d.events[0].comentario='PRIVATE_MARKER',d=>d.sourceComplete=true,d=>d.events[1].date=d.events[0].date,d=>d.events[0].declaredDays='0',d=>d.summary.reportedDaysEvents=62])test('browser rejects malformed, mixed or extra-field responses',()=>{
 const d=personFixture(),q=personQuery();change(d);assert.throws(()=>verifyAbsencePersonResponse(d,q),/ABSENCE_PERSON_CONTRACT_INVALID/);
});
test('empty period and cutoff-clamped period are explicit and internally consistent',()=>{
 const empty=personQuery({from:'2026-01-01',to:'2026-01-31'}),future=personQuery({to:'2026-09-30'});
 assert.equal(verifyAbsencePersonResponse(personFixture(empty),empty).summary.events,0);
 const d=verifyAbsencePersonResponse(personFixture(future),future);assert.equal(d.range.clamped.to,true);assert.equal(d.range.effective.to,'2026-09-10');
});
