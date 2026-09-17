// Real PostgreSQL grammar/constraints/transitions on a disposable loopback CI database.
// This runner never accepts a production URL, Neon hostname or a user-supplied DSN.
import fs from 'node:fs';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const name='municontrol_firmar_synthetic';
assert.equal(process.env.FIRMAR_SYNTHETIC_POSTGRES,'true','Opt in to disposable local PostgreSQL');
const files=['scripts/fixtures/firmar-journal-identity.sql','scripts/migrations/071-firmar-attempt-journal.sql','scripts/fixtures/firmar-journal-checks.sql'];
const source='BEGIN;\nSET LOCAL statement_timeout=\'30s\';SET LOCAL lock_timeout=\'5s\';\n'+files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+'\nROLLBACK;';
const result=spawnSync('psql',['-X','-q','-A','-t','--set=ON_ERROR_STOP=1'],{input:source,encoding:'utf8',timeout:60000,env:{PATH:process.env.PATH,PGHOST:'127.0.0.1',PGPORT:'5432',PGDATABASE:name,PGUSER:'postgres',PGPASSWORD:'synthetic-ci-only'}});
if(result.status!==0){console.error((result.stderr||String(result.error)).slice(-3000));throw Error('Disposable PostgreSQL rehearsal failed; no production operations attempted');}
const jsonLine=result.stdout.split('\n').find(x=>x.trim().startsWith('{'));assert.ok(jsonLine,'Structured evidence required');const report=JSON.parse(jsonLine);assert.equal(report.ok,true);assert.ok(report.checks>=40);assert.equal(report.realSignatures,0);
fs.mkdirSync('verification/firmar-persistence',{recursive:true});fs.writeFileSync('verification/firmar-persistence/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
