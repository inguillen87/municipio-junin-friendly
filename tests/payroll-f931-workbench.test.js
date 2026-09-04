import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_F931_MAX_SOURCE_BYTES,
  PAYROLL_F931_OBSERVED_PROFILE,
  PayrollF931PrevalidationError,
} from '../assets/payroll-f931-prevalidator.js';
import {
  PAYROLL_F931_REQUIREMENT_LABELS,
  PAYROLL_F931_SCOPE_LABELS,
  analyzePayrollF931Source,
  matchPayrollF931ObservedSamples,
} from '../assets/payroll-f931-workbench.js';

function row(fill = 0x41) {
  return new Uint8Array(463).fill(fill);
}

function crlf(records, { finalCrlf = true } = {}) {
  const result = new Uint8Array(
    records.reduce((sum, record) => sum + record.byteLength, 0)
      + Math.max(0, records.length - 1) * 2
      + (finalCrlf ? 2 : 0),
  );
  let offset = 0;
  records.forEach((record, index) => {
    result.set(record, offset);
    offset += record.byteLength;
    if (index < records.length - 1 || finalCrlf) {
      result[offset] = 0x0d;
      result[offset + 1] = 0x0a;
      offset += 2;
    }
  });
  return result;
}

function hasCode(code) {
  return (error) => error instanceof PayrollF931PrevalidationError && error.code === code;
}

test('identifica cada muestra sólo por su huella exacta, sin usar el nombre del archivo', () => {
  for (const [scope, evidence] of Object.entries(PAYROLL_F931_OBSERVED_PROFILE.observedArtifacts)) {
    const matches = matchPayrollF931ObservedSamples(evidence.sha256);
    assert.equal(matches.length, 3);
    assert.deepEqual(matches.filter((entry) => entry.matches).map((entry) => entry.scope), [scope]);
    assert.equal(matches.find((entry) => entry.scope === scope).label, PAYROLL_F931_SCOPE_LABELS[scope]);
    assert.equal(matches.find((entry) => entry.scope === scope).observedRecordCount,
      evidence.physicalRecordCount);
    assert.equal(Object.isFrozen(matches), true);
  }
  assert.equal(matchPayrollF931ObservedSamples(`sha256:${'0'.repeat(64)}`).some((entry) => entry.matches), false);
});

test('modo automático prevalida un TXT nuevo sin atribuirle un ámbito por intuición', async () => {
  const marker = new TextEncoder().encode('PERSONA-PRIVADA-NO-MOSTRAR');
  const first = row();
  first.set(marker, 0);
  const result = await analyzePayrollF931Source(crlf([first, row(0xd1)]), {
    scopeMode: 'auto',
    cryptoImpl: webcrypto,
  });

  assert.equal(result.status, 'valid_structure_requires_scope_review');
  assert.equal(result.structureValid, true);
  assert.equal(result.scopeMode, 'auto');
  assert.equal(result.resolvedScope, null);
  assert.equal(result.scopeLabel, 'No identificable por huella');
  assert.equal(result.physicalRecordCount, 2);
  assert.equal(result.recordWidthBytes, 463);
  assert.equal(result.reviewCodes[0], 'F931_SCOPE_NOT_IDENTIFIED_BY_REFERENCE_HASH');
  assert.equal(result.referenceMatches.some((entry) => entry.matches), false);
  assert.equal(result.sourceValuesIncluded, false);
  assert.equal(result.fileNameIncluded, false);
  assert.equal(result.persistencePerformed, false);
  assert.equal(result.networkPerformed, false);
  assert.equal(result.generationAllowed, false);
  assert.equal(result.officialSubmissionAllowed, false);
  assert.doesNotMatch(JSON.stringify(result), /PERSONA-PRIVADA|NO-MOSTRAR/);
});

test('modo declarado clasifica el precontrol sin convertirlo en homologación', async () => {
  const result = await analyzePayrollF931Source(crlf([row(0x42)]), {
    scopeMode: 'declared',
    declaredScope: 'jurisdiction_42',
    cryptoImpl: webcrypto,
  });
  assert.equal(result.status, 'valid_observed_structure_unmapped');
  assert.equal(result.scopeMode, 'declared');
  assert.equal(result.resolvedScope, 'jurisdiction_42');
  assert.equal(result.scopeLabel, 'Jurisdicción 42');
  assert.deepEqual(result.reviewCodes, []);
  assert.equal(result.semanticMappingComplete, false);
  assert.equal(result.populationFilterVerified, false);
  assert.equal(result.homologated, false);
});

