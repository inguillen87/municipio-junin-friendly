import assert from 'node:assert/strict';
import test from 'node:test';

import { payrollControl } from '../api/internal-data.js';

const REQUIRED_COLUMNS = {
  grh_effective_payroll_run_v1: ['payroll_date', 'closure_status', 'source_closed_flag'],
  grh_effective_payroll_monthly_fact_v1: ['payroll_run_id', 'net_payable', 'employer_contributions'],
  vw_liquidacion_mensual: [
    'month', 'closure_status', 'liquidated_contracts', 'gross_payable',
    'employee_withholdings', 'net_payable', 'employer_contributions',
    'employer_cost_proxy', 'arithmetic_difference', 'rounding_tolerance',
    'arithmetic_reconciled', 'executive_publishable'
  ],
  vw_nomina_totales: [
    'payroll_run_id', 'closure_status', 'arithmetic_reconciled', 'executive_publishable'
  ]
};

function fixtureSql({ loaded = true, openPublished = false, empty = false, nonClosedPublishedOutsidePage = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(statement) {
      const query = String(statement);
      calls.push(query);
      if (query.includes('FROM information_schema.columns')) {
        if (!loaded) return [];
        return Object.entries(REQUIRED_COLUMNS).flatMap(([relationName, columns]) =>
          columns.map((columnName) => ({ relationName, columnName }))
        );
      }
      if (query.includes('FROM vw_liquidacion_mensual')) {
        if (empty) return [];
        return [
          {
            month: '2026-08-01', closureStatus: 'open', contracts: 854,
            grossPayable: '718987272.17', employeeWithholdings: '169042361.91',
            netPayable: '549944912.78', employerContributions: '122291395.49',
            employerCostProxy: '841278667.66', arithmeticDifference: '-2.52',
            roundingTolerance: '8.54', arithmeticReconciled: true,
            executivePublishable: openPublished
          },
          {
            month: '2026-07-01', closureStatus: 'closed', contracts: 856,
            grossPayable: '1208241272.14', employeeWithholdings: '256860697.86',
            netPayable: '951380572.79', employerContributions: '189428490.15',
            employerCostProxy: '1397669762.29', arithmeticDifference: '1.49',
            roundingTolerance: '8.56', arithmeticReconciled: true,
            executivePublishable: true
          }
        ];
      }
      if (query.includes('/* payroll:window-runs */')) {
        if (empty) return [];
        return [{
          payrollRunId: '10000000-0000-4000-8000-000000000001',
          __totalRuns: 620, __closedRuns: 517, __openRuns: 2, __unknownRuns: 101,
          __closedRunsBlocked: 0, __openRunsPublished: openPublished || nonClosedPublishedOutsidePage ? 1 : 0,
          month: '2026-07-31', payrollType: 'M', closureStatus: 'closed',
          contracts: 855, arithmeticReconciled: true, executivePublishable: true
        }];
      }
      if (query.includes('FROM grh_effective_source_batch_v1')) {
        return [{
          fileName: 'grh_junin_extracted.sql', sha256: 'A'.repeat(64),
          cutoff: '2026-08-06T15:15:21.000Z', recordedAt: '2026-08-13T20:00:00.000Z'
        }];
      }
      throw new Error(`Consulta inesperada: ${query.slice(0, 120)}`);
    }
  };
}

test('payrollControl bloquea agosto abierto y publica sólo julio cerrado reconciliado', async () => {
  const sql = fixtureSql();
  const payload = await payrollControl(sql);

  assert.equal(payload.status, 'ready');
  assert.equal(payload.latestClosed.contracts, 856);
  assert.equal(payload.latestClosed.netPayable, 951380572.79);
  assert.equal(payload.latestClosed.employerCostProxy, 1397669762.29);
  assert.equal(payload.latestClosed.executivePublishable, true);
  assert.equal(payload.currentOpen.contracts, 854);
  assert.equal(payload.currentOpen.executivePublishable, false);
  assert.equal(payload.runs[0].payrollRunId, '10000000-0000-4000-8000-000000000001');
  assert.equal(payload.quality.openRunsPublished, 0);
  assert.match(payload.sourcePolicy.closeEvidence, /histocal\.CIER_31 = 1/);
  assert.match(payload.sourcePolicy.arithmeticControl, /993 \+ 994 \+ 995 - 996 = 999/);
  assert.match(payload.sourcePolicy.employerCostProxy, /no devengado contable/i);
  assert.equal(sql.calls.length, 4);
  assert.equal(payload.quality.totalRuns, 620);
  assert.equal(payload.quality.unknownRuns, 101);
  assert.equal(payload.runs.length, 1);
  assert.equal(Object.keys(payload.runs[0]).some((k) => k.startsWith('__')), false);
});

test('payrollControl no consulta datos si el modelo aún no fue cargado', async () => {
  const sql = fixtureSql({ loaded: false });
  const payload = await payrollControl(sql);

  assert.equal(payload.status, 'not_loaded');
  assert.equal(payload.latestClosed, null);
  assert.equal(payload.currentOpen, null);
  assert.equal(payload.quality.ready, false);
  assert.equal(sql.calls.length, 1);
});

test('payrollControl falla cerrado si una corrida abierta aparece publicable', async () => {
  const payload = await payrollControl(fixtureSql({ openPublished: true }));

  assert.equal(payload.status, 'needs_review');
  assert.equal(payload.quality.ready, false);
  assert.equal(payload.quality.openRunsPublished, 1);
});


test('payrollControl examina calidad de todo el origen aunque la página no muestre la anomalía', async () => {
  const payload = await payrollControl(fixtureSql({ nonClosedPublishedOutsidePage: true }));
  assert.equal(payload.currentOpen.executivePublishable, false);
  assert.equal(payload.runs.every((r) => r.closureStatus === 'closed'), true);
  assert.equal(payload.quality.openRunsPublished, 1);
  assert.equal(payload.quality.ready, false);
  assert.equal(payload.status, 'needs_review');
});

test('payrollControl conserva ceros y valores ausentes cuando no hay ninguna corrida', async () => {
  const payload = await payrollControl(fixtureSql({ empty: true }));
  assert.equal(payload.status, 'needs_review');
  assert.equal(payload.latestClosed, null);
  assert.equal(payload.currentOpen, null);
  assert.deepEqual(payload.runs, []);
  for (const k of ['totalRuns','closedRuns','openRuns','unknownRuns','closedRunsBlocked','openRunsPublished']) {
    assert.equal(payload.quality[k], 0, k);
  }
  assert.equal(payload.quality.ready, false);
});
