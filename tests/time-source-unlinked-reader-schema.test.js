import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  TIME_SOURCE_AUTHORITY_SIGNATURE,
  TIME_SOURCE_UNLINKED_READER_MIGRATION_VERSION,
  timeSourceAuthoritySourceFingerprint,
  timeSourceUnlinkedReaderFingerprint,
  validateTimeSourceUnlinkedReaderDefinition,
  validateTimeSourceUnlinkedReaderEvidence,
  validateTimeSourceUnlinkedReaderMigrationSql,
} from '../scripts/apply-time-source-unlinked-reader-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migrationUrl = new URL(
  '../scripts/migrations/023-time-source-unlinked-reader.sql', import.meta.url,
);
const baselineUrl = new URL(
  '../scripts/migrations/010-governed-time-source-registry.sql', import.meta.url,
);
const applierUrl = new URL(
  '../scripts/apply-time-source-unlinked-reader-schema.mjs', import.meta.url,
);
const packageUrl = new URL('../package.json', import.meta.url);
const vercelIgnoreUrl = new URL('../.vercelignore', import.meta.url);

const [migration, baseline, applier, packageSource, vercelIgnore] = await Promise.all([
  readFile(migrationUrl, 'utf8'),
  readFile(baselineUrl, 'utf8'),
  readFile(applierUrl, 'utf8'),
  readFile(packageUrl, 'utf8'),
  readFile(vercelIgnoreUrl, 'utf8'),
]);

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

function installedEvidence(definition = migration) {
  return {
    authority: {
      signature: TIME_SOURCE_AUTHORITY_SIGNATURE,
      definition,
      source: functionBody(definition, 'time_source_assert_actor_authority_v1'),
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
      grants: ['neondb_owner:EXECUTE'],
    },
  };
}

test('023 reemplaza solo el helper de autoridad y deja 010 ledgerable intacta', () => {
  assert.equal(
    TIME_SOURCE_UNLINKED_READER_MIGRATION_VERSION,
    '023-time-source-unlinked-reader',
  );
  assert.equal(
    TIME_SOURCE_AUTHORITY_SIGNATURE,
    'public.time_source_assert_actor_authority_v1(jsonb,text)',
  );
  assert.equal(validateTimeSourceUnlinkedReaderMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 3);
  assert.match(timeSourceUnlinkedReaderFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.match(
    baseline,
    /IF NOT FOUND THEN RAISE EXCEPTION 'TIME_SOURCE_EMPLOYMENT_REQUIRED'/,
  );
  assert.notEqual(
    timeSourceAuthoritySourceFingerprint(
      functionBody(migration, 'time_source_assert_actor_authority_v1'),
    ),
    timeSourceAuthoritySourceFingerprint(
      functionBody(baseline, 'time_source_assert_actor_authority_v1'),
    ),
  );
  assert.doesNotMatch(
    migration,
    /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|ROLE|SCHEMA|DATABASE)\b/i,
  );
});

test('solo time.source.read queda exenta de identidad laboral', () => {
  assert.equal(validateTimeSourceUnlinkedReaderDefinition(migration), true);
  assert.equal(
    (migration.match(/p_required_capability <> 'time\.source\.read'/g) || []).length,
    1,
  );
  assert.match(
    migration,
    /IF NOT employment_linked AND p_required_capability <> 'time\.source\.read' THEN[\s\S]+TIME_SOURCE_EMPLOYMENT_REQUIRED/,
  );
  assert.match(
    migration,
    /IF employment_linked THEN[\s\S]+time_source_assert_person_sod_v1[\s\S]+END IF/,
  );
  assert.match(migration, /'employmentLinked', employment_linked/);
  assert.doesNotMatch(
    migration,
    /p_required_capability <> 'time\.source\.(?:propose|approve|audit\.read)'/,
  );
});

test('validador adversarial rechaza ampliar la excepción o quitar el gate laboral', () => {
  assert.throws(
    () => validateTimeSourceUnlinkedReaderDefinition(migration.replace(
      "p_required_capability <> 'time.source.read'",
      "p_required_capability <> 'time.source.approve'",
    )),
    /excepcion a time\.source\.read|incompleta/,
  );
  assert.throws(
    () => validateTimeSourceUnlinkedReaderDefinition(migration.replace(
      "  IF NOT employment_linked AND p_required_capability <> 'time.source.read' THEN\n"
        + "    RAISE EXCEPTION 'TIME_SOURCE_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001';\n"
        + '  END IF;\n',
      '',
    )),
    /incompleta/,
  );
  assert.throws(
    () => validateTimeSourceUnlinkedReaderDefinition(migration.replace(
      '  IF employment_linked THEN\n',
      '  IF TRUE THEN\n',
    )),
    /incompleta|SoD personal/,
  );
});

test('ACL y envelope 023 son exactos y no exponen el helper al runtime', () => {
  assert.equal(validateTimeSourceUnlinkedReaderEvidence(installedEvidence()), true);
  assert.equal(validateTimeSourceUnlinkedReaderEvidence(installedEvidence(migration
    .replace(
      'LANGUAGE plpgsql VOLATILE SECURITY DEFINER',
      'LANGUAGE plpgsql\nSECURITY DEFINER\nVOLATILE',
    )
    .replace(
      'SET search_path = public, pg_temp',
      "SET search_path TO 'public', 'pg_temp'",
    ))), true);
  assert.match(migration, /acl\.grantee <> function_row\.proowner/);
  assert.doesNotMatch(migration, /\bGRANT\s+/i);

  const runtimeGrant = installedEvidence();
  runtimeGrant.authority.grants.push('municontrol_actions_runtime_app:EXECUTE');
  assert.throws(
    () => validateTimeSourceUnlinkedReaderEvidence(runtimeGrant),
    /ACL funcion 023 fuera de contrato/,
  );
  const extraSearchPath = installedEvidence();
  extraSearchPath.authority.exactSearchPath = false;
  assert.throws(
    () => validateTimeSourceUnlinkedReaderEvidence(extraSearchPath),
    /instalada fuera de contrato/,
  );
});

test('aplicador exige 010 y 021 sin drift, baseline, transacción y target canónico', () => {
  for (const pattern of [
    /010-governed-time-source-registry\.sql/,
    /021-platform-owner-operational-integral\.sql/,
    /verifyPrerequisiteLedger\(client\)/,
    /verifyBaselineFunction\(client\)/,
    /timeSourceAuthoritySourceFingerprint/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /resolveCanonicalDatabaseTarget\(args, process\.env\)/,
    /directCanonicalDatabaseUrl\(args, process\.env\)/,
    /await client\.query\('BEGIN'\)/,
    /pg_advisory_xact_lock/,
    /verifyTimeSourceUnlinkedReaderFinalState\(client\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
  ]) assert.match(applier, pattern);
});

test('023 queda empaquetada y dispone de un comando aislado explícito', () => {
  const packageJson = JSON.parse(packageSource);
  assert.equal(
    packageJson.scripts['db:time:sources:unlinked-read-schema'],
    'node --env-file=.env.local scripts/apply-time-source-unlinked-reader-schema.mjs '
      + '--confirm-isolated-branch',
  );
  assert.match(vercelIgnore, /!scripts\/migrations\/023-time-source-unlinked-reader\.sql/);
});
