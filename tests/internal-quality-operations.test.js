import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { importLineage, qualityIssues, qualityOverview } from '../api/internal-data.js';

function markerOf(statement) {
  return String(statement).match(/\/\* quality:([^*]+) \*\//)?.[1] || 'unknown';
}

function fixtureSql() {
  const calls = [];
  return {
    calls,
    async query(statement, values = []) {
      const sql = String(statement);
      const marker = markerOf(sql);
      calls.push({ marker, sql, values });
      if (marker === 'overview-summary') {
        return [{
          total: 589, open: 589, accepted: 0, corrected: 0, rejected: 0,
          info: 0, warning: 581, error: 8, critical: 0,
          distinctCodes: 6, distinctEntities: 6,
          payrollCoherence: 556, payrollCoherenceOpen: 556,
          identityCuil: 25, identityCuilOpen: 25,
          dates: 8, datesOpen: 8
        }];
      }
      if (marker === 'overview-codes') {
        return [{
          source: 'GRH', entity: 'calculo_monthly', code: 'SOURCE_MONTH_MISMATCH',
          severity: 'warning', resolution: 'open', issues: 550,
          observedValue: 'NO DEBE SALIR', sourceId: 'registro-privado'
        }];
      }
      if (marker === 'overview-entities') {
        return [{ source: 'GRH', entity: 'calculo_monthly', registeredIssues: 556, openIssues: 556 }];
      }
      if (marker === 'overview-sources') {
        return [
          { source: 'GRH', registeredIssues: 589, openIssues: 589 },
          { source: 'PERSONAS', registeredIssues: 0, openIssues: 0 }
        ];
      }
      if (marker === 'overview-crosswalk') {
        return [{ total: 2349, matched: 1699, ambiguous: 157, unmatched: 493, rejected: 0 }];
      }
      if (marker === 'issues-count') return [{ total: 8 }];
      if (marker === 'issues-list') {
        return [{
          issueId: '42',
          source: 'GRH',
          entity: 'legajo',
          code: 'DATE_OUT_OF_RANGE',
          severity: 'error',
          field: 'fecha_ingreso',
          resolution: 'open',
          detectedAt: '2026-08-13T21:43:41.000Z',
          resolvedAt: null,
          // The production mapper must discard these even if a driver/mock adds them.
          sourceBatchId: 'batch-private',
          sourceId: 'record-private',
          canonicalId: 'person-private',
          observedValue: '1111-01-01',
          details: { raw: true },
          resolutionNote: 'private',
          dni: '99999999',
          cuil: '20-99999999-9',
          name: 'PERSONA PRIVADA'
        }];
      }
      if (marker === 'lineage') {
        return [
          {
            source: 'GRH', cutoff: '2026-08-06T18:15:21.000Z',
            loadedAt: '2026-08-13T21:43:41.409Z', validation: 'published',
            sourceRowCount: null, sha256: 'A'.repeat(64), trackedIssues: 589
          },
          {
            source: 'PERSONAS', cutoff: '2026-08-06T15:15:23.000Z',
            loadedAt: '2026-08-13T21:46:57.075Z', validation: 'published',
            sourceRowCount: '96777', sha256: 'B'.repeat(64), trackedIssues: 0
          }
        ];
      }
      throw new Error(`Consulta no simulada: ${marker} ${sql.slice(0, 100)}`);
    }
  };
}

test('qualityOverview reconcilia issues materializados y separa el crosswalk', async () => {
  const sql = fixtureSql();
  const result = await qualityOverview(sql);

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload.data.issues, {
    total: 589,
    open: 589,
    byResolution: { open: 589, accepted: 0, corrected: 0, rejected: 0 },
    bySeverity: { info: 0, warning: 581, error: 8, critical: 0 },
    distinctCodes: 6,
    distinctEntities: 6
  });
  assert.deepEqual(
    Object.fromEntries(Object.entries(result.payload.data.domains).map(([key, value]) => [key, value.registeredIssues])),
    { payrollCoherence: 556, identityCuil: 25, dates: 8 }
  );
  assert.deepEqual(result.payload.data.crosswalk, {
    total: 2349, matched: 1699, ambiguous: 157, unmatched: 493, rejected: 0, reconciled: true
  });
  assert.deepEqual(result.payload.data.reconciliation, {
    severityTotal: 589,
    domainTotal: 589,
    totalMatchesSeverity: true,
    totalMatchesDomains: true,
    openEqualsTotal: true
  });
  assert.equal(
    result.payload.data.breakdowns.sources.find((row) => row.source === 'PERSONAS').trackingStatus,
    'controls_not_materialized'
  );
  assert.equal(result.payload.meta.metric, 'registered_data_quality_issues');
  assert.equal(result.payload.meta.mutationAllowed, false);

  const serialized = JSON.stringify(result.payload);
  for (const forbidden of [
    'observedValue', 'sourceId', 'canonicalId', 'dni', 'cuil', 'name', 'nombre',
    'domicilio', 'telefono', 'email', 'qualityScore', 'healthScore'
  ]) {
    assert.doesNotMatch(serialized, new RegExp(`"${forbidden}"\\s*:`, 'i'));
  }
  for (const marker of ['overview-summary', 'overview-codes', 'overview-entities', 'overview-sources']) {
    assert.match(sql.calls.find((call) => call.marker === marker).sql, /validation_state = 'published'/);
  }
});

