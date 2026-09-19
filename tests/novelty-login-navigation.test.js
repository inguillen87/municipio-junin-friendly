import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx={URL};
vm.runInNewContext(fs.readFileSync('assets/app-routes.js','utf8'),ctx);
const routes=ctx.MuniControlRoutes;
test('novelty session expiry returns to the exact canonical module without accepting external destinations',()=>{
 const href=routes.loginHref('novedades-nomina.html');
 const url=new URL(href,'https://municontrol.test');
 assert.equal(url.pathname,'/acceso');assert.equal(url.searchParams.get('next'),'/novedades');
 assert.equal(routes.loginHref('https://example.invalid/elsewhere'),'/acceso');
});
test('the workbench uses the shared route contract for expired sessions and logout',()=>{
 const source=fs.readFileSync('assets/payroll-novelty-workbench.js','utf8');
 assert.match(source,/import '\.\/app-routes\.js'/);
 assert.match(source,/const LOGIN_URL = globalThis\.MuniControlRoutes\.loginHref\('novedades-nomina\.html'\)/);
 assert.match(source,/location\.replace\(globalThis\.MuniControlRoutes\.canonicalHref\('login\.html'\)\)/);
 assert.doesNotMatch(source,/location\.replace\('login\.html'\)|const LOGIN_URL = 'login\.html/);
});
