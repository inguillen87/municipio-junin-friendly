import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('scripts/migrations/222-own-run-scope-fixes.sql', 'utf8');

test('222 rebuilds only the installed own_run_capture_v1 and aborts on any other base', () => {
  assert.match(sql, /^-- 222 · own_run_capture_v1/);
  assert.match(sql, /IF current NOT IN \('b08d8d4069aefe1f460f78c9f362944a505507d6d586aee6d0965f97ad3f0a3f','6f85596545087378590cd43253812b7c567da5da4b86fe8fd2c7d29aa8d27a1e'\) THEN RAISE EXCEPTION 'OWN_RUN_222_BASE_CHANGED/);
  assert.match(sql, /<>'6f85596545087378590cd43253812b7c567da5da4b86fe8fd2c7d29aa8d27a1e' THEN RAISE EXCEPTION 'OWN_RUN_222_RESULT_MISMATCH'/);
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, 1);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.own_run_capture_v1\(p jsonb, body jsonb, key uuid, algorithm text\)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_catalog', 'public', 'pg_temp'\n SET "TimeZone" TO 'UTC'/);
  assert.match(sql, /^BEGIN;$/m); assert.match(sql, /^COMMIT;$/m);
});

test('selected contracts accept canonical UUIDs and a NULL repartición or convenio is outside the chosen set', () => {
  assert.doesNotMatch(sql, /\[1-5\]\[a-f0-9\]\{3\}-\[89ab\]/);
  assert.match(sql, /WHEN kind='contracts' THEN '\^\[a-f0-9\]\{8\}-\[a-f0-9\]\{4\}-\[a-f0-9\]\{4\}-\[a-f0-9\]\{4\}-\[a-f0-9\]\{12\}\$'/);
  assert.doesNotMatch(sql, /AND NOT body#>'\{selection,values\}' \? \(classification_value/);
  assert.match(sql, /IF kind IN\('agreements','departments'\) AND \(body#>'\{selection,values\}' \? \(classification_value#>>ARRAY\['definition',CASE kind WHEN 'agreements' THEN 'agreementCode' ELSE 'sectorCode' END\]\)\) IS NOT TRUE THEN CONTINUE;END IF;/);
  // «Todos» keeps requiring a numeric code for every walked contract.
  assert.match(sql, /coalesce\(\(classification_value#>>'\{definition,sectorCode\}'\),''\)!~'\^\[0-9\]\{1,9\}\$' THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID'/);
  assert.match(fs.readFileSync('.vercelignore', 'utf8'), /^!scripts\/migrations\/222-own-run-scope-fixes\.sql$/m);
});
