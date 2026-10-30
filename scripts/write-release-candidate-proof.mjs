// Local CI evidence only. No network, SQL, deployment or source mutation.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import assert from 'node:assert/strict';
import {
  PROOF_VERSION, RELEASE_REPOSITORY, CANDIDATE_WORKFLOWS, PROOF_SOURCE_FILES,
  M7_RELEASE_FILES, fileProof, fullSuiteSummary, fullSuiteSkipInventory,
} from './lib/release-candidate-admission.mjs';

export function writeCandidateProof({root, env = process.env, workflow, major, phase, readGit}) {
  const policy = CANDIDATE_WORKFLOWS.find(value => value.key === workflow);
  assert.ok(policy && [17, 18].includes(major) && ['before', 'after'].includes(phase), 'CANDIDATE_PROOF_OPTIONS_INVALID');
  const git = readGit ?? (args => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 15000}).trim());
  const read = name => fs.readFileSync(path.join(root, name));
  const checkoutSha = git(['rev-parse', 'HEAD']), treeSha = git(['rev-parse', 'HEAD^{tree}']);
  assert.match(checkoutSha, /^[a-f0-9]{40}$/); assert.match(treeSha, /^[a-f0-9]{40}$/);
  assert.equal(env.GITHUB_REPOSITORY, RELEASE_REPOSITORY);
  assert.equal(env.GITHUB_SHA, checkoutSha, 'CANDIDATE_PROOF_EVENT_CHECKOUT_CHANGED');
  assert.equal(env.GITHUB_JOB, policy.job);
  assert.ok(['pull_request', 'push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME));
  assert.equal(git(['status', '--porcelain', '--untracked-files=no']), '', 'CANDIDATE_PROOF_TRACKED_SOURCE_CHANGED');
  const runId = Number(env.GITHUB_RUN_ID), runAttempt = Number(env.GITHUB_RUN_ATTEMPT);
  assert.ok(Number.isSafeInteger(runId) && runId > 0 && Number.isSafeInteger(runAttempt) && runAttempt > 0);
  const sourceFiles = Object.fromEntries(PROOF_SOURCE_FILES.map(name => [name, read(name)]));
  const identity = {
    version: PROOF_VERSION, repository: RELEASE_REPOSITORY, workflow: policy.file, job: policy.job,
    major, runId, runAttempt, event: env.GITHUB_EVENT_NAME, eventSha: env.GITHUB_SHA,
    checkoutSha, treeSha, trackedSourceClean: true,
    sourceFiles: PROOF_SOURCE_FILES.map(name => fileProof(name, sourceFiles[name])),
  };
  const parent = path.join(root, 'verification', 'release-candidate');
  fs.mkdirSync(parent, {recursive: true});
  const before = path.join(parent, workflow + '-pg' + major + '-before.json');
  if (phase === 'before') {
    fs.writeFileSync(before, JSON.stringify(identity, null, 2) + '\n', {flag: 'wx'});
    return identity;
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(before, 'utf8')), identity, 'CANDIDATE_PROOF_SOURCE_BOOKEND_CHANGED');
  const directory = path.join(parent, workflow + '-pg' + major);
  fs.mkdirSync(directory, {recursive: false});
  const files = {
    'report.json': read(policy.report(major)),
    'release-info.json': read('public/release-info.json'),
    'build-manifest.json': Buffer.from(JSON.stringify({
      version: 'municontrol-m7-static-build.v1', commitSha: checkoutSha, treeSha,
      files: M7_RELEASE_FILES.map(name => fileProof(name, read('public/' + name))),
    }, null, 2) + '\n'),
  };
  let fullSuite = null, optionalSkips = [];
  if (policy.fullSuite) {
    files['full-suite.log'] = read('verification/release-full-suite.log');
    fullSuite = fullSuiteSummary(files['full-suite.log'].toString('utf8'));
    // Record source-declared optional skips honestly; the admission consumer
    // rejects incomplete/unknown inventories and any skipped required CI step.
    optionalSkips = fullSuiteSkipInventory(files['full-suite.log'].toString('utf8'), fullSuite, sourceFiles);
  }
  const proof = {...identity, fullSuite, optionalSkips, files: Object.entries(files).map(([name, data]) => fileProof(name, data))};
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), data, {flag: 'wx'});
  fs.writeFileSync(path.join(directory, 'proof.json'), JSON.stringify(proof, null, 2) + '\n', {flag: 'wx'});
  return proof;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const {values} = parseArgs({options: {workflow: {type: 'string'}, major: {type: 'string'}, phase: {type: 'string'}}, strict: true});
    const result = writeCandidateProof({root: fileURLToPath(new URL('../', import.meta.url)), workflow: values.workflow, major: Number(values.major), phase: values.phase});
    console.log(JSON.stringify({version: result.version, workflow: result.workflow, major: result.major, checkoutSha: result.checkoutSha, runId: result.runId, runAttempt: result.runAttempt}));
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
