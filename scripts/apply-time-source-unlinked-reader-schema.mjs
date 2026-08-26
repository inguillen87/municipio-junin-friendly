import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const TIME_SOURCE_UNLINKED_READER_MIGRATION_VERSION =
  '023-time-source-unlinked-reader';
export const TIME_SOURCE_AUTHORITY_SIGNATURE =
  'public.time_source_assert_actor_authority_v1(jsonb,text)';

const MIGRATION_URL = new URL(
  './migrations/023-time-source-unlinked-reader.sql', import.meta.url,
);
const BASELINE_URL = new URL(
  './migrations/010-governed-time-source-registry.sql', import.meta.url,
);
const PREREQUISITES = Object.freeze([
  Object.freeze({
    version: '010-governed-time-source-registry',
    url: BASELINE_URL,
  }),
  Object.freeze({
    version: '021-platform-owner-operational-integral',
    url: new URL('./migrations/021-platform-owner-operational-integral.sql', import.meta.url),
  }),
]);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function occurrenceCount(value, token) {
  return String(value || '').split(token).length - 1;
}

function exactSet(actual, expected, label) {
  const got = [...new Set(actual || [])].map(String).sort();
  const wanted = [...new Set(expected || [])].map(String).sort();
  if (got.length !== (actual || []).length
      || JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
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

export function timeSourceUnlinkedReaderFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function timeSourceAuthoritySourceFingerprint(value) {
  const canonical = String(value || '').replace(/\r\n?/g, '\n').trim();
  return createHash('sha256').update(canonical).digest('hex');
}

export function validateTimeSourceUnlinkedReaderDefinition(definition) {
  const body = normalized(definition);
  for (const token of [
    'time_source_assert_actor_authority_v1(',
    'returns jsonb',
    'language plpgsql',
    'security definer',
    "p_required_capability not in ( 'time.source.read','time.source.propose',"
      + "'time.source.approve','time.source.audit.read' )",
    'from public.tenant_action_authority authority',
    "authority.membership_id = (p_context->>'membershipid')::uuid",
    "authority.tenant_id = (p_context->>'tenantid')::uuid",
    "perform public.tenant_iam_assert_no_sod_conflict((p_context->>'membershipid')::uuid)",
    'from public.tenant_iam_effective_capabilities(',
    'where capability.capability_key = p_required_capability',
    'from public.tenant_action_employment_link link',
    'join public.employment_contract contract',
    "contract.status = 'active'",
    "contract.source_system = 'grh'",
    'join public.source_import_batch batch',
    "batch.validation_state = 'published'",
    'employment_linked := found',
    "if not employment_linked and p_required_capability <> 'time.source.read' then",
    "raise exception 'time_source_employment_required'",
    'if employment_linked then perform public.time_source_assert_person_sod_v1(',
    "'employmentcontractid', actor_employment_contract_id",
    "'actorpersonid', actor_person_id",
    "'employmentlinked', employment_linked",
  ]) {
    if (!body.includes(normalized(token))) {
      throw new Error(`funcion 023 incompleta: ${token}`);
    }
  }

  if (occurrenceCount(body, "p_required_capability <> 'time.source.read'") !== 1) {
    throw new Error('funcion 023 no limita exactamente la excepcion a time.source.read');
  }
  if (body.includes("p_required_capability <> 'time.source.propose'")
      || body.includes("p_required_capability <> 'time.source.approve'")
      || body.includes("p_required_capability <> 'time.source.audit.read'")) {
    throw new Error('funcion 023 exime una capacidad distinta de time.source.read');
  }

  const employmentGate = body.indexOf(
    "if not employment_linked and p_required_capability <> 'time.source.read' then",
  );
  const personGate = body.indexOf('if employment_linked then', employmentGate);
  const personSod = body.indexOf('perform public.time_source_assert_person_sod_v1(', personGate);
  const personGateEnd = body.indexOf('end if;', personSod);
  if (!(employmentGate >= 0 && personGate > employmentGate
      && personSod > personGate && personGateEnd > personSod)) {
    throw new Error('funcion 023 no conserva el SoD personal dentro del vinculo conocido');
  }
  return true;
}

export function validateTimeSourceUnlinkedReaderMigrationSql(sql) {
  const source = String(sql || '');
  if ((source.match(/CREATE OR REPLACE FUNCTION/gi) || []).length !== 1) {
    throw new Error('migracion 023 debe reemplazar una sola funcion');
  }
  validateTimeSourceUnlinkedReaderDefinition(source);
  for (const token of [
    'SET search_path = public, pg_temp',
    'COMMENT ON FUNCTION public.time_source_assert_actor_authority_v1(jsonb,text)',
    'aclexplode(COALESCE(',
    'acl.grantee <> function_row.proowner',
    'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s CASCADE',
  ]) {
    if (!normalized(source).includes(normalized(token))) {
      throw new Error(`migracion 023 incompleta: ${token}`);
    }
  }
  if (/\b(?:create|alter|drop)\s+(?:table|role|schema|database)\b/i.test(source)
      || /\bgrant\s+/i.test(source)
      || /guillen|gmail\.com|marcelo@|hugo@|admin@|\b(?:password|raw_code|plain_code|otp_code)\b/i
        .test(source)) {
    throw new Error('migracion 023 amplia alcance, ACL o material sensible');
  }
  return true;
}

function validateFunctionEnvelope(entry) {
  if (!entry || entry.signature !== TIME_SOURCE_AUTHORITY_SIGNATURE
      || entry.securityDefiner !== true || entry.ownerMatches !== true
      || entry.exactSearchPath !== true || entry.language !== 'plpgsql'
      || entry.kind !== 'f' || entry.volatility !== 'v'
      || entry.strict !== false || entry.parallel !== 'u'
      || normalized(entry.returnType) !== 'jsonb'
      || !entry.owner || entry.owner === RUNTIME_ROLE) {
    throw new Error('funcion 023 instalada fuera de contrato');
  }
  exactSet(entry.grants, [`${entry.owner}:EXECUTE`], 'ACL funcion 023');
  return true;
}

export function validateTimeSourceUnlinkedReaderEvidence(evidence) {
  validateFunctionEnvelope(evidence?.authority);
  validateTimeSourceUnlinkedReaderDefinition(evidence.authority.definition);
  return true;
}

async function collectEvidence(client) {
  const result = await client.query(`
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
  `, [TIME_SOURCE_AUTHORITY_SIGNATURE]);
  return { authority: result.rows?.[0] || null };
}

export async function verifyTimeSourceUnlinkedReaderFinalState(client) {
  validateTimeSourceUnlinkedReaderEvidence(await collectEvidence(client));
  return true;
}

async function expectedPrerequisiteChecksums() {
  return new Map(await Promise.all(PREREQUISITES.map(async ({ version, url }) => [
    version, timeSourceUnlinkedReaderFingerprint(await readFile(url, 'utf8')),
  ])));
}

async function verifyPrerequisiteLedger(client) {
  const expected = await expectedPrerequisiteChecksums();
  const installed = await client.query(
    'SELECT version, checksum_sha256 FROM schema_migrations WHERE version = ANY($1::text[])',
    [[...expected.keys()]],
  );
  const actual = new Map((installed.rows || [])
    .map((row) => [row.version, String(row.checksum_sha256 || '').trim()]));
  for (const [version, checksum] of expected) {
    if (actual.get(version) !== checksum) {
      throw new Error(`prerequisito ausente o con drift ${version}`);
    }
  }
}

async function verifyBaselineFunction(client) {
  const baselineMigration = await readFile(BASELINE_URL, 'utf8');
  const expectedSource = functionBodyFromMigration(
    baselineMigration, 'time_source_assert_actor_authority_v1',
  );
  const evidence = await collectEvidence(client);
  if (!evidence.authority || evidence.authority.signature !== TIME_SOURCE_AUTHORITY_SIGNATURE
      || timeSourceAuthoritySourceFingerprint(evidence.authority.source)
        !== timeSourceAuthoritySourceFingerprint(expectedSource)) {
    throw new Error('drift previo no ledgerado en time_source_assert_actor_authority_v1');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateTimeSourceUnlinkedReaderMigrationSql(migration);
  const fingerprint = timeSourceUnlinkedReaderFingerprint(migration);
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
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:time-source-unlinked-reader-023'))",
    );
    await verifyPrerequisiteLedger(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [TIME_SOURCE_UNLINKED_READER_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${TIME_SOURCE_UNLINKED_READER_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyBaselineFunction(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${TIME_SOURCE_UNLINKED_READER_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: `
              + `${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [TIME_SOURCE_UNLINKED_READER_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyTimeSourceUnlinkedReaderFinalState(client);
    await client.query('COMMIT');
    const targetLabel = target.mode === 'production'
      ? `production:${target.branchId}` : 'isolated';
    console.log(existing.rowCount
      ? `${TIME_SOURCE_UNLINKED_READER_MIGRATION_VERSION}: reapply verificado `
        + `(${targetLabel}, SHA-256 ${fingerprint})`
      : `${TIME_SOURCE_UNLINKED_READER_MIGRATION_VERSION}: fresh apply `
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
