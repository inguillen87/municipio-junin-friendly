// Geometry of the receipt quantity column. A quantity that fits the standard column is drawn exactly as before; one that
// does not fit even at 6 pt widens the column towards the label (which wraps) and is never cut; only when the label would
// keep less than the minimum does the row stop the document, naming the concept and, on a receipt page, the legajo.
// Synthetic corpus only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OWN_PDF_QUANTITY_COLUMN,OWN_PDF_QUANTITY_GAP,OWN_PDF_QUANTITY_MIN_LABEL,ownPdfDocument} from '../assets/own-payroll-pdf-kit.js';
import {ownReceiptPages,ownReceiptTextWidth as width} from '../assets/own-payroll-receipt-pdf.js';
import {OWN_RECEIPT_PRINT_FACTS_VERSION,ownReceiptQuantityText} from '../assets/own-payroll-receipt-print-facts.js';

const corpus=JSON.parse(readFileSync(new URL('./fixtures/own-payroll-consumer-corpus.json',import.meta.url),'utf8')).cases;
const HALF=(557-38)/2,LABEL_X=38,RESERVE=62,INNER=HALF-LABEL_X-6;
const concept=(amount='123456.78',label='Concepto sintético con una etiqueta de largo habitual')=>({code:'101',label,nature:'remuneration',unit:'money',amount});
const doc=()=>{const d=ownPdfDocument({unsupported:()=>{}});d.page();return d;};
const draw=(quantity,options={},c=concept())=>doc().entry(c,HALF,{quantity,...options});
const digits=n=>'9'.repeat(n)+' h';
const atSix=text=>width(text,6);

test('anything that fits the standard column at 6 pt or more keeps the standard column and its right edge',()=>{
 const standard=draw('30 d');
 for(let n=1;n<=20;n++){const q=digits(n);if(atSix(q)>OWN_PDF_QUANTITY_COLUMN-4)break;
  const row=draw(q);assert.ok(width(row.quantity,row.quantitySize)<=OWN_PDF_QUANTITY_COLUMN-4,q);assert.equal(row.quantityRight,standard.quantityRight,q);assert.deepEqual(row.label,standard.label,q);}
 for(const q of ['','30 d','11/15 d','176/3 h','1.234,5678 h'])assert.equal(draw(q).quantityRight,standard.quantityRight,q);
});
test('just past the standard column the quantity is drawn whole at 6 pt in a column exactly as wide as it needs',()=>{
 let n=1;while(atSix(digits(n))<=OWN_PDF_QUANTITY_COLUMN-4)n++;
 const q=digits(n),row=draw(q),standard=draw('30 d');
 assert.equal(row.quantity,q);assert.equal(row.quantitySize,6);assert.equal(row.quantityRight,standard.quantityRight);
 const column=Math.ceil(atSix(q))+4,room=INNER-(RESERVE+OWN_PDF_QUANTITY_GAP)-column-6;
 assert.ok(row.label.every(line=>width(line,8.5)<=room+1e-9),'the label never runs under the widened quantity');
 assert.ok(row.label.length>=standard.label.length);
});
test('the row stops exactly when the label would keep less than the minimum, and only then',()=>{
 let stopped=null;
 for(let n=1;n<=60;n++){const q=digits(n),wide=atSix(q)>OWN_PDF_QUANTITY_COLUMN-4,column=wide?Math.ceil(atSix(q))+4:OWN_PDF_QUANTITY_COLUMN,room=INNER-(RESERVE+OWN_PDF_QUANTITY_GAP)-column-6;
  const should=wide&&room<OWN_PDF_QUANTITY_MIN_LABEL;
  if(should){assert.throws(()=>draw(q),e=>e.code==='OWN_PDF_QUANTITY_OVERFLOW'&&e.message==='La cantidad del concepto 101 no entra en su columna. No se recortó ni se omitió.',q);stopped??=n;}
  else assert.equal(draw(q).quantity,q,q);
 }
 assert.ok(stopped!==null,'the limit is reachable');
});
test('a wide amount and a wide quantity never overlap: the quantity moves left with the amount',()=>{
 for(const amount of ['-123456789.00','12345678.90'])for(const q of ['30 d',digits(14)]){
  const row=draw(q,{withSign:true},concept(amount));
  assert.ok(row.quantityRight>=6+width(row.value,row.valueSize,true)+OWN_PDF_QUANTITY_GAP-1e-9,amount+' '+q);
 }
});
test('the smaller rows of contributions and technical references widen the same way',()=>{
 const q=digits(14),row=draw(q,{size:7.5,withSign:true});assert.equal(row.quantity,q);assert.equal(row.quantitySize,6);
});
test('a null quantity keeps the row of earlier versions, with no quantity at all',()=>{
 const row=doc().entry(concept(),HALF,{});assert.equal(row.quantity,undefined);assert.equal(row.quantityRight,undefined);
});
test('on a receipt page a long conserved quantity prints whole and an impossible one names the legajo and the concept',()=>{
 const one=structuredClone(corpus.find(c=>c.name==='eligible_positive')),record=one.receiptRecord,quantities=new Map(record.quantities.map(q=>[q.conceptCode,q]));
 record.printFacts={version:OWN_RECEIPT_PRINT_FACTS_VERSION,frozenAt:'2026-11-11T15:00:00Z',units:record.concepts.map(c=>({rowKey:record.contractId+':concept:'+c.code,quantity:structuredClone(quantities.get(c.code)??null)})),
  employmentStartDate:null,classification:{categoryCode:null,categoryLabel:null,jobTitle:null,positionStructure:null},paymentDestination:null,
  sources:{runId:record.runId,payloadSha256:record.payloadSha256,inputSha256:record.inputSha256,resultSha256:record.resultSha256,employmentEvidenceSha256:null,bankConfigurationVersion:null,bankApprovalId:null}};
 const params={period:'2026-10',types:['monthly'],filters:{employeeFrom:'',employeeTo:'',agreementFrom:'',agreementTo:'',departmentFrom:'',departmentTo:''},issuer:{name:'SYNTHETIC QA MUNICIPALITY',taxId:'30990000001',address:'SYNTHETIC ADDRESS 123'},paymentDate:'2026-11-05',legend:'Synthetic QA only'};
 const source={id:record.sourceGroupId,snapshotSha256:'a'.repeat(64),period:'2026-10',type:'monthly',employeeCount:1,populationCount:1,selectedCount:1};
 const at=record.printFacts.units.findIndex(u=>u.quantity);assert.ok(at>=0);
 const text=pages=>pages.flat().join('\n').match(/<([a-f0-9]+)> Tj/gi).map(m=>Buffer.from(m.slice(1,-4),'hex').toString('latin1'));
 record.printFacts.units[at].quantity={...record.printFacts.units[at].quantity,stage:'rounded',decimalValue:'12345.678901'};
 assert.ok(text(ownReceiptPages(record,params,source)).includes(ownReceiptQuantityText(record.printFacts.units[at].quantity)));
 record.printFacts.units[at].quantity={...record.printFacts.units[at].quantity,stage:'exact',value:{numerator:'9'.repeat(40),denominator:'7'}};
 assert.throws(()=>ownReceiptPages(record,params,source),e=>e.code==='OWN_PDF_QUANTITY_OVERFLOW'&&e.message==='Legajo '+record.employeeNumber+': La cantidad del concepto '+record.concepts[at].code+' no entra en su columna. No se recortó ni se omitió.');
});
