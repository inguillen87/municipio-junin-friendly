// Actual SQL and HTTP on existing, loopback-only synthetic PostgreSQL QA.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {buildPublishedNoveltyAdoptionInstallation,assertPublishedNoveltyAdoptionDurability} from './lib/published-novelty-adoption-installation.mjs';
import {relocatePublishedNoveltyAdoption} from './lib/published-novelty-adoption-qa.mjs';
import {buildNoeliaCircuitQa,createNoeliaCircuitPsqlQa,relocateNoeliaJurisdictionInstallation,relocateNoeliaNoveltyInstallation} from './lib/noelia-payroll-circuit-qa.mjs';
import {buildOwnJurisdictionInstallation} from './lib/own-payroll-jurisdiction-installation.mjs';
import {buildAdoptionUuidDefaultRepair,assertAdoptionUuidRepairDurability} from './lib/adoption-uuid-default-repair.mjs';
import {relocateAdoptionUuidDefaultRepair} from './lib/adoption-uuid-default-repair-qa.mjs';
import {preservationSnapshot} from './lib/native-leave-installation.mjs';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {createOwnNoveltyHandler as createNoveltyHandler} from '../api/internal-own-payroll-novelties.js';
import {createOwnRunHandler as createRunHandler} from '../api/internal-own-payroll-run.js';
import {adoptionPreparationOperation} from '../lib/internal-employment-adoption.js';
import {adoptionPreparationPayload} from '../assets/employment-adoption-preparation-model.js';
import {municipalAdoptionOperation} from '../lib/internal-municipal-adoption.js';
const root=path.resolve(import.meta.dirname,'..');
export async function verifyPublishedNoveltyAdoption({major,sourceCommit,output,transport='local'}){
 assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);if(transport==='ci')assert.equal(sourceCommit,process.env.GITHUB_SHA);
 const destination=path.resolve(output);assert.ok(destination.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(destination));fs.mkdirSync(destination);
 const qa=buildNoeliaCircuitQa(major),batch=buildPublishedNoveltyAdoptionInstallation({read:p=>fs.readFileSync(path.join(root,p),'utf8'),sourceCommit}),b=relocatePublishedNoveltyAdoption(batch,qa),db=createNoeliaCircuitPsqlQa({major,port:55400+major,schema:qa.schema,pins:qa.pins,transport,browser:'none'});
 let step=0,seeded=false,failure,report;const labels=[],ok=(v,label)=>{assert.ok(v,label);labels.push(label);};
 const run=(sql,error)=>{const file=path.join(destination,String(++step).padStart(3,'0')+'.sql');fs.writeFileSync(file,sql,{flag:'wx'});const r=spawnSync(db.executable,[...db.args,'--no-password','-f',file],{encoding:'utf8',windowsHide:true,env:db.environment,maxBuffer:12*1024*1024});fs.writeFileSync(file+'.log',r.stdout+r.stderr,{flag:'wx'});if(error){assert.equal(r.status,3);assert.ok(r.stderr.includes(error),r.stderr.slice(-2000));return;}assert.equal(r.status,0,r.stderr.slice(-3000));return r.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);};
 const tx=statements=>`BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL statement_timeout='180s';SET LOCAL lock_timeout='2s';SET LOCAL search_path=pg_catalog,${qa.schema},public,pg_temp;DO $$ BEGIN ${qa.pins} END $$;${statements.join(';\n')};COMMIT;`;
 const proof=()=>JSON.parse(run(tx(['SET TRANSACTION READ ONLY',preservationSnapshot('after'),"SELECT jsonb_build_object('fingerprint',encode(public.digest(current_setting('municontrol_sql111.after')::jsonb::text,'sha256'),'hex'),'schemas',(SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'mc_qa_%'))"])));
 const prior=proof();assert.equal(prior.schemas,0);
 const actor=qa.actors.maker,principal={user:{email:actor.actorEmail},tenant:{source:'membership',id:actor.tenantId,membershipId:actor.membershipId,effectiveCapabilities:qa.caps}},session={email:actor.actorEmail,id:actor.actorSessionId,version:actor.actorSessionVersion,releaseSha:actor.releaseSha};
 const env={INTERNAL_APP_ORIGIN:'https://noelia-qa.example',FRIENDLY_GRH_SOURCE_DATABASE:'qa_fixed_source',FRIENDLY_GRH_COMPANY_ID:'101'},deps={env,requireAccess:()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:()=>db},handlers={novelty:createNoveltyHandler(deps),run:createRunHandler(deps)};
 const api=async(kind,query,body,key=randomUUID(),expected=200)=>{const url='/api/qa-'+kind+(query?'?'+new URLSearchParams(query):''),res={setHeader(){},status(v){this.statusCode=v;return this;},json(v){this.value=v;return this;}};await handlers[kind]({method:body?'POST':'GET',url,query:query??{},headers:body?{origin:env.INTERNAL_APP_ORIGIN,'sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':key}:{},...(body?{body:JSON.stringify({operation:kind==='run'?'calculate':'command',payload:body})}:{})},res);assert.equal(res.statusCode,expected,JSON.stringify(res.value));assert.equal(res.value.ok,true);return res.value.data;};
 try{
  run(qa.sql);seeded=true;
  run(tx([`CREATE TABLE ${qa.schema}.preservation_sentinel(value text NOT NULL)`,`INSERT INTO ${qa.schema}.preservation_sentinel VALUES('original')`]));
  run(tx(batch.bulk.novelty.installation.map(qa.normalized)));ok(true,'exact published SQL130 installs before adoption in the synthetic database');
  const boot=await api('novelty',{resource:'bootstrap'}),subject=boot.subjects.find(s=>s.legajo==='19041');assert.ok(subject);
  const period=await db.run("SELECT to_jsonb(greatest('2026-10',to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM')))");
  const body={command:'prepare',periodMonth:period+'-01',payrollType:'monthly',rows:[{rowOrdinal:1,legajo:subject.legajo,contractId:subject.contractId,identityToken:subject.identityToken,conceptSourceId:'120',costCenterSourceId:'20',adjustmentMonth:null,quantityDecimal:null,amountCents:'2000',movementType:null,legalInstrument:'Documento exclusivamente inventado QA',observation:null,forced:false}],reviewConfirmed:true},key=randomUUID();
  const prepared=await api('novelty',null,body,key,201),attempt=await api('novelty',{resource:'attempt',key});
  ok(prepared.snapshot.rowCount===1,'actual HTTP writes one synthetic novelty before upgrading');
  const rb=await api('run',{resource:'bootstrap'}),runBody={period,liquidationType:'monthly',selection:{kind:'all',values:[]},scopeVersion:rb.scopeVersion,programVersion:rb.programVersion,populationDomain:'native_registered'},runKey=randomUUID(),calculated=await api('run',null,runBody,runKey,201);
  ok(calculated.saved.result.employeeCount===26,'actual HTTP calculates the originally native synthetic population before upgrading');
  const before=proof(),captureBefore=await api('run',{resource:'attempt',key:runKey});
  assert.deepEqual(JSON.parse(run(tx(['SET TRANSACTION READ ONLY',...b.preflight]))),{allChecksPassed:true,businessOperations:0,nominalRowsReturned:0});assert.deepEqual(proof(),before);ok(true,'read-only preflight pins every published prerequisite without changing rows or objects');
  run(tx(batch.bulk.operator.consumers.statements.map(qa.normalized)),'ADOPTED_CONSUMERS_BEFORE_METADATA');assert.deepEqual(proof(),before);ok(true,'old standalone guard still refuses SQL130 with zero partial changes');
  run(tx([...b.installation,"DO $$ BEGIN RAISE EXCEPTION 'QA_ATOMIC_UPGRADE_FAULT';END $$"]),'QA_ATOMIC_UPGRADE_FAULT');assert.deepEqual(proof(),before);ok(true,'late failure rolls back all new objects, body changes and pre-existing rows');
  const firstWrite=b.installation.findIndex(s=>s.includes('CREATE TABLE'));
  assert.ok(firstWrite>0);run(tx([...b.installation.slice(0,firstWrite+1),"DO $$ BEGIN RAISE EXCEPTION 'QA_SPLIT_STAGE_FAULT';END $$"]),'QA_SPLIT_STAGE_FAULT');assert.deepEqual(proof(),before);ok(true,'failure between separate stages still rolls back the same complete transaction');
  run(tx([...b.installation.slice(0,firstWrite+1),`UPDATE ${qa.schema}.preservation_sentinel SET value='unexpected'`,...b.installation.slice(firstWrite+1)]),'PUBLISHED_ADOPTION_PRIOR_STATE_CHANGED');assert.deepEqual(proof(),before);ok(true,'full final row comparison rejects prior-row changes even when inner stages reuse row fingerprints');
  const installed=JSON.parse(run(tx(["SET LOCAL statement_timeout='45s'",...b.installation]))),durable=JSON.parse(run(tx(["SET LOCAL statement_timeout='45s'",...b.durableVerification])));assertPublishedNoveltyAdoptionDurability({installed,durable,batch});
  fs.writeFileSync(path.join(destination,'installation-proof.json'),JSON.stringify({installed,durable},null,2),{flag:'wx'});ok(true,'atomic upgrade commits and is independently durable without losing existing novelty rows');
  const after=proof();assert.deepEqual(JSON.parse(run(tx(b.installation))),installed);assert.deepEqual(proof(),after);ok(true,'whole upgraded installation repeats without changes');
  assert.deepEqual(JSON.parse(run(tx(['SET TRANSACTION READ ONLY',...b.preflight]))),{allChecksPassed:true,businessOperations:0,nominalRowsReturned:0});ok(true,'read-only preflight also verifies the exact fully upgraded state');
  assert.deepEqual(await api('novelty',{resource:'attempt',key}),attempt);assert.deepEqual(await api('novelty',null,body,key,200),{...prepared,replayed:true});ok(true,'pre-upgrade novelty receipt, body and key remain exactly recoverable');
  assert.deepEqual(await api('run',{resource:'attempt',key:runKey}),captureBefore);ok(true,'pre-upgrade full calculated capture remains exactly recoverable');
  const currentBoot=await api('run',{resource:'bootstrap'}),newRun=await api('run',null,{...runBody,scopeVersion:currentBoot.scopeVersion,programVersion:currentBoot.programVersion},randomUUID(),201);ok(newRun.saved.result.employeeCount===26,'upgraded capture still calculates originally native contracts');
  const stable=proof();
  for(const [label,sql,error]of [
   ['unexpected private execution grant',`GRANT EXECUTE ON FUNCTION ${qa.schema}.employment_adoption_decide_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app`,'ADOPTION_INSTALL_FUNCTION_METADATA'],
   ['partial operator installation',`DROP FUNCTION ${qa.schema}.municipal_adoption_attempt_v1(jsonb,uuid)`,'PUBLISHED_ADOPTION_PARTIAL_STATE'],
   ['mixed old capture body',qa.normalized(batch.bulk.novelty.installation.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_run_capture_v1('))),'ADOPTED_CONSUMERS_AFTER_METADATA']]){
   run(tx([sql,...b.installation]),error);assert.deepEqual(proof(),stable);ok(true,label+' is rejected and rolled back');
  }
  // Exercise runtime resolution after the exact SQL143 upgrade. Earlier QA
  // seeded catalog-first and therefore missed the public-first install defect.
  const options={read:p=>fs.readFileSync(path.join(root,p),'utf8'),sourceCommit},jurisdiction=buildOwnJurisdictionInstallation(options),j=relocateNoeliaJurisdictionInstallation(jurisdiction,qa,relocateNoeliaNoveltyInstallation(batch.bulk,qa));
  run(tx(j.installation));run(tx([`DO $$ BEGIN PERFORM ${qa.schema}.municipal_adoption_ready_v1();END $$`]));ok(true,'SQL143 runtime readiness passes before the reproduced default defect');
  const repair=buildAdoptionUuidDefaultRepair(options),r=relocateAdoptionUuidDefaultRepair(repair,qa,j);
  run(tx(['SET LOCAL search_path=public,pg_catalog,'+qa.schema+',pg_temp',...['employment_adoption_proposal','employment_adoption_decision'].map(n=>`ALTER TABLE ${qa.schema}.${n} ALTER COLUMN id SET DEFAULT gen_random_uuid()`)]));
  const wrong=proof();run(tx([`DO $$ BEGIN PERFORM ${qa.schema}.municipal_adoption_ready_v1();END $$`]),'ADOPTION_INSTALL_TABLE_METADATA');assert.deepEqual(proof(),wrong);ok(true,'public-first pgcrypto UUID defaults reproduce the actual runtime failure without row changes');
  run(tx([...r.installation,"DO $$ BEGIN RAISE EXCEPTION 'QA_UUID_LATE_FAILURE';END $$"]),'QA_UUID_LATE_FAILURE');assert.deepEqual(proof(),wrong);ok(true,'late failure rolls back both default repairs and preserves every prior object and row');
  run(tx([`ALTER TABLE ${qa.schema}.employment_adoption_seal ADD COLUMN unexpected boolean`,...r.installation]),'ADOPTION_UUID_TABLE_CHANGED');assert.deepEqual(proof(),wrong);ok(true,'unreviewed metadata in a table without a UUID default is rejected rather than hidden by SQL null');
  run(tx([`GRANT SELECT ON ${qa.schema}.employment_adoption_proposal TO municontrol_actions_runtime_app`,...r.installation]),'ADOPTION_UUID_TABLE_CHANGED');assert.deepEqual(proof(),wrong);ok(true,'broadened table permission is rejected and rolled back');
  run(tx([`ALTER TABLE ${qa.schema}.own_payroll_novelty_event ALTER COLUMN id SET DEFAULT public.gen_random_uuid()`,...r.installation]),'ADOPTION_UUID_TABLE_NOT_EMPTY');assert.deepEqual(proof(),wrong);ok(true,'SQL130 wrapper repair refuses a table with existing novelty history and rolls back all changes');
  const repairInstalled=JSON.parse(run(tx(r.installation))),repairDurable=JSON.parse(run(tx(r.durableVerification)));assertAdoptionUuidRepairDurability({installed:repairInstalled,durable:repairDurable,batch:repair});
  fs.writeFileSync(path.join(destination,'uuid-repair-proof.json'),JSON.stringify({installed:repairInstalled,durable:repairDurable},null,2),{flag:'wx'});ok(true,'repair is independently durable, conserves existing canonical novelty history and passes actual runtime readiness');
  const repaired=proof();assert.deepEqual(JSON.parse(run(tx(r.installation))),repairInstalled);assert.deepEqual(proof(),repaired);ok(true,'repeating the repaired batch preserves default OIDs and all other state');
  const checker=qa.actors.checker,reviewPrincipal={user:{email:checker.actorEmail},tenant:{source:'membership',id:checker.tenantId,membershipId:checker.membershipId,effectiveCapabilities:qa.caps}},reviewSession={email:checker.actorEmail,id:checker.actorSessionId,version:checker.actorSessionVersion,releaseSha:checker.releaseSha};
  const adoptionBoot=await adoptionPreparationOperation(db,principal,session,'bootstrap'),proposal=await adoptionPreparationOperation(db,principal,session,'propose',{key:randomUUID(),body:await adoptionPreparationPayload(adoptionBoot.review,adoptionBoot.catalogVersion,'42','Resolución exclusivamente inventada QA','Adopción exclusivamente sintética posterior a SQL130 con registros existentes')});
  const review=await municipalAdoptionOperation(db,reviewPrincipal,reviewSession,'review',{id:proposal.receipt.proposalId}),adopted=await municipalAdoptionOperation(db,reviewPrincipal,reviewSession,'command',{key:randomUUID(),body:{reviewVersion:review.reviewVersion,review:{proposalId:review.proposal.proposalId,proposalVersion:review.proposal.proposalVersion,sourceContextVersion:review.proposal.sourceContextVersion,catalogVersion:review.proposal.catalogVersion,decision:'approve',reason:'Decisión independiente exclusivamente inventada QA'},reviewConfirmed:true}});
  ok(adopted.receipt.effects.contractsAdopted===3,'actual independent operator adopts all three synthetic historical contracts after SQL130');
  const nonempty=proof();run(tx(r.installation),'ADOPTION_UUID_TABLE_NOT_EMPTY');assert.deepEqual(proof(),nonempty);ok(true,'repair refuses tables already containing adoption decisions and conserves their history');
  const adoptedBoot=await api('run',{resource:'bootstrap'}),adoptedRun=await api('run',null,{...runBody,scopeVersion:adoptedBoot.scopeVersion,programVersion:adoptedBoot.programVersion},randomUUID(),201);ok(adoptedRun.saved.result.employeeCount===29,'upgraded actual SQL capture calculates native and adopted contracts together');
  assert.deepEqual(await api('novelty',{resource:'attempt',key}),attempt);assert.deepEqual(await api('run',{resource:'attempt',key:runKey}),captureBefore);ok(true,'historical novelty and calculated capture remain immutable after actual adoption');
  // A fresh synthetic instance mirrors the three EMPTY real tables. Preserve
  // the earlier populated-history checks; never delete their rows as a shortcut.
  run(tx([`DROP SCHEMA ${qa.schema} CASCADE`]));assert.deepEqual(proof(),prior);run(qa.sql);run(tx(batch.bulk.novelty.installation.map(qa.normalized)));run(tx(b.installation));run(tx(j.installation));
  run(tx(['SET LOCAL search_path=public,pg_catalog,'+qa.schema+',pg_temp',...['employment_adoption_proposal','employment_adoption_decision','own_payroll_novelty_event'].map(n=>`ALTER TABLE ${qa.schema}.${n} ALTER COLUMN id SET DEFAULT gen_random_uuid()`)]));
  const threeWrong=proof();run(tx([`DO $$ BEGIN PERFORM ${qa.schema}.municipal_adoption_ready_v1();END $$`]),'ADOPTION_INSTALL_TABLE_METADATA');ok(true,'fresh empty instance reproduces all three live pgcrypto defaults');
  run(tx([...r.installation,"DO $$ BEGIN RAISE EXCEPTION 'QA_THREE_UUID_ROLLBACK';END $$"]),'QA_THREE_UUID_ROLLBACK');assert.deepEqual(proof(),threeWrong);ok(true,'all three repairs roll back together after a late fault');
  const threeInstalled=JSON.parse(run(tx(r.installation))),threeDurable=JSON.parse(run(tx(r.durableVerification)));assertAdoptionUuidRepairDurability({installed:threeInstalled,durable:threeDurable,batch:repair});assert.equal(threeInstalled.noveltyRows,0);ok(true,'all three empty-table defaults are repaired with independent readiness and conservation proof');
  fs.writeFileSync(path.join(destination,'uuid-three-defaults-proof.json'),JSON.stringify({installed:threeInstalled,durable:threeDurable},null,2),{flag:'wx'});
  const threeFixed=proof();assert.deepEqual(JSON.parse(run(tx(r.installation))),threeInstalled);assert.deepEqual(proof(),threeFixed);ok(true,'repetition of the three-default repair executes no DDL or nominal writes');
  report={passed:true,major,sourceCommit,checks:labels.length,checkLabels:labels,actualApi:true,actualPostgres:true,productionWrites:false,municipalAcceptance:false,connections:db.connections.length};
 }catch(e){failure=e;report={passed:false,major,sourceCommit,checks:labels.length,checkLabels:labels,message:e.message,productionWrites:false};}
 finally{try{if(seeded)run(tx([`DROP SCHEMA ${qa.schema} CASCADE`]));assert.deepEqual(proof(),prior);report.syntheticSchemaRemoved=true;report.priorDatabasePreserved=true;}catch(e){failure??=e;report.passed=false;report.cleanupError=e.message;}}
 fs.writeFileSync(path.join(destination,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});if(failure)throw failure;return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{
 const args=Object.fromEntries(process.argv.slice(2).map(v=>{assert.match(v,/^--[a-z-]+=/);const i=v.indexOf('=');return[v.slice(2,i),v.slice(i+1)];}));assert.deepEqual(Object.keys(args).sort(),['major','output','source-commit','transport']);
 console.log(JSON.stringify(await verifyPublishedNoveltyAdoption({major:Number(args.major),sourceCommit:args['source-commit'],output:args.output,transport:args.transport})));
}catch(e){console.error(JSON.stringify({passed:false,message:e.message}));process.exitCode=1;}
