import {createHash} from 'node:crypto';

export const ATTENDANCE_AREA_WORKDAYS_ORIGINAL = 'scripts/candidates/attendance-clock-workday-source-v3.sql.txt';
export const ATTENDANCE_AREA_WORKDAYS_ORIGINAL_SHA256 = 'b8245352b46ac7338244508b5efe5f8e10d4ea24f77565d8d61172b8dad5a383';
export const ATTENDANCE_AREA_WORKDAYS_CANDIDATE = 'scripts/candidates/attendance-area-workdays-v1.source.sql.txt';
export const attendanceAreaSourceDigest = text => createHash('sha256').update(text).digest('hex');

function replaceOnce(text, anchor, replacement) {
  const at = text.indexOf(anchor);
  if (at < 0 || text.indexOf(anchor, at + anchor.length) >= 0) throw new Error('ATTENDANCE_AREA_DERIVATION_ANCHOR');
  return text.slice(0, at) + replacement + text.slice(at + anchor.length);
}
function replaceSection(text, start, end, replacement) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  if (a < 0 || b < 0 || text.indexOf(start, a + start.length) >= 0 || text.indexOf(end, b + end.length) >= 0) throw new Error('ATTENDANCE_AREA_DERIVATION_ANCHOR');
  return text.slice(0, a) + replacement + text.slice(b);
}

const preamble = String.raw`-- SOURCE CANDIDATE ONLY. NOT INSTALLED. NOT AN INSTALLER.
-- Derived from exact clock-workday-source.v3 bytes, pinned in the manifest.
-- Preserves receipt completeness, exact-byte deduplication and source conflict
-- checks. Adds a SERVER-SCOPED producer; never calls the global reader.
-- Context, area history and device declarations must be composed together.
BEGIN;
DO $source_only$ BEGIN
 RAISE EXCEPTION 'ATTENDANCE_AREA_WORKDAYS_SOURCE_REQUIRES_REVIEWED_COMPOSITION';
END $source_only$;

CREATE FUNCTION public.attendance_area_workdays_read_v1(p jsonb,q jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;authorized_area jsonb;area_value jsonb;answer jsonb;
 p_tenant uuid;p_site text;p_day date;p_snapshot uuid;p_release text;
 binding_ok boolean;site_ok boolean;complete_ok boolean;device_ok boolean;conflict_found boolean;window_count bigint;unplaceable_found boolean;
BEGIN
 ctx:=public.attendance_area_context_v1(p,'attendance.area.read');
 IF public.attendance_expected_devices_exact_v1(q,ARRAY['resource','area','day','site','snapshot']) IS NOT TRUE
 OR octet_length(q::text)>8192 OR q->>'resource' IS DISTINCT FROM 'day'
 OR jsonb_typeof(q->'day') IS DISTINCT FROM 'string' OR q->>'day'!~'^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
 OR NOT pg_input_is_valid(q->>'day','date')
 OR jsonb_typeof(q->'site') IS DISTINCT FROM 'string' OR q->>'site'!~'^[a-z0-9][a-z0-9._-]{1,95}$'
 OR(q->'snapshot'<>'null'::jsonb AND(jsonb_typeof(q->'snapshot')<>'string'
  OR q->>'snapshot'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'))
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_QUERY_INVALID';END IF;
 p_tenant:=(ctx->>'tenantId')::uuid;p_release:=p->>'releaseSha';p_site:=q->>'site';
 p_day:=public.attendance_expected_devices_date_v1(q->'day');p_snapshot:=(q->>'snapshot')::uuid;
 area_value:=public.attendance_expected_devices_area_v1(q->'area');
 authorized_area:=public.attendance_area_assert_scope_v1(ctx,area_value);

 -- The one data statement below owns the snapshot for population, immutable
 -- history, expected devices, identity maps, raw integrity and projections.
 -- Every nested history/population/effective helper is STABLE and private.
`;

