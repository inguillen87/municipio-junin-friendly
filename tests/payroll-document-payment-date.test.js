import test from 'node:test';import assert from 'node:assert/strict';
import {declareDocumentPaymentDate,verifyDocumentPaymentDate,documentPaymentDateLines,documentPaymentDateSuffix} from '../assets/payroll-document-payment-date.js';
import {collectPayrollDocuments} from '../assets/payroll-document-collection.js';
import {createPayrollDocumentSetPdf,createPayrollDocumentSetPdfAsync} from '../assets/payroll-document-set-pdf.js';
import {collectionFixture} from './fixtures/payroll-collection-synthetic.js';
const hash='a'.repeat(64),make=(kind='payment',date='2026-09-04',selectionHash=hash)=>declareDocumentPaymentDate({kind,date},selectionHash);
const collect=async(n=2)=>{const f=collectionFixture(n);return collectPayrollDocuments({preview:await f.preview(),request:f.request,signal:new AbortController().signal});};
test('default never fills today or invents a source payment',()=>{
 const v=declareDocumentPaymentDate(undefined,hash);assert.deepEqual(v,{version:'document-payment-date.v1',selectionHash:hash,kind:'not_informed',date:null,origin:'not_informed',paymentVerified:false});
 assert.deepEqual(documentPaymentDateLines(v),[]);assert.equal(documentPaymentDateSuffix(v),'');
});
for(const kind of ['payment','credit'])test('a '+kind+' date remains operator-declared and selection-bound',()=>{
 const v=make(kind);assert.equal(v.origin,'operator_declared');assert.equal(v.paymentVerified,false);assert.equal(v.selectionHash,hash);assert.ok(Object.isFrozen(v));
 assert.match(documentPaymentDateLines(v)[0],/04\/09\/2026/);assert.match(documentPaymentDateLines(v)[1],/no verificado contra banco/);
 assert.equal(verifyDocumentPaymentDate(v,hash),v);assert.match(documentPaymentDateSuffix(v),/_declarado_2026-09-04$/);
});
for(const date of ['1900-01-01','2000-02-29','2024-02-29','2099-12-31'])test('valid Gregorian date '+date,()=>assert.equal(make('credit',date).date,date));
for(const date of ['',null,undefined,20260904,true,'2026-02-29','1900-02-29','2026-04-31','2026-13-01','2026-00-10','2026-09-00','1899-12-31','2100-01-01','04/09/2026','2026-9-4',' 2026-09-04','2026-09-04T00:00:00Z','2026-09-04\n'])test('reject invalid date '+String(date),()=>assert.throws(()=>declareDocumentPaymentDate({kind:'payment',date},hash),{code:'DOCUMENT_PAYMENT_DATE_INVALID'}));
for(const input of [null,[],{}, {kind:'payment'},{date:'2026-09-04'},{kind:'bank_verified',date:'2026-09-04'},{kind:'not_informed',date:'2026-09-04'},{kind:'payment',date:'2026-09-04',paymentVerified:true}])test('reject incomplete or misleading metadata '+JSON.stringify(input),()=>assert.throws(()=>declareDocumentPaymentDate(input,hash),{code:'DOCUMENT_PAYMENT_DATE_INVALID'}));
for(const h of [null,'a'.repeat(63),'G'.repeat(64),''])test('unidentified selection cannot carry a date '+String(h),()=>assert.throws(()=>make('payment','2026-09-04',h),{code:'DOCUMENT_PAYMENT_DATE_INVALID'}));
test('another selection cannot reuse the declaration',()=>assert.throws(()=>verifyDocumentPaymentDate(make(),'b'.repeat(64)),{code:'DOCUMENT_PAYMENT_DATE_CONTEXT_CHANGED'}));
test('a copied or forged declaration is not accepted',()=>{const v=make();for(const fake of [{...v},structuredClone(v),null])assert.throws(()=>verifyDocumentPaymentDate(fake,hash),{code:'DOCUMENT_PAYMENT_DATE_CONTEXT_CHANGED'});});
test('civil date formatting does not shift with UTC or local timezone',()=>assert.equal(documentPaymentDateLines(make('credit','2026-01-01'))[0],'Fecha de acreditación declarada: 01/01/2026'));
test('renderer keeps omitted and not-informed declaration byte-identical',async()=>{
 const c=await collect(),before=JSON.stringify(c),none=declareDocumentPaymentDate(undefined,c.preview.selectionHash);
 assert.deepEqual(createPayrollDocumentSetPdf(c).bytes,createPayrollDocumentSetPdf(c,{paymentDeclaration:none}).bytes);assert.equal(JSON.stringify(c),before);assert.equal(c.paymentDate,null);
});
for(const kind of ['payment','credit'])test('date and origin appear on every PDF page for '+kind,async()=>{
 const c=await collect(3),before=JSON.stringify(c),d=make(kind,'2026-09-04',c.preview.selectionHash),pdf=createPayrollDocumentSetPdf(c,{paymentDeclaration:d});
 const content=new TextDecoder().decode(pdf.bytes),line=Buffer.from(documentPaymentDateLines(d)[0],'latin1').toString('hex');
 assert.equal(content.split('<'+line+'>').length-1,pdf.pages);assert.equal(pdf.documents,3);assert.equal(pdf.concepts,33);
 assert.match(pdf.filename,kind==='payment'?/_pago_declarado_2026-09-04\.pdf$/:/_acreditacion_declarado_2026-09-04\.pdf$/);
 assert.equal(JSON.stringify(c),before);assert.equal(c.paymentDate,null);assert.equal(c.preview.paymentDate,null);assert.equal(c.signatureApplied,false);
});
test('sync and cancellable renderers agree for a declared date',async()=>{
 const c=await collect(),d=make('payment','2026-09-04',c.preview.selectionHash),sync=createPayrollDocumentSetPdf(c,{paymentDeclaration:d});
 const asyncPdf=await createPayrollDocumentSetPdfAsync(c,{paymentDeclaration:d,signal:new AbortController().signal});assert.deepEqual(asyncPdf,sync);
});
test('changing the declared date changes the file identity but never the source hash',async()=>{
 const c=await collect(),one=createPayrollDocumentSetPdf(c,{paymentDeclaration:make('payment','2026-09-04',c.preview.selectionHash)}),two=createPayrollDocumentSetPdf(c,{paymentDeclaration:make('payment','2026-09-05',c.preview.selectionHash)});
 assert.notEqual(one.filename,two.filename);assert.notDeepEqual(one.bytes,two.bytes);assert.equal(c.preview.dataset.sourceHash,'c'.repeat(64));
});
test('renderers reject dates attached to a different document selection',async()=>{
 const c=await collect(),d=make();assert.throws(()=>createPayrollDocumentSetPdf(c,{paymentDeclaration:d}),{code:'DOCUMENT_PAYMENT_DATE_CONTEXT_CHANGED'});
 await assert.rejects(createPayrollDocumentSetPdfAsync(c,{paymentDeclaration:d,signal:new AbortController().signal}),{code:'DOCUMENT_PAYMENT_DATE_CONTEXT_CHANGED'});
});

import {documentPaymentDateLongLabel} from '../assets/payroll-document-payment-date.js';
test('written-out month disambiguates browser-specific date picker formats',()=>{
 assert.equal(documentPaymentDateLongLabel(make('credit','2026-09-04')),'4 de septiembre de 2026');
 assert.equal(documentPaymentDateLongLabel(make('payment','2026-04-09')),'9 de abril de 2026');
 assert.equal(documentPaymentDateLongLabel(declareDocumentPaymentDate(undefined,hash)),'Sin fecha declarada');
});
test('all index pages preserve date context in a multiple-index-page PDF',async()=>{
 const c=await collect(55),d=make('credit','2026-09-04',c.preview.selectionHash),pdf=createPayrollDocumentSetPdf(c,{paymentDeclaration:d});
 const content=new TextDecoder().decode(pdf.bytes),line=Buffer.from(documentPaymentDateLines(d)[0],'latin1').toString('hex');
 assert.equal(content.split('<'+line+'>').length-1,pdf.pages);assert.ok(pdf.pages>165);assert.equal(pdf.documents,55);assert.equal(pdf.concepts,605);
});
