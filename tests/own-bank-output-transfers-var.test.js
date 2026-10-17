import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {prepareTransfersVarOutput,createTransfersVarReviewTxt,createTransfersVarCsv,createTransfersVarXlsx,transfersVarPage,sameTransfersVarOutput,transfersVarProfile} from '../assets/own-bank-output-transfers-var.js';
import {BANK_PAYMENT_CHANNEL_VERSION} from '../assets/own-bank-accounts-model.js';
import {reviewTransfersVarFile} from '../assets/payroll-transfers-var-review.js';
import {generateBankMonthlyArtifact} from '../assets/payroll-bank-fixed-width-profiles.js';
import {bankOutputFixture,syntheticNet} from './fixtures/own-bank-output-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';

function fixture(count=35){
  const f=bankOutputFixture(count);f.profile={currency:'ARS',creditDate:'2026-10-09',reviewConfirmed:true,allowRepeatedDestinations:false};
  for(const [i,a]of f.accounts.configuration.definition.accounts.entries()){a.accountType='CA';a.paymentChannelVersion=BANK_PAYMENT_CHANNEL_VERSION;a.paymentChannel=i%3===0?'bank_payroll':'credicoop_transfers';}
  return f;
}
const prepare=f=>prepareTransfersVarOutput(f.batch,f.accounts,f.profile,f.closes);
const decode=a=>new TextDecoder('windows-1252').decode(a.bytes);
const hashBatch=f=>{f.batch.snapshotSha256=ownRunHash(f.batch.snapshot);};
function rename(f,index,name){f.batch.snapshot.records[index].name=name;f.accounts.sources.contracts[index].name=name;hashBatch(f);}
test('VAR167 uses every explicit channel in the complete own approved emission, not the bank label or search page',async()=>{
  const f=fixture(),r=await prepare(f);assert.equal(r.ready,true);assert.equal(r.recordCount,35);assert.equal(r.selectedCount,23);assert.equal(r.otherChannelCount,12);assert.equal(r.rows[1].account.cbu.slice(0,3),'999');
  assert.equal(transfersVarPage(r,'',2).rows.length,10);assert.equal(transfersVarPage(r,r.rows[1].employeeNumber,1).filtered,1);
  const out=await createTransfersVarReviewTxt(r),bytes=out.bytes;assert.equal(bytes.length,23*169);assert.deepEqual([...bytes.slice(-2)],[13,10]);
  const lines=decode(out).trimEnd().split('\r\n');assert.equal(lines.length,23);
  for(const [i,row]of r.rows.filter(v=>v.selected).entries()){const line=lines[i];assert.equal(line.length,167);assert.equal(line.slice(0,22),row.account.cbu);assert.equal(BigInt(line.slice(22,32)).toString(),row.cents);assert.equal(line.slice(32,54),row.cuil+' '.repeat(11));assert.equal(line.slice(54,94),row.name.padEnd(40,' '));assert.equal(line.slice(94,104),row.employeeNumber.padStart(10,'0'));assert.equal(line.slice(104,164),('HABERES '+Number(r.period.slice(5))+'-'+r.period.slice(0,4)).padEnd(60,' '));assert.equal(line.slice(164),'VAR');}
  const parsed=await reviewTransfersVarFile(bytes);assert.equal(parsed.matchesObservedFields,true);assert.equal(parsed.totalCents,r.totalCents);assert.equal(parsed.recordCount,r.selectedCount);assert.equal(out.officialSubmissionAllowed,false);assert.equal(out.officialGenerationAllowed,false);assert.equal(out.paymentExecuted,false);
});
test('the new compatibility writer does not unlock the existing unhomologated banking generator',()=>{assert.throws(()=>generateBankMonthlyArtifact({profileId:'transferencias-varias-167.observed.v1'}),e=>e.code==='BANK_PROFILE_FIELD_LAYOUT_NOT_HOMOLOGATED');});
test('855synthetic own closed receipts retain the complete570selected payments in one exact file',async()=>{
  const f=fixture(855),r=await prepare(f);assert.equal(r.recordCount,855);assert.equal(r.selectedCount,570);assert.equal(r.ready,true);assert.equal(transfersVarPage(r,'',35).rows.length,5);
  const out=await createTransfersVarReviewTxt(r),parsed=await reviewTransfersVarFile(out.bytes);assert.equal(out.bytes.length,570*169);assert.equal(parsed.recordCount,570);assert.equal(parsed.totalCents,r.rows.filter(v=>v.selected).reduce((n,v)=>n+BigInt(v.cents),0n).toString());assert.equal(new TextDecoder().decode(createTransfersVarCsv(r).bytes).trimEnd().split('\r\n').length,856);
});
test('Windows1252 names preserve accents and mapped bytes without UTF8 or silent transliteration',async()=>{
  const f=fixture(2);rename(f,1,'Muñoz José – “Prueba” €');const r=await prepare(f),out=await createTransfersVarReviewTxt(r),name=decode(out).slice(54,94);assert.equal(name.trimEnd(),f.batch.snapshot.records[1].name);assert.ok(out.bytes.includes(241)&&out.bytes.includes(233)&&out.bytes.includes(150)&&out.bytes.includes(128));assert.equal(out.bytes.length,169);
});
test('40byte names are preserved and longer or unmappable names stop the whole TXT without truncation',async()=>{
  const full=fixture(2);rename(full,1,'Á'.repeat(40));assert.equal((await createTransfersVarReviewTxt(await prepare(full))).bytes.length,169);
  for(const [name,code]of [['Á'.repeat(41),'VAR_NAME_WIDTH'],['Persona 😀','VAR_NAME_ENCODING']]){const f=fixture(2);rename(f,1,name);const r=await prepare(f);assert.equal(r.recordCount,2);assert.equal(r.ready,false);assert.ok(r.rows[1].issues.includes(code));await assert.rejects(createTransfersVarReviewTxt(r),/parcial/);assert.equal(decode(createTransfersVarCsv(r)).trimEnd().split('\r\n').length,3);}
});
test('legajo is the own original identifier padded only when representable, never swapped for DNI or UUID',async()=>{
  const f=fixture(2),r=await prepare(f),out=await createTransfersVarReviewTxt(r);assert.equal(decode(out).slice(94,104),r.rows[1].employeeNumber.padStart(10,'0'));
  const alpha=fixture(2);alpha.batch.snapshot.records[1].employeeNumber='PROPIO-X';hashBatch(alpha);await assert.rejects(prepare(alpha),/copia original v1 requiere un legajo numérico/);
  const a=fixture(2),record=a.batch.snapshot.records[1];a.batch.snapshot.version='own-receipt-snapshot.v2';a.batch.snapshot.identityBasis='owned_registration_verified_at_capture';record.employeeNumber='12345678901';a.accounts.sources.contracts[1].employeeNumber=record.employeeNumber;a.closes[0].snapshot.employees[1].employeeNumber=record.employeeNumber;for(const c of a.closes[0].snapshot.concepts.filter(c=>c.contractId===record.contractId))c.employeeNumber=record.employeeNumber;a.closes[0].snapshotSha256=ownRunHash(a.closes[0].snapshot);a.batch.snapshot.sources[0].snapshotSha256=a.closes[0].snapshotSha256;hashBatch(a);const bad=await prepare(a);assert.equal(bad.ready,false);assert.ok(bad.rows[1].issues.includes('VAR_EMPLOYEE_LAYOUT'));await assert.rejects(createTransfersVarReviewTxt(bad));
});
test('a missing account or unclassified channel after page25 blocks the complete selected file',async()=>{
  for(const mutate of [f=>f.accounts.configuration.definition.accounts.splice(30,1),f=>{delete f.accounts.configuration.definition.accounts[30].paymentChannel;delete f.accounts.configuration.definition.accounts[30].paymentChannelVersion;},f=>f.accounts.configuration.definition.accounts[30].paymentChannel=null]){const f=fixture();mutate(f);const r=await prepare(f);assert.equal(r.recordCount,35);assert.equal(r.ready,false);assert.ok(r.issues.some(c=>['ACCOUNT_DESTINATION_UNKNOWN','CHANNEL_UNDECLARED'].includes(c)));assert.equal(transfersVarPage(r,r.rows[1].employeeNumber).filtered,1);await assert.rejects(createTransfersVarReviewTxt(r));}
});
test('observed ten-position cents reject zero, negatives, fractional cents and overflow with no rounding',async()=>{
  for(const [net,code]of [['0.00','NON_POSITIVE'],['-0.01','NON_POSITIVE'],['1.23000001','FRACTIONAL_CENTS'],['100000000.00','VAR_AMOUNT_OVERFLOW']]){const f=fixture(1);f.accounts.configuration.definition.accounts[0].paymentChannel='credicoop_transfers';syntheticNet(f,net);const r=await prepare(f);assert.equal(r.recordCount,1);assert.equal(r.ready,false);assert.ok(r.rows[0].issues.includes(code));assert.equal(r.totalCents,null);await assert.rejects(createTransfersVarReviewTxt(r));}
  const f=fixture(1);f.accounts.configuration.definition.accounts[0].paymentChannel='credicoop_transfers';syntheticNet(f,'99999999.99000000');const out=await createTransfersVarReviewTxt(await prepare(f));assert.equal(decode(out).slice(22,32),'9999999999');assert.equal(out.totalCents,'9999999999');
});
test('shared destinations across channels require an explicit decision and never collapse original receipts',async()=>{
  const f=fixture(3);f.accounts.configuration.definition.accounts[1].cbu=f.accounts.configuration.definition.accounts[0].cbu;const a=await prepare(f);assert.equal(a.ready,false);assert.equal(a.repeatedDestinationCount,1);await assert.rejects(createTransfersVarReviewTxt(a));f.profile.allowRepeatedDestinations=true;const b=await prepare(f);assert.equal(b.ready,true);assert.equal(b.selectedCount,2);assert.equal((await createTransfersVarReviewTxt(b)).recordCount,2);assert.equal(sameTransfersVarOutput(a,b),false);
});
test('deterministic preparation and retries preserve every selected row, amount and source fingerprint',async()=>{
  const f=fixture(),a=await prepare(f),b=await prepare(f);assert.equal(sameTransfersVarOutput(a,b),true);const x=await createTransfersVarReviewTxt(a),y=await createTransfersVarReviewTxt(b);assert.deepEqual(x.bytes,y.bytes);assert.equal(x.sha256,y.sha256);assert.equal(x.reviewFingerprint,y.reviewFingerprint);
  const g=fixture();g.accounts.configuration.approvalId='aaaaaaaa-0000-4000-8000-000000099999';assert.equal(sameTransfersVarOutput(a,await prepare(g)),false);
  const h=fixture();h.accounts.configuration.definition.accounts[34].paymentChannel='bank_payroll';assert.equal(sameTransfersVarOutput(a,await prepare(h)),false);
});
test('unapproved, withdrawn, stale source, invalid identity or original-close changes prevent all exports',async()=>{
  for(const mutate of [f=>{f.batch.state='prepared';f.batch.review=null;f.batch.permissions.canDownload=false;},f=>{f.batch.state='withdrawn';f.batch.review.decision='withdrawn';f.batch.permissions.canDownload=false;},f=>{f.batch.sourceCurrent=false;f.batch.permissions.canDownload=false;},f=>f.accounts.sources.contracts[34].name='Otra identidad sintética']){const f=fixture();mutate(f);const r=await prepare(f);assert.equal(r.ready,false);await assert.rejects(createTransfersVarReviewTxt(r));assert.throws(()=>createTransfersVarCsv(r));assert.throws(()=>createTransfersVarXlsx(r));}
  const f=fixture();f.closes=[];await assert.rejects(prepare(f),/cierres/);
});
test('the control retains all35 receipts and trace while CSV and XLSX are literal and injection safe',async()=>{
  const f=fixture();rename(f,1,'=Persona sintética');const r=await prepare(f),csv=new TextDecoder().decode(createTransfersVarCsv(r).bytes);assert.equal(csv.trimEnd().split('\r\n').length,36);assert.ok(csv.includes('"\'=Persona sintética"'));assert.ok(csv.includes(r.rows[34].contractId));
  const book=unzipSync(createTransfersVarXlsx(r).bytes),sheet=strFromU8(book['xl/worksheets/sheet1.xml']),control=strFromU8(book['xl/worksheets/sheet3.xml']);assert.doesNotMatch(sheet,/<f>|t="n"/);assert.ok(control.includes(r.fingerprint));assert.ok(control.includes('admisión bancaria pendientes'));assert.equal(r.officialSubmissionAllowed,false);
});
test('empty selections and changed dates or currencies are observable, with no invented account or net',async()=>{
  const f=fixture(1),r=await prepare(f);assert.equal(r.ready,false);assert.equal(r.selectedCount,0);assert.equal(r.totalCents,null);assert.ok(r.issues.includes('EMPTY_SELECTION'));await assert.rejects(createTransfersVarReviewTxt(r));
  for(const patch of [{currency:'USD'},{creditDate:'2026-10-10'}]){const g=fixture(2);g.batch.snapshot.params.paymentDate='2026-10-09';hashBatch(g);Object.assign(g.profile,patch);const changed=await prepare(g);assert.equal(changed.ready,false);await assert.rejects(createTransfersVarReviewTxt(changed));}
  assert.throws(()=>transfersVarProfile({...f.profile,reviewConfirmed:false}));assert.throws(()=>transfersVarProfile({...f.profile,jurisdictionCode:'42'}));
});
test('a copied or tampered preview cannot acquire export authority and the original is deeply immutable',async()=>{
  const r=await prepare(fixture(2)),copy=structuredClone(r);await assert.rejects(createTransfersVarReviewTxt(copy));assert.throws(()=>createTransfersVarCsv(copy));assert.throws(()=>createTransfersVarXlsx(copy));assert.equal(sameTransfersVarOutput(r,copy),false);assert.throws(()=>{r.rows[1].cents='1';},TypeError);
});
