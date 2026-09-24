import {normalizeBatchQuery,verifyBatchPreview} from './payroll-document-batch-model.js';
import {payrollSourceReport,sourceReportTypeLabel} from './payroll-source-report-model.js';
import {openPayrollDetail} from './payroll-detail-panel.js';
export async function readPayrollBatch(url,{signal}={}){
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)});
 if(!response.ok)throw Object.assign(Error([401,403].includes(response.status)?'Tu sesión no habilita esta consulta.':'No se pudo completar la lectura. Reintentá la selección.'),{status:response.status});
 if(!response.headers.get('content-type')?.includes('application/json')||!response.headers.get('cache-control')?.includes('no-store'))throw Error('La respuesta no pudo verificarse.');
 const reader=response.body.getReader(),parts=[];let size=0,complete=false;
 try{for(;;){const r=await reader.read();if(r.done){complete=true;break;}size+=r.value.length;if(size>4*1024*1024)throw Error('Respuesta fuera del límite de consulta.');parts.push(r.value);}}finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
 const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(body.ok!==true)throw Error('La respuesta no confirmó la lectura.');return body;
}
export function mountPayrollDocumentBatch(host,{request=readPayrollBatch}={}){
 host.classList.add('pdb');const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const title=make('header',undefined,'pdb-heading');title.append(make('p','NÓMINA · SELECCIÓN DOCUMENTAL','pdb-eyebrow'),make('h2','Documentos por rango de legajos'),make('p','Elegí una liquidación y acotá la población antes de abrir sus conceptos. Los rangos se aplican a todo el conjunto, no sólo a la página visible.'));host.append(title);
 const scope=make('div',undefined,'pdb-note');scope.append(make('strong','Documentos informativos, todavía no emisión de recibos'),make('p','El detalle y su PDF conservan la fuente original. Fecha de pago no informada; firma digital no aplicada. La descarga propia de cada agente sigue siendo un circuito separado.'));host.append(scope);
 const catalogBox=make('section',undefined,'pdb-box');catalogBox.append(make('h3','1 · Elegí la liquidación'));const load=make('button','Consultar liquidaciones','pdb-primary');load.type='button';catalogBox.append(load);const selection=make('label','Liquidación a consultar'),dataset=make('select');dataset.setAttribute('aria-label','Liquidación documental');dataset.append(new Option('Consultá las liquidaciones disponibles',''));selection.append(dataset);catalogBox.append(selection);host.append(catalogBox);
 const form=make('form',undefined,'pdb-box');form.append(make('h3','2 · Definí el alcance'));const grid=make('div',undefined,'pdb-filters'),inputs={};
 for(const [key,label]of [['fromNumber','Desde legajo'],['toNumber','Hasta legajo'],['fromSector','Desde repartición al corte'],['toSector','Hasta repartición al corte']]){const wrap=make('label',label),input=make('input');input.type='text';input.inputMode='numeric';input.pattern='[0-9]{0,12}';input.maxLength=12;input.autocomplete='off';input.name=key;wrap.append(input);grid.append(wrap);inputs[key]=input;}
 form.append(grid,make('p','Los límites son inclusivos. Dejá ambos vacíos para incluir todo. Repartición = sector registrado en el padrón certificado; no es la asignación histórica de la liquidación.','pdb-hint'));
 const tools=make('div',undefined,'pdb-tools'),apply=make('button','Aplicar selección','pdb-primary'),reset=make('button','Limpiar rangos'),cancel=make('button','Cancelar consulta');apply.type='submit';reset.type=cancel.type='button';tools.append(apply,reset,cancel);form.append(tools);host.append(form);
 const status=make('p','Esperando autorización para consultar.','pdb-status');status.setAttribute('role','status');status.dataset.batchStatus='';host.append(status);
 const results=make('section',undefined,'pdb-results'),detailHost=make('section',undefined,'pdb-detail');results.hidden=true;host.append(results,detailHost);
 let granted=false,active=true,busy=false,catalog=null,model=null,applied=null,revision=0,controller=null;
 const canRead=()=>active&&granted&&host.isConnected&&!host.closest('[hidden]');
 const clearDetail=()=>detailHost.replaceChildren();
 async function scopedRequest(url,options){const epoch=revision;try{return await request(url,options);}catch(e){if(epoch===revision&&[401,403].includes(e.status)){granted=false;catalog=null;clear('Tu sesión no habilita esta consulta. Volvé a verificar el acceso.');}throw e;}}
 function controls(){load.disabled=busy||!granted;dataset.disabled=busy||!catalog;apply.disabled=busy||!dataset.value||!granted;reset.disabled=busy;cancel.hidden=!busy;host.setAttribute('aria-busy',String(busy));}
 function clear(message='La selección se retiró. Aplicá los filtros nuevamente.'){revision++;controller?.abort();controller=null;busy=false;model=null;results.replaceChildren();results.hidden=true;clearDetail();status.textContent=message;controls();}
 async function run(task){if(busy||!canRead())return;const seq=++revision;controller=new AbortController();const signal=controller.signal;busy=true;controls();
  const current=()=>seq===revision&&canRead()&&!signal.aborted;
  try{await task(signal,current);}catch(e){if(seq===revision){if([401,403].includes(e.status)){granted=false;catalog=null;dataset.replaceChildren(new Option('Verificá tu sesión para continuar',''));}clear(e.name==='AbortError'||e.name==='TimeoutError'?'Consulta interrumpida. Podés reintentar sin cambiar los rangos.':e.message||'No se pudo consultar.');}}
  finally{if(seq===revision){busy=false;controller=null;controls();}}
 }
 function render(){if(!model||!canRead())return;results.replaceChildren();results.hidden=false;clearDetail();const d=model,epoch=revision;
  const head=make('header',undefined,'pdb-result-heading');head.append(make('h3','3 · Revisá la población seleccionada'),make('span',d.dataset.closureStatus==='closed'?'Cierre informado':d.dataset.closureStatus==='open'?'Liquidación abierta':'Cierre no informado','pdb-badge'));results.append(head);
  const cards=make('div',undefined,'pdb-counts');for(const [value,label]of [[d.counts.selected,'Legajos del filtro'],[d.counts.eligible,'Con vínculo único'],[d.counts.review,'Vínculos por revisar']]){const card=make('article');card.append(make('strong',String(value)),make('span',label));cards.append(card);}results.append(cards);
  results.append(make('p',`Período de origen: ${d.dataset.period}-${String(d.dataset.month).padStart(2,'0')} · Tipo: ${sourceReportTypeLabel(d.dataset.type)} · Fecha de liquidación: ${d.dataset.date}`,'pdb-context'),make('p',`Reparticiones del padrón al ${new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Mendoza',dateStyle:'short',timeStyle:'medium',hourCycle:'h23'}).format(new Date(d.directory.cutoff))} (hora de Mendoza). ${d.counts.unclassifiedSector} referencias del conjunto sin código numérico de repartición; no se incluyen al aplicar un rango de reparticiones.`,'pdb-hint'));
  const chart=make('details',undefined,'pdb-grouping');chart.append(make('summary','Distribución de toda la selección por repartición'));const list=make('div',undefined,'pdb-bars');
  const max=Math.max(1,...d.groups.map(g=>g.selected));for(const g of d.groups){const row=make('div',undefined,'pdb-bar'),label=make('span',`${g.code??'Sin código'} · ${g.label}`),track=make('span',undefined,'pdb-track'),bar=make('i');bar.style.width=(g.selected/max*100)+'%';track.append(bar);row.append(label,track,make('strong',String(g.selected)));list.append(row);}chart.append(make('p','Totales completos, no sólo los 25 registros de esta página.'),list);results.append(chart);
  const navigation=make('div',undefined,'pdb-pager'),previous=make('button','Página anterior'),next=make('button','Página siguiente');previous.type=next.type='button';previous.disabled=d.pagination.page===1;next.disabled=d.pagination.page===d.pagination.pages;previous.onclick=()=>query(d.pagination.page-1,true);next.onclick=()=>query(d.pagination.page+1,true);
  navigation.append(previous,make('span',`Página ${d.pagination.page} de ${d.pagination.pages} · ${d.pagination.total} legajos`),next);results.append(navigation);
  const wrap=make('div',undefined,'pdb-table-scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Población documental del filtro');const table=make('table'),thead=make('thead'),tr=make('tr');for(const title of ['Legajo','Agente al corte','Repartición al corte','Control','Documento']){const th=make('th',title);th.scope='col';tr.append(th);}thead.append(tr);table.append(thead);const rows=make('tbody');rows.dataset.batchRows='';
  for(const person of d.rows){const row=make('tr');row.append(make('td',person.number),make('td',person.name?.trim()?person.name:'Nombre no informado'),make('td',person.sectorCode?`${person.sectorCode} · ${person.sectorLabel??'Sin denominación'}`:'No informada'),make('td',({ready:'Vínculo único',unmapped:'Sin vínculo en este corte',ambiguous:'Más de un vínculo: revisar',identity_incomplete:'Identidad incompleta'})[person.state]));const action=make('td');
   if(person.state==='ready'){const open=make('button','Abrir conceptos y PDF');open.type='button';open.setAttribute('aria-label','Abrir conceptos del legajo '+person.number);open.onclick=async()=>{if(epoch!==revision||!canRead())return;clearDetail();open.disabled=true;try{await openPayrollDetail({host:detailHost,employee:{contractId:person.contractId,name:person.name,legajo:person.number},item:{datasetId:d.dataset.id,payrollDate:d.dataset.date,payrollType:d.dataset.type,sourcePeriod:d.dataset.period,sourceMonth:d.dataset.month},request:scopedRequest,canRead:()=>epoch===revision&&canRead(),onClose:()=>{if(open.isConnected)open.focus({preventScroll:true});}});}finally{if(open.isConnected)open.disabled=false;}};action.append(open);}else action.append(make('span','Revisar identificación antes de abrir'));row.append(action);rows.append(row);}
  if(!d.rows.length){const cell=make('td','No hay coincidencias con estos rangos. No indica que falten todos los datos del sistema.');cell.colSpan=5;const row=make('tr');row.append(cell);rows.append(row);}table.append(rows);wrap.append(table);results.append(wrap);
  const provenance=make('details',undefined,'pdb-evidence');provenance.append(make('summary','Referencia de lectura y límites'),make('p','Selección: '+d.selectionHash),make('p','Conjunto de nómina: '+d.dataset.id),make('p','Fuente: '+d.dataset.sourceHash),make('p','Pago: no informado. Firma digital: no aplicada. No se emiten ni publican recibos desde esta selección.'));results.append(provenance);
 }
 async function query(page=1,pinned=false){
  if(!applied)return;
  const expected=pinned?model?.selectionHash:null;
  await run(async(signal,current)=>{
   clearDetail();results.hidden=true;results.replaceChildren();
   status.textContent='Consultando el conjunto completo y sus rangos…';
   const params=new URLSearchParams({...applied,resource:'payrolldocumentbatch',page:String(page),limit:'25',...(expected?{selectionHash:expected}:{})});
   const payload=await scopedRequest('/api/internal-data?'+params,{signal});
   if(!current())return;
   const d=verifyBatchPreview(payload.data);
   if(d.dataset.id!==applied.datasetId||expected&&d.selectionHash!==expected||Object.keys(d.filters).some(k=>d.filters[k]!==applied[k]))throw Error('La fuente o los filtros cambiaron. Aplicá otra vez la selección.');
   const chosen=catalog?.items.find(item=>item.datasetId===d.dataset.id);
   if(!chosen||chosen.payloadHash!==d.dataset.payloadHash||chosen.date!==d.dataset.date||chosen.type!==d.dataset.type||chosen.statementCount!==d.counts.dataset||chosen.closureStatus!==d.dataset.closureStatus)throw Error('El catálogo y el detalle ya no coinciden. Consultá las liquidaciones otra vez.');
   model=d;render();
   status.textContent=`Selección verificada: ${d.counts.selected} de ${d.counts.dataset} legajos. No se modificaron datos.`;
  });
 }
 load.onclick=()=>run(async(signal,current)=>{
  clearDetail();model=null;results.hidden=true;results.replaceChildren();
  status.textContent='Consultando las liquidaciones disponibles…';
  const payload=await scopedRequest('/api/internal-data?resource=payrollsourcereport',{signal});
  if(!current())return;
  const c=payrollSourceReport(payload.data);
  if(c.mode!=='catalog')throw Error('No se pudo verificar el catálogo.');
  catalog=c;dataset.replaceChildren(new Option('Elegí fecha y tipo de liquidación',''));
  for(const item of c.items){
   const text=`${item.date} · ${sourceReportTypeLabel(item.type)} · ${item.statementCount} legajos · ${item.datasetId.slice(0,8)}`;
   dataset.append(new Option(text,item.datasetId));
  }
  status.textContent=`${c.items.length} liquidaciones disponibles.${c.truncated?' El catálogo tiene un límite; no representa todo el archivo.':''} Elegí una corrida concreta, no una suma del mes.`;
 });
 form.onsubmit=e=>{
  e.preventDefault();
  const q={datasetId:dataset.value,...Object.fromEntries(Object.entries(inputs).map(([k,input])=>[k,input.value.trim()]))};
  try{normalizeBatchQuery(q);}catch{status.textContent='Rangos inválidos: usá códigos numéricos y verificá que Desde no supere Hasta.';return;}
  applied=q;query();
 };
 dataset.onchange=()=>{applied=null;clear('Liquidación seleccionada. Definí los rangos y aplicá la consulta.');};
 for(const input of Object.values(inputs))input.addEventListener('input',()=>{applied=null;clear('Rangos modificados. Aplicá la selección nuevamente.');});
 reset.onclick=()=>{for(const input of Object.values(inputs))input.value='';applied=null;clear('Rangos limpios. Aplicá para incluir toda la liquidación.');};
 cancel.onclick=()=>clear('Consulta cancelada. No se conservaron resultados parciales.');
 function permissions(detail){
  const caps=detail?.tenantCapabilities instanceof Set?detail.tenantCapabilities:new Set(detail?.tenantCapabilities??[]);
  granted=['payroll.read','workforce.employee.read'].every(c=>caps.has(c));
  clear(granted?'Consulta autorizada. Elegí una liquidación.':'Se requieren permisos de nómina y legajos.');
  if(!granted){catalog=null;dataset.replaceChildren(new Option('Verificá tus permisos',''));}
 }
 const changed=e=>permissions(e.detail);
 document.addEventListener('municontrol:capabilities-ready',changed);
 const authorization=window.MuniControlCapabilityGate?.ready??request('/api/internal-auth').then(p=>{if(p.authenticated!==true)throw Error('Sesión no válida');return p.access;});
 Promise.resolve(authorization).then(p=>{if(active)permissions(p);}).catch(()=>{if(active)permissions(null);});
 const hidden=()=>{if(document.hidden)clear('Aplicá nuevamente la selección al volver.');};
 const exit=()=>{clear();active=false;};
 const resume=e=>{if(e.persisted)location.reload();};
 document.addEventListener('visibilitychange',hidden);
 window.addEventListener('pagehide',exit);window.addEventListener('pageshow',resume);
 controls();
 return {clear,destroy(){
  exit();document.removeEventListener('municontrol:capabilities-ready',changed);
  document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',exit);
  window.removeEventListener('pageshow',resume);host.replaceChildren();
 }};
}
