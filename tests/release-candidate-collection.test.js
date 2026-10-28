import assert from 'node:assert/strict';
import test from 'node:test';
import {zipSync} from 'fflate';
import {
  candidateHttpReaders, collectCandidateAdmission, decodeCandidateArtifact,
  githubPages,
} from '../scripts/verify-release-candidate.mjs';
import {
  CANDIDATE_WORKFLOWS, M7_RELEASE_FILES, PROOF_SOURCE_FILES, RELEASE_PROJECT,
  RELEASE_REPOSITORY, RELEASE_TEAM, digest,
} from '../scripts/lib/release-candidate-admission.mjs';
import {candidateEvidence, DEPLOYMENT_ID, SHA, TREE} from './fixtures/release-candidate-synthetic.js';

const prefix = '/repos/' + RELEASE_REPOSITORY;
const clone = value => structuredClone(value);
const zip = files => Buffer.from(zipSync(files, {level: 0, mtime: new Date('2000-01-01T00:00:00Z')}));
const zipMetadata = archive => ({digest: 'sha256:' + digest(archive), size_in_bytes: archive.length});
const code = value => ({code: value});
const collect = readers => collectCandidateAdmission({candidateSha: SHA, deploymentId: DEPLOYMENT_ID, ...readers});

function localCollection(evidence = candidateEvidence(), hooks = {}) {
  const events = [], archives = new Map(), listReads = new Map(), runReads = new Map();
  let deploymentReads = 0;
  for (const workflow of evidence.workflows) for (const artifact of workflow.artifacts) {
    const archive = zip(artifact.files);
    Object.assign(artifact.metadata, zipMetadata(archive));
    archives.set(artifact.metadata.id, archive);
  }
  const readers = {
    async getGithub(endpoint) {
      events.push({kind: 'github', endpoint});
      const url = new URL(endpoint, 'https://api.github.com');
      const pathname = url.pathname, page = Number(url.searchParams.get('page') || 1);
      const paged = rows => clone(rows.slice((page - 1) * 100, page * 100));
      if (pathname === prefix + '/git/commits/' + SHA) return {sha: SHA, tree: {sha: evidence.source.tree}};
      if (pathname.startsWith(prefix + '/contents/')) {
        assert.equal(url.searchParams.get('ref'), SHA);
        const name = pathname.slice((prefix + '/contents/').length), bytes = evidence.source.files[name];
        assert.ok(Buffer.isBuffer(bytes), 'fixture source exists: ' + name);
        return {type: 'file', path: name, encoding: 'base64', size: bytes.length, content: bytes.toString('base64')};
      }
      const policy = CANDIDATE_WORKFLOWS.find(value => pathname === prefix + '/actions/workflows/' + value.file.split('/').at(-1) + '/runs');
      if (policy) {
        assert.equal(url.searchParams.get('head_sha'), SHA);
        const count = page === 1 ? (listReads.get(policy.key) || 0) + 1 : listReads.get(policy.key);
        listReads.set(policy.key, count);
        const record = evidence.workflows.find(value => value.key === policy.key);
        const rows = hooks.runs?.({policy, count, record}) ?? [record.run];
        return {workflow_runs: paged(rows)};
      }
      for (const record of evidence.workflows) {
        const runPath = prefix + '/actions/runs/' + record.run.id;
        if (pathname === runPath) {
          const count = (runReads.get(record.key) || 0) + 1; runReads.set(record.key, count);
          return clone(hooks.run?.({record, count}) ?? record.run);
        }
        if (pathname === runPath + '/attempts/' + record.run.run_attempt + '/jobs') return {jobs: paged(record.jobs)};
        if (pathname === runPath + '/artifacts') {
          return {artifacts: paged(hooks.artifacts?.(record) ?? record.artifacts.map(value => value.metadata))};
        }
      }
      assert.fail('Unexpected GitHub request: ' + endpoint);
    },
    async getArtifact(metadata) {
      events.push({kind: 'artifact', id: metadata.id});
      return decodeCandidateArtifact(archives.get(metadata.id), metadata);
    },
    async getDeployment(id) {
      assert.equal(id, DEPLOYMENT_ID);
      events.push({kind: 'deployment', count: ++deploymentReads});
      return clone(hooks.deployment?.(deploymentReads, evidence.deployment) ?? evidence.deployment);
    },
    async getDeploymentFile(deployment, name) {
      assert.equal(deployment.id, DEPLOYMENT_ID);
      events.push({kind: 'static', name});
      return Buffer.from(evidence.deployedFiles[name]);
    },
  };
  return {readers, events, evidence};
}

