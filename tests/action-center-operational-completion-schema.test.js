import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION,
  ACTION_CENTER_OPERATIONAL_DETAIL_SIGNATURE,
  actionCenterConfidentialityConstraintFingerprint,
  actionCenterOperationalCompletionFingerprint,
  actionCenterOperationalFunctionSourceFingerprint,
  validateActionCenterOperationalCompletionEvidence,
  validateActionCenterOperationalCompletionMigrationSql,
  validateActionCenterOperationalDetailDefinition,
} from '../scripts/apply-action-center-operational-completion-schema.mjs';
import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from '../scripts/lib/canonical-import.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migrationUrl = new URL(
  '../scripts/migrations/018-action-center-operational-completion.sql', import.meta.url,
);
const detailBaselineUrl = new URL(
  '../scripts/migrations/007-action-center-read-facades.sql', import.meta.url,
);
const payloadBaselineUrl = new URL(
  '../scripts/migrations/003-action-center.sql', import.meta.url,
);
const prerequisiteUrl = new URL(
  '../scripts/migrations/017-tenant-action-unlinked-operator.sql', import.meta.url,
);
const applierUrl = new URL(
  '../scripts/apply-action-center-operational-completion-schema.mjs', import.meta.url,
);
const packageUrl = new URL('../package.json', import.meta.url);
const [migration, detailBaseline, payloadBaseline, prerequisite, applier, packageSource] =
  await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(detailBaselineUrl, 'utf8'),
    readFile(payloadBaselineUrl, 'utf8'),
    readFile(prerequisiteUrl, 'utf8'),
    readFile(applierUrl, 'utf8'),
    readFile(packageUrl, 'utf8'),
  ]);

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function functionBody(sql, functionName) {
  const source = String(sql || '');
  const markers = [
    `CREATE OR REPLACE FUNCTION public.${functionName}(`,
    `CREATE OR REPLACE FUNCTION ${functionName}(`,
  ];
  const start = markers.map((marker) => source.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  assert.equal(Number.isInteger(start), true, `funcion ausente: ${functionName}`);
  const bodyStart = source.indexOf('AS $$', start) + 'AS $$'.length;
  const bodyEnd = source.indexOf('$$;', bodyStart);
  assert.ok(bodyStart >= 'AS $$'.length && bodyEnd > bodyStart);
  return source.slice(bodyStart, bodyEnd);
}

function functionDefinition(sql, functionName) {
  const source = String(sql || '');
  const start = [
    `CREATE OR REPLACE FUNCTION public.${functionName}(`,
    `CREATE OR REPLACE FUNCTION ${functionName}(`,
  ].map((marker) => source.indexOf(marker)).filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  assert.equal(Number.isInteger(start), true, `funcion ausente: ${functionName}`);
  const end = source.indexOf('$$;', start);
  assert.ok(end > start);
  return source.slice(start, end + 3);
}

function installedEvidence(overrides = {}) {
  return {
    detail: {
      signature: ACTION_CENTER_OPERATIONAL_DETAIL_SIGNATURE,
      definition: migration,
      source: functionBody(migration, 'action_center_tenant_detail_v2'),
      securityDefiner: true,
      ownerMatches: true,
      exactSearchPath: true,
      language: 'plpgsql',
      kind: 'f',
      volatility: 'v',
      strict: false,
      parallel: 'u',
      returnType: 'jsonb',
      owner: 'neondb_owner',
      grants: ['municontrol_actions_runtime_app:EXECUTE', 'neondb_owner:EXECUTE'],
    },
    listDefinition: functionDefinition(
      detailBaseline, 'action_center_tenant_list_v2',
    ),
    constraint: {
      definition: "CHECK (((case_type <> 'leave_request'::text) OR "
        + "(((payload ->> 'reasonCode'::text) = '19'::text) OR "
        + "((confidentiality)::text = 'restricted'::text))))",
      validated: true,
    },
    employeeNoteConstraint: {
      definition: "CHECK (((case_type <> 'leave_request'::text) OR "
        + "(NOT (payload ? 'employeeNote'::text)) OR "
        + "((payload -> 'employeeNote'::text) = 'null'::jsonb) OR "
        + "((jsonb_typeof((payload -> 'employeeNote'::text)) = 'string'::text) "
        + "AND (length((payload ->> 'employeeNote'::text)) <= 500))))",
      validated: true,
    },
    actionCaseOwnerMatches: true,
    relationDml: ['action_case', 'action_case_event'].map((name) => ({
      name,
      ownerMatches: true,
      insert: false,
      update: false,
      delete: false,
      truncate: false,
      references: false,
      trigger: false,
      columnInsert: false,
      columnUpdate: false,
      columnReferences: false,
      publicTablePrivileges: false,
      publicColumnPrivileges: false,
      nonOwnerTableDml: [],
      nonOwnerColumnDml: [],
    })),
    ...overrides,
  };
}

test('018 es aditiva, parseable, checksummed y depende de 017', () => {
  assert.equal(
    ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION,
    '018-action-center-operational-completion',
  );
  assert.equal(
    validateActionCenterOperationalCompletionMigrationSql(migration, detailBaseline),
    true,
  );
  assert.equal(splitPostgresStatements(migration).length, 11);
  assert.match(actionCenterOperationalCompletionFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.match(prerequisite, /Sprint 017/);
  assert.doesNotMatch(
    migration,
    /\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|SCHEMA|DATABASE)\b/i,
  );
});

test('operador area-scoped sin vinculo recibe preparacion, no decisiones', () => {
  assert.equal(validateActionCenterOperationalDetailDefinition(migration), true);
  const body = normalized(functionBody(migration, 'action_center_tenant_detail_v2'));
  const linkGate = body.indexOf(
    "if coalesce(context_value->>'employmentcontractid', '') <> ''",
  );
  const linkGateEnd = body.indexOf('end if;', linkGate);
  const commandSelect = body.indexOf(
    "select coalesce(jsonb_agg(command_name order by command_order), '[]'::jsonb)",
  );
  assert.ok(linkGate >= 0 && linkGateEnd > linkGate && commandSelect > linkGateEnd);
  const commands = body.slice(commandSelect);
  for (const command of ['update_draft', 'submit', 'approve', 'reject', 'cancel']) {
    assert.match(commands, new RegExp(`'${command}'`));
  }
  assert.equal(
    (commands.match(/coalesce\(context_value->>'employmentcontractid', ''\) <> ''/g) || [])
      .length,
    2,
  );
  assert.equal((commands.match(/and not sod_conflict/g) || []).length, 2);
  assert.match(
    commands,
    /command\.command_name <> 'cancel' or action_row\.status <> 'approved' or \(/,
  );
});

test('maker-checker vincula SoD por membership y persona conocida', () => {
  const body = normalized(migration);
  assert.match(
    body,
    /preparation_event\.actor_membership_id = \(context_value->>'membershipid'\)::uuid/,
  );
  assert.match(
    body,
    /preparation_event\.actor_person_id is not null and preparation_event\.actor_person_id/,
  );
  assert.doesNotMatch(
    body,
    /preparation_event\.actor_person_id is null or preparation_event\.actor_person_id/,
  );
  assert.match(body, /contract_row\.person_id = \(context_value->>'actorpersonid'\)::uuid/);
});

test('validador adversarial rechaza abrir decisiones o volver a anidar comandos', () => {
  assert.throws(
    () => validateActionCenterOperationalDetailDefinition(migration.replace(
      "        COALESCE(context_value->>'employmentContractId', '') <> ''\n"
        + "        AND (context_value->>'actorPersonId') IS NOT NULL\n"
        + '        AND NOT sod_conflict',
      '        NOT sod_conflict',
    )),
    /decisiones sin vinculo|cierra exactamente decisiones/,
  );
  assert.throws(
    () => validateActionCenterOperationalDetailDefinition(migration.replace(
      '    END IF;\n\n    SELECT COALESCE(jsonb_agg(command_name ORDER BY command_order)',
      '    SELECT COALESCE(jsonb_agg(command_name ORDER BY command_order)',
    )),
    /anidar comandos de preparacion|incompleto/,
  );
  assert.throws(
    () => validateActionCenterOperationalDetailDefinition(migration.replace(
      "preparation_event.actor_membership_id = (context_value->>'membershipId')::uuid",
      'preparation_event.actor_person_id IS NULL',
    )),
    /actor_membership_id|preparaciones sin persona/,
  );
});

test('restricted admite employeeNote y DB alinea string/null con maximo 500', () => {
  assert.match(
    payloadBaseline,
    /length\(value->>'employeeNote'\) > 1000/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION (?:public\.)?action_center_valid_leave_payload/i,
  );
  assert.match(
    migration,
    /ADD CONSTRAINT action_case_employee_note_length_ck CHECK \([\s\S]+jsonb_typeof\(payload->'employeeNote'\) = 'string'[\s\S]+length\(payload->>'employeeNote'\) <= 500[\s\S]+\) NOT VALID/,
  );
  assert.match(migration, /VALIDATE CONSTRAINT action_case_employee_note_length_ck/);
  assert.match(
    migration,
    /ADD CONSTRAINT action_case_leave_confidentiality_ck CHECK \([\s\S]+payload->>'reasonCode' = '19'[\s\S]+confidentiality = 'restricted'[\s\S]+\) NOT VALID/,
  );
  assert.doesNotMatch(
    migration,
    /confidentiality <> 'restricted' OR NOT \(payload \? 'employeeNote'\)/,
  );
  assert.equal(
    actionCenterConfidentialityConstraintFingerprint(
      "CHECK (((case_type <> 'leave_request'::text) OR (((payload ->> "
        + "'reasonCode'::text) = '19'::text) OR ((confidentiality)::text = "
        + "'restricted'::text))))",
    ),
    actionCenterConfidentialityConstraintFingerprint(
      "CHECK (case_type <> 'leave_request' OR (payload->>'reasonCode' = '19' "
        + "OR confidentiality = 'restricted'))",
    ),
  );
});

test('evidencia final conserva nota nominal y la oculta a lista/payroll', () => {
  assert.equal(
    validateActionCenterOperationalCompletionEvidence(installedEvidence(), migration),
    true,
  );
  const detail = normalized(migration);
  assert.match(
    detail,
    /'employeenote', case when nominal_allowed then action_row\.payload->>'employeenote' end/,
  );
  assert.doesNotMatch(
    normalized(functionDefinition(detailBaseline, 'action_center_tenant_list_v2')),
    /employeenote/,
  );
  const leakedList = installedEvidence({
    listDefinition: "SELECT page.payload->>'employeeNote' FROM action_case page",
  });
  assert.throws(
    () => validateActionCenterOperationalCompletionEvidence(leakedList, migration),
    /listado 018 expone employeeNote/,
  );
  const leakedPayroll = installedEvidence();
  leakedPayroll.detail.definition = migration.replace(
    "'employeeNote', CASE WHEN nominal_allowed THEN action_row.payload->>'employeeNote' END",
    "'employeeNote', action_row.payload->>'employeeNote'",
  );
  assert.throws(
    () => validateActionCenterOperationalCompletionEvidence(leakedPayroll, migration),
    /detalle 018 incompleto/,
  );
});

test('ACL, owner y DML 018 son exactos y fallan con grants directos', () => {
  assert.match(migration, /SECURITY DEFINER SET search_path = public, pg_temp/);
  assert.match(migration, /FROM PUBLIC CASCADE/);
  assert.match(migration, /acl\.grantee <> function_row\.proowner/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.action_center_tenant_detail_v2/,
  );

  const extraGrant = installedEvidence();
  extraGrant.detail.grants.push('legacy_role:EXECUTE');
  assert.throws(
    () => validateActionCenterOperationalCompletionEvidence(extraGrant, migration),
    /ACL detalle 018 fuera de contrato/,
  );
  const directDml = installedEvidence();
  directDml.relationDml[0].update = true;
  assert.throws(
    () => validateActionCenterOperationalCompletionEvidence(directDml, migration),
    /DML runtime 018 expuesto/,
  );
});

test('aplicador exige 017 checksum/evidencia, ledger, lock, transaccion y reapply', () => {
  for (const pattern of [
    /017-tenant-action-unlinked-operator\.sql/,
    /tenantActionUnlinkedOperatorFingerprint\(prerequisite\)/,
    /verifyTenantActionUnlinkedOperatorFinalState\(client\)/,
    /verifyBaselineState\(client, baseline\)/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /await client\.query\('BEGIN'\)/,
    /pg_advisory_xact_lock/,
    /verifyActionCenterOperationalCompletionFinalState\(client, migration\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /reapply verificado/,
    /fresh apply/,
  ]) assert.match(applier, pattern);
  assert.match(
    packageSource,
    /db:actions:operational-completion:schema[\s\S]+--confirm-isolated-branch/,
  );
});

test('aplicador usa target canonico dual y exige confirmacion explicita', () => {
  assert.match(applier, /resolveCanonicalDatabaseTarget\(args, process\.env\)/);
  assert.match(applier, /directCanonicalDatabaseUrl\(args, process\.env\)/);
  assert.doesNotMatch(applier, /directIsolatedDatabaseUrl/);

  const branchId = 'br-plain-dust-acpjgebb';
  const host = 'ep-canonical-contract.sa-east-1.aws.neon.tech';
  const databaseUrl = `postgresql://user:secret@${host}/municontrol`;
  const env = {
    DATABASE_URL_UNPOOLED: databaseUrl,
    CANONICAL_PRODUCTION_BRANCH_ID: branchId,
    CANONICAL_PRODUCTION_HOST: host,
    CANONICAL_PRODUCTION_DATABASE: 'municontrol',
    VERCEL_ENV: 'production',
  };
  const args = [`--confirm-production-branch=${branchId}`];
  assert.deepEqual(resolveCanonicalDatabaseTarget(args, env), {
    databaseUrl, mode: 'production', branchId,
  });
  assert.equal(directCanonicalDatabaseUrl(args, env), databaseUrl);
  assert.throws(
    () => resolveCanonicalDatabaseTarget([], { DATABASE_URL_UNPOOLED: databaseUrl }),
    /confirm-isolated-branch|confirm-production-branch/,
  );
});

test('fingerprint de fuente distingue drift funcional', () => {
  const body = functionBody(migration, 'action_center_tenant_detail_v2');
  assert.notEqual(
    actionCenterOperationalFunctionSourceFingerprint(body),
    actionCenterOperationalFunctionSourceFingerprint(body.replace(
      "('update_draft', 1)", "('approve', 1)",
    )),
  );
});
