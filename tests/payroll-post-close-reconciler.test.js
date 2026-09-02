import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_POST_CLOSE_CONTRACT_VERSION,
  PAYROLL_POST_CLOSE_MAX_FILE_BYTES,
  PayrollPostCloseReconciliationError,
  formatArsCents,
  mountPayrollPostCloseReconciler,
  reconcilePostClose701703,
} from '../assets/payroll-post-close-reconciler.js';

const encoder = new TextEncoder();

function source({
  period = '2026-07', jurisdiction = '42', amount701 = '82882370,98',
  amount703 = '106546119,35', newline = '\n', header = 'periodo;jurisdiccion;concepto;importe_ars',
  rows,
} = {}) {
  return encoder.encode([
    header,
    ...(rows || [
      `${period};${jurisdiction};701;${amount701}`,
      `${period};${jurisdiction};703;${amount703}`,
    ]),
  ].join(newline));
}

async function reconcile(overrides = {}, options = {}) {
  return reconcilePostClose701703({
    period: '2026-07',
    jurisdiction: '42',
    observedBytes: source(),
    controlBytes: source({ newline: '\r\n' }),
    ...overrides,
  }, { cryptoImpl: webcrypto, ...options });
}

test('concilia 701 + 703 al centavo con BigInt y sin inferir reglas', async () => {
  const result = await reconcile();

  assert.equal(result.contractVersion, PAYROLL_POST_CLOSE_CONTRACT_VERSION);
  assert.equal(result.status, 'matched');
  assert.equal(result.reconciled, true);
  assert.equal(result.inputRequirementsSatisfied, true);
  assert.deepEqual(result.comparisons.map(({ concept }) => concept), ['701', '703']);
  assert.deepEqual(result.comparisons.map(({ differenceCents }) => differenceCents), ['0', '0']);
  assert.equal(result.jurisdictionTotal.observedCents, '18942849033');
  assert.equal(result.jurisdictionTotal.controlCents, '18942849033');
  assert.equal(result.jurisdictionTotal.differenceCents, '0');
  assert.equal(result.rulesInferred, false);
  assert.equal(result.includesPersonalRecords, false);
  assert.equal(result.persistencePerformed, false);
  assert.equal(result.networkPerformed, false);
  assert.equal(result.fiscalArtifactGenerated, false);
});

test('diferencia usa observado menos control y conserva montos mayores a MAX_SAFE_INTEGER', async () => {
  const result = await reconcile({
    observedBytes: source({ amount701: '90071992547409,93', amount703: '-1,00' }),
    controlBytes: source({ amount701: '90071992547409,92', amount703: '-0,99' }),
  });

  assert.equal(result.comparisons[0].observedCents, '9007199254740993');
  assert.equal(result.comparisons[0].differenceCents, '1');
  assert.equal(result.comparisons[1].differenceCents, '-1');
  assert.equal(result.status, 'difference_requires_observation');
  assert.equal(result.reconciled, false);
  assert.equal(result.inputRequirementsSatisfied, false);
});

test('una diferencia exige observación, pero recibirla no la documenta ni convierte en coincidencia', async () => {
  const inputs = {
    controlBytes: source({ amount701: '82882370,97' }),
  };
  const pending = await reconcile(inputs);
  assert.equal(pending.observationRequired, true);
  assert.equal(pending.observationProvided, false);
  assert.equal(pending.status, 'difference_requires_observation');

  const acknowledged = await reconcile({ ...inputs, observation: 'Revisar contra el control contable.' });
  assert.equal(acknowledged.status, 'difference_acknowledged');
  assert.equal(acknowledged.observationProvided, true);
  assert.equal(acknowledged.inputRequirementsSatisfied, true);
  assert.equal(acknowledged.reconciled, false);
  assert.doesNotMatch(JSON.stringify(acknowledged), /Revisar contra el control contable/);
});

test('jurisdicciones 42 y 55 se procesan en ejecuciones separadas', async () => {
  const fortyTwo = await reconcile();
  const fiftyFive = await reconcile({
    jurisdiction: '55',
    observedBytes: source({ jurisdiction: '55', amount701: '1,00', amount703: '2,00' }),
    controlBytes: source({ jurisdiction: '55', amount701: '1,00', amount703: '2,00', newline: '\r\n' }),
  });
  assert.equal(fortyTwo.jurisdiction, '42');
  assert.equal(fiftyFive.jurisdiction, '55');
  assert.equal(fiftyFive.jurisdictionTotal.observedCents, '300');

  await assert.rejects(
    reconcile({ observedBytes: source({ jurisdiction: '55' }) }),
    (error) => error.code === 'POST_CLOSE_JURISDICTION_MISMATCH',
  );
});