test('collector admits eight real ZIP proofs and rereads every run after all artifact and static downloads', async () => {
  const fixture = localCollection(), result = await collect(fixture.readers);
  assert.equal(result.admission.proofCount, 8);
  assert.equal(result.admission.candidateSha, SHA); assert.equal(result.admission.treeSha, TREE);
  assert.equal(result.admission.deploymentId, DEPLOYMENT_ID);
  assert.equal(result.admission.noeliaReady, false); assert.equal(result.admission.promotionPerformed, false);
  assert.equal(fixture.events.filter(value => value.kind === 'artifact').length, 8);
  assert.equal(fixture.events.filter(value => value.kind === 'static').length, M7_RELEASE_FILES.length);
  assert.equal(fixture.events.filter(value => value.endpoint?.includes('/contents/')).length, PROOF_SOURCE_FILES.length);
  const lastDownload = fixture.events.findLastIndex(value => ['static', 'artifact'].includes(value.kind));
  for (const record of fixture.evidence.workflows) {
    const indices = fixture.events.flatMap((value, index) => value.endpoint === prefix + '/actions/runs/' + record.run.id ? [index] : []);
    assert.equal(indices.length, 2); assert.ok(indices[1] > lastDownload);
    assert.ok(fixture.events.slice(lastDownload + 1).some(value => value.endpoint?.includes('/actions/workflows/' + record.run.path.split('/').at(-1))));
  }
  assert.deepEqual(fixture.events.at(-1), {kind: 'deployment', count: 2});
});

test('missing and PR-only workflow inventories cannot borrow a different source execution', async () => {
  for (const runs of [() => [], ({record}) => [{...record.run, event: 'pull_request'}],
    ({record}) => [{...record.run, head_sha: 'c'.repeat(40)}]]) {
    await assert.rejects(collect(localCollection(candidateEvidence(), {runs}).readers), code('CANDIDATE_WORKFLOW_MISSING'));
  }
});

test('a newer pending or failed source run takes precedence over an older successful run', async () => {
  for (const change of [{status: 'queued', conclusion: null}, {conclusion: 'failure'}]) {
    const evidence = candidateEvidence(), newer = new Map(evidence.workflows.map(record => [record.key,
      {...record.run, id: record.run.id + 1000, run_number: record.run.run_number + 1, ...change}]));
    const fixture = localCollection(evidence, {runs: ({record}) => [record.run, newer.get(record.key)]});
    const original = fixture.readers.getGithub;
    fixture.readers.getGithub = async endpoint => {
      const requested = [...newer.values()].find(run => endpoint === prefix + '/actions/runs/' + run.id);
      return requested ? clone(requested) : original(endpoint);
    };
    await assert.rejects(collect(fixture.readers), code('CANDIDATE_RUN_NOT_SUCCESSFUL'));
    assert.equal(fixture.events.filter(value => value.kind === 'artifact').length, 0);
  }
});

test('a selected run that starts a new attempt before its detail read is rejected', async () => {
  const fixture = localCollection(candidateEvidence(), {run: ({record}) => ({...record.run, run_attempt: record.run.run_attempt + 1})});
  await assert.rejects(collect(fixture.readers), code('CANDIDATE_RUN_NOT_SUCCESSFUL'));
});

test('a rerun completed during the downloads cannot inherit the old attempt artifacts', async () => {
  const fixture = localCollection(candidateEvidence(), {run: ({record, count}) =>
    ({...record.run, run_attempt: record.run.run_attempt + (count === 2 ? 1 : 0)})});
  await assert.rejects(collect(fixture.readers), code('CANDIDATE_RUN_ATTEMPT_CHANGED'));
});

