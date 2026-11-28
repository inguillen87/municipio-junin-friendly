import {parseScopedPrivateJson} from './private-json-body.js';
import {hasEffectivePlatformOwnerContext} from './internal-platform-owner-policy.js';
import {expectedDevicesUuid as uuid} from '../assets/attendance-expected-devices-model.js';
import {
  AreaScopeAdminError, AREA_SCOPE_ADMIN_READ_AUTHORITY, AREA_SCOPE_ADMIN_WRITE_AUTHORITY, areaScopeKeyV4,
  validateAreaScopeQuery, validateAreaScopeCommand, validateAreaScopeReadResponse, validateAreaScopeCommandResponse,
} from '../assets/attendance-area-scopes-model.js';

export const AREA_SCOPE_ADMIN_READ_SQL = 'SELECT public.attendance_area_scope_admin_read_v1($1::jsonb,$2::jsonb)::text AS result';
export const AREA_SCOPE_ADMIN_COMMAND_SQL = 'SELECT public.attendance_area_scope_admin_command_v1($1::jsonb,$2::jsonb,$3::uuid)::text AS result';

export function areaScopeAdminFail(code, status, message) { throw new AreaScopeAdminError(code, message, status); }

// Each stable code PostgreSQL raises (migration 243 and the platform session checks it reuses) and the safe
// answer it becomes. Longer codes come first: the list is searched in order.
const KNOWN = Object.freeze([
  ['ATTENDANCE_AREA_SCOPE_SESSION_INVALID', 'SESSION_INVALID', 401, 'La sesión de administración ya no es válida. Ingresá de nuevo.'],
  ['TENANT_IAM_SESSION_INVALID', 'SESSION_INVALID', 401, 'La sesión de administración ya no es válida. Ingresá de nuevo.'],
  ['ATTENDANCE_AREA_SCOPE_SELF_ASSIGNMENT', 'SELF_ASSIGNMENT', 403, 'No podés conceder ni retirar áreas de tu propia cuenta. Tiene que hacerlo otra persona administradora.'],
  ['TENANT_LIFECYCLE_PLATFORM_CAPABILITY_REQUIRED', 'FORBIDDEN', 403, 'Tu cuenta no tiene permiso para administrar las áreas de asistencia.'],
  ['TENANT_IAM_NOT_AUTHORIZED', 'FORBIDDEN', 403, 'Tu cuenta no tiene permiso para administrar las áreas de asistencia.'],
  ['ATTENDANCE_AREA_SCOPE_TENANT_NOT_READY', 'TENANT_NOT_READY', 409, 'El municipio todavía no tiene su fuente de datos certificada para esta versión. No se puede administrar sus áreas.'],
  ['ATTENDANCE_AREA_SCOPE_STALE', 'STALE', 409, 'Las áreas o el catálogo cambiaron desde tu última consulta. Actualizá la lista y revisá antes de volver a intentar.'],
  ['ATTENDANCE_AREA_SCOPE_IDEMPOTENCY_REUSED', 'ATTEMPT_CONFLICT', 409, 'La clave de este envío ya se usó para otra operación. Actualizá la lista antes de continuar.'],
  ['tenant_iam_event_actor_idempotency_uk', 'ATTEMPT_CONFLICT', 409, 'La clave de este envío ya se usó para otra operación. Actualizá la lista antes de continuar.'],
  ['ATTENDANCE_AREA_SCOPE_MEMBERSHIP_NOT_FOUND', 'MEMBERSHIP_NOT_FOUND', 404, 'No se encontró esa cuenta dentro del municipio seleccionado.'],
  ['ATTENDANCE_AREA_SCOPE_MEMBERSHIP_NOT_ACTIVE', 'MEMBERSHIP_NOT_ACTIVE', 409, 'La cuenta no está activa. Sólo se le pueden retirar áreas.'],
  ['ATTENDANCE_AREA_SCOPE_AREA_NOT_IN_CATALOG', 'AREA_NOT_IN_CATALOG', 409, 'El área elegida no figura en el catálogo aprobado del municipio. Actualizá la lista y elegí otra.'],
  ['ATTENDANCE_AREA_SCOPE_CATALOG_UNAVAILABLE', 'CATALOG_UNAVAILABLE', 409, 'El catálogo de reparticiones y sectores no está disponible. No se puede administrar áreas hasta recuperarlo.'],
  ['NATIVE_EMPLOYEE_CATALOG_UNAVAILABLE', 'CATALOG_UNAVAILABLE', 409, 'El catálogo de reparticiones y sectores no está disponible. No se puede administrar áreas hasta recuperarlo.'],
  ['ATTENDANCE_AREA_SCOPE_CAPABILITY_INVALID', 'INPUT_INVALID', 422, 'El permiso elegido no es uno de los de asistencia por área.'],
  ['ATTENDANCE_AREA_SCOPE_REFERENCE_INVALID', 'INPUT_INVALID', 422, 'La referencia de autorización debe tener entre 10 y 500 caracteres, en una sola línea y sin símbolos de control.'],
  ['ATTENDANCE_AREA_SCOPE_COMMAND_INVALID', 'INPUT_INVALID', 422, 'Revisá la cuenta, el permiso, el área y la referencia de autorización.'],
  ['ATTENDANCE_AREA_SCOPE_QUERY_INVALID', 'QUERY_INVALID', 400, 'La consulta necesita un municipio seleccionado.'],
  ['ATTENDANCE_AREA_SCOPE_NOT_FOUND', 'NOT_FOUND', 404, 'Esa cuenta no tiene registrada esa área. Actualizá la lista.'],
  ['ATTENDANCE_AREA_SCOPE_VERSION_CONFLICT', 'CONFLICT', 409, 'Otra operación cambió esa área al mismo tiempo. Actualizá la lista y revisá.'],
  ['attendance_area_scope_identity_v1', 'CONFLICT', 409, 'Otra operación cambió esa área al mismo tiempo. Actualizá la lista y revisá.'],
  ['ATTENDANCE_AREA_SCOPE_LIMIT', 'LIMIT', 413, 'El municipio supera el límite técnico de esta pantalla. No se devolvió una lista recortada.'],
  ['ATTENDANCE_AREA_SCOPE_BUSY', 'BUSY', 409, 'Hay otra operación en curso sobre las áreas o el catálogo. Probá de nuevo en unos segundos.'],
]);
const BUSY = Object.freeze(['55P03', '40001', '40P01']);

