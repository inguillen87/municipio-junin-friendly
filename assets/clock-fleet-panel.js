import {assertClockFleet,clockFleetStatus,clockFleetRows,clockFleetSummary,clockFleetCsv,clockFleetSites} from './clock-fleet-model.js';
// Common fleet overview supplements (does not replace) the existing PM10 nominal view.
const fleetRoot=document.getElementById('clockFleetReception');
if(fleetRoot)mountClockFleet(fleetRoot);
export function mountClockFleet(panel){
 if(panel.dataset.mounted==='true')return;panel.dataset.mounted='true';
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
 const button=(text,fn,cls)=>{const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
 const fmt=v=>new Intl.NumberFormat('es-AR').format(v);
 const date=v=>v?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Mendoza',dateStyle:'short',timeStyle:'medium',hour12:false}).format(new Date(v)):'Sin registro';
 const state={active:false,denied:false,data:null,busy:false,generation:0,controller:null,timer:null,search:'',filter:'all',appliedVersion:0,lastAttempt:0};
 const head=el('header',null,'fleet-head'),title=el('div');title.append(el('p','CONTROL OPERATIVO · RECEPCIÓN POR EQUIPO','fleet-eyebrow'),el('h2','Central de recepción'),el('p','Qué recibió la plataforma, cuándo y desde qué punto. Sin entrar reloj por reloj.'));
 const refresh=button('Actualizar recepción',()=>void read(), 'button primary');refresh.dataset.fleet='refresh';head.append(title,refresh);
 const note=el('p','Los acuses provienen del servidor. La cola y la captura de Windows no se consultan desde esta pantalla. Un reloj leído localmente puede seguir pendiente de incorporación a Neon.','fleet-note');
 const summary=el('div',null,'fleet-metrics');summary.setAttribute('aria-label','Resumen de equipos registrados');
 const metrics={};for(const [key,label]of [['registered','Equipos registrados'],['withReceipts','Con acuses'],['attention','Requieren atención']]){const card=el('div'),value=el('strong','—');value.dataset.fleet=key;card.append(value,el('span',label));summary.append(card);metrics[key]=value;}
 const tools=el('form',null,'fleet-tools'),label=el('label','Buscar punto o equipo'),search=el('input');search.type='search';search.maxLength=120;search.placeholder='Lugar, código o modelo';search.autocomplete='off';search.dataset.fleet='search';label.append(search);
 const apply=el('button','Aplicar búsqueda','button');apply.type='submit';const clear=button('Limpiar',()=>{search.value='';state.search='';state.filter='all';filter.value='all';state.appliedVersion++;render();},'button');
 const filterLabel=el('label','Estado'),filter=el('select');filter.dataset.fleet='filter';for(const [v,t]of [['all','Todos los equipos'],['attention','Requieren atención'],['received','Con acuses recibidos']]){const o=el('option',t);o.value=v;filter.append(o);}filterLabel.append(filter);
 const exportButton=button('Exportar control · CSV',()=>void exportControl(),'button');exportButton.dataset.fleet='export';
 tools.append(label,apply,clear,filterLabel,exportButton);tools.addEventListener('submit',e=>{e.preventDefault();state.search=search.value.trim();state.appliedVersion++;render();});
 filter.addEventListener('change',()=>{state.filter=filter.value;state.appliedVersion++;render();});
 const applied=el('p','','fleet-applied'),error=el('p','','fleet-error');error.setAttribute('role','alert');error.hidden=true;error.dataset.fleet='error';
 const count=el('p','','fleet-count');count.setAttribute('role','status');count.dataset.fleet='count';
 const cards=el('div',null,'fleet-cards');cards.dataset.fleet='cards';
 const footer=el('footer',null,'fleet-footer'),autoLabel=el('label'),auto=el('input');auto.type='checkbox';auto.dataset.fleet='auto';autoLabel.append(auto,document.createTextNode('Actualizar cada 60 segundos mientras esta página esté visible'));
 const checked=el('p','Sin consulta verificada.');checked.dataset.fleet='checked';const exported=el('p');exported.setAttribute('role','status');exported.dataset.fleet='exported';footer.append(autoLabel,checked,exported);
 const explanation=el('details',null,'fleet-explanation');explanation.append(el('summary','Qué significan los estados y los números'));
 for(const text of ['Recepción reciente: al menos un acuse en los 30 minutos anteriores al corte consultado. No equivale a un reloj conectado ahora.','Los registros con acuse se separan en eventos incorporados, observaciones y duplicados detectados. No son personas ni horas aprobadas.','Última captura declarada: fecha incluida en los lotes recibidos. Una parte recibida no certifica por sí sola una captura completa o toda la cobertura mensual.','Exportar genera un CSV de todos los equipos del filtro, después de reconsultar la base; no contiene nombres, DNI, IP, claves ni plantillas biométricas.'])explanation.append(el('p',text));
 panel.append(head,note,summary,tools,applied,error,count,cards,footer,explanation);
 function controls(){refresh.disabled=state.busy||!state.active||state.denied;exportButton.disabled=state.busy||!state.data||!state.active||state.denied;panel.setAttribute('aria-busy',String(state.busy));}
 function publishedMap(){if(state.data)document.dispatchEvent(new CustomEvent('mc:clock-fleet-data',{detail:{checkedAt:state.data.checkedAt,sites:clockFleetSites(state.data)}}));else document.dispatchEvent(new Event('mc:clock-fleet-cleared'));}
 function render(){
  cards.replaceChildren();controls();clear.hidden=!state.search&&state.filter==='all'&&!search.value;
  applied.textContent=state.search?'Búsqueda aplicada: «'+state.search+'»':'Sin búsqueda de texto aplicada.';
  if(!state.data){for(const value of Object.values(metrics))value.textContent='—';count.textContent=state.busy?'Consultando recepción autorizada…':'No hay un corte de recepción disponible.';checked.textContent='Sin consulta actual verificada.';return;}
  const data=state.data,totals=clockFleetSummary(data),rows=clockFleetRows(data,state);for(const [key,value]of Object.entries(metrics))value.textContent=fmt(totals[key]);
  count.textContent=fmt(rows.length)+' de '+fmt(data.devices.length)+' equipos registrados en este corte. Los filtros no cambian el resumen general.';
  checked.textContent='Consulta a la base: '+date(data.checkedAt)+'.'+(auto.checked?' Seguimiento cada minuto.':' Actualización manual.');
  if(!rows.length){const empty=el('div',null,'fleet-empty');empty.append(el('strong',data.devices.length?'Sin coincidencias en este filtro':'No hay equipos registrados en este receptor'),el('p',data.devices.length?'Cambiá el filtro o limpiá la búsqueda.':'El alta y el primer envío deben completarse antes de aparecer como una recepción real.'));cards.append(empty);return;}
  for(const d of rows){
   const status=clockFleetStatus(d,data.checkedAt),card=el('article',null,'fleet-card');card.dataset.device=d.deviceId;
   card.append(el('span',status.label,'fleet-status '+status.tone),el('h3',d.label),el('p',d.siteKey.toUpperCase()+' · '+(d.model||'Modelo no informado'),'fleet-device'));
   const dl=el('dl');for(const [a,b]of [['Último acuse',date(d.lastReceivedAt)],['Captura declarada',date(d.lastCapturedAt)],['Registros con acuse',fmt(d.recordsConfirmed)]])dl.append(el('dt',a),el('dd',b));card.append(dl,el('p',status.next,'fleet-next'));
   const actions=el('div',null,'fleet-actions');if(d.canConsult){const consult=button('Ver marcaciones',()=>{document.dispatchEvent(new CustomEvent('mc:attendance-site',{detail:{site:d.siteKey}}));const target=document.getElementById('clockOperations');target?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});document.getElementById('clockTitle')?.focus();},'button');actions.append(consult);}
   const map=button('Ubicar en mapa',()=>{document.dispatchEvent(new CustomEvent('mc:clock-fleet-map-focus',{detail:{siteKey:d.siteKey}}));},'button');actions.append(map);card.append(actions);
   const details=el('details');details.append(el('summary','Desglose y estado del registro'));const detail=el('dl');
   for(const [a,b]of [['Partes confirmadas',fmt(d.receipts)],['Eventos incorporados',fmt(d.newCanonical)],['Observaciones',fmt(d.observations)],['Duplicados',fmt(d.duplicates)],['Inscripción en receptor',d.enrolled?'Registrada':'Pendiente'],['Estado del equipo',{active:'Activo',draft:'Borrador',offline:'Sin conexión declarada',suspended:'Suspendido',retired:'Retirado'}[d.deviceState]],['Estado del conector',{active:'Activo',not_configured:'Sin configurar',suspended:'Suspendido',retired:'Retirado'}[d.connectorState]]])detail.append(el('dt',a),el('dd',b));details.append(detail);card.append(details);cards.append(card);
  }
 }
 async function fetchData(signal){
  const response=await fetch('/api/internal-clock-fleet',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
  if([401,403].includes(response.status)){state.denied=true;throw Error('ACCESO');}
  if(!response.ok||response.status!==200||!response.headers.get('content-type')?.includes('application/json')||!response.headers.get('cache-control')?.includes('no-store')||response.redirected)throw Error('RESPUESTA');
  const reader=response.body?.getReader();if(!reader)throw Error('RESPUESTA');let length=0;const parts=[];let done=false;
  try{for(;;){const r=await reader.read();if(signal.aborted)throw Error('CANCELADO');if(r.done){done=true;break;}length+=r.value.byteLength;if(length>262144)throw Error('RESPUESTA');parts.push(r.value);}}finally{if(!done)await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(length);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
  const x=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(x?.ok!==true)throw Error('RESPUESTA');const {ok,...data}=x;return assertClockFleet(data);
 }
 async function read({exporting=false}={}){
  if(!state.active||state.denied||state.busy||document.hidden)return null;
  if(Date.now()-state.lastAttempt<3000){exported.textContent='Esperá unos segundos entre consultas.';return null;}
  state.lastAttempt=Date.now();state.busy=true;error.hidden=true;exported.textContent='';const gen=++state.generation,filterVersion=state.appliedVersion;state.controller?.abort();const c=new AbortController();state.controller=c;controls();
  try{const data=await fetchData(c.signal);if(gen!==state.generation||!state.active||c.signal.aborted)return null;state.data=data;render();publishedMap();return !exporting||filterVersion===state.appliedVersion?data:null;}
  catch(e){if(gen!==state.generation||c.signal.aborted)return null;state.data=null;render();publishedMap();error.textContent=state.denied?'El acceso cambió. Volvé a ingresar con un perfil habilitado.':'No se pudo verificar la recepción. Los valores anteriores se retiraron; reintentá la consulta.';error.hidden=false;if(state.denied){auto.checked=false;clearTimeout(state.timer);}return null;}
  finally{if(gen===state.generation){state.busy=false;controls();schedule();}}
 }
 async function exportControl(){const opts={search:state.search,filter:state.filter},version=state.appliedVersion;const data=await read({exporting:true});if(!data||version!==state.appliedVersion||!state.active||state.denied)return;const csv=clockFleetCsv(data,opts),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=el('a');a.href=url;a.download='control-recepcion-relojes-'+data.checkedAt.slice(0,10)+'.csv';a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);exported.textContent='Control exportado: '+fmt(clockFleetRows(data,opts).length)+' equipos. Corte '+date(data.checkedAt)+'.';}
 function schedule(){clearTimeout(state.timer);if(state.active&&!state.denied&&auto.checked&&!document.hidden)state.timer=setTimeout(()=>void read(),60000);}
 auto.addEventListener('change',()=>{schedule();if(state.data)checked.textContent='Consulta a la base: '+date(state.data.checkedAt)+(auto.checked?'. Seguimiento cada minuto.':'. Actualización manual.');});
 function stop(){state.active=false;state.generation++;state.controller?.abort();clearTimeout(state.timer);state.busy=false;state.data=null;search.value='';state.search='';state.filter='all';filter.value='all';auto.checked=false;error.hidden=true;exported.textContent='';render();panel.hidden=true;publishedMap();}
 function start(){if(state.active||state.denied)return;state.active=true;panel.hidden=false;void read();}
 document.addEventListener('mc:attendance-ready',start);document.getElementById('logoutButton')?.addEventListener('click',stop);window.addEventListener('pagehide',stop);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){state.generation++;state.controller?.abort();state.busy=false;clearTimeout(state.timer);controls();}else{schedule();}});
 document.addEventListener('municontrol:capabilities-ready',e=>{const caps=e.detail?.tenantCapabilities;if(caps&&!new Set(caps).has('attendance.read')){state.denied=true;stop();}});
 new MutationObserver(()=>{if(['denied','checking'].includes(document.documentElement.dataset.mcCapabilityState)){state.denied=true;stop();}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-mc-capability-state']});
 render();if(document.getElementById('appShell')?.hidden===false)start();
}
