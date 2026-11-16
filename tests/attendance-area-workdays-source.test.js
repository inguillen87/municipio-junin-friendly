import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ATTENDANCE_AREA_WORKDAYS_ORIGINAL, ATTENDANCE_AREA_WORKDAYS_CANDIDATE,
  deriveAttendanceAreaWorkdaysCandidate as derive, attendanceAreaWorkdaysCandidateManifest as manifest,
  attendanceAreaSourceDigest as digest} from '../scripts/lib/attendance-area-workdays-candidate.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const original = read(ATTENDANCE_AREA_WORKDAYS_ORIGINAL), candidate = read(ATTENDANCE_AREA_WORKDAYS_CANDIDATE);
const section = (text, start, end) => { const a = text.indexOf(start), b = text.indexOf(end, a + start.length); assert.ok(a >= 0 && b > a); return text.slice(a, b); };

test('area SQL reproduces from exact original v3 bytes and manifest; any original drift stops derivation', () => {
  assert.equal(derive(original), candidate); assert.equal(derive(original), derive(original));
  assert.deepEqual(manifest(candidate), JSON.parse(read('scripts/candidates/attendance-area-workdays-v1.source.manifest.json')));
  assert.throws(() => derive(original + '\n'), /ATTENDANCE_AREA_ORIGINAL_SOURCE_DRIFT/);
  assert.throws(() => derive(original.replace("'sha256'", "'md5'")), /ATTENDANCE_AREA_ORIGINAL_SOURCE_DRIFT/);
});

test('receipt manifests, ordinal completeness, raw conflicts and exact-byte dedup remain unchanged', () => {
  for (const [start, end] of [
    [' ), batch_ordinals AS MATERIALIZED (', ' ), source_rows AS MATERIALIZED ('],
    [' ), source_rows AS MATERIALIZED (', ' ), context_count AS MATERIALIZED ('],
  ]) {
    const expected = section(original, start, end);
    const actual = section(candidate, start, end.replace('context_count', 'private_context_count'));
    assert.equal(digest(actual), digest(expected));
  }
  assert.match(candidate, /AND NOT EXISTS\(SELECT 1 FROM projection_missing\) ok/);
  for (const reason of ['SOURCE_INCOMPLETE','SOURCE_CONFLICT','DEVICE_CONTEXT_INVALID','WINDOW_TOO_LARGE']) assert.ok(candidate.includes('ATTENDANCE_WORKDAY_' + reason));
});

