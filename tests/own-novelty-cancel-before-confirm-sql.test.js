// Comprobaciones estáticas de la migración 249. La instalación real se ensayó el 24/11/2026 en una copia nueva de la base
// de producción: se instaló en una transacción, la verificación de adopción devolvió exactamente lo mismo que antes, las dos
// familias quedaron completas, el lote aprobado que sólo usaban corridas sin confirmar se canceló, y un resultado o una
// confirmación sobre una captura con ese lote se rechazaron con OWN_NOVELTY_NOT_CURRENT.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const sql = readFileSync('scripts/migrations/249-own-novelty-cancel-before-confirm.sql', 'utf8');
const constant = name => new RegExp(' ' + name + ' constant text:=\\$n\\$([\\s\\S]*?)\\$n\\$;').exec(sql)[1];

test('la cancelación sólo cambia la condición de uso y los bloqueos que toma', () => {
  const useNeedle = constant('use_needle'), useReplacement = constant('use_replacement');
  const lockNeedle = constant('lock_needle'), lockReplacement = constant('lock_replacement');
  assert.equal(useReplacement, useNeedle.replace("batch::text)", "batch::text AND EXISTS(SELECT 1 FROM public.own_payroll_liquidation_event l WHERE l.capture_id=c.id))"));
  assert.equal(lockReplacement, lockNeedle.replace('public.own_payroll_run_capture IN', 'public.own_payroll_run_capture,public.own_payroll_run_result,public.own_payroll_liquidation_event IN'));
  // Las dos agujas aparecen una sola vez en la definición del repositorio que dio origen a la de producción.
  const source = readFileSync('scripts/migrations/130-own-bulk-novelties.sql', 'utf8');
  for (const needle of [useNeedle, lockNeedle]) assert.equal(source.split(needle).length - 1, 1, needle.slice(0, 40));
});

test('recompone comando, adopción, atestador y familias con huellas previas y resultantes exactas', () => {
  assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/m);
  assert.doesNotMatch(sql.replace(/BEFORE INSERT ON/g, ''), /\b(DROP|ALTER|GRANT|INSERT|UPDATE|DELETE|TRUNCATE|CREATE TABLE|DISABLE TRIGGER|SET ROLE|session_replication_role)\b/);
  assert.equal([...sql.matchAll(/\bEXECUTE replace|\bEXECUTE attester_definition/g)].length, 4);
  for (const code of ['PREREQUISITE', 'ALREADY_INSTALLED', 'ATTESTER_CHANGED', 'FAMILY_INCOMPLETE', 'PREIMAGE_CHANGED', 'RESULT', 'ATTESTER_RESULT', 'FAMILY_CHANGED', 'FAMILY_RESULT'])
    assert.ok(sql.includes("RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_" + code), code);
  const hashes = [...sql.matchAll(/'([a-f0-9]{64})'/g)].map(m => m[1]);
  assert.equal(hashes.length, 10); assert.equal(new Set(hashes).size, 10, 'ninguna huella se repite');
  assert.doesNotMatch(sql, /@[A-Z_]+@/, 'no quedan marcadores sin medir');
});

test('la guarda nueva no usa el prefijo own_novelty_ que la verificación de adopción enumera', () => {
  const created = [...sql.matchAll(/CREATE FUNCTION public\.([a-z0-9_]+)\(/g)].map(m => m[1]);
  assert.deepEqual(created, ['own_payroll_capture_novelty_guard_v1']);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.own_payroll_capture_novelty_guard_v1\(\) FROM PUBLIC;/);
  assert.match(sql, /BEFORE INSERT ON public\.own_payroll_run_result FOR EACH ROW/);
  assert.match(sql, /BEFORE INSERT ON public\.own_payroll_liquidation_event FOR EACH ROW/);
  // plpgsql no garantiza cortocircuito: NEW.command sólo se lee dentro de la rama de liquidaciones.
  assert.match(sql, /IF TG_TABLE_NAME='own_payroll_liquidation_event' THEN IF NEW\.command<>'confirm' THEN RETURN NEW;END IF;END IF;/);
  assert.ok(!readdirSync('scripts/migrations').some(f => f !== '249-own-novelty-cancel-before-confirm.sql' && readFileSync('scripts/migrations/' + f, 'utf8').includes('own_payroll_capture_novelty_guard_v1')));
});

test('los errores nuevos llegan con texto propio a cálculo y novedades', () => {
  assert.match(readFileSync('lib/internal-own-payroll-run.js', 'utf8'), /OWN_NOVELTY_NOT_CURRENT[\s\S]{0,80}'NOVELTY_NOT_CURRENT',409/);
  assert.match(readFileSync('lib/internal-own-payroll-novelties.js', 'utf8'), /IN_USE:\[409,'Una liquidación ya confirmada usa este lote/);
  assert.match(readFileSync('.vercelignore', 'utf8'), /^!scripts\/migrations\/249-own-novelty-cancel-before-confirm\.sql$/m);
});
