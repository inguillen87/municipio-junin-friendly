import { mountPayrollRoster } from './payroll-roster-panel.js';
import {payrollSourceReport,sourceReportDocument,formatSalaryAmount,sourceReportCatalog,sourceReportTypeLabel,sourceConceptStatistics,sourceConceptStatisticsDocument,safeCurrencyExact} from './payroll-source-report-model.js';
import {saveReport} from './report-document.js';
import {civilDate,civilMonthLabel} from './civil-date.js';
const e=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const dateLabel=value=>civilDate(value).split('-').reverse().join('/');
export function mountSourceReports(host){
 host.innerHTML=`<header class="rc-panel-head"><p class="rc-eyebrow">Liquidaciones incorporadas</p><h2>Haberes y descuentos desde MuniControl</h2><p>Buscá por mes y tipo, elegí una liquidación y consultá sus conceptos y costo salarial.</p></header>
 <button type="button" class="rc-button" data-catalog>Consultar liquidaciones disponibles</button>
 <p role="status" aria-live="polite" data-state></p>
 <a href="login.html?next=reportes-rrhh.html%23haberes" data-login hidden>Ingresar al portal interno</a>
 <form data-query hidden class="rc-filter">
  <label>Mes de la fecha de liquidación<select data-catalog-month><option value="all">Todos los meses</option></select></label>
  <label>Tipo de liquidación<select data-catalog-type><option value="all">Todos los tipos</option></select></label>
  <label>Liquidación a consultar<select data-dataset required></select></label>
  <button class="rc-button" type="submit">Ver reporte</button>
  <p class="rc-explanation" data-catalog-scope></p>
  <a href="reportes-rrhh.html#resumen-mensual">Reunir varias liquidaciones del mismo período</a>
 </form>
 <div data-result hidden><div class="rc-source" data-source></div><section class="rc-salary-cost" data-salary-cost aria-label="Costo salarial de la corrida"></section><section class="rc-statistics" data-source-statistics aria-label="Estadístico por conceptos de la corrida"></section>
 <div class="rc-filter"><label>Conceptos<select data-group><option value="all">Todos</option><option value="discounts">Descuentos</option><option value="contributions">Aportes 701 y 703</option><option value="totals">Totalizadores</option></select></label><label>Buscar por código o descripción<input type="search" maxlength="100" data-search></label></div>
 <div class="rc-downloads"><button type="button" class="rc-button" data-format="pdf">Descargar PDF</button><button type="button" class="rc-button" data-format="xlsx">Descargar Excel</button><button type="button" class="rc-button secondary" data-format="csv">Descargar CSV</button></div>
 <p data-scope></p><div class="rc-table-wrap"><table class="rc-table" data-concepts-table><thead></thead><tbody></tbody></table></div></div>`;
 const rosterHost=e('section');host.append(rosterHost);const roster=mountPayrollRoster(rosterHost);
 let current=null,catalog=null,version=0,busy=false;
 const $=s=>host.querySelector(s),status=$('[data-state]'),result=$('[data-result]');
 const clear=()=>{current=null;result.hidden=true;for(const selector of ['[data-salary-cost]','[data-source-statistics]','[data-source]','[data-scope]','[data-concepts-table] thead','[data-concepts-table] tbody'])$(selector).replaceChildren();roster.setDataset(null)};
 const forgetCatalog=()=>{catalog=null;$('[data-query]').hidden=true;$('[data-dataset]').replaceChildren();$('[data-catalog-scope]').replaceChildren();$('[data-catalog-month]').replaceChildren(option('all','Todos los meses'));$('[data-catalog-type]').replaceChildren(option('all','Todos los tipos'))};
 const option=(value,label)=>{const n=e('option',label);n.value=value;return n};
 async function request(dataset){
  const qs=new URLSearchParams({resource:'payrollsourcereport'});if(dataset)qs.set('datasetId',dataset);
  const r=await fetch('/api/internal-data?'+qs,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000)});
  if(r.status===401||r.status===403){clear();forgetCatalog();$('[data-login]').hidden=false;throw Error('Se requiere una sesión con permiso de consulta de nómina.')}
  const p=await r.json();if(!r.ok||p.ok!==true)throw Error('No se pudo consultar el reporte. Reintentá.');
  return payrollSourceReport(p.data);
 }
 function renderCatalog(preferred){
  const data=sourceReportCatalog(catalog,{month:$('[data-catalog-month]').value,type:$('[data-catalog-type]').value});
  $('[data-dataset]').replaceChildren(...data.items.map(i=>option(i.datasetId,dateLabel(i.date)+' · '+sourceReportTypeLabel(i.type)+' ('+i.type+') · '+i.statementCount+' legajos')));
  if(data.items.some(i=>i.datasetId===preferred))$('[data-dataset]').value=preferred;
  $('[data-dataset]').disabled=!data.items.length;$('[data-query] button').disabled=!data.items.length;
  $('[data-catalog-scope]').textContent=data.items.length+' de '+catalog.items.length+' liquidaciones disponibles coinciden.'+
   (data.truncated?' Catálogo limitado: se muestran las '+catalog.items.length+' más recientes de '+data.total+'.':'')+
   ' Los filtros buscan liquidaciones por su fecha. El reporte y las descargas corresponden únicamente a la liquidación elegida.';
  status.textContent=data.items.length?'Elegí una liquidación y consultá su reporte.':'No hay liquidaciones con esos filtros dentro del catálogo disponible. Probá otro mes o tipo.';
 }
 function render(){
  if(!current)return;
  const doc=sourceReportDocument(current,{group:$('[data-group]').value,search:$('[data-search]').value});
  $('[data-source]').textContent=current.sourceLabel+' · '+dateLabel(current.date)+' · '+sourceReportTypeLabel(current.type)+' ('+current.type+') · '+current.statementCount+' legajos de esta corrida. No es el padrón activo completo.';
  $('[data-scope]').textContent=doc.rows.length+' conceptos del filtro. '+doc.notes[1];
  renderSalaryCost($('[data-salary-cost]'),doc.salaryCost);
  renderSourceStatistics($('[data-source-statistics]'),sourceConceptStatistics(current));
  const head=e('tr');doc.columns.forEach(c=>head.append(e('th',c.label)));$('[data-concepts-table] thead').replaceChildren(head);
  $('[data-concepts-table] tbody').replaceChildren(...doc.rows.map(row=>{const tr=e('tr');row.forEach((v,i)=>tr.append(e('td',v===null?'No informado':doc.columns[i].type==='money'?new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v)):String(v))));return tr}));
  result.hidden=false;
 }
 $('[data-catalog]').addEventListener('click',async()=>{
  if(busy)return;busy=true;const seq=++version,previous=$('[data-dataset]').value,month=$('[data-catalog-month]').value,type=$('[data-catalog-type]').value;
  clear();forgetCatalog();status.textContent='Consultando liquidaciones…';
  try{
   const d=await request();if(seq!==version)return;const data=sourceReportCatalog(d);catalog=d;
   $('[data-catalog-month]').replaceChildren(option('all','Todos los meses'),...data.months.map(m=>option(m,civilMonthLabel(m))));
   $('[data-catalog-type]').replaceChildren(option('all','Todos los tipos'),...data.types.map(t=>option(t,sourceReportTypeLabel(t)+' ('+t+')')));
   if(data.months.includes(month))$('[data-catalog-month]').value=month;if(data.types.includes(type))$('[data-catalog-type]').value=type;
   renderCatalog(previous);$('[data-query]').hidden=!d.items.length;
   if(!d.items.length)status.textContent='Todavía no hay detalles de liquidación disponibles para tu ámbito.';
   $('[data-login]').hidden=true;
  }catch(err){status.textContent=err.message}finally{busy=false}
 });
 const catalogChanged=()=>{version++;clear();if(catalog)renderCatalog($('[data-dataset]').value)};
 $('[data-catalog-month]').addEventListener('change',catalogChanged);$('[data-catalog-type]').addEventListener('change',catalogChanged);
 $('[data-query]').addEventListener('submit',async ev=>{
  ev.preventDefault();if(busy||!catalog)return;
  const selected=$('[data-dataset]').value;
  const visible=sourceReportCatalog(catalog,{month:$('[data-catalog-month]').value,type:$('[data-catalog-type]').value});
  if(!visible.items.some(i=>i.datasetId===selected))return;
  busy=true;const seq=++version;clear();status.textContent='Consultando conceptos…';
  try{
   const d=await request(selected);if(seq!==version)return;
   if(!d.found)throw Error('La liquidación ya no está disponible.');
   if(d.datasetId!==selected)throw Error('La respuesta no corresponde a la liquidación elegida. Volvé a consultar.');
   current=d;render();roster.setDataset(d.datasetId);status.textContent='Reporte consultado. Filtrá y descargá el resultado.';
  }catch(err){clear();status.textContent=err.message}finally{busy=false}
 });
 $('[data-dataset]').addEventListener('change',()=>{version++;clear();status.textContent='Consultá la liquidación seleccionada antes de exportar.'});
 const filterChanged=()=>{version++;render()};$('[data-group]').addEventListener('change',filterChanged);$('[data-search]').addEventListener('input',filterChanged);
 async function exportCurrent(format,statistics=false){
  if(!current||busy)return;busy=true;const original=current,seq=version,filter={group:$('[data-group]').value,search:$('[data-search]').value};
  host.querySelectorAll('[data-format],[data-stat-format]').forEach(b=>b.disabled=true);status.textContent='Verificando acceso y versión antes de descargar…';
  try{
   const fresh=await request(original.datasetId);
   if(seq!==version||document.hidden||host.closest('[hidden]')){status.textContent='Descarga cancelada: cambió la vista. Volvé a descargar el filtro actual.';return}
   if(!fresh.found||fresh.reportHash!==original.reportHash||fresh.payloadHash!==original.payloadHash||fresh.datasetId!==original.datasetId||['date','type','sourceLabel','closureStatus','statementCount','lineCount'].some(k=>fresh[k]!==original[k]))throw Error('La fuente cambió. Volvé a consultar antes de descargar.');
   const filename=saveReport(statistics?sourceConceptStatisticsDocument(fresh):sourceReportDocument(fresh,filter),format);status.textContent='Archivo generado: '+filename;
  }catch(err){clear();status.textContent=err.message}finally{busy=false;host.querySelectorAll('[data-format],[data-stat-format]').forEach(b=>b.disabled=false)}
 }
 host.querySelectorAll('[data-format]').forEach(b=>b.addEventListener('click',()=>exportCurrent(b.dataset.format)));
 host.addEventListener('click',event=>{const button=event.target.closest('[data-stat-format]');if(button&&host.contains(button)&&['pdf','xlsx'].includes(button.dataset.statFormat))exportCurrent(button.dataset.statFormat,true);});
}


