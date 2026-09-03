import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  MONTHLY_CLOSE_CONTRACT_VERSION,
  MONTHLY_CLOSE_HMAC_KEY_VERSION,
  MONTHLY_CLOSE_MAX_BYTES,
  MONTHLY_CLOSE_SOURCE_CONTRACTS,
  MonthlyCloseContractError,
  buildMonthlyClosePrecheck,
  prepareMonthlyCloseSource,
} from '../lib/internal-monthly-close-contracts.js';

const encoder = new TextEncoder();
const fingerprintKey = Buffer.from('monthly-close-unit-test-hmac-secret-32-bytes');
const context = Object.freeze({
  tenantId: '11111111-1111-4111-8111-111111111111',
  sourceBindingId: '22222222-2222-4222-8222-222222222222',
  releaseSha: 'a'.repeat(40),
  fingerprintKey,
});

const governmentMetrics = Object.freeze([
  ['cantidad_agentes', 'personas'],
  ['haberes_rem_no_docentes', 'centavos'],
  ['haberes_rem_docentes', 'centavos'],
  ['haberes_no_rem', 'centavos'],
  ['aportes_jubilatorios_no_docentes', 'centavos'],
  ['aportes_jubilatorios_docentes', 'centavos'],
  ['aportes_jubilatorios_docentes_2', 'centavos'],
  ['aportes_osep', 'centavos'],
  ['aportes_osep_no_rem', 'centavos'],
  ['seguro_mutual', 'centavos'],
  ['contribuciones_jubilatorias', 'centavos'],
  ['contribuciones_osep', 'centavos'],
  ['contribuciones_osep_no_rem', 'centavos'],
  ['art', 'centavos'],
]);

function bytes(lines, ending = '\n') {
  return encoder.encode(lines.join(ending));
}

function conceptSource() {
  return bytes([
    MONTHLY_CLOSE_SOURCE_CONTRACTS['grh-concept-statistics.v1'].header,
    '2026-08;42;1;701;2;200;1000;0;0;0;250',
    '2026-08;42;2;703;3;300;2000;100;0;50;500',
  ]);
}

function bankSource({ firstAmount = '1000', secondAmount = '2050', includeSecond = true } = {}) {
  return bytes([
    MONTHLY_CLOSE_SOURCE_CONTRACTS['bank-accreditation-summary.v1'].header,
    `2026-08;42;1;191;cuenta_corriente;2;${firstAmount}`,
    ...(includeSecond ? [`2026-08;42;2;191;caja_ahorro;3;${secondAmount}`] : []),
  ]);
}

function governmentSource({ missingMetric = '' } = {}) {
  return bytes([
    MONTHLY_CLOSE_SOURCE_CONTRACTS['government-payroll-summary.v1'].header,
    ...governmentMetrics.map(([metric, unit], index) => (
      metric === missingMetric
        ? `2026-08;42;${metric};${unit};no_informado;`
        : `2026-08;42;${metric};${unit};informado;${index + 1}`
    )),
  ]);
}

function prepare(definitionKey, sourceKind, sourceBytes, overrides = {}) {
  return prepareMonthlyCloseSource({
    definitionKey,
    sourceKind,
    period: '2026-08',
    jurisdiction: '42',
    bytes: sourceBytes,
    context,
    ...overrides,
  });
}

test('publica tres contratos agregados, cerrados y sin campos personales', () => {
  assert.deepEqual(Object.keys(MONTHLY_CLOSE_SOURCE_CONTRACTS), [
    'grh-concept-statistics.v1',
    'bank-accreditation-summary.v1',
    'government-payroll-summary.v1',
  ]);
  assert.equal(Object.isFrozen(MONTHLY_CLOSE_SOURCE_CONTRACTS), true);
  for (const definition of Object.values(MONTHLY_CLOSE_SOURCE_CONTRACTS)) {
    assert.equal(Object.isFrozen(definition), true);
    assert.equal(Object.isFrozen(definition.fields), true);
    assert.doesNotMatch(
      definition.header,
      /(?:nombre|apellido|dni|cuil|cbu|cuenta_numero|legajo|domicilio|email)/i,
    );
    assert.match(definition.controls.join(' '), /aggregate-only/);
  }
});

