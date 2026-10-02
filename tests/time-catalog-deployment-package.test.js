import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildTimeCatalogInstallation, SQL116_SHA256} from '../scripts/lib/time-catalog-installation.mjs';

const rules = fs.readFileSync('.vercelignore', 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
function included(file) {
  let keep = true;
  for (const rule of rules) {
    const negated = rule.startsWith('!'), pattern = negated ? rule.slice(1) : rule;
    const matches = pattern.endsWith('/') ? file.startsWith(pattern) : path.matchesGlob(file, pattern) || (!pattern.includes('/') && path.matchesGlob(path.basename(file), pattern));
    if (matches) keep = negated;
  }
  return keep;
}
const packagedRead = file => {
  assert.ok(included(file), 'Dependency excluded from Vercel package: ' + file);
  return fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
};

test('the filtered Vercel package retains the exact reviewed SQL116, not only the complete checkout', () => {
  const source = packagedRead('scripts/migrations/116-native-time-catalog.sql');
  assert.equal(createHash('sha256').update(source).digest('hex'), SQL116_SHA256);
  const batch = buildTimeCatalogInstallation({source, sourceCommit: 'f'.repeat(40)});
  assert.equal(batch.migrationStatements, 19);
  assert.equal(batch.pins.length, 15);
});

test('time catalogue packaging includes the page and real source dependencies while keeping private material excluded', () => {
  for (const file of ['catalogo-tiempo.html', 'assets/time-catalog-editor.js', 'assets/time-catalog-review.js', 'api/internal-time-catalog.js', 'lib/internal-time-catalog.js', 'scripts/migrations/011-versioned-time-catalog.sql', 'scripts/migrations/093-native-fixed-novelties.sql', 'scripts/migrations/104-native-employment-changes.sql', 'scripts/migrations/110-native-employment-lifecycle.sql']) {
    assert.ok(included(file), 'Dependency excluded from Vercel package: ' + file);
    assert.ok(fs.statSync(file).isFile());
  }
  for (const file of ['.handoff/sync-current.json', 'AGENTS.md', 'CODEX_TASK.md', 'MUNICONTROL_HANDOFF.md', '.env.local', 'verification/review.json', 'data-rrhh/private.json', 'private.txt', 'private.sql', 'private.sql.gz', 'private.backup_20260922.sql']) assert.equal(included(file), false, 'Private source admitted: ' + file);
  assert.ok(!rules.includes('!*.sql'));
});
