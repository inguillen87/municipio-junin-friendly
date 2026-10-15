// Own loopback PostgreSQL QA only. Every actor, source and contract is invented.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifySalaryConditionsProgram} from './verify-own-salary-conditions-program.mjs';
import {runOwnPayrollAdministrativeOperatorQa} from './lib/own-payroll-administrative-operator-qa.mjs';
import {runOwnPeriodClassificationQa} from './lib/own-period-classification-qa.mjs';
import {finalAdoptedHistory} from './lib/own-period-classification-final-qa.mjs';
import {buildOwnAgreementWorkingTimeInstallation,assertOwnAgreementWorkingTimeDurability} from './lib/own-agreement-working-time-installation.mjs';
import {buildAgreementWorkingTimeQaRelocation} from './lib/own-agreement-working-time-qa-relocation.mjs';
import {runAgreementWorkingTimeCatalogQa} from './lib/own-agreement-working-time-catalog-qa.mjs';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {createOwnAgreementWorkingTimeHandler} from '../api/internal-own-agreement-working-time.js';
import {agreementWorkingTimeBootstrap, agreementWorkingTimeDetail, agreementWorkingTimeReceipt, agreementWorkingTimeCapture, prepareAgreementWorkingTime, decideAgreementWorkingTime} from '../assets/own-agreement-working-time-model.js';
import {row} from '../tests/fixtures/native-salary-synthetic.js';
import {rule, policy} from '../tests/fixtures/own-payroll-synthetic.js';
import {salaryItems} from '../assets/native-salary-catalog-model.js';
import {participationRuleKey} from '../assets/own-period-participation-program.js';
import {catalogItems as employmentCatalogItems,catalogDeclareRegistration} from '../assets/native-employment-catalog-model.js';
import {ownReportBundle,ownReportDocument} from '../assets/own-payroll-report-model.js';
import {verifiedOwnCloseDetail,verifiedOwnCloseReceipt} from '../assets/own-payroll-close-model.js';
import {verifiedOwnLiquidationDetail} from '../assets/own-payroll-liquidation-model.js';
const root=fs.realpathSync(new URL('..',import.meta.url)),j=v=>q(JSON.stringify(v))+'::jsonb';

// Reproduce the report panel's complete read pipeline. An existing closed
// group remains part of the census even when this QA just closed another one.
export async function readAgreementWorkingTimeReportQa({api,period,detail}){
 const initial=await verifiedOwnCloseDetail(detail),query={from:period,to:period,types:['monthly']},receipts=[];
 for(const group of initial.groups.filter(g=>g.state==='closed'))receipts.push(await verifiedOwnCloseReceipt(await api('close',{query:{resource:'group',id:group.id}})));
 const base=ownReportBundle(query,[initial],receipts),captures=[];
 for(const id of new Set(base.employees.map(row=>row.employee.runId))){
  const original=await verifiedOwnLiquidationDetail(await api('liquidation',{query:{resource:'detail',id}}));assert.equal(original.id,id,'AGREEMENT_REPORT_FOREIGN_CAPTURE');captures.push(original.capture);
 }
 const bundle=ownReportBundle(query,[initial],receipts,captures),fresh=await verifiedOwnCloseDetail(await api('close',{query:{resource:'detail',period,liquidationType:'monthly'}}));
 assert.equal(fresh.scopeVersion,initial.scopeVersion,'AGREEMENT_REPORT_SCOPE_CHANGED');assert.equal(fresh.stateVersion,initial.stateVersion,'AGREEMENT_REPORT_STATE_CHANGED');return bundle;
}

