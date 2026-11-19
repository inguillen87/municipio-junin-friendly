// Declaración municipal de vigencia de área para contratos adoptados (migración 244).
// El navegador y el servidor comparten estas validaciones. Ninguna respuesta trae contratos,
// legajos ni nombres de agentes: sólo fechas, referencias, totales por área y huellas.
export const AREA_EFFECTIVITY_VERSION = 'attendance-area-effectivity.v1';
export const AREA_EFFECTIVITY_RECEIPT_VERSION = 'attendance-area-effectivity-receipt.v1';
export const AREA_EFFECTIVITY_PROPOSE = 'employee.record.propose';
export const AREA_EFFECTIVITY_APPROVE = 'employee.record.approve';
export const AREA_EFFECTIVITY_CAPABILITIES = Object.freeze([AREA_EFFECTIVITY_PROPOSE, AREA_EFFECTIVITY_APPROVE]);
export const AREA_EFFECTIVITY_MAX_BYTES = 8192;
// missing: sólo los contratos sin declaración vigente. all: todos los que están en condiciones (reemplaza la fecha de cada uno).
export const AREA_EFFECTIVITY_SCOPES = Object.freeze(['all', 'missing']);
export const AREA_EFFECTIVITY_EXCLUSIONS = Object.freeze(['areaIncomplete', 'nativeRegistration', 'notActive', 'unproven', 'withdrawn']);

export class AreaEffectivityError extends Error {
  constructor(code, message, status = 422) {
    super(message); this.name = 'AreaEffectivityError'; this.code = 'ATTENDANCE_AREA_EFFECTIVITY_' + code; this.status = status;
  }
}
const need = (ok, message = 'Revisá la fecha, la referencia y la decisión.', code = 'INPUT_INVALID', status = 422) => {
  if (!ok) throw new AreaEffectivityError(code, message, status);
};
export const areaEffectivityExact = (v, keys, optional = []) => !!v && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v)) && keys.every(k => Object.hasOwn(v, k))
  && Reflect.ownKeys(v).every(k => typeof k === 'string' && [...keys, ...optional].includes(k));
