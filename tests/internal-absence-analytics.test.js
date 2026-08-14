import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { absenceAnalytics, absenceEvents } from '../api/internal-data.js';

function markerOf(statement) {
  return String(statement).match(/\/\* absence:([^*]+) \*\//)?.[1] || 'unknown';
}

function fixtureSql() {
  const calls = [];
  return {
    calls,
    async query(statement, values = []) {
      const sql = String(statement);
      const marker = markerOf(sql);
      calls.push({ marker, sql, values });
      if (marker === 'source') {
        return [{
          importId: 7,
          name: 'grh_junin_extracted.sql',
          sha256: 'A'.repeat(64),
          sourceCutoff: '2026-08-06T15:15:21.000Z',
          importedAt: '2026-08-13T20:00:00.000Z',
          status: 'completed'
        }];
      }
      if (marker === 'analytics-summary') {
        return [{ events: 1559, affectedContracts: 590, sourceDeclaredDays: '17400' }];
      }
      if (marker === 'comparison') {
        return [{ events: 1331, affectedContracts: 567, sourceDeclaredDays: '16576' }];
      }
      if (marker === 'series') {
        return [{ period: '2026-08-01', events: 20, affectedContracts: 19, sourceDeclaredDays: '170', partial: true }];
      }
      if (marker === 'reasons') {
        return [{
          code: '10', label: 'Licencia anual', events: 100, affectedContracts: 80,
          sourceDeclaredDays: '950', isLeave: true, affectsAttendanceBonus: false,
          generatesDiscountedDays: false, calendarDays: true
        }];
      }
      if (marker === 'sectors') {
        return [{ label: 'OBRERO', events: 90, affectedContracts: 70, sourceDeclaredDays: '880' }];
      }
      if (marker === 'facet-reasons') return [{ code: '10', label: 'Licencia anual' }];
      if (marker === 'facet-sectors') return [{ value: 'OBRERO' }];
      if (marker === 'quality') {
        return [{
          sourceRows: 31572, excludedBeforeMinimum: 6, excludedAfterCutoff: 7,
          missingReasonCode: 1, invertedDateRanges: 26,
          missingSourceDeclaredDays: 0, unlinkedEvents: 6
        }];
      }
      if (marker === 'events-summary') {
        return [{ events: 120, affectedContracts: 90, sourceDeclaredDays: '1500' }];
      }
      if (marker === 'events') {
        return [
          {
            contractId: '00000000-0000-0000-0000-000000000042', companyId: 101,
            legajo: '42', name: 'PERSONA AUTORIZADA',
            sector: 'OBRERO', eventDate: '2026-07-10', untilDate: '2026-07-12',
            reasonCode: '10', reason: 'Licencia anual', sourceDeclaredDays: '3',
            sourceQuantity: '1', isLeave: true, affectsAttendanceBonus: false,
            generatesDiscountedDays: false, calendarDays: true,
            // Even if a driver/mock supplied extra columns, the mapper must drop them.
            nombre: 'NO DEBE SALIR', dni: '99999999', cuil: '20...',
            comentario: 'privado', rawFields: { private: true }, email: 'privado@example.test'
          },
          {
            contractId: '00000000-0000-0000-0000-000000000043', companyId: 101,
            legajo: '43', name: 'OTRA PERSONA AUTORIZADA', sector: 'OBRERO',
            eventDate: '2026-07-09', untilDate: null, reasonCode: '10',
            reason: 'Licencia anual', sourceDeclaredDays: '1', sourceQuantity: '1'
          }
        ];
      }
      throw new Error(`Consulta no simulada: ${marker} ${sql.slice(0, 100)}`);
    }
  };
}

test('absenceAnalytics acota el rango al snapshot y parametriza sector/motivo', async () => {
  const sql = fixtureSql();
  const result = await absenceAnalytics(sql, {
    query: {
      from: '1980-01-01', to: '2027-12-31', bucket: 'month',
      sector: "OBRERO' OR 1=1 --", reasonCode: '10'
    }
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload.range, {
    requested: { from: '1980-01-01', to: '2027-12-31' },
    effective: { from: '1990-01-01', to: '2026-08-06' },
    clamped: { from: true, to: true }
  });
  assert.deepEqual(result.payload.data.summary, {
    events: 1559, affectedContracts: 590, sourceDeclaredDays: 17400
  });
  assert.equal(result.payload.data.series[0].partial, true);
  assert.equal(result.payload.data.reasons[0].flags.isLeave, true);
  assert.equal(result.payload.data.comparison.available, false);
  assert.equal(result.payload.quality.excludedBeforeMinimum, 6);
  assert.equal(result.payload.quality.excludedAfterCutoff, 7);
  assert.match(result.payload.quality.unitSemantics, /no equivalen a jornadas perdidas.*tasa/i);
  assert.match(result.payload.quality.sectorSemantics, /sector actual.*no reconstruye.*histórica/i);
  assert.equal(result.payload.meta.ratesAvailable, false);
  assert.equal(result.payload.meta.sectorSemantics, result.payload.quality.sectorSemantics);
  assert.deepEqual(result.payload.facets.sectors, [{ value: 'OBRERO', label: 'OBRERO' }]);
  for (const row of [
    result.payload.data.summary,
    ...result.payload.data.series,
    ...result.payload.data.reasons,
    ...result.payload.data.sectors
  ]) {
    for (const forbidden of ['contractId', 'companyId', 'legajo', 'name', 'nombre']) {
      assert.equal(Object.hasOwn(row, forbidden), false, `Analytics no debe publicar ${forbidden}`);
    }
  }

  const summaryCall = sql.calls.find((call) => call.marker === 'analytics-summary');
  assert.deepEqual(summaryCall.values, ['1990-01-01', '2026-08-06', "OBRERO' OR 1=1 --", '10']);
  assert.doesNotMatch(summaryCall.sql, /OBRERO' OR 1=1/);
  assert.match(summaryCall.sql, /absence\.fecha >= \$1::date/);
});

test('absenceAnalytics compara sólo la misma ventana calendario del año previo', async () => {
  const sql = fixtureSql();
  const result = await absenceAnalytics(sql, {
    query: { from: '2026-01-01', to: '2026-08-06', bucket: 'year' }
  });

  const comparison = result.payload.data.comparison;
  assert.equal(comparison.available, true);
  assert.deepEqual(comparison.previous.range, { from: '2025-01-01', to: '2025-08-06' });
  assert.deepEqual(comparison.changePercent, {
    events: 17.1,
    affectedContracts: 4.1,
    sourceDeclaredDays: 5
  });
  const call = sql.calls.find((item) => item.marker === 'comparison');
  assert.deepEqual(call.values, ['2025-01-01', '2025-08-06']);
});

test('absenceAnalytics abre por defecto el año corriente hasta el corte y habilita comparación homogénea', async () => {
  const sql = fixtureSql();
  const result = await absenceAnalytics(sql, { query: {} });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload.range, {
    requested: { from: '2026-01-01', to: '2026-08-06' },
    effective: { from: '2026-01-01', to: '2026-08-06' },
    clamped: { from: false, to: false }
  });
  assert.equal(result.payload.data.comparison.available, true);
  const call = sql.calls.find((item) => item.marker === 'comparison');
  assert.deepEqual(call.values, ['2025-01-01', '2025-08-06']);
});

test('absenceAnalytics rechaza buckets no declarados antes de consultar Neon', async () => {
  const sql = fixtureSql();
  const result = await absenceAnalytics(sql, { query: { bucket: 'week' } });
  assert.equal(result.status, 400);
  assert.equal(result.payload.code, 'ABSENCE_BUCKET_INVALID');
  assert.equal(sql.calls.length, 0);
});

test('absenceEvents pagina a 50, habilita ficha y limita los identificadores nominales', async () => {
  const sql = fixtureSql();
  const result = await absenceEvents(sql, {
    query: {
      from: '2026-01-01', to: '2026-08-06', sector: 'OBRERO',
      reasonCode: '10', page: '2', limit: '500'
    }
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload.pagination, { page: 2, limit: 50, total: 120, pages: 3 });
  assert.deepEqual(Object.keys(result.payload.data[0]), [
    'contractId', 'companyId', 'legajo', 'name',
    'sector', 'eventDate', 'untilDate', 'reasonCode', 'reason',
    'sourceDeclaredDays', 'sourceQuantity', 'flags', 'rangeIntegrity'
  ]);
  assert.equal(result.payload.data[0].sourceDeclaredDays, 3);
  assert.equal(result.payload.data[0].rangeIntegrity, 'valid_source_range');
  assert.equal(result.payload.data[1].rangeIntegrity, 'until_date_not_reported');
  assert.equal(result.payload.data[0].contractId, '00000000-0000-0000-0000-000000000042');
  assert.equal(result.payload.data[0].legajo, '42');
  assert.equal(result.payload.meta.containsPersonalIdentifiers, true);
  assert.equal(result.payload.meta.externalSharingAllowed, false);
  for (const forbidden of [
    'nombre', 'dni', 'cuil', 'telefono',
    'email', 'domicilio', 'comentario', 'rawFields'
  ]) {
    assert.equal(Object.hasOwn(result.payload.data[0], forbidden), false, `No debe publicar ${forbidden}`);
  }
  const call = sql.calls.find((item) => item.marker === 'events');
  assert.deepEqual(call.values, ['2026-01-01', '2026-08-06', 'OBRERO', '10', 50, 50]);
  assert.match(call.sql, /LIMIT \$5 OFFSET \$6/);
  assert.doesNotMatch(call.sql, /(?:identity|employee|absence)\.(?:dni|cuil|telefono|email|domicilio|comentario|source_payload)/i);
});

test('el handler publica ambos resources de ausentismo', async () => {
  const source = await readFile(new URL('../api/internal-data.js', import.meta.url), 'utf8');
  assert.match(source, /resource === 'absenceanalytics'/);
  assert.match(source, /resource === 'absenceevents'/);
});
