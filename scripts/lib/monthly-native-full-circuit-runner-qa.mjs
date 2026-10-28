// One enclosing canonical190/192/193/194/196 QA, one HTTP server and one
// guarded SQL transport. Source construction/import does not execute this path.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {verifyNovelty217AdministrativeCausality} from './novelty-administrative217-causal-qa.mjs';import {randomUUID,createHash} from 'node:crypto';
import {salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {ownProgramBootstrap,ownProgramCommand,ownProgramReceipt,ownProgramRuleKey} from '../../assets/own-payroll-program-model.js';
import {monthlyNativeHistoryProgramme,monthlyNativeHistoryPublished} from '../../tests/fixtures/monthly-native-programme-history-synthetic.js';
import {monthlyDayDeclarationReceipt} from '../../assets/own-monthly-day-declaration-model.js';
import {pinMonthlyNativeBaselineArchive,preserveMonthlyNativeBaselineArchive} from './monthly-native-baseline-archive-preservation-qa.mjs';
import {OWN_RECEIPT_PREPARE,OWN_RECEIPT_APPROVE} from '../../assets/own-payroll-receipt-model.js';
import {BANK_ACCOUNTS_READ,BANK_ACCOUNTS_CAPS} from '../../lib/internal-own-bank-accounts.js';
import {ACCOUNTING_READ,ACCOUNTING_CAPS} from '../../lib/internal-own-payroll-accounting.js';
import {IMPUTATION_READ,IMPUTATION_CAPS} from '../../assets/own-payroll-imputation-workspace-model.js';
import {JOURNAL_READ,JOURNAL_CAPS} from '../../assets/own-payroll-journal-model.js';
import {monthly194SqlFixture} from '../../tests/fixtures/own-monthly-day-engine-source-sql-synthetic.js';
import {bindMonthlyNativeFullCircuitContext} from './monthly-native-full-circuit-context-qa.mjs';
import {prepareMonthlyNativeConservationBaseline} from './monthly-native-full-circuit-baseline-qa.mjs';
import {verifyMonthlyNativeFullCircuit} from './monthly-native-full-circuit-connection-qa.mjs';
import {verifyOwnNoveltySuccessionCircuit} from './own-novelty-succession-circuit-qa.mjs';
import {verifyOwnNoveltySuccessionFinancialTail} from './own-novelty-succession-financial-tail-qa.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');

export function assertMonthlyNativeFixtureAuthority({maker,checker}){
 const common=[...BANK_ACCOUNTS_READ,...ACCOUNTING_READ,...IMPUTATION_READ,...JOURNAL_READ],required={maker:[...new Set([...common,...OWN_RECEIPT_PREPARE,...BANK_ACCOUNTS_CAPS.propose,...ACCOUNTING_CAPS.propose,...IMPUTATION_CAPS.propose,...JOURNAL_CAPS.propose,'employee.record.create','employee.catalog.propose','payroll.novelty.prepare','payroll.calculation.prepare'])],checker:[...new Set([...common,...OWN_RECEIPT_APPROVE,...BANK_ACCOUNTS_CAPS.approve,...ACCOUNTING_CAPS.approve,...IMPUTATION_CAPS.approve,...JOURNAL_CAPS.post,'employee.catalog.approve','payroll.novelty.approve','payroll.calculation.close'])]};
 assert.notEqual(maker.principal.tenant.membershipId,checker.principal.tenant.membershipId,'JOINT_INDEPENDENT_REVIEWER_REQUIRED');
 for(const[kind,actor]of Object.entries({maker,checker}))for(const capability of required[kind])assert.ok(actor.principal.tenant.effectiveCapabilities.includes(capability),'JOINT_CANONICAL_FIXTURE_CAPABILITY_MISSING:'+kind+':'+capability);
 for(const[actor,forbidden]of[[maker,['payroll.novelty.approve','payroll.parameter.approve']],[checker,['payroll.novelty.prepare','payroll.parameter.prepare']]])for(const capability of forbidden)assert.equal(actor.principal.tenant.effectiveCapabilities.includes(capability),false,'JOINT_FIXTURE_REVIEW_SEPARATION_CHANGED:'+capability);
 return{required,source:'actual canonical190 IAM capability reads',grantPerformed:false};
}

