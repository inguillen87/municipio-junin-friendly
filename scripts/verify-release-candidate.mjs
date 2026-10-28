// GET-only collector. It never creates a deployment, changes an alias or opens SQL.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {
  RELEASE_REPOSITORY, RELEASE_PROJECT, RELEASE_TEAM, CANDIDATE_WORKFLOWS,
  PROOF_SOURCE_FILES, M7_RELEASE_FILES, artifactName, digest, fail, verifyCandidateAdmission,
} from './lib/release-candidate-admission.mjs';

const repo = '/repos/' + RELEASE_REPOSITORY;
const requireValue = (condition, code) => { if (!condition) fail(code); };
const sameSourceEvent = (run, sha) => run.head_sha === sha && ['push', 'workflow_dispatch'].includes(run.event);

export async function githubPages(getGithub, endpoint, field) {
  const rows = [];
  for (let page = 1; page <= 100; page++) {
    const response = await getGithub(endpoint + (endpoint.includes('?') ? '&' : '?') + 'per_page=100&page=' + page);
    requireValue(Array.isArray(response?.[field]), 'CANDIDATE_GITHUB_LIST_INVALID');
    rows.push(...response[field]);
    if (response[field].length < 100) return rows;
  }
  fail('CANDIDATE_GITHUB_INVENTORY_TOO_LARGE');
}

export async function collectCandidateAdmission({candidateSha, deploymentId, getGithub, getArtifact, getDeployment, getDeploymentFile}) {
  requireValue(/^[a-f0-9]{40}$/.test(candidateSha || '') && /^dpl_[A-Za-z0-9]+$/.test(deploymentId || ''), 'CANDIDATE_ARGUMENT_INVALID');
  requireValue([getGithub, getArtifact, getDeployment, getDeploymentFile].every(value => typeof value === 'function'), 'CANDIDATE_READERS_REQUIRED');
  const deployment = await getDeployment(deploymentId);
  // Refuse preview before reading its URLs; READY alone is never admission.
  requireValue(deployment?.id === deploymentId && deployment.projectId === RELEASE_PROJECT && deployment.teamId === RELEASE_TEAM &&
    deployment.target === 'production' && deployment.readyState === 'READY', 'CANDIDATE_STAGED_PRODUCTION_REQUIRED');
  const commit = await getGithub(repo + '/git/commits/' + candidateSha);
  requireValue(commit?.sha === candidateSha && /^[a-f0-9]{40}$/.test(commit.tree?.sha || ''), 'CANDIDATE_COMMIT_NOT_VERIFIED');
  const source = {repository: RELEASE_REPOSITORY, sha: candidateSha, tree: commit.tree.sha, files: {}};
  for (const name of PROOF_SOURCE_FILES) {
    const file = await getGithub(repo + '/contents/' + name + '?ref=' + candidateSha);
    requireValue(file?.type === 'file' && file.path === name && file.encoding === 'base64' && typeof file.content === 'string', 'CANDIDATE_SOURCE_FILE_UNAVAILABLE');
    const content = Buffer.from(file.content.replace(/\s/g, ''), 'base64');
    requireValue(content.length === file.size, 'CANDIDATE_SOURCE_FILE_TRUNCATED');
    source.files[name] = content;
  }
  const latest = async policy => {
    const runs = (await githubPages(getGithub, repo + '/actions/workflows/' + path.basename(policy.file) + '/runs?head_sha=' + candidateSha, 'workflow_runs'))
      .filter(run => sameSourceEvent(run, candidateSha));
    requireValue(runs.length > 0, 'CANDIDATE_WORKFLOW_MISSING');
    requireValue(runs.every(run => Number.isSafeInteger(run.run_number) && Number.isSafeInteger(run.run_attempt)), 'CANDIDATE_RUN_INVALID');
    runs.sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt || b.id - a.id);
    return runs[0];
  };
  const workflows = [];
  for (const policy of CANDIDATE_WORKFLOWS) {
    const selected = await latest(policy), run = await getGithub(repo + '/actions/runs/' + selected.id);
    requireValue(run?.id === selected.id && run.run_attempt === selected.run_attempt && run.status === 'completed' && run.conclusion === 'success', 'CANDIDATE_RUN_NOT_SUCCESSFUL');
    const jobs = await githubPages(getGithub, repo + '/actions/runs/' + run.id + '/attempts/' + run.run_attempt + '/jobs', 'jobs');
    const available = await githubPages(getGithub, repo + '/actions/runs/' + run.id + '/artifacts', 'artifacts');
    const artifacts = [];
    for (const major of [17, 18]) {
      const name = artifactName(policy.key, major, run.id, run.run_attempt), matches = available.filter(value => value.name === name);
      requireValue(matches.length === 1 && matches[0].expired === false, 'CANDIDATE_ARTIFACT_MISSING');
      const downloaded = await getArtifact(matches[0]);
      artifacts.push({metadata: matches[0], ...downloaded});
    }
    workflows.push({key: policy.key, run, jobs, artifacts});
  }
  const deployedFiles = {};
  for (const name of M7_RELEASE_FILES) deployedFiles[name] = Buffer.from(await getDeploymentFile(deployment, name));
  // Re-read every selection AFTER all downloads. A rerun or newer run cannot
  // borrow the older success while its replacement is pending or failed.
  for (let index = 0; index < workflows.length; index++) {
    const record = workflows[index];
    record.finalRun = await getGithub(repo + '/actions/runs/' + record.run.id);
    record.latestRun = await latest(CANDIDATE_WORKFLOWS[index]);
  }
  const finalDeployment = await getDeployment(deploymentId);
  requireValue(JSON.stringify(finalDeployment) === JSON.stringify(deployment), 'CANDIDATE_DEPLOYMENT_CHANGED_DURING_READ');
  const evidence = {source, workflows, deployment, deployedFiles};
  return {admission: verifyCandidateAdmission(evidence, {expectedSha: candidateSha, expectedDeploymentId: deploymentId}), evidence};
}

