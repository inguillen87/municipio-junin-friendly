import {assertClockSourceDashboard,clockSourceStatus} from './clock-source-model.js';
import {attendancePointLabel} from './attendance-point-label.js';
const root=document.getElementById('clockSourceArchive');if(root)mountClockSource(root);
export function mountClockSource(panel){
 if(panel.dataset.mounted)return;panel.dataset.mounted='true';
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
 const state={active:false,denied:false,busy:false,generation:0,controller:null};
 const head=el('header',null,'fleet-head'),title=el('div');title.append(el('p','ARCHIVO ORIGINAL DE RELOJES','fleet-eyebrow'),el('h2','Envíos a la base de relojes'),el('p','Consultá qué archivos quedaron guardados para su posterior revisión.'));
 const button=el('button','Consultar archivo','button');button.type='button';button.dataset.source='refresh';head.append(title,button);
 const note=el('p','Guardar un envío conserva la fuente. La identificación de agentes, las jornadas y las horas extras requieren conciliación y aprobación.','fleet-note');
 const status=el('p','Consulta manual. Todavía no se consultó el archivo.','fleet-count');status.setAttribute('role','status');status.dataset.source='status';
 const error=el('p','','fleet-error');error.setAttribute('role','alert');error.hidden=true;error.dataset.source='error';
 const cards=el('div',null,'fleet-cards');cards.dataset.source='cards';const footer=el('p','','fleet-count');footer.dataset.source='checked';
 panel.append(head,note,status,error,cards,footer);
 const fmt=v=>new Intl.NumberFormat('es-AR').format(v),date=v=>v?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Mendoza',dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'Sin registro';
 function controls(){button.disabled=!state.active||state.denied||state.busy;panel.setAttribute('aria-busy',String(state.busy));}
 function clear(){cards.replaceChildren();footer.textContent='';}
 function render(v){
  clear();status.textContent=v.devices.length?fmt(v.devices.length)+(v.devices.length===1?' equipo del inventario autorizado.':' equipos del inventario autorizado.')+' Conciliación laboral pendiente.':'El inventario autorizado todavía no contiene equipos.';
  for(const d of v.devices){
   const card=el('article',null,'fleet-card');card.append(el('span',clockSourceStatus(d),'fleet-status '+(d.enabled&&d.receipts&&!d.pendingBatches?'confirmed':'attention')),el('h3',attendancePointLabel(d.siteKey,d.label)),el('p',d.model||'Modelo no informado','fleet-device'));
   if(d.enrolled){const dl=el('dl');for(const [k,value]of [['Partes guardadas',fmt(d.receipts)],['Registros de origen',fmt(d.recordsPersisted)],['Envíos completos',fmt(d.completedBatches)],['Envíos por completar',fmt(d.pendingBatches)],['Último acuse',date(d.lastReceivedAt)]])dl.append(el('dt',k),el('dd',value));card.append(dl);}
   else card.append(el('p','Falta vincular este equipo con el archivo de fuentes. No hay una recepción certificada en esta base.','fleet-next'));
   cards.append(card);
  }
  footer.textContent='Archivo consultado: '+date(v.sourceCheckedAt)+'. Acceso e inventario revalidados: '+date(v.coreCheckedAt)+'. Son consultas separadas; no acreditan conexión permanente.';
 }
 async function read(){
  if(!state.active||state.denied||state.busy||document.hidden)return;
  const gen=++state.generation,c=new AbortController();state.controller?.abort();state.controller=c;state.busy=true;error.hidden=true;clear();status.textContent='Consultando archivo autorizado…';controls();
  try{
   const response=await fetch('/api/internal-clock-source',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.any([c.signal,AbortSignal.timeout(20000)])});
   if([401,403].includes(response.status)){state.denied=true;throw Error('ACCESS');}
   if(response.status!==200||response.redirected||!response.headers.get('content-type')?.includes('application/json')||!response.headers.get('cache-control')?.includes('no-store'))throw Error('UNAVAILABLE');
   const reader=response.body?.getReader();if(!reader)throw Error('BODY');let bytes=0,done=false;const chunks=[];
   try{for(;;){const item=await reader.read();if(item.done){done=true;break;}bytes+=item.value.byteLength;if(bytes>262144)throw Error('BODY');chunks.push(item.value);}}finally{if(!done)await reader.cancel().catch(()=>{});reader.releaseLock();}
   const data=new Uint8Array(bytes);let i=0;for(const part of chunks){data.set(part,i);i+=part.length;}
   const {ok,...v}=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));if(ok!==true)throw Error('BODY');assertClockSourceDashboard(v);
   if(gen!==state.generation||c.signal.aborted||!state.active)return;render(v);
  }catch{
   if(gen!==state.generation||c.signal.aborted)return;clear();status.textContent='Sin consulta actual verificada.';error.textContent=state.denied?'El acceso cambió. Volvé a ingresar con un perfil habilitado.':'No se pudo consultar el archivo. Puede estar pendiente de habilitación; reintentá más tarde.';error.hidden=false;
  }finally{if(gen===state.generation){state.busy=false;controls();}}
 }
 function stop(){state.active=false;state.generation++;state.controller?.abort();state.busy=false;clear();error.hidden=true;status.textContent='Sin consulta actual verificada.';panel.hidden=true;controls();}
 function start(){if(state.active||state.denied)return;state.active=true;panel.hidden=false;controls();}
 button.addEventListener('click',()=>void read());document.addEventListener('mc:attendance-ready',start);
 document.getElementById('logoutButton')?.addEventListener('click',stop);window.addEventListener('pagehide',stop);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){state.generation++;state.controller?.abort();state.busy=false;clear();status.textContent='Volvé a consultar para obtener el estado actual.';controls();}});
 document.addEventListener('municontrol:capabilities-ready',e=>{if(e.detail?.tenantCapabilities&&!new Set(e.detail.tenantCapabilities).has('attendance.read')){state.denied=true;stop();}});
 new MutationObserver(()=>{if(['denied','checking'].includes(document.documentElement.dataset.mcCapabilityState)){state.denied=true;stop();}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-mc-capability-state']});
 controls();if(document.getElementById('appShell')?.hidden===false)start();
}
