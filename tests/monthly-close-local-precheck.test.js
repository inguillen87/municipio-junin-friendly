import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  MONTHLY_CLOSE_LOCAL_HEADERS,
  MONTHLY_CLOSE_LOCAL_MAX_FILE_BYTES,
  MONTHLY_CLOSE_LOCAL_PRECHECK_VERSION,
  MonthlyCloseLocalPrecheckError,
  formatMonthlyCloseCents,
  mountMonthlyCloseLocalPrecheck,
  prepareMonthlyCloseLocalPrecheck,
} from '../assets/monthly-close-local-precheck.js';
import { MONTHLY_CLOSE_SOURCE_CONTRACTS } from '../lib/internal-monthly-close-contracts.js';

const encoder = new TextEncoder();

function bytes(lines, newline = '\n') {
  return encoder.encode(lines.join(newline));
}

function conceptSource({ first = '1000', second = '2000', includeSecond = true } = {}) {
  return bytes([
    MONTHLY_CLOSE_LOCAL_HEADERS.conceptStatistics,
    `2026-08;42;1;993;2;200;${first};0;0;0;0`,
    ...(includeSecond ? [`2026-08;42;2;994;3;300;${second};100;0;50;0`] : []),
  ]);
}

function bankSource({ first = '1000', second = '2050', includeSecond = true } = {}) {
  return bytes([
    MONTHLY_CLOSE_LOCAL_HEADERS.bankSummary,
    `2026-08;42;1;191;cuenta_corriente;2;${first}`,
    ...(includeSecond ? [`2026-08;42;2;72;caja_ahorro;3;${second}`] : []),
  ], '\r\n');
}

async function precheck(overrides = {}) {
  return prepareMonthlyCloseLocalPrecheck({
    period: '2026-08',
    jurisdiction: '42',
    conceptBytes: conceptSource(),
    bankBytes: bankSource(),
    ...overrides,
  }, { cryptoImpl: webcrypto });
}

test('concilia al centavo por repartición y sólo habilita revisión humana', async () => {
  const result = await precheck();
  assert.equal(result.contractVersion, MONTHLY_CLOSE_LOCAL_PRECHECK_VERSION);
  assert.equal(result.status, 'matched');
  assert.equal(result.readyForReview, true);
  assert.equal(result.toleranceCents, '0');
  assert.equal(result.rulesInferred, false);
  assert.deepEqual(result.comparisons, [
    {
      repartitionCode: '1',
      reportedEarningsLessRetentionsCents: '1000',
      reportedBankNetCents: '1000',
      differenceCents: '0',
      matches: true,
      issueCode: null,
    },
    {
      repartitionCode: '2',
      reportedEarningsLessRetentionsCents: '2050',
      reportedBankNetCents: '2050',
      differenceCents: '0',
      matches: true,
      issueCode: null,
    },
  ]);
  assert.deepEqual(result.totals, {
    reportedEarningsLessRetentionsCents: '3050',
    reportedBankNetCents: '3050',
    differenceCents: '0',
  });
  assert.equal(result.provenanceVerified, false);
  assert.equal(result.persistencePerformed, false);
  assert.equal(result.governmentSummaryCompared, false);
  assert.equal(result.payrollCalculated, false);
  assert.equal(result.closeApproved, false);
  assert.equal(result.bankArtifactGenerated, false);
  assert.equal(result.tribunalArtifactGenerated, false);
  assert.equal(result.fiscalArtifactGenerated, false);
});

