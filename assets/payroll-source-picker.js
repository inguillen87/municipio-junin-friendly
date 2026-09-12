/** Read-only selection over the authenticated source catalogue; no inferred payroll. */
import {payrollSourceReport,sourceReportDocument} from './payroll-source-report-model.js';
import {civilDate} from './civil-date.js';
import {DOCUMENT_TYPES} from './payroll-document-library-model.js';
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const keys=['datasetId','date','type','closureStatus','statementCount','lineCount','sourceLabel','payloadHash'];
export const sourceTypeLabel=type=>DOCUMENT_TYPES[type]||`Tipo ${type} (origen)`;
export const sourceClosureLabel=state=>({closed:'Cierre informado',open:'Abierta / preliquidación',unknown:'Cierre no informado'})[state];
export const sourceDateLabel=date=>civilDate(date).split('-').reverse().join('/');
export function sourceCatalogue(raw,filter={}) {
 const data=payrollSourceReport(raw);
 if(data.mode!=='catalog'||data.total<data.items.length||data.truncated!==(data.total>data.items.length))throw Error('El catálogo no informa su cobertura correctamente.');
 const year=String(filter.year||''),month=String(filter.month||''),type=String(filter.type||''),closure=String(filter.closure||''),search=String(filter.search||'').trim();
 if(year&&(!/^\d{4}$/.test(year)||Number(year)<1900||Number(year)>2100)||month&&!/^(0[1-9]|1[0-2])$/.test(month)||type&&!/^[A-Z]$/.test(type)||closure&&!['closed','open','unknown'].includes(closure)||search.length>100)throw Error('Revisá los filtros del catálogo.');
 const items=data.items.filter(item=>(!year||item.date.slice(0,4)===year)&&(!month||item.date.slice(5,7)===month)&&(!type||item.type===type)&&(!closure||item.closureStatus===closure)&&(!search||fold(item.sourceLabel+' '+item.datasetId).includes(fold(search))));
 return {items,loaded:data.items.length,total:data.total,truncated:data.truncated,years:[...new Set(data.items.map(item=>item.date.slice(0,4)))].sort().reverse(),types:[...new Set(data.items.map(item=>item.type))].sort()};
}
export function sourceSelectionMatches(selected,raw) {
 const data=payrollSourceReport(raw);
 return Boolean(selected&&data.mode==='report'&&data.found&&keys.every(key=>selected[key]===data[key]));
}
function reportKey(raw) {
 const data=payrollSourceReport(raw);
 if(data.mode!=='report'||!data.found)throw Error('La liquidación ya no está disponible.');
 return JSON.stringify([keys.map(key=>data[key]),data.reportHash,[...data.rows].sort((a,b)=>a.code.localeCompare(b.code,'en',{numeric:true})||a.code.localeCompare(b.code,'en')).map(row=>[row.code,row.description,row.totalGroup,row.unit,row.sourceRows,row.missingAmounts,row.amount])]);
}
export function sourceReportUnchanged(a,b) { return reportKey(a)===reportKey(b); }
export function selectedSourceDocument(raw,filter={}) {
 const d=payrollSourceReport(raw),doc=sourceReportDocument(d,filter);
 return {...doc,filename:doc.filename+'_'+d.datasetId,metadata:[...doc.metadata.map(([key,value])=>[key,key==='Tipo'?sourceTypeLabel(d.type):value]),['Identificador de conjunto',d.datasetId]],notes:[...doc.notes,`Conjunto: ${d.datasetId}. No es un recibo oficial ni acredita pago.`]};
}
