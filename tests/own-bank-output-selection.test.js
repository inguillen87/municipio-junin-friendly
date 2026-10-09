import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {bankOutputFixture} from './fixtures/own-bank-output-synthetic.js';
import {syntheticCbu} from './fixtures/own-bank-accounts-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {prepareBankOutput,createBankOutputTxt,createBankOutputCsv,bankOutputPage,sameBankOutput,bankOutputProfile} from '../assets/own-bank-output-model.js';
import {bankOutputTables,createBankOutputXlsx} from '../assets/own-bank-output-export.js';

const decode=bytes=>new TextDecoder().decode(bytes);
const prepare=f=>prepareBankOutput(f.batch,f.accounts,f.profile,f.closes);
function fixture(){
 const f=bankOutputFixture(40);f.profile.destinationScope='nacion_ca';
 for(const [i,a]of f.accounts.configuration.definition.accounts.entries()){
  a.cbu=syntheticCbu((i<33?'011':i<37?'072':'191')+'0001',String(i+1).padStart(13,'0'));
  a.accountType=i>=30&&i<33?'CC':'CA';
  // Deliberately misleading labels must not route payments to an institution.
  a.bankLabel=i<33?'Entidad ficticia distinta':'Banco Nación';
  if(i>=26&&i<30||i===31)f.closes[0].snapshot.employees[i].jurisdiction.code='55';
 }
 f.closes[0].snapshotSha256=ownRunHash(f.closes[0].snapshot);
 f.batch.snapshot.sources[0].snapshotSha256=f.closes[0].snapshotSha256;
 f.batch.snapshotSha256=ownRunHash(f.batch.snapshot);return f;
}
test('Nación caja de ahorro is complete across pages and search, using CBU institution and approved account type',async()=>{
 const f=fixture(),r=await prepare(f);assert.equal(r.recordCount,40);assert.equal(r.selectedCount,26);assert.equal(r.ready,true);
 assert.equal(bankOutputPage(r,'',2).rows.length,15);assert.equal(bankOutputPage(r,'sintético 39').filtered,1);
 const lines=decode(createBankOutputTxt(r).bytes).split('\r\n');assert.equal(lines.length,29);assert.ok(lines.slice(0,-1).every(l=>l.length===200));
 assert.ok(lines.slice(1,-2).every(l=>l.slice(2,5)==='011'));assert.equal(BigInt(lines.at(-2).slice(16,23)),26n);
 assert.equal(BigInt(lines.at(-2).slice(1,16)),lines.slice(1,-2).reduce((n,l)=>n+BigInt(l.slice(24,34)),0n));
 assert.match(createBankOutputTxt(r).filename,/-nacion-ca-/);
 assert.equal(r.otherJurisdictionCount,5);assert.equal(r.otherBankCount,7);assert.equal(r.otherAccountTypeCount,2);
 assert.equal(r.rows.filter(x=>x.selectionReason==='Otro tipo de cuenta').length,2);
 assert.equal(decode(createBankOutputCsv(r).bytes).trimEnd().split('\r\n').length,41);
 assert.ok(decode(createBankOutputCsv(r).bytes).includes('Otra entidad bancaria'));
 f.profile.jurisdictionCode='55';const b=await prepare(f);assert.equal(b.selectedCount,4);assert.equal(sameBankOutput(r,b),false);
 assert.equal(new Set([...r.rows.filter(x=>x.selected),...b.rows.filter(x=>x.selected)].map(x=>x.contractId)).size,30);
});
test('unknown destination or Nación type on another jurisdiction blocks an incomplete Caja de Ahorro file',async()=>{
 const f=fixture();f.accounts.configuration.definition.accounts.pop();let r=await prepare(f);assert.ok(r.issues.includes('ACCOUNT_DESTINATION_UNKNOWN'));assert.equal(r.ready,false);assert.throws(()=>createBankOutputTxt(r),/parcial/);
 const g=fixture();g.accounts.configuration.definition.accounts[29].accountType=null;r=await prepare(g);assert.ok(r.issues.includes('ACCOUNT_TYPE_UNKNOWN'));assert.equal(r.ready,false);
 const h=fixture();h.accounts.configuration.definition.accounts.at(-1).accountType=null;assert.equal((await prepare(h)).ready,true,'unclassified other-bank type is retained in control without being guessed as Nación');
});
test('CC is an explicit other-type row; other-bank monetary defects remain visible and are never mistaken for selected payments',async()=>{
 const f=fixture();f.accounts.configuration.definition.accounts[30].currency='USD';const r=await prepare(f);assert.equal(r.ready,true);assert.ok(r.rows[30].issues.includes('CURRENCY_CHANGED'));assert.equal(r.rows[30].selected,false);
 const g=fixture();g.accounts.configuration.definition.accounts[0].currency='USD';assert.equal((await prepare(g)).ready,false);
 assert.throws(()=>bankOutputProfile({...f.profile,destinationScope:'nacion_cc'}),/destinos|Nación/);
 assert.throws(()=>bankOutputProfile({...f.profile,destinationScope:''}),/destinos|Nación/);
});
test('shared Nación destination across CA/CC or jurisdiction still requires explicit separate-payment decision',async()=>{
 const f=fixture();f.accounts.configuration.definition.accounts[31].cbu=f.accounts.configuration.definition.accounts[0].cbu;
 const r=await prepare(f);assert.equal(r.ready,false);assert.equal(r.repeatedDestinationCount,1);assert.ok(r.rows[0].issues.includes('REPEATED_DESTINATION'));
 f.profile.allowRepeatedDestinations=true;const b=await prepare(f);assert.equal(b.ready,true);assert.equal(b.selectedCount,26);
});
test('complete approved emission decision and explicit GT-all scope invalidate a previous Nación review',async()=>{
 const f=fixture(),r=await prepare(f);f.batch.review.reason='Otra decisión independiente sintética, mismo identificador';assert.equal(sameBankOutput(r,await prepare(f)),false);
 const g=fixture();g.profile.destinationScope='all';const b=await prepare(g);assert.equal(b.selectedCount,35);assert.equal(b.ready,true);assert.equal(sameBankOutput(r,b),false);
 assert.match(createBankOutputTxt(b).filename,/-todos-destinos-/);
});
test('Nación Excel retains all rows, original account literals, selection reasons and exact summaries without formulas',async()=>{
 const f=fixture();f.accounts.configuration.definition.accounts[0].accountNumber='000000001234';f.accounts.configuration.definition.accounts[0].bankLabel='=2+2';
 const r=await prepare(f);bankOutputPage(r,'sintético 39',2);const t=bankOutputTables(r);assert.equal(t.detail.length,41);assert.equal(t.detail[0].length,38);assert.ok(t.detail.every(row=>row.length===38));
 assert.equal(t.groups.reduce((n,g)=>n+g.recordCount,0),40);assert.equal(t.groups.reduce((n,g)=>n+BigInt(g.knownCents),0n).toString(),t.totalCents);
 assert.equal(t.detail.slice(1).filter(row=>row[34]==='Sí').length,26);assert.ok(t.detail.some(row=>row[35]==='Otra entidad bancaria'));
 const z=unzipSync(createBankOutputXlsx(r).bytes),detail=strFromU8(z['xl/worksheets/sheet1.xml']),control=strFromU8(z['xl/worksheets/sheet3.xml']);
 assert.match(detail,/A1:AL41/);assert.equal((detail.match(/<row /g)||[]).length,41);assert.ok(detail.includes('000000001234'));assert.ok(detail.includes('=2+2'));assert.ok(detail.includes('011'));
 assert.ok(!/<f>|<v>|t="n"/.test(detail));assert.ok(control.includes(r.accountsApprovalId));assert.ok(control.includes(r.receiptReviewId));assert.ok(control.includes(r.totalCents));
 const csv=decode(createBankOutputCsv(r).bytes);assert.ok(csv.includes('"\'=2+2"'));assert.ok(csv.includes('"\'011"'));assert.equal(csv.trimEnd().split('\r\n').length,41);
});
test('Nación control preserves unavailable destinations as observations but cannot download stale, unapproved, changed or reconstructed source',async()=>{
 const f=fixture();f.accounts.configuration.definition.accounts.pop();const r=await prepare(f);assert.equal(r.ready,false);assert.equal(bankOutputTables(r).detail.length,41);
 for(const change of [f=>{f.batch.state='prepared';f.batch.review=null;},f=>{f.batch.sourceCurrent=false;f.batch.permissions.canDownload=false;},f=>f.batch.permissions.canDownload=false,f=>f.accounts.sources.contracts.pop()]){const g=fixture();change(g);const unavailable=await prepare(g);assert.throws(()=>createBankOutputXlsx(unavailable),/emisión/);}
 assert.throws(()=>createBankOutputXlsx(structuredClone(r)),/emisión/);
});
