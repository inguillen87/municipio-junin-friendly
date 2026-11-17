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
 * Build the exact T4 evaluator input. Area workdays/population and approved
 * assignment snapshots are selected by one PostgreSQL statement. That is not one MVCC snapshot:
 * the VOLATILE functions it calls re-snapshot per query under READ COMMITTED, so the cut stays
 * 'unconfirmed' until the call runs inside a REPEATABLE READ READ ONLY transaction.
 * The SQL joins assignments only through contracts emitted by the area source.
 * Coverage and leave justifications remain blocked until their own authorities
 * and same-cut evidence are available. B injects this function; no HTTP surface.
 */
export async function produceAttendanceDailySource(sql, principal, session, inputQuery) {
  const ctx = expectedDevicesContext(principal, session);
  const q = attendanceAreaQuery(inputQuery);
  const rows = await sql.query(ATTENDANCE_DAILY_SOURCE_SQL, [JSON.stringify(ctx), JSON.stringify(q)]);
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
  const input = {
    version:'attendance-daily-source.v1',
    scope:{
      tenantId:areaSource.principal.tenantId,
      sourceBindingId:areaSource.principal.sourceBindingId,
      area:areaSource.area, site:areaSource.site, day:areaSource.day,
      timezone:workdays.timezone,
    },
    cut:{
      id:areaSource.sourceCut.id, generatedAt, consistency:'unconfirmed', evidence:null,
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
