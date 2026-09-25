import { schoolCertificatePrincipalValues } from './internal-family-certificates.js';

export const FIXED_MAX_BODY = 16 * 1024;
export const FIXED_PAYROLL_TYPES = Object.freeze(['monthly', 'first_fortnight', 'sac', 'vacation', 'supplementary', 'final', 'other']);
export const FIXED_READ_CAPS = Object.freeze(['payroll.novelty.read', 'payroll.novelty.nominal.read']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CONTRACT = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const DIGITS = /^(?:0|[1-9][0-9]{0,19})$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/;
const CENTS = /^-?(?:0|[1-9][0-9]{0,17})$/;
const VALUE_KEYS = ['conceptSourceId', 'costCenterSourceId', 'payrollType', 'quantityDecimal', 'amountCents', 'forced', 'forcedReason', 'legalInstrument', 'validFrom', 'validTo'];
const ERRORS = {
  SESSION_INVALID: [401, 'La sesión ya no es válida. Volvé a ingresar.'], CAPABILITY_REQUIRED: [403, 'Tu perfil no permite esta operación.'],
  AUTHORITY_REQUIRED: [403, 'Falta autoridad operativa para esta operación.'], EMPLOYMENT_REQUIRED: [403, 'Proponer y revisar requieren un vínculo laboral vigente del operador.'],
  RELEASE_NOT_CERTIFIED: [503, 'La fuente municipal no está certificada para esta operación.'], BINDING_REQUIRED: [503, 'La fuente municipal no está disponible.'],
  INVALID_PAYLOAD: [422, 'Revisá los datos de la propuesta.'], DATES_INVALID: [422, 'Revisá las fechas de vigencia.'],
  NOT_FOUND: [404, 'No se encontró el registro solicitado.'], LEGAJO_NOT_FOUND: [422, 'El legajo no tiene un contrato GRH activo y único.'],
  VERSION_CONFLICT: [409, 'El registro cambió. Consultalo y revisá la nueva versión antes de proponer.'],
  PENDING_EXISTS: [409, 'Este registro tiene una propuesta pendiente de revisión.'],
  OVERLAP: [409, 'La vigencia se superpone con otra novedad aprobada del mismo vínculo, concepto, centro y tipo. Revisá las fechas o la propuesta existente.'],
  IDENTITY_CHANGED: [409, 'Cambió la identidad del legajo. La propuesta no se reasignó a otra persona.'],
  MAKER_CHECKER_REQUIRED: [409, 'La revisión debe realizarla otra persona con una membresía diferente.'],
  IDEMPOTENCY_REUSE: [409, 'Este intento corresponde a otros datos. Conservá el envío original para verificar su resultado.'],
  SNAPSHOT_CHANGED: [409, 'El resultado cambió. Volvé a consultar antes de exportar.'], SESSION_BUSY: [409, 'Hay otra operación en curso. Reintentá el mismo envío.'],
  ROW_LIMIT: [422, 'El resultado alcanzó el límite permitido. No se guardó una versión incompleta.'],
  CAPACITY_LIMIT: [503, 'No hay espacio seguro para guardar otra propuesta. El formulario se conserva; hace falta revisar la capacidad disponible.'],
  LEGACY_RECONCILIATION_REQUIRED: [409, 'El registro anterior de novedades fijas requiere conciliación antes de continuar. Se conservan sus datos y este envío.'],
  JUNIN638_DNI_REQUIRED: [422, 'El TXT 638 requiere DNI válido de 5 a 8 dígitos en cada registro.'],
  JUNIN638_AMOUNT_REQUIRED: [422, 'El TXT 638 requiere un importe no negativo de hasta $ 99.999.999,99 por registro.'],
  CONTRACT_DRIFT: [503, 'No se pudo validar la respuesta. Volvé a consultar.'], UNAVAILABLE: [503, 'No se pudo completar la operación. Reintentá.'],
  QUERY_INVALID: [400, 'La consulta no es válida.'], BODY_INVALID: [400, 'El cuerpo de la solicitud no es válido.'], BODY_TOO_LARGE: [413, 'La propuesta supera el tamaño permitido.'],
  ORIGIN_INVALID: [403, 'El origen de la solicitud no está permitido.'], ORIGIN_NOT_CONFIGURED: [503, 'El origen de la operación no está configurado.'],
  CONTENT_TYPE_REQUIRED: [415, 'La solicitud requiere application/json.'], IDEMPOTENCY_KEY_REQUIRED: [428, 'La propuesta requiere una clave de intento.'],
  IDEMPOTENCY_KEY_INVALID: [400, 'La clave de intento no es válida.'], METHOD_NOT_ALLOWED: [405, 'Método no permitido.'],
};
export class FixedNoveltyError extends Error {
  constructor(suffix) { const key = Object.hasOwn(ERRORS, suffix) ? suffix : 'UNAVAILABLE'; super(ERRORS[key][1]); this.code = 'PAYROLL_FIXED_' + key; this.status = ERRORS[key][0]; }
}
export const fixedFail = suffix => { throw new FixedNoveltyError(suffix); };
export function fixedSafeError(error) {
  if (error instanceof FixedNoveltyError) return error;
  for (const suffix of Object.keys(ERRORS)) for (const prefix of ['PAYROLL_FIXED_', 'PAYROLL_NOVELTY_', 'SCHOOL_CERTIFICATE_']) {
    if (error?.code === prefix + suffix || error?.message === prefix + suffix) return new FixedNoveltyError(suffix);
  }
  if (error?.code === 'TENANT_IAM_SOD_CONFLICT' || error?.message === 'TENANT_IAM_SOD_CONFLICT') return new FixedNoveltyError('AUTHORITY_REQUIRED');
  const aliases = { ACTION_SESSION_INVALID: 'SESSION_INVALID', ACTION_SESSION_BUSY: 'SESSION_BUSY', ACTION_RELEASE_NOT_CERTIFIED: 'RELEASE_NOT_CERTIFIED', ACTION_SOURCE_BINDING_REQUIRED: 'BINDING_REQUIRED', SCHOOL_CERTIFICATE_TENANT_MEMBERSHIP_REQUIRED: 'AUTHORITY_REQUIRED' };
  if (aliases[error?.code] || aliases[error?.message]) return new FixedNoveltyError(aliases[error.code] ?? aliases[error.message]);
  return new FixedNoveltyError('UNAVAILABLE');
}
export const fixedUuid = value => typeof value === 'string' && UUID.test(value);
export const fixedContractId = value => typeof value === 'string' && CONTRACT.test(value) && value !== '00000000-0000-0000-0000-000000000000';
export const fixedLegajo = value => typeof value === 'string' && DIGITS.test(value);
export const fixedHash = value => typeof value === 'string' && HASH.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const text = (value, min, max) => typeof value === 'string' && value.length >= min && value.length <= max && value === value.trim() && value === value.normalize('NFC') && !/[\x00-\x1f\x7f<>]/.test(value);
const email = value => text(value, 3, 320) && value.includes('@');
const contract = value => typeof value === 'string' && CONTRACT.test(value);
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object'
  ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
function exact(value, keys, error = 'CONTRACT_DRIFT') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) fixedFail(error);
}
export function fixedDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= '2100-12-31'
    && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