test('one source statement materializes area population and joins exact UUIDs before identity projection', () => {
  assert.equal((candidate.match(/\bWITH access AS MATERIALIZED/g) || []).length, 1);
  assert.match(candidate, /attendance_area_context_v1\(p,'attendance\.area\.read'\)/);
  assert.doesNotMatch(candidate, /attendance_gateway_assert_actor|tenant_iam_effective_capabilities|\battendance_clock_workday_source_v[23]\(/);
  const scoped = section(candidate, ' ), mapped_candidates AS MATERIALIZED (', ' ), projected AS MATERIALIZED (');
  assert.match(scoped, /JOIN members member ON member\.contract_id=cp\.employment_contract_id/);
  assert.match(scoped, /im\.employment_contract_id=member\.contract_id/);
  assert.match(scoped, /cp\.reconciliation_state='mapped'/);
  assert.match(scoped, /ec\.id=member\.contract_id AND ec\.id=im\.employment_contract_id AND NOT overlap\.present/);
  assert.match(scoped, /attendance_area_history_v1\(ctx,d\.contract_id,d\.event_day,d\.event_day\)/);
  assert.ok(scoped.indexOf('event_membership AS MATERIALIZED') < scoped.indexOf('JOIN person_identity'));
  assert.match(scoped, /h\.proof->>'status'='resolved'/);
  assert.match(scoped, /h\.proof#>>'\{area,sectorSourceId\}' IS NOT DISTINCT FROM area_value->>'sectorSourceId'/);
  assert.doesNotMatch(scoped, /\b(?:dni|cuil)\b|legacy_legajo\s*=/i);
  assert.doesNotMatch(candidate, /ELSE 'Persona '|LEFT JOIN employment_contract/);
});

test('public counts and revision use only authorized payloads, never global captures or raw counts', () => {
  const output = candidate.slice(candidate.indexOf(" SELECT jsonb_build_object('version','attendance-area-workdays.v1'"));
  assert.match(output, /'recordCount',\(SELECT count\(\*\) FROM payloads\)/);
  assert.doesNotMatch(output, /'recordCount',cc\.records|'captureCount',\(SELECT count\(\*\) FROM captures\)/);
  const fingerprint = section(candidate, ' ), fingerprint AS (', ' ), revision AS (');
  assert.doesNotMatch(fingerprint, /FROM captures|FROM receipts|FROM source_rows|FROM context_rows|source_sha256|manifest_sha256/);
  assert.match(fingerprint, /FROM population/); assert.match(fingerprint, /FROM payloads/);
  const collection = section(candidate, ' ), scoped_collection AS MATERIALIZED (', ' ), fingerprint AS (');
  assert.match(collection, /count\(DISTINCT source_id\) FROM linked WHERE source_kind='historical'/);
  assert.match(collection, /count\(DISTINCT source_id\) FROM linked WHERE source_kind='receipt'/);
  assert.match(collection, /WHERE EXISTS\(SELECT 1 FROM linked l WHERE l\.source_kind='receipt' AND l\.source_id=q\.id\)/);
});

test('expected clock keys derive only from approved inventory UUIDs in the exact v3 namespace', () => {
  const expected = section(candidate, ' ), expected_rows AS MATERIALIZED (', ' ), binding AS MATERIALIZED (');
  assert.match(original, /digest\('clock-device-v2:'\|\|p_tenant\|\|':'\|\|device_id,'sha256'\)/);
  assert.match(expected, /attendance_expected_devices_effective_v1\(ctx,m\.contract_id,p_day\)/);
  assert.match(expected, /jsonb_array_elements_text\(e\.payload->'expectedDeviceIds'\) device_id/);
  assert.match(expected, /digest\('clock-device-v2:'\|\|p_tenant\|\|':'\|\|device_id::uuid,'sha256'\)/);
  assert.match(expected, /pop\.payload->'complete'='true'::jsonb AND NOT EXISTS/);
  assert.doesNotMatch(expected, /source_rows|receipts|punch|identity_map|COUNT\(.*marks/i);
});

test('a scoped event with an unproven civil date blocks instead of exporting an observation or a false empty day', () => {
  assert.match(candidate, /EXISTS\(SELECT 1 FROM projected WHERE placeable IS DISTINCT FROM true\)/);
  assert.match(candidate, /OR EXISTS\(SELECT 1 FROM mapped_candidates WHERE local_timestamp IS NULL OR occurred_at IS NULL/);
  assert.match(candidate, /OR local_timestamp IS DISTINCT FROM\(occurred_at AT TIME ZONE site_timezone\)/);
  assert.match(candidate, /OR local_timestamp<\(p_day-1\)::timestamp OR local_timestamp>=\(p_day\+2\)::timestamp/);
  assert.match(candidate, /INTO answer,binding_ok,site_ok,complete_ok,device_ok,conflict_found,window_count,unplaceable_found/);
  assert.match(candidate, /IF unplaceable_found THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EVENT_DATE_UNPROVEN';END IF;/);
  const guard = candidate.indexOf("IF unplaceable_found THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EVENT_DATE_UNPROVEN'");
  assert.ok(guard > candidate.indexOf(' INTO answer,') && guard < candidate.indexOf(' RETURN answer;'));
  const mapped = section(candidate, ' ), mapped_candidates AS MATERIALIZED (', ' ), event_days AS MATERIALIZED (');
  assert.doesNotMatch(mapped, /local_timestamp\s*=\s*\(?r\.occurred_at AT TIME ZONE/);
  assert.doesNotMatch(mapped, /WHERE ready\.ok AND r\.local_timestamp/);
  const days = section(candidate, ' ), event_days AS MATERIALIZED (', ' ), event_membership AS MATERIALIZED (');
  assert.match(days, /WHERE local_timestamp IS NOT NULL AND occurred_at IS NOT NULL/);
  assert.match(days, /AND local_timestamp=\(occurred_at AT TIME ZONE site_timezone\)/);
  assert.match(days, /AND local_timestamp>=\(p_day-1\)::timestamp AND local_timestamp<\(p_day\+2\)::timestamp/);
});

test('source stays guarded, private and coverage-blocked while retaining the v3 payload contract', () => {
  assert.match(candidate, /BEGIN;\s*DO \$source_only\$ BEGIN\s*RAISE EXCEPTION/);
  assert.match(candidate, /ROLLBACK;\s*$/);
  assert.match(candidate, /REVOKE ALL ON FUNCTION public\.attendance_area_workdays_read_v1\(jsonb,jsonb\) FROM PUBLIC,municontrol_actions_runtime_app/);
  assert.doesNotMatch(candidate, /\bGRANT\s+(?:ALL|EXECUTE)\b/);
  assert.match(candidate, /UNION SELECT 'PERIOD_COVERAGE_UNCONFIRMED'/);
  assert.match(candidate, /'coverageCertified',false,'installationReady',false,'payrollPosted',false,'NoeliaReady',false/);
  assert.match(candidate, /'sourceCut',jsonb_build_object\('id',rev\.id,'consistency','single_snapshot','generatedAt',statement_timestamp\(\)\)/);
  const payload = section(original, ' ), payloads AS MATERIALIZED (', ' ), fingerprint AS (');
  assert.equal(payload, section(candidate, ' ), payloads AS MATERIALIZED (', ' ), scoped_collection AS MATERIALIZED ('));
});
