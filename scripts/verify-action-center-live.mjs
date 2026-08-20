import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { Client } from '@neondatabase/serverless';

import {
  createLeaveCase,
  listLeaveCases,
  readLeaveCase,
  transitionLeaveCase,
  updateLeaveDraft,
} from '../lib/internal-leave-workflow.js';
import { loadInternalPrincipal } from '../lib/internal-rbac.js';

const confirmation = process.argv.includes('--confirm-isolated-branch');
const branchId = String(process.env.ACTION_CENTER_QA_BRANCH_ID || '').trim();
const projectId = String(process.env.ACTION_CENTER_QA_PROJECT_ID || '').trim();
const qaEndpointHost = String(process.env.ACTION_CENTER_QA_ENDPOINT_HOST || '').trim().toLowerCase();
const productionBranchId = String(process.env.CANONICAL_PRODUCTION_BRANCH_ID || '').trim();
const productionEndpointHost = String(process.env.CANONICAL_PRODUCTION_HOST || '').trim().toLowerCase();
const ownerUrl = String(process.env.DATABASE_URL_UNPOOLED || '').trim();
const runtimeUrl = String(process.env.ACTIONS_DATABASE_URL || '').trim();

assert.ok(confirmation, 'Falta --confirm-isolated-branch.');
assert.match(branchId, /^br-[a-z0-9-]+$/i, 'ACTION_CENTER_QA_BRANCH_ID inválido.');
assert.match(projectId, /^[a-z0-9-]+$/i, 'ACTION_CENTER_QA_PROJECT_ID inválido.');
assert.match(qaEndpointHost, /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/i, 'Host QA de control plane inválido.');
assert.ok(productionBranchId && branchId !== productionBranchId, 'La verificación live no admite la rama productiva.');
assert.match(productionEndpointHost, /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/i, 'Host productivo inválido.');
assert.ok(ownerUrl.startsWith('postgres'), 'DATABASE_URL_UNPOOLED aislada requerida.');
assert.ok(runtimeUrl.startsWith('postgres'), 'ACTIONS_DATABASE_URL aislada requerida.');
assert.notEqual(ownerUrl, runtimeUrl, 'Owner y runtime deben usar credenciales distintas.');
for (const value of [ownerUrl, runtimeUrl]) {
  const host = new URL(value).hostname.toLowerCase();
  assert.equal(host, qaEndpointHost, 'La URL no usa el endpoint QA corroborado en Neon control plane.');
  assert.notEqual(host, productionEndpointHost, 'La URL apunta al endpoint productivo.');
}

const owner = new Client({ connectionString: ownerUrl });
const runtime = new Client({ connectionString: runtimeUrl });
const runtimeRace = new Client({ connectionString: runtimeUrl });

function qaEmail(kind, suffix) {
  return `qa-actions-${kind}-${suffix}@local.invalid`;
}

