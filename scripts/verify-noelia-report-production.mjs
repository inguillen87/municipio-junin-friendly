// Public static artifacts only: no municipal session, credentials or API reads.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const base = 'https://municipio-junin-friendly.vercel.app';
const consumerPath = '/assets/report-centre.js';
const bundlePattern = /import\('(\/assets\/islands\/report-catalog-[A-Z0-9]+\.js)'\)/;
const expectedConsumer = fs.readFileSync(path.join('public', consumerPath), 'utf8');
const expectedHref = expectedConsumer.match(bundlePattern)?.[1];
assert.ok(expectedHref, 'Build the catalog before checking production');
const expectedBundle = fs.readFileSync(path.join('public', expectedHref), 'utf8');
const expectedLicense = fs.readFileSync(path.join('public', expectedHref + '.LEGAL.txt'), 'utf8');
const digest = text => createHash('sha256').update(text).digest('hex');
// esbuild can vary its artifact name between build directories. Only its linked
// license comment is normalized; all executable bytes and license bytes match.
const normalizeLicenseLink = text => text.replace(/\/\*! For license information please see report-catalog-[A-Z0-9]+\.js\.LEGAL\.txt \*\//g, '/*! For license information please see CATALOG_LICENSE */');
async function readPublic(href) {
  const response = await fetch(base + href, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) throw new Error(`Public artifact returned HTTP ${response.status}: ${href}`);
  return response.text();
}
fs.mkdirSync('verification', { recursive: true });
let result = null;
for (let attempt = 1; attempt <= 24; attempt++) {
  try {
    const deployedConsumer = await readPublic(consumerPath);
    const deployedHref = deployedConsumer.match(bundlePattern)?.[1];
    assert.ok(deployedHref, 'Published controller must reference a catalog bundle');
    assert.equal(deployedConsumer.replace(deployedHref, '__CATALOG__'), expectedConsumer.replace(expectedHref, '__CATALOG__'), 'Published report controller is not this build');
    const [deployedBundle, deployedLicense] = await Promise.all([readPublic(deployedHref), readPublic(deployedHref + '.LEGAL.txt')]);
    assert.equal(normalizeLicenseLink(deployedBundle), normalizeLicenseLink(expectedBundle), 'Published executable catalog is not this build');
    assert.equal(deployedLicense, expectedLicense, 'Published catalog license differs');
    assert.ok(deployedBundle.includes('data-catalog-workspace'), 'Published catalog must contain the new workspace');
    result = {
      ok: true, commit: process.env.GITHUB_SHA || null, base, checkedAt: new Date().toISOString(),
      bundleHref: deployedHref, expectedBundleSha256: digest(expectedBundle), deployedBundleSha256: digest(deployedBundle),
      executableBytesMatch: true, licenseBytesMatch: true, licenseFilenameNormalized: expectedHref !== deployedHref,
      municipalSessionTested: false, privateDataRead: false,
    };
    break;
  } catch (error) {
    console.log(`Publication check ${attempt}/24: ${error.message.split('\n')[0]}`);
    if (attempt === 24) throw new Error('The expected report workspace could not be certified in production', { cause: error });
    await sleep(15000);
  }
}
fs.writeFileSync('verification/noelia-report-production.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
