// Local preparation only. Preserves every source row; never adopts or calculates.
import {createHash} from 'node:crypto';
import {employeeSourceFacts} from '../../assets/grh-employee-source-facts.js';

export const DEFER_MISSING_ENTRY_POLICY = 'missing-original-entry-date.v1';
const fail = message => { throw new Error('ROSTER_OPERATIONAL_PLAN_INVALID: ' + message); };
const value = (object, key) => {
  const descriptor = object && Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('Falta un dato original explícito.');
  return descriptor.value;
};
const day = v => typeof v === 'string' && /^(?!0000)\d{4}-\d\d-\d\d$/.test(v)
  && Number.isFinite(Date.parse(v + 'T12:00:00Z'))
  && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };

export function prepareOfficialRosterOperationalPlan({rows, sourceSha256, companyCode, deferredPolicy}) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100000
    || !/^[a-f0-9]{64}$/.test(sourceSha256 ?? '') || typeof companyCode !== 'string' || !/^\d{1,9}$/.test(companyCode)
    || deferredPolicy !== DEFER_MISSING_ENTRY_POLICY) fail('Revisá la fuente completa y el criterio de conservación.');
  const seen = new Set(), planRows = [], counts = {source: rows.length, active: 0, candidates: 0, deferred: 0, historical: 0,
    candidateFactsPending: 0, deferredMissingClassification: 0, deferredMissingDepartment: 0};
  for (const [index, row] of rows.entries()) {
    const employment = value(row, 'employment'), active = value(employment, 'activeProxy');
    if (typeof active !== 'boolean') fail('El estado original no permite clasificar una fila.');
    const facts = employeeSourceFacts(row);
    if (!facts.retained) fail('Faltan los antecedentes originales completos.');
    const key = value(row, 'sourceKey'), company = String(value(key, 'companyCode')), number = String(value(key, 'employeeNumber'));
    if (company !== companyCode || seen.has(number)) fail('La fuente contiene otra empresa o una clave repetida.');
    seen.add(number);
    let disposition = 'historical', observations = [];
    if (active) {
      counts.active++;
      const original = value(row, 'sourceFields'), start = value(original, 'FING_12'), end = value(original, 'FEGR_12');
      if (value(employment, 'hireDate') !== start || value(employment, 'exitDate') !== end || end !== null
        || start !== null && !day(start)) fail('Las fechas activas no coinciden con sus antecedentes originales.');
      const missingClassification = [value(original, 'CODI_02'), value(original, 'CODI_10')].some(v => v === null || v === '');
      const missingDepartment = !['original042', 'original055'].includes(facts.department);
      if (start === null) {
        disposition = 'deferred'; observations.push('START_DATE_MISSING'); counts.deferred++;
        if (missingClassification) counts.deferredMissingClassification++;
        if (missingDepartment) counts.deferredMissingDepartment++;
      } else {
        disposition = 'candidate'; counts.candidates++;
        if (missingClassification) observations.push('CLASSIFICATION_PENDING');
        if (missingDepartment) observations.push('DEPARTMENT_PENDING');
        if (observations.length) counts.candidateFactsPending++;
      }
    } else counts.historical++;
    planRows.push({sourceRowNumber: index + 1, disposition, observations});
  }
  if (counts.candidates + counts.deferred !== counts.active || counts.active + counts.historical !== counts.source) fail('La cobertura no está completa.');
  const selectionSha256 = createHash('sha256').update(JSON.stringify({sourceSha256, companyCode, deferredPolicy, rows: planRows})).digest('hex');
  return freeze({version: 'official-roster-operational-plan.v1', sourceSha256, companyCode, deferredPolicy, selectionSha256, counts,
    rows: planRows, effects: {sourceModified: false, contractsAdopted: 0, payrollCalculated: false, businessWrites: 0}});
}
