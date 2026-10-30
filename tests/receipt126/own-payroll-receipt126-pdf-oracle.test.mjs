// Source-only causal units. Real writer/encoder/presentation, synthetic records.
// No filesystem, HTTP, SQL, handlers, browser, process, VM or prototype edits.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOwnReceipt126PdfRecords} from '../../scripts/lib/own-payroll-receipt126-same190-circuit.mjs';
import {ownReceiptPages} from '../../assets/own-payroll-receipt-pdf.js';
import {encodePayrollPages} from '../../assets/payroll-detail-export.js';
import {ownReceiptPresentation,ownReceiptSelf} from '../../assets/own-payroll-receipt-model.js';
import {OWN_PAYROLL_NAMESPACE_VERSION} from '../../assets/own-payroll-engine.js';
import {ownReceiptTotalsPaginationFixture} from '../../tests/fixtures/own-payroll-receipt-totals-pagination-synthetic.js';

const batchId='11111111-1111-4111-8111-000000000800';
const dependencies={ownReceiptPresentation};
const projection=params=>({period:params.period,issuer:{...params.issuer},paymentDate:params.paymentDate,legend:params.legend});
const sourceProjection=source=>({id:source.id,snapshotSha256:source.snapshotSha256,period:source.period,type:source.type});
function fixture(count=1){
 const f=ownReceiptTotalsPaginationFixture(),record=f.record;
 record.namespaceVersion=OWN_PAYROLL_NAMESPACE_VERSION;
 record.concepts[0].label='Descripción sintética extensa y conservada para verificar varias líneas del concepto. '.repeat(2).trim();
 record.concepts[4].code=record.concepts[0].code; // concept:8000 and auxiliary:8000.
 record.concepts.push(...Array.from({length:12},(_,index)=>({...record.concepts[7],code:String(9000+index),unit:'money',amount:'0.00000000',label:'Auxiliar exclusivamente sintético '+index})));
 record.concepts.find(c=>c.code==='9000').amount='100.12345678'; // Same text elsewhere, deliberately.
 record.concepts.find(c=>c.code==='9001').amount='310.12345678';
 record.concepts.find(c=>c.code==='9002').amount='120.12345678';
 record.concepts.find(c=>c.code==='9003').amount='8'.repeat(48)+'.00000000'; // Forces the real separate-amount writer branch.
 const records=[record];
 if(count===2){const other=structuredClone(record);Object.assign(other,{contractId:'11111111-1111-4111-8111-000000000102',personId:'11111111-1111-4111-8111-000000000103',registrationId:'11111111-1111-4111-8111-000000000104',employeeNumber:'900000002',name:'Otra persona exclusivamente sintética',dni:'99000101',cuil:'20999999907'});other.concepts[0].amount='200.12345678';Object.assign(other.totals,{remuneration:'200.12345678',gross:'200.12345678',net:'201.12345678'});records.push(other);}
 assert.ok(count===1||count===2);for(const r of records){assert.equal(r.concepts.length,20);assert.equal(ownReceiptPresentation(r).totals.length,6);}
 return{records,params:projection(f.params),sources:[sourceProjection(f.source)],batchId};
}
function selfFixture(){
 const context=fixture(),item={batchId,preparedAt:'2026-10-05T15:00:00Z',approvedAt:'2026-10-05T16:00:00Z',params:context.params,record:context.records[0],source:context.sources[0],signatureState:'pending',paymentDateBasis:'declared',payrollPosted:false,paymentExecuted:false};
 const own=ownReceiptSelf({version:'own-receipt-self.v1',items:[item]});
 return{...context,records:[own.items[0].record],self:own};
}
function pagesFor(context){return context.records.flatMap(record=>ownReceiptPages(record,context.params,context.sources.find(source=>source.id===record.sourceGroupId),{state:'approved',batchId:context.batchId}));}
function inputFor(context,pages){return{bytes:encodePayrollPages(pages),pageCount:pages.length,recordCount:context.records.length,records:context.records,params:context.params,sources:context.sources,batchId:context.batchId};}
const evaluate=(context,pages)=>assertOwnReceipt126PdfRecords(inputFor(context,pages),dependencies);
function draws(pages){
 const number='([+-]?[0-9]+(?:\\.[0-9]+)?(?:e[+-]?[0-9]+)?)',pattern=new RegExp('^BT /(F[12]) '+number+' Tf 0\\.07 0\\.20 0\\.25 rg 1 0 0 1 '+number+' '+number+' Tm <([0-9a-f]+)> Tj ET$');
 return pages.flatMap((page,pageIndex)=>page.map((raw,index)=>{const match=pattern.exec(raw);assert.ok(match,'TEST_MUTATION_MUST_KEEP_REAL_WRITER_GRAMMAR');return{page:pageIndex,index,raw,font:match[1],size:match[2],x:match[3],y:match[4],text:new TextDecoder('windows-1252',{fatal:true}).decode(Buffer.from(match[5],'hex'))};}));
}
const textBag=pages=>draws(pages).map(op=>op.text).sort();
function perRecord(pages,record){
 const all=draws(pages),pageIds=new Set(all.filter(op=>op.font==='F2'&&op.size==='10'&&op.x==='38'&&op.text.endsWith(' · Legajo '+record.employeeNumber)).map(op=>op.page));assert.ok(pageIds.size);
 return [...pageIds].flatMap(pageId=>{const page=all.filter(op=>op.page===pageId);let cursor=2;while(page[cursor]?.font==='F2'&&page[cursor]?.size==='11'&&page[cursor]?.x==='38')cursor++;return page.slice(cursor+2,-2);});
}
function groupRange(pages,record,nature){
 const presentation=ownReceiptPresentation(record),group=presentation.groups.find(g=>g.nature===nature);assert.ok(group);const all=perRecord(pages,record),at=all.findIndex(op=>op.font==='F2'&&op.x==='38'&&op.size==='9'&&op.text===group.title);assert.ok(at>=0);const headings=new Set([...presentation.groups.map(g=>g.title),'Totales exactos de la liquidación cerrada']);let end=at+1;while(end<all.length&&!(all[end].font==='F2'&&all[end].x==='38'&&all[end].size==='9'&&headings.has(all[end].text)))end++;return{group,all,start:at,end};
}
function conceptBlock(pages,record,nature,code){
 const range=groupRange(pages,record,nature),isCode=op=>op.font==='F2'&&op.x==='38'&&op.size==='9'&&/^[0-9]{1,9}$/.test(op.text);const at=range.all.findIndex((op,i)=>i>range.start&&i<range.end&&isCode(op)&&op.text===code);assert.ok(at>range.start);let end=at+1;while(end<range.end&&!isCode(range.all[end]))end++;const block=range.all.slice(at,end),amounts=block.filter((op,i)=>i>0&&op.font==='F2');assert.equal(amounts.length,1);return{...range,block,code:block[0],amount:amounts[0]};
}
function totalOperation(pages,record,key){const total=ownReceiptPresentation(record).totals.find(t=>t.key===key);assert.ok(total);const matches=perRecord(pages,record).filter(op=>op.x==='38'&&op.size==='9'&&op.text===total.label+': '+total.displayAmount);assert.equal(matches.length,1);return matches[0];}
function replaceText(pages,op,text){assert.ok([...text].every(char=>char.codePointAt(0)>=32&&char.codePointAt(0)<=255),'TEST_ONLY_DECLARED_WINANSI_TEXT');pages[op.page][op.index]=op.raw.replace(/<([0-9a-f]+)> Tj ET$/,'<'+Buffer.from(text,'latin1').toString('hex')+'> Tj ET');}
function rejectBinding(context,pages,expected){
 // Real encodePayrollPages recalculates stream Length/xref after each mutation.
 // Every surviving operation still has the actual writer grammar. Assertions
 // below require a semantic binding failure, never a malformed PDF fallback.
 draws(pages);let failure;try{evaluate(context,pages);}catch(error){failure=error;}
 assert.ok(failure,'The valid encoded mutation must be rejected by its own binding');assert.equal(failure.code,'ERR_ASSERTION');assert.match(failure.message,expected);assert.doesNotMatch(failure.message,/UNKNOWN_OPERATION_GRAMMAR|WRAPPED_EDGE_SPACE/);
}