const authorityCtes = String.raw` WITH access AS MATERIALIZED (
  -- attendance.area.read authorizes nominal identities only inside this scope.
  SELECT true nominal
 ), population AS MATERIALIZED (
  SELECT public.attendance_area_population_v1(ctx,area_value,p_day,p_day) payload
 ), members AS MATERIALIZED (
  SELECT (item->>'id')::uuid contract_id,item->>'subjectVersion' subject_version
  FROM population pop CROSS JOIN LATERAL jsonb_array_elements(pop.payload->'contracts') item
 ), expected_rows AS MATERIALIZED (
  SELECT m.contract_id,public.attendance_expected_devices_effective_v1(ctx,m.contract_id,p_day) payload FROM members m
 ), expected_payloads AS MATERIALIZED (
  SELECT e.contract_id,e.payload||jsonb_build_object('deviceKeyNamespace','clock-device-v2','expectedDeviceKeys',
   coalesce((SELECT jsonb_agg(encode(digest('clock-device-v2:'||p_tenant||':'||device_id::uuid,'sha256'),'hex') ORDER BY device_id::uuid)
    FROM jsonb_array_elements_text(e.payload->'expectedDeviceIds') device_id),'[]'::jsonb)) payload
  FROM expected_rows e
 ), expected AS MATERIALIZED (
  SELECT jsonb_build_object('version','attendance-area-expected-devices.v1',
   'complete',pop.payload->'complete'='true'::jsonb AND NOT EXISTS(SELECT 1 FROM expected_rows e
    WHERE e.payload->>'status' IS DISTINCT FROM 'resolved' OR e.payload->'complete' IS DISTINCT FROM 'true'::jsonb),
   'records',coalesce((SELECT jsonb_agg(e.payload ORDER BY e.contract_id) FROM expected_payloads e),'[]'::jsonb)) payload
  FROM population pop
`;

const scopedLinks = String.raw` ), mapped_candidates AS MATERIALIZED (
  SELECT r.*,d.model,d.timezone,s.timezone site_timezone,cp.review_state,
   'mapped'::text identity_state,ec.id contract_id,ec.legacy_legajo,ec.person_id
  FROM context_rows r JOIN devices d ON d.id=r.device_id CROSS JOIN site s CROSS JOIN binding b CROSS JOIN ready
  JOIN attendance_canonical_punch cp ON cp.raw_event_id=r.raw_event_id AND cp.tenant_id=p_tenant
   AND cp.device_id=r.device_id AND cp.site_id=s.id AND cp.occurred_at=r.occurred_at
   AND cp.reconciliation_state='mapped'
  -- Population is already proven by exact contract UUID + historical area.
  JOIN members member ON member.contract_id=cp.employment_contract_id
  JOIN attendance_identity_map im ON im.id=cp.identity_map_id AND im.tenant_id=p_tenant
   AND im.device_id=r.device_id AND im.identity_hmac_sha256=r.identity_hmac
   AND im.employment_contract_id=member.contract_id AND im.status='active'
   AND im.valid_from<=r.local_timestamp::date AND(im.valid_to IS NULL OR im.valid_to>=r.local_timestamp::date)
  LEFT JOIN LATERAL (
   SELECT EXISTS(SELECT 1 FROM attendance_identity_map other
    WHERE other.tenant_id=p_tenant AND other.device_id=r.device_id AND other.identity_hmac_sha256=r.identity_hmac
     AND other.status='active' AND other.id IS DISTINCT FROM im.id
     AND other.valid_from<=r.local_timestamp::date AND(other.valid_to IS NULL OR other.valid_to>=r.local_timestamp::date)) present
  ) overlap ON true
  JOIN employment_contract ec ON ec.id=member.contract_id AND ec.id=im.employment_contract_id AND NOT overlap.present
   AND ec.tenant_id=p_tenant AND ec.legacy_company_id=b.source_company_id AND ec.source_system='MUNICONTROL'
  WHERE ready.ok
 ), event_days AS MATERIALIZED (
  -- Unusable dates remain in mapped_candidates for the private blocking flag;
  -- only consistent in-window dates may reach the historical area resolver.
  SELECT DISTINCT contract_id,local_timestamp::date event_day FROM mapped_candidates
  WHERE local_timestamp IS NOT NULL AND occurred_at IS NOT NULL
   AND local_timestamp=(occurred_at AT TIME ZONE site_timezone)
   AND local_timestamp>=(p_day-1)::timestamp AND local_timestamp<(p_day+2)::timestamp
 ), event_membership AS MATERIALIZED (
  SELECT d.contract_id,d.event_day,public.attendance_area_history_v1(ctx,d.contract_id,d.event_day,d.event_day) proof FROM event_days d
 ), scoped_links AS MATERIALIZED (
  SELECT r.* FROM mapped_candidates r JOIN event_membership h ON h.contract_id=r.contract_id AND h.event_day=r.local_timestamp::date
  WHERE h.proof->>'status'='resolved' AND h.proof#>>'{area,organizationUnitSourceId}'=area_value->>'organizationUnitSourceId'
   AND h.proof#>>'{area,sectorSourceId}' IS NOT DISTINCT FROM area_value->>'sectorSourceId'
 ), linked AS MATERIALIZED (
  -- Names become available only AFTER both requested-day population and the
  -- event's own civil-date membership have passed inside the same statement.
  SELECT r.*,pi.full_name FROM scoped_links r JOIN person_identity pi ON pi.id=r.person_id
`;

