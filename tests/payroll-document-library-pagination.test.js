import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDocumentLibrary,documentLibraryPage,DOCUMENT_PAGE_SIZE} from '../assets/payroll-document-library-model.js';

const items=Array.from({length:1000},(_,i)=>{
 const date=new Date(Date.UTC(1940, i, 1));
 return {datasetId:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,
  payrollDate:date.toISOString().slice(0,10),sourcePeriod:date.getUTCFullYear(),sourceMonth:date.getUTCMonth()+1,
  payrollType:i%2?'M':'V',closureStatus:'closed',sourceLabel:'Respaldo sintético',
  importedAt:'2026-09-22T12:00:00Z',conceptCount:5,versionsAvailable:1,historySummaryAvailable:true};
});
const library=normalizeDocumentLibrary({version:'payroll-document-library.v1',found:true,items,total:1000,truncated:false,officialReceipt:false,signatureApplied:false});

test('1000 available documents produce 24 visible cards, not a truncated search',()=>{
 const r=documentLibraryPage(library);assert.equal(DOCUMENT_PAGE_SIZE,24);assert.equal(r.total,1000);
 assert.equal(r.items.length,24);assert.equal(r.pages,42);assert.equal(r.from,1);assert.equal(r.to,24);
 assert.equal(library.items.length,1000);assert.ok(Object.isFrozen(r.items));
});
test('every source document occurs on exactly one page without overlap or omissions',()=>{
 const seen=[];for(let page=1;page<=42;page++)seen.push(...documentLibraryPage(library,{},page).items.map(r=>r.datasetId));
 assert.equal(seen.length,1000);assert.equal(new Set(seen).size,1000);assert.deepEqual(seen,library.items.map(r=>r.datasetId));
});
test('last page has 16 documents and explicit range',()=>{
 const r=documentLibraryPage(library,{},42);assert.equal(r.items.length,16);assert.equal(r.from,985);assert.equal(r.to,1000);
});
test('filters run over all received metadata, including dates outside the visible page',()=>{
 const r=documentLibraryPage(library,{year:'1940',month:'1',type:'V'});
 assert.equal(r.total,1);assert.equal(r.items[0].sourcePeriod,1940);assert.equal(r.items[0].sourceMonth,1);
});
test('out-of-range page is clamped after a refresh or a narrower filter',()=>{
 const r=documentLibraryPage(library,{year:'1940'},42);assert.equal(r.page,1);assert.equal(r.pages,1);assert.equal(r.items.length,12);
});
test('empty results do not advertise a fabricated record range',()=>{
 const r=documentLibraryPage(library,{year:'2026'},7);assert.equal(r.page,1);assert.equal(r.total,0);assert.equal(r.from,0);assert.equal(r.to,0);assert.deepEqual(r.items,[]);
});
test('server truncation is not erased by UI pagination',()=>{
 const source=normalizeDocumentLibrary({...library,total:1001,truncated:true});
 assert.equal(documentLibraryPage(source).total,1000);assert.equal(source.total,1001);assert.equal(source.truncated,true);
});
for(const page of [0,-1,1.5,'1',NaN,Infinity,Number.MAX_SAFE_INTEGER+1])test('reject invalid page '+page,()=>assert.throws(()=>documentLibraryPage(library,{},page),/DOCUMENT_PAGE_INVALID/));
