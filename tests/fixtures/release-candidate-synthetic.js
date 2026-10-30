import fs from 'node:fs';
import {
  CANDIDATE_WORKFLOWS, EVIDENCE_STEP, FULL_BUILD_COMMAND, FULL_SUITE_STEP,
  FULL_TEST_COMMAND, M7_RELEASE_FILES, PROOF_SOURCE_FILES, PROOF_VERSION,
  RELEASE_PROJECT, RELEASE_REPOSITORY, RELEASE_TEAM, artifactName, digest,
  fileProof, fullSuiteSummary,
} from '../../scripts/lib/release-candidate-admission.mjs';

export const SHA = 'a'.repeat(40);
export const TREE = 'b'.repeat(40);
export const DEPLOYMENT_ID = 'dpl_SyntheticM7Candidate';
export const jsonBytes = value => Buffer.from(JSON.stringify(value) + '\n');
export const FULL_LOG = [
  'TAP version 13', '1..12', '# tests 12', '# suites 0', '# pass 12',
  '# fail 0', '# cancelled 0', '# skipped 0', '# todo 0', '# duration_ms 1234', '',
].join('\n');

// The pure validator receives already downloaded/extracted artifact evidence.
// This deterministic opaque archive digest is a fixture, not a real ZIP or a
// replacement for the collector's download/hash checks.
export function refreshArchive(artifact) {
  const archive = jsonBytes(Object.entries(artifact.files).sort(([a], [b]) => a.localeCompare(b))
    .map(([path, bytes]) => fileProof(path, bytes)));
  artifact.archiveSha256 = digest(archive);
  artifact.metadata.digest = 'sha256:' + artifact.archiveSha256;
  artifact.metadata.size_in_bytes = archive.length;
  return artifact;
}

export function replaceArtifactFile(artifact, name, value) {
  artifact.files[name] = Buffer.isBuffer(value) ? Buffer.from(value) : jsonBytes(value);
  if (name !== 'proof.json') {
    const proof = JSON.parse(artifact.files['proof.json']);
    const index = proof.files.findIndex(file => file.path === name);
    if (index >= 0) proof.files[index] = fileProof(name, artifact.files[name]);
    artifact.files['proof.json'] = jsonBytes(proof);
  }
  return refreshArchive(artifact);
}

function reportFor(key, major) {
  const report = {passed: true, syntheticSchemaRemoved: true};
  if (key === 'capacity') return {...report, major, sourceCommit: SHA,
    sourceAfter: {passed: true}, priorDatabasePreserved: true, actualSql: true,
    productionWrites: 0, municipalAcceptance: false};
  Object.assign(report, {serverMajor: major, synthetic: true, productUiVerified: true});
  if (key === 'calculation') return {...report, realHttpAndSql: true,
    builtPackage: true, sourceReviewVerified: true, productiveInstallation: false};
  Object.assign(report, {actualHttpHandler: true, actualSqlRevocation: true,
    productiveBusinessOperations: 0});
  if (key === 'receipts') return {...report, independentReview: true,
    ownAgentIsolation: true, sourceReopenDuringPdf: true};
  return {...report, reportBusinessPosts: 0, legajoPostGenerationInvalidation: true,
    statisticsPostGenerationInvalidation: true, statementPendingExportInvalidation: true};
}

export function candidateEvidence() {
  const sourceFiles = Object.fromEntries(PROOF_SOURCE_FILES.map(name =>
    [name, Buffer.from('Synthetic committed source: ' + name + '\n')]));
  for (const policy of CANDIDATE_WORKFLOWS) {
    sourceFiles[policy.file] = fs.readFileSync(new URL('../../' + policy.file, import.meta.url));
  }
  sourceFiles['package.json'] = jsonBytes({private: true, type: 'module', scripts: {
    test: FULL_TEST_COMMAND, build: FULL_BUILD_COMMAND,
  }});
  sourceFiles['.nvmrc'] = Buffer.from('24.21.0\n');
  const release = {version: 'municontrol-release.v1', commitSha: SHA,
    sourceState: 'committed', adminUiSha256: 'c'.repeat(64)};
  const deployedFiles = Object.fromEntries(M7_RELEASE_FILES.map(name =>
    [name, Buffer.from('Synthetic built M7 file: ' + name + '\n')]));
  deployedFiles['release-info.json'] = jsonBytes(release);
  const build = {version: 'municontrol-m7-static-build.v1', commitSha: SHA,
    treeSha: TREE, files: M7_RELEASE_FILES.map(name => fileProof(name, deployedFiles[name]))};
  const workflows = CANDIDATE_WORKFLOWS.map((policy, index) => {
    const run = {id: 100 + index, run_attempt: 2, run_number: 50 + index,
      repository: {full_name: RELEASE_REPOSITORY}, head_repository: {full_name: RELEASE_REPOSITORY},
      head_sha: SHA, path: policy.file, event: 'push', status: 'completed', conclusion: 'success'};
    const jobs = [17, 18].map(major => {
      const names = ['Checkout exact candidate', 'Install dependencies',
        ...(policy.fullSuite ? [FULL_SUITE_STEP] : []),
        policy.key === 'receipts' ? policy.requiredStep + major + ' --browser=chromium' : policy.requiredStep,
        EVIDENCE_STEP, 'Upload release candidate evidence'];
      return {id: 1000 + index * 100 + major, run_id: run.id, name: policy.jobName(major),
        status: 'completed', conclusion: 'success', steps: names.map((name, number) =>
          ({number: number + 1, name, status: 'completed', conclusion: 'success'}))};
    });
    const artifacts = [17, 18].map(major => {
      const files = {'report.json': jsonBytes(reportFor(policy.key, major)),
        'release-info.json': jsonBytes(release), 'build-manifest.json': jsonBytes(build)};
      if (policy.fullSuite) files['full-suite.log'] = Buffer.from(FULL_LOG);
      const proof = {version: PROOF_VERSION, repository: RELEASE_REPOSITORY,
        workflow: policy.file, job: policy.job, major, runId: run.id,
        runAttempt: run.run_attempt, event: run.event, checkoutSha: SHA, eventSha: SHA,
        treeSha: TREE, trackedSourceClean: true,
        sourceFiles: PROOF_SOURCE_FILES.map(name => fileProof(name, sourceFiles[name])),
        files: Object.entries(files).map(([name, value]) => fileProof(name, value)),
        fullSuite: policy.fullSuite ? fullSuiteSummary(FULL_LOG) : null,
        ...(policy.fullSuite ? {optionalSkips: []} : {})};
      files['proof.json'] = jsonBytes(proof);
      return refreshArchive({metadata: {id: 2000 + index * 100 + major,
        name: artifactName(policy.key, major, run.id, run.run_attempt), expired: false,
        workflow_run: {id: run.id, head_sha: SHA}}, files});
    });
    return {key: policy.key, run, latestRun: structuredClone(run),
      finalRun: structuredClone(run), jobs, artifacts};
  });
  return {source: {sha: SHA, tree: TREE, repository: RELEASE_REPOSITORY, files: sourceFiles},
    workflows, deployedFiles, deployment: {id: DEPLOYMENT_ID, projectId: RELEASE_PROJECT,
      teamId: RELEASE_TEAM, target: 'production', readyState: 'READY',
      gitSource: {sha: SHA}, meta: {githubCommitSha: SHA},
      url: 'municipio-junin-friendly-synthetic-candidate.vercel.app', alias: []}};
}
