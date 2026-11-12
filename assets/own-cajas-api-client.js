import {salaryExact,salarySerialized,salaryUuid} from './native-salary-catalog-model.js';
import {ownReportQuery,verifiedOwnReportBundle,OWN_REPORT_MAX_BYTES} from './own-payroll-report-model.js';
import {verifiedOwnCloseDetail,verifiedOwnCloseReceipt,OWN_CLOSE_NOMINAL} from './own-payroll-close-model.js';
import {ownRunWorkspaceAccess,hasOwnRunAccess} from './own-payroll-run-workspace-model.js';
import {OWN_RUN_MAX_RESPONSE} from './own-payroll-run-model.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES,readOwnPayrollText} from './own-cajas-response.js';
const CLOSE='/api/internal-own-payroll-close',AUTH='/api/internal-auth',CLOSE_LIMIT='OWN_CLOSE_LIMIT';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const fail=(code,message,status=null)=>{throw Object.assign(Error(message),{code,status});};
const abort=()=>Object.assign(Error('Se retiró la lectura completa.'),{name:'AbortError',code:'CAJAS_RETIRED'});
export const CAJAS_SOURCE_MODES=freeze({
 operative:{label:'Detalle operativo vigente y recibos cerrados',active:true,
  notice:'Este lector verifica la revisión operativa vigente para el período elegido. No acredita un censo histórico independiente.'},
 history:{label:'Histórico conservado — pendiente de habilitación',active:false,
  notice:'El lector histórico R9 sigue inactivo. No se sustituye con el detalle operativo ni con el padrón actual.'},
});
function fingerprint(bundle){
 return salarySerialized([bundle.proof,bundle.sources.map(source=>[
  source.groupId,source.id,source.key,source.bodySha256,source.snapshotSha256,source.recordedAt,
 ]).sort((a,b)=>a[0].localeCompare(b[0]))]);
}
function conceptChoices(bundle){
 const choices=new Map();
 for(const source of bundle.sources)for(const row of source.snapshot.concepts){
  const key=salarySerialized([row.conceptCode,row.nature,row.unit]);
  if(!choices.has(key))choices.set(key,{code:row.conceptCode,nature:row.nature,unit:row.unit,financial:row.nature!=='auxiliary'});
 }
 return [...choices.values()].sort((a,b)=>a.code.localeCompare(b.code)||a.nature.localeCompare(b.nature)||a.unit.localeCompare(b.unit));
}
export function createCajasApiClient({fetchImpl=globalThis.fetch}={}){
 if(typeof fetchImpl!=='function')fail('CAJAS_TRANSPORT_REQUIRED','No está disponible el lector autorizado.');
 let generation=0,accessKey=null,issued=new WeakMap();const controllers=new Set();
 const current=(stamp,signal)=>{if(stamp!==generation||signal?.aborted)throw abort();};
 function retire(){generation++;for(const controller of controllers)controller.abort();controllers.clear();accessKey=null;issued=new WeakMap();}
 // Cada lectura va primero en JSON común. Sólo si el servidor responde que ese cierre completo no entra en la capacidad
 // común (422 OWN_CLOSE_LIMIT) se repite la misma consulta en modo completo (`full`), que exige su tipo de contenido y
 // los bytes anunciados. Los bytes de la respuesta común rechazada también cuentan en el presupuesto.
 async function request(target,params,budget,stamp,signal,maxBytes,full=false){
  current(stamp,signal);
  const url=target+(params?'?'+new URLSearchParams(params):'');
  // El cierre que ya necesitó el modo completo en esta misma lectura se vuelve a pedir directo así (el segundo control).
  full=full||budget.large?.has(url)===true;
  let response;
  try{response=await fetchImpl(url,{method:'GET',credentials:'same-origin',cache:'no-store',
    headers:{Accept:full?OWN_RUN_FULL_JSON:'application/json'},signal});}
  catch(error){current(stamp,signal);if(error.name==='AbortError')throw error;
   fail('CAJAS_READ_UNAVAILABLE','No se pudo completar la lectura. Reintentá el conjunto entero.');}
  current(stamp,signal);
  const complete=full&&response.ok,announced=response.headers?.get('x-municontrol-json-bytes');
  if(complete&&(response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase()!==OWN_RUN_FULL_JSON
   ||announced===null||announced===undefined)){
   await response.body?.cancel?.().catch(()=>{});
   fail('CAJAS_RESPONSE_INVALID','La respuesta completa no se pudo verificar. Reintentá la lectura.',response.status);
  }
  const {text,bytes}=await readOwnPayrollText(response,{maxBytes:complete?OWN_RUN_FULL_MAX_BYTES:maxBytes,
    remaining:OWN_REPORT_MAX_BYTES-budget.bytes,signal});
  budget.bytes+=bytes;current(stamp,signal);
  if(announced!==null&&announced!==undefined&&(!/^(0|[1-9][0-9]*)$/.test(announced)||Number(announced)!==bytes))
   fail('CAJAS_RESPONSE_BYTES_INVALID','La respuesta no conserva el tamaño anunciado. Reintentá la lectura completa.',response.status);
  let payload;
  try{payload=JSON.parse(text);}catch{fail('CAJAS_RESPONSE_INVALID','La respuesta completa no se pudo verificar. Reintentá la lectura.');}
  if(!response.ok||payload?.ok!==true){
   const status=response.status;
   if(target===CLOSE&&status===422&&payload?.code===CLOSE_LIMIT){
    if(!full){budget.large?.add(url);return request(target,params,budget,stamp,signal,maxBytes,true);}
    fail('CAJAS_SOURCE_LIMIT','La fuente completa supera la capacidad de lectura. No se recortó.',status);
   }
   fail(status===401?'CAJAS_SESSION_EXPIRED':status===403?'CAJAS_ACCESS_RETIRED':'CAJAS_READ_UNAVAILABLE',
    status===401?'La sesión venció. Volvé a ingresar.':status===403?'Cambió el acceso. Se retiró la revisión.':
     'No se reunió la fuente completa. Reintentá sin reducir el alcance.',status);
  }
  return target===AUTH?payload:salaryExact(payload,['ok','data'])?payload.data:
   fail('CAJAS_RESPONSE_INVALID','La respuesta no coincide con el contrato completo.');
 }
 async function session(budget,stamp,signal,expectedKey=null){
  const payload=await request(AUTH,null,budget,stamp,signal,64*1024);
  const access=ownRunWorkspaceAccess(payload);current(stamp,signal);
  if(!hasOwnRunAccess(access.caps,OWN_CLOSE_NOMINAL))
   fail('CAJAS_ACCESS_RETIRED','La cuenta no permite consultar estas fuentes completas.',403);
  if(expectedKey!==null&&access.key!==expectedKey||accessKey!==null&&access.key!==accessKey)
   fail('CAJAS_SESSION_CHANGED','Cambió la cuenta municipal. Se retiró la revisión.',403);
  accessKey=access.key;return access;
 }
 async function closeRead(params,budget,stamp,signal){
  const detail=salaryExact(params,['resource','period','liquidationType'])&&params.resource==='detail';
  const group=salaryExact(params,['resource','id'])&&params.resource==='group'&&salaryUuid(params.id);
  if(!detail&&!group)fail('CAJAS_QUERY_INVALID','La consulta no pertenece al lector completo.');
  return request(CLOSE,params,budget,stamp,signal,OWN_RUN_MAX_RESPONSE);
 }
 async function complete(value,{mode='operative',signal,expectedKey=null}={}){
  if(!Object.hasOwn(CAJAS_SOURCE_MODES,mode))
   fail('CAJAS_SOURCE_MODE_REQUIRED','Elegí una fuente propia disponible.');
  if(!CAJAS_SOURCE_MODES[mode].active)
   fail('CAJAS_HISTORY_INACTIVE',CAJAS_SOURCE_MODES[mode].notice);
  const query=ownReportQuery(value);
  if(query.from!==query.to)fail('CAJAS_SINGLE_PERIOD_REQUIRED','El Excel requiere un período declarado.');
  const stamp=generation,budget={bytes:0,large:new Set()},before=await session(budget,stamp,signal,expectedKey);
  const details=[],receipts=[];
  for(const type of query.types){
   const detail=await verifiedOwnCloseDetail(await closeRead(
    {resource:'detail',period:query.from,liquidationType:type},budget,stamp,signal));
   current(stamp,signal);
   if(detail.period!==query.from||detail.liquidationType!==type)
    fail('CAJAS_SOURCE_CONTEXT_CHANGED','La fuente no pertenece al período y tipo elegidos.');
   details.push(detail);
   for(const group of detail.groups.filter(group=>group.state==='closed')){
    if(receipts.length>=1000)fail('CAJAS_SOURCE_LIMIT','La fuente completa supera su capacidad; no se omitieron grupos.');
    const receipt=await verifiedOwnCloseReceipt(await closeRead({resource:'group',id:group.id},budget,stamp,signal));
    current(stamp,signal);receipts.push(receipt);
   }
  }
  const input={query,details,receipts};
  // Never select jurisdiction, nature, unit or concepts before this whole validator.
  const bundle=await verifiedOwnReportBundle(query,details,receipts);current(stamp,signal);
  for(const detail of details){
   const fresh=await verifiedOwnCloseDetail(await closeRead(
    {resource:'detail',period:detail.period,liquidationType:detail.liquidationType},budget,stamp,signal));
   current(stamp,signal);
   if(fresh.period!==detail.period||fresh.liquidationType!==detail.liquidationType
    ||fresh.scopeVersion!==detail.scopeVersion||fresh.stateVersion!==detail.stateVersion
    ||salarySerialized(fresh.groups)!==salarySerialized(detail.groups))
    fail('CAJAS_SOURCE_CHANGED','Cambió la fuente durante la lectura. Reintentá el conjunto entero.');
  }
  for(const receipt of receipts){
   const fresh=await verifiedOwnCloseReceipt(await closeRead(
    {resource:'group',id:receipt.groupId},budget,stamp,signal));current(stamp,signal);
   const identity=value=>[value.groupId,value.id,value.key,value.bodySha256,value.snapshotSha256,value.recordedAt];
   if(salarySerialized(identity(fresh))!==salarySerialized(identity(receipt)))
    fail('CAJAS_SOURCE_CHANGED','Cambió un recibo durante la lectura. Reintentá el conjunto entero.');
  }
  await session(budget,stamp,signal,before.key);current(stamp,signal);
  const result=freeze({version:'private-cajas-api-source.r6',mode,
   basis:'current_operational_close_detail_and_verified_closed_receipts',
   historicalReaderActive:false,historicalCoverageVerified:false,
   input,bundle,conceptChoices:conceptChoices(bundle),fingerprint:fingerprint(bundle),
   bytesRead:budget.bytes,completeBundleVerified:true,externalScopeVerified:false,admission:'not_admitted'});
  issued.set(result,{query,key:before.key,fingerprint:result.fingerprint});return result;
 }
 async function withSignal(work,external){
  const controller=new AbortController(),stop=()=>controller.abort();controllers.add(controller);
  external?.addEventListener('abort',stop,{once:true});if(external?.aborted)stop();
  try{return await work(controller.signal);}
  finally{external?.removeEventListener('abort',stop);controllers.delete(controller);}
 }
 function operation(value,options={}){
  return withSignal(signal=>complete(value,{...options,signal}),options.signal);
 }
 function checkSession({signal}={}){
  return withSignal(async owned=>{
   const stamp=generation,key=accessKey;
   if(key===null)return Object.freeze({active:false});
   await session({bytes:0},stamp,owned,key);current(stamp,owned);return Object.freeze({active:true});
  },signal);
 }
 function load(value,options={}){return operation(value,options);}
 async function revalidate(previous,{signal}={}){
  const prior=issued.get(previous);
  if(!prior)fail('CAJAS_SOURCE_PRODUCER_REQUIRED','La fuente fue retirada. Volvé a leer el conjunto completo.');
  const fresh=await operation(prior.query,{mode:previous.mode,signal,expectedKey:prior.key});
  if(!issued.has(previous)||!issued.has(fresh))throw abort();
  if(fresh.fingerprint!==prior.fingerprint)
   fail('CAJAS_SOURCE_CHANGED','Cambió un cierre o su fuente. Volvé a revisar el conjunto completo.');
  return fresh;
 }
 return Object.freeze({load,revalidate,checkSession,retire,owns:value=>issued.has(value)});
}
