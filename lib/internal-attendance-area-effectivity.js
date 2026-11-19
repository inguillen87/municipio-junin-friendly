import {employeeContext} from './internal-native-employees.js';
import {principalHasCapabilities} from './internal-resource-access.js';
import {parseScopedPrivateJson} from './private-json-body.js';
import {
  AreaEffectivityError, AREA_EFFECTIVITY_CAPABILITIES, areaEffectivityKey, areaEffectivityCommandCapabilities,
  validateAreaEffectivityCommand, validateAreaEffectivityResponse,
} from '../assets/attendance-area-effectivity-model.js';

export function areaEffectivityFail(code, status, message) { throw new AreaEffectivityError(code, message, status); }
export function areaEffectivitySafeError(e) {
  if (e instanceof AreaEffectivityError) return e;
  const source = String(e?.code ?? '') + ' ' + String(e?.message ?? '');
  const known = [
    [/SESSION_INVALID|SESSION_EXPIRED/, 'SESSION_INVALID', 401, 'La sesión operativa ya no es válida. Ingresá de nuevo y consultá el estado antes de repetir.'],
    [/SAME_ACTOR|REVIEW_INVALID/, 'INDEPENDENT_REQUIRED', 403, 'La aprobación debe hacerla otra persona, distinta de quien preparó la declaración.'],
    [/ACTOR_REQUIRED|EMPLOYMENT_REQUIRED/, 'ACTOR_REQUIRED', 403, 'Falta el vínculo verificado entre tu cuenta y tu relación laboral.'],
    [/CAPABILITY_REQUIRED|SOD_CONFLICT|FORBIDDEN/, 'FORBIDDEN', 403, 'Tu cuenta no tiene permiso para esta operación.'],
    [/RELEASE_NOT_CERTIFIED|BINDING_REQUIRED/, 'SCOPE_CHANGED', 409, 'Cambió la sesión, el ámbito o la fuente. Actualizá la lectura antes de repetir.'],
    [/IDEMPOTENCY_CONFLICT/, 'ATTEMPT_CONFLICT', 409, 'La clave de envío corresponde a otro contenido. Actualizá el estado antes de repetir.'],
    [/PENDING_EXISTS/, 'PENDING_EXISTS', 409, 'Ya hay una declaración esperando decisión. Hay que aprobarla o rechazarla antes de preparar otra.'],
    [/PREVIEW_CHANGED/, 'PREVIEW_CHANGED', 409, 'Los legajos cambiaron desde la vista previa. Actualizá y revisá de nuevo los totales.'],
    [/PROPOSAL_CHANGED|ALREADY_REVIEWED/, 'VERSION_CONFLICT', 409, 'La declaración cambió o ya fue decidida. Actualizá su estado.'],
    [/STALE/, 'STALE', 409, 'Algún legajo cambió después de prepararla. Rechazá esta declaración y preparala de nuevo.'],
    [/DATE_INVALID/, 'DATE_INVALID', 422, 'La fecha desde la que rige no puede ser futura.'],
    [/NOTHING_TO_DECLARE/, 'NOTHING_TO_DECLARE', 409, 'No hay contratos adoptados en condiciones de ser declarados.'],
    [/NOT_FOUND/, 'NOT_FOUND', 404, 'No se encontró la declaración dentro de tu acceso.'],
    [/ATTENDANCE_AREA_EFFECTIVITY_LIMIT/, 'LIMIT', 413, 'La cantidad de contratos supera el límite técnico de una declaración.'],
    [/INPUT_INVALID|QUERY_INVALID|ITEM_INVALID/, 'INPUT_INVALID', 422, 'Revisá la fecha, la referencia y la decisión.'],
    [/BUSY|55P03|40001|40P01/, 'BUSY', 409, 'Hay otra operación en curso sobre los legajos. Esperá un momento y repetí con el mismo contenido.'],
  ];
  const match = known.find(([pattern]) => pattern.test(source));
  return match ? new AreaEffectivityError(match[1], match[3], match[2])
    : new AreaEffectivityError('UNAVAILABLE', 'La declaración de vigencia no está disponible o todavía no fue instalada. No se confirmó ningún cambio.', 503);
}
export function areaEffectivityContext(principal, session) {
  if (!AREA_EFFECTIVITY_CAPABILITIES.some(capability => principalHasCapabilities(principal, [capability])))
    areaEffectivityFail('FORBIDDEN', 403, 'Tu cuenta no puede preparar ni revisar cambios de legajo.');
  if (!session?.releaseSha || session.releaseSha !== principal?.tenant?.certifiedReleaseSha)
    areaEffectivityFail('SESSION_INVALID', 401, 'La sesión no corresponde a la versión certificada del ámbito municipal.');
  try { return employeeContext(principal, session); } catch (e) { throw areaEffectivitySafeError(e); }
}
function result(rows, ctx, options) {
  const values = Array.isArray(rows) ? rows : rows?.rows;
  if (!Array.isArray(values) || values.length !== 1 || typeof values[0]?.result !== 'string') areaEffectivityFail('RESPONSE_INVALID', 503, 'No se recibió una respuesta única verificable.');
  if (Buffer.byteLength(values[0].result) > 1024 * 1024) areaEffectivityFail('LIMIT', 413, 'La lectura supera el límite técnico; no se devolvió un recorte.');
  let parsed;
  try { parsed = parseScopedPrivateJson(values[0].result, {maxDepth: 8}); }
  catch { areaEffectivityFail('RESPONSE_INVALID', 503, 'La respuesta es ambigua o incompleta.'); }
  const data = validateAreaEffectivityResponse(parsed, options), p = data.principal;
  if (p.tenantId !== ctx.tenantId || p.membershipId !== ctx.membershipId || p.sessionId !== ctx.actorSessionId || p.sessionVersion !== ctx.actorSessionVersion)
    areaEffectivityFail('RESPONSE_INVALID', 503, 'La lectura corresponde a otro contexto. Volvé a abrir la pantalla.');
  return data;
}
export async function areaEffectivityRead(sql, principal, session) {
  try {
    const ctx = areaEffectivityContext(principal, session);
    const rows = await sql.query('SELECT public.attendance_area_effectivity_read_v1($1::jsonb,$2::jsonb)::text AS result', [JSON.stringify(ctx), '{}']);
    return result(rows, ctx, {resource: 'state'});
  } catch (e) { throw areaEffectivitySafeError(e); }
}
export async function areaEffectivityWrite(sql, principal, session, body, key) {
  try {
    const ctx = areaEffectivityContext(principal, session), command = validateAreaEffectivityCommand(body);
    if (!areaEffectivityKey(key)) areaEffectivityFail('KEY_REQUIRED', 428, 'La operación necesita una clave de envío válida.');
    if (!areaEffectivityCommandCapabilities(command).some(capability => principalHasCapabilities(principal, [capability])))
      areaEffectivityFail('FORBIDDEN', 403, 'Tu cuenta no permite esta operación.');
    const rows = await sql.query('SELECT public.attendance_area_effectivity_command_v1($1::jsonb,$2::jsonb,$3::uuid)::text AS result', [JSON.stringify(ctx), JSON.stringify(command), key]);
    return result(rows, ctx, {resource: 'receipt', command});
  } catch (e) { throw areaEffectivitySafeError(e); }
}
