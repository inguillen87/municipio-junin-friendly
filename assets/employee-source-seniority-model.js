import { civilDate } from './civil-date.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const sameUuid = (a, b) => UUID.test(a ?? '') && UUID.test(b ?? '') && a.toLowerCase() === b.toLowerCase();

function component(raw, max = Number.MAX_SAFE_INTEGER) {
  if (raw === null || raw === undefined || raw === '') return Object.freeze({ value: null, status: 'missing' });
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && /^-?(?:0|[1-9]\d*)$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value)) return Object.freeze({ value: null, status: 'invalid' });
  // Preserve the supplied integer, including a suspicious month count. Never carry months into years.
  return Object.freeze({ value, status: value >= 0 && value <= max ? 'reported' : 'invalid' });
}

function date(value) {
  try { return civilDate(value); } catch { return null; }
}

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !date(value)) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : null;
}

/** Read the contract's original GRH payload. Payroll amounts, elapsed time and other snapshots are never inputs. */
export function createEmployeeSourceSeniorityModel(employee, sourceReferences = []) {
  if (!employee || employee.recordOrigin !== 'GRH') return null;
  const employment = object(object(employee.rawFields).employment);
  const references = Array.isArray(sourceReferences) ? sourceReferences.filter(ref => ref
    && ref.sourceSystem === 'GRH' && ref.sourceEntity === 'legajo'
    && ref.canonicalEntity === 'employment_contract'
    && sameUuid(ref.canonicalId, employee.contractId)
    && sameUuid(ref.sourceBatchId, employee.contractSourceBatchId)) : [];
  // The promoter records valid_from = source_import_batch.source_cutoff for this exact contract/batch.
  // An absent or ambiguous reference cannot borrow a date from another contract or the global dashboard.
  const sourceCutoff = references.length === 1 ? instant(references[0].validFrom) : null;
  return Object.freeze({
    origin: 'GRH',
    years: component(employment.seniorityYears),
    months: component(employment.seniorityMonths, 11),
    hireDate: date(employee.fechaIngreso),
    sourceCutoff,
    scope: 'source_snapshot',
  });
}

export function sourceSeniorityComponentLabel(component) {
  if (component.status === 'reported') return String(component.value);
  if (component.status === 'missing') return 'No informado';
  return component.value === null ? 'Requiere revisión' : `${component.value} · Requiere revisión`;
}

export function sourceSeniorityCutoffLabel(value) {
  if (!value) return 'No disponible';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(value)) + ' (hora argentina)';
}
