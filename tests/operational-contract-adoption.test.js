import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {registryPendingRaw} from './fixtures/registry-original-facts-synthetic.js';
import {principal,session,catalogVersion,preparationEnvelope} from './fixtures/employment-adoption-preparation-synthetic.js';
import {sealAdoptionReview,verifiedAdoptionReview,adoptionReviewCsv} from '../assets/employment-adoption-review-model.js';
import {adoptionPreparationBootstrap,adoptionPreparationPayload,operationalAdoptionTransition} from '../assets/employment-adoption-preparation-model.js';
import {adoptionProposalInput} from '../assets/employment-adoption-contract.js';
import {OPERATIONAL_ADOPTION_COHORT as COHORT,OPERATIONAL_ADOPTION_PREPARATION_VERSION as BOOT_VERSION} from '../assets/employment-adoption-operational-cohort.js';
import {adoptionPreparationOperation} from '../lib/internal-employment-adoption.js';
import {buildOperationalContractAdoptionInstallation} from '../scripts/lib/operational-contract-adoption-installation.mjs';
import {operationalRaw} from './fixtures/operational-contract-adoption-synthetic.js';
const payload=async raw=>adoptionPreparationPayload(await sealAdoptionReview(raw),catalogVersion,'','Documento exclusivamente ficticio','Preparación operativa completa exclusivamente sintética');
test('explicit operational proposal retains complete source coverage and keeps exactly 14 pending outside its 855 rows',async()=>{
 const full=await sealAdoptionReview(registryPendingRaw()),r=await operationalAdoptionTransition(full,await sealAdoptionReview(operationalRaw())),body=await payload(operationalRaw());
 assert.equal(r.total,855);assert.equal(r.source.operationalCohort.sourceTotal,2452);assert.equal(r.source.operationalCohort.archivedTotal,1583);assert.equal(r.source.operationalCohort.deferredTotal,14);
 assert.equal(body.rows.length,855);assert.equal(body.version,'employment-adoption-input.v7');assert.equal(body.cohort,COHORT);assert.deepEqual(adoptionProposalInput(body),body);
 assert.equal(r.rows[0].sourceRowNumber,38);assert.ok(full.rows[0].startDate===null);assert.equal(body.sourceFactsPolicy,undefined);
 const b=await adoptionPreparationBootstrap({version:BOOT_VERSION,review:r,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]});assert.equal(b.review.total,855);
});
for(const[label,change]of[
 ['missing deferred coverage',r=>delete r.source.operationalCohort.deferredTotal],['wrong partition',r=>r.source.operationalCohort.deferredTotal++],
 ['duplicate deferred position',r=>r.source.operationalCohort.deferredSourceRowNumbers[1]=r.source.operationalCohort.deferredSourceRowNumbers[0]],
 ['selected position deferred too',r=>r.source.operationalCohort.deferredSourceRowNumbers[13]=r.rows[0].sourceRowNumber],
 ['unknown deferred position',r=>r.source.operationalCohort.deferredSourceRowNumbers[13]=3000],
 ['retained NULL among candidates',r=>r.rows[0].startDate=null],['extra cutoff',r=>r.source.operationalCohort.since='2018-01-01']
])test('rejects '+label,async()=>{const r=operationalRaw();change(r);await assert.rejects(sealAdoptionReview(r));});
test('scope transition refuses a different full seal, changed dates, arbitrary omitted rows or a different person',async()=>{
 const full=await sealAdoptionReview(registryPendingRaw());
 for(const change of[r=>r.source.finalRevision.factsSha256='b'.repeat(64),r=>r.rows[0].startDate='2020-01-01',r=>r.rows[0].name='OTHER_SYNTHETIC',r=>{r.rows.pop();r.total--;r.source.operationalCohort.archivedTotal++;}]){const r=operationalRaw();change(r);await assert.rejects(operationalAdoptionTransition(full,await sealAdoptionReview(r)));}
});
test('missing source facts or identity conflicts cannot be hidden by deferring a NULL date',async()=>{
 const full=registryPendingRaw();full.rows[0].sourceIssues.push('PERSON_FACTS_CHANGED');await assert.rejects(operationalAdoptionTransition(await sealAdoptionReview(full),await sealAdoptionReview(operationalRaw())));
});
test('original proposals cannot be reinterpreted, mixed with declarations or request a pending original jurisdiction',async()=>{
 const body=await payload(operationalRaw());for(const change of[v=>v.cohort='active-contracts.v1',v=>v.version='employment-adoption-input.v4',v=>v.sourceFactsPolicy='preserve-original-pending.v1',v=>v.rows[0].jurisdictionCode=null]){const v=structuredClone(body);change(v);assert.throws(()=>adoptionProposalInput(v));}
 await assert.rejects(adoptionPreparationPayload(await sealAdoptionReview(operationalRaw()),catalogVersion,null,'Documento ficticio','Conservación sintética',{preserveOriginalFacts:true}));
});
test('CSV keeps every deferred original row beyond all pages without nominal values or spreadsheet formulas',async()=>{
 const raw=operationalRaw(57);raw.rows[0].name='=HYPERLINK("PRIVATE")';const r=await verifiedAdoptionReview(await sealAdoptionReview(raw)),csv=adoptionReviewCsv(r);
 assert.equal(csv.split('\r\n').filter(l=>l.includes('Antecedente conservado')).length,14);assert.equal(csv.split('\r\n').length-2,r.counts.observations);assert.match(csv,/"24";/);assert.match(csv,/"37";/);assert.doesNotMatch(csv,/HYPERLINK|PRIVATE|PERSONA|UUID|2012-02-03/);
});
test('a zero candidate review retains its deferred coverage without inventing an empty proposal',async()=>{const r=await verifiedAdoptionReview(await sealAdoptionReview(operationalRaw(14)));assert.equal(r.total,0);assert.equal(r.source.operationalCohort.deferredTotal,14);assert.equal(r.counts.observations,14);await assert.rejects(payload(operationalRaw(14)));});
test('new bootstrap uses a read-only scoped SQL call and refuses a substituted old cohort or scope',async()=>{
 const raw={version:BOOT_VERSION,rawReview:operationalRaw(),catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]},calls=[];
 const sql={query:async(q,v)=>{calls.push([q,v]);return[{result:raw}];}},input={revisionId:raw.rawReview.source.finalRevision.revisionId,packageSha256:raw.rawReview.source.finalRevision.packageSha256};
 const r=await adoptionPreparationOperation(sql,principal,session,'operational-bootstrap',input);assert.equal(r.review.total,855);assert.match(calls[0][0],/^SELECT public.employment_adoption_operational_bootstrap_v1\(/);assert.equal(calls[0][1].length,3);
 raw.version='employment-adoption-preparation.v4';await assert.rejects(adoptionPreparationOperation(sql,principal,session,'operational-bootstrap',input));
});
test('prior request acknowledgement remains byte bound and recoverable',async()=>{const body=await payload(operationalRaw(57)),receipt=await preparationEnvelope(body);assert.equal(receipt.receipt.total,43);assert.equal(receipt.receipt.effects.contractsAdopted,0);});
test('conservative installation generates distinct v7 dispatch, preserves earlier v6 predicates and owner-only source function',()=>{
 const b=buildOperationalContractAdoptionInstallation({sourceCommit:'a'.repeat(40),read:p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),legacyIdentityComparison:true});
 assert.equal(b.newPins.length,2);assert.equal(b.afterPins.length,7);assert.equal(b.newPins.filter(p=>p.runtime).length,1);
 for(const n of[0,1,4])assert.match(b.afterDefinitions[n],/employment_adoption_operational_source_v1/);
 assert.match(b.afterDefinitions[0],/WHEN body_value->>'version'='employment-adoption-input.v7' THEN body_value-ARRAY\['version','finalSource','cohort'\]/);
 assert.match(b.afterDefinitions[0],/body_value->>'version'='employment-adoption-input.v6'/);assert.match(b.newDefinitions[0],/registry_eligible_v1/);
 assert.match(b.afterDefinitions[2],/active-with-entry.v1/);assert.match(b.migration.at(-1),/GRANT EXECUTE.*operational_bootstrap/);assert.doesNotMatch(b.newDefinitions.join('\n'),/INSERT INTO|UPDATE public|DELETE FROM|CREATE TABLE/);
});
