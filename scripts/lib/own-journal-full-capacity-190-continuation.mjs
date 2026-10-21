// Future native journal tail in the SAME canonical190 db/IAM/MFA/population.
// Source-only authoring: this module was not imported or executed by its author.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {journalOperation} from '../../lib/internal-own-payroll-journal.js';
import {JOURNAL_READ,JOURNAL_CAPS,journalSource,journalDetail,calculateJournal,prepareJournal,decideJournal,journalReceipt} from '../../assets/own-payroll-journal-model.js';
import {accountingHash} from '../../assets/own-payroll-accounting-model.js';
const LEGACY=16*1024*1024,FULL=32*1024*1024,bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');

// Four persisted ledgers, including all three new accounting ledgers, are checked whole.
function ledgerSnapshot(h){
 const schema=h.qa.schema;assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const one=table=>"(SELECT jsonb_build_object('count',count(*),'sha256',"+schema+".own_run_hash_v1(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb))) FROM "+schema+'.'+table+' e)';
 return h.json(["SELECT jsonb_build_object('close',"+one('own_payroll_close_event')+",'accounting',"+one('own_payroll_accounting_event')+",'imputation',"+one('own_payroll_imputation_event')+",'journal',"+one('own_payroll_journal_event')+')'],{readOnly:true});
}
function assertCoverage(journal,allocation){
 assert.equal(journal.ready,true);assert.equal(journal.employeeCount,allocation.employeeCount);
 assert.equal(journal.conceptCount,allocation.conceptCount);assert.equal(journal.auxiliaryCount,allocation.auxiliaryCount);
 assert.equal(journal.groupCount,allocation.groups.length);assert.equal(journal.entries.length,allocation.groups.length*2);
 const allocated=allocation.rows.filter(r=>r.state==='allocated').map(r=>r.ordinal).sort((a,b)=>a-b);
 assert.equal(allocated.length,allocation.allocatedCount);assert.equal(allocated.length,allocation.moneyCount);
 for(const role of ['primary','counterpart']){
  const ordinals=journal.entries.filter(e=>e.role===role).flatMap(e=>e.sourceOrdinals).sort((a,b)=>a-b);
  assert.deepEqual(ordinals,allocated);assert.equal(new Set(ordinals).size,allocated.length);
 }
 assert.equal(journal.totals.debit,journal.totals.credit);assert.equal(journal.paymentExecuted,false);
}
function comparableImputation(detail){
 return{body:detail.body,requestSha256:detail.proposal.requestSha256,proposalId:detail.proposal.id,decision:detail.proposal.decision,source:detail.source,allocation:detail.allocation,allocationSha256:detail.allocationSha256,sourceCurrent:detail.sourceCurrent};
}
export async function runOwnJournalFullCapacity190Continuation({h,db,maker,reviewer,closed,approvedImputation,sameStateReject,ok}){
 assert.ok(h&&db&&typeof db.query==='function'&&typeof sameStateReject==='function'&&typeof ok==='function');
 assert.equal(closed.body.command,'close');assert.equal(closed.snapshot.employeeCount,855);
 assert.equal(approvedImputation.proposal.status,'approved');assert.equal(approvedImputation.sourceCurrent,true);
 assert.equal(approvedImputation.source.group.groupId,closed.groupId);assert.equal(approvedImputation.source.group.snapshotSha256,closed.snapshotSha256);
 assert.deepEqual(approvedImputation.source.group.snapshot,closed.snapshot);
 assert.notEqual(h.qa.actor.membershipId,h.qa.checker.membershipId);assert.notEqual(h.qa.actor.actorEmail,h.qa.checker.actorEmail);
 for(const [value,actor]of [[maker,h.qa.actor],[reviewer,h.qa.checker]]){assert.equal(value.principal.authorized,true);assert.equal(value.principal.session.mfa,true);assert.equal(value.principal.tenant.membershipId,actor.membershipId);assert.equal(value.session.id,actor.actorSessionId);}
 for(const capability of [...JOURNAL_READ,...JOURNAL_CAPS.propose])assert.ok(maker.principal.tenant.effectiveCapabilities.includes(capability),capability);
 for(const capability of [...JOURNAL_READ,...JOURNAL_CAPS.post])assert.ok(reviewer.principal.tenant.effectiveCapabilities.includes(capability),capability);
 const makerOp=(operation,input,fullJson=true)=>journalOperation(db,maker.principal,maker.session,operation,input,{fullJson});
 const reviewerOp=(operation,input,fullJson=true)=>journalOperation(db,reviewer.principal,reviewer.session,operation,input,{fullJson});
 const rejected=async(operation,predicate,label)=>{const before=ledgerSnapshot(h);await sameStateReject(operation,predicate,label);assert.deepEqual(ledgerSnapshot(h),before,'JOURNAL190_FOUR_LEDGER_NEGATIVE_CHANGED');};
 const stable=async(operation)=>{const before=ledgerSnapshot(h),result=await operation();assert.deepEqual(ledgerSnapshot(h),before,'JOURNAL190_RECOVERY_CHANGED_LEDGER');return result;};
 const baseline=ledgerSnapshot(h);assert.equal(baseline.journal.count,0,'JOURNAL190_EXISTING_JOURNAL_NOT_EMPTY');
 const query={period:closed.body.period,liquidationType:closed.body.liquidationType};
 const source=await makerOp('source',{basis:'imputation',id:approvedImputation.proposal.id});await journalSource(source);
 assert.deepEqual(comparableImputation(source.imputation),comparableImputation(approvedImputation));
 const allocation=source.imputation.allocation;assert.equal(allocation.ready,true);assert.equal(allocation.employeeCount,855);
 const postingDate=query.period+'-15';
 // Explicit invented counterpart declarations per REAL allocated group. No
 // source concept count is converted into an assumed40-row/20-monetary case.
 const rules=allocation.groups.map((group,index)=>({ordinal:index+1,side:index%2?'credit':'debit',counterAccountReference:'QA190-CONTRAPARTIDA-'+String(index+1),documentReference:'Par exclusivamente sintético QA190 '+String(index+1)}));
 const calculated=await calculateJournal(source,postingDate,rules);assertCoverage(calculated,allocation);
 const body=await prepareJournal(source,postingDate,rules,'Propuesta de asiento exclusivamente sintética del cierre855 real de QA190');
 assert.equal(body.journalSha256,await accountingHash(calculated));assert.ok(bytes({operation:'command',payload:body})<8*1024*1024);
 assert.ok(bytes(source)>LEGACY&&bytes({ok:true,data:source})<=FULL,'JOURNAL190_REAL_FULL_SOURCE_BUDGET');
 await rejected(()=>makerOp('source',{basis:'imputation',id:approvedImputation.proposal.id},false),e=>e.code==='JOURNAL_LIMIT'&&e.status===422,'legacy journal source refuses complete actual855 input without trimming or ledger changes');
 await rejected(()=>makerOp('command',{body:{...body,journalSha256:'0'.repeat(64)},key:randomUUID()}),e=>e.code==='JOURNAL_SOURCE_CHANGED','changed journal hash cannot create a proposal in any of the four ledgers');
 const proposalKey=randomUUID(),proposed=await makerOp('command',{body,key:proposalKey});await journalReceipt(proposed,{body,key:proposalKey});
 assert.equal(proposed.status,'pending');assert.equal(proposed.accountingPosted,false);assert.equal(proposed.paymentExecuted,false);
 assert.equal(ledgerSnapshot(h).journal.count,baseline.journal.count+1);
 assert.deepEqual(await stable(()=>makerOp('command',{body,key:proposalKey})),{...proposed,replayed:true});
 assert.deepEqual(await stable(()=>makerOp('attempt',{key:proposalKey})),{...proposed,replayed:true});
 await rejected(()=>makerOp('command',{body:{...body,reason:'Cuerpo cambiado exclusivamente sintético'},key:proposalKey}),e=>e.code==='JOURNAL_IDEMPOTENCY_REUSE','same journal key with changed body fails atomically');
 const pending=await reviewerOp('detail',{id:proposed.proposalId});await journalDetail(pending);assert.equal(pending.status,'pending');assert.equal(pending.canReview,true);
 assert.deepEqual(pending.body,body);assert.deepEqual(pending.journal,calculated);assert.equal(pending.requestSha256,await accountingHash(body));
 const makerBoot=await makerOp('bootstrap',query),selfBody={...body,command:'post',scopeVersion:makerBoot.scopeVersion,proposalId:pending.proposalId,proposalSha256:pending.requestSha256,reason:'Intento propio de revisión exclusivamente sintético'};
 let selfReviewRejectionCode;
 await rejected(()=>makerOp('command',{body:selfBody,key:randomUUID()}),e=>{selfReviewRejectionCode=e.code;return e.code==='JOURNAL_INDEPENDENT_REQUIRED'||e.code==='JOURNAL_FORBIDDEN';},'maker cannot register its own journal proposal (own authority and independent-review guards)');
 const reviewBoot=await reviewerOp('bootstrap',query),postBody=await decideJournal(reviewBoot,pending,'post','Registro independiente exclusivamente sintético del asiento QA190');
 const postKey=randomUUID(),postedReceipt=await reviewerOp('command',{body:postBody,key:postKey});await journalReceipt(postedReceipt,{body:postBody,key:postKey});
 assert.equal(postedReceipt.accountingPosted,true);assert.equal(postedReceipt.paymentExecuted,false);
 assert.deepEqual(await stable(()=>reviewerOp('command',{body:postBody,key:postKey})),{...postedReceipt,replayed:true});
 assert.deepEqual(await stable(()=>reviewerOp('attempt',{key:postKey})),{...postedReceipt,replayed:true});
 const posted=await makerOp('detail',{id:postedReceipt.eventId});await journalDetail(posted);
 assert.equal(posted.status,'posted');assert.equal(posted.kind,'initial');assert.equal(posted.sourceCurrent,true);
 assert.deepEqual(posted.journal,calculated);assert.deepEqual(posted.source,source);assert.equal(posted.journalSha256,body.journalSha256);
 assert.ok(bytes(posted)>LEGACY&&bytes({ok:true,data:posted})<=FULL);
 const beforeReopen=ledgerSnapshot(h);assert.equal(beforeReopen.journal.count,baseline.journal.count+2);
 assert.deepEqual(beforeReopen.close,baseline.close);assert.deepEqual(beforeReopen.accounting,baseline.accounting);assert.deepEqual(beforeReopen.imputation,baseline.imputation);
 ok(true,'actual approved imputation creates and independently posts one complete journal; all allocated ordinals, nulls, hashes and replay receipts survive');
 let afterCalled=false;
 return Object.freeze({version:'own-journal-full-capacity-canonical190-tail.v1',
  summaryBeforeReopen:{groupCount:calculated.groupCount,entries:calculated.entries.length,moneyOrdinals:allocation.moneyCount,conceptRows:allocation.conceptCount,auxiliaryRows:allocation.auxiliaryCount,sourceBytes:bytes(source),detailBytes:bytes(posted),journalHash:posted.journalSha256,selfReviewRejectionCode},
  async afterReopen(reopened){
   assert.equal(afterCalled,false,'JOURNAL190_AFTER_REOPEN_ALREADY_CALLED');afterCalled=true;
   assert.equal(reopened.body.command,'reopen');assert.equal(reopened.groupId,closed.groupId);assert.equal(reopened.snapshotSha256,closed.snapshotSha256);assert.deepEqual(reopened.snapshot,closed.snapshot);
   const historical=await makerOp('detail',{id:posted.id});await journalDetail(historical);
   assert.equal(historical.status,'posted');assert.equal(historical.sourceCurrent,false,'JOURNAL190_REOPEN_MUST_MAKE_ORIGINAL_HISTORICAL');
   assert.deepEqual(historical.body,posted.body);assert.deepEqual(historical.source,posted.source);assert.deepEqual(historical.journal,posted.journal);
   assert.equal(historical.requestSha256,posted.requestSha256);assert.equal(historical.journalSha256,posted.journalSha256);
   await rejected(()=>makerOp('source',{basis:'imputation',id:approvedImputation.proposal.id}),e=>e.code==='JOURNAL_SOURCE_CHANGED','reopened close prevents a new initial journal while preserving its posted history');
   const reversalSource=await makerOp('source',{basis:'journal',id:posted.id});await journalSource(reversalSource);
   assert.equal(reversalSource.original.sourceCurrent,false);assert.equal(reversalSource.original.status,'posted');assert.equal(reversalSource.imputation,null);
   const reversalBody=await prepareJournal(reversalSource,postingDate,[],'Contrasiento exclusivamente sintético de un original histórico QA190');
   assert.deepEqual(reversalBody.rules,[]);assert.equal(reversalBody.basis,'journal');
   const reversedCalculation=await calculateJournal(reversalSource,postingDate,[]);assertCoverage(reversedCalculation,allocation);
   const swapped=posted.journal.entries.map(entry=>{const side=entry.side==='debit'?'credit':'debit';return{...structuredClone(entry),side,debit:side==='debit'?entry.amount:'0',credit:side==='credit'?entry.amount:'0'};});
   assert.deepEqual(reversedCalculation.entries,swapped);assert.equal(reversedCalculation.originalId,posted.id);assert.equal(reversedCalculation.kind,'reversal');
   assert.equal(reversedCalculation.totals.debit,posted.journal.totals.credit);assert.equal(reversedCalculation.totals.credit,posted.journal.totals.debit);
   const reversalKey=randomUUID(),reversalProposal=await makerOp('command',{body:reversalBody,key:reversalKey});
   assert.deepEqual(await stable(()=>makerOp('command',{body:reversalBody,key:reversalKey})),{...reversalProposal,replayed:true});
   assert.deepEqual(await stable(()=>makerOp('attempt',{key:reversalKey})),{...reversalProposal,replayed:true});
   const reversePending=await reviewerOp('detail',{id:reversalProposal.proposalId}),reverseBoot=await reviewerOp('bootstrap',query);assert.equal(reversePending.canReview,true);
   assert.deepEqual(reversePending.journal,reversedCalculation);
   const reversePostBody=await decideJournal(reverseBoot,reversePending,'post','Registro independiente exclusivamente sintético del contrasiento histórico'),reversePostKey=randomUUID();
   const reversePosted=await reviewerOp('command',{body:reversePostBody,key:reversePostKey});await journalReceipt(reversePosted,{body:reversePostBody,key:reversePostKey});
   assert.deepEqual(await stable(()=>reviewerOp('command',{body:reversePostBody,key:reversePostKey})),{...reversePosted,replayed:true});
   assert.deepEqual(await stable(()=>reviewerOp('attempt',{key:reversePostKey})),{...reversePosted,replayed:true});
   const reversalDetail=await makerOp('detail',{id:reversePosted.eventId});await journalDetail(reversalDetail);assert.equal(reversalDetail.status,'posted');assert.equal(reversalDetail.kind,'reversal');assert.deepEqual(reversalDetail.journal,reversedCalculation);
   const retained=await makerOp('detail',{id:posted.id});await journalDetail(retained);assert.equal(retained.status,'reversed');assert.equal(retained.reversedBy,reversePosted.eventId);assert.equal(retained.number,posted.number);
   assert.deepEqual(retained.body,posted.body);assert.deepEqual(retained.source,posted.source);assert.deepEqual(retained.journal,posted.journal);
   await rejected(()=>makerOp('source',{basis:'journal',id:posted.id}),e=>e.code==='JOURNAL_DECIDED','an already reversed original cannot start another reversal');
   const final=ledgerSnapshot(h);assert.equal(final.journal.count,baseline.journal.count+4);assert.deepEqual(final.accounting,baseline.accounting);assert.deepEqual(final.imputation,baseline.imputation);
   assert.notDeepEqual(final.close,baseline.close);assert.equal(final.close.count,baseline.close.count+1);
   assert.deepEqual(await stable(()=>reviewerOp('command',{body:postBody,key:postKey})),{...postedReceipt,replayed:true});
   ok(true,'after the SAME reopen, historical posted source still reverses with empty rules, exact swapped pairs and independent posting, without duplicate events');
   return{version:'own-journal-full-capacity-canonical190-after-reopen.v1',groupCount:reversedCalculation.groupCount,entries:reversedCalculation.entries.length,moneyOrdinals:allocation.moneyCount,journalEventsAdded:4,originalHash:posted.journalSha256,reversalHash:reversalDetail.journalSha256,fourLedgerSnapshot:ledgerSnapshot(h),actualHttp:false,synthetic:true,paymentExecuted:false,municipalAcceptance:false};
  }
 });
}
