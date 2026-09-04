export const PAYROLL_MONTHLY_CLOSE_APPROVED_PROOF_VERSION = 'payroll-monthly-close-approved-proof.v1';

const SOURCE_CONTRACT_VERSION = 'payroll-monthly-close-run.v1';
const MIME_PDF = 'application/pdf';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const INTEGER = /^(?:0|-?[1-9][0-9]*)$/;
const REPARTITION = /^[A-Z0-9][A-Z0-9._/-]{0,15}$/i;
const ROLE_KEY = /^[A-Z][A-Z0-9_]{1,63}$/;
const MIN_INT64 = -(2n ** 63n);
const MAX_INT64 = (2n ** 63n) - 1n;

const SOURCE_SPECS = Object.freeze({
  'grh-concept-statistics.v1': Object.freeze({
    sourceKind: 'grh_observed',
    label: 'Estadística de conceptos GRH',
  }),
  'bank-accreditation-summary.v1': Object.freeze({
    sourceKind: 'bank_control',
    label: 'Resumen de acreditación bancaria',
  }),
  'government-payroll-summary.v1': Object.freeze({
    sourceKind: 'government_control',
    label: 'Resumen agregado para Gobierno',
  }),
});

const SOURCE_ORDER = Object.freeze(Object.keys(SOURCE_SPECS));
const GOVERNMENT_LABELS = Object.freeze({
  earnings: 'Haberes informados',
  employer_contributions: 'Contribuciones patronales',
});
const SENSITIVE_KEYS = new Set([
  'dni', 'cuil', 'cbu', 'email', 'employeeid', 'legajo', 'name', 'filename',
  'originalname', 'rawbytes', 'rawcontent', 'accountnumber',
]);
const artifactIntegrity = new WeakMap();

export class PayrollMonthlyCloseApprovedProofError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollMonthlyCloseApprovedProofError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollMonthlyCloseApprovedProofError(code, message);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function int64(value) {
  if (typeof value !== 'string' || !INTEGER.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed >= MIN_INT64 && parsed <= MAX_INT64 ? parsed : null;
  } catch {
    return null;
  }
}

function normalizedIso(value) {
  if (typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function sensitiveKeyIn(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = sensitiveKeyIn(item);
      if (found) return found;
    }
    return '';
  }
  if (!isObject(value)) return '';
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_KEYS.has(normalized)) return key;
    const found = sensitiveKeyIn(item);
    if (found) return found;
  }
  return '';
}

function exactTotals(totals) {
  if (!isObject(totals)) return null;
  const reported = int64(totals.reportedEarningsLessRetentionsCents);
  const bank = int64(totals.reportedBankNetCents);
  const difference = int64(totals.differenceCents);
  if (reported === null || bank === null || difference !== 0n
      || reported !== bank || reported - bank !== difference) return null;
  return { reported, bank, difference };
}

function validateSources(run) {
  if (!Array.isArray(run.sources) || run.sources.length !== SOURCE_ORDER.length) {
    fail('APPROVED_PROOF_SOURCES_INVALID', 'El cierre no conserva exactamente las tres fuentes agregadas.');
  }
  const byDefinition = new Map();
  run.sources.forEach((source) => {
    const spec = isObject(source) ? SOURCE_SPECS[source.definitionKey] : null;
    if (!spec || byDefinition.has(source.definitionKey)
        || source.sourceKind !== spec.sourceKind
        || !SHA256.test(String(source.contentHmacSha256 || ''))
        || !SHA256.test(String(source.manifestSha256 || ''))
        || !Number.isSafeInteger(source.byteLength) || source.byteLength < 1
        || !Number.isSafeInteger(source.recordCount) || source.recordCount < 1) {
      fail('APPROVED_PROOF_SOURCES_INVALID', 'La evidencia de fuentes no cumple el contrato certificado.');
    }
    byDefinition.set(source.definitionKey, source);
  });
  return SOURCE_ORDER.map((definitionKey) => {
    const source = byDefinition.get(definitionKey);
    if (!source) fail('APPROVED_PROOF_SOURCES_INVALID', 'Falta una fuente requerida para el comprobante.');
    return Object.freeze({
      definitionKey,
      label: SOURCE_SPECS[definitionKey].label,
      recordCount: source.recordCount,
      byteLength: source.byteLength,
      contentHmacSha256: source.contentHmacSha256,
      manifestSha256: source.manifestSha256,
    });
  });
}

