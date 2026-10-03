import {civilDate} from './civil-date.js';
import {currentCivilDay,schoolingData,schoolingRevision,schoolingEffectiveDates} from './family-schooling-model.js';

const fail=()=>{throw Error('No se pudo verificar la revisión escolar. Consultá el reporte y revisá los criterios.');};
const date=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail();return civilDate(value);};
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function schoolingReviewEnd(asOf){const day=date(asOf),next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+30);return date(next.toISOString().slice(0,10));}
export function schoolingReviewCriteria({asOf=currentCivilDay(),through=schoolingReviewEnd(asOf),schoolYear=Number(asOf.slice(0,4))}={}){
 date(asOf);date(through);
 if(through<asOf)throw Error('Avisos hasta debe ser igual o posterior al día de comparación. Revisá ambas fechas.');
 if(!Number.isInteger(schoolYear)||schoolYear<1900||schoolYear>2100)throw Error('Ingresá un ciclo lectivo válido entre 1900 y 2100.');
 return Object.freeze({asOf,through,schoolYear});
}
function observations(row,criteria){
 const result=[],add=(code,label,action,review=true)=>result.push(Object.freeze({code,label,action,review}));
 if(row.identityReviewRequired)add('identity','Coincidencia familiar por revisar','Revisar el vínculo en la ficha; no reasignar el certificado por semejanza.');
 if(row.validFrom&&row.validFrom>criteria.asOf||row.familyEndDate&&row.familyEndDate<criteria.asOf)add('family_dates','Fechas del vínculo fuera de la consulta','Revisar las fechas informadas del vínculo. Este aviso no elimina al familiar.');
 if(!row.certificate){
  add(row.sourceSchooling?'source_review':'no_record',row.sourceSchooling?'Fechas históricas por revisar':'Sin registro escolar en MuniControl','Verificar la presentación con Personal y registrar los datos que consten. No significa que no se presentó.');
 }else{
  if(row.certificate.presentedOn>criteria.asOf)add('future_presentation','Presentación posterior a la consulta','Revisar la fecha elegida y la presentación registrada; no sustituirla por la emisión.');
  if(row.certificate.schoolYear===null)add('cycle_unknown','Ciclo lectivo sin informar','Verificar el ciclo del documento y registrar una nueva versión sólo si corresponde.');
  else if(row.certificate.schoolYear!==criteria.schoolYear)add('cycle_other','Registro de otro ciclo lectivo','Consultar el registro del ciclo elegido antes de solicitar una nueva presentación.');
 }
 const dates=schoolingEffectiveDates(row),historical=dates.origin==='grh_source';
 if(dates.expiresOn&&dates.expiresOn<criteria.asOf)add('expired',historical?'Fecha histórica superada · por revisar':'Vencimiento informado superado','Revisar el documento y su eventual renovación; no aplicar una baja o descuento automáticamente.');
 else if(dates.expiresOn&&dates.expiresOn<=criteria.through)add('upcoming',historical?'Fecha histórica en la ventana · por revisar':'Vencimiento informado próximo','Revisar el documento antes de la fecha informada; el aviso no establece un plazo municipal nuevo.');
 else if((row.certificate||row.sourceSchooling)&&dates.expiresOn===null)add('no_expiry','Sin vencimiento válido informado','Conservar el dato vacío. No asignar una fecha ni considerar el documento vencido.',false);
 if(!result.some(item=>item.review))add('no_observations','Sin observaciones para estos criterios','El control de fechas y ciclo no aprueba escolaridad ni acredita elegibilidad salarial.',false);
 return Object.freeze(result);
}
export function schoolingReview(data,criteria={}){
 if(data?.version!=='family-schooling.v5'||data.scope?.cohort!=='administrative_active_with_children'||!Array.isArray(data.rows))fail();
 const source=schoolingData({ok:true,data:{...data,rows:data.rows.map(({key,...row})=>row)}},{version:5});
 const settings=schoolingReviewCriteria(criteria);
 const rows=source.rows.map(row=>Object.freeze({key:row.key,row,dates:Object.freeze(schoolingEffectiveDates(row)),observations:observations(row,settings)}));
 return Object.freeze({version:'schooling-review.v1',sourceRevision:schoolingRevision(source),source,criteria:settings,rows:Object.freeze(rows)});
}
export const SCHOOLING_REVIEW_FILTERS=Object.freeze({all:'Todo el reporte',needs_review:'Con avisos por revisar',upcoming:'Vencimiento en la ventana',expired:'Vencimiento informado superado',cycle:'Ciclo distinto o sin informar',identity:'Coincidencia familiar',no_record:'Sin registro escolar municipal',no_observations:'Sin observaciones para estos criterios'});
export function schoolingReviewSelection(review,{search='',status='all'}={}){
 if(review?.version!=='schooling-review.v1'||!Object.hasOwn(SCHOOLING_REVIEW_FILTERS,status)||typeof search!=='string'||search.length>100||/[\x00-\x1f]/.test(search))fail();
 const q=fold(search.trim()),has=(item,code)=>item.observations.some(o=>o.code===code);
 const rows=review.rows.filter(item=>{
  const row=item.row;if(q&&!fold(row.legajo+' '+(row.employeeName??'')+' '+(row.familyName??'')).includes(q))return false;
  return status==='all'||status==='needs_review'&&item.observations.some(o=>o.review)||status==='cycle'&&(has(item,'cycle_unknown')||has(item,'cycle_other'))||status==='no_record'&&!row.certificate||has(item,status);
 }).sort((a,b)=>(a.row.employeeName??'').localeCompare(b.row.employeeName??'','es')||a.row.legajo.localeCompare(b.row.legajo)||a.key.localeCompare(b.key));
 return Object.freeze({filters:Object.freeze({search:search.trim(),status}),rows:Object.freeze(rows),counts:Object.freeze({records:rows.length,contracts:new Set(rows.map(i=>i.row.contractId)).size,children:rows.filter(i=>!i.row.identityReviewRequired).length,identityReview:rows.filter(i=>i.row.identityReviewRequired).length,needsReview:rows.filter(i=>i.observations.some(o=>o.review)).length,observations:rows.reduce((n,i)=>n+i.observations.filter(o=>o.review).length,0)})});
}
export function schoolingReviewVerifiedSelection(review,selection){
 const canonical=schoolingReview(review?.source,review?.criteria),selected=schoolingReviewSelection(canonical,selection?.filters);
 if(JSON.stringify(canonical)!==JSON.stringify(review)||JSON.stringify(selected)!==JSON.stringify(selection))fail();
 return selected;
}
