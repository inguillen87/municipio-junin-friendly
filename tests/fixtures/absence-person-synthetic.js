// Synthetic history. Distinct contracts may share the displayed name without sharing a history.
export const PERSON_CONTRACT='11111111-1111-4111-8111-111111111111';
export const PERSON_TENANT='22222222-2222-4222-8222-222222222222';
export const PERSON_SNAPSHOT='a'.repeat(64);
const day=(i)=>new Date(Date.UTC(2026,8,10)-i*86400000).toISOString().slice(0,10);
export const personQuery=(extra={})=>({resource:'absenceperson',contractId:PERSON_CONTRACT,from:'2026-07-01',to:'2026-09-10',page:1,limit:25,snapshot:PERSON_SNAPSHOT,...extra});
export function personFixture(q=personQuery()){
 const from=q.from,to=q.to<'2026-09-10'?q.to:'2026-09-10';
 const all=Array.from({length:61},(_,i)=>({date:day(i),untilDate:i===0?'2033-08-08':day(i),reasonCode:i%2?'11':'12',reason:i%2?'Licencia de prueba':'Ausencia de prueba',declaredDays:i%7===0?null:1,quantity:i%7===0?null:1,rangeIntegrity:i===0?'extended_source_range':'valid_source_range'})).filter(e=>e.date>=from&&e.date<=to);
 return{version:'absence-person.v1',tenantId:PERSON_TENANT,snapshot:PERSON_SNAPSHOT,person:{contractId:q.contractId,number:'1001',name:'Agente de prueba repetido',sector:'Área de prueba'},
 range:{requested:{from:q.from,to:q.to},effective:{from,to},clamped:{from:false,to:q.to>to}},sourceCutoff:'2026-09-10',
 summary:{events:all.length,reportedDaysEvents:all.filter(e=>e.declaredDays!==null).length,reportedDaysSum:all.filter(e=>e.declaredDays!==null).length,reasonCount:new Set(all.map(e=>e.reasonCode)).size,dateReviewEvents:all.filter(e=>e.rangeIntegrity==='extended_source_range').length},
 pagination:{page:q.page,limit:q.limit,total:all.length,pages:Math.max(1,Math.ceil(all.length/q.limit))},events:all.slice((q.page-1)*q.limit,q.page*q.limit),semantics:'administrative_events_not_workdays_or_payroll',sourceComplete:false};
}
