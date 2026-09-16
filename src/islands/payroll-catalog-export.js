import { verifyCatalogResponse } from '../../lib/payroll-catalog-contract.js';
import { AGREEMENT_LABELS } from '../../lib/payroll-parameter-contract.js';
import { reportCsv, reportXlsx, reportPdf } from '../../assets/report-document.js';
export function catalogDocument(response, queriedAt) {
  const c = verifyCatalogResponse(response).catalog;
  if (!c || !Number.isFinite(Date.parse(queriedAt))) throw Error('Falta la consulta versionada del catálogo.');
  const decimal = s => (BigInt(s)/100n).toString()+'.'+(BigInt(s)%100n).toString().padStart(2,'0');
  return { title:'Auxiliares salariales activados',filename:`municontrol_catalogo_${c.period}_r${c.revision}`,
    columns:[['Convenio','text',27],['Auxiliar','text',11],['Clase','text',12],['Valor vigente','money',23],['Vigente desde','text',17],['Revisión de alta','integer',13],['Escala / resolución','text',45]].map(([label,type,width])=>({label,type,width})),
    rows:c.rows.map(r=>[`${r.agreementId} · ${AGREEMENT_LABELS[r.agreementId]}`,String(r.auxiliaryId),r.baseClass,decimal(r.newValueCents),r.validFrom,r.activationRevision,r.sourceReference]),
    metadata:[['Fuente','Catálogo propio de auxiliares activados en Neon'],['Período',c.period],['Estado','Valores activados · no constituye una liquidación'],['Revisión del catálogo',String(c.revision)],['Consultado',queriedAt]],
    totals:[],notes:[`Período ${c.period}. Revisión histórica ${c.revision}. No se suman auxiliares de distintos convenios.`,
      'Los valores persisten hasta la siguiente vigencia del mismo auxiliar y convenio. No certifica sueldo calculado, cierre ni pago.'],
  };
}
export function catalogArtifact(response, format, queriedAt) {
  if (!['xlsx','csv','pdf'].includes(format)) throw Error('Formato no admitido.');
  const d = catalogDocument(response,queriedAt);
  if (format==='pdf' && [...JSON.stringify(d)].some(c=>c.codePointAt(0)>255 && ![0x20ac,0x2013,0x2014,0x2018,0x2019,0x201c,0x201d,0x2022].includes(c.codePointAt(0)))) throw Error('La referencia requiere Excel o CSV para conservar sus caracteres.');
  return {filename:d.filename+'.'+format,type:{xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',csv:'text/csv;charset=utf-8',pdf:'application/pdf'}[format],
    content:format==='xlsx'?reportXlsx(d):format==='csv'?reportCsv(d):reportPdf(d)};
}