async function seedActors() {
  const contracts = await owner.query(`
    WITH requester AS MATERIALIZED (
      SELECT id, person_id, legacy_company_id, organization_unit_source_id
        FROM employment_contract
       WHERE status = 'active'
         AND person_id IS NOT NULL
         AND organization_unit_source_id IS NOT NULL
       ORDER BY id
       LIMIT 1
    ), approver AS MATERIALIZED (
      SELECT candidate.id, candidate.person_id
        FROM employment_contract candidate
        CROSS JOIN requester
       WHERE candidate.status = 'active'
         AND candidate.person_id IS NOT NULL
         AND candidate.person_id <> requester.person_id
         AND candidate.legacy_company_id = requester.legacy_company_id
       ORDER BY candidate.id
       LIMIT 1
    ), editor AS MATERIALIZED (
      SELECT candidate.id
        FROM employment_contract candidate
        CROSS JOIN requester
        CROSS JOIN approver
       WHERE candidate.status = 'active'
         AND candidate.person_id IS NOT NULL
         AND candidate.person_id <> requester.person_id
         AND candidate.person_id <> approver.person_id
       ORDER BY candidate.id
       LIMIT 1
    )
    SELECT requester.id::text AS requester_contract_id,
           approver.id::text AS approver_contract_id,
           editor.id::text AS editor_contract_id,
           requester.legacy_company_id AS company_id,
           requester.organization_unit_source_id AS organization_unit_source_id
      FROM requester, approver, editor
  `);
  assert.equal(contracts.rowCount, 1, 'No hay dos contratos activos de personas distintas en una empresa.');

  const row = contracts.rows[0];
  const dualIdentity = await owner.query(`
    SELECT maker.id::text AS maker_contract_id,
           decider.id::text AS decider_contract_id
      FROM employment_contract maker
      JOIN employment_contract decider
        ON decider.person_id = maker.person_id
       AND decider.id <> maker.id
       AND decider.status = 'active'
     WHERE maker.status = 'active'
       AND maker.id <> ALL($1::uuid[])
       AND decider.id <> ALL($1::uuid[])
     ORDER BY maker.person_id, maker.id, decider.id
     LIMIT 1
  `, [[row.requester_contract_id, row.approver_contract_id, row.editor_contract_id]]);
  assert.equal(dualIdentity.rowCount, 1, 'No hay dos contratos activos para probar identidad natural maker-checker.');

  const outsider = await owner.query(`
    SELECT id::text AS outsider_contract_id,
           organization_unit_source_id AS outsider_organization_unit_source_id
      FROM employment_contract
     WHERE status = 'active'
       AND legacy_company_id = $1::bigint
       AND organization_unit_source_id IS NOT NULL
       AND organization_unit_source_id <> $2
       AND id <> ALL($3::uuid[])
     ORDER BY organization_unit_source_id, id
     LIMIT 1
  `, [
    row.company_id,
    row.organization_unit_source_id,
    [
      row.requester_contract_id, row.approver_contract_id, row.editor_contract_id,
      dualIdentity.rows[0].maker_contract_id, dualIdentity.rows[0].decider_contract_id,
    ],
  ]);
  assert.equal(outsider.rowCount, 1, 'No hay otra organización activa para probar aislamiento por alcance.');

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const requesterEmail = qaEmail('requester', suffix);
  const approverEmail = qaEmail('approver', suffix);
  const editorEmail = qaEmail('editor', suffix);
  const makerEmail = qaEmail('maker', suffix);
  const siblingDeciderEmail = qaEmail('sibling-decider', suffix);
  const outsiderEmail = qaEmail('outsider', suffix);

  await owner.query(`
    INSERT INTO internal_users (email, display_name, role, password_hash, active)
    VALUES ($1, 'QA solicitante aislado', 'EMPLEADO', '!qa-isolated-disabled!', true),
           ($2, 'QA aprobador aislado', 'RRHH_APROBADOR', '!qa-isolated-disabled!', true),
           ($3, 'QA editor aislado', 'ADMIN_INTERNO', '!qa-isolated-disabled!', true),
           ($4, 'QA preparador aislado', 'RRHH_OPERADOR', '!qa-isolated-disabled!', true),
           ($5, 'QA decisor misma persona', 'RRHH_APROBADOR', '!qa-isolated-disabled!', true),
           ($6, 'QA aprobador fuera de alcance', 'RRHH_APROBADOR', '!qa-isolated-disabled!', true)
  `, [requesterEmail, approverEmail, editorEmail, makerEmail, siblingDeciderEmail, outsiderEmail]);
  await owner.query(`
    INSERT INTO internal_user_employment_link (user_email, employment_contract_id, active)
    VALUES ($1, $2::uuid, true), ($3, $4::uuid, true), ($5, $6::uuid, true),
           ($7, $8::uuid, true), ($9, $10::uuid, true), ($11, $12::uuid, true)
  `, [
    requesterEmail, row.requester_contract_id,
    approverEmail, row.approver_contract_id,
    editorEmail, row.editor_contract_id,
    makerEmail, dualIdentity.rows[0].maker_contract_id,
    siblingDeciderEmail, dualIdentity.rows[0].decider_contract_id,
    outsiderEmail, outsider.rows[0].outsider_contract_id,
  ]);
  await owner.query(`
    INSERT INTO internal_user_area_scope (
      user_email, scope_level, company_id, organization_unit_source_id, active
    )
    VALUES ($1, 'company', $2::bigint, NULL, true),
           ($3, 'company', $2::bigint, NULL, true),
           ($4, 'company', $2::bigint, NULL, true),
           ($5, 'organization', $2::bigint, $6, true)
  `, [
    approverEmail, row.company_id, makerEmail, siblingDeciderEmail,
    outsiderEmail, outsider.rows[0].outsider_organization_unit_source_id,
  ]);

  return {
    requesterEmail,
    approverEmail,
    editorEmail,
    makerEmail,
    siblingDeciderEmail,
    outsiderEmail,
    requesterContractId: row.requester_contract_id,
  };
}

