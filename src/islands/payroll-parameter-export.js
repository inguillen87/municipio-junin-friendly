import { verifiedParameterProposal, AGREEMENT_LABELS, PARAMETER_STATUSES } from '../../lib/payroll-parameter-contract.js';
import { reportCsv, reportXlsx, reportPdf } from '../../assets/report-document.js';
export function parameterDocument(proposal, queriedAt) {
  const p = verifiedParameterProposal(proposal), d = p.draft;
  if (typeof queriedAt !== 'string' || !Number.isFinite(Date.parse(queriedAt))) throw Error('Falta la fecha de consulta.');
  const decimal = s => (BigInt(s) / 100n).toString() + '.' + (BigInt(s) % 100n).toString().padStart(2, '0');
  return {
    title: 'Propuesta de auxiliares salariales', filename: `municontrol_parametros_${d.validFrom}_${p.id}_v${p.version}`,
    columns: [ ['Convenio', 'text', 29], ['Auxiliar', 'text', 12], ['Clase', 'text', 12], ['Base de escala', 'money', 22], ['Valor propuesto', 'money', 22], ['Desde', 'text', 15], ['Estado', 'text', 25], ['Escala / resolución', 'text', 42] ].map(([label, type, width]) => ({ label, type, width })),
    rows: d.rows.map(row => [String(row.agreementId) + ' · ' + AGREEMENT_LABELS[row.agreementId], String(row.auxiliaryId), row.baseClass, decimal(d.baseAmountCents), decimal(row.newValueCents), d.validFrom, PARAMETER_STATUSES[p.status], d.sourceReference]),
    totals: [], notes: ['Propuesta registrada en MuniControl. No acredita vigencia aplicada, liquidación, cierre ni pago.'],
    metadata: [['Fuente', 'Registro propio de parámetros en Neon'], ['Estado', PARAMETER_STATUSES[p.status]], ['Período', d.validFrom], ['Propuesta', p.id], ['Versión', String(p.version)], ['Escala / resolución', d.sourceReference], ['Redondeo', d.rounding === 'nearest_cent' ? 'Al centavo más próximo' : 'Truncar al centavo'], ['Consultado', queriedAt], ['SHA-256', d.sourceSha256]],
  };
}
export function parameterArtifact(proposal, extension, queriedAt) {
  const doc = parameterDocument(proposal, queriedAt);
  if (!['csv', 'xlsx', 'pdf'].includes(extension)) throw Error('Formato no admitido.');
  // The current PDF renderer supports WinAnsi; do not silently replace names.
  if (extension === 'pdf') {
    const source = JSON.stringify(doc);
    if ([...source].some(c => c.codePointAt(0) > 255 && ![0x20ac,0x2013,0x2014,0x2018,0x2019,0x201c,0x201d,0x2022].includes(c.codePointAt(0)))) throw Error('La referencia contiene caracteres que este PDF no puede conservar. Descargá Excel o CSV.');
  }
  const types = { csv: 'text/csv;charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' };
  return { content: extension === 'csv' ? reportCsv(doc) : extension === 'xlsx' ? reportXlsx(doc) : reportPdf(doc), type: types[extension], filename: doc.filename + '.' + extension };
}
