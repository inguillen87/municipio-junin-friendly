import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {writeCandidateProof} from '../scripts/write-release-candidate-proof.mjs';
import {CANDIDATE_WORKFLOWS, digest, verifyCandidateAdmission} from '../scripts/lib/release-candidate-admission.mjs';
import {candidateEvidence, SHA, TREE, DEPLOYMENT_ID, FULL_LOG, refreshArchive} from './fixtures/release-candidate-synthetic.js';

// A recording Git reader keeps these tests local and process-free. The CLI has
// no option to inject it: production evidence reads actual HEAD/tree/status.
function fixture(t, key = 'capacity') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-candidate-proof-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const evidence = candidateEvidence(), record = evidence.workflows.find(value => value.key === key);
  const policy = CANDIDATE_WORKFLOWS.find(value => value.key === key), major = 17, calls = [];
  const put = (name, bytes) => {const target = path.join(root, name); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, bytes);};
  for (const [name, bytes] of Object.entries(evidence.source.files)) put(name, bytes);
  for (const [name, bytes] of Object.entries(evidence.deployedFiles)) put('public/' + name, bytes);
  put(policy.report(major), record.artifacts[0].files['report.json']);
  if (policy.fullSuite) put('verification/release-full-suite.log', FULL_LOG);
  const env = {GITHUB_REPOSITORY: evidence.source.repository, GITHUB_SHA: SHA,
    GITHUB_JOB: policy.job, GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ID: String(record.run.id), GITHUB_RUN_ATTEMPT: String(record.run.run_attempt)};
  const state = {dirty: ''};
  const readGit = args => {
    calls.push(args);
    if (args.join(' ') === 'rev-parse HEAD') return SHA;
    if (args.join(' ') === 'rev-parse HEAD^{tree}') return TREE;
    assert.deepEqual(args, ['status', '--porcelain', '--untracked-files=no']);
    return state.dirty;
  };
  const options = {root, env, workflow: key, major, readGit};
  return {root, evidence, record, policy, calls, state, env, put,
    run: phase => writeCandidateProof({...options, phase}),
    output: path.join(root, 'verification/release-candidate/' + key + '-pg17')};
}

for (const key of ['calculation', 'capacity', 'receipts', 'reports']) test(key + ' producer bookends source and produces consumer-verifiable evidence', t => {
  const f = fixture(t, key), before = f.run('before'), after = f.run('after');
  assert.equal(before.checkoutSha, SHA); assert.equal(before.treeSha, TREE);
  assert.deepEqual(after.sourceFiles, before.sourceFiles); assert.equal(f.calls.length, 6);
  const files = Object.fromEntries(fs.readdirSync(f.output).map(name => [name, fs.readFileSync(path.join(f.output, name))]));
  for (const file of after.files) assert.equal(digest(files[file.path]), file.sha256);
  f.record.artifacts[0].files = files; refreshArchive(f.record.artifacts[0]);
  const admitted = verifyCandidateAdmission(f.evidence, {expectedSha: SHA, expectedDeploymentId: DEPLOYMENT_ID});
  assert.equal(admitted.proofCount, 8); assert.equal(admitted.noeliaReady, false);
  assert.equal(admitted.promotionPerformed, false);
});

test('a source-byte change between bookends is rejected even if the Git reader still reports the same clean SHA', t => {
  const f = fixture(t); f.run('before'); f.put('package-lock.json', 'changed after test start');
  assert.throws(() => f.run('after'), /CANDIDATE_PROOF_SOURCE_BOOKEND_CHANGED/);
  assert.equal(fs.existsSync(path.join(f.output, 'proof.json')), false);
});
test('a newer attempt cannot complete the previous attempt bookend', t => {
  const f = fixture(t); f.run('before'); f.env.GITHUB_RUN_ATTEMPT = '3';
  assert.throws(() => f.run('after'), /CANDIDATE_PROOF_SOURCE_BOOKEND_CHANGED/);
});
test('event SHA differs from the actual checkout and dirty tracked sources are rejected before evidence', t => {
  const f = fixture(t); f.env.GITHUB_SHA = 'f'.repeat(40);
  assert.throws(() => f.run('before'), /CANDIDATE_PROOF_EVENT_CHECKOUT_CHANGED/);
  f.env.GITHUB_SHA = SHA; f.state.dirty = ' M scripts/build-friendly.mjs';
  assert.throws(() => f.run('before'), /CANDIDATE_PROOF_TRACKED_SOURCE_CHANGED/);
});
test('source preflight is mandatory and its receipt is never silently overwritten', t => {
  const f = fixture(t); assert.throws(() => f.run('after'), {code: 'ENOENT'});
  f.run('before'); assert.throws(() => f.run('before'), {code: 'EEXIST'});
});
test('a truncated full-suite log cannot emit a successful evidence artifact', t => {
  const f = fixture(t); f.run('before'); f.put('verification/release-full-suite.log', 'TAP version 13\nok 1 - started\n');
  assert.throws(() => f.run('after'), {code: 'CANDIDATE_FULL_SUITE_RECEIPT_MISSING'});
  assert.equal(fs.existsSync(path.join(f.output, 'proof.json')), false);
});
