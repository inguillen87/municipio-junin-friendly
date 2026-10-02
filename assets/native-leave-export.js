import {validateNativeLeaveBootstrap,nativeLeaveSame} from './native-leave-contract.js';
import {nativeLeaveAllocations,NATIVE_LEAVE_STATES,NATIVE_LEAVE_UNITS} from './native-leave-model.js';
import {getTitleViCatalog,reasonPolicyMapping} from './mendoza-title-vi.js';
import {storedZip} from './clock-dashboard-zip.js';

const provisions=getTitleViCatalog().provisions;
const reason=code=>provisions.find(p=>p.id===reasonPolicyMapping(code).provisionId)?.label??'Motivo declarado';
const status=code=>NATIVE_LEAVE_STATES[code];
const profileStatus=code=>({pending:'Pendiente de revisión',approved:'Saldo aprobado',rejected:'Saldo rechazado'})[code];
const mode=code=>({confirmed:'Cantidad declarada con respaldo',not_applicable:'No aplicable con respaldo',unavailable:'Sin declaración aprobada'})[code];
const command=code=>({create:'Crear borrador',update_draft:'Editar borrador',submit:'Enviar a revisión',approve:'Aprobar solicitud',reject:'Rechazar solicitud',cancel:'Cancelar solicitud',profile_propose:'Proponer saldo',profile_approve:'Aprobar saldo',profile_reject:'Rechazar saldo'})[code];
const evidence=code=>({verified:'Verificada',not_required:'No requerida según regla revisada'})[code]??'';
const headers=['Tipo de registro','Referencia','Legajo','Estado','Versión','Código de motivo','Motivo','Inicio','Final inclusive','Hora inicial local','Hora final local','Unidad declarada','Año','Unidades','Saldo total','Reservadas','Aprobadas','Disponibles','Tratamiento del saldo','Acción','Fecha UTC','Responsable','Evidencia','Revisión manual','Control','Valor de control'];
const values=(kind,row)=>[kind,...headers.slice(1).map(key=>row[key]??'')];
const requestRows=(b,row,event=null)=>nativeLeaveAllocations((event??row).payload).map(part=>{
 const r=event??row,p=r.payload;
 return {'Referencia':row.id,'Legajo':b.subject.legajo,'Estado':status(r.status),'Versión':r.version,'Código de motivo':p.reasonCode,'Motivo':reason(p.reasonCode),'Inicio':p.startsOn,'Final inclusive':p.endsOn,'Hora inicial local':p.startsAtLocal,'Hora final local':p.endsAtLocal,'Unidad declarada':NATIVE_LEAVE_UNITS[p.durationUnit],'Año':part.year,'Unidades':part.units,...(event?{'Acción':command(event.command),'Fecha UTC':event.recordedAt,'Responsable':event.actorLabel,'Evidencia':evidence(event.evidenceStatus),'Revisión manual':event.manualValidationConfirmed?'Sí':'No'}:{})};
});
const profileRow=(b,row,event=null)=>{
 const r=event??row,p=r.payload;
 return {'Referencia':row.id,'Legajo':b.subject.legajo,'Estado':profileStatus(r.status),'Versión':r.version,'Código de motivo':p.reasonCode,'Motivo':reason(p.reasonCode),'Unidad declarada':NATIVE_LEAVE_UNITS[p.durationUnit],'Año':p.year,'Saldo total':p.entitledUnits,'Tratamiento del saldo':mode(p.mode),...(event?{'Acción':command(event.command),'Fecha UTC':event.recordedAt,'Responsable':event.actorLabel,'Revisión manual':event.manualValidationConfirmed?'Sí':'No'}:{})};
};
export function assertNativeLeaveExportSame(before,after,contractId){
 validateNativeLeaveBootstrap(before,contractId);validateNativeLeaveBootstrap(after,contractId);
 if(!nativeLeaveSame(before,after))throw Error('El registro cambió. Se actualizó la consulta y no se descargó. Revisá los datos y volvé a descargar.');
 return after;
}
export function nativeLeaveExportTables(snapshot,contractId,exportedAt){
 const b=validateNativeLeaveBootstrap(snapshot,contractId);
 if(typeof exportedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(exportedAt)||!Number.isFinite(Date.parse(exportedAt))||new Date(exportedAt).toISOString()!==exportedAt)throw Error('No se pudo verificar la fecha de la descarga.');
 const requests=b.requests.flatMap(r=>requestRows(b,r).map(row=>values('Solicitud',row)));
 const decisions=b.requests.flatMap(r=>r.history.flatMap(e=>requestRows(b,r,e).map(row=>values('Decisión de solicitud',row))));
 const balances=b.balances.map(p=>values('Saldo',{'Legajo':b.subject.legajo,'Código de motivo':p.reasonCode,'Motivo':reason(p.reasonCode),'Unidad declarada':NATIVE_LEAVE_UNITS[p.durationUnit],'Año':p.year,'Saldo total':p.entitledUnits,'Reservadas':p.reservedUnits,'Aprobadas':p.approvedUnits,'Disponibles':p.availableUnits,'Tratamiento del saldo':mode(p.mode)}));
 const profiles=b.profileProposals.flatMap(r=>[values('Declaración de saldo',profileRow(b,r)),...r.history.map(e=>values('Decisión de saldo',profileRow(b,r,e)))]);
 const control=[['Control','Valor'],['Origen','MuniControl · registro del contrato propio'],['Legajo',b.subject.legajo],['Persona',b.subject.employeeName],['Descarga UTC',exportedAt],['Solicitudes únicas',b.requests.length],['Líneas de solicitudes por año',requests.length],['Decisiones de solicitud',b.requests.reduce((n,r)=>n+r.history.length,0)],['Líneas de decisiones por año',decisions.length],['Saldos',balances.length],['Declaraciones de saldo',b.profileProposals.length],['Consulta completa','Todas las solicitudes, decisiones, declaraciones y saldos; los filtros y la página no recortan el registro'],['Unidades','Días corridos o minutos declarados; no se convierten entre sí'],['Valores ausentes','Celda vacía significa sin informar o no aplicable; cero conserva su valor'],['Historia','Cada decisión conserva los datos de su versión. Una solicitud que cruza un año tiene una línea por año'],['Privacidad','Se excluyen observaciones libres, fundamentos y referencias documentales'],['Alcance','Registro administrativo; no acredita uso efectivo, haberes, descuentos, pagos ni firma digital']];
 return {headers:[...headers],requests,decisions,balances,profiles,control};
}
const csvCell=value=>{const s=String(value??'');return '"'+(/^[\s\uFEFF]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';};
export function nativeLeaveCsv(snapshot,contractId,exportedAt){
 const t=nativeLeaveExportTables(snapshot,contractId,exportedAt);
 const controls=t.control.slice(1).map(([key,value])=>values('Control',{'Control':key,'Valor de control':value}));
 return '\uFEFF'+[t.headers,...t.requests,...t.decisions,...t.balances,...t.profiles,...controls].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
const xml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const column=n=>{let c='';for(n++;n>0;n=Math.floor((n-1)/26))c=String.fromCharCode(65+(n-1)%26)+c;return c;};
const sheet=rows=>'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="'+rows[0].length+'" width="24" customWidth="1"/></cols><sheetData>'+rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>'<c r="'+column(j)+(i+1)+'" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData><autoFilter ref="A1:'+column(rows[0].length-1)+rows.length+'"/></worksheet>';
export function nativeLeaveXlsx(snapshot,contractId,exportedAt){
 const t=nativeLeaveExportTables(snapshot,contractId,exportedAt),names=['Solicitudes','Decisiones','Saldos','Declaraciones','Control'],tables=[...[t.requests,t.decisions,t.balances,t.profiles].map(rows=>[t.headers,...rows]),t.control];
 return storedZip([
  ['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+['/xl/workbook.xml',...names.map((_,i)=>'/xl/worksheets/sheet'+(i+1)+'.xml')].map((part,i)=>'<Override PartName="'+part+'" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.'+(i?'worksheet':'sheet.main')+'+xml"/>').join('')+'</Types>'],
  ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="office" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+names.map((name,i)=>'<sheet name="'+name+'" sheetId="'+(i+1)+'" r:id="sheet'+(i+1)+'"/>').join('')+'</sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+names.map((_,i)=>'<Relationship Id="sheet'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>'],
  ...tables.map((rows,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',sheet(rows)])
 ]);
}
