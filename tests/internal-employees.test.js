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
      if (sql.includes('AS "absenceTotal"')) return [{ absenceTotal: 0, leaveTotal: 0, familyTotal: 0, movementTotal: 0, leaveSourceMaxDate: '2009-05-15' }];
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

test('employees busca nombres por tokens parametrizados sin depender del orden almacenado', async () => {
  const sql = mockListSql();
  const callsWithValues = [];
  const baseQuery = sql.query.bind(sql);
  sql.query = async (statement, values = []) => {
    callsWithValues.push({ statement: String(statement), values });
    return baseQuery(statement);
  };

  const result = await employees(sql, {
    query: { search: 'Nombre Apellido', page: '1', limit: '10', status: 'all', crosswalk: 'all', includeFacets: '0' },
  });

  assert.equal(result.status, 200);
  const countCall = callsWithValues.find((call) => call.statement.includes('SELECT count(*)::int AS total FROM directory'));
  assert.ok(countCall);
  assert.match(countCall.statement, /translate\(lower\(directory\.nombre\).*LIKE translate\(lower\(\$2\).*AND translate\(lower\(directory\.nombre\).*LIKE translate\(lower\(\$3\)/s);
  assert.deepEqual(countCall.values, ['%Nombre Apellido%', '%Nombre%', '%Apellido%']);
  assert.ok(callsWithValues.every((call) => !call.statement.includes("Nombre Apellido'")));

  callsWithValues.length = 0;
  await employees(sql, {
    query: { search: 'Perez', page: '1', limit: '10', status: 'all', crosswalk: 'all', includeFacets: '0' },
  });
  const accentCall = callsWithValues.find((call) => call.statement.includes('SELECT count(*)::int AS total FROM directory'));
  assert.match(accentCall.statement, /translate\(lower\(directory\.nombre\).*LIKE translate\(lower\(\$2\)/s);
  assert.deepEqual(accentCall.values, ['%Perez%', '%Perez%']);
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

test('employee filtra licencias y ausencias por año con parámetros y conserva el corte propio de la fuente histórica', async () => {
  const sql = mockDetailSql('matched');
  const calls = [];
  const baseQuery = sql.query.bind(sql);
  sql.query = async (statement, values = []) => {
    calls.push({ statement: String(statement), values });
    return baseQuery(statement);
  };

  const result = await employee(sql, {
    query: { contractId: '00000000-0000-0000-0000-000000000001', recordYear: '2009' },
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.meta.recordYear, 2009);
  assert.equal(result.payload.meta.leaveSourceMaxDate, '2009-05-15');
  const counts = calls.find((call) => call.statement.includes('AS "absenceTotal"'));
  assert.match(counts.statement, /fecha >= \$4::date AND fecha < \$5::date/);
  assert.match(counts.statement, /fecha_inicio >= \$4::date AND fecha_inicio < \$5::date/);
  assert.deepEqual(counts.values.slice(-2), ['2009-01-01', '2010-01-01']);
  const absenceRows = calls.find((call) => call.statement.includes('FROM grh_absences absence'));
  assert.match(absenceRows.statement, /absence\.fecha >= \$3::date AND absence\.fecha < \$4::date/);
  assert.deepEqual(absenceRows.values.slice(-2), ['2009-01-01', '2010-01-01']);

  let queried = false;
  const invalid = await employee({ async query() { queried = true; return []; } }, {
    query: { legajo: '42', recordYear: '1800' },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.payload.code, 'EMPLOYEE_RECORD_YEAR_INVALID');
  assert.equal(queried, false);
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
