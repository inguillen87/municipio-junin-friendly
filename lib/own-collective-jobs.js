import { employeeContext } from './internal-native-employees.js';
import { salaryExact, salaryHash, salaryKey, salaryUuid, SalaryInputError } from '../assets/native-salary-catalog-model.js';
import { collectiveWorkingTimeFile } from '../assets/own-contract-working-time-collective.js';
import { collectiveSeniorityFile } from '../assets/own-salary-seniority-collective.js';
import { workingTimePeriod, workingTimeDefinition } from '../assets/own-contract-working-time-model.js';
import { seniorityDefinition } from '../assets/own-salary-seniority-model.js';

export const COLLECTIVE_JOB_VERSION = 'own-collective-job.v1';
export const COLLECTIVE_JOB_READ = Object.freeze(['workforce.employee.read', 'payroll.parameter.read']);
export const COLLECTIVE_JOB_MAX_BYTES = 4 * 1024 * 1024 + 64 * 1024;
export const COLLECTIVE_JOB_PAGE_SIZE = 200;
export const COLLECTIVE_JOB_FAMILIES = Object.freeze(['working-time', 'seniority']);
export const COLLECTIVE_JOB_PHASES = Object.freeze(['preparing', 'prepared', 'running', 'paused', 'complete', 'cancelled']);
const mutationCapability = command => command === 'propose' ? 'payroll.parameter.prepare' : 'payroll.parameter.approve';
export const collectiveJobCapability = mutationCapability;

export class CollectiveJobError extends Error {
  constructor(code, status, message) {
    super(message);
    Object.assign(this, { name: 'CollectiveJobError', code: code.startsWith('COLLECTIVE_JOB_') ? code : `COLLECTIVE_JOB_${code}`, status });
  }
}
export function collectiveJobFail(code, status, message) { throw new CollectiveJobError(code, status, message); }
const messages = {
  INPUT_INVALID: [422, 'Revisá el archivo completo, la operación y el fundamento.'],
  FORBIDDEN: [403, 'Tu cuenta no permite esta operación sobre el conjunto.'],
  SESSION_INVALID: [401, 'La sesión venció. El avance guardado se conserva; ingresá para reanudarlo.'],
  NOT_FOUND: [404, 'No se encontró el conjunto dentro de tu acceso.'],
  SCOPE_CHANGED: [409, 'Cambió la cuenta o el ámbito municipal del conjunto.'],
  POPULATION_CHANGED: [409, 'Cambió el padrón completo. Revisá nuevamente el conjunto; el avance anterior se conserva.'],
  REVIEW_REQUIRED: [409, 'Revisá la comparación completa vigente antes de registrar el conjunto.'],
  BASE_CHANGED: [409, 'Cambió una revisión o fuente. El conjunto quedó pausado y conserva su avance.'],
  PROPOSAL_CHANGED: [409, 'Una propuesta ya no coincide con el archivo revisado.'],
  INDEPENDENT_REQUIRED: [403, 'La decisión requiere otra persona habilitada.'],
  IDEMPOTENCY_REUSE: [409, 'La referencia pertenece a otro contenido. Consultá el conjunto original.'],
  STATE_INVALID: [409, 'El estado actual del conjunto no permite esta operación.'],
  ACTIVE_JOB_EXISTS: [409, 'Ya hay un conjunto pendiente para esta operación y período. Abrí el avance guardado antes de iniciar otro.'],
  INCOMPLETE: [422, 'El archivo no contiene la cantidad completa de registros declarada.'],
  DUPLICATE: [422, 'El archivo repite un contrato o un registro. No se incorporaron duplicados.'],
  PENDING: [409, 'Hay propuestas pendientes que requieren revisión antes de continuar el conjunto.'],
  SOURCE_CHANGED: [409, 'Cambió la identidad o la fuente de un contrato. Revisá nuevamente el conjunto.'],
  BUSY: [409, 'Otro proceso está atendiendo el conjunto. El avance se conserva.'],
  LIMIT: [413, 'El conjunto supera el tamaño o la cantidad permitidos. No se recortaron registros.'],
};
export function collectiveJobError(error) {
  if (error instanceof CollectiveJobError) return error;
  if (error instanceof SalaryInputError) return new CollectiveJobError('INPUT_INVALID', 422, messages.INPUT_INVALID[1]);
  const text = `${String(error?.code ?? '')} ${String(error?.message ?? '')}`;
  if (/\b(?:ACTION|NATIVE_EMPLOYEE|TENANT_IAM)_SESSION_INVALID\b/.test(text)) return new CollectiveJobError('SESSION_INVALID', ...messages.SESSION_INVALID);
  if (/\b(?:NATIVE_EMPLOYEE|NATIVE_EMPLOYMENT_CHANGE|NATIVE_SALARY)_FORBIDDEN\b|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(text)) return new CollectiveJobError('FORBIDDEN', ...messages.FORBIDDEN);
  for (const [code, [status, message]] of Object.entries(messages)) {
    if (new RegExp(`\\b(?:COLLECTIVE_JOB|COLLECTIVE|WORKING_TIME|SENIORITY)_${code}\\b`).test(text)) return new CollectiveJobError(code, status, message);
  }
  return new CollectiveJobError('UNAVAILABLE', 503, 'No se confirmó la operación. Consultá el conjunto guardado antes de crear otro.');
}

