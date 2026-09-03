import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_CONTROL_IMPORT_CONTRACT,
  PAYROLL_CONTROL_IMPORT_DEFINITION,
  formatPayrollAmountCents,
  validatePayrollControlBootstrap,
} from '../assets/payroll-control-import-workflow.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function batch(overrides = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sourceKind: 'grh_observed',
    period: '2026-07',
    jurisdiction: '42',
    definitionKey: PAYROLL_CONTROL_IMPORT_DEFINITION,
    contractVersion: PAYROLL_CONTROL_IMPORT_CONTRACT,
    byteLength: 120,
    status: 'submitted',
    version: 2,
    rows: [
      { concept: '701', amountCents: '8288237098' },
      { concept: '703', amountCents: '10654611935' },
    ],
    allowedCommands: ['validate', 'reject'],
    ...overrides,
  };
}

function envelope(overrides = {}) {
  return {
    ok: true,
    data: {
      principal: {
        roleKey: 'HUGO_APROBADOR_INTEGRAL',
        capabilities: ['payroll.control_import.read', 'payroll.control_import.validate'],
      },
      batches: [batch()],
      recentEvents: [],
      limits: {
        maxSourceBytes: 16384,
        contractVersion: PAYROLL_CONTROL_IMPORT_CONTRACT,
        definitionKey: PAYROLL_CONTROL_IMPORT_DEFINITION,
      },
      ...overrides,
    },
  };
}

test('valida el contrato de bootstrap y rechaza comandos o conceptos inesperados', () => {
  assert.equal(validatePayrollControlBootstrap(envelope()), true);
  assert.equal(validatePayrollControlBootstrap(envelope({
    batches: [batch({ allowedCommands: ['delete'] })],
  })), false);
  assert.equal(validatePayrollControlBootstrap(envelope({
    batches: [batch({ rows: [{ concept: '701', amountCents: '1' }, { concept: '999', amountCents: '2' }] })],
  })), false);
});

test('formatea centavos exactos sin convertir a Number', () => {
  assert.equal(formatPayrollAmountCents('10654611935'), '$ 106.546.119,35');
  assert.equal(formatPayrollAmountCents('-1'), '- $ 0,01');
  assert.equal(formatPayrollAmountCents('9223372036854775807'), '$ 92.233.720.368.547.758,07');
  assert.equal(formatPayrollAmountCents('1.5'), 'No disponible');
});

test('Nómina expone el circuito persistido, maker-checker y límites honestos', () => {
  const html = read('nomina-control.html');
  const source = read('assets/payroll-control-import-workflow.js');
  const build = read('scripts/build-friendly.mjs');

  assert.match(html, /data-payroll-control-import-workflow/);
  assert.match(html, /Marcelo prepara; una identidad distinta con rol aprobador/);
  assert.match(html, /No cierra nómina, no modifica GRH, no genera F\.931/);
  assert.match(html, /data-control-import-reject-reason/);
  assert.equal((html.match(/assets\/payroll-control-import-workflow\.js/g) || []).length, 1);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /command === 'validate' \? 'approve' : command/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
  assert.match(build, /'assets\/payroll-control-import-workflow\.js'/);
});