test('final inventory detects a newly queued run even if the original run still says success', async () => {
  const fixture = localCollection(candidateEvidence(), {runs: ({record, count}) => count === 1 ? [record.run] :
    [record.run, {...record.run, id: record.run.id + 100, run_number: record.run.run_number + 1,
      status: 'queued', conclusion: null}]});
  await assert.rejects(collect(fixture.readers), code('CANDIDATE_RUN_NOT_SUCCESSFUL'));
});

test('final inventory also rejects a newer successful run with different artifacts', async () => {
  const fixture = localCollection(candidateEvidence(), {runs: ({record, count}) => count === 1 ? [record.run] :
    [{...record.run, id: record.run.id + 100, run_number: record.run.run_number + 1}]});
  await assert.rejects(collect(fixture.readers), code('CANDIDATE_RUN_ATTEMPT_CHANGED'));
});

test('newly failed current run and a deployment changed during reads block admission', async () => {
  const failed = localCollection(candidateEvidence(), {run: ({record, count}) =>
    ({...record.run, conclusion: count === 2 ? 'failure' : 'success'})});
  await assert.rejects(collect(failed.readers), code('CANDIDATE_RUN_NOT_SUCCESSFUL'));
  const rerouted = localCollection(candidateEvidence(), {deployment: (count, value) =>
    ({...value, alias: count === 2 ? ['municontrol.com'] : []})});
  await assert.rejects(collect(rerouted.readers), code('CANDIDATE_DEPLOYMENT_CHANGED_DURING_READ'));
});

test('missing PostgreSQL job, artifact and a different committed tree cannot be collected as complete', async () => {
  const jobs = candidateEvidence(); jobs.workflows[0].jobs.pop();
  await assert.rejects(collect(localCollection(jobs).readers), code('CANDIDATE_PG_MATRIX_INCOMPLETE'));
  const artifact = candidateEvidence(); artifact.workflows[0].artifacts.pop();
  await assert.rejects(collect(localCollection(artifact).readers), code('CANDIDATE_ARTIFACT_MISSING'));
  const tree = candidateEvidence(); tree.source.tree = 'c'.repeat(40);
  await assert.rejects(collect(localCollection(tree).readers), code('CANDIDATE_CHECKOUT_CHANGED'));
});

test('artifact pagination finds current-attempt evidence beyond the first hundred rows', async () => {
  const fixture = localCollection(candidateEvidence(), {artifacts: record => [
    ...Array.from({length: 100}, (_, index) => ({id: 5000 + index, name: 'unrelated-' + index, expired: false})),
    ...record.artifacts.map(value => value.metadata),
  ]});
  assert.equal((await collect(fixture.readers)).admission.proofCount, 8);
  assert.equal(fixture.events.filter(value => value.endpoint?.includes('/artifacts?per_page=100&page=2')).length, 4);
});

test('GitHub inventories require every page and reject malformed or unbounded lists', async () => {
  const calls = [];
  const rows = await githubPages(async endpoint => {
    calls.push(endpoint);
    return {jobs: calls.length === 1 ? Array.from({length: 100}, (_, id) => ({id})) : [{id: 100}]};
  }, '/fixture?filter=current', 'jobs');
  assert.equal(rows.length, 101); assert.equal(calls[1], '/fixture?filter=current&per_page=100&page=2');
  await assert.rejects(githubPages(async () => ({jobs: null}), '/fixture', 'jobs'), code('CANDIDATE_GITHUB_LIST_INVALID'));
  let pages = 0;
  await assert.rejects(githubPages(async () => { pages++; return {jobs: Array(100).fill({})}; }, '/fixture', 'jobs'), code('CANDIDATE_GITHUB_INVENTORY_TOO_LARGE'));
  assert.equal(pages, 100);
});

