// Full published monthly installation for disposable synthetic integration.
// Only namespace/search-path relocation differs; prerequisite hash pins remain.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
export function nativeMonthlyQaInstallation(schema) {
  assert.match(schema, /^mc_qa_fixed_092_[a-f0-9]{32}$/);
  const read = file => fs.readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const relocate = s => s.replaceAll('public.', schema + '.').replaceAll(schema + '.digest(', 'public.digest(')
    .replaceAll("'public'::regnamespace", q(schema) + '::regnamespace')
    .replaceAll("ARRAY['search_path=public, pg_temp']", `ARRAY['search_path=pg_catalog, ${schema}, public, pg_temp']`)
    .replaceAll("ARRAY['search_path=pg_catalog, public, pg_temp']", `ARRAY['search_path=pg_catalog, ${schema}, public, pg_temp']`)
    .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi, `SET search_path=pg_catalog,${schema},public,pg_temp`);
  const patch = /DO \$patch_4\$[\s\S]+?\$patch_4\$;/.exec(read('097-grh-effective-consumers.sql'))?.[0]; assert.ok(patch);
  const effective = relocate(patch)
    .replaceAll("replace(prosrc, E'\\r\\n', E'\\n')", `replace(replace(prosrc,E'\\r\\n',E'\\n'),${q(schema + '.')},'public'||'.')`)
    .replaceAll("replace(prosrc,E'\\r\\n',E'\\n')", `replace(replace(prosrc,E'\\r\\n',E'\\n'),${q(schema + '.')},'public'||'.')`);
  return `PERFORM qa_assert((SELECT count(*)=1 AND bool_and(pg_get_constraintdef(oid)='PRIMARY KEY (role_key)') FROM pg_constraint WHERE conrelid='iam_role'::regclass AND contype='p'),'full monthly composition requires the original103 role primary key');
    INSERT INTO iam_role VALUES('QA_ROLE','tenant');
    CREATE TABLE employment_movement(employment_contract_id uuid,source_batch_id uuid,source_system text,movement_period date,concept_source_id text,cost_center_source_id text,quantity numeric,amount numeric,movement_type text,payroll_type text);
    CREATE VIEW grh_effective_employment_movement_v1 AS SELECT * FROM employment_movement;
    ${['026-governed-payroll-novelties.sql', '029-payroll-novelty-first-fortnight.sql', '032-payroll-type-mapping-fail-closed.sql'].map(file => 'EXECUTE ' + q(relocate(read(file))) + ';').join('\n')}
    EXECUTE ${q(effective)};
    EXECUTE ${q(relocate(read('101-native-monthly-novelties.sql')))};`;
}