export async function decodeCandidateArtifact(archive, metadata, unzip) {
  const data = Buffer.from(archive);
  requireValue(data.length > 0 && data.length <= 64 * 1024 * 1024, 'CANDIDATE_ARTIFACT_SIZE_INVALID');
  const archiveSha256 = digest(data);
  requireValue(metadata.digest === 'sha256:' + archiveSha256, 'CANDIDATE_ARTIFACT_DIGEST_CHANGED');
  const allowed = new Set(['proof.json', 'report.json', 'release-info.json', 'build-manifest.json', 'full-suite.log']);
  if (!unzip) ({unzipSync: unzip} = await import('fflate'));
  let total = 0, entries = 0;
  const files = unzip(data, {filter: entry => {
    requireValue(allowed.has(entry.name) && ++entries <= 5 && Number.isSafeInteger(entry.originalSize) && entry.originalSize >= 0, 'CANDIDATE_ARCHIVE_ENTRY_INVALID');
    total += entry.originalSize;
    requireValue(total <= 512 * 1024 * 1024, 'CANDIDATE_ARCHIVE_TOO_LARGE');
    return true;
  }});
  requireValue(files && Object.keys(files).length === entries, 'CANDIDATE_ARCHIVE_ENTRIES_CHANGED');
  return {archiveSha256, files: Object.fromEntries(Object.entries(files).map(([name, value]) => [name, Buffer.from(value)]))};
}

