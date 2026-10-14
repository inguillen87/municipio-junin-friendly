// Actual HTTP/SQL regression continuation. Only the existing synthetic loopback
// foundation supplies this harness. Importing this module never connects.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {buildOwnPayrollAdministrativeOperatorInstallation,assertOwnPayrollAdministrativeOperatorDurability} from './own-payroll-administrative-operator-installation.mjs';
import {withOwnPayrollFullHttp} from './own-payroll-full-http.mjs';
import {emptyOwnReceiptParams} from '../../assets/own-payroll-receipt-model.js';
import {ownRunCapture} from '../../assets/own-payroll-run-model.js';
import {ownRunAlgorithmHash,ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {prepareOwnPayrollInput} from '../../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../../lib/own-payroll-snapshot.js';
import {workingTimeDefinition} from '../../assets/own-contract-working-time-model.js';
import {participationDefinition} from '../../assets/own-period-participation-model.js';
import {seniorityDefinition} from '../../assets/own-salary-seniority-model.js';
import {salaryConditionsDefinition,prepareSalaryConditions,salaryConditionsDetail,decideSalaryConditions} from '../../assets/own-contract-salary-conditions-model.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
const j=v=>q(JSON.stringify(v))+'::jsonb';
const calcCaps=['payroll.calculation.read','payroll.calculation.prepare','payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export'];

export const OWN_ADMIN_OPERATOR_REQUIRED_CHECKS=Object.freeze([
 'activeActor','historicalActorNullEmployment','readOnlyBootstrap','nominalWithoutPrepare','missingEachCapability',
 'oldRealActorAttempt','unverifiedActorAttemptRejected','differentActorAttemptRejected','normalFinalizer','fullSmallFinalizer','fullLargeFinalizer',
 'nativeOnlyEmployees','adoptedEmployees','employeeEligibility','historicalAuthority','closedGroups','closeReceiptAdministrativeRead','privateAcl','zeroInstallationWrites','durableInstallation','repeatVerifyOnly',
 'identityAbsent','identityAmbiguous','identityRejected','foreignBinding','revokedLink','invalidSession','invalidRelease','injectedIdentity','missingProfile','selfApproval',
]);
export function ownAdministrativeOperatorCoverage(completed){
 assert.ok(Array.isArray(completed));assert.equal(new Set(completed).size,completed.length);assert.ok(completed.every(x=>OWN_ADMIN_OPERATOR_REQUIRED_CHECKS.includes(x)));
 const pending=OWN_ADMIN_OPERATOR_REQUIRED_CHECKS.filter(x=>!completed.includes(x));return{state:pending.length?'draft':'verified',ok:pending.length===0,completed:[...completed],pending};
}
export function assertOwnAdministrativePendingCapture(original,value){
 ownRunCapture(original);ownRunCapture(value);assert.equal(original.saved,null);assert.equal(value.saved,null,'OWN_ADMIN_OPERATOR_PENDING_RESULT_CHANGED');
 for(const capture of[original,value]){assert.equal(ownRunHash(capture.body),capture.bodySha256);assert.equal(ownRunHash(capture.payload),capture.payloadSha256);}
 for(const field of['version','id','key','body','bodySha256','algorithmSha256','payload','payloadSha256','createdAt'])assert.deepEqual(value[field],original[field],'OWN_ADMIN_OPERATOR_PENDING_CAPTURE_CHANGED: '+field);
 return value;
}
export function ownAdministrativeAdoptedFixtureDeclarations(period){
 const asOfDate=period+'-01',documentReference='Declaración exclusivamente sintética del fixture adoptado QA176';
 return{
  workingTime:workingTimeDefinition({dailyHours:'7.50000001',monthlyHours:'160.250',asOfDate,documentReference},period),
  participation:participationDefinition({recognizedUnits:'1',baseUnits:'1',asOfDate,documentReference},period),
  seniority:seniorityDefinition({years:'0',months:'0',asOfDate,documentReference},period),
  salaryConditions:salaryConditionsDefinition({partialSeniorityYears:'0',title:{status:'declared',code:'0056',percentage:'12.00000001'},unhealthyWork:false,asOfDate,documentReference},period),
 };
}
async function prepareAdoptedFixtureFacts(h,contractIds,period){
 const{api,setActor,qa}=h,declared=ownAdministrativeAdoptedFixtureDeclarations(period),proof=[];
 // The older continuation helpers close over their own earlier payroll month.
 // Use the normal HTTP writers explicitly for this programme's actual month.
 for(const contractId of contractIds){
  const facts={contractId,period};
  for(const[kind,required]of[['workingTime',['dailyHours','monthlyHours']],['participation',['recognizedUnits','baseUnits']],['seniority',['years','months']]]){
   setActor(qa.actors.maker);let boot=await api(kind,{query:{resource:'bootstrap',contractId,period}});assert.equal(boot.contractId,contractId);assert.equal(boot.period,period);
   let prepared=false;
   if(boot.configuration.revision===0||required.some(field=>boot.configuration.definition[field]===null)){
    assert.equal(boot.permissions.canPropose,true);const body={command:'propose',contractId,period,scopeVersion:boot.scopeVersion,baseVersion:boot.configuration.version,sourceVersion:boot.source.version,proposalId:null,proposalSha256:null,definition:declared[kind],reason:'Declaración completa exclusivamente sintética del contrato adoptado para QA176',reviewConfirmed:false};
    const pending=await api(kind,{body,key:randomUUID(),expected:201});assert.equal(pending.status,'pending');assert.equal(typeof pending.requestSha256,'string');
    setActor(qa.actors.checker);const review=await api(kind,{query:{resource:'bootstrap',contractId,period}});assert.equal(review.permissions.canReview,true);assert.equal(review.proposals.find(p=>p.id===pending.proposalId)?.canReview,true);
    const decision=await api(kind,{body:{...body,command:'approve',scopeVersion:review.scopeVersion,proposalId:pending.proposalId,proposalSha256:pending.requestSha256,definition:null,reason:'Revisión independiente de declaración exclusivamente sintética del adoptado QA176',reviewConfirmed:true},key:randomUUID(),expected:201});assert.equal(decision.status,'approved');prepared=true;
    setActor(qa.actors.maker);boot=await api(kind,{query:{resource:'bootstrap',contractId,period}});
   }
   assert.ok(boot.configuration.revision>0&&boot.configuration.approvalId);assert.ok(required.every(field=>typeof boot.configuration.definition[field]==='string'));if(prepared)assert.deepEqual(boot.configuration.definition,declared[kind]);
   facts[kind]={prepared,revision:boot.configuration.revision,approvalId:boot.configuration.approvalId,sourceVersion:boot.source.version,definition:structuredClone(boot.configuration.definition)};
  }
  proof.push(facts);
 }
 setActor(qa.actors.maker);let boot=await api('salaryConditions',{query:{resource:'bootstrap',period}});
 const existing=new Map(boot.configuration.items.map(item=>[item.contractId,item])),ids=new Set(contractIds);
 const usable=item=>item&&item.definition.partialSeniorityYears!==null&&item.definition.title.status==='declared'&&item.definition.title.code!==null&&item.definition.title.percentage!==null&&item.definition.unhealthyWork!==null;
 const missing=contractIds.filter(id=>!usable(existing.get(id)));let prepared=false;
 if(missing.length){
  // Conditions use one complete-source proposal. Preserve every other current
  // declaration and require its real current identity; never crop to our3rows.
  const items=boot.source.subjects.map(subject=>{
   const old=existing.get(subject.contractId);
   if(ids.has(subject.contractId)&&missing.includes(subject.contractId))return{contractId:subject.contractId,identityToken:subject.identityToken,definition:declared.salaryConditions};
   assert.ok(old,'a nontarget condition cannot be invented by the administrative fixture');assert.equal(old.identityToken,subject.identityToken);return structuredClone(old);
  });
  assert.ok(contractIds.every(id=>items.some(item=>item.contractId===id)));
  const pending=await api('salaryConditions',{body:prepareSalaryConditions(boot,items,'Declaración completa exclusivamente sintética de condiciones requeridas para QA176'),key:randomUUID(),expected:201});assert.equal(pending.status,'pending');
  setActor(qa.actors.checker);const review=await api('salaryConditions',{query:{resource:'bootstrap',period}}),detail=await salaryConditionsDetail(await api('salaryConditions',{query:{resource:'detail',id:pending.proposalId}}));
  const decision=await api('salaryConditions',{body:await decideSalaryConditions(review,detail,'approve','Revisión independiente de condiciones exclusivamente sintéticas para QA176'),key:randomUUID(),expected:201});assert.equal(decision.status,'approved');prepared=true;
  setActor(qa.actors.maker);boot=await api('salaryConditions',{query:{resource:'bootstrap',period}});
 }
 assert.ok(boot.configuration.revision>0&&boot.configuration.approvalId);
 for(const row of proof){const item=boot.configuration.items.find(item=>item.contractId===row.contractId),subject=boot.source.subjects.find(subject=>subject.contractId===row.contractId);assert.ok(usable(item)&&subject);assert.equal(item.identityToken,subject.identityToken);row.salaryConditions={prepared:prepared&&missing.includes(row.contractId),revision:boot.configuration.revision,approvalId:boot.configuration.approvalId,identityToken:item.identityToken,definition:structuredClone(item.definition)};}
 setActor(qa.actors.maker);return proof;
}
export function ownAdministrativeOperatorQaOptions(options){
 assert.ok(options&&typeof options==='object');assert.ok(Object.keys(options).every(k=>['major','transport','sourceCommit','output'].includes(k)),'OWN_ADMIN_OPERATOR_QA_UNKNOWN_OPTION');
 assert.ok([17,18].includes(options.major));assert.ok(['local','ci'].includes(options.transport??'local'),'OWN_ADMIN_OPERATOR_QA_LOOPBACK_ONLY');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(typeof options.output,'string');assert.match(options.output,/^verification[\\/][A-Za-z0-9_.-]+$/);assert.ok(!options.output.includes('..'));
 return{...options,transport:options.transport??'local',browser:'none'};
}
export function assertOwnAdministrativeOperatorCiSource(options,env=process.env){
 if(options.transport==='ci'){
  assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/,'OWN_ADMIN_OPERATOR_QA_CI_SOURCE_REQUIRED');
  assert.equal(options.sourceCommit,env.GITHUB_SHA,'OWN_ADMIN_OPERATOR_QA_CI_SOURCE_CHANGED');
 }
 return options;
}

