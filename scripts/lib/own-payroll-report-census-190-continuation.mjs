// Source candidate only. This continuation receives the EXISTING190 transport;
// it creates no process, database, schema or independent execution channel.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {ownerProgramQaAccessSql,ownerProgramQaAccess,ownerProgramQaUnrelatedSnapshot} from './municipal-owner-program-qa.mjs';
import {buildOwnReportCensusInstallation,assertOwnReportCensusDurability} from './own-payroll-report-census-installation.mjs';
import {buildOwnReportCensus190IamFixture,assertOwnReportCensus190IamFixture} from './own-payroll-report-census-190-iam-fixture.mjs';
import {ownReportCensusQaResult} from './own-payroll-report-census-qa-rpc.mjs';
import {createNativeEmployeeHandler} from '../../api/internal-native-employees.js';
import {createEmploymentChangesHandler} from '../../api/internal-employment-changes.js';
import {createOwnProgramHandler} from '../../api/internal-own-payroll-program.js';
import {createOwnRunHandler} from '../../api/internal-own-payroll-run.js';
import {createOwnLiquidationHandler} from '../../api/internal-own-payroll-liquidation.js';
import {createOwnCloseHandler} from '../../api/internal-own-payroll-close.js';
import {createOwnPeriodClassificationHandler} from '../../api/internal-own-period-classification.js';
import {prepareProgramWorkspace} from '../../assets/own-payroll-program-workspace-model.js';
import {ownProgramBootstrap} from '../../assets/own-payroll-program-model.js';
import {verifiedOwnCloseReceipt} from '../../assets/own-payroll-close-model.js';
import {verifiedOwnReportCensus} from '../../assets/own-payroll-report-census-model.js';
import {verifiedOwnReportBundle,ownReportDocument} from '../../assets/own-payroll-report-model.js';
import {draft as employeeDraft} from '../../tests/fixtures/native-employee-synthetic.js';

const quote=value=>"'"+String(value).replaceAll("'","''")+"'",j=value=>quote(JSON.stringify(value))+'::jsonb';
const hash=value=>createHash('sha256').update(value).digest('hex');
const reason='Circuito de histórico exclusivamente ficticio QA200';
const paths={employee:'/api/internal-native-employees',employmentChange:'/api/internal-employment-changes',program:'/api/internal-own-payroll-program',run:'/api/internal-own-payroll-run',liquidation:'/api/internal-own-payroll-liquidation',close:'/api/internal-own-payroll-close',classification:'/api/internal-own-period-classification'};
const cuil=dni=>{const base='20'+dni,n=11-[5,4,3,2,7,6,5,4,3,2].reduce((sum,weight,index)=>sum+weight*Number(base[index]),0)%11;return base+(n===11?'0':n===10?'9':String(n));};

