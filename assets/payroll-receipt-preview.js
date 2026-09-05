import { payrollTypePresentation } from './payroll-type-presentation.js';

export const PAYROLL_RECEIPT_PREVIEW_VERSION = 'payroll-receipt-preview.v1';

// Los contratos canónicos importados desde GRH usan el tipo uuid de PostgreSQL,
// pero algunos identificadores históricos no codifican versión/variante RFC.
const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const MONEY = /^(-?)(0|[1-9]\d*)\.([0-9]{2})$/;
const MIME_PDF = 'application/pdf';
const summaries = new WeakSet();
const artifactIntegrity = new WeakMap();

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function cleanText(value, maxLength, fallback = 'No informado') {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, maxLength);
}

function cents(value, field) {
  const match = MONEY.exec(String(value ?? ''));
  if (!match) fail('RECEIPT_MONEY_INVALID', `El importe ${field} no tiene dos decimales exactos.`);
  const amount = (BigInt(match[2]) * 100n) + BigInt(match[3]);
  return match[1] ? -amount : amount;
}

function money(centsValue) {
  const negative = centsValue < 0n;
  const absolute = negative ? -centsValue : centsValue;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function formatArs(value) {
  const valueCents = typeof value === 'bigint' ? value : cents(value, 'a mostrar');
  const negative = valueCents < 0n;
  const absolute = negative ? -valueCents : valueCents;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '- ' : ''}$ ${whole},${String(absolute % 100n).padStart(2, '0')}`;
}

function normalizedSourceCutoff(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail('RECEIPT_CUTOFF_INVALID', 'La fecha de corte no es válida.');
  return date.toISOString();
}

function municipalContext(value) {
  const tenantId = String(value?.id || '').trim().toLowerCase();
  const tenantSlug = String(value?.slug || '').trim().toLowerCase();
  if (!POSTGRES_UUID.test(tenantId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug) || tenantSlug.length > 80) {
    fail('RECEIPT_TENANT_INVALID', 'El ámbito municipal de la sesión no es válido.');
  }
  const tenantLabel = tenantSlug.split('-').filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
  return Object.freeze({ tenantId, tenantSlug, tenantLabel });
}

export function createPayrollReceiptSummary(employee, payroll, options = {}) {
  if (!employee || typeof employee !== 'object' || Array.isArray(employee)
      || !POSTGRES_UUID.test(String(employee.contractId || ''))) {
    fail('RECEIPT_EMPLOYEE_INVALID', 'La ficha laboral seleccionada no es válida.');
  }
  if (!payroll || typeof payroll !== 'object' || Array.isArray(payroll)
      || payroll.closureStatus !== 'closed'
      || payroll.presentationStatus !== 'closed_reconciled'
      || payroll.reconciliation?.status !== 'matched'
      || !DATE.test(String(payroll.payrollDate || ''))) {
    fail('RECEIPT_PERIOD_NOT_READY', 'Sólo una liquidación cerrada y conciliada puede generar este PDF de control.');
  }

  const subject = cents(payroll.subjectEarnings, 'de haberes remunerativos');
  const nonSubject = cents(payroll.nonSubjectEarnings, 'de haberes no remunerativos');
  const family = cents(payroll.familyAllowance, 'de asignaciones familiares');
  const withholdings = cents(payroll.employeeWithholdings, 'de retenciones');
  const net = cents(payroll.netPayable, 'neto pagable');
  const reportedDifference = cents(payroll.reconciliation.difference, 'de diferencia');
  const derivedDifference = subject + nonSubject + family - withholdings - net;
  if (derivedDifference !== reportedDifference || derivedDifference < -1n || derivedDifference > 1n) {
    fail('RECEIPT_RECONCILIATION_INVALID', 'Los importes no reproducen el control aritmético informado por la API.');
  }
  const employer = payroll.employerContributions === null || payroll.employerContributions === undefined
    ? null : cents(payroll.employerContributions, 'de contribuciones patronales');
  const generatedAt = options.generatedAt ? new Date(options.generatedAt) : new Date();
  if (!Number.isFinite(generatedAt.getTime())) fail('RECEIPT_GENERATED_AT_INVALID', 'La fecha de generación no es válida.');
  const payrollType = payrollTypePresentation(payroll.canonicalPayrollType, payroll.payrollType);

  const summary = Object.freeze({
    contractVersion: PAYROLL_RECEIPT_PREVIEW_VERSION,
    context: municipalContext(options.tenant),
    employee: Object.freeze({
      contractId: String(employee.contractId).toLowerCase(),
      name: cleanText(employee.nombre ?? employee.name, 88, 'Persona sin nombre informado'),
      legajo: cleanText(employee.legajo, 24),
      organization: cleanText(employee.organizacion ?? employee.organization, 78),
      sector: cleanText(employee.sector, 78),
      agreement: cleanText(employee.convenio ?? employee.agreement, 78),
    }),
    payroll: Object.freeze({
      payrollDate: payroll.payrollDate,
      payrollType: cleanText(payroll.canonicalPayrollType ?? payroll.payrollType, 48, 'unknown'),
      payrollTypeLabel: payrollType.label,
      payrollTypeDetail: payrollType.detail,
      sourcePayrollTypeCode: payrollType.sourceCode,
      itemCount: Number.isSafeInteger(payroll.itemCount) && payroll.itemCount >= 0 ? payroll.itemCount : null,
      distinctConcepts: Number.isSafeInteger(payroll.distinctConcepts) && payroll.distinctConcepts >= 0
        ? payroll.distinctConcepts : null,
      subjectEarnings: money(subject),
      nonSubjectEarnings: money(nonSubject),
      familyAllowance: money(family),
      employeeWithholdings: money(withholdings),
      grossEarnings: money(subject + nonSubject + family),
      netPayable: money(net),
      employerContributions: employer === null ? null : money(employer),
      reconciliationDifference: money(derivedDifference),
      sourceCutoff: normalizedSourceCutoff(payroll.sourceCutoff),
    }),
    generatedAt: generatedAt.toISOString(),
    authority: 'GRH',
    officialReceipt: false,
    conceptLinesAvailable: false,
    signed: false,
  });
  summaries.add(summary);
  return summary;
}

function latinBytes(value) {
  const normalized = String(value).replaceAll('–', '-').replaceAll('—', '-').replaceAll('“', '"')
    .replaceAll('”', '"').replaceAll('’', "'").replaceAll('…', '...');
  const output = new Uint8Array(normalized.length);
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    output[index] = code <= 255 ? code : 63;
  }
  return output;
}

function joinBytes(parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

function pdfLiteral(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
    .replace(/[\r\n]+/g, ' ');
}

function pdfDocument(summary) {
  const p = summary.payroll;
  const e = summary.employee;
  const commands = [];
  const colors = {
    navy: '0.035 0.157 0.224', green: '0.035 0.502 0.459', ink: '0.075 0.157 0.208',
    muted: '0.365 0.435 0.475', line: '0.820 0.855 0.843', soft: '0.965 0.976 0.973',
    greenSoft: '0.914 0.969 0.953', amberSoft: '0.996 0.965 0.886', amber: '0.667 0.376 0.020', white: '1 1 1',
  };
  const rect = (x, y, width, height, fill, stroke = null) => {
    commands.push('q');
    if (fill) commands.push(`${fill} rg`);
    if (stroke) commands.push(`${stroke} RG 0.7 w`);
    commands.push(`${x} ${y} ${width} ${height} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`);
  };
  const text = (x, y, value, size = 9, font = 'F1', fill = colors.ink) => {
    commands.push(`BT /${font} ${size} Tf ${fill} rg 1 0 0 1 ${x} ${y} Tm (${pdfLiteral(value)}) Tj ET`);
  };
  const rightText = (right, y, value, size = 9, font = 'F1', fill = colors.ink) => {
    text(Math.max(38, right - (String(value).length * size * 0.48)), y, value, size, font, fill);
  };
  const line = (label, value, y) => {
    text(50, y, label.toUpperCase(), 7, 'F2', colors.muted);
    text(181, y, cleanText(value, 75), 8.5, 'F1', colors.ink);
  };

  rect(0, 754, 595, 88, colors.navy);
  text(38, 805, 'MuniControl', 21, 'F2', colors.white);
  text(38, 782, 'RESUMEN INDIVIDUAL DE LIQUIDACION', 11, 'F2', colors.white);
  text(38, 766, `${summary.context.tenantLabel} · importes reales informados por GRH`, 8, 'F1', colors.white);

  rect(38, 706, 519, 30, colors.greenSoft, colors.green);
  text(51, 716, 'LIQUIDACION CERRADA · CONTROL ARITMETICO COINCIDENTE', 9.5, 'F2', colors.green);

  text(38, 680, 'Persona y contexto laboral', 13, 'F2', colors.navy);
  rect(38, 570, 519, 96, colors.soft, colors.line);
  line('Apellido y nombre', e.name, 645);
  line('Legajo', e.legajo, 627);
  line('Organización', e.organization, 609);
  line('Sector', e.sector, 591);
  line('Convenio', e.agreement, 573);

  text(38, 543, 'Período liquidado', 13, 'F2', colors.navy);
  rect(38, 496, 250, 34, colors.soft, colors.line);
  text(50, 516, 'FECHA DE LIQUIDACION', 7, 'F2', colors.muted);
  text(50, 503, p.payrollDate, 10, 'F2', colors.navy);
  rect(307, 496, 250, 34, colors.soft, colors.line);
  text(319, 516, 'TIPO', 7, 'F2', colors.muted);
  text(319, 503, p.payrollTypeLabel, 10, 'F2', colors.navy);

  text(38, 469, 'Resumen de importes nominales', 13, 'F2', colors.navy);
  const rows = [
    ['Haberes remunerativos', p.subjectEarnings],
    ['Haberes no remunerativos', p.nonSubjectEarnings],
    ['Asignaciones familiares', p.familyAllowance],
    ['Total de haberes', p.grossEarnings],
    ['Retenciones', p.employeeWithholdings],
    ['Neto a pagar', p.netPayable],
  ];
  rows.forEach(([label, value], index) => {
    const y = 435 - (index * 31);
    const highlight = index === rows.length - 1;
    rect(38, y, 519, 27, highlight ? colors.greenSoft : (index % 2 ? colors.soft : colors.white), highlight ? colors.green : colors.line);
    text(50, y + 9, label, highlight ? 9.5 : 8.5, highlight ? 'F2' : 'F1', highlight ? colors.green : colors.ink);
    rightText(545, y + 9, formatArs(value), highlight ? 10.5 : 9, 'F2', highlight ? colors.green : colors.navy);
  });

  rect(38, 190, 519, 55, colors.soft, colors.line);
  text(51, 228, 'TRAZABILIDAD', 7, 'F2', colors.green);
  text(51, 212, `Fuente: GRH · corte: ${p.sourceCutoff ? p.sourceCutoff.slice(0, 10) : 'no informado'}${p.sourcePayrollTypeCode ? ` · tipo: ${p.sourcePayrollTypeCode}` : ''}`, 8, 'F1', colors.ink);
  text(51, 198, `Generado: ${summary.generatedAt.slice(0, 19).replace('T', ' ')} UTC · diferencia de control: ${formatArs(p.reconciliationDifference)}`, 8, 'F1', colors.ink);

  rect(38, 92, 519, 78, colors.amberSoft, colors.amber);
  text(51, 150, 'ALCANCE DE ESTE DOCUMENTO', 8, 'F2', colors.amber);
  text(51, 133, 'Es un resumen real para control previo. No es el recibo oficial ni reemplaza su entrega.', 8, 'F2', colors.ink);
  text(51, 117, 'La base actual no contiene el detalle por concepto, firma ni constancia de publicación.', 8, 'F1', colors.ink);
  text(51, 101, 'No modifica la liquidación, no acredita haberes y no transmite información a terceros.', 8, 'F1', colors.ink);

  text(38, 55, PAYROLL_RECEIPT_PREVIEW_VERSION, 7, 'F1', colors.muted);
  rightText(557, 55, `${summary.context.tenantLabel} · Página 1 de 1`, 7, 'F2', colors.navy);

  const contentBytes = latinBytes(`${commands.join('\n')}\n`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    joinBytes([latinBytes(`<< /Length ${contentBytes.byteLength} >>\nstream\n`), contentBytes, latinBytes('endstream')]),
    `<< /Title (${pdfLiteral(`Resumen de liquidación ${p.payrollDate} - ${p.payrollTypeLabel}${p.sourcePayrollTypeCode ? ` - GRH ${p.sourcePayrollTypeCode}` : ''} - legajo ${e.legajo}`)}) /Author (MuniControl) /Subject (Vista previa individual no oficial) /Creator (MuniControl) /Producer (MuniControl) >>`,
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
  offsets.slice(1).forEach((itemOffset) => xref.push(`${String(itemOffset).padStart(10, '0')} 00000 n \n`));
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  parts.push(latinBytes(xref.join('')));
  return joinBytes(parts);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function safeFilePart(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'persona';
}

export function createPayrollReceiptPdfArtifact(summary) {
  if (!summaries.has(summary) || !Object.isFrozen(summary) || summary.officialReceipt !== false) {
    fail('RECEIPT_SUMMARY_INVALID', 'La vista previa no supera el contrato de generación.');
  }
  const bytes = pdfDocument(summary);
  // Un mismo legajo puede tener mensual, bono y otras liquidaciones en el mes.
  // El número de bono del GRH de referencia tampoco distingue siempre esos casos.
  // Conservamos fecha completa y tipo; no inventamos un ID de corrida ausente en la API.
  const typePart = `${safeFilePart(summary.payroll.payrollTypeLabel)}_${summary.payroll.sourcePayrollTypeCode
    ? `grh-${summary.payroll.sourcePayrollTypeCode.toLowerCase()}`
    : `tipo-${safeFilePart(summary.payroll.payrollType)}`}`;
  const artifact = Object.freeze({
    contractVersion: PAYROLL_RECEIPT_PREVIEW_VERSION,
    fileName: `municontrol_resumen-liquidacion_${summary.payroll.payrollDate}_${typePart}_legajo-${safeFilePart(summary.employee.legajo)}.pdf`,
    mimeType: MIME_PDF,
    officialReceipt: false,
    containsPersonalData: true,
    bytes,
  });
  artifactIntegrity.set(artifact, crc32(bytes));
  return artifact;
}

export function downloadPayrollReceiptPdf(artifact, dependencies = {}) {
  if (!artifact || !Object.isFrozen(artifact)
      || artifact.contractVersion !== PAYROLL_RECEIPT_PREVIEW_VERSION
      || artifact.mimeType !== MIME_PDF || artifact.officialReceipt !== false
      || artifact.containsPersonalData !== true || !(artifact.bytes instanceof Uint8Array)
      || artifact.bytes.byteLength < 700 || artifactIntegrity.get(artifact) !== crc32(artifact.bytes)
      || new TextDecoder('latin1').decode(artifact.bytes.subarray(0, 8)) !== '%PDF-1.4'
      || !new TextDecoder('latin1').decode(artifact.bytes.subarray(-20)).includes('%%EOF')) {
    fail('RECEIPT_ARTIFACT_INVALID', 'El PDF no supera el control de integridad previo a la descarga.');
  }
  const documentImpl = dependencies.documentImpl ?? globalThis.document;
  const urlApi = dependencies.urlApi ?? globalThis.URL;
  const BlobImpl = dependencies.BlobImpl ?? globalThis.Blob;
  if (!documentImpl?.createElement || !documentImpl.body?.appendChild
      || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL || !BlobImpl) {
    fail('RECEIPT_DOWNLOAD_UNAVAILABLE', 'La descarga no está disponible en este navegador.');
  }
  const blob = new BlobImpl([artifact.bytes], { type: artifact.mimeType });
  const href = urlApi.createObjectURL(blob);
  const anchor = documentImpl.createElement('a');
  anchor.href = href;
  anchor.download = artifact.fileName;
  anchor.hidden = true;
  documentImpl.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); urlApi.revokeObjectURL(href); }
  return artifact.fileName;
}
