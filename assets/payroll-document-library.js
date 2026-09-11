import {normalizeDocumentLibrary,filterDocumentLibrary,documentTypeLabel} from './payroll-document-library-model.js';
import {openPayrollDetail} from './payroll-detail-panel.js';
const node=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n};
const button=(label,handler)=>{const b=node('button','pdl-button',label);b.type='button';b.addEventListener('click',handler);return b};
const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
/** Uses an independently authorized index: periods need not exist in the older monthly summary. */
export async function openPayrollDocumentLibrary({host,employee,request,canRead}){
 host.querySelector('[data-payroll-document-library]')?.remove();
 const root=node('section','payroll-document-library');root.dataset.payrollDocumentLibrary='true';root.setAttribute('aria-label','Biblioteca de liquidaciones del legajo');
 const heading=node('div','pdl-heading'),title=node('h3','','Liquidaciones detalladas disponibles');title.tabIndex=-1;
 const status=node('p','pdl-status','Consultando períodos con conceptos incorporados…');status.setAttribute('role','status');
 const body=node('div','pdl-body'),detailHost=node('div','pdl-detail-host');
 let active=true,revision=0,controller=null,library=null;
 const clearDetail=()=>detailHost.replaceChildren();
 const close=()=>{active=false;revision++;controller?.abort();observer.disconnect();root.remove()};
 const live=()=>active&&root.isConnected&&canRead();
 heading.append(title,button('Cerrar biblioteca',close));root.append(heading,node('p','pdl-help','Elegí un período para ver sus conceptos, descuentos y exportar PDF o Excel. El detalle puede provenir de un corte diferente al historial resumido.'),status,body,detailHost);host.append(root);
 const observer=new MutationObserver(()=>{if(!root.isConnected)close()});observer.observe(document.body,{childList:true,subtree:true});
 function renderIndex(){
  if(!live()||!library)return;
  body.replaceChildren();
  if(!library.items.length){body.append(node('p','pdl-empty','Todavía no hay liquidaciones detalladas incorporadas para este legajo. Los resúmenes anteriores siguen disponibles. No es necesario volver a cargar una planilla desde aquí.'));return;}
  const summary=node('div','pdl-summary');
  const noHistory=library.items.filter(x=>!x.historySummaryAvailable).length;
  summary.append(node('strong','',library.total+' liquidaciones con detalle'),node('span','',noHistory+' sin tarjeta en el resumen anterior · accesibles desde esta biblioteca'));
  if(library.truncated)summary.append(node('p','pdl-warning','Se muestran los 1.000 períodos más recientes. Los filtros se aplican a este listado; no representan el archivo completo.'));
  const filters=node('div','pdl-filters');const selectors={};
  function selectField(key,label,options){const wrap=node('label','pdl-field'),span=node('span','',label),select=node('select');select.dataset.documentFilter=key;wrap.append(span,select);for(const [value,text] of options){const option=node('option','',text);option.value=String(value);select.append(option)}select.addEventListener('change',renderRows);selectors[key]=select;filters.append(wrap);}
  selectField('year','Año',[['','Todos los años'],...[...new Set(library.items.map(x=>x.sourcePeriod))].sort((a,b)=>b-a).map(y=>[y,y])]);
  selectField('month','Mes',[['','Todos los meses'],...MONTHS.map((m,i)=>[i+1,m])]);
  selectField('type','Tipo de liquidación',[['','Todos los tipos'],...[...new Set(library.items.map(x=>x.payrollType))].sort().map(t=>[t,documentTypeLabel(t)])]);
  filters.append(button('Limpiar filtros',()=>{Object.values(selectors).forEach(s=>s.value='');renderRows()}),button('Actualizar biblioteca',load));
  const resultCount=node('p','pdl-status');resultCount.setAttribute('role','status');const list=node('div','pdl-list');
  body.append(summary,filters,resultCount,list);
  function renderRows(){
   if(!live()){close();return;}
   clearDetail();list.replaceChildren();const rows=filterDocumentLibrary(library,Object.fromEntries(Object.entries(selectors).map(([k,v])=>[k,v.value])));
   resultCount.textContent=rows.length+' de '+library.items.length+' liquidaciones del listado · selección por período de origen.';
   for(const item of rows){const card=node('article','pdl-card');card.dataset.documentKey=item.datasetId;
    const label=MONTHS[item.sourceMonth-1]+' de '+item.sourcePeriod;
    const caption=node('div','pdl-card-top');caption.append(node('h4','',label),node('span','pdl-badge '+(item.closureStatus==='closed'?'pdl-closed':'pdl-open'),item.closureStatus==='closed'?'Cierre informado':item.closureStatus==='open'?'Preliquidación / abierta':'Estado no informado'));
    card.append(caption,node('p','pdl-kind',documentTypeLabel(item.payrollType)),node('p','',item.conceptCount+' conceptos · '+(item.versionsAvailable>1?item.versionsAvailable+' versiones de fuente; se consulta la última':'1 versión de fuente')));
    if(!item.historySummaryAvailable)card.append(node('p','pdl-new','Disponible aunque no figure en el resumen anterior'));
    const imported=new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Mendoza'}).format(new Date(item.importedAt));
    const info=node('details','pdl-source');info.append(node('summary','','Ver procedencia'),node('p','',item.sourceLabel),node('p','','Incorporado en MuniControl: '+imported),node('p','','Fecha de liquidación informada: '+item.payrollDate+'. No es una certificación de pago.'));card.append(info);
    const open=button('Ver conceptos y exportar',async()=>{if(!live())return;open.disabled=true;try{await openPayrollDetail({host:detailHost,employee,item,request,canRead:live})}finally{if(open.isConnected)open.disabled=!live()}});
    open.setAttribute('aria-label','Ver conceptos y exportar · '+label+' · '+documentTypeLabel(item.payrollType));card.append(open);list.append(card);
   }
   if(!rows.length)list.append(node('p','pdl-empty','No hay liquidaciones detalladas para esta combinación. Probá otro año, mes o tipo.'));
  }
  renderRows();
 }
 async function load(){
  if(!live())return;
  const current=++revision;controller?.abort();controller=new AbortController();library=null;body.replaceChildren();clearDetail();root.setAttribute('aria-busy','true');status.textContent='Consultando períodos con conceptos incorporados…';
  try{
   const q=new URLSearchParams({resource:'employeepayrolldocuments',contractId:String(employee.contractId)});
   const payload=await request('/api/internal-data?'+q.toString(),{signal:controller.signal});
   if(current!==revision||!live())return;
   if(!payload?.ok)throw Error('CATALOG_READ_FAILED');
   library=normalizeDocumentLibrary(payload.data);status.textContent='Lectura autorizada del legajo. Documentos informativos, sin firma aplicada.';renderIndex();
  }catch(error){if(current===revision&&active&&root.isConnected&&error.name!=='AbortError'){body.replaceChildren();clearDetail();status.textContent='No se pudo consultar la biblioteca. No se conservaron resultados anteriores como actuales.';body.append(button('Reintentar biblioteca',load));}}
  finally{if(current===revision&&root.isConnected)root.setAttribute('aria-busy','false')}
 }
 await load();if(live()){title.focus({preventScroll:true});root.scrollIntoView({block:'nearest',behavior:'auto'});}
 return Object.freeze({close,refresh:load});
}
