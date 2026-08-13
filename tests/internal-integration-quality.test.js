import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { integrationQuality } from '../api/internal-data.js';

function fixtureSql({ loaded = false, compatible = true, reconciled = true } = {}) {
  const calls = [];
  return {
    calls,
    async query(statement) {
      const sql = String(statement);
      calls.push(sql);

      if (sql.includes('AS "administrativeActive"')) {
        return [{ administrativeActive: 882, administrativePeople: 814 }];
      }
      if (sql.includes('FROM data_import_runs')) {
        return [{
          id: 9,
          sourceName: 'grh_junin_extracted.sql',
          sourceSha256: 'grh-sha',
          sourceCutoff: '2026-08-06T15:15:21.000Z',
          completedAt: '2026-08-13T12:00:00.000Z',
          status: 'completed'
        }];
      }
      if (sql.includes('FROM information_schema.columns')) {
        if (!loaded) return [];
        const columns = [
          ['vw_empleado_actual', 'activo_administrativo'],
          ['vw_empleado_actual', 'activo_liquidable'],
          ['vw_empleado_actual', 'payroll_closure_status'],
          ['vw_crosswalk_persona', 'match_status'],
          ['person_identity', 'id'],
          ['employment_contract', 'id'],
          ['source_xref', 'source_id']
        ];
        if (compatible) columns.push(['vw_empleado_actual', 'estado_control']);
        return columns.map(([relationName, columnName]) => ({ relationName, columnName }));
      }
      if (sql.includes('AS "viewAdministrative"')) {
        return [{ viewAdministrative: reconciled ? 882 : 881, liquidable: 854, closureStatus: 'open' }];
      }
      if (sql.includes('GROUP BY 1') && sql.includes('estado_control')) {
        return reconciled
          ? [
              { state: 'licencia_sin_goce', records: 10 },
              { state: 'suspendido', records: 8 },
              { state: 'baja_pendiente', records: 6 },
              { state: 'error_de_estado', records: 4 }
            ]
          : [{ state: 'sin_clasificar', records: 27 }];
      }
      if (sql.includes('FROM vw_crosswalk_persona')) {
        return [{ matched: 1699, unmatched: 493, ambiguous: 157, total: 2349 }];
      }

      throw new Error(`Consulta inesperada: ${sql.slice(0, 100)}`);
    }
  };
}

test('integrationQuality publica GRH disponible y marca las capas futuras como no cargadas', async () => {
  const sql = fixtureSql();
  const payload = await integrationQuality(sql);

  assert.equal(payload.ok, true);
  assert.equal(payload.status, 'partial');
  assert.equal(payload.sourcePolicy.laborCore, 'GRH');
  assert.equal(payload.sourcePolicy.auxiliaryRegistry, 'PERSONAS');
  assert.match(payload.sourcePolicy.rule, /GRH define el estado laboral/);
  assert.match(payload.sourcePolicy.forbiddenJoin, /No unir GRH y PERSONAS por IDPERSONA/);

  assert.deepEqual(payload.workforceControl.administrative, {
    status: 'available',
    value: 882,
    source: 'grh_employees.activo',
    definition: 'Legajos GRH sin fecha de egreso; proxy administrativo pendiente de homologación.',
    reason: null
  });
  assert.equal(payload.workforceControl.administrativePeople, 814);
  assert.equal(payload.workforceControl.liquidable.status, 'not_loaded');
  assert.equal(payload.workforceControl.liquidable.value, null);
  assert.equal(payload.workforceControl.difference.value, null);
  assert.equal(payload.workforceControl.stateBreakdown.total, null);
  assert.deepEqual(payload.workforceControl.stateBreakdown.rows, []);

  assert.equal(payload.identityEnrichment.crosswalk.status, 'not_loaded');
  assert.equal(payload.identityEnrichment.crosswalk.matched, null);
  assert.equal(payload.relations.canonicalIdentity.status, 'not_loaded');
  assert.equal(sql.calls.length, 3, 'no debe consultar vistas que no existen');
});

