// Public deployment bytes and anonymous denials only. No municipal session.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
const origin = 'https://municipio-junin-friendly.vercel.app';
const local = file => fs.readFileSync('public/' + file, 'utf8');
const pattern = /import\('(\/assets\/islands\/leave-rules-[A-Z0-9]+\.js)'\)/;
const expectedHtml = local('licencias-control.html');
const expectedHref = expectedHtml.match(pattern)?.[1];
assert.ok(expectedHref, 'Build the licence workspace before certification');
const expectedBundle = local(expectedHref.slice(1));
const normalize = text => text.replace(/\/\*! For license information please see leave-rules-[A-Z0-9]+\.js\.LEGAL\.txt \*\//g, '/*! For license information please see LEAVE_LICENSE */');
async function read(href) {
  const response = await fetch(origin + href, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, href);
  return response.text();
}
let certified;
for (let attempt = 1; attempt <= 24; attempt++) {
  try {
    const html = await read('/licencias');
    const href = html.match(pattern)?.[1];
    assert.ok(href, 'Published page must import the licence workspace');
    assert.equal(html.replace(href, '__LEAVE_BUNDLE__'), expectedHtml.replace(expectedHref, '__LEAVE_BUNDLE__'), 'Published licence shell differs');
    const bundle = await read(href);
    assert.equal(normalize(bundle), normalize(expectedBundle), 'Published executable bytes differ');
    assert.equal(await read(href + '.LEGAL.txt'), local(expectedHref.slice(1) + '.LEGAL.txt'));
    assert.equal(await read('/assets/app-routes.js'), local('assets/app-routes.js'), 'Published route contract differs');
    certified = { bundle: href, normalizedExecutableSha256: createHash('sha256').update(normalize(bundle)).digest('hex') };
    break;
  } catch (error) {
    console.log(`Licence publication ${attempt}/24: ${error.message.split('\n')[0]}`);
    if (attempt === 24) throw new Error('Expected licence workspace not certified', { cause: error });
    await sleep(15000);
  }
}
for (const [source, destination] of [['licencias-control.html', '/licencias'], ['nomina-control.html', '/nomina'], ['relojes-marcaciones.html', '/relojes']]) {
  const response = await fetch(`${origin}/${source}?period=2026-08`, { redirect: 'manual', signal: AbortSignal.timeout(12000) });
  assert.equal(response.status, 307, source);
  const target = new URL(response.headers.get('location'), origin);
  assert.equal(target.origin, origin);
  assert.equal(target.pathname, destination);
  assert.equal(target.searchParams.get('period'), '2026-08');
}
const denial = await fetch(origin + '/api/internal-data?resource=leavenormative', { redirect: 'error', signal: AbortSignal.timeout(12000) });
assert.equal(denial.status, 401, 'Real API denies an anonymous normative read');
assert.match(denial.headers.get('cache-control') || '', /no-store/);
const result = { ok: true, commit: process.env.GITHUB_SHA || null, origin, ...certified,
  redirectsVerified: 3, anonymousApiDenial: 401, municipalSessionTested: false, writesSent: 0 };
fs.mkdirSync('verification', { recursive: true });
fs.writeFileSync('verification/leave-workspace-production.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
