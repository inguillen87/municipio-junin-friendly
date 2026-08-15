import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { managementAnalytics } from '../api/internal-data.js';

function markerOf(statement) {
  return String(statement).match(/\/\* management:([^*]+) \*\//)?.[1] || 'unknown';
}

const calendar = {
  2019: [4, 4], 2020: [54, 41], 2021: [72, 70], 2022: [99, 82],
  2023: [75, 75], 2024: [88, 92], 2025: [108, 85], 2026: [80, 51],
};

function metricFixture(id, from, to) {
  const fixtures = {
    previous_full: [299, 276, 268, 260, 5751, 736, 82373],
    previous_comparable: [217, 200, 173, 169, 3384, 660, 52028],
    current: [281, 275, 232, 228, 5936, 752, 65847],
    'management-year-previous-1': [58, 55, 43, 42, 932, 522, 14469],
    'management-year-current-1': [93, 92, 94, 93, 2157, 613, 23642],
    'management-year-previous-2': [70, 70, 69, 69, 1234, 531, 17499],
    'management-year-current-2': [108, 108, 84, 84, 2030, 616, 22897],
    'management-year-previous-3': [89, 83, 61, 60, 1218, 557, 20060],
    'management-year-current-3': [80, 79, 54, 52, 1749, 613, 19308],
    'management-year-previous-4': [70, 66, 74, 72, 1945, 588, 25456],
  };
  const year = id.startsWith('calendar-') ? Number(id.slice(9)) : null;
  const values = year
    ? [calendar[year][0], calendar[year][0], calendar[year][1], calendar[year][1], 100 + year, 10, 1000]
    : fixtures[id];
  return {
    id, from, to,
    hires: values?.[0] || 0,
    hirePersons: values?.[1] || 0,
    exits: values?.[2] || 0,
    exitPersons: values?.[3] || 0,
    absenceEvents: values?.[4] || 0,
    affectedContracts: values?.[5] || 0,
    sourceDeclaredDays: values?.[6] || 0,
  };
}

function fixtureSql({ source = true } = {}) {
  const calls = [];
  return {
    calls,
    async query(statement, values = []) {
      const sql = String(statement);
      const marker = markerOf(sql);
      calls.push({ marker, sql, values });
      if (marker === 'source') {
        return source ? [{
          batchId: '00000000-0000-0000-0000-000000000001',
          sourceCutoff: '2026-08-06T18:15:21.000Z',
          loadedAt: '2026-08-13T21:43:41.409Z',
          status: 'published',
        }] : [];
      }
      if (marker === 'metrics') {
        const rows = [];
        for (let index = 0; index < values.length; index += 3) {
          rows.push(metricFixture(values[index], values[index + 1], values[index + 2]));
        }
        return rows;
      }
      if (marker === 'payroll-comparison') {
        return [
          {
            id: 'previous', contractMonths: 24117, closedMonths: 31,
            totalEvents: 3278, alignedEvents: 3244, excludedEvents: 34,
            affectedAlignedContracts: 650, averageLiquidated: '778.0',
            eventsPer100ContractMonths: '13.45',
          },
          {
            id: 'current', contractMonths: 24892, closedMonths: 31,
            totalEvents: 5759, alignedEvents: 5728, excludedEvents: 31,
            affectedAlignedContracts: 738, averageLiquidated: '803.0',
            eventsPer100ContractMonths: '23.01',
          },
        ];
      }
      if (marker === 'sectors') {
        return [
          {
            window: 'previous', sectorKey: 'sector:101:17', label: 'DEL SOL', companyId: 101,
            sectorCode: '17', quality: 'matched', contractMonths: 100, events: 10, affectedContracts: 8,
          },
          {
            window: 'current', sectorKey: 'sector:101:17', label: 'DEL SOL', companyId: 101,
            sectorCode: '17', quality: 'matched', contractMonths: 110, events: 12, affectedContracts: 9,
          },
          {
            window: 'previous', sectorKey: 'sector:101:1', label: 'ADMINISTRATIVO', companyId: 101,
            sectorCode: '1', quality: 'matched', contractMonths: 24017, events: 3268, affectedContracts: 642,
          },
          {
            window: 'current', sectorKey: 'sector:101:1', label: 'ADMINISTRATIVO', companyId: 101,
            sectorCode: '1', quality: 'matched', contractMonths: 24782, events: 5747, affectedContracts: 729,
          },
        ];
      }
      if (marker === 'quality') {
        return [{
          contracts: 2450, personsWithContract: 2325, missingValidStartDate: 21,
          absenceRows: 31572, absenceBeforeCoverage: 6, absenceAfterCutoff: 7,
          invertedAbsenceRanges: 26, unlinkedAbsences: 6,
          movementRows: 489459, movementsWithoutType: 457205,
          lastClosedPayrollPeriod: '2026-07-31', latestOpenPayrollPeriod: '2026-08-31',
        }];
      }
      throw new Error(`Consulta no simulada: ${marker}`);
    },
  };
}

test('managementAnalytics compara 972 días exactos y corrige el recorte de 2019', async () => {
  const sql = fixtureSql();
  const result = await managementAnalytics(sql);

  assert.equal(result.status, 200);
  const { periods, calendarYears, comparison } = result.payload.data;
  assert.deepEqual(periods.previousFull.range, { from: '2019-12-10', to: '2023-12-08' });
  assert.deepEqual(periods.previousComparable.range, { from: '2019-12-10', to: '2022-08-07' });
  assert.deepEqual(periods.current.range, { from: '2023-12-09', to: '2026-08-06' });
  assert.equal(periods.previousComparable.elapsedDays, 972);
  assert.equal(periods.current.elapsedDays, 972);
  assert.equal(periods.current.partial, true);
  assert.equal(comparison.basis, 'same_elapsed_days');
  assert.equal(calendarYears[0].year, 2019);
  assert.equal(calendarYears[0].hires, 4);
  assert.equal(calendarYears[0].exits, 4);
  assert.equal(calendarYears[0].partial, true);
  assert.equal(calendarYears.find((row) => row.year === 2023).transition, true);
  assert.equal(calendarYears.reduce((sum, row) => sum + row.hires, 0), 580);
  assert.equal(calendarYears.reduce((sum, row) => sum + row.exits, 0), 500);
  assert.equal(result.payload.quality.reconciliations.periodHiresToCalendar, true);
  assert.equal(result.payload.quality.reconciliations.periodExitsToCalendar, true);
});

test('managementAnalytics normaliza sólo eventos alineados a contrato-mes cerrado', async () => {
  const sql = fixtureSql();
  const result = await managementAnalytics(sql);
  const comparison = result.payload.data.payrollComparison;

  assert.equal(comparison.previous.expectedMonths, 31);
  assert.equal(comparison.current.expectedMonths, 31);
  assert.equal(comparison.previous.contractMonths, 24117);
  assert.equal(comparison.current.contractMonths, 24892);
  assert.equal(comparison.previous.alignedEvents, 3244);
  assert.equal(comparison.previous.excludedEvents, 34);
  assert.equal(comparison.current.alignedEvents, 5728);
  assert.equal(comparison.current.excludedEvents, 31);
  assert.equal(comparison.previous.eventsPer100ContractMonths, 13.45);
  assert.equal(comparison.current.eventsPer100ContractMonths, 23.01);
  assert.match(result.payload.meta.absenceMetricSemantics, /no es tasa de ausentismo/i);

  const call = sql.calls.find((item) => item.marker === 'payroll-comparison');
  assert.deepEqual(call.values, ['2020-01-01', '2022-07-31', '2024-01-01', '2026-07-31']);
  assert.match(call.sql, /run\.closure_status = 'closed'/);
  assert.match(call.sql, /fact\.net_payable IS NOT NULL/);
});

test('la homologación reversible de jardines conserva totales y claves compuestas', async () => {
  const sql = fixtureSql();
  const result = await managementAnalytics(sql);
  const { literal, consolidated, mapping } = result.payload.data.sectors;

  assert.equal(literal.reduce((sum, row) => sum + row.previousContractMonths, 0), 24117);
  assert.equal(consolidated.reduce((sum, row) => sum + row.previousContractMonths, 0), 24117);
  assert.equal(literal.reduce((sum, row) => sum + row.currentContractMonths, 0), 24892);
  assert.equal(consolidated.reduce((sum, row) => sum + row.currentContractMonths, 0), 24892);
  assert.equal(consolidated.some((row) => row.label === 'Sectores de jardines'), true);
  assert.equal(mapping.id, 'garden_sector_family_v1');
  assert.equal(mapping.reversible, true);
  assert.match(mapping.warning, /no representa a todo el personal/i);

  const call = sql.calls.find((item) => item.marker === 'sectors');
  assert.match(call.sql, /companyCode/);
  assert.match(call.sql, /sectorCode/);
  assert.doesNotMatch(call.sql, /catalog\.source_payload\s*->>\s*'name'\s*=\s*raw/i);
  assert.equal(result.payload.quality.reconciliations.previousSectorContractMonths, true);
  assert.equal(result.payload.quality.reconciliations.currentSectorContractMonths, true);
});

test('managementAnalytics publica sólo agregados y declara dominios ausentes', async () => {
  const result = await managementAnalytics(fixtureSql());
  assert.equal(result.payload.data.budget.status, 'source_not_loaded');
  assert.equal(result.payload.data.budget.available, false);
  assert.equal(result.payload.meta.containsPersonalData, false);
  assert.equal(result.payload.meta.authority, 'GRH');
  assert.match(result.payload.meta.grain, /employment_contract/);

  const serialized = JSON.stringify(result.payload);
  for (const forbidden of ['"name"', '"nombre"', '"dni"', '"cuil"', '"legajo"', '"contractId"']) {
    assert.equal(serialized.includes(forbidden), false, `No debe publicar ${forbidden}`);
  }
});

test('managementAnalytics falla cerrado sin snapshot GRH publicado', async () => {
  const sql = fixtureSql({ source: false });
  const result = await managementAnalytics(sql);
  assert.equal(result.status, 503);
  assert.equal(result.payload.code, 'MANAGEMENT_SOURCE_NOT_LOADED');
  assert.deepEqual(sql.calls.map((call) => call.marker), ['source']);
});

test('el handler publica managementanalytics', async () => {
  const source = await readFile(new URL('../api/internal-data.js', import.meta.url), 'utf8');
  assert.match(source, /resource === 'managementanalytics'/);
});

test('el resumen público recorta 2019 al inicio real de la ventana', async () => {
  const data = JSON.parse(await readFile(new URL('../friendly-data.json', import.meta.url), 'utf8'));
  const row = data.management.yearly.find((item) => item.year === 2019);
  assert.deepEqual(row, { year: 2019, hires: 4, exits: 4, partial: true });
  assert.equal(data.management.yearly.reduce((sum, item) => sum + item.hires, 0), 580);
  assert.equal(data.management.yearly.reduce((sum, item) => sum + item.exits, 0), 500);
});
