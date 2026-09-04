import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GRH_PAYROLL_TYPE_PRESENTATION,
  payrollTypePresentation,
} from '../assets/payroll-type-presentation.js';

test('presenta los seis códigos oficiales GRH con lenguaje cotidiano', () => {
  assert.deepEqual(GRH_PAYROLL_TYPE_PRESENTATION, {
    F: 'Liquidación final',
    M: 'Mensual / segunda quincena',
    O: 'Liquidación adicional / otros conceptos',
    P: 'Primera quincena',
    S: 'Aguinaldo (SAC)',
    V: 'Vacaciones',
  });
  for (const [sourceCode, label] of Object.entries(GRH_PAYROLL_TYPE_PRESENTATION)) {
    assert.deepEqual(payrollTypePresentation(null, sourceCode), {
      label,
      detail: `Tipo informado por GRH · código ${sourceCode}`,
      sourceCode,
      verifiedSourceLabel: true,
    });
  }
});

test('mantiene el código desconocido como dato secundario sin exponer jerga como título', () => {
  assert.deepEqual(payrollTypePresentation(null, 'X'), {
    label: 'Tipo histórico pendiente de identificar',
    detail: 'Código de origen GRH X',
    sourceCode: 'X',
    verifiedSourceLabel: false,
  });
});

test('usa el nombre canónico cuando no existe un código de origen', () => {
  assert.deepEqual(payrollTypePresentation('sac', null), {
    label: 'Aguinaldo (SAC)',
    detail: 'Tipo normalizado por MuniControl',
    sourceCode: null,
    verifiedSourceLabel: false,
  });
});
