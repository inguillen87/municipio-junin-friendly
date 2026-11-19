import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expectedDeviceSourceFunctions, renderExpectedDeviceSourceManifest} from '../scripts/build-attendance-expected-devices-source-manifest.mjs';

const source = readFileSync(new URL('../scripts/candidates/attendance-expected-devices-v1.source.sql.txt', import.meta.url), 'utf8');
const manifestText = readFileSync(new URL('../scripts/candidates/attendance-expected-devices-v1.source.manifest.json', import.meta.url), 'utf8');
const manifest = JSON.parse(manifestText);
const functions = expectedDeviceSourceFunctions(source);
const fn = name => {
  const value = functions.find(f => f.name === name);
  assert.ok(value, 'Missing SQL source function ' + name); return value;
};
const body = suffix => fn('attendance_expected_devices_' + suffix + '_v1').body;
const executableText = source.replace(/--[^\n]*/g, '');

test('the source cannot install itself and its manifest identifies every exact body without claiming SQL validation', () => {
  assert.match(source, /BEGIN;\s*DO \$source_only\$ BEGIN\s*RAISE EXCEPTION 'ATTENDANCE_EXPECTED_DEVICES_SOURCE_REQUIRES_REVIEWED_COMPOSITION';/);
  assert.ok(source.indexOf('RAISE EXCEPTION') < source.indexOf('CREATE TABLE'));
  assert.match(source, /ROLLBACK;\s*$/);
  assert.doesNotMatch(executableText, /\b(COMMIT|GRANT|CREATE OR REPLACE|DROP|TRUNCATE TABLE)\b/i);
  assert.equal(manifestText, renderExpectedDeviceSourceManifest(source));
  for (const field of ['installable', 'installed', 'sqlExecuted', 'sqlEngineValidated', 'noeliaReady', 'payrollPosted', 'coverageCertified']) assert.equal(manifest[field], false);
  assert.equal(manifest.functions.length, functions.length);
});

test('all new tables and functions are private; the only prospective facades are the closed read and command signatures', () => {
  const revokes = executableText.slice(executableText.lastIndexOf('REVOKE ALL ON FUNCTION'));
  for (const table of manifest.newTables) {
    assert.ok(source.includes('ALTER TABLE ' + table + ' ENABLE ROW LEVEL SECURITY;'));
    assert.ok(executableText.includes(table));
    assert.ok(source.includes(table.split('.').at(-1) + '_immutable BEFORE UPDATE OR DELETE OR TRUNCATE'));
  }
  assert.match(executableText, /REVOKE ALL ON public\.attendance_expected_device_proposal,[\s\S]*?FROM PUBLIC,municontrol_actions_runtime_app;/);
  for (const f of functions) {
    assert.equal(f.securityDefiner, true);
    assert.ok(f.settings.includes('search_path=pg_catalog,public,pg_temp'));
    assert.ok(revokes.includes(f.signature), 'Missing private ACL for ' + f.signature);
  }
  assert.deepEqual(functions.filter(f => f.candidateRuntimeFacade).map(f => f.signature), [
    'public.attendance_expected_devices_read_v1(jsonb,jsonb)', 'public.attendance_expected_devices_command_v1(jsonb,jsonb,uuid)',
  ]);
});

