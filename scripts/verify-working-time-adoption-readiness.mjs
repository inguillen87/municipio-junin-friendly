// Full existing adoption scenario, interrupted by the exact SQL164 capture upgrade.
// All people, proposals and decisions are invented in a disposable QA schema.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {verifyRegistryOriginalFacts} from './verify-registry-original-facts.mjs';
import {operationalAdoptionQaScenario} from './lib/operational-contract-adoption-qa.mjs';
import {noeliaCircuitOptions} from './lib/noelia-circuit-runtime.mjs';
import {buildWorkingTimeAdoptionReadinessRepair,READINESS_PRIOR,READINESS_FINAL,CAPTURE_PRIOR} from './lib/working-time-adoption-readiness.mjs';
import {adoptionPreparationOperation} from '../lib/internal-employment-adoption.js';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function verifyWorkingTimeAdoptionReadiness(options){
 return verifyRegistryOriginalFacts({...options,registryScenario:args=>operationalAdoptionQaScenario({...args,afterProposalScenario:async h=>{
  const {options,qa,db,run,tx,ok,principal,session,key7,input7,saved7}=h,batch=buildWorkingTimeAdoptionReadinessRepair(options),canonical=s=>s.replaceAll(qa.schema+'.','public.');
  const before=await db.run(`SELECT jsonb_build_object('guard',r.prosrc,'capture',c.prosrc,'guardAcl',r.proacl::text,'captureAcl',c.proacl::text) FROM pg_proc r,pg_proc c WHERE r.oid=${q(qa.schema+'.municipal_adoption_ready_v1()')}::regprocedure AND c.oid=${q(qa.schema+'.own_run_capture_v1(jsonb,jsonb,uuid,text)')}::regprocedure`);
  assert.equal(hash(canonical(before.capture)),CAPTURE_PRIOR);assert.equal(canonical(before.guard).split(CAPTURE_PRIOR).length,2);
  const qaPrior=hash(canonical(before.guard)),qaFinal=hash(canonical(before.guard).replace(CAPTURE_PRIOR,batch.working.afterPins.find(p=>p.name==='own_run_capture_v1').sha256));
  // Only namespace-qualified metadata differs in the full original QA guard.
  // The production migration keeps its separately pinned complete body hashes.
  const relocated=qa.normalized(batch.mutations[0].replaceAll(READINESS_PRIOR,qaPrior).replaceAll(READINESS_FINAL,qaFinal)).replaceAll("replace(prosrc,E'\\r\\n',E'\\n')",`replace(replace(prosrc,E'\\r\\n',E'\\n'),${q(qa.schema+'.')},'public.')`);
  run(tx([relocated]),'WORKING_TIME_ADOPTION_CAPTURE_CHANGED');ok(true,'repair rejects the previous capture instead of weakening the adoption guard');
  const source=batch.working.changed.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_run_capture_v1('));assert.ok(source);
  const installed=qa.normalized(source.replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp'));
  run(tx([installed]));
  await assert.rejects(adoptionPreparationOperation(db,principal,session,'final-sources'),{code:'EMPLOYMENT_ADOPTION_NOT_READY',status:503});ok(true,'the actual full-source handler reproduces the production503 after the exact SQL164 capture upgrade');
  const ready='DO $runtime$ BEGIN PERFORM '+qa.schema+'.municipal_adoption_ready_v1();END $runtime$';
  run(tx([relocated,ready],'ROLLBACK'));run(tx([ready]),'ADOPTED_CONSUMERS_AFTER_METADATA');ok(true,'repair rehearsal rolls back and retains the original fail-closed guard');
  run(tx([`CREATE OR REPLACE FUNCTION ${qa.schema}.municipal_adoption_ready_v1() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,${qa.schema},public,pg_temp SET timezone='UTC' AS $tamper$ BEGIN NULL;END $tamper$`,relocated]),'WORKING_TIME_ADOPTION_GUARD_CHANGED');ok(true,'another guard body is refused, including a body that would skip verification');
  const data=()=>db.run(`SELECT jsonb_build_object('contracts',(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY id)::text) FROM ${qa.schema}.employment_contract c),'proposals',(SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) FROM ${qa.schema}.employment_adoption_proposal p),'applications',(SELECT count(*) FROM ${qa.schema}.employment_adoption_application))`),priorData=await data();
  run(tx([relocated,ready]));run(tx(['SET TRANSACTION READ ONLY',ready]));run(tx([relocated,ready]));assert.deepEqual(await data(),priorData);
  const after=await db.run(`SELECT jsonb_build_object('guard',r.prosrc,'capture',c.prosrc,'guardAcl',r.proacl::text,'captureAcl',c.proacl::text) FROM pg_proc r,pg_proc c WHERE r.oid=${q(qa.schema+'.municipal_adoption_ready_v1()')}::regprocedure AND c.oid=${q(qa.schema+'.own_run_capture_v1(jsonb,jsonb,uuid,text)')}::regprocedure`);
  assert.equal(after.guard,before.guard.replace(CAPTURE_PRIOR,batch.working.afterPins.find(p=>p.name==='own_run_capture_v1').sha256));assert.equal(after.guardAcl,before.guardAcl);assert.equal(after.captureAcl,before.captureAcl);
  const available=await adoptionPreparationOperation(db,principal,session,'final-sources');assert.equal(available.total,1);
  const proposal=await adoptionPreparationOperation(db,principal,session,'attempt',{key:key7});assert.equal(proposal.bodySha256,saved7.bodySha256);assert.equal((await adoptionPreparationOperation(db,principal,session,'propose',{key:key7,body:input7})).receipt.replayed,true);
  ok(true,'durable repaired metadata restores actual final-source reads and preserves all rows, ACLs and the original855 pending request');
  return{version:'working-time-adoption-readiness-qa.v1',reproducedProduction503:true,oldGuardPreservedExceptOnePin:true,aclPreserved:true,allRowsPreserved:true,durable:true,replayed:true};
 }})});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))verifyWorkingTimeAdoptionReadiness(noeliaCircuitOptions(process.argv.slice(2))).then(r=>console.log(JSON.stringify({major:r.major,passed:r.passed,checksPassed:r.checksPassed,syntheticSchemaRemoved:r.syntheticSchemaRemoved,priorDatabasePreserved:r.priorDatabasePreserved}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
