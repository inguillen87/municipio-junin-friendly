import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

const MIGRATION_VERSION = '002-canonical-integration';
const MIGRATION_URL = new URL('./migrations/002-canonical-integration.sql', import.meta.url);
const EXPECTED_TABLES = Object.freeze([
  'source_import_batch',
  'source_staging_row',
  'person_identity',
  'source_xref',
  'person_identity_assertion',
  'crosswalk_persona',
  'employment_contract',
  'employment_status_snapshot',
  'payroll_run',
  'payroll_snapshot_assignment',
  'payroll_monthly_fact',
  'employment_movement',
  'data_quality_issue',
]);
const EXPECTED_VIEWS = Object.freeze([
  'vw_empleado_actual',
  'vw_dotacion_mensual',
  'vw_ausentismo_mensual',
  'vw_liquidacion_mensual',
  'vw_nomina_totales',
  'vw_dotacion_cierre_mensual',
  'vw_payroll_snapshot_actual',
  'vw_movimientos_legajo',
  'vw_estructura_actual',
  'vw_crosswalk_persona',
  'vw_calidad_datos',
  'vw_employment_status_control',
]);

async function verifySchema(client) {
  const tablesResult = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1::text[])
      ORDER BY table_name`,
    [EXPECTED_TABLES],
  );
  const viewsResult = await client.query(
    `SELECT table_name
       FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name`,
    [EXPECTED_VIEWS],
  );
  const functionsResult = await client.query(`
    SELECT proname
      FROM pg_proc
      JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
     WHERE pg_namespace.nspname = 'public'
       AND proname IN (
         'normalize_digits', 'is_valid_cuil', 'reject_immutable_source_change',
         'validate_source_batch_system', 'validate_source_xref_target', 'validate_crosswalk_batches',
         'validate_payroll_run_link'
       )
  `);

  if (tablesResult.rowCount !== EXPECTED_TABLES.length) {
    throw new Error(`Esquema canónico incompleto: ${tablesResult.rowCount}/${EXPECTED_TABLES.length} tablas`);
  }
  if (viewsResult.rowCount !== EXPECTED_VIEWS.length) {
    throw new Error(`Esquema canónico incompleto: ${viewsResult.rowCount}/${EXPECTED_VIEWS.length} vistas`);
  }
  if (functionsResult.rowCount !== 7) {
    throw new Error(`Esquema canónico incompleto: ${functionsResult.rowCount}/7 funciones`);
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  const checksum = createHash('sha256').update(migration).digest('hex');
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directCanonicalDatabaseUrl() });

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:canonical-schema'))`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum_sha256 char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [MIGRATION_VERSION],
    );
    if (existing.rowCount) {
      if (existing.rows[0].checksum_sha256.trim() !== checksum) {
        throw new Error(`Drift detectado: ${MIGRATION_VERSION} ya existe con otro SHA-256`);
      }
      await verifySchema(client);
      await client.query('COMMIT');
      console.log(`${MIGRATION_VERSION}: ya aplicada y verificada`);
      return;
    }

    for (const statement of statements) await client.query(statement);
    await verifySchema(client);
    await client.query(
      'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
      [MIGRATION_VERSION, checksum],
    );
    await client.query('COMMIT');
    console.log(`${MIGRATION_VERSION}: aplicada (${statements.length} sentencias, SHA-256 ${checksum})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
