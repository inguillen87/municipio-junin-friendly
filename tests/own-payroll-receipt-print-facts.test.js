// Receipt v6 reader gates (OWN_RECEIPT_V6_CONTRACT_20261113): frozen print facts are verified against the official record that
// carries them, earlier versions keep rejecting them, and the PDF prints only what was conserved. Synthetic corpus only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ownReceiptAttempt,ownReceiptCommand,ownReceiptEvent,ownReceiptPrepareBody,ownReceiptRecord,ownReceiptSnapshot,ownReceiptSelf,ownReceiptVerifyHash,verifiedOwnReceiptPreview,verifiedOwnReceiptSelf,verifiedOwnReceiptSnapshot} from '../assets/own-payroll-receipt-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {createOwnReceiptPdf} from '../assets/own-payroll-receipt-pdf.js';
import {OWN_RECEIPT_PRINT_FACTS_VERSION,ownReceiptDeclaredAccountText,ownReceiptMaskedAccount,ownReceiptPrintFacts,ownReceiptPrintedQuantities,ownReceiptQuantityText} from '../assets/own-payroll-receipt-print-facts.js';

const corpus=JSON.parse(readFileSync(new URL('./fixtures/own-payroll-consumer-corpus.json',import.meta.url),'utf8')).cases;
const hash=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
const uid=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0');
const select=name=>structuredClone(corpus.find(one=>one.name===name));
const PAYMENT_DATE='2026-11-05';

