import {registryOriginalFactsQaScenario} from "./lib/registry-original-facts-qa-scenario.mjs";
// Existing fixed local QA or disposable CI only. All records are fictional.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {buildFinalIdentityProfileInstallation,relocateFinalIdentityProfiles} from './lib/final-identity-profile-installation.mjs';
import {buildFinalContractAdoptionInstallation} from './lib/final-contract-adoption-installation.mjs';
import {buildActiveContractAdoptionInstallation} from './lib/active-contract-adoption-installation.mjs';
import {buildActiveAdoptionSerializationInstallation,relocateActiveAdoptionSerialization} from './lib/active-adoption-serialization-installation.mjs';
import {buildFinalAdoptionQa,relocateFinalAdoption} from './lib/final-contract-adoption-qa.mjs';
import {relocateActiveAdoption} from './lib/active-contract-adoption-qa.mjs';
import {buildInactiveJurisdictionInstallation} from './lib/adoption-inactive-jurisdiction-installation.mjs';
import {relocateInactiveJurisdictionInstallation} from './lib/adoption-inactive-jurisdiction-qa.mjs';
import {buildAdoptedOwnNoveltyInstallation} from './lib/adopted-own-novelties-installation.mjs';
import {buildOwnJurisdictionInstallation} from './lib/own-payroll-jurisdiction-installation.mjs';
import {createNoeliaCircuitPsqlQa,relocateNoeliaNoveltyInstallation,relocateNoeliaJurisdictionInstallation} from './lib/noelia-payroll-circuit-qa.mjs';
import {noeliaCircuitOptions} from './lib/noelia-circuit-runtime.mjs';
import {preservationSnapshot} from './lib/native-leave-installation.mjs';import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {FINAL_CONTRACT_IDENTITY_PROFILE_MATCH_SQL} from './lib/grh-final-contract-transition.mjs';
import {finalIdentityProfileCases} from '../tests/fixtures/final-identity-profile-synthetic.js';
import {adoptionPreparationOperation} from '../lib/internal-employment-adoption.js';
import {buildActiveSourceDeclarationsInstallation} from './lib/active-source-declarations-installation.mjs';
import {declaredSourceFixture,relocateActiveSourceDeclarations} from './lib/active-source-declarations-qa.mjs';
import {municipalAdoptionOperation} from '../lib/internal-municipal-adoption.js';
import {readAdoptionHistory} from '../lib/internal-employment-adoption-history.js';
import {adoptionPreparationPayload} from '../assets/employment-adoption-preparation-model.js';

