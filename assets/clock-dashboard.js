import {referenceCode,referenceMethod,percentage,periodWindow,insights,recordCsv,verifyExport} from './clock-dashboard-model.js';
import {createClockXlsx} from './clock-dashboard-export.js';
import {clockCodeSummary} from './workday-quick-analysis.js';
const root=document.getElementById('clockOperations');
if(root){
 const $=key=>document.getElementById('clock'+key),text=(key,value)=>{$(key).textContent=String(value??'—')},num=v=>new Intl.NumberFormat('es-AR').format(Number(v)||0);
 const state={site:'pm-10',source:'continuous',from:'',to:'',page:1,size:50,search:'',identity:'all',hour:null,
  data:null,cut:null,loading:false,exporting:false,started:false,denied:false,generation:0,
  controller:null,exportController:null,timer:null,tab:'overview'};
 const busy=()=>state.loading||state.exporting;
 function el(tag,value,cls){const e=document.createElement(tag);if(value!=null)e.textContent=String(value);if(cls)e.className=cls;return e}
 function date(value){if(!value||!Number.isFinite(Date.parse(value)))return 'Sin registro';return new Intl.DateTimeFormat('es-AR',{timeZone:state.data?.timezone||'America/Argentina/Mendoza',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value))}
 function cells(row,values){for(const v of values){const td=el('td');td.append(v instanceof Node?v:document.createTextNode(String(v??'—')));row.append(td)}}
 function controls(){
  root.querySelectorAll('[data-query]').forEach(e=>e.disabled=busy()||state.denied);
  $('Search').disabled=busy()||state.denied||state.data?.nominalReadAllowed!==true;
  $('Previous').disabled=busy()||!state.data||state.page<=1;
  $('Next').disabled=busy()||!state.data||state.page>=state.data.pagination.pages;
  $('Export').disabled=busy()||!state.data?.records.length;
  for(const k of ['ExportAll','ExportXlsx'])$(k).disabled=busy()||!state.data?.pagination.total||!state.cut||!state.data?.collection.importComplete;
  $('Print').disabled=busy()||!state.data;$('CancelExport').hidden=!state.exporting;
  $('TabWorkdays').disabled=busy()||state.denied;
  root.setAttribute('aria-busy',String(busy()));
 }
 function tab(name,focus=false){
  const changedView=state.tab!==name || name==='workdays'&&$('Workdays').hidden;
  state.tab=name;
  for(const [key,id]of Object.entries({workdays:'Workdays',overview:'Overview',records:'Records',issues:'IssuesWrap'}))$(id).hidden=key!==name;
  root.querySelectorAll('[data-clock-tab]').forEach(b=>{const active=b.dataset.clockTab===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;if(active&&focus)b.focus()});
  if(changedView)document.dispatchEvent(new CustomEvent('mc:clock-view',{detail:{tab:name}}));
 }
 function changeSource(source,name,focus=false){
  if(busy()||state.denied||!state.started)return;
  // Keep the selected point and applied dates, but never reuse another source's cut.
  state.from=state.from||state.data?.filters?.from||'';state.to=state.to||state.data?.filters?.to||'';
  state.source=source;state.hour=null;$('Source').value=source;
  clearData();text('SourceKind',source==='historical'?'Consultando captura histórica':'Consultando recepciones confirmadas');
  text('WorkdaysNote',source==='historical'?'Jornadas de la captura histórica para el punto y período seleccionados.':'Jornadas sobre histórico y recepciones completas. Cada tramo conserva las fichadas que lo explican.');
  tab(name,focus);load(true).then(()=>{if(focus&&state.started&&!state.denied&&state.source===source&&state.tab===name)tab(name,true)});
 }
 function selectTab(name,focus=false){
  tab(name,focus);
 }
 function filterHour(hour){if(busy())return;state.hour=state.hour===hour?null:hour;tab('records');load(true)}
 const shortcuts=el('nav',null,'ck-quick');shortcuts.setAttribute('aria-label','Tareas de asistencia');
 for(const [view,label]of [['overview','Ver gráficos'],['workdays','Jornadas y cálculos'],['records','Buscar marcaciones'],['issues','Revisar observaciones']]){const b=el('button',label);b.type='button';b.addEventListener('click',()=>{selectTab(view,true);$('Tab'+({overview:'Overview',workdays:'Workdays',records:'Records',issues:'Issues'}[view])).scrollIntoView({block:'nearest'});});shortcuts.append(b)}
 const fleet=document.getElementById('clockFleetReception');if(fleet){fleet.before(root);const b=el('button','Equipos y recepción');b.type='button';b.addEventListener('click',()=>fleet.scrollIntoView({block:'start',behavior:'auto'}));shortcuts.append(b);}
 $('Filter').before(shortcuts);
 const codeHost=el('section',null,'ck-card');codeHost.id='clockCodeDistribution';$('Overview').prepend(codeHost);
 const absenceLink=el('a','Ausentismo general del período ↗','ck-text');absenceLink.target='_blank';absenceLink.rel='noopener noreferrer';absenceLink.hidden=true;shortcuts.append(absenceLink);
 function renderCodes(data){
  const period=data.filters;absenceLink.hidden=!period?.from||!period?.to;
  if(!absenceLink.hidden){absenceLink.href='/ausentismo?'+new URLSearchParams({from:period.from,to:period.to});absenceLink.setAttribute('aria-label','Abrir Ausentismo general del mismo período en otra pestaña, sin filtrar por agente');}

  codeHost.replaceChildren();const s=clockCodeSummary(data);if(!s){codeHost.append(el('p','La distribución por código no está disponible.'));return;}
  codeHost.append(el('h3','Entradas, salidas y otras marcas del filtro'),el('p',s.profileSupported?'Estados declarados por el perfil del reloj; cada valor abre el circuito de trabajo correspondiente.':'Este modelo no tiene un perfil interpretado. Sus códigos se conservan sin clasificarlos como entradas o salidas.'));
  const cards=el('div',null,'ck-metrics');
  for(const [key,label,view]of [['entries','Entradas declaradas','workdays'],['exits','Salidas declaradas','workdays'],['extra','Marcas de tiempo extra','workdays'],['pauses','Marcas de pausa','records']]){const c=el('article');c.append(el('span',label),el('strong',s.profileSupported?num(s[key]):'No homologado'));const b=el('button',view==='workdays'?'Ver jornadas':'Ver marcas','ck-text');b.type='button';b.addEventListener('click',()=>selectTab(view,true));c.append(b);cards.append(c)}
  codeHost.append(cards,el('p',num(s.unknown)+' códigos sin interpretación. Se cuentan marcaciones, no jornadas u horas aprobadas.','ck-note'));
 }
 function charts(data){
  renderCodes(data);
  const hourly=Array.from({length:24},(_,hour)=>({hour,marks:data.hourly.find(x=>x.hour===hour)?.marks||0})),max=Math.max(1,...hourly.map(x=>x.marks));$('Hourly').replaceChildren();
  for(const v of hourly){const b=el('button',null,'ck-hour');b.type='button';b.title=`${String(v.hour).padStart(2,'0')}:00–${String(v.hour).padStart(2,'0')}:59 · ${num(v.marks)} marcaciones`;b.setAttribute('aria-label',b.title+'; abrir detalle');b.setAttribute('aria-pressed',String(state.hour===v.hour));const bar=el('span',null,'ck-bar');bar.style.setProperty('--bar-h',v.marks/max*100+'%');b.append(bar,el('small',v.hour%3===0?String(v.hour).padStart(2,'0'):''));b.addEventListener('click',()=>filterHour(v.hour));for(const event of ['focus','mouseenter'])b.addEventListener(event,()=>text('HourDetail',b.title));$('Hourly').append(b)}
  $('ClearHour').hidden=state.hour===null;$('DailyChart').replaceChildren();$('Days').replaceChildren();const dm=Math.max(1,...data.daily.map(x=>x.marks));
  data.daily.forEach((d,i)=>{const b=el('button');b.type='button';b.style.setProperty('--bar-h',d.marks/dm*85+'%');b.title=`${d.day} · ${num(d.marks)} marcas · ${num(d.people)} personas`;b.setAttribute('aria-label',b.title+'; abrir este día');if(data.daily.length<12)b.append(el('span',num(d.marks),'ck-day-value'));if(data.daily.length<15||i%Math.ceil(data.daily.length/8)===0)b.append(el('span',d.day.slice(5),'ck-day-label'));b.addEventListener('click',()=>{if(busy())return;state.from=state.to=d.day;state.hour=null;tab('records');load(true)});$('DailyChart').append(b);const tr=el('tr');cells(tr,[d.day,num(d.marks),num(d.people)]);$('Days').append(tr)});
  if(!data.daily.length)$('DailyChart').append(el('p','Sin eventos del filtro en esta captura.','ck-empty'));

 }
 function render(data){
  state.data=data;state.cut=data.dashboard.snapshotId;
  text('ExportStatus','');
  const s=data.summary,c=data.collection,p=data.pagination,device=data.dashboard.device,rate=percentage(s.mappedMarks,s.marks),continuous=data.dashboard.sourceMode==='continuous';
  text('Title',data.site?data.site.key.toUpperCase()+' · '+data.site.label:state.site.toUpperCase()+' · sin datos');
  text('Mode',c.status==='no_data'?'Datos no recibidos':continuous?'Histórico y recepciones confirmadas':c.status==='import_incomplete'?'Importación histórica incompleta':'Captura histórica');
  text('SourceKind',continuous?'Recepciones confirmadas + histórico':'Captura histórica');
  text('CapturedLabel',continuous?'Última captura completa conservada':'Descarga histórica del reloj');
  text('Device',device?[device.model,device.serial,device.firmware].filter(Boolean).join(' · '):'Sin metadatos de captura');
  $('Source').value=state.source;
  text('WorkdaysNote',continuous?'Abrí Jornadas y tiempos para revisar entradas, salidas y pausas del histórico y las recepciones completas. Los tiempos son referencias sin aprobación salarial.':data.dashboard.historicalSnapshotId?'Jornadas reconstruidas sobre la captura histórica seleccionada. Se conserva el punto y período de consulta. Sin liquidación automática.':'No hay una captura histórica disponible para este punto. Elegí «Histórico y recepciones confirmadas» para consultar las fichadas recibidas.');
  for(const [k,v]of Object.entries({Marks:s.marks,People:s.people,Linked:s.mappedMarks,Unlinked:s.unmappedMarks,Observed:s.observedRows,SourceRows:s.sourceRows}))text(k,num(v));text('LinkRate',rate===null?'—':new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(rate)+'%');$('LinkBar').style.width=(rate||0)+'%';
  for(const [k,v]of Object.entries({Captured:continuous?data.dashboard.telemetry.lastCompleteCaptureAt:c.capturedAt,Received:c.receivedAt,Latest:s.latestMarkAt,Checked:data.generatedAt}))text(k,date(v));
  const telemetry=data.dashboard.telemetry;
  text('Attempt',telemetry.lastAttemptAt?date(telemetry.lastAttemptAt):'No informado por el colector');
  text('Backlog',telemetry.backlog===null?'No informado por el colector':num(telemetry.backlog));
  text('Latency',telemetry.deliveryLatencySeconds===null?'Sin captura completa medible':num(telemetry.deliveryLatencySeconds)+' segundos');
  text('CaptureScope',continuous?'Capturas completas conservadas; esto no certifica cobertura del período.':'La recepción posterior puede consultarse en la fuente continua.');
  text('Scope',data.filters?`${data.filters.from} → ${data.filters.to}${state.hour!==null?' · '+String(state.hour).padStart(2,'0')+' h':''}${state.identity!=='all'?' · '+(state.identity==='mapped'?'vinculadas':'sin vincular'):''}${state.search?' · búsqueda activa':''}`:'Sin período disponible');if(data.filters){$('From').value=data.filters.from;$('To').value=data.filters.to}
  $('Site').replaceChildren();for(const site of data.sites){const o=el('option',site.key.toUpperCase()+' · '+site.label);o.value=site.key;$('Site').append(o)}if(!data.sites.some(s=>s.key===state.site)){const o=el('option',state.site.toUpperCase()+' · sin recepción');o.value=state.site;$('Site').append(o)}$('Site').value=state.site;
  $('Insights').replaceChildren();for(const item of insights(data)){const card=el('article',null,'ck-insight '+item.tone);card.append(el('strong',item.title),el('p',item.detail));if(item.action){const b=el('button','Ver detalle →','ck-text');b.type='button';b.addEventListener('click',()=>item.action==='unmapped'?unmapped():tab('issues',true));card.append(b)}$('Insights').append(card)}
  $('Rows').replaceChildren();for(const r of data.records){const tr=el('tr'),person=el('div'),declared=el('div'),details=el('details');person.append(el('span',r.personLabel,'ck-name'),el('small',r.legajo!=null?'Legajo '+r.legajo:r.identityState==='mapped'?'Vínculo laboral · datos reservados':'Sin contrato vinculado','ck-sub'));declared.append(el('span',referenceCode(r.punchCode,device?.model),'ck-badge slate'),el('small','Referencia SDK · no homologado','ck-sub'));details.append(el('summary','Ver códigos'),el('div',`Estado ${r.punchCode} · Método ${r.verificationCode} · Fila ${r.ordinal}`,'ck-code'),el('small',referenceMethod(r.verificationCode,device?.model),'ck-sub'),el('small',r.reviewState==='pending'?'Revisión laboral pendiente':'Revisión: '+r.reviewState,'ck-sub'));cells(tr,[date(r.occurredAt),person,declared,el('span',r.identityState==='mapped'?'Vinculada':'Por vincular','ck-badge '+(r.identityState==='mapped'?'':'amber')),details]);$('Rows').append(tr)}
  if(!data.records.length){const tr=el('tr'),td=el('td','No se recibieron fichadas para este filtro. No se infieren ausencias.','ck-empty');td.colSpan=5;tr.append(td);$('Rows').append(tr)}
  text('Page',`Página ${p.pages?p.page:0} de ${p.pages} · ${num(p.total)} fichadas del filtro`);$('Identity').value=state.identity;$('Search').placeholder=data.nominalReadAllowed?'Nombre o legajo en todo el período':'Tu perfil no habilita búsqueda nominal';text('Privacy',data.nominalReadAllowed?'Nombres y legajos según tu permiso. Se muestran segundos: dos marcas del mismo minuto no son necesariamente duplicadas.':'Vista seudonimizada. Sin nombres, DNI ni plantillas biométricas.');
  $('Issues').replaceChildren();const labels={year_context_review:'Año inconsistente con el contexto',future_timestamp:'Fecha posterior a la descarga',identity_format_review:'Identificador a revisar',identity_bytes_review:'Identificador original a revisar',timestamp_invalid:'Fecha inválida'};for(const issue of data.observations){const tr=el('tr');cells(tr,[issue.ordinal,issue.localTimestamp,issue.issues.map(x=>labels[x]||x).join(' · ')]);$('Issues').append(tr)}if(!data.observations.length){const tr=el('tr'),td=el('td','Sin observaciones en esta fuente.');td.colSpan=3;tr.append(td);$('Issues').append(tr)}charts(data);tab(state.tab);root.dataset.state='ready';document.dispatchEvent(new CustomEvent('mc:clock-data',{detail:data}));
 }
 function clearData(){
  document.dispatchEvent(new Event('mc:clock-cleared'));state.data=null;state.cut=null;codeHost.replaceChildren();absenceLink.hidden=true;absenceLink.removeAttribute('href');
  for(const k of ['Rows','Days','Issues','Hourly','DailyChart','Insights'])$(k).replaceChildren();
  for(const k of ['Marks','People','Linked','Unlinked','Observed','SourceRows','Page','LinkRate','Captured','Received','Latest','Device','Checked','Attempt','Backlog','Latency','CaptureScope'])text(k,'—');
  text('Mode','Sin confirmación actual');text('Privacy','');text('Scope','Consulta pendiente');
  $('LinkBar').style.width='0%';controls();
 }
 function params(extra={}){
  const q=new URLSearchParams({resource:'clock-dashboard',site:state.site,source:state.source,page:String(state.page),pageSize:String(state.size),search:state.search,identity:state.identity});
  const from=state.from||(state.cut?state.data?.filters.from:null),to=state.to||(state.cut?state.data?.filters.to:null);
  if(from&&to){q.set('from',from);q.set('to',to)}
  if(state.cut)q.set('snapshot',state.cut);if(state.hour!==null)q.set('hour',String(state.hour));
  for(const [k,v]of Object.entries(extra))if(v!=null)q.set(k,String(v));return q;
 }
 async function read(query,signal){
  const r=await fetch('/api/internal-attendance?'+query,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])});
  if(r.status===401||r.status===403){
   state.denied=true;clearInterval(state.timer);clearData();
   if(r.status===401)location.replace('login.html?next='+encodeURIComponent('relojes-marcaciones.html'));
   throw new Error('Acceso no disponible. Ingresá nuevamente con un perfil autorizado.');
  }
  let data;try{data=await r.json()}catch{throw new Error('Respuesta del servidor no disponible')}
  if(r.status===409)throw new Error('Cambió la fuente de marcaciones. Presioná Actualizar para consultar el nuevo corte.');
  if(!r.ok||data.ok!==true)throw new Error(data.error||'No se pudo consultar el tablero');
  if(data.version!=='clock-operations.v1'||data.dashboard?.version!=='clock-dashboard.v3'||data.dashboard.sourceMode!==query.get('source'))throw new Error('Este entorno todavía no tiene la consulta continua habilitada');
  if(query.has('snapshot')&&data.dashboard.snapshotId!==query.get('snapshot'))throw new Error('Cambió el corte de consulta. Actualizá antes de continuar.');
  return data;
 }
 async function load(reset=false){
  if(busy()||!state.started||state.denied)return;
  if(reset){state.page=1;state.cut=null}
  state.loading=true;const generation=++state.generation;state.controller=new AbortController();$('Error').hidden=true;controls();
  try{const data=await read(params(),state.controller.signal);if(generation===state.generation&&state.started)render(data)}
  catch(e){if(generation===state.generation&&state.started){clearData();text('Error',['AbortError','TimeoutError'].includes(e.name)?'La consulta demoró demasiado. Reintentá.':e.message);$('Error').hidden=false;root.dataset.state='error'}}
  finally{if(generation===state.generation){state.loading=false;controls()}}
 }
 function download(blob,name){const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 function exportPage(){if(busy()||!state.data?.records.length)return;const d=state.data;download(new Blob([recordCsv(d,d.records,'Página '+state.page)],{type:'text/csv;charset=utf-8'}),`marcaciones-${d.site.key}-${d.filters.from}-pagina-${state.page}.csv`)}
 async function exportAll(format){if(busy()||!state.data?.dashboard.snapshotId||!state.data.collection.importComplete)return;const first=state.data,total=first.pagination.total,generation=state.generation;if(total>25000){text('ExportStatus','El filtro supera 25.000 filas. Reducí el período para exportar.');return}state.exporting=true;state.exportController=new AbortController();const timer=setTimeout(()=>state.exportController?.abort(),180000),rows=[],seen=new Set(),query=params({from:first.filters.from,to:first.filters.to,pageSize:100,snapshot:first.dashboard.snapshotId});controls();
  try{for(let page=1;rows.length<total;page++){text('ExportStatus',`Preparando ${num(rows.length)} / ${num(total)} fichadas…`);query.set('page',String(page));const part=await read(query,state.exportController.signal);if(generation!==state.generation||!state.started)throw new Error('Cambió la sesión. No se generó el archivo.');verifyExport(first,part,page,seen);rows.push(...part.records)}if(rows.length!==total)throw new Error('No se pudo verificar la cantidad exportada');const filename=`marcaciones-${first.site.key}-${first.filters.from}-${first.filters.to}-filtro-completo.${format}`;const blob=format==='xlsx'?new Blob([createClockXlsx(first,rows)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}):new Blob([recordCsv(first,rows,'Filtro completo')],{type:'text/csv;charset=utf-8'});download(blob,filename);text('ExportStatus',`${num(total)} fichadas exportadas. Misma fuente, corte y filtros. Sin cálculo salarial.`)}catch(e){text('ExportStatus',['AbortError','TimeoutError'].includes(e.name)?'Exportación cancelada o demorada. No se generó un archivo parcial.':e.message)}finally{clearTimeout(timer);rows.length=0;seen.clear();state.exporting=false;state.exportController=null;controls()}}
 function unmapped(){if(busy())return;state.identity='unmapped';$('Identity').value='unmapped';tab('records');load(true)}
 function search(){if(busy())return;state.search=$('Search').value.trim();state.identity=$('Identity').value;load(true)}
 function autoRefresh(){
  if(document.hidden||!state.started||state.denied||state.page!==1||busy())return;
  // Preserve focus, unsent filters and an open evidence detail while reading.
  if(root.contains(document.activeElement)||root.querySelector('details[open]')||root.querySelector('#wdPersonScope:not([hidden])'))return;
  load(true);
 }
 function start(){if(state.started||state.denied)return;state.started=true;root.hidden=false;tab(state.tab);load(true);state.timer=setInterval(autoRefresh,60000)}
 function stop(){
  state.generation++;state.started=false;state.controller?.abort();state.exportController?.abort();clearInterval(state.timer);
  state.loading=false;state.search='';$('Search').value='';clearData();root.hidden=true;
 }
 $('Filter').addEventListener('submit',e=>{e.preventDefault();if(busy())return;state.site=$('Site').value;state.source=$('Source').value;state.from=$('From').value;state.to=$('To').value;state.hour=null;load(true)});
 $('Source').addEventListener('change',()=>{const source=$('Source').value;changeSource(source,source==='historical'?'workdays':'records')});
 $('Refresh').addEventListener('click',()=>load(true));$('LatestDay').addEventListener('click',()=>{if(busy())return;state.from=state.to='';state.hour=null;load(true)});
 root.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{if(busy()||!state.data?.filters)return;Object.assign(state,periodWindow(state.data.filters.to,Number(b.dataset.days)));state.hour=null;load(true)}));
 root.querySelectorAll('[data-clock-tab]').forEach(b=>{b.addEventListener('click',()=>selectTab(b.dataset.clockTab));b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const names=['workdays','overview','records','issues'],i=names.indexOf(state.tab);selectTab(e.key==='Home'?names[0]:e.key==='End'?names.at(-1):names[(i+(e.key==='ArrowRight'?1:names.length-1))%names.length],true)})});
 $('SeeUnlinked').addEventListener('click',unmapped);$('ClearHour').addEventListener('click',()=>{if(busy())return;state.hour=null;load(true)});$('SearchApply').addEventListener('click',search);$('Identity').addEventListener('change',search);$('Search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search()}});$('Previous').addEventListener('click',()=>{if(!busy()&&state.page>1){state.page--;load()}});$('Next').addEventListener('click',()=>{if(!busy()&&state.page<(state.data?.pagination.pages||0)){state.page++;load()}});$('Export').addEventListener('click',exportPage);$('ExportAll').addEventListener('click',()=>exportAll('csv'));$('ExportXlsx').addEventListener('click',()=>exportAll('xlsx'));$('CancelExport').addEventListener('click',()=>state.exportController?.abort());$('Print').addEventListener('click',()=>{if(!busy()&&state.data)window.print()});
 document.addEventListener('mc:attendance-ready',start);document.addEventListener('mc:attendance-site',e=>{const site=String(e.detail?.site||'').toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{1,95}$/.test(site)||busy())return;state.site=site;state.from=state.to=state.search='';state.identity='all';state.hour=null;$('Search').value='';tab('workdays');if(!state.started)start();else load(true);root.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){state.generation++;state.controller?.abort();state.exportController?.abort();state.loading=false;controls()}
  else autoRefresh();
 });
 document.getElementById('logoutButton')?.addEventListener('click',stop);window.addEventListener('pagehide',stop);
 window.addEventListener('pageshow',e=>{if(e.persisted)start()});
 if(document.getElementById('appShell')?.hidden===false)start();
}
