// The V6 producer checks registration against the frozen calculation, not the person's identity.
// Earlier PDF bytes are pinned from 32583440 using only the existing synthetic fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {receiptBatch} from './fixtures/own-payroll-receipt-synthetic.js';
import {OWN_PAYROLL_NAMESPACE_VERSION} from '../assets/own-payroll-engine.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {createOwnReceiptPdf,ownReceiptPages,ownReceiptTextWidth} from '../assets/own-payroll-receipt-pdf.js';
import {OWN_RECEIPT_PRINT_FACTS_VERSION} from '../assets/own-payroll-receipt-print-facts.js';

const corpus=JSON.parse(readFileSync(new URL('./fixtures/own-payroll-consumer-corpus.json',import.meta.url),'utf8')).cases;
const hash=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
const LEGACY_ORIGIN='Origen: identidad del registro municipal verificado; conceptos del catálogo conservado en el cálculo.';
const V6_ORIGIN='Origen: legajo, convenio y repartición cotejados entre el registro municipal y la captura del cálculo; no acredita la identidad de la persona. Conceptos del catálogo conservado en el cálculo.';
const fragments=bytes=>[...Buffer.from(bytes).toString().matchAll(/<([a-f0-9]+)> Tj/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1'));
function fixture(version,{caseName='eligible_positive',employment=false}={}){
 const batch=receiptBatch(2),s=batch.snapshot;s.version='own-receipt-snapshot.v'+version;
 if(version>1)s.identityBasis='owned_registration_verified_at_capture';
 if(version===2)s.records[0].employeeNumber='QA/0001';
 if(version===3)for(const record of s.records)record.namespaceVersion=OWN_PAYROLL_NAMESPACE_VERSION;
 if(version>=4){
  const one=structuredClone(corpus.find(c=>c.name===(version===4?'legacy_v4_unchanged':caseName))),r=one.receiptRecord;
  s.records=[r];s.recordCount=1;s.conceptCount=r.concepts.length;s.economicConceptCount=r.economicConceptCount;s.omittedRowCount=r.omittedRowCount;
  s.sources=[{id:r.sourceGroupId,snapshotSha256:hash(one.close),period:s.params.period,type:'monthly',employeeCount:one.close.employeeCount,populationCount:one.close.populationCount,selectedCount:1}];
  if(version===6){
   const quantities=new Map(r.quantities.map(q=>[q.conceptCode,q]));
   r.printFacts={version:OWN_RECEIPT_PRINT_FACTS_VERSION,frozenAt:'2026-11-11T15:00:00Z',units:r.concepts.map(c=>({rowKey:r.contractId+':concept:'+c.code,quantity:structuredClone(quantities.get(c.code)??null)})),
    employmentStartDate:employment?'2019-03-01':null,classification:{categoryCode:null,categoryLabel:null,jobTitle:employment?'Cargo sintético conservado':null,positionStructure:null},paymentDestination:null,
    sources:{runId:r.runId,payloadSha256:r.payloadSha256,inputSha256:r.inputSha256,resultSha256:r.resultSha256,employmentEvidenceSha256:employment?'b'.repeat(64):null,bankConfigurationVersion:null,bankApprovalId:null}};
  }
 }
 batch.snapshotSha256=hash(s);return batch;
}
const LEGACY_PDF_SHA256=[
 '56f4097f0441292bc294bca9fce7c8d1eabc9ac1e6d04a5af07001f547774f83',
 '2b017e4c73ad4b255256c0dabd3fcbde87b82dce2ed538cdd2c5d765d5f1dc20',
 '56f4097f0441292bc294bca9fce7c8d1eabc9ac1e6d04a5af07001f547774f83',
 'f720ced61c0c34639649c81399044e4cd2954c9c9224323ce9e0e27989af0e9d',
 'b301ec87e9f9260ac0c78d8f5d9484ae8b66f05d6fe2b71086c93811bf96dcf2',
];
for(const [i,expected]of LEGACY_PDF_SHA256.entries())test('V'+(i+1)+' keeps the original PDF bytes and origin note',async()=>{
 const pdf=await createOwnReceiptPdf(fixture(i+1));
 assert.equal(createHash('sha256').update(pdf.bytes).digest('hex'),expected);
 assert.ok(fragments(pdf.bytes).join(' ').includes(LEGACY_ORIGIN));
});
test('V6 batch, preview and self PDF describe the registration/capture check without claiming human identity',async()=>{
 for(const caseName of ['legacy_v4_unchanged','eligible_positive'])for(const employment of [false,true]){
  const b=fixture(6,{caseName,employment}),s=b.snapshot,source=s.sources[0];
  const self={version:'own-receipt-self.v1',items:[{batchId:b.id,preparedAt:b.preparedAt,approvedAt:'2026-11-11T15:01:00Z',params:Object.fromEntries(Object.entries(s.params).filter(([key])=>!['types','filters'].includes(key))),record:s.records[0],source:{id:source.id,snapshotSha256:source.snapshotSha256,period:source.period,type:source.type},signatureState:'pending',paymentDateBasis:'declared',payrollPosted:false,paymentExecuted:false}]};
  for(const [value,options]of [[b,{}],[s,{preview:true}],[self,{self:true}]]){
   const text=fragments((await createOwnReceiptPdf(value,options)).bytes).join(' ');
   assert.ok(text.includes(V6_ORIGIN),caseName+' '+JSON.stringify(options));
   assert.ok(!text.includes(LEGACY_ORIGIN));
   assert.ok(text.includes('No acredita firma digital, imputación ni ejecución de pago.'));
  }
 }
});
test('the complete V6 origin note stays together within the page margins on a long receipt',()=>{
 const s=fixture(6,{employment:true}).snapshot,r=s.records[0],base=r.concepts[0];
 // Layout-only synthetic rows: no calculation or source is changed outside this in-memory drawing fixture.
 r.concepts=Array.from({length:90},(_,i)=>({...base,code:String(7000+i),label:'Concepto sintético de continuación '+i}));
 const pages=ownReceiptPages(r,s.params,s.sources[0]);assert.ok(pages.length>1);
 const texts=page=>page.flatMap(op=>{const m=/^BT \/(F[12]) ([\d.]+) Tf [\d. ]+ rg 1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm <([a-f0-9]*)> Tj ET$/.exec(op);return m?[{bold:m[1]==='F2',size:+m[2],x:+m[3],y:+m[4],text:Buffer.from(m[5],'hex').toString('latin1')}]:[];});
 const notes=pages.map(texts).find(ops=>ops.some(op=>op.text.startsWith('Origen: legajo,')));assert.ok(notes);
 const start=notes.findIndex(op=>op.text.startsWith('Origen: legajo,')),end=notes.findIndex((op,i)=>i>start&&op.text.startsWith('Emisión:'));
 assert.ok(end>start);const origin=notes.slice(start,end);assert.equal(origin.map(op=>op.text).join(' '),V6_ORIGIN);
 for(const op of origin){assert.equal(op.size,7.5);assert.ok(op.x>=38&&op.x+ownReceiptTextWidth(op.text,op.size,op.bold)<=557.01);assert.ok(op.y>64,'the note stays above the footer');}
});

test('V6: pie «Página X de Y» y render determinista, sin fecha de generación variable',()=>{
 const b=fixture(6),snap=b.snapshot,r=snap.records[0],source=snap.sources[0];
 const a=ownReceiptPages(r,snap.params,source,{state:'prepared',batchId:'QA-FIJO'});
 const again=ownReceiptPages(r,snap.params,source,{state:'prepared',batchId:'QA-FIJO'});
 assert.deepEqual(a,again,'idéntica representación al regenerar el mismo recibo');
 const shown=a.map(page=>page.flatMap(op=>[...op.matchAll(/<([a-f0-9]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1'))));
 for(const [i,parts]of shown.entries())assert.ok(parts.includes('Página '+(i+1)+' de '+a.length),'numeración V6');
 assert.ok(shown.flat().every(part=>!/^(?:PDF generado|Emitido )/.test(part)),'no contiene fecha de reloj');
});