// Print facts as a producer must freeze them: one unit per printed concept, in order, copied from the verified quantities.
function facts(record,{destination=true,employment=true}={}){
 const quantities=new Map(record.quantities.map(quantity=>[quantity.conceptCode,quantity]));
 return {version:OWN_RECEIPT_PRINT_FACTS_VERSION,frozenAt:'2026-11-11T15:00:00Z',
  units:record.concepts.map(concept=>({rowKey:record.contractId+':concept:'+concept.code,quantity:structuredClone(quantities.get(concept.code)??null)})),
  employmentStartDate:employment?'2019-03-01':null,
  classification:employment?{categoryCode:'8',categoryLabel:'Clase 8 sintética',jobTitle:'Auxiliar administrativo sintético',positionStructure:null}:{categoryCode:null,categoryLabel:null,jobTitle:null,positionStructure:null},
  paymentDestination:destination?{bankLabel:'Banco sintético de prueba',accountType:'CA',accountNumberMasked:'**********4321',currency:'ARS',referenceDate:PAYMENT_DATE}:null,
  sources:{runId:record.runId,payloadSha256:record.payloadSha256,inputSha256:record.inputSha256,resultSha256:record.resultSha256,employmentEvidenceSha256:employment?'b'.repeat(64):null,
   bankConfigurationVersion:destination?'c'.repeat(64):null,bankApprovalId:destination?uid(41):null}};
}
function snapshot(one,{version='own-receipt-snapshot.v6',options,withFacts=true}={}){
 const record=structuredClone(one.receiptRecord);
 if(withFacts)record.printFacts=facts(record,options);
 return {version,params:{period:'2026-10',types:['monthly'],filters:{employeeFrom:'',employeeTo:'',agreementFrom:'',agreementTo:'',departmentFrom:'',departmentTo:''},issuer:{name:'SYNTHETIC QA MUNICIPALITY',taxId:'30990000001',address:'SYNTHETIC ADDRESS 123'},paymentDate:PAYMENT_DATE,legend:'Synthetic QA only'},sourceVersion:'a'.repeat(64),
  sources:[{id:record.sourceGroupId,snapshotSha256:hash(one.close),period:'2026-10',type:'monthly',employeeCount:one.close.employeeCount,populationCount:one.close.populationCount,selectedCount:1}],records:[record],recordCount:1,conceptCount:record.concepts.length,
  economicConceptCount:record.economicConceptCount,omittedRowCount:record.omittedRowCount,identityBasis:'owned_registration_verified_at_capture',paymentDateBasis:'declared',signatureState:'pending',payrollPosted:false,paymentExecuted:false};
}
const batch=value=>({version:'own-receipt-batch.v1',id:uid(1),preparedAt:'2026-11-11T15:00:00Z',preparedBy:'Synthetic maker',snapshot:value,snapshotSha256:hash(value),state:'prepared',sourceCurrent:true,review:null,permissions:{canApprove:true,canWithdraw:true,canDownload:true}});
const pdfText=pdf=>[...Buffer.from(pdf.bytes).toString().matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('|');

for(const one of corpus)test(one.name+': a v6 copy with frozen print facts validates without mutation',()=>{
 const value=snapshot(one),original=salarySerialized(value);
 assert.equal(ownReceiptSnapshot(value),value);assert.equal(ownReceiptRecord(value.records[0]),value.records[0]);assert.equal(salarySerialized(value),original);
});
test('v6 does not rename the calculation: v4 and v5 originals are both admitted with their own evidence',()=>{
 for(const name of ['legacy_v4_unchanged','eligible_positive']){const value=snapshot(select(name));ownReceiptSnapshot(value);assert.match(value.records[0].inputVersion,/^own-payroll-input\.v[45]$/);assert.equal(value.records[0].resultVersion,value.records[0].inputVersion.replace('input','result'));}
});
test('versions and fields are never mixed: v4/v5 reject print facts and v6 requires them on every official record',()=>{
 for(const name of ['legacy_v4_unchanged','eligible_positive']){
  const one=select(name),earlier=one.receiptRecord.inputVersion==='own-payroll-input.v5'?'own-receipt-snapshot.v5':'own-receipt-snapshot.v4';
  ownReceiptSnapshot(snapshot(one,{version:earlier,withFacts:false}));
  assert.throws(()=>ownReceiptSnapshot(snapshot(one,{version:earlier})));
  assert.throws(()=>ownReceiptSnapshot(snapshot(one,{withFacts:false})));
 }
 assert.throws(()=>ownReceiptSnapshot(snapshot(select('eligible_positive'),{version:'own-receipt-snapshot.v7'})));
});
test('the emission hash covers the print facts',async()=>{
 const value=snapshot(select('eligible_positive')),preview={version:'own-receipt-preview.v1',scopeVersion:'a'.repeat(64),snapshot:value,snapshotSha256:hash(value),permissions:{canPrepare:true}};
 await verifiedOwnReceiptPreview(preview);
 preview.snapshot.records[0].printFacts.classification.jobTitle='Otro cargo sintético';
 await assert.rejects(()=>verifiedOwnReceiptPreview(preview));
});
test('units are the exact copy of the verified quantities, one per printed concept and in order',()=>{
 const record=()=>{const r=select('eligible_positive').receiptRecord;r.printFacts=facts(r);return r;};
 const ok=record();ownReceiptRecord(ok);
 // The corpus prints concept 48 without a quantity: the calculation produced none, so it stays null.
 assert.equal(ok.printFacts.units.find(unit=>unit.rowKey.endsWith(':concept:48')).quantity,null);
 assert.notEqual(ok.printFacts.units.find(unit=>unit.rowKey.endsWith(':concept:1')).quantity,null);
 for(const [name,mutate] of [
  ['unit removed',f=>f.units.pop()],
  ['unit added',f=>f.units.push({rowKey:f.units[0].rowKey,quantity:null})],
  ['order changed',f=>f.units.reverse()],
  ['row of another contract',f=>f.units[0].rowKey=uid(777)+':concept:1'],
  ['quantity value changed',f=>f.units[0].quantity.value={numerator:'31',denominator:'1'}],
  ['quantity unit changed',f=>f.units[0].quantity.unit='hours'],
  ['quantity hidden although the calculation produced it',f=>f.units[0].quantity=null],
  ['quantity invented for a concept without one',f=>f.units.find(unit=>unit.rowKey.endsWith(':concept:48')).quantity=structuredClone(f.units[0].quantity)],
  ['unexpected field in a unit',f=>f.units[0].amount='1.00'],
 ]){const r=record();mutate(r.printFacts);assert.throws(()=>ownReceiptRecord(r),undefined,name);}
});
test('employment facts need the frozen evidence that backs them; an absent fact is null, not corruption',()=>{
 const base=()=>{const r=select('eligible_positive').receiptRecord;r.printFacts=facts(r);return r;};
 const absent=select('eligible_positive').receiptRecord;absent.printFacts=facts(absent,{employment:false,destination:false});ownReceiptRecord(absent);
 for(const [name,mutate] of [
  ['impossible civil date',f=>f.employmentStartDate='2019-02-30'],
  ['timestamp instead of a civil date',f=>f.employmentStartDate='2019-03-01T00:00:00Z'],
  ['date without evidence',f=>f.sources.employmentEvidenceSha256=null],
  ['classification field missing',f=>delete f.classification.positionStructure],
  ['classification with an unexpected field',f=>f.classification.points=12],
  ['blank classification text',f=>f.classification.jobTitle='  '],
  ['evidence that is not a hash',f=>f.sources.employmentEvidenceSha256='b'.repeat(63)],
 ]){const r=base();mutate(r.printFacts);assert.throws(()=>ownReceiptRecord(r),undefined,name);}
});
test('the declared account is masked, pinned to its approved revision and to the declared payment date',()=>{
 for(const [value,expected] of [['**********4321',true],['****',true],['*4321',true],['1234567890',false],['******54321',false],['4321',false],['**** 4321',false],['',false],[null,false],['*******78/9',true],['***********-123',true],['**12',false],['***',true],['1',false],['*'.repeat(36)+'4321',true],['*'.repeat(37)+'4321',false],['****<321',false],[' ***4321',false]])assert.equal(ownReceiptMaskedAccount(value),expected,String(value));
 // The producer's rule, written again here as PostgreSQL applies it (char_length and right count characters, not
 // UTF-16 units): mask everything but the last four characters; four or fewer are fully hidden.
 const produced=number=>{const characters=Array.from(number);return characters.length<=4?'*'.repeat(characters.length):'*'.repeat(characters.length-4)+characters.slice(-4).join('');};
 for(const number of ['7','12','123','1234','12345','123-456789/0','4-123-0009876543-2','0000123456789012345678','A1B2C3D4E5','1'.repeat(40),'12 34 56 78',
  '12345\u{1F600}678','\u{1F600}\u{1F600}','12\u{1F600}4','9'.repeat(36)+'\u{1F600}\u{1F600}\u{1F600}\u{1F600}','1234\u00f1567','12345678\u00a0']){
  const masked=produced(number);
  assert.equal(ownReceiptMaskedAccount(masked),true,masked);
  assert.equal(Array.from(masked).length,Array.from(number).length);
  if(Array.from(number).length>4)assert.equal(ownReceiptMaskedAccount(number),false,number);
 }
 // The synthetic number of the review: five hidden characters and the last four as they are, one of them outside the BMP.
 assert.equal(produced('12345\u{1F600}678'),'*****\u{1F600}678');
 assert.equal(ownReceiptMaskedAccount('*****\u{1F600}678'),true);
 // Forty characters is the declared limit even when they take more than forty UTF-16 units; forty-one is not admitted.
 assert.equal(ownReceiptMaskedAccount('*'.repeat(36)+'\u{1F600}\u{1F600}\u{1F600}\u{1F600}'),true);
 assert.equal(ownReceiptMaskedAccount('*'.repeat(37)+'\u{1F600}\u{1F600}\u{1F600}\u{1F600}'),false);
 // Four or fewer characters stay fully hidden also when one is outside the BMP; a decomposed (non-NFC) tail is not text.
 assert.equal(ownReceiptMaskedAccount('**\u{1F600}*'),false);
 assert.equal(ownReceiptMaskedAccount('*****1n\u0303 2'),false);
 assert.equal(ownReceiptMaskedAccount('*****12\u202e3'),false);
 const base=()=>snapshot(select('eligible_positive'));
 ownReceiptSnapshot(base());
 const unnumbered=base();unnumbered.records[0].printFacts.paymentDestination.accountNumberMasked=null;ownReceiptSnapshot(unnumbered);
 for(const [name,mutate] of [
  ['unmasked account number',s=>s.records[0].printFacts.paymentDestination.accountNumberMasked='0170099220000067890123'],
  ['five visible characters',s=>s.records[0].printFacts.paymentDestination.accountNumberMasked='*****54321'],
  ['destination without approved revision',s=>s.records[0].printFacts.sources.bankApprovalId=null],
  ['destination without configuration version',s=>s.records[0].printFacts.sources.bankConfigurationVersion=null],
  ['approved revision without destination',s=>s.records[0].printFacts.paymentDestination=null],
  ['destination of another date',s=>s.records[0].printFacts.paymentDestination.referenceDate='2026-11-06'],
  ['destination without declared payment date',s=>s.params.paymentDate=null],
  ['full account data smuggled',s=>s.records[0].printFacts.paymentDestination.cbu='0170099220000067890123'],
  ['bank label missing',s=>s.records[0].printFacts.paymentDestination.bankLabel=null],
  ['account type outside the approved definition',s=>s.records[0].printFacts.paymentDestination.accountType='Caja de ahorro'],
  ['account type that is an inherited key',s=>s.records[0].printFacts.paymentDestination.accountType='constructor'],
  ['account type missing instead of null',s=>delete s.records[0].printFacts.paymentDestination.accountType],
  ['currency outside the approved definition',s=>s.records[0].printFacts.paymentDestination.currency='EUR'],
  ['currency missing',s=>s.records[0].printFacts.paymentDestination.currency=null],
  ['masked number longer than an account number',s=>s.records[0].printFacts.paymentDestination.accountNumberMasked='*'.repeat(37)+'4321'],
 ]){const s=base();mutate(s);assert.throws(()=>ownReceiptSnapshot(s),undefined,name);}
 // What the producer can write and v6 must read: an undeclared type, a current account, dollars, separators in the tail.
 for(const patch of [{accountType:null},{accountType:'CC'},{currency:'USD'},{accountNumberMasked:'*******78/9'},{accountType:null,accountNumberMasked:null}]){
  const s=base();Object.assign(s.records[0].printFacts.paymentDestination,patch);ownReceiptSnapshot(s);
 }
 assert.equal(ownReceiptDeclaredAccountText({bankLabel:'Banco sintético',accountType:'CA',accountNumberMasked:'******4321',currency:'ARS',referenceDate:PAYMENT_DATE}),'Banco sintético · Caja de ahorro · ******4321 · ARS');
 assert.equal(ownReceiptDeclaredAccountText({bankLabel:'Banco sintético',accountType:'CC',accountNumberMasked:null,currency:'USD',referenceDate:PAYMENT_DATE}),'Banco sintético · Cuenta corriente · número no informado · USD');
 assert.equal(ownReceiptDeclaredAccountText({bankLabel:'Banco sintético',accountType:null,accountNumberMasked:'****',currency:'ARS',referenceDate:PAYMENT_DATE}),'Banco sintético · **** · ARS');
 assert.equal(ownReceiptDeclaredAccountText(null),'');
});
test('print facts belong to the same original calculation and admit no extra field',()=>{
 const base=()=>{const r=select('days14_both_omitted').receiptRecord;r.printFacts=facts(r);return r;};
 ownReceiptRecord(base());
 for(const [name,mutate] of [
  ['another run',f=>f.sources.runId=uid(555)],
  ['another payload',f=>f.sources.payloadSha256='f'.repeat(64)],
  ['another input',f=>f.sources.inputSha256='f'.repeat(64)],
  ['another result',f=>f.sources.resultSha256='f'.repeat(64)],
  ['unknown facts version',f=>f.version='own-receipt-print-facts.v2'],
  ['invalid freeze time',f=>f.frozenAt='ayer'],
  ['unexpected top-level field',f=>f.depositConfirmed=true],
  ['unexpected source field',f=>f.sources.currentEmploymentId=uid(9)],
 ]){const r=base();mutate(r.printFacts);assert.throws(()=>ownReceiptRecord(r),undefined,name);}
 // Print facts never touch what v4/v5 already protect.
 const tampered=base();tampered.totals.net='999.99';assert.throws(()=>ownReceiptRecord(tampered));
 const omitted=base();assert.equal(omitted.omittedRowCount,2);assert.equal(omitted.printFacts.units.length,omitted.concepts.length);
 assert.ok(!omitted.printFacts.units.some(unit=>/:concept:30[26]$/.test(unit.rowKey)));
});
test('a quantity prints exactly: finite decimals as decimals, anything else as its fraction, nothing when absent',()=>{
 const q=(unit,value,extra={})=>({unit,stage:'exact',value,decimalValue:null,...extra});
 assert.equal(ownReceiptQuantityText(null),'');
 assert.equal(ownReceiptQuantityText(q('days',{numerator:'30',denominator:'1'})),'30 d');
 assert.equal(ownReceiptQuantityText(q('units',{numerator:'0',denominator:'1'})),'0');
 assert.equal(ownReceiptQuantityText(q('hours',{numerator:'1',denominator:'2'})),'0,5 h');
 assert.equal(ownReceiptQuantityText(q('percent',{numerator:'745',denominator:'10'})),'74,5 %');
 assert.equal(ownReceiptQuantityText(q('days',{numerator:'1',denominator:'3'})),'1/3 d');
 assert.equal(ownReceiptQuantityText(q('coefficient',{numerator:'-7',denominator:'8'})),'-0,875');
 assert.equal(ownReceiptQuantityText(q('minutes',{numerator:'12345',denominator:'1'})),'12.345 min');
 assert.equal(ownReceiptQuantityText(q('units',{numerator:'6',denominator:'4'})),'1,5');
 assert.equal(ownReceiptQuantityText({unit:'hours',stage:'rounded',value:{numerator:'25',denominator:'2'},decimalValue:'12.50'}),'12,5 h');
 assert.throws(()=>ownReceiptQuantityText(q('years',{numerator:'1',denominator:'1'})));
 assert.throws(()=>ownReceiptQuantityText(q('days',{numerator:'1',denominator:'0'})));
 assert.equal(ownReceiptPrintedQuantities(select('eligible_positive').receiptRecord),null);
});
test('the PDF prints the conserved facts and never an unmasked account; earlier versions print as before',async()=>{
 const one=select('eligible_positive'),value=snapshot(one),text=pdfText(await createOwnReceiptPdf(batch(value)));
 for(const expected of ['Cant.','30 d','Ingreso','01/03/2019','8 \xb7 Clase 8 sint\xe9tica','Auxiliar administrativo sint\xe9tico','Sin dato conservado','**********4321','vigente al 05/11/2026'])assert.ok(text.includes(expected),expected);
 assert.ok(text.includes('Cuenta de acreditaci\xf3n declarada'));assert.ok(!text.includes('han sido depositados'));assert.ok(text.includes('no acredita'));
 // The note states what the selection proves: an approved revision whose informed validity covers that date. It does not
 // say the approval existed on that date.
 assert.ok(text.includes('Cuenta declarada en una revisi\xf3n aprobada, con vigencia informada para esa fecha'));assert.ok(!text.includes('aprobada a esa fecha'));
 const earlier=snapshot(one,{version:'own-receipt-snapshot.v5',withFacts:false}),before=pdfText(await createOwnReceiptPdf(batch(earlier)));
 for(const absent of ['Cant.','Ingreso','Cuenta de acreditaci\xf3n declarada'])assert.ok(!before.includes(absent),absent);
 // Without a destination or employment evidence nothing is invented.
 const bare=snapshot(one,{options:{destination:false,employment:false}}),bareText=pdfText(await createOwnReceiptPdf(batch(bare)));
 assert.ok(!bareText.includes('Cuenta de acreditaci\xf3n declarada'));assert.ok(bareText.includes('Sin dato conservado'));assert.ok(bareText.includes('30 d'));
});
test('self service reads a v6 record of one agent and rejects an account of another payment date',async()=>{
 const s=snapshot(select('days14_both_omitted'));await verifiedOwnReceiptSnapshot(s);
 const item={batchId:uid(2),preparedAt:'2026-11-11T15:00:00Z',approvedAt:'2026-11-11T15:01:00Z',params:{period:s.params.period,issuer:s.params.issuer,paymentDate:PAYMENT_DATE,legend:s.params.legend},record:s.records[0],source:{id:s.sources[0].id,snapshotSha256:s.sources[0].snapshotSha256,period:'2026-10',type:'monthly'},signatureState:'pending',paymentDateBasis:'declared',payrollPosted:false,paymentExecuted:false};
 const self={version:'own-receipt-self.v1',items:[item]};assert.equal(ownReceiptSelf(self),self);
 const text=pdfText(await createOwnReceiptPdf(self,{self:true}));assert.ok(text.includes('14 d'));assert.ok(text.includes('**********4321'));
 const moved=structuredClone(self);moved.items[0].params.paymentDate='2026-11-07';assert.throws(()=>ownReceiptSelf(moved));
});
test('the validator returns the same facts object and never completes a missing one',()=>{
 const record=select('eligible_positive').receiptRecord;record.printFacts=facts(record,{employment:false,destination:false});
 const before=salarySerialized(record.printFacts);assert.equal(ownReceiptPrintFacts(record),record.printFacts);assert.equal(salarySerialized(record.printFacts),before);
 assert.equal(record.printFacts.employmentStartDate,null);assert.equal(record.printFacts.paymentDestination,null);
});

// Transport of a v6 preparation (TRANSPORT_CONTRACT of the candidate producer): two closed command shapes.
const previewOf=value=>({version:'own-receipt-preview.v1',scopeVersion:'a'.repeat(64),snapshot:value,snapshotSha256:hash(value),permissions:{canPrepare:true}});
const REASON='Preparación sintética para revisión';
test('preparing a v6 copy carries the hash of the verified preview; earlier versions keep the eight keys',()=>{
 const v6=previewOf(snapshot(select('eligible_positive'))),body=ownReceiptPrepareBody(v6,REASON);
 assert.deepEqual(Object.keys(body),['command','scopeVersion','sourceVersion','params','batchId','batchSha256','reason','reviewConfirmed','previewSha256']);
 assert.equal(body.previewSha256,v6.snapshotSha256);
 assert.equal(body.previewSha256,hash(v6.snapshot));
 assert.deepEqual({...body,previewSha256:undefined},{command:'prepare',scopeVersion:v6.scopeVersion,sourceVersion:v6.snapshot.sourceVersion,params:v6.snapshot.params,batchId:null,batchSha256:null,reason:REASON,reviewConfirmed:false,previewSha256:undefined});
 ownReceiptCommand(body);
 for(const version of ['own-receipt-snapshot.v4','own-receipt-snapshot.v5']){
  const one=select(version.endsWith('v5')?'days14_both_omitted':'legacy_v4_unchanged'),earlier=previewOf(snapshot(one,{version,withFacts:false}));
  const plain=ownReceiptPrepareBody(earlier,REASON);
  assert.deepEqual(Object.keys(plain),['command','scopeVersion','sourceVersion','params','batchId','batchSha256','reason','reviewConfirmed'],version);
  ownReceiptCommand(plain);
 }
 // The helper only builds from a preview that validates: a copy without its facts is not a v6 preview.
 assert.throws(()=>ownReceiptPrepareBody(previewOf(snapshot(select('eligible_positive'),{withFacts:false})),REASON));
 assert.throws(()=>ownReceiptPrepareBody(null,REASON));
});
test('the ninth key is a closed shape, not an optional flag: only on prepare, only a complete hash, nothing else added',()=>{
 const prepare=ownReceiptPrepareBody(previewOf(snapshot(select('eligible_positive'))),REASON);
 const decision={command:'approve',scopeVersion:'a'.repeat(64),sourceVersion:'a'.repeat(64),params:null,batchId:uid(7),batchSha256:'d'.repeat(64),reason:REASON,reviewConfirmed:true};
 ownReceiptCommand(decision);ownReceiptCommand({...decision,command:'withdraw'});
 for(const [name,body] of [
  ['approve with the preview hash',{...decision,previewSha256:'e'.repeat(64)}],
  ['withdraw with the preview hash',{...decision,command:'withdraw',previewSha256:'e'.repeat(64)}],
  ['short hash',{...prepare,previewSha256:'e'.repeat(63)}],
  ['uppercase hash',{...prepare,previewSha256:'E'.repeat(64)}],
  ['null hash',{...prepare,previewSha256:null}],
  ['undefined hash',{...prepare,previewSha256:undefined}],
  ['hash as a number',{...prepare,previewSha256:1}],
  ['a tenth key',{...prepare,previewVersion:'own-receipt-snapshot.v6'}],
  ['another ninth key',{...Object.fromEntries(Object.entries(prepare).filter(([key])=>key!=='previewSha256')),snapshotSha256:prepare.previewSha256}],
  ['a key missing',Object.fromEntries(Object.entries(prepare).filter(([key])=>key!=='reason'))],
 ])assert.throws(()=>ownReceiptCommand(body),undefined,name);
 for(const value of [null,undefined,'prepare',[]])assert.throws(()=>ownReceiptCommand(value));
});
test('a pending attempt and its confirmation keep the exact body that was sent, with or without the ninth key',()=>{
 const body=ownReceiptPrepareBody(previewOf(snapshot(select('eligible_positive'))),REASON),attempt=ownReceiptAttempt(uid(9),body,'synthetic-account');
 assert.equal(salarySerialized(attempt.body),salarySerialized(body));
 assert.ok(Object.isFrozen(attempt.body)&&Object.hasOwn(attempt.body,'previewSha256'));
 const event={version:'own-receipt-event.v1',id:uid(10),key:uid(9),body:structuredClone(body),bodySha256:hash(body),batchId:uid(10),recordedAt:'2026-11-11T15:00:00Z',replayed:false};
 ownReceiptEvent(event,attempt);
 // A confirmation that lost or gained the hash is another body: it does not confirm this attempt.
 const lost=structuredClone(event);delete lost.body.previewSha256;assert.throws(()=>ownReceiptEvent(lost,attempt));
 const changed=structuredClone(event);changed.body.previewSha256='f'.repeat(64);assert.throws(()=>ownReceiptEvent(changed,attempt));
 const earlier={...body};delete earlier.previewSha256;
 const plainAttempt=ownReceiptAttempt(uid(11),earlier,'synthetic-account'),gained=structuredClone(event);gained.key=uid(11);
 assert.throws(()=>ownReceiptEvent(gained,plainAttempt));
});
test('a v6 copy is shown only after its original economic evidence verifies, exactly like v4 and v5',async()=>{
 for(const version of ['own-receipt-snapshot.v6','own-receipt-snapshot.v5']){
  const value=snapshot(select('tariff_v2_days14_unread_null'),{version,withFacts:version.endsWith('v6')});
  await ownReceiptVerifyHash(value,hash(value));
  // One amount of the conserved tariff table is changed and the copy hash is recomputed. Every synchronous check still
  // agrees (this agent did not read that row): only recomputing the original evidence against its own hash can tell.
  const forged=structuredClone(value),metadata=forged.records[0].sourceEvidence.familyTariffCaptureMetadata;
  assert.ok(metadata?.policies[0].rows.length,'the synthetic case conserves a tariff table');
  metadata.policies[0].rows[0].amount='2800.01';
  ownReceiptSnapshot(forged);
  // The rejection comes from the economic verifier, not from the outer hash (which matches).
  await assert.rejects(()=>ownReceiptVerifyHash(forged,hash(forged)),/tarifaria cerrada no conserva su huella original/,version);
  await assert.rejects(()=>verifiedOwnReceiptPreview(previewOf(forged)),/tarifaria cerrada no conserva su huella original/,version);
  await assert.rejects(()=>createOwnReceiptPdf(batch(forged)),/tarifaria cerrada no conserva su huella original/,version);
  await assert.rejects(()=>verifiedOwnReceiptSnapshot(forged),/tarifaria cerrada no conserva su huella original/,version);
  // Self service keeps its own asynchronous verification, for a v6 record too.
  const item=record=>({version:'own-receipt-self.v1',items:[{batchId:uid(2),preparedAt:'2026-11-11T15:00:00Z',approvedAt:'2026-11-11T15:01:00Z',params:{period:value.params.period,issuer:value.params.issuer,paymentDate:PAYMENT_DATE,legend:value.params.legend},record,source:{id:value.sources[0].id,snapshotSha256:value.sources[0].snapshotSha256,period:'2026-10',type:'monthly'},signatureState:'pending',paymentDateBasis:'declared',payrollPosted:false,paymentExecuted:false}]});
  await verifiedOwnReceiptSelf(item(value.records[0]));
  ownReceiptSelf(item(forged.records[0]));
  await assert.rejects(()=>verifiedOwnReceiptSelf(item(forged.records[0])),/tarifaria cerrada no conserva su huella original/,version);
  await assert.rejects(()=>createOwnReceiptPdf(item(forged.records[0]),{self:true}),/tarifaria cerrada no conserva su huella original/,version);
  // The case proposed in the review, a different policy hash with only the copy hash recomputed, never reaches the
  // asynchronous step: the conserved decisions name the policy hash, so the synchronous reader already rejects it.
  const repinned=structuredClone(value);repinned.records[0].sourceEvidence.familyTariffCaptureMetadata.policySha256='f'.repeat(64);
  assert.throws(()=>ownReceiptSnapshot(repinned),/decisiones tarifarias no coinciden/,version);
  await assert.rejects(()=>verifiedOwnReceiptPreview(previewOf(repinned)),/decisiones tarifarias no coinciden/,version);
 }
});
test('the frozen instant is a real calendar instant: impossible dates and hours are rejected, not normalized',()=>{
 const base=()=>{const r=select('days14_both_omitted').receiptRecord;r.printFacts=facts(r);return r;};
 for(const value of ['2028-02-29T10:00:00Z','2026-11-13T10:00:00.000000Z','2026-11-13T07:00:00-03:00','2026-11-13T10:00:00.5Z','2026-12-31T23:59:59.999999Z','2026-01-01T00:00:00+00:00','2026-11-13T23:00:00+14:00']){
  const r=base();r.printFacts.frozenAt=value;assert.equal(ownReceiptRecord(r).printFacts.frozenAt,value,value);
 }
 for(const value of ['2026-02-30T10:00:00.000000Z','2027-02-29T10:00:00Z','2026-04-31T00:00:00Z','2026-00-10T00:00:00Z','2026-13-01T00:00:00Z','2026-11-00T00:00:00Z','2026-11-13T24:00:00Z','2026-11-13T23:60:00Z','2026-11-13T10:00:60Z','2026-11-13T10:00:00+24:00','2026-11-13T10:00:00-03:60',
  '2026-11-13T10:00:00','2026-11-13 10:00:00Z','2026-11-13T10:00:00.1234567Z','2026-11-13T10:00Z','1826-11-13T10:00:00Z','2026-11-13','',null,1794574800000]){
  const r=base();r.printFacts.frozenAt=value;assert.throws(()=>ownReceiptRecord(r),/datos de impresión conservados/,String(value));
 }
});
