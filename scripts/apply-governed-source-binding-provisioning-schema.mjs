import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directIsolatedDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import {
  EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
  EXISTING_IDENTITY_MEMBERSHIP_RUNTIME_FUNCTION_ALLOWLIST,
  verifyExistingIdentityMembershipFinalAcl,
} from './apply-existing-identity-membership-governance-schema.mjs';

export const GOVERNED_SOURCE_BINDING_MIGRATION_VERSION =
  '014-governed-source-binding-provisioning';
const MIGRATION_URL = new URL(
  './migrations/014-governed-source-binding-provisioning.sql', import.meta.url,
);
const PREREQUISITE_URL = new URL(
  './migrations/013-existing-identity-membership-governance.sql', import.meta.url,
);
const PLATFORM_CORE_SOURCE_URL = new URL(
  './migrations/009-tenant-lifecycle-hardening.sql', import.meta.url,
);
const GENERIC_CORE_SOURCE_URL = new URL(
  './migrations/005-tenant-identity-gateway.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

export const GOVERNED_SOURCE_BINDING_SIGNATURES = Object.freeze({
  bindCore: 'public.tenant_identity_bind_source_core_014(text,uuid,integer,text,uuid,text,integer,jsonb)',
  platformCore: 'public.tenant_identity_apply_platform_command_core_014(text,uuid,integer,text,text,uuid,text,integer,jsonb)',
  platformFacade: 'public.tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb)',
  sourceOnboardingView: 'public.tenant_identity_source_onboarding_view_v1(text,uuid,integer,text,uuid)',
  genericFacade: 'public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)',
  genericCore: 'public.tenant_identity_apply_command_core_009(text,text,uuid,text,integer,jsonb)',
});

export const GOVERNED_SOURCE_BINDING_RUNTIME_FUNCTION_ALLOWLIST = Object.freeze([
  ...EXISTING_IDENTITY_MEMBERSHIP_RUNTIME_FUNCTION_ALLOWLIST,
  GOVERNED_SOURCE_BINDING_SIGNATURES.sourceOnboardingView,
]);

export const GOVERNED_SOURCE_BINDING_REASON_CONSTRAINT =
  "CHECK ((reason_code IS NULL AND reason_hash IS NULL) OR (reason_code IS NOT NULL AND reason_hash IS NOT NULL AND reason_code IN ('certify_data_plane','delivery_kill_switch','bind_source') AND reason_hash ~ '^[a-f0-9]{64}$'))";

export const GOVERNED_SOURCE_BINDING_PROTECTED_RELATIONS = Object.freeze([
  'platform_tenant_source_binding', 'tenant_identity_policy',
  'source_import_batch', 'employment_contract', 'tenant_iam_event',
  'tenant_identity_platform_event_context',
]);

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function governedSourceBindingReasonConstraintFingerprint(value) {
  try {
    let source = String(value || '').replaceAll('"', '').toLowerCase()
      .replace(/::\s*(?:character varying|text|bpchar)(?:\s*\[\s*\])?/g, '');
    for (let iteration = 0; iteration < 4; iteration += 1) {
      source = source.replace(/\(\s*(reason_code|reason_hash)\s*\)/g, '$1');
    }
    source = source.replace(
      /=\s*any\s*\(\s*\(\s*array\s*\[([^\]]*)\]\s*\)\s*\)/g,
      ' in ($1)',
    );
    source = source.replace(
      /=\s*any\s*\(\s*array\s*\[([^\]]*)\]\s*\)/g,
      ' in ($1)',
    );
    const tokens = [];
    for (let index = 0; index < source.length;) {
      const tail = source.slice(index);
      const whitespace = tail.match(/^\s+/);
      if (whitespace) { index += whitespace[0].length; continue; }
      const literal = tail.match(/^'(?:''|[^'])*'/);
      if (literal) { tokens.push(literal[0]); index += literal[0].length; continue; }
      const word = tail.match(/^[a-z_][a-z0-9_]*/);
      if (word) { tokens.push(word[0]); index += word[0].length; continue; }
      if ('(),~'.includes(tail[0])) { tokens.push(tail[0]); index += 1; continue; }
      throw new Error('token inesperado');
    }
    let cursor = 0;
    const peek = () => tokens[cursor];
    const consume = (expected) => {
      if (tokens[cursor] !== expected) throw new Error(`se esperaba ${expected}`);
      cursor += 1;
    };
    const combine = (operator, left, right) => [
      operator,
      ...(left[0] === operator ? left.slice(1) : [left]),
      ...(right[0] === operator ? right.slice(1) : [right]),
    ];
    let parseExpression;
    const parsePredicate = () => {
      const column = peek();
      if (!['reason_code', 'reason_hash'].includes(column)) throw new Error('columna inesperada');
      cursor += 1;
      if (peek() === 'is') {
        cursor += 1;
        const negated = peek() === 'not';
        if (negated) cursor += 1;
        consume('null');
        return [negated ? 'is_not_null' : 'is_null', column];
      }
      if (peek() === 'in') {
        cursor += 1;
        consume('(');
        const values = [];
        while (peek() !== ')') {
          const literal = peek();
          if (!literal?.startsWith("'")) throw new Error('literal IN inesperado');
          values.push(literal); cursor += 1;
          if (peek() === ',') cursor += 1;
          else if (peek() !== ')') throw new Error('separador IN inesperado');
        }
        consume(')');
        return ['in', column, ...values];
      }
      consume('~');
      const pattern = peek();
      if (!pattern?.startsWith("'")) throw new Error('regex inesperada');
      cursor += 1;
      return ['regex', column, pattern];
    };
    const parsePrimary = () => {
      if (peek() !== '(') return parsePredicate();
      consume('(');
      const expression = parseExpression();
      consume(')');
      return expression;
    };
    const parseAnd = () => {
      let expression = parsePrimary();
      while (peek() === 'and') {
        cursor += 1;
        expression = combine('and', expression, parsePrimary());
      }
      return expression;
    };
    parseExpression = () => {
      let expression = parseAnd();
      while (peek() === 'or') {
        cursor += 1;
        expression = combine('or', expression, parseAnd());
      }
      return expression;
    };
    consume('check'); consume('(');
    const parsed = parseExpression();
    consume(')');
    if (cursor !== tokens.length) throw new Error('tokens remanentes');
    return JSON.stringify(parsed);
  } catch {
    return '';
  }
}

