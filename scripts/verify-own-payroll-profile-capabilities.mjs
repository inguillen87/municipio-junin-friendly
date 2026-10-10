// Loopback PostgreSQL only. Actual IAM resolution and published handlers, synthetic actors.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';
import {buildReconciliationQa,createReconciliationPsqlQa} from './lib/own-payroll-reconciliation-qa.mjs';
import {createOwnLiquidationPsqlQa} from './lib/own-payroll-liquidation-qa.mjs';
import {seedImputationScenario} from './lib/own-payroll-imputation-qa.mjs';
import {profileQaCatalogue,relocateProfileBatch,profileQaTransaction} from './lib/own-payroll-profile-qa.mjs';
import {buildProfileCapabilityInstallation,assertProfileCapabilityDurability,PROFILE_ADDITIONS} from './lib/own-payroll-profile-capabilities.mjs';
import {buildAccountingPreparationInstallation} from './lib/accounting-preparation-access.mjs';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {imputationOperation} from '../lib/internal-own-payroll-imputation.js';
import {journalOperation} from '../lib/internal-own-payroll-journal.js';
import {reconciliationOperation} from '../lib/internal-own-payroll-reconciliation.js';
import {ownRunOperation,RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
import {ownLiquidationOperation,OWN_LIQ_REVIEW} from '../lib/internal-own-payroll-liquidation.js';
import {IMPUTATION_READ,prepareImputation,decideImputation} from '../assets/own-payroll-imputation-workspace-model.js';
const root=path.resolve(import.meta.dirname,'..'),execute=promisify(execFile),args={};
for(const a of process.argv.slice(2)){const m=/^--(major|psql|output)=(.+)$/.exec(a);assert.ok(m&&!Object.hasOwn(args,m[1]));args[m[1]]=m[2];}
const major=Number(args.major);assert.ok([17,18].includes(major));const output=path.resolve(args.output),prefix=output.replace(/\.json$/,'');assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
const qa=buildReconciliationQa(major),executable=args.psql??'psql',db=createReconciliationPsqlQa({executable,major,port:55400+major,schema:qa.schema,pins:qa.pins});
const liquidationDb=createOwnLiquidationPsqlQa({executable,major,port:55400+major,schema:qa.schema,pins:qa.pins});
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),b=buildProfileCapabilityInstallation({read,sourceCommit:'a'.repeat(40)}),normal=s=>relocateProfileBatch(s,qa);
const installRun=statement=>profileQaTransaction(db,executable,statement);
const mapSql=PROFILE_ADDITIONS.map(a=>`(role_key=${q(a.role)} AND capability_key=${q(a.capability)})`).join(' OR ');
async function identity(key,role){
 const actor=qa.actors[key];await db.run('UPDATE tenant_membership SET role_key='+q(role)+' WHERE id='+q(actor.membershipId)+'::uuid');
 const caps=await db.run('SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key),\'[]\'::jsonb) FROM tenant_iam_effective_capabilities('+q(actor.membershipId)+'::uuid)');
 return{principal:{user:{email:actor.actorEmail},tenant:{source:'membership',id:actor.tenantId,membershipId:actor.membershipId,effectiveCapabilities:caps}},session:{email:actor.actorEmail,id:actor.actorSessionId,version:actor.actorSessionVersion,releaseSha:actor.releaseSha}};
}
const op=(fn,a,operation,input)=>fn(fn===ownLiquidationOperation?liquidationDb:db,a.principal,a.session,operation,input);
let seeded=false,checks=0,report;const check=(v,label)=>{assert.ok(v,label);checks++;};const reject=async(p,code)=>{await assert.rejects(p,e=>e.code===code);checks++;};
try{
 const seed=prefix+'-seed.sql';fs.writeFileSync(seed,qa.sql,{flag:'wx'});const r=await execute(executable,[...db.args,'-f',seed],{timeout:90000,maxBuffer:4*1024*1024,windowsHide:true});seeded=true;fs.writeFileSync(prefix+'-seed.log',r.stdout+r.stderr);
 await db.run(qa.journalMigration.join(';\n'));await db.run(qa.reconciliationMigration.join(';\n'));
 const scenario=await seedImputationScenario(db,qa);await scenario.configure(scenario.definition);
 const correction=buildAccountingPreparationInstallation({read,sourceCommit:'a'.repeat(40)});await db.run(correction.installation.map(normal).join(';\n'));
 await db.run(profileQaCatalogue(qa).sql);
 const input={period:scenario.period,liquidationType:'monthly'};
 for(const role of b.policy.roles){const a=await identity('maker',role.role_key);check(!IMPUTATION_READ.every(c=>a.principal.tenant.effectiveCapabilities.includes(c)),role.role_key+' baseline reproduces missing read');for(const fn of [imputationOperation,journalOperation,reconciliationOperation])await reject(op(fn,a,'bootstrap',input),fn===imputationOperation?'IMPUTATION_FORBIDDEN':fn===journalOperation?'JOURNAL_FORBIDDEN':'RECONCILIATION_FORBIDDEN');}
 // A deny exists before the installation and is covered by conservation.
 await db.run('INSERT INTO tenant_membership_capability_override VALUES('+q(qa.ids.samePerson)+"::uuid,'payroll.calculation.nominal.read',false,true)");
 await installRun(normal(b.preflight));checks++;
 const deniedMutations=[
  ["UPDATE iam_role SET scope_kind='platform' WHERE role_key='HUGO_APROBADOR_INTEGRAL'",'OWN_PROFILE_ROLE_BASELINE_CHANGED'],
  ["UPDATE iam_role_capability SET capability_key='qa.changed' WHERE role_key='HUGO_APROBADOR_INTEGRAL' AND capability_key='actions.read'",'OWN_PROFILE_ROLE_BASELINE_CHANGED'],
  ["UPDATE iam_capability SET sensitivity='standard' WHERE capability_key='payroll.calculation.approve'",'OWN_PROFILE_CAPABILITY_BASELINE_CHANGED'],
  ["DELETE FROM iam_capability WHERE capability_key='payroll.calculation.approve'",'OWN_PROFILE_CAPABILITY_BASELINE_CHANGED'],
  ["INSERT INTO iam_role_capability VALUES('HUGO_APROBADOR_INTEGRAL','payroll.calculation.read')",'OWN_PROFILE_PARTIAL_STATE'],
  ["INSERT INTO iam_capability_conflict VALUES('actions.read','payroll.calculation.read','Conflicto exclusivamente sintético')",'OWN_PROFILE_NEW_CONFLICT'],
 ];
 for(const[sql,error]of deniedMutations){await assert.rejects(installRun(sql+';'+b.installation.map(normal).join(';\n')),new RegExp(error));checks++;await installRun(normal(b.preflight));checks++;}
 await assert.rejects(db.run(b.migration.map(normal).join(';\n')),/OWN_PROFILE_ISOLATION_REQUIRED/);checks++;
 await assert.rejects(installRun(b.installation.map(normal).join(';\n')+";DO $$ BEGIN RAISE EXCEPTION 'QA_PROFILE_LATE_FAULT';END $$"),/QA_PROFILE_LATE_FAULT/);checks++;
 check(await db.run('SELECT to_jsonb(count(*)) FROM iam_role_capability WHERE '+mapSql)===0,'late failure rolls back all fifteen grants');
 await installRun(normal(b.preflight));checks++;
 const installed=await installRun(b.installation.map(normal).join(';\n')),durable=await installRun(b.durableVerification.map(normal).join(';\n'));
 assertProfileCapabilityDurability({installed,durable,sourceCommit:b.sourceCommit,sourceHashes:b.sourceHashes});checks++;
 check(installed.mode==='first'&&await db.run('SELECT to_jsonb(count(*)) FROM iam_role_capability WHERE '+mapSql)===15,'exact fifteen once');
 const repeated=await installRun(b.installation.map(normal).join(';\n'));assertProfileCapabilityDurability({installed:repeated,durable,sourceCommit:b.sourceCommit,sourceHashes:b.sourceHashes});check(repeated.mode==='repeat','exact repeat adds nothing');
 // A successful mutation outside the fifteen reviewed rows must abort conservation.
 await assert.rejects(installRun([b.preflight,b.before,"UPDATE iam_role SET label='Cambio fuera de la matriz exclusivamente sintético' WHERE role_key='QA_ROLE'",b.after,b.conservation].map(normal).join(';\n')),/OWN_PROFILE_PRIOR_STATE_CHANGED/);checks++;
 for(const role of b.policy.roles){const a=await identity('maker',role.role_key),caps=a.principal.tenant.effectiveCapabilities;check(IMPUTATION_READ.every(c=>caps.includes(c)),role.role_key+' actual IAM gives required read');
  for(const fn of [imputationOperation,journalOperation,reconciliationOperation]){const boot=await op(fn,a,'bootstrap',input);check(boot.period===input.period,role.role_key+' published accounting bootstrap');}
  check(RUN_CALCULATE.every(c=>caps.includes(c))===(role.role_key!=='HUGO_APROBADOR_INTEGRAL'),'actual IAM calculation authority');check(OWN_LIQ_REVIEW.every(c=>caps.includes(c))===(role.role_key!=='NOMINA_GESTION_INTEGRAL'),'actual IAM independent review authority');
 }
 const preparer=await identity('maker','NOMINA_GESTION_INTEGRAL'),reviewer=await identity('checker','HUGO_APROBADOR_INTEGRAL');
 const runBoot=await op(ownRunOperation,preparer,'bootstrap');checks++;
 await op(ownLiquidationOperation,reviewer,'bootstrap');checks++;
 await reject(op(ownRunOperation,reviewer,'calculate',{key:randomUUID(),body:{version:'own-payroll-run-command.v2',liquidationDate:'2026-10-31',period:input.period,liquidationType:'monthly',selection:{kind:'all',values:[]},scopeVersion:runBoot.scopeVersion,programVersion:runBoot.programVersion,populationDomain:'native_registered'}}),'OWN_RUN_FORBIDDEN');
 const denied=await identity('samePerson','MUNICIPIO_ADMIN_OPERATIVO');check(!denied.principal.tenant.effectiveCapabilities.includes('payroll.calculation.nominal.read'),'prior deny wins over new role grant');await reject(op(reconciliationOperation,denied,'bootstrap',input),'RECONCILIATION_FORBIDDEN');
 const makeBoot=await op(imputationOperation,preparer,'bootstrap',input),preview=await op(imputationOperation,preparer,'source',{id:scenario.closed.groupId,fiscalYear:'2026'}),proposal=await op(imputationOperation,preparer,'command',{key:randomUUID(),body:await prepareImputation(makeBoot,preview,'Preparación exclusivamente sintética con IAM real')});
 const reviewDetail=await op(imputationOperation,reviewer,'detail',{id:proposal.proposalId}),decision=await decideImputation(await op(imputationOperation,reviewer,'bootstrap',input),reviewDetail,'approve','Revisión exclusivamente sintética con IAM real');
 const dual=await identity('maker','MUNICIPIO_ADMIN_OPERATIVO');await reject(op(imputationOperation,dual,'command',{key:randomUUID(),body:{...decision,scopeVersion:(await op(imputationOperation,dual,'bootstrap',input)).scopeVersion}}),'IMPUTATION_INDEPENDENT_REQUIRED');
 await op(imputationOperation,reviewer,'command',{key:randomUUID(),body:decision});checks++;
 // SQL rechecks revoked nominal read, even if the HTTP principal is stale.
 await db.run('INSERT INTO tenant_membership_capability_override VALUES('+q(qa.ids.checker)+"::uuid,'payroll.calculation.nominal.read',false,true)");
 await reject(op(reconciliationOperation,reviewer,'bootstrap',input),'RECONCILIATION_FORBIDDEN');
 await db.run('UPDATE tenant_membership SET status=\'suspended\' WHERE id='+q(qa.ids.maker)+'::uuid');await reject(op(reconciliationOperation,dual,'bootstrap',input),'RECONCILIATION_SESSION_INVALID');
 report={passed:true,checks,serverMajor:major,synthetic:true,profileCount:4,mappingCount:15,baselineAccountingRejections:12,actualEffectiveCapabilitySql:true,rollbackAndDurability:true,exactRepeat:true,denialsPreserved:true,independentReview:true,productiveGrantWrites:0,productiveBusinessWrites:0,nominalRowsReturned:0};
}catch(e){report={passed:false,checks,message:e.message,code:e.code,cause:e.cause?.message,synthetic:true};process.exitCode=1;}
finally{if(seeded){try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');report.syntheticSchemaRemoved=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}}fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
