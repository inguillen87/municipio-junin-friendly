import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {monthlyDayDeclarationUiCiOptions} from '../scripts/verify-monthly-day-declaration-ui-ci.mjs';

const workflow=fs.readFileSync(new URL('../.github/workflows/own-monthly-day-declaration.yml',import.meta.url),'utf8');
const inherited=fs.readFileSync(new URL('../.github/workflows/municipal-owner-catalog.yml',import.meta.url),'utf8');
const additional=['scripts/verify-own-monthly-day-declaration.mjs','scripts/lib/own-monthly-day-declaration-installation.mjs','scripts/lib/own-monthly-day-declaration-qa.mjs','scripts/lib/monthly-day-declaration-native-only-qa.mjs','scripts/verify-monthly-day-declaration-ui-browser.mjs','scripts/verify-monthly-day-declaration-ui-ci.mjs','.github/workflows/own-monthly-day-declaration.yml'];
const paths=(source,event)=>{const start=source.indexOf('  '+event+':'),end=source.indexOf(event==='pull_request'?'  push:':'permissions:',start);assert.ok(start>=0&&end>start,'Both ordinary PR and master-push triggers must exist.');return [...source.slice(start,end).matchAll(/^      - '([^']+)'$/gm)].map(m=>m[1]);};
const browserCommand='node scripts/verify-monthly-day-declaration-ui-ci.mjs --output=verification/monthly-day-ui-pg${{ matrix.pg }}-${{ matrix.operational_pair_baseline }}';
const sqlCommand='node scripts/verify-own-monthly-day-declaration.mjs --major=${{ matrix.pg }} --transport=ci --source-commit=${{ github.sha }} --operational-pair-baseline=${{ matrix.operational_pair_baseline }} --output=verification/monthly-day-declaration-pg${{ matrix.pg }}-${{ matrix.operational_pair_baseline }}';

function assertWired(source){
 for(const event of ['pull_request','push']){const observed=paths(source,event);for(const p of [...paths(inherited,event),...additional])assert.ok(observed.includes(p),event+' trigger must include '+p);}
 assert.match(source,/push:\n    branches: \['master'\]/);assert.match(source,/permissions:\n  contents: read\nconcurrency:/);assert.match(source,/persist-credentials: false/);
 assert.match(source,/runs-on: ubuntu-24\.04/);assert.match(source,/timeout-minutes: 45/);assert.match(source,/fail-fast: false/);assert.match(source,/pg: \[17, 18\]/);assert.match(source,/operational_pair_baseline: \[pre107, published107\]/);
 assert.match(source,/image: postgres:\$\{\{ matrix\.pg \}\}/);assert.match(source,/POSTGRES_DB: own_payroll_run_qa/);assert.match(source,/CREATE EXTENSION pgcrypto; CREATE ROLE municontrol_actions_runtime_app NOLOGIN NOSUPERUSER NOBYPASSRLS;/);
 assert.match(source,/--health-start-interval 1s --health-start-period 30s --health-interval 1h --health-timeout 5s --health-retries 12/);
 const ordered=['run: npm ci --ignore-scripts','run: node --test --test-reporter=tap tests/own-monthly-day-declaration*.test.js tests/own-period-participation-api.test.js tests/own-period-read-recovery-delay.test.js','run: node scripts/build-friendly.mjs','run: npx --no-install playwright install-deps chromium','node scripts/install-project-chromium.mjs --purpose=release-verification','run: '+browserCommand,'      - name: Prepare only the disposable synthetic service','run: '+sqlCommand,'      - uses: actions/upload-artifact@'];
 let previous=-1;for(const marker of ordered){const at=source.indexOf(marker);assert.ok(at>previous,'Required order: '+marker);previous=at;}
 assert.equal(source.split('run: '+browserCommand).length-1,1);assert.equal(source.split('run: '+sqlCommand).length-1,1);
 const browser=source.slice(source.indexOf('      - name: Typed days'),source.indexOf('      - name: Prepare only'));assert.match(browser,/NODE_OPTIONS: --import \.\/scripts\/lib\/project-chromium\.mjs/);
 const upload=source.slice(source.indexOf('      - uses: actions/upload-artifact@'));
 assert.match(upload,/if: always\(\)/);assert.match(upload,/if-no-files-found: error/);assert.match(upload,/retention-days: 5/);
 for(const entry of ['verification/monthly-day-declaration-pg${{ matrix.pg }}-${{ matrix.operational_pair_baseline }}','verification/monthly-day-ui-pg${{ matrix.pg }}-${{ matrix.operational_pair_baseline }}','verification/release-chromium-157.0.8098.0/installation.json'])assert.ok(upload.includes('            '+entry+'\n'),'Keep full evidence: '+entry);
 assert.ok(upload.includes('name: monthly-day-declaration-pg${{ matrix.pg }}-${{ matrix.operational_pair_baseline }}-${{ github.sha }}'));
 assert.doesNotMatch(source,/npm run build|continue-on-error|\|\|\s*true|--transport=local|--skip|--browser=/);
 assert.equal((source.match(/^\s+if:/gm)||[]).length,1,'Only unconditional always artifact collection may use an if.');
}

test('193 runs all four predecessor/PG combinations with native-only SQL and a separate admitted source browser',()=>assertWired(workflow));

test('193 wiring rejects omitted phases, weakened matrices, unauthorized transports and discarded failure evidence',()=>{
 const mutations=[
  workflow.replace('pg: [17, 18]','pg: [18]'),workflow.replace('operational_pair_baseline: [pre107, published107]','operational_pair_baseline: [published107]'),
  workflow.replace('fail-fast: false','fail-fast: true'),workflow.replace('--health-interval 1h','--health-interval 5s'),
  workflow.replace('--transport=ci','--transport=local'),workflow.replace('--source-commit=${{ github.sha }}','--source-commit=HEAD'),
  workflow.replace('run: '+browserCommand,'run: echo browser omitted'),workflow.replace('run: '+sqlCommand,'run: echo SQL omitted'),
  workflow.replace('node scripts/install-project-chromium.mjs --purpose=release-verification','echo browser installation omitted'),
  workflow.replace('run: node scripts/build-friendly.mjs','run: npm run build'),workflow.replace('        if: always()','        if: success()'),
  workflow.replace('          if-no-files-found: error','          if-no-files-found: ignore'),
  workflow.replace('            verification/monthly-day-ui-pg${{ matrix.pg }}-${{ matrix.operational_pair_baseline }}\n',''),
  workflow.replace('      - name: Actual native-only declarations, independent review and immutable capture','      - name: Actual native-only declarations, independent review and immutable capture\n        continue-on-error: true'),
  workflow.replace("      - 'scripts/verify-own-monthly-day-declaration.mjs'", "      - 'scripts/some-other-verifier.mjs'"),
 ];
 for(const changed of mutations)assert.throws(()=>assertWired(changed));
});

test('193 browser CLI accepts one contained synthetic evidence directory without launching a browser on import',()=>{
 const root=path.resolve('synthetic-monthly-source'),options=monthlyDayDeclarationUiCiOptions(['--output=verification/monthly-day-ui-pg17-pre107'],root);
 assert.equal(options.root,root);assert.equal(options.output,path.join(root,'verification','monthly-day-ui-pg17-pre107'));
 for(const args of [[],['--output='],['--output=verification'],['--output=verification/../outside'],['--output=../outside'],['--output=verification/good','--output=verification/other'],['--output=verification/good','--skip'],['--output=verification/good\n']])assert.throws(()=>monthlyDayDeclarationUiCiOptions(args,root));
});

test('193 browser CLI propagates failures, checks synthetic-only results and does not introduce a database transport',()=>{
 const source=fs.readFileSync(new URL('../scripts/verify-monthly-day-declaration-ui-ci.mjs',import.meta.url),'utf8');
 assert.match(source,/pathToFileURL\(path\.resolve\(process\.argv\[1\]\)\)\.href===import\.meta\.url/);
 for(const key of ['errors.length,0','syntheticHttpOnly,true','sqlExecuted,false','productionVisited,false'])assert.ok(source.includes(key));
 assert.match(source,/await verifyMonthlyDayDeclarationUiBrowser\(options\)/);assert.doesNotMatch(source,/catch\s*\(|process\.exit\(0\)|child_process|DATABASE_URL|postgres|psql|neon/);
});