export function bindOwnReportCensus190Context(h){
 const{qa,env}=h;assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(qa.operationalPairBaseline,'published107');
 for(const key of['json','read','check'])assert.equal(typeof h[key],'function');
 let current=qa.actor;const trace=[];
 const db={query:(text,values)=>ownReportCensusQaResult(rendered=>h.json(['SET LOCAL ROLE municontrol_actions_runtime_app',rendered],{command:true}),text,values,qa.schema)};
 const access=()=>ownerProgramQaAccess(h.json([ownerProgramQaAccessSql(qa.schema,current)],{readOnly:true}),current);
 const deps={env,requireAccess:async()=>access(),getSql:()=>db,sessionFor:()=>({id:current.actorSessionId,email:current.actorEmail,version:current.actorSessionVersion,releaseSha:current.releaseSha})};
 const handlers={employee:createNativeEmployeeHandler(deps),employmentChange:createEmploymentChangesHandler(deps),program:createOwnProgramHandler(deps),run:createOwnRunHandler(deps),liquidation:createOwnLiquidationHandler(deps),close:createOwnCloseHandler(deps),classification:createOwnPeriodClassificationHandler(deps)};
 const api=async(kind,{query={resource:'bootstrap'},body,key=randomUUID(),expected=200}={})=>{
  assert.ok(Object.hasOwn(handlers,kind));const post=body!==undefined;
  const envelope=!post?undefined:kind==='employee'?body:kind==='employmentChange'?body:{operation:kind==='run'?'calculate':'command',payload:body};
  const response={statusCode:0,headers:{},setHeader(name,value){this.headers[name]=value;},status(value){this.statusCode=value;return this;},json(value){this.value=value;return this;}};
  await handlers[kind]({method:post?'POST':'GET',url:paths[kind]+(post?'':'?'+new URLSearchParams(query)),query:post?{}:query,headers:post?{origin:env.INTERNAL_APP_ORIGIN,'content-type':'application/json','idempotency-key':key}:{},...(post?{body:JSON.stringify(envelope)}:{})},response);
  trace.push({kind,method:post?'POST':'GET',operation:post?(envelope.operation??'create'):query.resource,status:response.statusCode});
  assert.equal(response.statusCode,expected,'CENSUS190_API_STATUS:'+kind+':'+(response.value?.code??'unknown'));
  if(expected>=400){assert.equal(response.value.ok,false);return response.value;}
  assert.equal(response.value.ok,true);return response.value.data;
 };
 const setActor=actor=>{assert.ok(actor&&actor.tenantId===qa.actor.tenantId);current=actor;};
 const fixtureSnapshot=()=>h.json([ownerProgramQaUnrelatedSnapshot(qa.schema),`SELECT jsonb_build_object('unrelated',current_setting('municontrol_program190_qa.unrelated')::jsonb,'program',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]'::jsonb) FROM ${qa.schema}.own_payroll_program_event e),'ownerProvenance',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY event_id),'[]'::jsonb) FROM ${qa.schema}.municipal_owner_program_provenance e))`],{readOnly:true});
 return{...h,api,setActor,trace,fixtureSnapshot};
}

// The source190 protocol and all its negative/rollback/browser/recovery checks
// must already have completed. This adds one source200 reader under that same h.
async function installCensus(h){
 const batch=buildOwnReportCensusInstallation({read:h.read,sourceCommit:h.sourceCommit});
 const definition=h.qa.normalized(batch.migration[0]),match=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(definition);assert.ok(match);
 const relocatedHash=hash(match[2]),n=source=>h.qa.normalized(source).replaceAll(batch.ownPin.sha256,relocatedHash),statements=batch.statements.map(n),verification=batch.verification.map(n);
 const before=h.fixtureSnapshot(),rehearsal=h.json(statements,{end:'ROLLBACK'});assert.equal(rehearsal.mode,'install');assert.deepEqual(h.fixtureSnapshot(),before);
 const absent=h.json([`SELECT jsonb_build_object('absent',to_regprocedure(${quote(h.qa.schema+'.own_close_report_census_v1(jsonb,text,text)')}) IS NULL)`],{readOnly:true});assert.equal(absent.absent,true);
 const installed=h.json(statements),durable=h.json(verification,{readOnly:true});assertOwnReportCensusDurability({installed,durable,batch});assert.deepEqual(h.fixtureSnapshot(),before);
 const repeated=h.json(statements);assert.equal(repeated.mode,'verify');assertOwnReportCensusDurability({installed:repeated,durable,batch});assert.deepEqual(h.fixtureSnapshot(),before);
 h.check('M8 reader200 rehearsal rollback, install/durable/repeat preserve canonical190 and every existing business row');
 return{batch,statements,verification,installed,durable,repeated,relocatedHash};
}

