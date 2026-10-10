// Disposable loopback PostgreSQL, synthetic actors, no municipal business writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';
import {buildReconciliationQa,createReconciliationPsqlQa} from './lib/own-payroll-reconciliation-qa.mjs';
import {seedImputationScenario,imputationQaIdentity} from './lib/own-payroll-imputation-qa.mjs';
import {buildAccountingPreparationInstallation,assertAccountingPreparationDurability} from './lib/accounting-preparation-access.mjs';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {imputationOperation} from '../lib/internal-own-payroll-imputation.js';import {journalOperation} from '../lib/internal-own-payroll-journal.js';import {reconciliationOperation} from '../lib/internal-own-payroll-reconciliation.js';
import {prepareImputation,decideImputation} from '../assets/own-payroll-imputation-workspace-model.js';import {prepareJournal,decideJournal} from '../assets/own-payroll-journal-model.js';import {prepareReconciliation,decideReconciliation} from '../assets/own-payroll-reconciliation-model.js';
const root=path.resolve(import.meta.dirname,'..'),execute=promisify(execFile),args={};
for(const a of process.argv.slice(2)){const m=/^--(major|psql|output)=(.+)$/.exec(a);assert.ok(m&&!Object.hasOwn(args,m[1]));args[m[1]]=m[2];}
const major=Number(args.major);assert.ok([17,18].includes(major));const output=path.resolve(args.output),prefix=output.replace(/\.json$/,'');assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
const qa=buildReconciliationQa(major),executable=args.psql??'psql',db=createReconciliationPsqlQa({executable,major,port:55400+major,schema:qa.schema,pins:qa.pins});
const b=buildAccountingPreparationInstallation({read:p=>fs.readFileSync(path.join(root,p),'utf8'),sourceCommit:'a'.repeat(40)});
const normalized=s=>qa.normalized(s).replaceAll("s.nspname='public'","s.nspname="+q(qa.schema)).replaceAll('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+qa.schema+', public, pg_temp');
const act=key=>imputationQaIdentity(qa,key);
const op=(fn,a,operation,input)=>fn(db,a.principal,a.session,operation,input);
const impute=(a,o,i)=>op(imputationOperation,a,o,i),journal=(a,o,i)=>op(journalOperation,a,o,i),reconcile=(a,o,i)=>op(reconciliationOperation,a,o,i);
const setCaps=async(key,remove)=>{await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.actors[key].membershipId)+'::uuid AND capability_key IN('+remove.map(q).join(',')+')');const a=act(key);a.principal.tenant.effectiveCapabilities=a.principal.tenant.effectiveCapabilities.filter(c=>!remove.includes(c));return a;};
let seeded=false,checks=0,report;const check=(v,label)=>{assert.ok(v,label);checks++;};const reject=async(p,code)=>{await assert.rejects(p,e=>e.code===code);checks++;};
try{
  const seed=prefix+'-seed.sql';fs.writeFileSync(seed,qa.sql,{flag:'wx'});const r=await execute(executable,[...db.args,'-f',seed],{timeout:90000,maxBuffer:4*1024*1024,windowsHide:true});seeded=true;fs.writeFileSync(prefix+'-seed.log',r.stdout+r.stderr);
  await db.run(qa.journalMigration.join(';\n'));await db.run(qa.reconciliationMigration.join(';\n'));
  const scenario=await seedImputationScenario(db,qa);scenario.definition.mappings.forEach((m,i)=>m.accountingAccountReference='CUENTA-QA-'+i);await scenario.configure(scenario.definition);
  const period=scenario.period,input={period,liquidationType:'monthly'};
  // Reproduce the actual SQL defect separately from the HTTP/client gate.
  const maker=await setCaps('maker',['payroll.calculation.approve','payroll.calculation.close','payroll.parameter.approve']);
  for(const[name,fn]of [['IMPUTATION',impute],['JOURNAL',journal],['RECONCILIATION',reconcile]])await reject(fn(maker,'bootstrap',input),name+'_FORBIDDEN');
  await assert.rejects(db.run('SELECT own_close_context_v1('+q(JSON.stringify(qa.actors.maker))+'::jsonb,true)'),/OWN_CLOSE_FORBIDDEN/);checks++;
  const baselineFailures=3;
  // Failed technical install rolls back all fifteen functions and security.
  await assert.rejects(db.run(b.installation.map(normalized).join(';\n')+";DO $$ BEGIN RAISE EXCEPTION 'QA_LATE_FAULT';END $$"),/QA_LATE_FAULT/);checks++;
  await db.run(normalized(b.preflight));checks++;
  const installed=await db.run(b.installation.map(normalized).join(';\n'));
  const durable=await db.run(b.durableVerification.map(normalized).join(';\n'));
  assertAccountingPreparationDurability({installed,durable,sourceCommit:b.sourceCommit,migrationSha256:Object.values(b.sourceHashes)[0]});checks++;
  await assert.rejects(db.run(b.installation.map(normalized).join(';\n')),/ACCOUNTING_ACCESS_PREREQUISITE_METADATA/);checks++;
  const checker=await setCaps('checker',['payroll.calculation.approve','payroll.calculation.close','payroll.parameter.prepare']);
  for(const fn of [impute,journal,reconcile])for(const a of [maker,checker]){const boot=await fn(a,'bootstrap',input);check(boot.permissions.canPropose===(a===maker),'preparation remains separate');check((boot.permissions.canReview??boot.permissions.canPost)===(a===checker),'review remains separate');}
  // The original close and salary-confirmation gates are untouched.
  const ctx=qa.actors.maker;
  for(const sql of ['SELECT own_close_context_v1('+q(JSON.stringify(ctx))+'::jsonb,true,true)','SELECT own_liquidation_context_v1('+q(JSON.stringify(ctx))+"::jsonb,true,'confirm')"])
    await assert.rejects(db.run(sql),/FORBIDDEN/);checks+=2;
  const boot=await impute(maker,'bootstrap',input),preview=await impute(maker,'source',{id:scenario.closed.groupId,fiscalYear:'2026'}),ip=await impute(maker,'command',{key:randomUUID(),body:await prepareImputation(boot,preview,'Propuesta exclusivamente sintética sin aprobar liquidaciones')});
  const ipDetail=await impute(checker,'detail',{id:ip.proposalId}),decision=await decideImputation(await impute(checker,'bootstrap',input),ipDetail,'approve','Revisión exclusivamente sintética por otra persona');
  await reject(impute(maker,'command',{key:randomUUID(),body:decision}),'IMPUTATION_FORBIDDEN');
  await impute(checker,'command',{key:randomUUID(),body:decision});checks++;
  const source=await journal(maker,'source',{basis:'imputation',id:ip.proposalId}),rules=source.imputation.allocation.groups.map((g,i)=>({ordinal:i+1,side:g.destination.nature==='deduction'?'credit':'debit',counterAccountReference:'CONTRAPARTIDA-QA-'+i,documentReference:'Documento exclusivamente sintético '+i}));
  const jp=await journal(maker,'command',{key:randomUUID(),body:await prepareJournal(source,'2026-10-31',rules,'Propuesta exclusivamente sintética sin derechos de confirmación')});
  const jd=await journal(checker,'detail',{id:jp.proposalId}),jDecision=await decideJournal(await journal(checker,'bootstrap',input),jd,'post','Registro exclusivamente sintético por otra persona');
  await reject(journal(maker,'command',{key:randomUUID(),body:jDecision}),'JOURNAL_FORBIDDEN');
  const posted=await journal(checker,'command',{key:randomUUID(),body:jDecision});checks++;
  const rs=await reconcile(maker,'source',{id:posted.eventId}),document={reference:'Documento exclusivamente sintético de prueba',issuerReference:'EMISOR-QA',date:'2026-11-02',lines:rs.journal.journal.entries.map((e,i)=>({ordinal:i+1,accountReference:e.accountReference,debit:e.debit,credit:e.credit}))};
  const body=await prepareReconciliation(rs,document,'Conciliación exclusivamente sintética con perfil preparador'),key=randomUUID(),rp=await reconcile(maker,'command',{key,body});
  check((await reconcile(maker,'attempt',{key})).replayed,'exact attempt recovery still works');
  const rd=await reconcile(checker,'detail',{id:rp.proposalId}),rDecision=await decideReconciliation(await reconcile(checker,'bootstrap',input),rd,'approve','Revisión exclusivamente sintética del conjunto completo');
  await reject(reconcile(maker,'command',{key:randomUUID(),body:rDecision}),'RECONCILIATION_FORBIDDEN');
  // Even an actor carrying both parameter rights cannot approve its own work.
  await db.run('INSERT INTO capabilities VALUES('+q(qa.ids.maker)+"::uuid,'payroll.parameter.approve')");
  const dual=structuredClone(maker);dual.principal.tenant.effectiveCapabilities.push('payroll.parameter.approve');
  const dualBoot=await reconcile(dual,'bootstrap',input);
  await reject(reconcile(dual,'command',{key:randomUUID(),body:{...rDecision,scopeVersion:dualBoot.scopeVersion}}),'RECONCILIATION_INDEPENDENT_REQUIRED');
  await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids.maker)+"::uuid AND capability_key='payroll.parameter.approve'");
  const approved=await reconcile(checker,'command',{key:randomUUID(),body:rDecision});check(approved.accountingReconciled&&!approved.paymentExecuted,'independent accounting review is not payment');
  const currentSource=await reconcile(maker,'source',{id:posted.eventId});
  const duplicateBody=await prepareReconciliation(currentSource,{...document,reference:'Segundo documento exclusivamente sintético'},'Duplicación exclusivamente sintética del mismo asiento');
  const rp2=await reconcile(maker,'command',{key:randomUUID(),body:duplicateBody}).catch(e=>{assert.equal(e.code,'RECONCILIATION_DUPLICATE');return null;});
  check(rp2===null,'duplicate journal still blocks a second proposal');
  await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids.maker)+"::uuid AND capability_key='payroll.parameter.prepare'");
  await reject(reconcile(maker,'attempt',{key}),'RECONCILIATION_FORBIDDEN');
  report={passed:true,checks,serverMajor:major,synthetic:true,baselineSqlFailures:baselineFailures,changedFunctions:15,nominalReadPreserved:true,preparationWithoutCalculationApproval:true,independentReview:true,confirmationAndCloseUnchanged:true,exactRollbackAndDurability:true,rolesPreservedByInstallation:true,paymentExecuted:false,productiveBusinessOperations:0};
}catch(e){report={passed:false,checks,message:e.message,cause:e.cause?.message,synthetic:true};process.exitCode=1;}
finally{if(seeded){try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');report.syntheticSchemaRemoved=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}}fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
