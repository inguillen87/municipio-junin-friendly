import assert from 'node:assert/strict';
import path from 'node:path';
// Existing, lock-pinned devDependency. This exported subpath is provided by
// playwright 1.63.0; parsing disables Babel configuration and never evaluates source.
import {babelParse} from 'playwright/lib/transform/babelBundle';

function program(source, file) {
  assert.equal(typeof source, 'string', `SOURCE_TEXT_REQUIRED: ${file}`);
  try { return babelParse(source, file, true).program; }
  catch (cause) { throw new Error(`PUBLISHED_SOURCE_PARSE_FAILED: ${file}`, {cause}); }
}
const id = (node, name) => node?.type === 'Identifier' && node.name === name;
const str = (node, value) => node?.type === 'StringLiteral' && node.value === value;
const member = (node, object, property) => node?.type === 'MemberExpression' && !node.computed && id(node.object, object) && id(node.property, property);
const call = (node, object, method, argumentsMatch) => node?.type === 'CallExpression' && member(node.callee, object, method) && node.arguments.length === argumentsMatch.length && argumentsMatch.every((matches, i) => matches(node.arguments[i]));
const ident = name => node => id(node, name);
const string = value => node => str(node, value);

function constant(statements, name, label) {
  const matches = statements.flatMap(statement => statement.type === 'VariableDeclaration' ? statement.declarations.filter(node => id(node.id, name)).map(node => ({kind: statement.kind, init: node.init})) : []);
  assert.equal(matches.length, 1, `PUBLICATION_DECLARATION_REQUIRED: ${label}.${name}`);
  assert.equal(matches[0].kind, 'const', `PUBLICATION_CONST_REQUIRED: ${label}.${name}`);
  return matches[0].init;
}
function literalArray(node, label) {
  assert.equal(node?.type, 'ArrayExpression', `PUBLICATION_LITERAL_ARRAY_REQUIRED: ${label}`);
  return node.elements.map(element => {
    assert.equal(element?.type, 'StringLiteral', `PUBLICATION_LITERAL_ENTRY_REQUIRED: ${label}`);
    return element.value;
  });
}
function loopVariable(loop, name) {
  return loop.left?.type === 'VariableDeclaration' && loop.left.kind === 'const' && loop.left.declarations.length === 1 && id(loop.left.declarations[0].id, name) && loop.left.declarations[0].init === null && !loop.await;
}
function copyLoop(statements, rightMatches, sourceMatches, label) {
  const loops = statements.filter(node => node.type === 'ForOfStatement' && rightMatches(node.right));
  assert.equal(loops.length, 1, `PUBLICATION_COPY_LOOP_REQUIRED: ${label}`);
  const loop = loops[0];
  assert.ok(loopVariable(loop, 'file') && loop.body.type === 'BlockStatement', `PUBLICATION_COPY_SHAPE_CHANGED: ${label}`);
  const body = loop.body.body, destination = constant(body, 'destination', label);
  assert.ok(body.length === 3 && body[0].type === 'VariableDeclaration' && body[0].declarations.length === 1, `PUBLICATION_COPY_SHAPE_CHANGED: ${label}`);
  const destinationFile = label === 'vendorFiles' ? node => member(node, 'file', 'destination') : ident('file');
  assert.ok(call(destination, 'path', 'join', [ident('output'), destinationFile]), `PUBLICATION_DESTINATION_CHANGED: ${label}`);
  const recursive = node => node?.type === 'ObjectExpression' && node.properties.length === 1 && node.properties[0].type === 'ObjectProperty' && !node.properties[0].computed && id(node.properties[0].key, 'recursive') && node.properties[0].value.type === 'BooleanLiteral' && node.properties[0].value.value === true;
  assert.ok(body[1].type === 'ExpressionStatement' && call(body[1].expression, 'fs', 'mkdirSync', [node => call(node, 'path', 'dirname', [ident('destination')]), recursive]), `PUBLICATION_COPY_SHAPE_CHANGED: ${label}`);
  assert.ok(body[2].type === 'ExpressionStatement' && call(body[2].expression, 'fs', 'copyFileSync', [sourceMatches, ident('destination')]), `PUBLICATION_COPY_SHAPE_CHANGED: ${label}`);
  return loop;
}
function staticListUses(ast, copyLoops) {
  const names = new Set(['shellFiles', 'pwaFiles', 'vendorFiles']), admitted = new Set();
  for (const statement of ast.body) if (statement.type === 'VariableDeclaration') for (const declaration of statement.declarations) if (names.has(declaration.id.name)) admitted.add(declaration.id);
  for (const loop of copyLoops) {
    if (loop.right.type === 'Identifier') admitted.add(loop.right);
    else for (const element of loop.right.elements) admitted.add(element.argument);
  }
  function visit(node, parent, grandparent) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Identifier' && names.has(node.name) && !admitted.has(node)) {
      // These pure literal filters are the only additional uses in the current build.
      // Reject aliases, mutation (including .pop/.push), and computed/dynamic uses.
      const fn = grandparent?.arguments?.[0], parameter = fn?.params?.[0];
      const pureFilter = member(parent, node.name, 'filter') && grandparent.type === 'CallExpression' && grandparent.callee === parent && grandparent.arguments.length === 1 && fn?.type === 'ArrowFunctionExpression' && !fn.async && fn.params.length === 1 && parameter.type === 'Identifier' && ['startsWith', 'endsWith'].some(method => call(fn.body, parameter.name, method, [argument => argument?.type === 'StringLiteral']));
      assert.ok(pureFilter, `PUBLICATION_DYNAMIC_LIST_USE: ${node.name}`);
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => visit(child, node, parent));
      else if (value && typeof value === 'object') visit(value, node, parent);
    }
  }
  visit(ast);
}
function vendorDestinations(node) {
  assert.equal(node?.type, 'ArrayExpression', 'PUBLICATION_LITERAL_ARRAY_REQUIRED: vendorFiles');
  return node.elements.map(element => {
    assert.equal(element?.type, 'ObjectExpression', 'PUBLICATION_LITERAL_ENTRY_REQUIRED: vendorFiles');
    const fields = new Map();
    for (const property of element.properties) {
      assert.ok(property.type === 'ObjectProperty' && !property.computed && !property.shorthand, 'PUBLICATION_VENDOR_PROPERTY_INVALID');
      const name = property.key.type === 'Identifier' ? property.key.name : property.key.type === 'StringLiteral' ? property.key.value : null;
      assert.ok(['source', 'destination'].includes(name) && !fields.has(name), 'PUBLICATION_VENDOR_PROPERTY_INVALID');
      assert.equal(property.value.type, 'StringLiteral', 'PUBLICATION_VENDOR_LITERAL_REQUIRED');
      fields.set(name, property.value.value);
    }
    assert.equal(fields.size, 2, 'PUBLICATION_VENDOR_FIELDS_REQUIRED');
    return fields.get('destination');
  });
}
function clockAssets(ast) {
  const functions = ast.body.filter(node => node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration' && id(node.declaration.id, 'buildClockFleet')).map(node => node.declaration);
  assert.equal(functions.length, 1, 'PUBLICATION_CLOCK_FUNCTION_REQUIRED');
  const fn = functions[0];
  assert.ok(fn.params.length === 2 && id(fn.params[0], 'root') && id(fn.params[1], 'output'), 'PUBLICATION_CLOCK_PARAMETERS_CHANGED');
  const loops = fn.body.body.filter(node => node.type === 'ForOfStatement');
  assert.equal(loops.length, 1, 'PUBLICATION_CLOCK_COPY_LOOP_REQUIRED');
  const loop = loops[0];
  assert.ok(loopVariable(loop, 'asset'), 'PUBLICATION_CLOCK_COPY_SHAPE_CHANGED');
  const join = owner => node => call(node, 'path', 'join', [ident(owner), string('assets'), ident('asset')]);
  assert.ok(loop.body.type === 'ExpressionStatement' && call(loop.body.expression, 'fs', 'copyFileSync', [join('root'), join('output')]), 'PUBLICATION_CLOCK_COPY_SHAPE_CHANGED');
  return literalArray(loop.right, 'buildClockFleet').map(file => {
    assert.ok(file.length > 0 && !file.includes('/') && !file.includes('\\'), 'PUBLICATION_CLOCK_ASSET_NAME_INVALID');
    return 'assets/' + file;
  });
}
function clockBuildInvocation(ast) {
  const imports = ast.body.filter(node => node.type === 'ImportDeclaration' && str(node.source, './build-clock-fleet.mjs') && node.specifiers.some(specifier => specifier.type === 'ImportSpecifier' && id(specifier.imported, 'buildClockFleet') && id(specifier.local, 'buildClockFleet')));
  assert.equal(imports.length, 1, 'PUBLICATION_CLOCK_IMPORT_REQUIRED');
  const calls = ast.body.filter(node => node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' && id(node.expression.callee, 'buildClockFleet') && node.expression.arguments.length === 2 && id(node.expression.arguments[0], 'root') && id(node.expression.arguments[1], 'output'));
  assert.equal(calls.length, 1, 'PUBLICATION_CLOCK_INVOCATION_REQUIRED');
}

export function publishedAssetPaths({build, clockFleet}) {
  const ast = program(build, 'scripts/build-friendly.mjs');
  const shell = literalArray(constant(ast.body, 'shellFiles', 'build-friendly'), 'shellFiles');
  const pwa = literalArray(constant(ast.body, 'pwaFiles', 'build-friendly'), 'pwaFiles');
  const vendor = vendorDestinations(constant(ast.body, 'vendorFiles', 'build-friendly'));
  const shellCopy = copyLoop(ast.body, node => node?.type === 'ArrayExpression' && node.elements.length === 2 && ['shellFiles', 'pwaFiles'].every((name, i) => node.elements[i]?.type === 'SpreadElement' && id(node.elements[i].argument, name)), node => call(node, 'path', 'join', [ident('root'), ident('file')]), 'shellFiles+pwaFiles');
  const vendorCopy = copyLoop(ast.body, ident('vendorFiles'), node => call(node, 'path', 'join', [ident('root'), value => member(value, 'file', 'source')]), 'vendorFiles');
  staticListUses(ast, [shellCopy, vendorCopy]);
  clockBuildInvocation(ast);
  const clock = clockAssets(program(clockFleet, 'scripts/build-clock-fleet.mjs'));
  // Existing generated loader exception: build-react-islands rewrites its output.
  // Only the known literal copy forms above are admitted; unfamiliar build structure fails.
  return new Set([...shell, ...pwa, ...vendor, ...clock, 'assets/payroll-parameters-loader.js'].filter(file => file.startsWith('assets/') && /\.(?:js|mjs)$/.test(file)));
}

export function staticRelativeImports(source, file) {
  return program(source, file).body.filter(node => ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source).map(node => {
    assert.equal(node.source.type, 'StringLiteral', `STATIC_IMPORT_LITERAL_REQUIRED: ${file}`);
    return node.source.value;
  }).filter(specifier => specifier.startsWith('./') || specifier.startsWith('../'));
}

export function missingPublishedAssetImports(published, readSource) {
  const missing = [];
  for (const file of published) {
    if (file.startsWith('assets/vendor/')) continue; // generated/copied dependency bundles, unchanged scope
    const source = readSource(file);
    if (source === null) { missing.push(`${file} (file absent)`); continue; }
    for (const specifier of staticRelativeImports(source, file)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (!target.startsWith('assets/')) continue; // existing scope: external shared modules are checked elsewhere
      if (!published.has(target)) missing.push(`${file} -> ${target}`);
    }
  }
  return missing;
}
