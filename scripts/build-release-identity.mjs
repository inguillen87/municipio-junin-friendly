import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { RELEASE_VERSION, verifyRelease } from '../assets/release-status-model.js';
export const RELEASE_MARKER = '<!-- MC_RELEASE_ID -->';
export const ADMIN_RELEASE_FILES = Object.freeze([
  'administracion-plataforma.html', 'assets/release-status-model.js',
  'assets/release-status-panel.js', 'assets/release-status.css', 'assets/app-routes.js'
]);
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const fail = () => { throw new Error('RELEASE_SOURCE_NOT_VERIFIED'); };
export function resolveReleaseSource({ env = {}, head = null, dirty = null } = {}) {
  if (dirty !== null && typeof dirty !== 'boolean') fail();
  const supplied = [env.VERCEL_GIT_COMMIT_SHA, env.GITHUB_SHA].filter(Boolean);
  if (supplied.some(value => !sha(value)) || new Set(supplied).size > 1) fail();
  if (head !== null && !sha(head)) fail();
  if (head && supplied[0] && supplied[0] !== head) fail();
  const commit = supplied[0] || head;
  if (env.VERCEL_ENV === 'production' && (!commit || dirty === true)) fail();
  if (dirty === true) return { commitSha: null, sourceState: 'modified' };
  if (!commit || (!supplied.length && dirty === null)) return { commitSha: null, sourceState: 'unknown' };
  return { commitSha: commit, sourceState: 'committed' };
}
export function stripReleaseStamp(text) {
  const pattern = /<!-- MC_RELEASE_ID -->(?:<meta name="municontrol-release" content='[^']*'>)?/g;
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) throw new Error('RELEASE_STAMP_REQUIRED');
  return text.replace(pattern, RELEASE_MARKER);
}
export function buildReleaseIdentity(root, output, { env = process.env } = {}) {
  const git = args => spawnSync('git', args, {
    cwd: root, encoding: 'utf8', timeout: 10000, windowsHide: true, maxBuffer: 1024 * 1024
  });
  const revision = git(['rev-parse', 'HEAD']);
  const state = git(['status', '--porcelain', '--untracked-files=normal']);
  const source = resolveReleaseSource({ env,
    head: revision.status === 0 ? revision.stdout.trim() : null,
    dirty: state.status === 0 ? Boolean(state.stdout.trim()) : null
  });
  const digest = createHash('sha256');
  let template;
  for (const name of ADMIN_RELEASE_FILES) {
    const file = path.join(output, name);
    let content = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
    if (name === 'administracion-plataforma.html') {
      content = stripReleaseStamp(content); template = content;
    }
    digest.update(name + '\0').update(content).update('\0');
  }
  const identity = verifyRelease({ version: RELEASE_VERSION, ...source,
    adminUiSha256: digest.digest('hex') });
  const json = JSON.stringify(identity);
  fs.writeFileSync(path.join(output, 'release-info.json'), json + '\n');
  fs.writeFileSync(path.join(output, 'administracion-plataforma.html'),
    template.replace(RELEASE_MARKER, RELEASE_MARKER + '<meta name="municontrol-release" content=\'' + json + '\'>'));
  return identity;
}
