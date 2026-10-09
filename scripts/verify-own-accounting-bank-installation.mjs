// Loopback synthetic PG17/18 only. Existing pending requests survive SQL150.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';
import {buildImputationQa,createImputationPsqlQa,seedImputationScenario} from './lib/own-payroll-imputation-qa.mjs';
import {buildOwnAccountingBankInstallation,assertOwnAccountingBankDurability} from './lib/own-accounting-bank-installation.mjs';
import {accountingOperation} from '../lib/internal-own-payroll-accounting.js';
import {prepareAccounting} from '../assets/own-payroll-accounting-workspace-model.js';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
const root=path.resolve(import.meta.dirname,'..'),args={},execute=promisify(execFile);for(const a of process.argv.slice(2)){const m=/^--(major|psql|output)=(.+)$/.exec(a);assert.ok(m&&!Object.hasOwn(args,m[1]));args[m[1]]=m[2];}const major=Number(args.major);assert.ok([17,18].includes(major));const output=path.resolve(args.output),prefix=output.replace(/\.json$/,'');assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
const qa=buildImputationQa(major),executable=args.psql??'psql',db=createImputationPsqlQa({executable,major,port:55400+major,schema:qa.schema,pins:qa.pins}),b=buildOwnAccountingBankInstallation({read:p=>fs.readFileSync(path.join(root,p),'utf8'),sourceCommit:'a'.repeat(40)});
// The synthetic schema relocates the reviewed functions. Hash normalization
// restores only its namespace in metadata checks; source bodies remain pinned.
const normalized=s=>qa.normalized(s).replaceAll("s.nspname='public'","s.nspname="+q(qa.schema)).replaceAll('search_path=public, pg_temp','search_path=pg_catalog, '+qa.schema+', public, pg_temp');
let seeded=false,checks=0,report;const check=(v,label)=>{assert.ok(v,label);checks++;};
try{
 const seed=prefix+'-seed.sql';fs.writeFileSync(seed,qa.sql,{flag:'wx'});const r=await execute(executable,[...db.args,'-f',seed],{timeout:90000,maxBuffer:4*1024*1024,windowsHide:true});seeded=true;fs.writeFileSync(prefix+'-seed.log',r.stdout+r.stderr);
 // Match the published private ACL omitted by the inherited minimal IAM fixture.
 await db.run('REVOKE ALL ON FUNCTION action_center_context_has_capability(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app');
 await db.run(qa.normalized(fs.readFileSync(path.join(root,'scripts/migrations/148-own-payroll-imputation.sql'),'utf8'))+";SELECT '{}'::jsonb");
 const scenario=await seedImputationScenario(db,qa),a=scenario.maker,op=(operation,input)=>accountingOperation(db,a.principal,a.session,operation,input),boot=await op('bootstrap'),body=prepareAccounting(boot,scenario.definition,'Propuesta anterior exclusivamente sintética pendiente'),key=randomUUID(),pending=await op('command',{key,body});
 check(pending.status==='pending'&&pending.body.definition.mappings.every(m=>!Object.hasOwn(m,'bankDestinationVersion')),'committed older request exists before upgrade');
 await db.run(b.preflight.map(normalized).join(';\n'));
 await assert.rejects(db.run(b.installation.map(normalized).join(';\n')+";DO $$ BEGIN RAISE EXCEPTION 'QA_BANK_LATE_FAULT';END $$"),/QA_BANK_LATE_FAULT/);await db.run(b.preflight.map(normalized).join(';\n'));checks++;
 const installed=await db.run(b.installation.map(normalized).join(';\n')),durable=await db.run(b.durableVerification.map(normalized).join(';\n'));assertOwnAccountingBankDurability({installed,durable,sourceCommit:b.sourceCommit,validatorSha256:b.newPin.sha256});checks++;
 check(installed.eventRows===1&&installed.replacedFunctions===1,'only validator changes, existing pending history remains');
 assert.deepEqual(await op('command',{key,body}),{...pending,replayed:true});checks++;
 const recovered=await db.run('SELECT own_accounting_attempt_v1('+q(JSON.stringify(qa.actors.maker))+'::jsonb,'+q(key)+'::uuid)',true);assert.deepEqual(recovered,{...pending,replayed:true});checks++;
 for(const [mutation,code]of [['ALTER FUNCTION own_accounting_definition_v1(jsonb,jsonb,jsonb) COST 101','ACCOUNTING_BANK_FUNCTION_METADATA'],['GRANT EXECUTE ON FUNCTION own_accounting_definition_v1(jsonb,jsonb,jsonb) TO municontrol_actions_runtime_app','ACCOUNTING_BANK_FUNCTION_METADATA'],['ALTER TABLE own_payroll_accounting_event DISABLE TRIGGER own_accounting_immutable','ACCOUNTING_IMMUTABLE_GUARD']]){
  await assert.rejects(db.run(mutation+';'+b.durableVerification.map(normalized).join(';\n')),new RegExp(code));checks++;
  assertOwnAccountingBankDurability({installed,durable:await db.run(b.durableVerification.map(normalized).join(';\n')),sourceCommit:b.sourceCommit,validatorSha256:b.newPin.sha256});checks++;
 }
 await assert.rejects(db.run(b.migration.map(normalized).join(';\n')),/ACCOUNTING_BANK_ALREADY_INSTALLED/);checks++;
 report={passed:true,checks,serverMajor:major,synthetic:true,migrationSha256:installed.migrationSha256,exactMetadata:true,priorRowsFunctionsSecurityPreserved:true,independentDurabilityVerified:true,driftRollsBack:true,olderPendingRequestRetained:true,originalBodyKeyAndReceiptReplayed:true,newTables:0,newFunctions:0,replacedFunctions:1,eventRows:1,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0};
}catch(e){if(e.cause?.stderr)fs.writeFileSync(prefix+'-diagnostic.log',e.cause.stderr);report={passed:false,checks,message:e.message,cause:e.cause?.message,synthetic:true};process.exitCode=1;}
finally{if(seeded){try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');report.syntheticSchemaRemoved=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}}fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