test('ZIP digest is checked before extracting any archive member', async () => {
  const archive = zip({'report.json': Buffer.from('{}')}); let extracted = false;
  await assert.rejects(decodeCandidateArtifact(archive, {digest: 'sha256:' + '0'.repeat(64)}, () => {
    extracted = true; return {};
  }), code('CANDIDATE_ARTIFACT_DIGEST_CHANGED'));
  assert.equal(extracted, false);
  const result = await decodeCandidateArtifact(archive, zipMetadata(archive));
  assert.equal(result.archiveSha256, digest(archive)); assert.equal(result.files['report.json'].toString(), '{}');
});

test('ZIP traversal, extra files and duplicate member names fail closed', async () => {
  for (const name of ['../report.json', '/report.json', 'directory/report.json', 'unreviewed.json']) {
    const archive = zip({[name]: Buffer.from('{}')});
    await assert.rejects(decodeCandidateArtifact(archive, zipMetadata(archive)), code('CANDIDATE_ARCHIVE_ENTRY_INVALID'));
  }
  const original = zip({'report.json': Buffer.from('{}'), 'proofX.json': Buffer.from('{}')});
  const duplicate = Buffer.from(original.toString('latin1').replaceAll('proofX.json', 'report.json'), 'latin1');
  await assert.rejects(decodeCandidateArtifact(duplicate, zipMetadata(duplicate)), code('CANDIDATE_ARCHIVE_ENTRIES_CHANGED'));
});

test('ZIP expansion limits are checked from the directory before allocating the claimed body', async () => {
  const archive = zip({'report.json': Buffer.from('{}')}), directory = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(directory >= 0); archive.writeUInt32LE(512 * 1024 * 1024 + 1, directory + 24);
  await assert.rejects(decodeCandidateArtifact(archive, zipMetadata(archive)), code('CANDIDATE_ARCHIVE_TOO_LARGE'));
  await assert.rejects(decodeCandidateArtifact(Buffer.alloc(0), zipMetadata(Buffer.alloc(0))), code('CANDIDATE_ARTIFACT_SIZE_INVALID'));
});

const response = (value, status = 200, headers = {}) => new Response(
  Buffer.isBuffer(value) ? value : JSON.stringify(value), {status, headers});
const syntheticEnv = {VERCEL_TOKEN: 'local-fixture-vercel-token', GITHUB_TOKEN: 'local-fixture-github-token'};

test('absent Vercel credentials fail before any request; none are synthesized', () => {
  let calls = 0;
  for (const env of [{}, {GITHUB_TOKEN: syntheticEnv.GITHUB_TOKEN}, {VERCEL_TOKEN: '  '}]) {
    assert.throws(() => candidateHttpReaders({env, fetchImpl: async () => { calls++; }}), code('CANDIDATE_VERCEL_READ_CREDENTIAL_UNAVAILABLE'));
  }
  assert.equal(calls, 0);
});

test('HTTP readers issue GET only and never forward provider credentials to artifact storage or deployment bytes', async () => {
  const archive = zip({'report.json': Buffer.from('{}')}), events = [], deployment = candidateEvidence().deployment;
  const signed = 'https://fixture.blob.core.windows.net/evidence/artifact.zip?signature=local-fixture';
  const readers = candidateHttpReaders({env: syntheticEnv, fetchImpl: async (url, options) => {
    events.push({url, options});
    if (url === 'https://api.github.com' + prefix + '/actions/artifacts/123/zip') return response(null, 302, {location: signed});
    if (url === signed) return response(archive);
    if (url.startsWith('https://api.vercel.com/')) return response(deployment);
    if (url.startsWith('https://' + deployment.url + '/')) return response(Buffer.from('static fixture'));
    if (url.startsWith('https://api.github.com' + prefix + '/')) return response({sha: SHA});
    assert.fail('Unexpected HTTP request: ' + url);
  }});
  await readers.getGithub(prefix + '/git/commits/' + SHA);
  await readers.getArtifact({id: 123, ...zipMetadata(archive)});
  await readers.getDeployment(DEPLOYMENT_ID);
  await readers.getDeploymentFile(deployment, 'nomina-control.html');
  for (const {url, options} of events) {
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual');
    const authorization = new Headers(options.headers).get('authorization');
    if (url.startsWith('https://api.github.com/')) assert.equal(authorization, 'Bearer ' + syntheticEnv.GITHUB_TOKEN);
    else if (url.startsWith('https://api.vercel.com/')) assert.equal(authorization, 'Bearer ' + syntheticEnv.VERCEL_TOKEN);
    else assert.equal(authorization, null);
  }
  assert.equal(events.at(-1).url, 'https://' + deployment.url + '/nomina?release=' + DEPLOYMENT_ID);
});