// Two explicit accounts/sessions for two actual API-created native employees.
// The existing owner/checker identities, contracts, roles and links stay intact.
function operationalActors(h,hires){
 assert.equal(hires.length,2);const{qa}=h,actors=hires.map((hire,index)=>({actorEmail:'census190-operator-'+index+'@example.invalid',actorSessionId:randomUUID(),actorSessionVersion:3,membershipId:randomUUID(),releaseSha:qa.actor.releaseSha,tenantId:qa.actor.tenantId}));
 const oldActors=()=>h.json([`SELECT jsonb_build_object('users',(SELECT jsonb_agg(to_jsonb(r) ORDER BY email) FROM ${qa.schema}.internal_users r WHERE email=ANY(ARRAY[${quote(qa.actor.actorEmail)},${quote(qa.checker.actorEmail)}])),'memberships',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM ${qa.schema}.tenant_membership r WHERE id=ANY(ARRAY[${quote(qa.actor.membershipId)},${quote(qa.checker.membershipId)}]::uuid[])),'sessions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM ${qa.schema}.tenant_identity_session r WHERE user_email=ANY(ARRAY[${quote(qa.actor.actorEmail)},${quote(qa.checker.actorEmail)}])),'links',(SELECT jsonb_agg(to_jsonb(r) ORDER BY membership_id) FROM ${qa.schema}.tenant_action_employment_link r WHERE membership_id=ANY(ARRAY[${quote(qa.actor.membershipId)},${quote(qa.checker.membershipId)}]::uuid[])),'contracts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM ${qa.schema}.employment_contract r WHERE id=ANY(ARRAY[${quote(qa.ids.contract)},${quote(qa.ids.checkerContract)}]::uuid[])))`],{readOnly:true}),priorActors=oldActors();
 const links=hires.map(hire=>{
  // The unmodified113 ownership guard must admit each ACTUAL API registration
  // before the explicitly declared authentication fixture can reference it.
  h.json([qa.normalized('SELECT public.native_account_contract_v1('+quote(qa.actor.tenantId)+'::uuid,'+quote(qa.ids.binding)+'::uuid,'+quote(hire.contractId)+'::uuid,true)')]);
  const linked=h.json([`SELECT jsonb_build_object('personId',c.person_id,'contractId',c.id,'registrationId',n.id) FROM ${qa.schema}.employment_contract c JOIN ${qa.schema}.native_employee_registration n ON n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=c.tenant_id WHERE c.id=${quote(hire.contractId)}::uuid AND n.id=${quote(hire.registrationId)}::uuid AND n.source_binding_id=${quote(qa.ids.binding)}::uuid AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL`],{readOnly:true});
  assert.equal(linked.contractId,hire.contractId);assert.equal(linked.registrationId,hire.registrationId);assert.match(linked.personId,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);return linked;
 });
 const sql=actors.flatMap((actor,index)=>[
  `INSERT INTO public.internal_users(email,display_name,password_hash,active,auth_mode,identity_version) VALUES(${quote(actor.actorEmail)},'Operador exclusivamente ficticio QA200',NULL,true,'managed',4)`,
  `INSERT INTO public.tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at) SELECT ${quote(actor.membershipId)}::uuid,tenant_id,${quote(actor.actorEmail)},role_key,'active',${quote(qa.actor.actorEmail)},clock_timestamp() FROM public.tenant_membership WHERE id=${quote(index===0?qa.actor.membershipId:qa.checker.membershipId)}::uuid`,
  `INSERT INTO public.tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,expires_at) VALUES(${quote(actor.actorSessionId)}::uuid,${quote(actor.actorEmail)},${quote(actor.tenantId)}::uuid,'membership','mfa',3,4,clock_timestamp()+interval '1 hour')`,
  `INSERT INTO public.tenant_action_authority(membership_id,tenant_id) VALUES(${quote(actor.membershipId)}::uuid,${quote(actor.tenantId)}::uuid)`,
  `INSERT INTO public.tenant_action_employment_link(membership_id,tenant_id,source_binding_id,employment_contract_id,active,linked_by_user_email) VALUES(${quote(actor.membershipId)}::uuid,${quote(actor.tenantId)}::uuid,${quote(qa.ids.binding)}::uuid,${quote(hires[index].contractId)}::uuid,true,${quote(qa.actor.actorEmail)})`
 ]);
 h.json(sql.map(qa.normalized));
 assert.deepEqual(oldActors(),priorActors,'CENSUS190_ADMINISTRATIVE_ACTORS_CHANGED');
 for(const[at,actor]of actors.entries()){
  const context=h.json([qa.normalized('SELECT public.native_employment_change_context_v1('+j(actor)+','+quote(at===0?'employee.record.propose':'employee.record.approve')+')')],{command:true});
  assert.equal(context.actorPersonId,links[at].personId);assert.equal(context.employmentContractId,hires[at].contractId);assert.equal(context.sourceBindingId,qa.ids.binding);
 }
 return{maker:actors[0],checker:actors[1],newUsers:2,newMemberships:2,newSessions:2,newEmploymentLinks:2,authenticationFixture:true,accountProvisioningApiProven:false,native113OwnershipGuardProven:true,originalAdministrativeActorsPreserved:true};
}