test('prepara estadística por concepto con centavos int64 y totales exactos', () => {
  const result = prepare(
    'grh-concept-statistics.v1', 'grh_observed', conceptSource(),
  );
  assert.equal(result.contractVersion, MONTHLY_CLOSE_CONTRACT_VERSION);
  assert.equal(result.hmacKeyVersion, MONTHLY_CLOSE_HMAC_KEY_VERSION);
  assert.equal(result.recordCount, 2);
  assert.deepEqual(result.rows[0], {
    repartitionCode: '1',
    conceptCode: '701',
    occurrences: '2',
    quantityHundredths: '200',
    haberesRemunerativosCents: '1000',
    haberesNoRemunerativosCents: '0',
    asignacionesFamiliaresCents: '0',
    retencionesCents: '0',
    contribucionesCents: '250',
  });
  assert.deepEqual(result.totals, {
    haberesRemunerativosCents: '3000',
    haberesNoRemunerativosCents: '100',
    asignacionesFamiliaresCents: '0',
    retencionesCents: '50',
    contribucionesCents: '750',
  });
  assert.equal(result.readiness.readyForReview, true);
  assert.equal(result.includesPersonalRecords, false);
  assert.equal(result.rawContentStored, false);
  assert.equal(result.payrollCalculated, false);
  assert.equal(result.payrollPosted, false);
  assert.equal(result.closeApproved, false);
  assert.equal(result.fiscalArtifactGenerated, false);
  assert.doesNotMatch(JSON.stringify(result), /tenantId|sourceBindingId|fingerprintKey/);
});

test('prepara acreditación agregada sin cuentas y exige importes netos positivos', () => {
  const result = prepare(
    'bank-accreditation-summary.v1', 'bank_control', bankSource(),
  );
  assert.deepEqual(result.totals, { operations: '5', netAmountCents: '3050' });
  assert.deepEqual(result.rows.map(({ accountType }) => accountType), [
    'cuenta_corriente', 'caja_ahorro',
  ]);
  assert.doesNotMatch(JSON.stringify(result), /cbu|dni|cuil|accountNumber/i);

  const invalid = bytes([
    MONTHLY_CLOSE_SOURCE_CONTRACTS['bank-accreditation-summary.v1'].header,
    '2026-08;42;1;191;cuenta_corriente;2;0',
  ]);
  assert.throws(
    () => prepare('bank-accreditation-summary.v1', 'bank_control', invalid),
    (error) => error.code === 'MONTHLY_CLOSE_INTEGER_OUT_OF_RANGE',
  );
});

test('Casa de Gobierno hace explícito un faltante y bloquea el precontrol', () => {
  const concepts = prepare(
    'grh-concept-statistics.v1', 'grh_observed', conceptSource(),
  );
  const bank = prepare(
    'bank-accreditation-summary.v1', 'bank_control', bankSource(),
  );
  const government = prepare(
    'government-payroll-summary.v1',
    'government_control',
    governmentSource({ missingMetric: 'art' }),
  );
  assert.equal(government.readiness.readyForReview, false);
  assert.deepEqual(government.readiness.blockingIssues, [{
    code: 'MONTHLY_CLOSE_METRIC_NOT_INFORMED',
    metric: 'art',
  }]);
  assert.equal(government.rows.find(({ metric }) => metric === 'art').valueInteger, null);

  const precheck = buildMonthlyClosePrecheck([concepts, bank, government]);
  assert.equal(precheck.status, 'blocked');
  assert.equal(precheck.readyForReview, false);
  assert.deepEqual(precheck.blockingIssues, [{
    definitionKey: 'government-payroll-summary.v1',
    code: 'MONTHLY_CLOSE_METRIC_NOT_INFORMED',
    metric: 'art',
  }]);
  assert.equal(precheck.closeApproved, false);
});

