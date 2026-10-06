// Exact conservative batch in an existing guarded disposable loopback QA DB.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';import {createOwnPayrollPsqlQa} from './lib/own-payroll-psql-qa.mjs';import {buildOwnNoveltyInstallation,assertOwnNoveltyDurability} from './lib/own-novelties-installation.mjs';
import {buildOwnNoveltyQa} from './lib/own-novelties-qa.mjs';
const root=path.resolve(import.meta.dirname,'..'),opts={};for(const a of process.argv.slice(2)){const m=/^--(major|psql|output)=(.+)$/.exec(a);assert.ok(m);assert.equal(opts[m[1]],undefined);opts[m[1]]=m[2];}const major=Number(opts.major);assert.ok([17,18].includes(major));const output=path.resolve(opts.output);assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
const qa=buildOwnNoveltyQa(major),db=createOwnPayrollPsqlQa({executable:opts.psql,major,port:55400+major,schema:qa.schema,pins:qa.pins}),execute=promisify(execFile),sourceCommit='a'.repeat(40),batch=buildOwnNoveltyInstallation({read:f=>fs.readFileSync(path.join(root,f),'utf8'),sourceCommit});let seeded=false,report,stage='seed';
const relocate=s=>s.replaceAll('public.',qa.schema+'.').replaceAll(qa.schema+'.digest(','public.digest(').replaceAll("'public'::regnamespace",q(qa.schema)+'::regnamespace')
 .replaceAll("s.nspname='public'",'s.nspname='+q(qa.schema))
 .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+qa.schema+',public,pg_temp')
 .replaceAll('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+qa.schema+', public, pg_temp')
 .replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(qa.schema+'.')+",'public'||'.')");
try{const seed=output.replace('.json','-seed.sql');fs.writeFileSync(seed,qa.sql,{flag:'wx'});await execute(opts.psql,[...db.args,'-f',seed],{timeout:90000,maxBuffer:5*1024*1024,windowsHide:true});seeded=true;
 stage='preflight';await db.run(relocate(batch.preflight.join(';'))+';SELECT to_jsonb(true)');stage='installation';const installed=await db.run(relocate(batch.installation.join(';')));stage='independent_durability';const durable=await db.run(relocate(batch.durableVerification.join(';')));const validation=assertOwnNoveltyDurability({installed,durable,sourceCommit});
 stage='negative_metadata';await assert.rejects(db.run('ALTER FUNCTION '+qa.schema+'.own_novelty_detail_v1(jsonb,uuid) COST 101;'+relocate(batch.afterPins)),/SQL130_METADATA_CHANGED/);
 stage='negative_prerequisite';await assert.rejects(db.run('ALTER FUNCTION '+qa.schema+'.native_employment_change_context_v1(jsonb,text) COST 101;'+relocate(batch.durableVerification.join(';'))),/SQL130_METADATA_CHANGED/);
 stage='duplicate_installation';await assert.rejects(db.run(relocate(batch.installation.join(';'))),/SQL130_OBJECT_CONFLICT/);
 report={ok:true,major,sql130Sha256:batch.sql130Sha256,installed,durable,validation,independentConnections:db.connections.length,distinctConnections:new Set(db.connections).size,negativeMetadataCases:3,syntheticDataOnly:true};
}catch(e){report={ok:false,major,stage,error:e.message,detail:e.cause?.stderr?.slice(0,1600)};process.exitCode=1;}
finally{if(seeded){await db.run('DROP SCHEMA '+qa.schema+' CASCADE');report.qaSchemaRemoved=true;}fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));}
