import { createPayrollDetailModel, money } from './payroll-detail-model.js';
import { createPayrollDetailPdf, createPayrollDetailXlsx, downloadDetail } from './payroll-detail-export.js';
const el=(tag,cls='',value='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=value;return n};
const button=(label,run)=>{const b=el('button','pd-button',label);b.type='button';b.addEventListener('click',run);return b};
/** Mount within the already-authorized legajo dialog; no nested modal or PII URL. */
export async function openPayrollDetail({host,employee,item,request,canRead}){
 host.querySelector('[data-payroll-detail-panel]')?.remove();
 const section=el('section','payroll-detail'),header=el('div','pd-header'),title=el('h4','','Conceptos y descuentos del período'),status=el('p','pd-status','Consultando líneas de liquidación…');section.dataset.payrollDetailPanel='true';section.setAttribute('aria-label','Detalle de conceptos y descuentos');status.setAttribute('role','status');
 const controller=new AbortController();let active=true;
 const close=()=>{active=false;controller.abort();observer.disconnect();section.remove()};
 header.append(title,button('Cerrar detalle',close));section.append(header,status);host.append(section);
 const observer=new MutationObserver(()=>{if(!section.isConnected)close()});observer.observe(document.body,{childList:true,subtree:true});
 try{
  if(!canRead())throw new Error('Tu sesión no permite consultar este detalle.');
  const query=new URLSearchParams({resource:'employeepayrolldetail',contractId:String(employee.contractId),date:String(item.payrollDate).slice(0,10),type:String(item.payrollType),period:String(item.sourcePeriod),month:String(item.sourceMonth)});
  const payload=await request('/api/internal-data?'+query.toString(),{signal:controller.signal});if(!active||!section.isConnected||!canRead())return;
  if(!payload?.ok)throw new Error('No se pudo consultar el detalle.');
  if(payload.data?.available===false){status.textContent='Todavía no hay líneas de conceptos incorporadas para este período. El resumen mensual sigue disponible; no se inventaron descuentos.';return}
  const model=createPayrollDetailModel(payload.data,employee);status.textContent=model.sourceLabel+' · '+model.rows.length+' conceptos conservados · '+(model.closureStatus==='closed'?'Cierre informado por la fuente':'Abierta / preliquidación');
  section.append(el('p','pd-scope','Detalle informativo del respaldo. No acredita pago ni emisión oficial; los aportes patronales no se descuentan otra vez al empleado.'));
  if(model.historyChanged)section.append(el('p','pd-warning','Este detalle proviene de un corte diferente y tiene importes distintos del resumen mensual de la ficha. Se muestran ambas fuentes, sin sustituir el histórico.'));
  const cards=el('div','pd-cards');for(const [code,label]of [['993','Haberes remunerativos'],['994','No remunerativos'],['995','Asignaciones'],['996','Descuentos'],['999','Neto informado']]){const c=el('div','pd-card');c.append(el('span','',label),el('strong','',money(model.totals[code]??null)));cards.append(c)}section.append(cards);
  const actions=el('div','pd-actions'),feedback=el('p','pd-status');feedback.setAttribute('role','status');
  async function exportTo(ext){if(!active||!canRead())return;const all=[...actions.querySelectorAll('button')];all.forEach(x=>x.disabled=true);try{
   const fresh=await request('/api/internal-data?'+query.toString(),{signal:controller.signal});
   if(!active||!section.isConnected||!canRead())return;
   if(!fresh?.ok||fresh.data?.statementId!==model.statementId||fresh.data?.statementHash!==model.statementHash||fresh.data?.sourceHash!==model.sourceHash)throw new Error('El detalle cambió. Volvé a abrirlo antes de exportar.');
   const verified=createPayrollDetailModel(fresh.data,employee);
   // EXPORT_PREVIEW_PINNED: reauthorization cannot silently change the reviewed comparison.
   if(JSON.stringify(verified)!==JSON.stringify(model))throw new Error('La conciliación cambió. Volvé a abrir el detalle antes de exportar.');
   const bytes=ext==='pdf'?createPayrollDetailPdf(verified):createPayrollDetailXlsx(verified);downloadDetail(bytes,ext,verified.period);feedback.textContent='Exportación completa del detalle consultado: '+verified.rows.length+' conceptos. Sin firma.';
  }catch(e){if(e.name!=='AbortError')feedback.textContent=e.message||'No se generó el archivo.'}finally{all.forEach(x=>x.disabled=!canRead())}}
  const pdf=button('Descargar detalle · PDF',()=>exportTo('pdf')),xlsx=button('Descargar detalle · Excel',()=>exportTo('xlsx'));actions.append(pdf,xlsx);section.append(actions,feedback);
  const bar=el('div','pd-filters'),count=el('p','pd-status'),tableWrap=el('div','pd-table-wrap'),table=el('table','pd-table'),thead=el('thead'),tr=el('tr'),tbody=el('tbody');
  for(const t of ['Código','Descripción del concepto','Cantidad de origen','Importe ARS'])tr.append(el('th','',t));thead.append(tr);table.append(thead,tbody);tableWrap.append(table);
  const labels={all:'Todos los conceptos',deductions:'Descuentos',earnings:'Haberes y asignaciones',employer:'Aportes patronales',technical:'Totales y bases'};
  function render(filter){tbody.replaceChildren();const rows=model.rows.filter(r=>filter==='all'||filter==='deductions'&&r.group==='996'||filter==='earnings'&&['993','994','995'].includes(r.group)||filter==='employer'&&r.group==='990'||filter==='technical'&&r.group==='technical');count.textContent=rows.length+' conceptos · El PDF y el Excel incluyen el detalle completo, no sólo este filtro.';
   for(const r of rows){const row=el('tr');row.append(el('td','pd-code',r.code),el('td','',r.description),el('td','pd-number',r.quantity??'No informada'),el('td','pd-number',money(r.amount)));if(r.descriptionMissing||r.amount===null)row.classList.add('pd-observed');tbody.append(row)}
   if(!rows.length){const row=el('tr'),cell=el('td','','Sin conceptos en esta categoría.');cell.colSpan=4;row.append(cell);tbody.append(row)}
   for(const b of bar.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.filter===filter));
  }
  for(const [key,label]of Object.entries(labels)){const b=button(label,()=>render(key));b.dataset.filter=key;b.setAttribute('aria-pressed','false');bar.append(b)}section.append(bar,count,tableWrap);render('deductions');
  const checks=el('details','pd-controls'),sum=el('summary','','Conciliación · detalle, totales y resumen anterior');checks.append(sum);const controlsTable=el('table','pd-table'),head=el('tr');for(const t of ['Grupo','Suma del detalle','Total fuente','Diferencia'])head.append(el('th','',t));const h=el('thead');h.append(head);controlsTable.append(h);const body=el('tbody');
  for(const c of model.checks){const r=el('tr');for(const v of [c.label,money(c.detail),money(c.reported),money(c.difference)])r.append(el('td','',v));body.append(r)}controlsTable.append(body);const scroller=el('div','pd-table-wrap');scroller.append(controlsTable);checks.append(scroller,el('p','pd-status','Diferencia de neto: '+money(model.netDifference)+'. No se ajustaron centavos para forzar la coincidencia.'));
  if(model.historyChanged){checks.open=true;const ct=el('div','pd-comparison');ct.append(el('h5','','Diferencias con el resumen de la ficha'));for(const c of model.historyComparison.filter(c=>c.difference!==null&&c.difference!=='0.00'))ct.append(el('p','',c.label+': antes '+money(c.history)+' · en este corte '+money(c.reported)+' · diferencia '+money(c.difference)));checks.append(ct)}
  checks.append(el('p','pd-hash','Referencia de líneas: '+model.statementHash));section.append(checks);title.tabIndex=-1;title.focus({preventScroll:true});section.scrollIntoView({block:'nearest',behavior:'auto'});
 }catch(e){if(active&&e.name!=='AbortError'){status.textContent=e.message||'No se pudo consultar el detalle.';status.classList.add('pd-warning')}}
}
