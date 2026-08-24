import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Client, neon } from '@neondatabase/serverless';

const EXPECTED_BRANCH = 'br-plain-dust-acpjgebb';
const EXPECTED_PROJECT = 'noisy-poetry-54471701';
const EXPECTED_GIT_REF = 'codex/iam-s006-integration';
const MIGRATION_VERSION = '014-governed-source-binding-provisioning';
const PREREQUISITE_VERSION = '013-existing-identity-membership-governance';
const migrationUrl = new URL('./migrations/014-governed-source-binding-provisioning.sql', import.meta.url);
const applierUrl = new URL('./apply-governed-source-binding-provisioning-schema.mjs', import.meta.url);

function guard(condition, code) {
  if (!condition) throw new Error(code);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function commandHash(command, expectedVersion, payload, releaseSha = null) {
  return createHash('sha256').update(stableJson({
    command, expectedVersion, payload, ...(releaseSha ? { releaseSha } : {}),
  })).digest('hex');
}

async function platformCommand(client, actor, request) {
  const result = await client.query(`SELECT tenant_identity_apply_platform_command_v2(
    $1, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9::jsonb
  ) AS result`, [
    actor.email, actor.sessionId, 1, request.releaseSha, request.command,
    request.idempotencyKey, request.hash, request.expectedVersion,
    JSON.stringify(request.payload),
  ]);
  return result.rows[0]?.result || {};
}

async function onboardingView(client, actor, releaseSha, tenantId) {
  const result = await client.query(`SELECT tenant_identity_source_onboarding_view_v1(
    $1, $2::uuid, 1, $3, $4::uuid
  ) AS result`, [actor.email, actor.sessionId, releaseSha, tenantId]);
  return result.rows[0]?.result || {};
}

guard(process.env.VERCEL_ENV === 'preview', 'QA_ENVIRONMENT_NOT_PREVIEW');
guard(process.env.VERCEL_GIT_COMMIT_REF === EXPECTED_GIT_REF, 'QA_GIT_REF_MISMATCH');
guard(process.env.NEON_PROJECT_ID === EXPECTED_PROJECT, 'QA_PROJECT_ENV_MISMATCH');

const databaseUrl = String(process.env.DATABASE_URL_UNPOOLED || '');
let parsedUrl;
try {
  parsedUrl = new URL(databaseUrl);
} catch {
  throw new Error('QA_DATABASE_URL_INVALID');
}
guard(['postgres:', 'postgresql:'].includes(parsedUrl.protocol), 'QA_DATABASE_URL_INVALID');
guard(!parsedUrl.hostname.includes('-pooler.'), 'QA_OWNER_MUST_BE_UNPOOLED');
guard(parsedUrl.pathname === '/neondb', 'QA_DATABASE_NAME_MISMATCH');

const sql = neon(databaseUrl);
const [identity] = await sql.query(`SELECT
  current_setting('neon.branch_id', true) AS branch_id,
  current_setting('neon.project_id', true) AS project_id,
  current_database() AS database_name,
  current_user AS query_role,
  EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1) AS prerequisite_ready`,
[PREREQUISITE_VERSION]);

console.log(JSON.stringify({
  gate: 'sprint014_target_probe',
  branchId: identity?.branch_id || null,
  projectId: identity?.project_id || null,
  databaseName: identity?.database_name || null,
  queryRole: identity?.query_role || null,
  prerequisiteReady: identity?.prerequisite_ready === true,
}));

guard(identity?.branch_id === EXPECTED_BRANCH, 'QA_BRANCH_ID_MISMATCH');
guard(identity?.project_id === EXPECTED_PROJECT, 'QA_PROJECT_ID_MISMATCH');
guard(identity?.database_name === 'neondb', 'QA_DATABASE_NAME_MISMATCH');
guard(identity?.prerequisite_ready === true, 'QA_PREREQUISITE_013_MISSING');

for (let pass = 1; pass <= 2; pass += 1) {
  const result = spawnSync(process.execPath,
    [fileURLToPath(applierUrl), '--confirm-isolated-branch'], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'qa-migration' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`QA_MIGRATION_PASS_${pass}_FAILED`);
  }
}

const expectedChecksum = createHash('sha256')
  .update(await readFile(migrationUrl))
  .digest('hex');
const [ledger] = await sql.query(`SELECT checksum_sha256
  FROM schema_migrations WHERE version = $1`, [MIGRATION_VERSION]);
guard(ledger?.checksum_sha256 === expectedChecksum, 'QA_MIGRATION_LEDGER_DRIFT');

