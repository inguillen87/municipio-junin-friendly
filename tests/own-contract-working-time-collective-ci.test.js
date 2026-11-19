import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {collectiveWorkingTimeCiOptions} from '../scripts/verify-collective-working-time-ci.mjs';
import {collectiveJobsQaOptions} from '../scripts/lib/own-collective-jobs-qa-options.mjs';

const workflow=fs.readFileSync(new URL('../.github/workflows/own-contract-working-time.yml',import.meta.url),'utf8');
function assertWired(source){
 assert.equal(source.split("'scripts/verify-collective-working-time*'").length-1,2,'Both PR and master push must observe the helper and CLI.');
 const install=source.indexOf('run: node scripts/install-project-chromium.mjs --purpose=release-verification'),collective=source.indexOf('      - name: Verify complete collective declarations and recoverable individual decisions'),sql=source.indexOf('      - name: Complete documented hours, immutable attempts, actual SQL and desktop/mobile browser');
 assert.ok(install>=0&&install<collective&&collective<sql,'Collective traversal must run after admitted Chromium and before the existing SQL/browser traversal.');
 const step=source.slice(collective,sql);
 assert.equal(step.split('node scripts/verify-collective-working-time-ci.mjs --output=verification/collective-working-time-pg${{ matrix.pg }}').length-1,1);
 assert.ok(step.includes('NODE_OPTIONS: --import ./scripts/lib/project-chromium.mjs'));
 assert.ok(!/continue-on-error:|\n\s+if:/.test(step),'The traversal must not be silently skipped or allowed to fail.');
 const artifact=source.slice(source.indexOf('      - uses: actions/upload-artifact@',sql));
 assert.ok(artifact.includes('if: always()'));
 assert.ok(artifact.includes('            verification/collective-working-time-pg${{ matrix.pg }}\n'),'Keep the whole result/failure/screenshot directory.');
 assert.ok(source.includes('pg: [17, 18]'));
}

test('the existing working-time CI runs the synthetic collective traversal with admitted Chromium and always preserves evidence',()=>assertWired(workflow));

test('the CI gate rejects a missing traversal, a later traversal, skipped failures or omitted diagnostics',()=>{
 const start=workflow.indexOf('      - name: Verify complete collective declarations and recoverable individual decisions'),end=workflow.indexOf('      - name: Complete documented hours, immutable attempts, actual SQL and desktop/mobile browser'),block=workflow.slice(start,end);
 for(const changed of[
  workflow.replace('run: node scripts/verify-collective-working-time-ci.mjs --output=verification/collective-working-time-pg${{ matrix.pg }}','run: echo omitted'),
  workflow.replace(block,'')+'\n'+block,
  workflow.replace('        # Source frontend and fictional HTTP envelopes only; no municipal session or SQL.','        continue-on-error: true'),
  workflow.replace('            verification/collective-working-time-pg${{ matrix.pg }}\n',''),
  workflow.replace("'scripts/verify-collective-working-time*'","'scripts/some-other-browser.mjs'")
 ])assert.throws(()=>assertWired(changed));
});

test('the CLI accepts a single contained evidence directory and rejects missing, duplicate and escaping arguments without running browser',()=>{
 const root=path.resolve('synthetic-source-root'),good=collectiveWorkingTimeCiOptions(['--output=verification/collective-working-time-pg17'],root);
 assert.equal(good.root,root);assert.equal(good.output,path.join(root,'verification','collective-working-time-pg17'));
 for(const args of[[],['--output='],['--output=verification'],['--output=verification/../outside'],['--output=../outside'],['--output=verification/good','--output=verification/another'],['--output=verification/good','--skip'],['--output=verification/good\n']])assert.throws(()=>collectiveWorkingTimeCiOptions(args,root));
});

function assertServerSqlWired(source){
 for(const observed of ['assets/own-collective-jobs*','api/internal-own-collective-*','lib/own-collective-jobs*','scripts/verify-own-collective-jobs*','scripts/lib/own-collective-jobs*','scripts/migrations/225-own-collective-jobs.sql','tests/own-collective-jobs*','tests/fixtures/own-collective*']) {
  assert.equal(source.split("'"+observed+"'").length-1,2,'Both PR and master push must observe '+observed);
 }
 const database=source.indexOf('      - name: Prepare the existing disposable QA database');
 const server=source.indexOf('      - name: Verify durable collective jobs with PostgreSQL 17');
 const browser=source.indexOf('      - run: npx --no-install playwright install-deps chromium');
 assert.ok(database>=0&&database<server&&server<browser,'Run durable SQL after database preparation and before browser gates.');
 const block=source.slice(server,browser);
 assert.equal(block.split('if: matrix.pg == 17').length-1,1,'Run SQL225 against the explicitly supported PG17 service.');
 assert.equal(block.split('node scripts/verify-own-collective-jobs.mjs --psql "$(command -v psql)" --transport ci --output verification/collective-server-sql-pg${{ matrix.pg }}/result.json').length-1,1);
 assert.ok(block.includes('PGPASSWORD: noelia-circuit-synthetic-qa'));
 assert.ok(!/continue-on-error:|--skip-benchmark|GITHUB_ACTIONS:/.test(block),'Do not skip the full 848-row gate or simulate a CI environment.');
 const artifacts=source.slice(source.indexOf('      - uses: actions/upload-artifact@',browser));
 assert.ok(artifacts.includes('if: always()'));
 assert.ok(artifacts.includes('            verification/collective-server-sql-pg${{ matrix.pg }}/result.json\n'));
 assert.ok(source.includes('pg: [17, 18]'),'Keep the pre-existing PostgreSQL matrix.');
}

