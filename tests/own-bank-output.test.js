import test from 'node:test';import assert from 'node:assert/strict';
import {bankOutputFixture,syntheticNet} from './fixtures/own-bank-output-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {prepareBankOutput,bankOutputCents,bankOutputProfile,createBankOutputTxt,createBankOutputCsv,bankOutputPage,sameBankOutput} from '../assets/own-bank-output-model.js';
const prepare=f=>prepareBankOutput(f.batch,f.accounts,f.profile,f.closes),decode=bytes=>new TextDecoder().decode(bytes);

test('complete approved native source: all pages and search preserve every literal payment',async()=>{
 const f=bankOutputFixture(35),r=await prepare(f),page=bankOutputPage(r,'sintético 3',2);assert.equal(r.ready,true);assert.equal(r.recordCount,35);assert.equal(page.total,35);assert.ok(page.filtered<35);
 const lines=decode(createBankOutputTxt(r).bytes).split('\r\n');assert.equal(lines.length,38);assert.equal(lines.at(-1),'');assert.ok(lines.slice(0,-1).every(l=>l.length===200));
 assert.equal(lines[0].slice(1,12),f.batch.snapshot.params.issuer.taxId);assert.equal(lines[0].slice(12,16),f.profile.payerCbu.slice(3,7));assert.equal(lines[0].slice(16,30),f.profile.payerCbu.slice(8));assert.equal(lines[0].slice(30,39),'020261008');assert.equal(lines[0].slice(59,79),'SUE10000004455000001');assert.equal(lines[0].slice(79),' '.repeat(121));
 let sum=0n;const references=new Set();for(let i=1;i<=35;i++){const line=lines[i],row=r.rows[i-1];assert.equal(line[0],'2');assert.equal(line.slice(1,10),'0'+row.account.cbu.slice(0,8));assert.equal(line.slice(10,24),row.account.cbu.slice(8));assert.equal(BigInt(line.slice(24,34)).toString(),row.cents);sum+=BigInt(line.slice(24,34));assert.equal(line.slice(49,71),row.cuil.padEnd(22));assert.equal(line.slice(71,85),'102'+row.cuil);assert.equal(line.slice(85,87),'00');assert.equal(line.slice(87,100),' '.repeat(13));assert.equal(line.slice(100,104),'0000');assert.equal(line.slice(104),' '.repeat(96));references.add(line.slice(34,49));}
 assert.equal(references.size,35);const trailer=lines[36];assert.equal(trailer[0],'3');assert.equal(BigInt(trailer.slice(1,16)),sum);assert.equal(BigInt(trailer.slice(16,23)),35n);assert.equal(trailer.slice(23,117),'0'.repeat(94));assert.equal(trailer.slice(117),' '.repeat(83));assert.equal(r.totalCents,sum.toString());assert.equal(r.bankSubmitted,false);assert.equal(r.paymentExecuted,false);
});
test('large exact cents do not pass through floating point or scientific notation',async()=>{
 const f=bankOutputFixture(1);syntheticNet(f,'99999999.99');const r=await prepare(f);assert.equal(r.totalCents,'9999999999');assert.equal(decode(createBankOutputTxt(r).bytes).split('\r\n')[1].slice(24,34),'9999999999');
 assert.throws(()=>bankOutputCents('000'),/neto original/);
});
test('saved precision is accepted only when every sub-cent digit is exactly zero',async()=>{
 for(const [net,code]of [['1.23000000',null],['1.23000001','FRACTIONAL_CENTS'],['0.00','NON_POSITIVE'],['-0.01','NON_POSITIVE'],['100000000.00','AMOUNT_OVERFLOW']]){const f=bankOutputFixture(1);syntheticNet(f,net);const r=await prepare(f);if(code){assert.ok(r.rows[0].issues.includes(code));assert.equal(r.totalCents,null);assert.throws(()=>createBankOutputTxt(r),/parcial/);}else assert.equal(r.totalCents,'123');}
});
test('a missing account on the last page rejects the entire TXT and remains in complete CSV',async()=>{
 const f=bankOutputFixture();f.accounts.configuration.definition.accounts.pop();const r=await prepare(f);assert.equal(r.recordCount,35);assert.equal(r.ready,false);assert.equal(r.rows.filter(x=>x.issues.includes('ACCOUNT_MISSING')).length,1);assert.throws(()=>createBankOutputTxt(r),/parcial/);assert.equal(decode(createBankOutputCsv(r).bytes).trimEnd().split('\r\n').length,36);
});
test('all receipt decisions and availability are retained: preparation/withdrawal never pass as approval',async()=>{
 for(const state of ['prepared','withdrawn']){const f=bankOutputFixture(1);f.batch.state=state;f.batch.review=state==='prepared'?null:{...f.batch.review,decision:state};if(state==='withdrawn')f.batch.permissions.canDownload=false;const r=await prepare(f);assert.ok(r.issues.includes('UNAPPROVED'));assert.throws(()=>createBankOutputTxt(r),/parcial/);}
 const f=bankOutputFixture(1);f.batch.sourceCurrent=false;f.batch.permissions.canDownload=false;const r=await prepare(f);assert.ok(r.issues.includes('UNAVAILABLE'));
});
test('no approved account revision, identity change or a CUIL typo are explicit whole-source observations',async()=>{
 const f=bankOutputFixture(1);f.accounts.configuration={version:'a'.repeat(64),revision:0,definition:null,proposalId:null,approvalId:null};let r=await prepare(f);assert.ok(r.issues.includes('ACCOUNTS_UNAPPROVED'));assert.ok(r.rows[0].issues.includes('ACCOUNT_MISSING'));
 const g=bankOutputFixture(1);g.accounts.sources.contracts[0].registrationId='aaaaaaaa-0000-4000-8000-000000000001';g.batch.snapshot.records[0].cuil='11111111111';g.batch.snapshotSha256=ownRunHash(g.batch.snapshot);r=await prepare(g);assert.ok(r.rows[0].issues.includes('IDENTITY_CHANGED'));assert.ok(r.rows[0].issues.includes('CUIL_INVALID'));
});
test('inclusive account validity uses the expressly declared credit day, without fallback to another account',async()=>{
 const f=bankOutputFixture(1),a=f.accounts.configuration.definition.accounts[0];a.validFrom=f.profile.creditDate;a.validUntil=f.profile.creditDate;assert.equal((await prepare(f)).ready,true);a.validUntil=f.profile.compensationDate;await assert.rejects(prepare(f),/fin|fechas/);
 const g=bankOutputFixture(1);g.accounts.configuration.definition.accounts[0].validUntil='2026-10-08';assert.ok((await prepare(g)).rows[0].issues.includes('ACCOUNT_MISSING'));
});
test('no currency conversion, inferred loan class, automatic calendar, sequence or truncation',async()=>{
 const f=bankOutputFixture(1);f.accounts.configuration.definition.accounts[0].currency='USD';assert.ok((await prepare(f)).rows[0].issues.includes('CURRENCY_CHANGED'));f.profile.currency='USD';f.profile.loanIdentifier='0003';const r=await prepare(f),lines=decode(createBankOutputTxt(r).bytes).split('\r\n');assert.equal(lines[0][30],'1');assert.equal(lines[1].slice(100,104),'0003');
 for(const patch of [{calendarConfirmed:false},{compensationDate:'2026-10-09'},{creditDate:'2026-02-30'},{agreementCode:'123456789'},{sendNumber:'000000'},{loanIdentifier:'monthly'},{information:'ÁREA nómina'},{extra:true}])assert.throws(()=>bankOutputProfile({...f.profile,...patch}));
});
test('shared destinations are never silently combined; independent original rows require express review',async()=>{
 const f=bankOutputFixture(2);f.accounts.configuration.definition.accounts[1].cbu=f.accounts.configuration.definition.accounts[0].cbu;let r=await prepare(f);assert.equal(r.repeatedDestinationCount,1);assert.ok(r.rows.every(x=>x.issues.includes('REPEATED_DESTINATION')));assert.throws(()=>createBankOutputTxt(r));f.profile.allowRepeatedDestinations=true;r=await prepare(f);assert.equal(r.ready,true);assert.equal(r.rows.length,2);assert.equal(decode(createBankOutputTxt(r).bytes).split('\r\n').length,5);
});
test('tampered receipts, reconstructed previews and mutation cannot create exportable instructions',async()=>{
 const f=bankOutputFixture(1);f.batch.snapshot.records[0].name='Another synthetic name';await assert.rejects(prepare(f),/contenido/);const r=await prepare(bankOutputFixture(1));assert.throws(()=>createBankOutputTxt(structuredClone(r)),/parcial/);assert.throws(()=>{r.rows.pop();},TypeError);assert.throws(()=>{r.profile.sendNumber='2';},TypeError);
});
test('literal bank identifiers survive CSV and hostile nominal cells remain plain text',async()=>{
 const f=bankOutputFixture(1);f.batch.snapshot.records[0].name='=2+2';f.accounts.sources.contracts[0].name='=2+2';f.batch.snapshotSha256=ownRunHash(f.batch.snapshot);const csv=decode(createBankOutputCsv(await prepare(f)).bytes);assert.ok(csv.includes('"\'=2+2"'));assert.ok(csv.includes('"\''+f.accounts.configuration.definition.accounts[0].cbu+'"'));assert.ok(csv.includes('"\'00004455"'));assert.ok(csv.includes('"\'000001"'));
});
test('exact same voluntary source/profile is stable; any approved account, receipt review or source change invalidates it',async()=>{
 const f=bankOutputFixture(1),a=await prepare(f),b=await prepare(f);assert.equal(sameBankOutput(a,b),true);f.profile.sendNumber='2';assert.equal(sameBankOutput(a,await prepare(f)),false);const g=bankOutputFixture(1);g.accounts.configuration.approvalId='aaaaaaaa-0000-4000-8000-000000000003';assert.equal(sameBankOutput(a,await prepare(g)),false);
});
function reseal(f){for(const c of f.closes){c.snapshotSha256=ownRunHash(c.snapshot);f.batch.snapshot.sources.find(s=>s.id===c.groupId).snapshotSha256=c.snapshotSha256;}f.batch.snapshotSha256=ownRunHash(f.batch.snapshot);}
test('42 and 55 are explicitly separated from captured original jurisdiction; whole review and CSV stay complete',async()=>{
 const f=bankOutputFixture(35);for(const [i,e]of f.closes[0].snapshot.employees.entries())if(i>=27)e.jurisdiction.code='55';reseal(f);
 const a=await prepare(f);assert.equal(a.recordCount,35);assert.equal(a.selectedCount,27);assert.equal(a.otherJurisdictionCount,8);assert.equal(a.ready,true);assert.equal(decode(createBankOutputTxt(a).bytes).split('\r\n').length,30);assert.match(createBankOutputTxt(a).filename,/-j42-/);
 assert.equal(decode(createBankOutputCsv(a).bytes).trimEnd().split('\r\n').length,36);bankOutputPage(a,'sintético 34');
 f.profile.jurisdictionCode='55';f.profile.sendNumber='2';const b=await prepare(f),lines=decode(createBankOutputTxt(b).bytes).split('\r\n');assert.equal(b.selectedCount,8);assert.equal(lines.length,11);assert.equal(BigInt(lines.at(-2).slice(16,23)),8n);assert.equal(b.totalCents,b.rows.filter(r=>r.selected).reduce((n,r)=>n+BigInt(r.cents),0n).toString());assert.equal(sameBankOutput(a,b),false);assert.match(createBankOutputTxt(b).filename,/-j55-/);
 const combined=new Set([...a.rows.filter(r=>r.selected),...b.rows.filter(r=>r.selected)].map(r=>r.contractId));assert.equal(combined.size,35);
});
test('unknown jurisdiction on another page blocks separation; legacy original v1 is preserved without invented metadata',async()=>{
 const f=bankOutputFixture();f.closes[0].snapshot.employees.at(-1).jurisdiction.code=null;reseal(f);let r=await prepare(f);assert.equal(r.recordCount,35);assert.ok(r.issues.includes('JURISDICTION_MISSING'));assert.equal(r.ready,false);assert.throws(()=>createBankOutputTxt(r));
 const g=bankOutputFixture(1),s=g.closes[0].snapshot;s.version='own-close-snapshot.v1';delete s.employees[0].jurisdiction;reseal(g);r=await prepare(g);assert.ok(r.issues.includes('JURISDICTION_MISSING'));assert.equal(r.rows[0].jurisdiction.basis,'not_captured');assert.equal(r.rows[0].jurisdiction.code,null);
 const h=bankOutputFixture(1);h.profile.jurisdictionCode='55';assert.ok((await prepare(h)).issues.includes('EMPTY_JURISDICTION'));assert.throws(()=>bankOutputProfile({...h.profile,jurisdictionCode:'all'}));
});
test('all source groups must be authentic, matching and complete; current directory cannot substitute historic scope',async()=>{
 const f=bankOutputFixture(1);await assert.rejects(prepareBankOutput(f.batch,f.accounts,f.profile,[]),/cierres originales/);
 const g=bankOutputFixture(1);g.closes[0].snapshot.employees[0].jurisdiction.code='55';await assert.rejects(prepare(g),/integridad/);
 const h=bankOutputFixture(1);h.batch.snapshot.records[0].runId='aaaaaaaa-0000-4000-8000-000000000003';h.batch.snapshotSha256=ownRunHash(h.batch.snapshot);await assert.rejects(prepare(h),/participación original/);
});
