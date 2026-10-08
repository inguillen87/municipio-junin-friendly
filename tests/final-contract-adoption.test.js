import test from 'node:test';import assert from 'node:assert/strict';
import {finalAdoptionRaw,finalAdoptionSource} from './fixtures/final-contract-adoption-synthetic.js';
import {principal,session,catalogVersion,attemptKey,preparationEnvelope} from './fixtures/employment-adoption-preparation-synthetic.js';
import {sealAdoptionReview,verifiedAdoptionReview,adoptionReviewCsv} from '../assets/employment-adoption-review-model.js';
import {adoptionProposalInput} from '../assets/employment-adoption-contract.js';
import {adoptionPreparationPayload,adoptionPreparationBootstrap,adoptionFinalSources} from '../assets/employment-adoption-preparation-model.js';
import {adoptionPreparationOperation} from '../lib/internal-employment-adoption.js';
import {createEmploymentAdoptionHandler} from '../api/internal-employment-adoption.js';
const body=async raw=>adoptionPreparationPayload(await sealAdoptionReview(raw??finalAdoptionRaw()),catalogVersion,'','Documento exclusivamente sintético','Adopción de antecedentes exclusivamente sintéticos');
test('one final proposal retains 57 contracts, previous facts, final facts and the past inactive jurisdiction',async()=>{
 const raw=finalAdoptionRaw(),review=await verifiedAdoptionReview(await sealAdoptionReview(raw)),p=await body(raw);
 assert.equal(review.version,'employment-adoption-review.v2');assert.equal(p.version,'employment-adoption-input.v3');assert.equal(p.rows.length,57);
 assert.equal(p.rows[56].jurisdictionCode,null);assert.deepEqual(p.finalSource,{revisionId:finalAdoptionSource.revisionId,packageSha256:finalAdoptionSource.packageSha256});
 assert.equal(review.rows[0].previous.startDate,'2010-01-01');assert.equal(review.rows[0].startDate,'2012-02-03');assert.equal(review.rows[0].categoryCode,'4');
 assert.equal(review.rows[0].previous.categoryCode,'0');assert.deepEqual(adoptionProposalInput(p),p);assert.ok(Object.isFrozen(p.finalSource));
});
for(const [label,mutate]of [
 ['missing final reference',r=>delete r.source.finalRevision.revisionId],['unknown source field',r=>r.source.finalRevision.forged=true],
 ['missing previous facts',r=>delete r.rows[0].previous],['unknown previous field',r=>r.rows[0].previous.payrollAmount=1],
 ['unknown issue',r=>r.rows[0].sourceIssues=['FORGED']],['duplicate issue',r=>r.rows[0].sourceIssues=['PERIOD_INVALID','PERIOD_INVALID']],
 ['omitted page',r=>r.rows.pop()],['private contract payload',r=>r.finalContracts=[{}]]
])test('a final review rejects '+label,async()=>{const r=finalAdoptionRaw();mutate(r);await assert.rejects(sealAdoptionReview(r));});
test('changes to either previous or final facts invalidate the signed review',async()=>{
 const r=await sealAdoptionReview(finalAdoptionRaw());for(const side of ['previous','candidate']){const copy=structuredClone(r);if(side==='previous')copy.rows[0].previous.startDate='2009-01-01';else copy.rows[0].startDate='2011-01-01';await assert.rejects(verifiedAdoptionReview(copy));}
});
test('a final source incidence prevents the entire proposal and appears in the non nominal complete CSV',async()=>{
 const raw=finalAdoptionRaw();raw.rows[56].sourceIssues=['PERSON_FACTS_CHANGED'];
 const review=await verifiedAdoptionReview(await sealAdoptionReview(raw));await assert.rejects(body(raw),/incidencias pendientes/);
 const csv=adoptionReviewCsv(review);assert.match(csv,/"57";/);assert.doesNotMatch(csv,/PERSONA SINTÉTICA|5057|10000000-|PERSON_FACTS_CHANGED|2012-02-03/);
 assert.equal(review.counts.dataReview,1);assert.equal(review.total,57);
});
test('the final pending request cannot silently change to another cut or body',async()=>{
 const p=await body(),before=JSON.stringify(p);
 for(const change of [v=>delete v.finalSource,v=>v.finalSource.revisionId='invalid',v=>v.finalSource.packageSha256='0',v=>v.finalSource.extra='forged',v=>v.version='employment-adoption-input.v2']){const copy=structuredClone(p);change(copy);assert.throws(()=>adoptionProposalInput(copy));}
 assert.equal(JSON.stringify(p),before);const receipt=await preparationEnvelope(p);assert.equal(receipt.receipt.effects.contractsAdopted,0);
});
test('only matching final bootstrap version and sealed final source are accepted',async()=>{
 const review=await sealAdoptionReview(finalAdoptionRaw()),value={version:'employment-adoption-preparation.v3',review,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]};
 assert.equal((await adoptionPreparationBootstrap(value)).review.total,57);
 for(const version of ['employment-adoption-preparation.v1','employment-adoption-preparation.v2'])await assert.rejects(adoptionPreparationBootstrap({...value,version}));
});
test('final availability reports zero without inventing a revision and contains only cut references',()=>{
 const r=finalAdoptionRaw(),empty={version:'employment-adoption-final-sources.v1',scope:r.scope,total:0,rows:[]};assert.equal(adoptionFinalSources(empty).total,0);
 const available={...empty,total:1,rows:[{revisionId:finalAdoptionSource.revisionId,packageSha256:finalAdoptionSource.packageSha256,cutoff:finalAdoptionSource.cutoff}]};
 assert.equal(adoptionFinalSources(available).total,1);assert.throws(()=>adoptionFinalSources({...available,rows:[{...available.rows[0],name:'PERSONA SINTÉTICA'}]}));
 assert.throws(()=>adoptionFinalSources({...available,total:2}));
});

