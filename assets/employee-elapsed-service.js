// Tiempo civil desde el ingreso del vínculo. No reconoce servicios ni recalcula haberes.
import {civilDate} from './civil-date.js';
const missing=reason=>Object.freeze({status:'unavailable',reason,years:null,months:null,totalMonths:null});
function day(value){if(typeof value!=='string')return null;try{return civilDate(value);}catch{return null;}}
function localCutoff(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!day(value))return null;
 const instant=new Date(value);if(!Number.isFinite(+instant))return null;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Mendoza',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
 const field=key=>parts.find(p=>p.type===key)?.value;return day(field('year')+'-'+field('month')+'-'+field('day'));
}
function anniversary(start,months){
 const [year,month,date]=start.split('-').map(Number),index=year*12+month-1+months;
 const y=Math.floor(index/12),m=index%12+1,last=new Date(Date.UTC(y,m,0)).getUTCDate();
 return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(date,last)).padStart(2,'0');
}
export function elapsedServiceAtCutoff(source,{terminationDate=null}={}){
 if(source?.origin!=='GRH'||source.scope!=='source_snapshot')return missing('source_unverified');
 const from=day(source.hireDate),cutoff=localCutoff(source.sourceCutoff);
 if(!from)return missing('hire_date_unavailable');if(!cutoff)return missing('cutoff_unavailable');
 if(from>cutoff)return missing('hire_after_cutoff');
 const hasEnd=terminationDate!==null&&terminationDate!==undefined&&terminationDate!=='';
 const end=hasEnd?day(terminationDate):null;if(hasEnd&&!end)return missing('termination_date_invalid');
 if(end&&end<from)return missing('termination_before_hire');
 const to=end&&end<cutoff?end:cutoff;
 const [y,m]=from.split('-').map(Number),[ey,em]=to.split('-').map(Number);
 let total=(ey-y)*12+em-m;if(anniversary(from,total)>to)total--;
 return Object.freeze({status:'available',from,to,cutoff,stoppedAtTermination:!!end&&end<=cutoff,years:Math.floor(total/12),months:total%12,totalMonths:total,convention:'completed_calendar_months_clamped_anniversary',recognizedForPayroll:false});
}
export function elapsedServiceLabel(value){
 if(value?.status!=='available')return 'No calculable con las fechas disponibles';
 return value.years+' '+(value.years===1?'año':'años')+' y '+value.months+' '+(value.months===1?'mes':'meses');
}
export function compareServiceSource(source,elapsed){
 if(elapsed?.status!=='available'||source?.years?.status!=='reported'||source?.months?.status!=='reported')return 'not_comparable';
 return source.years.value===elapsed.years&&source.months.value===elapsed.months?'same_components':'different_components';
}
export function elapsedServiceNote(source,value){
 if(value?.status!=='available')return ({source_unverified:'No hay un origen laboral verificado para calcular.',hire_date_unavailable:'Falta una fecha de ingreso válida.',cutoff_unavailable:'Falta el corte verificado de este vínculo.',hire_after_cutoff:'El ingreso es posterior al corte disponible.',termination_date_invalid:'La fecha de egreso requiere revisión.',termination_before_hire:'El egreso es anterior al ingreso; revisá las fechas.'}[value?.reason]||'Revisá las fechas del vínculo.');
 const comparison=compareServiceSource(source,value);
 return (value.stoppedAtTermination?'Calculado hasta el egreso informado. ':'Calculado hasta el corte de este vínculo. ')
  +(comparison==='different_components'?'Difiere de los años y meses informados por GRH. ':comparison==='same_components'?'Coincide numéricamente con lo informado por GRH. ':'La fuente no tiene años y meses válidos para comparar. ')
  +'Es tiempo calendario, no antigüedad reconocida para liquidar. No suma servicios previos ni descuenta interrupciones no informadas.';
}