test('qualityIssues aplica allowlists, parametriza y pagina con maximo 50', async () => {
  const sql = fixtureSql();
  const result = await qualityIssues(sql, {
    query: {
      source: 'grh', severity: 'ERROR', entity: 'legajo',
      code: 'date_out_of_range', resolution: 'OPEN', page: '2', limit: '500'
    }
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload.pagination, { page: 2, limit: 50, total: 8, pages: 1 });
  assert.deepEqual(result.payload.filters, {
    source: 'GRH', severity: 'error', entity: 'legajo',
    code: 'DATE_OUT_OF_RANGE', resolution: 'open'
  });
  assert.deepEqual(Object.keys(result.payload.data[0]), [
    'issueId', 'source', 'entity', 'code', 'severity', 'field',
    'resolution', 'detectedAt', 'resolvedAt'
  ]);
  assert.deepEqual(result.payload.data[0], {
    issueId: '42',
    source: 'GRH',
    entity: 'legajo',
    code: 'DATE_OUT_OF_RANGE',
    severity: 'error',
    field: 'fecha_ingreso',
    resolution: 'open',
    detectedAt: '2026-08-13T21:43:41.000Z',
    resolvedAt: null
  });
  assert.equal(result.payload.meta.containsPersonalData, false);
  assert.equal(result.payload.meta.containsSourceRecordIdentifiers, false);
  assert.equal(result.payload.meta.externalSharingAllowed, false);

  const countCall = sql.calls.find((call) => call.marker === 'issues-count');
  const listCall = sql.calls.find((call) => call.marker === 'issues-list');
  assert.deepEqual(countCall.values, ['GRH', 'error', 'legajo', 'DATE_OUT_OF_RANGE', 'open']);
  assert.deepEqual(listCall.values, ['GRH', 'error', 'legajo', 'DATE_OUT_OF_RANGE', 'open', 50, 50]);
  assert.match(listCall.sql, /LIMIT \$6 OFFSET \$7/);
  assert.doesNotMatch(
    listCall.sql,
    /(?:source_id|canonical_id|observed_value|details|resolution_note|raw_payload)/i
  );
  assert.match(countCall.sql, /validation_state = 'published'/);
  assert.match(listCall.sql, /validation_state = 'published'/);
});

test('qualityIssues rechaza filtros fuera de allowlist antes de consultar Neon', async () => {
  const sql = fixtureSql();
  const result = await qualityIssues(sql, { query: { source: "GRH' OR 1=1 --" } });

  assert.equal(result.status, 400);
  assert.equal(result.payload.code, 'QUALITY_SOURCE_INVALID');
  assert.equal(result.payload.field, 'source');
  assert.equal(sql.calls.length, 0);
});

test('importLineage publica dos snapshots, distingue no reportado y no interpreta cero como limpio', async () => {
  const sql = fixtureSql();
  const result = await importLineage(sql);

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload.summary, {
    publishedBatches: 2,
    reportedRowCounts: 1,
    notReportedRowCounts: 1
  });
  assert.deepEqual(result.payload.data[0], {
    source: 'GRH',
    cutoff: '2026-08-06T18:15:21.000Z',
    loadedAt: '2026-08-13T21:43:41.409Z',
    validation: 'published',
    sourceRowCount: null,
    sourceRowCountStatus: 'not_reported',
    sha256Prefix: 'AAAAAAAAAAAA',
    trackedIssues: 589,
    trackedIssuesStatus: 'materialized'
  });
  assert.equal(result.payload.data[1].sourceRowCount, 96777);
  assert.equal(result.payload.data[1].sourceRowCountStatus, 'reported');
  assert.equal(result.payload.data[1].trackedIssues, 0);
  assert.equal(result.payload.data[1].trackedIssuesStatus, 'controls_not_materialized');
  assert.equal(result.payload.data[1].sha256Prefix, 'BBBBBBBBBBBB');
  assert.equal(result.payload.meta.zeroTrackedIssuesDoesNotMeanClean, true);
  assert.doesNotMatch(JSON.stringify(result.payload), new RegExp('B'.repeat(64)));
});

test('el handler publica los tres recursos DQ-01', async () => {
  const source = await readFile(new URL('../api/internal-data.js', import.meta.url), 'utf8');
  assert.match(source, /resource === 'qualityoverview'/);
  assert.match(source, /resource === 'qualityissues'/);
  assert.match(source, /resource === 'importlineage'/);
});
