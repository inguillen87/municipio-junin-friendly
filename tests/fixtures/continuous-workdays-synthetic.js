// Synthetic data through the real reconstruction/DTO code. No database or clock.
import {createHash} from 'node:crypto';
import {getAttendanceWorkdaysV2} from '../../lib/internal-attendance-workdays.js';
import {reconstructWorkdays,filterWorkdays,summarizeWorkdays} from '../../lib/attendance-workdays.js';
export const WORKDAY_CUT='dddddddd-dddd-5ddd-8ddd-dddddddddddd';
export const WORKDAY_NEXT_CUT='dddddddd-dddd-5ddd-8ddd-ddddddddddde';
export const WORKDAY_CAPTURE='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const receipt='ffffffff-ffff-4fff-8fff-ffffffffffff';
const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',membership='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const release='a'.repeat(40),day='2026-09-10',timezone='America/Argentina/Mendoza';
const principal={user:{email:'qa@example.test'},tenant:{source:'membership',id:tenant,membershipId:membership,certifiedReleaseSha:release}};
const session={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',email:'qa@example.test',version:1,releaseSha:release};
const hash=value=>createHash('sha256').update(value).digest('hex');
function eventsFor({nominal=true,unplaced=false}={}) {
 const events=[];
 function add(n,code,time,device='main') {
  const sourceKind=code===0 || code===2 || code===4 ? 'historical' : 'receipt';
  events.push({eventRef:hash(`event-${n}-${code}`),deviceKey:hash('device-'+device),
   source:{kind:sourceKind,id:sourceKind==='historical'?WORKDAY_CAPTURE:receipt,ordinal:n},
   model:'K20/ID',personKey:hash('person-'+n),streamKey:hash('stream-'+device+'-'+n),
   personLabel:nominal?'Agente de prueba '+String(n).padStart(3,'0'):'Persona '+n.toString(16).toUpperCase().padStart(8,'0'),
   legajo:nominal?String(9000+n):null,identityState:'mapped',code,issues:[],
   occurredAt:day+'T'+time+'-03:00',localTimestamp:day+' '+time});
 }
 for(let n=1;n<=106;n++){add(n,0,'07:00:00');add(n,1,'13:00:00')}
 add(1,2,'10:00:00');add(1,3,'10:15:00');add(1,4,'15:00:00');add(1,5,'17:00:00');
 add(107,0,'08:00:00');
 if(unplaced){add(108,0,'07:00:00','observed');add(108,1,'13:00:00','observed')}
 return events;
}
export async function continuousWorkdayFixture(query=new URLSearchParams(),settings={}) {
 const {nominal=true,cut=WORKDAY_CUT,unplaced=false}=settings,events=eventsFor(settings);
 const observations=unplaced?[{eventRef:hash('unplaced'),deviceKey:hash('device-observed'),source:{kind:'receipt',id:receipt,ordinal:109},occurredAt:null,localTimestamp:null,issues:['timestamp_unusable']}]:[];
 const from=query.get('from')||day,to=query.get('to')||day;
 const shifted=(value,delta)=>new Date(Date.parse(value+'T00:00:00Z')+delta*86400000).toISOString().slice(0,10);
 const raw={version:'clock-workday-source.v2',generatedAt:'2026-09-15T10:00:00Z',sourceMode:'continuous',revision:cut,
  rulesVersion:'declared-intervals.v2',site:{key:query.get('site')||'pm-10',label:'Sitio de prueba'},timezone,nominalReadAllowed:nominal,
  filters:{from,to,anchoredToLatest:!query.has('from')},context:{from:shifted(from,-1),to:shifted(to,1),recordCount:events.length+observations.length,eventCount:events.length,observationCount:observations.length},
  collection:{status:'continuous_receipts',sourceComplete:true,captureCount:1,receiptCount:1,batchCount:1,lastReceiptAt:'2026-09-15T09:59:00Z',periodCoverageCertified:false,automaticCollectorVerified:false},events,observations};
 const data=await getAttendanceWorkdaysV2({query:async()=>[{result:raw}]},principal,{...Object.fromEntries(query),source:'continuous'},session);
 return {ok:true,...data};
}
export function historicalWorkdayFixture(query=new URLSearchParams(),settings={}) {
 const events=eventsFor(settings).map((e,index)=>({...e,ordinal:index+1})),from=query.get('from')||day,to=query.get('to')||day;
 const result=reconstructWorkdays({events,from,to,timezone,model:'K20/ID'});
 const search=query.get('search')||'',status=query.get('status')||'all',rows=filterWorkdays(result.rows,{search,status});
 const page=Number(query.get('page')||1),pageSize=Number(query.get('pageSize')||25);
 return {ok:true,version:'clock-workdays.v1',generatedAt:'2026-09-15T10:00:00Z',site:{key:query.get('site')||'pm-10',label:'Sitio de prueba'},timezone,
  filters:{from,to,anchoredToLatest:!query.has('from'),search,status},snapshotId:WORKDAY_CAPTURE,
  collection:{status:'operator_snapshot',importComplete:true,periodCoverageCertified:false,automaticCollectorVerified:false},
  nominalReadAllowed:settings.nominal!==false,rules:result.rules,summary:summarizeWorkdays(rows),periodSummary:result.summary,
  rows:rows.slice((page-1)*pageSize,page*pageSize).map(({personKey,key,...row})=>({...row,key:hash(WORKDAY_CAPTURE+':'+key)})),
  pagination:{page,pageSize,total:rows.length,pages:Math.ceil(rows.length/pageSize)},payrollEligible:false};
}
export function workdayQuery(values={}) {
 return new URLSearchParams({resource:'clock-workdays-v2',source:'continuous',site:'pm-10',from:day,to:day,page:'1',pageSize:'25',search:'',status:'all',...values});
}
