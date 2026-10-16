import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ownerAuthorityQaOptions,ownerAuthorityQaSourceClosure} from '../scripts/verify-municipal-owner-adoption-authority.mjs';
import {OWNER_SALARY_QA_ENTRIES,ownerSalaryQaOptions} from '../scripts/verify-municipal-owner-salary.mjs';
import {buildOwnerSalaryQa} from '../scripts/lib/municipal-owner-salary-qa.mjs';
import {buildOwnerSalaryQaComponent} from '../scripts/lib/municipal-owner-salary-browser.mjs';

const file='.github/workflows/municipal-owner-salary.yml';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const workflow=read(file);
function paths(candidate,section){
 const start=candidate.indexOf('  '+section+':');
 const end=section==='pull_request'?candidate.indexOf('  push:'):candidate.indexOf('permissions:');
 assert.ok(start>=0&&end>start);
 return [...candidate.slice(start,end).matchAll(/^      - '([^']+)'$/gm)].map(m=>m[1]);
}
const matches=(pattern,p)=>new RegExp('^'+pattern.split('**').map(v=>v.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','[^/]*')).join('.*')+'$').test(p);
function triggerCoverage(candidate,files){
 for(const section of ['pull_request','push']){
  const patterns=paths(candidate,section);assert.ok(patterns.length>0);
  for(const p of files)assert.ok(patterns.some(pattern=>matches(pattern,p)),'WORKFLOW_TRIGGER_MISSING:'+section+':'+p);
 }
 assert.deepEqual(paths(candidate,'pull_request'),paths(candidate,'push'));
}

test('188 CI triggers cover the actual imported closure, every constructor source, real React component and its workflow test',async()=>{
 const qa=buildOwnerSalaryQa({major:17,sourceCommit:'a'.repeat(40),read});
 assert.equal(qa.connects,false);assert.equal(qa.executesSql,false);
 const component=await buildOwnerSalaryQaComponent(process.cwd());
 const closure=ownerAuthorityQaSourceClosure({entries:OWNER_SALARY_QA_ENTRIES,additional:[...Object.keys(qa.sourceHashes),...Object.keys(component.sources),'.vercelignore','scripts/build-friendly.mjs','package.json','package-lock.json']});
 for(const entry of[file,'tests/municipal-owner-salary-workflow.test.js']){assert.ok(OWNER_SALARY_QA_ENTRIES.includes(entry));assert.ok(closure.files[entry]);}
 assert.equal(component.publicBuild,false);
 assert.ok(Object.keys(closure.files).length>=425);
 const files=[...Object.keys(closure.files),file,'.nvmrc','scripts/install-project-chromium.mjs'];
 triggerCoverage(workflow,files);
 assert.throws(()=>triggerCoverage(workflow.replaceAll("      - 'scripts/verify-municipal-owner-salary.mjs'\n",''),files),/WORKFLOW_TRIGGER_MISSING:pull_request:scripts\/verify-municipal-owner-salary\.mjs/);
 assert.throws(()=>triggerCoverage(workflow.replaceAll("      - 'scripts/fixtures/**'\n",''),files),/WORKFLOW_TRIGGER_MISSING:pull_request:scripts\/fixtures\//);
 assert.throws(()=>triggerCoverage(workflow.replaceAll("      - 'src/islands/**'\n",''),files),/WORKFLOW_TRIGGER_MISSING:pull_request:src\/islands\//);
});

test('188 CI uses a disposable PG17/18 matrix, pinned actions and no provider credentials or failure waiver',()=>{
 assert.match(workflow,/pg: \[17, 18\]/);assert.match(workflow,/fail-fast: false/);
 assert.match(workflow,/runs-on: ubuntu-24\.04/);assert.match(workflow,/branches: \['master'\]/);
 assert.match(workflow,/image: postgres:\$\{\{ matrix.pg \}\}/);
 assert.match(workflow,/ports: \['554\$\{\{ matrix.pg \}\}:5432'\]/);
 assert.match(workflow,/POSTGRES_DB: own_payroll_run_qa/);
 assert.match(workflow,/CREATE EXTENSION pgcrypto; CREATE ROLE municontrol_actions_runtime_app NOLOGIN NOSUPERUSER NOBYPASSRLS;/);
 assert.match(workflow,/contents: read/);assert.match(workflow,/persist-credentials: false/);
 assert.match(workflow,/npm ci --ignore-scripts/);assert.match(workflow,/npm run build/);
 for(const m of workflow.matchAll(/uses: ([^\s]+)/g))assert.match(m[1],/@[a-f0-9]{40}$/);
 assert.doesNotMatch(workflow,/secrets\.|pull_request_target|continue-on-error|id-token: write|contents: write|force|skip-check|DATABASE_URL|connectionString/i);
});

test('the single canonical 188 circuit uses explicit CI transport and exact head with the admitted browser',()=>{
 const commands=[...workflow.matchAll(/run: node (scripts\/verify-[^\n]+)/g)].map(m=>m[1]);
 assert.equal(commands.length,1);
 const expected='scripts/verify-municipal-owner-salary.mjs --major=${{ matrix.pg }} --transport=ci --source-commit=${{ github.sha }} --operational-pair-baseline=${{ matrix.baseline }} --output=verification/owner-salary-pg${{ matrix.pg }}-${{ matrix.baseline }}';
 assert.equal(commands[0],expected);
 for(const major of [17,18])for(const operationalPairBaseline of['pre107','published107']){
  const args=commands[0].replaceAll('${{ matrix.pg }}',String(major)).replaceAll('${{ matrix.baseline }}',operationalPairBaseline).replaceAll('${{ github.sha }}','a'.repeat(40)).split(' ').slice(1);
  const expected={major,output:'verification/owner-salary-pg'+major+'-'+operationalPairBaseline,sourceCommit:'a'.repeat(40),transport:'ci',operationalPairBaseline};assert.deepEqual(ownerSalaryQaOptions(ownerAuthorityQaOptions(args)),expected);
 }
 assert.match(workflow,/baseline: \[pre107, published107\]/);assert.ok(workflow.includes(' / ${{ matrix.baseline }}'));assert.ok(workflow.includes('municipal-owner-salary-pg${{ matrix.pg }}-${{ matrix.baseline }}-${{ github.sha }}'));
 for(const operationalPairBaseline of['auto','PRE107','published107 ',null])assert.throws(()=>ownerSalaryQaOptions({major:17,output:'verification/invalid-baseline-only',sourceCommit:'a'.repeat(40),operationalPairBaseline}),/OPERATIONAL_PAIR_BASELINE_REQUIRED/);
 assert.equal([...workflow.matchAll(/NODE_OPTIONS: --import \.\/scripts\/lib\/project-chromium\.mjs/g)].length,1);
 assert.ok(workflow.indexOf('mkdir -p verification')<workflow.indexOf('node scripts/install-project-chromium.mjs'));
 assert.ok(workflow.indexOf('--purpose=release-verification')<workflow.indexOf(commands[0]));
 assert.match(workflow,/npx --no-install playwright install-deps chromium/);
 assert.doesNotMatch(commands[0],/--(?:host|port|database|connection|skip|ignore|no-browser|no-sql)=/);
});

test('readiness remains enabled without injecting periodic health clients during the guarded QA interval',()=>{
 const validate=candidate=>{
  const seconds=flag=>{const m=new RegExp('--'+flag+' ([1-9][0-9]*)(s|m|h)\\b').exec(candidate);assert.ok(m,'HEALTH_DURATION_REQUIRED:'+flag);return Number(m[1])*({s:1,m:60,h:3600}[m[2]]);};
  const jobSeconds=Number(/timeout-minutes: ([1-9][0-9]*)/.exec(candidate)?.[1])*60;
  assert.ok(Number.isSafeInteger(jobSeconds)&&jobSeconds>0);
  assert.match(candidate,/--health-cmd "pg_isready -U postgres -d own_payroll_run_qa"/);
  assert.doesNotMatch(candidate,/--no-healthcheck|--health-cmd (?:none|NONE)/);
  assert.ok(seconds('health-start-interval')<=seconds('health-start-period'));
  assert.ok(seconds('health-start-period')<=60);
  assert.ok(seconds('health-interval')>jobSeconds,'PERIODIC_HEALTH_CLIENT_INSIDE_QA_WINDOW');
  assert.ok(seconds('health-timeout')>0);assert.match(candidate,/--health-retries [1-9][0-9]*\b/);
 };
 validate(workflow);
 assert.throws(()=>validate(workflow.replace('--health-interval 1h','--health-interval 5s')),/PERIODIC_HEALTH_CLIENT_INSIDE_QA_WINDOW/);
 assert.throws(()=>validate(workflow.replace(/--health-cmd "[^"]+"/,'--no-healthcheck')),{code:'ERR_ASSERTION'});
});

test('artifacts retain complete synthetic result, failure, screenshot and browser admission evidence without SQL or private uploads',()=>{
 assert.match(workflow,/if: always\(\)/);assert.match(workflow,/retention-days: 5/);
 const block=workflow.slice(workflow.indexOf('          path: |'));
 const paths=[...block.matchAll(/^            ([^\r\n]+)$/gm)].map(m=>m[1]);
 assert.deepEqual(paths,[
  'verification/owner-salary-pg${{ matrix.pg }}-${{ matrix.baseline }}/*.json',
  'verification/owner-salary-pg${{ matrix.pg }}-${{ matrix.baseline }}/*failure.txt',
  'verification/owner-salary-pg${{ matrix.pg }}-${{ matrix.baseline }}/*.png',
  'verification/release-chromium-157.0.8098.0/installation.json'
 ]);
 assert.doesNotMatch(block,/\.handoff|verification\/\*\*|\.sql\b|\.private|\.ogg|\.gz|\.csv/);
});
