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
import {prepareOwnReportCensusLegacyFixtures} from '../../tests/fixtures/own-payroll-report-census-legacy-synthetic.js';
const legacySnapshotPrefix='municontrol_report_census200.before',legacyVersionNames=['own-close-snapshot.v1','own-close-snapshot.v2'];

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
  assert.equal(calculated.saved.input.version,'own-payroll-input.v2');assert.equal(calculated.saved.result.version,'own-payroll-result.v2');
 assert.ok(calculated.payload.sourceInventory.periodClassifications.rows.every(value=>value.basis==='current_own_registration'&&value.approvalId===null));
 setActor(qa.checker);const liquidation=await api('liquidation',{query:{resource:'detail',id:calculated.id}});await api('liquidation',{body:{runId:calculated.id,resultSha256:calculated.saved.resultSha256,scopeVersion:liquidation.scopeVersion,stateVersion:liquidation.stateVersion,command:'confirm',selection:{kind:'all',values:[]},reason,reviewConfirmed:true},expected:201});
 const closeDetail=await api('close',{query:{resource:'detail',period:now.period,liquidationType:'monthly'}});assert.deepEqual(closeDetail.rows.map(value=>value.contractId).sort(),contracts);
 const closed=await api('close',{body:{period:now.period,liquidationType:'monthly',scopeVersion:closeDetail.scopeVersion,stateVersion:closeDetail.stateVersion,selection:{kind:'all',values:[]},command:'close',groupId:null,reason,reviewConfirmed:true},expected:201});await verifiedOwnCloseReceipt(closed);
 assert.equal(closed.snapshot.populationCount,contracts.length);assert.equal(closed.snapshot.employeeCount,contracts.length);assert.equal(closed.snapshot.populationComplete,true);
  assert.equal(closed.snapshot.version,'own-close-snapshot.v3');assert.ok(closed.snapshot.employees.every(value=>value.namespaceVersion==='own-payroll-namespaces.v2'));
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
  const legacyFormats=await runOwnReportCensus190LegacyReaders(h,{installation,currentPeriod:now.period,currentCensus:next,checkDurability:assertOwnReportCensusDurability});
  return{version:'own-report-census-canonical190-native-qa.v1',passed:true,actualSql:true,actualHandlers:true,sourceCommit:h.sourceCommit,period:now.period,operationalPairBaseline:'published107',newNativeEmployees:2,newUsers:2,newMemberships:2,newSessions:2,newEmploymentLinks:2,authenticationFixture:true,accountProvisioningApiProven:false,native113OwnershipGuardProven:true,rolesChanged:0,functionsSubstituted:0,initialNativePopulation:now.nativeCount,closedEmployeeCount:contracts.length,populationComplete:true,iamChecked,installation:{installed:installation.installed,durable:installation.durable,repeated:installation.repeated,populated,populatedDurable},currentCalculationFormats:{input:calculated.saved.input.version,result:calculated.saved.result.version,closeSnapshot:closed.snapshot.version},legacyFormats,reportRows:document.rows.length,unchangedOperationalSacCode:denied.code,conservedOriginalGroup:true,reopenChangesCensus:true,completeSnapshotReadsPreserved:true,trace:h.trace,productionWrites:0,municipalAcceptance:false};
}

// The complete existing200 preservation snapshot is retained. Only the ledger's
// row count/hash is projected to exclude the TWO declared fixture IDs. Every
// old event, every other table, sequence, function, trigger, ACL and role stays
// in the comparison. The reader200 excluded by its own baseline is added back
// as a separate pg_proc metadata fingerprint.
function legacyProjectionSql(schema,ids){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(ids.length,2);assert.equal(new Set(ids).size,2);for(const id of ids)assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 const wanted='ARRAY['+ids.map(quote).join(',')+']::uuid[]',ledger=schema+'.own_payroll_close_event';
 return `SELECT jsonb_build_object('snapshot',current_setting(${quote(legacySnapshotPrefix)})::jsonb,
 'ledgerTotal',(SELECT count(*) FROM ${ledger}),
 'seededCount',(SELECT count(*) FROM ${ledger} WHERE id=ANY(${wanted})),
 'projectedRows',(SELECT count(*) FROM ${ledger} WHERE NOT(id=ANY(${wanted}))),
 'projectedSha256',(SELECT encode(public.digest(coalesce(string_agg(h,'' ORDER BY h COLLATE "C"),''),'sha256'),'hex') FROM(SELECT encode(public.digest(to_jsonb(e)::text,'sha256'),'hex') h FROM ${ledger} e WHERE NOT(id=ANY(${wanted}))) original_events),
 'readerFingerprint',(SELECT encode(public.digest(to_jsonb(p)::text,'sha256'),'hex') FROM pg_proc p WHERE oid=to_regprocedure(${quote(schema+'.own_close_report_census_v1(jsonb,text,text)')})))`;
}

