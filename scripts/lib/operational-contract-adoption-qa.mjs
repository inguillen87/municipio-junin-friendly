import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';import {pinsCheck} from './native-leave-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {installRegistryOriginalFactsQa} from './registry-original-facts-qa-scenario.mjs';
import {buildOperationalContractAdoptionInstallation} from './operational-contract-adoption-installation.mjs';
import {adoptionPreparationOperation} from '../../lib/internal-employment-adoption.js';
import {municipalAdoptionOperation} from '../../lib/internal-municipal-adoption.js';
import {adoptionPreparationPayload,operationalAdoptionTransition} from '../../assets/employment-adoption-preparation-model.js';
export function relocateOperationalAdoption(batch,qa,previous){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);const n=qa.normalized;
 const replace=s=>batch.beforePins.slice(0,-1).reduce((v,p,i)=>v.replaceAll(p.sha256,batch.afterPins[i].sha256),s);
 const ready=replace(previous.readyDefinition).replace(' BEGIN ',()=> ' BEGIN EXECUTE '+q(n(pinsCheck(batch.newPins,'OPERATIONAL_ADOPTION_NEW_METADATA')))+';');
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.afterPins.at(-1).signature.replace('public.',qa.schema+'.'),runtime:false};
 const before=previous.verification[1],after=replace(before).replaceAll(previous.readyPin.sha256,readyPin.sha256)+';'+n(pinsCheck(batch.newPins,'OPERATIONAL_ADOPTION_NEW_METADATA'));
 const initial=`DO $initial$ BEGIN IF current_setting('municontrol_operational_adoption.mode')='first' THEN EXECUTE ${q(before)};ELSE EXECUTE ${q(after)};END IF;END $initial$`;
 const defs=[...batch.newDefinitions.map(n),...batch.afterDefinitions.slice(0,-1).map(d=>n(d.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '))),ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '),...batch.migration.slice(-2).map(n)];
 const apply=`DO $apply$ BEGIN IF current_setting('municontrol_operational_adoption.mode')='first' THEN ${defs.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 return{...batch,readyPin,readyDefinition:ready,installation:batch.installation.map((s,i)=>i===1?initial:i===3?apply:i===4?after:n(s)),verification:batch.verification.map((s,i)=>i===1?after:n(s))};
}
export async function operationalAdoptionQaScenario({options,qa,db,run,tx,ok,declaredBatch,principal,session,key,body,saved}){
 const previous=await installRegistryOriginalFactsQa({options,qa,run,tx,ok,declaredBatch});
 const batch=relocateOperationalAdoption(buildOperationalContractAdoptionInstallation(options),qa,previous),input={revisionId:qa.revision,packageSha256:qa.packageSha};
 run(tx(batch.installation,'ROLLBACK'));run(tx(previous.verification));ok(true,'operational rehearsal rolls back without changing all previous objects');
 run(tx([qa.normalized(batch.newDefinitions[0]),...batch.installation]),'OPERATIONAL_ADOPTION_PARTIAL_STATE');run(tx(previous.verification));ok(true,'partial operational state is rejected and rolled back');
 const installed=JSON.parse(run(tx(batch.installation))),durable=JSON.parse(run(tx(batch.verification)));assert.equal(installed.mode,'first');assert.deepEqual({...durable,mode:'first'},installed);ok(true,'operational installation preserves rows, privileges and durable function metadata');
 const repeat=JSON.parse(run(tx(batch.installation)));assert.equal(repeat.mode,'repeat');assert.deepEqual({...repeat,mode:'first'},installed);ok(true,'operational repeat installs no new object');
 const recovered=await adoptionPreparationOperation(db,principal,session,'attempt',{key});assert.equal(recovered.bodySha256,saved.bodySha256);assert.equal((await adoptionPreparationOperation(db,principal,session,'propose',{key,body})).receipt.replayed,true);ok(true,'original pending request body and key remain recoverable after the extension');
 const full=await adoptionPreparationOperation(db,principal,session,'registry-bootstrap',input),operative=await adoptionPreparationOperation(db,principal,session,'operational-bootstrap',input);
 await operationalAdoptionTransition(full.review,operative.review);assert.equal(full.review.total,869);assert.equal(operative.review.total,855);assert.equal(operative.review.source.operationalCohort.deferredTotal,14);assert.equal(operative.review.source.operationalCohort.archivedTotal,1583);ok(true,'actual authoritative SQL splits 855 candidates,14 pending and1583 history with full2452 source coverage');
 const pending=full.review.rows.filter(r=>r.startDate===null),pendingIds=pending.map(r=>q(r.contractId)+'::uuid').join(',');
 const retained=()=>db.run(`SELECT jsonb_build_object('rows',count(*),'hash',md5(string_agg(to_jsonb(c)::text,'' ORDER BY c.id))) FROM ${qa.schema}.employment_contract c WHERE id=ANY(ARRAY[${pendingIds}]) OR EXISTS(SELECT 1 FROM ${qa.schema}.qa_final_rows f WHERE f.entity='curated/grh_employees' AND f.record->>'legajo'=c.legacy_legajo AND f.record->>'activo'='false')`),before=await retained();assert.equal(before.rows,1597);
 const input7=await adoptionPreparationPayload(operative.review,operative.catalogVersion,'','Documento sintético','Preparación operativa exclusivamente sintética');
 const direct=v=>qa.normalized(`SELECT public.employment_adoption_propose_v1(${q(JSON.stringify(qa.actors.maker))}::jsonb,${q(JSON.stringify(v))}::jsonb,${q(randomUUID())}::uuid)`);
 run(tx([direct(input7)]),'NATIVE_EMPLOYMENT_CATALOG_BUSY');ok(true,'the existing catalog guard still refuses a command in repeatable-read isolation');
 const commandTx=statements=>{const sql=tx(statements),anchor='BEGIN ISOLATION LEVEL REPEATABLE READ;';assert.ok(sql.startsWith(anchor));return sql.replace(anchor,'BEGIN ISOLATION LEVEL READ COMMITTED;');};
 for(const[label,change]of[['omitted candidate',v=>v.rows.pop()],['added deferred record',v=>v.rows.push(full.review.rows[0])],['old cohort label',v=>v.cohort='active-contracts.v1']]){const v=structuredClone(input7);change(v);run(commandTx([direct(v)]),'EMPLOYMENT_ADOPTION_');ok(true,label+' cannot change the canonical scope');}
 const denied=structuredClone(principal);denied.tenant.effectiveCapabilities=denied.tenant.effectiveCapabilities.filter(c=>c!=='employee.record.propose');await assert.rejects(adoptionPreparationOperation(db,denied,session,'propose',{key:randomUUID(),body:input7}),{status:403});ok(true,'revoked authority cannot persist the new scope');
 const key7=randomUUID(),saved7=await adoptionPreparationOperation(db,principal,session,'propose',{key:key7,body:input7});assert.equal(saved7.receipt.total,855);const replay=await adoptionPreparationOperation(db,principal,session,'propose',{key:key7,body:input7});assert.equal(replay.receipt.replayed,true);assert.equal(replay.bodySha256,saved7.bodySha256);ok(true,'new855 proposal persists once with the same immutable key and complete body');
 const c=qa.actors.checker,checker={user:{email:c.actorEmail},tenant:{source:'membership',id:c.tenantId,membershipId:c.membershipId,effectiveCapabilities:qa.caps}},checkerSession={email:c.actorEmail,id:c.actorSessionId,version:c.actorSessionVersion,releaseSha:c.releaseSha};
 const detail=await municipalAdoptionOperation(db,checker,checkerSession,'review',{id:saved7.receipt.proposalId});assert.equal(detail.review.total,855);assert.equal(detail.review.source.operationalCohort.deferredTotal,14);ok(true,'independent reviewer sees candidates and preserved deferred coverage');
 const decision={reviewVersion:detail.reviewVersion,review:{proposalId:saved7.receipt.proposalId,proposalVersion:saved7.receipt.proposalVersion,sourceContextVersion:input7.sourceContextVersion,catalogVersion:input7.catalogVersion,decision:'approve',reason:'Decisión independiente sintética'},reviewConfirmed:true};
 await assert.rejects(municipalAdoptionOperation(db,principal,session,'command',{key:randomUUID(),body:decision}));ok(true,'same actor cannot approve the operational adoption');
 const decisionKey=randomUUID(),done=await municipalAdoptionOperation(db,checker,checkerSession,'command',{key:decisionKey,body:decision});assert.equal(done.receipt.effects.contractsAdopted,855);assert.equal(done.receipt.effects.payrollCalculated,false);assert.equal(done.receipt.effects.paymentsExecuted,false);assert.deepEqual(await retained(),before);ok(true,'actual synthetic decision adopts exactly855 and preserves all14 pending and1583 historical rows byte for byte');
 const terminal=await municipalAdoptionOperation(db,checker,checkerSession,'review',{id:saved7.receipt.proposalId});assert.equal(terminal.proposal.status,'approved');assert.equal(terminal.review.total,855);assert.equal((await municipalAdoptionOperation(db,checker,checkerSession,'command',{key:decisionKey,body:decision})).receipt.replayed,true);ok(true,'terminal review and decision recovery preserve the frozen source scope');
 return{version:'operational-contract-adoption-qa.v1',installed,durable,syntheticAdopted:855,syntheticDeferred:14,syntheticArchived:1583};
}
