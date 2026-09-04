import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_HEALTH_WORKBENCH_MAX_FILES,
  analyzePayrollHealthFiles,
  createPayrollHealthFixedWidthWorkbench,
  detectPayrollHealthProfile,
} from '../assets/payroll-health-fixed-width-workbench.js';
import { PayrollHealthFixedWidthError } from '../assets/payroll-health-fixed-width.js';

function detail(width, fill = 0x41) {
  return new Uint8Array(width).fill(fill);
}

function joinCrlf(records) {
  const result = new Uint8Array(records.reduce((total, row) => total + row.byteLength + 2, 0));
  let offset = 0;
  for (const row of records) {
    result.set(row, offset);
    offset += row.byteLength;
    result.set([0x0d, 0x0a], offset);
    offset += 2;
  }
  return result;
}

function osepFooterSource() {
  const body = joinCrlf([detail(206)]);
  const footer = new Uint8Array(25).fill(0x09);
  footer[24] = 0x20;
  const result = new Uint8Array(body.byteLength + footer.byteLength);
  result.set(body, 0);
  result.set(footer, body.byteLength);
  return result;
}

function hasCode(code) {
  return (error) => error instanceof PayrollHealthFixedWidthError && error.code === code;
}

test('detecta únicamente perfiles allowlisted observados', async () => {
  const mutual = await detectPayrollHealthProfile(joinCrlf([detail(121)]), { cryptoImpl: webcrypto });
  assert.equal(mutual.profileId, 'seguro-mutual-121-crlf.v1');
  const osep = await detectPayrollHealthProfile(osepFooterSource(), { cryptoImpl: webcrypto });
  assert.equal(osep.profileId, 'osep-206-tab-footer25.v1');
  await assert.rejects(
    detectPayrollHealthProfile(joinCrlf([detail(77)]), { cryptoImpl: webcrypto }),
    hasCode('HEALTH_PROFILE_NOT_DETECTED'),
  );
});

test('analiza varios TXT y sólo devuelve diagnóstico agregado sin contenido ni nombres', async () => {
  const marker = 'APELLIDO-DOCUMENTO-PRIVADO';
  const first = joinCrlf([detail(185), detail(185, 0xd1)]);
  const secondRow = detail(121);
  secondRow.set(new TextEncoder().encode(marker), 0);
  const second = joinCrlf([secondRow]);
  const analysis = await analyzePayrollHealthFiles([
    { name: 'persona-secreta.txt', size: first.byteLength, arrayBuffer: async () => first.buffer },
    { name: 'legajo-998877.txt', size: second.byteLength, arrayBuffer: async () => second.buffer },
  ], {
    cryptoImpl: webcrypto,
    expectedCents: '9007199254740993',
    artifactCents: '9007199254740994',
  });

  assert.equal(analysis.status, 'valid_structure');
  assert.deepEqual(analysis.summary, {
    fileCount: 2,
    validFileCount: 2,
    invalidFileCount: 0,
    totalByteCount: first.byteLength + second.byteLength,
    detailRecordCount: 3,
    terminalRecordCount: 0,
    issueCount: 0,
  });
  assert.equal(analysis.amountReconciliation.differenceCents, '1');
  assert.equal(analysis.generationAllowed, false);
  assert.equal(analysis.officialSubmissionAllowed, false);
  assert.equal(analysis.persistencePerformed, false);
  assert.equal(analysis.results[0].sourceIndex, 1);
  assert.match(analysis.results[0].rawSha256, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(analysis), /persona-secreta|legajo-998877|APELLIDO|DOCUMENTO|PRIVADO/);
});

test('perfil elegido informa códigos y conteos sin devolver bytes fuente', async () => {
  const analysis = await analyzePayrollHealthFiles([joinCrlf([detail(120)])], {
    profileId: 'seguro-mutual-121-crlf.v1',
    cryptoImpl: webcrypto,
  });
  assert.equal(analysis.status, 'invalid_structure');
  assert.equal(analysis.summary.issueCount, 1);
  assert.deepEqual(analysis.results[0].issueCodes, [
    { code: 'HEALTH_DETAIL_WIDTH_MISMATCH', count: 1 },
  ]);
  assert.equal(analysis.results[0].sourceValuesIncluded, false);
  assert.equal(Object.hasOwn(analysis.results[0], 'bytes'), false);
});

