import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { REPORT_SMOKE_ORIGIN as origin, reportSmokeRequestPolicy as policy } from '../scripts/noelia-report-network-policy.mjs';

for (const pathname of ['/reportes', '/reportes-rrhh', '/reportes-rrhh.html', '/friendly-data.json', '/manifest.webmanifest', '/favicon.ico', '/assets/report-centre.js', '/assets/islands/report-catalog-ABC.js', '/assets/brand/logo.svg', '/assets/pwa/icon-180.png']) {
  test(`public GET permitted: ${pathname}`, () => assert.equal(policy(origin + pathname, 'GET'), 'public-get'));
}
for (const method of ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']) {
  test(`private API is intercepted, never forwarded: ${method}`, () => assert.equal(policy(origin + '/api/internal-auth', method), 'synthetic-api'));
}
for (const [url, method = 'GET'] of [
  ['https://untrusted.invalid/assets/report-centre.js'],
  ['https://municipio-junin-friendly.vercel.app.evil.invalid/friendly-data.json'],
  ['http://municipio-junin-friendly.vercel.app/friendly-data.json'],
  ['https://user:secret@municipio-junin-friendly.vercel.app/friendly-data.json'],
  [origin + ':8443/friendly-data.json'], [origin + '/friendly-data.json', 'POST'],
  [origin + '/assets/report-centre.js', 'DELETE'], [origin + '/personal'],
  [origin + '/rrhh-data/employees.json'], [origin + '/.env'], [origin + '/friendly-data.json?tenant=other'],
  [origin + '/assets/secrets.json'], [origin + '/assets/%2f..%2fapi.js'],
  [origin + '/reportes#query'], ['not-a-url'], [null], [origin + '/reportes', null],
]) {
  test(`unapproved request is blocked: ${String(url)} ${String(method)}`, () => assert.equal(policy(url, method), 'blocked'));
}
test('local rehearsal and deployed browser share a single policy, no broad JSON fallback', () => {
  const code = fs.readFileSync(new URL('../scripts/verify-noelia-report-live-browser.mjs', import.meta.url), 'utf8');
  assert.match(code, /reportSmokeRequestPolicy\(request\.url\(\), request\.method\(\)\)/);
  assert.match(code, /decision !== 'public-get'/);
  assert.match(code, /if \(!local\)/);
  assert.match(code, /publicAggregateRequests > 0/);
  assert.match(code, /#reportContent:not\(\[hidden\]\)/);
  assert.equal((code.match(/route\.continue\(\)/g) || []).length, 1);
});
test('report workflow does not trigger on intermediate branch pushes or duplicate its build environment', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/noelia-report-workspace.yml', import.meta.url), 'utf8');
  assert.match(workflow, /push:\n    branches: \['master'\]/);
  assert.doesNotMatch(workflow, /chatgpt\/noelia-report-workspace/);
  assert.equal((workflow.match(/npm ci --ignore-scripts/g) || []).length, 1);
  assert.equal((workflow.match(/npx playwright install/g) || []).length, 1);
  assert.equal((workflow.match(/npm run build/g) || []).length, 1);
  assert.doesNotMatch(workflow, /\n  production:/);
  assert.match(workflow, /verify-noelia-report-live-browser\.mjs --local/);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github.event_name == 'pull_request' \}\}/);
  assert.equal((workflow.match(/if: github.event_name == 'push' && github.ref == 'refs\/heads\/master'/g) || []).length, 2);
});
