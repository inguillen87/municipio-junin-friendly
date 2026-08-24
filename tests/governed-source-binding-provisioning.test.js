import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  GOVERNED_SOURCE_BINDING_FUNCTION_SOURCE_HASHES,
  GOVERNED_SOURCE_BINDING_MIGRATION_VERSION,
  GOVERNED_SOURCE_BINDING_PROTECTED_RELATIONS,
  GOVERNED_SOURCE_BINDING_REASON_CONSTRAINT,
  GOVERNED_SOURCE_BINDING_RUNTIME_FUNCTION_ALLOWLIST,
  GOVERNED_SOURCE_BINDING_SIGNATURES,
  governedSourceBindingFingerprint,
  governedSourceBindingFunctionSourceFingerprint,
  validateGovernedSourceBindingEvidence,
  validateGovernedSourceBindingMigrationSql,
} from '../scripts/apply-governed-source-binding-provisioning-schema.mjs';

const migrationUrl = new URL(
  '../scripts/migrations/014-governed-source-binding-provisioning.sql', import.meta.url,
);
const lifecycleUrl = new URL(
  '../scripts/migrations/009-tenant-lifecycle-hardening.sql', import.meta.url,
);
const authorityUrl = new URL(
  '../scripts/migrations/006-tenant-action-authority.sql', import.meta.url,
);
const gatewayUrl = new URL(
  '../scripts/migrations/005-tenant-identity-gateway.sql', import.meta.url,
);
const applierUrl = new URL(
  '../scripts/apply-governed-source-binding-provisioning-schema.mjs', import.meta.url,
);

const [sql, lifecycleSql, authoritySql, gatewaySql, applier] = await Promise.all([
  readFile(migrationUrl, 'utf8'), readFile(lifecycleUrl, 'utf8'),
  readFile(authorityUrl, 'utf8'), readFile(gatewayUrl, 'utf8'),
  readFile(applierUrl, 'utf8'),
]);

function functionSource(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  assert.ok(start >= 0, `funcion ausente ${name}`);
  const bodyStart = source.indexOf('AS $$', start) + 'AS $$'.length;
  const bodyEnd = source.indexOf('$$;', bodyStart);
  assert.ok(bodyStart >= 'AS $$'.length && bodyEnd > bodyStart, `cuerpo ausente ${name}`);
  return source.slice(bodyStart, bodyEnd);
}

function validEvidence() {
  const owner = 'neondb_owner';
  const sources = {
    [GOVERNED_SOURCE_BINDING_SIGNATURES.bindCore]:
      functionSource(sql, 'tenant_identity_bind_source_core_014'),
    [GOVERNED_SOURCE_BINDING_SIGNATURES.platformCore]:
      functionSource(lifecycleSql, 'tenant_identity_apply_platform_command_v2'),
    [GOVERNED_SOURCE_BINDING_SIGNATURES.platformFacade]:
      functionSource(sql, 'tenant_identity_apply_platform_command_v2'),
    [GOVERNED_SOURCE_BINDING_SIGNATURES.sourceOnboardingView]:
      functionSource(sql, 'tenant_identity_source_onboarding_view_v1'),
    [GOVERNED_SOURCE_BINDING_SIGNATURES.genericFacade]:
      functionSource(lifecycleSql, 'tenant_identity_apply_command'),
    [GOVERNED_SOURCE_BINDING_SIGNATURES.genericCore]:
      functionSource(gatewaySql, 'tenant_identity_apply_command'),
  };
  const functions = Object.entries(sources).map(([signature, source]) => ({
    signature, source, securityDefiner: true, ownerMatches: true, owner,
    language: 'plpgsql', kind: 'f', returnType: 'jsonb', volatility: 'v',
    safeSearchPath: true,
    grants: [
      GOVERNED_SOURCE_BINDING_SIGNATURES.platformFacade,
      GOVERNED_SOURCE_BINDING_SIGNATURES.sourceOnboardingView,
      GOVERNED_SOURCE_BINDING_SIGNATURES.genericFacade,
    ].includes(signature)
      ? [`${owner}:EXECUTE`, 'municontrol_actions_runtime_app:EXECUTE']
      : [`${owner}:EXECUTE`],
  }));
  const runtimeRelations = GOVERNED_SOURCE_BINDING_PROTECTED_RELATIONS.map((name) => ({
    schemaName: 'public', name,
    canSelect: false, canInsert: false, canUpdate: false, canReferences: false,
    canDelete: false, canTruncate: false, canTrigger: false,
  }));
  return {
    functions,
    contextConstraint: GOVERNED_SOURCE_BINDING_REASON_CONSTRAINT,
    contextConstraintValidated: true,
    runtimeRole: {
      exists: true, login: true, inherit: false, superuser: false,
      createDb: false, createRole: false, replication: false, bypassRls: false,
      membershipCount: 0, grantedToMemberCount: 0,
      schemaUsage: true, schemaCreate: false,
    },
    runtimeFunctions: [...GOVERNED_SOURCE_BINDING_RUNTIME_FUNCTION_ALLOWLIST],
    runtimeFunctionOwnerDrift: [],
    roleMemberships: [],
    relationDml: GOVERNED_SOURCE_BINDING_PROTECTED_RELATIONS.map((name) => ({
      name, insert: false, update: false, delete: false,
      truncate: false, references: false, trigger: false,
      columnInsert: false, columnUpdate: false, columnReferences: false,
      publicTablePrivileges: false, publicColumnPrivileges: false,
      ownerMatches: true, nonOwnerTableDml: [], nonOwnerColumnDml: [],
    })),
    runtimeRelations,
    runtimeSequences: [],
  };
}

