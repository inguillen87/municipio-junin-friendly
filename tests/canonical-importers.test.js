import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  MAX_LOGICAL_IMPORT_BYTES,
  directCanonicalDatabaseUrl,
  directIsolatedDatabaseUrl,
  enforceLogicalSizeGate,
  resolveCanonicalDatabaseTarget,
  sha256Text,
  stableJson,
  streamDeterministicJsonArray,
} from '../scripts/lib/canonical-import.mjs';

const grhImporterUrl = new URL('../scripts/import-grh-core-canonical.mjs', import.meta.url);
const personasImporterUrl = new URL('../scripts/import-personas-crosswalk-canonical.mjs', import.meta.url);
const schemaUrl = new URL('../scripts/apply-canonical-schema.mjs', import.meta.url);
const promotionUrl = new URL('../scripts/promote-canonical-grh.mjs', import.meta.url);
const verifierUrl = new URL('../scripts/verify-canonical-acceptance.mjs', import.meta.url);

test('gate de conexion exige rama aislada, URL directa y entorno no productivo', () => {
  const direct = 'postgresql://user:pass@example.neon.tech/db?sslmode=require';
  assert.throws(() => directIsolatedDatabaseUrl([], { DATABASE_URL_UNPOOLED: direct }), /confirm-isolated-branch/);
  assert.throws(
    () => directIsolatedDatabaseUrl(['--confirm-isolated-branch'], {
      DATABASE_URL_UNPOOLED: 'postgresql://u:p@example-pooler.neon.tech/db',
    }),
    /pooled/,
  );
  assert.throws(
    () => directIsolatedDatabaseUrl(['--confirm-isolated-branch'], {
      DATABASE_URL_UNPOOLED: direct,
      VERCEL_ENV: 'production',
    }),
    /produccion/,
  );
  assert.equal(
    directIsolatedDatabaseUrl(['--confirm-isolated-branch'], { DATABASE_URL_UNPOOLED: direct }),
    direct,
  );
});

test('gate de produccion exige confirmacion de rama y coincidencia exacta de destino', () => {
  const branchId = 'br-main-production';
  const host = 'ep-main-production.sa-east-1.aws.neon.tech';
  const databaseUrl = `postgresql://operator:never-log-this@${host}/municipio?sslmode=require`;
  const argv = [`--confirm-production-branch=${branchId}`];
  const env = {
    DATABASE_URL_UNPOOLED: databaseUrl,
    CANONICAL_PRODUCTION_BRANCH_ID: branchId,
    CANONICAL_PRODUCTION_HOST: host,
    CANONICAL_PRODUCTION_DATABASE: 'municipio',
  };

  assert.deepEqual(resolveCanonicalDatabaseTarget(argv, env), {
    databaseUrl,
    mode: 'production',
    branchId,
  });
  assert.equal(directCanonicalDatabaseUrl(argv, env), databaseUrl);
  assert.throws(() => directIsolatedDatabaseUrl(argv, env), /solo admite una rama aislada/);
});

test('gate de produccion rechaza ambiguedad, drift de host, rama o base sin filtrar credenciales', () => {
  const secret = 'password-that-must-not-leak';
  const branchId = 'br-main-production';
  const host = 'ep-main-production.sa-east-1.aws.neon.tech';
  const databaseUrl = `postgresql://operator:${secret}@${host}/municipio?sslmode=require`;
  const baseEnv = {
    DATABASE_URL_UNPOOLED: databaseUrl,
    CANONICAL_PRODUCTION_BRANCH_ID: branchId,
    CANONICAL_PRODUCTION_HOST: host,
    CANONICAL_PRODUCTION_DATABASE: 'municipio',
  };
  const invalidAttempts = [
    [[], baseEnv],
    [['--confirm-isolated-branch', `--confirm-production-branch=${branchId}`], baseEnv],
    [[`--confirm-production-branch=br-wrong`], baseEnv],
    [[`--confirm-production-branch=${branchId}`], { ...baseEnv, CANONICAL_PRODUCTION_HOST: 'ep-other.sa-east-1.aws.neon.tech' }],
    [[`--confirm-production-branch=${branchId}`], { ...baseEnv, CANONICAL_PRODUCTION_DATABASE: 'otra' }],
    [[`--confirm-production-branch=${branchId}`], { ...baseEnv, CANONICAL_PRODUCTION_BRANCH_ID: '' }],
    [[`--confirm-production-branch=${branchId}`], { ...baseEnv, CANONICAL_PRODUCTION_HOST: '' }],
    [[`--confirm-production-branch=${branchId}`], { ...baseEnv, CANONICAL_PRODUCTION_DATABASE: '' }],
    [[`--confirm-production-branch=${branchId}`], {
      ...baseEnv,
      DATABASE_URL_UNPOOLED: databaseUrl.replace('.neon.tech', '-pooler.neon.tech'),
    }],
  ];

  for (const [argv, env] of invalidAttempts) {
    assert.throws(
      () => resolveCanonicalDatabaseTarget(argv, env),
      (error) => error instanceof Error && !error.message.includes(secret),
    );
  }
});

