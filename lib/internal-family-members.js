import {
  schoolCertificateSafeError, schoolCertificateUuid, schoolCertificateContractId,
  schoolCertificatePrincipalValues,
} from './internal-family-certificates.js';

export const EMPLOYEE_FAMILY_MAX_BODY_BYTES = 8192;
const FIELDS = ['contractId', 'contractIdentityToken', 'familyName', 'birthDate', 'dni', 'validFrom', 'validTo'];
const HEX = /^[a-f0-9]{64}$/;
const ERRORS = Object.freeze({
  INVALID_PAYLOAD: [422, 'Revisá los datos del hijo o hija.'],
  DOCUMENT_INVALID: [422, 'El DNI debe contener entre 5 y 12 dígitos, o quedar sin informar.'],
  DATES_INVALID: [422, 'Revisá el nacimiento y la vigencia del vínculo.'],
  DUPLICATE: [409, 'Ya hay un familiar con estos datos o una coincidencia que requiere revisión. Revisá los hijos de la ficha antes de volver a cargarlo.'],
  IDENTITY_CHANGED: [409, 'La identidad del legajo cambió. Actualizá la ficha antes de guardar.'],
  NOT_FOUND: [404, 'No se encontró el legajo o vínculo solicitado.'],
  CONTRACT_DRIFT: [503, 'No se pudo validar la respuesta. Reintentá en un momento.'],
  ISOLATION_UNSUPPORTED: [503, 'No se pudo iniciar el registro. Reintentá desde la ficha del legajo.'],
  UNAVAILABLE: [503, 'No se pudo guardar el vínculo. Los datos ingresados deben conservarse para reintentar.'],
});
export class EmployeeFamilyError extends Error {
  constructor(suffix, fallback) {
    const [status, message] = ERRORS[suffix] ?? [fallback?.status ?? 503, fallback?.message ?? ERRORS.UNAVAILABLE[1]];
    super(message); this.name = 'EmployeeFamilyError'; this.status = status; this.code = `EMPLOYEE_FAMILY_${suffix}`;
  }
}
export const employeeFamilyFail = suffix => { throw new EmployeeFamilyError(suffix); };
export function employeeFamilySafeError(error) {
  if (error instanceof EmployeeFamilyError) return error;
  const raw = [error?.code, error?.message].find(value => typeof value === 'string' && value.startsWith('EMPLOYEE_FAMILY_'));
  if (raw) {
    const suffix = raw.slice('EMPLOYEE_FAMILY_'.length);
    if (Object.hasOwn(ERRORS, suffix)) return new EmployeeFamilyError(suffix);
    const common = schoolCertificateSafeError({ code: `SCHOOL_CERTIFICATE_${suffix}` });
    return new EmployeeFamilyError(common.code.replace('SCHOOL_CERTIFICATE_', ''), common);
  }
  const common = schoolCertificateSafeError(error);
  return new EmployeeFamilyError(common.code.replace('SCHOOL_CERTIFICATE_', ''), common);
}
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function exact(value, fields) {
  if (!object(value) || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) employeeFamilyFail('CONTRACT_DRIFT');
}
function civilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function timestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
export function prepareEmployeeFamily(input, { now = new Date() } = {}) {
  if (!object(input) || Object.keys(input).some(key => !FIELDS.includes(key))
    || !schoolCertificateContractId(input.contractId) || typeof input.contractIdentityToken !== 'string' || !HEX.test(input.contractIdentityToken)
    || typeof input.familyName !== 'string' || /[\x00-\x1f\x7f<>]/.test(input.familyName)) employeeFamilyFail('INVALID_PAYLOAD');
  const familyName = input.familyName.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!familyName || !/\p{L}/u.test(familyName) || Array.from(familyName).length > 180) employeeFamilyFail('INVALID_PAYLOAD');
  const payload = { contractId: input.contractId.toLowerCase(), contractIdentityToken: input.contractIdentityToken, familyName,
    birthDate: input.birthDate ?? null, dni: input.dni ?? null, validFrom: input.validFrom ?? null, validTo: input.validTo ?? null };
  if (payload.dni !== null) {
    if (typeof payload.dni !== 'string' || !/^[0-9. -]+$/.test(payload.dni)) employeeFamilyFail('DOCUMENT_INVALID');
    payload.dni = payload.dni.replace(/[. -]/g, '');
    if (!/^[0-9]{5,12}$/.test(payload.dni) || /^0+$/.test(payload.dni)) employeeFamilyFail('DOCUMENT_INVALID');
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (![payload.birthDate, payload.validFrom, payload.validTo].every(value => value === null || civilDate(value))
    || payload.birthDate !== null && payload.birthDate > today
    || payload.validFrom !== null && payload.validTo !== null && payload.validTo < payload.validFrom
    || payload.birthDate !== null && [payload.validFrom, payload.validTo].some(value => value !== null && value < payload.birthDate)) employeeFamilyFail('DATES_INVALID');
  return payload;
}
export function validateEmployeeFamilyContext(data, contractId) {
  exact(data, ['version', 'subject', 'canDeclare']);
  exact(data.subject, ['contractId', 'legajo', 'employeeName', 'sourceCutoff', 'identityToken']);
  const subject = data.subject;
  if (data.version !== 'employee-family-context.v1' || typeof data.canDeclare !== 'boolean' || subject.contractId !== contractId
    || typeof subject.legajo !== 'string' || !subject.legajo || subject.legajo.length > 64 || /[\x00-\x1f\x7f]/.test(subject.legajo)
    || !(subject.employeeName === null || typeof subject.employeeName === 'string' && subject.employeeName.length <= 300 && !/[\x00-\x1f\x7f]/.test(subject.employeeName))
    || typeof subject.identityToken !== 'string' || !HEX.test(subject.identityToken) || !timestamp(subject.sourceCutoff)) employeeFamilyFail('CONTRACT_DRIFT');
  return data;
}
export function validateEmployeeFamilyDeclaration(data) {
  exact(data, ['version', 'familyRef', 'identityToken', 'state', 'recordedAt', 'duplicate']);
  exact(data.familyRef, ['kind', 'id']);
  if (data.version !== 'employee-family-declare.v1' || data.familyRef.kind !== 'own' || !schoolCertificateUuid(data.familyRef.id)
    || typeof data.identityToken !== 'string' || !HEX.test(data.identityToken) || data.state !== 'declared'
    || !timestamp(data.recordedAt) || typeof data.duplicate !== 'boolean') employeeFamilyFail('CONTRACT_DRIFT');
  return data;
}
async function execute(sql, statement, values) {
  try {
    const result = await sql.query(statement, values), rows = Array.isArray(result) ? result : result?.rows;
    if (!Array.isArray(rows) || rows.length !== 1 || !object(rows[0]?.result)) employeeFamilyFail('CONTRACT_DRIFT');
    return rows[0].result;
  } catch (error) { throw employeeFamilySafeError(error); }
}
export async function readEmployeeFamilyContext(sql, principal, session, contractId) {
  if (!schoolCertificateContractId(contractId)) throw employeeFamilySafeError({ code: 'SCHOOL_CERTIFICATE_QUERY_INVALID' });
  const id = contractId.toLowerCase();
  return validateEmployeeFamilyContext(await execute(sql,
    'SELECT public.employee_family_context_v1($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::uuid) AS result',
    [...schoolCertificatePrincipalValues(principal, session), id]), id);
}
export async function declareEmployeeFamily(sql, principal, session, payload, key) {
  if (!schoolCertificateUuid(key)) throw employeeFamilySafeError({ code: 'SCHOOL_CERTIFICATE_IDEMPOTENCY_KEY_INVALID' });
  return validateEmployeeFamilyDeclaration(await execute(sql,
    'SELECT public.employee_family_declare_v1($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::jsonb,$8::text) AS result',
    [...schoolCertificatePrincipalValues(principal, session), JSON.stringify(payload), key.toLowerCase()]));
}