const collectionAndFingerprint = String.raw` ), scoped_collection AS MATERIALIZED (
  SELECT jsonb_build_object('status',CASE WHEN NOT EXISTS(SELECT 1 FROM payloads) THEN 'no_data' ELSE 'continuous_receipts' END,
   'sourceComplete',i.complete,
   'captureCount',(SELECT count(DISTINCT source_id) FROM linked WHERE source_kind='historical'),
   'receiptCount',(SELECT count(DISTINCT source_id) FROM linked WHERE source_kind='receipt'),
   'batchCount',(SELECT count(DISTINCT(q.connector_id,q.batch_key)) FROM receipts q
    WHERE EXISTS(SELECT 1 FROM linked l WHERE l.source_kind='receipt' AND l.source_id=q.id)),
   'lastReceiptAt',(SELECT max(q.received_at) FROM receipts q
    WHERE EXISTS(SELECT 1 FROM linked l WHERE l.source_kind='receipt' AND l.source_id=q.id)),
   'periodCoverageCertified',false,'automaticCollectorVerified',false) payload FROM integrity i
 ), fingerprint AS (
  -- No global record/capture counts, receipts or unscoped source hashes enter
  -- this revision. It describes only the authorized subset and its declarations.
  SELECT encode(digest(concat_ws('|','attendance-area-workdays.v1','clock-workday-source.v3','declared-intervals.v2',
   p_tenant,p_site,ctx->>'sourceBindingId',ctx->>'scopeVersion',area_value::text,p_day,
   (SELECT timezone FROM site),(SELECT payload::text FROM population),(SELECT payload::text FROM expected),
   (SELECT payload::text FROM scoped_collection),(SELECT string_agg(payload::text,',' ORDER BY event_ref) FROM payloads)), 'sha256'),'hex') hash
`;

