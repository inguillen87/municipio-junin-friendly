import {compareWorkdayReference} from './workday-quick-analysis.js';
import {duration} from './workday-export.js';
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function workdayReferencePanel(row){
 const box=make('section',undefined,'ck-card');box.dataset.workdayReference='';box.append(make('h4','Comparación rápida de tiempo'));
 if(row.status!=='closed'||row.identityState!=='mapped'||row.issues?.length){box.append(make('p','Esta secuencia tiene incidencias o identidad pendiente. Revisá sus marcas antes de comparar contra una duración de referencia.'));return box;}
 box.append(make('p','Ingresá una duración sólo para esta comparación. No se guarda como turno ni se usa para pagar extras o descontar tiempo.'));
 const form=make('form',undefined,'ck-record-filter'),label=make('label','Duración de referencia (HH:MM)'),input=document.createElement('input');
 input.type='text';input.inputMode='numeric';input.placeholder='HH:MM';input.maxLength=5;input.required=true;input.autocomplete='off';input.pattern='[0-9]{1,2}:[0-5][0-9]';label.append(input);
 const button=make('button','Comparar tiempos','ck-primary');button.type='submit';form.append(label,button);box.append(form);
 const result=make('p','Esperando una duración de referencia.','ck-note');result.setAttribute('role','status');box.append(result);
 form.addEventListener('submit',event=>{event.preventDefault();const comparison=compareWorkdayReference(row,input.value.trim());
  if(comparison.status!=='reference_only'){result.textContent=comparison.status==='invalid_reference'?'Usá una duración mayor a cero y hasta 24:00.':'La secuencia requiere revisión. No se calcula una diferencia.';return;}
  const delta=comparison.differenceSeconds;
  result.textContent='Tiempo reconstruido '+duration(comparison.observedSeconds)+' = ordinario '+duration(comparison.ordinarySeconds)+' + extra declarado '+duration(comparison.declaredExtraSeconds)+'. Pausas ya descontadas: '+duration(comparison.pauseSeconds)+'. Referencia '+duration(comparison.expectedSeconds)+'. '+(delta>0?'Excedente observado: '+duration(delta):delta<0?'Diferencia por debajo: '+duration(-delta):'Coincide con la referencia')+'. No determina tiempo pagable ni una ausencia.';
 });
 return box;
}
export function workdayTimeBars(data,onFilter){
 const host=make('section',undefined,'ck-card');host.dataset.wdTimeBars='';host.append(make('h4','Distribución del tiempo reconstruido'));
 const s=data.summary,total=s.ordinarySeconds+s.extraSeconds+s.pauseSeconds;
 for(const [key,label,state]of [['ordinarySeconds','Ordinario registrado','all'],['extraSeconds','Extra declarado por el reloj','extra'],['pauseSeconds','Pausas cerradas','all']]){
  const known=key==='pauseSeconds'?s.intervalCount>0:key==='ordinarySeconds'?s.ordinaryIntervalCount>0:s.extraIntervalCount>0;
  const text=known||s[key]>0?duration(s[key]):'Sin tramo completo';
  const line=make('div'),b=make('button',label+' · '+text,'ck-text');b.type='button';b.addEventListener('click',()=>onFilter(!known&&s[key]===0?'review':state));
  const track=make('div',undefined,'ck-track'),bar=make('i');bar.style.width=(total?s[key]/total*100:0)+'%';track.append(bar);line.append(b,track);host.append(line);
 }
 host.append(make('p','Totales de todo el filtro, no sólo de la página. Las pausas ya están restadas del tiempo neto; sin aprobación salarial.','ck-note'));return host;
}
