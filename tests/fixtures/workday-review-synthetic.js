import {createHash} from 'node:crypto';
import {getAttendanceWorkdaysV2} from '../../lib/internal-attendance-workdays.js';
export const REVIEW_DAY='2026-09-10',REVIEW_CUT='dddddddd-dddd-5ddd-8ddd-dddddddddddd';
export const REVIEW_RELEASE='a'.repeat(40);
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',membership='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const reviewPrincipal={user:{email:'qa@example.test'},tenant:{source:'membership',id:tenant,membershipId:membership,certifiedReleaseSha:REVIEW_RELEASE}};
export const reviewSession={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',email:'qa@example.test',version:1,releaseSha:REVIEW_RELEASE};
export const reviewQuery=values=>new URLSearchParams({resource:'clock-workdays-v2',source:'continuous',site:'pm-10',from:REVIEW_DAY,to:REVIEW_DAY,page:'1',pageSize:'25',search:'',status:'all',...values});
export function reviewSpecs(){
 return [
  ...Array.from({length:107},(_,n)=>({name:'Agente abierto '+String(n+1).padStart(3,'0'),marks:[[4,'15:00:00']]})),
  {name:'Caso extra completo',marks:[[4,'15:00:00'],[5,'17:00:00']]},
  {name:'Caso secuencia completa',marks:[[0,'07:00:00'],[2,'10:00:00'],[3,'10:15:00'],[1,'13:00:00'],[4,'15:00:00'],[5,'17:00:00']]},
  {name:'Caso salida aislada',marks:[[5,'17:00:00']]},
  {name:'Caso pausa incompleta',marks:[[4,'15:00:00'],[2,'16:00:00'],[5,'17:00:00']]},
  {name:'Caso mixto',marks:[[4,'15:00:00'],[5,'17:00:00'],[4,'18:00:00']]},
  {name:'Caso entrada ordinaria',marks:[[0,'07:00:00']]},
  {name:'Caso sin pausa',marks:[[0,'07:00:00'],[1,'13:00:00']]},
 ];
}
export function reviewSource({nominal=true,specs=reviewSpecs(),cut=REVIEW_CUT}={}){
 const events=specs.flatMap((spec,n)=>spec.marks.map(([code,time],index)=>({
  eventRef:hash('event-'+n+'-'+index),deviceKey:hash(spec.device||'device'),
  source:{kind:index%2?'receipt':'historical',id:index%2?'ffffffff-ffff-4fff-8fff-ffffffffffff':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',ordinal:index+1},
  model:spec.model||'K20/ID',personKey:hash('person-'+n),streamKey:hash('stream-'+n),
  personLabel:nominal?spec.name:'Persona '+n.toString(16).padStart(8,'0').toUpperCase(),legajo:nominal?String(9001+n):null,
  identityState:'mapped',code,issues:[],occurredAt:REVIEW_DAY+'T'+time+'-03:00',localTimestamp:REVIEW_DAY+' '+time,
 })));
 return {version:'clock-workday-source.v2',generatedAt:'2026-09-15T10:00:00Z',sourceMode:'continuous',revision:cut,
  rulesVersion:'declared-intervals.v2',site:{key:'pm-10',label:'Sitio sintético'},timezone:'America/Argentina/Mendoza',nominalReadAllowed:nominal,
  filters:{from:REVIEW_DAY,to:REVIEW_DAY,anchoredToLatest:false},context:{from:'2026-09-09',to:'2026-09-11',recordCount:events.length,eventCount:events.length,observationCount:0},
  collection:{status:'continuous_receipts',sourceComplete:true,captureCount:1,receiptCount:1,batchCount:1,lastReceiptAt:'2026-09-15T09:59:00Z',periodCoverageCertified:false,automaticCollectorVerified:false},events,observations:[]};
}
export async function reviewFixture(query=reviewQuery(),settings={}){
 const raw=reviewSource(settings);
 return {ok:true,...await getAttendanceWorkdaysV2({query:async()=>[{result:raw}]},reviewPrincipal,Object.fromEntries(query),reviewSession)};
}
