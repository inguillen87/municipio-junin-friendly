import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  PAYROLL_NOVELTY_MIGRATION_VERSION,
  payrollNoveltyFingerprint,
} from './apply-governed-payroll-novelties-schema.mjs';
import {
  PAYROLL_NOVELTY_PROFILE_MATRIX,
  PAYROLL_NOVELTY_PROFILES_MIGRATION_VERSION,
  payrollNoveltyProfilesFingerprint,
} from './apply-institutional-payroll-novelty-profiles-schema.mjs';
import {
  PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION,
  payrollNoveltyFirstFortnightFingerprint,
} from './apply-payroll-novelty-first-fortnight-schema.mjs';
import {
  exportPayrollNovelty,
  getPayrollNoveltyBootstrap,
  preparePayrollNovelty,
  transitionPayrollNovelty,
} from '../lib/internal-payroll-novelty.js';
import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';

const MIGRATION_026_URL = new URL(
  './migrations/026-governed-payroll-novelties.sql', import.meta.url,
);
const MIGRATION_027_URL = new URL(
  './migrations/027-institutional-payroll-novelty-profiles.sql', import.meta.url,
);
const MIGRATION_029_URL = new URL(
  './migrations/029-payroll-novelty-first-fortnight.sql', import.meta.url,
);
const SHA40 = /^[a-f0-9]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PAYROLL_NOVELTY_SMOKE_PROFILES = Object.freeze({
  owner: Object.freeze({
    email: 'marcelo@junin.com',
    roleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
  }),
  approver: Object.freeze({
    email: 'hugo@junin.com',
    roleKey: 'HUGO_APROBADOR_INTEGRAL',
  }),
  reader: Object.freeze({
    email: 'admin@junin.com',
    roleKey: 'CONSULTA_INTEGRAL',
  }),
});

class SmokeInvariantError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SmokeInvariantError';
    this.safeCode = code;
  }
}

function invariant(condition, code) {
  if (!condition) throw new SmokeInvariantError(code);
}

function exactValues(actual, expected) {
  const left = [...new Set((actual || []).map(String))].sort();
  const right = [...new Set((expected || []).map(String))].sort();
  return left.length === (actual || []).length
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function requiredProductionPin(value, name, pattern) {
  const text = String(value || '').trim();
  if (!text) throw new SmokeInvariantError(`${name}_REQUIRED`);
  if (!pattern.test(text)) throw new SmokeInvariantError(`${name}_INVALID`);
  return text;
}

function normalizedEmail(value, fallback, label) {
  const email = String(value || fallback).trim().toLowerCase();
  invariant(email.length <= 320 && EMAIL.test(email), `${label}_INVALID`);
  return email;
}

export function resolvePayrollNoveltySmokeProfiles(env = process.env) {
  const tenantSlug = String(
    env.PAYROLL_NOVELTY_SMOKE_TENANT_SLUG || 'junin-mendoza',
  ).trim().toLowerCase();
  invariant(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug), 'TENANT_SLUG_INVALID');
  return Object.freeze({
    tenantSlug,
    owner: Object.freeze({
      ...PAYROLL_NOVELTY_SMOKE_PROFILES.owner,
      email: normalizedEmail(
        env.PAYROLL_NOVELTY_SMOKE_OWNER_EMAIL,
        PAYROLL_NOVELTY_SMOKE_PROFILES.owner.email,
        'OWNER_EMAIL',
      ),
    }),
    approver: Object.freeze({
      ...PAYROLL_NOVELTY_SMOKE_PROFILES.approver,
      email: normalizedEmail(
        env.PAYROLL_NOVELTY_SMOKE_APPROVER_EMAIL,
        PAYROLL_NOVELTY_SMOKE_PROFILES.approver.email,
        'APPROVER_EMAIL',
      ),
    }),
    reader: Object.freeze({
      ...PAYROLL_NOVELTY_SMOKE_PROFILES.reader,
      email: normalizedEmail(
        env.PAYROLL_NOVELTY_SMOKE_READER_EMAIL,
        PAYROLL_NOVELTY_SMOKE_PROFILES.reader.email,
        'READER_EMAIL',
      ),
    }),
  });
}

