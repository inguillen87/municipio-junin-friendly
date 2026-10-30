import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const origin = 'https://municontrol.com';
const files = ['reportes-rrhh.html','assets/report-centre.js',
  'assets/payroll-monthly-summary-model.js','assets/payroll-monthly-summary-export.js',
  'assets/payroll-monthly-summary.js','assets/payroll-monthly-summary.css'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// The build transforms HTML and report-centre; compare the artefacts actually shipped.
const releaseBytes = fs.readFileSync(new URL('../public/release-info.json',import.meta.url));
const release = JSON.parse(releaseBytes);
assert.equal(release.version,'municontrol-release.v1');
assert.equal(release.sourceState,'committed','MONTHLY_SOURCE_COMMITTED_BUILD_REQUIRED');
assert.match(release.commitSha,/^[a-f0-9]{40}$/,'MONTHLY_SOURCE_BUILD_COMMIT_REQUIRED');
const commit = process.env.GITHUB_SHA || release.commitSha;
assert.equal(release.commitSha,commit,'MONTHLY_SOURCE_BUILD_COMMIT_MISMATCH');
const expected = Object.fromEntries(files.map(file => [file,hash(fs.readFileSync(new URL('../public/'+file,import.meta.url)))]));
const route = file => file === 'reportes-rrhh.html' ? '/reportes' : '/'+file;
async function publicRead(pathname) {
  return fetch(origin+pathname+'?release='+encodeURIComponent(commit), {method:'GET',credentials:'omit',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000)});
}
async function releaseMatches() {
  const response = await publicRead('/release-info.json');
  return response.status === 200 && Buffer.from(await response.arrayBuffer()).equals(releaseBytes);
}
const deadline = Date.now()+240000;
let ready = false;
while (Date.now()<deadline) {
  try {
    if (await releaseMatches()) {
      const results = await Promise.all(files.map(async file => {
        const response = await publicRead(route(file));
        return response.status === 200 && hash(Buffer.from(await response.arrayBuffer())) === expected[file];
      }));
      if (results.every(Boolean) && await releaseMatches()) { ready=true; break; }
    }
  } catch { /* Deployment transition; only retry immutable public asset reads. */ }
  await new Promise(resolve=>setTimeout(resolve,5000));
}
if (!ready) throw Error('MONTHLY_SOURCE_PUBLISHED_ASSET_MISMATCH');
async function privateCheck(query) {
  const response = await fetch(origin+'/api/internal-payroll-monthly-source-summary'+query, {method:'GET',credentials:'omit',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000)});
  if (![401,403].includes(response.status)) throw Error('MONTHLY_SOURCE_ANONYMOUS_ACCESS_NOT_DENIED');
  if (!/no-store/.test(response.headers.get('cache-control') || '')) throw Error('MONTHLY_SOURCE_PRIVATE_CACHE_HEADERS_MISSING');
  return response.status;
}
const statuses = {
  anonymousCatalog:await privateCheck('?resource=catalog'),
  anonymousSummary:await privateCheck('?resource=summary&period=2026-08&datasetIds=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
};
assert.ok(await releaseMatches(),'MONTHLY_SOURCE_RELEASE_CHANGED');
fs.mkdirSync('verification',{recursive:true});
const result = {commit,checkedAt:new Date().toISOString(),origin,publishedAssetsMatch:true,expected,statuses,buildReleaseVerified:true,
  realMunicipalSessionTested:false,realMonthlyCloseApproved:false,physicalClockTested:false};
fs.writeFileSync('verification/payroll-monthly-summary-production.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({commit,checkedAt:result.checkedAt,publishedAssetsMatch:true,statuses,realMunicipalSessionTested:false}));
