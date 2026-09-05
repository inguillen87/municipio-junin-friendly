import { createPayrollMonthlyCloseApprovedPdf } from './payroll-monthly-close-approved-report.js';

export const PAYROLL_MONTHLY_CLOSE_FOLDER_VERSION = 'payroll-monthly-close-folder.v1';
const artifacts = new WeakMap();
const encoder = new TextEncoder();
const SOURCE_LABELS = Object.freeze({
  'grh-concept-statistics.v1': 'Estadística de conceptos GRH',
  'bank-accreditation-summary.v1': 'Resumen de acreditación bancaria',
  'government-payroll-summary.v1': 'Resumen agregado para Gobierno',
});
const GOVERNMENT_LABELS = Object.freeze({
  earnings: 'Haberes informados',
  employer_contributions: 'Contribuciones patronales',
});

export class PayrollMonthlyCloseFolderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollMonthlyCloseFolderError';
    this.code = code;
  }
}

function csv(rows) {
  return encoder.encode(`\uFEFF${rows.map((row) => row.map((value) => (
    `"${String(value ?? '').replaceAll('"', '""')}"`
  )).join(';')).join('\r\n')}\r\n`);
}

function contextColumns(proof) {
  return [proof.runId, proof.runVersion, proof.period, proof.jurisdiction];
}

function reconciliationCsv(run, proof) {
  const context = contextColumns(proof);
  const rows = [[
    'corrida', 'version', 'periodo', 'jurisdiccion', 'control', 'referencia',
    'grh_centavos', 'comparado_centavos', 'diferencia_centavos', 'resultado',
  ]];
  [...run.reconciliation.comparisons]
    .sort((left, right) => left.repartitionCode < right.repartitionCode ? -1 : left.repartitionCode > right.repartitionCode ? 1 : 0)
    .forEach((comparison) => rows.push([
      ...context, 'Banco por repartición', comparison.repartitionCode,
      comparison.reportedEarningsLessRetentionsCents, comparison.reportedBankNetCents,
      comparison.differenceCents, 'Coincidencia exacta',
    ]));
  rows.push([
    ...context, 'Total banco', 'Total del cierre',
    run.totals.reportedEarningsLessRetentionsCents, run.totals.reportedBankNetCents,
    run.totals.differenceCents, 'Coincidencia exacta',
  ]);
  Object.keys(GOVERNMENT_LABELS).forEach((key) => {
    const comparison = run.reconciliation.governmentComparisons.find((item) => item.comparisonKey === key);
    rows.push([
      ...context, 'Gobierno', GOVERNMENT_LABELS[key], comparison.reportedGrhCents,
      comparison.reportedGovernmentCents, comparison.differenceCents, 'Coincidencia exacta',
    ]);
  });
  return csv(rows);
}

function sourcesCsv(run, proof) {
  return csv([
    ['corrida', 'version', 'periodo', 'jurisdiccion', 'fuente_registrada', 'registros', 'bytes_originales', 'huella_hmac_original'],
    ...Object.entries(SOURCE_LABELS).map(([key, label]) => {
      const source = run.sources.find((item) => item.definitionKey === key);
      return [...contextColumns(proof), label, source.recordCount, source.byteLength, source.contentHmacSha256];
    }),
  ]);
}

function readme(run, proof) {
  return encoder.encode([
    'MuniControl - Carpeta de respaldo del cierre',
    '',
    `Período: ${proof.period} | Jurisdicción: J${proof.jurisdiction}`,
    `Corrida: ${proof.runId} | Versión: ${proof.runVersion}`,
    `Aprobación informada por el servidor: ${proof.decidedAt}`,
    `Referencia del conjunto de fuentes: ${run.sourceSetSha256}`,
    '',
    'CONTENIDO',
    'copia-local-cierre.pdf: copia local del estado aprobado y conciliado informado por el servidor.',
    'conciliacion.csv: controles agregados por repartición y Gobierno de esta misma corrida.',
    'fuentes.csv: inventario de las tres fuentes registradas; no contiene los archivos originales.',
    '',
    'ALCANCE Y LIMITES',
    'Respaldo local sin firma digital ni autenticidad verificable fuera de MuniControl.',
    'No es la carpeta mensual completa ni una constancia de entrega, recepción o presentación.',
    'No incluye los originales de GRH, archivos para el banco, ART, OSEP ni F.931/LSD.',
    'No es recibo de sueldo, orden de pago ni constancia fiscal. No acredita pagos ni certifica el neto salarial.',
    'No transmite datos, no modifica GRH ni registra una nueva aprobación.',
    'Los CSV son extractos derivados del detalle autorizado, no copias byte a byte de las fuentes.',
    'Las huellas HMAC identifican las fuentes originales en MuniControl; no son hashes de los archivos de esta carpeta ni firmas digitales.',
    'Importes expresados en centavos enteros, sin redondeo. Importar esas columnas como texto para conservar todos los dígitos en una planilla.',
    'Consultar la corrida vigente dentro de MuniControl antes de usar este respaldo.',
    '',
    `Formato del respaldo: ${PAYROLL_MONTHLY_CLOSE_FOLDER_VERSION}`,
    '',
  ].join('\r\n'));
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function joinBytes(parts) {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  parts.forEach((part) => { bytes.set(part, offset); offset += part.byteLength; });
  return bytes;
}

// Same stored-ZIP layout as the office exporters; fixed DOS date, no wall clock or filenames from uploads.
function storedZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = encoder.encode(name);
    const checksum = crc32(data);
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(12, 0x0021, true);
    view.setUint32(14, checksum, true);
    view.setUint32(18, data.byteLength, true);
    view.setUint32(22, data.byteLength, true);
    view.setUint16(26, nameBytes.byteLength, true);
    local.push(header, nameBytes, data);
    const directory = new Uint8Array(46);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true);
    directoryView.setUint16(4, 20, true);
    directoryView.setUint16(6, 20, true);
    directoryView.setUint16(8, 0x0800, true);
    directoryView.setUint16(14, 0x0021, true);
    directoryView.setUint32(16, checksum, true);
    directoryView.setUint32(20, data.byteLength, true);
    directoryView.setUint32(24, data.byteLength, true);
    directoryView.setUint16(28, nameBytes.byteLength, true);
    directoryView.setUint32(42, offset, true);
    central.push(directory, nameBytes);
    offset += header.byteLength + nameBytes.byteLength + data.byteLength;
  }
  const directoryBytes = joinBytes(central);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directoryBytes.byteLength, true);
  endView.setUint32(16, offset, true);
  return joinBytes([...local, directoryBytes, end]);
}

export function createPayrollMonthlyCloseFolder(run) {
  // The existing PDF gate validates approval, exact amounts, sources and the absence of personal fields.
  const proof = createPayrollMonthlyCloseApprovedPdf(run);
  const bytes = storedZip([
    ['copia-local-cierre.pdf', proof.bytes],
    ['conciliacion.csv', reconciliationCsv(run, proof)],
    ['fuentes.csv', sourcesCsv(run, proof)],
    ['LEEME.txt', readme(run, proof)],
  ]);
  const artifact = Object.freeze({
    contractVersion: PAYROLL_MONTHLY_CLOSE_FOLDER_VERSION,
    runId: proof.runId,
    runVersion: proof.runVersion,
    period: proof.period,
    jurisdiction: proof.jurisdiction,
    verificationStatus: proof.verificationStatus,
    containsPersonalRecords: false,
    mimeType: 'application/zip',
    fileName: `municontrol_respaldo-cierre_${proof.period}_j${proof.jurisdiction}_${proof.runId}_v${proof.runVersion}.zip`,
    bytes,
  });
  artifacts.set(artifact, crc32(bytes));
  return artifact;
}

export function downloadPayrollMonthlyCloseFolder(artifact, dependencies = {}) {
  if (!artifact || !Object.isFrozen(artifact) || !artifacts.has(artifact)
      || !(artifact.bytes instanceof Uint8Array) || artifacts.get(artifact) !== crc32(artifact.bytes)) {
    throw new PayrollMonthlyCloseFolderError('MONTHLY_CLOSE_FOLDER_INTEGRITY_INVALID', 'La carpeta no supera el control de integridad. Volvé a generarla desde el cierre.');
  }
  const documentImpl = dependencies.documentImpl ?? globalThis.document;
  const urlApi = dependencies.urlApi ?? globalThis.URL;
  const BlobImpl = dependencies.BlobImpl ?? globalThis.Blob;
  if (!documentImpl?.createElement || !documentImpl.body?.appendChild
      || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL || !BlobImpl) {
    throw new PayrollMonthlyCloseFolderError('MONTHLY_CLOSE_FOLDER_DOWNLOAD_UNAVAILABLE', 'La descarga no está disponible en este navegador. Probá nuevamente en un navegador compatible.');
  }
  const href = urlApi.createObjectURL(new BlobImpl([artifact.bytes], { type: artifact.mimeType }));
  let anchor;
  try {
    anchor = documentImpl.createElement('a');
    anchor.href = href;
    anchor.download = artifact.fileName;
    anchor.hidden = true;
    documentImpl.body.appendChild(anchor);
    anchor.click();
  } finally {
    try { anchor?.remove(); } finally { urlApi.revokeObjectURL(href); }
  }
  return artifact.fileName;
}
