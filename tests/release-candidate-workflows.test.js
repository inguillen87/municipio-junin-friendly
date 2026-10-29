// Workflow contracts only: no SQL, browser, constructor or subprocess.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CANDIDATE_WORKFLOWS, CANDIDATE_WORKFLOW_SHA256, digest} from '../scripts/lib/release-candidate-admission.mjs';
import {RELEASE_CANDIDATE_SOURCE_PINS, RELEASE_CANDIDATE_WORKFLOW_PIN, projectReleaseCandidateWorkflowToParent} from './fixtures/release-candidate-workflow-succession.js';
import {OWNER190_QA_RECONCILIATION_SOURCE_PINS, projectOwner190QaReconciliationRawSourceToParent} from './fixtures/owner190-qa-source-reconciliation.js';

// Ordered run commands from the unchanged 5b38 parent. New evidence cannot
// replace, remove, filter, reorder or duplicate a functional gate.
const prior = {
  calculation: {count: 33, sha256: 'a8b63f6a00a2544357f9af91f15a249edb40511c8df5efb568c29575871718d3'},
  capacity: {count: 13, sha256: '7ae092de553611e5060902d01688017d94376fc233e31e17eb614eea6f87a175'},
  receipts: {count: 13, sha256: '2bb5c3acc5d78f310385c3206a0a828664db7ccb844551d635858fdc40145c8b'},
  reports: {count: 7, sha256: 'f3460206506824f71286f3ebd67201ce2e40d4fa221e9e7bbbc3281641998e27'},
};
import {projectZeroDifferenceAllRawSourceToParent} from './fixtures/zero-difference-source-projection.js';
const read = name => projectZeroDifferenceAllRawSourceToParent(name, fs.readFileSync(new URL('../' + name, import.meta.url)));
const capture = 'set -o pipefail\nmkdir -p verification\nnpm run build 2>&1 | tee verification/release-full-suite.log';
function runs(source) {
  const lines = source.split('\n'), commands = [];
  for (let index = 0; index < lines.length; index++) {
    const match = /^\s+(?:- )?run: (.*)$/.exec(lines[index]);
    if (!match) continue;
    let command = match[1];
    if (command === '|') {
      const parts = [];
      while (index + 1 < lines.length && (lines[index + 1].startsWith('          ') || !lines[index + 1].trim())) parts.push(lines[++index].slice(10));
      command = parts.join('\n').trimEnd();
    }
    commands.push(command);
  }
  return commands;
}
function verifyFunctionalSteps(source, policy) {
  const matrix = policy.key === 'capacity' ? 'pg' : 'major';
  const before = 'node scripts/write-release-candidate-proof.mjs --workflow=' + policy.key + ' --major=${{ matrix.' + matrix + ' }} --phase=before';
  const after = before.replace('--phase=before', '--phase=after');
  const commands = runs(source);
  assert.equal(commands.filter(value => value === before).length, 1);
  assert.equal(commands.filter(value => value === after).length, 1);
  assert.equal(commands.at(-1), after);
  assert.ok(commands.indexOf(before) < commands.findIndex(value => value.startsWith('node --test')));
  assert.equal(commands.filter(value => value === capture).length, policy.fullSuite ? 1 : 0);
  const checkout = 'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"';
  assert.equal(commands.filter(value => value === checkout).length, policy.key === 'capacity' ? 1 : 0);
  const original = commands.filter(value => ![before, after, ...(policy.key === 'capacity' ? [checkout] : [])].includes(value)).map(value => value === capture ? 'npm run build' : value);
  assert.equal(original.length, prior[policy.key].count);
  assert.equal(digest(JSON.stringify(original)), prior[policy.key].sha256);
}
for (const policy of CANDIDATE_WORKFLOWS) {
  test(policy.key + ' retains every ordered gate, bounded evidence and the approved workflow bytes', () => {
    const raw = read(policy.file), source = raw.toString('utf8');
    assert.equal(digest(raw), CANDIDATE_WORKFLOW_SHA256[policy.file]);
    verifyFunctionalSteps(source, policy);
    assert.match(source, /workflow_dispatch:/);
    assert.match(source, /branches: \['master', 'codex\/candidate-admission-20261028'/);
    assert.match(source, /'tests\/fixtures\/release-candidate-\*\.js'/);
    assert.doesNotMatch(source, /continue-on-error|pull_request_target|secrets\.|contents: write|id-token: write|vercel promote/);
    const upload = source.slice(source.indexOf('      - name: Upload release candidate evidence'));
    assert.match(upload, /github\.run_id.*github\.run_attempt/);
    assert.match(upload, /if-no-files-found: error/);
    assert.match(upload, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
    assert.doesNotMatch(upload, /if:|verification\/\*|overwrite:/);
    assert.throws(() => verifyFunctionalSteps(source.replace('node --test ', 'node --test --test-name-pattern=one '), policy));
    if (policy.fullSuite) assert.throws(() => verifyFunctionalSteps(source.replace('set -o pipefail\n', ''), policy));
  });
}

test('CI succession recovers the exact prior workflow and preserves the older historical parent', () => {
  const pin = RELEASE_CANDIDATE_WORKFLOW_PIN, raw = read(pin.path);
  const parent = projectReleaseCandidateWorkflowToParent(pin.path, raw);
  assert.equal(parent.length, pin.beforeBytes); assert.equal(digest(parent), pin.before);
  const historical = projectOwner190QaReconciliationRawSourceToParent(pin.path, raw);
  const old = OWNER190_QA_RECONCILIATION_SOURCE_PINS[pin.path];
  assert.equal(old.afterBytes, raw.length); assert.equal(old.after, digest(raw));
  assert.equal(historical.length, old.beforeBytes); assert.equal(digest(historical), old.before);
  assert.throws(() => projectReleaseCandidateWorkflowToParent(pin.path, parent));
  assert.throws(() => projectReleaseCandidateWorkflowToParent(pin.path, Buffer.concat([raw, Buffer.from('# drift')])));
  const mutation = Buffer.from(raw); mutation[0] ^= 1;
  assert.throws(() => projectReleaseCandidateWorkflowToParent(pin.path, mutation));
  const other = Buffer.from('unrelated');
  assert.strictEqual(projectReleaseCandidateWorkflowToParent('scripts/unrelated.mjs', other), other);
});

test('approved source metadata successions retain complete pre-access parents without changing54 native rows',()=>{
 for(const pin of Object.values(RELEASE_CANDIDATE_SOURCE_PINS)){
  const raw=read(pin.path),parent=projectReleaseCandidateWorkflowToParent(pin.path,raw);
  assert.equal(raw.length,pin.afterBytes);assert.equal(digest(raw),pin.after);
  assert.equal(parent.length,pin.beforeBytes);assert.equal(digest(parent),pin.before);
  assert.throws(()=>projectReleaseCandidateWorkflowToParent(pin.path,parent));
  const changed=Buffer.from(raw);changed[0]^=1;
  assert.throws(()=>projectReleaseCandidateWorkflowToParent(pin.path,changed));
 }
 const fixture=read('tests/fixtures/owner190-qa-source-reconciliation.js').toString('utf8');
 const literal=/const rows=([^\n]*);\n/.exec(fixture)?.[1];assert.ok(literal);
 assert.equal(Object.keys(JSON.parse(literal)).length,54);
 assert.equal(digest(literal),'9757b5b7bcbfc4cf66d9219f2577bbd9727aff8dc2d17468721a9aa796f13cac');
});

test('comparison pending-auth successor projects RAW7b7 to its exact Git5b98 parent before capacity presentation checks',()=>{
 const path='assets/own-payroll-comparison-panel.js',pin=RELEASE_CANDIDATE_SOURCE_PINS[path];assert.ok(pin,'COMPARISON_AUTH_SUCCESSION_REQUIRED');
 assert.equal(pin.before,'e4156da8452491bd7af364f4f099c5c6cc9a1a0d5247a833d5597fc1a92eed03');assert.equal(pin.beforeBytes,16261);
 assert.equal(pin.after,'d40b12fc4ebd3c9520e281fa5ed6f227d6d620eb41efb32b310b4401343fd0d5');assert.equal(pin.afterBytes,16316);assert.equal(pin.inverse.length,6);
 const raw=read(path);assert.equal(digest(raw),pin.after);assert.notEqual(digest(raw),pin.before,'RAW_CHILD_CANNOT_STAND_IN_FOR_PRESENTATION_PARENT');
 const parent=projectReleaseCandidateWorkflowToParent(path,raw);assert.equal(digest(parent),pin.before);assert.equal(parent.length,pin.beforeBytes);
 assert.deepEqual(projectOwner190QaReconciliationRawSourceToParent(path,raw),parent,'OWNER190_MUST_APPLY_SUCCESSION_BEFORE_HISTORICAL_READING');
 assert.throws(()=>projectReleaseCandidateWorkflowToParent(path,parent));
 const changed=Buffer.from(raw);changed[pin.inverse[0].offset]^=1;assert.throws(()=>projectReleaseCandidateWorkflowToParent(path,changed));
});

test('comparison succession retains the ten exact prior entries before the later planilla navigation successor',()=>{
 const saved=JSON.parse(read('tests/fixtures/own-payroll-reports-planillas-source-parent.json'));
 const raw=Buffer.from(saved.rows['tests/fixtures/release-candidate-workflow-succession.js'].beforeRawBase64,'base64');
 assert.equal(digest(raw),'bce30f48e0d0c0791056eb7bc4be50746bf4df153a46dd400ba8eecd497369dc');
 const match=/RELEASE_CANDIDATE_SOURCE_PINS=Object.freeze\((\{[^\n]*\})\);/.exec(raw.toString('utf8'));assert.ok(match);
 const parentPins=JSON.parse(match[1]);assert.equal(Object.keys(parentPins).length,12);
 const prior=Object.fromEntries(Object.entries(parentPins).filter(([path])=>path!=='assets/own-payroll-comparison-panel.js'&&path!=='tests/own-close-snapshot215-installation.test.js'));
 assert.equal(Object.keys(prior).length,10);assert.equal(Object.keys(RELEASE_CANDIDATE_SOURCE_PINS).length,13);
 assert.equal(digest(JSON.stringify(prior)),'a466066182ad3eca5b68d6a982e090f6142405db6d0862bb8b710b92f20e61f4');
});

test('215 package-pin test has an exact RAW successor while package remains current in the global reader',()=>{
 const path='tests/own-close-snapshot215-installation.test.js',pin=RELEASE_CANDIDATE_SOURCE_PINS[path],raw=read(path);assert.ok(pin);assert.equal(pin.inverse.length,3);
 assert.equal(pin.before,'25f3842861468fbc8130f7bf44721fd5659b2bf33273c499e36e2ef5864922be');assert.equal(pin.after,'4d834bdb32c9dd2477f5447be401dfa65d4c245aa3f5ba45a8fe2a1ef4bc08b4');assert.equal(digest(raw),pin.after);
 const parent=projectReleaseCandidateWorkflowToParent(path,raw);assert.equal(digest(parent),pin.before);const historical=projectOwner190QaReconciliationRawSourceToParent(path,raw);assert.equal(digest(historical),OWNER190_QA_RECONCILIATION_SOURCE_PINS[path].before);
 const packageRaw=read('package.json');assert.equal(Object.hasOwn(RELEASE_CANDIDATE_SOURCE_PINS,'package.json'),false);assert.strictEqual(projectReleaseCandidateWorkflowToParent('package.json',packageRaw),packageRaw);assert.equal(digest(packageRaw),'7bcece8861efe0e2f5b846abcf422495ef4cdd418c953c8f19633c0f3cc0c1e0');
});
