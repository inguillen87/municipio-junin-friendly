import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_FORMULA_PROPOSAL_VERSION,
  PayrollFormulaProposalError,
  createPayrollFormulaProposal,
  interpretClassScaleInstruction,
} from '../assets/payroll-formula-proposal.js';

function validInput(overrides = {}) {
  return {
    instruction: 'Aumentar 20% la escala salarial',
    jurisdiction: '42',
    agreement: 'Régimen municipal',
    validFrom: '2026-09',
    payrollType: 'M',
    rounding: 'nearest_cent',
    sampleAmount: '100.000,00',
    baseReference: 'A[10]',
    scaleVersion: 'escala-2026-08',
    ...overrides,
  };
}

function errorCode(code) {
  return (error) => {
    assert.ok(error instanceof PayrollFormulaProposalError);
    assert.equal(error.code, code);
    return true;
  };
}

test('20% modifica sólo la asignación de la clase y conserva exactitud en centavos', () => {
  const proposal = createPayrollFormulaProposal(validInput());

  assert.equal(proposal.version, PAYROLL_FORMULA_PROPOSAL_VERSION);
  assert.equal(proposal.status, 'draft_for_structural_review');
  assert.equal(proposal.publicationReady, false);
  assert.deepEqual(proposal.operation, {
    kind: 'increase_percentage',
    percentageBasisPoints: 2000,
    factorNumerator: 12000,
    factorDenominator: 10000,
  });
  assert.equal(proposal.target.key, 'class_assignment');
  assert.equal(proposal.target.baseReference, 'A[10]');
  assert.equal(proposal.target.referenceVerification, 'unverified');
  assert.equal(proposal.expression, 'A[10] * 1.2');
  assert.equal(proposal.analysis.ok, true);
  assert.deepEqual(proposal.simulation, {
    beforeCents: '10000000',
    deltaCents: '2000000',
    afterCents: '12000000',
    illustrativeOnly: true,
  });
  assert.equal(proposal.propagation.directTarget, 'class_assignment');
  assert.equal(proposal.propagation.independentConceptsChanged, false);
  assert.equal(proposal.propagation.dependentConceptsPolicy, 'recalculate_with_each_versioned_formula');
  assert.deepEqual(proposal.scope.payrollTypes, ['M']);
  assert.deepEqual(
    proposal.blockers.map((entry) => entry.code),
    ['CLASS_ASSIGNMENT_REFERENCE_UNVERIFIED', 'CLASS_SCALE_VERSION_UNVERIFIED', 'APPROVED_CASES_REQUIRED'],
  );
});

test('admite disminuir con decimales y no usa aritmética binaria de punto flotante', () => {
  const proposal = createPayrollFormulaProposal(validInput({
    instruction: 'Disminuir 12,50 por ciento la asignación de la clase',
    sampleAmount: '100,00',
    payrollType: 'S',
  }));

  assert.equal(proposal.operation.kind, 'decrease_percentage');
  assert.equal(proposal.operation.percentageBasisPoints, 1250);
  assert.equal(proposal.expression, 'A[10] * 0.875');
  assert.equal(proposal.simulation.afterCents, '8750');
  assert.deepEqual(proposal.scope.payrollTypes, ['S']);
});

test('hace visible la diferencia entre redondear y truncar la simulación', () => {
  const rounded = createPayrollFormulaProposal(validInput({
    instruction: 'Aumentar 10% la escala', sampleAmount: '0,05', rounding: 'nearest_cent',
  }));
  const truncated = createPayrollFormulaProposal(validInput({
    instruction: 'Aumentar 10% la escala', sampleAmount: '0,05', rounding: 'truncate_cent',
  }));

  assert.equal(rounded.simulation.afterCents, '6');
  assert.equal(truncated.simulation.afterCents, '5');
});

test('sin referencia o versión homóloga prepara una simulación pero bloquea la publicación', () => {
  const proposal = createPayrollFormulaProposal(validInput({ baseReference: '', scaleVersion: '' }));

  assert.equal(proposal.status, 'scope_pending');
  assert.equal(proposal.expression, null);
  assert.equal(proposal.analysis, null);
  assert.deepEqual(
    proposal.blockers.map((entry) => entry.code),
    ['CLASS_ASSIGNMENT_REFERENCE_UNHOMOLOGATED', 'CLASS_SCALE_VERSION_REQUIRED', 'APPROVED_CASES_REQUIRED'],
  );
});

