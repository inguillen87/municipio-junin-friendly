import {normalizeDocumentLibrary,documentLibraryPage,documentTypeLabel} from './payroll-document-library-model.js';
import {openPayrollDetail} from './payroll-detail-panel.js';

const node=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n};
const button=(label,handler)=>{const b=node('button','pdl-button',label);b.type='button';b.addEventListener('click',handler);return b};
const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const importedDate=new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Mendoza'});

/** Uses an independently authorized index; no personal data or filters are persisted. */
export async function openPayrollDocumentLibrary({host,employee,request,canRead}) {
 host.querySelector('[data-payroll-document-library]')?.remove();
 if(!canRead())return;
 const opener=document.activeElement;
 const root=node('section','payroll-document-library');
 root.dataset.payrollDocumentLibrary='true';
 root.setAttribute('aria-label','Biblioteca de liquidaciones del legajo');
 const heading=node('div','pdl-heading'),title=node('h3','','Liquidaciones detalladas disponibles');
 title.tabIndex=-1;
 const status=node('p','pdl-status','Consultando períodos con conceptos incorporados…');
 status.setAttribute('role','status');
 const body=node('div','pdl-body'),detailHost=node('div','pdl-detail-host');
 // Selection and filters belong only to this mounted, authorized employee panel.
 let active=true,revision=0,selection=0,controller=null,library=null,page=1;
 const filters={year:'',month:'',type:''};
 const live=()=>active&&root.isConnected&&canRead();
 const clearDetail=()=>{selection++;detailHost.replaceChildren()};
 const close=(restoreFocus=false)=>{
  if(!active)return;
  active=false;revision++;selection++;controller?.abort();observer.disconnect();root.remove();library=null;
  if(restoreFocus&&canRead()&&opener?.isConnected)opener.focus({preventScroll:true});
 };
 heading.append(title,button('Cerrar biblioteca',()=>close(true)));
 root.append(heading,node('p','pdl-help','Elegí un período para ver sus conceptos, descuentos y exportar PDF o Excel. El detalle puede provenir de un corte diferente al historial resumido.'),status,body,detailHost);
 host.append(root);
 const observer=new MutationObserver(()=>{if(!root.isConnected)close()});
 observer.observe(document.body,{childList:true,subtree:true});

 function renderIndex() {
  if(!live()||!library)return;
  body.replaceChildren();
  if(!library.items.length) {
   body.append(node('p','pdl-empty','Todavía no hay liquidaciones detalladas incorporadas para este legajo. Los resúmenes anteriores siguen disponibles. No es necesario volver a cargar una planilla desde aquí.'),button('Actualizar biblioteca',load));
   return;
  }
  const summary=node('div','pdl-summary');
  const noHistory=library.items.filter(x=>!x.historySummaryAvailable).length;
  summary.append(node('strong','',library.total+' liquidaciones con detalle'),node('span','',noHistory+' sin tarjeta en el resumen anterior · en el listado recibido'));
  if(library.truncated)summary.append(node('p','pdl-warning','Se muestran los 1.000 períodos más recientes. Los filtros se aplican a este listado; no representan el archivo completo.'));
  const fields=node('div','pdl-filters'),selectors={};
  function selectField(key,label,options) {
   const wrap=node('label','pdl-field'),span=node('span','',label),select=node('select');
   select.dataset.documentFilter=key;
   // Keep a previously selected value even if it disappeared in a newer source.
   // An explicit empty result is safer than silently widening the query.
   if(filters[key]&&!options.some(([value])=>String(value)===filters[key]))options.push([filters[key],key==='type'?documentTypeLabel(filters[key]):filters[key]]);
   for(const [value,text] of options){const option=node('option','',text);option.value=String(value);select.append(option)}
   select.value=filters[key];
   select.addEventListener('change',()=>{filters[key]=select.value;page=1;renderRows()});
   wrap.append(span,select);selectors[key]=select;fields.append(wrap);
  }
  selectField('year','Año',[['','Todos los años'],...[...new Set(library.items.map(x=>x.sourcePeriod))].sort((a,b)=>b-a).map(y=>[y,y])]);
  selectField('month','Mes',[['','Todos los meses'],...MONTHS.map((m,i)=>[i+1,m])]);
  selectField('type','Tipo de liquidación',[['','Todos los tipos'],...[...new Set(library.items.map(x=>x.payrollType))].sort().map(t=>[t,documentTypeLabel(t)])]);
  fields.append(button('Limpiar filtros',()=>{for(const key of Object.keys(filters)){filters[key]='';selectors[key].value=''}page=1;renderRows()}),button('Actualizar biblioteca',load));
  const resultCount=node('p','pdl-status');resultCount.setAttribute('role','status');resultCount.tabIndex=-1;
  const list=node('div','pdl-list'),navigation=node('nav','pdl-pagination');
  navigation.setAttribute('aria-label','Páginas de liquidaciones del legajo');
  body.append(summary,fields,resultCount,list,navigation);

  function renderRows(focus=false) {
   if(!live()){close();return}
   clearDetail();list.replaceChildren();navigation.replaceChildren();
   const result=documentLibraryPage(library,filters,page);page=result.page;
   resultCount.textContent=result.total+' de '+library.items.length+' liquidaciones del listado · selección por período de origen. '+(result.total?'Mostrando '+result.from+'–'+result.to+'.':'Sin resultados.');
   const selectVersion=selection;
   for(const item of result.items) {
    const card=node('article','pdl-card');card.dataset.documentKey=item.datasetId;
    const label=MONTHS[item.sourceMonth-1]+' de '+item.sourcePeriod;
    const caption=node('div','pdl-card-top');
    caption.append(node('h4','',label),node('span','pdl-badge '+(item.closureStatus==='closed'?'pdl-closed':'pdl-open'),item.closureStatus==='closed'?'Cierre informado':item.closureStatus==='open'?'Preliquidación / abierta':'Estado no informado'));
    card.append(caption,node('p','pdl-kind',documentTypeLabel(item.payrollType)),node('p','',item.conceptCount+' conceptos · '+(item.versionsAvailable>1?item.versionsAvailable+' versiones de fuente; se consulta la última':'1 versión de fuente')));
    if(!item.historySummaryAvailable)card.append(node('p','pdl-new','Disponible aunque no figure en el resumen anterior'));
    const info=node('details','pdl-source');
    info.append(node('summary','','Ver procedencia'),node('p','',item.sourceLabel),node('p','','Incorporado en MuniControl: '+importedDate.format(new Date(item.importedAt))),node('p','','Fecha de liquidación informada: '+item.payrollDate+'. No es una certificación de pago.'));card.append(info);
    const open=button('Ver conceptos y exportar',async()=>{
     if(!live()||selectVersion!==selection||!open.isConnected)return;
     open.disabled=true;
     try {
      await openPayrollDetail({host:detailHost,employee,item,request,
       canRead:()=>live()&&selectVersion===selection&&open.isConnected,
       onClose:()=>{if(live()&&open.isConnected)open.focus({preventScroll:true})}});
     } finally {if(open.isConnected)open.disabled=!live()}
    });
    open.setAttribute('aria-label','Ver conceptos y exportar · '+label+' · '+documentTypeLabel(item.payrollType));card.append(open);list.append(card);
   }
   if(!result.total)list.append(node('p','pdl-empty','No hay liquidaciones detalladas para esta combinación. Probá otro año, mes o tipo.'));
   navigation.hidden=result.pages===1;
   if(result.pages>1) {
    for(const [label,target] of [['Primera página',1],['Página anterior',page-1],['Página siguiente',page+1],['Última página',result.pages]]) {
     const b=button(label,()=>{if(!live()){close();return}page=target;renderRows(true)});
     b.disabled=target<1||target>result.pages||target===page;
     navigation.append(b);
     if(label==='Página anterior') {
      const jump=node('label','pdl-page-selector'),select=node('select');
      select.dataset.documentPage='true';
      for(let targetPage=1;targetPage<=result.pages;targetPage++) {
       const option=node('option','',''+targetPage);option.value=String(targetPage);select.append(option);
      }
      select.value=String(page);
      select.addEventListener('change',()=>{page=Number(select.value);renderRows(true)});
      jump.append(node('span','','Ir a la página'),select);navigation.append(jump);
     }
    }
    navigation.append(node('span','pdl-page-position','Página '+page+' de '+result.pages));
   }
   if(focus)resultCount.focus({preventScroll:true});
  }
  renderRows();
 }

 async function load() {
  if(!live()){close();return}
  const current=++revision;controller?.abort();controller=new AbortController();library=null;
  body.replaceChildren();clearDetail();root.setAttribute('aria-busy','true');status.textContent='Consultando períodos con conceptos incorporados…';
  try {
   const q=new URLSearchParams({resource:'employeepayrolldocuments',contractId:String(employee.contractId)});
   const payload=await request('/api/internal-data?'+q.toString(),{signal:controller.signal});
   if(current!==revision)return;
   if(!live()){close();return}
   if(!payload?.ok)throw Error('CATALOG_READ_FAILED');
   library=normalizeDocumentLibrary(payload.data);
   status.textContent='Lectura autorizada del legajo. Documentos informativos, sin firma aplicada.';renderIndex();
  } catch(error) {
   if(current!==revision)return;
   if(!live()){close();return}
   if(error.name!=='AbortError') {
    body.replaceChildren();clearDetail();status.textContent='No se pudo consultar la biblioteca. No se conservaron resultados anteriores como actuales.';
    body.append(button('Reintentar biblioteca',load));
   }
  } finally {if(current===revision&&live())root.setAttribute('aria-busy','false')}
 }
 await load();
 if(live()){title.focus({preventScroll:true});root.scrollIntoView({block:'nearest',behavior:'auto'})}
 return Object.freeze({close,refresh:load});
}
