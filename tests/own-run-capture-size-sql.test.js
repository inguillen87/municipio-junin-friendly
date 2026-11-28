// Comprobaciones estáticas de la migración 246. La instalación real se ensayó el 19/11/2026 en una copia nueva de la base
// de producción: se instaló en una transacción, las dos familias quedaron completas, la captura quedó con la huella
// esperada y una segunda corrida se rechazó con OWN_RUN_CAPTURE_SIZE_ALREADY_INSTALLED.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const sql = readFileSync('scripts/migrations/246-own-run-capture-size.sql', 'utf8');
const quoted = name => new RegExp('\\$' + name + '\\$([\\s\\S]*?)\\$' + name + '\\$').exec(sql)[1];
const needle = quoted('needle'), replacement = quoted('replacement');

function functionBody(source, name) {
  const at = Math.max(source.lastIndexOf('CREATE OR REPLACE FUNCTION public.' + name + '('), source.lastIndexOf('CREATE FUNCTION public.' + name + '('));
  assert.notEqual(at, -1, name);
  const rest = source.slice(at), tag = /AS (\$[a-z_0-9]*\$)/.exec(rest)[1], start = rest.indexOf(tag) + tag.length;
  return rest.slice(start, rest.indexOf(tag, start));
}

test('cambia sólo el tope de la captura, de 4 MB al tope de 32 MB de su tabla', () => {
  assert.equal(needle, 'octet_length(payload_value::text)+octet_length(body::text)+8192>4194304');
  assert.equal(replacement, 'octet_length(payload_value::text)+octet_length(body::text)+8192>33554432');
  assert.equal(needle.replace('4194304', '33554432'), replacement, 'sólo cambia el número');
  assert.equal(33554432, 32 * 1024 * 1024);
  // El tope nuevo no supera el de la columna payload de la tabla de capturas.
  const table = readdirSync('scripts/migrations').filter(f => f.endsWith('.sql')).map(f => readFileSync('scripts/migrations/' + f, 'utf8')).join('\n');
  assert.match(table, /payload jsonb NOT NULL CHECK\(jsonb_typeof\(payload\)='object' AND octet_length\(payload::text\)<=33554432\)/);
});

test('la última definición de own_run_capture_v1 del repositorio tiene el tope exactamente una vez', () => {
  const files = readdirSync('scripts/migrations').filter(f => f.endsWith('.sql') && f < '246').sort();
  const defining = files.filter(f => readFileSync('scripts/migrations/' + f, 'utf8').includes('FUNCTION public.own_run_capture_v1('));
  assert.ok(defining.length > 0);
  const body = functionBody(readFileSync('scripts/migrations/' + defining.at(-1), 'utf8'), 'own_run_capture_v1');
  assert.equal(body.split(needle).length - 1, 1, defining.at(-1));
  // El límite de 1.000 capturas sigue en la misma condición.
  const at = body.indexOf(needle);
  assert.match(body.slice(at, at + 400), /OR \(SELECT count\(\*\) FROM public\.own_payroll_run_capture WHERE tenant_id=\(ctx->>'tenantId'\)::uuid AND source_binding_id=\(ctx->>'sourceBindingId'\)::uuid\)>=1000 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT'/);
});

test('reemplaza con huella previa, apariciones exactas y huella resultante, y recompone adopción, atestador y familias', () => {
  assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m);
  assert.doesNotMatch(sql, /\b(DROP|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|CREATE TABLE|DISABLE TRIGGER|SET ROLE|session_replication_role)\b/);
  assert.equal([...sql.matchAll(/\bEXECUTE\b/g)].length, 4, 'captura, adopción, atestador y familias');
  assert.match(sql, /EXECUTE replace\(definition,needle,replacement\);/);
  assert.match(sql, /EXECUTE replace\(definition,capture_before,capture_after\);/);
  assert.match(sql, /EXECUTE attester_definition;/);
  assert.match(sql, /EXECUTE replace\(definition,attester_before,attester_after\);/);
  for (const code of ['PREREQUISITE', 'ALREADY_INSTALLED', 'ATTESTER_CHANGED', 'FAMILY_INCOMPLETE', 'PREIMAGE_CHANGED', 'RESULT', 'ATTESTER_RESULT', 'FAMILY_CHANGED', 'FAMILY_RESULT'])
    assert.ok(sql.includes("RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_" + code), code);
  const hashes = [...sql.matchAll(/'([a-f0-9]{64})'/g)].map(m => m[1]);
  assert.equal(hashes.length, 10); assert.equal(new Set(hashes).size, 10, 'ninguna huella se repite');
  // Huellas previas de producción, iguales a las que otras migraciones del repositorio fijaron o midieron.
  const m245 = readFileSync('scripts/migrations/245-own-run-actor-person-identifier-format.sql', 'utf8');
  for (const pin of ['be87ff2b259c1d01986e9674fea90fcc04c69c6892e1c07c0c3ffbbcc791deaa', '32f9fa070e99cf1a580d3ee53df9c555f21392d8c81fdf50c2685f6344590259', 'dbb087dd6828d612abd8b8a114dcf9942ff10bb064b39d55cdc97fc4de58339d'])
    assert.ok(m245.includes(pin) && sql.includes(pin), 'la 246 parte de lo que dejó la 245: ' + pin.slice(0, 12));
  assert.match(sql, /occurrences IS DISTINCT FROM 1 OR \(length\(definition\)-length\(replace\(definition,needle,''\)\)\)\/length\(needle\)<>1/);
  assert.match(sql, /occurrences IS DISTINCT FROM 1 OR \(length\(definition\)-length\(replace\(definition,capture_before,''\)\)\)\/64<>1/);
  assert.match(sql, /\(length\(attester_definition\)-length\(replace\(attester_definition,item\.before_sha256,''\)\)\)\/64<>1 OR position\(item\.after_sha256 IN attester_definition\)<>0/);
  assert.match(sql, /occurrences IS DISTINCT FROM 2\s+OR \(length\(definition\)-length\(replace\(definition,attester_before,''\)\)\)\/64<>2/);
  assert.match(sql, /official_before->'complete' IS DISTINCT FROM 'true'::jsonb OR quantity_before->'complete' IS DISTINCT FROM 'true'::jsonb/);
  assert.match(sql, /a\.member->>'sha256' IS DISTINCT FROM coalesce\(changed->>\(b\.member->>'sha256'\),b\.member->>'sha256'\)/);
});