export function resolvePayrollNoveltySmokeTarget(argv = process.argv, env = process.env) {
  const target = resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_NOVELTY_SMOKE',
    targetLabel: 'smoke transaccional 026',
  });
  invariant(target.mode === 'isolated', 'PRODUCTION_MODE_FORBIDDEN');
  const productionBranchId = requiredProductionPin(
    env.CANONICAL_PRODUCTION_BRANCH_ID,
    'CANONICAL_PRODUCTION_BRANCH_ID',
    /^br-[a-z0-9-]+$/,
  );
  const productionHost = requiredProductionPin(
    env.CANONICAL_PRODUCTION_HOST,
    'CANONICAL_PRODUCTION_HOST',
    /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/,
  );
  invariant(!productionHost.includes('-pooler.'), 'CANONICAL_PRODUCTION_HOST_INVALID');
  invariant(target.branchId !== productionBranchId, 'PRODUCTION_BRANCH_FORBIDDEN');
  invariant(target.expectedHost !== productionHost, 'PRODUCTION_HOST_FORBIDDEN');
  return target;
}

export function payrollNoveltySmokeDraft({ runId, legajo, periodMonth }) {
  const seed = createHash('sha256').update(`026-smoke:${runId}`).digest('hex');
  const conceptSourceId = (
    100_000_000_000_000_000n + (BigInt(`0x${seed.slice(0, 15)}`) % 800_000_000_000_000_000n)
  ).toString();
  return Object.freeze({
    sourceMode: 'individual',
    periodMonth,
    payrollType: 'first_fortnight',
    rows: Object.freeze([Object.freeze({
      rowOrdinal: 1,
      legajo: String(legajo),
      conceptSourceId,
      costCenterSourceId: null,
      adjustmentMonth: null,
      quantityDecimal: '1',
      amountCents: null,
      movementType: 'qa_smoke',
      legalInstrument: `QA rollback ${runId}`,
      observation: 'Control transaccional aislado; no se aplica a GRH ni a la liquidacion.',
      forced: false,
    })]),
  });
}

export function validatePayrollNoveltySmokeActor(actor, expectedProfile, {
  expectedEmploymentLinks,
} = {}) {
  invariant(actor && UUID.test(String(actor.membershipId || '')), 'ACTOR_MEMBERSHIP_INVALID');
  invariant(Number.isSafeInteger(Number(actor.identityVersion))
    && Number(actor.identityVersion) > 0, 'ACTOR_IDENTITY_VERSION_INVALID');
  invariant(actor.roleKey === expectedProfile.roleKey, 'ACTOR_ROLE_DRIFT');
  invariant(actor.membershipStatus === 'active', 'ACTOR_MEMBERSHIP_INACTIVE');
  invariant(actor.hasAuthority === true, 'ACTOR_AUTHORITY_REQUIRED');
  invariant(exactValues(
    actor.payrollCapabilities,
    PAYROLL_NOVELTY_PROFILE_MATRIX[expectedProfile.roleKey],
  ), 'ACTOR_PAYROLL_CAPABILITY_DRIFT');
  if (expectedEmploymentLinks !== undefined) {
    invariant(Number(actor.activeEmploymentLinks) === expectedEmploymentLinks,
      'ACTOR_EMPLOYMENT_LINK_DRIFT');
  }
  return true;
}

export function payrollNoveltySmokeSafeCode(error) {
  if (error?.safeCode) return String(error.safeCode);
  if (/^[A-Z][A-Z0-9_]{3,}$/.test(String(error?.code || ''))
      && String(error.code).includes('_')) return String(error.code);
  const match = String(error?.message || '').match(/\b[A-Z][A-Z0-9_]{3,}\b/);
  if (match) return match[0];
  if (/^[A-Z0-9]{5}$/.test(String(error?.code || ''))) return String(error.code);
  return 'PAYROLL_NOVELTY_SMOKE_FAILED';
}

