import test from 'node:test';import assert from 'node:assert/strict';
import {verifyPdfText,pageTextFromItems,preparePdfArticle} from '../assets/legal-pdf-text-model.js';
import {readLegalPdfText} from '../assets/legal-pdf-text-client.js';
const sha='a'.repeat(64),document={sha256:sha,contentBase64:btoa('%PDF-QA')};
const result=()=>({version:'legal-pdf-text.v1',sha256:sha,byteLength:7,pageCount:1,pages:[{number:1,text:'Art. 1: NO supera 25,5 %.\nTexto literal.'}],method:'pdf-text',originalModified:false,legalReview:false});
const selection=()=>({page:1,label:'Artículo 1',text:result().pages[0].text,reviewed:true});
test('extraction preserves negation, decimal and page boundaries; markup remains text',()=>{
 const text=pageTextFromItems([{str:'NO corresponde 25,5 %.',hasEOL:true},{str:'<script>no ejecutar</script>',hasEOL:false}]);assert.equal(text,'NO corresponde 25,5 %.\n<script>no ejecutar</script>');assert.equal(pageTextFromItems([]),'');
});
test('source mismatch, page drift, legal assertions and truncation cannot be accepted',()=>{
 for(const patch of [{sha256:'b'.repeat(64)},{originalModified:true},{legalReview:true},{pageCount:31},{pages:[{number:2,text:'no'}]},{pages:[{number:1,text:'\0'}]},{pages:[{number:1,text:'a'.repeat(50001)}]},{extra:'private'}])assert.throws(()=>verifyPdfText({...result(),...patch},document));
 assert.throws(()=>pageTextFromItems(Array(15001).fill({str:'a'})));assert.throws(()=>pageTextFromItems([{str:'a'.repeat(50001)}]));
});
test('only explicit review adds a fragment; existing article and original PDF are not overwritten',()=>{
 const before=JSON.stringify(document),r=result(),s=selection();assert.deepEqual(preparePdfArticle(r,document,s),{label:s.label,text:s.text,page:1});assert.equal(JSON.stringify(document),before);
 for(const patch of [{reviewed:false},{page:2},{label:''},{text:''},{text:'a'.repeat(12001)}])assert.throws(()=>preparePdfArticle(r,document,{...s,...patch}));
 assert.throws(()=>preparePdfArticle(r,document,s,[{label:'ARTÍCULO 1'}]));assert.throws(()=>preparePdfArticle(r,document,s,Array(150).fill({label:'other'})));
 assert.throws(()=>preparePdfArticle({...r,pages:[{number:1,text:''}]},document,s));
});
function mock(factory){let stopped=0;const worker={terminate(){stopped++;},postMessage:factory};return{worker,workerFactory:()=>worker,stopped:()=>stopped};}
test('bounded worker returns matching evidence and terminates after the result',async()=>{const m=mock(function(){queueMicrotask(()=>this.onmessage({data:{ok:true,result:result()}}));});assert.deepEqual(await readLegalPdfText(document,m),result());assert.equal(m.stopped(),1);});
test('deadline and explicit cancellation terminate extraction, never upload',async()=>{
 const m=mock(()=>{});await assert.rejects(readLegalPdfText(document,{...m,timeoutMs:2}),/tiempo/);assert.equal(m.stopped(),1);
 const c=new AbortController(),n=mock(()=>{}),p=readLegalPdfText(document,{...n,signal:c.signal});c.abort();await assert.rejects(p,/cancelada/);assert.equal(n.stopped(),1);
});
test('worker size mismatch and malformed reply stay rejected',async()=>{for(const data of [{ok:true,result:{...result(),byteLength:9}},{ok:false,code:'unsafe'},{ok:true,result:result(),secret:'x'}]){const m=mock(function(){queueMicrotask(()=>this.onmessage({data}));});await assert.rejects(readLegalPdfText(document,m));assert.equal(m.stopped(),1);}});
