// SPDX-License-Identifier: GPL-2.0-only
// Plain, non-nominal operational explanations; not a connectivity assertion.
export function captureHelp(state,enabled=true){
 if(!enabled)return 'Equipo deshabilitado en la configuración. No se inicia una captura nueva.';
 if(state?.blocked){
  if(['AUTH_NOT_ACCEPTED','AUTHENTICATION_UNVERIFIED'].includes(state.lastError))return 'Revisar la clave de comunicación autorizada. El sistema no prueba otras claves ni borra pendientes.';
  if(state.lastError==='SERIAL_MISMATCH')return 'El equipo respondió con otra identidad. Verificá la serie y el punto; no se reasignan registros.';
  return 'El ciclo requiere revisión antes de reanudar. La cola local y la evidencia se conservan.';
 }
 if(state?.status==='network_wait')return 'Esperando la ruta municipal. No se contacta al reloj por la salida normal a Internet.';
 if(state?.status==='retry_wait'&&(state.connectionFailureCount??0)>0)return 'No se llegó a abrir una sesión con el reloj. Reintento automático, espaciado y sin cambiar la clave.';
 if(state?.status==='retry_wait')return 'El último intento no terminó correctamente. El presupuesto de reintentos de protocolo sigue limitado.';
 if(state?.status==='captured_locally')return 'Captura guardada y deduplicada en este equipo. El envío y el acuse de la plataforma son un paso separado.';
 return 'El estado guardado todavía no acredita una captura nueva. Revisá las fechas de la evidencia.';
}
export function fleetCounts(config,summary){
 const source=Array.isArray(summary?.clocks)?summary.clocks:[],map=new Map(source.map(s=>[s.clockId,s]));
 const states=config.clocks.map(c=>map.get(c.clockId));
 return {configured:config.clocks.length,withCapture:states.filter(s=>typeof s?.lastCaptureAt==='string'&&Number.isFinite(Date.parse(s.lastCaptureAt))).length,needsReview:states.filter(s=>s?.blocked||s?.status==='review_required').length};
}
