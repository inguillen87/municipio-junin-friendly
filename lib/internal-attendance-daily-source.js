import {parseScopedPrivateJson} from './private-json-body.js';
import {expectedDevicesContext} from './internal-attendance-expected-devices.js';
import {attendanceAreaQuery, validateAttendanceAreaSource} from './internal-attendance-area.js';
import {attendanceDailyDigest, validateAttendanceDailySource} from './attendance-daily-incidents.js';

export const ATTENDANCE_DAILY_SOURCE_SQL = `
WITH area_source AS MATERIALIZED (
  SELECT public.attendance_area_workdays_read_v1($1::jsonb,$2::jsonb) AS data
), scoped_contracts AS MATERIALIZED (
  SELECT contract.value->>'id' AS contract_id
  FROM area_source area
  CROSS JOIN LATERAL jsonb_array_elements(area.data->'population'->'contracts') contract(value)
), assignment_entries AS MATERIALIZED (
  SELECT entry.id, entry.tenant_id, spec.employment_contract_id
  FROM scoped_contracts contract
  JOIN public.time_assignment_spec spec
    ON spec.employment_contract_id=contract.contract_id::uuid
  JOIN public.time_catalog_entry entry
    ON entry.id=spec.catalog_entry_id
   AND entry.tenant_id=spec.tenant_id
  CROSS JOIN area_source area
  WHERE entry.tenant_id=(area.data->'principal'->>'tenantId')::uuid
    AND entry.certified_binding_id=(area.data->'principal'->>'sourceBindingId')::uuid
    AND entry.catalog_kind='assignment'
    AND entry.status='approved'
    AND entry.effective_from<=($2->>'day')::date
    AND (entry.effective_to IS NULL OR entry.effective_to>=($2->>'day')::date)
), assignment_views AS MATERIALIZED (
  SELECT entry.id, entry.employment_contract_id,
    public.time_catalog_entry_snapshot_v1(entry.id,entry.tenant_id) AS record,
    public.time_catalog_assignment_view_v2(
      $1::jsonb || jsonb_build_object(
        'certifiedBindingId',(SELECT area.data->'principal'->>'sourceBindingId' FROM area_source area),
        'assignmentReadAllowed',true
      ), entry.id
    ) AS assignment
  FROM assignment_entries entry
), catalog AS (
  SELECT jsonb_build_object(
    'complete',
    (SELECT count(*) FROM scoped_contracts)=
      (SELECT count(DISTINCT employment_contract_id) FROM assignment_views WHERE assignment IS NOT NULL),
    'assignments',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('record',record,'assignment',assignment)
      ORDER BY id) FROM assignment_views WHERE assignment IS NOT NULL),'[]'::jsonb)
  ) AS data
)
SELECT jsonb_build_object('area',area_source.data,'catalog',catalog.data)::text AS result
FROM area_source CROSS JOIN catalog
`;

const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = () => { throw Object.assign(new Error('ATTENDANCE_DAILY_SOURCE_UNAVAILABLE'), {code:'ATTENDANCE_DAILY_SOURCE_UNAVAILABLE'}); };

/**
 * Build the exact T4 evaluator input. Area workdays/population and approved
 * assignment snapshots are selected by one PostgreSQL statement/MVCC snapshot.
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
