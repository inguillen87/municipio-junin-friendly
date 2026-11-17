import {parseScopedPrivateJson} from './private-json-body.js';
import {expectedDevicesContext} from './internal-attendance-expected-devices.js';
import {attendanceAreaQuery, validateAttendanceAreaSource} from './internal-attendance-area.js';
import {attendanceDailyDigest, validateAttendanceDailySource} from './attendance-daily-incidents.js';

export const ATTENDANCE_DAILY_SOURCE_SQL =
  'SELECT public.attendance_daily_source_read_v1($1::jsonb,$2::jsonb)::text AS result';

const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = () => { throw Object.assign(new Error('ATTENDANCE_DAILY_SOURCE_UNAVAILABLE'), {code:'ATTENDANCE_DAILY_SOURCE_UNAVAILABLE'}); };

/**
 * Build the exact T4 evaluator input. The Neon HTTP client returned by
 * getActionCenterSql exposes transaction(); use its single-request transaction
 * with RepeatableRead + readOnly so nested VOLATILE PL/pgSQL reads share the
 * transaction snapshot. A query-only client is deliberately rejected.
 * The SQL joins assignments only through contracts emitted by the area source.
 * Coverage and leave justifications remain blocked until their own authorities
 * and same-cut evidence are available. B injects this function; no HTTP surface.
 */
export async function produceAttendanceDailySource(sql, principal, session, inputQuery) {
  const ctx = expectedDevicesContext(principal, session);
  const q = attendanceAreaQuery(inputQuery);
  if (typeof sql?.query !== 'function' || typeof sql?.transaction !== 'function') fail();

  let resultSets;
  try {
    const statement = sql.query(ATTENDANCE_DAILY_SOURCE_SQL, [JSON.stringify(ctx), JSON.stringify(q)]);
    resultSets = await sql.transaction([statement], {isolationLevel:'RepeatableRead', readOnly:true});
  } catch {
    fail();
  }
  if (!Array.isArray(resultSets) || resultSets.length !== 1) fail();
  const rows = resultSets[0];
  const values = Array.isArray(rows) ? rows : rows?.rows;
  if (!Array.isArray(values) || values.length !== 1 || typeof values[0]?.result !== 'string' ||
      Buffer.byteLength(values[0].result) > 8 * 1024 * 1024) fail();
  let combined;
  try { combined = parseScopedPrivateJson(values[0].result, {maxDepth: 16}); } catch { fail(); }
  if (!exact(combined, ['area','catalog']) ||
      !exact(combined.catalog, ['complete','assignments']) ||
      typeof combined.catalog.complete !== 'boolean' || !Array.isArray(combined.catalog.assignments)) fail();

  const areaSource = validateAttendanceAreaSource(combined.area, q, ctx);
  const generatedAt = areaSource.workdays.generatedAt;
  const members = areaSource.population.contracts.map(contract => ({
    contractId: contract.id, area: areaSource.area, identityBinding: null, expectedDeviceKeys: null,
  }));
  const workdays = areaSource.workdays;
  const population = {complete:areaSource.population.complete === true, evidence:null, members};
  const catalog = combined.catalog;
  const coverage = {
    status:'a_confirmar', evidence:null, sourceRevision:workdays.revision,
    fromAt:generatedAt, throughAt:generatedAt, contractIds:[], deviceKeys:[],
  };
  const justifications = {complete:false, evidence:null, entries:[]};
  // This digest binds the returned source revision and the transaction mode
  // requested from the Neon driver. It is created only after transaction()
  // resolves successfully; it is not a substitute for driver-side isolation.
  const cutEvidence = {
    id:areaSource.sourceCut.id,
    sha256:attendanceDailyDigest({
      version:'attendance-daily-repeatable-read.v1',
      isolationLevel:'RepeatableRead',
      readOnly:true,
      sourceCut:areaSource.sourceCut,
      catalog,
    }),
  };
  const input = {
    version:'attendance-daily-source.v1',
    scope:{
      tenantId:areaSource.principal.tenantId,
      sourceBindingId:areaSource.principal.sourceBindingId,
      area:areaSource.area, site:areaSource.site, day:areaSource.day,
      timezone:workdays.timezone,
    },
    cut:{
      id:areaSource.sourceCut.id, generatedAt, consistency:'single_snapshot', evidence:cutEvidence,
      componentSha256:{
        workdays:attendanceDailyDigest(workdays), population:attendanceDailyDigest(population),
        catalog:attendanceDailyDigest(catalog), coverage:attendanceDailyDigest(coverage),
        justifications:attendanceDailyDigest(justifications),
      },
    },
    workdays,population,catalog,coverage,justifications,
  };
  return validateAttendanceDailySource(input);
}