test('final availability is scoped by the SQL authority rather than an absent client binding',async()=>{
 const raw=finalAdoptionRaw();raw.scope.tenantId=principal.tenant.id;raw.scope.membershipId=principal.tenant.membershipId;
 const available={version:'employment-adoption-final-sources.v1',scope:raw.scope,total:0,rows:[]};
 const sql={query:async()=>[{result:available}]};
 assert.equal((await adoptionPreparationOperation(sql,principal,session,'final-sources')).total,0);
 available.scope={...available.scope,tenantId:'99999999-9999-4999-8999-999999999999'};
 await assert.rejects(adoptionPreparationOperation(sql,principal,session,'final-sources'),{status:503});
});

test('an absent or altered final reader gives an actionable unavailable result without SQL details',async()=>{
 for(const error of [Object.assign(Error('private function and schema names'),{code:'42883'}),Error('FINAL_ADOPTION_SOURCE_METADATA private signature'),Error('FINAL_ADOPTION_SOURCE_PROTECTION')]){
  const sql={query:async()=>{throw error;}};
  await assert.rejects(adoptionPreparationOperation(sql,principal,session,'final-sources'),e=>e.status===503&&e.code==='EMPLOYMENT_ADOPTION_NOT_READY'&&/administrador/.test(e.message)&&!/private|signature|42883/.test(e.message));
 }
});
test('API final bootstrap uses verified authority, exact revision and package, with no write or input actor',async()=>{
 const calls=[],raw=finalAdoptionRaw();raw.scope.tenantId=principal.tenant.id;raw.scope.membershipId=principal.tenant.membershipId;
 const handler=createEmploymentAdoptionHandler({env:{},sessionFor:()=>session,requireAccess:async()=>({mode:'managed',principal}),getSql:async()=>({query:async(q,v)=>{calls.push({q,v});return[{result:{version:'employment-adoption-preparation.v3',rawReview:raw,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]}}];}})});
 const query={resource:'final-bootstrap',revisionId:finalAdoptionSource.revisionId,packageSha256:finalAdoptionSource.packageSha256};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.payload=v;return this;}};
 await handler({method:'GET',query,url:'/api/internal-employment-adoption?'+new URLSearchParams(query)},res);
 assert.equal(res.statusCode,200);assert.equal(calls.length,1);assert.match(calls[0].q,/^SELECT public\.employment_adoption_final_bootstrap_v1/);
 assert.deepEqual(calls[0].v.slice(1),[query.revisionId,query.packageSha256]);assert.match(res.headers['Cache-Control']??res.headers['cache-control'],/no-store/);
});
test('a final bootstrap cannot substitute a different selected package',async()=>{
 const raw=finalAdoptionRaw();raw.scope.tenantId=principal.tenant.id;raw.scope.membershipId=principal.tenant.membershipId;
 const sql={query:async()=>[{result:{version:'employment-adoption-preparation.v3',rawReview:raw,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]}}]};
 await assert.rejects(adoptionPreparationOperation(sql,principal,session,'final-bootstrap',{revisionId:finalAdoptionSource.revisionId,packageSha256:'4'.repeat(64)}),{status:503});
 await assert.rejects(adoptionPreparationOperation(sql,principal,session,'final-bootstrap',{revisionId:'invalid',packageSha256:finalAdoptionSource.packageSha256}),{status:400});
});
