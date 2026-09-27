// Módulo 10: el nombre y cargo provienen del PDF local; la consulta de nómina aporta sólo presencia por legajo, nunca importes.
import {BUDGET_MATCH_STATES,compareBudgetPopulation,verifyBudgetPayrollRoster,budgetComparisonDocument,budgetComparisonDetailDocument} from './budget-payroll-model.js';
import {payrollSourceReport,sourceReportTypeLabel} from './payroll-source-report-model.js';
import {saveReport} from './report-document.js';
const REQUIRED=['workforce.structure.read','workforce.employee.read','payroll.read'];
async function read(resource,datasetId,signal){
 const q=new URLSearchParams({resource});if(datasetId)q.set('datasetId',datasetId);
 const bounded=AbortSignal.any([signal,AbortSignal.timeout(20000)]),r=await fetch('/api/internal-data?'+q,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:bounded});
 if([401,403].includes(r.status))throw Error('BUDGET_ACCESS');
 if(!r.ok||!r.headers.get('content-type')?.includes('application/json')||!r.headers.get('cache-control')?.includes('no-store'))throw Error('BUDGET_READ');
 const text=await r.text();if(text.length>512*1024)throw Error('BUDGET_LIMIT');const payload=JSON.parse(text);if(payload.ok!==true)throw Error('BUDGET_READ');return payload.data;
}
export function mountBudgetPayroll(host,{authorize,request=read,save=saveReport}={}){
 let source=null,catalog=null,roster=null,model=null,generation=0,controller=null,loading=false,disposed=false,detailQuery='',detailMode='all';
 const add=(p,tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);p.append(n);return n;};
 host.classList.add('bp-workbench');host.hidden=true;add(host,'h3','Cotejar estructura con una liquidación');
 const note=add(host,'p','Control nominal del Módulo 10: conserva cargo, Cant, legajo y nombre del PDF presupuestario y los confronta con una corrida concreta. La nómina sólo confirma presencia por legajo; no inventa un cargo liquidado que la fuente no informa.');note.className='bs-note';
 const controls=add(host,'div');controls.className='bs-controls';const load=add(controls,'button','Consultar liquidaciones');load.type='button';
 const label=add(controls,'label','Corrida concreta'),select=add(label,'select');select.setAttribute('aria-label','Corrida a cotejar');select.append(new Option('Sin consulta de liquidaciones',''));
 const compare=add(controls,'button','Cotejar documento completo');compare.type='button';const cancel=add(controls,'button','Cancelar cotejo');cancel.type='button';
 const status=add(host,'p','Seleccioná primero el reporte PDF.');status.setAttribute('role','status');status.dataset.budgetPayrollStatus='';
 const policyLabel=add(host,'label','Coincidencia de legajos'),policy=add(policyLabel,'select');policy.setAttribute('aria-label','Coincidencia de legajos');policy.append(new Option('Texto exacto (respeta ceros)','literal'),new Option('Número equivalente (conserva originales)','numeric'));
 const detailTools=add(host,'div');detailTools.className='bs-controls';detailTools.hidden=true;
 const detailSearchLabel=add(detailTools,'label','Buscar en ocupantes'),detailSearch=add(detailSearchLabel,'input');detailSearch.type='search';detailSearch.maxLength=120;detailSearch.placeholder='Cargo, legajo o nombre';detailSearch.setAttribute('aria-label','Buscar en ocupantes');
 const detailModeLabel=add(detailTools,'label','Detalle a mostrar'),detailSelect=add(detailModeLabel,'select');detailSelect.setAttribute('aria-label','Detalle a mostrar');detailSelect.append(new Option('Todos los ocupantes','all'),new Option('Sólo diferencias','differences'));
 const exports=add(host,'div');exports.className='bs-controls';
 const pdf=add(exports,'button','PDF resumen'),csv=add(exports,'button','CSV resumen'),detailPdf=add(exports,'button','PDF detalle nominal'),detailCsv=add(exports,'button','CSV detalle nominal');for(const b of [pdf,csv,detailPdf,detailCsv])b.type='button';
 const results=add(host,'div');results.dataset.budgetComparison='';
 function state(){load.disabled=loading||!source;select.disabled=loading||!catalog;compare.disabled=loading||!source||!select.value;cancel.hidden=!loading;policy.disabled=loading||!roster;policyLabel.hidden=!roster;detailSearch.disabled=detailSelect.disabled=loading||!model;detailTools.hidden=!model;for(const b of [pdf,csv,detailPdf,detailCsv])b.disabled=loading||!model;exports.hidden=!model;host.setAttribute('aria-busy',String(loading));}
 function reset(message='Cotejo retirado. Podés consultar nuevamente.'){generation++;controller?.abort();controller=null;loading=false;roster=model=null;detailQuery='';detailMode='all';detailSearch.value='';detailSelect.value='all';results.replaceChildren();status.textContent=message;state();}
 function clear(){reset();source=catalog=null;select.replaceChildren(new Option('Sin consulta de liquidaciones',''));policy.value='literal';host.hidden=true;state();}
 async function access(signal){const s=await authorize(signal);if(!REQUIRED.every(c=>s.access?.tenantCapabilities?.includes(c)))throw Error('BUDGET_ACCESS');return s;}
 function pinned(d){const chosen=catalog?.items.find(x=>x.datasetId===select.value);return chosen&&d.datasetId===chosen.datasetId&&d.date===chosen.date&&d.type===chosen.type&&d.payloadHash===chosen.payloadHash&&d.total===chosen.statementCount&&d.closureStatus===chosen.closureStatus;}
 async function execute(action){
  if(loading||!source||disposed)return;const token=++generation,c=new AbortController();controller=c;loading=true;state();const current=()=>generation===token&&!c.signal.aborted&&!disposed;
  try{await action(c.signal,current);}catch(e){if(current())reset(e.message==='BUDGET_ACCESS'?'No hay permiso vigente para cotejar nómina. Se retiró el cotejo.':e.message==='BUDGET_CHANGED'?'La corrida cambió. Consultá nuevamente; no se generó un archivo parcial.':'No se pudo verificar el cotejo. Podés reintentar sin volver a abrir el PDF.');}
  finally{if(current()){controller=null;loading=false;state();}}
 }
 function draw(){
  results.replaceChildren();if(!model)return;const totals=add(results,'div');totals.className='bs-metrics';
  for(const [key,title]of [['present','En documento y corrida'],['document_only','Sólo en documento'],['payroll_only','Sólo en corrida'],['ambiguous','Referencias repetidas']]){const card=add(totals,'div');add(card,'strong',model.counts[key]);add(card,'span',title);}
  const details=add(results,'p','Documento: '+model.document.issuedAt+' · Corrida: '+model.payroll.date+' · '+sourceReportTypeLabel(model.payroll.type)+' · '+({closed:'Cierre informado',open:'Abierta',unknown:'Cierre no informado'})[model.payroll.closureStatus]+'. La nómina confirma presencia por legajo; no informa qué cargo presupuestario se liquidó.');details.className='bs-note';
  if(model.counts.document_only||model.counts.payroll_only||model.counts.ambiguous){const alert=add(results,'p',model.counts.document_only+' ocupantes del PDF no aparecen en la corrida · '+model.counts.payroll_only+' legajos de la corrida no aparecen en ningún cargo del PDF · '+model.counts.ambiguous+' referencias repetidas.','bs-attention');alert.dataset.budgetDifferences='';}
  const view=budgetComparisonDocument(model),wrap=add(results,'div');wrap.className='bp-table-scroll';const table=add(wrap,'table'),head=add(add(table,'thead'),'tr');view.columns.forEach(c=>add(head,'th',c.label).scope='col');const body=add(table,'tbody');
  const pageSize=20,totalPages=Math.max(1,Math.ceil(view.rows.length/pageSize));let page=1;
  const pager=add(results,'div');pager.className='bs-pager';const previous=add(pager,'button','Cargos anteriores'),position=add(pager,'span'),next=add(pager,'button','Cargos siguientes');previous.type=next.type='button';
  function rows(){body.replaceChildren();view.rows.slice((page-1)*pageSize,page*pageSize).forEach(row=>{const tr=add(body,'tr');row.forEach(value=>add(tr,'td',value));});position.textContent='Página '+page+' de '+totalPages+' · '+view.rows.length+' estructuras';previous.disabled=page===1;next.disabled=page===totalPages;}
  previous.onclick=()=>{page--;rows();};next.onclick=()=>{page++;rows();};rows();
  add(results,'p','Resumen por cargo. “Cant” es el valor del PDF; no se convierte en cupo aprobado por inferencia. Las referencias repetidas no se asignan automáticamente.').className='bs-note';
  const detail=budgetComparisonDetailDocument(model,{differencesOnly:detailMode==='differences',query:detailQuery});
  const title=add(results,'h4','Ocupantes presupuestarios y presencia en la corrida');title.className='bp-detail-title';
  const detailNote=add(results,'p',(detailMode==='differences'?'Mostrando sólo referencias a revisar. ':'Mostrando todos los ocupantes del PDF y los legajos sólo presentes en la corrida. ')+detail.rows.length+' filas del filtro.');detailNote.className='bs-note';detailNote.dataset.budgetDetailCount='';
  const detailWrap=add(results,'div');detailWrap.className='bp-table-scroll bp-detail-scroll';const detailTable=add(detailWrap,'table');detailTable.dataset.budgetDetailTable='';
  const detailHead=add(add(detailTable,'thead'),'tr');detail.columns.forEach(c=>add(detailHead,'th',c.label).scope='col');const detailBody=add(detailTable,'tbody');
  const detailPageSize=50,detailPages=Math.max(1,Math.ceil(detail.rows.length/detailPageSize));let detailPage=1;
  const detailPager=add(results,'div');detailPager.className='bs-pager';const detailPrevious=add(detailPager,'button','Ocupantes anteriores'),detailPosition=add(detailPager,'span'),detailNext=add(detailPager,'button','Ocupantes siguientes');detailPrevious.type=detailNext.type='button';
  function detailRows(){detailBody.replaceChildren();const slice=detail.rows.slice((detailPage-1)*detailPageSize,detailPage*detailPageSize);for(const row of slice){const tr=add(detailBody,'tr');const key=Object.entries(BUDGET_MATCH_STATES).find(([,label])=>label===row[5])?.[0]??'unknown';tr.dataset.matchState=key;row.forEach(value=>add(tr,'td',value));}if(!slice.length){const td=add(add(detailBody,'tr'),'td','Sin filas que coincidan con este filtro.');td.colSpan=detail.columns.length;}detailPosition.textContent='Página '+detailPage+' de '+detailPages+' · '+detail.rows.length+' filas';detailPrevious.disabled=detailPage===1;detailNext.disabled=detailPage===detailPages;}
  detailPrevious.onclick=()=>{detailPage--;detailRows();};detailNext.onclick=()=>{detailPage++;detailRows();};detailRows();
  add(results,'p','El nombre y el cargo pertenecen al documento presupuestario local. El cotejo de nómina no expone nombres, DNI, CUIL ni importes. Un legajo presente en ambas fuentes no demuestra por sí solo que se haya liquidado con ese cargo.').className='bs-note';
  state();
 }
 load.onclick=()=>execute(async(signal,current)=>{
  const before=await access(signal);const value=payrollSourceReport(await request('budgetpayrollcatalog',null,signal));const after=await access(signal);
  if(!current())return;if(value.mode!=='catalog'||before.user.id!==after.user.id||before.access.tenant.id!==after.access.tenant.id)throw Error('BUDGET_CHANGED');
  roster=model=null;results.replaceChildren();catalog=value;select.replaceChildren(new Option('Elegí una liquidación',''));
  value.items.forEach(item=>{select.append(new Option(item.date+' · '+sourceReportTypeLabel(item.type)+' · '+item.statementCount+' legajos · '+item.datasetId.slice(0,8),item.datasetId));});
  status.textContent=value.items.length+' liquidaciones disponibles en esta consulta.'+(value.truncated?' Catálogo limitado: no representa todo el histórico.':'')+' Elegí una corrida; no se suma el mes completo.';
 });
 select.onchange=()=>reset('Corrida seleccionada. Presioná Cotejar documento completo.');
 compare.onclick=()=>execute(async(signal,current)=>{
  const s=await access(signal),d=verifyBudgetPayrollRoster(await request('budgetpayrollroster',select.value,signal));await access(signal);if(!current())return;
  if(d.tenantId!==s.access.tenant.id||!pinned(d))throw Error('BUDGET_CHANGED');roster=d;model=compareBudgetPopulation(source,d,{keyMode:policy.value});draw();status.textContent='Cotejo completo. No se modificaron cargos, legajos ni liquidaciones.';
 });
 policy.onchange=()=>{if(roster&&!loading){model=compareBudgetPopulation(source,roster,{keyMode:policy.value});draw();status.textContent=policy.value==='numeric'?'Se eligió comparación numérica. Los ceros se conservan en el original y las colisiones quedan sin resolver.':'Se compara el texto exacto del número, incluidos sus ceros iniciales.';}};
 detailSearch.oninput=()=>{detailQuery=detailSearch.value;draw();};
 detailSelect.onchange=()=>{detailMode=detailSelect.value;draw();};
 function exportResult(format,{detail=false}={}){const previous=roster,snapshot=model,query=detailQuery,mode=detailMode;if(!previous||!snapshot)return;return execute(async(signal,current)=>{
  const s=await access(signal),fresh=verifyBudgetPayrollRoster(await request('budgetpayrollroster',previous.datasetId,signal));await access(signal);if(!current())return;
  if(fresh.tenantId!==s.access.tenant.id||JSON.stringify(fresh)!==JSON.stringify(previous)||model!==snapshot||detail&& (detailQuery!==query||detailMode!==mode))throw Error('BUDGET_CHANGED');
  save(detail?budgetComparisonDetailDocument(snapshot,{differencesOnly:mode==='differences',query}):budgetComparisonDocument(snapshot),format);
  status.textContent=detail?'Detalle nominal del Módulo 10 exportado y reautorizado. Los nombres provienen del PDF local; no se modificó la nómina.':'Resumen del cotejo exportado completo y reautorizado. No es una aprobación presupuestaria ni un recibo firmado.';
 });}
 pdf.onclick=()=>exportResult('pdf');csv.onclick=()=>exportResult('csv');detailPdf.onclick=()=>exportResult('pdf',{detail:true});detailCsv.onclick=()=>exportResult('csv',{detail:true});cancel.onclick=()=>reset('Cotejo cancelado. No se conservó un resultado parcial.');
 const onHidden=()=>{if(document.hidden)reset('Al volver, cotejá nuevamente para obtener una lectura autorizada.');};document.addEventListener('visibilitychange',onHidden);
 const onCapability=()=>reset('Cambió el contexto de acceso. Consultá nuevamente.');document.addEventListener('municontrol:capabilities-ready',onCapability);
 state();return{setSource(value){clear();source=value;host.hidden=!value;status.textContent='Reporte listo. Consultá una liquidación para cotejar sus legajos.';state();},clear,destroy(){clear();disposed=true;document.removeEventListener('visibilitychange',onHidden);document.removeEventListener('municontrol:capabilities-ready',onCapability);host.replaceChildren();}};
}