const outputAndGuards = String.raw` SELECT jsonb_build_object('version','attendance-area-workdays.v1',
  'principal',public.attendance_expected_devices_base_v1(ctx,p)->'principal','area',area_value,'areaLabel',authorized_area->'areaLabel',
  'day',to_char(p_day,'YYYY-MM-DD'),'site',p_site,'population',(SELECT payload FROM population),'expectedDevices',(SELECT payload FROM expected),
  'workdays',jsonb_build_object('version','clock-workday-source.v3','generatedAt',statement_timestamp(),
   'sourceMode','continuous','revision',rev.id,'rulesVersion','declared-intervals.v2',
   'site',(SELECT jsonb_build_object('key',external_key,'label',label) FROM site),
   'timezone',(SELECT timezone FROM site),'nominalReadAllowed',a.nominal,
   'filters',jsonb_build_object('from',b.from_day,'to',b.to_day,'anchoredToLatest',false),
   'context',jsonb_build_object('from',b.from_day-1,'to',b.to_day+1,'recordCount',(SELECT count(*) FROM payloads),
    'eventCount',(SELECT count(*) FROM payloads WHERE placeable),'observationCount',(SELECT count(*) FROM payloads WHERE NOT placeable)),
   'collection',(SELECT payload FROM scoped_collection),
   'events',(SELECT coalesce(jsonb_agg(payload ORDER BY event_ref),'[]'::jsonb) FROM payloads WHERE placeable),
   'observations',(SELECT coalesce(jsonb_agg(payload ORDER BY event_ref),'[]'::jsonb) FROM payloads WHERE NOT placeable)),
  'sourceCut',jsonb_build_object('id',rev.id,'consistency','single_snapshot','generatedAt',statement_timestamp()),
  'blockerCodes',(SELECT coalesce(jsonb_agg(code ORDER BY code),'[]'::jsonb) FROM(
   SELECT jsonb_array_elements_text(payload->'blockerCodes') code FROM population
   UNION SELECT 'PERIOD_COVERAGE_UNCONFIRMED'
   UNION SELECT 'EXPECTED_DEVICES_UNRESOLVED' WHERE(SELECT payload->'complete' FROM expected) IS DISTINCT FROM 'true'::jsonb
  ) blockers),
  'coverageCertified',false,'installationReady',false,'payrollPosted',false,'NoeliaReady',false),
  EXISTS(SELECT 1 FROM binding),EXISTS(SELECT 1 FROM site),i.complete,i.device_context,
  EXISTS(SELECT 1 FROM source_conflicts) OR EXISTS(SELECT 1 FROM projection_missing),cc.records,
  EXISTS(SELECT 1 FROM projected WHERE placeable IS DISTINCT FROM true)
   OR EXISTS(SELECT 1 FROM mapped_candidates WHERE local_timestamp IS NULL OR occurred_at IS NULL
    OR local_timestamp IS DISTINCT FROM(occurred_at AT TIME ZONE site_timezone)
    OR local_timestamp<(p_day-1)::timestamp OR local_timestamp>=(p_day+2)::timestamp)
 INTO answer,binding_ok,site_ok,complete_ok,device_ok,conflict_found,window_count,unplaceable_found
 FROM bounds b CROSS JOIN access a CROSS JOIN integrity i CROSS JOIN private_context_count cc CROSS JOIN revision rev;

 IF NOT binding_ok THEN RAISE EXCEPTION 'ATTENDANCE_BINDING_REQUIRED';END IF;
 IF NOT site_ok THEN RAISE EXCEPTION 'ATTENDANCE_WORKDAY_SITE_NOT_FOUND';END IF;
 IF NOT complete_ok THEN RAISE EXCEPTION 'ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE';END IF;
 IF NOT device_ok THEN RAISE EXCEPTION 'ATTENDANCE_WORKDAY_DEVICE_CONTEXT_INVALID';END IF;
 IF conflict_found THEN RAISE EXCEPTION 'ATTENDANCE_WORKDAY_SOURCE_CONFLICT';END IF;
 IF window_count>25000 THEN RAISE EXCEPTION 'ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE';END IF;
 -- A scoped identity is insufficient when the local timestamp does not prove
 -- the event's civil date. Do not export an observation without contract/date,
 -- or silently discard it and suggest a complete empty day.
 IF unplaceable_found THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EVENT_DATE_UNPROVEN';END IF;
 IF p_snapshot IS NOT NULL AND p_snapshot::text IS DISTINCT FROM answer#>>'{workdays,revision}'
 THEN RAISE EXCEPTION 'ATTENDANCE_CAPTURE_CHANGED';END IF;
 RETURN answer;
END $$;

-- Reviewed composition must decide the facade's runtime grant. The source
-- itself remains owner-only and preserves all helper revocations.
REVOKE ALL ON FUNCTION public.attendance_area_workdays_read_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
ROLLBACK;
`;

