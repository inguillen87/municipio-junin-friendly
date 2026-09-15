import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

/** Compare the build that will be served, including clean routes and React bundles. */
export function publishedBuildVerification({ origin, release = 'manual', root = 'public', fetchImpl = globalThis.fetch } = {}) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.origin !== origin) throw Error('PUBLISHED_ORIGIN_INVALID');
  const directory = path.resolve(root);
  // Read the route contract from this exact build; no fallback to source files.
  const context = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(path.join(directory, 'assets/app-routes.js'), 'utf8'), context);
  if (typeof context.MuniControlRoutes?.resolve !== 'function') throw Error('PUBLISHED_ROUTES_MISSING');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  function localFile(file) {
    if (typeof file !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(file) || file.startsWith('/') || file.split('/').some(part => !part || part === '.' || part === '..')) throw Error('PUBLISHED_FILE_INVALID');
    return path.join(directory, file);
  }
  function url(file) {
    localFile(file);
    let pathname = '/' + file;
    if (file.endsWith('.html')) {
      const route = context.MuniControlRoutes.resolve(pathname, base.href);
      if (!route || route.file !== file || !route.path.startsWith('/')) throw Error('PUBLISHED_ROUTE_MISSING');
      pathname = route.path;
    }
    const target = new URL(pathname, base);
    if (target.origin !== base.origin) throw Error('PUBLISHED_ROUTE_ORIGIN_CHANGED');
    target.searchParams.set('release', release);
    return target;
  }
  return Object.freeze({
    url,
    expectedHashes(files) { return Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(localFile(file)))])); },
    async fetchFile(file, timeoutMs = 12000) {
      const target = url(file);
      const response = await fetchImpl(target, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      if (response.url !== target.href) throw Error('PUBLISHED_RESPONSE_URL_CHANGED');
      return response;
    },
  });
}