export async function verifyOwnAgreementWorkingTime(options){
 return verifySalaryConditionsProgram({...options,browser:'none',continuation:async h=>{
  const administrative=await runOwnPayrollAdministrativeOperatorQa(h);assert.equal(administrative.ok,true);
  const classification=await runOwnPeriodClassificationQa(h,{browser:'none',finalAdoptedFixture:args=>finalAdoptedHistory({...args,major:options.major,transport:options.transport})});assert.equal(classification.ok,true);
  return runOwnAgreementWorkingTimeQa(h,options);
 }});
}
export async function runOwnAgreementWorkingTimeQa(h,options){
  const {qa,db,sql,relocate,adapter,deps,handlers,api,setActor,ok}=h,period=h.workingTime.period,maker=qa.actors.maker,checker=qa.actors.checker;
  const catalogPrerequisite=await runAgreementWorkingTimeCatalogQa(h);
  const source=fs.readFileSync(path.join(root,'scripts/migrations/179-own-agreement-working-time.sql'),'utf8').replace(/\r\n?/g,'\n');
  const batch=buildOwnAgreementWorkingTimeInstallation(h.options),fixture=buildAgreementWorkingTimeQaRelocation({...h.options,schema:qa.schema,relocate,batch}),steps=fixture.statements;
  const snapshot=()=>db.run("SELECT jsonb_build_object('contracts',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM employment_contract e),'registrations',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM native_employee_registration e),'conditions',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]')::text) FROM own_salary_conditions_event e),'salary',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]')::text) FROM native_salary_event e),'program',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]')::text) FROM own_payroll_program_event e),'captures',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]')::text) FROM own_payroll_run_capture e),'results',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY capture_id),'[]')::text) FROM own_payroll_run_result e),'capabilities',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY membership_id,capability_key)::text) FROM capabilities e))");
  const before=await snapshot();
  const preface='BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL search_path=pg_catalog,'+qa.schema+',public,pg_temp;DO $destination$ BEGIN '+qa.pins+' END $destination$;';
  const rehearsal=await sql(preface+steps.join(';')+';ROLLBACK;');assert.equal(rehearsal.mode,'install');
  assert.equal(await db.run("SELECT to_jsonb(to_regclass('"+qa.schema+".own_agreement_working_time_event') IS NULL)"),true);assert.deepEqual(await snapshot(),before);ok(true,'complete179/180 rehearsal rolls back every new object and preserves all prior synthetic state');
  const installed=await sql(steps.join(';'));assert.deepEqual(await snapshot(),before);
  const durable=await sql(preface.replace('REPEATABLE READ;','REPEATABLE READ READ ONLY;')+fixture.verification.join(';')+';COMMIT;');
  assertOwnAgreementWorkingTimeDurability({installed,durable,batch});const repeated=await sql(steps.join(';'));assert.equal(repeated.mode,'verify');assertOwnAgreementWorkingTimeDurability({installed:repeated,durable,batch});assert.deepEqual(await snapshot(),before);
  assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM own_agreement_working_time_event'),0);ok(true,'179/180 install an empty private ledger with durable metadata, no prior business changes and verify-only repeat');
  fs.writeFileSync(path.join(h.destination,'agreement-working-time-installation-proof.json'),JSON.stringify({syntheticOnly:true,productionCompatible:false,fixtureChain:fixture.fixtureChain,fixtureSourceHashes:fixture.fixtureSourceHashes,installed,durable,repeated},null,2)+'\n');
  const verifiedContext=await db.run('SELECT native_salary_administrative_context_v1('+j(maker)+')');
  const savedReader=await db.run("SELECT to_jsonb(pg_get_functiondef('"+qa.schema+".native_employee_catalog_v1(jsonb)'::regprocedure))");
  try{
   await sql('CREATE OR REPLACE FUNCTION '+qa.schema+'.native_employee_catalog_v1(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,'+qa.schema+',public,pg_temp AS $$ BEGIN RAISE EXCEPTION \'AGREEMENT_QA_REFERENCE_READER_CALLED\'; END $$');
   const ownOnly=await db.run('SELECT own_agreement_working_time_source_v1('+j(verifiedContext)+','+q(period)+')');
   assert.ok(ownOnly.agreements.length>0);
   await assert.rejects(()=>db.run('SELECT own_agreement_working_time_source_v1('+j({...verifiedContext,sourceBindingId:randomUUID()})+','+q(period)+')'),/AGREEMENT_WORKING_TIME_SOURCE_REQUIRED/);
   ok(true,'agreement source reads approved own classification directly even when the historical-reference reader refuses every call; missing own source is refused');
  }finally{await sql(savedReader);}
  const agreementAdapter={query:async(query,values)=>{
   if(!query.startsWith('SELECT public.own_agreement_working_time_'))return adapter.query(query,values);
   assert.match(query,/^SELECT public\.own_agreement_working_time_(?:bootstrap|detail|attempt|command)_v1\([\s\S]+\) AS result$/);
   try{return[{result:await db.run(query.replaceAll('public.',qa.schema+'.').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);}),true)}];}
   catch(e){fs.appendFileSync(path.join(h.destination,'agreement-adapter-failures.txt'),String(e.stack??e)+'\n');throw e;}
  }};
  handlers.agreementWorkingTime=createOwnAgreementWorkingTimeHandler({...deps,getSql:()=>agreementAdapter});
  // Expand only the disposable own catalog through its existing independent
  // proposal/review functions; do not populate a reference reader or old GRH.
  const catalog=await db.run('SELECT native_employment_catalog_bootstrap_v1('+j(maker)+')');
  const fullCatalog=employmentCatalogItems([...catalogDeclareRegistration(catalog.catalog.items),...Array.from({length:61},(_,i)=>({kind:'agreements',key:'agreements::'+(2000+i),code:String(2000+i),label:'Convenio exclusivamente sintético QA '+(2000+i),agreementCode:null,registrationAllowed:i%2===0}))]);
  const catalogReceipt=await db.run('SELECT native_employment_catalog_propose_v1('+j(maker)+','+j({scopeVersion:catalog.scopeVersion,baseVersion:catalog.catalog.version,reason:'Catálogo completo multipágina exclusivamente sintético QA',items:fullCatalog})+','+q(randomUUID())+'::uuid)');
  const catalogReview=await db.run('SELECT native_employment_catalog_bootstrap_v1('+j(checker)+')');
  await db.run('SELECT native_employment_catalog_review_v1('+j(checker)+','+j({scopeVersion:catalogReview.scopeVersion,proposalId:catalogReceipt.proposalId,decision:'approve',reason:'Revisión independiente de convenios exclusivamente sintética QA'})+','+q(randomUUID())+'::uuid)');
  const query={resource:'bootstrap',period};setActor(maker);const boot=agreementWorkingTimeBootstrap(await api('agreementWorkingTime',{query}));
  assert.ok(boot.source.agreements.length>61);assert.ok(boot.source.agreements.some(r=>r.agreementCode==='1'));assert.ok(boot.source.agreements.some(r=>!r.registrationAllowed));assert.equal(boot.configuration.revision,0);
  const items=boot.source.agreements.map(r=>({agreementCode:r.agreementCode,agreementToken:r.agreementToken,definition:{monthlyHours:r.agreementCode==='1'?'160.25000001':null,asOfDate:period+'-01',documentReference:'Convenio exclusivamente sintético QA'}}));
  const body=prepareAgreementWorkingTime(boot,items,'Declaración completa exclusivamente sintética QA'),key=randomUUID();
  const receipt=await agreementWorkingTimeReceipt(await api('agreementWorkingTime',{body,key,expected:201}),{key,body});
  assert.equal(receipt.status,'pending');assert.equal((await api('agreementWorkingTime',{query})).configuration.revision,0);
  const replay=await agreementWorkingTimeReceipt(await api('agreementWorkingTime',{body,key}),{key,body});assert.equal(replay.eventId,receipt.eventId);assert.equal(replay.replayed,true);
  assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM own_agreement_working_time_event'),1);ok(true,'real writer retains full exact proposal and idempotent replay without approving it');
  setActor(qa.actors.samePerson);const same=await api('agreementWorkingTime',{query});assert.equal(same.proposals.find(p=>p.id===receipt.proposalId).canReview,false);
  const sameDecision={command:'approve',period,scopeVersion:same.scopeVersion,baseVersion:body.baseVersion,sourceVersion:body.sourceVersion,proposalId:receipt.proposalId,proposalSha256:receipt.requestSha256,items:null,reason:'Decisión sintética con la misma persona',reviewConfirmed:true};
  await api('agreementWorkingTime',{body:sameDecision,expected:403});ok(true,'a distinct membership belonging to the same person cannot approve the proposal');
  setActor(checker);const reviewBoot=agreementWorkingTimeBootstrap(await api('agreementWorkingTime',{query})),detail=await agreementWorkingTimeDetail(await api('agreementWorkingTime',{query:{resource:'detail',id:receipt.proposalId}}));
  const decision=await decideAgreementWorkingTime(reviewBoot,detail,'approve','Revisión independiente exclusivamente sintética QA');await agreementWorkingTimeReceipt(await api('agreementWorkingTime',{body:decision,expected:201}));
  const approved=agreementWorkingTimeBootstrap(await api('agreementWorkingTime',{query}));assert.equal(approved.configuration.revision,1);assert.deepEqual(approved.configuration.items,items);
  ok(true,'independent decision publishes the full immutable exact agreement revision');
  await assert.rejects(()=>sql('UPDATE own_agreement_working_time_event SET revision=2'),/AGREEMENT_WORKING_TIME_IMMUTABLE/);
  await assert.rejects(()=>sql('DELETE FROM own_agreement_working_time_event'),/AGREEMENT_WORKING_TIME_IMMUTABLE/);
  await assert.rejects(()=>sql('TRUNCATE own_agreement_working_time_event'),/AGREEMENT_WORKING_TIME_IMMUTABLE/);
  ok(true,'approved history cannot be updated, deleted or truncated');
  const employees=h.workingTime.people.map(e=>({contractId:e.contractId,agreementCode:'1'}));
  const captured=agreementWorkingTimeCapture(await db.run('SELECT own_agreement_working_time_capture_v1(native_salary_administrative_context_v1('+j(maker)+'),'+j(employees)+','+q(period)+')'),employees,period);
  assert.equal(captured.records.length,1);assert.equal(captured.records[0].definition.monthlyHours,'160.25000001');assert.ok(captured.records[0].approvalId);ok(true,'whole native cohort captures one approved agreement fact without replacing contract hours');
  assert.equal(batch.changed.length,4);
  setActor(maker);let salary=await api('salary');const code='9963';assert.ok(!salary.catalog.items.some(r=>r.code===code));
  const catalogItems=salaryItems([...salary.catalog.items,row({kind:'auxiliary',code,nature:'auxiliary',unit:'hours',validFrom:period})]);
  const salaryBody={command:'propose',scopeVersion:salary.scopeVersion,baseVersion:salary.catalog.version,classificationVersion:salary.classification.version,items:catalogItems,proposalId:null,proposalSha256:null,reason:'Definición de horas del convenio exclusivamente sintética QA',reviewConfirmed:false};const salaryReceipt=await api('salary',{body:salaryBody,expected:201});
  setActor(checker);salary=await api('salary');await api('salary',{body:{command:'approve',scopeVersion:salary.scopeVersion,baseVersion:salaryReceipt.body.baseVersion,classificationVersion:salaryReceipt.body.classificationVersion,proposalId:salaryReceipt.proposalId,proposalSha256:salaryReceipt.requestSha256,items:null,reason:'Revisión de auxiliar exclusivamente sintética QA',reviewConfirmed:true},expected:201});
  setActor(maker);let program=await api('program');const definition=structuredClone(program.program.definition);definition.agreementWorkingTimeVersion='own-agreement-working-time.v1';
  const agreementRule=rule(code,{op:'input',key:'agreementMonthlyHours',unit:'hours'},{nature:'auxiliary',unit:'hours',validFrom:period,rounding:policy('exact',8)});definition.rules.push(agreementRule);
  if(definition.periodParticipation)definition.periodParticipation.treatments.push({ruleKey:participationRuleKey(agreementRule),treatment:'declared_formula',reference:'Horas del convenio exclusivamente sintéticas QA'});
  definition.bindings.push({agreementCode:'1',key:'agreementMonthlyHours',unit:'hours',sourceKind:'agreement_time_fact',sourceField:'monthlyHours',combine:'single',onMissing:'error',ruleReference:'Convenio exclusivamente sintético QA'});
  const programBody={command:'propose',scopeVersion:program.scopeVersion,baseVersion:program.program.version,salaryVersion:program.salaryCatalog.version,proposalId:null,proposalSha256:null,program:definition,reason:'Programa con fuentes de jornada separadas exclusivamente sintético QA',reviewConfirmed:false};const programReceipt=await api('program',{body:programBody,expected:201});
  setActor(checker);program=await api('program');await api('program',{body:{command:'approve',scopeVersion:program.scopeVersion,baseVersion:programReceipt.body.baseVersion,salaryVersion:programReceipt.body.salaryVersion,proposalId:programReceipt.proposalId,proposalSha256:programReceipt.requestSha256,program:null,reason:'Revisión de programa exclusivamente sintética QA',reviewConfirmed:true},expected:201});
  setActor(maker);const runBoot=await api('run'),runBody={...h.oldBody,period,scopeVersion:runBoot.scopeVersion,programVersion:runBoot.programVersion,selection:{kind:'contracts',values:employees.map(e=>e.contractId).sort()}};
  const result=await api('run',{body:runBody,expected:201});assert.equal(result.saved.result.employeeCount,employees.length);assert.equal(result.payload.agreementWorkingTime.records.length,1);
  assert.ok(result.saved.input.employees.every(e=>e.inputs.find(r=>r.key==='agreementMonthlyHours').value==='160.25000001'));
  assert.ok(result.saved.input.employees.some(e=>e.inputs.find(r=>r.key==='contractMonthlyHours').value!=='160.25000001'));
  const recovered=await api('run',{query:{resource:'attempt',key:result.key}});assert.deepEqual(recovered.payload,result.payload);assert.deepEqual(recovered.saved,result.saved);
  ok(true,'actual SQL capture and handler calculate the complete native selection and recover the unchanged saved result');
  setActor(checker);const liquidation=await api('liquidation',{query:{resource:'detail',id:result.id}});
  await api('liquidation',{expected:201,body:{runId:result.id,resultSha256:result.saved.resultSha256,scopeVersion:liquidation.scopeVersion,stateVersion:liquidation.stateVersion,command:'confirm',selection:{kind:'all',values:[]},reason:'Confirmación de horas de convenio exclusivamente sintética QA',reviewConfirmed:true}});
  const closeState=await api('close',{query:{resource:'detail',period,liquidationType:'monthly'}});
  const closed=await api('close',{expected:201,body:{period,liquidationType:'monthly',scopeVersion:closeState.scopeVersion,stateVersion:closeState.stateVersion,selection:runBody.selection,command:'close',groupId:null,reason:'Cierre de horas de convenio exclusivamente sintético QA',reviewConfirmed:true}});
  const finalClose=await api('close',{query:{resource:'detail',period,liquidationType:'monthly'}});
  fs.writeFileSync(path.join(h.destination,'agreement-report-input-census.json'),JSON.stringify({syntheticOnly:true,groups:finalClose.groups.length,closedGroups:finalClose.groups.filter(g=>g.state==='closed').length,reopenedGroups:finalClose.groups.filter(g=>g.state==='reopened').length,detailSha256:createHash('sha256').update(JSON.stringify(finalClose)).digest('hex')},null,2)+'\n',{flag:'wx'});
  const reportEvents=()=>db.run("SET TRANSACTION READ ONLY;SELECT jsonb_build_object('close',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]')::text) FROM own_payroll_close_event e),'receipts',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]')::text) FROM own_payroll_receipt_event e))");
  const reportBefore=await snapshot(),eventsBefore=await reportEvents(),fullBundle=await readAgreementWorkingTimeReportQa({api,period,detail:finalClose});assert.deepEqual(await snapshot(),reportBefore);assert.deepEqual(await reportEvents(),eventsBefore);
  const originalGroup=fullBundle.sources.find(group=>group.groupId===closed.groupId),originalRun=fullBundle.captures.find(capture=>capture.id===result.id);assert.ok(originalGroup&&originalRun);
  for(const key of ['id','key','body','bodySha256','snapshot','snapshotSha256'])assert.deepEqual(originalGroup[key],closed[key]);assert.deepEqual(originalRun.saved,result.saved);assert.deepEqual(originalRun.payload,result.payload);
  const reportCoverage={completeClosedGroups:fullBundle.sources.length,completeOriginalRuns:fullBundle.captures.length,allClosedGroupsAndOriginalCaptures:true,finalScopeAndStateUnchanged:true,originalNewGroupAndRunPreserved:true};
  fs.writeFileSync(path.join(h.destination,'agreement-report-coverage-proof.json'),JSON.stringify(reportCoverage,null,2)+'\n',{flag:'wx'});
  const variables=ownReportDocument(fullBundle,undefined,'variables');
  assert.ok(variables.rows.some(r=>r.some(v=>typeof v==='string'&&v.includes('Horas mensuales del convenio'))));
  assert.ok(variables.rows.some(r=>r.some(v=>typeof v==='string'&&v.includes('Horas contractuales mensuales'))));
  assert.equal(closed.snapshot.employees.length,employees.length);
  ok(true,'independent confirmation and whole close retain both separate hour sources in the actual original-variable report');
  setActor(maker);
  if(options.browser&&options.browser!=='none'){
   const {verifyAgreementWorkingTimeBrowser}=await import('./lib/own-agreement-working-time-browser.mjs');
   await verifyAgreementWorkingTimeBrowser({handlers,env:h.env,actors:qa.actors,setActor,period,output:h.destination,check:ok,bootstrap:async()=>{setActor(maker);return agreementWorkingTimeBootstrap(await api('agreementWorkingTime',{query}));},revoke:()=>sql('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(maker.membershipId)+'::uuid'),restore:()=>sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id='+q(maker.membershipId)+'::uuid'),browserName:options.browser});
  }
  const proof={ok:true,major:options.major,syntheticOnly:true,productiveBusinessWrites:0,catalogPrerequisite,reportCoverage,sourceAgreements:items.length,nativeEmployees:employees.length,agreementFacts:1,sourceSha256:createHash('sha256').update(source).digest('hex'),fullSourceKept:true,independentReview:true,immutable:true,recovered:true};
  fs.writeFileSync(path.join(h.destination,'agreement-working-time-proof.json'),JSON.stringify(proof,null,2)+'\n');
  if(options.continuation)return options.continuation({...h,agreementWorkingTime:{proof,period,employees,boot:approved,run:result,closed,definition,batch,fixture,installed,durable,repeated}});return proof;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1])){
 const o={};for(const a of process.argv.slice(2)){const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(a);assert.ok(m&&!Object.hasOwn(o,m[1]));o[m[1]]=m[2];}
 try{const r=await verifyOwnAgreementWorkingTime({major:Number(o.major),transport:o.transport??'local',sourceCommit:o['source-commit'],output:o.output,browser:o.browser??'none'});console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,syntheticOnly:true}));}catch(e){console.error(e.stack);process.exitCode=1;}
}
