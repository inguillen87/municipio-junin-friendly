import { createHash } from 'node:crypto';
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

const constraintProbe = new Client({ connectionString: databaseUrl });
await constraintProbe.connect();
try {
  await constraintProbe.query('BEGIN');
  await constraintProbe.query(`ALTER TABLE tenant_identity_platform_event_context
    DROP CONSTRAINT IF EXISTS tenant_identity_platform_event_context_reason_ck`);
  await constraintProbe.query(`ALTER TABLE tenant_identity_platform_event_context
    ADD CONSTRAINT tenant_identity_platform_event_context_reason_ck CHECK (
      (reason_code IS NULL AND reason_hash IS NULL)
      OR (reason_code IS NOT NULL AND reason_hash IS NOT NULL
        AND reason_code IN ('certify_data_plane','delivery_kill_switch','bind_source')
        AND reason_hash ~ '^[a-f0-9]{64}$')
    )`);
  const definition = await constraintProbe.query(`SELECT
    pg_get_constraintdef(constraint_row.oid, true) AS definition,
    constraint_row.convalidated AS validated
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.tenant_identity_platform_event_context'::regclass
      AND constraint_row.conname = 'tenant_identity_platform_event_context_reason_ck'`);
  console.log(JSON.stringify({
    gate: 'sprint014_constraint_probe',
    definition: definition.rows[0]?.definition || null,
    validated: definition.rows[0]?.validated === true,
  }));
  await constraintProbe.query('ROLLBACK');
} catch (error) {
  await constraintProbe.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await constraintProbe.end().catch(() => undefined);
}

throw new Error('QA_CONSTRAINT_PROBE_COMPLETE');

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
}));
