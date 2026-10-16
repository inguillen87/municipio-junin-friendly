import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ownerAuthorityQaOptions,ownerAuthorityQaSourceClosure} from '../scripts/verify-municipal-owner-adoption-authority.mjs';
import {MONTHLY_DAY_POLICY_QA_ENTRIES,monthlyDayPolicyQaOptions} from '../scripts/verify-own-monthly-day-policy.mjs';
import {buildMonthlyDayPolicyQa} from '../scripts/lib/own-monthly-day-policy-qa.mjs';

const file='.github/workflows/own-monthly-day-policy.yml';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const workflow=read(file);
function triggers(value,section){
 const start=value.indexOf('  '+section+':'),end=section==='pull_request'?value.indexOf('  push:'):value.indexOf('permissions:');
 assert.ok(start>=0&&end>start);
 return [...value.slice(start,end).matchAll(/^      - '([^']+)'$/gm)].map(m=>m[1]);
}
function assertCoverage(value,files){
 for(const section of ['pull_request','push'])for(const p of files)
  assert.ok(triggers(value,section).some(pattern=>path.matchesGlob(p,pattern)),'MONTHLY_DAY_CI_SOURCE_UNCOVERED:'+section+':'+p);
 assert.deepEqual(triggers(value,'pull_request'),triggers(value,'push'));
}
test('monthly-day CI reruns when any real source dependency changes, without connecting in its constructor',()=>{
 const qa=buildMonthlyDayPolicyQa({major:17,sourceCommit:'a'.repeat(40),read,operationalPairBaseline:'pre107'});
 assert.equal(qa.connects,false);assert.equal(qa.executesSql,false);
 const closure=ownerAuthorityQaSourceClosure({entries:MONTHLY_DAY_POLICY_QA_ENTRIES,additional:[...Object.keys(qa.sourceHashes),'package.json','package-lock.json','.nvmrc','.vercelignore']});
 for(const p of [file,'tests/own-monthly-day-policy-workflow.test.js','scripts/migrations/192-own-monthly-day-full-month-policy.sql','assets/native-employment-lifecycle-model.js','assets/native-employee-contract.js'])
  assert.ok(closure.files[p],'MONTHLY_DAY_CI_REQUIRED_SOURCE_MISSING:'+p);
 const files=Object.keys(closure.files);assertCoverage(workflow,files);
 assert.throws(()=>assertCoverage(workflow.replaceAll("      - 'scripts/**'\n",''),files),/MONTHLY_DAY_CI_SOURCE_UNCOVERED/);
 assert.throws(()=>assertCoverage(workflow.replaceAll("      - 'assets/**'\n",''),files),/MONTHLY_DAY_CI_SOURCE_UNCOVERED/);
});
test('all four workflow invocations pass the actual CI-only option gate and pin the source and baseline',()=>{
 const command=[...workflow.matchAll(/run: node (scripts\/verify-[^\n]+)/g)].map(m=>m[1]);
 assert.equal(command.length,1);assert.ok(command[0].startsWith('scripts/verify-own-monthly-day-policy.mjs '));
 for(const major of [17,18])for(const baseline of ['pre107','published107']){
  const expanded=command[0].replaceAll('${{ matrix.pg }}',String(major)).replaceAll('${{ matrix.baseline }}',baseline).replaceAll('${{ github.sha }}','a'.repeat(40));
  const options=monthlyDayPolicyQaOptions(ownerAuthorityQaOptions(expanded.split(' ').slice(1)));
  assert.deepEqual(options,{major,sourceCommit:'a'.repeat(40),transport:'ci',operationalPairBaseline:baseline,output:'verification/monthly-day-policy-pg'+major+'-'+baseline});
  assert.throws(()=>monthlyDayPolicyQaOptions({...options,transport:'local'}));
  const {operationalPairBaseline,...withoutBaseline}=options;assert.throws(()=>monthlyDayPolicyQaOptions(withoutBaseline));
 }
 assert.match(workflow,/pg: \[17, 18\]/);assert.match(workflow,/baseline: \[pre107, published107\]/);
 assert.match(workflow,/fail-fast: false/);assert.match(workflow,/persist-credentials: false/);
 for(const m of workflow.matchAll(/uses: ([^\s]+)/g))assert.match(m[1],/@[a-f0-9]{40}$/);
 assert.doesNotMatch(workflow,/secrets\.|pull_request_target|continue-on-error|contents: write|id-token: write|DATABASE_URL|connectionString/);
});
test('the disposable service health probe cannot add an unrelated SQL client during the guarded protocol',()=>{
 const validate=value=>{
  const seconds=name=>{const m=new RegExp('--'+name+' ([1-9][0-9]*)(s|m|h)\\b').exec(value);assert.ok(m);return Number(m[1])*({s:1,m:60,h:3600}[m[2]]);};
  const deadline=Number(/timeout-minutes: ([1-9][0-9]*)/.exec(value)?.[1])*60;
  assert.ok(Number.isFinite(deadline)&&deadline>0);
  assert.ok(seconds('health-start-interval')<=seconds('health-start-period'));
  assert.ok(seconds('health-start-period')<=60);
  assert.ok(seconds('health-interval')>deadline,'MONTHLY_DAY_CI_PERIODIC_CLIENT');
  assert.match(value,/--health-cmd "pg_isready -U postgres -d own_payroll_run_qa"/);
 };
 validate(workflow);assert.throws(()=>validate(workflow.replace('--health-interval 1h','--health-interval 5s')),/MONTHLY_DAY_CI_PERIODIC_CLIENT/);
 assert.ok(workflow.includes("ports: ['554${{ matrix.pg }}:5432']"));
 assert.ok(workflow.includes('CREATE EXTENSION pgcrypto; CREATE ROLE municontrol_actions_runtime_app NOLOGIN NOSUPERUSER NOBYPASSRLS;'));
});
test('failed synthetic runs retain their result and native logs without uploading private source packets',()=>{
 assert.match(workflow,/if: always\(\)/);assert.match(workflow,/if-no-files-found: error/);assert.match(workflow,/retention-days: 5/);
 const block=workflow.slice(workflow.indexOf('          path: |'));
 assert.doesNotMatch(block,/\.handoff|\.private|\.sql\b|\.gz|\.ogg|verification\/\*\*/);
 assert.match(block,/\/\*\.json/);assert.match(block,/\/\*failure\.txt/);assert.match(block,/\/\*\.log/);
});
