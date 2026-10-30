// Pure public DTO fixtures and injected readers only. No database, HTTP or fiscal submission.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f931 from '../assets/own-f931-preparation-model.js';
import {loadOwnF931Preparation} from '../assets/own-f931-preparation-client.js';
import {fiscalFactsHash} from '../assets/own-fiscal-facts-model.js';
import {fiscalCoverageFixture,addHistoricalFiscalType} from './fixtures/own-f931-fiscal-coverage-synthetic.js';

const prepare=(f,census=null)=>f931.prepareOwnF931(f.params,f.report.details,f.report.receipts,census);
async function emptyCensus(f){
 const census=structuredClone(f.census);census.rows=[];census.stateVersion=await fiscalFactsHash(census.rows);return census;
}
function adapter(f){
 const calls=[];return {calls,session:async()=>{calls.push('session');},read:async q=>{
  calls.push(q.resource);return structuredClone(q.resource==='detail'
   ?f.report.details.find(d=>d.liquidationType===q.liquidationType)
   :f.report.receipts.find(r=>r.groupId===q.id));
 }};
}
function partition(result){
 const c=result.fiscalCoverage;
 assert.equal(c.reviewed+c.missing+c.stale+c.identityNotCaptured+c.notQueried,c.contracts);
 assert.equal(result.canGenerate,false);assert.equal(result.canSubmit,false);
}

test('an unqueried census cannot certify missing reviews or stale fiscal facts',async()=>{
 const f=await fiscalCoverageFixture(2),before=JSON.stringify(f),r=await prepare(f);
 assert.equal(r.fiscalCoverage.queried,false);assert.equal(r.fiscalCoverage.missing,0);
 assert.equal(r.fiscalCoverage.stale,0);assert.equal(r.fiscalCoverage.reviewed,0);
 assert.equal(r.fiscalCoverage.notQueried,2);partition(r);
 assert.ok(r.fiscalRows.every(row=>row.state==='not_queried'&&row.knownFields===null&&row.unknownFields===null));
 assert.ok(!r.issues.some(issue=>['FISCAL_FACTS_MISSING','FISCAL_FACTS_STALE'].includes(issue.code)));
 const csv=f931.ownF931PreparationCsv(r);
 assert.match(csv,/Datos fiscales sin consultar/);assert.match(csv,/2 contratos sin consultar/);
 assert.doesNotMatch(csv,/2 sin revisión|contratos revisados vigentes/);
 assert.equal(JSON.stringify(f),before);
});

test('a verified empty census proves missing reviews while the exact same closed payroll stays unchanged',async()=>{
 const f=await fiscalCoverageFixture(2),unqueried=await prepare(f),queried=await prepare(f,await emptyCensus(f));
 assert.equal(queried.fiscalCoverage.queried,true);assert.equal(queried.fiscalCoverage.missing,2);
 assert.equal(queried.fiscalCoverage.notQueried,0);partition(queried);
 assert.ok(queried.fiscalRows.every(row=>row.state==='missing'));
 assert.equal(queried.issues.find(issue=>issue.code==='FISCAL_FACTS_MISSING').count,2);
 assert.match(f931.ownF931PreparationCsv(queried),/2 sin revisión/);
 assert.deepEqual(queried.totals,unqueried.totals);assert.deepEqual(queried.coverage,unqueried.coverage);
 assert.deepEqual(queried.sourceHashes,unqueried.sourceHashes);assert.equal(queried.sourceProof,unqueried.sourceProof);
 assert.notEqual(f931.ownF931Proof(queried),f931.ownF931Proof(unqueried));
});

