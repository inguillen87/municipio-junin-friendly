import {employeeContext} from './internal-native-employees.js';
import {principalHasCapabilities} from './internal-resource-access.js';
import {parseScopedPrivateJson} from './private-json-body.js';
import {
  ExpectedDevicesError, EXPECTED_DEVICES_READ, expectedDevicesUuid,
  validateExpectedDevicesQuery, validateExpectedDevicesCommand, validateExpectedDevicesResponse, expectedDevicesCommandCapability,
} from '../assets/attendance-expected-devices-model.js';

export function expectedDevicesFail(code, status, message) { throw new ExpectedDevicesError(code, message, status); }
export function expectedDevicesSafeError(e) {
  if (e instanceof ExpectedDevicesError) return e;
  const source = String(e?.code ?? '') + ' ' + String(e?.message ?? '');
  const known = [
    [/SESSION_INVALID|SESSION_EXPIRED/, 'SESSION_INVALID', 401, 'La sesión operativa ya no es válida. Conservá el intento para consultar con el acceso original.'],
    [/MAKER_CHECKER|INDEPENDENT_REQUIRED/, 'INDEPENDENT_REQUIRED', 403, 'La decisión debe hacerla otra persona con aprobación para esta área.'],
    [/ACTOR_INVALID|EMPLOYMENT_REQUIRED|ACTOR_REQUIRED/, 'ACTOR_REQUIRED', 403, 'Falta el vínculo verificado de la persona que opera.'],
    [/CAPABILITY_REQUIRED|AUTHORITY_REQUIRED|SOD_CONFLICT|FORBIDDEN|SCOPE_DENIED|AREA_DENIED/, 'FORBIDDEN', 403, 'Tu cuenta no tiene permiso para esta operación en el área.'],
    [/SCOPE_CHANGED|RELEASE_NOT_CERTIFIED|BINDING_REQUIRED|BINDING_CHANGED/, 'SCOPE_CHANGED', 409, 'Cambió la sesión, el ámbito o la fuente. Actualizá la lectura antes de preparar otro intento.'],
    [/IDEMPOTENCY_REUSE(?:D)?|ATTEMPT_CONFLICT/, 'ATTEMPT_CONFLICT', 409, 'La clave corresponde a otro contenido. Conservá el intento original.'],
    [/VERSION_CONFLICT|VERSION_CHANGED|SOURCE_CHANGED|SUBJECT_CHANGED|PROPOSAL_CHANGED|CATALOG_CHANGED/, 'VERSION_CONFLICT', 409, 'Cambió la declaración o su fuente. Volvé a consultar el detalle.'],
    [/NOT_FOUND/, 'NOT_FOUND', 404, 'No se encontró la declaración dentro de tu acceso.'],
    [/OVERLAP/, 'OVERLAP', 409, 'La vigencia se superpone con otra declaración aprobada. Revisá los tramos.'],
    [/HISTORY_.*REQUIRED|HISTORY_.*BLOCKED|HISTORY_UNRESOLVED|SUBJECT_INVALID|SUBJECT_BLOCKED|SOURCE_INVALID|DEVICE_INVALID/, 'SOURCE_BLOCKED', 409, 'Falta una fuente verificada de contrato, área, vigencia o dispositivos. La operación quedó bloqueada.'],
    [/STATE_INVALID|TRANSITION_INVALID/, 'STATE_INVALID', 409, 'La declaración ya no admite esa decisión. Actualizá su detalle.'],
    [/INPUT_INVALID|QUERY_INVALID/, 'INPUT_INVALID', 422, 'Revisá la operación, las fechas y los datos declarados.'],
    [/ATTENDANCE_EXPECTED_DEVICES_CONFLICT|23505/, 'CONFLICT', 409, 'Otra decisión ocupó la misma declaración. Volvé a consultar su versión actual.'],
    [/BUSY|55P03|40001|40P01/, 'BUSY', 409, 'Hay otra operación en curso. Conservá el mismo contenido y la misma clave.'],
  ];
  const match = known.find(([pattern]) => pattern.test(source));
  return match ? new ExpectedDevicesError(match[1], match[3], match[2])
    : new ExpectedDevicesError('UNAVAILABLE', 'La fuente del padrón no está disponible o todavía no fue instalada. No se confirmó ningún cambio; conservá el intento.', 503);
}
export function expectedDevicesContext(principal, session) {
  if (!principalHasCapabilities(principal, [EXPECTED_DEVICES_READ])) expectedDevicesFail('FORBIDDEN', 403, 'Tu cuenta no tiene lectura de asistencia por área.');
  if (!session?.releaseSha || session.releaseSha !== principal?.tenant?.certifiedReleaseSha)
    expectedDevicesFail('SESSION_INVALID', 401, 'La sesión no corresponde a la versión certificada del ámbito municipal.');
  try { return employeeContext(principal, session); } catch (e) { throw expectedDevicesSafeError(e); }
}
function result(rows, ctx, options) {
  const values = Array.isArray(rows) ? rows : rows?.rows;
  if (!Array.isArray(values) || values.length !== 1 || typeof values[0]?.result !== 'string') expectedDevicesFail('RESPONSE_INVALID', 503, 'No se recibió una respuesta única verificable. Conservá el intento.');
  if (Buffer.byteLength(values[0].result) > 4 * 1024 * 1024) expectedDevicesFail('LIMIT', 413, 'La lectura supera el límite técnico. Reducí el tamaño de la página; no se devolvió un recorte.');
  let parsed;
  try { parsed = parseScopedPrivateJson(values[0].result, {maxDepth: 12}); }
  catch { expectedDevicesFail('RESPONSE_INVALID', 503, 'La respuesta del padrón es ambigua o incompleta. Conservá el intento.'); }
  const data = validateExpectedDevicesResponse(parsed, options), p = data.principal;
  if (p.tenantId !== ctx.tenantId || p.membershipId !== ctx.membershipId || p.sessionId !== ctx.actorSessionId || p.sessionVersion !== ctx.actorSessionVersion)
    expectedDevicesFail('RESPONSE_INVALID', 503, 'La lectura corresponde a otro contexto. Volvé a abrir el padrón.');
  return data;
}
export async function expectedDevicesRead(sql, principal, session, query) {
  try {
    const ctx = expectedDevicesContext(principal, session), q = validateExpectedDevicesQuery(query);
    const rows = await sql.query('SELECT public.attendance_expected_devices_read_v1($1::jsonb,$2::jsonb)::text AS result', [JSON.stringify(ctx), JSON.stringify(q)]);
    return result(rows, ctx, {resource: q.resource, query: q, ...(q.resource === 'attempt' ? {attemptKey: q.key} : {})});
  } catch (e) { throw expectedDevicesSafeError(e); }
}
export async function expectedDevicesWrite(sql, principal, session, body, key) {
  try {
    const ctx = expectedDevicesContext(principal, session), b = validateExpectedDevicesCommand(body);
    if (!expectedDevicesUuid(key)) expectedDevicesFail('KEY_REQUIRED', 428, 'La operación necesita una clave de intento válida.');
    if (!principalHasCapabilities(principal, [expectedDevicesCommandCapability(b.command)])) expectedDevicesFail('FORBIDDEN', 403, 'Tu cuenta no permite esta operación.');
    const rows = await sql.query('SELECT public.attendance_expected_devices_command_v1($1::jsonb,$2::jsonb,$3::uuid)::text AS result', [JSON.stringify(ctx), JSON.stringify(b), key]);
    return result(rows, ctx, {resource: 'command', command: b, attemptKey: key});
  } catch (e) { throw expectedDevicesSafeError(e); }
}
