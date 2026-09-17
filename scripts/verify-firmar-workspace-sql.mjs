// Disposable loopback PostgreSQL only. No arbitrary DSN, Neon or municipal credentials.
import fs from 'node:fs';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
assert.equal(process.env.FIRMAR_SYNTHETIC_POSTGRES,'true');
const files=['scripts/fixtures/firmar-journal-identity.sql','scripts/migrations/071-firmar-attempt-journal.sql','scripts/migrations/072-firmar-personal-workspace.sql','scripts/fixtures/firmar-workspace-checks.sql'];
const sql="BEGIN;SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='5s';\n"+files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nROLLBACK;';
const result=spawnSync('psql',['-X','-q','-A','-t','--set=ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:60000,env:{PATH:process.env.PATH,PGHOST:'127.0.0.1',PGPORT:'5432',PGDATABASE:'municontrol_firmar_synthetic',PGUSER:'postgres',PGPASSWORD:'synthetic-ci-only'}});
if(result.status!==0){console.error((result.stderr||String(result.error)).slice(-3000));throw Error('Workspace SQL rehearsal failed; no production access attempted');}
const report=JSON.parse(result.stdout.split('\n').find(x=>x.trim().startsWith('{'))||'null');assert.equal(report.ok,true);assert.ok(report.checks>=25);
fs.mkdirSync('verification/firmar-workspace',{recursive:true});fs.writeFileSync('verification/firmar-workspace/sql.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
