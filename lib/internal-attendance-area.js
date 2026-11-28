import {createHash} from 'node:crypto';
import {parseScopedPrivateJson} from './private-json-body.js';
import {validateContinuousWorkdaySourceV3} from './internal-attendance-workdays.js';
import {expectedDevicesContext, expectedDevicesSafeError} from './internal-attendance-expected-devices.js';
import {
  expectedDevicesExact as exact, expectedDevicesUuid as uuid, expectedDevicesSha as sha, expectedDevicesDay as day,
  expectedDevicesAreaKey as areaKey, validateExpectedDevicesPrincipal, expectedDevicesStable,
} from '../assets/attendance-expected-devices-model.js';

export const ATTENDANCE_AREA_SOURCE_VERSION = 'attendance-area-workdays.v1';
export class AttendanceAreaError extends Error {
  constructor(code, status, message) {super(message); this.name = 'AttendanceAreaError'; this.code = 'ATTENDANCE_AREA_' + code; this.status = status;}
}
export function attendanceAreaFail(code, status, message) {throw new AttendanceAreaError(code, status, message);}
const matches = (re, value) => typeof value === 'string' && re.exec(value)?.[0] === value;
const unique = (v, key = x => x) => Array.isArray(v) && Reflect.ownKeys(v).length === v.length + 1 && new Set(v.map(key)).size === v.length;
const text = (v, max) => typeof v === 'string' && v === v.trim().normalize('NFC') && v.length > 0 && v.length <= max && !/[<>\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
const codes = v => unique(v) && v.length <= 32 && v.every(c => matches(/^[A-Z][A-Z0-9_]{2,95}$/, c));
const equal = (a, b) => expectedDevicesStable(a) === expectedDevicesStable(b);
export const attendanceAreaDeviceKey = (tenantId, deviceId) => {
  if (!uuid(tenantId) || !uuid(deviceId)) attendanceAreaFail('SOURCE_INVALID', 503, 'No se pudo verificar la identidad técnica del dispositivo.');
  // Exact namespace and UUID used by the pinned v3 SQL source, not a match of
  // names, observed punches, network addresses or a GRH/native identity bridge.
  return createHash('sha256').update('clock-device-v2:' + tenantId + ':' + deviceId).digest('hex');
};
export function attendanceAreaQuery(q) {
  if (!exact(q, ['resource', 'area', 'day', 'site', 'snapshot']) || q.resource !== 'day' || !day(q.day) || q.day < '2000-01-01'
    || !matches(/^[a-z0-9][a-z0-9._-]{1,95}$/, q.site) || q.snapshot !== null && !uuid(q.snapshot))
    attendanceAreaFail('QUERY_INVALID', 400, 'La lectura necesita área, sede y día explícitos.');
  try {areaKey(q.area);} catch {attendanceAreaFail('QUERY_INVALID', 400, 'Seleccioná un área exacta autorizada.');}
  return q;
}
export function attendanceAreaSafeError(e) {
  if (e instanceof AttendanceAreaError) return e;
  const message = String(e?.code ?? '') + ' ' + String(e?.message ?? '');
  if (/CAPTURE_CHANGED/.test(message)) return new AttendanceAreaError('CAPTURE_CHANGED', 409, 'Cambió el corte de asistencia. Volvé a consultar el día.');
  if (/SOURCE_INCOMPLETE|SOURCE_CONFLICT|EVENT_DATE_UNPROVEN/.test(message)) return new AttendanceAreaError('SOURCE_BLOCKED', 409, 'La recepción o la fecha de sus eventos necesita revisión antes de reconstruir este día.');
  if (/WINDOW_TOO_LARGE/.test(message)) return new AttendanceAreaError('LIMIT', 413, 'El día supera el límite técnico de lectura; no se devolvió un recorte.');
  if (/SITE_NOT_FOUND/.test(message)) return new AttendanceAreaError('NOT_FOUND', 404, 'No se encontró la sede solicitada dentro del ámbito.');
  const safe = expectedDevicesSafeError(e);
  return new AttendanceAreaError(safe.code.replace('ATTENDANCE_EXPECTED_DEVICES_', ''), safe.status,
    safe.status === 503 ? 'La lectura de asistencia por área no está disponible o todavía no fue instalada.' : safe.message);
}

/** This validates an already server-scoped source. It never filters a global
 * payload into an area: any foreign contract or unsolicited field rejects the
 * entire response, including names, counts and proposed device expectations. */
export function validateAttendanceAreaSource(raw, query, ctx) {
  const q = attendanceAreaQuery(query);
  const check = ok => {if (!ok) attendanceAreaFail('SOURCE_INVALID', 503, 'La fuente por área no pudo verificarse. No se calcularon ausencias.');};
  try {
    check(exact(raw, ['version', 'principal', 'area', 'areaLabel', 'day', 'site', 'population', 'expectedDevices', 'workdays', 'sourceCut', 'blockerCodes', 'coverageCertified', 'installationReady', 'payrollPosted', 'NoeliaReady'])
      && raw.version === ATTENDANCE_AREA_SOURCE_VERSION && raw.coverageCertified === false && raw.installationReady === false && raw.payrollPosted === false && raw.NoeliaReady === false
      && raw.day === q.day && raw.site === q.site && areaKey(raw.area) === areaKey(q.area) && text(raw.areaLabel, 500));
    validateExpectedDevicesPrincipal(raw.principal);
    const p = raw.principal;
    if (ctx) check(p.tenantId === ctx.tenantId && p.membershipId === ctx.membershipId && p.sessionId === ctx.actorSessionId && p.sessionVersion === ctx.actorSessionVersion);
    const scope = p.areaScopes.find(s => areaKey({organizationUnitSourceId: s.organizationUnitSourceId, sectorSourceId: s.sectorSourceId}) === areaKey(raw.area));
    check(scope && scope.areaLabel === raw.areaLabel);
    const pop = raw.population;
    check(exact(pop, ['version', 'area', 'areaLabel', 'validFrom', 'validUntil', 'complete', 'blockerCodes', 'contracts'])
      && pop.version === 'attendance-area-population.v1' && areaKey(pop.area) === areaKey(raw.area) && pop.areaLabel === raw.areaLabel
      && pop.validFrom === q.day && pop.validUntil === q.day && typeof pop.complete === 'boolean' && codes(pop.blockerCodes)
      && (pop.complete ? pop.blockerCodes.length === 0 : pop.blockerCodes.length > 0) && unique(pop.contracts, c => c.id) && pop.contracts.length <= 2000);
    for (const c of pop.contracts) check(exact(c, ['id', 'label', 'subjectVersion', 'areaLabel']) && uuid(c.id) && text(c.label, 500) && sha(c.subjectVersion) && c.areaLabel === raw.areaLabel);
    const contracts = new Set(pop.contracts.map(c => c.id)), contractLabels = new Map(pop.contracts.map(c => [c.id, c.label]));
    const expected = raw.expectedDevices;
    check(exact(expected, ['version', 'complete', 'records']) && expected.version === 'attendance-area-expected-devices.v1' && typeof expected.complete === 'boolean'
      && unique(expected.records, r => r.contractId) && expected.records.length === contracts.size);
    for (const r of expected.records) {
      check(exact(r, ['version', 'contractId', 'date', 'status', 'complete', 'expectedDeviceIds', 'proposalId', 'proposalSha256', 'approvalId', 'validFrom', 'validUntil', 'retiredEffectiveFrom', 'sourceVersion', 'blockerCodes', 'coverageCertified', 'expectedDeviceKeys', 'deviceKeyNamespace'])
        && r.version === 'attendance-expected-devices-effective.v1' && contracts.has(r.contractId) && r.date === q.day && ['resolved', 'blocked'].includes(r.status)
        && r.coverageCertified === false && r.deviceKeyNamespace === 'clock-device-v2' && codes(r.blockerCodes)
        && unique(r.expectedDeviceIds) && r.expectedDeviceIds.length <= 100 && r.expectedDeviceIds.every(uuid)
        && unique(r.expectedDeviceKeys) && r.expectedDeviceKeys.length === r.expectedDeviceIds.length && r.expectedDeviceKeys.every(sha)
        && equal([...r.expectedDeviceKeys].sort(), r.expectedDeviceIds.map(d => attendanceAreaDeviceKey(p.tenantId, d)).sort()));
      if (r.status === 'resolved') check(r.complete === true && r.blockerCodes.length === 0 && r.expectedDeviceIds.length > 0
        && [r.proposalId, r.approvalId].every(uuid) && [r.proposalSha256, r.sourceVersion].every(sha)
        && day(r.validFrom) && day(r.validUntil) && r.validFrom <= q.day && q.day <= r.validUntil
        && (r.retiredEffectiveFrom === null || day(r.retiredEffectiveFrom) && q.day < r.retiredEffectiveFrom));
      else check(r.complete === false && r.blockerCodes.length > 0 && r.expectedDeviceIds.length === 0 && r.expectedDeviceKeys.length === 0
        && [r.proposalId, r.proposalSha256, r.approvalId, r.validFrom, r.validUntil, r.retiredEffectiveFrom, r.sourceVersion].every(v => v === null));
    }
    check(expected.complete === (pop.complete && expected.records.every(r => r.status === 'resolved')));
    validateContinuousWorkdaySourceV3(raw.workdays, {source: 'continuous', site: q.site, day: q.day, ...(q.snapshot ? {snapshot: q.snapshot} : {})});
    check(raw.workdays.nominalReadAllowed === true && raw.workdays.observations.length === 0);
    for (const e of raw.workdays.events) check(e.identityState === 'mapped' && contracts.has(e.contractId) && text(e.legajo, 128) && text(e.personLabel, 500)
      && contractLabels.get(e.contractId) === 'Legajo ' + e.legajo + ' · ' + e.personLabel);
    // No opaque unscoped observations or out-of-scope totals can hitch a ride.
    check(raw.workdays.context.recordCount === raw.workdays.events.length && raw.workdays.context.eventCount === raw.workdays.events.length && raw.workdays.context.observationCount === 0);
    const collection = raw.workdays.collection, receipts = new Set(), captures = new Set();
    for (const event of raw.workdays.events) (event.source.kind === 'receipt' ? receipts : captures).add(event.source.id);
    check(collection.captureCount === captures.size && collection.receiptCount === receipts.size);
    check(receipts.size === 0 ? collection.batchCount === 0 && collection.lastReceiptAt === null
      : Number.isSafeInteger(collection.batchCount) && collection.batchCount >= 1 && collection.batchCount <= receipts.size && collection.lastReceiptAt !== null);
    check(exact(raw.sourceCut, ['id', 'consistency', 'generatedAt']) && raw.sourceCut.consistency === 'single_snapshot'
      && raw.sourceCut.id === raw.workdays.revision && raw.sourceCut.generatedAt === raw.workdays.generatedAt);
    const blockers = [...new Set([...pop.blockerCodes, 'PERIOD_COVERAGE_UNCONFIRMED', ...(!expected.complete ? ['EXPECTED_DEVICES_UNRESOLVED'] : [])])].sort();
    check(codes(raw.blockerCodes) && equal([...raw.blockerCodes].sort(), blockers));
    return raw;
  } catch (e) {
    if (e instanceof AttendanceAreaError) throw e;
    attendanceAreaFail('SOURCE_INVALID', 503, 'La fuente por área es incompleta o no coincide con el ámbito solicitado.');
  }
}
export async function attendanceAreaRead(sql, principal, session, input) {
  try {
    const ctx = expectedDevicesContext(principal, session), q = attendanceAreaQuery(input);
    const rows = await sql.query('SELECT public.attendance_area_workdays_read_v1($1::jsonb,$2::jsonb)::text AS result', [JSON.stringify(ctx), JSON.stringify(q)]);
    const values = Array.isArray(rows) ? rows : rows?.rows;
    if (!Array.isArray(values) || values.length !== 1 || typeof values[0]?.result !== 'string')
      attendanceAreaFail('SOURCE_INVALID', 503, 'La fuente no devolvió un único corte verificable.');
    if (Buffer.byteLength(values[0].result) > 4 * 1024 * 1024)
      attendanceAreaFail('LIMIT', 413, 'El corte supera el límite técnico de respuesta; no se devolvió una población recortada.');
    let raw; try {raw = parseScopedPrivateJson(values[0].result, {maxDepth: 12});} catch {attendanceAreaFail('SOURCE_INVALID', 503, 'La respuesta contiene datos ambiguos.');}
    return validateAttendanceAreaSource(raw, q, ctx);
  } catch (e) {throw attendanceAreaSafeError(e);}
}
