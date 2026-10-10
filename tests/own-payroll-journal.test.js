import test from 'node:test';import assert from 'node:assert/strict';
import {journalFixture,postedJournalFixture} from './fixtures/own-payroll-journal-synthetic.js';
import {remeasureSyntheticClosure} from './fixtures/own-payroll-imputation-synthetic.js';
import {JOURNAL_SOURCE_VERSION,journalSourceHashValue,journalStateHashValue,calculateJournal,prepareJournal,journalDetail,journalCsv} from '../assets/own-payroll-journal-model.js';
import {accountingHash} from '../assets/own-payroll-accounting-model.js';
test('asiento completo conserva todos los destinos y conceptos del cierre propio, más de una página',async()=>{
 const f=await journalFixture(),j=await calculateJournal(f.source,f.postingDate,f.rules);assert.ok(j.groupCount>25);assert.equal(j.entries.length,2*j.groupCount);assert.equal(j.ready,true);assert.equal(j.totals.debit,j.totals.credit);assert.equal(j.paymentExecuted,false);
 const assigned=f.source.imputation.allocation.rows.filter(r=>r.state==='allocated').map(r=>r.ordinal).sort((a,b)=>a-b),original=j.entries.filter(e=>e.role==='primary').flatMap(e=>e.sourceOrdinals).sort((a,b)=>a-b);assert.deepEqual(original,assigned);assert.equal(j.conceptCount,f.source.imputation.allocation.conceptCount);
 assert.deepEqual(f.source.imputation.allocation.sourceTotals,j.sourceTotals);
});
test('sentido y contrapartida pendientes siguen siendo observaciones completas y no se prepara otro contenido',async()=>{
 const f=await journalFixture();f.rules.at(-1).side=null;f.rules.at(-1).counterAccountReference=null;const j=await calculateJournal(f.source,f.postingDate,f.rules);assert.equal(j.ready,false);assert.deepEqual(j.issues.map(r=>r.code),['side_missing','counter_account_missing']);assert.ok(j.issues.every(r=>r.ordinal===f.rules.length));await assert.rejects(prepareJournal(f.source,f.postingDate,f.rules,'Revisión exclusivamente sintética'),/todos los destinos/);
});
test('la cuenta principal ausente no se infiere del banco, acreedor o contrapartida',async()=>{
 const f=await journalFixture(2,s=>s.configuration.definition.mappings.forEach(m=>m.accountingAccountReference=null));const j=await calculateJournal(f.source,f.postingDate,f.rules);assert.equal(j.ready,false);assert.ok(j.issues.every(x=>x.code==='primary_account_missing'));assert.equal(j.entries.length,0);
});
test('faltantes, duplicados y ordinales permutados rechazan la propuesta íntegra',async()=>{
 const f=await journalFixture();for(const rules of [f.rules.slice(1),[...f.rules,f.rules[0]],[f.rules[1],f.rules[0],...f.rules.slice(2)]])await assert.rejects(calculateJournal(f.source,f.postingDate,rules));
});
test('la declaración requiere fecha civil y documento, conserva null distinto de cero',async()=>{
 const f=await journalFixture();await assert.rejects(calculateJournal(f.source,'2026-02-30',f.rules));await assert.rejects(calculateJournal(f.source,'2027-01-01',f.rules));f.rules[0].documentReference=null;assert.equal((await calculateJournal(f.source,f.postingDate,f.rules)).ready,false);
});
test('ni una captura adulterada ni una imputación pendiente, reabierta o reemplazada pueden contabilizarse',async()=>{
 const f=await journalFixture();for(const change of [d=>d.sourceCurrent=false,d=>d.proposal.status='pending',d=>d.allocation.groups[0].amount='9999.99',d=>d.source.group.snapshot.concepts[0].amount='9999.99']){const s=structuredClone(f.source);change(s.imputation);await assert.rejects(calculateJournal(s,f.postingDate,f.rules));}
});
test('cero y negativos conservan precisión y los negativos invierten ambos renglones sin redondear',async()=>{
 const f=await journalFixture(2,async source=>{for(const [i,c]of source.group.snapshot.concepts.entries())if(c.nature!=='auxiliary')c.amount=i%2?'-1.2300':'0.0000';await remeasureSyntheticClosure(source,4);});
 const j=await calculateJournal(f.source,f.postingDate,f.rules);assert.equal(j.ready,true);assert.equal(j.totals.debit,j.totals.credit);for(const e of j.entries){assert.ok(!e.amount.startsWith('-'));assert.equal(e.amount,e.sourceAmount.replace(/^-/,''));const rule=f.rules[e.groupOrdinal-1];if(e.role==='primary')assert.equal(e.side,e.sourceAmount.startsWith('-')?(rule.side==='debit'?'credit':'debit'):rule.side);}
});
test('se verifica el asiento conservado y se detectan cambios aun si se reescribe la huella del resultado',async()=>{
 const {detail}=await postedJournalFixture();await journalDetail(detail);const bad=structuredClone(detail);bad.journal.entries[0].accountReference='OTRA';bad.journalSha256=await accountingHash(bad.journal);bad.body.journalSha256=bad.journalSha256;bad.requestSha256=await accountingHash(bad.body);bad.stateVersion=await accountingHash(journalStateHashValue(bad));await assert.rejects(journalDetail(bad));
});
test('el detalle vincula la fuente exacta y rechaza números en un rechazo aun con huellas reescritas',async()=>{
 const {detail}=await postedJournalFixture(2);
 for(const change of [d=>d.body.sourceId='bbbbbbbb-0000-4000-8000-000000099999',d=>{d.status='rejected';d.decision.command='reject';}]){const d=structuredClone(detail);change(d);d.requestSha256=await accountingHash(d.body);d.stateVersion=await accountingHash(journalStateHashValue(d));await assert.rejects(journalDetail(d));}
});
test('la reversión es otro asiento exacto; conserva el original incluso cuando su fuente dejó de estar vigente',async()=>{
 const f=await postedJournalFixture();f.detail.sourceCurrent=false;const s={version:JOURNAL_SOURCE_VERSION,scopeVersion:f.source.scopeVersion,basis:'journal',imputation:null,original:f.detail,sourceVersion:'0'.repeat(64),complete:true};s.sourceVersion=await accountingHash(journalSourceHashValue(s));const j=await calculateJournal(s,'2027-01-02',[]);assert.equal(j.kind,'reversal');assert.equal(j.originalId,f.detail.id);assert.equal(j.fiscalYear,'2027');assert.equal(j.ready,true);assert.equal(j.entries.length,f.detail.journal.entries.length);for(const [i,e]of j.entries.entries()){assert.equal(e.debit,f.detail.journal.entries[i].credit);assert.equal(e.credit,f.detail.journal.entries[i].debit);assert.equal(e.sourceAmount,f.detail.journal.entries[i].sourceAmount);}await assert.rejects(calculateJournal(s,'2026-10-01',[]));await assert.rejects(calculateJournal(s,'2027-01-02',f.rules));assert.equal(f.detail.status,'posted');
});
test('el CSV del asiento registrado es completo y seguro, y una propuesta pendiente no lo habilita',async()=>{
 const f=await postedJournalFixture();const csv=await journalCsv(f.detail);assert.equal(csv.split('\r\n').length,f.detail.journal.entries.length+2);assert.ok(csv.includes("'CUENTA-PRINCIPAL-QA-"));assert.ok(csv.includes(f.detail.journalSha256));const pending=structuredClone(f.detail);pending.id=pending.proposalId;pending.status='pending';pending.number=null;pending.decision=null;pending.stateVersion=await accountingHash(journalStateHashValue(pending));await assert.rejects(journalCsv(pending),/registrado/);
 const s=await journalFixture(2);s.rules[0].counterAccountReference='=SUM(1;2)';s.rules[0].documentReference='Documento con "comillas" y ;';const d=structuredClone(f.detail);d.source=s.source;d.body=await prepareJournal(s.source,s.postingDate,s.rules,'Comprobación exclusivamente sintética CSV');d.journal=await calculateJournal(s.source,s.postingDate,s.rules);d.journalSha256=d.body.journalSha256;d.requestSha256=await accountingHash(d.body);d.stateVersion=await accountingHash(journalStateHashValue(d));const safe=await journalCsv(d);assert.ok(safe.includes('"\'=SUM(1;2)"'));assert.ok(safe.includes('"\'Documento con ""comillas"" y ;"'));
});
