// Text invariants of migration 243. Nothing here connects to a database: the migration is not installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AREA_SCOPE_REFERENCE_FORBIDDEN, AREA_SCOPE_CAPABILITIES, AREA_SCOPE_CAPABILITY_LABELS} from '../assets/attendance-area-scopes-model.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const FILE = 'scripts/migrations/243-attendance-area-scope-administration.sql';
const AUTHORITY = 'scripts/candidates/attendance-area-authority-v1.source.sql.txt';
const raw = read(FILE), sql = raw.replace(/--[^\n]*/g, ''), authority = read(AUTHORITY);
const body = name => {
  const start = sql.indexOf('CREATE FUNCTION public.' + name + '('), end = sql.indexOf('\n$$;', start);
  assert.ok(start >= 0 && end > start, name);
  return sql.slice(start, end + 4);
};
const helper = body('attendance_area_scope_admin_context_v1'), reader = body('attendance_area_scope_admin_read_v1'),
  writer = body('attendance_area_scope_admin_command_v1');
const OWN = ['attendance_area_scope_admin_context_v1(jsonb,boolean)', 'attendance_area_scope_admin_read_v1(jsonb,jsonb)', 'attendance_area_scope_admin_command_v1(jsonb,jsonb,uuid)'];
const squeeze = text => text.replace(/\s+/g, ' ').trim();
const increasing = (text, markers) => markers.reduce((from, marker) => {
  const at = text.indexOf(marker, from);
  assert.ok(at >= from && at >= 0, 'fuera de orden o ausente: ' + marker);
  return at + 1;
}, 0);

test('243: la guarda inicial exige el módulo de áreas instalado y se niega a instalar dos veces, antes de crear nada', () => {
  assert.ok(sql.trimStart().startsWith('DO $prerequisite$'));
  const end = sql.indexOf('$prerequisite$;'), block = sql.slice(0, end);
  assert.ok(end > 0 && end < sql.indexOf('CREATE FUNCTION'));
  for (const relation of ['attendance_area_scope', 'attendance_area_scope_event', 'tenant_membership', 'internal_users', 'platform_tenant', 'tenant_identity_policy',
    'platform_tenant_source_binding', 'tenant_iam_event', 'iam_role_capability', 'tenant_membership_capability_override',
    'native_employment_catalog_proposal', 'native_employment_catalog_review'])
    assert.ok(block.includes("to_regclass('public." + relation + "') IS NULL"), relation);
  for (const signature of ['attendance_area_context_v1(jsonb,text)', 'attendance_area_catalog_label_v1(jsonb,jsonb)', 'native_employee_catalog_v1(jsonb)',
    'grh_curated_source_read_lock_v1()', 'tenant_lifecycle_assert_platform_capability_v2(text,uuid,integer,text)',
    'tenant_iam_effective_capabilities(uuid)', 'digest(text,text)'])
    assert.ok(block.includes("to_regprocedure('public." + signature + "') IS NULL"), signature);
  assert.ok(block.includes("to_regrole('municontrol_actions_runtime_app') IS NULL"));
  increasing(block, ["RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_ADMIN_PREREQUISITE'", ...OWN.map(s => "to_regprocedure('public." + s + "') IS NOT NULL"),
    "RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_ADMIN_ALREADY_INSTALLED'"]);
});

test('243: sólo agrega tres funciones; no redefine, altera ni borra nada existente y no usa SQL dinámico', () => {
  const created = [...sql.matchAll(/\bCREATE\s+(OR\s+REPLACE\s+)?([A-Z]+)\s+(public\.[a-z_0-9]+)\(([a-z_ ,]*)\)/g)];
  assert.deepEqual(created.map(m => [m[1] ?? '', m[2], m[3]]), OWN.map(s => ['', 'FUNCTION', 'public.' + s.split('(')[0]]));
  assert.deepEqual(created.map(m => m[4]), ['p_context jsonb,p_writer boolean', 'p_context jsonb,p_query jsonb', 'p_context jsonb,p_command jsonb,p_key uuid']);
  assert.equal((sql.match(/\bCREATE\b/g) ?? []).length, 3);
  assert.doesNotMatch(sql, /\b(?:ALTER|DROP|TRUNCATE|COMMENT\s+ON|DELETE\s+FROM|SECURITY\s+INVOKER|OR\s+REPLACE)\b/i);
  // Sin SQL dinámico: los únicos EXECUTE son los dos GRANT finales.
  assert.equal((sql.match(/\bEXECUTE\b/gi) ?? []).length, 2);
  assert.doesNotMatch(sql, /\bformat\s*\(|quote_ident|quote_literal|\bPREPARE\b|\bEXECUTE\s+(?!ON FUNCTION)/i);
  // Lo único que escribe: la fila de área y el evento administrativo. Nunca concede una capacidad ni toca roles.
  assert.deepEqual([...sql.matchAll(/\bINSERT\s+INTO\s+(public\.[a-z_0-9]+)/g)].map(m => m[1]), ['public.attendance_area_scope', 'public.tenant_iam_event']);
  assert.deepEqual([...sql.matchAll(/\bUPDATE\s+(public\.[a-z_0-9]+)/g)].map(m => m[1]), ['public.attendance_area_scope']);
  assert.doesNotMatch(helper + reader, /\b(?:INSERT|UPDATE|DELETE)\b/, 'sólo la fachada de cambios escribe');
});

test('243: las dos fachadas y la función privada son SECURITY DEFINER con search_path fijo y hora UTC', () => {
  for (const text of [helper, reader, writer]) {
    const header = text.slice(0, text.indexOf('AS $$'));
    assert.match(header, /\)\s+RETURNS jsonb\s+LANGUAGE plpgsql VOLATILE SECURITY DEFINER\s+SET search_path=pg_catalog,public,pg_temp\s+SET timezone='UTC'\s*$/);
  }
});