export async function runOwnPayrollAdministrativeOperatorQa(h){
 const{qa,db,sql,relocate,api,setActor}=h;assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.ok(qa.pins.includes("current_database()<>'own_payroll_run_qa'")&&qa.pins.includes("current_setting('neon.project_id',true)"),'OWN_ADMIN_OPERATOR_QA_DESTINATION_REQUIRED');
 const maker=qa.actors.maker,reader=qa.actors.unlinked;assert.ok(maker&&reader&&h.conditionsProgram.run.saved);
 const checks=[],done=(key,condition=true)=>{assert.ok(condition,key);assert.ok(!checks.includes(key));checks.push(key);h.ok(true,'administrative operator: '+key);};
 const rpc=(name,actor=maker,args='')=>db.run('SELECT '+qa.schema+'.'+name+'('+j(actor)+(args?','+args:'')+')',name!=='own_run_context_v1');
 const state=()=>db.run("SELECT jsonb_build_object('contracts',(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),'[]')::text) FROM employment_contract c),'links',(SELECT md5(coalesce(jsonb_agg(to_jsonb(l) ORDER BY membership_id),'[]')::text) FROM tenant_action_employment_link l),'bindings',(SELECT md5(coalesce(jsonb_agg(to_jsonb(b) ORDER BY id),'[]')::text) FROM platform_tenant_source_binding b),'authorities',(SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY membership_id,tenant_id),'[]')::text) FROM tenant_action_authority a),'capabilities',(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY membership_id,capability_key),'[]')::text) FROM capabilities c),'captures',(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),'[]')::text) FROM own_payroll_run_capture c),'results',(SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY capture_id),'[]')::text) FROM own_payroll_run_result r))");
 const expect=(fn,code)=>assert.rejects(fn,new RegExp(code));
 const transientDenied=async(mutation,fn,code)=>{
  const prior=await state();await expect(()=>sql(mutation+';'+fn),code);assert.deepEqual(await state(),prior);
 };
 setActor(maker);const activeBoot=await api('run'),activeCtx=await rpc('own_run_context_v1',maker,'true,true');
 assert.equal(activeCtx.actorPersonId,qa.ids.makerPerson);assert.ok(activeCtx.employmentContractId);assert.equal(activeBoot.canCalculate,true);done('activeActor');
 const originalAdoptedIds=await db.run("SELECT coalesce(jsonb_agg(c.id ORDER BY c.id),'[]') FROM employment_adoption_application a JOIN employment_contract c ON c.id=a.contract_id JOIN native_employee_registration n ON n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=c.tenant_id WHERE c.tenant_id="+q(maker.tenantId)+"::uuid AND n.source_binding_id="+q(qa.ids.binding)+"::uuid AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL");
 assert.deepEqual(originalAdoptedIds,[qa.ids.makerContract,qa.ids.checkerContract,qa.ids.targetContract].sort(),'the complete inherited adoption source has exactly three original contracts');
 // Prepare actual approved facts while the fixture actor is still active.
 // Its later historical status is never undone to enable a parameter writer.
 const adoptedFixtureSources=await prepareAdoptedFixtureFacts(h,originalAdoptedIds,h.conditionsProgram.period);
 // Reader fixture declarations are synthetic setup, never part of SQL176.
 await sql('INSERT INTO capabilities SELECT '+q(reader.membershipId)+'::uuid,c FROM unnest(ARRAY[\'workforce.employee.read\',\'payroll.parameter.read\',\'payroll.calculation.read\']) c WHERE NOT EXISTS(SELECT 1 FROM capabilities old WHERE old.membership_id='+q(reader.membershipId)+'::uuid AND old.capability_key=c);DELETE FROM capabilities WHERE membership_id='+q(reader.membershipId)+'::uuid AND capability_key=ANY('+q('{'+calcCaps.filter(x=>x!=='payroll.calculation.read').join(',')+'}')+'::text[])');
 const readerBefore=await rpc('own_run_bootstrap_v1',reader);assert.equal(readerBefore.canCalculate,false);
 const old=h.old,full=h.conditionsProgram.run;assert.equal(old.bodySha256,h.old.bodySha256);assert.ok(old.saved&&full.saved);assert.equal(full.saved.result.employeeCount,855);
 // Only fixture setup makes the synthetic operator historical. The guards are
 // restored before any source-pinned installation or application call.
 await sql('ALTER TABLE employment_contract DISABLE TRIGGER grh_effective_baseline_rows;ALTER TABLE employment_contract DISABLE TRIGGER employment_contract_batch_system;UPDATE employment_contract SET status=\'inactive\',end_date=DATE \'2026-09-30\' WHERE id='+q(qa.ids.makerContract)+'::uuid;ALTER TABLE employment_contract ENABLE TRIGGER employment_contract_batch_system;ALTER TABLE employment_contract ENABLE TRIGGER grh_effective_baseline_rows');
 const broken=await api('run');assert.equal(broken.canCalculate,false);assert.notEqual(broken.scopeVersion,activeBoot.scopeVersion);
 const batch=buildOwnPayrollAdministrativeOperatorInstallation(h.options);
 const n=s=>relocate(s);
 const steps=batch.statements.map(s=>s===batch.choose?`DO $choose$ BEGIN IF current_setting('municontrol_own_admin_operator.mode')='install' THEN EXECUTE ${q(n(batch.beforeCheck))};ELSE EXECUTE ${q(n(batch.afterCheck))};END IF;END $choose$`:s===batch.apply?`DO $apply$ BEGIN IF current_setting('municontrol_own_admin_operator.mode')='install' THEN ${batch.migration.map(m=>'EXECUTE '+q(n(m))+';').join('\n')}END IF;END $apply$`:n(s));
 const prior=await state();
 const rolledBack=await sql('BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL search_path=pg_catalog,'+qa.schema+',public,pg_temp;DO $destination$ BEGIN '+qa.pins+' END $destination$;'+steps.join(';')+';ROLLBACK');assert.equal(rolledBack.mode,'install');assert.deepEqual(await state(),prior);
 const installed=await sql(steps.join(';')),durable=await sql(batch.verification.map(n).join(';'));
 assertOwnPayrollAdministrativeOperatorDurability({installed,durable,batch});assert.deepEqual(await state(),prior);done('zeroInstallationWrites');done('durableInstallation');
 const repeated=await sql(steps.join(';'));assert.equal(repeated.mode,'verify');assertOwnPayrollAdministrativeOperatorDurability({installed:repeated,durable,batch});assert.deepEqual(await state(),prior);done('repeatVerifyOnly');
 const ctx=await rpc('own_run_context_v1',maker,'true,true'),boot=await api('run');assert.equal(ctx.actorPersonId,qa.ids.makerPerson);assert.equal(ctx.employmentContractId,null);assert.equal(ctx.parameterActorVerified,true);assert.equal(boot.canCalculate,true);assert.equal(boot.scopeVersion,activeBoot.scopeVersion);done('historicalActorNullEmployment');
 assert.deepEqual(await rpc('own_run_bootstrap_v1',reader),readerBefore);done('readOnlyBootstrap');
 const recovered=await api('run',{query:{resource:'attempt',key:h.oldKey}});for(const field of['key','id','body','bodySha256','payload','payloadSha256','algorithmSha256','saved'])assert.deepEqual(recovered[field],old[field]);done('oldRealActorAttempt');
 // Complete stored original bytes are replayed through both actual finalizers.
 const completeArgs=r=>q(r.id)+'::uuid,'+j(r.saved.input)+','+j(r.saved.result)+','+q(r.algorithmSha256);
 assert.deepEqual(await rpc('own_run_complete_v1',maker,completeArgs(old)),old.saved);done('normalFinalizer');
 assert.deepEqual(await rpc('own_run_complete_full_v1',maker,completeArgs(old)),old.saved);done('fullSmallFinalizer');
 assert.deepEqual(await rpc('own_run_complete_full_v1',maker,completeArgs(full)),full.saved);done('fullLargeFinalizer');
 await withOwnPayrollFullHttp({handler:h.handlers.run,env:h.env},async({api:fullApi})=>{
  assert.deepEqual((await fullApi({key:full.key})).saved,full.saved);
  const body={...full.body,scopeVersion:boot.scopeVersion,programVersion:boot.programVersion},key=randomUUID();
  const next=await fullApi({body,key,expected:201});assert.deepEqual(next.body,body);assert.equal(next.saved.input.employees.length,855);assert.equal(next.saved.result.employeeCount,855);assert.deepEqual(next.saved.result.employeeTotals,full.saved.result.employeeTotals);assert.ok(next.payload.population.employees.every(e=>e.origin==='MUNICONTROL'||e.sourceSystem==='MUNICONTROL'));
 });done('nativeOnlyEmployees');
 // Adopted contracts use the same IDs. SQL133's approved writer converts
 // provenance into a native registration; no new actor permission or source
 // shortcut is introduced by176.
 const adoptedIds=await db.run("SELECT coalesce(jsonb_agg(c.id ORDER BY c.id),'[]') FROM employment_adoption_application a JOIN employment_contract c ON c.id=a.contract_id JOIN native_employee_registration n ON n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=c.tenant_id WHERE c.tenant_id="+q(maker.tenantId)+"::uuid AND n.source_binding_id="+q(qa.ids.binding)+"::uuid AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL AND payroll_fixed_registry_range_v2(own_run_context_v1("+j(maker)+",true,false),c.id,"+q(full.body.period+'-01')+"::date,("+q(full.body.period+'-01')+"::date+interval '1 month - 1 day')::date,false)");assert.deepEqual(adoptedIds,[qa.ids.checkerContract,qa.ids.targetContract].sort(),'two complete adopted contracts remain eligible; the administrative actor contract stays inactive');
 const adoptedBody={...full.body,scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,selection:{kind:'contracts',values:adoptedIds}};
 const adopted=await api('run',{body:adoptedBody,expected:201});assert.equal(adopted.saved.result.employeeCount,adoptedIds.length);assert.deepEqual(adopted.payload.population.employees.map(e=>e.contractId),adoptedIds);assert.ok(adopted.payload.population.employees.every(e=>e.origin==='MUNICONTROL'));done('adoptedEmployees');
 for(const contractId of adoptedIds){assert.ok(adopted.payload.salaryConditions.records.find(r=>r.contractId===contractId)?.approvalId);for(const component of['workingTime','periodParticipation','employmentFacts'])assert.ok(adopted.payload[component].records.find(r=>r.contractId===contractId)?.configuration.approvalId);}
 // The previous month relative to actual registration is deliberately outside
 // own historical authority. Capture must refuse before treating current
 // classification or approved conditions as historical facts.
 const historicalId=adoptedIds[0],priorPeriod=await db.run("SELECT to_jsonb(to_char((n.created_at AT TIME ZONE 'America/Argentina/Mendoza')::date-interval '1 month','YYYY-MM')) FROM native_employee_registration n WHERE n.contract_id="+q(historicalId)+"::uuid");
 // The inherited adopted fixture explicitly has employment from2000 with no
 // end date. Verify its full historical interval before asking capture to
 // reject the later native registration; do not count a selection failure.
 const historicalIntervalEligible=await db.run('SELECT to_jsonb(payroll_fixed_registry_range_v2(own_run_context_v1('+j(maker)+',true,false),'+q(historicalId)+'::uuid,'+q(priorPeriod+'-01')+'::date,('+q(priorPeriod+'-01')+"::date+interval '1 month - 1 day')::date,true))");assert.equal(historicalIntervalEligible,true,'historical fixture must be eligible throughout the earlier month');
 const historical=await api('run',{body:{...adoptedBody,period:priorPeriod,selection:{kind:'contracts',values:[historicalId]}},expected:422});assert.equal(historical.code,'OWN_RUN_HISTORY_REQUIRED');done('historicalAuthority');
 const ineligible=await api('run',{body:{...adoptedBody,selection:{kind:'contracts',values:[qa.ids.makerContract]}},expected:422});assert.equal(ineligible.code,'OWN_RUN_SELECTION_INVALID');done('employeeEligibility');
 const closePeriod=h.period,closeRead=await api('close',{query:{resource:'detail',period:closePeriod,liquidationType:'monthly'}});assert.ok(closeRead.scopeVersion);
 const params={...emptyOwnReceiptParams(closePeriod),issuer:{name:'Municipio exclusivamente sintético QA',taxId:'30990000001',address:'Domicilio ficticio QA 123'}};
 const preview=await api('receipt',{previewParams:params});assert.ok(preview.scopeVersion&&preview.snapshot);assert.equal((await rpc('own_run_context_v1',maker,'true,false')).employmentContractId,null);
 await transientDenied('DELETE FROM capabilities WHERE membership_id='+q(maker.membershipId)+'::uuid AND capability_key=\'payroll.calculation.approve\'','SELECT own_receipt_context_v1('+j(maker)+')','OWN_CLOSE_FORBIDDEN');done('closeReceiptAdministrativeRead');
 await transientDenied('DELETE FROM capabilities WHERE membership_id='+q(maker.membershipId)+'::uuid AND capability_key=\'payroll.calculation.prepare\'',"DO $$ BEGIN IF (own_run_bootstrap_v1("+j(maker)+")->>'canCalculate')::boolean THEN RAISE EXCEPTION 'QA_PREPARE_LEAK';END IF;PERFORM own_run_attempt_v1("+j(maker)+','+q(old.key)+"::uuid);RAISE EXCEPTION 'QA_NOMINAL_READ_WITHOUT_PREPARE';END $$",'QA_NOMINAL_READ_WITHOUT_PREPARE');done('nominalWithoutPrepare');
 for(const cap of calcCaps)await transientDenied('DELETE FROM capabilities WHERE membership_id='+q(maker.membershipId)+'::uuid AND capability_key='+q(cap),'SELECT own_run_context_v1('+j(maker)+',true,true)','OWN_RUN_FORBIDDEN');done('missingEachCapability');
 await transientDenied('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(maker.membershipId)+'::uuid','SELECT own_run_context_v1('+j(maker)+',true,true)','OWN_RUN_EMPLOYMENT_REQUIRED');done('revokedLink');
 // This account has a valid municipal session/profile and every nominal and
 // prepare capability, but no employment identity association. A capability
 // failure must never stand in for the missing-identity negative scenario.
 await sql('INSERT INTO capabilities SELECT '+q(reader.membershipId)+'::uuid,c FROM unnest(ARRAY['+calcCaps.map(q).join(',')+']) c WHERE NOT EXISTS(SELECT 1 FROM capabilities old WHERE old.membership_id='+q(reader.membershipId)+'::uuid AND old.capability_key=c)');
 const unlinkedCaps=await db.run("SELECT to_jsonb(count(*)="+calcCaps.length+") FROM capabilities WHERE membership_id="+q(reader.membershipId)+"::uuid AND capability_key=ANY("+q('{'+calcCaps.join(',')+'}')+"::text[])");assert.equal(unlinkedCaps,true);
 await expect(()=>rpc('own_run_context_v1',reader,'true,true'),'\\bOWN_RUN_EMPLOYMENT_REQUIRED\\b');done('identityAbsent');
 // Captures require actor_person_id NOT NULL. Test the representable old
 // attempt path through the actual facade with an unverified current actor;
 // do not fabricate a NULL record or adulterate any persisted capture.
 const beforeUnverifiedRead=await state();setActor(reader);const deniedRecovery=await api('run',{query:{resource:'attempt',key:old.key},expected:403});assert.equal(deniedRecovery.code,'OWN_RUN_EMPLOYMENT_REQUIRED');assert.deepEqual(await state(),beforeUnverifiedRead);setActor(maker);done('unverifiedActorAttemptRejected');
 await transientDenied('UPDATE person_identity SET identity_state=\'rejected\' WHERE id='+q(qa.ids.makerPerson)+'::uuid','SELECT own_run_context_v1('+j(maker)+',true,true)','OWN_RUN_EMPLOYMENT_REQUIRED');done('identityRejected');
 await transientDenied('INSERT INTO tenant_action_employment_link(membership_id,tenant_id,source_binding_id,employment_contract_id,active,revoked_at) SELECT membership_id,tenant_id,source_binding_id,employment_contract_id,active,revoked_at FROM tenant_action_employment_link WHERE membership_id='+q(maker.membershipId)+'::uuid','SELECT own_run_context_v1('+j(maker)+',true,true)','NATIVE_SALARY_IDENTITY_CHANGED');done('identityAmbiguous');
 await transientDenied('UPDATE tenant_action_employment_link SET source_binding_id='+q(qa.ids.foreignBinding)+'::uuid WHERE membership_id='+q(maker.membershipId)+'::uuid','SELECT own_run_context_v1('+j(maker)+',true,true)','OWN_RUN_EMPLOYMENT_REQUIRED|BINDING|IDENTITY');done('foreignBinding');
 await expect(()=>rpc('own_run_context_v1',{...maker,actorSessionVersion:maker.actorSessionVersion+1},'true,true'),'SESSION');done('invalidSession');
 await expect(()=>rpc('own_run_context_v1',{...maker,releaseSha:'0'.repeat(40)},'true,true'),'SESSION|RELEASE');done('invalidRelease');
 await expect(()=>rpc('own_run_context_v1',{...maker,actorPersonId:qa.ids.checkerPerson,employmentContractId:qa.ids.checkerContract,parameterActorVerified:true},'true,true'),'SESSION_INVALID');done('injectedIdentity');
 // Revoke the actual source binding's certification with the same valid
 // actor/session/capabilities. An unrelated actor's missing cap cannot prove
 // this municipal-source/profile boundary. The failing transaction rolls back.
 await transientDenied('UPDATE platform_tenant_source_binding SET verified=false WHERE id='+q(qa.ids.binding)+'::uuid','SELECT own_run_context_v1('+j(maker)+',true,true)','NATIVE_EMPLOYEE_BINDING_INVALID|ACTION_TENANT_AUTHORITY_REQUIRED|SOURCE_BINDING');done('missingProfile');
 await expect(()=>rpc('own_run_attempt_v1',qa.actors.checker,q(old.key)+'::uuid'),'OWN_RUN_NOT_FOUND|OWN_RUN_FORBIDDEN');done('differentActorAttemptRejected');
 for(const signature of['own_run_context_v1(jsonb,boolean,boolean)','own_novelty_sources_v1(jsonb,date,text,uuid[])','native_salary_administrative_context_v1(jsonb)'])assert.equal(await db.run("SELECT to_jsonb(has_function_privilege('municontrol_actions_runtime_app',"+q(qa.schema+'.'+signature)+",'EXECUTE'))"),false);
 await expect(()=>sql('GRANT EXECUTE ON FUNCTION '+qa.schema+'.own_run_context_v1(jsonb,boolean,boolean) TO municontrol_actions_runtime_app;'+n(batch.afterCheck)),'OWN_ADMIN_OPERATOR_FUNCTION_CHANGED');done('privateAcl');
 // SQL172 refuses a proposal identical to the approved definition. Use a
 // genuinely different, fully validated synthetic proposal; it stays pending
 // after the same-person review is denied and never changes the active rules.
 const pboot=await api('program'),selfReviewProgram=ownProgramDefinition({...pboot.program.definition,totalsPrecision:pboot.program.definition.totalsPrecision===3?4:3},pboot.salaryCatalog.items);
 assert.notDeepEqual(selfReviewProgram,pboot.program.definition);
 const proposal=await api('program',{expected:201,body:{command:'propose',scopeVersion:pboot.scopeVersion,baseVersion:pboot.program.version,salaryVersion:pboot.salaryCatalog.version,program:selfReviewProgram,proposalId:null,proposalSha256:null,reason:'Propuesta exclusivamente sintética para comprobar independencia administrativa QA',reviewConfirmed:false}});
 const ownReview=await api('program');assert.equal(ownReview.proposals.find(x=>x.id===proposal.proposalId).canReview,false);
 await api('program',{expected:403,body:{...proposal.body,command:'approve',scopeVersion:ownReview.scopeVersion,program:null,proposalId:proposal.proposalId,proposalSha256:proposal.requestSha256,reason:'Revisión propia exclusivamente sintética que debe ser rechazada QA',reviewConfirmed:true}});done('selfApproval');
 // Use one explicitly selected employee from the already complete855 fixture.
 // Capture without finalizing, then independently confirm and close another
 // actual handler result for that same employee. No event or result is forged.
 const contractId=[...h.salaryConditions.extraPeople].map(e=>e.contractId).sort()[0];assert.ok(contractId&&full.payload.population.employees.some(e=>e.contractId===contractId));
 const current=await api('run'),pendingBody={...full.body,scopeVersion:current.scopeVersion,programVersion:current.programVersion,selection:{kind:'contracts',values:[contractId]}},pendingKey=randomUUID(),algorithm=ownRunAlgorithmHash();
 const notClosed=await db.run("SELECT to_jsonb(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(own_close_active_v1(own_run_context_v1("+j(maker)+",true,false),"+q(pendingBody.period)+","+q(pendingBody.liquidationType)+")) g CROSS JOIN LATERAL jsonb_array_elements(g.value#>'{snapshot,employees}') e WHERE e.value->>'contractId'="+q(contractId)+"))");assert.equal(notClosed,true,'the explicitly selected closed-group fixture must initially be open');
 const pending=await rpc('own_run_capture_v1',maker,j(pendingBody)+','+q(pendingKey)+'::uuid,'+q(algorithm));
 assert.deepEqual(pending.body,pendingBody);assert.equal(pending.key,pendingKey);assert.equal(pending.algorithmSha256,algorithm);assertOwnAdministrativePendingCapture(pending,pending);
 const actorAudit=await db.run("SELECT jsonb_build_object('actorPersonId',actor_person_id,'membershipId',actor_membership_id,'actorEmail',actor_email) FROM own_payroll_run_capture WHERE id="+q(pending.id)+"::uuid");assert.deepEqual(actorAudit,{actorPersonId:qa.ids.makerPerson,membershipId:maker.membershipId,actorEmail:maker.actorEmail});assert.equal((await rpc('own_run_context_v1',maker,'true,true')).employmentContractId,null);
 // Derive real input/result once from the original frozen authorized payload,
 // using exactly the current production adapter and CPU engine. Never rebuild
 // it from sources after close/reopen or substitute the other run's payload.
 const{sourceInventory:_sourceAudit,...pendingSources}=pending.payload,snapshot=createOwnPayrollSnapshot(prepareOwnPayrollInput(pendingSources));
 const frozenHash=ownRunHash({key:pendingKey,body:pendingBody,algorithm,payload:pending.payload,input:snapshot.input,result:snapshot.result});
 const otherKey=randomUUID(),other=await api('run',{body:pendingBody,key:otherKey,expected:201});assert.notEqual(other.id,pending.id);assert.notEqual(other.key,pending.key);assert.deepEqual(other.saved.input,snapshot.input);assert.deepEqual(other.saved.result,snapshot.result);
 setActor(qa.actors.checker);const liquidation=await api('liquidation',{query:{resource:'detail',id:other.id}});
 assert.equal(liquidation.employees.length,1);assert.ok(liquidation.employees[0].allowedCommands.includes('confirm'));
 await api('liquidation',{expected:201,body:{runId:other.id,resultSha256:other.saved.resultSha256,scopeVersion:liquidation.scopeVersion,stateVersion:liquidation.stateVersion,command:'confirm',selection:{kind:'contracts',values:[contractId]},reason:'Confirmación independiente exclusivamente sintética para guardas de cierre QA',reviewConfirmed:true}});
 const closeState=await api('close',{query:{resource:'detail',period:pendingBody.period,liquidationType:pendingBody.liquidationType}}),chosen=closeState.rows.find(e=>e.contractId===contractId);assert.ok(chosen?.canClose);assert.equal(chosen.runId,other.id);
 const closed=await api('close',{expected:201,body:{period:pendingBody.period,liquidationType:pendingBody.liquidationType,scopeVersion:closeState.scopeVersion,stateVersion:closeState.stateVersion,selection:{kind:'contracts',values:[contractId]},command:'close',groupId:null,reason:'Cierre independiente exclusivamente sintético del contrato de prueba QA',reviewConfirmed:true}});
 assert.equal(closed.snapshot.employeeCount,1);assert.equal(closed.snapshot.employees[0].contractId,contractId);assert.equal(closed.snapshot.employees[0].runId,other.id);
 setActor(maker);const pendingArgs=q(pending.id)+'::uuid,'+j(snapshot.input)+','+j(snapshot.result)+','+q(algorithm),closedFailures=[];
 for(const finalizer of['own_run_complete_v1','own_run_complete_full_v1']){
  const beforeFailure=await state();await expect(()=>rpc(finalizer,maker,pendingArgs),'\\bOWN_CLOSE_REOPEN_REQUIRED\\b');assert.deepEqual(await state(),beforeFailure);
  const stillPending=await api('run',{query:{resource:'attempt',key:pendingKey}});assertOwnAdministrativePendingCapture(pending,stillPending);closedFailures.push(finalizer);
 }
 assert.equal(frozenHash,ownRunHash({key:pendingKey,body:pendingBody,algorithm,payload:pending.payload,input:snapshot.input,result:snapshot.result}));
 setActor(qa.actors.checker);const reopenState=await api('close',{query:{resource:'detail',period:pendingBody.period,liquidationType:pendingBody.liquidationType}});assert.ok(reopenState.groups.find(g=>g.id===closed.groupId)?.canReopen);
 const reopened=await api('close',{expected:201,body:{period:pendingBody.period,liquidationType:pendingBody.liquidationType,scopeVersion:reopenState.scopeVersion,stateVersion:reopenState.stateVersion,selection:{kind:'all',values:[]},command:'reopen',groupId:closed.groupId,reason:'Reapertura independiente exclusivamente sintética para recuperar captura QA',reviewConfirmed:true}});assert.equal(reopened.groupId,closed.groupId);
 setActor(maker);assertOwnAdministrativePendingCapture(pending,await api('run',{query:{resource:'attempt',key:pendingKey}}));
 const completed=await rpc('own_run_complete_full_v1',maker,pendingArgs);assert.deepEqual(completed.input,snapshot.input);assert.deepEqual(completed.result,snapshot.result);assert.equal(completed.inputSha256,snapshot.inputSha256);assert.equal(completed.resultSha256,snapshot.resultSha256);assert.equal(completed.id,pending.id);assert.equal(completed.algorithmSha256,algorithm);
 assert.deepEqual(await rpc('own_run_complete_v1',maker,pendingArgs),completed);const recoveredPending=await api('run',{query:{resource:'attempt',key:pendingKey}});assert.deepEqual(recoveredPending.saved,completed);assert.deepEqual(recoveredPending.body,pendingBody);assert.deepEqual(recoveredPending.payload,pending.payload);assert.equal(recoveredPending.key,pendingKey);assert.equal(recoveredPending.id,pending.id);
 assert.equal(frozenHash,ownRunHash({key:pendingKey,body:pendingBody,algorithm,payload:recoveredPending.payload,input:completed.input,result:completed.result}));done('closedGroups');
 const closedGroupProof={pendingCaptureId:pending.id,pendingKey,contractId,otherRunId:other.id,closedGroupId:closed.groupId,closedFailures,frozenCanonicalSha256:frozenHash,originalBodyKeyPayloadPreserved:true,originalDerivedInputResultPreserved:true,completedAfterIndependentReopen:true};
 // Only actual post176 scenarios enter coverage; inherited checks and mocks
 // never substitute for this actor's adopted or closed-group behavior.
 const coverage=ownAdministrativeOperatorCoverage(checks);
 return{version:'own-payroll-administrative-operator-qa.v1',...coverage,syntheticOnly:true,actualHandlers:true,actualSql:true,productiveBusinessWrites:0,installed,durable,repeated,closedGroupProof,adoptedFixtureProof:{original:3,eligible:2,inactiveAdministrativeActor:1,sources:adoptedFixtureSources},historicalProof:{contractId:historicalId,period:priorPeriod,intervalEligible:true,expectedCode:'OWN_RUN_HISTORY_REQUIRED'}};
}