function validateReconciliation(run, totals) {
  const reconciliation = run.reconciliation;
  if (!isObject(reconciliation)
      || reconciliation.basis !== 'three_source_exact_aggregate_reconciliation'
      || reconciliation.formula !== 'haberes_rem + haberes_no_rem + asignaciones_familiares - retenciones'
      || reconciliation.toleranceCents !== '0'
      || reconciliation.status !== 'matched' || reconciliation.matched !== true
      || reconciliation.rulesInferred !== false
      || reconciliation.governmentSummaryCompared !== true
      || reconciliation.payrollNetCertified !== false
      || !Array.isArray(reconciliation.blockingIssues)
      || reconciliation.blockingIssues.length !== 0) {
    fail('APPROVED_PROOF_RECONCILIATION_INVALID', 'La conciliación no está cerrada y validada al centavo.');
  }
  const reconciliationTotals = exactTotals(reconciliation.totals);
  if (!reconciliationTotals
      || reconciliationTotals.reported !== totals.reported
      || reconciliationTotals.bank !== totals.bank) {
    fail('APPROVED_PROOF_TOTALS_INVALID', 'Los totales del cierre y la conciliación no coinciden.');
  }
  if (!Array.isArray(reconciliation.comparisons) || reconciliation.comparisons.length < 1) {
    fail('APPROVED_PROOF_RECONCILIATION_INVALID', 'No hay reparticiones conciliadas para respaldar el cierre.');
  }
  const codes = new Set();
  let reportedSum = 0n;
  let bankSum = 0n;
  for (const comparison of reconciliation.comparisons) {
    const reported = int64(comparison?.reportedEarningsLessRetentionsCents);
    const bank = int64(comparison?.reportedBankNetCents);
    const difference = int64(comparison?.differenceCents);
    if (!isObject(comparison) || !REPARTITION.test(String(comparison.repartitionCode || ''))
        || codes.has(comparison.repartitionCode)
        || reported === null || bank === null || difference !== 0n || reported !== bank
        || comparison.matches !== true
        || !Array.isArray(comparison.issueCodes) || comparison.issueCodes.length !== 0) {
      fail('APPROVED_PROOF_RECONCILIATION_INVALID', 'Una repartición no está conciliada exactamente.');
    }
    codes.add(comparison.repartitionCode);
    reportedSum += reported;
    bankSum += bank;
  }
  if (reportedSum !== totals.reported || bankSum !== totals.bank) {
    fail('APPROVED_PROOF_TOTALS_INVALID', 'La suma por repartición no coincide con el total aprobado.');
  }
  if (!Array.isArray(reconciliation.governmentComparisons)
      || reconciliation.governmentComparisons.length !== 2) {
    fail('APPROVED_PROOF_GOVERNMENT_INVALID', 'El control agregado de Gobierno no está completo.');
  }
  const governmentKeys = new Set();
  const governmentComparisons = reconciliation.governmentComparisons.map((comparison) => {
    const key = comparison?.comparisonKey;
    const grh = int64(comparison?.reportedGrhCents);
    const government = int64(comparison?.reportedGovernmentCents);
    const difference = int64(comparison?.differenceCents);
    if (!isObject(comparison) || !Object.hasOwn(GOVERNMENT_LABELS, key)
        || governmentKeys.has(key) || grh === null || government === null
        || difference !== 0n || grh !== government || comparison.matches !== true
        || comparison.issueCode !== null) {
      fail('APPROVED_PROOF_GOVERNMENT_INVALID', 'El control agregado de Gobierno conserva diferencias o datos incompletos.');
    }
    governmentKeys.add(key);
    return Object.freeze({ key, label: GOVERNMENT_LABELS[key], grh, government });
  }).sort((left, right) => Object.keys(GOVERNMENT_LABELS).indexOf(left.key)
    - Object.keys(GOVERNMENT_LABELS).indexOf(right.key));
  if (governmentKeys.size !== 2) {
    fail('APPROVED_PROOF_GOVERNMENT_INVALID', 'Falta un control agregado de Gobierno.');
  }
  return Object.freeze({ repartitionCount: codes.size, governmentComparisons });
}