test('modo aislado rechaza el host productivo conocido aunque no este marcado como produccion', () => {
  const host = 'ep-main-production.sa-east-1.aws.neon.tech';
  assert.throws(
    () => directCanonicalDatabaseUrl(['--confirm-isolated-branch'], {
      DATABASE_URL_UNPOOLED: `postgresql://u:p@${host}/municipio`,
      CANONICAL_PRODUCTION_HOST: host,
    }),
    /coincide con CANONICAL_PRODUCTION_HOST/,
  );
});

test('gate de costo detiene una importacion logica mayor a 400 MiB', () => {
  assert.equal(enforceLogicalSizeGate([{ bytes: 10 }, { bytes: 20 }]), 30);
  assert.throws(
    () => enforceLogicalSizeGate([{ bytes: MAX_LOGICAL_IMPORT_BYTES + 1 }]),
    /detenida por costo/,
  );
});

test('JSON estable y streaming determinista conservan hashes y filas', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'junin-importer-'));
  const file = path.join(directory, 'rows.json');
  try {
    await writeFile(file, '[\n{"b":2,"a":1},\n{"value":"dos"}\n]\n', 'utf8');
    const rows = [];
    for await (const row of streamDeterministicJsonArray(file)) rows.push(row);
    assert.deepEqual(rows, [{ b: 2, a: 1 }, { value: 'dos' }]);
    assert.equal(stableJson(rows[0]), '{"a":1,"b":2}');
    assert.match(sha256Text(stableJson(rows[0])), /^[a-f0-9]{64}$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('importadores son transaccionales, bloqueados e idempotentes sin truncado', async () => {
  const [grh, personas] = await Promise.all([
    readFile(grhImporterUrl, 'utf8'),
    readFile(personasImporterUrl, 'utf8'),
  ]);
  for (const source of [grh, personas]) {
    assert.match(source, /directCanonicalDatabaseUrl/);
    assert.match(source, /BEGIN/);
    assert.match(source, /pg_advisory_xact_lock/);
    assert.match(source, /COMMIT/);
    assert.match(source, /ROLLBACK/);
    assert.match(source, /ON CONFLICT DO NOTHING/);
    assert.doesNotMatch(source, /TRUNCATE|DELETE\s+FROM/i);
  }
});

test('todos los ejecutables canonicos usan el gate comun y los mutadores conservan transaccion', async () => {
  const [schema, promotion, grh, personas, verifier] = await Promise.all([
    readFile(schemaUrl, 'utf8'),
    readFile(promotionUrl, 'utf8'),
    readFile(grhImporterUrl, 'utf8'),
    readFile(personasImporterUrl, 'utf8'),
    readFile(verifierUrl, 'utf8'),
  ]);
  for (const source of [schema, promotion, grh, personas, verifier]) {
    assert.match(source, /directCanonicalDatabaseUrl/);
  }
  for (const source of [schema, promotion, grh, personas]) {
    assert.match(source, /BEGIN/);
    assert.match(source, /pg_advisory_xact_lock/);
    assert.match(source, /COMMIT/);
    assert.match(source, /ROLLBACK/);
  }
  assert.match(schema, /schema_migrations/);
  assert.match(schema, /checksum_sha256/);
  assert.match(promotion, /verifyPromotion/);
});

test('GRH core guarda una sola copia canonica y no inventa masa salarial', async () => {
  const source = await readFile(grhImporterUrl, 'utf8');
  assert.match(source, /artifact:.*sourceTable/s);
  assert.match(source, /rowOverheadEstimate/);
  assert.match(source, /function compactSourceId\(key\)/);
  assert.match(source, /sha256Text\(stableJson\(key\)\)/);
  assert.match(source, /source_payload: qualityFlags\.length \? \{ qualityFlags \} : \{\}/);
  assert.match(source, /importerContractVersion/);
  assert.match(source, /technical_source_amount_sum/);
  assert.match(source, /technicalSourceAmountSum is not a financial KPI/);
  assert.match(source, /employer_contributions/);
  assert.match(source, /net_payable/);
  assert.match(source, /cost_center_source_id/);
  assert.doesNotMatch(source, /liquidation_source_id|nominal_amount_sum/);
  assert.doesNotMatch(
    source,
    /source_staging_row[\s\S]{0,500}streamDeterministicJsonArray\(artifact\.path\)/,
  );
  assert.match(source, /INSERT INTO payroll_run/);
  assert.match(source, /closure_status/);
  assert.match(source, /executivePublishable !== \(record\.closureStatus === 'closed'\)/);
  assert.match(source, /payrollStatus: 'preliquidated'/);
  assert.match(source, /latest_closed_headcount: 856/);
  assert.match(source, /JOIN payroll_run run[\s\S]{0,420}run\.source_period = input\.source_period/);
  assert.ok(
    source.indexOf('await importPayrollRuns') < source.indexOf('await importPayrollSnapshot'),
    'las corridas deben cargarse antes que sus hechos',
  );
});

test('crosswalk mantiene GRH como autoridad y nunca une por IDPERSONA', async () => {
  const source = await readFile(personasImporterUrl, 'utf8');
  assert.match(source, /personasRole !== 'auxiliary_identity_and_territory_only'/);
  assert.match(source, /rawIdJoinUsed !== false/);
  assert.match(source, /cuil_duplicate_resolved/);
  assert.match(source, /dni_duplicate_resolved/);
  assert.match(source, /automaticallyPromoted: false/);
  assert.match(source, /importerContractVersion/);
  assert.match(source, /preferred, valid_from/);
  assert.doesNotMatch(source, /JOIN[\s\S]{0,180}IDPERSONA\s*=|IDPERSONA\s*=[\s\S]{0,180}JOIN/i);
});

test('crosswalk siembra las 2.349 identidades GRH aunque 24 no tengan legajo', async () => {
  const source = await readFile(personasImporterUrl, 'utf8');
  assert.match(source, /grhIdentitySeeds/);
  assert.match(source, /grhPersons:\s*2_349/);
  assert.match(source, /grhPersonsWithLegajo:\s*2_325/);
  assert.match(source, /grhPersonsWithoutLegajo:\s*24/);
  assert.match(source, /identityMasterIndependentOfEmployment/);
  assert.match(source, /async function upsertGrhIdentityMaster/);
  assert.match(source, /INSERT INTO person_identity/);
  assert.match(source, /person_identity\|GRH\|persona\|/);
  assert.match(source, /INSERT INTO source_xref/);
  assert.match(source, /xref\.canonical_id = md5\('person_identity\|GRH\|persona\|'/);
  assert.match(source, /GRH_IDENTITY_STAGING_ENTITY/);
  assert.match(source, /no_legajo_employment_contracts/);
  assert.doesNotMatch(source, /INSERT INTO employment_contract/);
  assert.ok(
    source.indexOf('await upsertGrhIdentityMaster') < source.indexOf('await insertCrosswalk'),
    'el maestro GRH completo debe existir antes de insertar las 2.349 decisiones',
  );
});