test('las tres fuentes completas sólo dejan el cierre listo para revisión', () => {
  const sources = [
    prepare('grh-concept-statistics.v1', 'grh_observed', conceptSource()),
    prepare('bank-accreditation-summary.v1', 'bank_control', bankSource()),
    prepare('government-payroll-summary.v1', 'government_control', governmentSource()),
  ];
  const precheck = buildMonthlyClosePrecheck(sources);
  assert.equal(precheck.status, 'ready_for_review');
  assert.equal(precheck.readyForReview, true);
  assert.equal(precheck.sourceCount, 3);
  assert.equal(precheck.reconciliation.status, 'matched');
  assert.deepEqual(precheck.reconciliation.totals, {
    reportedEarningsLessRetentionsCents: '3050',
    reportedBankNetCents: '3050',
    differenceCents: '0',
  });
  assert.deepEqual(
    precheck.reconciliation.comparisons.map((row) => ({
      repartitionCode: row.repartitionCode,
      differenceCents: row.differenceCents,
      matches: row.matches,
    })),
    [
      { repartitionCode: '1', differenceCents: '0', matches: true },
      { repartitionCode: '2', differenceCents: '0', matches: true },
    ],
  );
  assert.equal(precheck.reconciliation.toleranceCents, '0');
  assert.equal(precheck.reconciliation.rulesInferred, false);
  assert.equal(precheck.reconciliation.governmentSummaryCompared, false);
  assert.equal(precheck.reconciliation.payrollNetCertified, false);
  assert.equal(precheck.provenanceVerified, false);
  assert.equal(precheck.persistencePerformed, false);
  assert.equal(precheck.payrollCalculated, false);
  assert.equal(precheck.payrollPosted, false);
  assert.equal(precheck.closeApproved, false);
  assert.equal(precheck.bankArtifactGenerated, false);
  assert.equal(precheck.tribunalArtifactGenerated, false);
});

test('bloquea diferencias y reparticiones faltantes sin aplicar tolerancias', () => {
  const concepts = prepare(
    'grh-concept-statistics.v1', 'grh_observed', conceptSource(),
  );
  const government = prepare(
    'government-payroll-summary.v1', 'government_control', governmentSource(),
  );
  const mismatchedBank = prepare(
    'bank-accreditation-summary.v1',
    'bank_control',
    bankSource({ firstAmount: '999' }),
  );
  const mismatch = buildMonthlyClosePrecheck([concepts, mismatchedBank, government]);
  assert.equal(mismatch.status, 'blocked');
  assert.equal(mismatch.readyForReview, false);
  assert.equal(mismatch.reconciliation.status, 'blocked');
  assert.deepEqual(mismatch.reconciliation.comparisons[0], {
    repartitionCode: '1',
    reportedEarningsLessRetentionsCents: '1000',
    reportedBankNetCents: '999',
    differenceCents: '1',
    matches: false,
    issueCodes: ['MONTHLY_CLOSE_REPARTITION_NET_MISMATCH'],
  });
  assert.deepEqual(mismatch.blockingIssues, [{
    definitionKey: 'monthly-close-net-reconciliation.v1',
    code: 'MONTHLY_CLOSE_REPARTITION_NET_MISMATCH',
    repartitionCode: '1',
  }]);

  const incompleteBank = prepare(
    'bank-accreditation-summary.v1',
    'bank_control',
    bankSource({ includeSecond: false }),
  );
  const incomplete = buildMonthlyClosePrecheck([concepts, incompleteBank, government]);
  assert.equal(incomplete.status, 'blocked');
  assert.deepEqual(incomplete.reconciliation.comparisons[1], {
    repartitionCode: '2',
    reportedEarningsLessRetentionsCents: '2050',
    reportedBankNetCents: null,
    differenceCents: null,
    matches: false,
    issueCodes: ['MONTHLY_CLOSE_REPARTITION_MISSING_IN_BANK_SUMMARY'],
  });
});

