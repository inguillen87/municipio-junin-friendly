import {executeMonthlyNativeTailStage} from './monthly-native-tail-execution-qa.mjs';
// Private QA over actual bank-control validators; transport/install orchestration
// below is restricted to the owned synthetic loopback circuit. No extra actor grants.
import assert from 'node:assert/strict';
import { prepareBankControl, verifiedBankControl, bankOutputCents } from '../../assets/own-bank-output-model.js';
import { bankAccountsBootstrap } from '../../assets/own-bank-accounts-model.js';
import { OWN_CLOSE_TOTAL_KEYS } from '../../assets/own-payroll-close-model.js';

// Explicit continuation over the already installed financial fixtures. Old modes
// retain their original source cardinality; this scope never filters a close.
export function nativeBankContinuationScope(journey, sources=null) {
 if(!Object.hasOwn(journey,'nativeFinancialContinuation'))return null;
 const scope=journey.nativeFinancialContinuation;assert.equal(scope?.version,'native-financial-continuation350.v1');
 assert.equal(scope.targetPopulation,3);assert.ok(Array.isArray(scope.sourcePins));assert.equal(scope.sourcePins.length,3);
 assert.equal(new Set(scope.sourcePins.map(s=>s.id)).size,3);assert.equal(scope.targetGroupId,journey.closeGroupId);
 assert.deepEqual([...scope.sourcePins.map(s=>s.populationCount)].sort((a,b)=>a-b),[1,2,3]);
 for(const source of scope.sourcePins){assert.equal(source.period,'2026-10');assert.equal(source.type,'monthly');assert.equal(source.employeeCount,1);assert.match(source.snapshotSha256,/^[a-f0-9]{64}$/);assert.equal(source.selectedCount,source.id===journey.closeGroupId?1:0);}
 assert.equal(scope.sourcePins.filter(s=>s.id===journey.closeGroupId).length,1);assert.equal(scope.sourcePins.find(s=>s.id===journey.closeGroupId).populationCount,scope.targetPopulation);
 if(sources){const sort=rows=>[...rows].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  assert.deepEqual(sort(sources.batch.snapshot.sources),sort(scope.sourcePins),'QA_NATIVE_BANK_CONTINUATION_SOURCE_SET_CHANGED');
  assert.equal(sources.closes.length,3);assert.deepEqual(new Set(sources.closes.map(c=>c.groupId)),new Set(scope.sourcePins.map(s=>s.id)));
  for(const pin of scope.sourcePins){const close=sources.closes.filter(c=>c.groupId===pin.id);assert.equal(close.length,1);assert.equal(close[0].snapshotSha256,pin.snapshotSha256);assert.equal(close[0].snapshot.employeeCount,pin.employeeCount);assert.equal(close[0].snapshot.populationCount,pin.populationCount);}
 }
 return scope;
}
export async function verifiedNativeBankTail({ journey, batch, closes, accounts, profile }) {
  assert.ok(journey && typeof journey === 'object', 'QA_NATIVE_BANK_JOURNEY_REQUIRED');
  for (const key of ['contractId', 'registrationId', 'legajo', 'secondRunId', 'closeGroupId', 'receiptBatchId', 'receiptSnapshotSha256']) {
    assert.equal(typeof journey[key], 'string', 'QA_NATIVE_BANK_JOURNEY_FIELD: ' + key);
    assert.ok(journey[key].length > 0, 'QA_NATIVE_BANK_JOURNEY_FIELD: ' + key);
  }
  assert.equal(journey.liquidationVersion, 2, 'QA_NATIVE_BANK_SECOND_VERSION_REQUIRED');
  nativeBankContinuationScope(journey,{batch,closes});
  const review = verifiedBankControl(await prepareBankControl(batch, accounts, profile, closes));
  assert.equal(batch.id, journey.receiptBatchId, 'QA_NATIVE_BANK_RECEIPT_CHANGED');
  assert.equal(batch.snapshotSha256, journey.receiptSnapshotSha256, 'QA_NATIVE_BANK_RECEIPT_SHA_CHANGED');
  assert.equal(batch.state, 'approved', 'QA_NATIVE_BANK_APPROVED_RECEIPT_REQUIRED');
  assert.equal(batch.review?.decision, 'approved', 'QA_NATIVE_BANK_APPROVED_RECEIPT_REQUIRED');
  assert.equal(batch.snapshot.recordCount, 1, 'QA_NATIVE_BANK_ONE_RECEIPT_REQUIRED');
  assert.equal(batch.snapshot.records.length, 1, 'QA_NATIVE_BANK_ONE_RECEIPT_REQUIRED');
  // The real model verifies every source, including closes with selectedCount0.
  assert.equal(closes.length, batch.snapshot.sources.length, 'QA_NATIVE_BANK_ALL_CLOSES_REQUIRED');
  assert.deepEqual(new Set(closes.map(value => value.groupId)), new Set(batch.snapshot.sources.map(value => value.id)), 'QA_NATIVE_BANK_CLOSE_SET_CHANGED');
  const targetCloses = closes.filter(value => value.groupId === journey.closeGroupId);
  const targetSources = batch.snapshot.sources.filter(value => value.id === journey.closeGroupId);
  assert.equal(targetCloses.length, 1, 'QA_NATIVE_BANK_TARGET_CLOSE_REQUIRED');
  assert.equal(targetSources.length, 1, 'QA_NATIVE_BANK_TARGET_SOURCE_REQUIRED');
  const record = batch.snapshot.records[0], close = targetCloses[0], source = targetSources[0];
  for (const value of batch.snapshot.sources) {
    assert.equal(value.selectedCount, value.id === journey.closeGroupId ? 1 : 0, 'QA_NATIVE_BANK_SOURCE_SELECTION_CHANGED');
  }
  assert.equal(close.groupId, journey.closeGroupId, 'QA_NATIVE_BANK_CLOSE_CHANGED');
  assert.equal(source.id, journey.closeGroupId, 'QA_NATIVE_BANK_CLOSE_CHANGED');
  assert.equal(close.snapshot.employeeCount, 1, 'QA_NATIVE_BANK_ONE_CLOSED_EMPLOYEE_REQUIRED');
  assert.equal(close.snapshot.employees.length, 1, 'QA_NATIVE_BANK_ONE_CLOSED_EMPLOYEE_REQUIRED');
  const employee = close.snapshot.employees[0];
  for (const [key, expected] of [['contractId', journey.contractId], ['employeeNumber', journey.legajo], ['runId', journey.secondRunId], ['liquidationVersion', journey.liquidationVersion]]) {
    assert.equal(record[key], expected, 'QA_NATIVE_BANK_RECORD_CHANGED: ' + key);
    assert.equal(employee[key], expected, 'QA_NATIVE_BANK_CLOSED_EMPLOYEE_CHANGED: ' + key);
  }
  assert.equal(record.registrationId, journey.registrationId, 'QA_NATIVE_BANK_REGISTRATION_CHANGED');
  assert.equal(record.sourceGroupId, journey.closeGroupId, 'QA_NATIVE_BANK_RECORD_CLOSE_CHANGED');
  for (const key of OWN_CLOSE_TOTAL_KEYS) {
    assert.equal(typeof record.totals[key], 'string', 'QA_NATIVE_BANK_TOTAL_LITERAL_REQUIRED: ' + key);
    assert.equal(record.totals[key], employee.totals[key], 'QA_NATIVE_BANK_EMPLOYEE_TOTAL_CHANGED: ' + key);
    assert.equal(record.totals[key], close.snapshot.totals[key], 'QA_NATIVE_BANK_CLOSE_TOTAL_CHANGED: ' + key);
  }
  assert.equal(review.recordCount, 1, 'QA_NATIVE_BANK_ONE_CONTROL_ROW_REQUIRED');
  assert.equal(review.rows.length, 1, 'QA_NATIVE_BANK_ONE_CONTROL_ROW_REQUIRED');
  assert.equal(review.receiptId, journey.receiptBatchId, 'QA_NATIVE_BANK_CONTROL_RECEIPT_CHANGED');
  assert.equal(review.receiptSha256, journey.receiptSnapshotSha256, 'QA_NATIVE_BANK_CONTROL_SHA_CHANGED');
  const row = review.rows[0];
  for (const key of ['contractId', 'registrationId', 'employeeNumber', 'runId', 'liquidationVersion', 'sourceGroupId']) {
    assert.equal(row[key], record[key], 'QA_NATIVE_BANK_CONTROL_ROW_CHANGED: ' + key);
  }
  assert.equal(row.closeSha256, close.snapshotSha256, 'QA_NATIVE_BANK_CONTROL_CLOSE_SHA_CHANGED');
  assert.equal(row.net, record.totals.net, 'QA_NATIVE_BANK_CONTROL_NET_CHANGED');
  const cents = bankOutputCents(record.totals.net);
  assert.equal(row.cents, cents === null ? null : cents.toString(), 'QA_NATIVE_BANK_CONTROL_CENTS_CHANGED');
  if (cents !== null) assert.equal(BigInt(row.cents), cents, 'QA_NATIVE_BANK_CONTROL_CENTS_CHANGED');
  return review;
}