test('período, jurisdicción, encabezado y filas son un contrato exacto', async () => {
  const cases = [
    [{ period: '2026-13' }, 'POST_CLOSE_PERIOD_INVALID'],
    [{ jurisdiction: '43' }, 'POST_CLOSE_JURISDICTION_INVALID'],
    [{ observedBytes: source({ period: '2026-08' }) }, 'POST_CLOSE_PERIOD_MISMATCH'],
    [{ observedBytes: source({ header: 'concepto;importe' }) }, 'POST_CLOSE_HEADER_INVALID'],
    [{ observedBytes: source({ rows: ['2026-07;42;701;1,00'] }) }, 'POST_CLOSE_ROW_COUNT_INVALID'],
    [{ observedBytes: source({ rows: [
      '2026-07;42;701;1,00', '2026-07;42;701;2,00',
    ] }) }, 'POST_CLOSE_CONCEPT_DUPLICATED'],
    [{ observedBytes: source({ rows: [
      '2026-07;42;701;1,00', '2026-07;42;704;2,00',
    ] }) }, 'POST_CLOSE_CONCEPT_INVALID'],
  ];
  for (const [overrides, code] of cases) {
    await assert.rejects(reconcile(overrides), (error) => error.code === code, code);
  }
});

test('rechaza importes ambiguos en lugar de redondear o convertir con Number', async () => {
  for (const value of ['1', '1,0', '1,001', '1.000,00', '1.00', '+1,00', '01,00', '-0,00']) {
    await assert.rejects(
      reconcile({ observedBytes: source({ amount701: value }) }),
      (error) => error.code === 'POST_CLOSE_AMOUNT_INVALID',
      value,
    );
  }
  assert.equal(formatArsCents('9007199254740993'), '$ 90.071.992.547.409,93');
  assert.equal(formatArsCents('-1'), '-$ 0,01');
});

test('SHA-256 cubre los bytes crudos de cada fuente y no su texto normalizado', async () => {
  const observedBytes = source();
  const controlBytes = source({ newline: '\r\n' });
  const result = await reconcile({ observedBytes, controlBytes });
  const expected = createHash('sha256').update(observedBytes).digest('hex');

  assert.equal(result.sources.observed.sha256, `sha256:${expected}`);
  assert.notEqual(result.sources.observed.sha256, result.sources.control.sha256);
  assert.equal(result.status, 'matched', 'CRLF y LF no alteran los centavos reconciliados');

  const identical = await reconcile({ observedBytes, controlBytes: observedBytes });
  assert.deepEqual(identical.warnings, ['SOURCE_BYTES_IDENTICAL']);
});

test('aplica límites duros, UTF-8 fatal y cuerpo exacto', async () => {
  await assert.rejects(
    reconcile({ observedBytes: new Uint8Array(PAYROLL_POST_CLOSE_MAX_FILE_BYTES + 1) }),
    (error) => error.code === 'POST_CLOSE_SOURCE_TOO_LARGE',
  );
  await assert.rejects(
    reconcile({ observedBytes: Uint8Array.from([0xc3, 0x28]) }),
    (error) => error.code === 'POST_CLOSE_ENCODING_INVALID',
  );
  await assert.rejects(
    reconcile({ fileName: 'personal.csv' }),
    (error) => error.code === 'POST_CLOSE_INPUT_INVALID',
  );
  await assert.rejects(
    reconcile({ observation: 'x'.repeat(501) }),
    (error) => error.code === 'POST_CLOSE_OBSERVATION_INVALID',
  );
});

test('la salida tiene superficie agregada exacta y nunca devuelve filas, nombres u observación', async () => {
  const marker = 'dato-personal-778899';
  const result = await reconcile({ observation: marker });

  assert.deepEqual(Object.keys(result).sort(), [
    'comparisons', 'contractVersion', 'fiscalArtifactGenerated', 'includesPersonalRecords',
    'inputRequirementsSatisfied', 'jurisdiction', 'jurisdictionTotal', 'networkPerformed', 'observationProvided',
    'observationRequired', 'period', 'persistencePerformed', 'reconciled',
    'rulesInferred', 'sources', 'status', 'warnings',
  ].sort());
  assert.doesNotMatch(JSON.stringify(result), /dato-personal|fileName|rawRow|observationText/);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.comparisons), true);
});

test('el módulo browser permanece local, sin red, storage, logs ni HTML dinámico', () => {
  const sourceCode = fs.readFileSync(
    new URL('../assets/payroll-post-close-reconciler.js', import.meta.url), 'utf8',
  );
  assert.match(sourceCode, /export async function reconcilePostClose701703/);
  assert.match(sourceCode, /export function mountPayrollPostCloseReconciler/);
  assert.match(sourceCode, /cryptoImpl\.subtle\.digest\('SHA-256', bytes\)/);
  assert.match(sourceCode, /\.textContent\s*=/);
  assert.match(sourceCode, /replaceChildren\(\)/);
  assert.doesNotMatch(sourceCode, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(sourceCode, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(sourceCode, /console\.|innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(sourceCode, /file\.name|\.fileName/);
  assert.doesNotMatch(sourceCode, /\beval\s*\(|\bnew\s+Function\b/);
  assert.equal(mountPayrollPostCloseReconciler({ querySelector: () => null }), false);
});

test('errores públicos usan códigos cerrados y mensajes sin contenido de fuente', async () => {
  const secret = 'PERSONA-SECRETA-112233';
  await assert.rejects(
    reconcile({
      observedBytes: source({ rows: [
        `2026-07;42;701;${secret}`,
        '2026-07;42;703;1,00',
      ] }),
    }),
    (error) => {
      assert.equal(error instanceof PayrollPostCloseReconciliationError, true);
      assert.equal(error.code, 'POST_CLOSE_AMOUNT_INVALID');
      assert.doesNotMatch(error.message, /PERSONA-SECRETA|112233/);
      return true;
    },
  );
});