const root=path.resolve(import.meta.dirname,'..');
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export async function verifyRegistryOriginalFacts({major,output,sourceCommit,transport='local'}){
 assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 if(transport==='ci')assert.equal(sourceCommit,process.env.GITHUB_SHA);
 const destination=path.resolve(output);assert.ok(destination.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(destination));
 const qa=buildFinalAdoptionQa(major,{invalidInactive:true,contractCount:2452,activeCount:869});
 const options={sourceCommit,read:p=>fs.readFileSync(path.join(root,p),'utf8'),legacyIdentityComparison:true};
 const base=relocateNoeliaNoveltyInstallation(buildAdoptedOwnNoveltyInstallation(options),qa);
 const jurisdiction=relocateNoeliaJurisdictionInstallation(buildOwnJurisdictionInstallation(options),qa,base);
 const inactive=relocateInactiveJurisdictionInstallation(buildInactiveJurisdictionInstallation(options),qa,jurisdiction);
 const final=relocateFinalAdoption(buildFinalContractAdoptionInstallation(options),qa,inactive);
 const active=relocateActiveAdoption(buildActiveContractAdoptionInstallation(options),qa,final);
 const serialization=relocateActiveAdoptionSerialization(buildActiveAdoptionSerializationInstallation(options),qa,active);
 const batch=relocateFinalIdentityProfiles(buildFinalIdentityProfileInstallation(options),qa,serialization);
 const adapter=createNoeliaCircuitPsqlQa({major,port:55400+major,schema:qa.schema,pins:qa.pins,transport,browser:'none'}),db={...adapter,query:async(sql,values)=>{try{return await adapter.query(sql,values);}catch(e){fs.writeFileSync(path.join(destination,'adapter-failure.txt'),e.stack??String(e));throw e;}}};
 fs.mkdirSync(destination);let step=0,seeded=false,report,failure;const checks=[];
 const ok=(v,label)=>{assert.ok(v,label);checks.push(label);};
 const run=(sql,error)=>{const file=path.join(destination,String(++step).padStart(3,'0')+'.sql');fs.writeFileSync(file,sql,{flag:'wx'});
  const r=spawnSync(db.executable,[...db.args,'--no-password','-f',file],{encoding:'utf8',windowsHide:true,env:db.environment,maxBuffer:12*1024*1024});
  fs.writeFileSync(file+'.log',r.stdout+r.stderr);if(error){assert.equal(r.status,3);assert.ok(r.stderr.includes(error),r.stderr.slice(-2500));return;}
  assert.equal(r.status,0,r.stderr.slice(-2500));return r.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);};
 const tx=(sql,end='COMMIT')=>`BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL TIME ZONE 'UTC';SET LOCAL statement_timeout='180s';SET LOCAL lock_timeout='2s';SET LOCAL search_path=pg_catalog,${qa.schema},public,pg_temp;DO $$ BEGIN ${qa.pins} END $$;${sql.join(';\n')};${end};`;
 const priorProof=()=>JSON.parse(run(tx(['SET TRANSACTION READ ONLY',preservationSnapshot('after'),"SELECT jsonb_build_object('fingerprint',encode(public.digest(current_setting('municontrol_sql111.after')::jsonb::text,'sha256'),'hex'),'schemas',(SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'mc_qa_%'))"])));
 const prior=priorProof();assert.equal(prior.schemas,0);
 if(transport==='local'){const data=JSON.parse(run(tx(["SELECT jsonb_build_object('data',current_setting('data_directory'),'project',current_setting('neon.project_id',true),'branch',current_setting('neon.branch_id',true))"])));
  assert.equal(fs.realpathSync(data.data).toLowerCase(),fs.realpathSync(path.join(root,'verification','postgresql-qa-20261004','pg'+major+'-data')).toLowerCase());assert.ok(!data.project&&!data.branch);}
 const a=qa.actors.maker,principal={user:{email:a.actorEmail},tenant:{source:'membership',id:a.tenantId,membershipId:a.membershipId,effectiveCapabilities:qa.caps}},session={email:a.actorEmail,id:a.actorSessionId,version:a.actorSessionVersion,releaseSha:a.releaseSha};
 try{
  run(qa.sql);seeded=true;run(tx(base.operator.consumers.statements));run(tx(base.operator.statements));run(tx(base.installation));run(tx(jurisdiction.installation));run(tx(inactive.installation));
  const boot=await adoptionPreparationOperation(db,principal,session,'bootstrap'),key=randomUUID();
  const body=await adoptionPreparationPayload(boot.review,boot.catalogVersion,'42','Documento ficticio de prueba','Propuesta previa exclusivamente sintética',{allowInactivePending:true});
  const saved=await adoptionPreparationOperation(db,principal,session,'propose',{key,body});
  run(tx([declaredSourceFixture(qa)]));run(tx(final.installation));run(tx(active.installation));run(tx(serialization.installation));
  const cases=finalIdentityProfileCases();
  const values=cases.map((c,n)=>`(${n},${q(c.label)},${q(JSON.stringify(c.record))}::jsonb,${q(JSON.stringify(c.person))}::jsonb,${c.match})`).join(',');
  const results=JSON.parse(run(tx(['SET TRANSACTION READ ONLY',qa.normalized(`WITH revision AS(SELECT DATE '2026-10-01' AS source_cutoff),cases(n,label,record,before_person,expected) AS(VALUES ${values}) SELECT jsonb_agg(jsonb_build_object('label',label,'expected',expected,'actual',${FINAL_CONTRACT_IDENTITY_PROFILE_MATCH_SQL}) ORDER BY n) FROM cases`)])));
  for(const c of results)ok(c.actual===c.expected,c.label);
  run(tx(batch.installation,'ROLLBACK'));run(tx(serialization.verification));ok(true,'rehearsal rolls back both function changes and preserves original readiness');
  const late=batch.installation.map((s,i)=>i===3?`DO $$BEGIN EXECUTE ${q(batch.migration[0])};RAISE EXCEPTION 'IDENTITY_PROFILE_QA_LATE_FAILURE';END$$`:s);
  run(tx(late),'IDENTITY_PROFILE_QA_LATE_FAILURE');run(tx(serialization.verification));ok(true,'failure after replacing the row comparator rolls back without a partial readiness state');
  run(tx([`GRANT EXECUTE ON FUNCTION ${qa.schema}.employment_adoption_final_rows_v1(uuid,text) TO municontrol_actions_runtime_app`,...batch.installation]),'METADATA');run(tx(serialization.verification));ok(true,'broadened private execution permission is rejected and rolled back');
  run(tx([batch.migration[0],...batch.installation]),'METADATA');run(tx(serialization.verification));ok(true,'partial upgraded state is rejected and rolled back');
  const installed=JSON.parse(run(tx(batch.installation))),durable=JSON.parse(run(tx(batch.verification)));
  assert.equal(installed.mode,'first');assert.deepEqual({...durable,mode:'first'},installed);ok(true,'commit conserves every row and security object with independent durable verification');
  const repeat=JSON.parse(run(tx(batch.installation)));assert.equal(repeat.mode,'repeat');assert.deepEqual({...repeat,mode:'first'},installed);ok(true,'repetition executes no new schema or business operation');
  const rows=JSON.parse(run(tx(['SET TRANSACTION READ ONLY',`SELECT jsonb_build_object('rows',count(*),'identityIssues',count(*) FILTER(WHERE v->'issues' ? 'PERSON_FACTS_CHANGED'),'invalidHistory',count(*) FILTER(WHERE v->'issues' ? 'PERIOD_INVALID')) FROM ${qa.schema}.employment_adoption_final_rows_v1(${q(qa.revision)}::uuid,'101') v`])));
  ok(rows.rows===qa.contractCount&&rows.identityIssues===0&&rows.invalidHistory===1,'actual complete row projection preserves historical date issues without inventing identity changes');
  const updated=await adoptionPreparationOperation(db,principal,session,'final-active-bootstrap',{revisionId:qa.revision,packageSha256:qa.packageSha});
  ok(updated.review.total===qa.activeCount&&updated.review.rows.filter(r=>r.sourceIssues.length).length===14&&updated.review.rows.every(r=>r.sourceIssues.every(k=>['START_DATE_MISSING','CLASSIFICATION_MISSING','JURISDICTION_MISSING_ACTIVE'].includes(k)))&&updated.review.source.operationalCohort.archivedTotal===qa.contractCount-qa.activeCount,
   'actual application transport returns the complete active review after the conservative upgrade');
  const recovered=await adoptionPreparationOperation(db,principal,session,'attempt',{key});
  assert.equal(recovered.bodySha256,saved.bodySha256);assert.equal(recovered.requestKey,key);
  const replay=await adoptionPreparationOperation(db,principal,session,'propose',{key,body});assert.equal(replay.receipt.replayed,true);
  ok(true,'pending pre-upgrade proposal retains its original body and key and remains recoverable');

  const declaredBatch=relocateActiveSourceDeclarations(buildActiveSourceDeclarationsInstallation(options),qa,batch);
  run(tx(declaredBatch.installation,'ROLLBACK'));run(tx(batch.verification));ok(true,'declaration rehearsal restores prior functions and leaves no new durable object');
  const first=JSON.parse(run(tx(declaredBatch.installation))),fresh=JSON.parse(run(tx(declaredBatch.verification)));assert.equal(first.mode,'first');assert.deepEqual({...fresh,mode:'first'},first);ok(true,'declaration installation preserves all data and permissions through a fresh connection');
  const repeated=JSON.parse(run(tx(declaredBatch.installation)));assert.equal(repeated.mode,'repeat');assert.deepEqual({...repeated,mode:'first'},first);ok(true,'declaration installation repeat is inert');
  const changedReady=declaredBatch.installation.map((v,n)=>n===3?'DO $$ BEGIN EXECUTE '+q(qa.normalized(declaredBatch.newDefinitions[0]))+';RAISE EXCEPTION '+q('QA_DECLARATION_LATE_FAILURE')+';END $$':v);
  // The installed mode is repeat; prove late failure in a rehearsal after undoing
  // only this schema increment within the same synthetic transaction.
  run(tx(['DROP FUNCTION '+qa.schema+'.employment_adoption_declared_bootstrap_v1(jsonb,uuid,text,text,text,jsonb)','DROP FUNCTION '+qa.schema+'.employment_adoption_declared_source_v1(jsonb,uuid,text,jsonb)',...batch.migration,...declaredBatch.beforeDefinitions.slice(0,-1).map(v=>qa.normalized(v.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '))),...changedReady]),'QA_DECLARATION_LATE_FAILURE');run(tx(declaredBatch.verification));ok(true,'late failed declaration installation is fully rolled back');
  const registryProof=await registryOriginalFactsQaScenario({options,qa,db,run,tx,ok,declaredBatch,principal,session,key,body,saved});
  report={version:"registry-original-facts-qa.v1",passed:true,sourceCommit,major,transport,checksPassed:checks.length,checks,...registryProof,syntheticContracts:qa.contractCount,productionWrites:0,municipalAcceptance:false};
 }catch(e){failure=e;fs.writeFileSync(path.join(destination,'failure.txt'),e.stack??String(e));}
 finally{if(seeded){assert.equal(Number(await db.run(`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND application_name=${q(db.applicationName)}`)),0);run(tx([`DROP SCHEMA ${qa.schema} CASCADE`]));assert.deepEqual(priorProof(),prior);if(report){report.syntheticSchemaRemoved=true;report.priorDatabasePreserved=true;report.syntheticConnectionsDrained=true;}}}
 if(failure)throw failure;fs.writeFileSync(path.join(destination,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))verifyRegistryOriginalFacts(noeliaCircuitOptions(process.argv.slice(2))).then(r=>console.log(JSON.stringify({major:r.major,passed:r.passed,checksPassed:r.checksPassed,syntheticSchemaRemoved:r.syntheticSchemaRemoved,priorDatabasePreserved:r.priorDatabasePreserved}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
