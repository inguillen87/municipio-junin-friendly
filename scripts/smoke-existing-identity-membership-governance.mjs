import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from '@neondatabase/serverless';

import {
  EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
  TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES,
  existingIdentityMembershipFingerprint,
} from './apply-existing-identity-membership-governance-schema.mjs';
import { directIsolatedDatabaseUrl } from './lib/canonical-import.mjs';

const QA_DIRECT_HOST = 'ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech';
const PRODUCTION_DIRECT_HOST = 'ep-green-fire-ac13eu56.sa-east-1.aws.neon.tech';
const EXPECTED_DATABASE = 'neondb';
const EXPECTED_DATABASE_ROLE = 'neondb_owner';
const SAFE_ROLE = 'TENANT_RRHH_ADMIN_OPERATIVO';
const FORBIDDEN_CAPABILITIES = Object.freeze([
  'payroll.read',
  'budget.approved.read',
  'leave.request.restricted.read',
  'leave.request.payroll.read',
  'employee.record.approve',
  'absence.validate',
  'leave.approve',
  'time.overtime.approve',
  'time.overtime.post',
]);
const MIGRATION_URL = new URL(
  './migrations/013-existing-identity-membership-governance.sql', import.meta.url,
);

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

function sortedUnique(values) {
  return [...new Set(values.map((value) => String(value)))].sort();
}