async function databaseIdentity(client) {
  const result = await client.query(`
    SELECT current_setting('neon.branch_id', true) AS branch_id,
           current_setting('neon.project_id', true) AS project_id,
           current_database() AS database_name
  `);
  return result.rows[0];
}

async function assertIsolatedConnections() {
  const [ownerIdentity, runtimeIdentity] = await Promise.all([
    databaseIdentity(owner),
    databaseIdentity(runtime),
  ]);
  for (const identity of [ownerIdentity, runtimeIdentity]) {
    assert.equal(identity.branch_id, branchId, 'La conexión no pertenece a la rama QA confirmada.');
    assert.equal(identity.project_id, projectId, 'La conexión no pertenece al proyecto QA confirmado.');
    assert.equal(identity.database_name, 'neondb', 'Base QA inesperada.');
    assert.notEqual(identity.branch_id, productionBranchId, 'La conexión live apunta a Producción.');
  }
}

function forbiddenKeys(value, found = new Set()) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    for (const item of value) forbiddenKeys(item, found);
    return found;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (/employeeNote|decisionReason|actorEmail|password|cuil|dni/i.test(key)) found.add(key);
    forbiddenKeys(nested, found);
  }
  return found;
}

function annualPayload(contractId, dayOffset = 0) {
  const day = String(1 + dayOffset).padStart(2, '0');
  return {
    beneficiaryContractId: contractId,
    reasonCode: '19',
    policyVersionId: 'mendoza-ley-5811-title-vi.v1',
    policyRuleId: 'annual-ordinary',
    startsOn: `2094-01-${day}`,
    endsOn: `2094-01-${day}`,
    durationUnit: 'calendar_day',
    confidentiality: 'standard',
  };
}

function restrictedPayload(contractId) {
  return {
    beneficiaryContractId: contractId,
    reasonCode: '5',
    policyVersionId: 'mendoza-ley-5811-title-vi.v1',
    policyRuleId: 'health',
    startsOn: '2094-02-01',
    endsOn: '2094-02-01',
    durationUnit: 'calendar_day',
    confidentiality: 'restricted',
  };
}

async function assertRuntimeBoundary() {
  const identity = await runtime.query('SELECT current_user, session_user');
  assert.deepEqual(identity.rows[0], {
    current_user: 'municontrol_actions_runtime_app',
    session_user: 'municontrol_actions_runtime_app',
  });
  const privileges = await runtime.query(`
    SELECT has_column_privilege(current_user, 'action_case', 'id', 'SELECT') AS can_select_id,
           has_column_privilege(current_user, 'action_case', 'status', 'SELECT') AS can_select_status,
           has_table_privilege(current_user, 'action_case', 'INSERT') AS can_insert,
           has_table_privilege(current_user, 'action_case', 'UPDATE') AS can_update,
           has_table_privilege(current_user, 'action_case', 'DELETE') AS can_delete,
           has_table_privilege(current_user, 'action_command_context', 'INSERT') AS can_insert_context,
           has_sequence_privilege(current_user, 'action_case_case_number_seq', 'USAGE') AS can_use_sequence,
           has_function_privilege(
             current_user,
             'action_center_apply_command(text,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)',
             'EXECUTE'
           ) AS can_apply_command,
           has_function_privilege(
             current_user,
             'action_center_set_command_context(text,text,uuid,uuid,text,uuid,text,jsonb)',
             'EXECUTE'
           ) AS can_set_context
  `);
  assert.equal(privileges.rows[0].can_select_id, true);
  assert.equal(privileges.rows[0].can_select_status, true);
  assert.equal(privileges.rows[0].can_insert, false);
  assert.equal(privileges.rows[0].can_update, false);
  assert.equal(privileges.rows[0].can_delete, false);
  assert.equal(privileges.rows[0].can_insert_context, false);
  assert.equal(privileges.rows[0].can_use_sequence, false);
  assert.equal(privileges.rows[0].can_apply_command, true);
  assert.equal(privileges.rows[0].can_set_context, false);
  await assert.rejects(
    runtime.query("UPDATE action_case SET updated_at = updated_at WHERE false"),
    (error) => error?.code === '42501',
    'El runtime no debe disponer de UPDATE directo aunque no afecte filas.',
  );
  await assert.rejects(
    runtime.query(`
      INSERT INTO action_command_context (
        backend_pid, transaction_id, actor_user_email, actor_role, event_type,
        idempotency_key, command_hash
      ) VALUES (pg_backend_pid(), txid_current(), 'nobody@local.invalid', 'ADMIN_INTERNO',
                'created', gen_random_uuid(), repeat('a', 64))
    `),
    (error) => error?.code === '42501',
    'El runtime no debe fabricar el contexto transaccional.',
  );
}

