import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import {
  tenantActionUnlinkedOperatorFingerprint,
  verifyTenantActionUnlinkedOperatorFinalState,
} from './apply-tenant-action-unlinked-operator-schema.mjs';

export const ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION =
  '018-action-center-operational-completion';
export const ACTION_CENTER_OPERATIONAL_DETAIL_SIGNATURE =
  'public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)';

const PREREQUISITE_MIGRATION_VERSION = '017-tenant-action-unlinked-operator';
const MIGRATION_URL = new URL(
  './migrations/018-action-center-operational-completion.sql', import.meta.url,
);
const PREREQUISITE_URL = new URL(
  './migrations/017-tenant-action-unlinked-operator.sql', import.meta.url,
);
const DETAIL_BASELINE_URL = new URL(
  './migrations/007-action-center-read-facades.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const ACTION_CENTER_LIST_SIGNATURE =
  'public.action_center_tenant_list_v2(text,uuid,integer,text,uuid,uuid,text,text,text,integer,integer)';
const EXPECTED_RETURN_TYPE = 'jsonb';
const EXPECTED_CONFIDENTIALITY_CONSTRAINT =
  "CHECK (case_type <> 'leave_request' OR (payload->>'reasonCode' = '19' OR confidentiality = 'restricted'))";
const EXPECTED_EMPLOYEE_NOTE_CONSTRAINT =
  "CHECK (case_type <> 'leave_request' OR NOT (payload ? 'employeeNote') "
    + "OR payload->'employeeNote' = 'null'::jsonb OR "
    + "(jsonb_typeof(payload->'employeeNote') = 'string' "
    + "AND length(payload->>'employeeNote') <= 500))";

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function exactSet(actual, expected, label) {
  const got = [...new Set(actual || [])].map(String).sort();
  const wanted = [...new Set(expected || [])].map(String).sort();
  if (JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

function occurrenceCount(value, token) {
  return String(value || '').split(token).length - 1;
}

function functionBodyFromMigration(sql, functionName) {
  const source = String(sql || '');
  const markers = [
    `CREATE OR REPLACE FUNCTION public.${functionName}(`,
    `CREATE OR REPLACE FUNCTION ${functionName}(`,
  ];
  const start = markers.map((marker) => source.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (!Number.isInteger(start)) throw new Error(`fuente SQL ausente para ${functionName}`);
  const bodyMarker = source.indexOf('AS $$', start);
  const bodyStart = bodyMarker < 0 ? -1 : bodyMarker + 'AS $$'.length;
  const bodyEnd = bodyStart < 0 ? -1 : source.indexOf('$$;', bodyStart);
  if (bodyStart < 0 || bodyEnd < bodyStart) {
    throw new Error(`cuerpo SQL incompleto para ${functionName}`);
  }
  return source.slice(bodyStart, bodyEnd);
}

function commandRegion(body) {
  const source = normalized(body);
  const startToken = "if coalesce(context_value->>'employmentcontractid', '') <> ''";
  const endToken = '-- la autoridad y el caso siguen bloqueados hasta finalizar este statement;';
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  if (start < 0 || end <= start) throw new Error('region de comandos de detalle ausente');
  return Object.freeze({
    prefix: source.slice(0, start),
    region: source.slice(start, end),
    suffix: source.slice(end),
  });
}

export function actionCenterOperationalCompletionFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function actionCenterOperationalFunctionSourceFingerprint(value) {
  const canonical = String(value || '').replace(/\r\n?/g, '\n').trim();
  return createHash('sha256').update(canonical).digest('hex');
}

export function actionCenterConfidentialityConstraintFingerprint(value) {
  return normalized(value)
    .replaceAll('::text', '')
    .replaceAll('::character varying', '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, '');
}

export function validateActionCenterOperationalDetailDefinition(definition) {
  const body = normalized(definition);
  const region = commandRegion(body).region;
  for (const token of [
    'action_center_assert_tenant_read_session_v2(',
    'action_center_context_nominal_read(',
    "action_row.confidentiality = 'standard'",
    "action_center_context_has_capability(context_value, 'leave.request.payroll.read')",
    "'employeeNote', CASE WHEN nominal_allowed THEN action_row.payload->>'employeeNote' END",
    "CASE WHEN nominal_allowed THEN timeline_value ELSE '[]'::jsonb END",
    "CASE WHEN nominal_allowed THEN commands_value ELSE '[]'::jsonb END",
    "IF COALESCE(context_value->>'employmentContractId', '') <> ''",
    "AND (context_value->>'actorPersonId') IS NOT NULL THEN",
    'preparation_event.actor_membership_id = (context_value->>\'membershipId\')::uuid',
    'preparation_event.actor_person_id IS NOT NULL',
    'action_center_tenant_actor_authorized(',
    "command.command_name NOT IN ('approve', 'reject') OR (",
    "command.command_name <> 'cancel' OR action_row.status <> 'approved' OR (",
  ]) {
    if (!body.includes(normalized(token))) {
      throw new Error(`detalle 018 incompleto: ${token}`);
    }
  }
  if (!body.includes('set search_path = public, pg_temp')
      && !body.includes('set search_path to public, pg_temp')
      && !body.includes("set search_path to 'public', 'pg_temp'")
      && !body.includes("set search_path to 'public, pg_temp'")) {
    throw new Error('detalle 018 incompleto: search_path public, pg_temp');
  }
  if (body.includes(
    'preparation_event.actor_person_id is null '
      + "or preparation_event.actor_person_id = (context_value->>'actorpersonid')::uuid",
  )) {
    throw new Error('detalle 018 bloquea decisiones por preparaciones sin persona');
  }

  const sodGate = region.indexOf(
    "if coalesce(context_value->>'employmentcontractid', '') <> ''",
  );
  const sodGateEnd = region.indexOf('end if;', sodGate);
  const commandsSelect = region.indexOf(
    "select coalesce(jsonb_agg(command_name order by command_order), '[]'::jsonb)",
  );
  if (!(sodGate === 0 && sodGateEnd > sodGate && commandsSelect > sodGateEnd)) {
    throw new Error('detalle 018 vuelve a anidar comandos de preparacion tras el vinculo');
  }

  const preparationCommands = region.slice(commandsSelect);
  if (!preparationCommands.includes(
    "from (values ('update_draft', 1), ('submit', 2), ('approve', 3), "
      + "('reject', 4), ('cancel', 5)",
  )) {
    throw new Error('detalle 018 altera el inventario de comandos');
  }
  if (occurrenceCount(
    preparationCommands,
    "coalesce(context_value->>'employmentcontractid', '') <> ''",
  ) !== 2
      || occurrenceCount(
        preparationCommands,
        "(context_value->>'actorpersonid') is not null",
      ) !== 2
      || occurrenceCount(preparationCommands, 'and not sod_conflict') !== 2) {
    throw new Error('detalle 018 no cierra exactamente decisiones y cancelacion aprobada');
  }
  if (preparationCommands.includes(
    "command.command_name not in ('approve', 'reject') or not sod_conflict",
  ) || preparationCommands.includes(
    "command.command_name <> 'cancel' or action_row.status <> 'approved' or not sod_conflict",
  )) {
    throw new Error('detalle 018 permite decisiones sin vinculo laboral');
  }
  return true;
}

export function validateActionCenterOperationalCompletionMigrationSql(sql, baselineSql) {
  const source = String(sql || '');
  if ((source.match(/CREATE OR REPLACE FUNCTION/gi) || []).length !== 1) {
    throw new Error('migracion 018 debe reemplazar una sola funcion');
  }
  validateActionCenterOperationalDetailDefinition(source);
  const baselineRegion = commandRegion(
    functionBodyFromMigration(baselineSql, 'action_center_tenant_detail_v2'),
  );
  const migrationRegion = commandRegion(
    functionBodyFromMigration(source, 'action_center_tenant_detail_v2'),
  );
  if (migrationRegion.prefix !== baselineRegion.prefix
      || migrationRegion.suffix !== baselineRegion.suffix) {
    throw new Error('migracion 018 altera proyecciones o locks fuera de allowedCommands');
  }
  for (const token of [
    'LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp',
    'ALTER TABLE public.action_case DROP CONSTRAINT action_case_leave_confidentiality_ck',
    'ADD CONSTRAINT action_case_leave_confidentiality_ck CHECK',
    "case_type <> 'leave_request'",
    "payload->>'reasonCode' = '19'",
    "confidentiality = 'restricted'",
    'NOT VALID',
    'VALIDATE CONSTRAINT action_case_leave_confidentiality_ck',
    'COMMENT ON CONSTRAINT action_case_leave_confidentiality_ck ON public.action_case',
    'ADD CONSTRAINT action_case_employee_note_length_ck CHECK',
    "jsonb_typeof(payload->'employeeNote') = 'string'",
    "length(payload->>'employeeNote') <= 500",
    'VALIDATE CONSTRAINT action_case_employee_note_length_ck',
    'COMMENT ON CONSTRAINT action_case_employee_note_length_ck ON public.action_case',
    'REVOKE ALL ON FUNCTION public.action_center_tenant_detail_v2',
    'FROM PUBLIC CASCADE',
    'aclexplode(COALESCE(',
    'acl.grantee <> function_row.proowner',
    'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s CASCADE',
    'GRANT EXECUTE ON FUNCTION public.action_center_tenant_detail_v2',
    'TO municontrol_actions_runtime_app',
  ]) {
    if (!normalized(source).includes(normalized(token))) {
      throw new Error(`migracion 018 incompleta: ${token}`);
    }
  }
  const constraintSql = source.match(
    /ADD\s+CONSTRAINT\s+action_case_leave_confidentiality_ck\s+([\s\S]*?)\s+NOT\s+VALID\s*;/i,
  )?.[1];
  if (!constraintSql
      || actionCenterConfidentialityConstraintFingerprint(constraintSql)
        !== actionCenterConfidentialityConstraintFingerprint(
          EXPECTED_CONFIDENTIALITY_CONSTRAINT,
        )) {
    throw new Error('migracion 018 altera mas que la prohibicion de employeeNote restringida');
  }
  const employeeNoteConstraintSql = source.match(
    /ADD\s+CONSTRAINT\s+action_case_employee_note_length_ck\s+([\s\S]*?)\s+NOT\s+VALID\s*;/i,
  )?.[1];
  if (!employeeNoteConstraintSql
      || actionCenterConfidentialityConstraintFingerprint(employeeNoteConstraintSql)
        !== actionCenterConfidentialityConstraintFingerprint(
          EXPECTED_EMPLOYEE_NOTE_CONSTRAINT,
        )) {
    throw new Error('migracion 018 no conserva string/null y limite employeeNote 500 exactos');
  }
  if (normalized(source).includes("confidentiality <> 'restricted' or not (payload ? 'employeenote')")
      || /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?action_center_valid_leave_payload/i
        .test(source)
      || /\b(?:create|alter|drop)\s+(?:role|schema|database)\b/i.test(source)
      || /\b(?:create|drop)\s+table\b/i.test(source)
      || /\bgrant\s+(?!execute\b)/i.test(source)
      || /guillen|gmail\.com|marcelo@|\b(?:password|raw_code|plain_code|otp_code)\b/i
        .test(source)) {
    throw new Error('migracion 018 amplia validacion, objetos, ACL o material sensible');
  }
  return true;
}

function validateDetailEnvelope(entry) {
  if (!entry || entry.signature !== ACTION_CENTER_OPERATIONAL_DETAIL_SIGNATURE
      || entry.securityDefiner !== true || entry.ownerMatches !== true
      || entry.exactSearchPath !== true || entry.language !== 'plpgsql'
      || entry.kind !== 'f' || entry.volatility !== 'v'
      || entry.strict !== false || entry.parallel !== 'u'
      || normalized(entry.returnType) !== EXPECTED_RETURN_TYPE
      || !entry.owner || entry.owner === RUNTIME_ROLE) {
    throw new Error('detalle 018 instalado fuera de contrato');
  }
  exactSet(entry.grants, [
    `${entry.owner}:EXECUTE`, `${RUNTIME_ROLE}:EXECUTE`,
  ], 'ACL detalle 018');
  return true;
}

export function validateActionCenterOperationalCompletionEvidence(evidence, migrationSql) {
  const detail = evidence?.detail;
  validateDetailEnvelope(detail);
  validateActionCenterOperationalDetailDefinition(detail.definition);
  const expectedSource = functionBodyFromMigration(
    migrationSql, 'action_center_tenant_detail_v2',
  );
  if (actionCenterOperationalFunctionSourceFingerprint(detail.source)
      !== actionCenterOperationalFunctionSourceFingerprint(expectedSource)) {
    throw new Error('fuente instalada de detalle 018 difiere de la migracion');
  }
  if (evidence?.constraint?.validated !== true
      || actionCenterConfidentialityConstraintFingerprint(evidence.constraint.definition)
        !== actionCenterConfidentialityConstraintFingerprint(
          EXPECTED_CONFIDENTIALITY_CONSTRAINT,
        )) {
    throw new Error('constraint de confidencialidad 018 no es exacta o validada');
  }
  if (evidence?.employeeNoteConstraint?.validated !== true
      || actionCenterConfidentialityConstraintFingerprint(
        evidence.employeeNoteConstraint.definition,
      ) !== actionCenterConfidentialityConstraintFingerprint(
        EXPECTED_EMPLOYEE_NOTE_CONSTRAINT,
      )) {
    throw new Error('constraint employeeNote 018 no es exacta o validada');
  }
  if (evidence?.actionCaseOwnerMatches !== true) {
    throw new Error('owner de action_case fuera de contrato');
  }
  const list = normalized(evidence?.listDefinition);
  if (!list || list.includes('employeenote') || list.includes('to_jsonb(page.payload)')
      || list.includes("page.payload - 'employeenote'")) {
    throw new Error('listado 018 expone employeeNote o payload no allowlisted');
  }
  for (const relation of evidence?.relationDml || []) {
    if (relation.ownerMatches !== true
        || relation.insert || relation.update || relation.delete
        || relation.truncate || relation.references || relation.trigger
        || relation.columnInsert || relation.columnUpdate || relation.columnReferences
        || relation.publicTablePrivileges || relation.publicColumnPrivileges
        || (relation.nonOwnerTableDml || []).length
        || (relation.nonOwnerColumnDml || []).length) {
      throw new Error(`DML runtime 018 expuesto: ${relation.name || 'desconocida'}`);
    }
  }
  exactSet((evidence?.relationDml || []).map((item) => item.name), [
    'action_case', 'action_case_event',
  ], 'relaciones protegidas 018');
  return true;
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function collectEvidence(client) {
  const functionResult = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      pg_get_functiondef(function_row.oid) AS definition,
      function_row.prosrc AS source,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownerMatches",
      function_row.proconfig = ARRAY['search_path=public, pg_temp']::text[]
        AS "exactSearchPath",
      language.lanname AS language,
      function_row.prokind::text AS kind,
      function_row.provolatile AS volatility,
      function_row.proisstrict AS strict,
      function_row.proparallel AS parallel,
      pg_get_function_result(function_row.oid) AS "returnType",
      owner.rolname AS owner,
      COALESCE((SELECT array_agg(COALESCE(grantee.rolname, 'PUBLIC') || ':' || acl.privilege_type
          ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type)
        FROM aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee), ARRAY[]::text[]) AS grants
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_language language ON language.oid = function_row.prolang
    JOIN pg_roles owner ON owner.oid = function_row.proowner
    WHERE function_row.oid = to_regprocedure($1)
  `, [ACTION_CENTER_OPERATIONAL_DETAIL_SIGNATURE]);
  const listResult = await client.query(`
    SELECT pg_get_functiondef(to_regprocedure($1)) AS definition
  `, [ACTION_CENTER_LIST_SIGNATURE]);
  const constraintResult = await client.query(`
    SELECT constraint_row.conname AS name,
      pg_get_constraintdef(constraint_row.oid, true) AS definition,
      constraint_row.convalidated AS validated
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.action_case'::regclass
      AND constraint_row.conname = ANY($1::text[])
    ORDER BY constraint_row.conname
  `, [[
    'action_case_employee_note_length_ck',
    'action_case_leave_confidentiality_ck',
  ]]);
  const actionCaseOwner = await client.query(`
    SELECT relation.relowner = current_user::regrole::oid AS "ownerMatches"
    FROM pg_class relation
    WHERE relation.oid = 'public.action_case'::regclass
  `);
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
      ) AS "publicColumnPrivileges",
      COALESCE(ARRAY(
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
  `, [RUNTIME_ROLE, ['action_case', 'action_case_event']]);
  const constraints = new Map(rows(constraintResult).map((item) => [item.name, item]));
  return {
    detail: rows(functionResult)[0] || null,
    listDefinition: rows(listResult)[0]?.definition || '',
    constraint: constraints.get('action_case_leave_confidentiality_ck') || null,
    employeeNoteConstraint: constraints.get('action_case_employee_note_length_ck') || null,
    actionCaseOwnerMatches: rows(actionCaseOwner)[0]?.ownerMatches === true,
    relationDml: rows(relationDml),
  };
}

export async function verifyActionCenterOperationalCompletionFinalState(client, migrationSql) {
  const source = migrationSql || await readFile(MIGRATION_URL, 'utf8');
  validateActionCenterOperationalCompletionEvidence(await collectEvidence(client), source);
  await verifyTenantActionUnlinkedOperatorFinalState(client);
  return true;
}

async function verifyPrerequisiteLedger(client) {
  const prerequisite = await readFile(PREREQUISITE_URL, 'utf8');
  const expected = tenantActionUnlinkedOperatorFingerprint(prerequisite);
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [PREREQUISITE_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${PREREQUISITE_MIGRATION_VERSION}`);
  }
  await verifyTenantActionUnlinkedOperatorFinalState(client);
}

async function verifyBaselineState(client, baselineSql) {
  const evidence = await collectEvidence(client);
  validateDetailEnvelope(evidence.detail);
  const expectedSource = functionBodyFromMigration(
    baselineSql, 'action_center_tenant_detail_v2',
  );
  if (actionCenterOperationalFunctionSourceFingerprint(evidence.detail.source)
      !== actionCenterOperationalFunctionSourceFingerprint(expectedSource)) {
    throw new Error('drift previo no ledgerado en action_center_tenant_detail_v2');
  }
  const legacyConstraint = "CHECK (case_type <> 'leave_request' OR ((payload->>'reasonCode' = '19' "
    + "OR confidentiality = 'restricted') AND (confidentiality <> 'restricted' "
    + "OR NOT (payload ? 'employeeNote'))))";
  if (evidence?.constraint?.validated !== true
      || actionCenterConfidentialityConstraintFingerprint(evidence.constraint.definition)
        !== actionCenterConfidentialityConstraintFingerprint(legacyConstraint)) {
    throw new Error('drift previo no ledgerado en action_case_leave_confidentiality_ck');
  }
  if (evidence?.employeeNoteConstraint) {
    throw new Error('objeto 018 presente sin ledger: action_case_employee_note_length_ck');
  }
}

async function main() {
  const [migration, baseline] = await Promise.all([
    readFile(MIGRATION_URL, 'utf8'),
    readFile(DETAIL_BASELINE_URL, 'utf8'),
  ]);
  validateActionCenterOperationalCompletionMigrationSql(migration, baseline);
  const fingerprint = actionCenterOperationalCompletionFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const args = process.argv.slice(2);
  const target = resolveCanonicalDatabaseTarget(args, process.env);
  const databaseUrl = directCanonicalDatabaseUrl(args, process.env);
  if (databaseUrl !== target.databaseUrl) {
    throw new Error('el target canonico cambio durante el preflight');
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:action-center-operational-completion-018'))",
    );
    await verifyPrerequisiteLedger(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyBaselineState(client, baseline);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: `
              + `${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyActionCenterOperationalCompletionFinalState(client, migration);
    await client.query('COMMIT');
    const targetLabel = target.mode === 'production'
      ? `production:${target.branchId}` : 'isolated';
    console.log(existing.rowCount
      ? `${ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION}: reapply verificado `
        + `(${targetLabel}, SHA-256 ${fingerprint})`
      : `${ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION}: fresh apply `
        + `(${targetLabel}, ${statements.length} sentencias, SHA-256 ${fingerprint})`);
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