export async function verifyMonthlyNativeFullCircuitOnCanonical190({qa,tailPlan,sourceCommit,read,json,nativeJson,handlers,env,output,check,setRawActor,rawCall,state,expect}){
 assert.ok(['own-monthly-day-fixed-composition-qa.v1','own-novelty-succession-qa.v1'].includes(qa.version));const successionEnabled=qa.version==='own-novelty-succession-qa.v1';assert.equal(tailPlan.schema,qa.schema);assert.equal(tailPlan.sourceCommit,sourceCommit);
 const destination=path.join(output,'monthly-native-full-circuit');assert.equal(fs.existsSync(destination),false);fs.mkdirSync(destination);
 let context=null,failure=null,closeFailure=null,result=null;
 try{
  context=await bindMonthlyNativeFullCircuitContext({qa,tailPlan,sourceCommit,read,json,nativeJson,handlers,env,output:destination,check,setRawActor});
  const{maker,checker,setCurrent,getCurrent,db,api,browserQa}=context;
  // Missing grants are a precise fixture STOP, never silently reflected from
  // an expected success or added in response to a product authorization error.
  const authority=assertMonthlyNativeFixtureAuthority({maker,checker});
  const monthly=async(operation,actor,input)=>{setCurrent(actor);const post=operation==='command',query=post?null:operation==='bootstrap'?{resource:operation,contractId:input.contractId,period:input.period}:operation==='detail'?{resource:operation,id:input.id}:{resource:operation,key:input.key};const data=await api('monthly',query,post?input.body:null,input.key,post?[200,201]:200);if(post||operation==='attempt')monthlyDayDeclarationReceipt(data,post?{key:input.key,body:input.body}:null);return data;};
  const approveProgram=async fixture=>{
   setCurrent(maker);const boot=ownProgramBootstrap(await api('program',{resource:'bootstrap'})),programme=monthlyNativeHistoryProgramme({before:boot.program.definition,template:fixture.definition,catalogItems:boot.salaryCatalog.items});
   if(salarySerialized(programme)===salarySerialized(boot.program.definition))return boot;
   const baseBody={command:'propose',scopeVersion:boot.scopeVersion,baseVersion:boot.program.version,salaryVersion:boot.salaryCatalog.version,proposalId:null,proposalSha256:null,reason:'Programa completo exclusivamente sintético de la cadena nativa193+196',reviewConfirmed:false};
   if(boot.program.definition?.rules.length===3&&boot.program.definition.rules.some(r=>r.code==='919400')&&fixture.definition.rules.some(r=>r.code==='100')){
    const beforeRejected=state(),dropping=ownProgramCommand({...baseBody,program:fixture.definition},boot.salaryCatalog.items),denied=await api('program',null,dropping,randomUUID(),422);assert.equal(denied.code,'OWN_PROGRAM_HISTORY_REQUIRED');assert.deepEqual(state(),beforeRejected);
    const partial=structuredClone(boot.program.definition),removed=partial.rules.find(r=>r.code==='919400'),removedKey=ownProgramRuleKey(removed,partial.namespaceVersion);partial.rules=partial.rules.filter(r=>r!==removed);partial.periodParticipation.treatments=partial.periodParticipation.treatments.filter(t=>t.ruleKey!==removedKey);assert.equal(partial.rules.length,2);
    const deniedOne=await api('program',null,ownProgramCommand({...baseBody,program:partial},boot.salaryCatalog.items),randomUUID(),422);assert.equal(deniedOne.code,'OWN_PROGRAM_HISTORY_REQUIRED');assert.deepEqual(state(),beforeRejected);check(true,'real programme commands reject dropping all B0 identities or only one; all B0 rows and captures remain unchanged');
   }
   const body=ownProgramCommand({...baseBody,program:programme},boot.salaryCatalog.items),key=randomUUID(),proposed=await api('program',null,body,key,201);ownProgramReceipt(proposed,{key,body});
   const pending=ownProgramBootstrap(await api('program',{resource:'bootstrap'})).proposals.find(row=>row.id===proposed.proposalId);assert.ok(pending);setCurrent(checker);const independent=ownProgramBootstrap(await api('program',{resource:'bootstrap'})),decision=ownProgramCommand({command:'approve',scopeVersion:independent.scopeVersion,baseVersion:pending.baseVersion,salaryVersion:pending.salaryVersion,proposalId:pending.id,proposalSha256:pending.requestSha256,program:null,reason:'Revisión independiente del programa exclusivamente sintético conjunto',reviewConfirmed:true});assert.equal((await api('program',null,decision,randomUUID(),201)).status,'approved');setCurrent(maker);const published=ownProgramBootstrap(await api('program',{resource:'bootstrap'}));monthlyNativeHistoryPublished(published,programme);return published;
  };
  const call=(name,types,values)=>rawCall(name,types,values,context.rawActor(getCurrent()));
  const b0=await prepareMonthlyNativeConservationBaseline({...context,monthly,approveProgram,b0Fixture:monthly194SqlFixture(),output:destination});
  setCurrent(maker);const baselineArchive=pinMonthlyNativeBaselineArchive({capture:b0.original.capture,receipt:b0.original.receipt,group:await api('close',{resource:'group',id:b0.baseline.originalGroup.id}),pdfBytes:fs.readFileSync(b0.original.pdfPath)});
  const preserveOriginal=async()=>{
   const previous=getCurrent();setCurrent(maker);try{const capture=await api('liquidation',{resource:'detail',id:b0.original.capture.id}),receipt=await api('receipt',{resource:'batch',id:b0.original.receipt.id}),group=await api('close',{resource:'group',id:b0.baseline.originalGroup.id}),detail=await api('close',{resource:'detail',period:'2026-10',liquidationType:'monthly'});
    return await preserveMonthlyNativeBaselineArchive({archive:baselineArchive,capture:capture.capture,receipt,group,groupState:detail.groups.find(row=>row.id===group.groupId)?.state,pdfBytes:fs.readFileSync(b0.original.pdfPath)});
   }finally{setCurrent(previous);}
  };
  const monthlyContext={schema:qa.schema,sourceCommit,normalized:context.qa.normalized,maker,checker,monthly,approveProgram,call,state,expect};
  const joint=await verifyMonthlyNativeFullCircuit({...context,...(successionEnabled?{novelty217Causal:input=>verifyNovelty217AdministrativeCausality({...input,qa,json,expect})}:{}),sourceCommit,period:'2026-10',output:destination,ok:check,original:b0.original,baseline:b0.baseline,readPhysical:b0.readPhysical,preserveOriginal,receiptHandler:handlers.receipt,monthlyContext,synthetic:true,transport:'ci'});
  if(successionEnabled){assert.equal(joint.journey.novelty217Causal?.passed,true);assert.equal(joint.journey.novelty217Causal.readAndPrepareWithoutParameterRead,true);assert.equal(joint.journey.novelty217Causal.negativeCases.length,2);assert.equal(joint.journey.novelty217Causal.allThreeCasesRollback,true);}
  let jointArchive=null;
  if(successionEnabled){setCurrent(maker);const capture=await api('liquidation',{resource:'detail',id:joint.journey.secondRunId}),receipt=await api('receipt',{resource:'batch',id:joint.journey.receiptBatchId}),group=await api('close',{resource:'group',id:joint.journey.closeGroupId});
   const priorSource=receipt.snapshot.sources.find(s=>s.id===b0.baseline.originalGroup.id),targetSource=receipt.snapshot.sources.find(s=>s.id===group.groupId);assert.ok(priorSource&&targetSource);assert.equal(priorSource.snapshotSha256,b0.baseline.originalGroup.snapshotSha256);assert.equal(targetSource.snapshotSha256,joint.bank.closeSnapshotSha256);assert.deepEqual(receipt.snapshot.sources,joint.journey.receiptSources);
   jointArchive=pinMonthlyNativeBaselineArchive({capture:capture.capture,receipt,group,pdfBytes:fs.readFileSync(path.join(destination,'native-employee-receipt.pdf')),jointSourceScope:{version:'monthly-native-joint-archive-scope.v1',priorSource,targetSource}});
  }
  const correction=successionEnabled?await verifyOwnNoveltySuccessionCircuit({...context,sourceCommit,output:destination,ok:check,original:b0.original,baseline:b0.baseline,joint,readPhysical:b0.readPhysical,preserveOriginal,monthly,approveProgram,call,state,expect,synthetic:true,transport:'ci'}):null;
  const correctionFinancial=correction?await verifyOwnNoveltySuccessionFinancialTail({...context,sourceCommit,output:destination,ok:check,correction,joint,baseline:b0.baseline,jointArchive,preserveOriginal,readPhysical:b0.readPhysical,synthetic:true,transport:'ci'}):null;
  const originalBeforeReopen=await preserveOriginal(),groups=[joint.journey.closeGroupId,b0.baseline.originalGroup.id,...(correction?[correction.closeGroupId]:[])],snapshots=[];
  // Existing601 coverage selects all closed-period sources. Intentionally
  // reopen the two original QA groups after their bank/accounting tail and
  // the correction group after its explicit financial350 proof; no payment is inferred;
  // retain their immutable snapshots and record current-receipt withdrawal.
  for(const id of groups){setCurrent(checker);const before=await api('close',{resource:'group',id}),detail=await api('close',{resource:'detail',period:'2026-10',liquidationType:'monthly'});assert.equal(detail.groups.find(row=>row.id===id)?.state,'closed');const reopened=await api('close',null,{period:'2026-10',liquidationType:'monthly',scopeVersion:detail.scopeVersion,stateVersion:detail.stateVersion,selection:{kind:'all',values:[]},command:'reopen',groupId:id,reason:'Reapertura explícita del fixture conjunto terminado antes del circuito601 separado',reviewConfirmed:true},randomUUID(),201);assert.equal(reopened.body.command,'reopen');const after=await api('close',{resource:'group',id});assert.equal((await api('close',{resource:'detail',period:'2026-10',liquidationType:'monthly'})).groups.find(row=>row.id===id)?.state,'reopened');assert.deepEqual(after.snapshot,before.snapshot);assert.equal(after.snapshotSha256,before.snapshotSha256);snapshots.push({id,before,after});}
  setCurrent(maker);for(const id of[b0.original.receipt.id,joint.journey.receiptBatchId,...(correction?[correction.receiptBatchId]:[])]){const batch=await api('receipt',{resource:'batch',id});assert.equal(batch.sourceCurrent,false);}
   const restoredProgramme=monthlyNativeHistoryPublished(await approveProgram(qa.fixture));
   result={version:'monthly-native-full-circuit-runner-proof.v1',status:'assertions_completed_pending_outer_cleanup',sourceCommit,schema:qa.schema,authority,baselineNativeHires:1,journeyAdditionalHires:1,correctionAdditionalHires:correction?1:0,totalNativeHires:correction?3:2,originalNoelia29Used:false,baseline:b0.baseline,joint,correction,correctionFinancial,originalBeforeReopen,reopenedForSeparate601:snapshots,restoredProgrammeSha256:restoredProgramme.programmeSha256,latestProgramVersion:restoredProgramme.latestProgramVersion,actualSql:true,actualHandlers:true,actualBrowser:true,authenticationFixture:true,paymentExecuted:false,municipalAcceptance:false};
 }catch(error){failure=error;}
 finally{try{await context?.close();}catch(error){closeFailure=error;}}
 if(failure||closeFailure)throw new AggregateError([failure,closeFailure].filter(Boolean),'MONTHLY_NATIVE_FULL_CIRCUIT_FAILED',{cause:failure??closeFailure});
 fs.writeFileSync(path.join(destination,'joint-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
