import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogFileExport,catalogFilePlan} from '../assets/native-employment-catalog-file-model.js';
const rows=()=>[{kind:'agreements',key:'qa-a',code:'9',label:'Encuadre existente QA',agreementCode:null,registrationAllowed:false},{kind:'categories',key:'qa-c',code:'6',label:'Clase QA',agreementCode:'9',registrationAllowed:false},{kind:'organizations',key:'qa-o',code:'1',label:'Sector QA',agreementCode:null,registrationAllowed:true},{kind:'sectors',key:'qa-s',code:'2',label:'Repartición QA',agreementCode:null,registrationAllowed:true}];
test('complete CSV preserves literal codes, parent encuadres and declared use through an exact round trip',()=>{
 const r=rows(),text=catalogFileExport(r),plan=catalogFilePlan(r,text);assert.equal(plan.total,4);assert.deepEqual(plan.changes,[]);assert.equal(plan.items.find(x=>x.code==='9').registrationAllowed,false);assert.equal(plan.items.find(x=>x.kind==='categories').agreementCode,'9');
});
test('all pages and all classes belong to the comparison without a search/page argument',()=>{
 const r=rows();for(let n=3;n<123;n++)r.push({kind:'sectors',key:'qa-'+n,code:String(n),label:'Repartición QA '+n,agreementCode:null,registrationAllowed:true});
 const p=catalogFilePlan(rows(),catalogFileExport(r));assert.equal(p.total,124);assert.equal(p.changes.length,120);assert.equal(p.items.filter(x=>x.kind==='sectors').length,121);
});
test('formula-looking labels and apostrophes remain literal exported text',()=>{
 const r=rows();r[2].label='=SUM(A1;A2)';r[3].label="'inicio ; con comillas \"QA\"";const text=catalogFileExport(r);assert.ok(text.includes('"\'=SUM(A1;A2)"'));assert.equal(catalogFilePlan(r,text).changes.length,0);
});
test('whole-file validation rejects incomplete flags, headers, duplicates, parents and broken CSV',()=>{
 const valid=catalogFileExport(rows());for(const s of[valid.replace('nuevas_altas','dni'),valid.replace("'no","'"),valid+'"sin cerrar',valid.replace("'categoria","'empleado"),valid.replace("'9\";\"'no","'99\";\"'no")])assert.throws(()=>catalogFilePlan(rows(),s));
 const dup=valid+valid.split('\r\n')[1]+'\r\n';assert.throws(()=>catalogFilePlan(rows(),dup));assert.throws(()=>catalogFilePlan(rows(),catalogFileExport([])));
});
test('a global size/count limit never silently cuts the complete catalog',()=>{
 assert.throws(()=>catalogFilePlan(rows(),'x'.repeat(2*1024*1024+1)));
 const r=rows();for(let n=3;n<1500;n++)r.push({kind:'sectors',key:'qa-'+n,code:String(n),label:'QA',agreementCode:null,registrationAllowed:true});assert.throws(()=>catalogFileExport(r));
});
