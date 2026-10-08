import test from 'node:test';import assert from 'node:assert/strict';
import {prepareFinalContractTransitionWithinTransaction as prepare,summarizeFinalContractTransition,
 FINAL_CONTRACT_TRANSITION_ROWS_SQL as sql,FINAL_CONTRACT_TRANSITION_LIMIT} from '../scripts/lib/grh-final-contract-transition.mjs';
import {finalTransitionFixture} from './fixtures/final-contract-transition-synthetic.js';
test('complete final contract preparation spans pages and preserves all canonical UUIDs',async()=>{
 const f=finalTransitionFixture({count:1001}),r=await prepare(f.input);
 assert.equal(r.rows.length,1001);assert.equal(r.sourceReceipt.entities,10);
 assert.deepEqual(r.rows.map(x=>x.contract_id),f.projectionRows.map(x=>x.contract_id));
 assert.equal(r.rows[1000].rowNumber,1001);assert.equal(r.reviewRequired,false);
 assert.equal(r.sourceSelected,false);assert.equal(r.contractsApplied,0);assert.equal(r.municipalWrites,0);
 assert.equal(f.cursors.size,0);assert.ok(Object.isFrozen(r.rows[0]));
 assert.ok(f.calls.every(c=>!/^\s*(UPDATE|INSERT|DELETE|BEGIN|COMMIT|ROLLBACK|GRANT|ALTER)\b/i.test(c.text)));
});
test('exact source numbers, NULL and zero remain PostgreSQL JSON text',async()=>{
 const f=finalTransitionFixture(),r=await prepare(f.input);
 assert.equal(r.rows[0].source_record_json,f.data['curated/grh_employees'][0].record_json);
 assert.match(r.rows[0].candidate_facts_json,/9007199254740993\.0000001/);
 assert.match(r.rows[0].candidate_facts_json,/"missing": null/);assert.match(r.rows[0].candidate_facts_json,/"zero": 0/);
});
test('maintenance receipt never contains private facts, names, legajos, IDs or amounts',async()=>{
 const r=await prepare(finalTransitionFixture().input),summary=summarizeFinalContractTransition(r),text=JSON.stringify(summary);
 assert.doesNotMatch(text,/PRIVATE_SYNTHETIC_PERSON|9007199254740993|sourcePayload|contract_id|person_id|previous_facts_json/);
 assert.deepEqual(summary.cohort,r.cohort);assert.equal(summary.municipalWrites,0);
});
test('an empty verified cohort is reported without invented contract issues',async()=>{
 const r=await prepare(finalTransitionFixture({count:0}).input);assert.equal(r.rows.length,0);assert.equal(r.reviewRequired,false);
 assert.deepEqual(r.globalIssues,[]);assert.equal(r.sourceReceipt.entities,10);assert.ok(Object.values(r.issueCounts).every(n=>n===0));
});
test('an otherwise valid copied receipt cannot inject private contents into the maintenance summary',async()=>{
 const r=await prepare(finalTransitionFixture().input),copy=structuredClone(r);copy.cohort.privateName='PRIVATE_PERSON';
 assert.throws(()=>summarizeFinalContractTransition(copy),{code:'GRH_FINAL_TRANSITION_RECEIPT'});
});
test('facts digest is stable and changes if either current contract or proposed facts change',async()=>{
 const a=await prepare(finalTransitionFixture().input),b=await prepare(finalTransitionFixture().input);assert.equal(a.factsSha256,b.factsSha256);
 for(const field of ['previous_facts_json','candidate_facts_json']){
  const r=await prepare(finalTransitionFixture({editRows:rows=>{rows[0][field]='{"changed": true}';}}).input);
  assert.notEqual(r.factsSha256,a.factsSha256);assert.notEqual(r.rows[0].factsSha256,a.rows[0].factsSha256);
 }
});
test('unmatched contracts stay in the complete review with explicit independent issues',async()=>{
 const r=await prepare(finalTransitionFixture({editRows:rows=>Object.assign(rows[1],{
  contract_id:null,person_id:null,previous_facts_json:null,issues:['CONTRACT_NOT_FOUND','CORE_RECORD_MISSING','JURISDICTION_MISSING_ACTIVE']})}).input);
 assert.equal(r.rows.length,3);assert.equal(r.rows[1].rowNumber,2);assert.equal(r.reviewRequired,true);
 assert.equal(r.issueCounts.CONTRACT_NOT_FOUND,1);assert.equal(r.issueCounts.CORE_RECORD_MISSING,1);
});
for(const field of ['missing_core_keys','extra_core_keys','duplicate_candidate_keys','duplicate_core_keys','missing_existing_keys','foreign_company_rows'])
 test('cohort issue stays global instead of being invented as omitted rows: '+field,async()=>{
  const r=await prepare(finalTransitionFixture({editCohort:c=>c[field]=1}).input);assert.deepEqual(r.globalIssues,[field]);assert.equal(r.rows.length,3);assert.equal(r.reviewRequired,true);
 });
