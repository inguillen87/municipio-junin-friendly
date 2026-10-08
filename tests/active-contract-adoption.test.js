import test from 'node:test';import assert from 'node:assert/strict';
import {activeAdoptionRaw} from './fixtures/active-contract-adoption-synthetic.js';
import {finalAdoptionRaw,finalAdoptionSource} from './fixtures/final-contract-adoption-synthetic.js';
import {principal,session,catalogVersion} from './fixtures/employment-adoption-preparation-synthetic.js';
import {sealAdoptionReview,verifiedAdoptionReview,adoptionReviewCsv} from '../assets/employment-adoption-review-model.js';
import {adoptionPreparationBootstrap,adoptionPreparationPayload} from '../assets/employment-adoption-preparation-model.js';
import {adoptionProposalInput} from '../assets/employment-adoption-contract.js';
import {adoptionPreparationOperation} from '../lib/internal-employment-adoption.js';
import {createEmploymentAdoptionHandler} from '../api/internal-employment-adoption.js';
const payload=async raw=>adoptionPreparationPayload(await sealAdoptionReview(raw),catalogVersion,'','Documento exclusivamente sintético','Adopción del personal activo exclusivamente sintético');
test('the operational proposal includes every active page, retains old hires and seals the full source',async()=>{
 const raw=activeAdoptionRaw(869),r=await verifiedAdoptionReview(await sealAdoptionReview(raw)),body=await payload(raw);
 assert.equal(r.version,'employment-adoption-review.v3');assert.equal(body.version,'employment-adoption-input.v4');assert.equal(body.cohort,'active-contracts.v1');
 assert.equal(body.rows.length,869);assert.equal(r.rows[0].startDate,'2012-02-03');assert.equal(r.rows.at(-1).sourceRowNumber,892);
 assert.deepEqual(r.source.finalRevision,finalAdoptionSource);assert.deepEqual(body.finalSource,{revisionId:finalAdoptionSource.revisionId,packageSha256:finalAdoptionSource.packageSha256});
 assert.deepEqual(adoptionProposalInput(body),body);assert.equal(r.source.operationalCohort.sourceTotal,892);assert.equal(r.source.operationalCohort.archivedTotal,23);
});
for(const [label,change]of [
 ['an inactive row',r=>r.rows[0].status='inactive'],['an unknown status',r=>r.rows[0].status='state_error'],
 ['an omitted page',r=>r.rows.pop()],['a repeated original row',r=>r.rows[1].sourceRowNumber=r.rows[0].sourceRowNumber],
 ['a row beyond source coverage',r=>r.rows.at(-1).sourceRowNumber=10000],['an inconsistent archived count',r=>r.source.operationalCohort.archivedTotal++],
 ['a missing complete source seal',r=>delete r.source.finalRevision],['an invented cutoff',r=>r.source.operationalCohort.since='2018-01-01']
])test('operational review rejects '+label,async()=>{const r=activeAdoptionRaw();change(r);await assert.rejects(sealAdoptionReview(r));});
test('changing original row or full archived coverage invalidates the review and selection',async()=>{
 const r=await sealAdoptionReview(activeAdoptionRaw());
 for(const change of [v=>v.rows[0].sourceRowNumber--,v=>{v.source.operationalCohort.sourceTotal++;v.source.operationalCohort.archivedTotal++;}]){const v=structuredClone(r);change(v);await assert.rejects(verifiedAdoptionReview(v));}
 const a=await payload(activeAdoptionRaw()),raw=activeAdoptionRaw();raw.source.operationalCohort.sourceTotal++;raw.source.operationalCohort.archivedTotal++;
 const b=await payload(raw);assert.notEqual(a.selectionVersion,b.selectionVersion);assert.notEqual(a.sourceContextVersion,b.sourceContextVersion);
});
test('active incidences still block the whole proposal; CSV uses full original rows and safe fixed text',async()=>{
 const raw=activeAdoptionRaw();raw.rows.at(-1).sourceIssues=['JURISDICTION_MISSING_ACTIVE'];raw.rows.at(-1).name='=HYPERLINK("private")';
 const r=await verifiedAdoptionReview(await sealAdoptionReview(raw));await assert.rejects(payload(raw),/incidencias pendientes/);
 const csv=adoptionReviewCsv(r);assert.match(csv,/Fila de la fuente completa/);assert.match(csv,/"80";/);assert.doesNotMatch(csv,/HYPERLINK|private|PERSONA|5057|10000000-|2012-02-03|JURISDICTION_MISSING_ACTIVE/);
});
test('zero active contracts is a valid review with no fabricated incidents or empty proposal',async()=>{
 const raw=activeAdoptionRaw(0),r=await verifiedAdoptionReview(await sealAdoptionReview(raw));assert.equal(r.total,0);assert.equal(r.counts.observations,0);
 assert.equal(adoptionReviewCsv(r).split('\r\n').length,2);await assert.rejects(payload(raw));
});
test('v4 cannot use a partial selection, null jurisdiction, altered cohort or downgrade into a legacy request',async()=>{
 const body=await payload(activeAdoptionRaw()),before=JSON.stringify(body);
 for(const change of [v=>v.rows[0].jurisdictionCode=null,v=>delete v.cohort,v=>v.cohort='inactive',v=>v.version='employment-adoption-input.v3']){const v=structuredClone(body);change(v);assert.throws(()=>adoptionProposalInput(v));}
 const r=await sealAdoptionReview(activeAdoptionRaw());await assert.rejects(adoptionPreparationPayload(r,catalogVersion,{snapshot:r.snapshot,rows:[{contractId:r.rows[0].contractId,jurisdictionCode:'42'}]},body.legalReference,body.reason));
 assert.equal(JSON.stringify(body),before);assert.equal((await payload(finalAdoptionRaw())).version,'employment-adoption-input.v3');
});
test('bootstrap versions cannot exchange active and historical scope',async()=>{
 const review=await sealAdoptionReview(activeAdoptionRaw()),value={version:'employment-adoption-preparation.v4',review,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]};
 assert.equal((await adoptionPreparationBootstrap(value)).review.total,57);await assert.rejects(adoptionPreparationBootstrap({...value,version:'employment-adoption-preparation.v3'}));
});
test('the API explicitly requests the authoritative active cohort with no filter, actor or automatic write',async()=>{
 const raw=activeAdoptionRaw();raw.scope.tenantId=principal.tenant.id;raw.scope.membershipId=principal.tenant.membershipId;const calls=[];
 const sql={query:async(q,v)=>{calls.push({q,v});return[{result:{version:'employment-adoption-preparation.v4',rawReview:raw,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]}}];}};
 const handler=createEmploymentAdoptionHandler({env:{},sessionFor:()=>session,requireAccess:async()=>({mode:'managed',principal}),getSql:async()=>sql});
 const query={resource:'final-active-bootstrap',revisionId:finalAdoptionSource.revisionId,packageSha256:finalAdoptionSource.packageSha256};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.payload=v;return this;}};
 await handler({method:'GET',query,url:'/api/internal-employment-adoption?'+new URLSearchParams(query)},res);assert.equal(res.statusCode,200);assert.equal(calls.length,1);
 assert.match(calls[0].q,/^SELECT public\.employment_adoption_active_bootstrap_v1/);assert.deepEqual(calls[0].v.slice(1),[query.revisionId,query.packageSha256]);
 await assert.rejects(adoptionPreparationOperation(sql,principal,session,'final-bootstrap',query),{status:503});
 const forbidden=structuredClone(principal);forbidden.tenant.effectiveCapabilities=[];
 const n=calls.length;await assert.rejects(adoptionPreparationOperation(sql,forbidden,session,'final-active-bootstrap',query),{status:403});assert.equal(calls.length,n);
});
test('missing active installation is actionable without exposing SQL',async()=>{
 const sql={query:async()=>{throw Error('ACTIVE_ADOPTION_NEW_METADATA private SQL');}};
 await assert.rejects(adoptionPreparationOperation(sql,principal,session,'final-active-bootstrap',finalAdoptionSource),e=>e.status===503&&e.code==='EMPLOYMENT_ADOPTION_NOT_READY'&&!/private SQL/.test(e.message));
});
