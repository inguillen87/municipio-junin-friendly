import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { structure } from '../api/internal-data.js';

function fixtureSql() {
  const calls = [];
  return {
    calls,
    async query(statement) {
      const sql = String(statement);
      calls.push(sql);

      if (sql.includes('FROM data_import_runs')) {
        return [{
          id: 7,
          sourceName: 'grh_junin_extracted.sql',
          sourceSha256: 'abc123',
          sourceCutoff: '2026-08-06T15:15:21.000Z',
          completedAt: '2026-08-13T12:00:00.000Z',
          status: 'completed'
        }];
      }
      if (sql.includes('AS "historicalRecords"')) {
        return [{
          historicalRecords: 10,
          activeRecords: 4,
          inactiveRecords: 6,
          withOrganization: 8,
          withSector: 9,
          withRole: 0,
          organizationsObserved: 2,
          sectorsObserved: 2,
          rolesObserved: 0
        }];
      }
      if (sql.includes('AS "organizationIds"')) {
        return [
          { label: 'Secretaría A', assigned: true, organizationIds: ['1'], historical: 8, active: 4, inactive: 4, sectorCount: 2 },
          { label: 'Sin organización asignada', assigned: false, organizationIds: [], historical: 2, active: 0, inactive: 2, sectorCount: 1 }
        ];
      }
      if (sql.includes('AS "sectorCodes"')) {
        return [
          { label: 'Administración', assigned: true, sectorCodes: ['1'], historical: 6, active: 3, inactive: 3, organizationCount: 1 },
          { label: 'Servicios', assigned: true, sectorCodes: ['2'], historical: 4, active: 1, inactive: 3, organizationCount: 1 }
        ];
      }
      if (sql.includes('AS "roleIds"')) {
        return [{ label: 'Sin cargo asignado', assigned: false, roleIds: [], historical: 10, active: 4, inactive: 6 }];
      }
      if (sql.includes("WHERE catalog IN")) {
        return [
          { catalog: 'organizations', rows: 3, parentLinks: 0 },
          { catalog: 'sectors', rows: 2, parentLinks: 0 },
          { catalog: 'job_roles', rows: 1, parentLinks: 0 }
        ];
      }
      if (sql.includes("#>> '{sourceKey,organizationId}'") && !sql.includes('WITH organizations')) {
        return [{ id: '1', label: 'Secretaría A', code: 'SEC-A', abbreviation: 'SA', parentId: null, activeSourceValue: '1' }];
      }
      if (sql.includes("#>> '{sourceKey,companyCode}'")) {
        return [{ companyCode: '101', sectorCode: '1', label: 'Administración', abbreviation: 'ADM', budgetActivityId: null, contracted: null }];
      }
      if (sql.includes("#>> '{sourceKey,cargoId}'")) {
        return [{ id: '1', label: 'Dirección', parentId: null, reportsTo: null }];
      }
      if (sql.includes('WITH organizations AS')) {
        return [{ catalogRows: 3, roots: 3, parentLinks: 0, unresolvedParentLinks: 0 }];
      }

      throw new Error(`Consulta inesperada: ${sql.slice(0, 80)}`);
    }
  };
}

function collectKeys(value, output = new Set()) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKeys(entry, output));
    return output;
  }
  Object.entries(value).forEach(([key, nested]) => {
    output.add(key.toLowerCase());
    collectKeys(nested, output);
  });
  return output;
}

test('structure devuelve agregaciones reconciliadas y no expone campos personales', async () => {
  const sql = fixtureSql();
  const payload = await structure(sql);

  assert.equal(payload.ok, true);
  assert.equal(payload.source.status, 'completed');
  assert.deepEqual(payload.coverage, {
    historicalRecords: 10,
    activeRecords: 4,
    inactiveRecords: 6,
    withOrganization: 8,
    withSector: 9,
    withRole: 0,
    organizationsObserved: 2,
    sectorsObserved: 2,
    rolesObserved: 0
  });
  assert.equal(payload.hierarchy.available, false);
  assert.equal(payload.hierarchy.parentLinks, 0);
  assert.match(payload.hierarchy.reason, /No se infiere un organigrama/);
  assert.equal(payload.organizations.reduce((sum, row) => sum + row.historical, 0), 10);
  assert.equal(payload.organizations.reduce((sum, row) => sum + row.active, 0), 4);
  assert.equal(payload.sectors.reduce((sum, row) => sum + row.historical, 0), 10);
  assert.equal(payload.catalogs.organizations.length, 1);
  assert.equal(sql.calls.length, 10);

  const keys = collectKeys(payload);
  for (const forbidden of ['nombre', 'dni', 'cuil', 'telefono', 'email', 'domicilio', 'familiares']) {
    assert.equal(keys.has(forbidden), false, `el contrato no debe exponer ${forbidden}`);
  }
});

test('estructura.html contiene el contrato de sesión, vistas y JavaScript válido', async () => {
  const html = await readFile(new URL('../estructura.html', import.meta.url), 'utf8');
  assert.match(html, /resource=structure/);
  assert.match(html, /response\.status === 401/);
  assert.match(html, /location\.replace\('login\.html'\)/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /Catálogo de cargos/);
  assert.doesNotMatch(html, /linear-gradient|backdrop-filter/i);

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0], { filename: 'estructura.html:inline.js' }));
});
