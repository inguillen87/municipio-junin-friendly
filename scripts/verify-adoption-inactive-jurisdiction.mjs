// Real SQL and application adapters; every identity and source is synthetic.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {buildInactiveJurisdictionInstallation} from './lib/adoption-inactive-jurisdiction-installation.mjs';
import {buildInactiveJurisdictionQa,relocateInactiveJurisdictionInstallation} from './lib/adoption-inactive-jurisdiction-qa.mjs';
import {buildAdoptedOwnNoveltyInstallation} from './lib/adopted-own-novelties-installation.mjs';
import {buildOwnJurisdictionInstallation} from './lib/own-payroll-jurisdiction-installation.mjs';
import {createNoeliaCircuitPsqlQa,relocateNoeliaNoveltyInstallation,relocateNoeliaJurisdictionInstallation} from './lib/noelia-payroll-circuit-qa.mjs';
import {noeliaCircuitOptions} from './lib/noelia-circuit-runtime.mjs';
import {preservationSnapshot} from './lib/native-leave-installation.mjs';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {adoptionPreparationOperation} from '../lib/internal-employment-adoption.js';
import {adoptionPreparationPayload} from '../assets/employment-adoption-preparation-model.js';
import {municipalAdoptionOperation} from '../lib/internal-municipal-adoption.js';
import {readAdoptionHistory} from '../lib/internal-employment-adoption-history.js';
import {ownNoveltyOperation} from '../lib/internal-own-payroll-novelties.js';