test('integrationQuality reconcilia 882/854 y el crosswalk sólo cuando las vistas cumplen el contrato', async () => {
  const sql = fixtureSql({ loaded: true });
  const payload = await integrationQuality(sql);

  assert.equal(payload.status, 'ready');
  assert.equal(payload.workforceControl.status, 'reconciled');
  assert.equal(payload.workforceControl.administrative.value, 882);
  assert.equal(payload.workforceControl.liquidable.value, 854);
  assert.equal(payload.workforceControl.payrollClosureStatus, 'open');
  assert.equal(payload.workforceControl.difference.value, 28);
  assert.equal(payload.workforceControl.stateBreakdown.total, 28);
  assert.equal(payload.workforceControl.checks.viewAdministrativeMatchesGrh, true);
  assert.equal(payload.workforceControl.checks.stateBreakdownReconcilesDifference, true);

  assert.deepEqual(
    {
      matched: payload.identityEnrichment.crosswalk.matched,
      unmatched: payload.identityEnrichment.crosswalk.unmatched,
      ambiguous: payload.identityEnrichment.crosswalk.ambiguous,
      total: payload.identityEnrichment.crosswalk.total,
      coveragePct: payload.identityEnrichment.crosswalk.coveragePct,
      reconciled: payload.identityEnrichment.crosswalk.reconciled
    },
    { matched: 1699, unmatched: 493, ambiguous: 157, total: 2349, coveragePct: 72.3, reconciled: true }
  );
  assert.equal(payload.identityEnrichment.role, 'quality_and_enrichment_only');
  assert.match(payload.identityEnrichment.rules.at(-1), /no modifica el estado laboral/i);
  assert.equal(sql.calls.length, 6);

  const serialized = JSON.stringify(payload);
  for (const field of ['dni', 'cuil', 'nombre', 'domicilio', 'telefono', 'email']) {
    assert.doesNotMatch(serialized, new RegExp(`"${field}"\\s*:`, 'i'));
  }
});

test('integrationQuality no consulta una vista presente pero incompatible', async () => {
  const sql = fixtureSql({ loaded: true, compatible: false });
  const payload = await integrationQuality(sql);

  assert.equal(payload.status, 'needs_review');
  assert.equal(payload.relations.workforce.status, 'incompatible');
  assert.deepEqual(payload.relations.workforce.missingColumns, ['estado_control']);
  assert.equal(payload.workforceControl.liquidable.value, null);
  assert.equal(payload.identityEnrichment.crosswalk.status, 'available');
  assert.equal(payload.identityEnrichment.crosswalk.matched, 1699);
  assert.equal(sql.calls.some((query) => query.includes('AS "viewAdministrative"')), false);
});

test('integrationQuality no declara reconciliado si la vista o los estados contradicen GRH', async () => {
  const sql = fixtureSql({ loaded: true, reconciled: false });
  const payload = await integrationQuality(sql);

  assert.equal(payload.status, 'needs_review');
  assert.equal(payload.workforceControl.status, 'needs_review');
  assert.equal(payload.workforceControl.difference.value, 28);
  assert.equal(payload.workforceControl.stateBreakdown.total, 27);
  assert.equal(payload.workforceControl.checks.viewAdministrativeMatchesGrh, false);
  assert.equal(payload.workforceControl.checks.stateBreakdownReconcilesDifference, false);
});

test('integracion-datos.html consume el contrato interno sin cifras incrustadas', async () => {
  const html = await readFile(new URL('../integracion-datos.html', import.meta.url), 'utf8');

  assert.match(html, /resource=integrationQuality/i);
  assert.match(html, /GRH es el núcleo laboral/);
  assert.match(html, /PERSONAS es un padrón auxiliar/);
  assert.match(html, /No modifica el estado laboral/);
  assert.match(html, /response\.status === 401/);
  assert.match(html, /login\.html\?next=integracion-datos\.html/);
  assert.doesNotMatch(html, /data-value=["'](?:882|854|28|1699|493|157)["']/i);
  assert.doesNotMatch(html, /linear-gradient|backdrop-filter/i);

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0], { filename: 'integracion-datos.html:inline.js' }));
});
