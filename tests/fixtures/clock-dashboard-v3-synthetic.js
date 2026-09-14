// Synthetic only. No municipal identity, credential or raw device evidence.
export const HISTORICAL_CAPTURE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const CONTINUOUS_CUT='eeeeeeee-eeee-5eee-8eee-eeeeeeeeeeee';
export const HISTORICAL_CUT='ffffffff-ffff-5fff-8fff-ffffffffffff';

// Existing browser scenarios keep their synthetic record counts and filters.
// This adapter upgrades only the response envelope to the current read contract.
export function upgradeClockFixture(payload,query){
 const sourceMode=query.get('source')||'historical';
 const data=structuredClone(payload);
 data.dashboard={...data.dashboard,version:'clock-dashboard.v3',sourceMode,historicalSnapshotId:data.dashboard.snapshotId,
  telemetry:{lastAttemptAt:null,lastCompleteCaptureAt:data.collection.capturedAt??null,completeCaptureScope:'historical_and_confirmed_batches',lastReceiptAt:null,backlog:null,deliveryLatencySeconds:null,collectorTelemetryAvailable:false}};
 data.records=data.records.map(row=>({...row,rowKey:data.dashboard.snapshotId+':'+row.ordinal}));
 if(sourceMode==='continuous')data.collection.status='continuous_receipts';
 return data;
}

export function clockDashboardFixture(query=new URLSearchParams(),options={}){
 const source=query.get('source')||'continuous',nominal=options.nominal===true;
 const sourceCount=source==='historical'?150:153;
 const all=Array.from({length:sourceCount},(_,index)=>({
  // New receipts restart their source ordinal; rowKey must not restart.
  ordinal:index<150?index+1:index-149,
  rowKey:`${String(index+1).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
  occurredAt:new Date(Date.parse('2026-09-10T09:03:12Z')+index*60000).toISOString(),
  personLabel:nominal?'Agente de prueba '+String(index%47+1).padStart(2,'0'):'Persona '+(index%47+1).toString(16).toUpperCase().padStart(8,'0'),
  legajo:nominal?String(100+index%47):null,identityState:index<3?'unmapped':'mapped',
  reviewState:'pending',method:'unknown',direction:'unknown',punchCode:index%3?0:1,verificationCode:1
 }));
 const from=query.get('from')||'2026-09-10',to=query.get('to')||'2026-09-10';
 const search=query.get('search')||'',identity=query.get('identity')||'all',hour=query.has('hour')?Number(query.get('hour')):null;
 const rows=all.filter(r=>r.occurredAt.slice(0,10)>=from&&r.occurredAt.slice(0,10)<=to
  &&(identity==='all'||(identity==='mapped'?r.identityState==='mapped':r.identityState!=='mapped'))
  &&(hour===null||new Date(r.occurredAt).getUTCHours()-3===hour)
  &&(!search||r.personLabel.toLowerCase().includes(search.toLowerCase())||r.legajo?.includes(search)));
 const hours=new Map(),codes=new Map();for(const r of rows){const h=new Date(r.occurredAt).getUTCHours()-3;hours.set(h,(hours.get(h)||0)+1);codes.set(r.punchCode,(codes.get(r.punchCode)||0)+1)}
 const people=new Set(rows.map(r=>r.personLabel)).size,mapped=rows.filter(r=>r.identityState==='mapped').length;
 const page=Number(query.get('page')||1),size=Number(query.get('pageSize')||50);
 return {ok:true,version:'clock-operations.v1',generatedAt:'2026-09-14T15:00:00Z',timezone:'America/Argentina/Mendoza',
  site:{key:query.get('site')||'pm-10',label:'Edificio de prueba'},sites:[{key:'pm-10',label:'Edificio de prueba'}],
  filters:{from,to,anchoredToLatest:!query.has('from')},
  summary:{marks:rows.length,people,mappedMarks:mapped,unmappedMarks:rows.length-mapped,sourceRows:sourceCount,observedRows:0,latestMarkAt:rows.at(-1)?.occurredAt??null},
  collection:{status:source==='continuous'?'continuous_receipts':'operator_snapshot',capturedAt:source==='continuous'?null:'2026-09-10T15:00:00Z',receivedAt:'2026-09-14T14:59:00Z',periodCoverageCertified:false,automaticCollectorVerified:false,storedRows:sourceCount,importComplete:true},
  records:rows.slice((page-1)*size,page*size),daily:rows.length?[{day:'2026-09-10',marks:rows.length,people}]:[],hourly:[...hours].map(([hour,marks])=>({hour,marks})),observations:[],nominalReadAllowed:nominal,
  pagination:{page,pageSize:size,total:rows.length,pages:Math.ceil(rows.length/size)},
  dashboard:{version:'clock-dashboard.v3',sourceMode:source,snapshotId:options.cut||(source==='continuous'?CONTINUOUS_CUT:HISTORICAL_CUT),historicalSnapshotId:HISTORICAL_CAPTURE,
   filters:{search,identity,hour},heatmap:[...hours].map(([hour,marks])=>({weekday:4,hour,marks})),codes:[...codes].map(([code,marks])=>({code,marks})),unlinkedPeople:new Set(rows.filter(r=>r.identityState!=='mapped').map(r=>r.personLabel)).size,
   device:{model:'K20/ID',serial:'SYNTHETIC-QA',firmware:'Test',metadataAvailable:true,automaticCollectorVerified:false},
   telemetry:{lastAttemptAt:null,lastCompleteCaptureAt:'2026-09-14T14:58:00Z',completeCaptureScope:'historical_and_confirmed_batches',lastReceiptAt:'2026-09-14T14:59:00Z',backlog:null,deliveryLatencySeconds:60,collectorTelemetryAvailable:false}}
 };
}
