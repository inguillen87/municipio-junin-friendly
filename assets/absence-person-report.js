// Informe de lectura completo. Sin datos persistidos ni cambios de licencias o haberes.
import {readAbsencePerson} from './absence-person-reader.js';
import {verifyAbsencePersonResponse,sameAbsencePersonRead} from './absence-person-model.js';
export const ABSENCE_REPORT_LIMIT=5000;
const issuedReports=new WeakSet();
const fail=code=>{throw Object.assign(new Error(code),{code});};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const unchanged=(a,b)=>{
 if(!sameAbsencePersonRead(a,b))fail('ABSENCE_PERSON_SOURCE_CHANGED');
};
export async function collectAbsenceReport(displayed,{signal,read=readAbsencePerson,onProgress=()=>{},now=()=>new Date()}={}){
 if(!signal)fail('ABSENCE_REPORT_SIGNAL_REQUIRED');signal.throwIfAborted();
 const base=structuredClone(displayed);
 const original={resource:'absenceperson',contractId:base.person.contractId,...base.range.requested,
  ...(base.rangeMode!==undefined?{rangeMode:base.rangeMode}:{}),page:base.pagination.page,limit:base.pagination.limit,snapshot:base.snapshot};
 verifyAbsencePersonResponse(base,original);
 if(base.summary.events>ABSENCE_REPORT_LIMIT)fail('ABSENCE_REPORT_TOO_LARGE');
 const query={...original,page:1,limit:50},events=[];let first=null,previousDate=null;
 const request=async q=>{signal.throwIfAborted();const d=await read(q,signal);signal.throwIfAborted();verifyAbsencePersonResponse(d,q);unchanged(base,d);return d;};
 for(let page=1,pageCount=1;page<=pageCount;page++){
  const data=await request({...query,page});if(!first){first=data;pageCount=data.pagination.pages;}
  for(const row of data.events){if(previousDate!==null&&previousDate<=row.date)fail('ABSENCE_REPORT_PAGE_ORDER');previousDate=row.date;events.push(row);}
  if(events.length>ABSENCE_REPORT_LIMIT)fail('ABSENCE_REPORT_TOO_LARGE');
  onProgress({received:events.length,total:base.summary.events,page,pages:data.pagination.pages});
 }
 if(events.length!==base.summary.events)fail('ABSENCE_REPORT_INCOMPLETE');
 const last=await request(query);if(JSON.stringify(last.events)!==JSON.stringify(first.events))fail('ABSENCE_PERSON_SOURCE_CHANGED');
 const stamp=now();if(!(stamp instanceof Date)||!Number.isFinite(+stamp))fail('ABSENCE_REPORT_TIMESTAMP_INVALID');
 const report=freeze({version:'absence-complete-report.v1',anchor:structuredClone(first),query,events:structuredClone(events),checkedAt:stamp.toISOString()});
 issuedReports.add(report);return report;
}
export function requireAbsenceReport(report){if(!issuedReports.has(report))fail('ABSENCE_REPORT_UNVERIFIED');return report;}
export async function recheckAbsenceReport(report,{signal,read=readAbsencePerson}={}){
 requireAbsenceReport(report);signal.throwIfAborted();const current=await read(report.query,signal);signal.throwIfAborted();
 verifyAbsencePersonResponse(current,report.query);unchanged(report.anchor,current);
 if(JSON.stringify(current.events)!==JSON.stringify(report.anchor.events))fail('ABSENCE_PERSON_SOURCE_CHANGED');
 return true;
}
export const absenceReportNotice='Consulta administrativa completa del filtro. No acredita asistencia, licencia aprobada ni descuento salarial. Sin firma digital.';
export const absenceReportCriterion=r=>r.anchor.rangeMode==='overlaps'?'Cruzan el período':'Comienzan en el período';
export const absenceReportQuality=e=>({valid_source_range:'Fechas en orden',until_date_not_reported:'Fin no informado',inverted_source_range:'Fechas invertidas',extended_source_range:'Rango extenso: revisar',invalid_source_date:'Fecha a revisar'}[e.rangeIntegrity]);
const csvCell=value=>{
 let text=value===null?'No informado':String(value);
 if(typeof value==='string'&&/^[\s\uFEFF]*[=+@-]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
};
export function absenceReportCsv(report){
 requireAbsenceReport(report);const d=report.anchor;
 const header=['Nombre','Legajo','Sector al corte','Contrato','Municipio','Desde solicitado','Hasta solicitado','Desde aplicado','Hasta aplicado','Corte de fuente','Criterio','Inicio','Fin de origen','Motivo','Días declarados completos','Control de fecha','Relación con el período','Versión de fuente','Consulta UTC','Alcance'];
 const fixed=[d.person.name,d.person.number,d.person.sector,d.person.contractId,d.tenantId,d.range.requested.from,d.range.requested.to,d.range.effective.from,d.range.effective.to,d.sourceCutoff,absenceReportCriterion(report)];
 const rows=report.events.map(e=>[...fixed,e.date,e.untilDate??'No informado',e.reason,e.declaredDays===null?'No informado':String(e.declaredDays).replace('.',','),absenceReportQuality(e),e.date<d.range.effective.from?'Comenzó antes':'Comienza dentro',d.snapshot,report.checkedAt,absenceReportNotice]);
 if(!rows.length)rows.push([...fixed,'','','Sin eventos en este filtro','','','',d.snapshot,report.checkedAt,absenceReportNotice]);
 return '\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
export function absenceReportFilename(report){requireAbsenceReport(report);return 'ausencias_'+report.anchor.range.effective.from+'_'+report.anchor.range.effective.to+'.csv';}
