import test from 'node:test';import assert from 'node:assert/strict';
import {createEmploymentAdoptionHandler} from '../api/internal-employment-adoption.js';
import {adoptionPreparationOperation} from '../lib/internal-employment-adoption.js';
import {adoptionPreparationPayload} from '../assets/employment-adoption-preparation-model.js';
import {sealAdoptionReview} from '../assets/employment-adoption-review-model.js';
import {registryPendingRaw} from './fixtures/registry-original-facts-synthetic.js';
import {principal,session,catalogVersion,preparationEnvelope} from './fixtures/employment-adoption-preparation-synthetic.js';
const output=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
test('GET original registry review requires exact final reference, returns all pages and saves nothing',async()=>{
 const raw=registryPendingRaw(),query={resource:'registry-bootstrap',revisionId:raw.source.finalRevision.revisionId,packageSha256:raw.source.finalRevision.packageSha256},calls=[];
 const handler=createEmploymentAdoptionHandler({requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>({query:async(sql,args)=>{calls.push({sql,args});return[{result:{version:'employment-adoption-preparation.v6',rawReview:raw,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]}}];}})}),res=output();
 await handler({method:'GET',query,url:'/api/internal-employment-adoption?'+new URLSearchParams(query)},res);assert.equal(res.code,200);assert.equal(res.body.data.review.rows.length,869);assert.equal(res.body.data.review.rows[0].jurisdictionCode,null);assert.equal(calls.length,1);assert.match(calls[0].sql,/registry_bootstrap_v1/);assert.equal(calls[0].args.length,3);assert.equal(res.body.data.applicationAvailable,false);
});
test('registry GET never accepts filtering, pagination, declaration or implicit source references',async()=>{
 let calls=0;const h=createEmploymentAdoptionHandler({requireAccess:async()=>{calls++;throw Error('must not authorize invalid query');}}),raw=registryPendingRaw();
 for(const query of [{resource:'registry-bootstrap'}, {resource:'registry-bootstrap',revisionId:raw.source.finalRevision.revisionId,packageSha256:raw.source.finalRevision.packageSha256,search:'one'}, {resource:'registry-bootstrap',revisionId:raw.source.finalRevision.revisionId,packageSha256:raw.source.finalRevision.packageSha256,page:'1'}]){const res=output();await h({method:'GET',query,url:'/api/internal-employment-adoption?'+new URLSearchParams(query)},res);assert.equal(res.code,400);}assert.equal(calls,0);
});
for(const [label,mutate]of [['old response version',v=>v.version='employment-adoption-preparation.v4'],['foreign membership',v=>v.rawReview.scope.membershipId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],['invented fact',v=>v.rawReview.rows[0].jurisdictionCode='42'],['fatal issue hidden as ready',v=>v.rawReview.rows[0].sourceIssues.push('CONTRACT_AMBIGUOUS')]])test('registry API rejects '+label,async()=>{
 const value={version:'employment-adoption-preparation.v6',rawReview:registryPendingRaw(),catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]};mutate(value);await assert.rejects(adoptionPreparationOperation({query:async()=>[{result:value}]},principal,session,'registry-bootstrap',{revisionId:value.rawReview.source.finalRevision.revisionId,packageSha256:value.rawReview.source.finalRevision.packageSha256}),{status:503});
});
test('registry POST preserves the exact v6 policy, complete body and original attempt key',async()=>{
 const review=await sealAdoptionReview(registryPendingRaw()),body=await adoptionPreparationPayload(review,catalogVersion,null,'Documento ficticio','Propuesta exclusivamente sintética original',{preserveOriginalFacts:true}),key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';let called=0;
 const saved=await adoptionPreparationOperation({query:async(sql,args)=>{called++;assert.match(sql,/employment_adoption_propose_v1/);assert.equal(args[2],key);assert.deepEqual(JSON.parse(args[1]),body);return[{result:await preparationEnvelope(body,key)}];}},principal,session,'propose',{body,key});assert.equal(called,1);assert.equal(saved.requestKey,key);assert.equal(saved.receipt.total,869);
 const denied=structuredClone(principal);denied.tenant.effectiveCapabilities=denied.tenant.effectiveCapabilities.filter(c=>c!=='employee.record.propose');await assert.rejects(adoptionPreparationOperation({query:async()=>{throw Error('revocation must precede SQL');}},denied,session,'propose',{body,key}),{status:403});
});
