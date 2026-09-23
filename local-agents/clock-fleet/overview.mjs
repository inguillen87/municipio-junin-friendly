// SPDX-License-Identifier: GPL-2.0-only
// One local fleet, with receipt scope preserved for every device. No network or file reads.
const esc=value=>String(value??'Sin dato').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const date=v=>time(v)?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Mendoza',dateStyle:'short',timeStyle:'medium'}).format(new Date(v)):'Sin comprobación';
const count=v=>integer(v)?String(v):'Sin dato';
const evidence=v=>['verified','missing','invalid'].includes(v)?v:'missing';
const needsReview=c=>c.evidenceState==='invalid'||c.capture?.evidenceState==='invalid'||c.delivery?.evidenceState==='invalid'||c.capture?.blocked===true||['blocked','review_required'].includes(c.capture?.state)||['blocked','review_required'].includes(c.delivery?.state);

export function overviewCounts(clocks){
 return {configured:clocks.length,captured:clocks.filter(c=>c.capture?.evidenceState!=='invalid'&&time(c.capture?.lastCaptureAt)).length,
  needsReview:clocks.filter(needsReview).length,withReceipt:clocks.filter(c=>c.delivery?.evidenceState==='verified'&&time(c.delivery?.lastReceiptAt)&&integer(c.delivery?.confirmedRecords)).length};
}

