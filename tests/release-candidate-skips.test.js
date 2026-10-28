import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  CANDIDATE_WORKFLOWS, OPTIONAL_SOURCE_SKIPS, PROOF_SOURCE_FILES, digest,
  fileProof, fullSuiteSkipInventory, fullSuiteSummary, verifyCandidateAdmission,
} from '../scripts/lib/release-candidate-admission.mjs';
import {candidateEvidence, DEPLOYMENT_ID, SHA, replaceArtifactFile} from './fixtures/release-candidate-synthetic.js';

const names = [
  'verified August artifacts reproduce every published number, label and historical window',
  'verified S11 produces identical candidate twice and real updated totals with preserved past series',
  'immutable RAW255 syntax is known but cannot retrospectively satisfy the new cleanup profile',
  'el XLSX municipal real verifica hash, rango y linaje sin importar datos',
];
const sourceFiles = () => Object.fromEntries([
  'tests/friendly-source-aggregate.test.js', 'tests/owner190-cleanup-raw255.local.test.js',
  'tests/junin-attendance-inventory-importer.test.js',
].map(name => [name, fs.readFileSync(new URL('../' + name, import.meta.url))]));
const summary = skipped => ({tests: 12, pass: 12 - skipped, fail: 0, cancelled: 0, skipped, todo: 0});
const summaryLines = (value, prefix = '#') => Object.entries(value).map(([key, count]) => prefix + ' ' + key + ' ' + count).join('\n');
const tapLines = (selected = names, reason = '') => selected.map((name, index) =>
  'ok ' + (index + 1) + ' - ' + name + ' # SKIP' + (reason ? ' ' + reason : '')).join('\n');
const tapLog = (selected = names) => 'TAP version 13\n' + tapLines(selected) + '\n1..12\n' + summaryLines(summary(selected.length)) + '\n';
const inventory = (log, files = sourceFiles()) => fullSuiteSkipInventory(log, fullSuiteSummary(log), files);
const verify = evidence => verifyCandidateAdmission(evidence, {expectedSha: SHA, expectedDeploymentId: DEPLOYMENT_ID});

function evidenceWithAllowedSkips() {
  const evidence = candidateEvidence(), log = tapLog();
  Object.assign(evidence.source.files, sourceFiles());
  for (const record of evidence.workflows) {
    const policy = CANDIDATE_WORKFLOWS.find(value => value.key === record.key);
    for (const artifact of record.artifacts) {
      if (policy.fullSuite) replaceArtifactFile(artifact, 'full-suite.log', Buffer.from(log));
      const proof = JSON.parse(artifact.files['proof.json']);
      proof.sourceFiles = PROOF_SOURCE_FILES.map(name => fileProof(name, evidence.source.files[name]));
      if (policy.fullSuite) {
        proof.fullSuite = fullSuiteSummary(log);
        proof.optionalSkips = inventory(log);
      }
      replaceArtifactFile(artifact, 'proof.json', proof);
    }
  }
  return evidence;
}

test('only the four explicitly declared optional tests have unchanged source hashes', () => {
  const files = sourceFiles();
  assert.deepEqual(OPTIONAL_SOURCE_SKIPS.map(value => value.name), names);
  assert.equal(Object.keys(files).length, 3);
  for (const allowed of OPTIONAL_SOURCE_SKIPS) {
    assert.equal(digest(files[allowed.file]), allowed.sourceSha256, allowed.file);
    assert.ok(files[allowed.file].toString('utf8').includes("test('" + allowed.name + "'"));
  }
});

test('TAP inventories each of the four allowed skips without claiming a runtime reason', () => {
  const observed = inventory(tapLog());
  assert.deepEqual(observed.map(value => value.name), names);
  for (const row of observed) {
    assert.equal(row.runtimeReason, null);
    assert.equal(row.reasonProvenance, 'unchanged-source-condition');
    assert.ok(row.file && row.sourceSha256 && row.reason);
  }
});

test('TAP skip reasons are retained as runtime text rather than replacing source provenance', () => {
  const log = tapLines(names, 'synthetic optional source absent') + '\n' + summaryLines(summary(names.length));
  for (const row of inventory(log)) {
    assert.equal(row.runtimeReason, 'synthetic optional source absent');
    assert.equal(row.reasonProvenance, 'unchanged-source-condition');
    assert.notEqual(row.reason, row.runtimeReason);
  }
});

test('spec output accepts durations and optional SKIP markers with the same inventory', () => {
  const spec = [
    '﹣ ' + names[0] + ' (0.123ms)',
    '﹣ ' + names[1] + ' (1.25s) # SKIP',
    '﹣ ' + names[2] + ' (0.002ms) # SKIP optional local file absent',
    '﹣ ' + names[3] + ' (0.003ms) # SKIP optional private workbook absent',
    summaryLines(summary(names.length), 'ℹ'),
  ].join('\n');
  const observed = inventory(spec);
  assert.deepEqual(observed.map(value => value.name), names);
  assert.deepEqual(observed.map(value => value.runtimeReason), [null, null, 'optional local file absent', 'optional private workbook absent']);
});