const releaseSha = String(process.env.VERCEL_GIT_COMMIT_SHA || '').toLowerCase();
const sourceDatabase = String(process.env.FRIENDLY_GRH_SOURCE_DATABASE || '');
const sourceCompanyId = Number.parseInt(String(process.env.FRIENDLY_GRH_COMPANY_ID || ''), 10);
guard(/^[a-f0-9]{40}$/.test(releaseSha), 'QA_RELEASE_SHA_INVALID');
guard(/^[A-Za-z_][A-Za-z0-9_$-]{0,127}$/.test(sourceDatabase),
  'QA_SOURCE_DATABASE_INVALID');
guard(Number.isSafeInteger(sourceCompanyId) && sourceCompanyId > 0,
  'QA_SOURCE_COMPANY_INVALID');

const smoke = new Client({ connectionString: databaseUrl });
const fixtureSuffix = randomUUID().replaceAll('-', '').slice(0, 12);
const actor = Object.freeze({
  email: `qa-source-binding-${fixtureSuffix}@local.invalid`,
  sessionId: randomUUID(),
});
const tenantId = randomUUID();
let bindingId = null;
let canonicalContractCount = 0;
await smoke.connect();
try {
  await smoke.query('BEGIN');
  await smoke.query(`INSERT INTO internal_users (
    email, display_name, role, password_hash, active, auth_mode, identity_version
  ) VALUES ($1, 'QA source binding rollback', 'EMPLEADO', NULL, true, 'managed', 1)`,
  [actor.email]);
  await smoke.query(`INSERT INTO platform_user_role (
    user_email, role_key, active, granted_by_user_email
  ) VALUES ($1, 'PLATFORM_OWNER', true, $1)`, [actor.email]);
  await smoke.query(`INSERT INTO tenant_identity_session (
    id, user_email, active_tenant_id, source, auth_level,
    session_version, identity_version, status, device_label,
    last_seen_at, expires_at
  ) VALUES ($1::uuid, $2, NULL, 'platform', 'mfa', 1, 1, 'active',
    'QA rollback', now(), now() + interval '30 minutes')`,
  [actor.sessionId, actor.email]);
  await smoke.query(`INSERT INTO platform_tenant (
    id, slug, legal_name, short_name, tenant_kind, jurisdiction,
    status, version, created_by_user_email
  ) VALUES ($1::uuid, $2, 'QA source binding rollback', 'QA source binding',
    'sandbox', 'Rama descartable', 'onboarding', 1, $3)`,
  [tenantId, `qa-source-${fixtureSuffix}`, actor.email]);
  const source = await smoke.query(`WITH latest AS (
    SELECT max(batch.source_cutoff) AS cutoff
    FROM source_import_batch batch
    WHERE batch.source_system = 'GRH' AND batch.source_database = $1
      AND batch.validation_state = 'published'
      AND batch.legacy_import_run_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM employment_contract contract
        WHERE contract.source_system = 'GRH'
          AND contract.source_batch_id = batch.id
          AND contract.legacy_company_id = $2)
  )
  SELECT batch.id, count(contract.id)::integer AS contract_count,
    (SELECT count(*)::integer FROM platform_tenant_source_binding binding
      WHERE binding.source_system = 'GRH'
        AND binding.source_database = $1
        AND binding.source_company_id = $2) AS binding_count
  FROM source_import_batch batch
  JOIN latest ON latest.cutoff = batch.source_cutoff
  JOIN employment_contract contract ON contract.source_batch_id = batch.id
    AND contract.source_system = 'GRH' AND contract.legacy_company_id = $2
  WHERE batch.source_system = 'GRH' AND batch.source_database = $1
    AND batch.validation_state = 'published'
    AND batch.legacy_import_run_id IS NOT NULL
  GROUP BY batch.id`, [sourceDatabase, sourceCompanyId]);
  guard(source.rowCount === 1, 'QA_CANONICAL_SOURCE_AMBIGUOUS');
  canonicalContractCount = Number(source.rows[0]?.contract_count || 0);
  guard(canonicalContractCount > 0, 'QA_CANONICAL_SOURCE_EMPTY');
  guard(Number(source.rows[0]?.binding_count || 0) === 0,
    'QA_SOURCE_COORDINATE_ALREADY_BOUND');

  const before = await onboardingView(smoke, actor, releaseSha, tenantId);
  guard(before?.identityPolicy?.version === 1
    && before?.identityPolicy?.dataPlaneReady === false
    && JSON.stringify(before?.allowedCommands) === JSON.stringify(['bind_source']),
  'QA_ONBOARDING_INITIAL_STATE_INVALID');

  const bindPayload = {
    tenantId,
    sourceSystem: 'GRH',
    sourceDatabase,
    sourceCompanyId,
    reason: 'QA transaccional con rollback',
  };
  const bindRequest = {
    command: 'bind_source',
    expectedVersion: 1,
    payload: bindPayload,
    releaseSha,
    idempotencyKey: randomUUID(),
    hash: commandHash('bind_source', 1, bindPayload),
  };
  const bound = await platformCommand(smoke, actor, bindRequest);
  bindingId = String(bound?.sourceBinding?.id || '');
  guard(bound?.replayed === false && bound?.sourceBinding?.verified === true
    && bound?.sourceBinding?.tenantId === tenantId
    && bound?.policyVersion === 2
    && Number(bound?.canonicalEvidence?.contractCount || 0) === canonicalContractCount,
  'QA_BIND_RESULT_INVALID');
  const replay = await platformCommand(smoke, actor, bindRequest);
  guard(replay?.replayed === true && replay?.sourceBinding?.id === bindingId,
    'QA_BIND_REPLAY_INVALID');

  const pending = await onboardingView(smoke, actor, releaseSha, tenantId);
  guard(pending?.identityPolicy?.version === 2
    && pending?.identityPolicy?.dataPlaneReady === false
    && pending?.sourceBinding?.id === bindingId
    && pending?.sourceBinding?.verified === true
    && JSON.stringify(pending?.allowedCommands) === JSON.stringify(['certify_data_plane'])
    && Number(pending?.canonicalEvidence?.contractCount || 0) === canonicalContractCount,
  'QA_ONBOARDING_PENDING_STATE_INVALID');

  const certifyPayload = {
    tenantId,
    sourceBindingId: bindingId,
    releaseSha,
    reason: 'QA transaccional con rollback',
  };
  const certifyRequest = {
    command: 'certify_data_plane',
    expectedVersion: 2,
    payload: certifyPayload,
    releaseSha,
    idempotencyKey: randomUUID(),
    hash: commandHash('certify_data_plane', 2, certifyPayload, releaseSha),
  };
  const certified = await platformCommand(smoke, actor, certifyRequest);
  guard(certified?.replayed === false
    && certified?.policy?.dataPlaneReady === true
    && certified?.policy?.deliveryReady === false
    && certified?.policy?.version === 3
    && certified?.policy?.sourceBindingId === bindingId,
  'QA_CERTIFY_RESULT_INVALID');

  const ready = await onboardingView(smoke, actor, releaseSha, tenantId);
  guard(ready?.identityPolicy?.version === 3
    && ready?.identityPolicy?.dataPlaneReady === true
    && ready?.sourceBinding?.id === bindingId
    && Array.isArray(ready?.allowedCommands) && ready.allowedCommands.length === 0,
  'QA_ONBOARDING_READY_STATE_INVALID');

  await smoke.query('ROLLBACK');
} catch (error) {
  await smoke.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await smoke.end().catch(() => undefined);
}

