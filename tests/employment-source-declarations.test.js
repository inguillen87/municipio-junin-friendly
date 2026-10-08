import test from 'node:test';import assert from 'node:assert/strict';
import {sourceDeclarations,verifySourceDeclarations} from '../assets/employment-source-declarations.js';
import {activeAdoptionRaw} from './fixtures/active-contract-adoption-synthetic.js';
import {sealAdoptionReview,verifiedAdoptionReview} from '../assets/employment-adoption-review-model.js';
import {adoptionPreparationPayload} from '../assets/employment-adoption-preparation-model.js';
import {adoptionProposalInput} from '../assets/employment-adoption-contract.js';
import {principal,session,catalogVersion} from './fixtures/employment-adoption-preparation-synthetic.js';
import {adoptionPreparationOperation} from '../lib/internal-employment-adoption.js';
import {createEmploymentAdoptionHandler} from '../api/internal-employment-adoption.js';
const missing=()=>{const raw=activeAdoptionRaw(869),r=raw.rows.at(-1);r.startDate=null;r.agreementCode=null;r.categoryCode=null;r.jurisdictionCode=null;r.sourceIssues=['START_DATE_MISSING','CLASSIFICATION_MISSING','JURISDICTION_MISSING_ACTIVE'];return raw;};
const declaration=r=>({contractId:r.contractId,values:{startDate:'2020-02-29',agreementCode:'1',categoryCode:'1',jurisdictionCode:'42'},reference:'Documento sintético 1',reason:'Declaración exclusivamente sintética para pruebas'});
test('a declaration requires existing active gaps and real civil dates; no known value is overwritten',()=>{
 const raw=missing(),d=declaration(raw.rows.at(-1));assert.deepEqual(verifySourceDeclarations(raw.rows,[d],raw.today),[d]);
 for(const mutate of [v=>v.values.startDate='2021-02-29',v=>v.values.startDate='9999-01-01',v=>v.values.name='Otro',v=>v.values.startDate=null,v=>v.reference='=\ncmd',v=>v.contractId=raw.rows[0].contractId]){const v=structuredClone(d);mutate(v);assert.throws(()=>verifySourceDeclarations(raw.rows,[v],raw.today));}
 assert.throws(()=>sourceDeclarations([d,d]));assert.throws(()=>sourceDeclarations([]));
});
test('declared facts are bound to the entire active review and a separate immutable v5 proposal',async()=>{
 const raw=missing(),d=declaration(raw.rows.at(-1));raw.source.municipalDeclarations={version:'municipal-source-declarations.v1',rows:[d]};Object.assign(raw.rows.at(-1),d.values,{sourceIssues:[]});
 const r=await verifiedAdoptionReview(await sealAdoptionReview(raw));assert.equal(r.version,'employment-adoption-review.v4');
 const b=await adoptionPreparationPayload(r,'a'.repeat(64),'','Documento sintético','Motivo exclusivamente sintético');
 assert.equal(b.version,'employment-adoption-input.v5');assert.equal(b.rows.length,869);assert.deepEqual(b.declarations,[d]);assert.deepEqual(adoptionProposalInput(b),b);
 const changed=structuredClone(r);changed.source.municipalDeclarations.rows[0].reference='Otro documento';await assert.rejects(verifiedAdoptionReview(changed));
 const downgraded=structuredClone(b);downgraded.version='employment-adoption-input.v4';assert.throws(()=>adoptionProposalInput(downgraded));
});
test('remaining source conflicts block the complete declared proposal, including a filtered last page',async()=>{
 const raw=missing(),d=declaration(raw.rows.at(-1));raw.source.municipalDeclarations={version:'municipal-source-declarations.v1',rows:[d]};Object.assign(raw.rows.at(-1),d.values,{sourceIssues:['PERSON_FACTS_CHANGED']});
 const r=await sealAdoptionReview(raw);await assert.rejects(adoptionPreparationPayload(r,catalogVersion,'','Documento sintético','Motivo exclusivamente sintético'),/incidencias pendientes/);assert.equal(r.total,869);
});
test('the existing HTTP endpoint previews with no attempt key or proposal mutation and returns the same explicit declarations',async()=>{
 const original=missing();original.scope.tenantId=principal.tenant.id;original.scope.membershipId=principal.tenant.membershipId;
 const d=declaration(original.rows.at(-1)),raw=structuredClone(original);Object.assign(raw.rows.at(-1),d.values,{sourceIssues:[]});raw.source.municipalDeclarations={version:'municipal-source-declarations.v1',rows:[d]};
 const payload={revisionId:raw.source.finalRevision.revisionId,packageSha256:raw.source.finalRevision.packageSha256,sourceContextVersion:(await sealAdoptionReview(original)).sourceContextVersion,catalogVersion,declarations:[d]},calls=[];
 const sql={query:async(q,v)=>{calls.push({q,v});return[{result:{version:'employment-adoption-preparation.v5',rawReview:raw,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]}}];}};
 const handler=createEmploymentAdoptionHandler({env:{INTERNAL_APP_ORIGIN:'https://municontrol.test'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>sql});
 const response=()=>({setHeader(){},status(v){this.code=v;return this;},json(v){this.body=v;return this;}}),request={method:'POST',query:{},url:'/api/internal-employment-adoption',headers:{origin:'https://municontrol.test','content-type':'application/json'},body:JSON.stringify({operation:'preview-declarations',payload})};
 const res=response();await handler(request,res);assert.equal(res.code,200);assert.equal(res.body.data.review.total,869);assert.equal(calls.length,1);assert.match(calls[0].q,/^SELECT public\.employment_adoption_declared_bootstrap_v1/);assert.deepEqual(JSON.parse(calls[0].v.at(-1)),[d]);
 const n=calls.length,keyed=response();await handler({...request,headers:{...request.headers,'idempotency-key':'12345678-1234-4123-8123-123456789012'}},keyed);assert.equal(keyed.code,400);assert.equal(calls.length,n);
 const denied=structuredClone(principal);denied.tenant.effectiveCapabilities=[];await assert.rejects(adoptionPreparationOperation(sql,denied,session,'preview-declarations',payload),{status:403});assert.equal(calls.length,n);
 for(const [status,mutation]of [[422,v=>v.declarations[0].values.amount='1'],[400,v=>v.sourceContextVersion='bad'],[400,v=>v.search='hidden'],[400,v=>v.tenantId=principal.tenant.id]]){const v=structuredClone(payload);mutation(v);await assert.rejects(adoptionPreparationOperation(sql,principal,session,'preview-declarations',v),{status});assert.equal(calls.length,n);}
});
