import { storedZip } from './clock-dashboard-zip.js';
import { FIXED_TYPES,fixedCoverage,fixedMoney } from './payroll-fixed-novelties-model.js';

const headings=['Período de consulta','Legajo','Agente','Concepto declarado','Centro de costo','Tipo de liquidación','Unidades completas','Importe completo ARS','Importe exacto centavos','Modo forzado','Fundamento forzado','Instrumento','Alta','Vencimiento','Alcance de vigencia','Corte de identidad','Revisión del registro'];
function report(snapshot,options={}){
  if(snapshot?.version!=='payroll-fixed-export.v1'||!/^\d{4}-\d{2}-01$/.test(snapshot.periodMonth)||!Array.isArray(snapshot.rows)||snapshot.rows.length>500
    ||snapshot.total!==snapshot.rows.length||snapshot.effects?.approvalEffect!=='control_export_only'||snapshot.effects.grhMutation!==false||snapshot.effects.payrollCalculated!==false||snapshot.effects.payrollPosted!==false
    ||new Set(snapshot.rows.map(r=>r.recordId)).size!==snapshot.rows.length)throw Error('El control no corresponde a una exportación verificada.');
  const rows=snapshot.rows.map(r=>{const v=r.values,s=r.subject;if(!v||!s||!fixedCoverage(v,snapshot.periodMonth).intersects)throw Error('La vigencia no corresponde al período de exportación.');
    return [snapshot.periodMonth,s.legajo,s.employeeName??'Nombre no informado',v.conceptSourceId,v.costCenterSourceId??'Sin informar',FIXED_TYPES[v.payrollType],v.quantityDecimal??'Sin informar',fixedMoney(v.amountCents),v.amountCents??'Sin informar',v.forced?'Sí':'No',v.forcedReason??'No corresponde',v.legalInstrument,v.validFrom,v.validTo??'Sin vencimiento informado',fixedCoverage(v,snapshot.periodMonth).label,s.sourceCutoff,String(r.version)];});
  return {rows:[headings,...rows],control:[['Control y procedencia','Valor'],['Alcance','Versiones aprobadas vigentes del filtro completo. No sólo la página visible.'],['Uso','Control interno. No es liquidación, archivo bancario ni prueba de pago.'],['Período',snapshot.periodMonth],['Filas exportadas',snapshot.rows.length],['Registros del filtro consultado',options.consultedCount??snapshot.rows.length],['Búsqueda',options.search||'Sin búsqueda'],['Filtro de consulta',({all:'Todos',approved:'Con versión aprobada',pending:'Con propuesta pendiente',rejected:'Última propuesta rechazada',annulled:'Anuladas',partial:'Vigencia parcial en el período'})[options.status||'all']],['Versión','Se exporta la última versión aprobada. Las propuestas pendientes no la sustituyen.'],['Importes y unidades','Se conservan completos; no se calculan, suman ni prorratean. Ausencia no es cero.'],['Códigos','Referencias declaradas; no certifican elegibilidad o reglas salariales.'],['Identidad','Snapshot de identidad verificado nuevamente por el servidor.'],['Huella del resultado',snapshot.snapshotToken]]};
}
const xml=value=>String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const column=index=>{let s='';for(index++;index>0;index=Math.floor((index-1)/26))s=String.fromCharCode(65+(index-1)%26)+s;return s;};
function worksheet(rows,filter=false){
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${rows[0].length}" width="25" customWidth="1"/></cols><sheetData>${rows.map((row,i)=>`<row r="${i+1}">${row.map((value,j)=>`<c r="${column(j)}${i+1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData>${filter?`<autoFilter ref="A1:${column(rows[0].length-1)}${rows.length}"/>`:''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}
export function fixedXlsx(snapshot,options){
  const data=report(snapshot,options),names=['Novedades fijas','Control'];
  return storedZip([
    ['[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="workbook" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name,i)=>`<sheet name="${name}" sheetId="${i+1}" r:id="sheet${i+1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_,i)=>`<Relationship Id="sheet${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`],
    ['xl/worksheets/sheet1.xml',worksheet(data.rows,true)],['xl/worksheets/sheet2.xml',worksheet(data.control)],
  ]);
}
export function fixedCsv(snapshot,options){
  const data=report(snapshot,options);
  // This is a human control file, not an import format. Prefix risky cell text
  // explicitly; CSV quoting alone does not stop spreadsheet formula execution.
  const cell=value=>{let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\ufeff'+[...data.control,[],...data.rows].map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';
}