function principal(actor, tenantId) {
  return Object.freeze({
    user: Object.freeze({ email: actor.userEmail }),
    tenant: Object.freeze({
      id: tenantId,
      membershipId: actor.membershipId,
      source: 'membership',
    }),
  });
}

function session(actor, tenant, id) {
  return Object.freeze({
    id,
    version: 1,
    email: actor.userEmail,
    releaseSha: tenant.releaseSha,
  });
}

async function exactMigrationLedger(client, version, checksum) {
  const result = await client.query(
    'SELECT checksum_sha256 FROM public.schema_migrations WHERE version = $1',
    [version],
  );
  invariant(result.rowCount === 1, 'PAYROLL_NOVELTY_MIGRATION_MISSING');
  invariant(String(result.rows[0].checksum_sha256 || '').trim() === checksum,
    'PAYROLL_NOVELTY_MIGRATION_DRIFT');
}

async function loadTenant(client, tenantSlug) {
  const result = await client.query(`
    SELECT tenant.id AS "tenantId", tenant.slug,
      binding.id AS "sourceBindingId", binding.source_database AS "sourceDatabase",
      binding.source_company_id::text AS "sourceCompanyId",
      btrim(policy.certified_release_sha) AS "releaseSha"
    FROM public.platform_tenant tenant
    JOIN public.tenant_identity_policy policy
      ON policy.tenant_id = tenant.id AND policy.tenant_data_plane_ready IS TRUE
    JOIN public.platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = tenant.id
     AND binding.source_system = 'GRH' AND binding.verified IS TRUE
    WHERE lower(tenant.slug) = lower($1) AND tenant.status = 'active'
  `, [tenantSlug]);
  invariant(result.rowCount === 1, 'CERTIFIED_TENANT_NOT_FOUND');
  invariant(SHA40.test(String(result.rows[0].releaseSha || '')),
    'CERTIFIED_RELEASE_INVALID');
  return result.rows[0];
}

async function loadActor(client, tenantId, profile) {
  const result = await client.query(`
    SELECT users.email AS "userEmail", users.identity_version AS "identityVersion",
      membership.id AS "membershipId", membership.role_key AS "roleKey",
      membership.status AS "membershipStatus",
      EXISTS (SELECT 1 FROM public.tenant_action_authority authority
        WHERE authority.membership_id = membership.id
          AND authority.tenant_id = membership.tenant_id) AS "hasAuthority",
      (SELECT count(*)::integer FROM public.tenant_action_employment_link link
        WHERE link.membership_id = membership.id AND link.tenant_id = membership.tenant_id
          AND link.active IS TRUE) AS "activeEmploymentLinks",
      COALESCE((SELECT array_agg(effective.capability_key ORDER BY effective.capability_key)
        FROM public.tenant_iam_effective_capabilities(membership.id) effective
        WHERE effective.capability_key LIKE 'payroll.novelty.%'), ARRAY[]::varchar[])
        AS "payrollCapabilities"
    FROM public.internal_users users
    JOIN public.tenant_membership membership
      ON lower(membership.user_email) = lower(users.email)
     AND membership.tenant_id = $1::uuid
    WHERE lower(users.email) = lower($2) AND users.active IS TRUE
  `, [tenantId, profile.email]);
  invariant(result.rowCount === 1, 'ACTOR_NOT_FOUND');
  return result.rows[0];
}

async function loadApproverEmployment(client, tenant, approver) {
  const result = await client.query(`
    SELECT contract.id AS "employmentContractId", contract.person_id AS "personId",
      contract.legacy_legajo AS legajo
    FROM public.tenant_action_employment_link link
    JOIN public.employment_contract contract
      ON contract.id = link.employment_contract_id
     AND contract.source_system = 'GRH' AND contract.status = 'active'
     AND contract.legacy_company_id = $4::bigint
    JOIN public.source_import_batch source_batch
      ON source_batch.id = contract.source_batch_id
     AND source_batch.source_system = 'GRH'
     AND source_batch.source_database = $5
     AND source_batch.validation_state = 'published'
     AND source_batch.legacy_import_run_id IS NOT NULL
    WHERE link.membership_id = $1::uuid AND link.tenant_id = $2::uuid
      AND link.source_binding_id = $3::uuid AND link.active IS TRUE
  `, [approver.membershipId, tenant.tenantId, tenant.sourceBindingId,
    tenant.sourceCompanyId, tenant.sourceDatabase]);
  invariant(result.rowCount === 1, 'APPROVER_EMPLOYMENT_INVALID');
  return result.rows[0];
}

