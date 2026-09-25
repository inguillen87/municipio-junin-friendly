import {absenceWindowRelation} from './absence-window-model.js';
import {personUuid,personDate} from './absence-person-model.js';
import {readAbsencePerson} from './absence-person-reader.js';
const make=(tag,text,cls)=>{
 const node=document.createElement(tag);
 if(text!==undefined) node.textContent=String(text);
 if(cls) node.className=cls;
 return node;
};
const date=v=>v?new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(v+'T00:00:00Z')):'No informada';
const number=v=>v===null?'No informado':new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(v);
let activePanel=null;
export function openAbsencePerson(detail){
 if(!personUuid(detail?.contractId)||!personDate(detail?.from)||!personDate(detail?.to)||detail.from>detail.to)return;
 activePanel?.close();
 const trigger=document.activeElement;
 const dialog=make('dialog',undefined,'ap-dialog');
 dialog.id='absencePersonDialog';dialog.setAttribute('aria-labelledby','absencePersonTitle');
 const header=make('header'),title=make('h2','Historial de ausencias del agente');
 title.id='absencePersonTitle';header.append(title);dialog.append(header);
 const button=(parent,text,action)=>{
  const b=make('button',text);b.type='button';b.addEventListener('click',action);parent.append(b);return b;
 };
 let generation=0,controller=null,model=null,page=1,busy=false,closed=false,reportView=null,preparedReport=null;
 let scope={resource:'absenceperson',contractId:detail.contractId,from:detail.from,to:detail.to,snapshot:detail.snapshot??null,limit:25};
 function stop(){generation++;controller?.abort();controller=null;busy=false;}
 function close(){
  if(closed)return;closed=true;stop();hideReport();model=null;
  document.removeEventListener('visibilitychange',onVisibility);
  window.removeEventListener('pagehide',close);
  document.removeEventListener('mc:absence-cleared',close);
  if(dialog.open)dialog.close();dialog.replaceChildren();dialog.remove();
  if(trigger?.isConnected)trigger.focus();if(activePanel?.dialog===dialog)activePanel=null;
 }
 function onVisibility(){if(document.hidden)close();}
 button(header,'Cerrar historial',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(reportView){stop();hideReport();controls();}else close();});
 dialog.addEventListener('close',close);
 const selectionNote=make('p','Todos los motivos del vínculo. Incluye eventos cuya fecha inicial está dentro del período; no hereda la búsqueda ni el motivo del listado.','ap-note');selectionNote.dataset.absenceSelectionNote='';dialog.append(selectionNote);
 const form=make('form',undefined,'ap-controls');dialog.append(form);
 const fromLabel=make('label','Desde'),toLabel=make('label','Hasta');
 const from=make('input'),to=make('input');from.type=to.type='date';from.required=to.required=true;
 from.value=scope.from;to.value=scope.to;from.min=to.min='1990-01-01';
 from.setAttribute('aria-label','Historial desde');to.setAttribute('aria-label','Historial hasta');
 fromLabel.append(from);toLabel.append(to);form.append(fromLabel,toLabel);
 const modeLabel=make('label','Criterio de fechas'),mode=make('select');
 mode.setAttribute('aria-label','Criterio de fechas del historial');
 mode.append(new Option('Comienzan en el período','starts'),new Option('Cruzan el período','overlaps'));
 modeLabel.append(mode);form.append(modeLabel);
 const apply=button(form,'Consultar período',()=>{});apply.type='submit';
 const original=button(form,'Volver al período inicial',()=>{from.value=detail.from;to.value=detail.to;mode.value='starts';form.requestSubmit();});
 const status=make('p','Consultando el vínculo…','ap-status');status.setAttribute('role','status');
 status.dataset.absencePersonStatus='';dialog.append(status);
 const actions=make('div',undefined,'ap-actions');dialog.append(actions);
 const retry=button(actions,'Reintentar historial',()=>load());
 const cancel=button(actions,'Cancelar consulta',()=>{
  stop();model=null;results.replaceChildren();status.textContent='Consulta cancelada. No se conservó un resultado parcial.';controls();
 });
 const results=make('section',undefined,'ap-results');dialog.append(results);
 const exports=make('section',undefined,'ap-export-bar');exports.setAttribute('aria-label','Informe completo del agente');dialog.append(exports);
 const exportCsv=button(exports,'Descargar CSV completo',()=>prepareReport('csv'));
 const exportPrint=button(exports,'Vista imprimible',()=>prepareReport('print'));
 const exportHelp=make('p','Incluye todos los eventos del filtro; se verifican fuente y permisos antes de emitir.');exports.append(exportHelp);
 function controls(){
  dialog.setAttribute('aria-busy',String(busy));apply.disabled=original.disabled=from.disabled=to.disabled=mode.disabled=busy;
  cancel.hidden=!busy;retry.hidden=busy||model!==null;
  const draft=scope&&(from.value!==scope.from||to.value!==scope.to||(mode.value!==(scope.rangeMode??'starts')));
  exports.hidden=!model||!scope;exportCsv.disabled=exportPrint.disabled=busy||!model||!!draft;
  exportHelp.textContent=draft?'Aplicá las fechas editadas para emitir el informe de ese período.':'Incluye todos los eventos del filtro; se verifican fuente y permisos antes de emitir.';
  for(const b of results.querySelectorAll('button'))b.disabled=busy||(b.textContent==='Eventos anteriores'?page<=1:page>=model?.pagination.pages);
 }
 function fail(error){
  hideReport();model=null;results.replaceChildren();page=1;
  if([401,403].includes(error.status)){
   scope=null;form.hidden=true;actions.hidden=true;
   title.textContent='Acceso al historial no disponible';
   status.textContent='La sesión o el permiso nominal ya no habilita esta consulta. Cerrá el historial y verificá el acceso.';
  } else {
   status.textContent=error.status===409||error.message==='ABSENCE_PERSON_SOURCE_CHANGED'?'Cambió la fuente. Cerrá este historial y actualizá Ausentismo antes de continuar.':error.status===404?'El vínculo no está disponible en esta fuente municipal.':error.status===422?'El período está fuera del corte disponible. Ajustá las fechas.':'No se pudo verificar el historial. Podés reintentar sin salir de Ausentismo.';
   if(error.status===409||error.message==='ABSENCE_PERSON_SOURCE_CHANGED'){scope=null;form.hidden=true;actions.hidden=true;}
  }
 }
 async function load(){
  if(busy||closed||!scope)return;hideReport();stop();const token=generation,c=new AbortController();controller=c;busy=true;
  model=null;results.replaceChildren();status.textContent='Consultando el período completo del vínculo…';controls();
  try{
   const data=await readAbsencePerson({...scope,page},c.signal);
   if(token!==generation||closed)return;
   model=data;scope.snapshot=data.snapshot;render(data);
   status.textContent='Historial consultado. No modifica licencias, presentismo ni descuentos.';
  }catch(error){if(token===generation&&!closed)fail(error);}
  finally{if(token===generation&&!closed){busy=false;controller=null;controls();}}
 }
 function hideReport(){const wasOpen=!!reportView;reportView?.dispose();reportView=null;preparedReport=null;if(wasOpen&&!closed&&exportPrint?.isConnected)exportPrint.focus();}
 async function prepareReport(kind){
  if(busy||closed||!model||!scope||from.value!==scope.from||to.value!==scope.to||mode.value!==(scope.rangeMode??'starts'))return;
  hideReport();stop();const token=generation,c=new AbortController(),shown=model;controller=c;busy=true;controls();
  status.textContent='Preparando informe completo: verificando todas las páginas…';
  try{
   const reports=await import('./absence-person-report.js');
   if(token!==generation||closed)return;
   const report=await reports.collectAbsenceReport(shown,{signal:AbortSignal.any([c.signal,AbortSignal.timeout(90000)]),onProgress:p=>{if(token===generation&&!closed)status.textContent='Preparando '+p.received+' de '+p.total+' eventos. Todavía no se descargó ningún archivo.';}});
   if(token!==generation||closed)return;
   if(kind==='csv'){
    const objectUrl=URL.createObjectURL(new Blob([reports.absenceReportCsv(report)],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=objectUrl;link.download=reports.absenceReportFilename(report);link.hidden=true;dialog.append(link);
    try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);}
    status.textContent='CSV completo preparado: '+report.events.length+' eventos. Se conservó la página del historial.';
   }else{
    const view=await import('./absence-person-report-view.js');if(token!==generation||closed)return;
    preparedReport=report;reportView=view.showAbsenceReport(dialog,report,{onBack:()=>{hideReport();controls();},onPrint:printReport,onCancel:()=>{stop();hideReport();status.textContent='Verificación cancelada. No se abrió la impresión.';controls();}});
   }
  }catch(error){if(token===generation&&!closed){if(error.code==='ABSENCE_REPORT_TOO_LARGE')status.textContent='El informe admite hasta 5.000 eventos. Acotá el período; no se descargó un archivo parcial.';else fail(error);}}
  finally{if(token===generation&&!closed){busy=false;controller=null;controls();}}
 }
 async function printReport(){
  if(busy||closed||!preparedReport||!reportView)return;stop();const token=generation,c=new AbortController();controller=c;busy=true;reportView.setBusy(true);controls();
  reportView.status.textContent='Verificando de nuevo el acceso y la fuente antes de imprimir…';
  try{const reports=await import('./absence-person-report.js');await reports.recheckAbsenceReport(preparedReport,{signal:c.signal});
   if(token!==generation||closed)return;reportView.status.textContent='Verificación completada. Elegí la impresora o Guardar como PDF en el diálogo del navegador.';reportView.print();
  }catch(error){if(token===generation&&!closed)fail(error);}
  finally{if(token===generation&&!closed){busy=false;controller=null;reportView?.setBusy(false);controls();}}
 }

 function render(data){
  results.replaceChildren();
  const overlaps=data.rangeMode==='overlaps';
  selectionNote.textContent=overlaps?'Incluye inicios del período y eventos anteriores cuyo fin de origen alcanza el rango. Sin fin o con fechas invertidas sólo se incluye el inicio dentro del período. No confirma vigencia ni justificación.':'Todos los motivos del vínculo. Incluye eventos cuya fecha inicial está dentro del período; no hereda la búsqueda ni el motivo del listado.';
  title.textContent=data.person.name+' · Legajo '+data.person.number;
  const info=make('p',date(data.range.effective.from)+' → '+date(data.range.effective.to)+' · Corte '+date(data.sourceCutoff)+' · '+data.person.sector,'ap-note');results.append(info);
  if(data.range.clamped.to)results.append(make('p','El fin solicitado supera la fuente: se consulta sólo hasta su corte.','ap-warning'));
  const metrics=make('div',undefined,'ap-metrics');results.append(metrics);
  const sum=data.summary;
  if(overlaps){const carried=make('p',sum.beganBeforePeriod+' de '+sum.events+' eventos comenzaron antes del período. Sin fecha final informada: '+sum.endNotReportedEvents+'.','ap-window-summary');carried.dataset.absenceCarried='';carried.setAttribute('role','status');results.append(carried);}
  const values=[['Eventos del período',sum.events],['Días declarados',sum.reportedDaysEvents?number(sum.reportedDaysSum):'No informados'],['Motivos distintos',sum.reasonCount],['Fechas para revisar',sum.dateReviewEvents]];
  for(const[label,value]of values){const box=make('article');box.append(make('span',label),make('strong',value));metrics.append(box);}
  results.append(make('p','Totales de todo el período, no sólo de esta página. Días informados en '+sum.reportedDaysEvents+' de '+sum.events+' eventos. Se conserva la cantidad completa del evento, sin prorratearla por el período. No son jornadas perdidas; los registros sin cantidad no se convierten en cero.','ap-note'));
  const scroll=make('div',undefined,'ap-table');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Historial individual desplazable');
  const table=make('table'),thead=make('thead'),tr=make('tr');
  for(const label of ['Inicio','Fin de origen','Motivo','Días declarados','Control de fecha',...(overlaps?['Relación con el período']:[])]){const th=make('th',label);th.scope='col';tr.append(th);}thead.append(tr);table.append(thead);
  const body=make('tbody');body.dataset.absenceHistoryRows='';table.append(body);scroll.append(table);results.append(scroll);
  for(const event of data.events){const row=make('tr');
   const review=event.rangeIntegrity==='extended_source_range'?'Rango extenso: revisar':event.rangeIntegrity==='inverted_source_range'?'Fechas invertidas':event.rangeIntegrity==='until_date_not_reported'?'Fin no informado':'Fechas en orden';
   for(const value of [date(event.date),date(event.untilDate),event.reason,number(event.declaredDays),review])row.append(make('td',value));if(overlaps){const relation=absenceWindowRelation(event,data.range.effective.from,data.range.effective.to),cell=make('td',relation==='began_before'?'Comenzó antes':'Comienza dentro');cell.dataset.absenceRelation=relation;row.append(cell);}body.append(row);
  }
  if(!data.events.length){
   const cell=make('td','Sin eventos administrativos para este vínculo y período. No demuestra asistencia completa.');
   cell.colSpan=overlaps?6:5;const row=make('tr');row.append(cell);body.append(row);
  }
  const pagination=make('div',undefined,'ap-actions');results.append(pagination);
  const previous=button(pagination,'Eventos anteriores',()=>{page--;load();});
  pagination.append(make('span','Página '+data.pagination.page+' de '+data.pagination.pages+' · '+data.pagination.total+' eventos'));
  const next=button(pagination,'Eventos siguientes',()=>{page++;load();});
  previous.disabled=page<=1;next.disabled=page>=data.pagination.pages;
 }
 form.addEventListener('submit',event=>{
  event.preventDefault();if(busy||!scope)return;
  if(!personDate(from.value)||!personDate(to.value)||from.value>to.value){
   status.textContent='Revisá las fechas: Desde debe ser anterior o igual a Hasta.';return;
  }
  scope={...scope,from:from.value,to:to.value,rangeMode:mode.value==='overlaps'?'overlaps':undefined};page=1;load();
 });
 from.addEventListener('input',controls);to.addEventListener('input',controls);
 mode.addEventListener('change',()=>{if(!busy&&scope){model=null;results.replaceChildren();status.textContent='Criterio cambiado: verificá las fechas para consultar.';controls();form.requestSubmit();}});
 document.addEventListener('visibilitychange',onVisibility);
 window.addEventListener('pagehide',close);
 document.addEventListener('mc:absence-cleared',close);
 document.body.append(dialog);activePanel={dialog,close};
 dialog.showModal();controls();load();
}
document.addEventListener('mc:absence-person-open',event=>openAbsencePerson(event.detail));