/** Deterministic source derivation only; never connects to or runs PostgreSQL. */
export function deriveAttendanceAreaWorkdaysCandidate(original) {
  if (typeof original !== 'string' || attendanceAreaSourceDigest(original) !== ATTENDANCE_AREA_WORKDAYS_ORIGINAL_SHA256) throw new Error('ATTENDANCE_AREA_ORIGINAL_SOURCE_DRIFT');
  const start = original.indexOf(' WITH access AS MATERIALIZED ('), end = original.indexOf(" SELECT jsonb_build_object('version','clock-workday-source.v3','generatedAt'");
  if (start < 0 || end < start) throw new Error('ATTENDANCE_AREA_DERIVATION_ANCHOR');
  let body = original.slice(start, end);
  body = replaceSection(body, ' WITH access AS MATERIALIZED (', ' ), binding AS MATERIALIZED (', authorityCtes);
  body = replaceOnce(body, '   AND policy.certified_release_sha=p_release', String.raw`   AND policy.certified_release_sha=p_release AND sb.id=(ctx->>'sourceBindingId')::uuid
   AND sb.source_company_id=(ctx->>'sourceCompanyId')::bigint AND sb.source_database=ctx->>'sourceDatabase'`);
  body = replaceOnce(body, ' ), context_count AS MATERIALIZED (', ' ), private_context_count AS MATERIALIZED (');
  body = replaceOnce(body, 'FROM integrity i CROSS JOIN context_count c', 'FROM integrity i CROSS JOIN private_context_count c');
  body = replaceSection(body, ' ), linked AS MATERIALIZED (', ' ), projected AS MATERIALIZED (', scopedLinks);
  body = replaceOnce(body, String.raw`   CASE WHEN a.nominal AND full_name IS NOT NULL THEN full_name
    ELSE 'Persona '||upper(substr(encode(digest(identity_hmac,'sha256'),'hex'),1,8)) END person_label,
   CASE WHEN a.nominal THEN legacy_legajo ELSE NULL END legajo,
   CASE WHEN a.nominal AND r.identity_state='mapped' THEN r.contract_id ELSE NULL END visible_contract_id,`,
  String.raw`   full_name person_label,legacy_legajo legajo,r.contract_id visible_contract_id,`);
  body = replaceSection(body, ' ), fingerprint AS (', ' ), revision AS (', collectionAndFingerprint);
  return preamble + body + outputAndGuards;
}

export function attendanceAreaWorkdaysCandidateManifest(sql) {
  return {version:'attendance-area-workdays-source-manifest.v1', baseCommit:'ad0d80d989b736dee52a0102ef3200b8905b65b2',
    original:{path:ATTENDANCE_AREA_WORKDAYS_ORIGINAL, sha256:ATTENDANCE_AREA_WORKDAYS_ORIGINAL_SHA256},
    candidate:{path:ATTENDANCE_AREA_WORKDAYS_CANDIDATE, sha256:attendanceAreaSourceDigest(sql)},
    derivedBy:'scripts/lib/attendance-area-workdays-candidate.mjs',
    publicSignature:'public.attendance_area_workdays_read_v1(jsonb,jsonb)',
    requiredPrivateStableHelpers:['public.attendance_area_population_v1(jsonb,jsonb,date,date)',
      'public.attendance_area_history_v1(jsonb,uuid,date,date)', 'public.attendance_expected_devices_effective_v1(jsonb,uuid,date)'],
    authority:'public.attendance_area_context_v1(jsonb,text)',
    expectedDeviceKey:{inventory:'public.attendance_device.id', namespace:'clock-device-v2',
      expression:"encode(digest('clock-device-v2:'||p_tenant||':'||device_id,'sha256'),'hex')", inferenceFromMarks:false},
    retainedInvariants:['receipt_manifest_bytes','batch_ordinals','historical_transport_completeness',
      'confirmed_record_projection','exact_device_raw_hash_deduplication','source_conflict_detection',
      'identity_map_temporal_binding','identity_map_overlap_denial','clock_v3_event_payload','declared_intervals_v2'],
    publicCounts:'authorized_subset_only', snapshot:'single_statement_with_private_stable_helpers',
    runtimeSqlExecuted:false, installed:false, coverageCertified:false, NoeliaReady:false};
}