test('receipt126 oracle: self1/20, multiline labels and shared concept/aux code use the real encoder',()=>{
 const context=selfFixture(),before=structuredClone(context),pages=pagesFor(context),evidence=evaluate(context,pages),first=conceptBlock(pages,context.records[0],'remuneration','8000'),auxiliary=conceptBlock(pages,context.records[0],'auxiliary','8000'),separate=conceptBlock(pages,context.records[0],'auxiliary','9003');
 assert.equal(evidence.recordCount,1);assert.equal(evidence.conceptCount,20);assert.equal(evidence.recordEvidence[0].totalCount,6);assert.equal(evidence.operationCount,draws(pages).length);assert.ok(first.block.filter(op=>op.font==='F1'&&op.x==='92'&&op.size==='9').length>1);assert.notEqual(first.amount.text,auxiliary.amount.text);assert.notEqual(separate.code.y,separate.amount.y);assert.equal(evidence.renderedLayoutVerified,false);assert.deepEqual(context,before);
});
test('receipt126 oracle: two complete people retain40 concepts,12 totals and every page',()=>{
 const context=fixture(2),before=structuredClone(context),pages=pagesFor(context),evidence=evaluate(context,pages);assert.equal(evidence.recordCount,2);assert.equal(evidence.conceptCount,40);assert.equal(evidence.recordEvidence.length,2);assert.deepEqual(evidence.recordEvidence.map(r=>r.totalCount),[6,6]);assert.equal(evidence.recordEvidence.flatMap(r=>r.pageNumbers).length,pages.length);assert.equal(evidence.operationCount,draws(pages).length);assert.deepEqual(context,before);
});
test('receipt126 oracle: omitted amount cannot borrow identical text from a different block',()=>{
 const context=fixture(),pages=pagesFor(context),amount=conceptBlock(pages,context.records[0],'remuneration','8000').amount,before=textBag(pages).filter(text=>text===amount.text).length;assert.ok(before>1);pages[amount.page].splice(amount.index,1);assert.equal(textBag(pages).filter(text=>text===amount.text).length,before-1);rejectBinding(context,pages,/RECEIPT126_PDF_ONE_AMOUNT_IN_OWN_BLOCK/);
});
test('receipt126 oracle: moving an amount into another concept preserves the global multiset but fails its block',()=>{
 const context=fixture(),pages=pagesFor(context),record=context.records[0],from=conceptBlock(pages,record,'auxiliary','9001').amount,to=conceptBlock(pages,record,'auxiliary','9002').amount,before=textBag(pages);pages[to.page].splice(to.index,0,from.raw);const shifted=from.page===to.page&&to.index<=from.index?from.index+1:from.index;pages[from.page].splice(shifted,1);assert.deepEqual(textBag(pages),before);rejectBinding(context,pages,/RECEIPT126_PDF_ONE_AMOUNT_IN_OWN_BLOCK/);
});
test('receipt126 oracle: distinct amount swap between codes preserves the global multiset',()=>{
 const context=fixture(),pages=pagesFor(context),record=context.records[0],a=conceptBlock(pages,record,'auxiliary','9001').amount,b=conceptBlock(pages,record,'auxiliary','9002').amount,before=textBag(pages);assert.notEqual(a.text,b.text);replaceText(pages,a,b.text);replaceText(pages,b,a.text);assert.deepEqual(textBag(pages),before);rejectBinding(context,pages,/RECEIPT126_PDF_EXACT_AMOUNT_IN_OWN_BLOCK/);
});
test('receipt126 oracle: distinct amount swap between people preserves the global multiset',()=>{
 const context=fixture(2),pages=pagesFor(context),a=conceptBlock(pages,context.records[0],'remuneration','8000').amount,b=conceptBlock(pages,context.records[1],'remuneration','8000').amount,before=textBag(pages);assert.notEqual(a.text,b.text);replaceText(pages,a,b.text);replaceText(pages,b,a.text);assert.deepEqual(textBag(pages),before);rejectBinding(context,pages,/RECEIPT126_PDF_EXACT_AMOUNT_IN_OWN_BLOCK/);
});
test('receipt126 oracle: same code in concept and auxiliary namespaces cannot exchange amounts',()=>{
 const context=fixture(),pages=pagesFor(context),record=context.records[0],a=conceptBlock(pages,record,'remuneration','8000').amount,b=conceptBlock(pages,record,'auxiliary','8000').amount,before=textBag(pages);assert.notEqual(a.text,b.text);replaceText(pages,a,b.text);replaceText(pages,b,a.text);assert.deepEqual(textBag(pages),before);rejectBinding(context,pages,/RECEIPT126_PDF_EXACT_AMOUNT_IN_OWN_BLOCK/);
});
test('receipt126 oracle: omitted total fails its own ordered section',()=>{
 const context=fixture(),pages=pagesFor(context),total=totalOperation(pages,context.records[0],'remuneration');pages[total.page].splice(total.index,1);rejectBinding(context,pages,/RECEIPT126_PDF_PARAGRAPH:total:remuneration/);
});
test('receipt126 oracle: duplicated total cannot satisfy the next total',()=>{
 const context=fixture(),pages=pagesFor(context),total=totalOperation(pages,context.records[0],'remuneration');pages[total.page].splice(total.index+1,0,total.raw);rejectBinding(context,pages,/RECEIPT126_PDF_PARAGRAPH:total:non_remuneration/);
});
test('receipt126 oracle: changed total is rejected without recalculating money',()=>{
 const context=fixture(),pages=pagesFor(context),record=context.records[0],total=totalOperation(pages,record,'remuneration'),replacement=ownReceiptPresentation(record).totals.find(t=>t.key==='net').displayAmount;replaceText(pages,total,'Haberes remunerativos: '+replacement);rejectBinding(context,pages,/RECEIPT126_PDF_PARAGRAPH:total:remuneration/);
});
test('receipt126 oracle: foreign issuer text fails the conserved issuer paragraph',()=>{
 const context=fixture(),pages=pagesFor(context),op=draws(pages).find(op=>op.text==='Emisor declarado: '+context.params.issuer.name);assert.ok(op);replaceText(pages,op,'Emisor declarado: Municipio ajeno exclusivamente sintetico');rejectBinding(context,pages,/RECEIPT126_PDF_PARAGRAPH:issuer-and-availability/);
});
test('receipt126 oracle: foreign source text fails the conserved origin paragraph',()=>{
 const context=fixture(),pages=pagesFor(context),op=draws(pages).find(op=>op.text==='Grupo cerrado: '+context.sources[0].id);assert.ok(op);replaceText(pages,op,'Grupo cerrado: 11111111-1111-4111-8111-000000000999');rejectBinding(context,pages,/RECEIPT126_PDF_PARAGRAPH:conserved-origin/);
});
test('receipt126 oracle: extra foreign employee in self PDF is rejected despite valid encoding',()=>{
 const context=selfFixture(),extra=fixture(2),pages=[...pagesFor(context),...pagesFor({...extra,records:[extra.records[1]]})];assert.equal(context.self.items.length,1);assert.ok(draws(pages).some(op=>op.text.endsWith(' · Legajo '+extra.records[1].employeeNumber)));rejectBinding(context,pages,/RECEIPT126_PDF_FOREIGN_LEGAJO/);
});
test('receipt126 oracle regression: deleting the group explanation must fail its prefix binding',()=>{
 const context=fixture(),pages=pagesFor(context),range=groupRange(pages,context.records[0],'remuneration'),op=range.all[range.start+1];assert.equal(op.text,range.group.explanation);pages[op.page].splice(op.index,1);rejectBinding(context,pages,/RECEIPT126_PDF_GROUP_EXPLANATION_MISSING/);
});
test('receipt126 oracle regression: replacing the group explanation must fail its paragraph binding',()=>{
 const context=fixture(),pages=pagesFor(context),range=groupRange(pages,context.records[0],'remuneration'),op=range.all[range.start+1];assert.equal(op.text,range.group.explanation);replaceText(pages,op,'Explicacion ajena exclusivamente sintetica');rejectBinding(context,pages,/RECEIPT126_PDF_PARAGRAPH:group-explanation:remuneration/);
});
test('receipt126 oracle regression: extra F2 amount before first code must fail its group prefix',()=>{
 const context=fixture(),pages=pagesFor(context),record=context.records[0],block=conceptBlock(pages,record,'remuneration','8000'),before=textBag(pages),extra=block.amount.raw;assert.notEqual(block.amount.x,'38');pages[block.code.page].splice(block.code.index,0,extra);assert.equal(textBag(pages).length,before.length+1);rejectBinding(context,pages,/RECEIPT126_PDF_EXTRA_GROUP_PREFIX_OPERATION/);
});
