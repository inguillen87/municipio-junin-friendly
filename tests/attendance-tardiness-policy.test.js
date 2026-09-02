import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  JUNIN_TARDINESS_CANDIDATE,
  accumulateMonthlyTardiness,
  evaluateMonthlyTardiness,
  evaluateTardinessBand,
  parseTardinessEntries,
} from '../assets/junin-tardiness-policy.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('S006-C5a respeta cuatro límites documentados y la tolerancia candidata inferida', () => {
  const cases = [
    [0, 'within_tolerance', 0],
    [5, 'within_tolerance', 0],
    [6, 'over_5_through_15', 25],
    [15, 'over_5_through_15', 25],
    [16, 'over_15_through_60', 50],
    [60, 'over_15_through_60', 50],
    [61, 'over_60_through_150', 75],
    [150, 'over_60_through_150', 75],
    [151, 'over_150', 100],
  ];

  for (const [minutes, bandKey, percent] of cases) {
    const band = evaluateTardinessBand(minutes);
    assert.equal(band.bandKey, bandKey, `banda incorrecta para ${minutes} minutos`);
    assert.equal(
      band.candidateJornadaDiscountPercent,
      percent,
      `porcentaje incorrecto para ${minutes} minutos`,
    );
  }
});

test('S006-C5a acumula sólo días válidos de un mismo mes sin mutar la entrada', () => {
  const entries = [
    { date: '2026-09-03', lateMinutes: 8 },
    { date: '2026-09-10', lateMinutes: 14 },
    { date: '2026-09-21', lateMinutes: 39 },
  ];
  const original = structuredClone(entries);
  const accumulation = accumulateMonthlyTardiness(entries, '2026-09');

  assert.deepEqual(entries, original);
  assert.equal(accumulation.month, '2026-09');
  assert.equal(accumulation.entryCount, 3);
  assert.equal(accumulation.totalLateMinutes, 61);
  assert.ok(Object.isFrozen(accumulation));
  assert.ok(Object.isFrozen(accumulation.entries));
  assert.ok(accumulation.entries.every(Object.isFrozen));

  const evaluation = evaluateMonthlyTardiness({ month: '2026-09', entries });
  assert.equal(evaluation.matchedBand.bandKey, 'over_60_through_150');
  assert.equal(evaluation.candidateJornadaDiscountPercent, 75);
});

test('S006-C5a interpreta líneas manuales y permite simular cero tardanzas', () => {
  assert.deepEqual(parseTardinessEntries(''), []);
  assert.deepEqual(parseTardinessEntries('\n 2026-09-03, 8\r\n2026-09-10,14 \n'), [
    { date: '2026-09-03', lateMinutes: 8 },
    { date: '2026-09-10', lateMinutes: 14 },
  ]);

  const zero = evaluateMonthlyTardiness({ month: '2026-09', entries: [] });
  assert.equal(zero.totalLateMinutes, 0);
  assert.equal(zero.candidateJornadaDiscountPercent, 0);
});

test('S006-C5a rechaza valores ambiguos, fechas inválidas y mezcla mensual', () => {
  for (const value of [-1, 5.5, Number.NaN, Number.POSITIVE_INFINITY, '6', undefined, null]) {
    assert.throws(() => evaluateTardinessBand(value));
  }
  assert.throws(() => evaluateTardinessBand(Number.MAX_SAFE_INTEGER), /entre 0 y 44640/);
  assert.throws(() => parseTardinessEntries(null), /como texto/);
  assert.throws(() => parseTardinessEntries('2026-09-03'), /Línea 1/);
  assert.throws(() => parseTardinessEntries('2026-09-03, -1'), /enteros no negativos/);
  assert.throws(() => parseTardinessEntries('2026-09-03, 5.5'), /enteros no negativos/);
  assert.throws(() => accumulateMonthlyTardiness([], '2026-13'), /mes informado no es válido/);
  assert.throws(() => accumulateMonthlyTardiness([], 'septiembre-2026'), /formato AAAA-MM/);
  assert.throws(
    () => accumulateMonthlyTardiness([{ date: '2026-02-30', lateMinutes: 2 }], '2026-02'),
    /fecha 2026-02-30 no es válida/,
  );
  assert.throws(
    () => accumulateMonthlyTardiness([{ date: '2026-08-31', lateMinutes: 2 }], '2026-09'),
    /no pertenece al mes/,
  );
  assert.throws(
    () => accumulateMonthlyTardiness([
      { date: '2026-09-03', lateMinutes: 2 },
      { date: '2026-09-03', lateMinutes: 3 },
    ], '2026-09'),
    /está repetida/,
  );
  assert.throws(
    () => accumulateMonthlyTardiness([{ date: '2026-09-03', lateMinutes: 1441 }], '2026-09'),
    /entre 0 y 1440/,
  );
  assert.throws(
    () => accumulateMonthlyTardiness([{ date: '2026-09-03', lateMinutes: 2, employee: 'x' }], '2026-09'),
    /sólo admite date y lateMinutes/,
  );
});