test('bloquea cualquier centavo de diferencia y las reparticiones ausentes', async () => {
  const mismatch = await precheck({ bankBytes: bankSource({ first: '999' }) });
  assert.equal(mismatch.status, 'blocked');
  assert.equal(mismatch.readyForReview, false);
  assert.deepEqual(mismatch.comparisons[0], {
    repartitionCode: '1',
    reportedEarningsLessRetentionsCents: '1000',
    reportedBankNetCents: '999',
    differenceCents: '1',
    matches: false,
    issueCode: 'NET_MISMATCH',
  });

  const compensated = await precheck({
    bankBytes: bankSource({ first: '999', second: '2051' }),
  });
  assert.equal(compensated.totals.differenceCents, '0');
  assert.equal(compensated.status, 'blocked');
  assert.equal(compensated.comparisons.every((row) => !row.matches), true);

  const missingBank = await precheck({ bankBytes: bankSource({ includeSecond: false }) });
  assert.deepEqual(missingBank.comparisons[1], {
    repartitionCode: '2',
    reportedEarningsLessRetentionsCents: '2050',
    reportedBankNetCents: null,
    differenceCents: null,
    matches: false,
    issueCode: 'MISSING_BANK_SUMMARY',
  });

  const missingConcept = await precheck({ conceptBytes: conceptSource({ includeSecond: false }) });
  assert.deepEqual(missingConcept.comparisons[1], {
    repartitionCode: '2',
    reportedEarningsLessRetentionsCents: null,
    reportedBankNetCents: '2050',
    differenceCents: null,
    matches: false,
    issueCode: 'MISSING_CONCEPT_STATISTICS',
  });
});

test('usa BigInt y conserva centavos superiores a Number.MAX_SAFE_INTEGER', async () => {
  const amount = '9007199254740993';
  const result = await precheck({
    conceptBytes: conceptSource({ first: amount, includeSecond: false }),
    bankBytes: bankSource({ first: amount, includeSecond: false }),
  });
  assert.equal(result.totals.reportedEarningsLessRetentionsCents, amount);
  assert.equal(result.totals.reportedBankNetCents, amount);
  assert.equal(result.totals.differenceCents, '0');
  assert.equal(formatMonthlyCloseCents(amount), '$ 90.071.992.547.409,93');
});

test('bloquea overflow int64 antes de devolver totales o diferencias', async () => {
  const maximum = '9223372036854775807';
  const minimum = '-9223372036854775808';
  await assert.rejects(
    precheck({
      conceptBytes: bytes([
        MONTHLY_CLOSE_LOCAL_HEADERS.conceptStatistics,
        `2026-08;42;1;993;1;1;${maximum};${maximum};0;0;0`,
      ]),
      bankBytes: bankSource({ first: '1', includeSecond: false }),
    }),
    (error) => error.code === 'MONTHLY_CLOSE_LOCAL_INTEGER_OVERFLOW',
  );
  await assert.rejects(
    precheck({
      conceptBytes: conceptSource({ first: minimum, includeSecond: false }),
      bankBytes: bankSource({ first: maximum, includeSecond: false }),
    }),
    (error) => error.code === 'MONTHLY_CLOSE_LOCAL_INTEGER_OVERFLOW',
  );
});

test('los contratos browser coinciden con el validador interno agregado', () => {
  assert.equal(
    MONTHLY_CLOSE_LOCAL_HEADERS.conceptStatistics,
    MONTHLY_CLOSE_SOURCE_CONTRACTS['grh-concept-statistics.v1'].header,
  );
  assert.equal(
    MONTHLY_CLOSE_LOCAL_HEADERS.bankSummary,
    MONTHLY_CLOSE_SOURCE_CONTRACTS['bank-accreditation-summary.v1'].header,
  );
  assert.doesNotMatch(
    Object.values(MONTHLY_CLOSE_LOCAL_HEADERS).join(';'),
    /(?:nombre|apellido|dni|cuil|cbu|cuenta_numero|legajo|email)/i,
  );
});

test('rechaza contexto, encabezados, duplicados, tipos e importes ambiguos', async () => {
  const duplicateConcept = bytes([
    MONTHLY_CLOSE_LOCAL_HEADERS.conceptStatistics,
    '2026-08;42;1;993;2;200;1000;0;0;0;0',
    '2026-08;42;1;993;3;300;2000;0;0;0;0',
  ]);
  const invalidBank = bytes([
    MONTHLY_CLOSE_LOCAL_HEADERS.bankSummary,
    '2026-08;42;1;191;cuenta_desconocida;2;1000',
  ]);
  const cases = [
    [{ period: '2026-13' }, 'MONTHLY_CLOSE_LOCAL_PERIOD_INVALID'],
    [{ jurisdiction: '43' }, 'MONTHLY_CLOSE_LOCAL_JURISDICTION_INVALID'],
    [{ conceptBytes: conceptSource().map((value) => value), period: '2026-07' }, 'MONTHLY_CLOSE_LOCAL_PERIOD_MISMATCH'],
    [{ conceptBytes: duplicateConcept }, 'MONTHLY_CLOSE_LOCAL_ROW_DUPLICATED'],
    [{ bankBytes: invalidBank }, 'MONTHLY_CLOSE_LOCAL_ACCOUNT_TYPE_INVALID'],
    [{ bankBytes: bankSource({ first: '1,00' }) }, 'MONTHLY_CLOSE_LOCAL_INTEGER_INVALID'],
    [{ conceptBytes: bytes(['encabezado;incorrecto', '2026-08;42']) }, 'MONTHLY_CLOSE_LOCAL_HEADER_INVALID'],
  ];
  for (const [overrides, code] of cases) {
    await assert.rejects(precheck(overrides), (error) => {
      assert.equal(error instanceof MonthlyCloseLocalPrecheckError, true);
      return error.code === code;
    }, code);
  }
});