export async function runOwnReportCensus190Continuation(raw){
 const h=bindOwnReportCensus190Context(raw),{qa,api,setActor}=h;
 const iam=buildOwnReportCensus190IamFixture({qa,read:h.read}),iamProof=h.json(iam.statements),iamChecked=assertOwnReportCensus190IamFixture(iam,iamProof);
 const installation=await installCensus(h);
 const now=h.json([`SELECT jsonb_build_object('period',to_char(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM'),'firstDate',to_char(date_trunc('month',statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza'),'YYYY-MM-DD'),'nativeCount',(SELECT count(*) FROM ${qa.schema}.native_employee_registration))`],{readOnly:true});
 // Existing190 synthetic definitions are explicitly dated2026-10. A later
 // month is a fixture update requiring review, never a silently shifted rule.
 assert.equal(now.period,'2026-10','CENSUS190_DATED_FIXTURE_REVIEW_REQUIRED');assert.equal(now.nativeCount,0,'CENSUS190_INITIAL_NATIVE_POPULATION_CHANGED');
 setActor(qa.actor);const pboot=ownProgramBootstrap(await api('program')),sameDefinition=pboot.program.definition;
 const proposed=await api('program',{body:prepareProgramWorkspace(pboot,sameDefinition,reason),expected:201});
 setActor(qa.checker);const pReview=ownProgramBootstrap(await api('program')),pending=pReview.proposals.find(value=>value.id===proposed.proposalId);assert.equal(pending.canReview,true);
 const approval=await api('program',{body:{command:'approve',scopeVersion:pReview.scopeVersion,baseVersion:pending.baseVersion,salaryVersion:pending.salaryVersion,proposalId:pending.id,proposalSha256:pending.requestSha256,program:null,reason,reviewConfirmed:true},expected:201});assert.equal(approval.status,'approved');
 const latest=ownProgramBootstrap(await api('program'));assert.deepEqual(latest.program.definition,sameDefinition);assert.equal(latest.program.salaryVersion,latest.salaryCatalog.version);
 setActor(qa.actor);const hires=[];
 for(let index=0;index<2;index++){
  const bootstrap=await api('employee'),dni=String(97020001+index),draft=employeeDraft({legajo:String(200001+index),fullName:'Agente exclusivamente nativo de censo QA200 '+index,dni,cuil:cuil(dni),birthDate:'1990-01-01',sexCode:'X',startDate:now.firstDate,agreementCode:'1',categoryCode:'1',organizationId:'1',sectorCode:'1',jurisdictionCode:'42',jobTitle:'Puesto exclusivamente ficticio QA200',legalReference:reason});
  const hire=await api('employee',{body:{catalogVersion:bootstrap.catalog.version,draft},expected:201});assert.equal(hire.origin,'MUNICONTROL');assert.equal(hire.startDate,now.firstDate);hires.push(hire);
 }
 const operators=operationalActors(h,hires),contracts=hires.map(value=>value.contractId).sort();
 setActor(qa.actor);for(const contractId of contracts){const classification=await api('classification',{query:{resource:'bootstrap',contractId,period:now.period}});assert.equal(classification.configuration.revision,0);assert.equal(classification.configuration.approvalId,null);}
 const rb=await api('run'),calculated=await api('run',{body:{period:now.period,liquidationType:'monthly',selection:{kind:'all',values:[]},scopeVersion:rb.scopeVersion,programVersion:rb.programVersion,populationDomain:'native_registered'},expected:201});
 assert.deepEqual(calculated.payload.population.employees.map(value=>value.contractId).sort(),contracts);assert.equal(calculated.saved.result.employeeCount,contracts.length);
 assert.ok(calculated.payload.sourceInventory.periodClassifications.rows.every(value=>value.basis==='current_own_registration'&&value.approvalId===null));
 setActor(qa.checker);const liquidation=await api('liquidation',{query:{resource:'detail',id:calculated.id}});await api('liquidation',{body:{runId:calculated.id,resultSha256:calculated.saved.resultSha256,scopeVersion:liquidation.scopeVersion,stateVersion:liquidation.stateVersion,command:'confirm',selection:{kind:'all',values:[]},reason,reviewConfirmed:true},expected:201});
 const closeDetail=await api('close',{query:{resource:'detail',period:now.period,liquidationType:'monthly'}});assert.deepEqual(closeDetail.rows.map(value=>value.contractId).sort(),contracts);
 const closed=await api('close',{body:{period:now.period,liquidationType:'monthly',scopeVersion:closeDetail.scopeVersion,stateVersion:closeDetail.stateVersion,selection:{kind:'all',values:[]},command:'close',groupId:null,reason,reviewConfirmed:true},expected:201});await verifiedOwnCloseReceipt(closed);
 assert.equal(closed.snapshot.populationCount,contracts.length);assert.equal(closed.snapshot.employeeCount,contracts.length);assert.equal(closed.snapshot.populationComplete,true);
 const original=await api('close',{query:{resource:'group',id:closed.groupId}});await verifiedOwnCloseReceipt(original);
 const deniedReadBefore=h.fixtureSnapshot();setActor(qa.actor);const noApproval=await api('close',{query:{resource:'report-census',period:now.period,liquidationType:'monthly'},expected:403});assert.equal(noApproval.code,'OWN_CLOSE_FORBIDDEN');assert.deepEqual(h.fixtureSnapshot(),deniedReadBefore);
 h.check('M8 normal API creates complete native revision0 cohort; actual own calculation, independent confirmation and close include every roster member');
 setActor(operators.maker);const target=hires[0].contractId,beforeChange=await api('employmentChange',{query:{resource:'bootstrap',contractId:target}});
 const proposal=await api('employmentChange',{body:{operation:'propose',payload:{contractId:target,identityToken:beforeChange.subject.identityToken,scopeVersion:beforeChange.scopeVersion,baseVersion:beforeChange.employment.version,catalogVersion:beforeChange.catalog.version,values:{...beforeChange.employment.values,jobTitle:beforeChange.employment.values.jobTitle+' rectificado'},legalReference:reason,reason}},expected:201});
 setActor(operators.checker);const changeReview=await api('employmentChange',{query:{resource:'bootstrap',contractId:target}});assert.equal(changeReview.proposals.find(value=>value.id===proposal.proposalId)?.canReview,true);
 const changed=await api('employmentChange',{body:{operation:'review',payload:{contractId:target,proposalId:proposal.proposalId,scopeVersion:changeReview.scopeVersion,decision:'approve',reason}},expected:201});assert.equal(changed.status,'approved');assert.ok(changed.revision>0);
 setActor(qa.checker);const conservation=h.fixtureSnapshot(),denied=await api('close',{query:{resource:'detail',period:now.period,liquidationType:'sac'},expected:422});assert.equal(denied.code,'OWN_CLOSE_HISTORY_REQUIRED');assert.deepEqual(h.fixtureSnapshot(),conservation);
 const frozen=await api('close',{query:{resource:'group',id:closed.groupId}});await verifiedOwnCloseReceipt(frozen);assert.deepEqual(frozen,original);
 const monthly=await api('close',{query:{resource:'report-census',period:now.period,liquidationType:'monthly'}}),sac=await api('close',{query:{resource:'report-census',period:now.period,liquidationType:'sac'}});
 await verifiedOwnReportCensus(monthly);await verifiedOwnReportCensus(sac);assert.equal(monthly.complete,true);assert.equal(sac.complete,true);assert.equal(monthly.groups.length,1);assert.equal(monthly.eventCount,1);assert.equal(monthly.groups[0].id,closed.groupId);assert.equal(sac.groups.length,0);assert.equal(sac.eventCount,0);assert.notEqual(monthly.sourceVersion,sac.sourceVersion);
 const reportQuery={from:now.period,to:now.period,types:['monthly','sac']},bundle=await verifiedOwnReportBundle(reportQuery,[monthly,sac],[frozen]);assert.deepEqual(bundle.employees.map(value=>value.employee.contractId).sort(),contracts);
 const document=ownReportDocument(bundle);assert.equal(document.rows.length,contracts.length);assert.deepEqual(h.fixtureSnapshot(),conservation);
 h.check('M8 real104 approval keeps operational SAC422 unchanged; complete monthly plus empty SAC census and original group build every report row without a live roster');
 const populated=h.json(installation.statements),populatedDurable=h.json(installation.verification,{readOnly:true});assert.equal(populated.mode,'verify');assertOwnReportCensusDurability({installed:populated,durable:populatedDurable,batch:installation.batch});assert.deepEqual(h.fixtureSnapshot(),conservation);
 // Monthly detail remains operationally valid because BOTH selected contracts
 // are frozen. The ordinary writer still obtains its own fresh stateVersion.
 const reopenDetail=await api('close',{query:{resource:'detail',period:now.period,liquidationType:'monthly'}}),reopened=await api('close',{body:{period:now.period,liquidationType:'monthly',scopeVersion:reopenDetail.scopeVersion,stateVersion:reopenDetail.stateVersion,selection:{kind:'all',values:[]},command:'reopen',groupId:closed.groupId,reason,reviewConfirmed:true},expected:201});assert.equal(reopened.body.command,'reopen');
 const afterReopen=h.fixtureSnapshot(),next=await api('close',{query:{resource:'report-census',period:now.period,liquidationType:'monthly'}});await verifiedOwnReportCensus(next);assert.notEqual(next.sourceVersion,monthly.sourceVersion);assert.equal(next.eventCount,2);assert.equal(next.groups.length,1);assert.equal(next.groups[0].state,'reopened');assert.equal(next.groups[0].snapshotSha256,original.snapshotSha256);
 const originalAfterReopen=await api('close',{query:{resource:'group',id:closed.groupId}});assert.deepEqual(originalAfterReopen,original);
 await assert.rejects(()=>verifiedOwnReportBundle(reportQuery,[next,sac],[original]));const reopenedBundle=await verifiedOwnReportBundle(reportQuery,[next,sac],[]);assert.equal(reopenedBundle.employees.length,0);assert.notEqual(reopenedBundle.proof,bundle.proof);assert.deepEqual(h.fixtureSnapshot(),afterReopen);
 h.check('M8 actual reopen changes full event fingerprint, preserves original group and rejects its inclusion as an active report group');
 return{version:'own-report-census-canonical190-native-qa.v1',passed:true,actualSql:true,actualHandlers:true,sourceCommit:h.sourceCommit,period:now.period,operationalPairBaseline:'published107',newNativeEmployees:2,newUsers:2,newMemberships:2,newSessions:2,newEmploymentLinks:2,authenticationFixture:true,accountProvisioningApiProven:false,native113OwnershipGuardProven:true,rolesChanged:0,functionsSubstituted:0,initialNativePopulation:now.nativeCount,closedEmployeeCount:contracts.length,populationComplete:true,iamChecked,installation:{installed:installation.installed,durable:installation.durable,repeated:installation.repeated,populated,populatedDurable},reportRows:document.rows.length,unchangedOperationalSacCode:denied.code,conservedOriginalGroup:true,reopenChangesCensus:true,completeSnapshotReadsPreserved:true,trace:h.trace,productionWrites:0,municipalAcceptance:false};
}