const costMoney = formatSalaryAmount;
function renderSalaryCost(host, cost) {
  const heading = e('div', undefined, 'rc-cost-heading');
  const title = e('div'); title.append(e('p', 'Corrida completa · no cambia con el filtro', 'rc-eyebrow'), e('h3', 'Costo salarial · totalizadores conservados'));
  const total = e('strong', costMoney(cost.amount), 'rc-cost-total'); total.dataset.costTotal = '';
  heading.append(title, total);
  const formula = e('p', cost.formula, 'rc-cost-formula');
  const breakdown = e('div', undefined, 'rc-cost-breakdown');
  for (const [label, value] of [['Haberes y asignaciones', cost.earnings], ['Aportes patronales 701 + 703', cost.contributions]]) {
    const block = e('div'); block.append(e('span', label), e('strong', costMoney(value))); breakdown.append(block);
  }
  const detail = e('details', undefined, 'rc-cost-detail');
  detail.append(e('summary', 'Ver los cinco componentes y los controles'));
  const list = e('dl');
  for (const item of cost.components) {
    const row = e('div'); row.append(e('dt', item.code + ' · ' + item.description), e('dd', item.amount === null ? 'No informado' : costMoney(item.amount))); list.append(row);
  }
  detail.append(list);
  const checks = e('div', undefined, 'rc-cost-checks');
  for (const [label, value] of [['990 informado − (701 + 703)', cost.controls.contributionsDifference], ['999 informado − neto calculado', cost.controls.netDifference]]) {
    const p = e('p', label + ': ' + (value === null ? 'No evaluable con esta fuente' : value === '0.00' ? 'Sumas iguales' : 'Diferencia ' + costMoney(value)));
    p.className = value !== null && value !== '0.00' ? 'rc-cost-warning' : 'rc-cost-check'; checks.append(p);
  }
  checks.append(e('p', 'Cotejo de sumas por concepto. La igualdad agregada no verifica cada legajo. Una diferencia no modifica la fuente ni prueba su causa.', 'rc-cost-note'));
  detail.append(e('p', 'Los descuentos del empleado no se restan del costo salarial.', 'rc-cost-note'));
  host.replaceChildren(heading, formula, breakdown, checks);
  if (cost.missingCodes.length) host.append(e('p', 'Falta un importe completo para: ' + cost.missingCodes.join(', ') + '. No se presume cero ni se muestra un costo parcial.', 'rc-cost-warning'));
  host.append(detail, e('p', 'Calculado desde los conceptos de esta corrida. No constituye una nueva liquidación ni acredita cierre o pago.', 'rc-cost-note'));
}


