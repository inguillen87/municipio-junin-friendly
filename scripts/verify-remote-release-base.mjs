// Control de lectura: la referencia proviene de GitHub y del alias real de producción.
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const RELEASE_REPOSITORY = 'inguillen87/municipio-junin-friendly';
export const RELEASE_TEAM = 'team_BV1xuY6BnEzGanfok8GAyjZv';
export const RELEASE_DOMAIN = 'municipio-junin-friendly.vercel.app';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
export function verifyRemoteBaseEvidence({ expectedBase, phase, head, clean, ancestor, branch, status, deployment }) {
  if (!sha(expectedBase) || !sha(head) || !['start', 'publish'].includes(phase)) fail('REMOTE_BASE_ARGUMENT_INVALID');
  if (branch?.name !== 'master' || branch.commit?.sha !== expectedBase) fail('REMOTE_BASE_GITHUB_ADVANCED');
  if (!clean) fail('REMOTE_BASE_UNCOMMITTED_WORK');
  if (phase === 'start' ? head !== expectedBase : !ancestor) fail('REMOTE_BASE_WORKTREE_DIVERGED');
  if (status?.sha !== expectedBase || !Array.isArray(status.statuses)) fail('REMOTE_BASE_STATUS_UNVERIFIED');
  const vercel = status.statuses.find(item => item.context === 'Vercel');
  if (!vercel || vercel.state !== 'success') fail('REMOTE_BASE_DEPLOYMENT_NOT_READY');
  let url; try { url = new URL(vercel.target_url); } catch { fail('REMOTE_BASE_STATUS_UNVERIFIED'); }
  const prefix = '/marcelos-projects-c26aa499/municipio-junin-friendly/';
  const id = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '';
  if (url.origin !== 'https://vercel.com' || !/^[A-Za-z0-9]{20,40}$/.test(id) || url.search || url.hash) fail('REMOTE_BASE_STATUS_UNVERIFIED');
  if (deployment?.id !== 'dpl_' + id || deployment.target !== 'production'
      || deployment.readyState !== 'READY' || !deployment.aliases?.includes(RELEASE_DOMAIN)) {
    fail('REMOTE_BASE_PRODUCTION_DIFFERS');
  }
  return { version: 'municontrol-remote-base.v1', repository: RELEASE_REPOSITORY, phase,
    expectedBase, head, remoteHead: branch.commit.sha, deploymentId: deployment.id,
    domain: RELEASE_DOMAIN, clean: true, aligned: true, databaseWrites: 0 };
}
export function readRemoteBase({ expectedBase, phase = 'start' } = {}) {
  if (!sha(expectedBase) || !['start', 'publish'].includes(phase)) fail('REMOTE_BASE_ARGUMENT_INVALID');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8',
      timeout: 30000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    if (result.status !== 0) fail('REMOTE_BASE_COMMAND_FAILED');
    return result.stdout.trim();
  };
  const parse = text => { try { return JSON.parse(text); } catch { fail('REMOTE_BASE_RESPONSE_INVALID'); } };
  const branch = parse(run('gh', ['api', `repos/${RELEASE_REPOSITORY}/branches/master`]));
  const status = parse(run('gh', ['api', `repos/${RELEASE_REPOSITORY}/commits/${expectedBase}/status`]));
  const inspectArgs = ['inspect', RELEASE_DOMAIN, '--scope', RELEASE_TEAM, '--json'];
  const deployment = parse(process.platform === 'win32'
    ? run('cmd.exe', ['/d', '/s', '/c', 'vercel.cmd ' + inspectArgs.join(' ')])
    : run('vercel', inspectArgs));
  const head = run('git', ['rev-parse', 'HEAD']);
  const clean = run('git', ['status', '--porcelain', '--untracked-files=normal']) === '';
  const ancestor = run('git', ['merge-base', expectedBase, head]) === expectedBase;
  return { ...verifyRemoteBaseEvidence({ expectedBase, phase, head, clean, ancestor, branch, status, deployment }),
    checkedAt: new Date().toISOString() };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { base: { type: 'string' }, phase: { type: 'string', default: 'start' } }, strict: true });
    console.log(JSON.stringify(readRemoteBase({ expectedBase: values.base, phase: values.phase }), null, 2));
  } catch (error) { console.error(/^REMOTE_BASE_[A-Z_]+$/.test(error?.code || '') ? error.code : 'REMOTE_BASE_FAILED'); process.exitCode = 1; }
}