function captureLegacyProjection(h,installation,ids){
 const {qa}=h,n=source=>qa.normalized(source).replaceAll(installation.batch.ownPin.sha256,installation.relocatedHash);
 const observed=h.json([n(installation.batch.prerequisiteCheck),n(installation.batch.ownCheck),n(installation.batch.before),legacyProjectionSql(qa.schema,ids)],{readOnly:true});
 assert.ok(observed&&Array.isArray(observed.snapshot?.tables));assert.match(observed.readerFingerprint,/^[a-f0-9]{64}$/);assert.match(observed.projectedSha256,/^[a-f0-9]{64}$/);
 for(const key of['ledgerTotal','seededCount','projectedRows'])assert.ok(Number.isSafeInteger(observed[key])&&observed[key]>=0);
 const snapshot=structuredClone(observed.snapshot),tables=snapshot.tables.filter(value=>value.schema===qa.schema&&value.name==='own_payroll_close_event');assert.equal(tables.length,1);
 assert.equal(tables[0].rows,observed.ledgerTotal);
 tables[0].rows=observed.projectedRows;tables[0].rowsSha256=observed.projectedSha256;
 return{preserved:{snapshot,readerFingerprint:observed.readerFingerprint},ledgerTotal:observed.ledgerTotal,seededCount:observed.seededCount};
}

