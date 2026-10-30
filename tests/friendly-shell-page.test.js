/* TEXT CANDIDATE; destination tests/friendly-shell-page.test.js.
 * Pure derivation/source contracts only. No build, served page or browser claim.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../assets/app-routes.js';
import {FRIENDLY_PWA_IDENTITY_FILES,friendlyPwaIdentityVersion,applyCleanRouteLinks,transformFriendlyShellSource}
 from '../scripts/lib/friendly-shell-page.mjs';
const routes=globalThis.MuniControlRoutes;
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url));
const text=file=>read(file).toString('utf8');
const occurrences=(s,value)=>s.split(value).length-1;
const page='<!doctype html><html><head><title>MuniControl Friendly</title><link rel="icon" href="assets/pwa/icon.svg"></head>'+
 '<body><aside class="sidebar"><a href="nomina-control.html?period=2026-10#detalle">Nómina</a></aside>'+
 '<script>const own="login.html?next=centro-acciones.html";const other="login.html?next=otra.html";const login="login.html";</script>'+
 '<script src="/assets/independent.js">const untouched="login.html";</script><main id="family">Familia sintética</main></body></html>';

test('identity changes for any of the five real icon byte streams and reads only the closed ordered set',()=>{
 assert.deepEqual(FRIENDLY_PWA_IDENTITY_FILES,[
  'assets/pwa/icon.svg','assets/pwa/icon-180.png','assets/pwa/icon-192.png',
  'assets/pwa/icon-512.png','assets/pwa/icon-maskable-512.png']);
 const calls=[],base=friendlyPwaIdentityVersion(file=>{calls.push(file);return read(file);});
 assert.deepEqual(calls,FRIENDLY_PWA_IDENTITY_FILES);assert.match(base,/^identity-[a-f0-9]{12}$/);
 assert.equal(friendlyPwaIdentityVersion(file=>Buffer.from(read(file))),base);
 for(const changed of FRIENDLY_PWA_IDENTITY_FILES){
  const altered=friendlyPwaIdentityVersion(file=>{
   const bytes=Buffer.from(read(file));if(file===changed)bytes[bytes.length-1]^=1;return bytes;
  });
  assert.notEqual(altered,base,changed+' participates in the derived content identity');
 }
});

test('full shell derivation preserves family markup and adds the standard gate/navigation/identity once',()=>{
 const original=page,derived=transformFriendlyShellSource(original,'centro-acciones.html','identity-0123456789ab',routes);
 assert.equal(page,original);assert.notEqual(derived,original);
 assert.ok(derived.includes('<main id="family">Familia sintética</main>'));
 assert.ok(!derived.includes('MuniControl Friendly'));
 assert.ok(derived.includes('/assets/pwa/identity-0123456789ab/icon.svg'));
 assert.equal(occurrences(derived,'src="/assets/internal-capability-gate.js"'),1);
 assert.equal(occurrences(derived,'src="/assets/app-routes.js"'),1);
 for(const file of ['liquidaciones-menu.js','work-area-menu.js'])assert.equal(occurrences(derived,'src="/assets/'+file+'"'),1);
 assert.ok(derived.includes('href="/juridica" data-any-capability="legal.norm.read"'));
 assert.ok(derived.includes('href="/nomina?period=2026-10#detalle"'));
 assert.ok(derived.includes('og:title'));assert.ok(derived.includes('twitter:card'));
});

test('route normalization changes only the own fixed return and leaves sourced script bodies and other return targets intact',()=>{
 const linked=applyCleanRouteLinks(page,'centro-acciones.html',routes);
 assert.ok(linked.includes('const own=window.MuniControlRoutes.loginHref(window.location.href, window.location.href)'));
 assert.ok(linked.includes('const other="login.html?next=otra.html"'));
 assert.ok(linked.includes('const login="/acceso"'));
 assert.ok(linked.includes('<script src="/assets/independent.js">const untouched="login.html";</script>'));
 assert.equal(applyCleanRouteLinks(linked,'centro-acciones.html',routes),linked,'canonical route normalization does not duplicate its loader');
});

test('gate/legal exceptions and non-HTML files retain their existing scope',()=>{
 for(const file of ['friendly-dashboard.html','administracion-plataforma.html']){
  const derived=transformFriendlyShellSource(page,file,'identity-0123456789ab',routes);
  assert.ok(!derived.includes('internal-capability-gate.js'));assert.ok(!derived.includes('Registro normativo'));
 }
 const withoutSidebar=transformFriendlyShellSource('<html><head></head><body>Acceso</body></html>','login.html','identity-0123456789ab',routes);
 for(const asset of ['internal-capability-gate.js','liquidaciones-menu.js','work-area-menu.js'])assert.ok(!withoutSidebar.includes(asset));
 const raw='/* MuniControl Friendly */ .icon{background:url("pwa/icon.svg")}';
 assert.equal(transformFriendlyShellSource(raw,'assets/municontrol-enterprise.css','identity-0123456789ab',routes),
  '/* MuniControl Friendly */ .icon{background:url("pwa/identity-0123456789ab/icon.svg")}');
});

test('build and family browser share the full derived-page contract, while the six JS/CSS sources retain raw parity',()=>{
 // Causal source contract for the original raw-HTML comparison defect. This
 // deliberately does not import the build or launch the family browser.
 const build=text('scripts/build-friendly.mjs'),browser=text('scripts/lib/native-family-195-native-browser.mjs');
 assert.match(build,/import\s*\{friendlyPwaIdentityVersion,transformFriendlyShellSource\}\s*from ['"]\.\/lib\/friendly-shell-page\.mjs['"]/);
 assert.match(build,/fs\.writeFileSync\(destination,transformFriendlyShellSource\(original,file,identityVersion,globalThis\.MuniControlRoutes\)\)/);
 assert.match(browser,/const expectedPage=Buffer\.from\(transformFriendlyShellSource\(pageSource\.toString\('utf8'\),'centro-acciones\.html',identityVersion,globalThis\.MuniControlRoutes\),'utf8'\)/);
 assert.match(browser,/assert\.deepEqual\(fs\.readFileSync\(path\.join\(root,'public','centro-acciones\.html'\)\),expectedPage,'FAMILY195_BUILT_PAGE_DERIVATION'\)/);
 assert.match(browser,/assert\.deepEqual\(fs\.readFileSync\(path\.join\(root,'centro-acciones\.html'\)\),pageSource,'FAMILY195_PAGE_SOURCE_BOOKEND'\)/);
 assert.match(browser,/FAMILY195_PAGE_IDENTITY_BOOKEND/);
 assert.equal(occurrences(browser,'assertDerivedPage();'),2,'check full source/built/identity before and after the browser');
 const loops=[...browser.matchAll(/for\(const relative of (\[[^\]]+\])\)\{/g)];assert.equal(loops.length,1);
 const assets=[...loops[0][1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 assert.deepEqual(assets,[
  'assets/native-family-request-model.js','assets/native-family-request-client.js',
  'assets/native-family-request-panel.js','assets/native-family-request.css',
  'assets/native-salary-catalog-model.js','assets/app-routes.js']);
 assert.ok(!assets.includes('centro-acciones.html'),'HTML must use complete standard derivation rather than raw parity');
});
