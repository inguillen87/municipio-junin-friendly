import assert from 'node:assert/strict';
import test from 'node:test';

import { leaveNormative, leavePreview } from '../api/internal-data.js';
import {
  annualLeaveReference,
  getTitleViCatalog,
  reasonPolicyMapping,
} from '../assets/mendoza-title-vi.js';

function markerOf(statement) {
  return String(statement).match(/\/\* (leave-(?:normative|preview):[^*]+) \*\//)?.[1] || 'unknown';
}

function fixtureSql({ employee = true } = {}) {
  const calls = [];
  return {
    calls,
    async query(statement, values = []) {
      const sql = String(statement);
      const marker = markerOf(sql);
      calls.push({ marker, sql, values });
      if (marker === 'leave-normative:source') {
        return [{
          importId: 3,
          name: 'grh_junin_extracted.sql',
          sha256: 'A'.repeat(64),
          sourceCutoff: '2026-08-06T15:15:21.000Z',
          importedAt: '2026-08-13T20:00:00.000Z',
          status: 'completed',
        }];
      }
      if (marker === 'leave-normative:readiness') {
        return [{
          employmentRecords: 2450,
          activeRecords: 882,
          activeWithHireDate: 868,
          activeWithoutHireDate: 14,
          activeOldHireDateZeroSourceSeniority: 475,
          activeWithDeclaredDailyHours: 882,
          activeWithDeclaredMonthlyHours: 882,
          absenceSourceRows: 31572,
          absenceRowsWithinCoverage: 31559,
          absenceRowsBeforeMinimum: 6,
          absenceRowsAfterCutoff: 7,
          absenceInvertedRanges: 26,
          absenceMissingReason: 1,
          absenceUnlinkedRows: 6,
          legacyLeaveRows: 3448,
          legacyLeaveMinDate: '1980-01-01',
          legacyLeaveMaxDate: '2009-05-01',
          reasonCatalogRows: 27,
        }];
      }
      if (marker === 'leave-normative:reason-mapping') {
        return [
          {
            reasonCode: '10', label: 'LICENCIA CUIDADO DE FAMILIAR ENFERMO',
            isLeave: 'false', monthlyLimit: '30', annualLimit: '30', calendarDays: 'true',
            affectsAttendanceBonus: 'true', generatesDiscountedDays: 'false',
            calculationMethod: null, events: 98, affectedContracts: 56, sourceDeclaredDays: '130',
          },
          {
            reasonCode: '21', label: 'LICENCIA ANUAL ORDINARIA',
            isLeave: 'false', monthlyLimit: '30', annualLimit: '365', calendarDays: 'true',
            affectsAttendanceBonus: 'false', generatesDiscountedDays: 'false',
            calculationMethod: '1', events: 410, affectedContracts: 240, sourceDeclaredDays: '4584',
          },
        ];
      }
      if (marker === 'leave-preview:employee') {
        return employee ? [{
          companyId: 101,
          legajo: '42',
          nombre: 'PERSONA DE PRUEBA',
          activo: true,
          hireDate: '2015-03-01',
          exitDate: null,
          sector: 'ADMINISTRATIVO',
          categoria: 'A',
          convenio: 'PLANTA',
          cargo: 'AGENTE',
          sourceSeniorityYears: '0',
          sourceSeniorityMonths: '0',
          declaredDailyHours: '6',
          declaredMonthlyHours: '180',
        }] : [];
      }
      if (marker === 'leave-preview:observed-annual-events') {
        return [{ reasonCode: '21', label: 'LICENCIA ANUAL ORDINARIA', events: 2, sourceDeclaredDays: '14' }];
      }
      throw new Error(`Consulta no simulada: ${marker} ${sql.slice(0, 120)}`);
    },
  };
}

test('catalogo Titulo VI conserva fuentes, limites y ambiguedades sin decidir', () => {
  const catalog = getTitleViCatalog();
  assert.equal(catalog.version, 'mendoza-ley-5811-title-vi.v1');
  assert.equal(catalog.applicability.status, 'conditional_pending_complete_junin_profile');
  assert.deepEqual(catalog.applicability.supportedEvaluationYears, [2026]);
  assert.ok(catalog.sources.some((source) => source.id === 'ordenanza-junin-1021-2025'));
  assert.ok(catalog.keyRules.some((rule) => rule.id === 'health-exactly-5' && rule.status === 'not_calculable'));
  assert.ok(catalog.keyRules.some((rule) => rule.id === 'work-accident-art44-repealed' && /derogado/i.test(rule.value)));
  assert.ok(catalog.keyRules.some((rule) => rule.id === 'tardiness' && rule.status === 'not_calculable'));
  assert.equal(reasonPolicyMapping('10').status, 'configuration_conflict');
  assert.equal(reasonPolicyMapping('20').status, 'not_a_leave');
  assert.equal(reasonPolicyMapping('2').status, 'separate_regime');
});

test('escala anual respeta bordes exactos y no inventa dias efectivos', () => {
  assert.deepEqual(annualLeaveReference({ hireDate: '2026-07-01', year: 2026 }).status, 'not_calculable');
  assert.equal(annualLeaveReference({ hireDate: '2026-06-30', year: 2026 }).result.value, 14);
  assert.equal(annualLeaveReference({ hireDate: '2021-12-31', year: 2026 }).result.value, 14);
  assert.equal(annualLeaveReference({ hireDate: '2021-12-30', year: 2026 }).result.value, 21);
  assert.equal(annualLeaveReference({ hireDate: '2016-12-31', year: 2026 }).result.value, 21);
  assert.equal(annualLeaveReference({ hireDate: '2016-12-30', year: 2026 }).result.value, 28);
  assert.equal(annualLeaveReference({ hireDate: '2006-12-31', year: 2026 }).result.value, 28);
  assert.equal(annualLeaveReference({ hireDate: '2006-12-30', year: 2026 }).result.value, 35);
});

test('leaveNormative publica readiness y conflictos agregados sin datos personales', async () => {
  const sql = fixtureSql();
  const result = await leaveNormative(sql);
  assert.equal(result.status, 200);
  assert.equal(result.payload.data.readiness.employment.activeRecords, 882);
  assert.equal(result.payload.data.readiness.workedHours.status, 'not_calculable');
  assert.equal(result.payload.data.readiness.leaveBalance.status, 'not_calculable');
  assert.equal(result.payload.data.readiness.legacyLeaves.maxDate, '2009-05-01');
  assert.equal(result.payload.data.mappings[0].policy.status, 'configuration_conflict');
  assert.equal(result.payload.data.mappings[1].sourceConfiguration.annualLimit, 365);
  assert.equal(result.payload.meta.containsPersonalData, false);
  assert.equal(result.payload.meta.legalDecisionAllowed, false);
  assert.equal(result.payload.meta.policyVersionId, 'mendoza-ley-5811-title-vi.v1');
  assert.doesNotMatch(JSON.stringify(result.payload), /PERSONA DE PRUEBA|dni|cuil|domicilio/i);
  assert.match(sql.calls[0].sql, /EXISTS .*grh_absences.*import_run_id/s);
});

test('leavePreview devuelve referencia condicional, evidencia GRH y bloquea saldo/horas', async () => {
  const sql = fixtureSql();
  const result = await leavePreview(sql, { query: { companyId: '101', legajo: '42', year: '2026' } });
  assert.equal(result.status, 200);
  assert.equal(result.payload.data.employee.name, 'PERSONA DE PRUEBA');
  assert.equal(result.payload.data.annualOrdinary.status, 'conditional');
  assert.equal(result.payload.data.annualOrdinary.result.value, 28);
  assert.equal(result.payload.data.annualOrdinary.balance, null);
  assert.equal(result.payload.data.annualOrdinary.observedSourceDeclaredDays, 14);
  assert.equal(result.payload.data.healthLeave.status, 'not_calculable');
  assert.equal(result.payload.data.workedHours.status, 'not_calculable');
  assert.equal(result.payload.data.workedHours.declaredSchedule.dailyHours, 6);
  assert.equal(result.payload.meta.externalSharingAllowed, false);
  assert.equal(result.payload.meta.legalDecisionAllowed, false);
  assert.equal(result.payload.meta.engineVersion, 'annual-leave-reference.v1');
  assert.equal(result.payload.data.sources.at(-1).id, 'grh-source-snapshot');
  const observedCall = sql.calls.find((call) => call.marker === 'leave-preview:observed-annual-events');
  assert.deepEqual(observedCall.values, [101, '42', '2026-01-01', '2026-08-06', ['19', '21', '30']]);
  assert.doesNotMatch(observedCall.sql, /PERSONA DE PRUEBA/);
});

test('leavePreview valida parametros y no consulta un legajo inexistente mas alla de GRH', async () => {
  const invalid = await leavePreview(fixtureSql(), { query: { companyId: '1 OR 1=1', legajo: '42' } });
  assert.equal(invalid.status, 400);
  const sql = fixtureSql({ employee: false });
  const missing = await leavePreview(sql, { query: { companyId: '101', legajo: '999' } });
  assert.equal(missing.status, 404);
  assert.equal(sql.calls.some((call) => call.marker === 'leave-preview:observed-annual-events'), false);
});

test('leavePreview no aplica la politica 2026 de forma retrospectiva', async () => {
  const sql = fixtureSql();
  const result = await leavePreview(sql, { query: { companyId: '101', legajo: '42', year: '2025' } });
  assert.equal(result.status, 422);
  assert.equal(result.payload.code, 'LEAVE_YEAR_OUTSIDE_POLICY_VERSION');
  assert.equal(sql.calls.some((call) => call.marker === 'leave-preview:employee'), false);
});
