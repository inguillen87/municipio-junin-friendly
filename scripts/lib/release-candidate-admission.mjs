// Technical release admission only. This module opens no connection and never promotes.
import {createHash} from 'node:crypto';

export const CANDIDATE_VERSION = 'municontrol-candidate-admission.v1';
export const PROOF_VERSION = 'municontrol-candidate-job-proof.v1';
export const RELEASE_REPOSITORY = 'inguillen87/municipio-junin-friendly';
export const RELEASE_PROJECT = 'prj_AoxjtYZS3aqVUKqlOaXbYkPhneTT';
export const RELEASE_TEAM = 'team_BV1xuY6BnEzGanfok8GAyjZv';
export const FULL_TEST_COMMAND = 'node scripts/verify-platform-baseline.mjs && node scripts/verify-friendly-containment.mjs && node --test tests/*.test.js';
export const FULL_BUILD_COMMAND = 'npm run test && node scripts/build-friendly.mjs';
export const EVIDENCE_STEP = 'Record release candidate evidence';
export const FULL_SUITE_STEP = 'Full web suite and package';
export const OPTIONAL_SOURCE_SKIPS = Object.freeze([
  Object.freeze({file: 'tests/friendly-source-aggregate.test.js', name: 'verified August artifacts reproduce every published number, label and historical window',
    sourceSha256: 'c9699011d398266798d00ca53ea66068cb05b173a2489d30b743531273dfbdbc',
    reason: 'Source-declared optional August dataset; FRIENDLY_AGGREGATE_AUGUST_DIR is absent.'}),
  Object.freeze({file: 'tests/friendly-source-aggregate.test.js', name: 'verified S11 produces identical candidate twice and real updated totals with preserved past series',
    sourceSha256: 'c9699011d398266798d00ca53ea66068cb05b173a2489d30b743531273dfbdbc',
    reason: 'Source-declared optional S11/August datasets; at least one configured directory is absent.'}),
  Object.freeze({file: 'tests/owner190-cleanup-raw255.local.test.js', name: 'immutable RAW255 syntax is known but cannot retrospectively satisfy the new cleanup profile',
    sourceSha256: '6e149dfd414738e9e41b9768d41ac61287275c4f09e08ba09d6176827f1203c4',
    reason: 'Source-declared optional local forensic RAW255 file is absent.'}),
  Object.freeze({file: 'tests/junin-attendance-inventory-importer.test.js', name: 'el XLSX municipal real verifica hash, rango y linaje sin importar datos',
    sourceSha256: '40261fc20b3267a3a4ebfd28822b311fbdfae10bc16c98940f194bf3004a302e',
    reason: 'Source-declared optional private municipal workbook is absent.'}),
]);
export const M7_RELEASE_FILES = Object.freeze([
  'release-info.json', 'nomina-control.html', 'centro-acciones.html',
  'assets/app-routes.js', 'assets/payroll-navigation.js',
  'assets/own-payroll-run-model.js', 'assets/own-payroll-run-panel.js', 'assets/own-payroll-run-panel.css',
  'assets/own-payroll-response.js', 'assets/own-payroll-liquidation-panel.js', 'assets/own-payroll-liquidation-panel.css',
  'assets/own-payroll-close-panel.js', 'assets/own-payroll-close-panel.css',
  'assets/own-payroll-annulment-panel.js', 'assets/own-payroll-annulment-preparation-link.js',
  'assets/own-payroll-receipt-model.js', 'assets/own-payroll-receipt-panel.js', 'assets/own-payroll-receipt-panel.css',
  'assets/own-payroll-receipt-pdf.js', 'assets/own-payroll-report-panel.js', 'assets/own-payroll-report-panel.css',
]);
// Authority is this reviewed guard, not a hash declared by the candidate proof.
export const CANDIDATE_WORKFLOW_SHA256 = Object.freeze({
  ".github/workflows/own-payroll-calculation.yml": "c040bbdcce0944be9536569a3fa673461be1fa9ba372cada6d7cd35d248bf726",
  ".github/workflows/own-payroll-full-capacity.yml": "a335e996cd8a6c5e0135e13ef2534052e6a1a9a14d52d802c7742d674dc27205",
  ".github/workflows/own-payroll-receipts.yml": "387b90f9efc8e082e9b1fadf5f8c598bdb23301dc7276518d2df3fc6a5f77a30",
  ".github/workflows/own-payroll-reports.yml": "5b591f87973b5cdd82823258bb36d025fc302c4934f6dab90b13965c1783cbc4"
});
export const CANDIDATE_WORKFLOWS = Object.freeze([
  Object.freeze({key: 'calculation', file: '.github/workflows/own-payroll-calculation.yml', job: 'exact-calculation', fullSuite: false,
    jobName: major => 'exact-calculation (' + major + ', 554' + major + ')',
    report: () => 'verification/own-run-ui.json',
    requiredStep: 'Verify product UI, immutable retry, mobile and SQL revocation'}),
  Object.freeze({key: 'capacity', file: '.github/workflows/own-payroll-full-capacity.yml', job: 'verify', fullSuite: true,
    jobName: major => 'M7, receipt126 and Family195 browser, positions210-212 SQL / PG' + major + ' / published107',
    report: major => 'verification/own-full-capacity-pg' + major + '/result.json',
    requiredStep: 'Same190 M7 and receipt126 browser, Family195 native/browser and positions210-212 SQL'}),
  Object.freeze({key: 'receipts', file: '.github/workflows/own-payroll-receipts.yml', job: 'receipts', fullSuite: true,
    jobName: major => 'receipts (' + major + ')',
    report: () => 'verification/own-receipts-ui.json',
    requiredStep: 'Run node scripts/verify-own-payroll-receipt-ui.mjs --major='}),
  Object.freeze({key: 'reports', file: '.github/workflows/own-payroll-reports.yml', job: 'reports', fullSuite: true,
    jobName: major => 'reports (' + major + ')',
    report: () => 'verification/own-reports-ui.json',
    requiredStep: 'Real HTTP and SQL, complete downloads, mobile and revocation'}),
]);
export const PROOF_SOURCE_FILES = Object.freeze([
  'package.json', 'package-lock.json', '.nvmrc', '.vercelignore', 'vercel.json',
  'scripts/build-friendly.mjs', 'scripts/build-release-identity.mjs',
  'scripts/lib/release-candidate-admission.mjs', 'scripts/write-release-candidate-proof.mjs',
  'scripts/verify-release-candidate.mjs', 'scripts/verify-remote-release-base.mjs',
  ...new Set(OPTIONAL_SOURCE_SKIPS.map(value => value.file)),
  ...CANDIDATE_WORKFLOWS.map(value => value.file),
]);
const admitted = new WeakSet();
const validSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const validDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
export const digest = value => createHash('sha256').update(value).digest('hex');
export const fail = code => { throw Object.assign(new Error(code), {code}); };
const need = (condition, code) => { if (!condition) fail(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bytes = value => { need(Buffer.isBuffer(value) || value instanceof Uint8Array, 'CANDIDATE_BYTES_REQUIRED'); return Buffer.from(value); };
const json = value => { try { return JSON.parse(bytes(value).toString('utf8')); } catch (error) { if (error.code) throw error; fail('CANDIDATE_JSON_INVALID'); } };
export const artifactName = (key, major, runId, attempt) => 'release-candidate-' + key + '-pg' + major + '-' + runId + '-' + attempt;
export const fileProof = (path, value) => ({path, bytes: bytes(value).length, sha256: digest(value)});

export function fullSuiteSummary(log) {
  const result = {};
  const plain = String(log).replace(/\x1b\[[0-9;]*m/g, '');
  for (const match of plain.matchAll(/^(?:#|ℹ)\s+(tests|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$/gm)) result[match[1]] = Number(match[2]);
  need(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].every(key => Number.isSafeInteger(result[key]) && result[key] >= 0) && result.tests > 0, 'CANDIDATE_FULL_SUITE_RECEIPT_MISSING');
  return result;
}

export function fullSuiteSkipInventory(log, summary, sourceFiles) {
  const plain = String(log).replace(/\x1b\[[0-9;]*m/g, '');
  const observed = [];
  for (const line of plain.split(/\r?\n/)) {
    const tap = /^\s*ok \d+ - (.*?)\s+# SKIP(?:\s+(.*))?$/.exec(line);
    const spec = /^\s*﹣ (.*?)(?: \([\d.]+m?s\))?(?: # SKIP(?:\s+(.*))?)?$/.exec(line);
    if (tap || spec) observed.push({name: (tap || spec)[1], runtimeReason: (tap || spec)[2] || null});
  }
  need(observed.length === summary.skipped && new Set(observed.map(value => value.name)).size === observed.length, 'CANDIDATE_SKIP_INVENTORY_UNVERIFIED');
  return observed.map(value => {
    const known = OPTIONAL_SOURCE_SKIPS.find(item => item.name === value.name);
    need(known, 'CANDIDATE_UNKNOWN_TEST_SKIP');
    need(Object.hasOwn(sourceFiles, known.file) && digest(bytes(sourceFiles[known.file])) === known.sourceSha256, 'CANDIDATE_SKIP_SOURCE_CHANGED');
    return {...known, runtimeReason: value.runtimeReason, reasonProvenance: 'unchanged-source-condition'};
  });
}

function checkFiles(manifest, files, required, code) {
  need(Array.isArray(manifest) && manifest.length === required.length && new Set(manifest.map(entry => entry.path)).size === required.length, code);
  for (const name of required) {
    const entry = manifest.find(value => value.path === name);
    need(entry && Object.hasOwn(files, name), code);
    const value = bytes(files[name]);
    need(entry.bytes === value.length && validDigest(entry.sha256) && entry.sha256 === digest(value), code);
  }
}

function checkReport(key, report, major, sha) {
  need(object(report) && report.passed === true && report.syntheticSchemaRemoved === true && report.cleanupError === undefined, 'CANDIDATE_REPORT_FAILED');
  if (key === 'capacity') {
    need(report.major === major && report.sourceCommit === sha && report.sourceAfter?.passed === true &&
      report.priorDatabasePreserved === true && report.actualSql === true &&
      report.productionWrites === 0 && report.municipalAcceptance === false, 'CANDIDATE_CAPACITY_REPORT_INVALID');
  } else {
    need(report.serverMajor === major && report.synthetic === true && report.productUiVerified === true, 'CANDIDATE_REPORT_IDENTITY_INVALID');
    if (key === 'calculation') need(report.realHttpAndSql === true && report.builtPackage === true && report.sourceReviewVerified === true && report.productiveInstallation === false, 'CANDIDATE_CALCULATION_REPORT_INVALID');
    else need(report.actualHttpHandler === true && report.actualSqlRevocation === true && report.productiveBusinessOperations === 0, 'CANDIDATE_REPORT_SCOPE_INVALID');
    if (key === 'receipts') need(report.independentReview === true && report.ownAgentIsolation === true && report.sourceReopenDuringPdf === true, 'CANDIDATE_RECEIPT_REPORT_INVALID');
    if (key === 'reports') need(report.reportBusinessPosts === 0 && report.legajoPostGenerationInvalidation === true && report.statisticsPostGenerationInvalidation === true && report.statementPendingExportInvalidation === true, 'CANDIDATE_CLOSED_REPORT_INVALID');
  }
}

function successfulRun(run, workflow, sha) {
  need(object(run) && positive(run.id) && positive(run.run_attempt) && positive(run.run_number), 'CANDIDATE_RUN_INVALID');
  need(run.repository?.full_name === RELEASE_REPOSITORY && run.head_repository?.full_name === RELEASE_REPOSITORY, 'CANDIDATE_RUN_REPOSITORY_CHANGED');
  need(run.head_sha === sha && run.path?.split('@')[0] === workflow.file && ['push', 'workflow_dispatch'].includes(run.event), 'CANDIDATE_RUN_SOURCE_CHANGED');
  need(run.status === 'completed' && run.conclusion === 'success', 'CANDIDATE_RUN_NOT_SUCCESSFUL');
}

function sameRun(expected, observed, workflow, sha) {
  successfulRun(observed, workflow, sha);
  need(observed.id === expected.id && observed.run_attempt === expected.run_attempt && observed.run_number === expected.run_number, 'CANDIDATE_RUN_ATTEMPT_CHANGED');
}

function checkDeployment(deployment, sha, expectedId) {
  need(object(deployment) && /^dpl_[A-Za-z0-9]+$/.test(expectedId || '') && deployment.id === expectedId, 'CANDIDATE_DEPLOYMENT_CHANGED');
  need(deployment.projectId === RELEASE_PROJECT && deployment.teamId === RELEASE_TEAM, 'CANDIDATE_DEPLOYMENT_PROJECT_CHANGED');
  need(deployment.target === 'production' && deployment.readyState === 'READY', 'CANDIDATE_STAGED_PRODUCTION_REQUIRED');
  const observed = [deployment.gitSource?.sha, deployment.meta?.githubCommitSha].filter(Boolean);
  need(observed.length > 0 && observed.every(value => value === sha), 'CANDIDATE_DEPLOYMENT_SOURCE_CHANGED');
  need(typeof deployment.url === 'string' && /^[a-z0-9-]+\.vercel\.app$/.test(deployment.url), 'CANDIDATE_DEPLOYMENT_URL_INVALID');
  need(Array.isArray(deployment.alias) && deployment.alias.length === 0, 'CANDIDATE_DEPLOYMENT_ALREADY_ROUTED');
}

export function verifyCandidateAdmission(evidence, {expectedSha, expectedDeploymentId} = {}) {
  need(validSha(expectedSha) && object(evidence), 'CANDIDATE_ARGUMENT_INVALID');
  const {source, workflows, deployment, deployedFiles} = evidence;
  need(source?.sha === expectedSha && validSha(source.tree) && source.repository === RELEASE_REPOSITORY && object(source.files), 'CANDIDATE_SOURCE_INVALID');
  const pkg = json(source.files['package.json']);
  need(pkg.scripts?.test === FULL_TEST_COMMAND && pkg.scripts?.build === FULL_BUILD_COMMAND, 'CANDIDATE_FULL_SUITE_COMMAND_CHANGED');
  for (const [file, approved] of Object.entries(CANDIDATE_WORKFLOW_SHA256)) {
    need(Object.hasOwn(source.files, file) && digest(bytes(source.files[file])) === approved, 'CANDIDATE_WORKFLOW_POLICY_CHANGED');
  }
  need(Array.isArray(workflows) && workflows.length === CANDIDATE_WORKFLOWS.length && new Set(workflows.map(value => value.key)).size === CANDIDATE_WORKFLOWS.length, 'CANDIDATE_WORKFLOW_MISSING');
  checkDeployment(deployment, expectedSha, expectedDeploymentId);
  need(object(deployedFiles), 'CANDIDATE_DEPLOYED_FILES_MISSING');
  const proofs = [];
  let expectedBuild;
  for (const policy of CANDIDATE_WORKFLOWS) {
    const record = workflows.find(value => value.key === policy.key);
    need(record, 'CANDIDATE_WORKFLOW_MISSING');
    successfulRun(record.run, policy, expectedSha);
    sameRun(record.run, record.latestRun, policy, expectedSha);
    sameRun(record.run, record.finalRun, policy, expectedSha);
    need(Array.isArray(record.jobs) && record.jobs.length === 2 && Array.isArray(record.artifacts) && record.artifacts.length === 2, 'CANDIDATE_PG_MATRIX_INCOMPLETE');
    for (const major of [17, 18]) {
      const job = record.jobs.find(value => value.name === policy.jobName(major));
      need(job && positive(job.id) && job.run_id === record.run.id && job.status === 'completed' && job.conclusion === 'success', 'CANDIDATE_JOB_NOT_SUCCESSFUL');
      need(Array.isArray(job.steps) && job.steps.length > 0 && job.steps.every(step => step.status === 'completed' && step.conclusion === 'success'), 'CANDIDATE_STEP_NOT_SUCCESSFUL');
      const critical = [EVIDENCE_STEP, policy.requiredStep, ...(policy.fullSuite ? [FULL_SUITE_STEP] : [])];
      need(critical.every(name => job.steps.some(step => policy.key === 'receipts' && name === policy.requiredStep ? step.name.startsWith(name + major + ' ') : step.name === name)), 'CANDIDATE_REQUIRED_STEP_MISSING');
      const name = artifactName(policy.key, major, record.run.id, record.run.run_attempt);
      const artifact = record.artifacts.find(value => value.metadata?.name === name);
      need(artifact && positive(artifact.metadata.id) && artifact.metadata.expired === false && positive(artifact.metadata.size_in_bytes), 'CANDIDATE_ARTIFACT_MISSING');
      need(artifact.metadata.workflow_run?.id === record.run.id && artifact.metadata.workflow_run?.head_sha === expectedSha, 'CANDIDATE_ARTIFACT_RUN_CHANGED');
      need(validDigest(artifact.archiveSha256) && artifact.metadata.digest === 'sha256:' + artifact.archiveSha256, 'CANDIDATE_ARTIFACT_DIGEST_CHANGED');
      need(object(artifact.files), 'CANDIDATE_ARTIFACT_FILES_MISSING');
      const proof = json(artifact.files['proof.json']);
      need(proof.version === PROOF_VERSION && proof.repository === RELEASE_REPOSITORY && proof.workflow === policy.file && proof.job === policy.job && proof.major === major, 'CANDIDATE_PROOF_IDENTITY_CHANGED');
      need(proof.runId === record.run.id && proof.runAttempt === record.run.run_attempt && proof.event === record.run.event, 'CANDIDATE_PROOF_ATTEMPT_CHANGED');
      need(proof.checkoutSha === expectedSha && proof.eventSha === expectedSha && proof.treeSha === source.tree && proof.trackedSourceClean === true, 'CANDIDATE_CHECKOUT_CHANGED');
      checkFiles(proof.sourceFiles, source.files, PROOF_SOURCE_FILES, 'CANDIDATE_SOURCE_BYTES_CHANGED');
      const requiredFiles = ['report.json', 'release-info.json', 'build-manifest.json', ...(policy.fullSuite ? ['full-suite.log'] : [])];
      need(Object.keys(artifact.files).sort().join('|') === ['proof.json', ...requiredFiles].sort().join('|'), 'CANDIDATE_ARTIFACT_FILES_CHANGED');
      checkFiles(proof.files, artifact.files, requiredFiles, 'CANDIDATE_MANIFEST_DIGEST_CHANGED');
      checkReport(policy.key, json(artifact.files['report.json']), major, expectedSha);
      const release = json(artifact.files['release-info.json']);
      need(release.version === 'municontrol-release.v1' && release.commitSha === expectedSha && release.sourceState === 'committed' && validDigest(release.adminUiSha256), 'CANDIDATE_BUILD_IDENTITY_CHANGED');
      need(digest(artifact.files['release-info.json']) === digest(bytes(deployedFiles['release-info.json'])), 'CANDIDATE_SERVED_IDENTITY_CHANGED');
      if (policy.fullSuite) {
        const log = bytes(artifact.files['full-suite.log']).toString('utf8'), summary = fullSuiteSummary(log);
        need(summary.pass + summary.skipped === summary.tests && ['fail', 'cancelled', 'todo'].every(key => summary[key] === 0), 'CANDIDATE_FULL_SUITE_INCOMPLETE');
        const inventory = fullSuiteSkipInventory(log, summary, source.files);
        need(JSON.stringify(proof.fullSuite) === JSON.stringify(summary), 'CANDIDATE_FULL_SUITE_RECEIPT_CHANGED');
        need(JSON.stringify(proof.optionalSkips) === JSON.stringify(inventory), 'CANDIDATE_SKIP_INVENTORY_UNVERIFIED');
      } else need(proof.fullSuite === null, 'CANDIDATE_SUITE_SCOPE_CHANGED');
      const manifest = json(artifact.files['build-manifest.json']);
      need(manifest.version === 'municontrol-m7-static-build.v1' && manifest.commitSha === expectedSha && manifest.treeSha === source.tree, 'CANDIDATE_BUILD_MANIFEST_CHANGED');
      checkFiles(manifest.files, deployedFiles, M7_RELEASE_FILES, 'CANDIDATE_DEPLOYED_BYTES_CHANGED');
      const identity = JSON.stringify(manifest.files);
      if (expectedBuild !== undefined) need(identity === expectedBuild, 'CANDIDATE_BUILDS_DISAGREE');
      expectedBuild = identity;
      proofs.push(Object.freeze({workflow: policy.file, major, runId: record.run.id, runAttempt: record.run.run_attempt, jobId: job.id,
        artifactId: artifact.metadata.id, artifactSha256: artifact.archiveSha256, proofSha256: digest(artifact.files['proof.json']),
        optionalSkips: Object.freeze((proof.optionalSkips || []).map(value => Object.freeze({...value})))}));
    }
  }
  const result = {
    version: CANDIDATE_VERSION, admitted: true, scope: 'm7-technical-publication',
    repository: RELEASE_REPOSITORY, candidateSha: expectedSha, treeSha: source.tree,
    projectId: RELEASE_PROJECT, deploymentId: expectedDeploymentId, deploymentTarget: 'production',
    proofCount: proofs.length, proofs, staticFiles: [...M7_RELEASE_FILES],
    staticManifestSha256: digest(expectedBuild),
    noeliaReady: false, fullGoalComplete: false, normalAuthenticationVerified: false,
    productionSqlVerified: false, externalNominalDatasetsVerified: false,
    serverlessArtifactBytesVerified: false, productionEnvironmentVerified: false,
    platformEnforcementVerified: false, promotionPerformed: false,
  };
  result.admissionSha256 = digest(JSON.stringify(result));
  Object.freeze(result.proofs); Object.freeze(result.staticFiles); Object.freeze(result);
  admitted.add(result);
  return result;
}

export function requireCandidateAdmission(value, sha) {
  need(value && admitted.has(value) && value.admitted === true && value.candidateSha === sha, 'REMOTE_BASE_CANDIDATE_ADMISSION_REQUIRED');
  return value;
}
