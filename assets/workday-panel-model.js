const hex = /^[a-f0-9]{64}$/;
const revision = /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const safeText = (value,max=300) => typeof value==='string' && value.length<=max && !/[\x00-\x1f\x7f]/.test(value);
const integer = value => Number.isSafeInteger(value) && value>=0;
const check = value => { if(!value)throw Error('No se pudo verificar la respuesta de jornadas. Actualizá la consulta.'); };
export function verifyWorkdayResponse(data,query,{nominalReadAllowed=true}={}) {
 const v2=query.get('resource')==='clock-workdays-v2';
 check(data?.ok===true && data.version===(v2?'clock-workdays.v2':'clock-workdays.v1') && data.payrollEligible===false);
 check(data.site?.key===query.get('site') && data.filters?.from===query.get('from') && data.filters?.to===query.get('to'));
 check(data.filters.search===query.get('search') && data.filters.status===query.get('status'));
 check(typeof data.nominalReadAllowed==='boolean' && (nominalReadAllowed || !data.nominalReadAllowed));
 check(safeText(data.snapshotId,64) && (!query.has('snapshot') || data.snapshotId===query.get('snapshot')));
 check(data.rules && safeText(data.rules.version,80) && typeof data.rules.profileSupported==='boolean');
 const p=data.pagination;
 check(p && integer(p.page) && p.page===Number(query.get('page')) && p.pageSize===Number(query.get('pageSize'))
  && integer(p.total) && p.total<=25000 && p.pages===Math.ceil(p.total/p.pageSize));
 check(Array.isArray(data.rows) && data.rows.length===Math.max(0,Math.min(p.pageSize,p.total-(p.page-1)*p.pageSize)));
 for(const s of [data.summary,data.periodSummary]){
  check(s && ['days','people','closedDays','reviewDays','ordinarySeconds','extraSeconds','pauseSeconds','intervalCount'].every(k=>integer(s[k])));
  check(s.payableSeconds===null && s.amountArs===null && s.closedDays+s.reviewDays===s.days);
  if(v2 && ('ordinaryIntervalCount' in s || 'extraIntervalCount' in s)){
   check(integer(s.ordinaryIntervalCount) && integer(s.extraIntervalCount)
    && s.ordinaryIntervalCount+s.extraIntervalCount===s.intervalCount
    && (s.ordinaryIntervalCount>0 || s.ordinarySeconds===0) && (s.extraIntervalCount>0 || s.extraSeconds===0));
  }
 }
 check(data.summary.days===p.total);
 if(v2){
  check(revision.test(data.snapshotId) && data.sourceMode==='continuous' && data.collection?.sourceComplete===true);
  check(data.coverageCertified===false && data.homologationStatus==='unverified' && data.approvalStatus==='not_approved');
  check(data.rules.version==='declared-intervals.v2' && data.rules.homologationStatus==='unverified' && data.rules.approvalStatus==='not_approved');
  const o=data.observationSummary;
  check(o && integer(o.unplaced) && integer(o.placed) && integer(o.returned) && o.returned===Math.min(o.unplaced,100)
   && o.hasMore===(o.unplaced>100) && o.scope==='context_including_undated');
  check(Array.isArray(data.observations) && data.observations.length===o.returned);
  for(const e of data.observations)check(hex.test(e.eventRef) && hex.test(e.deviceKey) && Array.isArray(e.issues) && e.issues.every(i=>safeText(i,100)));
 }
 const keys=new Set();
 for(const row of data.rows){
  check(row && safeText(row.key,180) && !keys.has(row.key)); keys.add(row.key);
  check(safeText(row.day,10) && safeText(row.personLabel) && (row.legajo===null || safeText(String(row.legajo),64)));
  check(row.payableSeconds===null && row.amountArs===null && row.payrollEligible===false);
  check(['closed','review'].includes(row.status) && ['ordinarySeconds','extraSeconds','pauseSeconds','closedIntervalCount'].every(k=>integer(row[k])));
  check(Array.isArray(row.intervals) && row.intervals.length===row.closedIntervalCount && Array.isArray(row.events) && Array.isArray(row.issues));
  if(!data.nominalReadAllowed)check(row.legajo===null && /^Persona [A-F0-9]{8}$/.test(row.personLabel));
  const eventRefs=new Set();
  for(const event of row.events){
   check(safeText(event.localTimestamp,40) && safeText(event.label,200) && integer(event.code) && event.code<=255);
   if(v2){check(hex.test(event.eventRef) && !eventRefs.has(event.eventRef));eventRefs.add(event.eventRef);
    check(event.source && ['historical','receipt'].includes(event.source.kind) && safeText(event.source.id,36)
     && Number.isSafeInteger(event.source.ordinal) && event.source.ordinal>0 && Array.isArray(event.issues) && event.issues.every(i=>safeText(i,100)));}
  }
  const sums={ordinary:0,extra:0,pause:0};
  for(const interval of row.intervals){
   check(['ordinary','extra'].includes(interval.kind) && ['elapsedSeconds','pauseSeconds','netSeconds'].every(k=>integer(interval[k]))
    && interval.elapsedSeconds-interval.pauseSeconds===interval.netSeconds && interval.elapsedSeconds<=86400);
   check(safeText(interval.startLocal,40) && safeText(interval.endLocal,40));
   if(v2)check(Array.isArray(interval.pauseEventRefs) && [interval.startEventRef,...interval.pauseEventRefs,interval.endEventRef].every(ref=>eventRefs.has(ref)));
   sums[interval.kind]+=interval.netSeconds;sums.pause+=interval.pauseSeconds;
  }
  check(row.ordinarySeconds===sums.ordinary && row.extraSeconds===sums.extra && row.pauseSeconds===sums.pause);
  if(v2 && 'reconstructedEvents' in row){
   check(Array.isArray(row.reconstructedEvents));
   const proof=new Map(row.reconstructedEvents.map(e=>[e.eventRef,e]));
   check(proof.size===row.reconstructedEvents.length);
   for(const e of proof.values()){
    const event=row.events.find(event=>event.eventRef===e.eventRef);
    check(event && ['ordinary','extra'].includes(e.kind) && [e.kind==='ordinary'?0:4,e.kind==='ordinary'?1:5,2,3].includes(event.code)
     && /^\d{4}-\d{2}-\d{2}$/.test(e.day) && e.day>=data.context.from && e.day<=data.context.to);
   }
   for(const interval of row.intervals)check(intervalReferences(interval).every(ref=>proof.get(ref)?.kind===interval.kind&&proof.get(ref)?.day===row.day));
  }
  if(v2 && data.filters.status==='extra_open')check(workdayTime(row,'extra').pending.length>0);
  for(const issue of row.issues)check(safeText(issue.label,400) && (!v2 || Array.isArray(issue.eventRefs) && issue.eventRefs.every(ref=>hex.test(ref))));
 }
 if(v2 && 'ordinaryIntervalCount' in data.summary){
  for(const kind of ['ordinary','extra']){
   const shown=data.rows.reduce((n,r)=>n+r.intervals.filter(i=>i.kind===kind).length,0);
   check(shown<=data.summary[kind+'IntervalCount']);
   if(data.pagination.pages<=1)check(shown===data.summary[kind+'IntervalCount']);
  }
 }
 return data;
}
export function sameWorkdayCut(first,next){
 return first.version===next.version && first.snapshotId===next.snapshotId && first.site?.key===next.site?.key
  && first.sourceMode===next.sourceMode && first.nominalReadAllowed===next.nominalReadAllowed
  && first.timezone===next.timezone && JSON.stringify(first.filters)===JSON.stringify(next.filters)
  && JSON.stringify(first.context)===JSON.stringify(next.context) && JSON.stringify(first.periodSummary)===JSON.stringify(next.periodSummary)
  && JSON.stringify(first.rules)===JSON.stringify(next.rules) && JSON.stringify(first.collection)===JSON.stringify(next.collection)
  && JSON.stringify(first.summary)===JSON.stringify(next.summary) && JSON.stringify(first.observationSummary)===JSON.stringify(next.observationSummary)
  && JSON.stringify(first.observations)===JSON.stringify(next.observations);
}

