import {createRrhhReportSnapshot} from './rrhh-report-pack.js';
const valid=new WeakSet();
export const ANALYSIS_KINDS=Object.freeze(['sectores','movimientos','ausencias']);
const counts=(label,key,width=22)=>({label,key,type:'integer',width});
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x}
export function analysisModel(source,filter={}){
 const snap=createRrhhReportSnapshot(source,{generatedAt:new Date().toISOString()});
 const kind=filter.kind??'sectores';if(!ANALYSIS_KINDS.includes(kind))throw Error('Elegí un reporte disponible');
 const search=String(filter.search??'').trim();if(search.length>100)throw Error('La búsqueda admite hasta 100 caracteres');
 const fold=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
 const sort=filter.sort??'label';if(!['label','value-desc','value-asc'].includes(sort))throw Error('Orden inválido');
 let rows,columns,title,note,measure,totals;
 if(kind==='sectores'){
  rows=snap.workforce.activeSectors.map((r,i)=>({id:String(i),label:r.label,value:r.value,values:[r.label,r.value]}));
  columns=[{label:'Sector',key:'label',type:'text',width:52},counts('Legajos activos al corte','value')];title='Dotación activa por sector';measure='legajos activos al corte';
  note='Distribución del padrón agregado al corte. No acredita altas o bajas posteriores ni personas únicas. La búsqueda no cambia el padrón de referencia.';
  totals=[1];
 }else if(kind==='movimientos'){
  rows=snap.management.yearly.map(r=>({id:String(r.year),label:String(r.year),value:r.hires,year:r.year,values:[r.year,r.hires,r.exits,r.balance,r.partial?'Período parcial':'Año completo']}));
  columns=[counts('Año','year',12),counts('Altas','hires',16),counts('Bajas','exits',16),counts('Balance registral','balance',22),{label:'Cobertura',type:'text',width:26}];title='Altas y bajas por año';measure='altas registradas';
  note='Movimientos administrativos, no productividad. Los extremos parciales se identifican y no se extrapolan como años completos.';totals=[1,2,3];
 }else{
  rows=snap.absence.yearly.map(r=>({id:String(r.year),label:String(r.year),value:r.events,year:r.year,values:[r.year,r.events,r.employeesAffected,r.partial?'Período parcial':'Año completo']}));
  columns=[counts('Año','year',12),counts('Eventos de ausencia','events',25),counts('Personas en ese año','persons',25),{label:'Cobertura',type:'text',width:26}];title='Ausencias registradas por año';measure='eventos de ausencia';
  note='Eventos, no días perdidos ni tasa de ausentismo. Una persona puede figurar en varios años: no se suman las personas anuales como personas únicas del período.';totals=[1];
 }
 const availableYears=rows.filter(r=>r.year).map(r=>r.year);
 const year=k=>{const v=filter[k];if(v===null||v===undefined||v==='')return null;if(!/^\d{4}$/.test(String(v))||!availableYears.includes(Number(v)))throw Error('Elegí un año disponible en la fuente');return Number(v)};
 const from=year('from'),to=year('to');if(from!==null&&to!==null&&from>to)throw Error('El año inicial no puede superar al final');
 const allCount=rows.length;
 rows=rows.filter(r=>(!search||fold(r.values.join(' ')).includes(fold(search)))&&(from===null||r.year>=from)&&(to===null||r.year<=to));
 rows.sort((a,b)=>sort==='label'?a.label.localeCompare(b.label,'es',{numeric:true}):((sort==='value-desc'?b.value-a.value:a.value-b.value)||a.label.localeCompare(b.label,'es')));
 const model=freeze({version:'report-analysis.v1',kind,title,note,measure,columns,rows,totals,allCount,availableYears,filter:{search,sort,from,to},source:snap.source,jurisdiction:snap.jurisdiction,generatedAt:snap.generatedAt,referenceActive:snap.workforce.active,filteredValue:rows.reduce((s,r)=>s+r.value,0),containsPersonalRows:false});
 valid.add(model);return model;
}
export function assertAnalysis(model){if(!valid.has(model))throw Error('Consultá una fuente válida antes de exportar');return model}
export function analysisDocument(model){assertAnalysis(model);return{title:model.title,columns:model.columns,rows:model.rows.map(r=>r.values),totals:model.totals,notes:[model.note,'Filtro: '+(model.filter.search||'Sin búsqueda')+' · Años: '+(model.filter.from||'inicio disponible')+' a '+(model.filter.to||'último disponible')],metadata:[['Municipio',model.jurisdiction.municipality],['Corte de la fuente',model.source.cutoffDate],['Fuente',model.source.dataset],['SHA-256',model.source.sha256],['Generado',model.generatedAt],['Alcance','Datos agregados; no recibo, pago ni presentación fiscal'],['Filas del filtro',model.rows.length]],filename:'municontrol_'+model.kind+'_'+model.source.cutoffDate}}