test('ANSI colors and CRLF do not conceal a skip or change its name', () => {
  const log = tapLog().split('\n').map(line => '\x1b[36m' + line + '\x1b[0m').join('\r\n');
  assert.deepEqual(inventory(log).map(value => value.name), names);
});

test('no skips require an empty inventory; any allowed subset is recorded exactly', () => {
  assert.deepEqual(inventory(tapLog([])), []);
  for (const selected of [[names[0]], [names[1], names[2]], [names[3]]]) {
    assert.deepEqual(inventory(tapLog(selected)).map(value => value.name), selected);
  }
});

test('an unknown test skip remains rejected after the four explicit optional approvals', () => {
  for (const name of ['required M7 PostgreSQL verification',
    'unapproved optional municipal workbook verification']) {
    assert.throws(() => inventory(tapLog([name])), {code: 'CANDIDATE_UNKNOWN_TEST_SKIP'});
  }
});

test('missing skip lines, a false summary count and duplicate skip names are rejected', () => {
  for (const [lines, skipped] of [[tapLines(names.slice(0, -1)), names.length], [tapLines(), names.length - 1],
    [tapLines([names[0], names[0], names[1], names[2]]), names.length], ['', 1]]) {
    assert.throws(() => inventory(lines + '\n' + summaryLines(summary(skipped))), {code: 'CANDIDATE_SKIP_INVENTORY_UNVERIFIED'});
  }
});

test('the identical allowed name cannot excuse changed or missing test source bytes', () => {
  for (const allowed of OPTIONAL_SOURCE_SKIPS) for (const missing of [false, true]) {
    const files = sourceFiles();
    if (missing) delete files[allowed.file];
    else files[allowed.file] = Buffer.concat([
      files[allowed.file], Buffer.from('\n// synthetic drift\n'),
    ]);
    assert.throws(() => inventory(tapLog([allowed.name]), files), {code: 'CANDIDATE_SKIP_SOURCE_CHANGED'});
  }
});

test('all required jobs may pass while the four optional local tests remain honestly inventoried', () => {
  const result = verify(evidenceWithAllowedSkips());
  assert.equal(result.admitted, true); assert.equal(result.proofCount, 8);
  assert.equal(result.externalNominalDatasetsVerified, false);
  assert.equal(result.noeliaReady, false); assert.equal(result.fullGoalComplete, false);
  for (const row of result.proofs) {
    const policy = CANDIDATE_WORKFLOWS.find(value => value.file === row.workflow);
    assert.deepEqual(row.optionalSkips.map(value => value.name), policy.fullSuite ? names : []);
  }
});

test('serialized skip evidence must agree with the downloaded full-suite log', () => {
  for (const change of [rows => rows.pop(), rows => { rows[0].sourceSha256 = '0'.repeat(64); },
    rows => { rows[0].runtimeReason = 'invented runtime proof'; }]) {
    const evidence = evidenceWithAllowedSkips(), artifact = evidence.workflows.find(value => value.key === 'capacity').artifacts[0];
    const proof = JSON.parse(artifact.files['proof.json']); change(proof.optionalSkips);
    replaceArtifactFile(artifact, 'proof.json', proof);
    assert.throws(() => verify(evidence), {code: 'CANDIDATE_SKIP_INVENTORY_UNVERIFIED'});
  }
});

test('allowed optional local tests never authorize skipping a required CI job or step', () => {
  for (const kind of ['job', 'step']) {
    const evidence = evidenceWithAllowedSkips(), job = evidence.workflows[0].jobs[0];
    if (kind === 'job') job.conclusion = 'skipped';
    else job.steps[0].conclusion = 'skipped';
    assert.throws(() => verify(evidence), {code: kind === 'job' ? 'CANDIDATE_JOB_NOT_SUCCESSFUL' : 'CANDIDATE_STEP_NOT_SUCCESSFUL'});
  }
});

test('an admitted optional-skip inventory cannot be mutated into nominal verification later', () => {
  const result = verify(evidenceWithAllowedSkips()), row = result.proofs.find(value => value.optionalSkips.length);
  assert.equal(Object.isFrozen(row.optionalSkips), true); assert.equal(Object.isFrozen(row.optionalSkips[0]), true);
  assert.throws(() => { row.optionalSkips[0].reasonProvenance = 'nominal-verification'; }, TypeError);
  assert.throws(() => { row.optionalSkips.pop(); }, TypeError);
  assert.equal(result.externalNominalDatasetsVerified, false);
});
