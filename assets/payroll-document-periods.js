// Filters the returned source catalogue only. Never merges runs or infers payment/closure.
import {sourceReportCatalog,sourceReportTypeLabel} from './payroll-source-report-model.js';
import {civilDate} from './civil-date.js';
const monthNames=Object.freeze(['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']);
export function documentPeriodLabel(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}$/.test(value)||civilDate(value+'-01').slice(0,7)!==value)throw Error('DOCUMENT_PERIOD_INVALID');
 return monthNames[Number(value.slice(5))-1]+' de '+value.slice(0,4);
}
export function documentPeriodOptions(raw,{month='all',type='all'}={}){
 const view=sourceReportCatalog(raw,{month,type});
 if(view.total<raw.items.length)throw Error('DOCUMENT_CATALOG_INVALID');
 const repeated=new Map();for(const row of raw.items){const k=civilDate(row.date)+'|'+row.type;repeated.set(k,(repeated.get(k)||0)+1);}
 const rows=[...view.items].sort((a,b)=>civilDate(b.date).localeCompare(civilDate(a.date))||a.type.localeCompare(b.type)||a.datasetId.localeCompare(b.datasetId));
 return {
  months:view.months.map(value=>({value,label:documentPeriodLabel(value)})),types:view.types.map(value=>({value,label:sourceReportTypeLabel(value)+' ('+value+')'})),
  items:rows.map(row=>({...row,label:civilDate(row.date)+' · '+sourceReportTypeLabel(row.type)+' ('+row.type+') · '+row.statementCount+' legajos · '+({closed:'Cierre informado',open:'Abierta',unknown:'Cierre no informado'})[row.closureStatus]+' · '+row.datasetId.slice(0,8),sameDateAndType:repeated.get(civilDate(row.date)+'|'+row.type)>1})),
  returned:raw.items.length,total:view.total,truncated:view.truncated,matching:rows.length,
  missingMonth:month!=='all'&&!view.months.includes(month),missingType:type!=='all'&&!view.types.includes(type),
 };
}
export function documentPeriodStatus(view){
 return view.matching+' de '+view.returned+' liquidaciones de esta consulta coinciden con el período y tipo.'+
  (view.matching?' Elegí la corrida exacta; no se suman liquidaciones del mes.':' No hay coincidencias; no se cambió el filtro para mostrar otra corrida.')+
  (view.items.some(row=>row.sameDateAndType)?' Hay más de una versión para la misma fecha y tipo: se mantienen separadas por identificador.':'')+
  (view.truncated?' Catálogo limitado: no representa todo el histórico.':'');
}
