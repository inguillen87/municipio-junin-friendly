import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {NOELIA_CI_PASSWORD, noeliaCircuitRuntime, noeliaCircuitOptions} from '../scripts/lib/noelia-circuit-runtime.mjs';
import {createOwnPayrollPsqlQa} from '../scripts/lib/own-payroll-psql-qa.mjs';
import {buildOwnPayrollDurableQa} from '../scripts/lib/own-payroll-durable-qa.mjs';
const root=path.resolve(import.meta.dirname,'..'),sha='a'.repeat(40);
const ci={platform:'linux',env:{CI:'true',GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'1001',GITHUB_SHA:sha,GITHUB_WORKSPACE:'/qa',PGHOST:'remote.invalid',PGDATABASE:'neondb',PGPASSWORD:'must-not-use',PGOPTIONS:'-c role=unknown',PGSERVICE:'unknown',PATH:'/usr/bin'},realpath:p=>p==='/usr/bin/psql'?'/usr/share/postgresql-common/pg_wrapper':p};

test('CI uses only the fixed loopback client and its synthetic credential, clearing ambient PostgreSQL settings',()=>{
 const r=noeliaCircuitRuntime({root:'/qa',major:17,transport:'ci',browser:'chromium'},ci);
 assert.equal(r.executable,'/usr/bin/psql');assert.equal(r.environment.PGPASSWORD,NOELIA_CI_PASSWORD);
 for(const key of ['PGHOST','PGDATABASE','PGOPTIONS','PGSERVICE'])assert.equal(r.environment[key],undefined);
 assert.equal(ci.env.PGPASSWORD,'must-not-use');assert.equal(r.environment.PGCLIENTENCODING,'UTF8');assert.equal(r.environment.PATH,'/usr/bin');assert.ok(Object.isFrozen(r.environment));
});
test('CI refuses local sessions, incomplete context, other workspaces, other clients and Chrome',()=>{
 for(const patch of [{platform:'win32'},{env:{...ci.env,CI:'false'}},{env:{...ci.env,GITHUB_ACTIONS:'false'}},{env:{...ci.env,GITHUB_RUN_ID:''}},{env:{...ci.env,GITHUB_SHA:'master'}},{env:{...ci.env,GITHUB_WORKSPACE:'/other'}},{realpath:p=>p==='/usr/bin/psql'?'/tmp/psql':p}])
  assert.throws(()=>noeliaCircuitRuntime({root:'/qa',major:18,transport:'ci',browser:'chromium'},{...ci,...patch}));
 assert.throws(()=>noeliaCircuitRuntime({root:'/qa',major:17,transport:'ci',browser:'chrome'},ci));
});
test('local mode retains the exact existing Windows bundle and cannot use the CI password',()=>{
 const context={platform:'win32',env:{PGPASSWORD:'must-not-use',PGSERVICEFILE:'unknown'},realpath:p=>p};
 const r=noeliaCircuitRuntime({root:'C:\\qa',major:18,browser:'chrome'},context);
 assert.equal(r.executable,'C:\\qa\\verification\\postgresql-qa-20261004\\pg18\\pgsql\\bin\\psql.exe');assert.equal(r.environment.PGPASSWORD,undefined);assert.equal(r.environment.PGSERVICEFILE,undefined);
 assert.throws(()=>noeliaCircuitRuntime({root:'/qa',major:17},ci),/QA_LOCAL_WINDOWS_REQUIRED/);
});
test('CLI requires an exact source and rejects unknown, duplicate and misleading options',()=>{
 const base=['--major=17','--output=verification/qa','--source-commit='+sha];
 assert.deepEqual(noeliaCircuitOptions(base),{major:17,output:'verification/qa',sourceCommit:sha,browser:'none',transport:'local',positions:false,jurisdictions:false});
 assert.equal(noeliaCircuitOptions([...base,'--transport=ci','--browser=chromium','--positions=true','--jurisdictions=true']).positions,true);
 for(const arg of ['--host=remote.invalid','--psql=/tmp/psql','--major=18','--browser=firefox','--transport=remote','--positions=false','--jurisdictions=0'])assert.throws(()=>noeliaCircuitOptions([...base,arg]));
 for(const invalid of [base.filter(v=>!v.startsWith('--source-commit')),['--major=19',...base.slice(1)],['--major=17','--output=verification/qa','--source-commit=master']])assert.throws(()=>noeliaCircuitOptions(invalid));
});
test('destination and query allowlists still reject production ports, names and mutators before any connection',async()=>{
 const qa=buildOwnPayrollDurableQa(17),options={executable:'must-not-execute',major:17,port:55417,schema:qa.schema,pins:qa.pins};
 for(const patch of [{port:5432},{schema:'public'},{pins:qa.pins.replace('own_payroll_run_qa','neondb')},{pins:qa.pins.replace('neon.project_id','unknown')}])assert.throws(()=>createOwnPayrollPsqlQa({...options,...patch}));
 const db=createOwnPayrollPsqlQa(options);
 for(const query of ['DELETE FROM public.own_payroll_run_result','SELECT public.own_novelty_private_v1($1) AS result'])await assert.rejects(db.query(query,['qa']));
 assert.deepEqual(db.connections,[]);
});
test('invalid CLI options report a failure instead of silently executing a smaller circuit',()=>{
 const r=spawnSync(process.execPath,['scripts/verify-noelia-payroll-circuit.mjs','--major=17','--host=remote.invalid'],{cwd:root,encoding:'utf8'});
 assert.equal(r.status,1);assert.equal(JSON.parse(r.stderr.trim()).passed,false);
});
test('release CI covers both majors, complete jurisdiction/position/browser circuit, minimal permissions and synthetic evidence',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/noelia-payroll-circuit.yml',import.meta.url),'utf8');
 assert.match(workflow,/major: \[17, 18\]/);assert.match(workflow,/run: npm run build/);
 assert.match(workflow,/--transport=ci.*--source-commit=\$\{\{ github.sha \}\}.*--browser=chromium.*--jurisdictions=true.*--positions=true/);
 assert.match(workflow,/contents: read/);assert.doesNotMatch(workflow,/secrets\.|pull_request_target|continue-on-error|vercel|neon|id-token: write|contents: write/);
 assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/if: always\(\)/);assert.match(workflow,/upload-artifact@[a-f0-9]{40}/);
 assert.doesNotMatch(workflow,/path: verification\/\*\*|\.sql\s*$/m);
 const passwords=[...workflow.matchAll(/(?:POSTGRES_PASSWORD|PGPASSWORD): (.+)/g)].map(m=>m[1]);assert.deepEqual(passwords,[NOELIA_CI_PASSWORD,NOELIA_CI_PASSWORD]);
});
