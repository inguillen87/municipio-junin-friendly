import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { canonicalAggregate } from '../assets/grh-source-preview.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Nómina expone una previsualización privada claramente separada de importar y liquidar', () => {
  const html = read('nomina-control.html');

  assert.match(html, /04 · PREVISUALIZACIÓN DE FUENTE/);
  assert.match(html, /Analizar un archivo mensual sin importarlo/);
  assert.match(html, /no representa una conexión en vivo con GRH/);
  assert.match(html, /data-grh-source-preview/);
  assert.match(html, /<label for="sourcePreviewDefinition">/);
  assert.match(html, /grh-calculo-pipe-utf8\.v1/);
  assert.match(html, /grh-calculo-semicolon-windows1252\.v1/);
  assert.match(html, /<label for="sourcePreviewFile">/);
  assert.match(html, /Analizar sin importar/);
  assert.match(html, /No crea una corrida, no liquida y no modifica PostgreSQL ni GRH/);
  assert.match(html, /data-source-preview-status role="status" aria-live="polite"/);
  assert.match(html, /no persiste el archivo ni el resultado/);
  assert.equal((html.match(/assets\/grh-source-preview\.js/g) || []).length, 1);
  assert.match(html, /No se pudieron consultar las corridas de nómina/);
  assert.match(html, /Las herramientas estructurales independientes permanecen visibles y conservan sus propios controles de acceso/);
});

function validPayload(overrides = {}) {
  return {
    ok: true,
    includesRecordValues: false,
    persistencePerformed: false,
    data: {
      contractVersion: 'grh-source-preview.v1',
      definitionKey: 'grh-calculo-pipe-utf8.v1',
      status: 'has_rejections',
      format: 'pipe',
      encoding: 'utf-8',
      contentFingerprint: `hmac-sha256:${'a'.repeat(64)}`,
      schemaSha256: 'b'.repeat(64),
      byteLength: 128,
      recordCount: 2,
      acceptedCount: 1,
      rejectedRecordCount: 1,
      structuralErrorCount: 0,
      issueCount: 1,
      schemaValid: true,
      rejectionSummary: { LEGAJO_INTEGER_INVALID: 1 },
      rejectionsTruncated: false,
      includesRecordValues: false,
      persistencePerformed: false,
      ...overrides,
    },
  };
}

test('el cliente rechaza respuestas 200 internamente incoherentes', () => {
  assert.ok(canonicalAggregate(validPayload()));
  assert.equal(canonicalAggregate(validPayload({ contractVersion: 'grh-source-preview.v2' })), null);
  assert.equal(canonicalAggregate(validPayload({ encoding: 'windows-1252' })), null);
  assert.equal(canonicalAggregate(validPayload({ status: 'valid' })), null);
  assert.equal(canonicalAggregate(validPayload({ schemaValid: false })), null);
  assert.equal(canonicalAggregate(validPayload({ issueCount: 2 })), null);
  assert.equal(canonicalAggregate(validPayload({ rejectionSummary: {} })), null);
});

test('el cliente envía sólo definición allowlisted y contenido, y renderiza texto seguro', () => {
  const source = read('assets/grh-source-preview.js');

  assert.match(source, /const MAX_FILE_BYTES = 2 \* 1024 \* 1024/);
  assert.match(source, /\/api\/internal-grh-source-preview/);
  assert.match(source, /JSON\.stringify\(\{ definitionKey, contentBase64 \}\)/);
  assert.match(source, /includesRecordValues !== false/);
  assert.match(source, /persistencePerformed !== false/);
  assert.match(source, /\.textContent\s*=/);
  assert.match(source, /replaceChildren\(\)/);
  assert.doesNotMatch(source, /file\.name/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|XMLHttpRequest/);
  assert.doesNotMatch(source, /tenantId|sourceBindingId|fingerprintKey/);
});

test('el build publica el cliente privado sin precache y Vercel registra el endpoint', () => {
  const build = read('scripts/build-friendly.mjs');
  const worker = read('sw.js');
  const vercel = read('vercel.json');

  assert.match(build, /'assets\/grh-source-preview\.js'/);
  assert.doesNotMatch(worker, /grh-source-preview/);
  assert.match(vercel, /"api\/internal-grh-source-preview\.js"/);
});
