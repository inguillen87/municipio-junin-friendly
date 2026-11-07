import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOwnF931,ownF931Proof,ownF931PreparationCsv,ownF931VisibleContracts} from '../assets/own-f931-preparation-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {FISCAL_FACT_FIELDS} from '../assets/own-fiscal-facts-model.js';
import {jurisdictionFixture} from './fixtures/own-payroll-jurisdiction-synthetic.js';
import {sharedJurisdictionFixture,sharedJurisdictionCensus} from './fixtures/own-f931-jurisdiction-synthetic.js';
const params=(f,jurisdiction)=>({period:f.query.from,presentationDate:'2026-10-31',types:f.query.types,jurisdiction});
const V1_KEYS=['contracts','fields','identityNotCaptured','missing','queried','reviewed','selectedContracts','stale'],zeros=Object.fromEntries(FISCAL_FACT_FIELDS.map(n=>[n,0]));
const counts=r=>Object.fromEntries(r.issues.map(i=>[i.code,i.count]));

test('v1 without a fiscal census: captured identities count as missing, every state is not_queried, FISCAL_FACTS_MISSING is emitted, fiscalCoverage keeps its 8 keys',async()=>{
 const f=jurisdictionFixture(4,()=>'42');
 for(const [jurisdiction,selected]of [['all',4],['42',4],['55',0]]){
  const r=await prepareOwnF931(params(f,jurisdiction),f.details,f.receipts);
  assert.equal(r.version,'own-f931-preparation.v1');assert.equal(Object.hasOwn(r,'historicalSources'),false);
  assert.deepEqual(r.fiscalCoverage,{queried:false,contracts:4,selectedContracts:selected,reviewed:0,missing:4,stale:0,identityNotCaptured:0,fields:zeros});
  assert.deepEqual(Object.keys(r.fiscalCoverage).sort(),V1_KEYS);
  assert.ok(r.fiscalRows.every(x=>x.state==='not_queried'&&x.knownFields===null));assert.equal(counts(r).FISCAL_FACTS_MISSING,4);assert.equal(Object.hasOwn(counts(r),'FISCAL_IDENTITY_NOT_CAPTURED'),false);
  assert.deepEqual(r.coverage.map(c=>[c.currentRows,c.notClosedRows]),[[4,0]]);
  assert.equal(ownF931Proof(r),salarySerialized({params:r.params,sourceProof:r.sourceProof,hashes:r.sourceHashes,fiscalProof:null}));
  assert.equal(ownF931PreparationCsv(r).includes('Base de lectura'),false);assert.equal(ownF931PreparationCsv(r).includes('Filas operativas actuales sin consultar'),false);
 }
});

test('v1 without a fiscal census and two uncaptured identities: identityNotCaptured 2, missing 2, both issues, all states not_queried',async()=>{
 const f=sharedJurisdictionFixture();
 for(const jurisdiction of ['all','42','55']){
  const r=await prepareOwnF931(params(f,jurisdiction),f.details,f.receipts);
  assert.deepEqual([r.fiscalCoverage.identityNotCaptured,r.fiscalCoverage.missing,r.fiscalCoverage.reviewed,r.fiscalCoverage.stale,r.fiscalCoverage.contracts],[2,2,0,0,4]);
  assert.deepEqual(Object.keys(r.fiscalCoverage).sort(),V1_KEYS);
  assert.deepEqual([counts(r).FISCAL_IDENTITY_NOT_CAPTURED,counts(r).FISCAL_FACTS_MISSING],[2,2]);
  assert.ok(r.fiscalRows.every(x=>x.state==='not_queried'));
 }
});

test('v1 with the complete fiscal census keeps the R5 verdicts in all/42/55 and the v1 proof shape',async()=>{
 const f=sharedJurisdictionFixture(),census=await sharedJurisdictionCensus(f);
 for(const jurisdiction of ['all','42','55']){
  const r=await prepareOwnF931(params(f,jurisdiction),f.details,f.receipts,census);
  assert.deepEqual([r.fiscalCoverage.contracts,r.fiscalCoverage.identityNotCaptured,r.fiscalCoverage.reviewed,r.fiscalCoverage.missing,r.fiscalCoverage.stale],[4,2,2,0,0]);
  assert.deepEqual(Object.keys(r.fiscalCoverage).sort(),V1_KEYS);
  assert.deepEqual(r.fiscalRows.map(x=>x.state).sort(),['documented','documented','identity_not_captured','identity_not_captured']);
  assert.equal(ownF931Proof(r),salarySerialized({params:r.params,sourceProof:r.sourceProof,hashes:r.sourceHashes,fiscalProof:r.fiscalProof}));
  assert.equal(ownF931VisibleContracts(r).total,4);
 }
});