test('243: revoca PUBLIC en las tres y concede EXECUTE sólo a las dos fachadas, sólo al rol de ejecución', () => {
  const tail = sql.slice(sql.lastIndexOf('\n$$;') + 4).split(';').map(squeeze).filter(Boolean);
  assert.deepEqual(tail, [
    'REVOKE ALL ON FUNCTION public.' + OWN[0] + ' FROM PUBLIC,municontrol_actions_runtime_app',
    'REVOKE ALL ON FUNCTION public.' + OWN[1] + ' FROM PUBLIC',
    'REVOKE ALL ON FUNCTION public.' + OWN[2] + ' FROM PUBLIC',
    'GRANT EXECUTE ON FUNCTION public.' + OWN[1] + ' TO municontrol_actions_runtime_app',
    'GRANT EXECUTE ON FUNCTION public.' + OWN[2] + ' TO municontrol_actions_runtime_app',
  ]);
  assert.equal((sql.match(/\bGRANT\b/g) ?? []).length, 2);
  assert.equal((sql.match(/\bREVOKE\b/g) ?? []).length, 3);
});

test('243: la autoridad es la de la administración de plataforma y se comprueba antes de leer o bloquear cualquier cosa', () => {
  // La misma comprobación de sesión y capacidad que usan las escritoras de administración (009 y 028).
  const admin009 = read('scripts/migrations/009-tenant-lifecycle-hardening.sql'), admin028 = read('scripts/migrations/028-governed-account-profile.sql');
  assert.match(admin009, /CREATE OR REPLACE FUNCTION tenant_lifecycle_assert_platform_capability_v2\(\s*p_actor_email text,\s*p_actor_session_id uuid,\s*p_actor_session_version integer,\s*p_capability_key text\s*\)/);
  assert.match(admin009, /PERFORM tenant_iam_assert_platform_session_v2\(\s*p_actor_email, p_actor_session_id, p_actor_session_version\s*\);\s*IF p_capability_key NOT IN \(\s*'platform\.tenants\.manage', 'platform\.users\.manage',/);
  assert.match(admin009, /CASE WHEN p_command = 'replace_action_scopes'\s+THEN 'platform\.roles\.manage' ELSE 'platform\.users\.manage' END/, 'los alcances existentes exigen platform.roles.manage');
  assert.match(admin028, /PERFORM tenant_lifecycle_assert_platform_capability_v2\(\s*actor_email, p_actor_session_id, p_actor_session_version,\s*'platform\.users\.manage'\s*\);/);
  assert.match(read('api/internal-admin.js'), /update_access: 'platform\.users\.manage',[\s\S]*replace_action_scopes: 'platform\.roles\.manage',/);

  assert.equal((helper.match(/public\.tenant_lifecycle_assert_platform_capability_v2\(/g) ?? []).length, 2);
  assert.match(helper, /PERFORM public\.tenant_lifecycle_assert_platform_capability_v2\(\s*actor_email,actor_session,actor_session_version,'platform\.users\.manage'\);\s+IF p_writer THEN\s+PERFORM public\.tenant_lifecycle_assert_platform_capability_v2\(\s*actor_email,actor_session,actor_session_version,'platform\.roles\.manage'\);\s+END IF;/);
  increasing(helper, ["'ATTENDANCE_AREA_SCOPE_SESSION_INVALID'", "'platform.users.manage'", "'platform.roles.manage'", 'FROM public.internal_users', 'FROM public.platform_tenant',
    'FROM public.tenant_identity_policy', 'FROM public.platform_tenant_source_binding', 'LOCK TABLE public.attendance_area_scope IN SHARE ROW EXCLUSIVE MODE NOWAIT',
    'LOCK TABLE public.iam_role_capability', 'public.grh_curated_source_read_lock_v1()', 'public.native_employee_catalog_v1(', 'FROM public.attendance_area_scope']);
  // Contexto exacto de cinco claves: sesión de plataforma más el municipio administrado; nunca una membresía.
  assert.match(helper, /jsonb_object_keys\(p_context\)\)<>5\s+OR NOT p_context \?& ARRAY\['actorEmail','actorSessionId','actorSessionVersion','releaseSha','tenantId'\]/);
  // Municipio activo, versión certificada y fuente GRH certificada de ese municipio, como 010 y 028.
  assert.match(helper, /tenant\.id=tenant_id_value AND tenant\.status='active'/);
  assert.match(helper, /policy\.tenant_id=tenant_row\.id AND policy\.tenant_data_plane_ready IS TRUE\s+AND lower\(policy\.certified_release_sha\)=\(p_context->>'releaseSha'\)/);
  assert.match(helper, /binding\.id=policy_row\.certified_source_binding_id AND binding\.tenant_id=tenant_row\.id\s+AND binding\.source_system='GRH' AND binding\.verified IS TRUE/);
  assert.equal((helper.match(/'ATTENDANCE_AREA_SCOPE_TENANT_NOT_READY'/g) ?? []).length, 3);

  // La lectura pide el contexto sin escritura; el cambio lo pide con escritura y antes de cualquier otra cosa.
  increasing(reader, ["'ATTENDANCE_AREA_SCOPE_QUERY_INVALID'", 'ctx:=public.attendance_area_scope_admin_context_v1(p_context,false);', 'FROM public.tenant_membership', 'FROM public.attendance_area_scope']);
  const gate = writer.indexOf('ctx:=public.attendance_area_scope_admin_context_v1(p_context,true);');
  assert.ok(gate > 0);
  for (const later of ['pg_advisory_xact_lock', 'FROM public.tenant_iam_event', 'FROM public.tenant_membership', 'FROM public.attendance_area_scope', 'INSERT INTO', 'UPDATE public.attendance_area_scope', 'public.attendance_area_catalog_label_v1('])
    assert.ok(writer.indexOf(later) > gate, later + ' ocurre después de comprobar la autoridad');
  assert.doesNotMatch(reader + writer, /tenant_lifecycle_assert_platform_capability_v2|FROM public\.platform_tenant\b/, 'las fachadas no repiten ni reemplazan la comprobación: la delegan');
});

test('243: cada rechazo se decide en SQL y en un orden que no filtra ni escribe de más', () => {
  increasing(writer, ["'ATTENDANCE_AREA_SCOPE_COMMAND_INVALID'", "'ATTENDANCE_AREA_SCOPE_CAPABILITY_INVALID'", "'ATTENDANCE_AREA_SCOPE_REFERENCE_INVALID'",
    'public.attendance_area_scope_admin_context_v1(p_context,true)', 'pg_advisory_xact_lock', 'FROM public.tenant_iam_event', "'ATTENDANCE_AREA_SCOPE_IDEMPOTENCY_REUSED'",
    "'ATTENDANCE_AREA_SCOPE_STALE'", "'ATTENDANCE_AREA_SCOPE_MEMBERSHIP_NOT_FOUND'", "'ATTENDANCE_AREA_SCOPE_SELF_ASSIGNMENT'", "'ATTENDANCE_AREA_SCOPE_MEMBERSHIP_NOT_ACTIVE'",
    "'ATTENDANCE_AREA_SCOPE_AREA_NOT_IN_CATALOG'", 'FOR UPDATE NOWAIT', "'ATTENDANCE_AREA_SCOPE_NOT_FOUND'", 'INSERT INTO public.attendance_area_scope',
    'UPDATE public.attendance_area_scope', 'INSERT INTO public.tenant_iam_event']);
  // Forma exacta del pedido y de su área; el sector nulo es el área exacta sin sector, nunca «todos».
  assert.match(writer, /jsonb_object_keys\(p_command\)\)<>6\s+OR NOT p_command \?& ARRAY\['operation','membershipId','capability','area','authorizationReference','scopeSetVersion'\]/);
  assert.match(writer, /\(p_command->>'operation'\) NOT IN \('grant','withdraw'\)/);
  assert.match(writer, /jsonb_object_keys\(p_command->'area'\)\)<>2\s+OR NOT \(p_command->'area'\) \?& ARRAY\['organizationUnitSourceId','sectorSourceId'\]/);
  assert.equal((writer.match(/!~'\^\(0\|\[1-9\]\[0-9\]\{0,18\}\)\$'/g) ?? []).length, 2, 'los mismos identificadores que admite la tabla');
  assert.match(authority, /organization_unit_source_id~'\^\(0\|\[1-9\]\[0-9\]\{0,18\}\)\$'/);
  // Sólo las cuatro capacidades de asistencia por área, las mismas de la tabla y de la interfaz.
  const four = "'attendance.area.read','attendance.area.devices.propose', 'attendance.area.devices.approve','attendance.area.devices.audit.read'";
  assert.ok(squeeze(writer).includes('IF capability_value NOT IN (' + four + ') THEN'));
  assert.ok(squeeze(reader).includes('effective.capability_key IN (' + four + ')'));
  assert.deepEqual([...AREA_SCOPE_CAPABILITIES].sort(), four.replaceAll("'", '').split(/,\s*/).sort());
  assert.ok(authority.includes("CHECK(capability_key IN('attendance.area.read','attendance.area.devices.propose','attendance.area.devices.approve','attendance.area.devices.audit.read'))"));
  // Referencia obligatoria de 10 a 500 caracteres, sin símbolos de control ni marcas invisibles.
  assert.match(writer, /reference_value:=normalize\(btrim\(p_command->>'authorizationReference'\),NFC\);\s+IF length\(reference_value\) NOT BETWEEN 10 AND 500 OR reference_value~'\[<>\[:cntrl:\]\]'/);
  assert.ok(authority.includes('CHECK(length(btrim(authorization_reference)) BETWEEN 10 AND 500)'));
  // Versión del conjunto: se compara lo que vio quien administra con lo que hay bajo el bloqueo exclusivo.
  assert.match(writer, /IF \(p_command->>'scopeSetVersion'\) IS DISTINCT FROM \(ctx->>'scopeSetVersion'\) THEN\s+RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_STALE'/);
  // Cuenta de otro municipio: no se distingue de una inexistente. Cuenta propia: ni conceder ni retirar.
  assert.match(writer, /WHERE membership\.id=membership_id_value AND membership\.tenant_id=tenant_id_value\s+FOR SHARE NOWAIT;\s+IF NOT FOUND THEN\s+RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_MEMBERSHIP_NOT_FOUND'/);
  assert.match(writer, /IF lower\(target_row\.user_email\)=lower\(actor_email_value\) THEN\s+RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_SELF_ASSIGNMENT'/);
  assert.ok(writer.indexOf("'ATTENDANCE_AREA_SCOPE_SELF_ASSIGNMENT'") < writer.indexOf("IF operation_value='grant' THEN"), 'la cuenta propia se rechaza para conceder y para retirar');
  // Conceder exige cuenta activa y un área que la función de nombres de las lectoras pueda nombrar.
  assert.match(writer, /IF operation_value='grant' THEN\s+IF target_row\.status<>'active' THEN\s+RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_MEMBERSHIP_NOT_ACTIVE'/);
  assert.match(writer, /named_area:=public\.attendance_area_catalog_label_v1\(ctx->'catalog',area_value\);\s+EXCEPTION WHEN SQLSTATE 'P0001' THEN\s+IF SQLERRM IN \('ATTENDANCE_AREA_CATALOG_CHANGED','ATTENDANCE_AREA_QUERY_INVALID'\) THEN\s+RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_AREA_NOT_IN_CATALOG'/);
  assert.match(authority, /CREATE FUNCTION public\.attendance_area_catalog_label_v1\(catalog jsonb,area jsonb\) RETURNS jsonb/);
  for (const code of ['ATTENDANCE_AREA_CATALOG_CHANGED', 'ATTENDANCE_AREA_QUERY_INVALID']) assert.ok(authority.includes("RAISE EXCEPTION '" + code + "'"), code);
});

test('243: una sola escritora a la vez, versión siguiente exacta y repetición sin versión nueva', () => {
  // Bloqueo que entra en conflicto consigo mismo, tomado antes de leer el conjunto: dos pedidos no pueden insertar los dos.
  assert.match(helper, /IF p_writer THEN\s+LOCK TABLE public\.attendance_area_scope IN SHARE ROW EXCLUSIVE MODE NOWAIT;\s+END IF;/);
  // Después, los mismos bloqueos de lectura que toma attendance_area_context_v1.
  const locks = text => squeeze(text.match(/LOCK TABLE public\.iam_role_capability[\s\S]*?IN SHARE MODE NOWAIT;/)[0]).replaceAll(', ', ',');
  assert.equal(locks(helper), locks(authority));
  assert.ok(squeeze(authority).includes('PERFORM public.grh_curated_source_read_lock_v1();'));
  assert.match(writer, /AND coalesce\(s\.sector_source_id,''\)=coalesce\(sector_value,''\)\s+FOR UPDATE NOWAIT;/);
  assert.ok(authority.includes("(tenant_id,membership_id,source_binding_id,capability_key,organization_unit_source_id,coalesce(sector_source_id,''))"), 'la búsqueda usa la identidad única de la tabla');
  // La guarda de la tabla exige versión 1 al insertar y la siguiente exacta al actualizar.
  assert.ok(authority.includes("IF TG_OP='INSERT' AND NEW.version<>1 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_VERSION_CONFLICT'") && authority.includes('NEW.version<>OLD.version+1'));
  assert.match(writer, /VALUES\(tenant_id_value,membership_id_value,binding_id_value,capability_value,\s+unit_value,sector_value,true,1,reference_value,actor_email_value\)\s+RETURNING \* INTO scope_value;/);
  assert.match(writer, /ELSIF scope_value\.active IS DISTINCT FROM \(operation_value='grant'\) THEN\s+UPDATE public\.attendance_area_scope SET active=\(operation_value='grant'\),version=version\+1,\s+authorization_reference=reference_value,updated_by_user_email=actor_email_value\s+WHERE id=scope_value\.id\s+RETURNING \* INTO scope_value;/);
  assert.match(writer, /IF NOT FOUND THEN\s+IF operation_value='withdraw' THEN\s+RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_NOT_FOUND'/);
  // Ya aplicado: no hay INSERT ni UPDATE, y tampoco evento. Misma clave: sólo responde al mismo pedido, con la fila actual.
  assert.match(writer, /IF changed_value THEN\s+INSERT INTO public\.tenant_iam_event\(actor_user_email,tenant_id,membership_id,command,target_type,target_id,\s+idempotency_key,command_hash,result\)/);
  assert.match(writer, /PERFORM pg_advisory_xact_lock\(hashtextextended\(lower\(actor_email_value\)\|\|':'\|\|p_key::text,0\)\);\s+SELECT \* INTO replay_row FROM public\.tenant_iam_event event\s+WHERE event\.actor_user_email=actor_email_value AND event\.idempotency_key=p_key;/);
  assert.match(read('scripts/migrations/004-tenant-iam-control-plane.sql'), /pg_advisory_xact_lock\(hashtextextended\(lower\(p_actor_email\) \|\| ':' \|\| p_idempotency_key::text, 0\)\)/, 'misma clave de serialización que las escritoras de administración');
  assert.match(writer, /replay_row\.command IS DISTINCT FROM command_name\s+OR replay_row\.command_hash IS DISTINCT FROM command_hash_value/);
  // Bloqueos y abrazos mortales salen como un código estable, como en 240.
  for (const text of [reader, writer])
    assert.match(text, /EXCEPTION WHEN lock_not_available OR deadlock_detected THEN\s+RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_BUSY' USING ERRCODE='P0001';\s+END\s+\$\$;$/);
});

test('243: nada se lee ni se escribe fuera del municipio y de su fuente certificada', () => {
  // Toda consulta a la tabla de áreas lleva municipio y fuente (o la fila ya bloqueada por su id).
  const queries = [...sql.matchAll(/FROM public\.attendance_area_scope s\s+(?:LEFT JOIN[^\n]*\n\s*)*WHERE ([^;]*?)(?:;|\n\s*\))/g)].map(m => squeeze(m[1]));
  assert.equal(queries.length, 4);
  for (const where of queries) assert.match(where, /s\.tenant_id=\S+ AND .*s\.source_binding_id=|s\.tenant_id=\S+ AND s\.membership_id=\S+ AND s\.source_binding_id=|s\.id=\S+ AND s\.tenant_id=\S+ AND s\.source_binding_id=/, where);
  assert.equal((sql.match(/FROM public\.attendance_area_scope\b/g) ?? []).length, 4);
  // Las cuentas se listan sólo del municipio administrado, con lo que el lector de usuarios ya muestra a esta autoridad.
  assert.equal((reader.match(/WHERE membership\.tenant_id=\(ctx->>'tenantId'\)::uuid/g) ?? []).length, 2);
  const users009 = read('scripts/migrations/009-tenant-lifecycle-hardening.sql');
  for (const exposed of ["'email', lower(users.email)", "'displayName', users.display_name", "'roleKey', membership.role_key", "'status', membership.status"]) assert.ok(users009.includes(exposed), exposed);
  const account = reader.slice(reader.indexOf('), account AS MATERIALIZED ('), reader.indexOf('SELECT jsonb_build_object('));
  assert.deepEqual([...account.matchAll(/\bAS ([a-z_]+)[,\s]/g)].map(m => m[1]), ['role_key', 'status', 'email', 'display_name', 'is_self']);
  // Claves exactas de la respuesta: ni base, ni empresa, ni persona, ni contrato.
  const keys = text => [...text.matchAll(/'([A-Za-z]+)',/g)].map(m => m[1]);
  assert.deepEqual([...new Set(keys(reader.slice(reader.indexOf('SELECT jsonb_build_object('))))].sort(), ['active', 'areaCapabilities', 'areaInCatalog', 'authorizationReference',
    'capability', 'capabilityHeld', 'catalogVersion', 'displayName', 'email', 'grantable', 'id', 'label', 'membershipId', 'memberships', 'organizationUnitLabel',
    'organizationUnitSourceId', 'organizationUnits', 'resource', 'roleKey', 'scopeId', 'scopeSetVersion', 'scopes', 'sectorLabel', 'sectorSourceId', 'sectors', 'self',
    'status', 'tenantId', 'updatedAt', 'updatedByEmail', 'version'].sort());
  assert.doesNotMatch(reader + writer, /sourceDatabase|sourceCompanyId|password|person_identity|employment_contract|legajo/i);
  // La capacidad nunca se concede acá: sólo se informa si la cuenta la tiene hoy.
  assert.match(reader, /CROSS JOIN LATERAL public\.tenant_iam_effective_capabilities\(membership\.id\) effective/);
  assert.match(reader, /EXISTS \(SELECT 1 FROM held WHERE held\.membership_id=s\.membership_id\s+AND held\.capability_key=s\.capability_key::text\) AS capability_held/);
  // Sin recortes silenciosos.
  assert.match(reader, /jsonb_array_length\(result_value->'memberships'\)>1000 OR jsonb_array_length\(result_value->'scopes'\)>5000[\s\S]*RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_LIMIT'/);
});

test('243: los códigos de error son estables y cada uno tiene respuesta segura en la fachada de la aplicación', () => {
  const raised = [...new Set([...sql.matchAll(/RAISE EXCEPTION '([^']+)'/g)].map(m => m[1]))].sort();
  assert.deepEqual(raised, ['ADMIN_ALREADY_INSTALLED', 'ADMIN_PREREQUISITE', 'AREA_NOT_IN_CATALOG', 'BUSY', 'CAPABILITY_INVALID', 'CATALOG_UNAVAILABLE', 'COMMAND_INVALID',
    'IDEMPOTENCY_REUSED', 'LIMIT', 'MEMBERSHIP_NOT_ACTIVE', 'MEMBERSHIP_NOT_FOUND', 'NOT_FOUND', 'QUERY_INVALID', 'REFERENCE_INVALID', 'SELF_ASSIGNMENT', 'SESSION_INVALID',
    'STALE', 'TENANT_NOT_READY'].map(code => 'ATTENDANCE_AREA_SCOPE_' + code).sort());
  const functions = helper + reader + writer;
  assert.equal((functions.match(/RAISE EXCEPTION '/g) ?? []).length, (functions.match(/RAISE EXCEPTION '[A-Z_]+' USING ERRCODE='P0001';/g) ?? []).length);
  const lib = read('lib/internal-attendance-area-scopes.js');
  for (const code of raised.filter(code => !code.includes('_ADMIN_'))) assert.ok(lib.includes("['" + code + "',"), code + ' tiene traducción segura');
  for (const inherited of ['TENANT_IAM_SESSION_INVALID', 'TENANT_LIFECYCLE_PLATFORM_CAPABILITY_REQUIRED', 'NATIVE_EMPLOYEE_CATALOG_UNAVAILABLE', 'ATTENDANCE_AREA_SCOPE_VERSION_CONFLICT'])
    assert.ok(lib.includes("['" + inherited + "',"), inherited);
});

test('243: reglas del ensayo en PostgreSQL 17 (CASE dentro de IF y operadores JSON delante de + o -)', () => {
  const blank = src => src.replace(/--[^\n]*|'(?:''|[^'])*'/g, m => m.replace(/[^\n]/g, ' '));
  const tokens = [...blank(raw).matchAll(/[A-Za-z_][A-Za-z_0-9]*|\(|\)|;/g)].map(m => ({text: m[0], upper: m[0].toUpperCase()}));
  const offenders = [];
  tokens.forEach((token, i) => {
    if (!['IF', 'ELSIF'].includes(token.upper) || tokens[i - 1]?.upper === 'END') return;
    let depth = 0, sawCase = false;
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.text === '(') depth++; else if (t.text === ')') depth--; else if (t.text === ';') break;
      else if (depth === 0 && t.upper === 'CASE') sawCase = true;
      else if (depth === 0 && t.upper === 'THEN') { if (sawCase) offenders.push(i); break; }
    }
  });
  assert.deepEqual(offenders, []);
  assert.equal((blank(raw).match(/\bCASE\b/gi) ?? []).length, 0, 'ningún CASE: nada que el analizador de PL/pgSQL pueda cortar');
  assert.deepEqual(sql.match(/(?:->>?|#>>?)\s*(?:'[^']*'|[a-z_.]+)\s*[-+]\s*(?:'|[a-z0-9_(])/g) ?? [], []);
  // Un operador JSON seguido de un molde o de una comparación de patrón siempre va entre paréntesis.
  assert.doesNotMatch(sql, /->>'[A-Za-z]+'::/);
  assert.doesNotMatch(sql, /[a-z_]->>'[A-Za-z]+'\s*!~/);
  // Y el archivo figura en las dos listas de la prueba general de composición.
  assert.equal(read('tests/install-composition.test.js').split("'" + FILE + "'").length - 1, 2);
});

test('243: los caracteres que rechaza la referencia son los mismos en el navegador, el servidor y PostgreSQL', () => {
  const ranges = text => [...text.matchAll(/\\(\+[0-9A-F]{6}|[0-9A-F]{4})(?:-\\(\+[0-9A-F]{6}|[0-9A-F]{4}))?/g)]
    .map(m => [parseInt(m[1].replace('+', ''), 16), parseInt((m[2] ?? m[1]).replace('+', ''), 16)]);
  const merge = list => [...list].sort((a, b) => a[0] - b[0]).reduce((out, [first, last]) => {
    const previous = out.at(-1);
    if (previous && first <= previous[1] + 1) previous[1] = Math.max(previous[1], last); else out.push([first, last]);
    return out;
  }, []);
  const invisible = writer.match(/reference_value ~ U&'\[([^\]']+)\]'/)[1];
  // '[<>[:cntrl:]]': los dos signos, los controles C0 y DEL; los C1 van explícitos para no depender de la configuración regional.
  const postgres = merge([[0x00, 0x1f], [0x3c, 0x3c], [0x3e, 0x3e], [0x7f, 0x7f], ...ranges(invisible)]);
  assert.deepEqual(merge(AREA_SCOPE_REFERENCE_FORBIDDEN.map(([first, last]) => [first, last])), postgres);
  // Las etiquetas del catálogo se filtran con el patrón exacto de la función instalada que nombra las áreas.
  const installed = authority.match(/label_value~(U&'\[[^']+\]')/)[1];
  assert.ok(reader.includes('candidate.label !~ ' + installed));
  assert.deepEqual(merge(ranges(invisible)), merge([[0x80, 0x9f], ...ranges(installed)]));
});

test('243: cada tabla, columna y función que usa está definida en una migración o fuente revisada que llega al armado', () => {
  const referenced = [...new Set([...sql.matchAll(/\bpublic\.([a-z_0-9]+)/g)].map(m => m[1]))].sort();
  const ignore = read('.vercelignore');
  const tables = {
    attendance_area_scope: [AUTHORITY, ['id', 'tenant_id', 'membership_id', 'source_binding_id', 'capability_key', 'organization_unit_source_id', 'sector_source_id', 'active', 'version', 'authorization_reference', 'updated_by_user_email', 'updated_at']],
    attendance_area_scope_event: [AUTHORITY, ['scope_id', 'version']],
    tenant_membership: ['scripts/migrations/004-tenant-iam-control-plane.sql', ['id', 'tenant_id', 'user_email', 'role_key', 'status']],
    internal_users: ['scripts/internal-schema.sql', ['email', 'display_name', 'active']],
    platform_tenant: ['scripts/migrations/004-tenant-iam-control-plane.sql', ['id', 'status']],
    tenant_identity_policy: ['scripts/migrations/005-tenant-identity-gateway.sql', ['tenant_id', 'tenant_data_plane_ready', 'certified_source_binding_id', 'certified_release_sha']],
    platform_tenant_source_binding: ['scripts/migrations/004-tenant-iam-control-plane.sql', ['id', 'tenant_id', 'source_system', 'source_database', 'source_company_id', 'verified']],
    tenant_iam_event: ['scripts/migrations/004-tenant-iam-control-plane.sql', ['actor_user_email', 'tenant_id', 'membership_id', 'command', 'target_type', 'target_id', 'idempotency_key', 'command_hash', 'result']],
    iam_role_capability: ['scripts/migrations/004-tenant-iam-control-plane.sql', ['role_key', 'capability_key']],
    tenant_membership_capability_override: ['scripts/migrations/004-tenant-iam-control-plane.sql', ['membership_id', 'capability_key']],
    native_employment_catalog_proposal: ['scripts/migrations/103-native-employment-catalog.sql', ['tenant_id', 'source_binding_id', 'items']],
    native_employment_catalog_review: ['scripts/migrations/103-native-employment-catalog.sql', ['tenant_id', 'source_binding_id', 'decision']],
  };
  const functions = {
    attendance_area_context_v1: [AUTHORITY, /CREATE FUNCTION public\.attendance_area_context_v1\(p jsonb,required_capability text\) RETURNS jsonb/],
    attendance_area_catalog_label_v1: [AUTHORITY, /CREATE FUNCTION public\.attendance_area_catalog_label_v1\(catalog jsonb,area jsonb\) RETURNS jsonb/],
    native_employee_catalog_v1: ['scripts/migrations/103-native-employment-catalog.sql', /CREATE OR REPLACE FUNCTION public\.native_employee_catalog_v1\(ctx jsonb\) RETURNS jsonb/],
    grh_curated_source_read_lock_v1: ['scripts/migrations/099-grh-curated-consumers.sql', /CREATE OR REPLACE FUNCTION public\.grh_curated_source_read_lock_v1\(\) RETURNS void/],
    tenant_lifecycle_assert_platform_capability_v2: ['scripts/migrations/009-tenant-lifecycle-hardening.sql', /CREATE OR REPLACE FUNCTION tenant_lifecycle_assert_platform_capability_v2\(/],
    tenant_iam_effective_capabilities: ['scripts/migrations/006-tenant-action-authority.sql', /CREATE OR REPLACE FUNCTION tenant_iam_effective_capabilities\(p_membership_id uuid\)\s+RETURNS TABLE \(capability_key varchar\(96\)\)/],
    // pgcrypto, la misma sobrecarga que ya usa la fuente de autoridad instalada.
    digest: [AUTHORITY, /encode\(public\.digest\(jsonb_build_object\(/],
  };
  assert.deepEqual(referenced, [...Object.keys(tables), ...Object.keys(functions), ...OWN.map(s => s.split('(')[0])].sort());
  for (const [name, [file, columns]] of Object.entries(tables)) {
    assert.ok(ignore.includes('\n!' + file + '\n'), file + ' llega al armado');
    const source = read(file), start = source.search(new RegExp('CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?' + name + '\\s*\\('));
    assert.ok(start >= 0, name + ' se crea en ' + file);
    const definition = source.slice(start, source.indexOf('\n);', start));
    for (const column of columns) assert.match(definition, new RegExp('(?:\\(|\\s)' + column + '\\s+[a-z]'), name + '.' + column);
  }
  for (const [name, [file, pattern]] of Object.entries(functions)) {
    assert.ok(ignore.includes('\n!' + file + '\n'), file + ' llega al armado');
    assert.match(read(file), pattern, name);
  }
  // Las dos columnas que no están en la creación original de su tabla.
  assert.match(read('scripts/migrations/006-tenant-action-authority.sql'), /CREATE UNIQUE INDEX IF NOT EXISTS tenant_membership_id_tenant_id_uk\s+ON tenant_membership \(id, tenant_id\)/);
  // El catálogo aprobado lee exactamente estas cuatro claves del contexto que se le arma acá.
  const catalog = read('scripts/migrations/103-native-employment-catalog.sql');
  for (const key of ['tenantId', 'sourceBindingId', 'sourceDatabase', 'sourceCompanyId']) assert.ok(catalog.includes("ctx->>'" + key + "'"), key);
  assert.match(helper, /public\.native_employee_catalog_v1\(jsonb_build_object\(\s*'tenantId',tenant_row\.id,'sourceBindingId',binding_row\.id,\s*'sourceDatabase',binding_row\.source_database,'sourceCompanyId',binding_row\.source_company_id::text\)\);/);
  assert.ok(ignore.includes('\n!' + FILE + '\n'), 'la 243 llega al armado para estas pruebas');
});

test('243: los nombres de los permisos en pantalla son los del catálogo de capacidades', () => {
  for (const key of AREA_SCOPE_CAPABILITIES) assert.ok(authority.includes("('" + key + "','" + AREA_SCOPE_CAPABILITY_LABELS[key] + "',"), key);
});