test('expone incidencias seguras y nunca devuelve bytes o contenido', async () => {
  const privateMarker = new TextEncoder().encode('DATO-PRIVADO-887766');
  const invalid = new Uint8Array(462);
  invalid.fill(0x41);
  invalid.set(privateMarker, 0);
  invalid[40] = 0x00;
  const result = await analyzePayrollF931Source(invalid, {
    scopeMode: 'declared',
    declaredScope: 'general',
    cryptoImpl: webcrypto,
  });
  assert.equal(result.status, 'invalid_structure');
  assert.equal(result.structureValid, false);
  assert.ok(result.issues.some((issue) => issue.code === 'F931_RECORD_WIDTH_MISMATCH'));
  assert.ok(result.issues.some((issue) => issue.code === 'F931_CRLF_REQUIRED'));
  assert.ok(result.issues.some((issue) => issue.code === 'F931_CONTROL_BYTE_NOT_ALLOWED'));
  assert.ok(result.issues.every((issue) => typeof issue.label === 'string' && issue.label.length > 10));
  assert.equal(Object.hasOwn(result, 'bytes'), false);
  assert.doesNotMatch(JSON.stringify(result), /DATO-PRIVADO|887766/);
});

test('límites y modos inválidos fallan cerrados antes de renderizar', async () => {
  await assert.rejects(
    analyzePayrollF931Source(new Uint8Array(PAYROLL_F931_MAX_SOURCE_BYTES + 1), {
      scopeMode: 'auto', cryptoImpl: webcrypto,
    }),
    hasCode('F931_SOURCE_TOO_LARGE'),
  );
  await assert.rejects(
    analyzePayrollF931Source(crlf([row()]), { scopeMode: 'inferir-por-nombre', cryptoImpl: webcrypto }),
    hasCode('F931_SCOPE_MODE_INVALID'),
  );
  await assert.rejects(
    analyzePayrollF931Source(crlf([row()]), {
      scopeMode: 'declared', declaredScope: 'otra', cryptoImpl: webcrypto,
    }),
    hasCode('F931_SCOPE_UNKNOWN'),
  );
});

test('catálogo traduce los once bloqueos de homologación a lenguaje operativo', () => {
  const missing = PAYROLL_F931_OBSERVED_PROFILE.unknownRequirements;
  assert.equal(missing.length, 11);
  assert.deepEqual(Object.keys(PAYROLL_F931_REQUIREMENT_LABELS), missing);
  for (const value of Object.values(PAYROLL_F931_REQUIREMENT_LABELS)) {
    assert.equal(typeof value, 'string');
    assert.ok(value.length > 20);
  }
});

test('Reportes RRHH publica una única superficie accesible y mantiene acciones críticas deshabilitadas', () => {
  const html = fs.readFileSync(new URL('../reportes-rrhh.html', import.meta.url), 'utf8');
  assert.equal((html.match(/data-payroll-f931-workbench/g) || []).length, 1);
  assert.equal((html.match(/assets\/payroll-f931-workbench\.js/g) || []).length, 1);
  assert.match(html, /id="f931"[^>]+aria-labelledby="f931Title"/);
  assert.match(html, /href="#f931">F\.931 asistido</);
  assert.match(html, /data-f931-scope-mode/);
  assert.match(html, /value="auto">Automática por huella/);
  assert.match(html, /value="declared">Declarada por el responsable/);
  assert.match(html, /data-f931-file[^>]+accept="\.txt,text\/plain"/);
  assert.match(html, /data-f931-generate[^>]+disabled>Generar TXT/);
  assert.match(html, /data-f931-submit[^>]+disabled>Presentar a ARCA/);
  assert.match(html, /No se sube, no se guarda y no se muestra su nombre/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]+?\.f931-reference ul \{ grid-template-columns: 1fr; \}/);
});

test('workbench y service worker no introducen red, storage ni exposición de nombres', () => {
  const source = fs.readFileSync(new URL('../assets/payroll-f931-workbench.js', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(source, /console\.|source\.name|file\.name/);
  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML|outerHTML/);
  assert.match(worker, /'\/assets\/payroll-f931-prevalidator\.js'/);
  assert.match(worker, /'\/assets\/payroll-f931-workbench\.js'/);
});
