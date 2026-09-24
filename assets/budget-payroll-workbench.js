// Aggregate comparison only. This workspace never renders a new list of people or payroll amounts.
import {compareBudgetPopulation,verifyBudgetPayrollRoster,budgetComparisonDocument} from './budget-payroll-model.js';
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
 let source=null,catalog=null,roster=null,model=null,generation=0,controller=null,loading=false,disposed=false;
 const add=(p,tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);p.append(n);return n;};
 host.classList.add('bp-workbench');host.hidden=true;add(host,'h3','Cotejar estructura con una liquidación');
 const note=add(host,'p','Cotejo agregado de legajos presentes, no aprobación del cargo liquidado ni del cupo anual. El PDF no sale del navegador. Se compara el documento completo.');note.className='bs-note';
 const controls=add(host,'div');controls.className='bs-controls';const load=add(controls,'button','Consultar liquidaciones');load.type='button';
 const label=add(controls,'label','Corrida concreta'),select=add(label,'select');select.setAttribute('aria-label','Corrida a cotejar');select.append(new Option('Sin consulta de liquidaciones',''));
 const compare=add(controls,'button','Cotejar documento completo');compare.type='button';const cancel=add(controls,'button','Cancelar cotejo');cancel.type='button';
 const status=add(host,'p','Seleccioná primero el reporte PDF.');status.setAttribute('role','status');status.dataset.budgetPayrollStatus='';
 const policyLabel=add(host,'label','Coincidencia de legajos'),policy=add(policyLabel,'select');policy.setAttribute('aria-label','Coincidencia de legajos');policy.append(new Option('Texto exacto (respeta ceros)','literal'),new Option('Número equivalente (conserva originales)','numeric'));
 const exports=add(host,'div');exports.className='bs-controls';const pdf=add(exports,'button','PDF del cotejo agregado'),csv=add(exports,'button','CSV del cotejo agregado');pdf.type=csv.type='button';
 const results=add(host,'div');results.dataset.budgetComparison='';
 function state(){load.disabled=loading||!source;select.disabled=loading||!catalog;compare.disabled=loading||!source||!select.value;cancel.hidden=!loading;policy.disabled=loading||!roster;policyLabel.hidden=!roster;pdf.disabled=csv.disabled=loading||!model;exports.hidden=!model;host.setAttribute('aria-busy',String(loading));}
 function reset(message='Cotejo retirado. Podés consultar nuevamente.'){generation++;controller?.abort();controller=null;loading=false;roster=model=null;results.replaceChildren();status.textContent=message;state();}
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
  const details=add(results,'p','Documento: '+model.document.issuedAt+' · Corrida: '+model.payroll.date+' · '+sourceReportTypeLabel(model.payroll.type)+' · '+({closed:'Cierre informado',open:'Abierta',unknown:'Cierre no informado'})[model.payroll.closureStatus]+'. No acredita pago, cupo aprobado ni vigencia individual.');details.className='bs-note';
  const view=budgetComparisonDocument(model),wrap=add(results,'div');wrap.className='bp-table-scroll';const table=add(wrap,'table'),head=add(add(table,'thead'),'tr');view.columns.forEach(c=>add(head,'th',c.label).scope='col');const body=add(table,'tbody');
  const pageSize=20,totalPages=Math.max(1,Math.ceil(view.rows.length/pageSize));let page=1;
  const pager=add(results,'div');pager.className='bs-pager';const previous=add(pager,'button','Cargos anteriores'),position=add(pager,'span'),next=add(pager,'button','Cargos siguientes');previous.type=next.type='button';
  function rows(){body.replaceChildren();view.rows.slice((page-1)*pageSize,page*pageSize).forEach(row=>{const tr=add(body,'tr');row.forEach(value=>add(tr,'td',value));});position.textContent='Página '+page+' de '+totalPages+' · '+view.rows.length+' estructuras';previous.disabled=page===1;next.disabled=page===totalPages;}
  previous.onclick=()=>{page--;rows();};next.onclick=()=>{page++;rows();};rows();
  add(results,'p','La tabla muestra hasta 20 estructuras por página; las descargas incluyen todas. Las referencias repetidas no se asignan automáticamente a un cargo.').className='bs-note';
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
 function exportResult(format){const previous=roster,snapshot=model;if(!previous||!snapshot)return;return execute(async(signal,current)=>{
  const s=await access(signal),fresh=verifyBudgetPayrollRoster(await request('budgetpayrollroster',previous.datasetId,signal));await access(signal);if(!current())return;
  if(fresh.tenantId!==s.access.tenant.id||JSON.stringify(fresh)!==JSON.stringify(previous)||model!==snapshot)throw Error('BUDGET_CHANGED');save(budgetComparisonDocument(snapshot),format);status.textContent='Cotejo agregado exportado completo y reautorizado. No es una aprobación presupuestaria ni un recibo firmado.';
 });}
 pdf.onclick=()=>exportResult('pdf');csv.onclick=()=>exportResult('csv');cancel.onclick=()=>reset('Cotejo cancelado. No se conservó un resultado parcial.');
 const onHidden=()=>{if(document.hidden)reset('Al volver, cotejá nuevamente para obtener una lectura autorizada.');};document.addEventListener('visibilitychange',onHidden);
 const onCapability=()=>reset('Cambió el contexto de acceso. Consultá nuevamente.');document.addEventListener('municontrol:capabilities-ready',onCapability);
 state();return{setSource(value){clear();source=value;host.hidden=!value;status.textContent='Reporte listo. Consultá una liquidación para cotejar sus legajos.';state();},clear,destroy(){clear();disposed=true;document.removeEventListener('visibilitychange',onHidden);document.removeEventListener('municontrol:capabilities-ready',onCapability);host.replaceChildren();}};
}
