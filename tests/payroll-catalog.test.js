import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_CONTRACT,verifyCatalogResponse,catalogMonth } from '../lib/payroll-catalog-contract.js';
import { PARAMETER_SOURCE_SHA } from '../lib/payroll-parameter-contract.js';
import { catalogDocument,catalogArtifact } from '../src/islands/payroll-catalog-export.js';
import { readPayrollCatalog,writePayrollCatalog } from '../lib/internal-payroll-catalog.js';
import { catalogRequest } from '../src/islands/payroll-catalog-client.js';
import { createInternalPayrollCatalogHandler } from '../api/internal-payroll-catalog.js';
const uid=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`;
const row=()=>({agreementId:1,auxiliaryId:88,baseClass:'6-D',newValueCents:'12500050',referenceConceptId:24,
 activationId:uid(1),activationRevision:1,proposalId:uid(2),proposalVersion:3,validFrom:'2026-10',
 sourceReference:'Escala sintética QA',ruleId:'aux88-class6d',sourceSha256:PARAMETER_SOURCE_SHA,activatedAt:'2026-09-16T12:00:00Z'});
const result=()=>({contractVersion:CATALOG_CONTRACT,currentRevision:1,catalog:{period:'2026-10',revision:1,rows:[row()]},payrollCalculated:false,payrollPosted:false});
const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(3),membershipId:uid(4)}};
const session={email:principal.user.email,id:uid(5),version:1,releaseSha:'a'.repeat(40)};
const mutation={proposalId:uid(2),proposalVersion:3,catalogRevision:0};
test('verified values keep exact cents and explicit scope',()=>{const r=result();assert.equal(verifyCatalogResponse(r),r);assert.equal(catalogDocument(r,'2026-10-01T12:00:00Z').rows[0][3],'125000.50');});
for(const [name,patch] of Object.entries({future:r=>r.catalog.rows[0].validFrom='2026-11',unbornRevision:r=>r.catalog.rows[0].activationRevision=2,wrongRule:r=>r.catalog.rows[0].ruleId='invented',wrongAgreement:r=>r.catalog.rows[0].agreementId=3,wrongClass:r=>r.catalog.rows[0].baseClass='6-A',wrongConcept:r=>r.catalog.rows[0].referenceConceptId=0,duplicate:r=>r.catalog.rows.push({...r.catalog.rows[0]}),zero:r=>r.catalog.rows[0].newValueCents='0',decimal:r=>r.catalog.rows[0].newValueCents='12.50',number:r=>r.catalog.rows[0].newValueCents=1250,overflow:r=>r.catalog.rows[0].newValueCents='100000000000',oldScope:r=>r.payrollCalculated=true,source:r=>r.catalog.rows[0].sourceSha256='b'.repeat(64),revision:r=>r.catalog.revision=2})){
 test('response rejects '+name,()=>{const r=result();patch(r);assert.throws(()=>verifyCatalogResponse(r));});
}
test('zero revision is an empty catalogue, not a zero salary scale',()=>{const r=result();r.currentRevision=0;r.catalog.revision=0;r.catalog.rows=[];assert.equal(verifyCatalogResponse(r).catalog.rows.length,0);assert.equal(catalogDocument(r,'2026-10-01').rows.length,0);});
test('documents describe a pinned revision, not a payroll or a presentation',()=>{const d=catalogDocument(result(),'2026-10-01');assert.ok(d.notes.join(' ').includes('No certifica sueldo'));assert.equal(d.filename,'municontrol_catalogo_2026-10_r1');assert.deepEqual(d.totals,[]);});
for(const format of ['xlsx','csv','pdf'])test('valid '+format+' output is generated from the queried catalogue',()=>{
 const a=catalogArtifact(result(),format,'2026-10-01T00:00:00Z');assert.ok(a.content.length>100);assert.ok(a.filename.endsWith('.'+format));
 if(format==='csv'){assert.match(a.content,/125000,50/);assert.ok(!a.content.includes('=SUM'));}
 if(format==='xlsx')assert.equal(Buffer.from(a.content).subarray(0,2).toString(),'PK');
 if(format==='pdf')assert.equal(Buffer.from(a.content).subarray(0,4).toString(),'%PDF');
});
test('CSV formula injection is neutralized; unrepresentable PDF text is refused',()=>{const r=result();r.catalog.rows[0].sourceReference='=HYPERLINK("test")';assert.match(catalogArtifact(r,'csv','2026-10-01').content,/'=HYPERLINK/);r.catalog.rows[0].sourceReference='Escala 漢';assert.throws(()=>catalogArtifact(r,'pdf','2026-10-01'));assert.ok(catalogArtifact(r,'xlsx','2026-10-01'));});
test('default month follows Mendoza rather than UTC day boundary',()=>assert.equal(catalogMonth(new Date('2026-10-01T01:00:00Z')),'2026-09'));
test('catalogue query is parameterized and pins requested historical revision',async()=>{
 let sent;const sql={query:async(q,args)=>{sent={q,args};return[{result:result()}];}};
 await readPayrollCatalog(sql,principal,session,'catalog',{period:'2026-10',revision:'1'});
 assert.match(sent.q,/payroll_auxiliary_catalog_v1\(\$1::jsonb,\$2::text,\$3::integer\)/);assert.equal(sent.args[2],1);
 await readPayrollCatalog(sql,principal,session,'catalog',{period:'2026-10',revision:''});assert.equal(sent.args[2],null);
});
for(const input of [{period:'2026-00',revision:''},{period:'2026-10',revision:'1e2'},{period:'2026-10',revision:'-1'},{period:'2026-10',revision:'01'},{period:'2026-10',revision:'2147483648'},{period:'2026-10',revision:'0',tenantId:uid(7)}])test('bad filter does not execute SQL '+JSON.stringify(input),async()=>{
 let called=false;await assert.rejects(readPayrollCatalog({query:async()=>{called=true;}},principal,session,'catalog',input));assert.equal(called,false);
});
test('activation body cannot send arbitrary values or another tenant',async()=>{
 for(const extra of [{newValueCents:'1'},{tenantId:uid(7)},{draft:{}},{proposalVersion:'3'}]){
  let calls=0;await assert.rejects(writePayrollCatalog({query:async()=>{calls++;}},principal,session,'activate',{...mutation,...extra},uid(8)));assert.equal(calls,0);
 }
});
test('session/principal mismatch is refused before SQL',async()=>{await assert.rejects(readPayrollCatalog({query:()=>assert.fail()},principal,{...session,email:'someone-else@example.invalid'},'catalog',{period:'2026-10',revision:''}),e=>e.status===401);});
test('activation hash binds context, version, catalogue revision and immutable attempt',async()=>{
 const sent=[];const sql={query:async(q,args)=>{sent.push(args);const r=result();r.replayed=false;r.activation={id:uid(1),revision:1,proposalId:uid(2),proposalVersion:3,validFrom:'2026-10',activatedAt:'2026-09-16T12:00:00Z'};return[{result:r}];}};
 await writePayrollCatalog(sql,principal,session,'activate',mutation,uid(8));
 await writePayrollCatalog(sql,principal,session,'activate',mutation,uid(8));
 await writePayrollCatalog(sql,principal,session,'activate',{...mutation,catalogRevision:1},uid(8));
 assert.equal(sent[0][5],sent[1][5]);assert.notEqual(sent[0][5],sent[2][5]);assert.equal(sent[0][4],uid(8));
});
test('database conflict is actionable without exposing database errors',async()=>{
 await assert.rejects(readPayrollCatalog({query:async()=>{throw Error('PAYROLL_CATALOG_VERSION_CONFLICT sensitive SQL');}},principal,session,'catalog',{period:'2026-10',revision:''}),e=>e.status===409&&!e.message.includes('sensitive'));
});
test('network ambiguity preserves the original attempt and does not auto-POST again',async()=>{
 let count=0;const attempt={key:uid(8),command:'activate',payload:mutation};
 await assert.rejects(catalogRequest({},attempt,async(url,opts)=>{count++;assert.equal(opts.headers['Idempotency-Key'],uid(8));assert.equal(opts.credentials,'same-origin');throw Error('offline');}),e=>e.status===503);
 assert.equal(count,1);
});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(v){this.body=v;return this;}};}
const access={mode:'managed',principal,session};
const env={NODE_ENV:'production',INTERNAL_APP_ORIGIN:'https://qa.example.invalid',INTERNAL_CERTIFIED_RELEASE_SHA:'a'.repeat(40)};
test('anonymous reads never open a database connection',async()=>{let calls=0;const h=createInternalPayrollCatalogHandler({env,requireAccess:async()=>null,getSql:()=>{calls++;}});const res=response();await h({method:'GET',query:{period:'2026-10'}},res);assert.equal(calls,0);assert.match(res.headers['Cache-Control'],/no-store/);});
test('cross-origin writes are refused before authorization',async()=>{let calls=0;const h=createInternalPayrollCatalogHandler({env,requireAccess:()=>{calls++;}});const res=response();await h({method:'POST',headers:{origin:'https://wrong.invalid','content-type':'application/json'},body:{command:'activate',payload:mutation}},res);assert.equal(res.code,403);assert.equal(calls,0);});
test('method restrictions are explicit',async()=>{const res=response();await createInternalPayrollCatalogHandler()({method:'DELETE'},res);assert.equal(res.code,405);assert.equal(res.headers.Allow,'GET, POST');});