test('límites y conciliación incompleta fallan cerrado antes de presentar resultados', async () => {
  await assert.rejects(
    analyzePayrollHealthFiles(Array.from({ length: PAYROLL_HEALTH_WORKBENCH_MAX_FILES + 1 }, () => detail(1)), {
      cryptoImpl: webcrypto,
    }),
    hasCode('HEALTH_WORKBENCH_FILE_COUNT_INVALID'),
  );
  await assert.rejects(
    analyzePayrollHealthFiles([joinCrlf([detail(121)])], {
      expectedCents: '100', cryptoImpl: webcrypto,
    }),
    hasCode('HEALTH_WORKBENCH_RECONCILIATION_INCOMPLETE'),
  );
});

function fakeNode() {
  return {
    textContent: '', dataset: {}, disabled: false, files: [], value: '', children: [],
    addEventListener(type, handler) { this[`on${type}`] = handler; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    reset() {},
  };
}

test('factory es inyectable, no muestra nombres y mantiene cerrado el canal oficial', async () => {
  const selectors = Object.fromEntries([
    '[data-health-form]', '[data-health-files]', '[data-health-profile]',
    '[data-health-expected-records]', '[data-health-expected-cents]',
    '[data-health-artifact-cents]', '[data-health-reset]', '[data-health-status]',
    '[data-health-summary]', '[data-health-results]', '[data-health-official-gate]',
  ].map((selector) => [selector, fakeNode()]));
  selectors['[data-health-profile]'].value = 'auto';
  const source = joinCrlf([detail(121)]);
  selectors['[data-health-files]'].files = [{
    name: 'NO-DEBE-VERSE-123.txt', size: source.byteLength, arrayBuffer: async () => source.buffer,
  }];
  const root = {
    attributes: {},
    querySelector: (selector) => selectors[selector] || null,
    querySelectorAll: () => [],
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const documentImpl = { createElement: () => fakeNode() };
  const workbench = createPayrollHealthFixedWidthWorkbench(root, { documentImpl, cryptoImpl: webcrypto });
  const analysis = await workbench.analyze();
  assert.equal(analysis.summary.fileCount, 1);
  assert.match(selectors['[data-health-official-gate]'].textContent, /bloqueadas hasta homologación byte a byte/);
  assert.doesNotMatch(JSON.stringify({
    analysis,
    status: selectors['[data-health-status]'].textContent,
    summary: selectors['[data-health-summary]'].children,
    results: selectors['[data-health-results]'].children,
  }), /NO-DEBE-VERSE/);
});

test('módulo browser auto-inicializa por data attribute y no usa red, storage, logs ni HTML inseguro', () => {
  const source = fs.readFileSync(
    new URL('../assets/payroll-health-fixed-width-workbench.js', import.meta.url), 'utf8',
  );
  assert.match(source, /data-payroll-health-fixed-width-workbench/);
  assert.match(source, /createPayrollHealthFixedWidthWorkbench/);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(source, /console\.|innerHTML|outerHTML|\.name\b/);
  assert.match(source, /officialSubmissionAllowed: false/);
  assert.match(source, /Generación y presentación oficial bloqueadas/);
  const html = fs.readFileSync(new URL('../nomina-control.html', import.meta.url), 'utf8');
  const build = fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');
  assert.match(html, /09 · OSEP Y SEGURO MUTUAL/);
  assert.match(html, /data-payroll-health-fixed-width-workbench/);
  assert.equal((html.match(/assets\/payroll-health-fixed-width-workbench\.js/g) || []).length, 1);
  assert.match(build, /'assets\/payroll-health-fixed-width\.js'/);
  assert.match(build, /'assets\/payroll-health-fixed-width-workbench\.js'/);
});
