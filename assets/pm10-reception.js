// This panel displays receipts, not a simulated heartbeat or approved attendance.
const root=document.getElementById('pm10Reception');
if(root){
 const $=id=>root.querySelector('[data-pm10="'+id+'"]');
 let active=false,generation=0,controller=null,timer=null;
 const n=v=>new Intl.NumberFormat('es-AR').format(v);
 function date(v){return v&&Number.isFinite(Date.parse(v))?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Mendoza',dateStyle:'short',timeStyle:'medium',hour12:false}).format(new Date(v)):'Sin registro';}
 function clear(){
  for(const k of ['new','known','observed','parts','received','captured'])$(k).textContent='—';
  $('rows').replaceChildren();$('state').dataset.tone='pending';
  $('checked').textContent='Sin consulta actual verificada.';
  $('explanation').textContent='Actualizá la recepción para consultar lo confirmado por la base.';
  $('baseline').textContent='La captura histórica se consulta en el tablero de marcaciones.';
 }
 function cell(tr,v){const td=document.createElement('td');td.textContent=v??'—';tr.append(td);}
 function valid(x){
  const timestamp=v=>v===null||typeof v==='string'&&Number.isFinite(Date.parse(v));
  return x?.ok===true&&x.version==='pm10-status.v1'&&x.physicalClockVerified===false&&x.payrollModified===false
   &&timestamp(x.checkedAt)&&x.checkedAt!==null&&timestamp(x.summary?.lastReceivedAt)&&timestamp(x.summary?.lastCapturedAt)
   &&['active','suspended','retired','not_configured'].includes(x.connectorState)
   &&Number.isSafeInteger(x.baselineRecords)&&x.baselineRecords>=0&&typeof x.nominalReadAllowed==='boolean'
   &&Array.isArray(x.records)&&x.records.length<=50
   &&['receipts','newMarks','knownRecords','observations'].every(k=>Number.isSafeInteger(x.summary?.[k])&&x.summary[k]>=0)
   &&x.records.every(r=>typeof r.personLabel==='string'&&r.personLabel.length<=500&&timestamp(r.occurredAt)
    &&timestamp(r.receivedAt)&&r.receivedAt!==null&&['observed','mapped','review'].includes(r.state)
    &&(x.nominalReadAllowed||(r.legajo===null&&r.personLabel==='Identidad reservada')));
 }
 function render(x){
  const labels={active:'Habilitado para recibir',suspended:'Conector suspendido',retired:'Conector retirado',not_configured:'Sin conector configurado'};
  $('state').textContent=labels[x.connectorState];$('state').dataset.tone=x.connectorState==='active'&&x.summary.receipts>0?'confirmed':'pending';
  $('explanation').textContent=x.connectorState==='suspended'?'La recepción está protegida y el conector sigue suspendido. La instalación municipal y su activación aún no están comprobadas.':x.summary.receipts===0?'Todavía no se confirmó ningún lote del colector. Habilitar el conector no demuestra que el equipo esté instalado o conectado.':'Hay lotes confirmados por la base. La fecha de recepción no acredita una conexión permanente ni la cobertura completa del período.';
  for(const [key,value] of Object.entries({new:x.summary.newMarks,known:x.summary.knownRecords,observed:x.summary.observations,parts:x.summary.receipts}))$(key).textContent=n(value);
  $('received').textContent=date(x.summary.lastReceivedAt);$('captured').textContent=date(x.summary.lastCapturedAt);
  $('baseline').textContent=n(x.baselineRecords)+' registros de captura histórica conservados. No se vuelven a contar como fichadas nuevas al reenviarlos.';
  $('rows').replaceChildren();
  for(const r of x.records){const tr=document.createElement('tr');cell(tr,date(r.occurredAt));cell(tr,r.personLabel);cell(tr,r.legajo);cell(tr,({mapped:'Vinculada · revisión laboral pendiente',review:'Vínculo laboral a revisar',observed:'Registro observado'})[r.state]);cell(tr,date(r.receivedAt));$('rows').append(tr);}
  if(!x.records.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='Todavía no hay registros nuevos de recepción continua. La captura histórica sigue disponible debajo.';tr.append(td);$('rows').append(tr);}
  $('checked').textContent='Consulta a la base: '+date(x.checkedAt)+'. Actualización cada 60 segundos con la página visible.';
 }
 async function refresh(){
  if(!active||document.hidden)return;
  const g=++generation;controller?.abort();controller=new AbortController();const current=controller;
  root.setAttribute('aria-busy','true');$('refresh').disabled=true;$('error').hidden=true;
  try{const response=await fetch('/api/internal-attendance?resource=pm10-reception',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.any([current.signal,AbortSignal.timeout(20000)])});
   if(response.status===401||response.status===403){active=false;clearInterval(timer);throw Error('Acceso no disponible. Ingresá nuevamente con un perfil autorizado.');}
   const data=await response.json();if(!response.ok||!valid(data))throw Error('No se pudo verificar la recepción. No se muestran cifras anteriores como actuales.');if(g!==generation||!active)return;render(data);
  }catch(e){if(g!==generation||current.signal.aborted)return;clear();$('state').textContent='Sin confirmación actual';$('error').textContent=e.message==='Acceso no disponible. Ingresá nuevamente con un perfil autorizado.'?e.message:'No se pudo actualizar la recepción. Reintentá para consultar el estado actual.';$('error').hidden=false;}
  finally{if(g===generation){root.setAttribute('aria-busy','false');$('refresh').disabled=!active;}}
 }
 function start(){if(active)return;active=true;root.hidden=false;refresh();timer=setInterval(refresh,60000);}
 function stop(){active=false;generation++;controller?.abort();clearInterval(timer);clear();root.hidden=true;}
 $('refresh').addEventListener('click',refresh);document.addEventListener('mc:attendance-ready',start);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){generation++;controller?.abort();root.setAttribute('aria-busy','false');$('refresh').disabled=!active;}else refresh();});
 document.getElementById('logoutButton')?.addEventListener('click',stop);window.addEventListener('pagehide',stop);
 if(document.getElementById('appShell')?.hidden===false)start();
}
