import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {OWNER_PROGRAM_QA_ENTRIES,ownerProgramQaOptions,ownerProgramQaAuthorityCases,ownerProgramQaIndependentObservation,ownerProgramQaAuthPayload,assertOwnerProgramQaRecovery,ownerProgramQaFinish,verifyMunicipalOwnerProgram} from '../scripts/verify-municipal-owner-program.mjs';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {ownerAuthorityQaSourceClosure,assertOwnerAuthorityQaSourceBookend} from '../scripts/verify-municipal-owner-adoption-authority.mjs';
import {ownerDecisionQaTransaction} from '../scripts/verify-municipal-owner-adoption-decision.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
import {ownRunWorkspaceAccess} from '../assets/own-payroll-run-workspace-model.js';
import {verifyOwnerProgramQaPermissionRefresh} from '../scripts/lib/municipal-owner-program-browser.mjs';
import {programOwnerQaAuthority,programOwnerQaPreview,programOwnerQaId} from './fixtures/municipal-owner-program-synthetic.js';

const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8'),schema='mc_qa_fixed_092_'+'d'.repeat(32),sourceCommit='a'.repeat(40),qa=buildOwnerProgramQa({major:17,sourceCommit,read,schema});

test('runner accepts only the two owned majors, explicit source/output and canonical transport; no destination override exists',async()=>{
 const good={major:17,output:'verification/owner-program190-runner-unit-only',sourceCommit};assert.deepEqual(ownerProgramQaOptions(good),{...good,transport:'local'});
 assert.equal(ownerProgramQaOptions({...good,major:18,transport:'ci'}).transport,'ci');
 for(const operationalPairBaseline of['pre107','published107'])assert.equal(ownerProgramQaOptions({...good,operationalPairBaseline}).operationalPairBaseline,operationalPairBaseline);
 for(const operationalPairBaseline of['auto','PRE107','published107 ',null])assert.throws(()=>ownerProgramQaOptions({...good,operationalPairBaseline}),/OPERATIONAL_PAIR_BASELINE_REQUIRED/);
 for(const changed of[{major:16},{major:'17;SELECT1'},{output:'../outside'},{output:'C:/external'},{sourceCommit:'master'},{transport:'production'},{url:'postgres://synthetic.invalid'},{allowDrift:true},{skipBrowser:true}])assert.throws(()=>ownerProgramQaOptions({...good,...changed}));
 const output=new URL(good.output,root);assert.equal(fs.existsSync(output),false);await assert.rejects(verifyMunicipalOwnerProgram({...good,skipBrowser:true}),/OPTION_UNKNOWN/);assert.equal(fs.existsSync(output),false,'invalid options must fail before any directory/process/database operation');
});

test('all canonical authority denials are selected rather than silently skipped by a changed label',()=>{
 const cases=ownerProgramQaAuthorityCases(qa);assert.equal(cases.length,12);assert.equal(new Set(cases.map(c=>c[0])).size,12);
 for(const name of['sessionPasswordOnly','identityVersionChanged','foreignTenantSameSession','foreignMembershipSameSession','tenantReadDenied','tenantProposalDenied','clientSupplied_policy'])assert.ok(cases.some(c=>c[0]===name),name);
 for(const c of cases){assert.equal(typeof c[2],'string');assert.ok(c[1]||c[3],'a negative must contain a real SQL mutation or distinct supplied actor');}
});

test('the normal independent decision is made as runtime and privately observed only after RESET ROLE inside the same rollback transaction',()=>{
 const command=`SELECT ${schema}.own_program_command_v1('{}'::jsonb,'{}'::jsonb,'10000000-0000-4000-8000-000000000090'::uuid)`,statements=ownerProgramQaIndependentObservation(schema,command),sql=ownerDecisionQaTransaction({schema,pins:'IF false THEN RAISE EXCEPTION \'fixture\';END IF;',statements,command:true,end:'ROLLBACK'});
 const parsed=splitPostgresStatements(sql);assert.equal(parsed[0],'BEGIN ISOLATION LEVEL READ COMMITTED');assert.equal(parsed.at(-1),'ROLLBACK');
 assert.equal(statements[0],'SET LOCAL ROLE municontrol_actions_runtime_app');assert.equal(statements[2],'RESET ROLE');assert.ok(statements[1].includes(command.slice(7)));assert.ok(statements[3].includes(schema+'.municipal_owner_program_provenance'));assert.ok(!sql.includes('GRANT'));
 for(const bad of[command+';SELECT 1',command.replace(schema,'public'),command.replace('own_program_command_v1','municipal_owner_program_command_v1')])assert.throws(()=>ownerProgramQaIndependentObservation(schema,bad));assert.throws(()=>ownerProgramQaIndependentObservation('public',command));
});