const [residue] = await sql.query(`SELECT
  (SELECT count(*)::integer FROM internal_users WHERE email = $1) AS users,
  (SELECT count(*)::integer FROM platform_user_role WHERE user_email = $1) AS roles,
  (SELECT count(*)::integer FROM tenant_identity_session WHERE id = $2::uuid) AS sessions,
  (SELECT count(*)::integer FROM platform_tenant WHERE id = $3::uuid) AS tenants,
  (SELECT count(*)::integer FROM tenant_identity_policy WHERE tenant_id = $3::uuid) AS policies,
  (SELECT count(*)::integer FROM platform_tenant_source_binding
    WHERE tenant_id = $3::uuid) AS bindings,
  (SELECT count(*)::integer FROM tenant_iam_event WHERE actor_user_email = $1) AS events`,
[actor.email, actor.sessionId, tenantId]);
guard(Object.values(residue || {}).every((value) => Number(value) === 0),
  'QA_SMOKE_RESIDUE_DETECTED');

console.log(JSON.stringify({
  gate: 'sprint014_qa_migration',
  branchId: identity.branch_id,
  projectId: identity.project_id,
  databaseName: identity.database_name,
  queryRole: identity.query_role,
  prerequisite: PREREQUISITE_VERSION,
  migration: MIGRATION_VERSION,
  applyPasses: 2,
  checksumVerified: true,
  liveSmoke: {
    states: ['bind_source', 'certify_data_plane', 'ready'],
    replayVerified: true,
    canonicalContractCount,
    deliveryStayedClosed: true,
    residueRows: 0,
  },
}));