test('global amount limit rejects the entire preparation before any row projection',async()=>{
 const f=finalTransitionFixture({editContext:c=>c.fingerprints['curated/grh_employees'].rows=FINAL_CONTRACT_TRANSITION_LIMIT+1});
 await assert.rejects(prepare(f.input),{code:'GRH_FINAL_TRANSITION_GLOBAL_LIMIT'});
 assert.equal(f.calls.length,1);assert.equal(f.cursors.size,0);
});
for(const mode of ['fewer','extra','same-count-source-change','duplicate-key','duplicate-contract','unexpected-field','unknown-issue','unsafe-id','missing-person','wrong-order'])
 test('rejects inconsistent projection: '+mode,async()=>{
  const f=finalTransitionFixture({editRows:rows=>{
   if(mode==='fewer')rows.pop();if(mode==='extra')rows.push(structuredClone(rows[0]));
   if(mode==='same-count-source-change')rows[0].source_record_json='{"changed": true}';
   if(mode==='duplicate-key')rows[1].row_key=rows[0].row_key;if(mode==='duplicate-contract')rows[1].contract_id=rows[0].contract_id;
   if(mode==='unexpected-field')rows[0].unexpected=true;if(mode==='unknown-issue')rows[0].issues=['sql error with private content'];
   if(mode==='unsafe-id')rows[0].contract_id='generated-by-dni';if(mode==='missing-person')rows[0].person_id=null;
   if(mode==='wrong-order')rows.reverse();
  }});await assert.rejects(prepare(f.input),e=>/^GRH_FINAL_TRANSITION_/.test(e.code));assert.equal(f.cursors.size,0);
 });
test('revocation after full source consumption invalidates the projection receipt',async()=>{
 const f=finalTransitionFixture(),query=f.client.query;f.client.query=async(text,values)=>{const result=await query(text,values);
  if(text===sql)f.context.verified=false;return result;};
 await assert.rejects(prepare(f.input),{code:'GRH_FINAL_CONSUMER_CONTEXT'});
});
test('projection SQL failure and cancellation never produce a successful receipt',async()=>{
 const f=finalTransitionFixture(),query=f.client.query;f.client.query=async(text,values)=>{if(text===sql)throw Error('synthetic SQL failure');return query(text,values);};
 await assert.rejects(prepare(f.input),/synthetic SQL failure/);
 const g=finalTransitionFixture(),abort=new AbortController(),next=g.client.query;g.client.query=async(text,values)=>{const r=await next(text,values);if(text===sql)abort.abort();return r;};
 await assert.rejects(prepare({...g.input,signal:abort.signal}),{name:'AbortError'});assert.equal(g.cursors.size,0);
});
test('a count-only or forged preparation cannot be summarized as an applied adoption',()=>{
 assert.throws(()=>summarizeFinalContractTransition({version:'grh-final-contract-transition.v1',preparationOnly:true,sourceSelected:true,contractsApplied:1,municipalWrites:1}),{code:'GRH_FINAL_TRANSITION_RECEIPT'});
});