function captureLabel(clock){
 const c=clock.capture;
 if(c.evidenceState==='invalid')return 'Estado de captura por revisar';
 if(!clock.enabled)return 'Captura deshabilitada';
 if(c.blocked||c.state==='blocked')return 'Captura detenida para revisión';
 return {waiting:'Esperando primera captura',ready:'Esperando próxima captura',captured_locally:'Captura guardada',network_wait:'Esperando la red autorizada',connection_wait:'Esperando conexión al reloj',retry_wait:'Reintento de captura programado',review_required:'Captura por revisar',disabled:'Captura deshabilitada',stopped:'Captura detenida'}[c.state]||'Captura sin comprobación';
}
function captureGuidance(clock){
 const c=clock.capture;
 if(c.evidenceState==='invalid')return 'No se pudo verificar el archivo de estado. Revisá el diagnóstico; no se reemplazan los pendientes.';
 if(!clock.enabled)return 'No se inicia una nueva lectura mientras este equipo esté deshabilitado.';
 if(c.blocked&&['AUTH_NOT_ACCEPTED','AUTHENTICATION_UNVERIFIED'].includes(c.lastError))return 'Revisá el acceso autorizado del reloj. No se prueban otras claves.';
 if(c.lastError==='SERIAL_MISMATCH')return 'La identidad respondió de forma distinta a la configuración. No se reasignan registros.';
 if(c.blocked||c.state==='review_required')return 'El ciclo requiere revisión antes de reanudar. Se conservan la cola y sus comprobantes.';
 if(c.state==='network_wait')return 'El próximo intento espera la ruta municipal autorizada.';
 if(c.state==='connection_wait')return 'El último intento no llegó a establecer una sesión con el reloj. Se conserva la última captura y se espera el próximo intento.';
 if(c.state==='retry_wait')return 'Hay un reintento programado. Su resultado aparecerá con una nueva fecha de comprobación.';
 if(c.state==='captured_locally')return 'La captura está guardada en este equipo. El acuse de envío se informa debajo.';
 return 'La configuración o un proceso iniciado no acreditan una lectura nueva. Revisá las fechas.';
}
function deliveryLabel(clock){
 const d=clock.delivery;
 if(d.evidenceState==='invalid')return 'Recepción por revisar';
 if(d.evidenceState!=='verified')return 'Recepción no consultada';
 if(d.enabled===false)return 'Envío deshabilitado';
 if(['blocked','review_required'].includes(d.state))return 'Envío detenido para revisión';
 if(d.state==='retry_wait')return 'Reintento de envío programado';
 if(integer(d.pendingParts)&&d.pendingParts>0)return 'Envíos pendientes';
 if(time(d.lastReceiptAt)&&integer(d.confirmedRecords))return 'Acuse guardado';
 return 'Sin acuse comprobado';
}
function deliveryGuidance(d){
 if(d.evidenceState==='invalid')return 'El archivo de envío o su acuse no pasó la comprobación local. No se muestran cifras como confirmadas.';
 if(d.evidenceState!=='verified')return 'No hay evidencia de envío consultada para este equipo. Esto no afirma que la recepción esté sin configurar.';
 if(['blocked','review_required'].includes(d.state))return 'El envío requiere revisión. Los pendientes y los acuses anteriores se conservan.';
 if(d.scope==='source_only')return 'El acuse conserva registros originales en el archivo de relojes. La conciliación de asistencia sigue pendiente.';
 if(d.scope==='canonical')return 'El acuse corresponde a recepción de marcaciones. No confirma asistencia, horas aprobadas ni haberes.';
 return 'El alcance de la recepción todavía no está comprobado.';
}
function normalizedClock(value){
 if(!value||typeof value!=='object'||typeof value.label!=='string'||!value.label.trim()||value.label.length>180)throw Error('GATEWAY_OVERVIEW_INVALID');
 const c=value.capture&&typeof value.capture==='object'?value.capture:{},d=value.delivery&&typeof value.delivery==='object'?value.delivery:{};
 const capture={state:c.state,blocked:c.blocked===true,lastError:c.lastError,evidenceState:evidence(c.evidenceState),
  checkedAt:time(c.checkedAt)?c.checkedAt:null,lastAttemptAt:time(c.lastAttemptAt)?c.lastAttemptAt:null,lastCaptureAt:time(c.lastCaptureAt)?c.lastCaptureAt:null,nextPollAt:time(c.nextPollAt)?c.nextPollAt:null,records:integer(c.records)?c.records:null};
 const delivery={state:d.state,enabled:d.enabled===true,evidenceState:evidence(d.evidenceState),scope:['canonical','source_only'].includes(d.scope)?d.scope:null,
  checkedAt:time(d.checkedAt)?d.checkedAt:null,lastReceiptAt:time(d.lastReceiptAt)?d.lastReceiptAt:null,nextAttemptAt:time(d.nextAttemptAt)?d.nextAttemptAt:null,
  confirmedRecords:integer(d.confirmedRecords)?d.confirmedRecords:null,pendingParts:integer(d.pendingParts)?d.pendingParts:null};
 // Fail closed per evidence branch; an invalid receipt never erases a valid capture.
 if(capture.evidenceState==='invalid')for(const key of ['checkedAt','lastAttemptAt','lastCaptureAt','nextPollAt','records'])capture[key]=null;
 if(delivery.evidenceState!=='verified')for(const key of ['checkedAt','lastReceiptAt','nextAttemptAt','confirmedRecords','pendingParts'])delivery[key]=null;
 return {label:value.label.trim(),enabled:value.enabled!==false,evidenceState:evidence(value.evidenceState),capture,delivery};
}
const facts=entries=>'<dl>'+entries.map(([key,value])=>'<dt>'+esc(key)+'</dt><dd>'+esc(value)+'</dd>').join('')+'</dl>';

