// Comprobaciones estáticas de la migración 245. La ejecución real se ensayó en una copia aislada de la base
// (ver docs/OWN_RUN_ACTOR_PERSON_FORMAT_20261119.md); estas pruebas fijan lo que el ensayo validó.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const sql = readFileSync('scripts/migrations/245-own-run-actor-person-identifier-format.sql', 'utf8');
const quoted = name => new RegExp('\\$' + name + '\\$([\\s\\S]*?)\\$' + name + '\\$').exec(sql)[1];
const needle = quoted('needle'), replacement = quoted('replacement');
const RFC = "'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'";
const CANONICAL = "'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'";
// Dónde vive hoy cada control, según la última migración del repositorio que define la función.
const SOURCES = {
  own_run_declared_adjustments_capture_v1: '231-own-monthly-declared-adjustments.sql',
  own_run_quantity_only_expected_inputs_v1: '233-own-quantity-only-inputs.sql',
  own_run_capped_sources_v1: '235-own-capped-deduction-effects.sql',
  own_run_monthly_forced_capture_check_candidate_v1: '237-own-approved-period-values.sql',
};
function functionBody(source, name) {
  const at = source.lastIndexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
  assert.notEqual(at, -1, name);
  const rest = source.slice(at), tag = /AS (\$[a-z_0-9]*\$)/.exec(rest)[1], start = rest.indexOf(tag) + tag.length;
  return rest.slice(start, rest.indexOf(tag, start));
}

test('cambia sólo el formato del identificador de persona del actor', () => {
  assert.equal(needle, "coalesce(actor->>'personId','')!~" + RFC);
  assert.equal(replacement, "coalesce(actor->>'personId','')!~" + CANONICAL + " OR actor->>'personId'='00000000-0000-0000-0000-000000000000'");
  // El reemplazo sigue rechazando: vacío, mayúsculas, formato no canónico y el identificador nulo.
  const pattern = new RegExp(CANONICAL.slice(1, -1));
  const rejected = id => !pattern.test(id ?? '') || id === '00000000-0000-0000-0000-000000000000';
  for (const bad of [null, '', 'x', '00000000-0000-0000-0000-000000000000', 'A1B2C3D4-0000-b000-1000-000000000001', 'a1b2c3d4-0000-b000-1000-00000000000', 'a1b2c3d40000b0001000000000000001'])
    assert.equal(rejected(bad), true, String(bad));
  // Acepta un identificador derivado (sin versión ni variante RFC) y también uno aleatorio versión 4.
  for (const ok of ['a1b2c3d4-0000-b000-1000-000000000001', 'a1b2c3d4-0000-c000-c000-000000000001', '3f2b8c1e-9d4a-4f6b-8a7c-1e2d3c4b5a69'])
    assert.equal(rejected(ok), false, ok);
  assert.equal(new RegExp(RFC.slice(1, -1)).test('a1b2c3d4-0000-b000-1000-000000000001'), false, 'el control anterior rechazaba un identificador derivado');
});

test('cada función del repositorio tiene el control exactamente una vez y seguido del rechazo de revisión', () => {
  for (const [name, file] of Object.entries(SOURCES)) {
    const body = functionBody(readFileSync('scripts/migrations/' + file, 'utf8'), name);
    assert.equal(body.split(needle).length - 1, 1, name);
    assert.match(body.slice(body.indexOf(needle) + needle.length, body.indexOf(needle) + needle.length + 80), /^ THEN RAISE EXCEPTION '[A-Z_]+_REVIEW_REQUIRED';END IF;/, name);
    // La membresía conserva su control y las personas y membresías siguen teniendo que ser distintas.
    assert.ok(body.includes("coalesce(actor->>'membershipId','')!~" + RFC), name);
    assert.match(body, /count\(DISTINCT a->>'membershipId'\) FROM jsonb_array_elements\(actors\) a\)<>review_count\+1 OR \(SELECT count\(DISTINCT a->>'personId'\)/, name);
    assert.ok(sql.includes("('public." + name + '('), 'la migración trata a ' + name);
  }
  // Ninguna otra función del repositorio exige formato RFC a un identificador de persona.
  for (const file of readdirSync('scripts/migrations').filter(f => f.endsWith('.sql') && f < '245')) {
    const text = readFileSync('scripts/migrations/' + file, 'utf8');
    if (text.includes(needle)) assert.ok(['231', '233', '235', '236', '237'].includes(file.slice(0, 3)), file);
  }
});

test('reemplaza con huella previa, cantidad exacta de apariciones y huella resultante, y recompone la atestación', () => {
  assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m);
  assert.doesNotMatch(sql, /\b(DROP|ALTER|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|CREATE TABLE|DISABLE TRIGGER|SET ROLE|session_replication_role)\b/);
  assert.equal([...sql.matchAll(/\bEXECUTE\b/g)].length, 3, 'tres reemplazos: funciones, atestador y familias');
  assert.match(sql, /EXECUTE replace\(definition,needle,replacement\);/);
  assert.match(sql, /EXECUTE attester_definition;/);
  assert.match(sql, /EXECUTE replace\(definition,attester_before,attester_after\);/);
  for (const code of ['PREREQUISITE', 'ALREADY_INSTALLED', 'ATTESTER_CHANGED', 'FAMILY_INCOMPLETE', 'PREIMAGE_CHANGED', 'RESULT', 'ATTESTER_RESULT', 'FAMILY_CHANGED', 'FAMILY_RESULT'])
    assert.ok(sql.includes("RAISE EXCEPTION 'OWN_RUN_ACTOR_PERSON_FORMAT_" + code), code);
  const pins = [...sql.matchAll(/\('public\.([a-z0-9_]+)\(([a-z,]*)\)','([a-f0-9]{64})','([a-f0-9]{64})'\)/g)];
  assert.deepEqual(pins.map(m => m[1]), [...Object.keys(SOURCES), 'own_run_official_family_v1', 'own_run_quantity_family_v1']);
  const hashes = [...sql.matchAll(/'([a-f0-9]{64})'/g)].map(m => m[1]);
  assert.equal(hashes.length, 14); assert.equal(new Set(hashes).size, 14, 'ninguna huella se repite: cada reemplazo cambia el cuerpo');
  // Cada función exige una sola aparición del control en su cuerpo y de su huella en el atestador; cada familia, dos de la del atestador.
  assert.match(sql, /occurrences IS DISTINCT FROM 1\s+OR \(length\(definition\)-length\(replace\(definition,needle,''\)\)\)\/length\(needle\)<>1\s+OR \(length\(attester_definition\)-length\(replace\(attester_definition,item\.before_sha256,''\)\)\)\/64<>1\s+OR position\(item\.after_sha256 IN attester_definition\)<>0/);
  assert.match(sql, /occurrences IS DISTINCT FROM 2\s+OR \(length\(definition\)-length\(replace\(definition,attester_before,''\)\)\)\/64<>2/);
  // Las familias tienen que estar completas antes y después, y sus miembros sólo cambian por una huella reemplazada.
  assert.match(sql, /official_before->'complete' IS DISTINCT FROM 'true'::jsonb OR quantity_before->'complete' IS DISTINCT FROM 'true'::jsonb/);
  assert.match(sql, /family_after->'complete' IS DISTINCT FROM 'true'::jsonb OR \(family_after-'members'\) IS DISTINCT FROM \(family_before-'members'\)/);
  assert.match(sql, /a\.member->>'sha256' IS DISTINCT FROM coalesce\(changed->>\(b\.member->>'sha256'\),b\.member->>'sha256'\)/);
});
