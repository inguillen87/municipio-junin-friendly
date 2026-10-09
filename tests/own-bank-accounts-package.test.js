import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnBankAccountsInstallation } from '../scripts/lib/own-bank-accounts-installation.mjs';
const root = new URL('../', import.meta.url), read = file => fs.readFileSync(new URL(file, root), 'utf8');
const rules = read('.vercelignore').split(/\r?\n/).map(r => r.trim()).filter(r => r && !r.startsWith('#'));
function included(file) {
 let keep = true;
 for (const rule of rules) { const negate = rule.startsWith('!'), p = negate ? rule.slice(1) : rule; if (p.endsWith('/') ? file.startsWith(p) : path.matchesGlob(file,p) || !p.includes('/') && path.matchesGlob(path.posix.basename(file),p)) keep = negate; }
 return keep;
}
test('Vercel filtered package preserves the complete reviewed bank installation source', () => {
 const options = { sourceCommit: 'f'.repeat(40), read: file => { assert.ok(included(file), 'Excluded build dependency: '+file); return read(file); } };
 assert.deepEqual(buildOwnBankAccountsInstallation(options), buildOwnBankAccountsInstallation({...options,read}));
 for (const file of ['api/internal-own-bank-accounts.js','lib/internal-own-bank-accounts.js','assets/own-bank-accounts-model.js','assets/own-bank-accounts-panel.js']) assert.ok(included(file),file);
});
test('package still excludes municipal private sources and blocked migration drafts', () => {
 for (const file of ['.handoff/sync-current.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/result.json','backup.sql.gz','source.txt','scripts/migrations/114-native-payroll-resolver.sql','scripts/migrations/115-native-payroll-intake.sql']) assert.equal(included(file),false,file);
 assert.ok(!rules.includes('!*.sql') && !rules.includes('!scripts/migrations/*.sql'));
});
