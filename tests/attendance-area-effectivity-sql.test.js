// Comprobaciones estáticas de la migración 244. La ejecución real se ensaya en una copia aislada
// de la base (ver docs/ATTENDANCE_AREA_EFFECTIVITY_20261119.md); estas pruebas fijan lo que el ensayo validó.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const sql = readFileSync('scripts/migrations/244-attendance-area-effectivity-declaration.sql', 'utf8');
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
function functionBody(source, name) {
  const at = source.search(new RegExp('CREATE (?:OR REPLACE )?FUNCTION public\\.' + name + '\\('));
  assert.notEqual(at, -1, name);
  const rest = source.slice(at), tag = /AS (\$[a-z_0-9]*\$)/.exec(rest)[1], start = rest.indexOf(tag) + tag.length;
  return rest.slice(start, rest.indexOf(tag, start));
}
const created = [...sql.matchAll(/^CREATE FUNCTION public\.([a-z0-9_]+)\(/gm)].map(m => m[1]);
const V1 = 'public.attendance_area_history_v1(', V2 = 'public.attendance_area_history_v2(';

test('es una preparación aditiva: exige sus requisitos, no se instala dos veces y no abre su propia transacción', () => {
  assert.match(sql, /RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_PREREQUISITE'/); assert.match(sql, /RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_ALREADY_INSTALLED'/);
  assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m);
  assert.doesNotMatch(sql, /\b(DROP|ALTER FUNCTION|CREATE OR REPLACE|DISABLE TRIGGER|SET ROLE|session_replication_role)\b/);
  assert.doesNotMatch(sql, /INSERT INTO public\.(iam_|tenant_membership|attendance_area_scope)/, 'no concede capacidades, roles ni alcances');
  assert.equal(new Set(created).size, created.length); assert.equal(created.length, 17);
});
test('las tablas son privadas, con RLS e inmutables; la aprobación independiente vive también en la tabla', () => {
  for (const table of ['proposal', 'item', 'review']) {
    const name = 'attendance_area_effectivity_' + table;
    assert.match(sql, new RegExp('ALTER TABLE public\\.' + name + ' ENABLE ROW LEVEL SECURITY;'));
    assert.match(sql, new RegExp('CREATE TRIGGER ' + name + '_immutable BEFORE UPDATE OR DELETE ON public\\.' + name + '\\s+FOR EACH ROW EXECUTE FUNCTION public\\.reject_immutable_source_change\\(\\);'));
    assert.match(sql, new RegExp('CREATE TRIGGER ' + name + '_no_truncate BEFORE TRUNCATE ON public\\.' + name + '\\s+FOR EACH STATEMENT EXECUTE FUNCTION public\\.reject_immutable_source_change\\(\\);'));
  }
  assert.match(sql, /REVOKE ALL ON public\.attendance_area_effectivity_proposal,public\.attendance_area_effectivity_item,\s+public\.attendance_area_effectivity_review FROM PUBLIC,municontrol_actions_runtime_app;/);
  const guard = functionBody(sql, 'attendance_area_effectivity_review_guard_v1');
  assert.match(guard, /NEW\.decision='approve' AND \(NEW\.actor_membership_id=q\.actor_membership_id OR NEW\.actor_person_id=q\.actor_person_id\s+OR NEW\.actor_email=q\.actor_email\)/);
  const items = functionBody(sql, 'attendance_area_effectivity_item_guard_v1');
  assert.match(items, /attendance_area_effectivity_review r WHERE r\.proposal_id=NEW\.proposal_id/); assert.match(items, />=q\.item_count/);
  assert.doesNotMatch(sql.slice(sql.indexOf('CREATE TABLE public.attendance_area_effectivity_proposal'), sql.indexOf('CREATE INDEX')), /full_name|legajo|document|cuil/i);
});
test('toda función queda revocada y sólo las dos fachadas autenticadas se conceden a la aplicación', () => {
  const revoke = /REVOKE ALL ON FUNCTION ([^;]+) FROM PUBLIC,municontrol_actions_runtime_app;/.exec(sql)[1];
  for (const name of created) assert.ok(revoke.includes('public.' + name + '('), 'revocada: ' + name);
  const grant = /GRANT EXECUTE ON FUNCTION ([^;]+) TO municontrol_actions_runtime_app;/.exec(sql)[1].replace(/\s+/g, '');
  assert.equal(grant, 'public.attendance_area_effectivity_read_v1(jsonb,jsonb),public.attendance_area_effectivity_command_v1(jsonb,jsonb,uuid)');
  assert.equal([...sql.matchAll(/GRANT /g)].length, 1);
  for (const name of created) assert.match(sql, new RegExp('CREATE FUNCTION public\\.' + name + '\\([^$]*SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp'), name);
  for (const facade of ['read_v1', 'command_v1']) {
    const body = functionBody(sql, 'attendance_area_effectivity_' + facade);
    assert.match(body, /public\.attendance_area_effectivity_context_v1\(p,/, facade + ' autentica antes de cualquier lectura');
  }
  const context = functionBody(sql, 'attendance_area_effectivity_context_v1');
  assert.match(context, /attendance_gateway_assert_session_v1\(/); assert.match(context, /tenant_iam_assert_no_sod_conflict\(/);
  assert.match(context, /capability_key IN\('employee\.record\.propose','employee\.record\.approve'\)/); assert.match(context, /time_catalog_native_actor_v2\(/);
});
test('v2 delega primero en v1, no toca a los contratos con alta propia y sólo resuelve con declaración aprobada', () => {
  const body = functionBody(sql, 'attendance_area_history_v2');
  assert.match(body, /base:=public\.attendance_area_history_v1\(ctx,target,first_date,last_date\);\s+IF base->>'status' IS DISTINCT FROM 'blocked'\s+OR base->'reasons' IS DISTINCT FROM jsonb_build_array\('AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED'\) THEN RETURN base;END IF;/);
  assert.match(body, /chain->>'reason' IN\('AREA_HISTORY_NOT_ADOPTED','AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED'\)\s+THEN RETURN base;/);
  const order = ['AREA_HISTORY_RANGE_NOT_ACTIVE', 'AREA_HISTORY_DECLARATION_REQUIRED', 'AREA_HISTORY_CHAIN_INVALID', 'AREA_HISTORY_EFFECTIVITY_REQUIRED', 'AREA_HISTORY_DECLARATION_NOT_EFFECTIVE', "'status','resolved'"].map(mark => body.indexOf(mark));
  assert.deepEqual([...order].sort((a, b) => a - b), order); assert.ok(order.every(at => at > 0));
  assert.match(body, /declaration:=public\.attendance_area_effectivity_in_force_v1\(ctx,target,chain\);/); assert.match(body, /first_date<\(declaration->>'effectiveFrom'\)::date/);
  const inForce = functionBody(sql, 'attendance_area_effectivity_in_force_v1');
  assert.match(inForce, /r\.decision='approve'/); assert.match(inForce, /ORDER BY r\.reviewed_at DESC,r\.id DESC LIMIT 1/, 'rige la última declaración aprobada que incluye al contrato');
  assert.match(inForce, /later\.ordinal-1>item\.change_revision AND later\.value IS DISTINCT FROM area_value/);
  assert.match(inForce, /chain->'areas'->item\.change_revision IS DISTINCT FROM area_value THEN state_value:='chain_invalid'/);
  assert.match(body, /'status','resolved','reasons','\[\]'::jsonb/, 'una respuesta resuelta no conserva el motivo del bloqueo de v1');
});
test('la cadena parte de la imagen aprobada de la adopción y termina exactamente en la fila canónica', () => {
  const body = functionBody(sql, 'attendance_area_effectivity_chain_v1');
  assert.match(body, /previous_snapshot:=a\.after_contract;/); assert.match(body, /previous_snapshot IS DISTINCT FROM to_jsonb\(c\)/);
  assert.match(body, /x\.decision='approve'\s+AND x\.applied_xid=a\.applied_xid/); assert.match(body, /native_employment_void_review r WHERE r\.contract_id=target AND r\.decision='approve'/);
  assert.match(body, /public\.attendance_area_effectivity_guards_v1\(\) IS NOT TRUE/);
  for (const key of ['adoptionProposalId', 'adoptionReviewId', 'registrationId', 'origin']) assert.ok(body.includes('{native,' + key + '}'), key);
  assert.match(body, /change_row\.actor_membership_id=change_proposal\.actor_membership_id/); assert.match(body, /life_row\.before_contract->'intervals' IS DISTINCT FROM active_intervals/);
});
test('las guardas fijan los cuerpos originales de la adopción tal como están versionados', () => {
  const guards = functionBody(sql, 'attendance_area_effectivity_guards_v1');
  const m132 = readFileSync('scripts/migrations/132-employment-adoption-preparation.sql', 'utf8'), m133 = readFileSync('scripts/migrations/133-employment-adoption-application.sql', 'utf8');
  for (const [source, name] of [[m132, 'employment_adoption_immutable_v1'], [m133, 'employment_adoption_application_guard_v1'], [m133, 'employment_adoption_application_before_v1']])
    assert.ok(guards.includes("'" + sha(functionBody(source, name)) + "'"), name);
  // La 133 ya no describe el predicado de adopción vigente: se usa la huella que la 182 atestó sobre la base instalada.
  const attested = /"name":"employment_adoption_update_allowed_v1","signature":"public\.employment_adoption_update_allowed_v1\(public\.employment_contract,public\.employment_contract\)","sha256":"([a-f0-9]{64})"/
    .exec(readFileSync('scripts/migrations/182-own-payroll-period-context.sql', 'utf8'))[1];
  assert.ok(guards.includes("('public.employment_adoption_update_allowed_v1(public.employment_contract,public.employment_contract)','" + attested + "')"));
  assert.match(guards, /public\.attendance_area_history_guards_v1\(\) IS TRUE/);
  for (const trigger of ['employment_adoption_application_immutable', 'employment_adoption_decision_immutable', 'native_employment_void_review_immutable',
    'attendance_area_effectivity_proposal_immutable', 'attendance_area_effectivity_item_guard', 'attendance_area_effectivity_review_guard', 'attendance_area_effectivity_review_no_truncate'])
    assert.ok(guards.includes("'" + trigger + "'"), trigger);
});
test('los cuatro consumidores se cambian sólo si su cuerpo instalado es exactamente el compuesto y revisado', () => {
  const derived = {
    attendance_area_population_v1: 'scripts/candidates/attendance-expected-devices-v1.derived.sql.txt',
    attendance_expected_devices_effective_v1: 'scripts/candidates/attendance-expected-devices-v1.derived.sql.txt',
    attendance_expected_devices_subject_v1: 'scripts/candidates/attendance-expected-devices-v1.derived.sql.txt',
    attendance_area_workdays_read_v1: 'scripts/candidates/attendance-area-workdays-v1.derived.sql.txt',
  };
  const block = sql.slice(sql.indexOf('DO $consumers$'));
  const rows = [...block.matchAll(/\('public\.([a-z0-9_]+)\(([a-z,]+)\)','([a-f0-9]{64})',(\d),'([a-f0-9]{64})'\)/g)];
  assert.equal(rows.length, 4); let calls = 0;
  for (const [, name, , before, count, after] of rows) {
    const body = functionBody(readFileSync(derived[name], 'utf8'), name);
    assert.equal(sha(body), before, name + ' antes'); assert.equal(body.split(V1).length - 1, Number(count), name + ' llamadas');
    assert.equal(sha(body.replaceAll(V1, V2)), after, name + ' después'); calls += Number(count);
  }
  assert.equal(calls, 5);
  assert.match(block, /actual IS DISTINCT FROM item\.before_sha256 OR occurrences IS DISTINCT FROM item\.calls/);
  assert.match(block, /RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_CONSUMER_CHANGED'/); assert.match(block, /RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_CONSUMER_RESULT'/);
  const all = readFileSync('scripts/candidates/attendance-expected-devices-v1.derived.sql.txt', 'utf8') + readFileSync('scripts/candidates/attendance-area-workdays-v1.derived.sql.txt', 'utf8');
  assert.equal([...all.matchAll(/[=,]public\.attendance_area_history_v1\(ctx,/g)].length, 5, 'no queda otra llamada compuesta fuera de la lista');
});
test('preparar y decidir serializan el corte, son idempotentes y verifican que la lista siga vigente', () => {
  const body = functionBody(sql, 'attendance_area_effectivity_apply_v1');
  assert.match(body, /pg_try_advisory_xact_lock\(hashtextextended\('attendance-area-effectivity:v1:'/);
  assert.match(body, /LOCK TABLE public\.native_employment_change_review,public\.native_employment_lifecycle_review,\s+public\.native_employment_void_review IN SHARE MODE NOWAIT;/);
  assert.match(body, /current_setting\('transaction_isolation'\)<>'read committed'/, 'el sello necesita una foto posterior a los bloqueos');
  assert.match(body, /selected:=preview->'scopes'->\(input->>'scope'\);/); assert.match(body, /selected->>'version' IS DISTINCT FROM input->>'previewVersion'/);
  for (const code of ['IDEMPOTENCY_CONFLICT', 'DATE_INVALID', 'PENDING_EXISTS', 'NOTHING_TO_DECLARE', 'PREVIEW_CHANGED', 'NOT_FOUND', 'ALREADY_REVIEWED', 'PROPOSAL_CHANGED', 'SAME_ACTOR', 'STALE', 'CAPABILITY_REQUIRED', 'ACTOR_REQUIRED', 'BUSY'])
    assert.ok(body.includes("'ATTENDANCE_AREA_EFFECTIVITY_" + code + "'"), code);
  assert.ok(body.indexOf("'ATTENDANCE_AREA_EFFECTIVITY_SAME_ACTOR'") < body.indexOf('INSERT INTO public.attendance_area_effectivity_review'));
  assert.match(body, /effective_value<DATE '1900-01-01' OR effective_value>today/); assert.match(body, /NOT public\.attendance_area_effectivity_fresh_v1\(ctx,q\.id\)/);
  assert.match(body, /own AND ctx->'capabilities' \? 'employee\.record\.propose'/, 'quien preparó puede retirar su propia declaración');
});
test('las lecturas para la pantalla nunca proyectan contratos; sólo totales, áreas y huellas', () => {
  const state = functionBody(sql, 'attendance_area_effectivity_state_v1');
  assert.match(state, /'all',\(preview#>'\{scopes,all\}'\)-'items','missing',\(preview#>'\{scopes,missing\}'\)-'items'/); assert.doesNotMatch(state, /contractId|legacy_legajo|full_name/);
  const record = functionBody(sql, 'attendance_area_effectivity_record_v1');
  assert.doesNotMatch(record, /'contractId'|legacy_legajo|full_name|person_identity/);
});
test('las reglas de PL/pgSQL que enseñó el ensayo cubren esta migración', () => {
  const rules = readFileSync('tests/install-composition.test.js', 'utf8');
  assert.equal(rules.split("'scripts/migrations/244-attendance-area-effectivity-declaration.sql'").length - 1, 2, 'CASE dentro de IF y precedencia de operadores JSON');
});
