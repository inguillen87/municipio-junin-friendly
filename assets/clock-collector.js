import {collectorPresentation} from './clock-collector-model.js';
const root=document.getElementById('collectorMonitor');
if(root){
 const $=id=>document.getElementById('collector'+id),num=x=>new Intl.NumberFormat('es-AR').format(x),txt=(id,v)=>{$(id).textContent=v;};
 let controller=null,generation=0,timer=null,started=false;
 const stamp=v=>v?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Mendoza',dateStyle:'short',timeStyle:'medium',hour12:false}).format(new Date(v)):'Sin registro';
 const clear=()=>{for(const k of ['Contact','Read','Batch','Stored','Normalized','Observed','Pending'])txt(k,'—');$('Rows').replaceChildren();};
 function render(data){const view=collectorPresentation(data);root.dataset.state=view.state;txt('State',view.title);txt('Explanation',view.detail);
  for(const [k,v] of Object.entries({Contact:data.lastContactAt,Read:data.lastReadAt,Batch:data.lastBatchAt,Checked:data.generatedAt}))txt(k,stamp(v));
  txt('Stored',num(data.totals.stored));txt('Normalized',num(data.totals.normalized));txt('Observed',num(data.totals.observed));txt('Pending',data.lastContactAt?num(data.pendingReported):'Sin informe');
  const issues={invalid_identity:'Identificador observado',invalid_date:'Fecha inválida',future_date:'Fecha posterior a la lectura',before_activation:'Anterior al inicio autorizado'};
  $('Rows').replaceChildren();for(const r of data.recent){const tr=document.createElement('tr');for(const v of [r.localTime||'Fecha observada',stamp(r.receivedAt),r.issue?issues[r.issue]||'Revisar':r.identityState==='mapped'?'Vinculada · pendiente de revisión':'Pendiente de vinculación',`${r.punchCode} / ${r.verificationCode}`]){const td=document.createElement('td');td.textContent=String(v);tr.append(td);}$('Rows').append(tr);}
  if(!data.recent.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.className='cl-empty';td.textContent='Todavía no hay registros nuevos recibidos por el colector. La captura histórica continúa disponible debajo.';tr.append(td);$('Rows').append(tr);}
 }
 async function refresh(){controller?.abort();controller=new AbortController();const own=++generation;root.setAttribute('aria-busy','true');$('Refresh').disabled=true;
  try{const res=await fetch('/api/internal-attendance?resource=collector-status&site=pm-10',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
   if(own!==generation)return;
   if(res.status===401||res.status===403){clear();started=false;clearInterval(timer);root.hidden=true;if(res.status===401)location.replace('login.html?next='+encodeURIComponent('relojes-marcaciones.html'));return;}
   if(!res.ok)throw Error('Consulta no disponible');const data=await res.json();if(own!==generation)return;render(data);
  }catch(e){if(own!==generation||e.name==='AbortError')return;clear();root.dataset.state='error';txt('State','No se pudo verificar la sincronización');txt('Explanation','El estado anterior no se conserva como actual. Reintentá la consulta; no significa que el reloj haya perdido sus registros.');}
  finally{if(own===generation){root.setAttribute('aria-busy','false');$('Refresh').disabled=false;}}
 }
 function start(){if(started)return;started=true;root.hidden=false;refresh();timer=setInterval(()=>{if(!document.hidden)refresh();},60000);}
 $('Refresh').addEventListener('click',refresh);document.addEventListener('mc:attendance-ready',start);
 document.getElementById('logoutButton')?.addEventListener('click',()=>{generation++;controller?.abort();clearInterval(timer);started=false;clear();root.hidden=true;});
 window.addEventListener('pagehide',()=>{generation++;controller?.abort();clearInterval(timer);});
 if(document.getElementById('appShell')?.hidden===false)start();
}