export function collectiveJobCreateInput(value, key) {
  if (!salaryExact(value, ['family', 'file', 'command', 'reason']) || !COLLECTIVE_JOB_FAMILIES.includes(value.family)
      || !['propose', 'approve', 'reject'].includes(value.command)
      || typeof value.reason !== 'string' || value.reason !== value.reason.trim() || value.reason !== value.reason.normalize('NFC')
      || value.reason.length < 10 || value.reason.length > 1000 || /[<>\u0000-\u001f\u007f]/.test(value.reason)) {
    collectiveJobFail('INPUT_INVALID', 422, messages.INPUT_INVALID[1]);
  }
  if (!salaryKey(key)) collectiveJobFail('INPUT_INVALID', 428, 'El conjunto requiere una referencia de intento.');
  const file = value.family === 'working-time' ? collectiveWorkingTimeFile(value.file) : collectiveSeniorityFile(value.file);
  return { family: value.family, file, command: value.command, reason: value.reason, key };
}

export function collectiveJobActionInput(operation, value) {
  const keys = operation === 'confirm' ? ['id', 'reviewHash', 'confirmed'] : ['id'];
  if (!['confirm', 'resume', 'cancel'].includes(operation) || !salaryExact(value, keys) || !salaryUuid(value.id)
      || operation === 'confirm' && (value.confirmed !== true || !salaryHash(value.reviewHash))) {
    collectiveJobFail('INPUT_INVALID', 422, messages.INPUT_INVALID[1]);
  }
  return value;
}

function requireResult(condition) {
  if (!condition) collectiveJobFail('CONTRACT_INVALID', 503, 'No se pudo verificar la respuesta del conjunto. Consultá su estado guardado.');
}

// Return a deliberate public projection. In particular, a private stored actor
// context, the input file and canonical command bodies never reach polling UI.
export function collectiveJobSnapshot(value, { id = null, family = null, details = false } = {}) {
  requireResult(value && typeof value === 'object' && !Array.isArray(value)
    && value.version === COLLECTIVE_JOB_VERSION && salaryUuid(value.id)
    && (id === null || value.id.toLowerCase() === id.toLowerCase())
    && COLLECTIVE_JOB_FAMILIES.includes(value.family) && (family === null || family === value.family)
    && workingTimePeriod(value.period) && ['propose', 'approve', 'reject'].includes(value.command)
    && COLLECTIVE_JOB_PHASES.includes(value.phase));
  for (const field of ['total', 'prepared', 'confirmed', 'unchanged', 'completed', 'dispatchGeneration']) {
    requireResult(Number.isSafeInteger(value[field]) && value[field] >= 0);
  }
  requireResult(value.dispatchGeneration >= 1);
  requireResult(value.total > 0 && value.total <= 10000 && value.prepared <= value.total
    && value.confirmed + value.unchanged <= value.total && value.unchanged <= value.prepared
    && value.confirmed <= value.completed && value.completed <= value.prepared
    && (value.reviewHash === null || salaryHash(value.reviewHash))
    && (value.pauseCode === null || typeof value.pauseCode === 'string' && /^[A-Z][A-Z0-9_]{0,100}$/.test(value.pauseCode))
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt)));
  const out = Object.fromEntries(['version', 'id', 'family', 'period', 'command', 'phase', 'total', 'prepared', 'confirmed', 'unchanged', 'completed', 'reviewHash', 'pauseCode', 'createdAt', 'updatedAt', 'dispatchGeneration'].map(key => [key, value[key]]));
  if (salaryHash(value.fileHash)) out.fileHash = value.fileHash;
  if (typeof value.reason === 'string' && value.reason.length >= 10 && value.reason.length <= 1000 && !/[<>\u0000-\u001f\u007f]/.test(value.reason)) out.reason = value.reason;
  if (typeof value.actorLabel === 'string' && value.actorLabel.length <= 300 && !/[\u0000-\u001f\u007f]/.test(value.actorLabel)) out.actorLabel = value.actorLabel;
  if (typeof value.replayed === 'boolean') out.replayed = value.replayed;
  if (details) {
    requireResult(Array.isArray(value.comparisons) && value.comparisons.length <= COLLECTIVE_JOB_PAGE_SIZE
      && Number.isSafeInteger(value.comparisonTotal) && value.comparisonTotal >= 0 && value.comparisonTotal <= value.total
      && (value.nextOffset === null || Number.isSafeInteger(value.nextOffset) && value.nextOffset >= 1 && value.nextOffset < value.comparisonTotal));
    out.comparisons = value.comparisons.map(item => {
      requireResult(item && salaryUuid(item.contractId) && typeof item.legajo === 'string'
        && item.legajo.length > 0 && item.legajo.length <= 64 && !/[\u0000-\u001f\u007f]/.test(item.legajo)
        && ['unchanged', 'propose', 'approve', 'reject'].includes(item.action) && typeof item.confirmed === 'boolean'
        && Object.hasOwn(item, 'before') && Object.hasOwn(item, 'after'));
      try {
        const definition = value.family === 'working-time' ? workingTimeDefinition : seniorityDefinition;
        if (item.before !== null) definition(item.before, value.period);
        definition(item.after, value.period);
      } catch { requireResult(false); }
      return Object.fromEntries(['contractId', 'legajo', 'before', 'after', 'action', 'confirmed'].map(key => [key, item[key]]));
    });
    out.comparisonTotal = value.comparisonTotal;
    out.nextOffset = value.nextOffset;
  }
  return out;
}

