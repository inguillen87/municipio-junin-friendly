// Fixed loopback QA destination, no connection/executable override.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {noeliaCircuitOptions,noeliaCircuitRuntime} from './lib/noelia-circuit-runtime.mjs';
import {adoptionStreamingProjectionQa} from './lib/adoption-streaming-projection-qa.mjs';

export function verifyAdoptionStreamingProjection(options){
 const root=fs.realpathSync(new URL('..',import.meta.url)),{major,sourceCommit,transport='local'}=options;
 const runtime=noeliaCircuitRuntime({root,major,transport,browser:'none'});
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);if(transport==='ci')assert.equal(sourceCommit,process.env.GITHUB_SHA);
 const destination=path.resolve(options.output);assert.ok(destination.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(destination));
 const args=['-X','-h','127.0.0.1','-p',String(55400+major),'-U','postgres','-d',transport==='ci'?'own_payroll_run_qa':'postgres','-At','-v','ON_ERROR_STOP=1'];
 const run=sql=>spawnSync(runtime.executable,args,{input:sql,encoding:'utf8',env:runtime.environment,maxBuffer:4e6,timeout:60000});
 const guard=run("SELECT jsonb_build_object('major',current_setting('server_version_num')::int/10000,'port',current_setting('port'),'directory',current_setting('data_directory'),'database',current_database())");
 assert.equal(guard.status,0,guard.stderr);const identity=JSON.parse(guard.stdout.trim());assert.equal(identity.major,major);
 if(transport==='local'){assert.equal(identity.port,String(55400+major));assert.equal(fs.realpathSync(identity.directory),fs.realpathSync(path.join(root,'verification','postgresql-qa-20261004','pg'+major+'-data')));assert.equal(identity.database,'postgres');}
 else assert.equal(identity.database,'own_payroll_run_qa');
 const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n?/g,'\n'),schema='mc_qa_stream_'+randomUUID().replaceAll('-','');
 const sql=adoptionStreamingProjectionQa(read,schema);fs.mkdirSync(destination);fs.writeFileSync(path.join(destination,'experiment.sql'),sql);
 const execution=run(sql);fs.writeFileSync(path.join(destination,'stdout.log'),execution.stdout??'');fs.writeFileSync(path.join(destination,'stderr.log'),execution.stderr??'');
 assert.equal(execution.status,0,execution.stderr);const lines=execution.stdout.trim().split(/\r?\n/),result=JSON.parse(lines.find(s=>s.startsWith('{')));
 assert.equal(result.major,major);assert.equal(result.checks,16);assert.equal(lines.at(-1),'t');
 result.schemaRemoved=true;result.sourceCommit=sourceCommit;result.sourceHashes=Object.fromEntries(['scripts/migrations/061-grh-core-source-version.sql','scripts/migrations/144-final-grh-source-revision.sql','scripts/lib/final-source-fingerprint-streaming.mjs'].map(p=>[p,createHash('sha256').update(read(p)).digest('hex')]));
 fs.writeFileSync(path.join(destination,'result.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{const result=verifyAdoptionStreamingProjection(noeliaCircuitOptions(process.argv.slice(2)));console.log(JSON.stringify({major:result.major,checks:result.checks,synthetic:result.synthetic,schemaRemoved:result.schemaRemoved}));}catch(e){console.error(e.stack);process.exitCode=1;}