export const fixedPeriod = value => fixedDate(value) && value.endsWith('-01');
function validateValues(value, error = 'CONTRACT_DRIFT') {
  exact(value, VALUE_KEYS, error);
  if (!fixedLegajo(value.conceptSourceId) || !(value.costCenterSourceId === null || fixedLegajo(value.costCenterSourceId))
    || !FIXED_PAYROLL_TYPES.includes(value.payrollType) || typeof value.forced !== 'boolean'
    || !(value.forced ? text(value.forcedReason, 5, 500) : value.forcedReason === null) || !text(value.legalInstrument, 5, 300)
    || !(value.quantityDecimal === null || typeof value.quantityDecimal === 'string' && DECIMAL.test(value.quantityDecimal) && !/^-0(?:\.0+)?$/.test(value.quantityDecimal))
    || !(value.amountCents === null || typeof value.amountCents === 'string' && CENTS.test(value.amountCents) && value.amountCents !== '-0')
    || value.quantityDecimal === null && value.amountCents === null || value.forced && value.amountCents === null) fixedFail(error);
  if (!fixedDate(value.validFrom) || !(value.validTo === null || fixedDate(value.validTo) && value.validTo >= value.validFrom)) fixedFail(error === 'INVALID_PAYLOAD' ? 'DATES_INVALID' : error);
}
export function prepareFixedCommand(command, payload) {
  if (command === 'propose') {
    exact(payload, ['recordId', 'expectedVersion', 'contractId', 'legajo', 'identityToken', 'operation', 'values', 'reason'], 'INVALID_PAYLOAD');
    if (!(payload.recordId === null || fixedUuid(payload.recordId)) || !integer(payload.expectedVersion) || !contract(payload.contractId)
      || !fixedLegajo(payload.legajo) || !fixedHash(payload.identityToken) || !['set', 'annul'].includes(payload.operation)
      || payload.recordId === null && (payload.expectedVersion !== 0 || payload.operation !== 'set')
      || payload.recordId !== null && payload.expectedVersion < 1 || !text(payload.reason, 5, 500)) fixedFail('INVALID_PAYLOAD');
    if (payload.operation === 'annul') { if (payload.values !== null) fixedFail('INVALID_PAYLOAD'); }
    else validateValues(payload.values, 'INVALID_PAYLOAD');
    return { ...payload, recordId: payload.recordId?.toLowerCase() ?? null, contractId: payload.contractId.toLowerCase() };
  }
  if (command === 'review') {
    exact(payload, ['recordId', 'proposalId', 'expectedVersion', 'decision', 'reason'], 'INVALID_PAYLOAD');
    if (!fixedUuid(payload.recordId) || !fixedUuid(payload.proposalId) || !integer(payload.expectedVersion) || payload.expectedVersion < 1
      || !['approve', 'reject'].includes(payload.decision) || !text(payload.reason, 5, 500)) fixedFail('INVALID_PAYLOAD');
    return { ...payload, recordId: payload.recordId.toLowerCase(), proposalId: payload.proposalId.toLowerCase() };
  }
  fixedFail('INVALID_PAYLOAD');
}
export function fixedContext(principal, session) {
  try {
    const [actorEmail, actorSessionId, actorSessionVersion, releaseSha, tenantId, membershipId] = schoolCertificatePrincipalValues(principal, session);
    return { actorEmail, actorSessionId, actorSessionVersion, membershipId, releaseSha, tenantId };
  } catch (error) { throw fixedSafeError(error); }
}
function subject(value) {
  const native=value?.origin==='MUNICONTROL';
  exact(value, ['contractId', 'legajo', 'employeeName', 'identityToken', 'sourceCutoff', ...(native?['origin','registrationId','registeredAt']:[])]);
  if (!contract(value.contractId) || !fixedLegajo(value.legajo) || !(value.employeeName === null || text(value.employeeName, 1, 300))
    || !fixedHash(value.identityToken) || (native ? value.sourceCutoff!==null || !fixedUuid(value.registrationId) || !stamp(value.registeredAt) : !stamp(value.sourceCutoff))) fixedFail('CONTRACT_DRIFT');
}
function proposal(value, recordId) {
  exact(value, ['id', 'recordId', 'version', 'operation', 'values', 'reason', 'proposedAt', 'proposedBy', 'review', 'canReview']);
  if (!fixedUuid(value.id) || value.recordId !== recordId || !integer(value.version) || value.version < 1
    || !['set', 'annul'].includes(value.operation) || !text(value.reason, 5, 500) || !stamp(value.proposedAt) || !email(value.proposedBy) || typeof value.canReview !== 'boolean') fixedFail('CONTRACT_DRIFT');
  if (value.operation === 'set') validateValues(value.values); else if (value.values !== null) fixedFail('CONTRACT_DRIFT');
  if (value.review !== null) {
    exact(value.review, ['decision', 'reason', 'reviewedAt', 'reviewedBy', 'version']);
    if (!['approve', 'reject'].includes(value.review.decision) || !text(value.review.reason, 5, 500) || !stamp(value.review.reviewedAt)
      || !email(value.review.reviewedBy) || value.review.version !== value.version + 1 || value.canReview) fixedFail('CONTRACT_DRIFT');
  }
}
function record(value) {
  exact(value, ['id', 'version', 'subject', 'identityCurrent', 'approved', 'pending', 'latest', 'canPropose']);
  if (!fixedUuid(value.id) || !integer(value.version) || value.version < 1 || typeof value.identityCurrent !== 'boolean' || typeof value.canPropose !== 'boolean') fixedFail('CONTRACT_DRIFT');
  subject(value.subject); proposal(value.latest, value.id);
  if (value.version !== value.latest.version + (value.latest.review === null ? 0 : 1)) fixedFail('CONTRACT_DRIFT');
  for (const key of ['approved', 'pending']) if (value[key] !== null) {
    proposal(value[key], value.id);
    if (value[key].version > value.latest.version || (key === 'approved' ? value[key].review?.decision !== 'approve' : value[key].review !== null || value[key].id !== value.latest.id)) fixedFail('CONTRACT_DRIFT');
  }
  if ((value.pending === null) !== (value.latest.review !== null) || value.canPropose && (!value.identityCurrent || value.pending !== null)) fixedFail('CONTRACT_DRIFT');
  if (value.pending && canonical(value.pending) !== canonical(value.latest)
    || value.latest.review?.decision === 'approve' && canonical(value.approved) !== canonical(value.latest)
    || value.approved && value.approved.version === value.latest.version && canonical(value.approved) !== canonical(value.latest)
    || !value.identityCurrent && [value.approved, value.pending, value.latest].some(item => item?.canReview)) fixedFail('CONTRACT_DRIFT');
}
function effects(value) {
  exact(value, ['approvalEffect', 'grhMutation', 'payrollCalculated', 'payrollPosted']);
  if (value.approvalEffect !== 'control_export_only' || value.grhMutation !== false || value.payrollCalculated !== false || value.payrollPosted !== false) fixedFail('CONTRACT_DRIFT');
}
export function validateFixedResponse(data, resource, expected = {}) {
  if (resource === 'bootstrap') {
    exact(data, ['version', 'principal', 'limits', 'payrollTypes', 'effects']);
    exact(data.principal, ['tenantId', 'membershipId', 'certifiedBindingId', 'capabilities', 'employmentLinked']);
    exact(data.limits, ['maxRecords', 'maxHistory']);
    if (data.version !== 'payroll-fixed-bootstrap.v1' || !['tenantId', 'membershipId', 'certifiedBindingId'].every(key => fixedUuid(data.principal[key]))
      || data.principal.tenantId !== expected.tenantId || data.principal.membershipId !== expected.membershipId
      || typeof data.principal.employmentLinked !== 'boolean' || !Array.isArray(data.principal.capabilities)
      || data.principal.capabilities.some(key => typeof key !== 'string' || !/^payroll\.(?:novelty\.[a-z.]+|fixed\.(?:prepare|approve))$/.test(key))
      || new Set(data.principal.capabilities).size !== data.principal.capabilities.length
      || data.limits.maxRecords !== 500 || data.limits.maxHistory !== 100 || JSON.stringify(data.payrollTypes) !== JSON.stringify(FIXED_PAYROLL_TYPES)) fixedFail('CONTRACT_DRIFT');
    effects(data.effects);
  } else if (resource === 'employee') {
    exact(data, ['version', 'subject']); subject(data.subject);
    if (data.version !== 'payroll-fixed-employee.v1' || (expected.contractId ? data.subject.contractId !== expected.contractId : data.subject.legajo !== expected.legajo || data.subject.origin==='MUNICONTROL')) fixedFail('CONTRACT_DRIFT');
  } else if (resource === 'list' || resource === 'export') {
    exact(data, ['version', 'periodMonth', 'rows', 'total', 'snapshotToken', 'effects']); effects(data.effects);
    if (data.version !== `payroll-fixed-${resource}.v1` || data.periodMonth !== (expected.periodMonth ?? null) || !fixedHash(data.snapshotToken)
      || resource === 'export' && data.snapshotToken !== expected.snapshotToken || !Array.isArray(data.rows) || data.rows.length > 500 || data.total !== data.rows.length) fixedFail('CONTRACT_DRIFT');
    const seen = new Set();
    for (const row of data.rows) {
      if (resource === 'list') record(row);
      else {
        exact(row, ['recordId', 'version', 'proposalId', 'subject', 'values']); subject(row.subject); validateValues(row.values);
        if (!fixedUuid(row.recordId) || !fixedUuid(row.proposalId) || !integer(row.version) || row.version < 2) fixedFail('CONTRACT_DRIFT');
      }
      const id = resource === 'list' ? row.id : row.recordId;
      if (seen.has(id)) fixedFail('CONTRACT_DRIFT'); seen.add(id);
    }
  } else if (resource === 'junin638') {
    exact(data,['version','periodMonth','snapshotToken','concept','receiver','sourceFormat','format','rows','total','effects']); effects(data.effects);
    exact(data.sourceFormat,['id','name','filename','dniStart','dniLength','amountStart','amountLength']); exact(data.format,['recordBytes','lineEnding','trailingLineEnding']);
    if(data.version!=='payroll-fixed-junin638.v1'||data.periodMonth!==expected.periodMonth||data.snapshotToken!==expected.snapshotToken
      ||data.concept!=='638'||data.receiver!=='AMARU'||data.sourceFormat.id!==1||data.sourceFormat.name!=='Formato Junin'||data.sourceFormat.filename!=='amaru.txt'
      ||data.sourceFormat.dniStart!==5||data.sourceFormat.dniLength!==8||data.sourceFormat.amountStart!==44||data.sourceFormat.amountLength!==11||data.format.recordBytes!==55
      ||data.format.lineEnding!=='CRLF'||data.format.trailingLineEnding!==false||!Array.isArray(data.rows)||data.rows.length>500||data.total!==data.rows.length) fixedFail('CONTRACT_DRIFT');
    const seen=new Set();
    for(const row of data.rows){
      exact(row,['recordId','version','proposalId','contractId','dni','amountCents']);
      if(!fixedUuid(row.recordId)||!integer(row.version)||row.version<2||!fixedUuid(row.proposalId)||!contract(row.contractId)||seen.has(row.recordId)
        ||typeof row.dni!=='string'||!/^\d{5,8}$/.test(row.dni)||/^0+$/.test(row.dni)||typeof row.amountCents!=='string'||!/^\d+$/.test(row.amountCents)||BigInt(row.amountCents)>9999999999n) fixedFail('CONTRACT_DRIFT');
      seen.add(row.recordId);
    }
  } else if (resource === 'detail') {
    exact(data, ['version', 'record', 'history']); record(data.record);
    if (data.version !== 'payroll-fixed-detail.v1' || data.record.id !== expected.recordId || !Array.isArray(data.history) || data.history.length < 1 || data.history.length > 100) fixedFail('CONTRACT_DRIFT');
    const ids = new Set(); let previous = Infinity;
    for (const item of data.history) { proposal(item, data.record.id); if (ids.has(item.id) || item.version >= previous) fixedFail('CONTRACT_DRIFT'); ids.add(item.id); previous = item.version; }
    if (data.history.some((item, index) => item.version !== (data.history.length - index) * 2 - 1)
      || canonical(data.history[0]) !== canonical(data.record.latest) || data.history.length !== Math.ceil(data.record.version / 2)
      || data.record.approved && !ids.has(data.record.approved.id) || data.record.pending && !ids.has(data.record.pending.id)) fixedFail('CONTRACT_DRIFT');
    if (data.record.approved && canonical(data.history.find(item => item.id === data.record.approved.id)) !== canonical(data.record.approved)
      || !data.record.identityCurrent && data.history.some(item => item.canReview)) fixedFail('CONTRACT_DRIFT');
  } else {
    exact(data, ['version', 'command', 'recordId', 'proposalId', 'recordVersion', 'duplicate']);
    if (data.version !== 'payroll-fixed-receipt.v1' || data.command !== expected.command || !fixedUuid(data.recordId) || !fixedUuid(data.proposalId)
      || !integer(data.recordVersion) || data.recordVersion < 1 || typeof data.duplicate !== 'boolean' || resource === 'attempt' && !data.duplicate
      || expected.recordId && data.recordId !== expected.recordId || expected.proposalId && data.proposalId !== expected.proposalId
      || expected.expectedVersion !== undefined && data.recordVersion !== expected.expectedVersion + 1) fixedFail('CONTRACT_DRIFT');
  }
  return data;
}
export async function fixedCall(sql, principal, session, resource, args = {}) {
  const ctx = fixedContext(principal, session);
  const definitions = { bootstrap: [], employee: args.contractId ? [['contractId', 'uuid']] : [['legajo', 'text']], list: [['periodMonth', 'date']], detail: [['recordId', 'uuid']],
    attempt: [['command', 'text'], ['key', 'uuid']], export: [['periodMonth', 'date'], ['snapshotToken', 'text']], junin638: [['periodMonth', 'date'], ['snapshotToken', 'text']],
    propose: [['payload', 'jsonb'], ['key', 'uuid']], review: [['payload', 'jsonb'], ['key', 'uuid']] };
  if (!Object.hasOwn(definitions, resource)) fixedFail('QUERY_INVALID');
  const fields = definitions[resource], values = [JSON.stringify(ctx), ...fields.map(([key, type]) => args[key] === undefined ? null : type === 'jsonb' ? JSON.stringify(args[key]) : args[key])];
  try {
    const facade=resource==='employee'&&args.contractId?'employee_by_contract':resource;
    const response = await sql.query(`SELECT public.payroll_fixed_registry_${facade}_v1($1::jsonb${fields.map(([, type], i) => `,$${i + 2}::${type}`).join('')}) AS result`, values);
    const rows = Array.isArray(response) ? response : response?.rows;
    if (!Array.isArray(rows) || rows.length !== 1) fixedFail('CONTRACT_DRIFT');
    return validateFixedResponse(rows[0]?.result, resource, { ...ctx, ...args, ...args.payload, command: ['propose', 'review'].includes(resource) ? resource : args.command });
  } catch (error) { throw fixedSafeError(error); }
}
