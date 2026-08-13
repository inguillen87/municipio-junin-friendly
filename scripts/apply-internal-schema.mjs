import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL_UNPOOLED o DATABASE_URL');
}

const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
const migration = fs.readFileSync(new URL('./internal-schema.sql', import.meta.url), 'utf8');

for (const statement of migration.split(/;\s*(?:\r?\n|$)/).map((part) => part.trim()).filter(Boolean)) {
  await sql.query(statement);
}

const [{ tables }] = await sql.query(`
  SELECT count(*)::int AS tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'internal_users',
      'data_import_runs',
      'grh_employees',
      'grh_absences',
      'grh_leaves',
      'grh_family',
      'grh_catalog_rows'
    )
`);

if (tables !== 7) throw new Error('Esquema incompleto: ' + tables + '/7 tablas');
console.log('Internal data schema: OK (7/7 tables)');
