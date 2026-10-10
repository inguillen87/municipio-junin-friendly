import test from 'node:test';import assert from 'node:assert/strict';
import {originalRegistryFactsAllowed,originalRegistryFactsCounts,REGISTRY_ADOPTION_PREPARATION_VERSION} from '../assets/employment-adoption-original-facts.js';
import {adoptionPreparationPayload,adoptionPreparationBootstrap} from '../assets/employment-adoption-preparation-model.js';
import {adoptionProposalInput} from '../assets/employment-adoption-contract.js';
import {sealAdoptionReview} from '../assets/employment-adoption-review-model.js';
import {registryPendingRaw} from './fixtures/registry-original-facts-synthetic.js';
import {catalogVersion} from './fixtures/employment-adoption-preparation-synthetic.js';
const propose=async raw=>adoptionPreparationPayload(await sealAdoptionReview(raw),catalogVersion,null,'Respaldo exclusivamente sintético','Registro de todo el padrón activo exclusivamente sintético',{preserveOriginalFacts:true});
test('registry proposal preserves every one of 869 active contracts and all 14 overlapping missing facts',async()=>{
 const raw=registryPendingRaw(),review=await sealAdoptionReview(raw),body=await propose(raw);
 assert.deepEqual(originalRegistryFactsCounts(review.rows),{total:869,pending:14,startDate:14,classification:2,jurisdiction:1});
 assert.equal(body.version,'employment-adoption-input.v6');assert.equal(body.sourceFactsPolicy,'preserve-original-pending.v1');
 assert.equal(body.rows.length,869);assert.equal(body.rows[0].jurisdictionCode,null);assert.deepEqual(adoptionProposalInput(body),body);
 assert.equal(raw.rows[0].startDate,null);assert.equal(raw.rows[0].agreementCode,null);assert.equal(raw.rows[0].categoryCode,null);
 assert.equal(review.source.operationalCohort.sourceTotal,2452);assert.equal(review.source.operationalCohort.archivedTotal,1583);
 const b=await adoptionPreparationBootstrap({version:REGISTRY_ADOPTION_PREPARATION_VERSION,review,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]});
 assert.equal(b.review.rows.length,869);assert.equal(b.applicationAvailable,false);
});
test('legacy proposal still rejects missing final facts and never silently changes policy',async()=>{
 const r=await sealAdoptionReview(registryPendingRaw());await assert.rejects(adoptionPreparationPayload(r,catalogVersion,'42','Documento ficticio','Preparación exclusivamente sintética'));
 await assert.rejects(adoptionPreparationPayload(r,catalogVersion,'42','Documento ficticio','Preparación exclusivamente sintética',{preserveOriginalFacts:true}));
});
for(const [name,change]of[
 ['identity conflict',r=>r.sourceIssues.push('PERSON_FACTS_CHANGED')],['ambiguous contract',r=>r.sourceIssues.push('CONTRACT_AMBIGUOUS')],
 ['invalid date',r=>r.sourceIssues.push('DATE_INVALID')],['inconsistent period',r=>r.sourceIssues.push('PERIOD_INVALID')],
 ['unknown jurisdiction',r=>r.sourceIssues.push('JURISDICTION_UNKNOWN')],['inactive row',r=>r.status='inactive'],
 ['invented date',r=>r.startDate='2000-01-01'],['unreported missing date',r=>r.sourceIssues=r.sourceIssues.filter(v=>v!=='START_DATE_MISSING')],
 ['invented classification',r=>{r.agreementCode='1';r.categoryCode='1';}],['repeated observation',r=>r.sourceIssues.push('START_DATE_MISSING')],
 ['invalid calendar date',r=>{r.startDate='2026-02-31';r.sourceIssues=r.sourceIssues.filter(v=>v!=='START_DATE_MISSING');}],
 ['active with end date',r=>r.endDate='2026-10-01'],['invented jurisdiction',r=>r.jurisdictionCode='42']
])test('original-facts policy refuses '+name,()=>{const r=registryPendingRaw().rows[0];change(r);assert.equal(originalRegistryFactsAllowed(r),false);assert.throws(()=>originalRegistryFactsCounts([r]));});
test('source facts policy cannot be forged, mixed with declarations or moved to a historical cohort',async()=>{
 const body=await propose(registryPendingRaw());for(const change of[v=>v.sourceFactsPolicy='other',v=>delete v.sourceFactsPolicy,v=>v.declarations=[],v=>v.cohort='all',v=>v.rows[1]=v.rows[0]]){const v=structuredClone(body);change(v);assert.throws(()=>adoptionProposalInput(v));}
 const r=registryPendingRaw();delete r.source.operationalCohort;await assert.rejects(propose(r));
});
test('eligibility never executes getters or treats an absent source field as original NULL',()=>{
 const r=registryPendingRaw().rows[0];delete r.startDate;assert.equal(originalRegistryFactsAllowed(r),false);
 Object.defineProperty(r,'startDate',{get(){throw Error('must not run');}});assert.equal(originalRegistryFactsAllowed(r),false);
});
