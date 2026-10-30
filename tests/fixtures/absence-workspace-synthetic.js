// Synthetic municipal-shaped DTOs; no real personnel records or clinical comments.
export const absenceCaseId='11111111-1111-4111-8111-111111111111';
// These existing synthetic aggregates explicitly report every event's DIAS_24.
const fullDays=(events,affectedContracts,days)=>({events,affectedContracts,sourceDeclaredDays:days,knownSourceDeclaredDays:days,eventsWithDeclaredDays:events,eventsWithoutDeclaredDays:0});
export function absenceWorkspaceAnalytics(q=new URLSearchParams()){
 const empty=q.get('reasonCode')==='20',events=empty?0:52,contracts=empty?0:31,days=empty?0:92;
 const range={from:q.get('from')||'2026-08-01',to:q.get('to')||'2026-09-10'};
 return{ok:true,data:{summary:fullDays(events,contracts,days),series:empty?[]:[{period:'2026-08-01',...fullDays(42,24,72),partial:false},{period:'2026-09-01',...fullDays(10,7,20),partial:true}],
 reasons:empty?[]:[{code:'10',label:'Licencia de prueba',...fullDays(events,contracts,days)}],sectors:empty?[]:[{label:'Sector de prueba',...fullDays(events,contracts,days)}],
 comparison:{available:true,basis:'previous_year_same_calendar_window',current:{range,...fullDays(events,contracts,days)},previous:{range:{from:'2025-08-01',to:'2025-09-10'},...fullDays(0,0,0)},changePercent:{events:null,affectedContracts:null,sourceDeclaredDays:null},declaredDaysComparison:{available:false,reason:'zero_previous_declared_days'}}},
 facets:{minDate:'1990-01-01',maxDate:'2026-09-10',reasons:[{code:'10',label:'Licencia de prueba'},{code:'20',label:'Inasistencias'}],sectors:[{value:'Sector de prueba',label:'Sector de prueba'}]},
 range:{requested:range,effective:range,clamped:{from:false,to:false}},quality:{sourceCutoff:'2026-09-10',sourceRows:52,invertedDateRanges:0,unitSemantics:'GRH_declared_days_not_lost_workdays'},meta:{grain:'absence_event',authority:'GRH',source:{importId:6,name:'GRH',sha256:'a'.repeat(64),cutoff:'2026-09-10'}}};
}
export function absenceWorkspaceEvents(q=new URLSearchParams()){
 const empty=q.get('reasonCode')==='20',search=q.get('search'),page=Number(q.get('page')||1),limit=Number(q.get('limit')||25),total=empty?0:search?1:52;
 const rows=Array.from({length:Math.max(0,Math.min(limit,total-(page-1)*limit))},(_,i)=>({contractId:absenceCaseId,companyId:101,legajo:String(search?9099:9000+i),name:search?'Resultado de prueba filtrado':'Agente de prueba '+((page-1)*limit+i+1),sector:'Sector de prueba',eventDate:'2026-09-08',untilDate:i===0?'2033-08-08':'2026-09-10',reasonCode:'10',reason:'Licencia de prueba',sourceDeclaredDays:1,sourceQuantity:1,rangeIntegrity:i===0?'extended_source_range':'valid_source_range',flags:{isLeave:true,affectsAttendanceBonus:false,generatesDiscountedDays:false}}));
 return{ok:true,data:rows,pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))},quality:{sourceCutoff:'2026-09-10'}};
}
