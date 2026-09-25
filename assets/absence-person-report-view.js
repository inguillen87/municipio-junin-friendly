import {requireAbsenceReport,absenceReportNotice,absenceReportCriterion,absenceReportQuality} from './absence-person-report.js';
const add=(parent,tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(cls)el.className=cls;parent.append(el);return el;};
const date=v=>v?new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(v+'T00:00:00Z')):'No informada';
const number=v=>v===null?'No informado':new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(v);
export function showAbsenceReport(dialog,report,{onBack,onPrint,onCancel}={}){
 requireAbsenceReport(report);const d=report.anchor;
 const root=add(dialog,'section',undefined,'ap-report-view');root.setAttribute('aria-label','Informe completo de ausencias');root.tabIndex=-1;
 const toolbar=add(root,'div',undefined,'ap-report-toolbar');
 const button=(label,action)=>{const b=add(toolbar,'button',label);b.type='button';b.addEventListener('click',action);return b;};
 const back=button('Volver al historial',onBack),print=button('Imprimir / guardar PDF',onPrint),cancel=button('Cancelar verificación',onCancel);cancel.hidden=true;
 const status=add(root,'p','Informe completo preparado. Antes de imprimir se vuelve a comprobar el acceso y la fuente.','ap-report-status');status.setAttribute('role','status');
 const head=add(root,'header',undefined,'ap-report-heading');
 add(head,'p','MuniControl · Uso interno','ap-report-brand');add(head,'h2','Historial de ausencias');
 add(head,'p',d.person.name+' · Legajo '+d.person.number,'ap-report-person');
 const metadata=add(root,'dl',undefined,'ap-report-metadata');
 for(const [label,value]of [['Período aplicado',date(d.range.effective.from)+' — '+date(d.range.effective.to)],['Criterio',absenceReportCriterion(report)],['Sector al corte',d.person.sector||'No informado'],['Corte de fuente',date(d.sourceCutoff)],['Período solicitado',date(d.range.requested.from)+' — '+date(d.range.requested.to)],['Consulta realizada',new Date(report.checkedAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Mendoza'})+' (Mendoza)']]){const item=add(metadata,'div');add(item,'dt',label);add(item,'dd',value);}
 const metrics=add(root,'div',undefined,'ap-report-metrics');
 for(const [label,value]of [['Eventos',d.summary.events],['Días declarados completos',d.summary.reportedDaysEvents?number(d.summary.reportedDaysSum):'No informados'],['Fechas para revisar',d.summary.dateReviewEvents]]){const box=add(metrics,'div');add(box,'strong',value);add(box,'span',label);}
 if(d.range.clamped.to)add(root,'p','El período solicitado supera el corte: se informa sólo el rango disponible.','ap-report-warning');
 add(root,'p','Cantidades originales completas, sin prorrateo por las fechas consultadas. Los valores no informados se conservan como tales.','ap-report-note');
 const scroll=add(root,'div',undefined,'ap-report-table-wrap');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Todos los eventos del informe');
 const table=add(scroll,'table'),thead=add(table,'thead');const repeated=add(thead,'tr',undefined,'ap-report-repeat'),contextCell=add(repeated,'th',d.person.name+' · Legajo '+d.person.number+' · '+date(d.range.effective.from)+' — '+date(d.range.effective.to));contextCell.colSpan=6;const tr=add(thead,'tr');
 for(const label of ['Inicio','Fin de origen','Motivo','Días declarados','Control de fecha','Relación con el período']){const th=add(tr,'th',label);th.scope='col';}
 const body=add(table,'tbody');body.dataset.absenceReportRows='';
 for(const event of report.events){const row=add(body,'tr');for(const value of [date(event.date),date(event.untilDate),event.reason,number(event.declaredDays),absenceReportQuality(event),event.date<d.range.effective.from?'Comenzó antes':'Comienza dentro'])add(row,'td',value);}
 if(!report.events.length){const cell=add(add(body,'tr'),'td','Sin eventos en el filtro. Esto no demuestra asistencia completa.');cell.colSpan=6;}
 const footer=add(root,'footer',undefined,'ap-report-footer');add(footer,'p',absenceReportNotice);
 add(footer,'p','Total: '+report.events.length+' eventos · Contrato: '+d.person.contractId+' · Municipio: '+d.tenantId);
 add(footer,'p','Versión de fuente: '+d.snapshot,'ap-report-reference');
 dialog.dataset.reportView='';dialog.scrollTop=0;root.focus({preventScroll:true});let disposed=false;
 function dispose(){if(disposed)return;disposed=true;delete dialog.dataset.reportView;document.body.classList.remove('ap-printing');root.replaceChildren();root.remove();}
 return {root,dispose,status,setBusy(value){back.disabled=print.disabled=value;cancel.hidden=!value;root.setAttribute('aria-busy',String(value));},
  print(){if(disposed||!root.isConnected)return;document.body.classList.add('ap-printing');try{window.print();}finally{document.body.classList.remove('ap-printing');}}};
}
