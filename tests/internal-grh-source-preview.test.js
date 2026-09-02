import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GRH_SOURCE_PREVIEW_MAX_RECORDS,
  GrhSourcePreviewError,
  previewGrhSource,
  previewGrhSourceBatch,
} from '../lib/internal-grh-source-preview.js';

const fingerprintKey = Buffer.alloc(32, 7);
const tenantId = '7fcb1847-25df-4d48-a8af-a54207bea78e';
const sourceBindingId = '8de63f52-acde-47be-9f27-4521edced5bc';
const fingerprintContext = Object.freeze({ fingerprintKey, tenantId, sourceBindingId });

const pipeDefinition = Object.freeze({
  format: 'pipe',
  delimiter: '|',
  header: true,
  fields: [
    { name: 'legajo', type: 'integer', required: true },
    { name: 'periodo', type: 'date', required: true },
    { name: 'importe_tecnico', type: 'decimal', required: false },
  ],
});

test('previsualiza pipe sin devolver valores personales ni persistir', () => {
  const source = Buffer.from([
    'legajo|periodo|importe_tecnico',
    '1001|2026-08-01|1250,45',
    '1002|2026-08-01|',
  ].join('\n'));
  const preview = previewGrhSource(source, pipeDefinition, fingerprintContext);

  assert.equal(preview.status, 'valid');
  assert.equal(preview.recordCount, 2);
  assert.equal(preview.acceptedCount, 2);
  assert.equal(preview.rejectedRecordCount, 0);
  assert.equal(preview.structuralErrorCount, 0);
  assert.equal(preview.issueCount, 0);
  assert.equal(preview.schemaValid, true);
  assert.equal(preview.includesRecordValues, false);
  assert.equal(preview.persistencePerformed, false);
  assert.match(preview.contentFingerprint, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.match(preview.schemaSha256, /^[a-f0-9]{64}$/);
  const serialized = JSON.stringify(preview);
  assert.doesNotMatch(serialized, /1001|1002|1250/);
  assert.doesNotMatch(serialized, new RegExp(`${tenantId}|${sourceBindingId}`));
});

test('aísla la huella por tenant y vínculo de fuente sin exponer el contexto', () => {
  const source = Buffer.from('legajo|periodo|importe_tecnico\n1|2026-08-01|0');
  const sameContext = previewGrhSource(source, pipeDefinition, fingerprintContext);
  const sameContextAgain = previewGrhSource(source, pipeDefinition, fingerprintContext);
  const otherTenant = previewGrhSource(source, pipeDefinition, {
    ...fingerprintContext,
    tenantId: '07a469dd-f6ae-44b5-8ac8-f7b3a40ddc61',
  });
  const otherBinding = previewGrhSource(source, pipeDefinition, {
    ...fingerprintContext,
    sourceBindingId: '3f9e6af0-9bd0-4e3e-8aa1-c9b92ae17f40',
  });

  assert.equal(sameContext.contentFingerprint, sameContextAgain.contentFingerprint);
  assert.notEqual(sameContext.contentFingerprint, otherTenant.contentFingerprint);
  assert.notEqual(sameContext.contentFingerprint, otherBinding.contentFingerprint);
  assert.doesNotMatch(JSON.stringify(sameContext), /7fcb1847|8de63f52/i);
});

test('rechazos contienen sólo línea y código, nunca el contenido', () => {
  const source = Buffer.from([
    'legajo|periodo|importe_tecnico',
    'PERSONA-SENSIBLE|2026-02-30|NO-EXPONER',
    '1002|2026-08-01',
  ].join('\n'));
  const preview = previewGrhSource(source, pipeDefinition, fingerprintContext);

  assert.equal(preview.status, 'has_rejections');
  assert.equal(preview.recordCount, 2);
  assert.equal(preview.acceptedCount, 0);
  assert.equal(preview.rejectedRecordCount, 2);
  assert.equal(preview.issueCount, 2);
  assert.deepEqual(preview.rejections, [
    { line: 2, code: 'LEGAJO_INTEGER_INVALID' },
    { line: 3, code: 'COLUMN_COUNT_MISMATCH' },
  ]);
  assert.doesNotMatch(JSON.stringify(preview), /PERSONA-SENSIBLE|NO-EXPONER/);
});

test('valida ancho fijo declarativo y límites exactos del registro', () => {
  const definition = {
    format: 'fixed_width',
    widthUnit: 'ascii_bytes',
    recordLength: 18,
    fields: [
      { name: 'legajo', type: 'integer', required: true, start: 0, length: 5 },
      { name: 'fecha', type: 'date', required: true, start: 5, length: 10 },
      { name: 'codigo', type: 'text', required: true, start: 15, length: 3 },
    ],
  };
  const preview = previewGrhSource(
    Buffer.from('001232026-08-01ABC\n001242026-08-02XYZ'), definition, fingerprintContext,
  );
  assert.equal(preview.status, 'valid');
  assert.equal(preview.acceptedCount, 2);

  const invalid = previewGrhSource(
    Buffer.from('001232026-08-01AB'), definition, fingerprintContext,
  );
  assert.equal(invalid.acceptedCount, 0);
  assert.deepEqual(invalid.rejections, [{ line: 1, code: 'RECORD_LENGTH_MISMATCH' }]);
});

test('deduplica un lote por HMAC tenant-bound sin usar nombre de archivo ni filas', () => {
  const first = Buffer.from('legajo|periodo|importe_tecnico\n1|2026-08-01|0');
  const second = Buffer.from('legajo|periodo|importe_tecnico\n2|2026-08-01|0');
  const result = previewGrhSourceBatch([
    { bytes: first },
    { bytes: first },
    { bytes: second },
  ], pipeDefinition, fingerprintContext);

  assert.equal(result.sourceCount, 3);
  assert.equal(result.uniqueContentCount, 2);
  assert.equal(result.duplicateGroupCount, 1);
  assert.deepEqual(result.duplicateGroups[0].sourceRefs, ['source-0001', 'source-0002']);
  assert.equal(result.persistencePerformed, false);
});

test('falla cerrado ante esquema ambiguo, bytes inválidos o clave HMAC ausente', () => {
  assert.throws(
    () => previewGrhSource(Buffer.from('x'), {
      format: 'fixed_width',
      widthUnit: 'ascii_bytes',
      recordLength: 2,
      fields: [
        { name: 'uno', type: 'text', required: true, start: 0, length: 2 },
        { name: 'dos', type: 'text', required: true, start: 1, length: 1 },
      ],
    }, fingerprintContext),
    (error) => error instanceof GrhSourcePreviewError && error.code === 'GRH_SOURCE_SCHEMA_INVALID',
  );
  assert.throws(() => previewGrhSource('texto', pipeDefinition, fingerprintContext), /Buffer o Uint8Array/);
  assert.throws(
    () => previewGrhSource(Buffer.from('legajo|periodo|importe_tecnico\n1|2026-08-01|0'), pipeDefinition),
    /fingerprintKey/,
  );
  assert.throws(
    () => previewGrhSource(Buffer.from('x'), pipeDefinition, {
      ...fingerprintContext,
      tenantId: 'junin',
    }),
    (error) => error instanceof GrhSourcePreviewError
      && error.code === 'GRH_SOURCE_FINGERPRINT_CONTEXT_INVALID',
  );
  assert.throws(
    () => previewGrhSource(Buffer.from('x'), pipeDefinition, {
      ...fingerprintContext,
      sourceBindingId: '',
    }),
    (error) => error instanceof GrhSourcePreviewError
      && error.code === 'GRH_SOURCE_FINGERPRINT_CONTEXT_INVALID',
  );
});

test('encabezado inválido falla estructuralmente y no acepta filas por posición', () => {
  const preview = previewGrhSource(
    Buffer.from('dni|periodo|importe_tecnico\n123|2026-08-01|0'),
    pipeDefinition,
    fingerprintContext,
  );
  assert.equal(preview.status, 'invalid_structure');
  assert.equal(preview.schemaValid, false);
  assert.equal(preview.recordCount, 1);
  assert.equal(preview.acceptedCount, 0);
  assert.equal(preview.rejectedRecordCount, 1);
  assert.equal(preview.structuralErrorCount, 1);
  assert.deepEqual(preview.structuralErrors, [{ line: 1, code: 'HEADER_MISMATCH' }]);
});

test('límite de registros respeta header y rechaza el siguiente registro', () => {
  const noHeaderDefinition = { ...pipeDefinition, header: false };
  const row = '1|2026-08-01|0';
  const exact = Buffer.from(Array.from({ length: GRH_SOURCE_PREVIEW_MAX_RECORDS }, () => row).join('\n'));
  const preview = previewGrhSource(exact, noHeaderDefinition, fingerprintContext);
  assert.equal(preview.recordCount, GRH_SOURCE_PREVIEW_MAX_RECORDS);
  assert.equal(preview.acceptedCount, GRH_SOURCE_PREVIEW_MAX_RECORDS);
  const overflow = Buffer.from(`${exact.toString('utf8')}\n${row}`);
  assert.throws(
    () => previewGrhSource(overflow, noHeaderDefinition, fingerprintContext),
    (error) => error instanceof GrhSourcePreviewError
      && error.code === 'GRH_SOURCE_TOO_MANY_RECORDS',
  );
  assert.throws(
    () => previewGrhSource(
      Buffer.from('\n'.repeat(GRH_SOURCE_PREVIEW_MAX_RECORDS + 1)),
      noHeaderDefinition,
      fingerprintContext,
    ),
    (error) => error instanceof GrhSourcePreviewError
      && error.code === 'GRH_SOURCE_TOO_MANY_RECORDS',
  );
});

test('ancho fijo declara bytes ASCII y rechaza multibyte sin desplazar campos', () => {
  const definition = {
    format: 'fixed_width',
    widthUnit: 'ascii_bytes',
    recordLength: 3,
    fields: [{ name: 'codigo', type: 'text', required: true, start: 0, length: 3 }],
  };
  const preview = previewGrhSource(Buffer.from('Aé'), definition, fingerprintContext);
  assert.equal(preview.acceptedCount, 0);
  assert.deepEqual(preview.rejections, [{ line: 1, code: 'NON_ASCII_FIXED_WIDTH' }]);
});

test('lote aplica presupuesto agregado y sólo devuelve referencias opacas', () => {
  const shared = Buffer.alloc(3 * 1024 * 1024, 0x31);
  assert.throws(
    () => previewGrhSourceBatch(
      Array.from({ length: 84 }, () => ({ bytes: shared })),
      { ...pipeDefinition, header: false },
      fingerprintContext,
    ),
    (error) => error instanceof GrhSourcePreviewError
      && error.code === 'GRH_SOURCE_BATCH_TOO_LARGE',
  );
  const safe = previewGrhSourceBatch([
    { bytes: Buffer.from('legajo|periodo|importe_tecnico\n1|2026-08-01|0') },
  ], pipeDefinition, fingerprintContext);
  assert.deepEqual(Object.keys(safe.previews[0]).includes('sourceId'), false);
  assert.equal(safe.previews[0].sourceRef, 'source-0001');
});

test('sólo encabezado es válido y los delimitadores son allowlist explícita', () => {
  const preview = previewGrhSource(
    Buffer.from('legajo|periodo|importe_tecnico'), pipeDefinition, fingerprintContext,
  );
  assert.equal(preview.recordCount, 0);
  assert.equal(preview.acceptedCount + preview.rejectedRecordCount, preview.recordCount);
  assert.throws(
    () => previewGrhSource(Buffer.from('x'), { ...pipeDefinition, delimiter: '\u0000' }, fingerprintContext),
    /delimiter debe ser/,
  );
});

test('pipe admite Windows-1252 sólo cuando la codificación se declara', () => {
  const definition = {
    format: 'pipe', encoding: 'windows-1252', delimiter: '|', header: true,
    fields: [
      { name: 'descripcion', type: 'text', required: true },
      { name: 'periodo', type: 'date', required: true },
    ],
  };
  const source = Buffer.from('descripcion|periodo\nObservación|2026-08-01', 'latin1');
  const preview = previewGrhSource(source, definition, fingerprintContext);

  assert.equal(preview.status, 'valid');
  assert.equal(preview.encoding, 'windows-1252');
  assert.equal(preview.includesRecordValues, false);
  assert.doesNotMatch(JSON.stringify(preview), /Observación/);
});

test('la codificación es allowlist y UTF-8 inválido falla cerrado', () => {
  assert.throws(
    () => previewGrhSource(Buffer.from('x'), { ...pipeDefinition, encoding: 'auto' }, fingerprintContext),
    (error) => error instanceof GrhSourcePreviewError
      && error.code === 'GRH_SOURCE_SCHEMA_INVALID',
  );
  assert.throws(
    () => previewGrhSource(Buffer.from([0xff, 0xfe]), pipeDefinition, fingerprintContext),
    (error) => error instanceof GrhSourcePreviewError
      && error.code === 'GRH_SOURCE_ENCODING_INVALID',
  );
});