async function loadNoveltySubject(client, tenant, excludedPersonId) {
  const result = await client.query(`
    SELECT min(contract.id::text)::uuid AS "employmentContractId",
      contract.legacy_legajo AS legajo
    FROM public.employment_contract contract
    JOIN public.source_import_batch source_batch
      ON source_batch.id = contract.source_batch_id
     AND source_batch.source_system = 'GRH'
     AND source_batch.source_database = $1
     AND source_batch.validation_state = 'published'
     AND source_batch.legacy_import_run_id IS NOT NULL
    WHERE contract.source_system = 'GRH' AND contract.status = 'active'
      AND contract.legacy_company_id = $2::bigint
      AND contract.person_id <> $3::uuid
      AND contract.legacy_legajo ~ '^(0|[1-9][0-9]{0,19})$'
    GROUP BY contract.legacy_legajo
    HAVING count(*) = 1
    ORDER BY contract.legacy_legajo::numeric, contract.legacy_legajo
    LIMIT 1
  `, [tenant.sourceDatabase, tenant.sourceCompanyId, excludedPersonId]);
  invariant(result.rowCount === 1, 'PAYROLL_NOVELTY_SUBJECT_NOT_FOUND');
  return result.rows[0];
}

async function expectRejected(client, savepoint, expectedCode, operation) {
  invariant(/^[a-z][a-z0-9_]{2,48}$/.test(savepoint), 'SAVEPOINT_INVALID');
  await client.query(`SAVEPOINT ${savepoint}`);
  let error;
  try {
    await operation();
  } catch (caught) {
    error = caught;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  invariant(error, `${expectedCode}_NOT_REJECTED`);
  invariant(payrollNoveltySmokeSafeCode(error) === expectedCode,
    `${expectedCode}_UNEXPECTED_FAILURE`);
}

async function insertSmokeSession(client, actor, tenantId, sessionId) {
  await client.query(`
    INSERT INTO public.tenant_identity_session (
      id, user_email, active_tenant_id, source, auth_level,
      session_version, identity_version, status, device_label,
      last_seen_at, expires_at
    ) VALUES (
      $1::uuid, $2, $3::uuid, 'membership', 'mfa',
      1, $4::integer, 'active', 'QA 026 rollback',
      clock_timestamp(), clock_timestamp() + interval '30 minutes'
    )
  `, [sessionId, actor.userEmail, tenantId, actor.identityVersion]);
}

function assertSafeSnapshot(snapshot, expectedStatus, expectedVersion) {
  invariant(snapshot?.status === expectedStatus, 'PAYROLL_NOVELTY_STATUS_DRIFT');
  invariant(Number(snapshot?.version) === expectedVersion, 'PAYROLL_NOVELTY_VERSION_DRIFT');
  invariant(snapshot?.grhMutation === false, 'PAYROLL_NOVELTY_GRH_MUTATION_DETECTED');
  invariant(snapshot?.payrollCalculated === false, 'PAYROLL_NOVELTY_CALCULATION_DETECTED');
  invariant(snapshot?.payrollPosted === false, 'PAYROLL_NOVELTY_POSTING_DETECTED');
}

export async function runPayrollNoveltySmoke({
  argv = process.argv.slice(2),
  env = process.env,
} = {}) {
  let stage = 'target-preflight';
  let transactionOpen = false;
  const target = resolvePayrollNoveltySmokeTarget(argv, env);
  const profiles = resolvePayrollNoveltySmokeProfiles(env);
  const client = new Client({ connectionString: target.databaseUrl });
  const runId = randomUUID();
  const sessionIds = Object.freeze({
    owner: randomUUID(),
    approver: randomUUID(),
    reader: randomUUID(),
  });
  let batchId;

  try {
    await client.connect();
    await verifyPinnedNeonConnectedTarget(client, target, 'smoke transaccional 026');

    stage = 'schema-ledger';
    await exactMigrationLedger(
      client,
      PAYROLL_NOVELTY_MIGRATION_VERSION,
      payrollNoveltyFingerprint(await readFile(MIGRATION_026_URL, 'utf8')),
    );
    await exactMigrationLedger(
      client,
      PAYROLL_NOVELTY_PROFILES_MIGRATION_VERSION,
      payrollNoveltyProfilesFingerprint(await readFile(MIGRATION_027_URL, 'utf8')),
    );
    await exactMigrationLedger(
      client,
      PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION,
      payrollNoveltyFirstFortnightFingerprint(await readFile(MIGRATION_029_URL, 'utf8')),
    );

    stage = 'certified-scope';
    const tenant = await loadTenant(client, profiles.tenantSlug);
    const owner = await loadActor(client, tenant.tenantId, profiles.owner);
    const approver = await loadActor(client, tenant.tenantId, profiles.approver);
    const reader = await loadActor(client, tenant.tenantId, profiles.reader);
    validatePayrollNoveltySmokeActor(owner, profiles.owner, { expectedEmploymentLinks: 0 });
    validatePayrollNoveltySmokeActor(approver, profiles.approver, { expectedEmploymentLinks: 1 });
    validatePayrollNoveltySmokeActor(reader, profiles.reader);
    const approverEmployment = await loadApproverEmployment(client, tenant, approver);
    const subject = await loadNoveltySubject(client, tenant, approverEmployment.personId);
    const periodMonth = `${new Date().toISOString().slice(0, 7)}-01`;
    const draft = payrollNoveltySmokeDraft({ runId, legajo: subject.legajo, periodMonth });

    const actors = { owner, approver, reader };
    const principals = Object.fromEntries(Object.entries(actors).map(([key, actor]) => [
      key, principal(actor, tenant.tenantId),
    ]));
    const sessions = Object.fromEntries(Object.entries(actors).map(([key, actor]) => [
      key, session(actor, tenant, sessionIds[key]),
    ]));

    stage = 'transaction-start';
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '45s'");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:payroll-novelty-smoke-026'))",
    );
    for (const key of ['owner', 'approver', 'reader']) {
      await insertSmokeSession(client, actors[key], tenant.tenantId, sessionIds[key]);
    }

    stage = 'role-contracts';
    const ownerStart = await getPayrollNoveltyBootstrap(
      client, principals.owner, sessions.owner,
    );
    const approverStart = await getPayrollNoveltyBootstrap(
      client, principals.approver, sessions.approver,
    );
    const readerStart = await getPayrollNoveltyBootstrap(
      client, principals.reader, sessions.reader,
    );
    invariant(ownerStart.principal?.employmentLinked === false,
      'OWNER_UNLINKED_CONTRACT_DRIFT');
    invariant(approverStart.principal?.employmentLinked === true,
      'APPROVER_LINKED_CONTRACT_DRIFT');
    invariant(exactValues(readerStart.principal?.capabilities, ['payroll.novelty.read']),
      'READER_NOT_READ_ONLY');

    stage = 'reader-mutation-negative-control';
    await expectRejected(client, 'reader_prepare_denied', 'PAYROLL_NOVELTY_CAPABILITY_REQUIRED',
      () => preparePayrollNovelty(
        client, principals.reader, sessions.reader, draft, randomUUID(),
      ));

    stage = 'owner-prepare';
    const prepared = await preparePayrollNovelty(
      client, principals.owner, sessions.owner, draft, randomUUID(),
    );
    batchId = prepared.data?.id;
    invariant(UUID.test(String(batchId || '')), 'PAYROLL_NOVELTY_BATCH_INVALID');
    assertSafeSnapshot(prepared.data, 'draft', 1);
    invariant(prepared.data?.rows?.[0]?.legajo === subject.legajo,
      'PAYROLL_NOVELTY_SUBJECT_DRIFT');
    invariant(prepared.data?.rows?.[0]?.employmentContractId === subject.employmentContractId,
      'PAYROLL_NOVELTY_CONTRACT_DRIFT');
    const preparedEvidence = await client.query(`
      SELECT prepared_by_person_id IS NULL AS "ownerUnlinked",
        prepared_by_membership_id = $2::uuid AS "ownerPrepared"
      FROM public.payroll_novelty_batch WHERE id = $1::uuid
    `, [batchId, owner.membershipId]);
    invariant(preparedEvidence.rowCount === 1
      && preparedEvidence.rows[0].ownerUnlinked === true
      && preparedEvidence.rows[0].ownerPrepared === true,
    'OWNER_PREPARE_EVIDENCE_INVALID');

    stage = 'owner-submit';
    const submitted = await transitionPayrollNovelty(
      client,
      principals.owner,
      sessions.owner,
      'submit',
      {
        batchId,
        expectedVersion: 1,
        reasonCode: 'ready_for_review',
        reasonReference: null,
      },
      randomUUID(),
    );
    assertSafeSnapshot(submitted.data, 'submitted', 2);

    stage = 'reader-decision-negative-control';
    await expectRejected(client, 'reader_approve_denied', 'PAYROLL_NOVELTY_CAPABILITY_REQUIRED',
      () => transitionPayrollNovelty(
        client,
        principals.reader,
        sessions.reader,
        'approve',
        {
          batchId,
          expectedVersion: 2,
          reasonCode: 'validated_for_export',
          reasonReference: null,
        },
        randomUUID(),
      ));

    stage = 'owner-approval-negative-control';
    await expectRejected(client, 'owner_approve_denied', 'PAYROLL_NOVELTY_CAPABILITY_REQUIRED',
      () => transitionPayrollNovelty(
        client,
        principals.owner,
        sessions.owner,
        'approve',
        {
          batchId,
          expectedVersion: 2,
          reasonCode: 'validated_for_export',
          reasonReference: null,
        },
        randomUUID(),
      ));

    stage = 'persistence-maker-checker-negative-control';
    await expectRejected(client, 'maker_checker_guard', 'PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED',
      () => client.query(`
        UPDATE public.payroll_novelty_batch SET
          status = 'approved', version = version + 1,
          approved_by_membership_id = prepared_by_membership_id,
          approved_by_person_id = $2::uuid,
          reason_code = 'validated_for_export', reason_reference = NULL,
          exportable = true
        WHERE id = $1::uuid
      `, [batchId, approverEmployment.personId]));

    stage = 'approver-decision';
    const approverQueue = await getPayrollNoveltyBootstrap(
      client, principals.approver, sessions.approver,
    );
    const submittedForApproval = approverQueue.batches?.find((batch) => batch.id === batchId);
    invariant(exactValues(submittedForApproval?.allowedCommands, ['approve', 'reject']),
      'APPROVER_QUEUE_COMMANDS_INVALID');
    const approved = await transitionPayrollNovelty(
      client,
      principals.approver,
      sessions.approver,
      'approve',
      {
        batchId,
        expectedVersion: 2,
        reasonCode: 'validated_for_export',
        reasonReference: null,
      },
      randomUUID(),
    );
    assertSafeSnapshot(approved.data, 'approved', 3);
    invariant(approved.data?.exportable === true, 'PAYROLL_NOVELTY_NOT_EXPORTABLE');

    stage = 'approved-export';
    const exported = await exportPayrollNovelty(
      client, principals.owner, sessions.owner, batchId,
    );
    invariant(exported.contractVersion === 'payroll-novelty-export.v1'
      && exported.approvalEffect === 'export_only'
      && exported.data?.status === 'approved'
      && exported.data?.exportable === true
      && exported.data?.rows?.length === 1,
    'PAYROLL_NOVELTY_EXPORT_INVALID');
    assertSafeSnapshot(exported.data, 'approved', 3);

    stage = 'duplicate-content-negative-control';
    await expectRejected(client, 'duplicate_content_guard', 'PAYROLL_NOVELTY_DUPLICATE_BATCH',
      () => preparePayrollNovelty(
        client, principals.owner, sessions.owner, draft, randomUUID(),
      ));

    stage = 'reader-redaction';
    const readerAfter = await getPayrollNoveltyBootstrap(
      client, principals.reader, sessions.reader,
    );
    const readerBatch = readerAfter.batches?.find((batch) => batch.id === batchId);
    invariant(readerBatch && Array.isArray(readerBatch.rows) && readerBatch.rows.length === 0,
      'READER_NOMINAL_DATA_LEAK');
    invariant(readerBatch.canExport === false
      && exactValues(readerBatch.allowedCommands, []),
    'READER_ACTION_LEAK');

    stage = 'audit-chain';
    const audit = await client.query(`
      SELECT command, actor_membership_id AS "actorMembershipId",
        actor_person_id AS "actorPersonId", resulting_version AS "resultingVersion",
        grh_mutation AS "grhMutation", payroll_calculated AS "payrollCalculated",
        payroll_posted AS "payrollPosted"
      FROM public.payroll_novelty_event
      WHERE batch_id = $1::uuid ORDER BY resulting_version
    `, [batchId]);
    invariant(audit.rows.map((row) => row.command).join(',') === 'prepare,submit,approve'
      && audit.rows.map((row) => Number(row.resultingVersion)).join(',') === '1,2,3',
    'PAYROLL_NOVELTY_AUDIT_CHAIN_INVALID');
    invariant(audit.rows[0].actorMembershipId === owner.membershipId
      && audit.rows[1].actorMembershipId === owner.membershipId
      && audit.rows[2].actorMembershipId === approver.membershipId
      && audit.rows[0].actorPersonId === null
      && audit.rows[2].actorPersonId === approverEmployment.personId,
    'PAYROLL_NOVELTY_AUDIT_ACTORS_INVALID');
    invariant(audit.rows.every((row) => row.grhMutation === false
      && row.payrollCalculated === false && row.payrollPosted === false),
    'PAYROLL_NOVELTY_AUDIT_SIDE_EFFECT_DRIFT');

    stage = 'rollback';
    await client.query('ROLLBACK');
    transactionOpen = false;

    stage = 'post-rollback';
    const rolledBack = await client.query(`
      SELECT
        (SELECT count(*)::integer FROM public.tenant_identity_session
          WHERE id = ANY($1::uuid[])) AS sessions,
        (SELECT count(*)::integer FROM public.payroll_novelty_batch
          WHERE id = $2::uuid) AS batches,
        (SELECT count(*)::integer FROM public.payroll_novelty_event
          WHERE batch_id = $2::uuid) AS events
    `, [Object.values(sessionIds), batchId]);
    invariant(rolledBack.rows[0]?.sessions === 0
      && rolledBack.rows[0]?.batches === 0
      && rolledBack.rows[0]?.events === 0,
    'PAYROLL_NOVELTY_ROLLBACK_INCOMPLETE');

    return Object.freeze({
      branchId: target.branchId,
      tenantSlug: profiles.tenantSlug,
      ownerPreparedWithoutEmployment: true,
      approverApprovedWithEmployment: true,
      readerReadOnly: true,
      makerCheckerEnforced: true,
      approvedExportVerified: true,
      duplicateContentRejected: true,
      rollbackVerified: true,
    });
  } catch (error) {
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => undefined);
      transactionOpen = false;
    }
    throw new SmokeInvariantError(`${stage}:${payrollNoveltySmokeSafeCode(error)}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) {
  try {
    const result = await runPayrollNoveltySmoke();
    console.log(`smoke 026 verificado (${result.branchId}; rollback confirmado)`);
  } catch (error) {
    console.error(`smoke 026 fallo: ${payrollNoveltySmokeSafeCode(error)}`);
    process.exitCode = 1;
  }
}