test('huella HMAC separa tenant, binding y contrato pero no cambia por release', () => {
  const baseline = prepare(
    'grh-concept-statistics.v1', 'grh_observed', conceptSource(),
  );
  const changedTenant = prepare(
    'grh-concept-statistics.v1', 'grh_observed', conceptSource(),
    { context: { ...context, tenantId: '33333333-3333-4333-8333-333333333333' } },
  );
  const changedBinding = prepare(
    'grh-concept-statistics.v1', 'grh_observed', conceptSource(),
    { context: { ...context, sourceBindingId: '44444444-4444-4444-8444-444444444444' } },
  );
  const changedRelease = prepare(
    'grh-concept-statistics.v1', 'grh_observed', conceptSource(),
    { context: { ...context, releaseSha: 'b'.repeat(40) } },
  );
  assert.equal(new Set([
    baseline.contentHmacSha256,
    changedTenant.contentHmacSha256,
    changedBinding.contentHmacSha256,
  ]).size, 3);
  assert.equal(changedRelease.contentHmacSha256, baseline.contentHmacSha256);
  assert.notEqual(changedRelease.manifestSha256, baseline.manifestSha256);

  const expected = createHmac('sha256', fingerprintKey)
    .update(MONTHLY_CLOSE_CONTRACT_VERSION, 'utf8')
    .update('\0', 'utf8').update(MONTHLY_CLOSE_HMAC_KEY_VERSION, 'utf8')
    .update('\0', 'utf8').update(context.tenantId, 'utf8')
    .update('\0', 'utf8').update(context.sourceBindingId, 'utf8')
    .update('\0', 'utf8').update('grh-concept-statistics.v1', 'utf8')
    .update('\0', 'utf8').update(conceptSource())
    .digest('hex');
  assert.equal(baseline.contentHmacSha256, expected);
});

test('el precontrol rechaza manifiestos forjados y fuentes auténticas de otro ámbito', () => {
  const concepts = prepare(
    'grh-concept-statistics.v1', 'grh_observed', conceptSource(),
  );
  const bank = prepare(
    'bank-accreditation-summary.v1', 'bank_control', bankSource(),
  );
  const government = prepare(
    'government-payroll-summary.v1', 'government_control', governmentSource(),
  );
  const forgedConcepts = Object.freeze({ ...concepts });
  assert.throws(
    () => buildMonthlyClosePrecheck([forgedConcepts, bank, government]),
    (error) => error.code === 'MONTHLY_CLOSE_PRECHECK_SOURCE_INVALID',
  );

  const otherContext = {
    ...context,
    tenantId: '33333333-3333-4333-8333-333333333333',
    sourceBindingId: '44444444-4444-4444-8444-444444444444',
  };
  const otherBank = prepare(
    'bank-accreditation-summary.v1',
    'bank_control',
    bankSource(),
    { context: otherContext },
  );
  assert.throws(
    () => buildMonthlyClosePrecheck([concepts, otherBank, government]),
    (error) => error.code === 'MONTHLY_CLOSE_PRECHECK_CONTEXT_MISMATCH',
  );
});

test('bloquea overflow int64 en agregados y diferencias', () => {
  const maximum = '9223372036854775807';
  const minimum = '-9223372036854775808';
  const overflowingConcept = bytes([
    MONTHLY_CLOSE_SOURCE_CONTRACTS['grh-concept-statistics.v1'].header,
    `2026-08;42;1;701;1;1;${maximum};0;0;0;0`,
    `2026-08;42;1;703;1;1;${maximum};0;0;0;0`,
  ]);
  assert.throws(
    () => prepare('grh-concept-statistics.v1', 'grh_observed', overflowingConcept),
    (error) => error.code === 'MONTHLY_CLOSE_INTEGER_OVERFLOW',
  );

  const negativeConcept = bytes([
    MONTHLY_CLOSE_SOURCE_CONTRACTS['grh-concept-statistics.v1'].header,
    `2026-08;42;1;701;1;1;${minimum};0;0;0;0`,
  ]);
  const maximumBank = bytes([
    MONTHLY_CLOSE_SOURCE_CONTRACTS['bank-accreditation-summary.v1'].header,
    `2026-08;42;1;191;cuenta_corriente;1;${maximum}`,
  ]);
  const concepts = prepare(
    'grh-concept-statistics.v1', 'grh_observed', negativeConcept,
  );
  const bank = prepare(
    'bank-accreditation-summary.v1', 'bank_control', maximumBank,
  );
  const government = prepare(
    'government-payroll-summary.v1', 'government_control', governmentSource(),
  );
  assert.throws(
    () => buildMonthlyClosePrecheck([concepts, bank, government]),
    (error) => error.code === 'MONTHLY_CLOSE_INTEGER_OVERFLOW',
  );
});

