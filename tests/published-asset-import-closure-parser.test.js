import test from 'node:test';
import assert from 'node:assert/strict';
import {publishedAssetPaths,staticRelativeImports,missingPublishedAssetImports} from './helpers/published-asset-import-closure.js';

const loader = 'assets/payroll-parameters-loader.js';
function fixture({shell = ['assets/probe.js', 'assets/present.js'], pwa = [], vendor = [], clock = []} = {}) {
  return {
    build: `const shellFiles = ${JSON.stringify(shell)};
const pwaFiles = ${JSON.stringify(pwa)};
const vendorFiles = ${JSON.stringify(vendor)};
for (const file of [...shellFiles, ...pwaFiles]) {
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(path.join(root, file), destination);
}
for (const file of vendorFiles) {
  const destination = path.join(output, file.destination);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(path.join(root, file.source), destination);
}
import {buildClockFleet} from './build-clock-fleet.mjs';
buildClockFleet(root, output);`,
    clockFleet: `export function buildClockFleet(root, output) {
  for (const asset of ${JSON.stringify(clock)}) fs.copyFileSync(path.join(root, 'assets', asset), path.join(output, 'assets', asset));
}`,
  };
}
function missing(inputs, source, extra = {}) {
  const files = {'assets/probe.js': source, 'assets/present.js': 'export {};', [loader]: 'export {};', ...extra};
  return missingPublishedAssetImports(publishedAssetPaths(inputs), file => files[file] ?? null);
}

