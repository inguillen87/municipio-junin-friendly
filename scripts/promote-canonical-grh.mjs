import { readFile } from 'node:fs/promises';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

const PROMOTION_URL = new URL('./canonical-promote-current-grh.sql', import.meta.url);

async function verifyPromotion(client) {
  const [result] = (await client.query(`
    WITH latest_batch AS (
      SELECT id
      FROM source_import_batch
      WHERE source_system = 'GRH'
      ORDER BY source_cutoff DESC, recorded_at DESC
      LIMIT 1
    )
    SELECT
      (SELECT count(*)::int FROM latest_batch) AS batches,
      (SELECT count(*)::int FROM source_staging_row WHERE batch_id = (SELECT id FROM latest_batch)) AS staged_rows,
      (SELECT count(*)::int FROM person_identity) AS canonical_people,
      (SELECT count(*)::int FROM employment_contract WHERE source_system = 'GRH') AS contracts,
      (SELECT count(*)::int FROM person_identity WHERE cuil IS NOT NULL AND NOT is_valid_cuil(cuil)) AS invalid_promoted_cuils,
      (SELECT count(*)::int FROM employment_contract WHERE source_system <> 'GRH') AS non_grh_contracts,
      (SELECT count(*)::int
         FROM employment_contract contract
        WHERE contract.source_system = 'GRH'
          AND NOT EXISTS (
            SELECT 1 FROM employment_status_snapshot snapshot
            WHERE snapshot.employment_contract_id = contract.id
          )) AS contracts_without_status
  `)).rows;

  if (result.batches !== 1) throw new Error('No se encontró exactamente un último batch GRH');
  if (result.staged_rows < 1) throw new Error('El batch GRH no tiene staging inmutable');
  if (result.canonical_people < 1 || result.contracts < 1) throw new Error('La promoción canónica quedó vacía');
  if (result.invalid_promoted_cuils !== 0) throw new Error('Se promovieron CUIL inválidos');
  if (result.non_grh_contracts !== 0) throw new Error('PERSONAS u otra fuente gobernó contratos');
  if (result.contracts_without_status !== 0) throw new Error('Hay contratos sin snapshot de estado');
  return result;
}

async function main() {
  const promotion = await readFile(PROMOTION_URL, 'utf8');
  const statements = splitPostgresStatements(promotion);
  const client = new Client({ connectionString: directCanonicalDatabaseUrl() });

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:canonical-grh-promotion'))`);
    const migration = await client.query(
      `SELECT 1 FROM schema_migrations WHERE version = '002-canonical-integration' LIMIT 1`,
    );
    if (!migration.rowCount) throw new Error('Primero debe aplicarse 002-canonical-integration');

    for (const statement of statements) await client.query(statement);
    const evidence = await verifyPromotion(client);
    await client.query('COMMIT');
    console.log(JSON.stringify({ status: 'promoted', statements: statements.length, evidence }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