test('missing captured identity is independently known even without a fiscal query',async()=>{
 const f=addHistoricalFiscalType(await fiscalCoverageFixture(6)),unqueried=await prepare(f);
 assert.equal(unqueried.contracts,6);assert.equal(unqueried.participations,8);
 assert.equal(unqueried.fiscalCoverage.identityNotCaptured,2);assert.equal(unqueried.fiscalCoverage.notQueried,4);
 assert.equal(unqueried.fiscalCoverage.missing,0);partition(unqueried);
 assert.equal(unqueried.fiscalRows.filter(row=>row.state==='identity_not_captured').length,2);
 assert.equal(unqueried.issues.find(issue=>issue.code==='FISCAL_IDENTITY_NOT_CAPTURED').count,2);
 const queried=await prepare(f,await emptyCensus(f));partition(queried);
 assert.equal(queried.fiscalCoverage.identityNotCaptured,2);assert.equal(queried.fiscalCoverage.missing,4);
 assert.deepEqual(queried.sourceHashes,unqueried.sourceHashes);
});

test('verified61-contract coverage keeps every real missing/stale/reviewed classification',async()=>{
 const f=await fiscalCoverageFixture(),r=await prepare(f,f.census);partition(r);
 assert.equal(r.contracts,61);assert.equal(r.fiscalCoverage.notQueried,0);
 assert.equal(r.fiscalCoverage.missing,16);assert.equal(r.fiscalCoverage.stale,15);assert.equal(r.fiscalCoverage.reviewed,30);
 assert.equal(r.fiscalRows.filter(row=>row.state==='documented').length,15);
 assert.equal(r.fiscalRows.filter(row=>row.state==='unknown_fields').length,15);
});

test('no closed contracts is empty and does not invent a missing fiscal review',async()=>{
 const f=await fiscalCoverageFixture(0),r=await prepare(f);partition(r);
 assert.equal(r.contracts,0);assert.equal(r.fiscalCoverage.notQueried,0);assert.equal(r.fiscalCoverage.missing,0);
 assert.equal(r.fiscalRows.length,0);assert.equal(r.totals.gross,null);
 assert.ok(!r.issues.some(issue=>issue.code==='FISCAL_FACTS_MISSING'));
});

test('the optional GET-only client distinguishes no fiscal reader from an empty verified census',async()=>{
 const f=await fiscalCoverageFixture(2),deps=adapter(f);
 const unqueried=await loadOwnF931Preparation(f.params,deps);partition(unqueried);
 assert.equal(unqueried.fiscalCoverage.notQueried,2);assert.equal(deps.calls.filter(call=>call==='session').length,2);
 let reads=0;const census=await emptyCensus(f),queried=await loadOwnF931Preparation(f.params,{
  ...adapter(f),readFiscal:async()=>{reads++;return structuredClone(census);}
 });
 assert.equal(reads,2);partition(queried);assert.equal(queried.fiscalCoverage.missing,2);
 for(const status of [403,503])await assert.rejects(loadOwnF931Preparation(f.params,{
  ...adapter(f),readFiscal:async()=>{throw Object.assign(Error('SYNTHETIC_FISCAL_READ_FAILED'),{status});}
 }),error=>error.status===status);
});

test('the unqueried CSV and proof conserve the complete population despite empty screen filters',async()=>{
 const f=await fiscalCoverageFixture(),r=await prepare(f),csv=f931.ownF931PreparationCsv(r),proof=f931.ownF931Proof(r);
 assert.equal(f931.ownF931VisibleContracts(r,'not present','all',99).filtered,0);
 assert.equal(f931.ownF931VisibleContracts(r,'not present','all',99).total,61);
 assert.equal(f931.ownF931PreparationCsv(r),csv);assert.equal(f931.ownF931Proof(r),proof);
 assert.match(csv,/61 contratos sin consultar/);assert.equal((csv.match(/"Campo \d+ ·/g)??[]).length,60);
 for(const row of r.fiscalRows)for(const value of [row.contractId,...row.employeeNumbers])assert.ok(!csv.includes('"'+value+'"'));
 for(const row of f.census.rows)assert.ok(!csv.includes(row.configuration.definition.documentReference));
});