test('population and subject projections share one snapshot and never substitute current area or a global reader for historical evidence', () => {
  const population = fn('attendance_area_population_v1');
  assert.equal(population.volatility, 'STABLE');
  assert.equal(fn('attendance_expected_devices_subject_v1').volatility, 'STABLE');
  assert.match(population.body, /ec\.tenant_id=\(ctx->>'tenantId'\)::uuid[\s\S]*?ec\.legacy_company_id=\(ctx->>'sourceCompanyId'\)::bigint/);
  assert.match(population.body, /h:=public\.attendance_area_history_v1\(ctx,candidate\.id,first_date,last_date\)/);
  assert.match(population.body, /h->>'status' IS DISTINCT FROM 'resolved'[\s\S]*?blockers:=[\s\S]*?ELSIF h#>>'\{area,organizationUnitSourceId\}'/);
  assert.ok(population.body.indexOf('ELSIF') < population.body.indexOf('contracts:=contracts||'));
  assert.doesNotMatch(population.body, /ec\.(organization_unit_source_id|sector_source_id)|to_jsonb\(ec\)|LIMIT\s+[0-9]/);
  assert.match(population.body, /'complete',blockers='\[\]'::jsonb,'blockerCodes',blockers/);
  assert.doesNotMatch(population.body, /IF blockers[^;]*THEN contracts/);
  assert.ok(body('subject').indexOf('attendance_area_history_v1') < body('subject').indexOf('pi.full_name'));
  assert.doesNotMatch(executableText, /attendance_read_v\d|attendance_gateway_read|workforce\.employee\.read|'attendance\.read'/);
});

test('device choices are a tenant inventory catalogue, explicitly selected and never inferred from event or identity-map observations', () => {
  assert.doesNotMatch(executableText, /attendance_marking_event|attendance_identity_map|clock_source|attendance_marking_import_row/);
  assert.doesNotMatch(body('catalog'), /network_host|network_port|serial_number|firmware_version|address_text/);
  assert.match(body('catalog'), /d\.tenant_id=\(ctx->>'tenantId'\)::uuid AND d\.status='active' AND s\.status='active'/);
  assert.match(body('catalog'), /LOCK TABLE public\.attendance_device,public\.attendance_marking_site IN SHARE MODE NOWAIT/);
  assert.match(body('command'), /payload_value->'complete' IS DISTINCT FROM 'true'::jsonb/);
  assert.match(body('command'), /jsonb_array_length\(payload_value->'deviceIds'\) NOT BETWEEN 1 AND 100/);
  assert.match(body('command'), /count\(DISTINCT d\)/);
  assert.match(body('command'), /FROM unnest\(selected_ids\) d WHERE NOT EXISTS/);
});

test('legacy NULL-tenant records cannot yield false completeness and only proven whole-range ineligibility is omitted', () => {
  const population = fn('attendance_area_population_v1').body;
  assert.match(population, /imported\.source_system='GRH' AND imported\.tenant_id IS NULL/);
  assert.match(population, /batch\.source_database=ctx->>'sourceDatabase' AND batch\.validation_state='published'/);
  assert.match(population, /imported\.legacy_company_id=\(ctx->>'sourceCompanyId'\)::bigint/);
  assert.match(population, /IF h->>'status'='blocked' AND h->'reasons'=jsonb_build_array\('AREA_HISTORY_RANGE_NOT_ACTIVE'\) THEN[\s\S]*?CONTINUE;\s*ELSIF h->>'status' IS DISTINCT FROM 'resolved' THEN/);
  assert.doesNotMatch(population, /imported\.(organization_unit_source_id|sector_source_id)|to_jsonb\(imported\)/);
  assert.match(population, /'AREA_POPULATION_TECHNICAL_LIMIT'/);
});

test('every mutation reauthorizes exact read and command scopes and resolves the live actor before accepting a body or replay', () => {
  const command = body('command');
  assert.match(command, /attendance_area_context_v1\(p,'attendance.area.read'\)/);
  assert.match(command, /THEN 'attendance.area.devices.propose' ELSE 'attendance.area.devices.approve'/);
  assert.match(command, /public\.time_catalog_native_actor_v2/);
  assert.match(command, /b->>'scopeVersion' IS DISTINCT FROM c->>'scopeVersion' OR b->>'scopeVersion' IS DISTINCT FROM read_ctx->>'scopeVersion'/);
  assert.match(command, /attendance_area_assert_scope_v1\(c,area_value\)/);
  assert.match(command, /attendance_area_assert_scope_v1\(read_ctx,area_value\)/);
  assert.ok(command.indexOf('attendance_area_context_v1') < command.indexOf('attendance_expected_devices_replay_v1'));
  assert.match(body('scope_matches'), /s->>'sectorSourceId' IS NOT DISTINCT FROM area->>'sectorSourceId'/);
  assert.doesNotMatch(body('scope_matches'), /IS NULL\s+OR|LIKE/);
});

test('approval and retirement use separate people and memberships, immutable original versions and explicit retirement dates', () => {
  const command = body('command');
  assert.match(command, /pr\.actor_membership_id=\(c->>'membershipId'\)::uuid OR pr\.actor_person_id=\(c->>'actorPersonId'\)::uuid/);
  assert.match(command, /\(b->>'expectedVersion'\)::integer<>current_version/);
  assert.match(command, /pr\.proposal_sha256<>public\.attendance_expected_devices_proposal_hash_v1\(pr\)/);
  assert.match(command, /retire_date:=public\.attendance_expected_devices_date_v1\(payload_value->'effectiveFrom'\)/);
  assert.match(command, /retire_date<pr\.valid_from OR retire_date>pr\.valid_until\+1/);
  assert.match(command, /rv\.decision IS DISTINCT FROM 'approve' OR rt\.id IS NOT NULL/);
  assert.doesNotMatch(command, /UPDATE public\.attendance_expected_device_|DELETE FROM public\.attendance_expected_device_|current_date/);
});

test('contract serialization precedes stale guards, catalogue locking and overlap rejection across all areas', () => {
  const command = body('command'), approval = command.slice(command.indexOf("IF b->>'command'='approve' THEN"));
  assert.ok(command.indexOf('native-employment-lifecycle:v1:') < command.indexOf('INSERT INTO public.attendance_expected_device_proposal'));
  assert.match(command, /FOR UPDATE NOWAIT/);
  assert.match(approval, /pr\.subject_version IS DISTINCT FROM subject_value->>'subjectVersion'/);
  assert.match(approval, /pr\.history_snapshot IS DISTINCT FROM subject_value->'history'/);
  assert.match(approval, /attendance_expected_devices_catalog_v1\(c,true\)/);
  assert.match(approval, /pr\.device_snapshot IS DISTINCT FROM/);
  assert.match(approval, /other\.contract_id=pr\.contract_id/);
  assert.match(approval, /other\.valid_from<=pr\.valid_until AND pr\.valid_from<=other\.valid_until/);
  assert.match(approval, /other\.valid_from<retired\.effective_from AND pr\.valid_from<retired\.effective_from/);
  assert.ok(approval.indexOf('ATTENDANCE_EXPECTED_DEVICES_OVERLAP') < approval.indexOf('INSERT INTO public.attendance_expected_device_review'));
});

test('recovery checks live authority, exact actor/session/scope, and fingerprint before returning the stored immutable receipt', () => {
  const replay = body('replay');
  for (const column of ['tenant_id', 'source_binding_id', 'actor_membership_id', 'attempt_key']) assert.ok(replay.includes(column));
  assert.match(replay, /a\.actor_person_id IS DISTINCT FROM \(c->>'actorPersonId'\)::uuid/);
  assert.match(replay, /a\.actor_session_id IS DISTINCT FROM \(p->>'actorSessionId'\)::uuid/);
  assert.match(replay, /a\.actor_session_version IS DISTINCT FROM \(p->>'actorSessionVersion'\)::integer/);
  assert.match(replay, /a\.scope_version IS DISTINCT FROM c->>'scopeVersion'/);
  assert.match(replay, /fp IS NOT NULL AND fp IS DISTINCT FROM a\.request_sha256/);
  assert.ok(replay.indexOf('attendance_area_assert_scope_v1') < replay.indexOf("'receipt',a.receipt"));
  assert.match(replay, /'record',a\.result_record,'replayed',true/);
  assert.match(body('command'), /'body',b,'recordId',pr\.id/);
  assert.doesNotMatch(body('command'), /\bb\s*:=/);
});

test('effective source preserves prior days, denies missing/conflicting/stale evidence, and never certifies coverage', () => {
  const effective = fn('attendance_expected_devices_effective_v1');
  assert.equal(effective.volatility, 'STABLE');
  assert.match(effective.body, /decision\.decision='approve'/);
  assert.match(effective.body, /on_date BETWEEN prop\.valid_from AND prop\.valid_until/);
  assert.match(effective.body, /on_date<retired\.effective_from/);
  assert.match(effective.body, /IF matches<>1 THEN RETURN/);
  assert.match(effective.body, /public\.attendance_expected_devices_hash_v1\(h\) IS DISTINCT FROM pr\.subject_version/);
  assert.match(effective.body, /'expectedDeviceIds','\[\]'::jsonb/);
  assert.match(effective.body, /'expectedDeviceIds',to_jsonb\(pr\.device_ids\)/);
  assert.match(effective.body, /'coverageCertified',false/);
  assert.doesNotMatch(effective.body, /clock_timestamp|current_date|INSERT|UPDATE|DELETE/);
});

test('history is a closed three-event audit projection gated by its own scoped capability, not a raw row dump', () => {
  const read = body('read');
  assert.match(read, /attendance_area_context_v1\(p,'attendance.area.devices.audit.read'\)/);
  assert.match(read, /audit_allowed:=public\.attendance_expected_devices_scope_matches_v1\(audit_ctx,area_value\)/);
  assert.match(read, /history_value:='\[\]'::jsonb;\s*IF audit_allowed THEN/);
  assert.match(read, /'auditAvailable',audit_allowed,'historyComplete',audit_allowed/);
  assert.doesNotMatch(read, /to_jsonb\((proposal|review|retirement)\)|actor_email|actor_session_id|reason_sha256/);
});