function approvalEvidence(run) {
  if (!Array.isArray(run.timeline) || run.timeline.length < 3) {
    fail('APPROVED_PROOF_APPROVAL_INVALID', 'No hay trazabilidad suficiente de la aprobación.');
  }
  const event = run.timeline.at(-1);
  const eventTime = normalizedIso(event?.occurredAt);
  const decidedAt = normalizedIso(run.decidedAt);
  if (!isObject(event) || event.command !== 'approve'
      || event.fromStatus !== 'submitted' || event.toStatus !== 'approved'
      || event.expectedVersion !== run.version - 1
      || event.resultingVersion !== run.version
      || event.reasonCode !== 'approved_by_checker'
      || !ROLE_KEY.test(String(event.actorRoleKey || ''))
      || !SHA256.test(String(event.eventSha256 || ''))
      || !eventTime || !decidedAt || eventTime !== decidedAt) {
    fail('APPROVED_PROOF_APPROVAL_INVALID', 'La aprobación final no coincide con la versión y hora decididas por el servidor.');
  }
  return Object.freeze({
    actorRoleKey: event.actorRoleKey,
    eventSha256: event.eventSha256,
    decidedAt,
  });
}

function approvedContext(run) {
  const sensitiveKey = sensitiveKeyIn(run);
  if (sensitiveKey) {
    fail('APPROVED_PROOF_PII_DETECTED', `El cierre contiene un campo no permitido para este comprobante (${sensitiveKey}).`);
  }
  if (!isObject(run) || !UUID.test(String(run.id || ''))
      || run.contractVersion !== SOURCE_CONTRACT_VERSION
      || !PERIOD.test(String(run.period || ''))
      || !['42', '55'].includes(String(run.jurisdiction))
      || run.status !== 'approved' || run.closeApproved !== true
      || !Number.isSafeInteger(run.version) || run.version < 3
      || run.sourceCount !== 3
      || run.mismatchCount !== 0 || run.blockingIssueCount !== 0
      || !Array.isArray(run.blockingIssues) || run.blockingIssues.length !== 0
      || !SHA256.test(String(run.sourceSetSha256 || ''))) {
    fail('APPROVED_PROOF_NOT_AUTHORIZED', 'Sólo un cierre aprobado, conciliado y sin bloqueos puede emitir comprobante.');
  }
  const totals = exactTotals(run.totals);
  if (!totals) fail('APPROVED_PROOF_TOTALS_INVALID', 'Los totales aprobados no coinciden al centavo.');
  const reconciliation = validateReconciliation(run, totals);
  const sources = validateSources(run);
  const approval = approvalEvidence(run);
  return Object.freeze({
    runId: run.id,
    runVersion: run.version,
    period: run.period,
    jurisdiction: String(run.jurisdiction),
    sourceSetSha256: run.sourceSetSha256,
    totals: Object.freeze(totals),
    reconciliation,
    sources: Object.freeze(sources),
    approval,
  });
}

export function isPayrollMonthlyCloseApprovedProofReady(run) {
  try {
    approvedContext(run);
    return true;
  } catch {
    return false;
  }
}

function joinBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.byteLength;
  });
  return output;
}

function latinBytes(value) {
  const normalized = String(value)
    .replaceAll('–', '-').replaceAll('—', '-').replaceAll('“', '"').replaceAll('”', '"')
    .replaceAll('’', "'").replaceAll('…', '...');
  const output = new Uint8Array(normalized.length);
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    output[index] = code <= 255 ? code : 63;
  }
  return output;
}

function pdfLiteral(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(')
    .replaceAll(')', '\\)').replace(/[\r\n]+/g, ' ');
}

function formatArs(cents) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '- ' : ''}$ ${whole},${fraction}`;
}

function serverUtcLabel(iso) {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

function pdfDocument(context) {
  const commands = [];
  const color = {
    navy: '0.035 0.157 0.224', green: '0.035 0.502 0.459', ink: '0.075 0.157 0.208',
    muted: '0.365 0.435 0.475', line: '0.820 0.855 0.843', soft: '0.965 0.976 0.973',
    greenSoft: '0.914 0.969 0.953', white: '1 1 1',
  };
  const rect = (x, y, width, height, fill, stroke = null) => {
    commands.push('q');
    if (fill) commands.push(`${fill} rg`);
    if (stroke) commands.push(`${stroke} RG 0.7 w`);
    commands.push(`${x} ${y} ${width} ${height} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`);
  };
  const text = (x, y, value, size = 9, font = 'F1', fill = color.ink) => {
    commands.push(`BT /${font} ${size} Tf ${fill} rg 1 0 0 1 ${x} ${y} Tm (${pdfLiteral(value)}) Tj ET`);
  };
  const rightText = (right, y, value, size = 9, font = 'F1', fill = color.ink) => {
    const estimated = String(value).length * size * 0.49;
    text(Math.max(20, right - estimated), y, value, size, font, fill);
  };
  const splitHash = (x, y, value, size = 6.5) => {
    text(x, y, value.slice(0, 32), size, 'F1', color.ink);
    text(x, y - 10, value.slice(32), size, 'F1', color.ink);
  };

  rect(0, 762, 595, 80, color.navy);
  text(38, 807, 'MuniControl', 21, 'F2', color.white);
  text(38, 785, 'COMPROBANTE INTERNO DE CIERRE APROBADO', 11, 'F2', color.white);
  text(38, 770, 'Evidencia agregada, determinista y sin datos personales', 8, 'F1', color.white);

  rect(38, 718, 519, 28, color.greenSoft, color.green);
  text(51, 728, 'APROBADA Y CONCILIADA AL CENTAVO', 10, 'F2', color.green);

  rect(38, 669, 250, 34, color.soft, color.line);
  text(50, 689, 'PERIODO / JURISDICCION', 7, 'F2', color.muted);
  text(50, 676, `${context.period} / J${context.jurisdiction}`, 10, 'F2', color.navy);
  rect(307, 669, 250, 34, color.soft, color.line);
  text(319, 689, 'CORRIDA / VERSION', 7, 'F2', color.muted);
  text(319, 676, `${context.runId} / v${context.runVersion}`, 7, 'F2', color.navy);

  text(38, 642, 'Totales del cierre', 13, 'F2', color.navy);
  const totalCards = [
    ['CONCEPTOS', formatArs(context.totals.reported)],
    ['BANCO', formatArs(context.totals.bank)],
    ['DIFERENCIA', formatArs(context.totals.difference)],
  ];
  totalCards.forEach(([label, value], index) => {
    const x = 38 + (index * 176);
    rect(x, 593, 165, 36, index === 2 ? color.greenSoft : color.soft, index === 2 ? color.green : color.line);
    text(x + 10, 617, label, 7, 'F2', color.muted);
    text(x + 10, 601, value, 10, 'F2', index === 2 ? color.green : color.navy);
  });
  text(38, 571, `${context.reconciliation.repartitionCount} reparticiones conciliadas; tolerancia: $ 0,00.`, 8, 'F1', color.ink);

  text(38, 546, 'Control agregado de Gobierno', 12, 'F2', color.navy);
  context.reconciliation.governmentComparisons.forEach((comparison, index) => {
    const y = 516 - (index * 25);
    rect(38, y, 519, 22, index % 2 ? color.soft : color.white, color.line);
    text(48, y + 7, comparison.label, 8, 'F2', color.navy);
    rightText(547, y + 7, `${formatArs(comparison.grh)} = ${formatArs(comparison.government)}`, 8, 'F1', color.green);
  });

  text(38, 459, 'Trazabilidad de fuentes agregadas', 12, 'F2', color.navy);
  text(38, 441, 'Huella del conjunto', 7, 'F2', color.muted);
  splitHash(132, 441, context.sourceSetSha256);
  context.sources.forEach((source, index) => {
    const y = 400 - (index * 52);
    text(38, y, source.label, 8, 'F2', color.navy);
    const recordLabel = source.recordCount === 1 ? 'registro' : 'registros';
    rightText(557, y, `${source.recordCount} ${recordLabel} / ${source.byteLength} bytes`, 7, 'F1', color.muted);
    text(38, y - 13, 'HMAC-SHA-256', 6.5, 'F2', color.muted);
    splitHash(124, y - 13, source.contentHmacSha256);
  });

  rect(38, 157, 519, 76, color.greenSoft, color.green);
  text(51, 215, 'APROBACION TRAZABLE', 8, 'F2', color.green);
  text(51, 198, `Rol revisor: ${context.approval.actorRoleKey}`, 8, 'F2', color.navy);
  text(51, 183, `Fecha y hora del servidor: ${serverUtcLabel(context.approval.decidedAt)}`, 8, 'F1', color.ink);
  text(51, 169, 'Huella del evento', 6.5, 'F2', color.muted);
  splitHash(135, 169, context.approval.eventSha256);

  rect(38, 70, 519, 70, color.soft, color.line);
  text(51, 124, 'ALCANCE', 7, 'F2', color.green);
  text(51, 110, 'Comprobante interno agregado. No es recibo de sueldo, orden de pago ni archivo bancario.', 7.5);
  text(51, 97, 'No es F.931/LSD ni constancia fiscal. No transmite datos ni modifica GRH o PostgreSQL.', 7.5);
  text(51, 84, 'La aprobación corresponde exclusivamente a esta corrida, versión y evidencia identificada.', 7.5);

  text(38, 43, `Contrato: ${PAYROLL_MONTHLY_CLOSE_APPROVED_PROOF_VERSION}`, 7, 'F1', color.muted);
  rightText(557, 43, 'Municipalidad de Junín - Página 1 de 1', 7, 'F2', color.navy);

  const contentBytes = latinBytes(`${commands.join('\n')}\n`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    joinBytes([latinBytes(`<< /Length ${contentBytes.byteLength} >>\nstream\n`), contentBytes, latinBytes('endstream')]),
    `<< /Title (${pdfLiteral(`Cierre aprobado ${context.period} - J${context.jurisdiction}`)}) /Author (MuniControl) /Subject (Comprobante interno agregado sin datos personales) /Creator (MuniControl) /Producer (MuniControl) >>`,
  ];
  const header = latinBytes('%PDF-1.4\n%âãÏÓ\n');
  const parts = [header];
  const offsets = [0];
  let offset = header.byteLength;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const body = object instanceof Uint8Array ? object : latinBytes(object);
    const wrapped = joinBytes([latinBytes(`${index + 1} 0 obj\n`), body, latinBytes('\nendobj\n')]);
    parts.push(wrapped);
    offset += wrapped.byteLength;
  });
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  offsets.slice(1).forEach((objectOffset) => {
    xref.push(`${String(objectOffset).padStart(10, '0')} 00000 n \n`);
  });
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  parts.push(latinBytes(xref.join('')));
  return joinBytes(parts);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createPayrollMonthlyCloseApprovedPdf(run) {
  const context = approvedContext(run);
  const bytes = pdfDocument(context);
  const artifact = Object.freeze({
    contractVersion: PAYROLL_MONTHLY_CLOSE_APPROVED_PROOF_VERSION,
    sourceContractVersion: SOURCE_CONTRACT_VERSION,
    runId: context.runId,
    runVersion: context.runVersion,
    period: context.period,
    jurisdiction: context.jurisdiction,
    decidedAt: context.approval.decidedAt,
    approvalEventSha256: context.approval.eventSha256,
    fileName: `municontrol_cierre-aprobado_${context.period}_j${context.jurisdiction}_${context.runId.slice(0, 8)}.pdf`,
    mimeType: MIME_PDF,
    containsPersonalRecords: false,
    bytes,
  });
  artifactIntegrity.set(artifact, crc32(bytes));
  return artifact;
}

export function downloadPayrollMonthlyCloseApprovedProof(artifact, dependencies = {}) {
  const expectedKeys = [
    'contractVersion', 'sourceContractVersion', 'runId', 'runVersion', 'period',
    'jurisdiction', 'decidedAt', 'approvalEventSha256', 'fileName', 'mimeType',
    'containsPersonalRecords', 'bytes',
  ];
  if (!isObject(artifact) || !Object.isFrozen(artifact)
      || Object.keys(artifact).length !== expectedKeys.length
      || expectedKeys.some((key) => !Object.hasOwn(artifact, key))
      || artifact.contractVersion !== PAYROLL_MONTHLY_CLOSE_APPROVED_PROOF_VERSION
      || artifact.sourceContractVersion !== SOURCE_CONTRACT_VERSION
      || !UUID.test(String(artifact.runId || ''))
      || !Number.isSafeInteger(artifact.runVersion) || artifact.runVersion < 3
      || !PERIOD.test(String(artifact.period || ''))
      || !['42', '55'].includes(String(artifact.jurisdiction))
      || !normalizedIso(artifact.decidedAt)
      || !SHA256.test(String(artifact.approvalEventSha256 || ''))
      || artifact.fileName !== `municontrol_cierre-aprobado_${artifact.period}_j${artifact.jurisdiction}_${artifact.runId.slice(0, 8)}.pdf`
      || artifact.mimeType !== MIME_PDF || artifact.containsPersonalRecords !== false
      || !(artifact.bytes instanceof Uint8Array) || artifact.bytes.byteLength < 100
      || artifactIntegrity.get(artifact) !== crc32(artifact.bytes)
      || String.fromCharCode(...artifact.bytes.subarray(0, 8)) !== '%PDF-1.4'
      || !new TextDecoder('latin1').decode(artifact.bytes.subarray(-16)).includes('%%EOF')) {
    fail('APPROVED_PROOF_ARTIFACT_INVALID', 'El comprobante no supera el control de integridad previo a la descarga.');
  }
  const documentImpl = dependencies.documentImpl ?? globalThis.document;
  const urlApi = dependencies.urlApi ?? globalThis.URL;
  const BlobImpl = dependencies.BlobImpl ?? globalThis.Blob;
  if (!documentImpl?.createElement || !documentImpl.body?.appendChild
      || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL || !BlobImpl) {
    fail('APPROVED_PROOF_DOWNLOAD_UNAVAILABLE', 'La descarga no está disponible en este navegador.');
  }
  const blob = new BlobImpl([artifact.bytes], { type: artifact.mimeType });
  const href = urlApi.createObjectURL(blob);
  const anchor = documentImpl.createElement('a');
  anchor.href = href;
  anchor.download = artifact.fileName;
  anchor.hidden = true;
  documentImpl.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    urlApi.revokeObjectURL(href);
  }
  return artifact.fileName;
}