function renderSourceStatistics(host, statistics){
 const head=e('header');head.append(e('p','Corrida completa · conceptos originales','rc-eyebrow'),e('h3','Estadístico por concepto'),e('p','Compará la suma de los conceptos individuales con los totalizadores guardados. Los dos importes se conservan; este informe no recalcula sueldos.'));
 const kpis=e('div',undefined,'rc-cost-breakdown');
 for(const [key,label]of [['gross','Haberes y asignaciones desde conceptos'],['cost','Costo desde conceptos clasificados'],['net','Neto desde conceptos clasificados']]){const block=e('div');const value=e('strong',safeCurrencyExact(statistics.totals[key]),'rc-stat-money');value.dataset.statTotal=key;block.append(e('span',label),value);kpis.append(block);}
 const wrap=e('div',undefined,'rc-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Comparación de conceptos y totalizadores');
 const table=e('table',undefined,'rc-table'),thead=e('thead'),tr=e('tr');table.append(e('caption','Sumas de conceptos menos totalizadores conservados'));for(const label of ['Grupo de origen','Suma de conceptos','Totalizador guardado','Diferencia exacta']){const th=e('th',label);th.scope='col';tr.append(th)}thead.append(tr);const body=e('tbody');
 for(const code of statistics.groupOrder){const group=statistics.groups[code],row=e('tr'),label=e('th',code+' · '+group.label);row.dataset.statGroup=code;label.scope='row';label.append(e('small',group.conceptCount+' conceptos · '+group.occurrences+' ocurrencias. Totalizador: '+(group.storedTotalizer.present?group.storedTotalizer.occurrences+' de '+statistics.counts.datasetStatementCount+' participaciones':'ausente')+'.','rc-stat-coverage'));row.append(label,e('td',safeCurrencyExact(group.amount)),e('td',safeCurrencyExact(group.storedTotalizer.amount)));const delta=e('td',safeCurrencyExact(group.difference,{signed:true}));delta.dataset.statDifference=code;delta.dataset.statState=group.difference===null?'unavailable':group.difference==='0.00'?'match':'difference';if(delta.dataset.statState==='difference')delta.className='rc-cost-warning';row.append(delta);body.append(row)}
 table.append(thead,body);wrap.append(table);
 const coverage=e('p',statistics.counts.classifiedConceptCount+' conceptos clasificados · '+statistics.counts.classifiedOccurrences+' ocurrencias componentes. Una ocurrencia es una fila de concepto; no representa un legajo único. El filtro del detalle no cambia este alcance.','rc-cost-note');
 const notes=e('p','Un concepto ausente no equivale a cero. Las sumas pueden cubrir poblaciones diferentes y no certifican conciliación individual. Una diferencia no demuestra redondeo ni su causa histórica.','rc-cost-note');
 const actions=e('div',undefined,'rc-downloads');for(const [format,label]of [['pdf','Descargar estadístico PDF'],['xlsx','Descargar estadístico Excel']]){const button=e('button',label,'rc-button secondary');button.type='button';button.dataset.statFormat=format;actions.append(button)}
 host.replaceChildren(head,kpis,wrap,coverage,notes);if(statistics.counts.unclassifiedConceptCount)host.append(e('p',statistics.counts.unclassifiedConceptCount+' conceptos no tienen clasificación en estos cinco grupos y se informan por separado. No se les asignó una categoría.','rc-cost-warning'));host.append(actions);
}
