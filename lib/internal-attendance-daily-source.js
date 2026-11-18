import {parseScopedPrivateJson} from './private-json-body.js';
import {timeCatalogNumeric} from '../assets/time-catalog-contract.js';
import {expectedDevicesContext} from './internal-attendance-expected-devices.js';
import {attendanceAreaQuery, validateAttendanceAreaSource} from './internal-attendance-area.js';
import {attendanceDailyDigest, validateAttendanceDailySource} from './attendance-daily-incidents.js';

export const ATTENDANCE_DAILY_SOURCE_SQL =
  'SELECT public.attendance_daily_source_read_v1($1::jsonb,$2::jsonb)::text AS result';
export const ATTENDANCE_DAILY_CUT_EVIDENCE_VERSION = 'attendance-daily-cut-evidence.v1';
// Neon HTTP transaction options. A database that ignores them is caught by the reported isolation below.
// Not READ ONLY: the session and device checks this call reaches take FOR SHARE row locks, which
// PostgreSQL refuses in a read-only transaction (verified in PostgreSQL 16; found by Codex review).
export const ATTENDANCE_DAILY_SOURCE_TRANSACTION = Object.freeze({isolationLevel: 'RepeatableRead'});

const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = () => { throw Object.assign(new Error('ATTENDANCE_DAILY_SOURCE_UNAVAILABLE'), {code:'ATTENDANCE_DAILY_SOURCE_UNAVAILABLE'}); };
const SNAPSHOT = /^[1-9][0-9]{0,19}:[1-9][0-9]{0,19}:(?:[1-9][0-9]{0,19}(?:,[1-9][0-9]{0,19}){0,9999})?$/;

// PostgreSQL time_catalog_entry_snapshot_v1 emits bigint/numeric(20,6) rule parameters as JSON
// numbers, while timeCatalogRecord requires exact numeric text strings without float rounding.
function parseDailySourceSqlJson(source) {
  parseScopedPrivateJson(source, {maxDepth: 16});
  return JSON.parse(source, (key, value, context) => {
    if (key === 'integerValue' || key === 'decimalValue') {
      if (typeof value !== 'number' || typeof context?.source !== 'string') fail();
      return timeCatalogNumeric(context.source, key === 'integerValue' ? 'integer' : 'decimal');
    }
    return value;
  });
}

async function readOnce(sql, params) {
  // Area workdays/population and approved assignments come from one statement. Under READ COMMITTED
  // that is not one MVCC snapshot (the VOLATILE functions it calls re-snapshot per query), so when
  // the client offers non-interactive transactions the call runs inside REPEATABLE READ.
  if (typeof sql?.transaction === 'function') {
    const results = await sql.transaction(txn => [txn.query(ATTENDANCE_DAILY_SOURCE_SQL, params)], ATTENDANCE_DAILY_SOURCE_TRANSACTION);
    if (!Array.isArray(results) || results.length !== 1) fail();
    return results[0];
  }
  return sql.query(ATTENDANCE_DAILY_SOURCE_SQL, params);
}

/**
 * Build the exact T4 evaluator input. The SQL joins assignments only through contracts emitted by
 * the area source. The cut is declared 'single_snapshot' only when PostgreSQL itself reports a
 * REPEATABLE READ transaction; the evidence binds that report and its snapshot to the
 * cut and its component hashes. Coverage and leave justifications remain blocked until their own
 * authorities and same-cut evidence are available. B injects this function; no HTTP surface.
 */
export async function produceAttendanceDailySource(sql, principal, session, inputQuery) {
  const ctx = expectedDevicesContext(principal, session);
  const q = attendanceAreaQuery(inputQuery);
  const rows = await readOnce(sql, [JSON.stringify(ctx), JSON.stringify(q)]);
  const values = Array.isArray(rows) ? rows : rows?.rows;
  if (!Array.isArray(values) || values.length !== 1 || typeof values[0]?.result !== 'string' ||
      Buffer.byteLength(values[0].result) > 8 * 1024 * 1024) fail();
  let combined;
  try { combined = parseDailySourceSqlJson(values[0].result); } catch { fail(); }
  if (!exact(combined, ['area','catalog','transaction']) ||
      !exact(combined.catalog, ['complete','assignments']) ||
      typeof combined.catalog.complete !== 'boolean' || !Array.isArray(combined.catalog.assignments)) fail();
  const tx = combined.transaction;
  if (!exact(tx, ['isolation','readOnly','snapshot']) ||
      !['read uncommitted','read committed','repeatable read','serializable'].includes(tx.isolation) ||
      !['on','off'].includes(tx.readOnly) || typeof tx.snapshot !== 'string' || !SNAPSHOT.test(tx.snapshot)) fail();
  const isolated = tx.isolation === 'repeatable read';

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
  const componentSha256 = {
    workdays:attendanceDailyDigest(workdays), population:attendanceDailyDigest(population),
    catalog:attendanceDailyDigest(catalog), coverage:attendanceDailyDigest(coverage),
    justifications:attendanceDailyDigest(justifications),
  };
  const evidence = isolated ? {id:areaSource.sourceCut.id, sha256:attendanceDailyDigest({version:ATTENDANCE_DAILY_CUT_EVIDENCE_VERSION,
    cutId:areaSource.sourceCut.id, isolation:tx.isolation, readOnly:tx.readOnly, snapshot:tx.snapshot, componentSha256})} : null;
  const input = {
    version:'attendance-daily-source.v1',
    scope:{
      tenantId:areaSource.principal.tenantId,
      sourceBindingId:areaSource.principal.sourceBindingId,
      area:areaSource.area, site:areaSource.site, day:areaSource.day,
      timezone:workdays.timezone,
    },
    cut:{id:areaSource.sourceCut.id, generatedAt, consistency:isolated ? 'single_snapshot' : 'unconfirmed', evidence, componentSha256},
    workdays,population,catalog,coverage,justifications,
  };
  return validateAttendanceDailySource(input);
}