const root=path.resolve(import.meta.dirname,'..');
export async function verifyInactiveJurisdiction({major,output,sourceCommit,transport='local'}){
 assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);if(transport==='ci')assert.equal(sourceCommit,process.env.GITHUB_SHA);
 const destination=path.resolve(output);assert.ok(destination.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(destination));
 const qa=buildInactiveJurisdictionQa(major),options={sourceCommit,read:p=>fs.readFileSync(path.join(root,p),'utf8')};
 const previous=relocateNoeliaNoveltyInstallation(buildAdoptedOwnNoveltyInstallation(options),qa),jurisdiction=relocateNoeliaJurisdictionInstallation(buildOwnJurisdictionInstallation(options),qa,previous),batch=relocateInactiveJurisdictionInstallation(buildInactiveJurisdictionInstallation(options),qa,jurisdiction);
 const db=createNoeliaCircuitPsqlQa({major,port:55400+major,schema:qa.schema,pins:qa.pins,transport,browser:'none'});
 const checks=[],ok=(value,label)=>{assert.ok(value,label);checks.push(label);};let step=0,seeded=false,report,failure;
 fs.mkdirSync(destination);
 const run=(sql,error)=>{const file=path.join(destination,String(++step).padStart(3,'0')+'.sql');fs.writeFileSync(file,sql,{flag:'wx'});const r=spawnSync(db.executable,[...db.args,'--no-password','-f',file],{encoding:'utf8',windowsHide:true,env:db.environment,maxBuffer:12*1024*1024});fs.writeFileSync(file+'.log',r.stdout+r.stderr);if(error){assert.equal(r.status,3);assert.ok(r.stderr.includes(error),r.stderr.slice(-3000));return;}assert.equal(r.status,0,r.stderr.slice(-4000));return r.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);};
 const tx=(sql,end='COMMIT')=>`BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL statement_timeout='180s';SET LOCAL lock_timeout='2s';SET LOCAL search_path=pg_catalog, ${qa.schema}, public, pg_temp;DO $$ BEGIN ${qa.pins} END $$;${sql.join(';\n')};${end};`;
 const commandTx=sql=>tx(sql).replace('BEGIN ISOLATION LEVEL REPEATABLE READ','BEGIN ISOLATION LEVEL READ COMMITTED');
 const priorProof=()=>JSON.parse(run(tx(['SET TRANSACTION READ ONLY',preservationSnapshot('after'),"SELECT jsonb_build_object('fingerprint',encode(public.digest(current_setting('municontrol_sql111.after')::jsonb::text,'sha256'),'hex'),'schemas',(SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'mc_qa_%'))"])));
 const prior=priorProof();assert.equal(prior.schemas,0);
 const identity=a=>({principal:{user:{email:a.actorEmail},tenant:{source:'membership',id:a.tenantId,membershipId:a.membershipId,effectiveCapabilities:qa.caps}},session:{email:a.actorEmail,id:a.actorSessionId,version:a.actorSessionVersion,releaseSha:a.releaseSha}}),maker=identity(qa.actors.maker),checker=identity(qa.actors.checker);
 const counts=()=>JSON.parse(run(tx(['SET TRANSACTION READ ONLY',`SELECT jsonb_build_object('proposals',(SELECT count(*) FROM ${qa.schema}.employment_adoption_proposal),'applications',(SELECT count(*) FROM ${qa.schema}.employment_adoption_application),'native',(SELECT count(*) FROM ${qa.schema}.employment_contract WHERE source_system='MUNICONTROL'))`])));
 try{
  run(qa.sql);seeded=true;run(tx(previous.operator.consumers.statements));run(tx(previous.operator.statements));run(tx(previous.installation));run(tx(jurisdiction.installation));
  const oldBoot=await adoptionPreparationOperation(db,maker.principal,maker.session,'bootstrap');assert.equal(oldBoot.version,'employment-adoption-preparation.v1');assert.equal(oldBoot.review.total,57);
  const oldKey=randomUUID(),oldBody=await adoptionPreparationPayload(oldBoot.review,oldBoot.catalogVersion,'42','Documento exclusivamente sintético QA','Propuesta previa exclusivamente sintética para verificar compatibilidad');
  const old=await adoptionPreparationOperation(db,maker.principal,maker.session,'propose',{key:oldKey,body:oldBody});
  ok(old.receipt.total===57,'legacy complete proposal persisted before schema evolution');
  run(tx(batch.installation,'ROLLBACK'));
  ok((await adoptionPreparationOperation(db,maker.principal,maker.session,'bootstrap')).version==='employment-adoption-preparation.v1','rolled-back schema evolution leaves the old bootstrap intact');
  const installed=JSON.parse(run(tx(batch.installation))),durable=JSON.parse(run(tx(batch.verification)));assert.equal(installed.mode,'first');const {mode:im,...i}=installed,{mode:dm,...d}=durable;assert.deepEqual(i,d);ok(dm==='verify','schema-only installation is durable with unchanged prior rows and ACLs');
  const repeated=JSON.parse(run(tx(batch.installation)));assert.equal(repeated.mode,'repeat');assert.deepEqual({...repeated,mode:'first'},installed);ok(true,'identical installation repeats without row or object changes');
  run(tx([qa.normalized(batch.beforeDefinitions[0].replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ')),...batch.installation]),'INACTIVE_JURISDICTION_PARTIAL_STATE');ok(true,'mixed old and new function bodies refuse installation and roll back');
  run(tx([`GRANT EXECUTE ON FUNCTION ${qa.schema}.employment_adoption_update_allowed_v1(${qa.schema}.employment_contract,${qa.schema}.employment_contract) TO municontrol_actions_runtime_app`,...batch.installation]),'INACTIVE_JURISDICTION_AFTER_METADATA');ok(true,'unexpected permission on the private adoption guard is refused and rolled back');
  const recovered=await adoptionPreparationOperation(db,maker.principal,maker.session,'attempt',{key:oldKey});assert.deepEqual(recovered.body,old.body);assert.equal(recovered.receipt.bodySha256,old.receipt.bodySha256);ok(true,'legacy pending body key and checksum survive installation unchanged');
  const boot=await adoptionPreparationOperation(db,maker.principal,maker.session,'bootstrap');assert.equal(boot.version,'employment-adoption-preparation.v2');assert.equal(boot.review.total,57);
  const body=await adoptionPreparationPayload(boot.review,boot.catalogVersion,'42','Documento exclusivamente sintético QA','Conservar antecedentes inactivos exclusivamente sintéticos',{allowInactivePending:true});
  ok(body.rows.length===57&&body.rows.filter(r=>r.jurisdictionCode===null).length===55,'all 57 reviewed rows preserved with 55 inactive pending jurisdictions');
  const before=counts();
  const invalid=[
   ['legacy null',v=>delete v.version,'EMPLOYMENT_ADOPTION_INPUT_INVALID'],
   ['null marker',v=>v.version=null,'EMPLOYMENT_ADOPTION_INPUT_INVALID'],
   ['unknown marker',v=>v.version='employment-adoption-input.v3','EMPLOYMENT_ADOPTION_INPUT_INVALID'],
   ['boolean marker',v=>v.version=true,'EMPLOYMENT_ADOPTION_INPUT_INVALID'],
   ['missing jurisdiction',v=>delete v.rows[0].jurisdictionCode,'EMPLOYMENT_ADOPTION_INPUT_INVALID'],
   ['blank jurisdiction',v=>v.rows[0].jurisdictionCode='','EMPLOYMENT_ADOPTION_INPUT_INVALID'],
   ['unsupported jurisdiction',v=>v.rows[0].jurisdictionCode='042','EMPLOYMENT_ADOPTION_INPUT_INVALID'],
   ['active null',v=>v.rows.find(r=>r.jurisdictionCode==='42').jurisdictionCode=null,'EMPLOYMENT_ADOPTION_SELECTION_CHANGED'],
   ['stale contract',v=>v.rows[0].contractVersion='f'.repeat(64),'EMPLOYMENT_ADOPTION_SELECTION_CHANGED'],
   ['filtered selection',v=>v.rows.pop(),'EMPLOYMENT_ADOPTION_SELECTION_CHANGED'],
   ['reordered selection',v=>v.rows.reverse(),'EMPLOYMENT_ADOPTION_SELECTION_CHANGED'],
   ['stale source',v=>v.sourceContextVersion='f'.repeat(64),'EMPLOYMENT_ADOPTION_SOURCE_CHANGED']
  ];
  for(const [label,change,code]of invalid){const value=structuredClone(body);change(value);run(commandTx([`SELECT ${qa.schema}.employment_adoption_propose_v1(${q(JSON.stringify(qa.actors.maker))}::jsonb,${q(JSON.stringify(value))}::jsonb,${q(randomUUID())}::uuid)`]),code);ok(true,'SQL independently rejects '+label);}
  assert.deepEqual(counts(),before);ok(true,'all rejected direct SQL requests write zero proposal application or contract rows');
  const key=randomUUID(),saved=await adoptionPreparationOperation(db,maker.principal,maker.session,'propose',{key,body});assert.equal(saved.receipt.total,57);
  const replay=await adoptionPreparationOperation(db,maker.principal,maker.session,'propose',{key,body});assert.equal(replay.receipt.replayed,true);assert.deepEqual(replay.body,saved.body);ok(true,'v2 retries recover the identical full proposal without duplication');
  const changed=structuredClone(body);changed.rows.find(r=>r.jurisdictionCode===null).jurisdictionCode='42';await assert.rejects(adoptionPreparationOperation(db,maker.principal,maker.session,'propose',{key,body:changed}),/mismo|contenido|referencia/i);ok(true,'changed body cannot reuse the saved request key');
  const view=await municipalAdoptionOperation(db,checker.principal,checker.session,'review',{id:saved.receipt.proposalId});
  const decisionBody={reviewVersion:view.reviewVersion,review:{proposalId:view.proposal.proposalId,proposalVersion:view.proposal.proposalVersion,sourceContextVersion:view.proposal.sourceContextVersion,catalogVersion:view.proposal.catalogVersion,decision:'approve',reason:'Revisión independiente exclusivamente sintética QA'},reviewConfirmed:true};
  await assert.rejects(municipalAdoptionOperation(db,maker.principal,maker.session,'command',{key:randomUUID(),body:decisionBody}));ok(true,'same person cannot approve their own adoption proposal');
  const adopted=await municipalAdoptionOperation(db,checker.principal,checker.session,'command',{key:randomUUID(),body:decisionBody});ok(adopted.receipt.effects.contractsAdopted===57,'independent real SQL decision adopts all 57 synthetic contracts');
  const population=JSON.parse(run(tx(['SET TRANSACTION READ ONLY',`SELECT jsonb_build_object('pending',(SELECT count(*) FROM ${qa.schema}.employment_contract WHERE source_system='MUNICONTROL' AND jurisdiction_code IS NULL),'inactive',(SELECT count(*) FROM ${qa.schema}.employment_contract WHERE source_system='MUNICONTROL' AND jurisdiction_code IS NULL AND status='inactive' AND end_date='2020-01-01'),'applications',(SELECT count(*) FROM ${qa.schema}.employment_adoption_application))`])));ok(population.pending===55&&population.inactive===55&&population.applications===57,'inactive origin dates and null jurisdiction remain unchanged after adoption');
  const history=await readAdoptionHistory(db,maker.principal,maker.session,qa.ids.targetContract);ok(history.version==='employment-adoption-history.v2'&&history.contract.jurisdictionCode===null&&history.history.jurisdictionStatus==='pending_inactive_origin','real history read preserves the inactive origin and its verified source');
  const known=await readAdoptionHistory(db,maker.principal,maker.session,qa.ids.makerContract);ok(known.version==='employment-adoption-history.v1'&&known.contract.jurisdictionCode==='42','declared adopted histories preserve the old proof contract');
  const subjects=await ownNoveltyOperation(db,maker.principal,maker.session,'bootstrap');ok(subjects.subjects.length===28&&!subjects.subjects.some(s=>s.contractId===qa.ids.targetContract),'actual monthly bootstrap retains the 28 active subjects and excludes all inactive pending histories');
  run(commandTx([`SELECT ${qa.schema}.payroll_fixed_registry_adopted_subject_v1(${qa.schema}.native_employee_context_v1(${q(JSON.stringify(qa.actors.maker))}::jsonb),${q(qa.ids.targetContract)}::uuid,false)`]),'PAYROLL_FIXED_JURISDICTION_REQUIRED');ok(true,'common SQL payroll subject gate refuses inactive pending jurisdiction');
  const after=counts();assert.equal(after.proposals,before.proposals+1);assert.equal(after.applications,57);ok(true,'retries and refusals created exactly one new proposal and 57 applications');
  report={version:'inactive-jurisdiction-qa.v1',sourceCommit,serverMajor:major,transport,checksPassed:checks.length,checks,syntheticContracts:57,pendingInactiveContracts:55,productionRowsWritten:0,installed,durable};
 }catch(e){failure=e;fs.writeFileSync(path.join(destination,'failure.txt'),e.stack??String(e));}
 finally{if(seeded){const active=await db.run(`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND application_name=${q(db.applicationName)}`);assert.equal(Number(active),0,'owned QA connections must drain before removing the schema');run(tx([`DROP SCHEMA ${qa.schema} CASCADE`]));const after=priorProof();assert.deepEqual(after,prior);assert.equal(after.schemas,0);if(report){report.syntheticSchemaRemoved=true;report.priorStatePreserved=true;report.syntheticConnectionsDrained=true;}}}
 if(failure)throw failure;fs.writeFileSync(path.join(destination,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){verifyInactiveJurisdiction(noeliaCircuitOptions(process.argv.slice(2))).then(r=>console.log(JSON.stringify({serverMajor:r.serverMajor,checksPassed:r.checksPassed,syntheticSchemaRemoved:r.syntheticSchemaRemoved,priorStatePreserved:r.priorStatePreserved}))).catch(e=>{console.error(e.stack);process.exitCode=1;});}
