// SPDX-License-Identifier: GPL-2.0-only
// This release captures locally. It deliberately has NO upload URL or cloud token.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile,lstat,open,rename} from 'node:fs/promises';
import {setTimeout as wait} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {collect, SERIAL, MAX_BYTES} from './reader/lector-fichadas.mjs';
import {fault,safeCode,loadConfig,readCredential,VERSION} from './config.mjs';
import {CaptureStore,acquireLock,atomicJson,splitRaw} from './store.mjs';
import {readMunicipalRoute,ROUTE_ERRORS} from './route-guard.mjs';
import {loadDeliveryStatus} from './delivery-status.mjs';

// Interrupted sockets remain bounded by the six-failure transport budget.
// Never rearm a persisted block or relax authentication/serial checks.
const TRANSIENT=new Set(['CONNECT_TIMEOUT','RESPONSE_TIMEOUT','ECONNRESET','ECONNABORTED','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT','CONNECTION_ENDED','CONNECTION_CLOSED','DEADLINE_EXCEEDED']);
const PRECONNECT_ERRORS=new Set(['CONNECT_TIMEOUT','ECONNRESET','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT']);
function connectionNotStarted(result){
 const r=result?.report;
 return r?.schemaVersion==='municontrol.attendance-download-pilot.v4.1'&&r.status==='CONNECTION_OR_AUTH_FAILED'
  &&r.tcpConnected===false&&r.authenticationAccepted===false&&r.credentialAttempts===0
  &&r.error?.phase==='TCP_CONNECT'&&r.diagnostics?.lastPhase==='TCP_CONNECT'&&PRECONNECT_ERRORS.has(r.error.code);
}
function stoppedDuringExit(result){
 const r=result?.report,exchanges=r?.exchanges,last=Array.isArray(exchanges)?exchanges.at(-1):null;
 if(r?.status!=='ATTENDANCE_DOWNLOADED_FOR_REVIEW'||r.error||r.cleanup?.bufferReleaseConfirmed!==true
  ||r.cleanup?.exitConfirmed!==false||r.cleanup?.skippedReason!=='EXIT_NOT_CONFIRMED'||!Array.isArray(exchanges))return false;
 // Only v4.1.1's exact cleanup cause distinguishes a stop during EXIT pacing
 // from a prior peer close or deadline. Older ambiguous reports still block.
 if(r.cleanup.errorCode!=='CANCELLED')return false;
 if(exchanges.some(x=>!x||typeof x!=='object'||(x.errorCode&&!(x.code===1001&&x.errorCode==='CANCELLED'))))return false;
 return (last?.code===1001&&last.errorCode==='CANCELLED'&&last.responseCode===undefined)
  ||(last?.code===50&&last.responseCode===2000&&last.checksumValidated===true&&!last.errorCode);
}
export function nextDelaySeconds(failures,pollSeconds){return Math.min(900,pollSeconds*2**Math.min(Math.max(0,failures-1),4));}
export function initialState(){return {schema:'pm10-local-status.v1',version:VERSION,mode:'capture_only',lastAttemptAt:null,lastCaptureAt:null,lastCaptureSha256:null,deviceTimeLocal:null,snapshotRecordCount:null,status:'waiting',failureCount:0,connectionFailureCount:0,blocked:false,lastError:null,nextPollAt:null,cloudReception:'not_connected',cloudConfirmedRecords:0};}
export async function loadState(root){
 const file=path.join(root,'status.json');
 try{const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>32768)throw fault('STATE_CORRUPT');
  const v=JSON.parse(await readFile(file,'utf8'));
  if(v.schema!=='pm10-local-status.v1'||v.mode!=='capture_only'||typeof v.blocked!=='boolean'||!Number.isSafeInteger(v.failureCount)||v.failureCount<0||v.failureCount>1000||v.cloudReception!=='not_connected'||v.cloudConfirmedRecords!==0|| (v.nextPollAt!==null&&!Number.isFinite(Date.parse(v.nextPollAt))))throw fault('STATE_CORRUPT');
  if(Object.hasOwn(v,'connectionFailureCount')&&(!Number.isSafeInteger(v.connectionFailureCount)||v.connectionFailureCount<0||v.connectionFailureCount>1000))throw fault('STATE_CORRUPT');
  return {...initialState(),...v,version:VERSION};
 }catch(e){if(e.code==='ENOENT')return initialState();throw fault('STATE_CORRUPT');}
}
export function ensureCapture(result,expectedSerial=SERIAL){
 const r=result?.report;
 if(!r||r.authenticationAccepted!==true)throw fault(r?.status==='AUTH_NOT_ACCEPTED'?'AUTH_NOT_ACCEPTED':safeCode(r?.error??{code:'AUTHENTICATION_UNVERIFIED'}));
 if(r.error)throw fault(safeCode(r.error));
 if(r.metadata?.serialNumber!==expectedSerial)throw fault('SERIAL_MISMATCH');
 const rows=splitRaw(result.raw);
 if(rows.length>0&&result.parsed?.layout!=='legacy-40-byte-candidate')throw fault('LAYOUT_NOT_CONFIRMED');
 if(result.raw.length!==r.transfer?.plannedBytes||result.raw.length!==r.transfer?.receivedBytes||result.raw.length!==r.transfer?.confirmedChunkBytes)throw fault('BYTE_COUNT_MISMATCH');
 if(!r.attendanceTransferComplete||!r.cleanup?.bufferReleaseConfirmed||!r.cleanup?.exitConfirmed)throw fault('TRANSFER_NOT_CONFIRMED');
 return r;
}
export async function runCycle(config,store,previous,{collectImpl=collect,credentialReader=readCredential,routeCheck=readMunicipalRoute,now=()=>new Date(),signal}={}){
 const state={connectionFailureCount:0,...previous,...store.summary()};
 if(state.blocked)return {...state,status:'blocked'};
 if(signal?.aborted)return {...state,status:'stopped'};
 const started=now();
 if(state.nextPollAt&&Date.parse(state.nextPollAt)>started.getTime())return state;
 state.lastAttemptAt=started.toISOString();let key,preconnectFailure=false,outcome;
 try{
  // At least one maximum capture plus metadata must fit before any network operation.
  await store.capacity(MAX_BYTES+1048576);
  // Re-check the selected local route before reading the secret or opening a socket.
  const route=await routeCheck();
  if(!route||route.localLookup!==true)throw fault('ROUTE_OUTPUT_INVALID');
  key=await credentialReader(config.credentialFile);
  const result=await collectImpl({commKey:key,approved:true,host:config.host,port:config.port,signal,totalMs:180000});
  outcome=result;
  preconnectFailure=connectionNotStarted(result);
  const report=ensureCapture(result);
  const capturedAt=report.finishedAt??now().toISOString();
  const saved=await store.save(result.raw,{capturedAt,deviceTimeLocal:report.metadata.deviceTimeBefore});
  Object.assign(state,{status:'captured_locally',failureCount:0,connectionFailureCount:0,lastError:null,lastCaptureAt:capturedAt,lastCaptureSha256:saved.snapshotSha256,
   snapshotRecordCount:saved.snapshotRecordCount,deviceTimeLocal:report.metadata.deviceTimeBefore??null,
   newUniqueRecordsLastCycle:saved.newUniqueRecords,blocked:false,nextPollAt:new Date(now().getTime()+config.pollSeconds*1000).toISOString()});
 }catch(e){
  const code=safeCode(e);
  if(signal?.aborted&&(code==='CANCELLED'||(code==='TRANSFER_NOT_CONFIRMED'&&stoppedDuringExit(outcome)))){
   // A deliberate stop is not an authentication/transport fault. Keep any
   // earlier evidence and retry budget; incomplete capture bytes are not queued.
   return {...state,...store.summary(),status:'stopped',
    nextPollAt:new Date(now().getTime()+config.pollSeconds*1000).toISOString()};
  }
  if(ROUTE_ERRORS.has(code)){
   // Route lookup retries are local only, so do not consume clock/auth retry budget.
   return {...state,...store.summary(),status:'network_wait',lastError:code,blocked:false,
    nextPollAt:new Date(now().getTime()+config.pollSeconds*1000).toISOString(),
    cloudReception:'not_connected',cloudConfirmedRecords:0};
  }
  if(preconnectFailure){
   // Only the reader's explicit TCP phase with zero AUTH attempts
   // qualifies. Unknown thrown errors and interrupted protocol sessions keep
   // the existing six-failure limit; existing blocks are never auto-cleared.
   state.connectionFailureCount=Math.min(1000,state.connectionFailureCount+1);
   return {...state,...store.summary(),status:'connection_wait',lastError:code,blocked:false,
    nextPollAt:new Date(now().getTime()+nextDelaySeconds(state.connectionFailureCount,config.pollSeconds)*1000).toISOString(),
    cloudReception:'not_connected',cloudConfirmedRecords:0};
  }
  state.lastError=code;state.failureCount=Math.min(1000,state.failureCount+1);
  state.blocked=!TRANSIENT.has(code)||state.failureCount>=6;
  state.status=state.blocked?'blocked':'retry_wait';
  state.nextPollAt=state.blocked?null:new Date(now().getTime()+nextDelaySeconds(state.failureCount,config.pollSeconds)*1000).toISOString();
 }finally{key?.fill(0);}
 return {...state,...store.summary(),cloudReception:'not_connected',cloudConfirmedRecords:0};
}
const esc=v=>String(v??'Sin registro').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readableDate(v){return v&&Number.isFinite(Date.parse(v))?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Mendoza',dateStyle:'short',timeStyle:'medium'}).format(new Date(v)):'Sin registro';}
export function statusHtml(s,delivery={availability:'missing'}){
 const labels={waiting:'Esperando la primera lectura',network_wait:'Sin ruta municipal: no se consulta el reloj',connection_wait:'Conexión al reloj no disponible: reintento programado',captured_locally:'Captura local disponible',blocked:'Lectura detenida: requiere revisión',retry_wait:'Esperando para reintentar',stopped:'Servicio detenido'};
 const hasDelivery=delivery.availability==='available';
 const deliveryLabels={ready:'Remitente preparado; todavía sin resumen de envío',pending:'Hay partes pendientes en la última revisión',queue_confirmed:'La última revisión encontró acuses para toda la cola',retry_wait:'El último envío falló; se programó un reintento',blocked:'El envío está detenido y requiere revisión'};
 const deliveryErrors={DELIVERY_NETWORK_RETRY:'No se completó el envío. Se conserva la cola para reintentar.',DELIVERY_AUTH_BLOCKED:'El receptor rechazó la autorización. Revisar la configuración del remitente.',DELIVERY_REJECTED:'El receptor rechazó el envío. Revisar la integración.',DELIVERY_TRANSPORT_BLOCKED:'No se pudo validar el transporte. Revisar la conexión segura.',DELIVERY_RECEIPT_CORRUPT:'Un acuse conservado no pasó la validación.',DELIVERY_RECEIPT_CONFLICT:'Se detectaron acuses incompatibles para la misma parte.',DELIVERY_STATE_CORRUPT:'El estado guardado requiere revisión.',DELIVERY_REVIEW_REQUIRED:'El remitente requiere revisión antes de continuar.'};
 const deliveryHeading=hasDelivery?'Estado del envío guardado en este equipo':delivery.availability==='invalid'?'No se pudo leer el estado del envío':'Subida a Neon pendiente de configurar.';
 const confirmed=hasDelivery&&delivery.confirmedRecords!==null?delivery.confirmedRecords:'Sin dato';
 return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><title>PM-10 · Colector municipal</title><style>
 body{margin:0;background:#edf3f3;color:#143b4d;font:16px system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:36px 24px}header{padding:28px;background:#123748;color:white;border-radius:16px}h1{margin:8px 0 12px;font-size:32px}h2{font-size:20px}p{line-height:1.55}small{display:block;font-size:13px}strong{font-variant-numeric:tabular-nums}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0}.card{background:white;border:1px solid #cfdedf;border-radius:14px;padding:24px}.metric{display:block;margin:12px 0;font-size:30px}.alert{border-left:5px solid #b37508;background:#fff5df;padding:20px;border-radius:10px;margin:18px 0}.good{color:#08786f}dl{display:grid;grid-template-columns:220px 1fr;gap:14px}dt{font-weight:650}dd{margin:0;overflow-wrap:anywhere}footer{margin-top:28px;font-size:13px;color:#476570}@media(max-width:650px){main{padding:16px}.cards{grid-template-columns:1fr}dl{grid-template-columns:1fr;gap:8px}dd{margin-bottom:12px}}
 </style><main><header><small>MUNICONTROL · AGENTE LOCAL · ${esc(VERSION)}</small><h1>PM-10 · Edificio Viejo</h1><p>${esc(labels[s.status]??'Estado por revisar')}</p><small>Este panel lee archivos del equipo municipal. No es el estado del servidor de MuniControl.</small></header>
 <div class="alert"><strong>${esc(deliveryHeading)}</strong><p>${hasDelivery?'Los acuses conservados documentan recepciones anteriores. Este archivo no confirma una conexión actual ni que el remitente siga ejecutándose.':delivery.availability==='invalid'?'El archivo del remitente requiere revisión. La captura local continúa y no se muestran cifras de recepción sin validar.':'Todavía no hay un estado local del remitente disponible.'} Captura local y recepción no significan asistencia aprobada ni horas liquidadas.</p></div>
 <div class="cards"><section class="card"><small>REGISTROS ÚNICOS LOCALES</small><strong class="metric">${esc(s.uniqueLocalRecords??0)}</strong><small>No son personas ni jornadas.</small></section><section class="card"><small>LOTES CONSERVADOS LOCALMENTE</small><strong class="metric">${esc(s.pendingLocalBatches??0)}</strong><small>Incluye lotes con acuse; no se eliminan automáticamente.</small></section><section class="card"><small>REGISTROS CON ACUSE CONSERVADO</small><strong class="metric">${esc(confirmed)}</strong><small>Según el último resumen guardado del remitente.</small></section></div>
 ${hasDelivery?`<section class="card"><h2>Continuidad del envío</h2><p>${esc(deliveryLabels[delivery.state]??'Estado por revisar')}</p><dl><dt>Revisión local del envío</dt><dd>${esc(readableDate(delivery.updatedAt))}</dd><dt>Último acuse conservado</dt><dd>${esc(readableDate(delivery.lastReceiptAt))}</dd><dt>Partes pendientes al revisar</dt><dd>${esc(delivery.remainingParts??'Sin dato en este estado')}</dd><dt>Próximo reintento informado</dt><dd>${esc(readableDate(delivery.nextAttemptAt))}</dd><dt>Último error del envío</dt><dd>${esc(delivery.code?(deliveryErrors[delivery.code]??'El remitente informó un error que requiere revisión.'):'Sin error informado')}</dd></dl><p>La fecha indica cuándo se guardó este resumen; puede corresponder a una revisión de acuses sin un envío nuevo. Los datos pueden estar desactualizados.</p></section>`:''}
 ${s.status==='network_wait'?'<div class="alert"><strong>Lectura pausada antes de conectar.</strong><p>No se confirmó una ruta específica hacia la red municipal. Se revisará nuevamente la tabla de rutas local; no se prueban claves ni se escanea la red. Si vuelve la ruta, se retoma la captura. Esto no sustituye la restricción de salida por interfaz que debe validar Cómputos.</p></div>':''}
 ${s.status==='connection_wait'?'<div class="alert"><strong>Esperando que vuelva la conexión al reloj.</strong><p>El último intento no llegó a establecer la conexión ni a enviar la clave. El servicio reintentará con una espera creciente, de hasta 15 minutos. La cola y la última captura completa se conservan.</p></div>':''}
 <section class="card"><h2>Continuidad de la captura</h2><dl><dt>Último intento</dt><dd>${esc(readableDate(s.lastAttemptAt))}</dd><dt>Última captura completa</dt><dd>${esc(readableDate(s.lastCaptureAt))}</dd><dt>Siguiente intento</dt><dd>${esc(readableDate(s.nextPollAt))}</dd><dt>Hora local del reloj</dt><dd>${esc(s.deviceTimeLocal)}</dd><dt>Último código de error</dt><dd>${esc(s.lastError??'Sin error informado')}</dd><dt>Espacio de cola</dt><dd>${esc(((s.queueBytes??0)/1048576).toFixed(2))} MiB</dd><dt>Escrituras interrumpidas retenidas</dt><dd>${esc(s.interruptedWrites??0)}</dd></dl></section>
 <footer>Sin nombres, DNI ni huellas en este panel. El contenido de la carpeta pending sí contiene identificadores personales y no se debe compartir. Las lecturas se ejecutan sin borrar fichadas, modificar usuarios ni cambiar la hora del reloj. Actualización local cada 30 segundos.</footer></main></html>`;
}
export async function writeStatus(root,s){
 await atomicJson(path.join(root,'status.json'),s);
 const delivery=await loadDeliveryStatus(root);
 const tmp=path.join(root,'.status-'+randomUUID()+'.html'),h=await open(tmp,'wx',0o600);
 try{await h.writeFile(statusHtml(s,delivery));await h.sync();}finally{await h.close();}
 await rename(tmp,path.join(root,'estado.html'));
}
export async function main(argv=process.argv.slice(2)){
 const mode=argv[0];if(!['run','once','status','resume'].includes(mode)||argv[1]!=='--config'||argv.length!==3)throw fault('USAGE_RUN_ONCE_STATUS_RESUME_CONFIG');
 const config=await loadConfig(path.resolve(argv[2]));
 if(mode==='status'){console.log(JSON.stringify(await loadState(config.stateDir),null,2));return;}
 const release=await acquireLock(config.stateDir),controller=new AbortController();
 const stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const store=await new CaptureStore(config.stateDir,{maxQueueBytes:config.maxQueueMiB*1048576,minFreeBytes:config.minFreeMiB*1048576}).init();
  let state=await loadState(config.stateDir);
  if(mode==='resume'){state={...state,blocked:false,failureCount:0,nextPollAt:null,status:'waiting',lastError:null,...store.summary()};await writeStatus(config.stateDir,state);console.log('PM10_REARMED_NO_NETWORK');return;}
  do{
   state=await runCycle(config,store,state,{signal:controller.signal});await writeStatus(config.stateDir,state);
   console.log(JSON.stringify({clock:'pm10',status:state.status,lastError:state.lastError,uniqueLocalRecords:state.uniqueLocalRecords,pendingLocalBatches:state.pendingLocalBatches,cloudReception:'not_connected'}));
   if(mode==='once')break;
   const milliseconds=state.blocked?60000:Math.max(1000,Date.parse(state.nextPollAt)-Date.now());
   try{await wait(milliseconds,undefined,{signal:controller.signal});}catch(e){if(e.name!=='AbortError')throw e;}
  }while(!controller.signal.aborted);
  if(controller.signal.aborted)await writeStatus(config.stateDir,{...state,status:'stopped'});
 }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);await release();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{await main();}catch(e){console.error(JSON.stringify({clock:'pm10',error:safeCode(e),cloudReception:'not_connected'}));process.exitCode=2;}
}