function legacySeedStatements(h,fixtures){
 const {qa}=h;assert.ok(Number.isSafeInteger(qa.checker.actorSessionVersion)&&qa.checker.actorSessionVersion>0);assert.match(qa.checker.actorSessionId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.match(qa.checker.releaseSha,/^[a-f0-9]{40}$/);
 const wanted=j(fixtures),ids='ARRAY['+fixtures.map(value=>quote(value.id)).join(',')+']::uuid[]',keys='ARRAY['+fixtures.map(value=>quote(value.key)).join(',')+']::uuid[]';
 const seed=`DO $legacy_format_seed$ DECLARE ctx jsonb;fixture jsonb;body_value jsonb;snapshot_value jsonb;receipt_value jsonb;at_time timestamptz;id_value uuid;key_value uuid;body_hash text;snapshot_hash text;BEGIN
 ctx:=public.own_close_context_v1(${j(qa.checker)},true,true);
 IF ctx->>'tenantId' IS DISTINCT FROM ${quote(qa.checker.tenantId)} OR ctx->>'sourceBindingId' IS DISTINCT FROM ${quote(qa.ids.binding)} OR ctx->>'membershipId' IS DISTINCT FROM ${quote(qa.checker.membershipId)} OR ctx->>'actorEmail' IS DISTINCT FROM ${quote(qa.checker.actorEmail)} OR nullif(ctx->>'actorPersonId','') IS NULL THEN RAISE EXCEPTION 'CENSUS190_LEGACY_CONTEXT_CHANGED';END IF;
 IF jsonb_array_length(${wanted})<>2 OR EXISTS(SELECT 1 FROM public.own_payroll_close_event WHERE id=ANY(${ids}) OR group_id=ANY(${ids}) OR request_key=ANY(${keys})) THEN RAISE EXCEPTION 'CENSUS190_LEGACY_FIXTURE_ALREADY_EXISTS';END IF;
 FOR fixture IN SELECT value FROM jsonb_array_elements(${wanted}) LOOP
  id_value:=(fixture->>'id')::uuid;key_value:=(fixture->>'key')::uuid;body_value:=fixture->'body';snapshot_value:=fixture->'snapshot';at_time:=clock_timestamp();
  body_hash:=public.own_run_hash_v1(body_value);snapshot_hash:=public.own_run_hash_v1(snapshot_value);
  IF body_hash IS DISTINCT FROM fixture->>'bodySha256' OR snapshot_hash IS DISTINCT FROM fixture->>'snapshotSha256' THEN RAISE EXCEPTION 'CENSUS190_LEGACY_FIXTURE_HASH_CHANGED';END IF;
  receipt_value:=jsonb_build_object('version','own-close-receipt.v1','id',id_value,'key',key_value,'body',body_value,'bodySha256',body_hash,'groupId',id_value,'snapshot',snapshot_value,'snapshotSha256',snapshot_hash,'recordedAt',at_time,'replayed',false);
  INSERT INTO public.own_payroll_close_event(id,tenant_id,source_binding_id,group_id,command,period,liquidation_type,actor_membership_id,actor_person_id,actor_email,actor_label,actor_session_id,actor_session_version,release_sha,request_key,body,body_sha256,snapshot,snapshot_sha256,receipt,recorded_at)
  VALUES(id_value,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,id_value,'close',body_value->>'period',body_value->>'liquidationType',(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',coalesce(nullif(ctx->>'actorLabel',''),'Autoridad municipal'),${quote(qa.checker.actorSessionId)}::uuid,${Number(qa.checker.actorSessionVersion)},${quote(qa.checker.releaseSha)},key_value,body_value,body_hash,snapshot_value,snapshot_hash,receipt_value,at_time);
 END LOOP;
 END $legacy_format_seed$`;
 const readback=`SELECT coalesce(jsonb_agg(receipt ORDER BY period),'[]'::jsonb) FROM public.own_payroll_close_event WHERE id=ANY(${ids})`;
 // The source125 writer and source200 reader both require UTC representation.
 // The seed stores the canonical JSONB timestamp, never a fixture '.000Z'.
 return["SET LOCAL TIME ZONE 'UTC'",qa.normalized(seed),qa.normalized(readback)];
}

async function runOwnReportCensus190LegacyReaders(h,{installation,currentPeriod,currentCensus,checkDurability}){
 assert.equal(h.qa.operationalPairBaseline,'published107');assert.equal(typeof checkDurability,'function');
 const fixtures=await prepareOwnReportCensusLegacyFixtures(currentPeriod),ids=fixtures.map(value=>value.id),before=captureLegacyProjection(h,installation,ids);
 assert.equal(before.seededCount,0);h.setActor(h.qa.checker);
 const priorCurrent=await h.api('close',{query:{resource:'report-census',period:currentPeriod,liquidationType:'monthly'}});assert.deepEqual(priorCurrent,currentCensus);
 const saved=h.json(legacySeedStatements(h,fixtures),{command:true});assert.equal(saved.length,2);
 for(const[index,receipt]of saved.entries()){
  await verifiedOwnCloseReceipt(receipt);assert.equal(receipt.id,fixtures[index].id);assert.equal(receipt.key,fixtures[index].key);assert.equal(receipt.replayed,false);
  assert.deepEqual(receipt.body,fixtures[index].body);assert.deepEqual(receipt.snapshot,fixtures[index].snapshot);assert.equal(receipt.bodySha256,fixtures[index].bodySha256);assert.equal(receipt.snapshotSha256,fixtures[index].snapshotSha256);
 }
 const afterSeed=captureLegacyProjection(h,installation,ids);assert.equal(afterSeed.seededCount,2);assert.equal(afterSeed.ledgerTotal,before.ledgerTotal+2);assert.deepEqual(afterSeed.preserved,before.preserved);
 const baseline=h.fixtureSnapshot(),censuses=[],groups=[];
 for(const[index,receipt]of saved.entries()){
  const census=await h.api('close',{query:{resource:'report-census',period:receipt.snapshot.period,liquidationType:'monthly'}});await verifiedOwnReportCensus(census);
  assert.equal(census.complete,true);assert.equal(census.eventCount,1);assert.equal(census.groups.length,1);assert.equal(census.groups[0].state,'closed');assert.equal(census.groups[0].id,receipt.groupId);assert.equal(census.groups[0].snapshotSha256,receipt.snapshotSha256);assert.equal(census.groups[0].employeeCount,2);assert.equal(census.groups[0].populationCount,2);assert.equal(census.groups[0].populationComplete,true);
  const group=await h.api('close',{query:{resource:'group',id:receipt.groupId}});await verifiedOwnCloseReceipt(group);assert.equal(group.snapshot.version,legacyVersionNames[index]);assert.deepEqual(group,{...receipt,replayed:true});
  censuses.push(census);groups.push(group);
 }
 for(const census of censuses){const reread=await h.api('close',{query:{resource:'report-census',period:census.period,liquidationType:'monthly'}});await verifiedOwnReportCensus(reread);assert.deepEqual(reread,census);}
 const bundle=await verifiedOwnReportBundle({from:'2026-08',to:'2026-09',types:['monthly']},censuses,groups),document=ownReportDocument(bundle);assert.equal(bundle.employees.length,4);assert.equal(document.rows.length,4);
 const afterCurrent=await h.api('close',{query:{resource:'report-census',period:currentPeriod,liquidationType:'monthly'}});assert.deepEqual(afterCurrent,priorCurrent);assert.deepEqual(h.fixtureSnapshot(),baseline);
 const installed=h.json(installation.statements),durable=h.json(installation.verification,{readOnly:true});assert.equal(installed.mode,'verify');assert.equal(installed.eventRows,afterSeed.ledgerTotal);checkDurability({installed,durable,batch:installation.batch});assert.deepEqual(h.fixtureSnapshot(),baseline);
 const after=captureLegacyProjection(h,installation,ids);assert.equal(after.seededCount,2);assert.equal(after.ledgerTotal,before.ledgerTotal+2);assert.deepEqual(after.preserved,before.preserved);
 h.check('M8 explicit legacy-format seed adds exactly2 ledger events; real census/group and complete bundle read v1/v2 while every old row and all metadata stay unchanged');
 return{historicalFormatFixture:true,currentEngineProduced:false,seedRows:saved.length,newIdentities:0,newIamAssignments:0,newFunctions:0,formats:groups.map(value=>value.snapshot.version),periods:censuses.map(value=>value.period),groupsRead:groups.length,participationsRead:bundle.employees.length,completeSecondRead:true,priorRowsPreserved:true,metadataPreserved:true,currentCellUnchanged:true,durabilityVerified:true};
}