test('falla cerrado ante contexto, encabezado, duplicados y ampliaciones', () => {
  const definition = MONTHLY_CLOSE_SOURCE_CONTRACTS['grh-concept-statistics.v1'];
  const duplicate = bytes([
    definition.header,
    '2026-08;42;1;701;2;200;1000;0;0;0;250',
    '2026-08;42;1;701;3;300;2000;0;0;0;500',
  ]);
  const wrongPeriod = bytes([
    definition.header,
    '2026-07;42;1;701;2;200;1000;0;0;0;250',
  ]);
  const cases = [
    [() => prepare('unknown.v1', 'grh_observed', conceptSource()), 'MONTHLY_CLOSE_DEFINITION_INVALID'],
    [() => prepare('grh-concept-statistics.v1', 'bank_control', conceptSource()), 'MONTHLY_CLOSE_SOURCE_KIND_INVALID'],
    [() => prepare('grh-concept-statistics.v1', 'grh_observed', duplicate), 'MONTHLY_CLOSE_ROW_DUPLICATED'],
    [() => prepare('grh-concept-statistics.v1', 'grh_observed', wrongPeriod), 'MONTHLY_CLOSE_PERIOD_MISMATCH'],
    [() => prepare('grh-concept-statistics.v1', 'grh_observed', conceptSource(), {
      context: { ...context, releaseSha: 'preview' },
    }), 'MONTHLY_CLOSE_CONTEXT_INVALID'],
    [() => prepareMonthlyCloseSource({
      definitionKey: 'grh-concept-statistics.v1',
      sourceKind: 'grh_observed',
      period: '2026-08',
      jurisdiction: '42',
      bytes: conceptSource(),
      context,
      fileName: 'personal.csv',
    }), 'MONTHLY_CLOSE_INPUT_INVALID'],
  ];
  for (const [operation, code] of cases) {
    assert.throws(operation, (error) => {
      assert.equal(error instanceof MonthlyCloseContractError, true);
      return error.code === code;
    }, code);
  }
});

test('aplica UTF-8 fatal, límite duro, unidades y estados exactos', () => {
  assert.throws(
    () => prepare(
      'grh-concept-statistics.v1',
      'grh_observed',
      new Uint8Array(MONTHLY_CLOSE_MAX_BYTES + 1),
    ),
    (error) => error.code === 'MONTHLY_CLOSE_SOURCE_TOO_LARGE',
  );
  assert.throws(
    () => prepare(
      'grh-concept-statistics.v1', 'grh_observed', Uint8Array.from([0xc3, 0x28]),
    ),
    (error) => error.code === 'MONTHLY_CLOSE_ENCODING_INVALID',
  );
  const invalidUnit = governmentSource().map((value) => value);
  const invalidUnitText = new TextDecoder().decode(invalidUnit)
    .replace('cantidad_agentes;personas;', 'cantidad_agentes;centavos;');
  assert.throws(
    () => prepare(
      'government-payroll-summary.v1',
      'government_control',
      encoder.encode(invalidUnitText),
    ),
    (error) => error.code === 'MONTHLY_CLOSE_UNIT_INVALID',
  );
  const badMissing = new TextDecoder().decode(governmentSource({ missingMetric: 'art' }))
    .replace('art;centavos;no_informado;', 'art;centavos;no_informado;1');
  assert.throws(
    () => prepare(
      'government-payroll-summary.v1',
      'government_control',
      encoder.encode(badMissing),
    ),
    (error) => error.code === 'MONTHLY_CLOSE_UNINFORMED_VALUE_PRESENT',
  );
});

test('el módulo no persiste bytes ni afirma cierre, cálculo o presentación fiscal', () => {
  const sourceCode = fs.readFileSync(
    new URL('../lib/internal-monthly-close-contracts.js', import.meta.url), 'utf8',
  );
  assert.doesNotMatch(sourceCode, /console\.|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(sourceCode, /file\.name|filename|original_name/i);
  assert.doesNotMatch(sourceCode, /INSERT\s+INTO|UPDATE\s+payroll|fetch\s*\(/i);
  assert.match(sourceCode, /provenanceState: 'operator_declared'/);
  assert.match(sourceCode, /provenanceVerified: false/);
  assert.match(sourceCode, /payrollCalculated: false/);
  assert.match(sourceCode, /payrollPosted: false/);
  assert.match(sourceCode, /closeApproved: false/);
  assert.match(sourceCode, /fiscalArtifactGenerated: false/);
  assert.match(sourceCode, /governmentSummaryCompared: false/);
  assert.match(sourceCode, /payrollNetCertified: false/);
  assert.match(sourceCode, /tribunalArtifactGenerated: false/);
});
