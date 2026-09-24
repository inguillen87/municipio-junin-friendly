import {assertClockWorkspace,workspaceRows,workspaceSummary,workspaceCsv,WORKSPACE_STATES} from './clock-fleet-workspace-model.js';
import {clockFleetSites} from './clock-fleet-model.js';
import {attendancePointLabel} from './attendance-point-label.js';
export function mountClockWorkspace(panel){
 if(panel.dataset.mounted==='true')return;panel.dataset.mounted='true';panel.classList.add('fleet-workspace');
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=String(text);if(cls)e.className=cls;return e;},fmt=n=>n===null?'Sin verificar':new Intl.NumberFormat('es-AR').format(n);
 const date=v=>v?new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Mendoza',dateStyle:'short',timeStyle:'medium',hour12:false}).format(new Date(v)):'Sin registro';
 const state={active:false,denied:false,data:null,busy:false,controller:null,generation:0,timer:null,lastAttempt:0,search:'',filter:'all',view:'cards'};
 const button=(text,fn,cls='button')=>{const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
 const head=el('header',null,'fleet-head'),title=el('div');title.append(el('p','PARQUE DE RELOJES · RECEPCIÓN Y USO','fleet-eyebrow'),el('h2','Una vista por equipo'),el('p','Archivo recibido, marcas incorporadas y próximo paso. Todos los equipos, incluido PM10, siguen el mismo recorrido.'));
 const refresh=button('Actualizar parque',()=>read(),'button primary');refresh.dataset.workspace='refresh';head.append(title,refresh);
 const summary=el('div',null,'fleet-metrics workspace-metrics'),metrics={};
 for(const [key,label]of [['devices','Equipos registrados'],['archiveReceived','Con archivo original'],['consultable','Con marcaciones consultables'],['awaitingIncorporation','Archivo por incorporar']]){const c=el('div'),v=el('strong','—');v.dataset.workspace=key;metrics[key]=v;c.append(v,el('span',label));summary.append(c);}
 const note=el('p','Los registros del archivo y las marcas incorporadas son etapas distintas: no se suman ni se restan entre sí. Consultable no significa jornada aprobada.','fleet-note');
 const breakdown=el('div',null,'workspace-breakdown');breakdown.setAttribute('role','group');breakdown.setAttribute('aria-label','Filtrar por etapa operativa');
 const form=el('form',null,'fleet-tools'),label=el('label','Buscar punto o equipo'),search=el('input');search.type='search';search.maxLength=120;search.autocomplete='off';search.placeholder='Punto, lugar o modelo';search.dataset.workspace='search';label.append(search);
 const submit=el('button','Aplicar búsqueda','button');submit.type='submit';const filterLabel=el('label','Etapa'),filter=el('select');filter.dataset.workspace='filter';for(const [v,t]of [['all','Todas las etapas'],...Object.entries(WORKSPACE_STATES)]){const o=el('option',t);o.value=v;filter.append(o);}filterLabel.append(filter);
 const clear=button('Limpiar',()=>{search.value=state.search='';filter.value=state.filter='all';render();});
 const exportButton=button('Exportar control · CSV',exportControl);exportButton.dataset.workspace='export';
 const view=button('Ver tabla',()=>{state.view=state.view==='cards'?'table':'cards';render();});view.dataset.workspace='view';form.append(label,submit,clear,filterLabel,view,exportButton);
 const result=el('p','','fleet-count');result.dataset.workspace='count';result.setAttribute('role','status');
 const error=el('p','','fleet-error');error.setAttribute('role','alert');error.dataset.workspace='error';error.hidden=true;
 const partial=el('p','','fleet-note');partial.dataset.workspace='partial';partial.setAttribute('role','status');partial.hidden=true;
 const cards=el('div',null,'fleet-cards'),tableWrap=el('div',null,'workspace-table-scroll');cards.dataset.workspace='cards';tableWrap.dataset.workspace='table';tableWrap.tabIndex=0;tableWrap.setAttribute('role','region');tableWrap.setAttribute('aria-label','Control del parque de relojes');tableWrap.hidden=true;
 const cuts=el('p','','fleet-count');cuts.dataset.workspace='cuts';const exported=el('p','','fleet-count');exported.dataset.workspace='exported';exported.setAttribute('role','status');
 const autoLabel=el('label',null,'workspace-auto'),auto=el('input');auto.type='checkbox';auto.dataset.workspace='auto';autoLabel.append(auto,document.createTextNode('Actualizar cada minuto mientras no esté leyendo un detalle'));
 panel.append(head,summary,note,breakdown,form,result,error,partial,cards,tableWrap,cuts,exported,autoLabel);
 const point=d=>document.dispatchEvent(new CustomEvent('mc:attendance-site',{detail:{site:d.siteKey}}));
 function controls(){refresh.disabled=state.busy||!state.active||state.denied;exportButton.disabled=state.busy||!state.data||state.denied;auto.disabled=state.denied;panel.setAttribute('aria-busy',String(state.busy));}
 function map(){if(state.data)document.dispatchEvent(new CustomEvent('mc:clock-fleet-data',{detail:{checkedAt:state.data.reception.checkedAt,sites:clockFleetSites(state.data.reception)}}));else document.dispatchEvent(new Event('mc:clock-fleet-cleared'));}
 function stageFacts(host,r){const d=r.device,a=r.archive,dl=el('dl');dl.className='workspace-stages';
  for(const [k,v]of [['Archivo original',a?a.enrolled?fmt(a.recordsPersisted)+' registros':'Sin inscripción en archivo':'Sin verificar'],['Envíos por completar',a?fmt(a.pendingBatches):'Sin verificar'],['Nuevas por recepción',fmt(d.newCanonical)],['Consulta de marcas',d.canConsult?'Disponible':'Pendiente']])dl.append(el('dt',k),el('dd',v));host.append(dl);
 }
 function card(r){const d=r.device,a=r.archive,c=el('article',null,'fleet-card workspace-card');c.dataset.device=d.deviceId;c.dataset.stage=r.state;
  c.append(el('span',r.label,'fleet-status '+(r.state==='consultable'?'confirmed':'attention')),el('h3',attendancePointLabel(d.siteKey,d.label)),el('p',d.model||'Modelo no informado','fleet-device'));stageFacts(c,r);c.append(el('p',r.guidance,'fleet-next'));
  const actions=el('div',null,'fleet-actions');if(d.canConsult)actions.append(button('Ver marcaciones',()=>point(d)));
  actions.append(button('Ubicar en mapa',()=>document.dispatchEvent(new CustomEvent('mc:clock-fleet-map-focus',{detail:{siteKey:d.siteKey}}))));
  const details=el('details');details.append(el('summary','Trazabilidad de ambas etapas'));const dl=el('dl');
  for(const [k,v]of [['Último acuse del archivo',date(a?.lastReceivedAt)],['Última captura del archivo',date(a?.lastCapturedAt)],['Envíos completos en archivo',a?fmt(a.completedBatches):'Sin verificar'],['Último acuse operativo',date(d.lastReceivedAt)],['Última captura operativa',date(d.lastCapturedAt)],['Recepción operativa',r.receptionStatus.label],['Observaciones',fmt(d.observations)],['Reenvíos duplicados',fmt(d.duplicates)]])dl.append(el('dt',k),el('dd',v));
  details.append(dl,el('p','Una recepción de archivo no vincula por sí sola al agente. Sin turno y reglas aprobadas no se determina ausencia ni extra pagable.','fleet-next'));c.append(actions,details);return c;
 }
 function render(){const focusedStage=document.activeElement?.dataset.workspaceStage;cards.replaceChildren();tableWrap.replaceChildren();breakdown.replaceChildren();controls();view.textContent=state.view==='cards'?'Ver tabla':'Ver tarjetas';view.setAttribute('aria-pressed',String(state.view==='table'));cards.hidden=state.view!=='cards';tableWrap.hidden=state.view!=='table';
  if(!state.data){Object.values(metrics).forEach(n=>n.textContent='—');result.textContent=state.busy?'Consultando las dos etapas del parque…':'Sin un corte confirmado.';cuts.textContent='';partial.hidden=true;return;}
  const v=state.data,s=workspaceSummary(v),rows=workspaceRows(v,{search:state.search,state:state.filter});for(const k of Object.keys(metrics))metrics[k].textContent=fmt(s[k]);
  for(const [key,n]of Object.entries(s.states)){if(n===0&&state.filter!==key)continue;const b=button(WORKSPACE_STATES[key]+' · '+fmt(n),()=>{state.filter=filter.value=state.filter===key?'all':key;render();},'workspace-stage-filter');b.dataset.workspaceStage=key;b.setAttribute('aria-pressed',String(state.filter===key));const track=el('span',null,'workspace-stage-track'),fill=el('i');fill.style.width=(s.devices?n/s.devices*100:0)+'%';track.append(fill);b.append(track);breakdown.append(b);}
  result.textContent=fmt(rows.length)+' de '+fmt(s.devices)+' equipos. '+(state.search?'Búsqueda aplicada: «'+state.search+'». ':'')+'Los indicadores conservan todo el parque; las etapas del gráfico no se superponen.';
  cuts.textContent='Recepción operativa: '+date(v.reception.checkedAt)+'. Archivo original: '+(v.archive?date(v.archive.sourceCheckedAt):'sin verificar')+'. Son observaciones de dos bases, con acceso e inventario revalidados; no una transacción distribuida ni conexión en vivo.';
  partial.hidden=v.archiveAvailability==='available';partial.textContent='El archivo original no pudo verificarse. Se conserva sólo la recepción operativa autorizada. “Sin verificar” no equivale a cero registros; reintentá Actualizar parque.';
  rows.forEach(r=>cards.append(card(r)));if(!rows.length)cards.append(el('p','Sin coincidencias. Limpiá la búsqueda o cambiá la etapa.','fleet-empty'));
  const table=el('table'),thead=el('thead'),hr=el('tr');for(const h of ['Punto / lugar','Etapa','Archivo original','Nuevas por recepción','Próximo paso']){const th=el('th',h);th.scope='col';hr.append(th);}thead.append(hr);table.append(thead);const body=el('tbody');
  for(const r of rows){const tr=el('tr');for(const val of [attendancePointLabel(r.device.siteKey,r.device.label),r.label,r.archive?r.archive.enrolled?fmt(r.archive.recordsPersisted):'Sin inscripción':'Sin verificar',fmt(r.device.newCanonical)])tr.append(el('td',val));const td=el('td');if(r.device.canConsult)td.append(button('Ver marcaciones',()=>point(r.device)));else td.textContent=r.guidance;tr.append(td);body.append(tr);}table.append(body);tableWrap.append(table);
  if(focusedStage)Array.from(breakdown.querySelectorAll('[data-workspace-stage]')).find(b=>b.dataset.workspaceStage===focusedStage)?.focus({preventScroll:true});
 }
 async function fetchData(signal){
  const r=await fetch('/api/internal-clock-source?view=workspace',{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
  if(r.status===401||r.status===403){state.denied=true;throw Error('ACCESS');}
  if(r.status!==200||r.redirected||!r.headers.get('content-type')?.includes('application/json')||!r.headers.get('cache-control')?.includes('no-store'))throw Error('RESPONSE');
  const reader=r.body?.getReader();if(!reader)throw Error('RESPONSE');const parts=[];let length=0,done=false;
  try{for(;;){const chunk=await reader.read();if(signal.aborted)throw Error('ABORT');if(chunk.done){done=true;break;}length+=chunk.value.byteLength;if(length>524288)throw Error('SIZE');parts.push(chunk.value);}}finally{if(!done)await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}const {ok,...v}=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(ok!==true)throw Error('RESPONSE');return assertClockWorkspace(v);
 }
 async function read(){
  if(!state.active||state.denied||state.busy||document.hidden)return null;
  if(Date.now()-state.lastAttempt<3000){exported.textContent='Esperá unos segundos entre consultas.';return null;}
  state.lastAttempt=Date.now();state.busy=true;error.hidden=true;exported.textContent='';state.controller?.abort();const c=new AbortController(),gen=++state.generation;state.controller=c;controls();
  try{const v=await fetchData(c.signal);if(gen!==state.generation||c.signal.aborted||!state.active)return null;state.data=v;render();map();return v;}
  catch(e){if(gen!==state.generation||c.signal.aborted)return null;state.data=null;render();map();error.textContent=state.denied?'El acceso cambió. Volvé a ingresar con un perfil autorizado.':'No se pudo verificar el parque. Se retiró el corte anterior; reintentá Actualizar parque.';error.hidden=false;if(state.denied){auto.checked=false;clearTimeout(state.timer);}return null;}
  finally{if(gen===state.generation){state.busy=false;controls();schedule();}}
 }
 async function exportControl(){const options={search:state.search,state:state.filter};const v=await read();if(!v)return;if(options.search!==state.search||options.state!==state.filter){exported.textContent='Cambió el filtro. Repetí la exportación.';return;}
  const bytes=workspaceCsv(v,options),url=URL.createObjectURL(new Blob([bytes],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download='parque-relojes-'+v.checkedAt.slice(0,10)+'.csv';a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);exported.textContent=fmt(workspaceRows(v,options).length)+' equipos exportados con ambos cortes. Sin datos nominales ni horas pagables.';
 }
 function schedule(){clearTimeout(state.timer);if(state.active&&!state.denied&&auto.checked&&!document.hidden)state.timer=setTimeout(()=>{if(panel.contains(document.activeElement)||panel.querySelector('details[open]')||search.value.trim()!==state.search){schedule();return;}read();},60000);}
 function start(){if(state.active||state.denied)return;state.active=true;panel.hidden=false;read();}
 function stop(){state.active=false;state.generation++;state.controller?.abort();clearTimeout(state.timer);state.busy=false;state.data=null;state.search=search.value='';state.filter=filter.value='all';auto.checked=false;error.hidden=true;exported.textContent='';render();map();panel.hidden=true;}
 form.addEventListener('submit',e=>{e.preventDefault();state.search=search.value.trim();render();});filter.addEventListener('change',()=>{state.filter=filter.value;render();});auto.addEventListener('change',schedule);
 document.addEventListener('mc:attendance-ready',start);document.getElementById('logoutButton')?.addEventListener('click',stop);window.addEventListener('pagehide',stop);
 window.addEventListener('pageshow',e=>{if(e.persisted&&!state.denied)start();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){state.generation++;state.controller?.abort();state.busy=false;clearTimeout(state.timer);controls();}else schedule();});
 document.addEventListener('municontrol:capabilities-ready',e=>{if(e.detail?.tenantCapabilities&&!new Set(e.detail.tenantCapabilities).has('attendance.read')){state.denied=true;stop();}});
 new MutationObserver(()=>{if(['denied','checking'].includes(document.documentElement.dataset.mcCapabilityState)){state.denied=true;stop();}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-mc-capability-state']});
 render();if(document.getElementById('appShell')?.hidden===false)start();
}