test('the actual panel auth contract uses current SQL-backed identity, role, expiry and capabilities',()=>{
 const access={principal:{user:{email:'programme-fixture@example.invalid',identityVersion:3},session:{expiresAt:'2099-01-01T00:00:00Z'},tenant:{id:qa.actor.tenantId,effectiveCapabilities:['workforce.employee.read','payroll.parameter.read']}}},payload=ownerProgramQaAuthPayload(access,'fictitious-existing-role');
 const verified=ownRunWorkspaceAccess(payload);assert.equal(verified.caps.size,2);assert.equal(payload.user.id,access.principal.user.email,'the existing account primary key is an email, never an invented UUID');assert.equal(payload.sessionVersion,2);assert.equal(payload.access.context,'tenant');assert.equal(payload.expiresAt,access.principal.session.expiresAt);assert.equal(payload.user.identityVersion,3);
 assert.throws(()=>ownerProgramQaAuthPayload(access,''));assert.throws(()=>ownRunWorkspaceAccess({...payload,sessionVersion:undefined}));assert.throws(()=>ownRunWorkspaceAccess({...payload,expiresAt:'2000-01-01T00:00:00Z'}));
});

test('the revoked view requires a new complete bootstrap and current server authority before owner action, never a same-fragment revisit',async()=>{
 const preview=await programOwnerQaPreview(),authority=programOwnerQaAuthority(),bootstrap={version:'own-payroll-program.v1',scopeVersion:authority.scopeVersion,salaryCatalog:{version:preview.proposal.salaryVersion,revision:1,items:preview.proposal.salaryItems},program:{version:preview.proposal.baseVersion,revision:1,definition:preview.proposal.baseDefinition,proposalId:programOwnerQaId(70),approvalId:programOwnerQaId(71),salaryVersion:preview.proposal.salaryVersion},proposals:[],permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false};
 const row=(resource,data)=>({method:'GET',path:resource==='bootstrap'?'/api/internal-own-payroll-program':'/api/internal-municipal-owner-program',resource,status:200,value:{ok:true,data}}),reads=[row('bootstrap',bootstrap),row('authority',authority),row('preview',preview),row('authority',authority)],before={offset:reads.length,bootstrapCount:1},fresh=[...structuredClone(reads),...structuredClone(reads)];
 await assert.rejects(verifyOwnerProgramQaPermissionRefresh(reads,before),/FRESH_BOOTSTRAP_REQUIRED/);assert.deepEqual(await verifyOwnerProgramQaPermissionRefresh(fresh,before),{passed:true,visibleRefreshAction:true,bootstrapBefore:1,bootstrapAfter:2,completeBootstrap:true,freshAuthorityReads:2,freshPreviewReads:1,implicitCommands:0});
 for(const mutate of[v=>v[4].status=403,v=>delete v[4].value.data.salaryCatalog.items,v=>v[5].status=403,v=>v[6].value.data.proposal.definition.rules.pop(),v=>v[7].value.data.authority.actor.identityVersion++,v=>v[6].method='POST',v=>v.splice(5,3)]){const changed=structuredClone(fresh);mutate(changed);await assert.rejects(verifyOwnerProgramQaPermissionRefresh(changed,before));}
});

