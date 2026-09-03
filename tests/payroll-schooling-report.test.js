import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_SCHOOLING_EVIDENCE_CONTRACT_VERSION,
  PAYROLL_SCHOOLING_MAX_SOURCE_BYTES,
  PAYROLL_SCHOOLING_MAX_ZIP_ENTRIES,
  PAYROLL_SCHOOLING_OBSERVED_PROFILE,
  PAYROLL_SCHOOLING_PROFILE_ID,
  PAYROLL_SCHOOLING_RECONCILIATION_VERSION,
  PAYROLL_SCHOOLING_VALIDATION_VERSION,
  PayrollSchoolingReportError,
  diagnosePayrollSchoolingProfile,
  generatePayrollSchoolingWorkbook,
  inspectPayrollSchoolingWorkbook,
  reconcilePayrollSchoolingCents,
  summarizePayrollSchoolingBatch,
} from '../assets/payroll-schooling-report.js';

function writeU16(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function concat(parts) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function createStoreZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content ?? '<xml/>');
    const local = new Uint8Array(30 + name.byteLength + data.byteLength);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20);
    writeU16(local, 6, entry.flags ?? 0);
    writeU16(local, 8, 0);
    writeU32(local, 18, data.byteLength);
    writeU32(local, 22, data.byteLength);
    writeU16(local, 26, name.byteLength);
    local.set(name, 30);
    local.set(data, 30 + name.byteLength);
    localParts.push(local);

    const central = new Uint8Array(46 + name.byteLength);
    writeU32(central, 0, 0x02014b50);
    writeU16(central, 4, 20);
    writeU16(central, 6, 20);
    writeU16(central, 8, entry.flags ?? 0);
    writeU16(central, 10, 0);
    writeU32(central, 20, data.byteLength);
    writeU32(central, 24, data.byteLength);
    writeU16(central, 28, name.byteLength);
    writeU32(central, 42, localOffset);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.byteLength;
  }

  const locals = concat(localParts);
  const central = concat(centralParts);
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 8, entries.length);
  writeU16(eocd, 10, entries.length);
  writeU32(eocd, 12, central.byteLength);
  writeU32(eocd, 16, locals.byteLength);
  return concat([locals, central, eocd]);
}

const MINIMAL_XLSX_PARTS = [
  { name: '[Content_Types].xml' },
  { name: '_rels/.rels' },
  { name: 'xl/workbook.xml' },
  { name: 'xl/worksheets/sheet1.xml' },
];

function hasCode(code) {
  return (error) => error instanceof PayrollSchoolingReportError && error.code === code;
}

test('publica evidencia exacta y no inventa columnas de escolaridades', () => {
  assert.equal(PAYROLL_SCHOOLING_OBSERVED_PROFILE.contractVersion, PAYROLL_SCHOOLING_EVIDENCE_CONTRACT_VERSION);
  assert.equal(PAYROLL_SCHOOLING_OBSERVED_PROFILE.reportId, 'REP-08');
  assert.equal(PAYROLL_SCHOOLING_OBSERVED_PROFILE.requestedOutput, 'xlsx');
  assert.equal(PAYROLL_SCHOOLING_OBSERVED_PROFILE.evidenceLevel, 'explicit_output_only');
  assert.deepEqual(PAYROLL_SCHOOLING_OBSERVED_PROFILE.observedColumns, []);
  assert.equal(PAYROLL_SCHOOLING_OBSERVED_PROFILE.sampleWorkbookAvailable, false);
  assert.equal(PAYROLL_SCHOOLING_OBSERVED_PROFILE.semanticMappingComplete, false);
  assert.equal(PAYROLL_SCHOOLING_OBSERVED_PROFILE.generationAllowed, false);
  assert.equal(PAYROLL_SCHOOLING_OBSERVED_PROFILE.officialUseAllowed, false);
  assert.equal(PAYROLL_SCHOOLING_OBSERVED_PROFILE.sourceReferences[0].page, 2);
  assert.equal(Object.isFrozen(PAYROLL_SCHOOLING_OBSERVED_PROFILE), true);
  assert.equal(Object.isFrozen(PAYROLL_SCHOOLING_OBSERVED_PROFILE.unknownRequirements), true);
});