async function run() {
  await owner.connect();
  await runtime.connect();
  await runtimeRace.connect();
  try {
    await assertIsolatedConnections();
    await assertRuntimeBoundary();
    const actors = await seedActors();
    const requester = await loadInternalPrincipal(runtime, { email: actors.requesterEmail });
    const approver = await loadInternalPrincipal(runtime, { email: actors.approverEmail });
    const editor = await loadInternalPrincipal(runtime, { email: actors.editorEmail });
    const maker = await loadInternalPrincipal(runtime, { email: actors.makerEmail });
    const siblingDecider = await loadInternalPrincipal(runtime, { email: actors.siblingDeciderEmail });
    const outsider = await loadInternalPrincipal(runtime, { email: actors.outsiderEmail });
    const raceApprover = await loadInternalPrincipal(runtimeRace, { email: actors.approverEmail });
    const raceRequester = await loadInternalPrincipal(runtimeRace, { email: actors.requesterEmail });
    assert.equal(requester.role, 'EMPLEADO');
    assert.equal(approver.role, 'RRHH_APROBADOR');
    assert.equal(editor.role, 'ADMIN_INTERNO');
    assert.equal(maker.role, 'RRHH_OPERADOR');
    assert.equal(siblingDecider.role, 'RRHH_APROBADOR');
    assert.equal(outsider.role, 'RRHH_APROBADOR');

    await assert.rejects(
      runtime.query(`
        SELECT * FROM action_center_apply_command(
          $1, 'leave_request', 'create', NULL, NULL, $2::uuid, $3,
          '{"durationUnit":"calendar_day"}'::jsonb, $4::uuid,
          'mendoza-ley-5811-title-vi.v1', 'restricted', NULL, NULL, false
        )
      `, [actors.requesterEmail, randomUUID(), 'a'.repeat(64), actors.requesterContractId]),
      (error) => error?.code === '23514' || /PAYLOAD|check constraint/i.test(String(error?.message || '')),
      'La DB debe rechazar payloads incompletos aunque se eluda la API.',
    );

    const createKey = randomUUID();
    const created = await createLeaveCase(runtime, requester, annualPayload(actors.requesterContractId), createKey);
    assert.equal(created.data.status, 'draft');
    assert.equal(created.data.version, 1);
    await assert.rejects(
      createLeaveCase(runtime, requester, annualPayload(actors.requesterContractId, 1), createKey),
      (error) => error?.code === 'ACTION_IDEMPOTENCY_KEY_REUSED' && error?.status === 409,
    );

    const submitKey = randomUUID();
    const submitted = await transitionLeaveCase(
      runtime, requester, 'submit', created.data.id, { expectedVersion: 1 }, submitKey,
    );
    assert.equal(submitted.data.status, 'submitted');
    assert.equal(submitted.data.version, 2);
    const replay = await transitionLeaveCase(
      runtime, requester, 'submit', created.data.id, { expectedVersion: 1 }, submitKey,
    );
    assert.equal(replay.replayed, true);
    assert.equal(replay.data.version, 2);

    const approved = await transitionLeaveCase(runtime, approver, 'approve', created.data.id, {
      expectedVersion: 2,
      reason: 'Validación humana de QA en rama aislada',
      evidenceStatus: 'not_required',
      manualValidationConfirmed: true,
    }, randomUUID());
    assert.equal(approved.data.status, 'approved');
    assert.equal(approved.data.version, 3);

    await assert.rejects(
      transitionLeaveCase(runtime, approver, 'cancel', created.data.id, {
        expectedVersion: 2,
        reason: 'Prueba de versión obsoleta',
      }, randomUUID()),
      (error) => error?.code === 'ACTION_VERSION_CONFLICT' && error?.status === 409,
    );

    const restricted = await createLeaveCase(runtime, requester, restrictedPayload(actors.requesterContractId), randomUUID());
    await transitionLeaveCase(runtime, requester, 'submit', restricted.data.id, { expectedVersion: 1 }, randomUUID());
    await assert.rejects(
      readLeaveCase(runtime, maker, restricted.data.id),
      (error) => error?.code === 'ACTION_CASE_NOT_FOUND' && error?.status === 404,
      'Un operador sin lectura restringida no debe distinguir el expediente.',
    );
    await assert.rejects(
      transitionLeaveCase(runtime, approver, 'approve', restricted.data.id, {
        expectedVersion: 2,
        reason: 'Evidencia insuficiente de QA',
        evidenceStatus: 'not_required',
        manualValidationConfirmed: true,
      }, randomUUID()),
      (error) => error?.code === 'ACTION_MANUAL_VALIDATION_REQUIRED' && error?.status === 422,
    );
    const restrictedApproved = await transitionLeaveCase(runtime, approver, 'approve', restricted.data.id, {
      expectedVersion: 2,
      reason: 'Evidencia verificada por humano en QA',
      evidenceStatus: 'verified',
      manualValidationConfirmed: true,
    }, randomUUID());
    assert.equal(restrictedApproved.data.status, 'approved');

    const makerCase = await createLeaveCase(
      runtime, requester, annualPayload(actors.requesterContractId, 2), randomUUID(),
    );
    const edited = await updateLeaveDraft(
      runtime, editor, makerCase.data.id,
      annualPayload(actors.requesterContractId, 2), 1, randomUUID(),
    );
    assert.equal(edited.data.version, 2);
    const makerSubmitted = await transitionLeaveCase(
      runtime, requester, 'submit', makerCase.data.id, { expectedVersion: 2 }, randomUUID(),
    );
    assert.equal(makerSubmitted.data.version, 3);
    await assert.rejects(
      transitionLeaveCase(runtime, editor, 'approve', makerCase.data.id, {
        expectedVersion: 3,
        reason: 'El editor no puede decidir el expediente',
        evidenceStatus: 'not_required',
        manualValidationConfirmed: true,
      }, randomUUID()),
      (error) => error?.code === 'ACTION_SEPARATION_OF_DUTIES' && error?.status === 409,
    );

    const naturalIdentityCase = await createLeaveCase(
      runtime, requester, annualPayload(actors.requesterContractId, 3), randomUUID(),
    );
    const naturalEdited = await updateLeaveDraft(
      runtime, maker, naturalIdentityCase.data.id,
      annualPayload(actors.requesterContractId, 3), 1, randomUUID(),
    );
    await transitionLeaveCase(
      runtime, requester, 'submit', naturalIdentityCase.data.id,
      { expectedVersion: naturalEdited.data.version }, randomUUID(),
    );
    await assert.rejects(
      transitionLeaveCase(runtime, siblingDecider, 'approve', naturalIdentityCase.data.id, {
        expectedVersion: 3,
        reason: 'Otra cuenta de la misma persona no puede decidir',
        evidenceStatus: 'not_required',
        manualValidationConfirmed: true,
      }, randomUUID()),
      (error) => error?.code === 'ACTION_SEPARATION_OF_DUTIES' && error?.status === 409,
    );

    await assert.rejects(
      readLeaveCase(runtime, outsider, created.data.id),
      (error) => error?.code === 'ACTION_CASE_NOT_FOUND' && error?.status === 404,
      'Un aprobador de otra empresa no debe distinguir el expediente.',
    );

    const raceCase = await createLeaveCase(
      runtime, requester, annualPayload(actors.requesterContractId, 4), randomUUID(),
    );
    await transitionLeaveCase(runtime, requester, 'submit', raceCase.data.id, { expectedVersion: 1 }, randomUUID());
    const race = await Promise.allSettled([
      transitionLeaveCase(runtime, approver, 'approve', raceCase.data.id, {
        expectedVersion: 2,
        reason: 'Decisión concurrente A en QA',
        evidenceStatus: 'not_required',
        manualValidationConfirmed: true,
      }, randomUUID()),
      transitionLeaveCase(runtimeRace, raceApprover, 'reject', raceCase.data.id, {
        expectedVersion: 2,
        reason: 'Decisión concurrente B en QA',
      }, randomUUID()),
    ]);
    assert.equal(race.filter((item) => item.status === 'fulfilled').length, 1);
    const rejectedRace = race.find((item) => item.status === 'rejected');
    assert.equal(rejectedRace.reason?.code, 'ACTION_VERSION_CONFLICT');

    const concurrentCreateKey = randomUUID();
    const concurrentCreatePayload = annualPayload(actors.requesterContractId, 5);
    const concurrentCreate = await Promise.all([
      createLeaveCase(runtime, requester, concurrentCreatePayload, concurrentCreateKey),
      createLeaveCase(runtimeRace, raceRequester, concurrentCreatePayload, concurrentCreateKey),
    ]);
    assert.equal(concurrentCreate[0].data.id, concurrentCreate[1].data.id);
    assert.equal(concurrentCreate.filter((item) => item.replayed).length, 1);
    const concurrentCreateEvents = await runtime.query(`
      SELECT count(*)::int AS events FROM action_case_event WHERE case_id = $1::uuid
    `, [concurrentCreate[0].data.id]);
    assert.equal(concurrentCreateEvents.rows[0].events, 1);

    await owner.query(`
      UPDATE internal_user_employment_link SET active = false, updated_at = now()
      WHERE lower(user_email) = lower($1)
    `, [actors.requesterEmail]);
    await assert.rejects(
      createLeaveCase(runtime, requester, concurrentCreatePayload, concurrentCreateKey),
      (error) => error?.code === 'ACTION_CASE_NOT_FOUND' && error?.status === 404,
      'Revocar el vínculo debe cortar incluso el replay idempotente.',
    );
    await owner.query(`
      UPDATE internal_user_employment_link SET active = true, updated_at = now()
      WHERE lower(user_email) = lower($1)
    `, [actors.requesterEmail]);

    const scopeCase = await createLeaveCase(
      runtime, requester, annualPayload(actors.requesterContractId, 6), randomUUID(),
    );
    await transitionLeaveCase(runtime, requester, 'submit', scopeCase.data.id, { expectedVersion: 1 }, randomUUID());
    await owner.query(`
      UPDATE internal_user_area_scope SET active = false, updated_at = now()
      WHERE lower(user_email) = lower($1)
    `, [actors.approverEmail]);
    await assert.rejects(
      transitionLeaveCase(runtime, approver, 'approve', scopeCase.data.id, {
        expectedVersion: 2,
        reason: 'El scope revocado no puede decidir',
        evidenceStatus: 'not_required',
        manualValidationConfirmed: true,
      }, randomUUID()),
      (error) => error?.code === 'ACTION_CASE_NOT_FOUND' && error?.status === 404,
    );
    await owner.query(`
      UPDATE internal_user_area_scope SET active = true, updated_at = now()
      WHERE lower(user_email) = lower($1)
    `, [actors.approverEmail]);
    const scopeApproved = await transitionLeaveCase(runtime, approver, 'approve', scopeCase.data.id, {
      expectedVersion: 2,
      reason: 'Scope restaurado sólo para completar QA aislada',
      evidenceStatus: 'not_required',
      manualValidationConfirmed: true,
    }, randomUUID());
    assert.equal(scopeApproved.data.status, 'approved');

    const detail = await readLeaveCase(runtime, approver, created.data.id);
    assert.equal(detail.data.status, 'approved');
    assert.equal(detail.timeline.length, 3);
    const list = await listLeaveCases(runtime, requester, { page: 1, limit: 10, view: 'mine' });
    assert.ok(list.data.some((item) => item.id === created.data.id));
    assert.deepEqual([...forbiddenKeys(list)].sort(), []);

    const eventCounts = await runtime.query(`
      SELECT count(*)::int AS events, count(DISTINCT case_version)::int AS versions
      FROM action_case_event
      WHERE case_id = ANY($1::uuid[])
    `, [[created.data.id, restricted.data.id]]);
    assert.equal(eventCounts.rows[0].events, 6);
    assert.equal(eventCounts.rows[0].versions, 3);

    console.log(JSON.stringify({
      ok: true,
      branch: 'isolated',
      roleBoundary: 'verified',
      standardWorkflow: 'approved',
      restrictedWorkflow: 'approved_after_verified_evidence',
      idempotentReplay: true,
      staleVersionBlocked: true,
      makerCheckerBlocked: true,
      naturalIdentityMakerCheckerBlocked: true,
      crossScopeIdorBlocked: true,
      concurrentDecisionSerialized: true,
      concurrentIdempotencySerialized: true,
      revokedLinkBlocksReplay: true,
      revokedScopeBlocksDecision: true,
      restrictedIdorBlocked: true,
      directDmlBlocked: true,
      auditEvents: eventCounts.rows[0].events,
      piiPrinted: false,
    }));
  } finally {
    await runtimeRace.end().catch(() => {});
    await runtime.end().catch(() => {});
    await owner.end().catch(() => {});
  }
}

await run();