test('the existing CI observes server changes and runs the full durable PostgreSQL 17 gate before browser verification',()=>assertServerSqlWired(workflow));

test('the durable SQL wiring rejects missing paths, skipped scale, relaxed failure handling and missing evidence',()=>{
 for(const changed of [
  workflow.replace("'scripts/migrations/225-own-collective-jobs.sql'","'scripts/migrations/other.sql'"),
  workflow.replace('if: matrix.pg == 17','if: false'),
  workflow.replace('--transport ci --output verification/collective-server-sql','--transport ci --skip-benchmark --output verification/collective-server-sql'),
  workflow.replace('      - name: Verify durable collective jobs with PostgreSQL 17','      - name: Verify durable collective jobs with PostgreSQL 17\n        continue-on-error: true'),
  workflow.replace('            verification/collective-server-sql-pg${{ matrix.pg }}/result.json\n',''),
 ])assert.throws(()=>assertServerSqlWired(changed));
});

test('the default SQL transport preserves the local destination and neutralizes libpq host redirection',()=>{
 const options=collectiveJobsQaOptions(['--psql','/synthetic/psql'],{PGHOSTADDR:'203.0.113.10',PGSERVICE:'external',PGSERVICEFILE:'/external/service',PGOPTIONS:'-c search_path=other'});
 assert.equal(options.transport,'local');assert.equal(options.skipBenchmark,false);
 assert.deepEqual(options.argsForPsql.slice(4,12),['-h','127.0.0.1','-p','55417','-U','postgres','-d','own_payroll_run_qa']);
 assert.match(options.guard,/inet_server_addr\(\) IS DISTINCT FROM '127\.0\.0\.1'::inet/);
 assert.match(options.guard,/inet_server_port\(\) IS DISTINCT FROM 55417/);
 assert.match(options.guard,/server_version_num.*IS DISTINCT FROM 17/);
 assert.match(options.guard,/neon\.project_id/);
 assert.equal(options.processEnv.PGHOSTADDR,'127.0.0.1');assert.equal(options.processEnv.PGOPTIONS,'');
 assert.ok(!Object.hasOwn(options.processEnv,'PGSERVICE'));assert.ok(!Object.hasOwn(options.processEnv,'PGSERVICEFILE'));
});

test('CI SQL transport is explicit and gated, with a fixed client destination and private Docker server guard',()=>{
 assert.throws(()=>collectiveJobsQaOptions(['--psql','/synthetic/psql','--transport','ci'],{}),/GitHub Actions/);
 assert.throws(()=>collectiveJobsQaOptions(['--psql','/synthetic/psql','--transport','ci'],{GITHUB_ACTIONS:'false'}),/GitHub Actions/);
 // Pure option inspection only: this test launches no process and opens no DB.
 const options=collectiveJobsQaOptions(['--psql','/synthetic/psql','--transport','ci'],{GITHUB_ACTIONS:'true'});
 assert.equal(options.transport,'ci');assert.equal(options.skipBenchmark,false);
 assert.deepEqual(options.argsForPsql.slice(4,12),['-h','127.0.0.1','-p','55417','-U','postgres','-d','own_payroll_run_qa']);
 assert.match(options.guard,/inet_server_port\(\) IS DISTINCT FROM 5432/);
 for(const network of ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'])assert.ok(options.guard.includes(network));
 assert.match(options.guard,/current_database\(\) IS DISTINCT FROM 'own_payroll_run_qa'/);
 assert.match(options.guard,/current_user IS DISTINCT FROM 'postgres'.*session_user IS DISTINCT FROM 'postgres'/);
 assert.match(options.guard,/server_version_num.*IS DISTINCT FROM 17/);assert.match(options.guard,/neon\.project_id/);
});

test('SQL options reject ambiguous or external transports without executing a child process',()=>{
 for(const args of [[],['--psql','psql'],['--psql','/synthetic/psql','--transport','remote'],['--psql','/synthetic/psql','--transport'],['--psql','/synthetic/psql','--transport','local','--transport','ci'],['--psql','/synthetic/psql','--host','external.invalid'],['--psql','/synthetic/psql','--output','bad\nfile'],['--psql','/synthetic/psql','--skip-benchmark','--skip-benchmark']])assert.throws(()=>collectiveJobsQaOptions(args,{}));
 assert.equal(collectiveJobsQaOptions(['--psql','/synthetic/psql','--skip-benchmark'],{}).skipBenchmark,true);
});
