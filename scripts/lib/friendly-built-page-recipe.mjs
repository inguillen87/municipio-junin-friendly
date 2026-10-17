// Pure reconstruction of the source-owned HTML loop in build-friendly.mjs.
// Only its page recipe, metadata helpers and route registry run in the VM.
// The builder itself is never imported and none of its I/O is executed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validPath = file => typeof file === 'string' && /^[a-zA-Z0-9_./-]+$/.test(file)
  && !file.startsWith('/') && file.split('/').every(part => part && part !== '.' && part !== '..');
const unique = (text, marker, code) => { assert.equal(text.split(marker).length, 2, code); return text.indexOf(marker); };

export function createFriendlyBuiltPageRecipe({ readBytes }) {
  assert.equal(typeof readBytes, 'function');
  const sources = new Map();
  function read(file) {
    assert.ok(validPath(file), 'FRIENDLY_RECIPE_SOURCE_PATH_INVALID');
    if (!sources.has(file)) {
      const bytes = readBytes(file);assert.ok(Buffer.isBuffer(bytes), 'FRIENDLY_RECIPE_SOURCE_BYTES_REQUIRED');
      sources.set(file, Buffer.from(bytes));
    }
    return sources.get(file);
  }
  const build = read('scripts/build-friendly.mjs').toString('utf8');
  const metadata = read('scripts/apply-friendly-social-metadata.mjs').toString('utf8');
  const routes = read('assets/app-routes.js').toString('utf8');
  assert.doesNotMatch(metadata, /^import\b/m, 'FRIENDLY_RECIPE_METADATA_IMPORT_CHANGED');
  const routeStart = unique(build, 'function applyCleanRouteLinks(', 'FRIENDLY_RECIPE_ROUTE_CHANGED');
  const start = unique(build, '  const branded =', 'FRIENDLY_RECIPE_HTML_CHANGED');
  const end = unique(build, '\n}\n\nawait buildLegalRegistry', 'FRIENDLY_RECIPE_HTML_BOUNDARY_CHANGED');
  assert.ok(start > 0 && end > start && routeStart > end, 'FRIENDLY_RECIPE_ORDER_CHANGED');
  const rawBody = build.slice(start, end);
  assert.match(rawBody, /fs\.writeFileSync\(destination, (.+)\);$/, 'FRIENDLY_RECIPE_OUTPUT_CHANGED');
  const body = rawBody.replace(/fs\.writeFileSync\(destination, (.+)\);$/, 'return $1;');
  assert.ok(!body.includes('fs.') && body.includes('return routed.replaceAll'), 'FRIENDLY_RECIPE_IO_UNSUPPORTED');
  const pwaBlocks = [...build.matchAll(/const pwaFiles = \[([\s\S]*?)\n\];/g)];
  assert.equal(pwaBlocks.length, 1, 'FRIENDLY_RECIPE_PWA_CHANGED');
  const icons = [...pwaBlocks[0][1].matchAll(/'(assets\/pwa\/[^']+)'/g)].map(match => match[1]);
  assert.equal(icons.length, 5, 'FRIENDLY_RECIPE_ICONS_CHANGED');assert.equal(new Set(icons).size, 5, 'FRIENDLY_RECIPE_ICONS_DUPLICATED');
  for (const icon of icons) assert.match(icon, /^assets\/pwa\/[a-zA-Z0-9._-]+$/, 'FRIENDLY_RECIPE_ICON_PATH_INVALID');
  const identityHash = createHash('sha256');for (const icon of icons) identityHash.update(icon).update(read(icon));
  const identityVersion = 'identity-' + identityHash.digest('hex').slice(0, 12);
  const context = vm.createContext({ URL });
  new vm.Script(routes, { filename: 'reviewed-app-routes.js' }).runInContext(context, { timeout: 1000 });
  new vm.Script(metadata.replace(/^export /gm, ''), { filename: 'reviewed-social-metadata.js' }).runInContext(context, { timeout: 1000 });
  new vm.Script(build.slice(routeStart) + '\nfunction renderFriendlyReviewed(original,file,identityVersion){\n' + body + '\n}',
    { filename: 'reviewed-build-page-recipe.js' }).runInContext(context, { timeout: 1000 });
  const hashes = () => Object.fromEntries([...sources].map(([file, bytes]) => [file, hash(bytes)]).sort(([a], [b]) => a.localeCompare(b)));
  return {
    identityVersion, sourceHashes: hashes,
    forFile(file) {
      assert.ok(validPath(file) && file.endsWith('.html'), 'FRIENDLY_RECIPE_HTML_PATH_REQUIRED');
      context.__friendlyOriginal = read(file).toString('utf8');context.__friendlyFile = file;context.__friendlyIdentity = identityVersion;
      const rendered = new vm.Script('renderFriendlyReviewed(__friendlyOriginal,__friendlyFile,__friendlyIdentity)').runInContext(context, { timeout: 1000 });
      assert.equal(typeof rendered, 'string', 'FRIENDLY_RECIPE_HTML_RESULT_INVALID');return Buffer.from(rendered, 'utf8');
    },
    assertSourceBookend() {
      for (const [file, expected] of sources) { const actual = readBytes(file);assert.ok(Buffer.isBuffer(actual) && actual.equals(expected), 'FRIENDLY_RECIPE_SOURCE_CHANGED:' + file); }
      return { passed: true, byteExact: true, sourceCount: sources.size };
    },
  };
}
