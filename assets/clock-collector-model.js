/** Presentation distinguishes server contact, physical-read report and durable receipt. */
export function collectorPresentation(data,now=Date.now()){
 if(!data||data.ok!==true||data.version!=='clock-collector-status.v1'||data.site!=='pm-10'||data.payrollImpact!==false||typeof data.enabled!=='boolean'||!data.totals||!Array.isArray(data.recent)||data.recent.length>20)throw Error('Respuesta de sincronización inválida');
 if(!['active','suspended','retired','not_registered'].includes(data.connectorState)||!['not_installed','read_ok','device_offline','blocked','spool_full'].includes(data.reportedState))throw Error('Estado de sincronización inválido');
 for(const k of ['stored','normalized','observed'])if(!Number.isSafeInteger(data.totals[k])||data.totals[k]<0)throw Error('Contadores inválidos');
 if(data.totals.stored!==data.totals.normalized+data.totals.observed||!Number.isSafeInteger(data.pendingReported)||data.pendingReported<0)throw Error('Contadores inconsistentes');
 const ms=x=>x===null?null:typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):NaN;
 for(const k of ['generatedAt','lastContactAt','lastReadAt','lastBatchAt','captureLastAt'])if(Number.isNaN(ms(data[k])))throw Error('Fecha de sincronización inválida');
 const recent=x=>ms(x)!==null&&now-ms(x)>=-300000&&now-ms(x)<=180000;
 let state='pending',title='Automatización pendiente',detail='Hay una captura histórica; todavía no se acredita un colector municipal en servicio.';
 if(data.connectorState==='suspended'){state='paused';title='Conector suspendido';detail='No se aceptan nuevos lotes. Primero se instala y verifica el servicio municipal; después se habilita su credencial.';}
 else if(!data.enabled){detail='El receptor está preparado, pero la instalación no está habilitada. Un botón de refresco no conecta el reloj.';}
 else if(!data.lastContactAt){title='Sin contacto del colector';detail='No hay una recepción autenticada del servicio municipal.';}
 else if(!recent(data.lastContactAt)){state='stale';title='Sin contacto reciente';detail='La última comunicación tiene más de tres minutos. No se deducen ausencias por una interrupción del colector.';}
 else if(data.reportedState==='blocked'||data.reportedState==='spool_full'){state='blocked';title=data.reportedState==='spool_full'?'Cola local al límite':'Servicio pausado para revisión';detail='La evidencia pendiente se conserva. Revisar el servicio antes de reanudar; no se prueban contraseñas automáticamente.';}
 else if(data.reportedState==='device_offline'||!recent(data.lastReadAt)){state='warning';title='Servidor conectado; reloj sin lectura reciente';detail='La conexión HTTPS funciona, pero eso no demuestra que se haya leído recientemente el equipo.';}
 else if(data.pendingReported>0){state='warning';title='Lectura informada; envío pendiente';detail='El servidor municipal informó '+data.pendingReported+' registros en su cola. Los confirmados permanecen en MuniControl.';}
 else{state='recent';title='Contacto y lectura recientes';detail='El colector informó una lectura reciente. El último lote confirmado se muestra por separado; no acredita presencia ni autoriza horas.';}
 return {state,title,detail,contactRecent:recent(data.lastContactAt),readRecent:recent(data.lastReadAt)};
}
