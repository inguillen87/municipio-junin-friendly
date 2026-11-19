import test from 'node:test';
import assert from 'node:assert/strict';
import { payrollTrendPoints } from '../assets/employee-payroll-chart.js';

test('net trend is chronological, labels non-monthly runs and skips periods without a valid net', () => {
  assert.deepEqual(payrollTrendPoints([
    { payrollDate: '2026-10-31', payrollType: 'M', netPayable: '812345.10' },
    { payrollDate: '2026-09-30', canonicalPayrollType: 'monthly', netPayable: 790000 },
    { payrollDate: '2026-06-30', payrollType: 'O', netPayable: '400000' },
    { payrollDate: '2026-06-30', payrollType: 'M', netPayable: 'x' },
    { payrollDate: null, netPayable: 1 },
  ]), [['jun 26 · SAC', 400000], ['sep 26', 790000], ['oct 26', 812345.1]]);
  assert.deepEqual(payrollTrendPoints(null), []);
});
