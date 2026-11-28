import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmdirSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {syntheticDefinition, schoolDecisions} from './fixtures/own-program-agreement-composer-synthetic.js';

const script = fileURLToPath(new URL('../scripts/compose-agreement.mjs', import.meta.url));
function fixture(t, {target = '6', school = false} = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'agreement-composer-qa-'));
  t.after(() => { for (const name of readdirSync(directory)) unlinkSync(path.join(directory, name)); rmdirSync(directory); });
  const files = Object.fromEntries(['definition', 'overrides', 'coverage-decisions', 'output', 'report'].map(k => [k, path.join(directory, `${k}.json`)]));
  const definition = syntheticDefinition({school}); definition.rules[0].ruleReference = 'SYNTHETIC_RULE_CONTENT_NEVER_PRINTED';
  writeFileSync(files.definition, JSON.stringify(definition));
  writeFileSync(files.overrides, readFileSync(new URL(`../data/agreement-overrides/${target}-2026-10.json`, import.meta.url)));
  writeFileSync(files['coverage-decisions'], JSON.stringify(schoolDecisions(target)));
  const args = Object.entries(files).filter(([key]) => school || key !== 'coverage-decisions').flatMap(([key, value]) => [`--${key}`, value]);
  const run = (custom = args) => spawnSync(process.execPath, [script, ...custom], {encoding: 'utf8', timeout: 20000});
  return {files, run, args};
}
test('CLI writes separate result/report, prints only counts and preserves source bytes', t => {
  const f = fixture(t, {school: true}), before = readFileSync(f.files.definition, 'utf8'), result = f.run();
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  assert.equal(readFileSync(f.files.definition, 'utf8'), before);
  const definition = JSON.parse(readFileSync(f.files.output)), report = JSON.parse(readFileSync(f.files.report));
  assert.equal(definition.rules.length, 16); assert.equal(report.appliedOverrides.length, 2);
  const stdout = JSON.parse(result.stdout);
  assert.equal(stdout.coverageDecisions, 2); assert.equal(stdout.appliedOverrides, 2);
  assert.doesNotMatch(result.stdout, /SYNTHETIC_RULE|ruleReference|expression|sourceSha256|policyId/);
  assert.ok(!result.stdout.includes(f.files.output));
});
test('CLI fails with both school row codes and writes no partial composition', t => {
  const f = fixture(t, {school: true}); writeFileSync(f.files['coverage-decisions'], '[]');
  const result = f.run(); assert.equal(result.status, 1); assert.match(result.stderr, /311, 312/);
  assert.equal(result.stdout, ''); assert.ok(!existsSync(f.files.output) && !existsSync(f.files.report));
});
test('CLI rejects overwriting existing output', t => {
  const f = fixture(t); writeFileSync(f.files.output, 'EXISTING_SYNTHETIC_OUTPUT');
  const result = f.run(); assert.equal(result.status, 1); assert.match(result.stderr, /COMPOSER_CLI_OUTPUT_FAILED/);
  assert.equal(readFileSync(f.files.output, 'utf8'), 'EXISTING_SYNTHETIC_OUTPUT'); assert.ok(!existsSync(f.files.report));
});
test('CLI releases its new output if the report already exists', t => {
  const f = fixture(t); writeFileSync(f.files.report, 'EXISTING_SYNTHETIC_REPORT');
  const result = f.run(); assert.equal(result.status, 1); assert.ok(!existsSync(f.files.output));
  assert.equal(readFileSync(f.files.report, 'utf8'), 'EXISTING_SYNTHETIC_REPORT');
});
test('CLI rejects input/output path collisions', t => {
  const f = fixture(t), args = [...f.args]; args[args.indexOf('--output') + 1] = f.files.definition;
  const before = readFileSync(f.files.definition, 'utf8'), result = f.run(args);
  assert.equal(result.status, 1); assert.match(result.stderr, /COMPOSER_CLI_PATH_CONFLICT/);
  assert.equal(readFileSync(f.files.definition, 'utf8'), before);
});
test('CLI hides parser contents and local paths on malformed JSON', t => {
  const f = fixture(t); writeFileSync(f.files.definition, '{SYNTHETIC_INVALID_CONTENT');
  const result = f.run(); assert.equal(result.status, 1); assert.match(result.stderr, /COMPOSER_CLI_INPUT_INVALID/);
  assert.ok(!result.stderr.includes(f.files.definition)); assert.doesNotMatch(result.stderr, /SYNTHETIC_INVALID_CONTENT/);
  assert.ok(!existsSync(f.files.output));
});
test('CLI refuses duplicate and unknown flags', t => {
  const f = fixture(t);
  for (const extra of [['--unknown', 'value'], ['--report', f.files.report]]) {
    const result = f.run([...f.args, ...extra]); assert.equal(result.status, 1); assert.match(result.stderr, /COMPOSER_CLI_USAGE/);
  }
});
test('CLI C4 produces an explicitly incomplete draft with exit code 2 and pending count', t => {
  const f = fixture(t, {target: '4'}), result = f.run();
  assert.equal(result.status, 2, result.stderr); assert.equal(JSON.parse(result.stdout).unresolvedOverrides, 2);
  const report = JSON.parse(readFileSync(f.files.report));
  assert.equal(report.complete, false); assert.deepEqual(report.unresolvedOverrides.map(r => r.code), ['48', '670']);
});
test('CLI failure identifies a missing override node without printing the rule', t => {
  const f = fixture(t), p = JSON.parse(readFileSync(f.files.definition));
  p.rules.find(r => r.code === '44').expression = {op: 'literal', unit: 'money', value: '1'};
  writeFileSync(f.files.definition, JSON.stringify(p));
  const result = f.run(); assert.equal(result.status, 1); assert.match(result.stderr, /COMPOSER_OVERRIDE_NODE_NOT_UNIQUE/);
  assert.match(result.stderr, /c6\.44\.add-59/); assert.doesNotMatch(result.stderr, /SYNTHETIC_RULE|expression/);
  assert.ok(!existsSync(f.files.output) && !existsSync(f.files.report));
});
