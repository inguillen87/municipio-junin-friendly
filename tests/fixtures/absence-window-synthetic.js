// Ejemplos inventados de fechas. Sin nombres, comentarios clínicos ni documentos municipales.
import {absenceMatchesWindow,absenceWindowDateIntegrity} from '../../assets/absence-window-model.js';
import {PERSON_CONTRACT,PERSON_TENANT,PERSON_SNAPSHOT,personQuery} from './absence-person-synthetic.js';
export {PERSON_CONTRACT,PERSON_TENANT,PERSON_SNAPSHOT};
export const windowQuery=(extra={})=>personQuery({from:'2026-09-01',to:'2026-09-10',...extra});
const event=(date,untilDate,days=1)=>({date,untilDate,reasonCode:'11',reason:'Licencia sintética de prueba',declaredDays:days,quantity:days,rangeIntegrity:absenceWindowDateIntegrity(date,untilDate)});
export const windowSource=()=>[
 ...Array.from({length:10},(_,i)=>{const d='2026-09-'+String(i+1).padStart(2,'0');return event(d,i===9?null:d,i===9?null:1);}),
 ...Array.from({length:30},(_,i)=>event('2026-08-'+String(i+1).padStart(2,'0'),i===29?'2033-08-08':'2026-09-05',35)),
 event('2026-07-01','2026-08-31',62),event('2026-07-02','2026-07-01',1),event('2026-07-03',null,null),event('2026-09-12','2026-09-15',4)
];
export function windowFixture(q=windowQuery()){
 const to=q.to<'2026-09-10'?q.to:'2026-09-10',mode=q.rangeMode??'starts',all=windowSource().filter(e=>absenceMatchesWindow(e,q.from,to,mode)).sort((a,b)=>b.date.localeCompare(a.date));
 const extended=q.rangeMode!==undefined;
 return {version:extended?'absence-person.v2':'absence-person.v1',...(extended?{rangeMode:q.rangeMode}:{}),tenantId:PERSON_TENANT,snapshot:PERSON_SNAPSHOT,
 person:{contractId:q.contractId,number:'QA1001',name:'Agente de prueba de períodos',sector:'Sector sintético'},
 range:{requested:{from:q.from,to:q.to},effective:{from:q.from,to},clamped:{from:false,to:q.to>to}},sourceCutoff:'2026-09-10',
 summary:{events:all.length,reportedDaysEvents:all.filter(e=>e.declaredDays!==null).length,reportedDaysSum:all.reduce((s,e)=>s+(e.declaredDays??0),0),reasonCount:all.length?1:0,dateReviewEvents:all.filter(e=>['extended_source_range','inverted_source_range'].includes(e.rangeIntegrity)).length,...(extended?{beganBeforePeriod:all.filter(e=>e.date<q.from).length,endNotReportedEvents:all.filter(e=>e.untilDate===null).length}:{})},
 pagination:{page:q.page,limit:q.limit,total:all.length,pages:Math.max(1,Math.ceil(all.length/q.limit))},events:all.slice((q.page-1)*q.limit,q.page*q.limit),semantics:'administrative_events_not_workdays_or_payroll',sourceComplete:false};
}
