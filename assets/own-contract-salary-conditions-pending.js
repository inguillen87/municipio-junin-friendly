// Metadata-only pending work for the current authorized reader.
import { salaryExact, salaryUuid, SalaryInputError } from './native-salary-catalog-model.js';

export const SALARY_CONDITIONS_PENDING_VERSION = 'own-contract-salary-conditions.pending.v1';
export const SALARY_CONDITIONS_PENDING_MAX_ROWS = 1000;
export const SALARY_CONDITIONS_PENDING_DECISION_WINDOW_DAYS = 30;

const need = (condition, message) => {
  if (!condition) throw new SalaryInputError('SALARY_CONDITIONS_PENDING_CONTRACT_INVALID', message);
};

function exactObject(value, keys) {
  return salaryExact(value, keys)
    && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === keys.length
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(
      descriptor => Object.hasOwn(descriptor, 'value') && descriptor.enumerable,
    );
}

function metadataList(value) {
  return Array.isArray(value)
    && value.length <= SALARY_CONDITIONS_PENDING_MAX_ROWS
    && Reflect.ownKeys(value).length === value.length + 1
    && Array.from({ length: value.length }, (_, index) =>
      Object.getOwnPropertyDescriptor(value, String(index))).every(
      descriptor => descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable,
    );
}

function instantMicroseconds(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null;
  const calendarDate = new Date(match[1] + 'T00:00:00Z');
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== match[1]) return null;
  if (match[6] !== 'Z' && (Number(match[6].slice(1, 3)) > 23 || Number(match[6].slice(4, 6)) > 59)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const fractionalMicroseconds = (match[5] ?? '').padEnd(6, '0');
  return BigInt(milliseconds) * 1000n + BigInt(fractionalMicroseconds.slice(3));
}

const periodValid = value => typeof value === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
// PostgreSQL left(text, 160) counts Unicode characters. Keep historical labels
// compatible with that projection, including decomposed text and astral symbols.
const labelValid = value => typeof value === 'string'
  && Array.from(value).length >= 1 && Array.from(value).length <= 160;

export function salaryConditionsPending(value) {
  need(exactObject(value, [
    'version', 'generatedAt', 'complete', 'decisionWindowDays', 'toReview', 'decided',
    'counts', 'payrollCalculated', 'payrollPosted',
  ]), 'No se verificó el contrato de pendientes.');
  need(value.version === SALARY_CONDITIONS_PENDING_VERSION
    && value.complete === true
    && value.decisionWindowDays === SALARY_CONDITIONS_PENDING_DECISION_WINDOW_DAYS
    && value.payrollCalculated === false && value.payrollPosted === false,
  'La consulta de pendientes está incompleta o declara efectos ajenos a la lectura.');
  const generatedAt = instantMicroseconds(value.generatedAt);
  need(generatedAt !== null, 'La fecha de la consulta de pendientes no es válida.');
  need(metadataList(value.toReview) && metadataList(value.decided),
    'Las listas de pendientes y decisiones deben estar completas y respetar su capacidad.');
  need(exactObject(value.counts, ['toReview', 'decided'])
    && Number.isSafeInteger(value.counts.toReview) && value.counts.toReview === value.toReview.length
    && Number.isSafeInteger(value.counts.decided) && value.counts.decided === value.decided.length,
  'Los conteos no coinciden con las listas completas.');

  const seenIds = new Set();
  for (const proposal of value.toReview) {
    need(exactObject(proposal, ['proposalId', 'period', 'authorLabel', 'createdAt', 'canReview'])
      && salaryUuid(proposal.proposalId) && periodValid(proposal.period)
      && labelValid(proposal.authorLabel) && proposal.canReview === true,
    'No se verificó una propuesta disponible para revisión.');
    const createdAt = instantMicroseconds(proposal.createdAt);
    need(createdAt !== null && createdAt <= generatedAt,
      'La fecha de la propuesta supera la fecha de la consulta de pendientes.');
    need(!seenIds.has(proposal.proposalId), 'La consulta contiene referencias de propuesta repetidas.');
    seenIds.add(proposal.proposalId);
  }

  const earliestDecision = generatedAt - BigInt(SALARY_CONDITIONS_PENDING_DECISION_WINDOW_DAYS) * 24n * 60n * 60n * 1000000n;
  for (const decision of value.decided) {
    need(exactObject(decision, ['eventId', 'proposalId', 'period', 'status', 'actorLabel', 'recordedAt'])
      && salaryUuid(decision.eventId) && salaryUuid(decision.proposalId) && periodValid(decision.period)
      && ['approved', 'rejected'].includes(decision.status) && labelValid(decision.actorLabel),
    'No se verificó una decisión sobre una propuesta propia.');
    const recordedAt = instantMicroseconds(decision.recordedAt);
    need(recordedAt !== null && recordedAt >= earliestDecision && recordedAt <= generatedAt,
      'La decisión no corresponde a la ventana informada de treinta días.');
    need(decision.eventId !== decision.proposalId
      && !seenIds.has(decision.eventId) && !seenIds.has(decision.proposalId),
    'La consulta contiene referencias de evento o propuesta repetidas.');
    seenIds.add(decision.eventId);
    seenIds.add(decision.proposalId);
  }
  return value;
}
