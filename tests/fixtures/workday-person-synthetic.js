// Thirty dates for one contract stream plus equal-name records in another contract and device.
import {createHash} from 'node:crypto';
import {getAttendanceWorkdaysV2} from '../../lib/internal-attendance-workdays.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
export const PERSON_TEST_CUT='cccccccc-cccc-5ccc-8ccc-cccccccccccc';
const principal={user:{email:'qa@example.test'},tenant:{source:'membership',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',membershipId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',certifiedReleaseSha:'a'.repeat(40)}};
const session={id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',email:'qa@example.test',version:1,releaseSha:'a'.repeat(40)};
export async function personWorkdayFixture(query,settings={}){
 const from=query.get('from')||'2026-09-01',to=query.get('to')||'2026-09-30',events=[];
 const shift=(value,n)=>new Date(Date.parse(value+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 for(const [stream,legajo,device,days]of [['one','9001','main',30],['other-contract','9002','main',1],['other-device','9001','other',1]])for(let d=1;d<=days;d++)for(const [code,time]of [[0,'07:00:00'],[1,'13:00:00']]){
  const date='2026-09-'+String(d).padStart(2,'0');if(date<shift(from,-1)||date>shift(to,1))continue;
  events.push({eventRef:hash(stream+d+code),deviceKey:hash(device),source:{kind:'receipt',id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',ordinal:events.length+1},model:'K20/ID',personKey:hash('same-person'),streamKey:hash(stream),personLabel:settings.nominal===false?'Persona 00000001':'Agente de prueba idéntico',legajo:settings.nominal===false?null:legajo,identityState:'mapped',code,issues:[],occurredAt:date+'T'+time+'-03:00',localTimestamp:date+' '+time});
 }
 const raw={version:'clock-workday-source.v2',generatedAt:'2026-09-30T20:00:00Z',sourceMode:'continuous',revision:settings.cut||PERSON_TEST_CUT,rulesVersion:'declared-intervals.v2',site:{key:query.get('site')||'pm-10',label:'Punto QA'},timezone:'America/Argentina/Mendoza',nominalReadAllowed:settings.nominal!==false,filters:{from,to,anchoredToLatest:!query.has('from')},context:{from:shift(from,-1),to:shift(to,1),recordCount:events.length,eventCount:events.length,observationCount:0},collection:{status:'continuous_receipts',sourceComplete:true,captureCount:0,receiptCount:1,batchCount:1,lastReceiptAt:'2026-09-30T19:00:00Z',periodCoverageCertified:false,automaticCollectorVerified:false},events,observations:[]};
 const result=await getAttendanceWorkdaysV2({query:async()=>[{result:raw}]},principal,{...Object.fromEntries(query),source:'continuous'},session);
 return {ok:true,...result};
}
