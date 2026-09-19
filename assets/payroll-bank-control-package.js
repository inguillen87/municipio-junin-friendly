import {storedZip} from './clock-dashboard-zip.js';
import {bankReportData,bankReportFilter,bankObservations} from './payroll-bank-generator-model.js';
import {bankReportXlsx,bankReportPdf} from './payroll-bank-generator-export.js';
import {bankReportReconciliation,bankControlNotes,bankControlSelection} from './payroll-bank-reconciliation.js';
export const BANK_PACKAGE_VERSION='payroll-bank-control-package.v1';
export const BANK_PACKAGE_MAX_BYTES=32*1024*1024;
const encode=text=>new TextEncoder().encode(text);
const cell=value=>'"'+(/^[\s\u0000-\u001f]*[=+@-]/.test(String(value??''))||/^[\t\r\n]/.test(String(value??''))?"'":'')+String(value??'').replaceAll('"','""')+'"';
const csv=rows=>'\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n';
async function sha256(value){if(!globalThis.crypto?.subtle)throw Error('No está disponible el control criptográfico del paquete.');return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encode(value):value))].map(n=>n.toString(16).padStart(2,'0')).join('');}
const stopped=signal=>{if(signal?.aborted)throw Object.assign(Error('La descarga fue cancelada.'),{name:'AbortError'});};
export function bankReconciliationCsv(review){return csv([['Ámbito','Grupo','Filas','Observaciones de fuente','Netos ausentes','Suma informada exacta','Neto total evaluable','Alcance'],...['banks','jurisdictions'].flatMap(kind=>review[kind].map(g=>[kind==='banks'?'Banco':'Jurisdicción',g.label,g.rows,g.observed,g.missingAmounts,g.knownTotal,g.total??'No evaluable','Liquidación completa autorizada, no solamente el filtro']))]);}
export function bankControlExceptionsCsv(view,review){return csv([['Legajo','Observaciones de fuente','Contrastes adicionales','Alcance'],...view.rows.filter(r=>bankControlNotes(review,r)||bankObservations(r)!=='Sin observaciones informadas').map(r=>[r.legajo,bankObservations(r),bankControlNotes(review,r),'Filas del filtro; CBU compartido evaluado contra toda la liquidación'])]);}
export async function bankControlPackage(data,view,queriedAt,{signal}={}){
 stopped(signal);bankControlSelection(data,view);
 if(typeof queriedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(queriedAt)||!Number.isFinite(Date.parse(queriedAt)))throw Error('La fecha de consulta del paquete no es válida.');
 const snapshot=bankReportData({ok:true,data},{resource:'report',datasetId:data.dataset.datasetId}),selected=bankReportFilter(snapshot,view.filters),review=bankReportReconciliation(snapshot);
 if(!selected.rows.length)throw Error('El filtro no contiene filas para descargar.');
 const files=[];let size=0;
 function add(name,content){const bytes=typeof content==='string'?encode(content):content;if(!(bytes instanceof Uint8Array))throw Error('Contenido de paquete inválido.');size+=bytes.byteLength;if(size>BANK_PACKAGE_MAX_BYTES)throw Error('El paquete supera el límite local de 32 MiB. Usá filtros más acotados.');files.push({name,bytes});}
 add('planilla.xlsx',bankReportXlsx(snapshot,selected,queriedAt));stopped(signal);
 add('control.pdf',bankReportPdf(snapshot,selected,queriedAt));stopped(signal);
 add('conciliacion.csv',bankReconciliationCsv(review));add('observaciones.csv',bankControlExceptionsCsv(selected,review));
 add('LEEME.txt','MUNICONTROL - PAQUETE DE CONTROL INTERNO\r\n\r\nNo es una remesa bancaria, una orden de transferencia, una aprobación ni una constancia de pago. No contiene TXT de acreditación.\r\nplanilla.xlsx y control.pdf incluyen todas las filas del filtro. conciliacion.csv cubre la liquidación completa consultada. observaciones.csv conserva las observaciones del filtro; un CBU compartido se contrasta con toda la fuente, no solo la página.\r\nFaltantes, netos cero/negativos y coincidencias de CBU requieren revisión; no se completaron ni corrigieron importes o cuentas. Un CBU compartido puede tener una explicación válida.\r\nmanifiesto.json contiene versiones, alcance y hashes SHA-256 de los demás archivos. La huella sirve para detectar cambios, no es firma digital ni certificación bancaria.\r\nLos archivos contienen información personal y financiera. Compartir únicamente dentro del circuito municipal autorizado. Este ZIP no está cifrado.\r\n');
 const artifacts=[];for(const file of files){stopped(signal);artifacts.push({name:file.name,bytes:file.bytes.byteLength,sha256:await sha256(file.bytes)});}
 const {rowChecks,banks,jurisdictions,...summary}=review;
 const manifest={version:BANK_PACKAGE_VERSION,queriedAt,dataset:{...snapshot.dataset},bankSource:{sourceSha256:snapshot.bankSource.sourceSha256,payloadSha256:snapshot.bankSource.payloadSha256,cutoff:snapshot.bankSource.cutoff},reportHash:snapshot.reportHash,
  controlScope:{official:false,bankTransferGenerated:false,payrollPosted:false,approved:false,signed:false,encrypted:false},
  selection:{rows:selected.rows.length,observed:selected.observed,missingAmounts:selected.missingAmounts,knownTotal:selected.knownTotal,total:selected.total,
   filters:{bank:selected.filters.bank,jurisdiction:selected.filters.jurisdiction,account:selected.filters.account,issues:selected.filters.issues,searchApplied:!!selected.filters.search,searchSha256:await sha256(selected.filters.search)}},
  fullReportSummary:summary,groups:{banks,jurisdictions},normalizedReportSha256:await sha256(JSON.stringify(snapshot)),artifacts};
 add('manifiesto.json',JSON.stringify(manifest,null,2)+'\n');stopped(signal);
 const bytes=storedZip(files.map(f=>[f.name,f.bytes]));if(bytes.byteLength>BANK_PACKAGE_MAX_BYTES)throw Error('El paquete supera el límite local de 32 MiB.');
 const digest=await sha256(bytes);stopped(signal);
 return {bytes,sha256:digest,manifest,filename:'municontrol_control-bancario_'+snapshot.dataset.period+'_'+snapshot.dataset.datasetId.slice(0,8)+'.zip'};
}