test('contrato JSON conserva la misma frontera de evidencia sin PII', () => {
  const contract = JSON.parse(fs.readFileSync(
    new URL('../contracts/payroll-schooling-report-evidence.v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(contract.contractVersion, PAYROLL_SCHOOLING_EVIDENCE_CONTRACT_VERSION);
  assert.equal(contract.profileId, PAYROLL_SCHOOLING_PROFILE_ID);
  assert.deepEqual(contract.observedColumns, []);
  assert.equal(contract.sources[1].xlsxEntries, 50);
  assert.equal(contract.sources[1].uniqueXlsxPayloads, 45);
  assert.equal(contract.sources[1].unambiguousSchoolingWorkbookCandidates, 0);
  assert.equal(contract.generationAllowed, false);
  assert.equal(contract.officialUseAllowed, false);
  assert.doesNotMatch(JSON.stringify(contract), /(?:dni|cuil|cbu|apellido|nombre|legajo|@)/i);
});

test('valida un contenedor OOXML minimo sin leer ni devolver valores', async () => {
  const bytes = createStoreZip(MINIMAL_XLSX_PARTS);
  const result = await inspectPayrollSchoolingWorkbook(
    { profileId: PAYROLL_SCHOOLING_PROFILE_ID, bytes },
    { cryptoImpl: webcrypto },
  );

  assert.equal(result.contractVersion, PAYROLL_SCHOOLING_VALIDATION_VERSION);
  assert.equal(result.status, 'valid_xlsx_container_unmapped');
  assert.equal(result.structureValid, true);
  assert.equal(result.structure.zipEntryCount, 4);
  assert.equal(result.structure.worksheetPartCount, 1);
  assert.equal(result.structure.declaredUncompressedBytes, '24');
  assert.equal(result.sourceSha256, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
  assert.equal(result.sourceValuesIncluded, false);
  assert.equal(result.semanticMappingComplete, false);
  assert.equal(result.generationAllowed, false);
  assert.equal(result.officialUseAllowed, false);
  assert.deepEqual(result.diagnostics.issues, []);
  assert.equal(Object.isFrozen(result), true);
});

test('informa partes faltantes y rutas inseguras sin exponer contenido', async () => {
  const secret = 'PERSONA-PRIVADA-112233';
  const bytes = createStoreZip([
    { name: '[Content_Types].xml', content: secret },
    { name: '../xl/workbook.xml', content: secret },
  ]);
  const result = await inspectPayrollSchoolingWorkbook(
    { profileId: PAYROLL_SCHOOLING_PROFILE_ID, bytes },
    { cryptoImpl: webcrypto },
  );

  assert.equal(result.status, 'invalid_xlsx_structure');
  assert.equal(result.structureValid, false);
  assert.deepEqual(result.diagnostics.issues, [
    'SCHOOLING_XLSX_PART_PATH_UNSAFE',
    'SCHOOLING_XLSX_REQUIRED_PART_MISSING',
    'SCHOOLING_XLSX_WORKSHEET_PART_MISSING',
  ]);
  assert.equal(result.diagnostics.issueCount, 4);
  assert.doesNotMatch(JSON.stringify(result), /PERSONA-PRIVADA|112233/);
});

test('rechaza cifrado y contenedores que no son ZIP sin asumir que son Excel', async () => {
  const encrypted = await inspectPayrollSchoolingWorkbook(
    {
      profileId: PAYROLL_SCHOOLING_PROFILE_ID,
      bytes: createStoreZip(MINIMAL_XLSX_PARTS.map((part, index) => (
        index === 3 ? { ...part, flags: 1 } : part
      ))),
    },
    { cryptoImpl: webcrypto },
  );
  assert.equal(encrypted.structureValid, false);
  assert.ok(encrypted.diagnostics.issues.includes('SCHOOLING_XLSX_ENCRYPTED_PART_NOT_ALLOWED'));

  const plain = await inspectPayrollSchoolingWorkbook(
    { profileId: PAYROLL_SCHOOLING_PROFILE_ID, bytes: new TextEncoder().encode('no-es-xlsx') },
    { cryptoImpl: webcrypto },
  );
  assert.equal(plain.status, 'invalid_xlsx_structure');
  assert.deepEqual(plain.diagnostics.issues, ['SCHOOLING_XLSX_EOCD_NOT_FOUND']);
});

test('concilia centavos exactamente con BigInt y nunca habilita generacion', () => {
  const result = reconcilePayrollSchoolingCents({
    expectedCents: '9007199254740993',
    observedCents: '9007199254740995',
  });
  assert.equal(result.contractVersion, PAYROLL_SCHOOLING_RECONCILIATION_VERSION);
  assert.deepEqual(result, {
    contractVersion: PAYROLL_SCHOOLING_RECONCILIATION_VERSION,
    expectedCents: '9007199254740993',
    observedCents: '9007199254740995',
    differenceCents: '2',
    reconciled: false,
    generationAllowed: false,
  });
  assert.equal(reconcilePayrollSchoolingCents({ expectedCents: '100', observedCents: '100' }).reconciled, true);
  assert.throws(
    () => reconcilePayrollSchoolingCents({ expectedCents: '1.00', observedCents: '100' }),
    hasCode('SCHOOLING_CENTS_INVALID'),
  );
  assert.throws(
    () => reconcilePayrollSchoolingCents({
      expectedCents: '-9223372036854775808',
      observedCents: '9223372036854775807',
    }),
    hasCode('SCHOOLING_CENTS_OUT_OF_RANGE'),
  );
});

test('resume un lote solo con conteos y totales agregados seguros', () => {
  const summary = summarizePayrollSchoolingBatch({
    inputRowCount: 12,
    acceptedRowCount: 10,
    rejectedRowCount: 2,
    expectedTotalCents: '50000',
    observedTotalCents: '49999',
  });
  assert.equal(summary.status, 'requires_review');
  assert.equal(summary.containsSourceValues, false);
  assert.equal(summary.cents.differenceCents, '-1');
  assert.equal(summary.semanticMappingComplete, false);
  assert.equal(summary.generationAllowed, false);
  assert.throws(
    () => summarizePayrollSchoolingBatch({
      inputRowCount: 12,
      acceptedRowCount: 10,
      rejectedRowCount: 1,
      expectedTotalCents: '0',
      observedTotalCents: '0',
    }),
    hasCode('SCHOOLING_ROW_COUNT_MISMATCH'),
  );
});

test('diagnostico y generacion fallan cerrado hasta homologar la muestra', () => {
  const diagnosis = diagnosePayrollSchoolingProfile();
  assert.equal(diagnosis.status, 'blocked');
  assert.equal(diagnosis.reasonCode, 'SCHOOLING_SAMPLE_AND_FIELDS_UNMAPPED');
  assert.deepEqual(diagnosis.observedColumns, []);
  assert.equal(diagnosis.generationAllowed, false);
  assert.ok(diagnosis.missingRequirements.includes('column_order_names_and_types'));

  const marker = 'DOCUMENTO-PRIVADO-998877';
  assert.throws(
    () => generatePayrollSchoolingWorkbook({ rows: [marker] }),
    (error) => {
      assert.ok(hasCode('SCHOOLING_GENERATION_BLOCKED_PROFILE_UNMAPPED')(error));
      assert.doesNotMatch(error.message, /DOCUMENTO-PRIVADO|998877/);
      return true;
    },
  );
  assert.throws(
    () => diagnosePayrollSchoolingProfile('inventado.v1'),
    hasCode('SCHOOLING_PROFILE_UNKNOWN'),
  );
});

test('aplica limites y conserva un motor puro sin DOM, red, storage ni logs', async () => {
  await assert.rejects(
    inspectPayrollSchoolingWorkbook(
      { profileId: PAYROLL_SCHOOLING_PROFILE_ID, bytes: new Uint8Array(PAYROLL_SCHOOLING_MAX_SOURCE_BYTES + 1) },
      { cryptoImpl: webcrypto },
    ),
    hasCode('SCHOOLING_SOURCE_TOO_LARGE'),
  );
  await assert.rejects(
    inspectPayrollSchoolingWorkbook(
      { profileId: PAYROLL_SCHOOLING_PROFILE_ID, bytes: createStoreZip(MINIMAL_XLSX_PARTS) },
      { cryptoImpl: null },
    ),
    hasCode('SCHOOLING_CRYPTO_UNAVAILABLE'),
  );
  assert.ok(PAYROLL_SCHOOLING_MAX_ZIP_ENTRIES >= 1000);

  const source = fs.readFileSync(
    new URL('../assets/payroll-schooling-report.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(source, /console\.|innerHTML|outerHTML|document\./);
  assert.doesNotMatch(source, /from ['"]node:/);
  assert.match(source, /BigInt\(/);
  assert.match(source, /subtle\.digest\('SHA-256'/);
});