export function candidateHttpReaders({env = process.env, fetchImpl = globalThis.fetch} = {}) {
  // No credential is created, requested, printed or assumed to exist.
  requireValue(typeof env.VERCEL_TOKEN === 'string' && env.VERCEL_TOKEN.trim().length > 0, 'CANDIDATE_VERCEL_READ_CREDENTIAL_UNAVAILABLE');
  const request = async (url, headers = {}, maxBytes = 64 * 1024 * 1024) => {
    const response = await fetchImpl(url, {method: 'GET', headers, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(30000)});
    requireValue(response.status === 200, 'CANDIDATE_REMOTE_READ_FAILED');
    const content = Buffer.from(await response.arrayBuffer());
    requireValue(content.length <= maxBytes, 'CANDIDATE_REMOTE_RESPONSE_TOO_LARGE');
    return content;
  };
  const githubHeaders = {Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
    ...(env.GITHUB_TOKEN ? {Authorization: 'Bearer ' + env.GITHUB_TOKEN} : {})};
  const getGithub = async endpoint => {
    requireValue(endpoint.startsWith(repo + '/'), 'CANDIDATE_GITHUB_ENDPOINT_INVALID');
    return JSON.parse((await request('https://api.github.com' + endpoint, githubHeaders, 8 * 1024 * 1024)).toString('utf8'));
  };
  const getArtifact = async metadata => {
    requireValue(Number.isSafeInteger(metadata.id) && metadata.id > 0, 'CANDIDATE_ARTIFACT_MISSING');
    const endpoint = 'https://api.github.com' + repo + '/actions/artifacts/' + metadata.id + '/zip';
    const response = await fetchImpl(endpoint, {method: 'GET', headers: githubHeaders, redirect: 'manual', signal: AbortSignal.timeout(30000)});
    requireValue(response.status === 302, 'CANDIDATE_ARTIFACT_DOWNLOAD_UNAVAILABLE');
    const location = new URL(response.headers.get('location'));
    requireValue(location.protocol === 'https:' && !location.username && !location.password &&
      (location.hostname.endsWith('.blob.core.windows.net') || location.hostname.endsWith('.actions.githubusercontent.com') || location.hostname === 'objects.githubusercontent.com'), 'CANDIDATE_ARTIFACT_REDIRECT_INVALID');
    // Never forward the GitHub credential to the signed storage URL.
    return decodeCandidateArtifact(await request(location.href), metadata);
  };
  const getDeployment = async id => {
    requireValue(/^dpl_[A-Za-z0-9]+$/.test(id), 'CANDIDATE_DEPLOYMENT_CHANGED');
    const raw = JSON.parse((await request('https://api.vercel.com/v13/deployments/' + id + '?teamId=' + RELEASE_TEAM,
      {Authorization: 'Bearer ' + env.VERCEL_TOKEN}, 4 * 1024 * 1024)).toString('utf8'));
    // Normalize only fields actually returned by Vercel; query arguments are
    // never used to invent an observed project, environment or source identity.
    return {id: raw.id, projectId: raw.projectId ?? raw.project?.id, teamId: raw.teamId ?? raw.ownerId ?? raw.team?.id,
      target: raw.target, readyState: raw.readyState, url: raw.url, alias: raw.alias,
      gitSource: raw.gitSource ? {sha: raw.gitSource.sha} : null,
      meta: raw.meta ? {githubCommitSha: raw.meta.githubCommitSha} : null};
  };
  const getDeploymentFile = async (deployment, name) => {
    requireValue(M7_RELEASE_FILES.includes(name) && /^[a-z0-9-]+\.vercel\.app$/.test(deployment.url || ''), 'CANDIDATE_DEPLOYMENT_URL_INVALID');
    const route = {'nomina-control.html': '/nomina', 'centro-acciones.html': '/centro-acciones'}[name] || '/' + name;
    // Anonymous static GET only. A protection wall or redirect fails closed;
    // no bypass token, login, session or business request is synthesized.
    return request('https://' + deployment.url + route + '?release=' + deployment.id, {}, 16 * 1024 * 1024);
  };
  return {getGithub, getArtifact, getDeployment, getDeploymentFile};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const {values} = parseArgs({options: {sha: {type: 'string'}, deployment: {type: 'string'}, output: {type: 'string'}}, strict: true});
    const {admission} = await collectCandidateAdmission({candidateSha: values.sha, deploymentId: values.deployment, ...candidateHttpReaders()});
    if (values.output) fs.writeFileSync(values.output, JSON.stringify(admission, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify(admission, null, 2));
  } catch (error) {
    console.error(/^CANDIDATE_[A-Z_]+$/.test(error?.code || '') ? error.code : 'CANDIDATE_COLLECTION_FAILED');
    process.exitCode = 1;
  }
}
