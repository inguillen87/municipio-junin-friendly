// Pure workflow/source wiring. No190 import, factory, constructor or SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const workflow=read('.github/workflows/municipal-owner-program.yml');
const digest=value=>createHash('sha256').update(value).digest('hex');
const output='verification/owner-program-pg${{ matrix.pg }}-${{ matrix.baseline }}';
const original='node scripts/verify-municipal-owner-program.mjs --major=${{ matrix.pg }} --transport=ci --source-commit=${{ github.sha }} --operational-pair-baseline=${{ matrix.baseline }} --output='+output;
const census='node scripts/verify-own-payroll-report-census.mjs --major=${{ matrix.pg }} --transport=ci --source-commit=${{ github.sha }} --operational-pair-baseline=published107 --output='+output;
const pure='node --test tests/own-payroll-report-census-qa-rpc.test.js tests/own-payroll-report-census-190-iam-fixture.test.js tests/own-payroll-report-census-190-legacy.test.js tests/own-payroll-report-census-workflow.test.js tests/own-payroll-report-census-program-synthetic.test.js';
function blocks(value){return value.split(/^      - /m).slice(1);}
function check(value){
 const at=value.indexOf('    steps:');assert.ok(at>0);
 // Exact baseline protects the SAME four cells, one PostgreSQL service,
 // repository permissions, concurrency, ports,45min budget and startup health.
 assert.equal(digest(value.slice(0,at)),'e61fd2ec5fbff379d816ddb01b3176e232e39baa64eddee6d8f8e790bfc95132','CENSUS_WORKFLOW_PROTECTED_HEADER_CHANGED');
 const steps=blocks(value),native=steps.filter(step=>/run: node scripts\/verify-/.test(step));assert.equal(native.length,2);
 const pre=native.find(step=>step.includes('run: '+original)),published=native.find(step=>step.includes('run: '+census));assert.ok(pre&&published);
 assert.ok(pre.includes("if: matrix.baseline == 'pre107'"));assert.ok(published.includes("if: matrix.baseline == 'published107'"));
 for(const baseline of['pre107','published107']){
  const selected=native.filter(step=>step.includes("if: matrix.baseline == '"+baseline+"'"));assert.equal(selected.length,1,'CENSUS_WORKFLOW_NATIVE_INVOCATION_DUPLICATED');
  for(const major of[17,18]){const command=selected[0].match(/run: ([^\n]+)/)[1].replaceAll('${{ matrix.pg }}',String(major)).replaceAll('${{ matrix.baseline }}',baseline);assert.ok(command.includes('--major='+major+' --transport=ci --source-commit=${{ github.sha }}'));assert.ok(command.endsWith('--output=verification/owner-program-pg'+major+'-'+baseline));}
 }
 for(const step of native)assert.ok(step.includes('NODE_OPTIONS: --import ./scripts/lib/project-chromium.mjs'));
 const pureStep=steps.filter(step=>step.includes('run: '+pure));assert.equal(pureStep.length,1);assert.equal(pureStep[0].match(/run: ([^\n]+)/)[1],pure);
 for(const token of['persist-credentials: false','npm ci --ignore-scripts','npm run build','CREATE EXTENSION pgcrypto; CREATE ROLE municontrol_actions_runtime_app NOLOGIN NOSUPERUSER NOBYPASSRLS;','npx --no-install playwright install-deps chromium','node scripts/install-project-chromium.mjs --purpose=release-verification'])assert.ok(value.includes(token),token);
 assert.ok(value.indexOf('run: '+pure)<value.indexOf('run: npm run build'));assert.ok(value.indexOf('--purpose=release-verification')<value.indexOf('run: '+original));
 const uploads=steps.filter(step=>step.startsWith('uses: actions/upload-artifact@'));assert.equal(uploads.length,2);
 const preUpload=uploads.find(step=>step.includes("if: always() && matrix.baseline == 'pre107'")),publishedUpload=uploads.find(step=>step.includes("if: always() && matrix.baseline == 'published107'"));assert.ok(preUpload&&publishedUpload);
 for(const step of uploads){assert.ok(step.includes('name: municipal-owner-program-pg${{ matrix.pg }}-${{ matrix.baseline }}-${{ github.sha }}'));assert.ok(step.includes('retention-days: 5'));assert.doesNotMatch(step,/\.handoff|\.private|\.gz|\.ogg|verification\/\*\*/);}
 assert.ok(preUpload.includes(output+'/*.json'));assert.ok(preUpload.includes(output+'/*failure.txt'));assert.ok(preUpload.includes(output+'/*.png'));assert.doesNotMatch(preUpload,/\.sql\b/);
 assert.ok(publishedUpload.includes('            '+output+'/\n'),'CENSUS_WORKFLOW_FULL_EVIDENCE_DIRECTORY_REQUIRED');
 for(const file of['scripts/migrations/200-own-payroll-report-census.sql','scripts/lib/own-payroll-report-census-installation.mjs','scripts/lib/own-payroll-report-census-authority.mjs','scripts/lib/own-payroll-report-census-ledger.mjs','scripts/lib/own-payroll-report-census-190-continuation.mjs','scripts/lib/own-payroll-report-census-067-runtime-fixture.mjs','tests/fixtures/own-payroll-report-census-legacy-synthetic.js','tests/fixtures/own-payroll-report-census-program-synthetic.js','tests/own-payroll-report-census-program-synthetic.test.js','scripts/lib/own-payroll-report-census-190-iam-fixture.mjs','scripts/lib/own-payroll-report-census-qa-rpc.mjs','scripts/verify-own-payroll-report-census.mjs','tests/own-payroll-report-census-190-legacy.test.js','tests/own-payroll-report-census-workflow.test.js'])assert.ok(publishedUpload.includes('            '+file+'\n'),'CENSUS_WORKFLOW_SOURCE_ARTIFACT_REQUIRED:'+file);
 assert.doesNotMatch(value,/secrets\.|pull_request_target|continue-on-error|contents: write|id-token: write|DATABASE_URL|connectionString|skip-check/);
}
test('same four190 cells execute originalpre107 or full190+censuspublished107 exactly once',()=>check(workflow));
test('conditional, matrix, SHA or full evidence weakening fails the source contract',()=>{
 for(const mutate of[value=>value.replace("if: matrix.baseline == 'published107'","if: matrix.baseline == 'pre107'"),value=>value.replace('pg: [17, 18]','pg: [17]'),value=>value.replace(census,census.replace('--source-commit=${{ github.sha }}','--source-commit=HEAD')),value=>value.replace('            '+output+'/\n','            '+output+'/*.json\n'),value=>value.replace('            scripts/migrations/200-own-payroll-report-census.sql\n','')])assert.throws(()=>check(mutate(workflow)));
});
test('ordinary reports workflow admits candidate evidence without replacing its existing gates; source closure admits this pure contract',()=>{
 assert.equal(digest(read('.github/workflows/own-payroll-reports.yml')),'3c4ed22b5afc20af7d513f143ce86d612df9b7a8092129f17c68a688ee8331db');
 const runner=read('scripts/verify-own-payroll-report-census.mjs');assert.ok(runner.includes("'tests/own-payroll-report-census-workflow.test.js'"));assert.ok(runner.includes('continuation:runOwnReportCensus190Continuation,continuationEntries:entries'));
 for(const file of['tests/fixtures/own-payroll-report-census-program-synthetic.js','tests/own-payroll-report-census-program-synthetic.test.js'])assert.ok(runner.includes("'"+file+"'"));
});