function exactSet(actual, expected, label) {
  const got = [...new Set((actual || []).map(String))].sort();
  const wanted = [...new Set((expected || []).map(String))].sort();
  if (JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

function requireTokens(label, definition, tokens) {
  const body = normalized(definition);
  for (const token of tokens) {
    if (!body.includes(normalized(token))) {
      throw new Error(`${label} no contiene contrato ${token}`);
    }
  }
}

function functionSourceFromMigration(sql, functionName) {
  const start = String(sql).indexOf(`CREATE OR REPLACE FUNCTION ${functionName}(`);
  if (start < 0) throw new Error(`fuente SQL ausente para ${functionName}`);
  const bodyStartMarker = String(sql).indexOf('AS $$', start);
  if (bodyStartMarker < 0) throw new Error(`cuerpo SQL ausente para ${functionName}`);
  const bodyStart = bodyStartMarker + 'AS $$'.length;
  const bodyEnd = String(sql).indexOf('$$;', bodyStart);
  if (bodyEnd < 0) throw new Error(`cierre SQL ausente para ${functionName}`);
  return String(sql).slice(bodyStart, bodyEnd);
}

export function governedSourceBindingFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function governedSourceBindingFunctionSourceFingerprint(source) {
  return governedSourceBindingFingerprint(String(source || '').replace(/\r\n?/g, '\n').trim());
}

const [migrationSource, platformCoreMigrationSource, genericCoreMigrationSource] = await Promise.all([
  readFile(MIGRATION_URL, 'utf8'), readFile(PLATFORM_CORE_SOURCE_URL, 'utf8'),
  readFile(GENERIC_CORE_SOURCE_URL, 'utf8'),
]);

export const GOVERNED_SOURCE_BINDING_FUNCTION_SOURCE_HASHES = Object.freeze({
  [GOVERNED_SOURCE_BINDING_SIGNATURES.bindCore]: governedSourceBindingFunctionSourceFingerprint(
    functionSourceFromMigration(migrationSource, 'tenant_identity_bind_source_core_014'),
  ),
  [GOVERNED_SOURCE_BINDING_SIGNATURES.platformCore]: governedSourceBindingFunctionSourceFingerprint(
    functionSourceFromMigration(
      platformCoreMigrationSource, 'tenant_identity_apply_platform_command_v2',
    ),
  ),
  [GOVERNED_SOURCE_BINDING_SIGNATURES.platformFacade]: governedSourceBindingFunctionSourceFingerprint(
    functionSourceFromMigration(migrationSource, 'tenant_identity_apply_platform_command_v2'),
  ),
  [GOVERNED_SOURCE_BINDING_SIGNATURES.sourceOnboardingView]: governedSourceBindingFunctionSourceFingerprint(
    functionSourceFromMigration(migrationSource, 'tenant_identity_source_onboarding_view_v1'),
  ),
  [GOVERNED_SOURCE_BINDING_SIGNATURES.genericFacade]: governedSourceBindingFunctionSourceFingerprint(
    functionSourceFromMigration(platformCoreMigrationSource, 'tenant_identity_apply_command'),
  ),
  [GOVERNED_SOURCE_BINDING_SIGNATURES.genericCore]: governedSourceBindingFunctionSourceFingerprint(
    functionSourceFromMigration(genericCoreMigrationSource, 'tenant_identity_apply_command'),
  ),
});

export function validateGovernedSourceBindingMigrationSql(sql) {
  const body = normalized(sql);
  requireTokens('migracion 014', body, [
    '014-governed-source-binding-provisioning',
    'tenant_identity_apply_platform_command_core_014',
    'tenant_identity_bind_source_core_014',
    'tenant_identity_apply_platform_command_v2',
    'tenant_identity_source_onboarding_view_v1',
    "if p_command = 'bind_source' then",
    'tenant_lifecycle_assert_platform_capability_v2', "'platform.tenants.manage'",
    "p_release_sha !~ '^[a-f0-9]{40}$'", 'p_expected_version < 1',
    'policy_row.version is distinct from p_expected_version',
    "tenant_row.status not in ('onboarding','active')",
    "p_payload->>'sourcesystem' <> 'grh'",
    'batch.source_database = source_database_value',
    'batch.validation_state = \'published\'',
    'batch.legacy_import_run_id is not null',
    "contract.source_system = 'grh'", 'contract.source_batch_id = source_batch_row.id',
    'contract.legacy_company_id = source_company_id_value',
    'get diagnostics canonical_contract_count = row_count',
    'canonical_batch_count <> 1',
    'canonical_contract_count < 1',
    'insert into platform_tenant_source_binding', "tenant_id_value, 'grh'",
    'true, actor_email, now()', 'version = policy.version + 1',
    "'validationstate', source_batch_row.validation_state",
    "'contractcount', canonical_contract_count",
    'command_hash_value := encode(digest(convert_to(jsonb_build_object(',
    "'actorsessionid', p_actor_session_id", "'releaseSha', p_release_sha",
    "'callercommandhash', p_command_hash",
    'replay_context.actor_session_id is distinct from p_actor_session_id',
    'replay_context.actor_session_version is distinct from p_actor_session_version',
    'replay_context.release_sha is distinct from p_release_sha',
    'replay_context.expected_version is distinct from p_expected_version',
    'replay_context.command_hash is distinct from command_hash_value',
    'replay_context.reason_hash is distinct from reason_hash_value',
    'reason_code is not null and reason_hash is not null',
    "reason_code in ('certify_data_plane','delivery_kill_switch','bind_source')",
    "p_expected_version, 'bind_source', command_hash_value, 'bind_source', reason_hash_value",
    'source_binding_function_acl_hardening',
    'revoke all on function tenant_identity_bind_source_core_014',
    'revoke all on function tenant_identity_apply_platform_command_core_014',
    'revoke all on function tenant_identity_apply_command_core_009',
    'revoke insert, update, delete, truncate, references, trigger',
    'aclexplode(attribute.attacl)', 'acl.grantee = 0',
    'grant execute on function tenant_identity_apply_platform_command_v2',
    'grant execute on function tenant_identity_source_onboarding_view_v1',
    'grant execute on function tenant_identity_apply_command',
    'acl.grantee <> relation.relowner',
    'from public cascade', 'from municontrol_actions_runtime_app cascade',
  ]);

  const bindBody = normalized(functionSourceFromMigration(
    sql, 'tenant_identity_bind_source_core_014',
  ));
  const resultStart = bindBody.indexOf('result_value := jsonb_build_object');
  const auditStart = bindBody.indexOf('insert into tenant_iam_event', resultStart);
  if (resultStart < 0 || auditStart <= resultStart) {
    throw new Error('014 no construye resultado auditable antes del evento');
  }
  const publicResult = bindBody.slice(resultStart, auditStart);
  if (publicResult.includes('reason_value') || publicResult.includes("'reason'")) {
    throw new Error('014 filtra el motivo en resultado/replay');
  }
  if (publicResult.includes('actor_email') || publicResult.includes('verified_by_user_email')) {
    throw new Error('014 filtra PII del actor en resultado/replay');
  }
  if (/\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:public\.)?(?:source_import_batch|employment_contract|grh_[a-z0-9_]*|payroll_[a-z0-9_]*)\b/i.test(sql)) {
    throw new Error('014 intenta DML sobre datos canonicos o nominales');
  }
  if (/\b(?:create|alter|drop)\s+role\b/i.test(sql)
      || /\b(?:password|passwd|credential|api[_-]?key|authorization\s*:)\b/i.test(sql)
      || /\b(?:rolsuper|rolcreaterole|rolcreatedb|rolbypassrls)\s*=\s*true\b/i.test(sql)) {
    throw new Error('014 intenta crear credenciales o privilegios PostgreSQL');
  }
  if (body.includes('lower(batch.source_database)')
      || body.includes('lower(source_database_value)')
      || body.includes("upper(p_payload->>'sourcesystem')")) {
    throw new Error('014 normaliza coordenadas que deben ser exactas');
  }
  const capabilityAt = bindBody.indexOf('tenant_lifecycle_assert_platform_capability_v2');
  const replayAt = bindBody.indexOf('select * into replay from tenant_iam_event');
  const policyAt = bindBody.indexOf('select * into policy_row from tenant_identity_policy');
  const evidenceAt = bindBody.indexOf('select * into source_batch_row from source_import_batch');
  const insertAt = bindBody.indexOf('insert into platform_tenant_source_binding');
  if (capabilityAt < 0 || replayAt <= capabilityAt || policyAt <= replayAt
      || evidenceAt <= policyAt || insertAt <= evidenceAt) {
    throw new Error('014 no respeta revalidacion/replay/policy/evidencia/insert');
  }
  const wrapper = normalized(functionSourceFromMigration(
    sql, 'tenant_identity_apply_platform_command_v2',
  ));
  if (!wrapper.includes("if p_command = 'bind_source' then")
      || !wrapper.includes('tenant_identity_bind_source_core_014')
      || !wrapper.includes('tenant_identity_apply_platform_command_core_014')) {
    throw new Error('014 no conserva una unica fachada v2 con dispatch cerrado');
  }
  const facadeRevoke = body.lastIndexOf(
    'revoke all on function tenant_identity_apply_platform_command_v2',
  );
  const facadeGrant = body.lastIndexOf(
    'grant execute on function tenant_identity_apply_platform_command_v2',
  );
  if (facadeRevoke < 0 || facadeGrant <= facadeRevoke) {
    throw new Error('014 no reconcilia ACL de la fachada antes de conceder EXECUTE');
  }

  const onboardingBody = normalized(functionSourceFromMigration(
    sql, 'tenant_identity_source_onboarding_view_v1',
  ));
  requireTokens('lectura onboarding 014', onboardingBody, [
    "p_release_sha !~ '^[a-f0-9]{40}$'",
    'tenant_lifecycle_assert_platform_capability_v2', "'platform.tenants.manage'",
    "tenant.status in ('onboarding','active')", 'policy_row.version < 1',
    'binding_count > 1', 'verified_binding_count <> binding_count',
    'canonical_batch_count <> 1',
    "allowed_commands := jsonb_build_array('bind_source')",
    "allowed_commands := jsonb_build_array('certify_data_plane')",
    "allowed_commands := '[]'::jsonb",
    "'identitypolicy'", "'allowedcommands'", "'sourcebinding'", "'canonicalevidence'",
  ]);
  const onboardingResultAt = onboardingBody.indexOf('result_value := jsonb_build_object');
  const onboardingReturnAt = onboardingBody.indexOf('return result_value', onboardingResultAt);
  if (onboardingResultAt < 0 || onboardingReturnAt <= onboardingResultAt) {
    throw new Error('014 no construye lectura onboarding cerrada');
  }
  const onboardingResult = onboardingBody.slice(onboardingResultAt, onboardingReturnAt);
  for (const forbidden of [
    'p_actor_email', 'reason', 'source_database', 'source_company_id',
    'legacy_legajo', 'verified_by_user_email', 'certified_by_user_email',
  ]) {
    if (onboardingResult.includes(forbidden)) {
      throw new Error(`014 filtra coordenada o PII en onboarding: ${forbidden}`);
    }
  }
  return true;
}

function validateFunction(row, signature) {
  if (!row || row.signature !== signature || row.securityDefiner !== true
      || row.ownerMatches !== true || row.language !== 'plpgsql'
      || row.kind !== 'f' || row.returnType !== 'jsonb'
      || row.volatility !== 'v' || row.safeSearchPath !== true) {
    throw new Error(`funcion insegura 014: ${signature}`);
  }
  const expectedHash = GOVERNED_SOURCE_BINDING_FUNCTION_SOURCE_HASHES[signature];
  if (expectedHash && governedSourceBindingFunctionSourceFingerprint(row.source) !== expectedHash) {
    throw new Error(`definicion de funcion 014 con drift: ${signature}`);
  }
}

export function validateGovernedSourceBindingEvidence(evidence) {
  const functions = new Map((evidence?.functions || []).map((row) => [row.signature, row]));
  for (const signature of Object.keys(GOVERNED_SOURCE_BINDING_FUNCTION_SOURCE_HASHES)) {
    validateFunction(functions.get(signature), signature);
  }
  const genericFacade = functions.get(GOVERNED_SOURCE_BINDING_SIGNATURES.genericFacade);
  const genericCore = functions.get(GOVERNED_SOURCE_BINDING_SIGNATURES.genericCore);
  requireTokens('wrapper generico 014', genericFacade.source, [
    "'bind_source'", 'identity_platform_command_requires_v2',
  ]);
  if ((genericFacade.grants || []).includes('PUBLIC:EXECUTE')) {
    throw new Error('wrapper generico 014 expuesto a PUBLIC');
  }
  const owner = functions.get(GOVERNED_SOURCE_BINDING_SIGNATURES.platformFacade)?.owner;
  if (!owner) throw new Error('owner de funciones 014 ausente');
  exactSet(functions.get(GOVERNED_SOURCE_BINDING_SIGNATURES.bindCore)?.grants,
    [`${owner}:EXECUTE`], 'ACL core bind_source 014');
  exactSet(functions.get(GOVERNED_SOURCE_BINDING_SIGNATURES.platformCore)?.grants,
    [`${owner}:EXECUTE`], 'ACL core platform 014');
  exactSet(functions.get(GOVERNED_SOURCE_BINDING_SIGNATURES.platformFacade)?.grants,
    [`${owner}:EXECUTE`, `${RUNTIME_ROLE}:EXECUTE`], 'ACL fachada platform 014');
  exactSet(functions.get(GOVERNED_SOURCE_BINDING_SIGNATURES.sourceOnboardingView)?.grants,
    [`${owner}:EXECUTE`, `${RUNTIME_ROLE}:EXECUTE`], 'ACL lectura onboarding 014');
  exactSet(genericFacade.grants,
    [`${owner}:EXECUTE`, `${RUNTIME_ROLE}:EXECUTE`], 'ACL fachada generica 009');
  exactSet(genericCore.grants, [`${owner}:EXECUTE`], 'ACL core generico 009');
  if (evidence?.contextConstraintValidated !== true
      || governedSourceBindingReasonConstraintFingerprint(evidence?.contextConstraint)
        !== governedSourceBindingReasonConstraintFingerprint(
          GOVERNED_SOURCE_BINDING_REASON_CONSTRAINT,
        )) {
    throw new Error('constraint de motivo 014 no es exacta o validada');
  }
  if (evidence?.runtimeRole?.exists !== true
      || evidence.runtimeRole.login !== true || evidence.runtimeRole.inherit !== false
      || evidence.runtimeRole.superuser !== false || evidence.runtimeRole.createDb !== false
      || evidence.runtimeRole.createRole !== false || evidence.runtimeRole.replication !== false
      || evidence.runtimeRole.bypassRls !== false
      || evidence.runtimeRole.schemaUsage !== true
      || evidence.runtimeRole.schemaCreate !== false
      || Number(evidence.runtimeRole.membershipCount) !== 0) {
    throw new Error('rol runtime 014 fuera de contrato');
  }
  if (!Array.isArray(evidence?.roleMemberships)) {
    throw new Error('inventario de membresias runtime 014 incompleto');
  }
  const membershipsGrantedToRuntime = evidence.roleMemberships
    .filter((row) => row.direction === 'granted_to_runtime');
  const membersOfRuntime = evidence.roleMemberships
    .filter((row) => row.direction === 'member_of_runtime');
  if (membershipsGrantedToRuntime.length || membersOfRuntime.length > 1
      || Number(evidence.runtimeRole.grantedToMemberCount) !== membersOfRuntime.length
      || membersOfRuntime.some((row) => (
        row.memberIsCurrentUser !== true || row.adminOption !== true
          || row.inheritOption !== false || row.setOption !== false
          || row.memberOwnsApprovedFunctions !== true
      ))) {
    throw new Error('membresias runtime 014 permiten escalamiento fuera de la arista owner');
  }
  exactSet(evidence?.runtimeFunctions,
    GOVERNED_SOURCE_BINDING_RUNTIME_FUNCTION_ALLOWLIST, 'EXECUTE runtime 014');
  if (!Array.isArray(evidence?.runtimeFunctionOwnerDrift)
      || evidence.runtimeFunctionOwnerDrift.length) {
    throw new Error('owner global de fachadas runtime 014 fuera de contrato');
  }
  exactSet((evidence?.relationDml || []).map((row) => row.name),
    GOVERNED_SOURCE_BINDING_PROTECTED_RELATIONS, 'relaciones protegidas 014');
  for (const relation of evidence?.relationDml || []) {
    if (relation.ownerMatches !== true) {
      throw new Error(`owner de relacion protegida 014 fuera de contrato: ${relation.name}`);
    }
    if ((relation.nonOwnerTableDml || []).length
        || (relation.nonOwnerColumnDml || []).length) {
      throw new Error(`DML no-owner 014 expuesto: ${relation.name}`);
    }
    for (const privilege of [
      'insert', 'update', 'delete', 'truncate', 'references', 'trigger',
      'columnInsert', 'columnUpdate', 'columnReferences',
      'publicTablePrivileges', 'publicColumnPrivileges',
    ]) {
      if (relation[privilege] !== false) {
        throw new Error(`DML runtime 014 expuesto: ${relation.name}.${privilege}`);
      }
    }
  }
  if (!Array.isArray(evidence?.runtimeRelations)
      || !Array.isArray(evidence?.runtimeSequences)) {
    throw new Error('inventario ACL runtime global 014 incompleto');
  }
  const runtimeRelationNames = new Set();
  for (const relation of evidence.runtimeRelations) {
    const relationKey = `${relation.schemaName}.${relation.name}`;
    if (runtimeRelationNames.has(relationKey)) {
      throw new Error(`inventario runtime 014 duplica ${relationKey}`);
    }
    runtimeRelationNames.add(relationKey);
    if (relation.canSelect || relation.canInsert || relation.canUpdate
        || relation.canReferences || relation.canDelete || relation.canTruncate
        || relation.canTrigger) {
      throw new Error(`runtime 014 conserva privilegio directo en ${relationKey}`);
    }
  }
  for (const name of GOVERNED_SOURCE_BINDING_PROTECTED_RELATIONS) {
    if (!runtimeRelationNames.has(`public.${name}`)) {
      throw new Error(`inventario runtime 014 omite public.${name}`);
    }
  }
  for (const sequence of evidence.runtimeSequences) {
    if (sequence.canUsage || sequence.canSelect || sequence.canUpdate) {
      throw new Error(
        `runtime 014 conserva privilegio de secuencia en ${sequence.schemaName}.${sequence.name}`,
      );
    }
  }
  return true;
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function collectEvidence(client) {
  const signatures = Object.values(GOVERNED_SOURCE_BINDING_SIGNATURES);
  const functionsResult = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosrc AS source,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownerMatches",
      owner.rolname AS owner,
      language.lanname AS language,
      function_row.prokind AS kind,
      pg_get_function_result(function_row.oid) AS "returnType",
      function_row.provolatile AS volatility,
      function_row.proconfig @> ARRAY['search_path=public, pg_temp']::text[] AS "safeSearchPath",
      COALESCE((
        SELECT array_agg(
          COALESCE(grantee.rolname, 'PUBLIC') || ':' || acl.privilege_type
          ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
        )
        FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
      ), ARRAY[]::text[]) AS grants
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_language language ON language.oid = function_row.prolang
    JOIN pg_roles owner ON owner.oid = function_row.proowner
    WHERE function_row.oid = ANY($1::regprocedure[])
    ORDER BY function_row.oid::regprocedure::text
  `, [signatures]);
  const contextConstraint = await client.query(`
    SELECT pg_get_constraintdef(constraint_row.oid, true) AS definition,
      constraint_row.convalidated AS validated
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.tenant_identity_platform_event_context'::regclass
      AND constraint_row.conname = 'tenant_identity_platform_event_context_reason_ck'
  `);
  const runtimeRole = await client.query(`
    SELECT role_row.oid IS NOT NULL AS exists, role_row.rolcanlogin AS login,
      role_row.rolinherit AS inherit, role_row.rolsuper AS superuser,
      role_row.rolcreatedb AS "createDb", role_row.rolcreaterole AS "createRole",
      role_row.rolreplication AS replication, role_row.rolbypassrls AS "bypassRls",
      (SELECT count(*)::integer FROM pg_auth_members membership
        WHERE membership.member = role_row.oid) AS "membershipCount",
      (SELECT count(*)::integer FROM pg_auth_members membership
        WHERE membership.roleid = role_row.oid) AS "grantedToMemberCount"
      , has_schema_privilege(role_row.oid, 'public', 'USAGE') AS "schemaUsage"
      , has_schema_privilege(role_row.oid, 'public', 'CREATE') AS "schemaCreate"
    FROM pg_roles role_row WHERE role_row.rolname = $1
  `, [RUNTIME_ROLE]);
  const runtimeFunctions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.proowner = current_user::regrole::oid AS "ownerMatches"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public'
      AND function_row.prosecdef IS TRUE
      AND has_function_privilege($1, function_row.oid, 'EXECUTE')
    ORDER BY signature
  `, [RUNTIME_ROLE]);
  const roleMemberships = await client.query(`
    SELECT CASE WHEN membership.member = runtime_role.oid THEN 'granted_to_runtime'
        ELSE 'member_of_runtime' END AS direction,
      membership.admin_option AS "adminOption", membership.inherit_option AS "inheritOption",
      membership.set_option AS "setOption",
      membership.member = current_user::regrole::oid AS "memberIsCurrentUser",
      (SELECT count(*)::integer = cardinality($2::text[])
          AND COALESCE(bool_and(function_row.proowner = membership.member), false)
       FROM pg_proc function_row
       JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
       WHERE format('%s.%s(%s)', namespace.nspname, function_row.proname,
         replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[])
      ) AS "memberOwnsApprovedFunctions"
    FROM pg_auth_members membership
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    WHERE membership.member = runtime_role.oid OR membership.roleid = runtime_role.oid
  `, [RUNTIME_ROLE, GOVERNED_SOURCE_BINDING_RUNTIME_FUNCTION_ALLOWLIST]);
  const relationDml = await client.query(`
    SELECT relation.relname AS name,
      relation.relowner = current_user::regrole::oid AS "ownerMatches",
      has_table_privilege($1, relation.oid, 'INSERT') AS insert,
      has_table_privilege($1, relation.oid, 'UPDATE') AS update,
      has_table_privilege($1, relation.oid, 'DELETE') AS delete,
      has_table_privilege($1, relation.oid, 'TRUNCATE') AS truncate,
      has_table_privilege($1, relation.oid, 'REFERENCES') AS references,
      has_table_privilege($1, relation.oid, 'TRIGGER') AS trigger,
      has_any_column_privilege($1, relation.oid, 'INSERT') AS "columnInsert",
      has_any_column_privilege($1, relation.oid, 'UPDATE') AS "columnUpdate",
      has_any_column_privilege($1, relation.oid, 'REFERENCES') AS "columnReferences",
      EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          relation.relacl, acldefault('r', relation.relowner)
        )) acl WHERE acl.grantee = 0
      ) AS "publicTablePrivileges",
      EXISTS (
        SELECT 1 FROM pg_attribute attribute
        CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
        WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0
          AND attribute.attisdropped IS FALSE AND acl.grantee = 0
      ) AS "publicColumnPrivileges"
      , COALESCE(ARRAY(
        SELECT COALESCE(grantee.rolname, 'PUBLIC') || ':' || acl.privilege_type
        FROM aclexplode(COALESCE(
          relation.relacl, acldefault('r', relation.relowner)
        )) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE acl.grantee <> relation.relowner
          AND acl.privilege_type IN (
            'INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
          )
        ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type
      ), ARRAY[]::text[]) AS "nonOwnerTableDml",
      COALESCE(ARRAY(
        SELECT COALESCE(grantee.rolname, 'PUBLIC') || ':'
          || attribute.attname || ':' || acl.privilege_type
        FROM pg_attribute attribute
        CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0
          AND attribute.attisdropped IS FALSE
          AND acl.grantee <> relation.relowner
          AND acl.privilege_type IN ('INSERT','UPDATE','REFERENCES')
        ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), attribute.attname,
          acl.privilege_type
      ), ARRAY[]::text[]) AS "nonOwnerColumnDml"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r','p')
      AND relation.relname = ANY($2::text[])
    ORDER BY relation.relname
  `, [RUNTIME_ROLE, GOVERNED_SOURCE_BINDING_PROTECTED_RELATIONS]);
  const runtimeRelations = await client.query(`
    SELECT namespace.nspname AS "schemaName", relation.relname AS name,
      has_any_column_privilege($1, relation.oid, 'SELECT') AS "canSelect",
      has_any_column_privilege($1, relation.oid, 'INSERT') AS "canInsert",
      has_any_column_privilege($1, relation.oid, 'UPDATE') AS "canUpdate",
      has_any_column_privilege($1, relation.oid, 'REFERENCES') AS "canReferences",
      has_table_privilege($1, relation.oid, 'DELETE') AS "canDelete",
      has_table_privilege($1, relation.oid, 'TRUNCATE') AS "canTruncate",
      has_table_privilege($1, relation.oid, 'TRIGGER') AS "canTrigger"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r','p','v','m','f')
    ORDER BY namespace.nspname, relation.relname
  `, [RUNTIME_ROLE]);
  const runtimeSequences = await client.query(`
    SELECT namespace.nspname AS "schemaName", relation.relname AS name,
      has_sequence_privilege($1, relation.oid, 'USAGE') AS "canUsage",
      has_sequence_privilege($1, relation.oid, 'SELECT') AS "canSelect",
      has_sequence_privilege($1, relation.oid, 'UPDATE') AS "canUpdate"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'S'
    ORDER BY namespace.nspname, relation.relname
  `, [RUNTIME_ROLE]);
  return {
    functions: rows(functionsResult),
    contextConstraint: rows(contextConstraint)[0]?.definition || '',
    contextConstraintValidated: rows(contextConstraint)[0]?.validated === true,
    runtimeRole: rows(runtimeRole)[0],
    roleMemberships: rows(roleMemberships),
    runtimeFunctions: rows(runtimeFunctions).map((row) => row.signature),
    runtimeFunctionOwnerDrift: rows(runtimeFunctions)
      .filter((row) => row.ownerMatches !== true).map((row) => row.signature),
    relationDml: rows(relationDml),
    runtimeRelations: rows(runtimeRelations),
    runtimeSequences: rows(runtimeSequences),
  };
}

export async function verifyGovernedSourceBindingFinalAcl(client) {
  validateGovernedSourceBindingEvidence(await collectEvidence(client));
}

async function verifyPrerequisite(client) {
  const expected = governedSourceBindingFingerprint(await readFile(PREREQUISITE_URL, 'utf8'));
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION}`);
  }
}

async function verifyNoUnledgeredObjects(client) {
  const reserved = await client.query(`
    SELECT
      to_regprocedure('public.tenant_identity_apply_platform_command_core_014(text,uuid,integer,text,text,uuid,text,integer,jsonb)') IS NOT NULL AS "platformCoreExists",
      to_regprocedure('public.tenant_identity_bind_source_core_014(text,uuid,integer,text,uuid,text,integer,jsonb)') IS NOT NULL AS "bindCoreExists",
      to_regprocedure('public.tenant_identity_source_onboarding_view_v1(text,uuid,integer,text,uuid)') IS NOT NULL AS "sourceOnboardingViewExists"
  `);
  const present = Object.entries(rows(reserved)[0] || {})
    .filter(([, exists]) => exists === true).map(([name]) => name);
  if (present.length) throw new Error(`objetos 014 sin ledger: ${present.join(',')}`);
}

async function verifyProtectedRelationOwners(client) {
  const result = await client.query(`
    SELECT relation.relname AS name,
      relation.relowner = current_user::regrole::oid AS "ownerMatches"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r','p')
      AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname
  `, [GOVERNED_SOURCE_BINDING_PROTECTED_RELATIONS]);
  exactSet(rows(result).map((row) => row.name),
    GOVERNED_SOURCE_BINDING_PROTECTED_RELATIONS, 'preflight relaciones 014');
  const drift = rows(result).filter((row) => row.ownerMatches !== true).map((row) => row.name);
  if (drift.length) {
    throw new Error(`owner de relacion protegida 014 fuera de contrato: ${drift.join(',')}`);
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateGovernedSourceBindingMigrationSql(migration);
  const fingerprint = governedSourceBindingFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directIsolatedDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:source-binding-014'))");
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [GOVERNED_SOURCE_BINDING_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${GOVERNED_SOURCE_BINDING_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredObjects(client);
      await verifyExistingIdentityMembershipFinalAcl(client);
      await verifyProtectedRelationOwners(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${GOVERNED_SOURCE_BINDING_MIGRATION_VERSION} sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [GOVERNED_SOURCE_BINDING_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyGovernedSourceBindingFinalAcl(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${GOVERNED_SOURCE_BINDING_MIGRATION_VERSION}: reapply verificado (fingerprint SHA-256 ${fingerprint})`
      : `${GOVERNED_SOURCE_BINDING_MIGRATION_VERSION}: fresh apply (${statements.length} sentencias, fingerprint SHA-256 ${fingerprint})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