function sameValues(actual, expected) {
  const left = sortedUnique(actual);
  const right = sortedUnique(expected);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function safeFailure(error) {
  if (error?.safeCode) return error.safeCode;
  const message = String(error?.message || '').trim();
  const domainCode = message.match(/\b[A-Z][A-Z0-9_]{3,}\b/)?.[0];
  if (domainCode) return domainCode;
  const constraint = String(error?.constraint || '').trim();
  if (/^[a-z0-9_]{3,120}$/.test(constraint)) return `CONSTRAINT_${constraint.toUpperCase()}`;
  return 'DYNAMIC_SMOKE_FAILED';
}

function validateTarget(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const role = decodeURIComponent(parsed.username);
  invariant(parsed.hostname === QA_DIRECT_HOST, 'QA_DIRECT_HOST_MISMATCH');
  invariant(parsed.hostname !== PRODUCTION_DIRECT_HOST, 'PRODUCTION_HOST_FORBIDDEN');
  invariant(!parsed.hostname.includes('-pooler.'), 'POOLED_ENDPOINT_FORBIDDEN');
  invariant(database === EXPECTED_DATABASE, 'QA_DATABASE_MISMATCH');
  invariant(role === EXPECTED_DATABASE_ROLE, 'QA_DATABASE_ROLE_MISMATCH');
}

function validateProductionRejection() {
  try {
    directIsolatedDatabaseUrl(
      ['node', 'smoke', '--confirm-isolated-branch'],
      {
        DATABASE_URL_UNPOOLED: `postgresql://${PRODUCTION_DIRECT_HOST}/${EXPECTED_DATABASE}`,
        CANONICAL_PRODUCTION_HOST: PRODUCTION_DIRECT_HOST,
        NODE_ENV: 'development',
        VERCEL_ENV: 'preview',
      },
    );
  } catch (error) {
    return String(error?.message || '').includes('CANONICAL_PRODUCTION_HOST');
  }
  return false;
}

async function governedCommand(client, {
  actorEmail,
  actorSessionId,
  releaseSha,
  command,
  idempotencyKey,
  expectedVersion,
  payload,
}) {
  const response = await client.query(
    `SELECT tenant_membership_governance_apply_v1(
       $1, $2::uuid, 1, $3, $4, $5::uuid, $6, $7, $8::jsonb
     ) AS result`,
    [
      actorEmail,
      actorSessionId,
      releaseSha,
      command,
      idempotencyKey,
      '0'.repeat(64),
      expectedVersion,
      JSON.stringify(payload),
    ],
  );
  return response.rows[0]?.result;
}

async function main() {
  let stage = 'target-validation';
  let transactionOpen = false;
  const databaseUrl = directIsolatedDatabaseUrl();
  validateTarget(databaseUrl);
  invariant(validateProductionRejection(), 'PRODUCTION_REJECTION_GUARD_MISSING');

  const client = new Client({ connectionString: databaseUrl });
  const runId = randomUUID();
  const token = runId.replaceAll('-', '');
  const makerEmail = `qa-013-${token}-maker-a@invalid.example`;
  const checkerEmail = `qa-013-${token}-checker-b@invalid.example`;
  const targetEmail = `qa-013-${token}-target@invalid.example`;
  const makerSessionId = randomUUID();
  const checkerSessionId = randomUUID();
  const tenantId = randomUUID();
  const bindingId = randomUUID();
  const requestIdempotencyKey = randomUUID();
  const selfDecisionIdempotencyKey = randomUUID();
  const approvalIdempotencyKey = randomUUID();
  const releaseSha = createHash('sha1').update(`qa-013:${runId}`).digest('hex');
  const sourceDatabase = `qa_013_${token}`;
  const sourceCompanyId = (1_000_000_000n + (BigInt(`0x${token.slice(0, 8)}`) % 900_000_000n)).toString();
  let requestId;
  let membershipId;

  try {
    await client.connect();
    stage = 'migration-precondition';
    const expectedChecksum = existingIdentityMembershipFingerprint(
      await readFile(MIGRATION_URL, 'utf8'),
    );
    const precondition = await client.query(
      `SELECT current_database() = $1 AS database_ok,
              current_user = $2 AS role_ok,
              migration.checksum_sha256 = $3 AS checksum_ok,
              to_regprocedure(
                'public.tenant_membership_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)'
              ) IS NOT NULL AS function_ok
       FROM schema_migrations migration
       WHERE migration.version = $4`,
      [
        EXPECTED_DATABASE,
        EXPECTED_DATABASE_ROLE,
        expectedChecksum,
        EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
      ],
    );
    invariant(precondition.rowCount === 1, 'MIGRATION_013_NOT_INSTALLED');
    invariant(precondition.rows[0].database_ok === true, 'QA_DATABASE_MISMATCH');
    invariant(precondition.rows[0].role_ok === true, 'QA_DATABASE_ROLE_MISMATCH');
    invariant(precondition.rows[0].checksum_ok === true, 'MIGRATION_013_CHECKSUM_DRIFT');
    invariant(precondition.rows[0].function_ok === true, 'MIGRATION_013_FUNCTION_MISSING');

    stage = 'transactional-fixture-setup';
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query(
      `INSERT INTO internal_users (
         email, display_name, role, password_hash, active, auth_mode, identity_version
       ) VALUES
         ($1, 'QA Maker A', 'ADMIN_INTERNO', NULL, true, 'managed', 1),
         ($2, 'QA Checker B', 'ADMIN_INTERNO', NULL, true, 'managed', 1),
         ($3, 'QA Target', 'ADMIN_INTERNO', NULL, true, 'managed', 1)`,
      [makerEmail, checkerEmail, targetEmail],
    );
    await client.query(
      `INSERT INTO platform_user_role (
         user_email, role_key, active, granted_by_user_email
       ) VALUES
         ($1, 'PLATFORM_OWNER', true, $1),
         ($2, 'PLATFORM_OWNER', true, $1)`,
      [makerEmail, checkerEmail],
    );
    await client.query(
      `INSERT INTO tenant_identity_mfa_factor (
         user_email, secret_ciphertext, status
       ) VALUES
         ($1, $4, 'active'),
         ($2, $5, 'active'),
         ($3, $6, 'active')`,
      [
        makerEmail,
        checkerEmail,
        targetEmail,
        `qa-disposable-invalid-ciphertext:${randomUUID()}`,
        `qa-disposable-invalid-ciphertext:${randomUUID()}`,
        `qa-disposable-invalid-ciphertext:${randomUUID()}`,
      ],
    );
    await client.query(
      `INSERT INTO tenant_identity_session (
         id, user_email, active_tenant_id, source, auth_level,
         session_version, identity_version, status, expires_at
       ) VALUES
         ($1::uuid, $2, NULL, 'platform', 'mfa', 1, 1, 'active', clock_timestamp() + interval '30 minutes'),
         ($3::uuid, $4, NULL, 'platform', 'mfa', 1, 1, 'active', clock_timestamp() + interval '30 minutes')`,
      [makerSessionId, makerEmail, checkerSessionId, checkerEmail],
    );
    await client.query(
      `INSERT INTO platform_tenant (
         id, slug, legal_name, short_name, tenant_kind, jurisdiction,
         status, created_by_user_email
       ) VALUES (
         $1::uuid, $2, 'QA 013 Synthetic Municipality', 'QA 013',
         'sandbox', 'QA synthetic', 'active', $3
       )`,
      [tenantId, `qa-013-${token.slice(0, 24)}`, makerEmail],
    );
    await client.query(
      `INSERT INTO platform_tenant_source_binding (
         id, tenant_id, source_system, source_database, source_company_id,
         verified, verified_by_user_email, verified_at
       ) VALUES ($1::uuid, $2::uuid, 'GRH', $3, $4::bigint, true, $5, clock_timestamp())`,
      [bindingId, tenantId, sourceDatabase, sourceCompanyId, makerEmail],
    );
    await client.query(
      `UPDATE tenant_identity_policy SET
         tenant_data_plane_ready = true,
         certified_source_binding_id = $2::uuid,
         certified_release_sha = $3,
         certified_by_user_email = $4,
         certified_at = clock_timestamp(),
         version = version + 1,
         updated_at = clock_timestamp()
       WHERE tenant_id = $1::uuid`,
      [tenantId, bindingId, releaseSha, makerEmail],
    );

    stage = 'maker-request';
    const requestResult = await governedCommand(client, {
      actorEmail: makerEmail,
      actorSessionId: makerSessionId,
      releaseSha,
      command: 'request_existing_membership',
      idempotencyKey: requestIdempotencyKey,
      expectedVersion: 0,
      payload: {
        tenantId,
        email: targetEmail,
        roleKey: SAFE_ROLE,
        reason: 'QA transactional explicit tenant membership request',
      },
    });
    invariant(requestResult?.approvalRequired === true, 'REQUEST_APPROVAL_NOT_REQUIRED');
    invariant(requestResult?.membershipChanged === false, 'REQUEST_CHANGED_MEMBERSHIP');
    invariant(requestResult?.futureTenantAccess === false, 'REQUEST_FUTURE_TENANT_ACCESS');
    invariant(requestResult?.databaseSuperuser === false, 'REQUEST_DATABASE_SUPERUSER');
    invariant(requestResult?.credentialsCreated === false, 'REQUEST_CREATED_CREDENTIALS');
    invariant(requestResult?.request?.roleKey === SAFE_ROLE, 'REQUEST_ROLE_DRIFT');
    invariant(requestResult?.request?.status === 'pending', 'REQUEST_NOT_PENDING');
    requestId = requestResult.request.id;
    const requestVersion = Number(requestResult.request.version);
    invariant(Number.isInteger(requestVersion) && requestVersion > 0, 'REQUEST_VERSION_INVALID');
    const beforeApproval = await client.query(
      `SELECT count(*)::integer AS memberships
       FROM tenant_membership WHERE lower(user_email) = lower($1)`,
      [targetEmail],
    );
    invariant(beforeApproval.rows[0].memberships === 0, 'MEMBERSHIP_CREATED_BEFORE_APPROVAL');

    stage = 'maker-self-approval-negative-control';
    await client.query('SAVEPOINT maker_checker_negative_control');
    let selfApprovalError;
    try {
      await governedCommand(client, {
        actorEmail: makerEmail,
        actorSessionId: makerSessionId,
        releaseSha,
        command: 'approve_membership_change',
        idempotencyKey: selfDecisionIdempotencyKey,
        expectedVersion: requestVersion,
        payload: {
          requestId,
          reason: 'QA maker must not approve own request',
        },
      });
    } catch (error) {
      selfApprovalError = error;
    }
    await client.query('ROLLBACK TO SAVEPOINT maker_checker_negative_control');
    await client.query('RELEASE SAVEPOINT maker_checker_negative_control');
    invariant(
      String(selfApprovalError?.message || '').includes('TENANT_MEMBERSHIP_MAKER_CHECKER_REQUIRED'),
      'MAKER_SELF_APPROVAL_NOT_REJECTED',
    );

    stage = 'checker-approval';
    const approvalResult = await governedCommand(client, {
      actorEmail: checkerEmail,
      actorSessionId: checkerSessionId,
      releaseSha,
      command: 'approve_membership_change',
      idempotencyKey: approvalIdempotencyKey,
      expectedVersion: requestVersion,
      payload: {
        requestId,
        reason: 'QA independent checker approval',
      },
    });
    invariant(approvalResult?.membershipChanged === true, 'APPROVAL_DID_NOT_CHANGE_MEMBERSHIP');
    invariant(approvalResult?.request?.status === 'approved', 'REQUEST_NOT_APPROVED');
    invariant(approvalResult?.membership?.status === 'active', 'MEMBERSHIP_NOT_ACTIVE');
    invariant(approvalResult?.membership?.roleKey === SAFE_ROLE, 'MEMBERSHIP_ROLE_DRIFT');
    invariant(approvalResult?.membership?.tenantId === tenantId, 'MEMBERSHIP_TENANT_DRIFT');
    invariant(approvalResult?.membership?.explicitTenantAccess === true, 'MEMBERSHIP_NOT_EXPLICIT');
    invariant(approvalResult?.futureTenantAccess === false, 'APPROVAL_FUTURE_TENANT_ACCESS');
    invariant(approvalResult?.databaseSuperuser === false, 'APPROVAL_DATABASE_SUPERUSER');
    invariant(approvalResult?.credentialsCreated === false, 'APPROVAL_CREATED_CREDENTIALS');
    membershipId = approvalResult.membership.id;

    stage = 'authorization-and-audit-evidence';
    const membershipEvidence = await client.query(
      `SELECT
         count(*)::integer AS total_memberships,
         count(*) FILTER (WHERE tenant_id = $2::uuid)::integer AS expected_tenant_memberships,
         bool_and(role_key = $3 AND status = 'active') AS exact_role_and_status
       FROM tenant_membership
       WHERE lower(user_email) = lower($1)`,
      [targetEmail, tenantId, SAFE_ROLE],
    );
    invariant(membershipEvidence.rows[0].total_memberships === 1, 'TARGET_MEMBERSHIP_SCOPE_NOT_EXACT');
    invariant(
      membershipEvidence.rows[0].expected_tenant_memberships === 1,
      'TARGET_MEMBERSHIP_TENANT_NOT_EXACT',
    );
    invariant(membershipEvidence.rows[0].exact_role_and_status === true, 'TARGET_ROLE_STATUS_INVALID');

    const capabilities = await client.query(
      `SELECT capability_key
       FROM tenant_iam_effective_capabilities($1::uuid)
       ORDER BY capability_key`,
      [membershipId],
    );
    const effectiveCapabilities = capabilities.rows.map((row) => row.capability_key);
    invariant(
      sameValues(effectiveCapabilities, TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES),
      'EFFECTIVE_CAPABILITY_SET_DRIFT',
    );
    const dangerousCapabilities = effectiveCapabilities.filter(
      (capability) => FORBIDDEN_CAPABILITIES.includes(capability),
    );
    invariant(dangerousCapabilities.length === 0, 'DANGEROUS_CAPABILITY_PRESENT');

    const requestEvidence = await client.query(
      `SELECT status = 'approved' AS approved,
              lower(requested_by_user_email) = lower($2) AS maker_ok,
              lower(decided_by_user_email) = lower($3) AS checker_ok,
              lower(target_user_email) = lower($4) AS target_ok,
              lower(requested_by_user_email) <> lower(decided_by_user_email)
                AND lower(requested_by_user_email) <> lower(target_user_email)
                AND lower(decided_by_user_email) <> lower(target_user_email) AS all_distinct
       FROM tenant_membership_change_request
       WHERE id = $1::uuid`,
      [requestId, makerEmail, checkerEmail, targetEmail],
    );
    invariant(requestEvidence.rowCount === 1, 'REQUEST_AUDIT_ROW_MISSING');
    invariant(requestEvidence.rows[0].approved === true, 'REQUEST_AUDIT_NOT_APPROVED');
    invariant(requestEvidence.rows[0].maker_ok === true, 'REQUEST_AUDIT_MAKER_DRIFT');
    invariant(requestEvidence.rows[0].checker_ok === true, 'REQUEST_AUDIT_CHECKER_DRIFT');
    invariant(requestEvidence.rows[0].target_ok === true, 'REQUEST_AUDIT_TARGET_DRIFT');
    invariant(requestEvidence.rows[0].all_distinct === true, 'MAKER_CHECKER_TARGET_NOT_DISTINCT');

    const auditEvidence = await client.query(
      `SELECT
         count(*)::integer AS event_count,
         count(context.event_id)::integer AS context_count,
         bool_and(context.request_id = $1::uuid) AS request_bound,
         bool_and(context.release_sha = $2) AS release_bound,
         bool_and(context.reason_hash ~ '^[a-f0-9]{64}$') AS reasons_hashed,
         bool_and(
           (event.command = 'request_existing_membership'
             AND lower(event.actor_user_email) = lower($3)
             AND context.actor_session_id = $4::uuid
             AND context.expected_version = 0)
           OR
           (event.command = 'approve_membership_change'
             AND lower(event.actor_user_email) = lower($5)
             AND context.actor_session_id = $6::uuid
             AND context.expected_version = $7)
         ) AS actor_sessions_bound,
         bool_and(
           event.target_type = 'tenant_membership_request'
           AND event.target_id = $1::uuid::text
           AND event.result->>'futureTenantAccess' = 'false'
           AND event.result->>'databaseSuperuser' = 'false'
           AND event.result->>'credentialsCreated' = 'false'
         ) AS safe_results
       FROM tenant_iam_event event
       JOIN tenant_membership_governance_event_context context
         ON context.event_id = event.id
       WHERE event.idempotency_key = ANY($8::uuid[])`,
      [
        requestId,
        releaseSha,
        makerEmail,
        makerSessionId,
        checkerEmail,
        checkerSessionId,
        requestVersion,
        [requestIdempotencyKey, approvalIdempotencyKey],
      ],
    );
    const audited = auditEvidence.rows[0];
    invariant(audited.event_count === 2, 'GOVERNANCE_EVENT_COUNT_INVALID');
    invariant(audited.context_count === 2, 'GOVERNANCE_CONTEXT_COUNT_INVALID');
    invariant(audited.request_bound === true, 'GOVERNANCE_CONTEXT_REQUEST_DRIFT');
    invariant(audited.release_bound === true, 'GOVERNANCE_CONTEXT_RELEASE_DRIFT');
    invariant(audited.reasons_hashed === true, 'GOVERNANCE_REASON_HASH_INVALID');
    invariant(audited.actor_sessions_bound === true, 'GOVERNANCE_ACTOR_SESSION_DRIFT');
    invariant(audited.safe_results === true, 'GOVERNANCE_EVENT_RESULT_UNSAFE');

    const databaseRoleEvidence = await client.query(
      'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS nominal_database_role',
      [targetEmail],
    );
    invariant(databaseRoleEvidence.rows[0].nominal_database_role === false, 'TARGET_DATABASE_ROLE_CREATED');

    stage = 'rollback';
    await client.query('ROLLBACK');
    transactionOpen = false;

    stage = 'post-rollback-evidence';
    const postRollback = await client.query(
      `SELECT
         (SELECT count(*) FROM internal_users
            WHERE email = ANY($1::text[]))::integer AS users,
         (SELECT count(*) FROM platform_user_role
            WHERE user_email = ANY($1::text[]))::integer AS platform_roles,
         (SELECT count(*) FROM tenant_identity_mfa_factor
            WHERE user_email = ANY($1::text[]))::integer AS mfa_factors,
         (SELECT count(*) FROM tenant_identity_session
            WHERE id = ANY($2::uuid[]))::integer AS sessions,
         (SELECT count(*) FROM platform_tenant
            WHERE id = $3::uuid)::integer AS tenants,
         (SELECT count(*) FROM platform_tenant_source_binding
            WHERE id = $4::uuid)::integer AS bindings,
         (SELECT count(*) FROM tenant_identity_policy
            WHERE tenant_id = $3::uuid)::integer AS policies,
         (SELECT count(*) FROM tenant_membership
            WHERE id = $5::uuid)::integer AS memberships,
         (SELECT count(*) FROM tenant_action_authority
            WHERE membership_id = $5::uuid)::integer AS authorities,
         (SELECT count(*) FROM tenant_membership_change_request
            WHERE id = $6::uuid)::integer AS requests,
         (SELECT count(*) FROM tenant_iam_event
            WHERE idempotency_key = ANY($7::uuid[]))::integer AS events,
         (SELECT count(*) FROM tenant_membership_governance_event_context
            WHERE request_id = $6::uuid)::integer AS contexts`,
      [
        [makerEmail, checkerEmail, targetEmail],
        [makerSessionId, checkerSessionId],
        tenantId,
        bindingId,
        membershipId,
        requestId,
        [requestIdempotencyKey, selfDecisionIdempotencyKey, approvalIdempotencyKey],
      ],
    );
    const residual = postRollback.rows[0];
    const residualRows = Object.values(residual).reduce((total, value) => total + Number(value), 0);
    invariant(residualRows === 0, 'ROLLBACK_LEFT_FIXTURE_ROWS');

    console.log(JSON.stringify({
      ok: true,
      target: {
        branch: 'br-plain-dust-acpjgebb',
        exactDirectHostValidated: true,
        productionHostRejected: true,
        pooledEndpointRejected: true,
        databaseAndRoleValidated: true,
      },
      migration013: {
        installed: true,
        checksumMatchesWorkspace: true,
        governedFunctionPresent: true,
      },
      makerChecker: {
        makerRequested: true,
        membershipAbsentBeforeApproval: true,
        makerSelfApprovalRejected: true,
        independentCheckerApproved: true,
        makerCheckerTargetAllDistinct: true,
      },
      membership: {
        exactRole: SAFE_ROLE,
        active: true,
        explicitTenantOnly: true,
        futureTenantAccess: false,
        databaseSuperuser: false,
        databaseRoleCreated: false,
      },
      authorization: {
        expectedCapabilityCount: TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES.length,
        effectiveCapabilityCount: effectiveCapabilities.length,
        exactCapabilitySet: true,
        forbiddenCapabilityCount: dangerousCapabilities.length,
      },
      audit: {
        eventCount: audited.event_count,
        contextCount: audited.context_count,
        requestReleaseActorSessionsAndReasonHashesBound: true,
      },
      rollback: {
        executed: true,
        residualFixtureRows: residualRows,
        fixturesPersisted: false,
      },
    }));
  } catch (error) {
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => undefined);
      transactionOpen = false;
    }
    console.error(JSON.stringify({
      ok: false,
      stage,
      cause: safeFailure(error),
      productionWritePerformed: false,
    }));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
