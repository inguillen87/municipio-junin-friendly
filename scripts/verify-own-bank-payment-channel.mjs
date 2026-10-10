// Committed synthetic loopback QA only. No municipal accounts or bank submission.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';
import {buildOwnPayrollDurableQa,qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {createOwnPayrollPsqlQa} from './lib/own-payroll-psql-qa.mjs';
import {buildOwnBankPaymentChannelInstallation,assertOwnBankPaymentChannelDurability} from './lib/own-bank-payment-channel-installation.mjs';
import {prepareBankAccounts} from '../assets/own-bank-accounts-workspace-model.js';
import {bankAccountsDefinition,BANK_PAYMENT_CHANNEL_VERSION} from '../assets/own-bank-accounts-model.js';
import {syntheticBankAccountsDefinition} from '../tests/fixtures/own-bank-accounts-synthetic.js';
const root=path.resolve(import.meta.dirname,'..'),args={},execute=promisify(execFile);
for(const a of process.argv.slice(2)){const m=/^--(major|psql|output)=(.+)$/.exec(a);assert.ok(m&&!Object.hasOwn(args,m[1]));args[m[1]]=m[2];}
const major=Number(args.major);assert.ok([17,18].includes(major));const output=path.resolve(args.output),prefix=output.replace(/\.json$/,'');assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
const qa=buildOwnPayrollDurableQa(major,{seedProgram:false}),executable=args.psql??'psql',db=createOwnPayrollPsqlQa({executable,major,port:55400+major,schema:qa.schema,pins:qa.pins});
const b=buildOwnBankPaymentChannelInstallation({read:p=>fs.readFileSync(path.join(root,p),'utf8'),sourceCommit:'a'.repeat(40)});
const normalized=s=>s.replaceAll('public.',qa.schema+'.').replaceAll(qa.schema+'.digest(','public.digest(').replaceAll("'public'::regnamespace",q(qa.schema)+'::regnamespace').replaceAll("s.nspname='public'","s.nspname="+q(qa.schema)).replace(/SET search_path\s*=\s*pg_catalog,public,pg_temp/g,'SET search_path=pg_catalog,'+qa.schema+',public,pg_temp').replaceAll('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+qa.schema+', public, pg_temp').replaceAll('search_path=public, pg_temp','search_path=pg_catalog, '+qa.schema+', public, pg_temp').replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(qa.schema+'.')+",'public'||'.')");
const actor=k=>q(JSON.stringify(qa.actors[k]))+'::jsonb',bootstrap=k=>db.run('SELECT own_bank_accounts_bootstrap_v1('+actor(k)+')'),command=(k,body,key)=>db.run('SELECT own_bank_accounts_command_v1('+actor(k)+','+q(JSON.stringify(body))+'::jsonb,'+q(key)+'::uuid)');
let seeded=false,checks=0,report;const check=(v,label)=>{assert.ok(v,label);checks++;};
try{
 const seed=prefix+'-seed.sql';fs.writeFileSync(seed,qa.sql,{flag:'wx'});const r=await execute(executable,[...db.args,'-f',seed],{timeout:90000,maxBuffer:4*1024*1024,windowsHide:true});seeded=true;fs.writeFileSync(prefix+'-seed.log',r.stdout+r.stderr);
 await db.run('REVOKE ALL ON FUNCTION action_center_context_has_capability(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app');
 await db.run(normalized(fs.readFileSync(path.join(root,'scripts/migrations/149-own-bank-accounts.sql'),'utf8'))+";SELECT '{}'::jsonb");
 await db.run("INSERT INTO capabilities VALUES("+q(qa.ids.maker)+"::uuid,'payroll.parameter.approve');SELECT '{}'::jsonb");
 const boot=await bootstrap('maker'),definition=syntheticBankAccountsDefinition();definition.accounts[0].contractId=boot.sources.contracts[0].contractId;
 const body=prepareBankAccounts(boot,definition,'Constancia bancaria exclusivamente sintética'),key=randomUUID(),pending=await command('maker',body,key);
 check(pending.status==='pending'&&!Object.hasOwn(pending.body.definition.accounts[0],'paymentChannel'),'old pending request committed before upgrade');
 await db.run(b.preflight.map(normalized).join(';\n'));
 await assert.rejects(db.run(b.installation.map(normalized).join(';\n')+";DO $$ BEGIN RAISE EXCEPTION 'QA_CHANNEL_LATE_FAULT';END $$"),/QA_CHANNEL_LATE_FAULT/);checks++;await db.run(b.preflight.map(normalized).join(';\n'));
 const installed=await db.run(b.installation.map(normalized).join(';\n')),durable=await db.run(b.durableVerification.map(normalized).join(';\n'));assertOwnBankPaymentChannelDurability({installed,durable,sourceCommit:b.sourceCommit,validatorSha256:b.newPin.sha256});checks++;
 check(installed.eventRows===1&&installed.replacedFunctions===1,'only validator replaced; original pending event conserved');
 assert.deepEqual(await command('maker',body,key),{...pending,replayed:true});checks++;
 const second=structuredClone(definition);Object.assign(second.accounts[0],{accountType:'CA',paymentChannelVersion:BANK_PAYMENT_CHANNEL_VERSION,paymentChannel:'credicoop_transfers'});
 const proposalBody=prepareBankAccounts(await bootstrap('maker'),bankAccountsDefinition(second),'Canal de transferencia exclusivamente sintético'),proposal=await command('maker',proposalBody,randomUUID());
 assert.deepEqual(proposal.body.definition,bankAccountsDefinition(second));checks++;
 const checker=await bootstrap('checker'),decision={command:'approve',scopeVersion:checker.scopeVersion,baseVersion:proposalBody.baseVersion,sourceVersion:proposalBody.sourceVersion,proposalId:proposal.proposalId,proposalSha256:proposal.requestSha256,definition:null,reason:'Revisión independiente exclusivamente sintética',reviewConfirmed:true};
 await assert.rejects(command('maker',{...decision,scopeVersion:(await bootstrap('maker')).scopeVersion},randomUUID()),/FORBIDDEN|INDEPENDENT/);checks++;
 const approved=await command('checker',decision,randomUUID());check(approved.status==='approved','independent reviewer approves complete declared channel');
 assert.deepEqual((await bootstrap('maker')).configuration.definition,bankAccountsDefinition(second));checks++;
 for(const [field,value]of [['paymentChannel',['bank_payroll']],['paymentChannel','other'],['paymentChannelVersion','other'],['accountType',null]]){
  const bad=structuredClone(second);bad.accounts[0][field]=value;
  await assert.rejects(db.run('SELECT own_bank_accounts_definition_v1('+q(JSON.stringify(bad))+'::jsonb,'+q(JSON.stringify(boot.sources))+'::jsonb,NULL)'),/BANK_ACCOUNTS_INPUT_INVALID/);checks++;
 }
 for(const [mutation,code]of [['ALTER FUNCTION own_bank_accounts_definition_v1(jsonb,jsonb,jsonb) COST 101','BANK_CHANNEL_FUNCTION_METADATA'],['GRANT EXECUTE ON FUNCTION own_bank_accounts_definition_v1(jsonb,jsonb,jsonb) TO municontrol_actions_runtime_app','BANK_CHANNEL_FUNCTION_METADATA']]){
  await assert.rejects(db.run(mutation+';'+b.durableVerification.map(normalized).join(';\n')),new RegExp(code));checks++;
 }
 await assert.rejects(db.run(b.migration.map(normalized).join(';\n')),/BANK_CHANNEL_ALREADY_INSTALLED/);checks++;
 report={passed:true,checks,serverMajor:major,synthetic:true,exactMetadata:true,priorRowsFunctionsSecurityPreserved:true,independentDurabilityVerified:true,olderPendingRequestRetained:true,originalBodyKeyAndReceiptReplayed:true,independentChannelReview:true,newTables:0,newFunctions:0,replacedFunctions:1,municipalBusinessWrites:0};
}catch(e){if(e.cause?.stderr)fs.writeFileSync(prefix+'-diagnostic.log',e.cause.stderr);report={passed:false,checks,message:e.message,cause:e.cause?.message,synthetic:true};process.exitCode=1;}
finally{if(seeded){try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');report.syntheticSchemaRemoved=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}}fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
