import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {patchedChromiumDiagnostic as manifest} from '../scripts/lib/patched-chromium-diagnostic-manifest.mjs';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const projectOption='NODE_OPTIONS: --import ./scripts/lib/project-chromium.mjs';
const workflows=[
 ['.github/workflows/own-art.yml',5],
 ['.github/workflows/payroll-fixed-novelties-release.yml',10],
 ['.github/workflows/own-fiscal-facts.yml',2],
 ['.github/workflows/own-f931-preparation.yml',3],
 ['.github/workflows/own-salary-seniority.yml',2],
 ['.github/workflows/own-period-participation.yml',2],
 ['.github/workflows/own-payroll-liquidation.yml',3],
];
for(const [file,expected] of workflows)test(file+': the native QA preload is scoped to explicit verifier steps',()=>{
 const text=read(file);assert.doesNotMatch(text,/GITHUB_ENV/);
 assert.equal(text.split("'tests/project-chromium-workflow.test.js'").length-1,2,'PR and master changes must run this gate');
 if(file.endsWith('payroll-fixed-novelties-release.yml')){
  assert.match(text,/path: \|\n            verification\/\n            !verification\/release-chromium-157\.0\.8098\.0\/browser\.zip/);
 }else{
  assert.match(text,/verification\/release-chromium-157\.0\.8098\.0\/installation\.json/);
  assert.match(text,/verification\/payroll-formula-transport(?:\/fragmented-regression)?\n/);
 }
 const occurrences=[...text.matchAll(/NODE_OPTIONS: --import \.\/scripts\/lib\/project-chromium\.mjs/g)];
 assert.equal(occurrences.length,expected);
 const starts=[...text.matchAll(/^      - /gm)].map(m=>m.index);let scoped=0;
 for(let index=0;index<starts.length;index++){
  const step=text.slice(starts[index],starts[index+1]??text.length);
  if(!step.includes(projectOption))continue;
  assert.match(step,/^        env:\n(?:          [^\n]+\n)*          NODE_OPTIONS: --import \.\/scripts\/lib\/project-chromium\.mjs$/m);
  assert.match(step,/^\s+(?:- )?run: node scripts\/verify-/m);
  assert.doesNotMatch(step,/^\s+(?:- )?uses:/m);
  assert.doesNotMatch(step,/run: (?:npm|npx|psql|echo)/);
  assert.ok(step.includes('scripts/verify-'));scoped++;
 }assert.equal(scoped,expected);
 assert.match(text,/node scripts\/install-project-chromium\.mjs --purpose=release-verification/);
 assert.match(text,/node scripts\/verify-source-preview-fragmented-transport\.mjs/);
});
test('QA SDK admission matches the unchanged project dependency and immutable browser source',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.devDependencies.playwright,manifest.sdkVersion);
 assert.equal(manifest.version,'157.0.8098.0');
 assert.equal(manifest.sourceRevision,'b4fa1b3baec04505d5a58e8cd1e7927b03cec74b');
 for(const platform of Object.values(manifest.platforms)){
  assert.match(platform.url,/^https:\/\/storage\.googleapis\.com\/chrome-for-testing-public\/157\.0\.8098\.0\//);
  assert.match(platform.archiveSha256,/^[a-f0-9]{64}$/);assert.match(platform.binarySha256,/^[a-f0-9]{64}$/);
 }
});