test('four-phase and reversal SQL retain RR technical checks and READ ONLY durable audits without double-relocating predecessors',()=>{
 assert.deepEqual(qa.predecessorInstallation,[...qa.foundation.predecessorInstallation,qa.foundation.nativeSeed,...qa.foundation.local.installation]);
 for(const name of['rehearsal','installation','repetition','rollback']){
  const sql=ownerDecisionQaTransaction({schema,pins:'IF false THEN RAISE EXCEPTION \'fixture\';END IF;',statements:qa.local[name],end:name==='rehearsal'?'ROLLBACK':'COMMIT'});assert.equal(splitPostgresStatements(sql)[0],'BEGIN ISOLATION LEVEL REPEATABLE READ');
 }
 for(const name of['verification','rollbackVerification']){
  const sql=ownerDecisionQaTransaction({schema,pins:'IF false THEN RAISE EXCEPTION \'fixture\';END IF;',statements:qa.local[name],readOnly:true});assert.equal(splitPostgresStatements(sql)[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.ok(sql.includes('transaction_read_only'));
 }
 assert.ok(qa.local.rollback.join('\n').includes('OWNER_PROGRAM_ROLLBACK_HAS_HISTORY'));assert.ok(qa.local.installation.join('\n').includes('transactionDataPreserved'));
});

test('source closure includes runner, its regression, actual owner/ordinary handlers, real panel, provenance SQL, workflow and fixtures',()=>{
 assert.equal(new Set(OWNER_PROGRAM_QA_ENTRIES).size,OWNER_PROGRAM_QA_ENTRIES.length);const additional=[...Object.keys(qa.sourceHashes),'assets/own-payroll-program-panel.css','.vercelignore','scripts/build-friendly.mjs','package.json','package-lock.json'],closure=ownerAuthorityQaSourceClosure({entries:OWNER_PROGRAM_QA_ENTRIES,additional});
 for(const p of['scripts/verify-municipal-owner-program.mjs','tests/municipal-owner-program-runner.test.js','.github/workflows/municipal-owner-program.yml','api/internal-municipal-owner-program.js','api/internal-own-payroll-program.js','assets/own-payroll-program-panel.js','scripts/migrations/190-municipal-owner-program-decision.sql','tests/fixtures/municipal-owner-program-synthetic.js'])assert.ok(closure.files[p],p);
 assert.equal(assertOwnerAuthorityQaSourceBookend(closure).passed,true);const target='api/internal-municipal-owner-program.js';assert.throws(()=>assertOwnerAuthorityQaSourceBookend(closure,{readBytes:p=>p===target?Buffer.from(read(p)+'\n'):fs.readFileSync(new URL(p,root))}),/SOURCE_CHANGED/);
});

test('a business failure cannot be hidden by cleanup, conservation or source failures; every error is preserved in its original order',()=>{
 const original=Error('original SQL or HTTP failure'),cleanup=Error('cleanup guard failure'),conservation=Error('global snapshot changed'),source=Error('source bytes changed');
 assert.throws(()=>ownerProgramQaFinish({failure:original,cleanupFailure:cleanup,outerFailure:conservation,sourceFailure:source}),e=>e instanceof AggregateError&&e.errors.length===4&&e.errors[0]===original&&e.errors[1]===cleanup&&e.errors[2]===conservation&&e.errors[3]===source);
 for(const field of['cleanupFailure','outerFailure','sourceFailure'])assert.throws(()=>ownerProgramQaFinish({report:{passed:true},[field]:original}),AggregateError);
});

test('PASS requires independently completed cleanup, zero clients, outer conservation and final source bookend',()=>{
 const report={passed:true,priorDatabasePreserved:true,syntheticSchemaRemoved:true,postflightOtherClients:0,sourceAfter:{passed:true}};assert.equal(ownerProgramQaFinish({report}),report);
 for(const changed of[{passed:false},{priorDatabasePreserved:false},{syntheticSchemaRemoved:false},{postflightOtherClients:1},{sourceAfter:null}])assert.throws(()=>ownerProgramQaFinish({report:{...report,...changed}}));assert.throws(()=>ownerProgramQaFinish({}));
});

test('recovery after source evolution must preserve every original receipt/preview/command field while reauthorizing the same real actor under new MFA',()=>{
 const scope={tenantId:'tenant',membershipId:'member',bindingId:'binding',companyId:101},actor={personId:'person',email:'fictional@example.invalid',sessionId:'old-session'},saved={receipt:{replayed:false,eventId:'original-event',requestKey:'original-key',requestSha256:'original-body-hash',decisionMode:'owner',independence:false},command:{reason:'Original decision',salaryVersion:'old-salary',baseVersion:'old-programme'},preview:{context:{scope,authority:{actor}},proposal:{salaryItems:[{value:'100.10'}],definition:{complete:true}}}},recovered={...structuredClone(saved),authorization:{scope:structuredClone(scope),authority:{actor:{...actor,sessionId:'new-session',identityVersion:4}}},receipt:{...saved.receipt,replayed:true}};
 assert.equal(assertOwnerProgramQaRecovery(saved,recovered,'new-session').passed,true);
 for(const change of[v=>v.receipt.requestKey='new-key',v=>v.receipt.requestSha256='new-hash',v=>v.receipt.independence=true,v=>v.receipt.eventId='other-event',v=>v.command.salaryVersion='current-salary',v=>v.preview.proposal.definition.complete=false,v=>v.authorization.scope.bindingId='other-binding',v=>v.authorization.authority.actor.email='other@example.invalid',v=>v.authorization.authority.actor.sessionId='old-session']){const altered=structuredClone(recovered);change(altered);assert.throws(()=>assertOwnerProgramQaRecovery(saved,altered,'new-session'));}
});
