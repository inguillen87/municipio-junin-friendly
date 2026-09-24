// Strict contract shared by browser and API; no data persistence and no payroll interpretation.
const fail=()=>{throw Error('ABSENCE_PERSON_CONTRACT_INVALID');};
export const ABSENCE_PERSON_PAGE_SIZE=25;
export const personUuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const text=(v,n)=>typeof v==='string'&&v.length<=n&&!/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(v);
export const personDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>='1990-01-01'&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const count=v=>Number.isSafeInteger(v)&&v>=0;
export function parseAbsencePersonQuery(q){
 if(!q||Object.keys(q).some(k=>!['resource','contractId','from','to','page','limit','snapshot'].includes(k))||q.resource!=='absenceperson'||!personUuid(q.contractId)||!personDate(q.from)||!personDate(q.to)||q.from>q.to)fail();
 const integer=(v,f,max)=>{if(v===undefined)return f;if(typeof v!=='string'||!/^[1-9]\d{0,5}$/.test(v)||Number(v)>max)fail();return Number(v);};
 const page=integer(q.page,1,10000),limit=integer(q.limit,25,50);
 if(q.snapshot!==undefined&&!hash(q.snapshot)||page>1&&!hash(q.snapshot))fail();
 return{resource:'absenceperson',contractId:q.contractId,from:q.from,to:q.to,page,limit,snapshot:q.snapshot??null};
}
function safeRange(range,q,cutoff){
 if(!exact(range,['requested','effective','clamped'])||!exact(range.requested,['from','to'])||!exact(range.effective,['from','to'])||!exact(range.clamped,['from','to']))fail();
 if(range.requested.from!==q.from||range.requested.to!==q.to||range.effective.from!==q.from||range.effective.to!==[q.to,cutoff].sort()[0]||range.effective.from>range.effective.to||range.clamped.from!==false||range.clamped.to!==(q.to>cutoff))fail();
}
export function verifyAbsencePersonResponse(d,q){
 if(!exact(d,['version','tenantId','snapshot','person','range','sourceCutoff','summary','pagination','events','semantics','sourceComplete'])||d.version!=='absence-person.v1'||!personUuid(d.tenantId)||!hash(d.snapshot)||q.snapshot&&q.snapshot!==d.snapshot||!personDate(d.sourceCutoff)||d.sourceComplete!==false||d.semantics!=='administrative_events_not_workdays_or_payroll')fail();
 if(!exact(d.person,['contractId','number','name','sector'])||d.person.contractId!==q.contractId||!personUuid(d.person.contractId)||!text(d.person.number,32)||!d.person.number||!text(d.person.name,300)||!text(d.person.sector,300))fail();
 safeRange(d.range,q,d.sourceCutoff);const s=d.summary,p=d.pagination;
 if(!exact(s,['events','reportedDaysEvents','reportedDaysSum','reasonCount','dateReviewEvents'])||![s.events,s.reportedDaysEvents,s.reasonCount,s.dateReviewEvents].every(count)||s.reportedDaysEvents>s.events||s.reasonCount>s.events||s.dateReviewEvents>s.events||!Number.isFinite(s.reportedDaysSum)||Math.abs(s.reportedDaysSum)>1e12)fail();
 if(!exact(p,['page','limit','total','pages'])||p.page!==q.page||p.limit!==q.limit||p.total!==s.events||p.pages!==Math.max(1,Math.ceil(p.total/p.limit))||!Array.isArray(d.events)||d.events.length!==Math.max(0,Math.min(p.limit,p.total-(p.page-1)*p.limit)))fail();
 const seen=new Set();let previous=null;
 for(const e of d.events){
  if(!exact(e,['date','untilDate','reasonCode','reason','declaredDays','quantity','rangeIntegrity'])||!personDate(e.date)||e.date<d.range.effective.from||e.date>d.range.effective.to||e.untilDate!==null&&!personDate(e.untilDate)||e.reasonCode!==null&&!text(e.reasonCode,64)||!text(e.reason,300))fail();
  for(const value of [e.declaredDays,e.quantity])if(value!==null&&(!Number.isFinite(value)||Math.abs(value)>1e12))fail();
  if(!['valid_source_range','until_date_not_reported','inverted_source_range','extended_source_range','invalid_source_date'].includes(e.rangeIntegrity)||seen.has(e.date)||previous!==null&&previous<e.date)fail();
  seen.add(e.date);previous=e.date;
 }
 return d;
}
export function sameAbsencePersonRead(a,b){return a.tenantId===b.tenantId&&a.snapshot===b.snapshot&&JSON.stringify(a.person)===JSON.stringify(b.person)&&JSON.stringify(a.range)===JSON.stringify(b.range)&&JSON.stringify(a.summary)===JSON.stringify(b.summary)&&a.sourceCutoff===b.sourceCutoff;}