async function queryResult(sql, query, values) {
  const rows = await sql.query(query, values);
  return (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
}

export async function ownCollectiveJobOperation(sql, principal, session, operation, input) {
  try {
    const context = JSON.stringify(employeeContext(principal, session));
    let query, values, result;
    if (operation === 'create') {
      const { key, ...payload } = input;
      const v = collectiveJobCreateInput(payload, key);
      query = 'SELECT public.own_collective_job_create_v1($1::jsonb,$2::text,$3::jsonb,$4::text,$5::text,$6::uuid) AS result';
      values = [context, v.family, JSON.stringify(v.file), v.command, v.reason, v.key];
    } else if (operation === 'list') {
      if (!COLLECTIVE_JOB_FAMILIES.includes(input.family) || input.period != null && !workingTimePeriod(input.period)
          || input.cursor != null && !salaryUuid(input.cursor)) collectiveJobFail('INPUT_INVALID', 400, messages.INPUT_INVALID[1]);
      query = 'SELECT public.own_collective_job_list_v1($1::jsonb,$2::text,$3::text,$4::uuid) AS result';
      values = [context, input.family, input.period ?? null, input.cursor ?? null];
    } else {
      if (!salaryUuid(input.id)) collectiveJobFail('INPUT_INVALID', 400, messages.INPUT_INVALID[1]);
      if (operation === 'status' || operation === 'detail') {
        const offset = input.offset ?? 0, limit = input.limit ?? COLLECTIVE_JOB_PAGE_SIZE;
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || !Number.isSafeInteger(limit) || limit < 1 || limit > COLLECTIVE_JOB_PAGE_SIZE) collectiveJobFail('INPUT_INVALID', 400, messages.INPUT_INVALID[1]);
        query = 'SELECT public.own_collective_job_inspect_v1($1::jsonb,$2::uuid,$3::boolean,$4::integer,$5::integer) AS result';
        values = [context, input.id, operation === 'detail', offset, limit];
      } else if (operation === 'confirm') {
        collectiveJobActionInput(operation, input);
        query = 'SELECT public.own_collective_job_confirm_v1($1::jsonb,$2::uuid,$3::text) AS result';
        values = [context, input.id, input.reviewHash];
      } else if (operation === 'resume' || operation === 'cancel') {
        collectiveJobActionInput(operation, input);
        query = `SELECT public.own_collective_job_${operation}_v1($1::jsonb,$2::uuid) AS result`;
        values = [context, input.id];
      } else collectiveJobFail('INPUT_INVALID', 400, messages.INPUT_INVALID[1]);
    }
    result = await queryResult(sql, query, values);
    if (operation === 'list') {
      requireResult(result && Array.isArray(result.jobs) && result.jobs.length <= 50 && typeof result.hasMore === 'boolean'
        && (result.nextCursor === null || salaryUuid(result.nextCursor)) && result.hasMore === (result.nextCursor !== null));
      return { jobs: result.jobs.map(job => collectiveJobSnapshot(job, { family: input.family })), hasMore: result.hasMore, nextCursor: result.nextCursor };
    }
    return collectiveJobSnapshot(result, { id: input.id ?? null, family: input.family ?? null, details: operation === 'detail' });
  } catch (error) { throw collectiveJobError(error); }
}

export async function ownCollectiveJobStep(sql, id, generation, limit = 8) {
  if (!salaryUuid(id) || !Number.isSafeInteger(generation) || generation < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 16) collectiveJobFail('INPUT_INVALID', 400, messages.INPUT_INVALID[1]);
  const value = await queryResult(sql, 'SELECT public.own_collective_job_step_v1($1::uuid,$2::bigint,$3::integer) AS result', [id, generation, limit]);
  if (value === null) return null;
  return collectiveJobSnapshot(value, { id });
}

export async function ownCollectiveJobPending(sql, limit = 20) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) collectiveJobFail('INPUT_INVALID', 400, messages.INPUT_INVALID[1]);
  const rows = await queryResult(sql, 'SELECT public.own_collective_job_pending_v1($1::integer) AS result', [limit]);
  requireResult(Array.isArray(rows) && rows.length <= limit);
  return rows.map(row => {
    requireResult(salaryUuid(row?.id) && Number.isSafeInteger(row.dispatchGeneration) && row.dispatchGeneration >= 1);
    return { id: row.id, dispatchGeneration: row.dispatchGeneration };
  });
}