test('014 declara un artefacto versionado con fingerprint estable y gate aislado', () => {
  assert.equal(GOVERNED_SOURCE_BINDING_MIGRATION_VERSION,
    '014-governed-source-binding-provisioning');
  assert.match(governedSourceBindingFingerprint(sql), /^[a-f0-9]{64}$/);
  assert.equal(validateGovernedSourceBindingMigrationSql(sql), true);
  assert.match(applier, /directIsolatedDatabaseUrl\(\)/);
  assert.match(applier, /source-binding-014/);
  assert.match(applier, /verifyPrerequisite/);
  assert.match(applier, /checksum_sha256/);
  assert.match(applier, /Drift detectado/);
  assert.match(applier, /verifyNoUnledgeredObjects/);
  assert.match(applier, /verifyProtectedRelationOwners/);
  assert.match(applier, /relation\.relowner = current_user::regrole::oid/);
  assert.match(applier, /verifyGovernedSourceBindingFinalAcl/);
  assert.match(applier, /reapply verificado/);
});

test('014 usa la sesion platform MFA y capability exacta provistas por los prerequisitos', () => {
  const sessionGuard = functionSource(authoritySql, 'tenant_iam_assert_platform_session_v2');
  const capabilityGuard = functionSource(
    lifecycleSql, 'tenant_lifecycle_assert_platform_capability_v2',
  );
  const bindCore = functionSource(sql, 'tenant_identity_bind_source_core_014');
  assert.match(bindCore, /tenant_lifecycle_assert_platform_capability_v2\([^]*?'platform\.tenants\.manage'/);
  assert.match(capabilityGuard, /tenant_iam_assert_platform_session_v2/);
  assert.match(sessionGuard, /session\.source = 'platform'/);
  assert.match(sessionGuard, /session\.active_tenant_id IS NULL/);
  assert.match(sessionGuard, /session\.auth_level IN \('mfa', 'recovery'\)/);
  assert.match(sessionGuard, /session\.session_version = p_actor_session_version/);
});

test('014 acredita coordenadas GRH exactas y contratos published antes del INSERT verified', () => {
  const bindCore = functionSource(sql, 'tenant_identity_bind_source_core_014');
  const batchAt = bindCore.indexOf('SELECT * INTO source_batch_row FROM source_import_batch');
  const contractsAt = bindCore.indexOf('PERFORM contract.id FROM employment_contract', batchAt);
  const insertAt = bindCore.indexOf('INSERT INTO platform_tenant_source_binding', contractsAt);
  assert.ok(batchAt >= 0 && contractsAt > batchAt && insertAt > contractsAt);
  assert.match(bindCore, /p_payload->>'sourceSystem' <> 'GRH'/);
  assert.match(bindCore, /batch\.source_database = source_database_value/);
  assert.match(bindCore, /batch\.validation_state = 'published'/);
  assert.match(bindCore, /batch\.legacy_import_run_id IS NOT NULL/);
  assert.match(bindCore, /contract\.legacy_company_id = source_company_id_value/);
  assert.match(bindCore, /GET DIAGNOSTICS canonical_contract_count = ROW_COUNT/);
  assert.match(bindCore, /canonical_batch_count <> 1/);
  assert.match(bindCore, /SOURCE_BINDING_CANONICAL_EVIDENCE_AMBIGUOUS/);
  assert.match(bindCore, /tenant_row\.status NOT IN \('onboarding','active'\)/);
  assert.match(bindCore, /policy_row\.version IS DISTINCT FROM p_expected_version/);
  assert.match(bindCore, /version = policy\.version \+ 1/);
  assert.match(bindCore, /tenant_id_value, 'GRH', source_database_value, source_company_id_value,[\s\S]+true, actor_email, now\(\)/);
  assert.doesNotMatch(bindCore, /lower\(source_database_value\)|lower\(batch\.source_database\)/i);
});

test('014 expone una lectura onboarding reanudable, minima y fail-closed', () => {
  const view = functionSource(sql, 'tenant_identity_source_onboarding_view_v1');
  assert.match(view, /p_release_sha !~ '\^\[a-f0-9\]\{40\}\$'/);
  assert.match(view, /tenant_lifecycle_assert_platform_capability_v2\([^]*?'platform\.tenants\.manage'/);
  assert.match(view, /tenant\.status IN \('onboarding','active'\)/);
  assert.match(view, /policy_row\.version < 1/);
  assert.match(view, /binding_count > 1 OR verified_binding_count <> binding_count/);
  assert.match(view, /canonical_batch_count <> 1/);
  assert.match(view, /SOURCE_ONBOARDING_CANONICAL_EVIDENCE_AMBIGUOUS/);
  assert.match(view, /policy_row\.certified_release_sha IS DISTINCT FROM p_release_sha/);
  assert.match(view, /jsonb_build_array\('bind_source'\)/);
  assert.match(view, /jsonb_build_array\('certify_data_plane'\)/);
  assert.match(view, /allowed_commands := '\[\]'::jsonb/);
  const resultAt = view.indexOf('result_value := jsonb_build_object');
  const returnAt = view.indexOf('RETURN result_value', resultAt);
  const result = view.slice(resultAt, returnAt);
  for (const key of [
    "'identityPolicy'", "'allowedCommands'", "'sourceBinding'", "'canonicalEvidence'",
    "'sourceCutoff'", "'validationState'", "'contractCount'",
  ]) assert.match(result, new RegExp(key));
  assert.doesNotMatch(result, /actor|reason|sourceDatabase|sourceCompanyId|legacy_legajo|legajo|verified_by|certified_by/i);
  assert.doesNotMatch(result, /'tenantId'|'sourceBatchId'/);
});

test('014 liga replay a sesion, version, release, commandHash y motivo hasheado sin filtrarlos', () => {
  const bindCore = functionSource(sql, 'tenant_identity_bind_source_core_014');
  assert.match(bindCore, /command_hash_value := encode\(digest\(convert_to\(jsonb_build_object\(/);
  for (const token of [
    'p_actor_session_id', 'p_actor_session_version', 'p_release_sha',
    'p_expected_version', 'p_command_hash', 'p_payload',
  ]) assert.match(bindCore, new RegExp(token));
  assert.match(bindCore, /replay_context\.reason_hash IS DISTINCT FROM reason_hash_value/);
  assert.match(bindCore, /INSERT INTO tenant_identity_platform_event_context \([\s\S]+reason_code, reason_hash/);
  const resultStart = bindCore.indexOf('result_value := jsonb_build_object');
  const eventAt = bindCore.indexOf('INSERT INTO tenant_iam_event', resultStart);
  const result = bindCore.slice(resultStart, eventAt);
  assert.doesNotMatch(result, /reason_value|'reason'|actor_email|verified_by_user_email/);
  assert.match(result, /'sourceBatchId'/);
  assert.match(result, /'contractCount'/);
});

test('014 deja bind_source exclusivamente en la fachada v2 y oculta ambos cores', () => {
  const facade = functionSource(sql, 'tenant_identity_apply_platform_command_v2');
  const generic = functionSource(lifecycleSql, 'tenant_identity_apply_command');
  assert.match(facade, /IF p_command = 'bind_source' THEN[\s\S]+tenant_identity_bind_source_core_014/);
  assert.match(facade, /tenant_identity_apply_platform_command_core_014/);
  assert.match(generic, /'bind_source'/);
  assert.match(generic, /IDENTITY_PLATFORM_COMMAND_REQUIRES_V2/);
  assert.match(sql, /REVOKE ALL ON FUNCTION tenant_identity_bind_source_core_014[\s\S]+FROM municontrol_actions_runtime_app CASCADE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION tenant_identity_apply_platform_command_core_014[\s\S]+FROM municontrol_actions_runtime_app CASCADE/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION tenant_identity_apply_platform_command_v2[\s\S]+TO municontrol_actions_runtime_app/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION tenant_identity_source_onboarding_view_v1[\s\S]+TO municontrol_actions_runtime_app/);
  assert.match(sql, /REVOKE ALL ON FUNCTION tenant_identity_source_onboarding_view_v1[\s\S]+FROM PUBLIC CASCADE/);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]+platform_tenant_source_binding/);
  assert.match(sql, /source_binding_function_acl_hardening[\s\S]+tenant_identity_apply_command\(text,text,uuid,text,integer,jsonb\)'::regprocedure[\s\S]+tenant_identity_apply_command_core_009\(text,text,uuid,text,integer,jsonb\)'::regprocedure/);
  assert.match(sql, /aclexplode\(COALESCE\([\s\S]+relation\.relacl[\s\S]+acl\.grantee <> relation\.relowner/);
  assert.match(sql, /aclexplode\(attribute\.attacl\)[\s\S]+acl\.grantee = 0[\s\S]+acl\.grantee <> relation\.relowner/);
});

test('validador estatico 014 rechaza evidencia falsa, DML canonico, PII y ACL incompleta', () => {
  assert.throws(() => validateGovernedSourceBindingMigrationSql(
    sql.replaceAll("batch.validation_state = 'published'", "batch.validation_state = 'validated'"),
  ), /validation_state = 'published'/);
  assert.throws(() => validateGovernedSourceBindingMigrationSql(
    `${sql}\nUPDATE source_import_batch SET validation_state = 'published';`,
  ), /DML sobre datos canonicos/);
  assert.throws(() => validateGovernedSourceBindingMigrationSql(
    sql.replace("'replayed', false", "'reason', reason_value, 'replayed', false"),
  ), /filtra el motivo/);
  assert.throws(() => validateGovernedSourceBindingMigrationSql(
    sql.replace('GRANT EXECUTE ON FUNCTION tenant_identity_apply_platform_command_v2',
      'GRANT EXECUTE ON FUNCTION tenant_identity_bind_source_core_014'),
  ), /grant execute on function tenant_identity_apply_platform_command_v2|ACL de la fachada/);
  assert.throws(() => validateGovernedSourceBindingMigrationSql(
    sql.replace("'allowedCommands', allowed_commands", "'sourceDatabase', source_binding_row.source_database, 'allowedCommands', allowed_commands"),
  ), /filtra coordenada o PII/);
});

test('evidencia 014 exige fuente exacta, allowlist y cero DML runtime tambien al reaplicar', () => {
  const evidence = validEvidence();
  assert.equal(validateGovernedSourceBindingEvidence(evidence), true);
  assert.doesNotThrow(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    contextConstraint: "CHECK (((reason_code IS NULL) AND (reason_hash IS NULL)) OR ((reason_code IS NOT NULL) AND (reason_hash IS NOT NULL) AND ((reason_code)::text = ANY ((ARRAY['certify_data_plane'::character varying, 'delivery_kill_switch'::character varying, 'bind_source'::character varying])::text[])) AND ((reason_hash)::text ~ '^[a-f0-9]{64}$'::text)))",
  }));
  assert.doesNotThrow(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    contextConstraint: "CHECK (reason_code IS NULL AND reason_hash IS NULL OR reason_code IS NOT NULL AND reason_hash IS NOT NULL AND (reason_code::text = ANY (ARRAY['certify_data_plane'::character varying, 'delivery_kill_switch'::character varying, 'bind_source'::character varying]::text[])) AND reason_hash ~ '^[a-f0-9]{64}$'::text)",
  }));
  for (const [signature, hash] of Object.entries(GOVERNED_SOURCE_BINDING_FUNCTION_SOURCE_HASHES)) {
    const row = evidence.functions.find((entry) => entry.signature === signature);
    assert.equal(governedSourceBindingFunctionSourceFingerprint(row.source), hash);
  }
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    runtimeFunctions: evidence.runtimeFunctions.filter(
      (signature) => signature !== GOVERNED_SOURCE_BINDING_SIGNATURES.platformFacade,
    ),
  }), /EXECUTE runtime 014/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    runtimeFunctionOwnerDrift: [GOVERNED_SOURCE_BINDING_SIGNATURES.platformFacade],
  }), /owner global de fachadas runtime 014/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    relationDml: evidence.relationDml.map((row) => row.name === 'platform_tenant_source_binding'
      ? { ...row, insert: true } : row),
  }), /DML runtime 014 expuesto/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    functions: evidence.functions.map((row) => (
      row.signature === GOVERNED_SOURCE_BINDING_SIGNATURES.bindCore
        ? { ...row, grants: [...row.grants, 'municontrol_actions_runtime_app:EXECUTE'] }
        : row
    )),
  }), /ACL core bind_source 014/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    functions: evidence.functions.map((row) => (
      row.signature === GOVERNED_SOURCE_BINDING_SIGNATURES.genericCore
        ? { ...row, grants: [...row.grants, 'legacy_executor:EXECUTE'] }
        : row
    )),
  }), /ACL core generico 009/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    functions: evidence.functions.map((row) => (
      row.signature === GOVERNED_SOURCE_BINDING_SIGNATURES.genericFacade
        ? { ...row, grants: [...row.grants, 'legacy_executor:EXECUTE'] }
        : row
    )),
  }), /ACL fachada generica 009/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    contextConstraint: evidence.contextConstraint.replace(
      "'bind_source'", "'bind_source','unsafe_reason'",
    ),
  }), /constraint de motivo 014/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    contextConstraint: evidence.contextConstraint.replace(
      'reason_hash IS NOT NULL AND ', '',
    ),
  }), /constraint de motivo 014/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    contextConstraint: evidence.contextConstraint.replace(
      'reason_code IS NOT NULL AND ', '',
    ),
  }), /constraint de motivo 014/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence, contextConstraintValidated: false,
  }), /constraint de motivo 014/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    relationDml: evidence.relationDml.map((row) => row.name === 'tenant_identity_policy'
      ? { ...row, ownerMatches: false } : row),
  }), /owner de relacion protegida/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    relationDml: evidence.relationDml.map((row) => row.name === 'platform_tenant_source_binding'
      ? { ...row, nonOwnerTableDml: ['legacy_executor:INSERT'] } : row),
  }), /DML no-owner 014/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    relationDml: evidence.relationDml.map((row) => row.name === 'platform_tenant_source_binding'
      ? { ...row, nonOwnerColumnDml: ['legacy_executor:verified:UPDATE'] } : row),
  }), /DML no-owner 014/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    runtimeRole: { ...evidence.runtimeRole, grantedToMemberCount: 1 },
    roleMemberships: [{
      direction: 'member_of_runtime', memberIsCurrentUser: false,
      adminOption: true, inheritOption: false, setOption: false,
      memberOwnsApprovedFunctions: false,
    }],
  }), /membresias runtime 014/);
  assert.doesNotThrow(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    runtimeRole: { ...evidence.runtimeRole, grantedToMemberCount: 1 },
    roleMemberships: [{
      direction: 'member_of_runtime', memberIsCurrentUser: true,
      adminOption: true, inheritOption: false, setOption: false,
      memberOwnsApprovedFunctions: true,
    }],
  }));
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    runtimeRole: { ...evidence.runtimeRole, schemaCreate: true },
  }), /rol runtime 014/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    runtimeRelations: evidence.runtimeRelations.map((row) => row.name === 'employment_contract'
      ? { ...row, canSelect: true } : row),
  }), /runtime 014 conserva privilegio directo/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    runtimeSequences: [{
      schemaName: 'public', name: 'tenant_iam_event_id_seq',
      canUsage: false, canSelect: false, canUpdate: true,
    }],
  }), /runtime 014 conserva privilegio de secuencia/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    relationDml: evidence.relationDml.map((row) => row.name === 'tenant_iam_event'
      ? { ...row, publicColumnPrivileges: true } : row),
  }), /DML runtime 014 expuesto/);
  assert.throws(() => validateGovernedSourceBindingEvidence({
    ...evidence,
    functions: evidence.functions.map((row) => (
      row.signature === GOVERNED_SOURCE_BINDING_SIGNATURES.bindCore
        ? { ...row, source: `${row.source}\n-- drift` }
        : row
    )),
  }), /definicion de funcion 014 con drift/);
  for (const signature of [
    GOVERNED_SOURCE_BINDING_SIGNATURES.genericFacade,
    GOVERNED_SOURCE_BINDING_SIGNATURES.genericCore,
    GOVERNED_SOURCE_BINDING_SIGNATURES.sourceOnboardingView,
  ]) {
    assert.throws(() => validateGovernedSourceBindingEvidence({
      ...evidence,
      functions: evidence.functions.map((row) => row.signature === signature
        ? { ...row, source: `${row.source}\n-- drift` } : row),
    }), /definicion de funcion 014 con drift/);
  }
});
