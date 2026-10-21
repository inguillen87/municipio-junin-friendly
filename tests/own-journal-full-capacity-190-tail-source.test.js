// Proposed finite FS contracts only; does not import the native continuation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=()=>fs.readFileSync(new URL('../scripts/lib/own-journal-full-capacity-190-continuation.mjs',import.meta.url),'utf8');
test('journal tail consumes the same canonical190 db, closed snapshot and actual approved detail',()=>{
 const s=read();assert.ok(s.includes('runOwnJournalFullCapacity190Continuation({h,db,maker,reviewer,closed,approvedImputation,sameStateReject,ok})'));
 assert.ok(s.includes("journalOperation(db,maker.principal,maker.session,operation,input,{fullJson})"));assert.ok(s.includes("journalOperation(db,reviewer.principal,reviewer.session,operation,input,{fullJson})"));
 assert.ok(s.includes("assert.deepEqual(approvedImputation.source.group.snapshot,closed.snapshot)"));
 assert.ok(s.includes("assert.deepEqual(comparableImputation(source.imputation),comparableImputation(approvedImputation))"));
 for(const forbidden of ['employeeDraft','registerPopulation','buildOwnReportCensus190IamFixture','CREATE SCHEMA','CREATE DATABASE','new Pool','stub','mock','installation.mjs'])assert.ok(!s.includes(forbidden),forbidden);
});
test('ordinal coverage and entries derive from actual allocation, including auxiliary preservation',()=>{
 const s=read();for(const token of ['allocation.groups.length*2',"allocation.rows.filter(r=>r.state==='allocated')",'allocation.moneyCount','allocation.auxiliaryCount',"for(const role of ['primary','counterpart'])","assert.deepEqual(ordinals,allocated)"])assert.ok(s.includes(token),token);
 assert.ok(!s.includes('entries.length,40'));assert.ok(!s.includes('ordinals.length,17100'));
 assert.ok(s.includes('prepareJournal(source,postingDate,rules,'));assert.ok(s.includes('calculateJournal(source,postingDate,rules)'));
});
test('negative and replay cases snapshot four ledgers; same reopen admits a posted historical original and exact reversal',()=>{
 const s=read();for(const table of ['own_payroll_close_event','own_payroll_accounting_event','own_payroll_imputation_event','own_payroll_journal_event'])assert.ok(s.includes(table));
 assert.ok(s.includes("await sameStateReject(operation,predicate,label);assert.deepEqual(ledgerSnapshot(h),before"));
 assert.ok(s.includes("assert.deepEqual(ledgerSnapshot(h),before,'JOURNAL190_RECOVERY_CHANGED_LEDGER')"));
 for(const token of ["e.code==='JOURNAL_IDEMPOTENCY_REUSE'","e.code==='JOURNAL_SOURCE_CHANGED'","e.code==='JOURNAL_INDEPENDENT_REQUIRED'","selfReviewRejectionCode=e.code","assert.equal(historical.sourceCurrent,false","assert.equal(reversalSource.original.sourceCurrent,false)","prepareJournal(reversalSource,postingDate,[],","assert.deepEqual(reversalBody.rules,[])","assert.deepEqual(reversedCalculation.entries,swapped)","assert.equal(retained.reversedBy,reversePosted.eventId)","baseline.journal.count+4","baseline.close.count+1"])assert.ok(s.includes(token),token);
 assert.ok(s.includes('assert.deepEqual(beforeReopen.accounting,baseline.accounting)'));assert.ok(s.includes('assert.deepEqual(final.accounting,baseline.accounting)'));
 assert.ok(s.indexOf('async afterReopen(reopened)')<s.indexOf("assert.equal(historical.sourceCurrent,false"));
 assert.ok(s.includes("reviewerOp('command',{body:postBody,key:postKey})"));assert.ok(s.includes("reviewerOp('attempt',{key:reversePostKey})"));
});
