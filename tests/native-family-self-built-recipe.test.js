import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import{createFriendlyBuiltPageRecipe}from'../scripts/lib/friendly-built-page-recipe.mjs';
import{inspectNativeFamilyBuilt,NATIVE_FAMILY_BUILT_FILES}from'../scripts/verify-native-family-self-built.mjs';
const root=path.resolve(import.meta.dirname,'..'),sourceRead=file=>fs.readFileSync(path.join(root,file));
// All built bytes live in this Map. A clean checkout needs no public/ directory.
// The canonical recipe supplies a synthetic baseline only for contract/negative
// probes; independently built product HTML is verified by the packaging CLI.
const memory=new Map(['scripts/build-friendly.mjs','scripts/apply-friendly-social-metadata.mjs','assets/app-routes.js'].map(file=>[file,sourceRead(file)]));
memory.set('centro-acciones.html',Buffer.from('<!doctype html>\n<html lang="es"><head><title>MuniControl Friendly</title><link rel="icon" href="assets/pwa/icon.svg"><link rel="stylesheet" href="assets/native-family-request.css"></head><body><aside class="sidebar"><a href="centro-acciones.html">Acciones</a></aside><p>Friendly · Junín, Mendoza</p><script type="module" src="assets/native-family-request-panel.js"></script></body></html>\n'));
memory.set('vercel.json',Buffer.from(JSON.stringify({rewrites:[{source:'/api/internal-native-family-requests',destination:'/api/internal-native-family-requests'}]})));
memory.set('assets/pwa/icon.svg',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>'));
const tinyPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
for(const file of['icon-180.png','icon-192.png','icon-512.png','icon-maskable-512.png'])memory.set('assets/pwa/'+file,Buffer.from(tinyPng));
for(const file of NATIVE_FAMILY_BUILT_FILES.slice(1))memory.set(file,Buffer.from('/* synthetic packaging fixture: '+file+' */\n'));
const read=file=>{assert.ok(memory.has(file),'UNEXPECTED_FIXTURE_READ:'+file);return Buffer.from(memory.get(file));};
const baselineRecipe=createFriendlyBuiltPageRecipe({readBytes:read});for(const file of NATIVE_FAMILY_BUILT_FILES)memory.set('public/'+file,file.endsWith('.html')?baselineRecipe.forFile(file):read(file));
const mutated=(file,fn)=>key=>{if(key!==file)return read(key);const original=Buffer.from(read(key)),changed=fn(Buffer.from(original));assert.ok(Buffer.isBuffer(changed)&&!changed.equals(original),'NEGATIVE_FIXTURE_DID_NOT_CHANGE:'+file);return changed;};

test('synthetic in-memory page follows canonical branding, routing, PWA and gate recipe',()=>{
 const recipe=createFriendlyBuiltPageRecipe({readBytes:read}),original=read('centro-acciones.html'),built=read('public/centro-acciones.html'),expected=recipe.forFile('centro-acciones.html');assert.ok(!original.equals(built));assert.deepEqual(expected,built);assert.match(expected.toString(),/internal-capability-gate\.js/);assert.match(expected.toString(),/href="\/acciones"/);assert.match(expected.toString(),/Registro normativo/);assert.match(expected.toString(),/Municipalidad de Junín, Mendoza/);assert.doesNotMatch(expected.toString(),/MuniControl Friendly/);assert.ok(expected.includes(Buffer.from('assets/pwa/'+recipe.identityVersion+'/')));assert.equal(Object.keys(recipe.sourceHashes()).length,9);assert.equal(recipe.assertSourceBookend().passed,true);
});
test('packaging gate preserves all five exact comparisons and declares only packaging acceptance',()=>{
 const result=inspectNativeFamilyBuilt({readBytes:read,sourceCommit:'a'.repeat(40)});assert.equal(result.passed,true);assert.deepEqual(result.files.map(f=>f.file),NATIVE_FAMILY_BUILT_FILES);assert.equal(result.files[0].comparison,'exact canonical build recipe');assert.ok(result.files.slice(1).every(f=>f.comparison==='exact original asset'));assert.equal(Object.keys(result.builtHashes).length,5);assert.ok(result.sourceHashes['vercel.json']);assert.equal(result.sqlExecuted,false);assert.equal(result.browserExecuted,false);assert.equal(result.municipalAcceptance,false);
});
for(const [label,change]of[
 ['raw source HTML substituted for rendered HTML',()=>read('centro-acciones.html')],
 ['an extra HTML byte',b=>Buffer.concat([b,Buffer.from(' ')])],
 ['different line endings',b=>Buffer.from(b.toString().replaceAll('\n','\r\n'))],
 ['removed capability gate',b=>Buffer.from(b.toString().replace(/<script\b[^>]*\binternal-capability-gate\.js[^>]*><\/script>/,''))],
 ['altered PWA identity',b=>Buffer.from(b.toString().replace(/assets\/pwa\/identity-[a-f0-9]{12}\//g,'assets/pwa/identity-000000000000/'))],
 ['altered clean action route',b=>Buffer.from(b.toString().replace('href="/acciones"','href="/acciones-alteradas"'))],
])test('built gate rejects '+label,()=>assert.throws(()=>inspectNativeFamilyBuilt({readBytes:mutated('public/centro-acciones.html',change)}),/FAMILY195_BUILT_BYTES_CHANGED:centro-acciones\.html/));
for(const file of NATIVE_FAMILY_BUILT_FILES.slice(1))test('raw asset comparison still rejects a single altered byte: '+file,()=>assert.throws(()=>inspectNativeFamilyBuilt({readBytes:mutated('public/'+file,b=>Buffer.concat([b,Buffer.from('\n')]))}),new RegExp('FAMILY195_BUILT_BYTES_CHANGED:'+file.replaceAll('.','\\.'))));
for(const [file,change]of[
 ['assets/pwa/icon.svg',b=>Buffer.concat([b,Buffer.from('\n')])],
 ['scripts/apply-friendly-social-metadata.mjs',b=>Buffer.from(b.toString().replace('Gestión municipal, más simple','Receta municipal alterada'))],
 ['assets/app-routes.js',b=>Buffer.from(b.toString().replace("'/acciones'","'/acciones-revisadas'"))],
])test('stale HTML is rejected when a canonical recipe input changes: '+file,()=>assert.throws(()=>inspectNativeFamilyBuilt({readBytes:mutated(file,change)}),/FAMILY195_BUILT_BYTES_CHANGED:centro-acciones\.html/));
test('changed recipe boundaries, new I/O and metadata imports fail closed before rendering',()=>{
 for(const change of[s=>s.replace('  const branded =','  const renamed ='),s=>s.replace('  const withGate =','  fs.statSync(destination);\n  const withGate ='),s=>s.replace("  'assets/pwa/icon.svg',",'')])assert.throws(()=>createFriendlyBuiltPageRecipe({readBytes:mutated('scripts/build-friendly.mjs',b=>Buffer.from(change(b.toString())))}),/FRIENDLY_RECIPE_/);
 assert.throws(()=>createFriendlyBuiltPageRecipe({readBytes:mutated('scripts/apply-friendly-social-metadata.mjs',b=>Buffer.concat([Buffer.from("import fs from 'node:fs';\n"),b]))}),/FRIENDLY_RECIPE_METADATA_IMPORT_CHANGED/);
});
test('source mutation after recipe construction is caught by the exact source bookend',()=>{
 let changed=false;const recipe=createFriendlyBuiltPageRecipe({readBytes:file=>file==='assets/app-routes.js'&&changed?Buffer.concat([read(file),Buffer.from('\n')]):read(file)});recipe.forFile('centro-acciones.html');changed=true;assert.throws(()=>recipe.assertSourceBookend(),/FRIENDLY_RECIPE_SOURCE_CHANGED:assets\/app-routes\.js/);
});
test('new recipe sources and its test remain inside the durable committed-source closure',()=>{
 const runner=sourceRead('scripts/verify-native-family-self-durable.mjs').toString(),workflow=sourceRead('.github/workflows/native-family-self-durable.yml').toString();for(const value of['scripts/verify-native-family-self-built.mjs','tests/native-family-self-built-recipe.test.js','Object.keys(pageRecipe.sourceHashes())','assertOwnerAuthorityQaSourceBookend'])assert.ok(runner.includes(value),value);for(const file of['tests/native-family-self-built-recipe.test.js','scripts/lib/friendly-built-page-recipe.mjs','scripts/apply-friendly-social-metadata.mjs','assets/app-routes.js','assets/pwa/**'])assert.ok(workflow.includes(file),file);assert.ok(workflow.indexOf('Focal and transport regression')<workflow.indexOf('Build exact product assets'));assert.doesNotMatch(runner,/skipSourceBookend|ignoreRecipeFailure/);
});
