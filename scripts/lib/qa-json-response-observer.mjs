// QA-only observation. Persist only local IDs, finite categories and validated
// numeric metadata. Raw URLs, keys, messages, causes, bodies and failure text
// remain in their original in-memory flows and are never copied to this log.
const qaRead=read=>{try{return read();}catch{return null;}};
const qaEvents=new Set(['observation-started','request','response','body-read-started','body-read-threw','body-read-fulfilled','body-read-rejected','request-finished','request-failed','main-frame-navigated','page-closed','command-rejected','observation-stopped']);
const qaKinds=new Set(['novelty','run','program','liquidation','close','receipt']);
const qaCommands=new Set(['prepare','submit','approve','calculate','confirm','annul','close','reopen','reject']);
const qaEndpoints=new Map([['/api/internal-own-payroll-novelties','novelty'],['/api/internal-own-payroll-run','run'],['/api/internal-own-payroll-program','program'],['/api/internal-own-payroll-liquidation','liquidation'],['/api/internal-own-payroll-close','close'],['/api/internal-own-payroll-receipts','receipt']]);
const qaPages=new Map([['/nomina','payroll'],['/nomina-control.html','payroll'],['/novedades-nomina.html','novelties'],['/internal-dashboard.html','dashboard']]);
const qaPhases=new Map([['#calculo','calculate'],['#decisiones','decide'],['#anulacion','annul'],['#cierre','close'],['#reportes','report'],['#recibos','receipt'],['#historial','history'],['#legajos','roster']]);
function qaFailureCode(error){
 const message=qaRead(()=>error?.message);
 // Recognition of the observed message signature is a category, not a cause.
 return typeof message==='string'&&/^response\.json: Protocol error \(Network\.getResponseBody\): No data found for resource with given identifier(?:\r?\n|$)/.test(message)?'GET_RESPONSE_BODY_UNAVAILABLE':'UNCLASSIFIED_FAILURE';
}
function qaDocument(value){
 const u=qaRead(()=>new URL(value));if(!u)return {page:'unavailable',phase:null};
 return {page:u.protocol==='about:'&&u.pathname==='blank'?'blank':qaPages.get(u.pathname)??'other',phase:u.hash?qaPhases.get(u.hash)??'other':null};
}
// Epochs count observed main-frame events, including same-document navigation;
// no event proves that a navigation destroyed a particular browser body.
export function qaJsonResponseLifecycle({now=()=>performance.now(),documentUrl='about:blank'}={}){
 const clock=()=>{const n=qaRead(now);return typeof n==='number'&&Number.isFinite(n)?n:null;},started=clock(),events=[],requests=new WeakMap(),responses=new WeakMap(),keys=new Map();
 let sequence=0,requestCount=0,responseCount=0,epoch=0,stopped=false;
 const keyId=value=>{if(typeof value!=='string'||value.length===0)return null;if(!keys.has(value))keys.set(value,keys.size+1);return keys.get(value);};
 const requestInfo=request=>{
  if(!requests.has(request)){
   const u=qaRead(()=>new URL(request.url())),method=qaRead(()=>request.method()),resource=u?.searchParams.get('resource')??null;
   const key=method==='POST'?qaRead(()=>request.headers()['idempotency-key']):method==='GET'&&resource==='attempt'?u?.searchParams.get('key'):null;
   requests.set(request,{id:++requestCount,method:method==='GET'||method==='POST'?method:'OTHER',endpoint:qaEndpoints.get(u?.pathname)??'other',resource:resource===null?null:resource==='attempt'||resource==='bootstrap'?resource:'other',keyId:keyId(key)});
  }
  return requests.get(request);
 };
 const record=(event,{request,response,error,location}={})=>{
  const observed=qaEvents.has(event)?event:'unsupported-event',time=clock(),elapsed=started===null||time===null?null:time-started;
  const row={sequence:++sequence,elapsedMs:elapsed!==null&&elapsed>=0&&elapsed<=86400000?elapsed:null,mainFrameNavigationEpoch:epoch,event:observed};
  if(response){if(!responses.has(response))responses.set(response,++responseCount);const status=qaRead(()=>response.status());row.response={id:responses.get(response),status:Number.isSafeInteger(status)&&status>=100&&status<=599?status:null};request??=qaRead(()=>response.request());}
  if(request)row.request=requestInfo(request);
  if(['body-read-threw','body-read-rejected','command-rejected'].includes(observed))row.failureCode=qaFailureCode(error);
  if(observed==='request-failed')row.failureCode='REQUEST_FAILED';
  if(location!==undefined)row.document=qaDocument(location);
  events.push(row);
 };
 record('observation-started',{location:documentUrl});
 return {
  request:request=>record('request',{request}),
  response:(event,response,error)=>record(event,{response,error}),
  requestFinished:request=>record('request-finished',{request}),
  requestFailed:request=>record('request-failed',{request}),
  navigation:location=>{epoch++;record('main-frame-navigated',{location});},
  pageClosed:()=>record('page-closed'),
  failure:error=>record('command-rejected',{error}),
  stop:()=>{if(!stopped){stopped=true;record('observation-stopped');}},
  snapshot:({kind=null,command=null}={})=>({version:'qa-json-response-lifecycle.v2',scope:'one native command; no body fallback or additional request',navigationEpochMeaning:'observed main-frame events including same-document navigation',kind:kind===null?null:qaKinds.has(kind)?kind:'other',command:command===null?null:qaCommands.has(command)?command:'other',events:structuredClone(events)})
 };
}
export function qaJsonResponseObserver(relevant,responses,bodies,lifecycle){
 // A diagnostic callback must never replace the original success or failure.
 const note=(event,response,error)=>{try{lifecycle?.response(event,response,error);}catch{}};
 return response=>{
  const request=response.request();if(!relevant(request))return;
  responses.push(response);note('response',response);
  const url=new URL(request.url());if(request.method()!=='GET'||url.searchParams.get('resource')!=='attempt')return;
  note('body-read-started',response);let body;
  try{body=response.json();}catch(error){note('body-read-threw',response,error);throw error;}
  body.catch(()=>{});bodies.set(response,body);
  if(lifecycle)body.then(()=>note('body-read-fulfilled',response),error=>note('body-read-rejected',response,error));
 };
}