test('all static imports and re-exports on one line are read in source order', () => {
  const source = "import './one.js'; import value from './two.js'; export {value as renamed} from './three.js'; export * from './four.js'; export * as namespace from './five.js';";
  assert.deepEqual(staticRelativeImports(source, 'probe.js'), ['./one.js', './two.js', './three.js', './four.js', './five.js']);
});
test('multiline imports, comments between tokens and escaped specifiers use JavaScript syntax', () => {
  const source = "import /* before */ {\n value, other as alias\n} /* after */ from\n'./multi.js';\nexport /* before */ {x as y}\nfrom /* after */ './reexport.js'; import '\\u002e/escaped.js';";
  assert.deepEqual(staticRelativeImports(source, 'probe.js'), ['./multi.js', './reexport.js', './escaped.js']);
});
test('comments, ordinary strings, templates and regex literals cannot invent imports', () => {
  const source = [
    "// import './comment.js';",
    "/* export * from './block-comment.js'; */",
    'const quoted = "import \'./quoted.js\';";',
    "const template = `\nimport './template.js';\n${\"export * from './interpolation.js';\"}`;",
    "const regex = /import '\\.\\/regex.js'/g;",
    'export {};',
  ].join('\n');
  assert.deepEqual(staticRelativeImports(source, 'probe.js'), []);
});
test('the declared static-relative scope excludes dynamic imports and bare specifiers', () => {
  const source = "import x from 'package'; import './static.js'; export const load = () => import('./dynamic.js'); export * from 'external-package';";
  assert.deepEqual(staticRelativeImports(source, 'probe.js'), ['./static.js']);
});
test('syntax errors fail rather than silently dropping a declaration', () => {
  assert.throws(() => staticRelativeImports("import { from './broken.js';", 'broken.js'), /PUBLISHED_SOURCE_PARSE_FAILED: broken.js/);
});
test('a missing second import on the same line is reported', () => {
  assert.deepEqual(missing(fixture(), "import './present.js'; import './absent.js';"), ['assets/probe.js -> assets/absent.js']);
});
test('a target only quoted in a build comment or unrelated string is not published', () => {
  const inputs = fixture();
  inputs.build += "\n// 'assets/absent.js' is not in shellFiles.\nconst unrelated = 'assets/absent.js';\nconst publicCacheInputs = ['assets/absent.js'];";
  assert.equal(publishedAssetPaths(inputs).has('assets/absent.js'), false);
  assert.deepEqual(missing(inputs, "import './absent.js';", {'assets/absent.js': 'export {};'}), ['assets/probe.js -> assets/absent.js']);
});
test('a fake shellFiles declaration only in a comment or string cannot supply the list', () => {
  for (const replacement of ["// const shellFiles = ['assets/probe.js'];", 'const misleading = "const shellFiles = [\'assets/probe.js\'];";']) {
    const inputs = fixture();inputs.build = inputs.build.replace(/^const shellFiles = .*;/, replacement);
    assert.throws(() => publishedAssetPaths(inputs), /PUBLICATION_DECLARATION_REQUIRED: build-friendly.shellFiles/);
  }
});
test('only literal destinations and the actual clock copy array join the published set', () => {
  const inputs = fixture({shell: ['assets/probe.js', 'page.html'], pwa: ['assets/pwa/check.js', 'sw.js'], vendor: [{source: 'node_modules/one/index.js', destination: 'assets/vendor/one.js'}], clock: ['clock-one.js', 'clock.css']});
  inputs.clockFleet += "\n// 'clock-ghost.js'\nconst note = 'clock-string.js';";
  assert.deepEqual([...publishedAssetPaths(inputs)], ['assets/probe.js', 'assets/pwa/check.js', 'assets/vendor/one.js', 'assets/clock-one.js', loader]);
});
test('dynamic, sparse or nonliteral publication entries fail closed', () => {
  for (const value of ['getFiles()', '[...otherFiles]', '[,]', '[`assets/probe.js`]', '[true]', "['assets/' + name]"]) {
    const inputs = fixture();inputs.build = inputs.build.replace(/^const shellFiles = .*;/, 'const shellFiles = ' + value + ';');
    assert.throws(() => publishedAssetPaths(inputs), /PUBLICATION_LITERAL_(ARRAY|ENTRY)_REQUIRED/);
  }
  const mutable = fixture();mutable.build = mutable.build.replace('const shellFiles', 'let shellFiles');
  assert.throws(() => publishedAssetPaths(mutable), /PUBLICATION_CONST_REQUIRED/);
});
test('post-declaration mutations, aliases and impure filters are not accepted as static lists', () => {
  for (const extra of ["shellFiles.pop();", "shellFiles.push('assets/new.js');", 'const alias = shellFiles;', 'shellFiles[0] = "assets/other.js";', 'vendorFiles[0].destination = "assets/new.js";', 'pwaFiles.filter(file => { pwaFiles.pop(); return true; });']) {
    const inputs = fixture();inputs.build += '\n' + extra;
    assert.throws(() => publishedAssetPaths(inputs), /PUBLICATION_DYNAMIC_LIST_USE/);
  }
});
test('the existing pure HTML and icon filters do not change publication lists', () => {
  const inputs = fixture();
  inputs.build += "\nconst html = shellFiles.filter(file => file.endsWith('.html')); const icons = pwaFiles.filter(file => file.startsWith('assets/pwa/'));";
  assert.deepEqual([...publishedAssetPaths(inputs)], ['assets/probe.js', 'assets/present.js', loader]);
});
test('unknown vendor fields, computed destinations and unknown clock copy shapes fail closed', () => {
  for (const entry of [{source: 'a', destination: 'assets/vendor/a.js', extra: true}, {source: 'a'}, {source: 'a', destination: 1}]) {
    assert.throws(() => publishedAssetPaths(fixture({vendor: [entry]})), /PUBLICATION_VENDOR_/);
  }
  const dynamicClock = fixture();dynamicClock.clockFleet = dynamicClock.clockFleet.replace('of []', 'of getClockAssets()');
  assert.throws(() => publishedAssetPaths(dynamicClock), /PUBLICATION_LITERAL_ARRAY_REQUIRED: buildClockFleet/);
  const wrongDestination = fixture();wrongDestination.clockFleet = wrongDestination.clockFleet.replace("path.join(output, 'assets', asset)", "path.join(output, 'other', asset)");
  assert.throws(() => publishedAssetPaths(wrongDestination), /PUBLICATION_CLOCK_COPY_SHAPE_CHANGED/);
});
test('unknown copying, missing loops and mutations inside a copy loop fail closed', () => {
  for (const change of [s => s.replace('fs.copyFileSync(path.join(root, file)', 'otherCopy(path.join(root, file)'), s => s.replace('...shellFiles, ...pwaFiles', '...shellFiles'), s => s.replace('const destination = path.join(output, file);', 'file = "assets/other.js"; const destination = path.join(output, file);')]) {
    const inputs = fixture();inputs.build = change(inputs.build);
    assert.throws(() => publishedAssetPaths(inputs), /PUBLICATION_COPY_(LOOP_REQUIRED|SHAPE_CHANGED)/);
  }
});
test('clock publication requires the real import and one unconditional top-level invocation', () => {
  const invocation = 'buildClockFleet(root, output);', imported = "import {buildClockFleet} from './build-clock-fleet.mjs';";
  for (const replacement of ['', '// ' + invocation, 'const note = "' + invocation + '";', 'if (false) ' + invocation, invocation + invocation]) {
    const inputs = fixture();inputs.build = inputs.build.replace(invocation, replacement);
    assert.throws(() => publishedAssetPaths(inputs), /PUBLICATION_CLOCK_INVOCATION_REQUIRED/);
  }
  for (const replacement of ['', '// ' + imported, imported.replace('./build-clock-fleet.mjs', './other-build.mjs')]) {
    const inputs = fixture();inputs.build = inputs.build.replace(imported, replacement);
    assert.throws(() => publishedAssetPaths(inputs), /PUBLICATION_CLOCK_IMPORT_REQUIRED/);
  }
});
test('parsing neither executes build statements nor imported browser modules', () => {
  const inputs = fixture();inputs.build += '\nthrow new Error("BUILD_MUST_NOT_RUN");';inputs.clockFleet += '\nthrow new Error("CLOCK_MUST_NOT_RUN");';
  assert.deepEqual(missing(inputs, "import './present.js'; throw new Error('MODULE_MUST_NOT_RUN');"), []);
});
test('existing vendor and outside-assets exceptions remain explicit, while absent local files fail', () => {
  const published = new Set(['assets/probe.js', 'assets/vendor/generated.js']);
  const reads = [];
  assert.deepEqual(missingPublishedAssetImports(published, file => {reads.push(file);return "import '../shared/outside.js';";}), []);
  assert.deepEqual(reads, ['assets/probe.js']);
  assert.deepEqual(missingPublishedAssetImports(new Set(['assets/missing.js']), () => null), ['assets/missing.js (file absent)']);
});