export function areaScopeAdminSafeError(e) {
  if (e instanceof AreaScopeAdminError) return e;
  const source = String(e?.code ?? '') + ' ' + String(e?.message ?? '');
  const match = KNOWN.find(([needle]) => source.includes(needle));
  if (match) return new AreaScopeAdminError(match[1], match[3], match[2]);
  if (BUSY.includes(String(e?.code ?? ''))) return new AreaScopeAdminError('BUSY', 'Hay otra operación en curso sobre las áreas o el catálogo. Probá de nuevo en unos segundos.', 409);
  // Anything else (including a function that is not installed yet) stays closed and tells nothing about SQL.
  return new AreaScopeAdminError('UNAVAILABLE', 'La administración de áreas de asistencia no está disponible o todavía no fue habilitada. No se confirmó ningún cambio.', 503);
}

/**
 * The actor is a platform administrator in platform context. Authority and session are checked here before
 * any SQL (and before a request body is read) and again by PostgreSQL in every call.
 */
export function areaScopeAdminActor(principal, session, releaseSha, authority = AREA_SCOPE_ADMIN_READ_AUTHORITY) {
  if (!hasEffectivePlatformOwnerContext(principal, authority))
    areaScopeAdminFail('FORBIDDEN', 403, 'Tu cuenta no tiene permiso para administrar las áreas de asistencia.');
  const email = typeof session?.email === 'string' ? session.email.trim().toLowerCase() : '';
  const id = typeof session?.id === 'string' ? session.id.trim().toLowerCase() : '';
  if (email.length < 3 || email.length > 320 || typeof principal?.user?.email !== 'string' || principal.user.email.trim().toLowerCase() !== email
    || !uuid(id) || !Number.isSafeInteger(session?.version) || session.version < 1 || session.version > 999999999)
    areaScopeAdminFail('SESSION_INVALID', 401, 'La sesión de administración ya no es válida. Ingresá de nuevo.');
  if (typeof releaseSha !== 'string' || !/^[a-f0-9]{40}$/.test(releaseSha))
    areaScopeAdminFail('UNAVAILABLE', 503, 'El contrato de datos activo no está certificado. No se consultó ni cambió ningún dato.');
  return {actorEmail: email, actorSessionId: id, actorSessionVersion: session.version, releaseSha};
}
/** The municipality is the one being administered, named by the request and decided by PostgreSQL; never a session scope. */
export function areaScopeAdminContext(principal, session, tenantId, releaseSha, authority = AREA_SCOPE_ADMIN_READ_AUTHORITY) {
  const actor = areaScopeAdminActor(principal, session, releaseSha, authority);
  if (!uuid(tenantId)) areaScopeAdminFail('QUERY_INVALID', 400, 'La consulta necesita un municipio seleccionado.');
  return {...actor, tenantId};
}

function single(rows) {
  const values = Array.isArray(rows) ? rows : rows?.rows;
  if (!Array.isArray(values) || values.length !== 1 || typeof values[0]?.result !== 'string')
    areaScopeAdminFail('RESPONSE_INVALID', 503, 'No se recibió una respuesta única verificable. No se mostraron datos.');
  if (Buffer.byteLength(values[0].result) > 4 * 1024 * 1024)
    areaScopeAdminFail('LIMIT', 413, 'La lectura supera el límite técnico. No se devolvió una lista recortada.');
  try { return parseScopedPrivateJson(values[0].result, {maxDepth: 6}); }
  catch { return areaScopeAdminFail('RESPONSE_INVALID', 503, 'La respuesta es ambigua o incompleta. No se mostraron datos.'); }
}

export async function areaScopeAdminRead(sql, principal, session, query, {releaseSha} = {}) {
  try {
    const q = validateAreaScopeQuery(query);
    const ctx = areaScopeAdminContext(principal, session, q.tenantId, releaseSha, AREA_SCOPE_ADMIN_READ_AUTHORITY);
    const rows = await sql.query(AREA_SCOPE_ADMIN_READ_SQL, [JSON.stringify(ctx), JSON.stringify({resource: q.resource})]);
    return validateAreaScopeReadResponse(single(rows), {tenantId: ctx.tenantId});
  } catch (e) { throw areaScopeAdminSafeError(e); }
}

export async function areaScopeAdminWrite(sql, principal, session, tenantId, body, key, {releaseSha} = {}) {
  try {
    const command = validateAreaScopeCommand(body);
    if (!areaScopeKeyV4(key)) areaScopeAdminFail('KEY_REQUIRED', 428, 'La operación necesita una clave de envío válida.');
    const ctx = areaScopeAdminContext(principal, session, tenantId, releaseSha, AREA_SCOPE_ADMIN_WRITE_AUTHORITY);
    const rows = await sql.query(AREA_SCOPE_ADMIN_COMMAND_SQL, [JSON.stringify(ctx), JSON.stringify(command), key]);
    return validateAreaScopeCommandResponse(single(rows), {tenantId: ctx.tenantId, command});
  } catch (e) { throw areaScopeAdminSafeError(e); }
}