test('S006-C5a permanece candidato y nunca produce impacto de nómina', () => {
  const result = evaluateMonthlyTardiness({
    month: '2026-09',
    entries: [{ date: '2026-09-03', lateMinutes: 151 }],
  });

  assert.equal(result.policyStatus, 'draft_not_homologated');
  assert.equal(result.authoritative, false);
  assert.equal(result.operationalEffect, 'none');
  assert.equal(result.automaticSanction, false);
  assert.equal(result.grhWritten, false);
  assert.deepEqual(result.payrollImpact, { calculated: false, posted: false, amount: null });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.payrollImpact));
  assert.deepEqual(JUNIN_TARDINESS_CANDIDATE.effects, {
    simulationOnly: true,
    automaticSanction: false,
    payrollCalculation: false,
    payrollPosting: false,
    grhWrite: false,
  });
});

test('S006-C5a mantiene el evaluador sincronizado con el contrato y no reemplaza Título VI', () => {
  const contract = JSON.parse(read('attendance-policy-candidates.v1.json'));
  const source = contract.sourceEvidence.find(({ sourceKey }) => (
    sourceKey === 'accounting_tolerance_reference_image_2026_09_02'
  ));
  const candidate = contract.candidateTardinessPolicy;
  const contractBand = (band) => ({
    bandKey: band.bandKey,
    minExclusive: band.minExclusive,
    maxInclusive: band.maxInclusive,
    candidateJornadaDiscountPercent: band.candidateJornadaDiscountPercent,
    documentedInSource: band.documentedInSource,
    ...(band.evidenceClass ? { evidenceClass: band.evidenceClass } : {}),
  });

  assert.equal(contract.contractVersion, '0.2.0');
  assert.equal(contract.publishedAt, '2026-08-21');
  assert.equal(contract.revisedAt, '2026-09-02');
  assert.equal(JUNIN_TARDINESS_CANDIDATE.publishedAt, contract.publishedAt);
  assert.equal(JUNIN_TARDINESS_CANDIDATE.revisedAt, contract.revisedAt);
  assert.equal(source.sha256, 'CE2BE97A53D1DCA2B69DC2852A7E501C35A3E4B528A211BE62B02BF38811AD46');
  assert.equal(source.normativeWeight, 'candidate_accounting_reference_pending_rrhh_legal_confirmation_and_formal_approval');
  assert.equal(candidate.status, 'draft_not_homologated');
  assert.equal(candidate.authoritative, false);
  assert.equal(candidate.approved, false);
  assert.equal(candidate.active, false);
  assert.equal(candidate.cutoffDay, null);
  assert.equal(candidate.bands, undefined);
  assert.deepEqual(candidate.candidateTolerance, contractBand(JUNIN_TARDINESS_CANDIDATE.candidateTolerance));
  assert.deepEqual(
    candidate.documentedDiscountBands,
    JUNIN_TARDINESS_CANDIDATE.documentedDiscountBands.map(contractBand),
  );
  assert.equal(candidate.candidateTolerance.documentedInSource, false);
  assert.equal(candidate.documentedDiscountBands.length, 4);
  assert.ok(candidate.documentedDiscountBands.every(({ documentedInSource }) => documentedInSource));
  assert.deepEqual(
    JUNIN_TARDINESS_CANDIDATE.evaluationBands.map(({ bandKey }) => bandKey),
    [candidate.candidateTolerance, ...candidate.documentedDiscountBands].map(({ bandKey }) => bandKey),
  );
  assert.deepEqual(candidate.effects, JUNIN_TARDINESS_CANDIDATE.effects);
  assert.equal(
    contract.openDecisions.find(({ decisionKey }) => decisionKey === 'presentism_policy').status,
    'unresolved',
  );
  assert.equal(
    contract.openDecisions.find(({ decisionKey }) => decisionKey === 'monthly_cutoff').status,
    'unresolved',
  );
  assert.match(
    read('assets/mendoza-title-vi.js'),
    /id: 'tardiness'.*status: 'not_calculable'.*manualGate: 'fichada_horario_y_resolucion'/,
  );
});