test('bloquea aplicar la escala al bruto, neto, total o todos los conceptos', () => {
  for (const instruction of [
    'Aumentar 20% la escala salarial y el sueldo bruto',
    'Aumentar 20% la asignación de la clase sobre el neto total',
    'Aumentar 20% la escala salarial sobre el bruto',
    'Aumentar 20% la escala salarial sobre el haber líquido',
    'Aumentar 20% la escala salarial en la totalidad de los conceptos',
    'Aumentar 20% la escala salarial de todos los conceptos',
  ]) {
    assert.throws(
      () => interpretClassScaleInstruction(instruction),
      errorCode('FORMULA_PROPOSAL_TARGET_FORBIDDEN'),
      instruction,
    );
  }
});

test('bloquea intención, objetivo o porcentaje ambiguos y rangos inseguros', () => {
  assert.throws(
    () => interpretClassScaleInstruction('Cambiar 20% la escala salarial'),
    errorCode('FORMULA_PROPOSAL_OPERATION_AMBIGUOUS'),
  );
  assert.throws(
    () => interpretClassScaleInstruction('Aumentar 20% el adicional'),
    errorCode('FORMULA_PROPOSAL_TARGET_REQUIRED'),
  );
  assert.throws(
    () => interpretClassScaleInstruction('Aumentar 20% y 10% la escala salarial'),
    errorCode('FORMULA_PROPOSAL_PERCENT_AMBIGUOUS'),
  );
  assert.throws(
    () => interpretClassScaleInstruction('Disminuir 100% la escala salarial'),
    errorCode('FORMULA_PROPOSAL_PERCENT_OUT_OF_RANGE'),
  );
  assert.throws(
    () => interpretClassScaleInstruction('Aumentar la escala salarial al 120%'),
    errorCode('FORMULA_PROPOSAL_PERCENT_AMBIGUOUS'),
  );
});

test('exige ámbito, vigencia, tipo, redondeo y referencia con formato cerrado', () => {
  assert.throws(
    () => createPayrollFormulaProposal(validInput({ jurisdiction: '' })),
    errorCode('FORMULA_PROPOSAL_JURISDICTION_REQUIRED'),
  );
  assert.throws(
    () => createPayrollFormulaProposal(validInput({ validFrom: 'septiembre' })),
    errorCode('FORMULA_PROPOSAL_VALIDITY_REQUIRED'),
  );
  assert.throws(
    () => createPayrollFormulaProposal(validInput({ payrollType: 'X' })),
    errorCode('FORMULA_PROPOSAL_PAYROLL_TYPE_REQUIRED'),
  );
  assert.throws(
    () => createPayrollFormulaProposal(validInput({ rounding: 'automatic' })),
    errorCode('FORMULA_PROPOSAL_ROUNDING_REQUIRED'),
  );
  assert.throws(
    () => createPayrollFormulaProposal(validInput({ baseReference: 'TOTAL[10]' })),
    errorCode('FORMULA_PROPOSAL_REFERENCE_INVALID'),
  );
  assert.equal(
    createPayrollFormulaProposal(validInput({ baseReference: 'A[010]' })).expression,
    'A[010] * 1.2',
  );
  assert.throws(
    () => createPayrollFormulaProposal(validInput({ sampleAmount: '1000000000000000,00' })),
    errorCode('FORMULA_PROPOSAL_SAMPLE_INVALID'),
  );
  for (const malformed of ['1.2.3,45', '1,2,3.45']) {
    assert.throws(
      () => createPayrollFormulaProposal(validInput({ sampleAmount: malformed })),
      errorCode('FORMULA_PROPOSAL_SAMPLE_INVALID'),
    );
  }
});

test('rechaza contenido ejecutable y no incorpora red, storage ni evaluación dinámica', () => {
  assert.throws(
    () => createPayrollFormulaProposal(validInput({ instruction: '<script>alert(1)</script>' })),
    errorCode('FORMULA_PROPOSAL_INSTRUCTION_INVALID'),
  );
  assert.throws(
    () => createPayrollFormulaProposal(validInput({ agreement: '<img src=x>' })),
    errorCode('FORMULA_PROPOSAL_SCOPE_INVALID'),
  );

  const source = fs.readFileSync(new URL('../assets/payroll-formula-proposal.js', import.meta.url), 'utf8');
  assert.match(source, /analyzeFormula\(expression/);
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/);
  assert.doesNotMatch(source, /Number\(BigInt\(cents\)\)/);
});