// Expose only authority already reported by the actual bootstrap for this actor.
export async function withNativeBankActor({ actor, bootstrap, capability, getCurrent, setCurrent }, operation) {
  assert.ok(['payroll.parameter.prepare', 'payroll.parameter.approve'].includes(capability), 'QA_NATIVE_BANK_CAPABILITY_INVALID');
  assert.equal(typeof getCurrent, 'function');
  assert.equal(typeof setCurrent, 'function');
  assert.equal(typeof operation, 'function');
  const boot = bankAccountsBootstrap(bootstrap), permission = capability === 'payroll.parameter.prepare' ? 'canPropose' : 'canReview';
  assert.equal(boot.permissions[permission], true, 'QA_NATIVE_BANK_EXISTING_AUTHORITY_REQUIRED');
  assert.ok(Array.isArray(actor?.principal?.tenant?.effectiveCapabilities), 'QA_NATIVE_BANK_ACTOR_REQUIRED');
  const prior = getCurrent(), selected = structuredClone(actor);
  selected.principal.tenant.effectiveCapabilities = [...new Set([...selected.principal.tenant.effectiveCapabilities, capability])];
  setCurrent(selected);
  try { return await operation(); } finally { setCurrent(prior); }
}

// The following adapter/orchestration is invoked only in the owned loopback QA.
// It never seeds another employee, changes a formula, or sends a bank payment.
import fs from 'node:fs';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {buildOwnBankAccountsInstallation,assertOwnBankAccountsDurability} from './own-bank-accounts-installation.mjs';
import {qaLiteral} from './own-payroll-durable-qa.mjs';
import {prepareBankAccounts,decideBankAccounts} from '../../assets/own-bank-accounts-workspace-model.js';
import {verifiedBankAccountsReceipt} from '../../assets/own-bank-accounts-model.js';
import {createBankControlCsv,createBankControlXlsx} from '../../assets/own-bank-output-export.js';
import {syntheticBankAccountsDefinition} from '../../tests/fixtures/own-bank-accounts-synthetic.js';
const bankHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bankRoot=path.resolve(import.meta.dirname,'../..');
export function nativeBankFailureNative(error){
 const cause=error?.cause,code=cause?.code;
 return {stdout:typeof cause?.stdout==='string'?cause.stdout:null,stderr:typeof cause?.stderr==='string'?cause.stderr:null,code:Number.isSafeInteger(code)||typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(code)?code:null,status:Number.isSafeInteger(cause?.status)?cause.status:null};
}
export function createNativeBankQaSql(db,qa){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const statements=new Map([['SELECT public.own_bank_accounts_bootstrap_v1($1::jsonb) AS result',1],['SELECT public.own_bank_accounts_detail_v1($1::jsonb,$2::uuid) AS result',2],['SELECT public.own_bank_accounts_attempt_v1($1::jsonb,$2::uuid) AS result',2],['SELECT public.own_bank_accounts_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',3]]);
 return {...db,query:async(query,values)=>{
  if(!/^SELECT public\.own_bank_accounts_/.test(query))return db.query(query,values);
  assert.ok(statements.has(query),'QA_NATIVE_BANK_SQL_FACADE_CHANGED');assert.ok(Array.isArray(values)&&values.length===statements.get(query)&&values.every(v=>typeof v==='string'),'QA_NATIVE_BANK_SQL_ARGUMENTS_CHANGED');
  const sql=query.replaceAll('public.own_bank_accounts_',qa.schema+'.own_bank_accounts_').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return qaLiteral(values[Number(n)-1]);});
  return [{result:await db.run(sql,true)}];
 }};
}
export async function installNativeBankQa({db,qa,sourceCommit,output}){
 if(qa.monthlyNativeTailInstallation){const proof=await executeMonthlyNativeTailStage({db,qa,sourceCommit,output,migration:149,base:'native-bank-installation'});return{migration:'149-own-bank-accounts.sql',migrationSha256:proof.sourceHashes['scripts/migrations/149-own-bank-accounts.sql'],...proof};}
 const batch=buildOwnBankAccountsInstallation({read:p=>fs.readFileSync(path.join(bankRoot,p),'utf8'),sourceCommit}),installation=batch.installation.map(qa.normalized),verification=batch.durableVerification.map(qa.normalized);
 fs.writeFileSync(path.join(output,'native-bank-installation.sql'),installation.join(';\n')+';\n',{flag:'wx'});
 fs.writeFileSync(path.join(output,'native-bank-installation-source-pins.json'),JSON.stringify({sourceCommit,sourceHashes:batch.sourceHashes,prerequisitePins:batch.prerequisitePins,ownPins:batch.ownPins},null,2)+'\n',{flag:'wx'});
 const installed=await db.run(installation.join(';\n')),durable=await db.run(verification.join(';\n'));assertOwnBankAccountsDurability({installed,durable,sourceCommit});
 fs.writeFileSync(path.join(output,'native-bank-installation-proof.json'),JSON.stringify({sourceCommit,sourceHashes:batch.sourceHashes,prerequisitePins:batch.prerequisitePins,ownPins:batch.ownPins,installed,durable},null,2)+'\n',{flag:'wx'});
 return {migration:'149-own-bank-accounts.sql',migrationSha256:batch.sourceHashes['scripts/migrations/149-own-bank-accounts.sql'],installed,durable};
}
export function nativeBankFixtureCounts(journey){
 const baseline=journey.monthlyFixed?.baseline;if(!baseline)return{targetPopulation:30,priorEmployeeCount:29,priorPopulation:29};
 assert.equal(baseline.version,'monthly-native-complete-b0.v1');assert.equal(baseline.complete,true);assert.ok(Array.isArray(baseline.closeRows));assert.equal(new Set(baseline.closeRows.map(row=>row.contractId)).size,baseline.closeRows.length);assert.ok(baseline.closeRows.length>0);assert.equal(baseline.originalGroup.employeeCount,baseline.eligibleContractIds.length);assert.ok(baseline.eligibleContractIds.every(id=>baseline.closeRows.some(row=>row.contractId===id)));
 return{targetPopulation:baseline.closeRows.length+1,priorEmployeeCount:baseline.originalGroup.employeeCount,priorPopulation:baseline.originalGroup.populationCount};
}
export async function verifyNativeEmployeeBankTail({db,qa,sourceCommit,maker,checker,getCurrent,setCurrent,journey,transport,output,ok,preserveOriginal}){
 for(const name of ['nativeBankHttp','nativeBankSources','nativeBankControl'])assert.equal(typeof transport?.[name],'function','QA_NATIVE_BANK_HTTP_REQUIRED');
 assert.equal(typeof preserveOriginal,'function');const priorActor=getCurrent(),commands=[];let phase='installation';
 const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'}),asBase=async(actor,operation)=>{const prior=getCurrent();setCurrent(actor);try{return await operation();}finally{setCurrent(prior);}};
 const request=input=>transport.nativeBankHttp(input),bootstrap=actor=>asBase(actor,async()=>{const packet=await request({query:{resource:'bootstrap'}});assert.equal(packet.actualHttp,true);return bankAccountsBootstrap(packet.data);});
 try{
  const originalBefore=await preserveOriginal(),installation=await installNativeBankQa({db,qa,sourceCommit,output});assert.equal(installation.installed.eventRows,0);assert.equal(installation.durable.eventRows,0);
  phase='unapproved-account';const makerBoot=await bootstrap(maker);assert.equal(makerBoot.permissions.canPropose,true);assert.equal(makerBoot.configuration.revision,0);assert.equal(makerBoot.configuration.definition,null);
  setCurrent(maker);const first=await transport.nativeBankSources(journey);assert.equal(first.actualHttp,true);assert.equal(first.batch.id,journey.receiptBatchId);assert.equal(first.batch.snapshot.sources.length,2);assert.equal(first.closes.length,2);
  const targetSource=first.batch.snapshot.sources.find(source=>source.id===journey.closeGroupId),priorSources=first.batch.snapshot.sources.filter(source=>source.id!==journey.closeGroupId),targetClose=first.closes.find(close=>close.groupId===journey.closeGroupId);assert.ok(targetSource&&targetClose);assert.equal(priorSources.length,1);
  const counts=nativeBankFixtureCounts(journey);if(journey.monthlyFixed){assert.equal(priorSources[0].id,journey.monthlyFixed.baseline.originalGroup.id);assert.equal(priorSources[0].snapshotSha256,journey.monthlyFixed.baseline.originalGroup.snapshotSha256);}
  for(const [source,expected]of [[targetSource,{employeeCount:1,selectedCount:1,populationCount:counts.targetPopulation}],[priorSources[0],{employeeCount:counts.priorEmployeeCount,selectedCount:0,populationCount:counts.priorPopulation}]])for(const [field,value]of Object.entries(expected))assert.equal(source[field],value,'QA_NATIVE_BANK_COMPLETE_SOURCE_COUNTS: '+field);
  // Exactly the existing tested synthetic profile. A future period requires a
  // separately declared fixture change, never a current-date/default fallback.
  const profile={currency:'ARS',creditDate:'2026-10-09'};assert.equal(first.batch.snapshot.params.period,'2026-10','QA_NATIVE_BANK_DECLARED_PROFILE_PERIOD');
  const unapprovedReview=await prepareBankControl(first.batch,first.accounts,profile,first.closes);assert.deepEqual(unapprovedReview.issues,['ACCOUNTS_UNAPPROVED']);assert.throws(()=>verifiedBankControl(unapprovedReview));await assert.rejects(()=>verifiedNativeBankTail({journey,...first,profile}));
  phase='account-proposal';const template=syntheticBankAccountsDefinition().accounts[0],definition={accounts:[...(makerBoot.configuration.definition?.accounts??[]),{...template,id:randomUUID(),contractId:journey.contractId}]},body=prepareBankAccounts(makerBoot,definition,'Cuenta del mismo empleado nuevo exclusivamente sintética para QA'),key=randomUUID();
  const proposed=await withNativeBankActor({actor:maker,bootstrap:makerBoot,capability:'payroll.parameter.prepare',getCurrent,setCurrent},()=>request({body,key,expected:201,ackLost:true}));
  await verifiedBankAccountsReceipt(proposed.data,{key,body});assert.deepEqual(proposed.recovered,{...proposed.data,replayed:true});commands.push({command:'propose',key,requestSha256:proposed.data.requestSha256,browserPosts:proposed.browserPosts,recoveryGets:proposed.recoveryGets,ackLostAfterCommit:proposed.ackLostAfterCommit});
  const makerDetail=await asBase(maker,async()=>{const packet=await request({query:{resource:'detail',id:proposed.data.proposalId}});return packet.data;});assert.equal(makerDetail.proposal.canReview,false);
  const checkerBoot=await bootstrap(checker),detail=await asBase(checker,async()=>{const packet=await request({query:{resource:'detail',id:proposed.data.proposalId}});return packet.data;});assert.equal(checkerBoot.permissions.canReview,true);assert.equal(detail.proposal.canReview,true);
  const decision=decideBankAccounts(checkerBoot,detail,'approve','Revisión independiente de la cuenta nueva exclusivamente sintética QA');
  const denied=await withNativeBankActor({actor:maker,bootstrap:makerBoot,capability:'payroll.parameter.prepare',getCurrent,setCurrent},()=>request({body:{...decision,scopeVersion:makerBoot.scopeVersion},key:randomUUID(),expected:403}));assert.equal(denied.envelope.ok,false);
  phase='account-approval';const approvalKey=randomUUID(),approved=await withNativeBankActor({actor:checker,bootstrap:checkerBoot,capability:'payroll.parameter.approve',getCurrent,setCurrent},()=>request({body:decision,key:approvalKey,expected:201,ackLost:true}));
  await verifiedBankAccountsReceipt(approved.data,{key:approvalKey,body:decision});assert.deepEqual(approved.recovered,{...approved.data,replayed:true});commands.push({command:'approve',key:approvalKey,requestSha256:approved.data.requestSha256,browserPosts:approved.browserPosts,recoveryGets:approved.recoveryGets,ackLostAfterCommit:approved.ackLostAfterCommit});
  phase='bank-control';setCurrent(maker);const sources=await transport.nativeBankSources(journey),review=await verifiedNativeBankTail({journey,...sources,profile});assert.equal(sources.accounts.configuration.revision,1);assert.equal(sources.accounts.configuration.approvalId,approved.data.eventId);assert.deepEqual(sources.batch.snapshot,first.batch.snapshot);assert.deepEqual(sources.closes,first.closes);
  const expectedFiles=Object.fromEntries([['csv',createBankControlCsv(review)],['xlsx',createBankControlXlsx(review)]].map(([kind,file])=>[kind,{bytes:file.bytes.length,sha256:bankHash(file.bytes)}]));
  const closeIds=sources.batch.snapshot.sources.map(source=>source.id),selectedClose=sources.closes.find(close=>close.groupId===journey.closeGroupId);assert.ok(selectedClose);
  phase='bank-control-ui';const ui=await transport.nativeBankControl({period:sources.batch.snapshot.params.period,journey,profile,expectedFiles,closeIds});assert.equal(ui.bankControlUi,true);assert.equal(ui.actualHttp,true);assert.equal(ui.posts,0);assert.equal(ui.contractId,journey.contractId);assert.equal(ui.closeGroupId,journey.closeGroupId);assert.deepEqual(ui.closeIds,closeIds);assert.equal(ui.receiptBatchId,journey.receiptBatchId);assert.equal(ui.recordCount,1);
  const finalSources=await transport.nativeBankSources(journey),finalReview=await verifiedNativeBankTail({journey,...finalSources,profile});assert.equal(finalReview.fingerprint,review.fingerprint);assert.deepEqual(finalSources.batch.snapshot,sources.batch.snapshot);assert.deepEqual(finalSources.closes,sources.closes);assert.deepEqual(await preserveOriginal(),originalBefore);
  const bankLedger=await db.run("SELECT jsonb_build_object('events',count(*),'proposals',count(*) FILTER(WHERE command='propose'),'approvals',count(*) FILTER(WHERE command='approve'),'rejections',count(*) FILTER(WHERE command='reject')) FROM own_bank_account_event");assert.deepEqual(bankLedger,{events:2,proposals:1,approvals:1,rejections:0});
  ok(true,journey.monthlyFixed?'bank-only tail retains exact typed native B0, the same new UUID/version2/receipt, independent account commands/recovery and complete UI downloads':'bank-only tail uses the same newly created UUID, version2 close and approved emission, real independent account HTTP commands/recovery, complete control UI downloads and original29 unchanged');
  write('native-bank-tail-source-conservation.json',{before:first,after:finalSources,batchSnapshotUnchanged:true,allCloseSnapshotsUnchanged:true,...(journey.monthlyFixed?{originalBaselinePreserved:true,originalBaselineEmployeeCount:journey.monthlyFixed.baseline.eligibleContractIds.length}:{original29Preserved:true})});
  const proof={version:'native-employee-bank-tail-proof.v1',status:'assertions_completed_pending_outer_cleanup',outerResult:'result.json',contractId:journey.contractId,registrationId:journey.registrationId,runId:journey.secondRunId,liquidationVersion:2,closeGroupId:journey.closeGroupId,closeSnapshotSha256:selectedClose.snapshotSha256,receiptBatchId:journey.receiptBatchId,receiptSnapshotSha256:journey.receiptSnapshotSha256,receiptSources:sources.batch.snapshot.sources,sourceConservation:'native-bank-tail-source-conservation.json',sixTotals:sources.batch.snapshot.records[0].totals,recordCount:1,populationCount:selectedClose.snapshot.populationCount,populationComplete:selectedClose.snapshot.populationComplete,accountProposalId:proposed.data.proposalId,accountApprovalId:approved.data.eventId,accountConfigurationVersion:sources.accounts.configuration.version,accountConfigurationRevision:1,profile,commands,bankLedger,controlFingerprint:review.fingerprint,controlReady:review.ready,rowIssues:review.rows.map(r=>r.issues),totalCents:review.totalCents,expectedFiles,ui,installation,...(journey.monthlyFixed?{originalBaselinePreserved:true,originalBaselineEmployeeCount:journey.monthlyFixed.baseline.eligibleContractIds.length}:{original29Preserved:true}),additionalHire:false,authenticationFixture:true,accountCommandsUi:false,accountCommandsHttp:true,bankControlUi:true,bankControlHttp:true,bankSubmitted:false,paymentExecuted:false,municipalAcceptance:false};
  write('native-bank-tail-proof.json',proof);return proof;
 }catch(error){try{write('native-bank-tail-failure.json',{phase,message:error.message,status:'failed',native:nativeBankFailureNative(error),contractId:journey.contractId,closeGroupId:journey.closeGroupId,receiptBatchId:journey.receiptBatchId,commands,municipalAcceptance:false});}finally{throw error;}}finally{setCurrent(priorActor);}
}
