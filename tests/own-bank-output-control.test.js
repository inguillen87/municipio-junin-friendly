import test from 'node:test';import assert from 'node:assert/strict';import {unzipSync,strFromU8} from 'fflate';
import {bankOutputFixture,syntheticNet} from './fixtures/own-bank-output-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {prepareBankControl,prepareBankOutput,bankControlProfile,bankOutputPage,createBankOutputTxt,sameBankOutput} from '../assets/own-bank-output-model.js';
import {bankControlTables,bankControlMoney,createBankControlXlsx,createBankControlCsv} from '../assets/own-bank-output-export.js';
const prepare=f=>prepareBankControl(f.batch,f.accounts,{currency:'ARS',creditDate:f.profile.creditDate},f.closes);
const sheets=r=>{const files=unzipSync(createBankControlXlsx(r).bytes);return [1,2,3].map(i=>strFromU8(files['xl/worksheets/sheet'+i+'.xml']));};
function seal(f){for(const c of f.closes){c.snapshotSha256=ownRunHash(c.snapshot);f.batch.snapshot.sources.find(s=>s.id===c.groupId).snapshotSha256=c.snapshotSha256;}f.batch.snapshotSha256=ownRunHash(f.batch.snapshot);}

test('native control covers all pages with literal approved bank metadata and original departments, without a BNA agreement',async()=>{
 const f=bankOutputFixture(35);for(const[i,a]of f.accounts.configuration.definition.accounts.entries()){a.bankLabel=['Credicoop','Santander','Banco Nación'][i%3];a.accountType=i%2?'CC':'CA';a.accountNumber='00000001234';f.closes[0].snapshot.employees[i].departmentCode=f.batch.snapshot.records[i].departmentCode=i%2?'0002':'0003';if(i>=27)f.closes[0].snapshot.employees[i].jurisdiction.code='55';}
 for(const c of f.closes[0].snapshot.concepts)c.departmentCode=f.closes[0].snapshot.employees.find(e=>e.contractId===c.contractId).departmentCode;
 seal(f);const r=await prepare(f),t=bankControlTables(r);assert.equal(r.kind,'control');assert.equal(r.recordCount,35);assert.equal(bankOutputPage(r,'sintético 34').filtered,1);assert.equal(bankOutputPage(r,'',2).rows.length,10);
 assert.equal(t.groups.reduce((n,g)=>n+g.recordCount,0),35);assert.equal(t.groups.reduce((n,g)=>n+BigInt(g.knownCents),0n).toString(),t.totalCents);assert.ok(t.groups.some(g=>g.jurisdictionCode==='55'));
 const [detail,summary,control]=sheets(r);assert.equal((detail.match(/<row /g)||[]).length,36);assert.match(detail,/r="AG36"/);assert.match(detail,/<dimension ref="A1:AH36"\/>/);assert.match(detail,/00000001234/);assert.match(detail,/0003/);assert.match(summary,/Santander/);assert.match(control,/Toda la emisión aprobada/);assert.ok(control.includes(r.fingerprint));assert.ok(control.includes(r.accountsApprovalId));assert.throws(()=>createBankOutputTxt(r),/parcial/);
});
test('worksheet identifiers, names and extremely large amounts stay literal text without formulas, numeric cells or float loss',async()=>{
 const f=syntheticNet(bankOutputFixture(1),'9999999999999999999999.99');f.batch.snapshot.records[0].name='=HYPERLINK("https://invalid.test")';f.accounts.sources.contracts[0].name=f.batch.snapshot.records[0].name;f.accounts.configuration.definition.accounts[0].bankLabel='@SUM(1;2)&';f.batch.snapshotSha256=ownRunHash(f.batch.snapshot);
 const r=await prepare(f),t=bankControlTables(r),[detail,summary]=sheets(r);assert.equal(t.totalCents,'999999999999999999999999');assert.ok(detail.includes('9999999999999999999999.99'));assert.ok(summary.includes('9999999999999999999999.99'));assert.ok(detail.includes('=HYPERLINK(&quot;'));assert.ok(detail.includes('@SUM(1;2)&amp;'));assert.doesNotMatch(detail,/<f>|<v>|t="n"|externalLink/);
 const csv=new TextDecoder().decode(createBankControlCsv(r).bytes);assert.ok(csv.includes('"\'=HYPERLINK'));assert.ok(csv.includes('"\'@SUM'));assert.ok(csv.includes('"\'9999999999999999999999.99"'));assert.ok(csv.includes('"\'999999999999999999999999"'));
});
test('negative and zero native nets are retained in control and exact summaries without bank payment claims',async()=>{
 for(const [net,cents]of [['-0.01','-1'],['0.00','0']]){const r=await prepare(syntheticNet(bankOutputFixture(1),net)),t=bankControlTables(r);assert.equal(t.recordCount,1);assert.equal(t.totalCents,cents);assert.ok(r.rows[0].issues.includes('NON_POSITIVE'));assert.ok(sheets(r)[0].includes(net));assert.equal(r.paymentExecuted,false);assert.equal(r.bankSubmitted,false);assert.throws(()=>createBankOutputTxt(r));}
 assert.equal(bankControlMoney('-1'),'-0.01');assert.equal(bankControlMoney('1'),'0.01');
});
test('sub-cent values remain original, unresolved totals are not zero and insignificant trailing zeros remain exact',async()=>{
 const r=await prepare(syntheticNet(bankOutputFixture(1),'1.23000001')),t=bankControlTables(r);assert.equal(t.totalCents,null);assert.equal(t.knownCents,'0');assert.equal(t.groups[0].unresolvedNetCount,1);assert.equal(t.groups[0].totalCents,null);const [detail,summary,control]=sheets(r);assert.ok(detail.includes('1.23000001'));assert.match(summary,/No evaluable en centavos/);assert.match(control,/sin convertirlo en cero/);
 assert.equal(bankControlTables(await prepare(syntheticNet(bankOutputFixture(1),'1.23000000'))).totalCents,'123');
});
test('last-page missing account, unknown original jurisdiction and shared CBU remain independent complete observations',async()=>{
 const f=bankOutputFixture(35);f.accounts.configuration.definition.accounts.pop();f.accounts.configuration.definition.accounts[1].cbu=f.accounts.configuration.definition.accounts[0].cbu;f.closes[0].snapshot.employees.at(-1).jurisdiction.code=null;seal(f);const r=await prepare(f),t=bankControlTables(r);assert.equal(t.recordCount,35);assert.ok(t.groups.some(g=>g.bankLabel===null&&g.jurisdictionCode===null));assert.equal(t.groups.reduce((n,g)=>n+g.recordCount,0),35);assert.ok(r.rows.at(-1).issues.includes('ACCOUNT_MISSING'));assert.ok(r.rows.at(-1).issues.includes('JURISDICTION_MISSING'));assert.equal(r.rows.filter(e=>e.issues.includes('REPEATED_DESTINATION')).length,2);assert.equal((sheets(r)[0].match(/<row /g)||[]).length,36);
});
test('approved literal labels do not infer bank from CBU, transfer class or missing account type/number',async()=>{
 const f=bankOutputFixture(1),a=f.accounts.configuration.definition.accounts[0];a.bankLabel='Credicoop Otros declarado';a.accountType=null;a.accountNumber=null;const r=await prepare(f);assert.equal(r.rows[0].account.bankLabel,a.bankLabel);assert.equal(r.rows[0].account.accountType,null);assert.equal(r.rows[0].account.accountNumber,null);const t=bankControlTables(r);assert.equal(t.groups[0].bankLabel,a.bankLabel);assert.match(sheets(r)[0],/No informado/);assert.doesNotMatch(sheets(r)[0],/Caja de ahorro|Cuenta corriente/);
});
test('control cannot export unapproved, withdrawn, stale or identity-changed source and cannot reuse a reconstructed or BNA review',async()=>{
 for(const mutate of [f=>{f.batch.state='prepared';f.batch.review=null;},f=>{f.batch.sourceCurrent=false;f.batch.permissions.canDownload=false;},f=>{f.accounts.sources.contracts[0].registrationId='aaaaaaaa-0000-4000-8000-000000000001';},f=>{f.accounts.configuration={version:'a'.repeat(64),revision:0,definition:null,proposalId:null,approvalId:null};}]){const f=bankOutputFixture(1);mutate(f);const r=await prepare(f);assert.throws(()=>createBankControlXlsx(r),/aprobadas vigentes/);assert.throws(()=>createBankControlCsv(r));}
 const f=bankOutputFixture(1);f.batch.state='withdrawn';f.batch.review={...f.batch.review,decision:'withdrawn'};f.batch.permissions.canDownload=false;const withdrawn=await prepare(f);assert.throws(()=>createBankControlXlsx(withdrawn));
 const r=await prepare(bankOutputFixture(1)),b=bankOutputFixture(1),bna=await prepareBankOutput(b.batch,b.accounts,b.profile,b.closes);assert.throws(()=>createBankControlXlsx(structuredClone(r)));assert.throws(()=>createBankControlXlsx(bna));assert.throws(()=>bankControlProfile({currency:'ARS',creditDate:'2026-10-09',agreementCode:'1'}));
});
test('approved bank metadata revisions, export day and currency changes invalidate every previous control',async()=>{
 const f=bankOutputFixture(1),original=await prepare(f);assert.equal(sameBankOutput(original,await prepare(f)),true);
 for(const [field,value]of [['bankLabel','Banco distinto declarado'],['accountType','CC'],['accountNumber','0000987654321']]){const g=bankOutputFixture(1);g.accounts.configuration.definition.accounts[0][field]=value;assert.equal(sameBankOutput(original,await prepare(g)),false);}
 assert.equal(sameBankOutput(original,await prepareBankControl(f.batch,f.accounts,{currency:'ARS',creditDate:'2026-10-10'},f.closes)),false);assert.throws(()=>bankControlProfile({currency:'',creditDate:'2026-10-09'}));assert.throws(()=>bankControlProfile({currency:'ARS',creditDate:'2026-02-30'}));
});
test('source integrity still rejects changed departments or original close totals instead of deriving a modern assignment',async()=>{
 const f=bankOutputFixture(1);f.batch.snapshot.records[0].departmentCode='999';f.batch.snapshotSha256=ownRunHash(f.batch.snapshot);await assert.rejects(prepare(f),/participación original/);const g=bankOutputFixture(1);g.closes[0].snapshot.employees[0].totals.net='0.00';await assert.rejects(prepare(g),/integridad|contenido|concilia/);
});
test('monthly and supplementary approved groups keep original individual receipts and separate grouped totals',async()=>{
 const f=bankOutputFixture(1),other=structuredClone(f.closes[0]),id='aaaaaaaa-0000-4000-8000-000000000099';other.id=other.groupId=id;other.snapshot.liquidationType='supplementary';other.body.liquidationType='supplementary';other.bodySha256=ownRunHash(other.body);other.snapshotSha256=ownRunHash(other.snapshot);f.closes.push(other);
 f.batch.snapshot.params.types=['monthly','supplementary'];f.batch.snapshot.sources.push({...f.batch.snapshot.sources[0],id,type:'supplementary',snapshotSha256:other.snapshotSha256});f.batch.snapshot.records.push({...structuredClone(f.batch.snapshot.records[0]),sourceGroupId:id});f.batch.snapshot.recordCount=2;f.batch.snapshot.conceptCount*=2;f.batch.snapshotSha256=ownRunHash(f.batch.snapshot);
 const r=await prepare(f),t=bankControlTables(r);assert.equal(t.recordCount,2);assert.equal(t.groups.length,2);assert.deepEqual(t.groups.map(g=>g.liquidationType).sort(),['monthly','supplementary']);assert.equal(t.groups.reduce((n,g)=>n+g.recordCount,0),2);assert.equal(r.repeatedDestinationCount,1);assert.match(sheets(r)[0],/supplementary/);assert.throws(()=>createBankOutputTxt(r));
});