const fullMatch = (pattern, v) => typeof v === 'string' && pattern.exec(v)?.[0] === v;
export const areaEffectivityUuid = v => fullMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, v) && v !== '00000000-0000-0000-0000-000000000000';
// La base exige claves de pedido UUID versión 4.
export const areaEffectivityKey = v => fullMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/, v);
export const areaEffectivitySha = v => fullMatch(/^[a-f0-9]{64}$/, v);
const sourceId = v => fullMatch(/^(0|[1-9][0-9]{0,18})$/, v);
const count = (v, max = 5000) => Number.isSafeInteger(v) && v >= 0 && v <= max;
export const areaEffectivityText = (v, min, max) => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC')
  && v.length >= min && v.length <= max && !/[<>\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
export function areaEffectivityDay(v) {
  if (typeof v !== 'string' || !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00.000Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const instant = v => typeof v === 'string' && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const email = v => typeof v === 'string' && v.length <= 254 && v === v.toLowerCase().trim() && /^[^\s@<>]+@[^\s@<>]+$/.test(v);

/** propose: alcance, fecha desde la que rige, referencia documental y la huella de la vista previa que la persona vio. */
export function validateAreaEffectivityCommand(body, {today = null} = {}) {
  if (body?.action === 'propose') {
    need(areaEffectivityExact(body, ['action', 'authorizationReference', 'effectiveFrom', 'previewVersion', 'scope']));
    need(AREA_EFFECTIVITY_SCOPES.includes(body.scope), 'Elegí qué contratos incluye la declaración.');
    need(areaEffectivityDay(body.effectiveFrom), 'Indicá una fecha válida desde la que rige la declaración.');
    need(today === null || body.effectiveFrom <= today, 'La fecha desde la que rige no puede ser futura.', 'DATE_INVALID');
    need(areaEffectivityText(body.authorizationReference, 10, 500), 'Indicá la referencia documental que respalda la declaración (entre 10 y 500 caracteres).');
    need(areaEffectivitySha(body.previewVersion), 'Actualizá la vista previa antes de preparar la declaración.');
    return {action: 'propose', authorizationReference: body.authorizationReference, effectiveFrom: body.effectiveFrom, previewVersion: body.previewVersion, scope: body.scope};
  }
  need(body?.action === 'review' && areaEffectivityExact(body, ['action', 'decision', 'proposalId', 'proposalVersion', 'reason']));
  need(body.decision === 'approve' || body.decision === 'reject');
  need(areaEffectivityUuid(body.proposalId) && areaEffectivitySha(body.proposalVersion), 'Actualizá la declaración antes de decidir.');
  need(areaEffectivityText(body.reason, 10, 1000), 'Escribí el motivo de la decisión (entre 10 y 1000 caracteres).');
  return {action: 'review', decision: body.decision, proposalId: body.proposalId, proposalVersion: body.proposalVersion, reason: body.reason};
}
/** La capacidad mínima que el servidor exige antes de abrir una conexión. La base vuelve a decidir. */
export function areaEffectivityCommandCapabilities(command) {
  return command.action === 'propose' ? [AREA_EFFECTIVITY_PROPOSE] : command.decision === 'approve' ? [AREA_EFFECTIVITY_APPROVE] : AREA_EFFECTIVITY_CAPABILITIES;
}

const bad = () => need(false, 'La respuesta no coincide con el contrato esperado. No se mostraron datos sin verificar.', 'RESPONSE_INVALID', 503);
function principal(v) {
  if (!areaEffectivityExact(v, ['tenantId', 'membershipId', 'sessionId', 'sessionVersion']) || !areaEffectivityUuid(v.tenantId)
    || !areaEffectivityUuid(v.membershipId) || !areaEffectivityUuid(v.sessionId) || !Number.isSafeInteger(v.sessionVersion) || v.sessionVersion < 1) bad();
  return v;
}
function excluded(v) {
  if (!areaEffectivityExact(v, AREA_EFFECTIVITY_EXCLUSIONS) || !AREA_EFFECTIVITY_EXCLUSIONS.every(k => count(v[k]))) bad();
  return v;
}
function areas(list, total) {
  if (!Array.isArray(list) || list.length > 2000) bad();
  const seen = new Set(); let sum = 0;
  for (const a of list) {
    if (!areaEffectivityExact(a, ['organizationUnitSourceId', 'sectorSourceId', 'areaLabel', 'contracts']) || !sourceId(a.organizationUnitSourceId)
      || !(a.sectorSourceId === null || sourceId(a.sectorSourceId)) || !areaEffectivityText(a.areaLabel, 1, 400) || !count(a.contracts) || a.contracts < 1) bad();
    const key = JSON.stringify([a.organizationUnitSourceId, a.sectorSourceId, a.areaLabel]);
    if (seen.has(key)) bad();
    seen.add(key); sum += a.contracts;
  }
  if (sum !== total) bad();
  return list;
}
const RECORD_KEYS = ['id', 'version', 'status', 'effectiveFrom', 'scope', 'authorizationReference', 'itemCount', 'excluded', 'proposedBy', 'proposedAt',
  'ownProposal', 'reviewedBy', 'reviewedAt', 'reviewReason', 'contractsInForce'];
function record(v, {withAreas = false} = {}) {
  if (!areaEffectivityExact(v, withAreas ? [...RECORD_KEYS, 'areas', 'stale'] : RECORD_KEYS) || !areaEffectivityUuid(v.id) || !areaEffectivitySha(v.version)
    || !['proposed', 'approved', 'rejected'].includes(v.status) || !areaEffectivityDay(v.effectiveFrom) || !AREA_EFFECTIVITY_SCOPES.includes(v.scope) || !areaEffectivityText(v.authorizationReference, 10, 500)
    || !count(v.itemCount) || v.itemCount < 1 || !email(v.proposedBy) || !instant(v.proposedAt) || typeof v.ownProposal !== 'boolean'
    || !count(v.contractsInForce) || v.contractsInForce > v.itemCount) bad();
  excluded(v.excluded);
  const decided = v.status !== 'proposed';
  if (decided ? !(email(v.reviewedBy) && instant(v.reviewedAt) && areaEffectivityText(v.reviewReason, 10, 1000))
    : !(v.reviewedBy === null && v.reviewedAt === null && v.reviewReason === null)) bad();
  if (v.status !== 'approved' && v.contractsInForce !== 0) bad();
  if (withAreas) { if (v.status !== 'proposed' || typeof v.stale !== 'boolean') bad(); areas(v.areas, v.itemCount); }
  return v;
}
/** resource: 'state' (lectura) o 'receipt' (respuesta de preparar o decidir). */
export function validateAreaEffectivityResponse(v, {resource = 'state', command = null} = {}) {
  if (resource === 'receipt') {
    if (!areaEffectivityExact(v, ['version', 'principal', 'action', 'replayed', 'declaration']) || v.version !== AREA_EFFECTIVITY_RECEIPT_VERSION
      || !['propose', 'review'].includes(v.action) || typeof v.replayed !== 'boolean') bad();
    principal(v.principal); record(v.declaration);
    if (command) {
      if (v.action !== command.action) bad();
      if (command.action === 'propose' && (v.declaration.effectiveFrom !== command.effectiveFrom || v.declaration.scope !== command.scope
        || v.declaration.authorizationReference !== command.authorizationReference)) bad();
      if (command.action === 'review' && (v.declaration.id !== command.proposalId || v.declaration.version !== command.proposalVersion
        || v.declaration.status !== (command.decision === 'approve' ? 'approved' : 'rejected'))) bad();
    }
    return v;
  }
  if (!areaEffectivityExact(v, ['version', 'principal', 'today', 'permissions', 'preview', 'pending', 'history', 'declaredContracts'])
    || v.version !== AREA_EFFECTIVITY_VERSION || !areaEffectivityDay(v.today) || !count(v.declaredContracts)
    || !areaEffectivityExact(v.permissions, ['canPropose', 'canReview']) || typeof v.permissions.canPropose !== 'boolean' || typeof v.permissions.canReview !== 'boolean'
    || !areaEffectivityExact(v.preview, ['excluded', 'scopes']) || !areaEffectivityExact(v.preview.scopes, AREA_EFFECTIVITY_SCOPES)
    || !Array.isArray(v.history) || v.history.length > 20) bad();
  principal(v.principal); excluded(v.preview.excluded);
  for (const name of AREA_EFFECTIVITY_SCOPES) {
    const scope = v.preview.scopes[name];
    if (!areaEffectivityExact(scope, ['eligible', 'areas', 'version']) || !count(scope.eligible) || !areaEffectivitySha(scope.version)) bad();
    areas(scope.areas, scope.eligible);
  }
  // «missing» es exactamente lo que está en condiciones y todavía no tiene una declaración vigente.
  if (v.preview.scopes.missing.eligible + v.declaredContracts !== v.preview.scopes.all.eligible) bad();
  if (v.pending !== null) record(v.pending, {withAreas: true});
  v.history.forEach(item => { record(item); if (item.status === 'proposed') bad(); });
  if (new Set([...v.history.map(item => item.id), ...(v.pending ? [v.pending.id] : [])]).size !== v.history.length + (v.pending ? 1 : 0)) bad();
  return v;
}
