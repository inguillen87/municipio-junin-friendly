import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_SCHOOLING_REQUIREMENT_LABELS,
  analyzePayrollSchoolingWorkbookSource,
  createPayrollSchoolingReportWorkbench,
} from '../assets/payroll-schooling-report-workbench.js';

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
    const data = encoder.encode(entry.content || '<xml/>');
    const local = new Uint8Array(30 + name.byteLength + data.byteLength);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20);
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

function validXlsxBytes(privateMarker = '') {
  return createStoreZip([
    { name: '[Content_Types].xml' },
    { name: '_rels/.rels' },
    { name: 'xl/workbook.xml' },
    { name: 'xl/worksheets/sheet1.xml', content: `<worksheet>${privateMarker}</worksheet>` },
  ]);
}

test('diagnostica un XLSX local sin devolver nombre, celdas ni bytes fuente', async () => {
  const privateMarker = 'PERSONA-PRIVADA-998877';
  const bytes = validXlsxBytes(privateMarker);
  const diagnostic = await analyzePayrollSchoolingWorkbookSource({
    name: 'escolaridad-personal-secreta.xlsx',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  }, { cryptoImpl: webcrypto });

  assert.equal(diagnostic.status, 'valid_xlsx_container_unmapped');
  assert.equal(diagnostic.structureValid, true);
  assert.equal(diagnostic.zipEntryCount, 4);
  assert.equal(diagnostic.worksheetPartCount, 1);
  assert.match(diagnostic.sourceSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(diagnostic.generationAllowed, false);
  assert.equal(diagnostic.officialUseAllowed, false);
  assert.equal(diagnostic.sourceValuesIncluded, false);
  assert.equal(diagnostic.persistencePerformed, false);
  assert.equal(Object.hasOwn(diagnostic, 'bytes'), false);
  assert.doesNotMatch(JSON.stringify(diagnostic), /escolaridad-personal|PERSONA-PRIVADA|998877/);
});

function fakeNode() {
  return {
    textContent: '', dataset: {}, disabled: false, hidden: false, files: [], children: [],
    addEventListener(type, handler) { this[`on${type}`] = handler; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    reset() {},
  };
}

test('factory muestra requisitos y conserva bloqueada la generación aunque el contenedor sea válido', async () => {
  const selectors = Object.fromEntries([
    '[data-schooling-form]', '[data-schooling-file]', '[data-schooling-validate]',
    '[data-schooling-reset]', '[data-schooling-status]', '[data-schooling-requirements]',
    '[data-schooling-result]', '[data-schooling-structure]', '[data-schooling-parts]',
    '[data-schooling-worksheets]', '[data-schooling-bytes]', '[data-schooling-fingerprint]',
    '[data-schooling-issues]', '[data-schooling-generation]', '[data-schooling-gate]',
  ].map((selector) => [selector, fakeNode()]));
  const bytes = validXlsxBytes('CONTENIDO-NO-VISIBLE');
  selectors['[data-schooling-file]'].files = [{
    name: 'legajo-privado.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes.buffer,
  }];
  const root = {
    ownerDocument: null,
    attributes: {},
    querySelector: (selector) => selectors[selector] || null,
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const documentImpl = { createElement: () => fakeNode() };
  const workbench = createPayrollSchoolingReportWorkbench(root, { documentImpl, cryptoImpl: webcrypto });
  const diagnostic = await workbench.analyze();

  assert.equal(diagnostic.structureValid, true);
  assert.equal(selectors['[data-schooling-generation]'].disabled, true);
  assert.match(selectors['[data-schooling-gate]'].textContent, /Generación bloqueada/);
  assert.match(selectors['[data-schooling-structure]'].textContent, /Contenedor XLSX válido/);
  assert.equal(
    selectors['[data-schooling-requirements]'].children.length,
    Object.keys(PAYROLL_SCHOOLING_REQUIREMENT_LABELS).length,
  );
  assert.doesNotMatch(JSON.stringify({
    diagnostic,
    status: selectors['[data-schooling-status]'].textContent,
    gate: selectors['[data-schooling-gate]'].textContent,
  }), /legajo-privado|CONTENIDO-NO-VISIBLE/);
});

test('superficie RRHH explica el alcance, ofrece diagnóstico y no habilita una salida inventada', () => {
  const html = fs.readFileSync(new URL('../reportes-rrhh.html', import.meta.url), 'utf8');
  assert.match(html, /id="escolaridades"[^>]+data-payroll-schooling-report-workbench/);
  assert.match(html, /Diagnóstico local de escolaridades/);
  assert.match(html, /REP-08 solicitado/);
  assert.match(html, /no adivina columnas, fórmulas ni reglas/);
  assert.match(html, /No se sube, no se guarda en Neon/);
  assert.match(html, /data-schooling-file[^>]+accept="\.xlsx/);
  assert.match(html, /data-schooling-status[^>]+role="status" aria-live="polite"/);
  assert.match(html, /data-schooling-generation type="button" disabled>Generar Excel/);
  assert.equal((html.match(/assets\/payroll-schooling-report-workbench\.js/g) || []).length, 1);
});

test('módulo browser no usa red, storage, logs, nombres ni HTML inseguro', () => {
  const source = fs.readFileSync(
    new URL('../assets/payroll-schooling-report-workbench.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /data-payroll-schooling-report-workbench/);
  assert.match(source, /inspectPayrollSchoolingWorkbook/);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(source, /console\.|innerHTML|outerHTML|\.name\b/);
  assert.match(source, /generationAllowed: false/);
  assert.match(source, /officialUseAllowed: false/);
});

test('el PWA declara ambos módulos del diagnóstico entre sus recursos públicos sin identidad', () => {
  const worker = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(worker, /Sólo contenido público, agregado y sin identidad personal/);
  assert.match(worker, /'\/assets\/payroll-schooling-report\.js'/);
  assert.match(worker, /'\/assets\/payroll-schooling-report-workbench\.js'/);
});
