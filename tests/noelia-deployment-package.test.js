import {buildMonthlyDayPolicyInstallation,MONTHLY_DAY_SQL} from '../scripts/lib/own-monthly-day-policy-installation.mjs';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOwnJurisdictionInstallation} from '../scripts/lib/own-payroll-jurisdiction-installation.mjs';
import {buildAdoptedPositionsInstallation} from '../scripts/lib/adopted-positions-installation.mjs';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const rules = read('.vercelignore').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
function included(file, patterns = rules) {
  let keep = true;
  for (const rule of patterns) {
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


test('the filtered web source retains the complete canonical192 protocol for both explicit baselines',()=>{
 const observed=new Map(),checkedRead=file=>{const text=packagedRead(file);if(observed.has(file))assert.equal(text,observed.get(file),'PACKAGED_SOURCE_CHANGED:'+file);else observed.set(file,text);return text;};
 for(const operationalPairBaseline of ['pre107','published107']){
  const options={read:checkedRead,sourceCommit:'f'.repeat(40),operationalPairBaseline};
  const delivered=buildMonthlyDayPolicyInstallation(options);
  const canonical=buildMonthlyDayPolicyInstallation({...options,read});
  const sameProtocol=(actual,expected,field="root")=>{
   assert.equal(typeof actual,typeof expected,field);
   if(typeof actual==="function"){assert.equal(field,"root.previous.previous.previous.previous.streaming.proof");assert.equal(String(actual),String(expected));for(const mode of ["'install'","'verify'"])assert.equal(actual(mode),expected(mode));return;}
   if(actual&&typeof actual==="object"){assert.ok(expected&&typeof expected==="object",field);assert.equal(Object.getPrototypeOf(actual),Object.getPrototypeOf(expected),field);assert.deepEqual(Object.keys(actual),Object.keys(expected),field);if(Array.isArray(actual))assert.equal(actual.length,expected.length,field);for(const key of Object.keys(actual))sameProtocol(actual[key],expected[key],field+"."+key);return;}
   assert.deepEqual(actual,expected,field);
  };
  sameProtocol(delivered,canonical);
  assert.equal(delivered.connects,false);assert.equal(delivered.executesSql,false);assert.equal(delivered.executionAdmitted,false);
  const without192=rules.filter(rule=>rule!=='!'+MONTHLY_DAY_SQL);
  assert.throws(()=>buildMonthlyDayPolicyInstallation({...options,read:file=>{assert.ok(included(file,without192),'Dependency excluded from Vercel package: '+file);return read(file);}}),error=>error.message.includes('Dependency excluded from Vercel package: '+MONTHLY_DAY_SQL));
 }
 assert.equal(rules.filter(rule=>rule==='!'+MONTHLY_DAY_SQL).length,1);
 assert.ok(rules.indexOf('!'+MONTHLY_DAY_SQL)>rules.indexOf('*.sql'));
 for(const file of ['local-agents/clock-fleet/install-machine-linux.sh','local-agents/pm10/service.mjs','.handoff/private.json','verification/private.json','.env.production','private.sql.gz','scripts/migrations/114-native-payroll-resolver.sql','scripts/migrations/115-native-payroll-intake.sql','scripts/migrations/193-unreviewed.sql'])assert.equal(included(file),false,'Non-code source admitted: '+file);
 for(const [file,text] of observed)assert.equal(read(file),text,'PACKAGED_SOURCE_BOOKEND_CHANGED:'+file);
});