export function renderGatewayOverview(snapshot){
 if(!snapshot||snapshot.schema!=='municipal-clock-overview.v1'||!Array.isArray(snapshot.clocks)||snapshot.clocks.length>200||snapshot.networkTested!==false||snapshot.realWrites!==0)throw Error('GATEWAY_OVERVIEW_INVALID');
 const clocks=snapshot.clocks.map(normalizedClock),totals=overviewCounts(clocks);
 const desired={running:'Habilitada; no acredita un ciclo en curso',stopped:'Detenida; un ciclo iniciado puede estar cerrando',unknown:'Sin comprobación'}[snapshot.desiredState]||'Sin comprobación';
 const cards=clocks.map(clock=>{
  const c=clock.capture,d=clock.delivery,receiptMetric=d.scope==='source_only'?'Registros de fuente con acuse':'Registros con acuse';
  return `<article class="clock-card"><h2>${esc(clock.label)}</h2><span class="tag${needsReview(clock)?' attention':''}">${esc(captureLabel(clock))}</span>
   <h3>Captura local</h3>${facts([['Estado guardado',date(c.checkedAt)],['Último intento',date(c.lastAttemptAt)],['Última captura guardada',date(c.lastCaptureAt)],['Registros locales únicos',count(c.records)],['Próximo intento',date(c.nextPollAt)]])}
   <p class="next-step">${esc(captureGuidance(clock))}</p><h3>Recepción</h3><p class="receipt-state">${esc(deliveryLabel(clock))}</p>
   ${facts([['Estado de envío guardado',date(d.checkedAt)],['Último acuse guardado',date(d.lastReceiptAt)],[receiptMetric,count(d.confirmedRecords)],['Partes pendientes',count(d.pendingParts)],['Próximo intento de envío',date(d.nextAttemptAt)]])}
   <p class="note">${esc(deliveryGuidance(d))}</p></article>`;
 }).join('');
 const metrics=[['configured','Equipos configurados'],['captured','Con captura guardada'],['withReceipt','Con acuse guardado'],['needsReview','Requieren revisión']];
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>MuniControl · Central de relojes</title><style>
 *{box-sizing:border-box}body{margin:0;background:#f3f7f6;color:#173d45;font:15px/1.6 system-ui,sans-serif}main{max-width:1320px;margin:auto;padding:28px}header{padding:28px;border-radius:16px;background:#153e43;color:white}h1{font-size:clamp(26px,4vw,38px);line-height:1.2;margin:10px 0}h2{font-size:21px;line-height:1.35;margin:0 0 14px;overflow-wrap:anywhere}h3{font-size:13px;margin:22px 0 7px;color:#35626a}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:18px;margin:24px 0;align-items:start}.clock-card{background:white;border:1px solid #ccdedb;border-top:4px solid #148578;border-radius:12px;padding:23px;min-width:0}.tag{display:inline-block;padding:5px 9px;border-radius:6px;background:#e7f4ef;font-size:12px;font-weight:700}.attention{background:#fff0d4;color:#784f12}dl{margin:10px 0}dt{font-size:12px;color:#507278;margin-top:9px}dd{margin:0;overflow-wrap:anywhere;font-weight:600;font-variant-numeric:tabular-nums}.note,.scope-note,footer{font-size:12px;color:#4c686d}.next-step{border-left:3px solid #238d77;padding:12px;background:#eff8f4;font-size:13px}.receipt-state{margin:0;font-size:14px;font-weight:700}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin:22px 0}.metrics>div{border:1px solid #cadcd8;background:white;border-radius:11px;padding:17px 20px}.metrics strong{display:block;font-size:29px;line-height:1.2;color:#126b62;font-variant-numeric:tabular-nums}.metrics span{font-size:12px;display:block;margin-top:7px}.alert{padding:16px 21px;background:#fff7e5;border-left:4px solid #b78328;border-radius:8px;margin-top:18px;font-size:13px}.empty{padding:24px;background:white;border:1px solid #ccdedb;border-radius:12px}small{font-size:12px;display:block}.status-note{margin-bottom:0}@media(max-width:700px){main{padding:15px}header{padding:23px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.clock-card{padding:19px}}@media(max-width:380px){main{padding:12px}.metrics{gap:8px}.metrics>div{padding:13px}.metrics span{font-size:11px}}
 </style></head><body><main><header><small>MUNICONTROL · OPERACIÓN LOCAL</small><h1>Central de relojes</h1><p>Todos los equipos, un mismo control. Cada reloj conserva su identidad, sus registros y sus comprobantes.</p><small>Panel preparado: ${esc(date(snapshot.updatedAt))}</small><small>Operación solicitada: ${esc(desired)}</small></header>
 <div class="alert">Una captura o un acuse guardado no acreditan conexión en vivo ni asistencia aprobada. Cada fecha corresponde a la evidencia de ese equipo.${snapshot.observation?' Hay una observación del supervisor que requiere diagnóstico.':''}</div>
 <section class="metrics" aria-label="Resumen del parque configurado">${metrics.map(([key,label])=>`<div data-metric="${key}"><strong>${totals[key]}</strong><span>${label}</span></div>`).join('')}</section>
 <p class="scope-note">Los conteos corresponden a los archivos guardados, no a una prueba de conexión en vivo. Los puntos del inventario aún no incorporados no se cuentan como configurados.</p>
 <section class="grid" aria-label="Equipos y evidencia">${cards||'<div class="empty">No hay equipos configurados en este corte. El inventario no implica una conexión activa.</div>'}</section>
 <footer>Este panel no consulta dispositivos ni servidores. Actualiza su presentación cada 30 segundos; una fecha anterior sigue siendo evidencia anterior. El anfitrión y la red autorizada deben estar disponibles. Sin nombres de personas, DNI, usuarios de reloj, IP, series, claves ni datos biométricos.</footer></main></body></html>`;
}

// Compatibility with the existing capture supervisor. It never guesses delivery configuration.
export function fleetOverview(config,summary,{pm10=null,desired='stopped',error=null}={}){
 if(!config||!Array.isArray(config.clocks))throw Error('GATEWAY_OVERVIEW_INVALID');
 const saved=new Map((Array.isArray(summary?.clocks)?summary.clocks:[]).map(s=>[s.clockId,s]));
 const clocks=config.clocks.map(c=>{
  const s=saved.get(c.clockId),capture={state:s?.status??'waiting',blocked:s?.blocked===true,lastError:s?.lastError,
   checkedAt:summary?.updatedAt??null,lastAttemptAt:s?.lastAttemptAt??null,lastCaptureAt:s?.lastCaptureAt??null,nextPollAt:s?.nextPollAt??null,records:s?.uniqueLocalRecords??null,evidenceState:s?'verified':'missing'};
  return {clockId:c.clockId,label:c.label,enabled:c.enabled!==false,capture,delivery:{evidenceState:'missing'},evidenceState:'missing'};
 });
 if(pm10){
  if(pm10.capture&&pm10.delivery){
   const branches=[pm10.capture,pm10.delivery],evidenceState=branches.some(b=>b.evidenceState==='invalid')?'invalid':branches.some(b=>b.evidenceState!=='verified')?'missing':'verified';
   clocks.push({clockId:null,label:'PM-10 · Edificio Viejo',enabled:true,evidenceState,capture:pm10.capture,delivery:pm10.delivery});
  }else{
  const ack=time(pm10.lastReceiptAt)&&integer(pm10.confirmedRecords);
  clocks.push({clockId:null,label:'PM-10 · Edificio Viejo',enabled:true,evidenceState:ack?'verified':'missing',
   capture:{state:time(pm10.lastCaptureAt)?'captured_locally':'waiting',blocked:false,checkedAt:null,lastCaptureAt:pm10.lastCaptureAt??null,evidenceState:time(pm10.lastCaptureAt)?'verified':'missing'},
   delivery:{enabled:true,state:ack?'queue_confirmed':'waiting',evidenceState:ack?'verified':'missing',scope:'canonical',checkedAt:null,lastReceiptAt:pm10.lastReceiptAt??null,confirmedRecords:pm10.confirmedRecords??null,pendingParts:null}});
  }
 }
 return renderGatewayOverview({schema:'municipal-clock-overview.v1',updatedAt:summary?.updatedAt??null,desiredState:desired,clocks,observation:!!error,networkTested:false,realWrites:0});
}
