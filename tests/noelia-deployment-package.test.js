import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOwnJurisdictionInstallation} from '../scripts/lib/own-payroll-jurisdiction-installation.mjs';
import {buildAdoptedPositionsInstallation} from '../scripts/lib/adopted-positions-installation.mjs';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const rules = read('.vercelignore').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
function included(file) {
  let keep = true;
  for (const rule of rules) {
    const negated = rule.startsWith('!'), pattern = negated ? rule.slice(1) : rule;
    if (pattern.endsWith('/') ? file.startsWith(pattern) : path.matchesGlob(file, pattern) || (!pattern.includes('/') && path.matchesGlob(path.basename(file), pattern))) keep = negated;
  }
  return keep;
}
const packagedRead = file => {
  assert.ok(included(file), 'Dependency excluded from Vercel package: ' + file);
  return read(file);
};

test('the filtered Noelia deployment produces the same complete reviewed batches as the checkout', () => {
  const options = {read: packagedRead, sourceCommit: 'f'.repeat(40)};
  for (const build of [buildOwnJurisdictionInstallation, buildAdoptedPositionsInstallation]) {
    const batch = build(options);
    assert.deepEqual(batch, build({read, sourceCommit: options.sourceCommit}));
  }
});

test('the filtered build retains reference-scale SQL and keeps municipal private sources excluded', () => {
  assert.ok(packagedRead('scripts/migrations/131-own-payroll-reference-scale.sql').length > 0);
  for (const file of ['.handoff/sync-current.json', 'AGENTS.md', 'CODEX_TASK.md', 'MUNICONTROL_HANDOFF.md', '.env.local', 'verification/result.json', 'private.sql', 'private.sql.gz', 'private.backup_20261001.sql', 'private.txt', 'MuniControl_Fuentes_Privadas/source.sql', 'MuniControl_Codex_Handoff/source.sql']) {
    assert.equal(included(file), false, 'Private source admitted: ' + file);
  }
  assert.ok(!rules.includes('!*.sql'));
  assert.ok(!rules.includes('!scripts/migrations/*.sql'));
});
