// Standalone, synthetic PostgreSQL 17/18 QA. Emits SQL; never opens a connection.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
export function buildGrhEffectiveSourceQa({ expectedMajor = 17, schema = 'grh_effective_qa' } = {}) {
  if (![17, 18].includes(expectedMajor) || !/^grh_effective_qa(?:_[a-z0-9]+)?$/.test(schema)) throw new Error('Invalid QA target');
  const canonical = read('scripts/migrations/002-canonical-integration.sql');
  const tables = ['source_import_batch', 'employment_contract', 'payroll_run', 'employment_status_snapshot',
    'payroll_snapshot_assignment', 'payroll_monthly_fact', 'employment_movement'].map((name) => {
    const start = canonical.indexOf('CREATE TABLE IF NOT EXISTS ' + name + ' (');
    const end = canonical.indexOf('\n);', start);
    if (start < 0 || end < 0) throw new Error('Missing canonical table ' + name);
    return canonical.slice(start, end + 3);
  }).join('\n');
  const relocate = (sql) => sql.replaceAll('public.', schema + '.')
    .replaceAll('search_path=public,pg_temp', 'search_path=' + schema + ',public,pg_temp')
    .replaceAll('search_path=pg_catalog,public,pg_temp', 'search_path=pg_catalog,' + schema + ',public,pg_temp');
  const preamble = [
    'BEGIN;',
    "SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='2s'; SET LOCAL timezone='UTC';",
    'DO $target$ BEGIN',
    " IF current_database()<>'effective_source_qa' OR inet_server_addr() IS NULL OR inet_server_addr() NOT IN('127.0.0.1'::inet,'::1'::inet)",
    ' OR current_setting(\'server_version_num\')::integer/10000<>' + expectedMajor,
    " THEN RAISE EXCEPTION 'LOCAL_QA_TARGET_REQUIRED'; END IF; END $target$;",
    'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
    "DO $role$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') THEN CREATE ROLE municontrol_actions_runtime_app NOLOGIN; END IF; END $role$;",
    'CREATE SCHEMA ' + schema + '; SET LOCAL search_path=' + schema + ',public,pg_temp;',
    'CREATE TABLE data_import_runs(id bigint PRIMARY KEY,source_name text,source_sha256 text,source_cutoff timestamp,status text);',
    'CREATE TABLE platform_tenant_source_binding(tenant_id uuid NOT NULL,id uuid NOT NULL,source_system text,source_database text,source_company_id bigint,verified boolean,PRIMARY KEY(tenant_id,id));',
    'CREATE TABLE tenant_identity_policy(tenant_id uuid PRIMARY KEY,certified_source_binding_id uuid,tenant_data_plane_ready boolean);',
    'CREATE TABLE person_identity(id uuid PRIMARY KEY);',
    tables,
    'ALTER TABLE employment_contract DROP CONSTRAINT employment_contract_grh_authority_ck;',
    relocate(read('scripts/migrations/061-grh-core-source-version.sql')),
    relocate(read('scripts/migrations/096-grh-effective-source.sql')),
    read('scripts/fixtures/grh-effective-source-qa.sql.txt').replaceAll('__SCHEMA__', schema),
    'ROLLBACK;',
    "SELECT to_regnamespace('" + schema + "') IS NULL AS rollback_schema_absent;"
  ];
  return preamble.join('\n') + '\n';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => !/^--(?:expected-major=(?:17|18)|write-sql=.+)$/.test(arg))) throw new Error('Unsupported argument');
  const expectedMajor = Number(args.find((arg) => arg.startsWith('--expected-major='))?.split('=')[1] ?? 17);
  const target = args.find((arg) => arg.startsWith('--write-sql='))?.slice(12);
  const sql = buildGrhEffectiveSourceQa({ expectedMajor });
  if (target) { writeFileSync(resolve(target), sql, 'utf8'); process.stdout.write('Synthetic SQL QA generated for PostgreSQL ' + expectedMajor + '\n'); }
  else process.stdout.write(sql);
}