test('calcula SHA-256 sobre bytes crudos y aplica límites duros', async () => {
  const conceptBytes = conceptSource();
  const result = await precheck({ conceptBytes });
  const expected = createHash('sha256').update(conceptBytes).digest('hex');
  assert.equal(result.sources.conceptStatistics.sha256, `sha256:${expected}`);
  assert.notEqual(
    result.sources.conceptStatistics.sha256,
    result.sources.bankSummary.sha256,
  );
  await assert.rejects(
    precheck({ conceptBytes: new Uint8Array(MONTHLY_CLOSE_LOCAL_MAX_FILE_BYTES + 1) }),
    (error) => error.code === 'MONTHLY_CLOSE_LOCAL_SOURCE_TOO_LARGE',
  );
  await assert.rejects(
    precheck({ bankBytes: Uint8Array.from([0xc3, 0x28]) }),
    (error) => error.code === 'MONTHLY_CLOSE_LOCAL_ENCODING_INVALID',
  );
});

test('el módulo local no usa red, storage, nombres de archivo ni HTML dinámico', () => {
  const source = fs.readFileSync(
    new URL('../assets/monthly-close-local-precheck.js', import.meta.url), 'utf8',
  );
  assert.match(source, /export async function prepareMonthlyCloseLocalPrecheck/);
  assert.match(source, /BigInt\(/);
  assert.match(source, /toleranceCents: '0'/);
  assert.match(source, /governmentSummaryCompared: false/);
  assert.match(source, /tribunalArtifactGenerated: false/);
  assert.match(source, /\.textContent\s*=/);
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(source, /console\.|innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(source, /file\.name|filename/i);
  assert.match(source, /operationSequence/);
  assert.equal(mountMonthlyCloseLocalPrecheck({ querySelector: () => null }), false);
});

test('Nómina publica el precontrol mensual visible y el build incluye su módulo privado', () => {
  const html = fs.readFileSync(new URL('../nomina-control.html', import.meta.url), 'utf8');
  const build = fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(html, /06 · CONTROL MENSUAL/);
  assert.match(html, /Pasar el control de jurisdicción del Excel a un corte auditable/);
  assert.match(html, /3\. Cruce técnico avanzado/);
  assert.match(html, /Excel local · diferencia exigida: \$ 0,00/);
  assert.match(html, /data-monthly-close-precheck/);
  assert.match(html, /data-monthly-close-form novalidate/);
  assert.match(html, /data-monthly-close-concept-file/);
  assert.match(html, /data-monthly-close-bank-file/);
  assert.match(html, /data-monthly-close-rows/);
  assert.match(html, /Tolerancia: 0 centavos/);
  assert.match(html, /periodo;jurisdiccion;reparticion_codigo;concepto_codigo;ocurrencias;cantidad_centesimas/);
  assert.match(html, /periodo;jurisdiccion;reparticion_codigo;banco_codigo;tipo_cuenta;operaciones;importe_neto_centavos/);
  assert.match(html, /no genera archivos bancarios ni el TXT de Tribunal/);
  assert.equal((html.match(/assets\/monthly-close-local-precheck\.js/g) || []).length, 1);
  assert.match(build, /'assets\/monthly-close-local-precheck\.js'/);
  assert.doesNotMatch(worker, /monthly-close-local-precheck/);
});
