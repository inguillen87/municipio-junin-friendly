// Actual published writers, HTTP handlers and owned engine; invented QA only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifyOwnSalarySeniority } from './verify-own-salary-seniority.mjs';
import { buildOwnPeriodParticipationInstallation, assertOwnPeriodParticipationDurability } from './lib/own-period-participation-installation.mjs';
import { ownInstallationFunctionPin } from './lib/own-payroll-installation.mjs';
import { qaLiteral as q } from './lib/own-payroll-durable-qa.mjs';
import { createOwnPeriodParticipationHandler } from '../api/internal-own-period-participation.js';
import { ownProgramDefinition } from '../assets/own-payroll-program-model.js';
import { participationRuleKey } from '../assets/own-period-participation-program.js';
import { emptyOwnReceiptParams } from '../assets/own-payroll-receipt-model.js';
import { createOwnReceiptPdf } from '../assets/own-payroll-receipt-pdf.js';
import { prepareOwnPlanilla } from '../assets/own-payroll-receipt-planilla-model.js';
import { employeeDraft } from '../assets/native-employee-contract.js';
import { independentParticipationReference } from './lib/period-participation-qa-reference.mjs';
const j=v=>q(JSON.stringify(v))+'::jsonb';
const cuil=dni=>{const b='20'+dni,rem=11-[5,4,3,2,7,6,5,4,3,2].reduce((a,w,i)=>a+w*Number(b[i]),0)%11;return b+(rem===11?'0':rem===10?'9':String(rem));};
export async function verifyOwnPeriodParticipation(options) {
 return verifyOwnSalarySeniority({...options,continuation:async h=>{
  const {qa,db,sql,relocate,adapter,deps,handlers,api,ok,setActor,period,oldBody}=h;
  const count=Math.max(37,h.count);
  const batch=buildOwnPeriodParticipationInstallation(h.options);
  const canonical=s=>s.replaceAll('search_path=pg_catalog, '+qa.schema+', public, pg_temp','search_path=pg_catalog, public, pg_temp').replaceAll(qa.schema,'public');
  const readyPins=[batch.beforeDefinitions.at(-1),batch.changed.at(-1)].map(s=>[ownInstallationFunctionPin(s).sha256,ownInstallationFunctionPin(canonical(relocate(s))).sha256]);
  const n=s=>readyPins.reduce((t,[a,b])=>t.replaceAll(a,b),relocate(s));
  const statements=batch.statements.map(s=>s.startsWith('DO $choose$')?`DO $choose$ BEGIN IF current_setting('municontrol_participation.mode')='install' THEN EXECUTE ${q(n(batch.beforeCheck))};ELSE EXECUTE ${q(n(batch.afterCheck))};END IF;END $choose$`:s.startsWith('DO $apply$')?`DO $apply$ BEGIN IF current_setting('municontrol_participation.mode')='install' THEN ${[...batch.migration,...batch.changed].map(s=>'EXECUTE '+q(n(s))+';').join('\n')} END IF;END $apply$`:n(s));
  const installed=await sql(statements.join(';\n')),durable=await sql(batch.verification.map(n).join(';\n'));
  assertOwnPeriodParticipationDurability({installed,durable,batch});
  const repeated=await sql(statements.join(';\n'));assert.equal(installed.mode,'install');assert.deepEqual(repeated,durable);
  ok(true,'SQL157 preserves all prior records, tables and permissions; independent durability and verify-only repeat pass');
  await assert.rejects(()=>sql('GRANT SELECT ON '+qa.schema+'.own_participation_event TO municontrol_actions_runtime_app;'+n(batch.afterCheck)),/PARTICIPATION_TABLE_SECURITY/);
  assert.deepEqual(await sql(batch.verification.map(n).join(';\n')),durable);
  ok(true,'direct table access is rejected by the metadata gate and rolled back');
  const participationAdapter={query:async(query,values)=>{
   if(!query.startsWith('SELECT public.own_participation_'))return adapter.query(query,values);
   assert.match(query,/^SELECT public\.own_participation_(?:bootstrap|detail|attempt|command)_v1\([\s\S]+\) AS result$/);
   return [{result:await db.run(query.replaceAll('public.',qa.schema+'.').replace(/\$(\d+)/g,(_,k)=>{assert.ok(Number(k)>0&&Number(k)<=values.length);return q(values[Number(k)-1]);}),true)}];
  }};
  handlers.participation=createOwnPeriodParticipationHandler({...deps,getSql:()=>participationAdapter});
  setActor(qa.actors.maker);
  // This is an explicit synthetic fixture prerequisite for the already
  // published hire writer. No productive identity or capability is modified.
  await sql('INSERT INTO capabilities(membership_id,capability_key) SELECT '+q(qa.actors.maker.membershipId)+'::uuid,\'employee.record.create\' WHERE NOT EXISTS(SELECT 1 FROM capabilities WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid AND capability_key=\'employee.record.create\')');
  const hireBoot=await db.run('SELECT native_employee_bootstrap_v1('+j(qa.actors.maker)+')',true),people=[];
  const firstCategory=hireBoot.catalog.items.find(x=>x.kind==='categories'&&x.agreementCode==='1');
  assert.ok(firstCategory);
  for(let i=0;i<count;i++) {
   const dni=String(98010000+i),startDate=i===0?'2026-09-01':period+'-05';
   const draft=employeeDraft({legajo:String(30000+i),fullName:'PARCIAL EXCLUSIVAMENTE SINTETICO QA '+i,dni,cuil:cuil(dni),birthDate:'1990-01-01',sexCode:'',startDate,agreementCode:'1',categoryCode:firstCategory.code,organizationId:hireBoot.catalog.items.find(x=>x.kind==='organizations').code,sectorCode:hireBoot.catalog.items.find(x=>x.kind==='sectors').code,jobTitle:'Agente exclusivamente sintético QA',legalReference:'Alta exclusivamente sintética QA',jurisdictionCode:i%2?'55':'42'});
   const hire=await db.run('SELECT native_employee_create_v1('+j(qa.actors.maker)+','+j(draft)+','+q(hireBoot.catalog.version)+','+q(randomUUID())+'::uuid)',true);
   assert.equal(hire.origin,'MUNICONTROL');people.push({contractId:hire.contractId,employeeNumber:hire.legajo});
   await h.seniority.approve(await h.seniority.prepare(people.at(-1),'0'));
  }
  people.splice(1,people.length-1,...people.slice(1).sort((a,b)=>a.contractId.localeCompare(b.contractId)));
  ok(people.length>25,'published hire writer creates a complete native-only population with real partial employment dates and declared jurisdictions');
  const query=contractId=>({resource:'bootstrap',contractId,period});
  const prepare=async(employee,recognizedUnits,baseUnits='3')=>{
   setActor(qa.actors.maker);const b=await api('participation',{query:query(employee.contractId)}),key=randomUUID();
   const body={command:'propose',contractId:b.contractId,period,scopeVersion:b.scopeVersion,baseVersion:b.configuration.version,sourceVersion:b.source.version,proposalId:null,proposalSha256:null,definition:{recognizedUnits,baseUnits,asOfDate:period+'-01',documentReference:'Constancia exclusivamente sintética QA'},reason:'Participación exclusivamente sintética documentada QA',reviewConfirmed:false};
   return {body,key,receipt:await api('participation',{body,key,expected:201})};
  };
  const approve=async p=>{setActor(qa.actors.checker);const b=await api('participation',{query:query(p.body.contractId)});await api('participation',{expected:201,body:{...p.body,command:'approve',scopeVersion:b.scopeVersion,proposalId:p.receipt.proposalId,proposalSha256:p.receipt.requestSha256,definition:null,reason:'Revisión independiente exclusivamente sintética QA',reviewConfirmed:true}});setActor(qa.actors.maker);};
  const first=await prepare(people[0],'7','12');
  setActor(qa.actors.samePerson);const same=await api('participation',{query:query(people[0].contractId)});assert.equal(same.proposals[0].canReview,false);
  await api('participation',{expected:403,body:{...first.body,command:'approve',scopeVersion:same.scopeVersion,proposalId:first.receipt.proposalId,proposalSha256:first.receipt.requestSha256,definition:null,reason:'Intento inválido exclusivamente sintético QA',reviewConfirmed:true}});
  await approve(first);
  const recovered=await api('participation',{query:{resource:'attempt',key:first.key}});assert.deepEqual(recovered.body,first.body);
  assert.equal((await api('participation',{body:first.body,key:first.key,expected:200})).replayed,true);
  await api('participation',{body:{...first.body,reason:'Otro fundamento exclusivamente sintético'},key:first.key,expected:409});
  ok(true,'independent decision, exact replay and conflicting reuse retain the original request');
  for(let i=1;i<people.length;i++)await approve(await prepare(people[i],i===people.length-1?null:'1'));
  const scope=await api('run'),selection={kind:'contracts',values:people.map(p=>p.contractId)},legacyBody={...oldBody,selection,scopeVersion:scope.scopeVersion,programVersion:scope.programVersion};
  await api('run',{body:legacyBody,expected:422});
  ok(true,'legacy program still rejects partial employment without an explicit policy');
  const boot=await api('program'),raw=structuredClone(boot.program.definition);
  raw.periodParticipation={version:'own-period-participation.v1',fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:raw.rules.map(r=>({ruleKey:participationRuleKey(r),treatment:r.code==='88'?'fraction':'declared_formula',reference:'Tratamiento exclusivamente sintético QA'}))};
  for(const sourceField of ['recognizedUnits','baseUnits'])raw.bindings.push({agreementCode:'1',key:sourceField,unit:'units',sourceKind:'period_fact',sourceField,onMissing:'error',combine:'single',ruleReference:'Participación exclusivamente sintética QA'});
  const program=ownProgramDefinition(raw,boot.salaryCatalog.items),proposal=await api('program',{expected:201,body:{command:'propose',scopeVersion:boot.scopeVersion,baseVersion:boot.program.version,salaryVersion:boot.salaryCatalog.version,proposalId:null,proposalSha256:null,program,reason:'Programa parcial exclusivamente sintético QA',reviewConfirmed:false}});
  setActor(qa.actors.checker);const review=await api('program');await api('program',{expected:201,body:{...proposal.body,command:'approve',scopeVersion:review.scopeVersion,proposalId:proposal.proposalId,proposalSha256:proposal.requestSha256,program:null,reason:'Política revisada exclusivamente sintética QA',reviewConfirmed:true}});setActor(qa.actors.maker);
  const exiting=people[2],oldParticipation=await api('participation',{query:query(exiting.contractId)});
  const lifecycle=await db.run('SELECT native_employment_lifecycle_bootstrap_v2('+j(qa.actors.maker)+','+q(exiting.contractId)+'::uuid)',true);
  const exitBody={contractId:exiting.contractId,identityToken:lifecycle.subject.identityToken,scopeVersion:lifecycle.scopeVersion,baseVersion:lifecycle.employment.version,movement:'terminate',date:period+'-20',legalReference:'Baja exclusivamente sintética QA',reason:'Cierre laboral exclusivamente sintético QA'};
  const exitProposal=await db.run('SELECT native_employment_lifecycle_propose_v2('+j(qa.actors.maker)+','+j(exitBody)+','+q(randomUUID())+'::uuid)',true);
  const exitReview=await db.run('SELECT native_employment_lifecycle_bootstrap_v2('+j(qa.actors.checker)+','+q(exiting.contractId)+'::uuid)',true);
  const exitReceipt=await db.run('SELECT native_employment_lifecycle_review_v2('+j(qa.actors.checker)+','+j({contractId:exiting.contractId,proposalId:exitProposal.proposalId,scopeVersion:exitReview.scopeVersion,decision:'approve',reason:'Baja revisada independientemente y exclusivamente sintética QA'})+','+q(randomUUID())+'::uuid)',true);
  assert.equal(exitReceipt.status,'approved');
  const newParticipation=await api('participation',{query:query(exiting.contractId)});assert.notEqual(newParticipation.source.version,oldParticipation.source.version);assert.equal(newParticipation.source.fullPeriod,false);
  const staleScope=await api('run');await api('run',{body:{...legacyBody,scopeVersion:staleScope.scopeVersion,programVersion:staleScope.programVersion},expected:409});
  await approve(await prepare(exiting,'1'));
  ok(true,'independently approved partial exit invalidates previous participation; fresh documentary review restores calculation without erasing employment history');
  const runBoot=await api('run'),body={...legacyBody,scopeVersion:runBoot.scopeVersion,programVersion:runBoot.programVersion},missingKey=randomUUID(),before=await db.run('SELECT to_jsonb(count(*)) FROM own_payroll_run_result');
  await api('run',{body,key:missingKey,expected:422});assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM own_payroll_run_result'),before);
  const pending=await api('run',{query:{resource:'attempt',key:missingKey}});assert.equal(pending.saved,null);assert.equal(pending.payload.periodParticipation.records.find(r=>r.contractId===people.at(-1).contractId).configuration.definition.recognizedUnits,null);
  ok(true,'unknown participation on the last page blocks the whole result and preserves its exact capture');
  await approve(await prepare(people.at(-1),'1'));
  const run=await api('run',{body,expected:201});assert.equal(run.saved.result.employeeCount,count);assert.equal(run.payload.periodParticipation.records.length,count);assert.equal(run.payload.employmentFacts.records.length,count);
  const byContract=new Map(run.saved.result.employeeTotals.map(r=>[r.contractId,r]));
  const {expectedFull,expectedThird}=independentParticipationReference(h.seniority.finalRun,run.saved.input.employees.find(e=>e.contractId===people[0].contractId));
  // Only the explicitly selected 88 sources and their dependent 95 change.
  // Prior independent rules retain their declared formulas and exact amounts.
  assert.equal(byContract.get(people[0].contractId).net,expectedFull);for(const e of people.slice(1))assert.equal(byContract.get(e.contractId).net,expectedThird);
  ok(true,'complete SQL capture plus existing rational engine computes one-third exactly and avoids double proration of a dependent total');
  const frozen=structuredClone(run.payload),resultHash=run.saved.resultSha256;
  await approve(await prepare(people.at(-1),'0'));
  const replay=await api('run',{query:{resource:'attempt',key:run.key}});assert.deepEqual(replay.payload,frozen);assert.equal(replay.saved.resultSha256,resultHash);
  assert.equal((await api('run',{query:{resource:'attempt',key:missingKey}})).payload.periodParticipation.records.find(r=>r.contractId===people.at(-1).contractId).configuration.definition.recognizedUnits,null);
  ok(true,'new approved quantities do not reinterpret saved results or previously captured unknown values');
  const superseding=await prepare(people[1],'2'),stale=await prepare(people[1],'0');await approve(superseding);setActor(qa.actors.checker);
  const detail=await api('participation',{query:{resource:'detail',id:stale.receipt.proposalId}});assert.equal(detail.current,false);
  const decision={...stale.body,command:'approve',scopeVersion:detail.scopeVersion,proposalId:stale.receipt.proposalId,proposalSha256:stale.receipt.requestSha256,definition:null,reason:'Revisión exclusivamente sintética QA',reviewConfirmed:true};
  await api('participation',{body:decision,expected:409});await api('participation',{body:{...decision,command:'reject'},expected:201});setActor(qa.actors.maker);
  assert.equal((await api('participation',{query:query(people[1].contractId)})).configuration.definition.recognizedUnits,'2');await approve(await prepare(people[1],'1'));
  ok(true,'stale proposals cannot overwrite a later independently approved declaration');
  const eventCount=await db.run('SELECT to_jsonb(count(*)) FROM own_participation_event');
  for(const change of ["UPDATE own_participation_event SET actor_label='Alteración QA'",'DELETE FROM own_participation_event','TRUNCATE own_participation_event'])await assert.rejects(()=>sql(change),/PARTICIPATION_IMMUTABLE/);
  assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM own_participation_event'),eventCount);
  ok(true,'owner update, deletion and truncate preserve the append-only facts and decisions');
  setActor(qa.actors.checker);const liquidation=await api('liquidation',{query:{resource:'detail',id:run.id}});
  await api('liquidation',{expected:201,body:{runId:run.id,resultSha256:run.saved.resultSha256,scopeVersion:liquidation.scopeVersion,stateVersion:liquidation.stateVersion,command:'confirm',selection:{kind:'all',values:[]},reason:'Confirmación exclusivamente sintética QA',reviewConfirmed:true}});
  const closeState=await api('close',{query:{resource:'detail',period,liquidationType:'monthly'}});
  const closed=await api('close',{expected:201,body:{period,liquidationType:'monthly',scopeVersion:closeState.scopeVersion,stateVersion:closeState.stateVersion,selection,command:'close',groupId:null,reason:'Cierre exclusivamente sintético QA',reviewConfirmed:true}});
  assert.equal(closed.snapshot.employees.length,count);
  setActor(qa.actors.maker);const params={...emptyOwnReceiptParams(period),contracts:selection.values,issuer:{name:'Municipio exclusivamente sintético',taxId:'30990000001',address:'Domicilio ficticio 123'}},preview=await api('receipt',{previewParams:params});
  assert.equal(preview.snapshot.records.length,count);
  const receiptBody={command:'prepare',scopeVersion:preview.scopeVersion,sourceVersion:preview.snapshot.sourceVersion,params,batchId:null,batchSha256:null,reason:'Emisión parcial exclusivamente sintética QA',reviewConfirmed:false},emitted=await api('receipt',{body:receiptBody,expected:201});
  setActor(qa.actors.checker);const receiptBatch=await api('receipt',{query:{resource:'batch',id:emitted.batchId}}),receiptPreview=await api('receipt',{previewParams:params});
  await api('receipt',{expected:201,body:{...receiptBody,command:'approve',scopeVersion:receiptPreview.scopeVersion,sourceVersion:receiptPreview.snapshot.sourceVersion,params:null,batchId:emitted.batchId,batchSha256:receiptBatch.snapshotSha256,reason:'Emisión parcial revisada exclusivamente sintética QA',reviewConfirmed:true}});
  const approvedReceipt=await api('receipt',{query:{resource:'batch',id:emitted.batchId}}),pdf=await createOwnReceiptPdf(approvedReceipt),originalCloses=[];
  for(const original of approvedReceipt.snapshot.sources)originalCloses.push(await api('close',{query:{resource:'group',id:original.id}}));
  const planilla=await prepareOwnPlanilla(approvedReceipt,originalCloses);
  assert.equal(pdf.recordCount,count);assert.equal(planilla.selected,count);assert.match(new TextDecoder().decode(pdf.bytes.subarray(0,8)),/^%PDF/);
  setActor(qa.actors.maker);
  ok(true,'native partial hires complete independent confirmation, close, all own PDF receipts and the exact planilla without GRH');
  if(options.browser!=='none'&&options.browser!==undefined){
   const {verifyOwnPeriodParticipationBrowser}=await import('./lib/own-period-participation-browser.mjs');
   await verifyOwnPeriodParticipationBrowser({handlers,env:h.env,actors:qa.actors,setActor,people,period,output:h.destination,check:ok,browserName:options.browser,revoke:()=>sql('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid'),restore:()=>sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid')});
  }
  await sql('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid');
  assert.equal((await api('participation',{query:query(people[0].contractId)})).permissions.canPropose,false);await api('participation',{query:{resource:'attempt',key:first.key},expected:403});
  await sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid');ok(true,'revocation removes preparation and attempt access immediately without modifying facts');
  return {version:'own-period-participation-qa.v1',employeeCount:count,newTables:1,newFunctions:16,adaptedFunctions:6,installed,durable,repeated,syntheticOnly:true,productiveBusinessWrites:0};
 }});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const options=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(a);assert.ok(m);return [m[1],m[2]];}));
 try {const r=await verifyOwnPeriodParticipation({major:Number(options.major),transport:options.transport,sourceCommit:options['source-commit'],output:options.output,browser:options.browser??'none'});console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,syntheticOnly:true}));}catch(e){console.error(e.stack);process.exitCode=1;}
}