test('anonymous GitHub reads remain anonymous when a GitHub credential is absent', async () => {
  let authorization;
  const readers = candidateHttpReaders({env: {VERCEL_TOKEN: syntheticEnv.VERCEL_TOKEN}, fetchImpl: async (_url, options) => {
    authorization = new Headers(options.headers).get('authorization'); return response({sha: SHA});
  }});
  await readers.getGithub(prefix + '/git/commits/' + SHA);
  assert.equal(authorization, null);
});

test('artifact redirects must be HTTPS provider storage and are never followed automatically', async () => {
  for (const location of ['https://untrusted.invalid/artifact.zip', 'http://fixture.blob.core.windows.net/a',
    'https://fixture.blob.core.windows.net.untrusted.invalid/a', 'https://user:password@objects.githubusercontent.com/a']) {
    let calls = 0;
    const readers = candidateHttpReaders({env: syntheticEnv, fetchImpl: async () => {
      calls++; return response(null, 302, {location});
    }});
    await assert.rejects(readers.getArtifact({id: 123}), code('CANDIDATE_ARTIFACT_REDIRECT_INVALID'));
    assert.equal(calls, 1);
  }
});

test('redirects and authentication walls on static deployment files fail without a login or bypass request', async () => {
  for (const status of [302, 401, 403]) {
    let calls = 0;
    const readers = candidateHttpReaders({env: syntheticEnv, fetchImpl: async (_url, options) => {
      calls++; assert.equal(new Headers(options.headers).get('authorization'), null);
      assert.equal(options.redirect, 'manual'); return response(null, status, {location: 'https://vercel.com/login'});
    }});
    await assert.rejects(readers.getDeploymentFile(candidateEvidence().deployment, 'release-info.json'), code('CANDIDATE_REMOTE_READ_FAILED'));
    assert.equal(calls, 1);
  }
});

test('Vercel fields are observed from the response, never filled from the requested team or expected project', async () => {
  const raw = {id: DEPLOYMENT_ID, readyState: 'READY', url: candidateEvidence().deployment.url};
  const readers = candidateHttpReaders({env: syntheticEnv, fetchImpl: async () => response(raw)});
  const observed = await readers.getDeployment(DEPLOYMENT_ID);
  assert.equal(observed.projectId, undefined); assert.equal(observed.teamId, undefined); assert.equal(observed.target, undefined);
  const fixture = localCollection(); fixture.readers.getDeployment = readers.getDeployment;
  await assert.rejects(collect(fixture.readers), code('CANDIDATE_STAGED_PRODUCTION_REQUIRED'));
  assert.equal(fixture.events.length, 0);
});

test('READY preview, missing source identity and foreign project cannot become an admitted production candidate', async () => {
  for (const mutation of [value => { value.target = 'preview'; }, value => { value.target = null; },
    value => { value.projectId = RELEASE_PROJECT + 'other'; }, value => { value.teamId = RELEASE_TEAM + 'other'; }]) {
    const evidence = candidateEvidence(); mutation(evidence.deployment);
    const fixture = localCollection(evidence);
    await assert.rejects(collect(fixture.readers), code('CANDIDATE_STAGED_PRODUCTION_REQUIRED'));
    assert.equal(fixture.events.filter(value => value.kind !== 'deployment').length, 0);
  }
  const noSource = candidateEvidence(); delete noSource.deployment.gitSource; delete noSource.deployment.meta;
  await assert.rejects(collect(localCollection(noSource).readers), code('CANDIDATE_DEPLOYMENT_SOURCE_CHANGED'));
});