// Present the verified DTO; pairing and elapsed-time decisions remain on the server.
export const eventReference = event => event.eventRef ?? event.ordinal;
export const intervalReferences = interval => interval.startEventRef
 ? [interval.startEventRef,...interval.pauseEventRefs,interval.endEventRef]
 : [interval.startOrdinal,...interval.pauseOrdinals,interval.endOrdinal];
export function workdayTime(row,kind) {
 const intervals=kind==='pause'?row.intervals:row.intervals.filter(i=>i.kind===kind);
 const codes=kind==='ordinary'?[0,1]:kind==='extra'?[4,5]:[2,3];
 const used=new Set(row.reconstructedEvents?.filter(e=>kind==='pause'||e.kind===kind).map(e=>e.eventRef)??intervals.flatMap(intervalReferences));
 const pending=row.events.filter(e=>codes.includes(e.code)&&!used.has(eventReference(e)));
 return {seconds:intervals.length?row[kind+'Seconds']:null,pending};
}
export function workdaySummaryTime(summary,kind) {
 const count=summary[kind+'IntervalCount'];
 // Older v2 responses did not include counts; zero cannot prove either state.
 if(!Number.isSafeInteger(count))return {seconds:summary[kind+'Seconds'],known:false};
 return {seconds:count>0?summary[kind+'Seconds']:null,known:true};
}
export function sequenceRows(row) {
 const proof=new Map(row.reconstructedEvents?.map(e=>[e.eventRef,e])??row.intervals.flatMap(i=>intervalReferences(i).map(ref=>[ref,{day:row.day,kind:i.kind}])));
 // Preserve source order, including simultaneous timestamps; never invent a tie-break.
 return row.events.map(event=>({...event,calculated:proof.has(eventReference(event)),calculationDay:proof.get(eventReference(event))?.day}));
}
