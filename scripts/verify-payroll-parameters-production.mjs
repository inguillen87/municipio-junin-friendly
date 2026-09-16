// Public deployment bytes plus real anonymous denial. Never reads an authorized
// municipal record or creates proposals, identities, sessions or payments.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
const origin = 'https://municipio-junin-friendly.vercel.app';
const readLocal = file => fs.readFileSync('public/' + file, 'utf8');
const pattern = /import\('(\/assets\/islands\/payroll-parameters-[A-Z0-9]+\.js)'\)/;
const expectedLoader = readLocal('assets/payroll-parameters-loader.js'), expectedHref = expectedLoader.match(pattern)?.[1];
assert.ok(expectedHref, 'Build before checking publication');
const normalized = code => code.replace(/\/\*! For license information please see payroll-parameters-[A-Z0-9]+\.js\.LEGAL\.txt \*\//g, '/*! Parameter license */');
const request = async path => { const res = await fetch(origin + path, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) }); assert.equal(res.status, 200, path); return res.text(); };
let href;
for (let attempt = 1; attempt <= 20; attempt++) {
  try {
    const loader = await request('/assets/payroll-parameters-loader.js'); href = loader.match(pattern)?.[1]; assert.ok(href);
    assert.equal(loader.replace(href,'__BUNDLE__'), expectedLoader.replace(expectedHref,'__BUNDLE__'));
    assert.equal(normalized(await request(href)), normalized(readLocal(expectedHref.slice(1))));
    assert.equal(await request(href + '.LEGAL.txt'), readLocal(expectedHref.slice(1) + '.LEGAL.txt'));
    for (const file of ['assets/payroll-navigation.js', 'assets/liquidaciones-menu.js']) assert.equal(await request('/' + file), readLocal(file), file);
    break;
  } catch (e) { if (attempt === 20) throw Error('The parameter workspace could not be certified in production', { cause: e }); console.log('Waiting for parameter publication: '+attempt); await sleep(15000); }
}
for (const path of ['/api/internal-payroll-parameters?resource=bootstrap','/api/internal-payroll-parameters?resource=list']) {
  const res = await fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(15000)}); assert.equal(res.status,401); assert.match(res.headers.get('cache-control')||'',/no-store/);
}
const result = {ok:true,commit:process.env.GITHUB_SHA||null,origin,href,normalizedBundleSha256:createHash('sha256').update(normalized(readLocal(expectedHref.slice(1)))).digest('hex'),realAnonymousDenials:2,municipalSessionTested:false,writesSent:0};
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/payroll-parameters-production.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
