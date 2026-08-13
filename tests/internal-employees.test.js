import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { employee, employees } from '../api/internal-data.js';

function mockListSql() {
  const calls = [];
  return {
    calls,
    async query(statement) {
      const sql = String(statement);
      calls.push(sql);
      if (sql.includes('SELECT count(*)::int AS total FROM directory')) return [{ total: 2450 }];
      if (sql.includes('SELECT * FROM directory')) {
        return [{
          contractId: '00000000-0000-0000-0000-000000000001',
          companyId: 1,
          legajo: '42',
          nombre: 'PERSONA DE PRUEBA',
          administrativeStatus: 'active',
          payrollStatus: 'preliquidated',
          controlState: 'incluido_en_corrida_abierta',
          crosswalkStatus: 'matched'
        }];
      }
      if (sql.includes('totalContracts')) {
        return [{ totalContracts: 2450, totalPeople: 2349, matched: 1699, ambiguous: 157, unmatched: 493 }];
      }
      if (sql.includes("'{employment,sectorName}'")) return [{ value: 'Sector A', count: 1 }];
      if (sql.includes("'{employment,organizationName}'")) return [{ value: 'Organización A', count: 1 }];
      if (sql.includes("'{employment,agreementName}'")) return [{ value: 'Convenio A', count: 1 }];
      throw new Error(`Consulta no simulada: ${sql.slice(0, 120)}`);
    }
  };
}

function mockDetailSql(matchStatus = 'matched') {
  const canonicalPersonId = '00000000-0000-0000-0000-000000000002';
  const contractId = '00000000-0000-0000-0000-000000000001';
  return {
    async query(statement) {
      const sql = String(statement);
      if (sql.includes('FROM employment_contract contract') && sql.includes('LIMIT 2')) {
        return [{
          contractId,
          canonicalPersonId,
          companyId: 1,
          legajo: '42',
          nombre: 'PERSONA DE PRUEBA',
          administrativeStatus: 'active',
          payrollStatus: 'preliquidated',
          crosswalkStatus: matchStatus,
          crosswalkMethod: matchStatus === 'matched' ? 'cuil_unique' : matchStatus,
          crosswalkConfidence: matchStatus === 'matched' ? 1 : 0,
          personasSourceId: matchStatus === 'matched' ? 'PERSONAS-99' : null,
          rawFields: { employment: {}, unionMemberships: [] },
          crosswalkEvidence: { rawIdJoinUsed: false }
        }];
      }
      if (sql.includes('AS "absenceTotal"')) return [{ absenceTotal: 0, leaveTotal: 0, familyTotal: 0, movementTotal: 0 }];
      if (sql.includes('FROM grh_absences')) return [];
      if (sql.includes('FROM grh_leaves')) return [];
      if (sql.includes('FROM grh_family')) return [];
      if (sql.includes('FROM employment_movement')) return [];
      if (sql.includes('FROM person_identity_assertion')) {
        return [{ attributeName: 'address', rawValue: [{ sourceDisplay: 'Domicilio auxiliar' }], sourceSystem: 'PERSONAS' }];
      }
      if (sql.includes('FROM source_xref')) return [{ sourceSystem: 'GRH', canonicalId: canonicalPersonId }];
      if (sql.includes('WHERE contract.person_id')) return [{ contractId, companyId: 1, legajo: '42', status: 'active' }];
      throw new Error(`Consulta no simulada: ${sql.slice(0, 120)}`);
    }
  };
}

test('employees pagina el grano canonical employment_contract y publica alcance 2450/2349', async () => {
  const sql = mockListSql();
  const result = await employees(sql, { query: { page: '1', limit: '25', status: 'all', crosswalk: 'all' } });

  assert.equal(result.status, 200);
  assert.equal(result.payload.pagination.total, 2450);
  assert.equal(result.payload.data.length, 1);
  assert.deepEqual(result.payload.scope, {
    grain: 'employment_contract',
    authority: 'GRH',
    personasRole: 'auxiliary_identity_and_territory_only',
    totalContracts: 2450,
    totalPeople: 2349,
    matched: 1699,
    ambiguous: 157,
    unmatched: 493
  });
  assert.ok(sql.calls.some((statement) => statement.includes('LIMIT $1 OFFSET $2')));
  assert.ok(sql.calls.every((statement) => !statement.includes('JOIN PERSONAS ON')));
});

test('employees valida filtros permitidos antes de consultar Neon', async () => {
  let queried = false;
  const sql = { async query() { queried = true; return []; } };
  const result = await employees(sql, { query: { status: 'inventado' } });
  assert.equal(result.status, 400);
  assert.equal(result.payload.code, 'DIRECTORY_STATUS_INVALID');
  assert.equal(queried, false);
});

test('employee sólo entrega PERSONAS cuando el crosswalk es matched', async () => {
  const matched = await employee(mockDetailSql('matched'), { query: { contractId: '00000000-0000-0000-0000-000000000001' } });
  assert.equal(matched.status, 200);
  assert.equal(matched.payload.data.personas.available, true);
  assert.equal(matched.payload.data.personas.sourceId, 'PERSONAS-99');
  assert.equal(matched.payload.data.personas.domiciles.length, 1);

  const ambiguous = await employee(mockDetailSql('ambiguous'), { query: { contractId: '00000000-0000-0000-0000-000000000001' } });
  assert.equal(ambiguous.status, 200);
  assert.equal(ambiguous.payload.data.personas.available, false);
  assert.equal(ambiguous.payload.data.personas.sourceId, null);
  assert.deepEqual(ambiguous.payload.data.personas.domiciles, []);
  assert.deepEqual(ambiguous.payload.data.personas.assertions, []);
  assert.equal(ambiguous.payload.data.identityAssertions.some((item) => item.sourceSystem === 'PERSONAS'), false);
  assert.equal(ambiguous.payload.data.sourceReferences.some((item) => item.sourceSystem === 'PERSONAS'), false);
  assert.match(ambiguous.payload.data.personas.reason, /candidatos/i);
});

test('ficha interna declara directorio, filtros canónicos y secciones ricas sin JOIN por IDPERSONA', async () => {
  const [html, api] = await Promise.all([
    readFile(new URL('../internal-dashboard.html', import.meta.url), 'utf8'),
    readFile(new URL('../api/internal-data.js', import.meta.url), 'utf8')
  ]);
  for (const phrase of [
    'Personas y legajos', 'Nombre, legajo, DNI o CUIL', 'Integración PERSONAS',
    'Situación laboral y control', 'Enriquecimiento PERSONAS', 'Gremios y afiliaciones',
    'Últimos movimientos de legajo', 'Identificadores de origen'
  ]) assert.match(html, new RegExp(phrase));
  assert.match(api, /LIMIT \$\$\{dataValues\.length - 1\} OFFSET \$\$\{dataValues\.length\}/);
  assert.match(api, /LIMIT \$\{DETAIL_EVENT_LIMIT\}/);
  assert.match(api, /LIMIT \$\{DETAIL_MOVEMENT_LIMIT\}/);
  assert.doesNotMatch(api, /JOIN\s+\w*personas\w*\s+ON\s+[^;]*idpersona/is);
});
