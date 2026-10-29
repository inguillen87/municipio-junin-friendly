import test from 'node:test';import assert from 'node:assert/strict';
import {prepareOwnF931,ownF931Proof,ownF931JurisdictionScope,ownF931JurisdictionScopeProof,ownF931VisibleScopeContracts,ownF931JurisdictionScopeCsv} from '../assets/own-f931-preparation-model.js';
import {jurisdictionFixture} from './fixtures/own-payroll-jurisdiction-synthetic.js';
import {reportFixture} from './fixtures/own-payroll-report-synthetic.js';
const params=f=>({period:f.query.from,presentationDate:'2026-10-31',types:f.query.types});
const prep=f=>prepareOwnF931(params(f),f.details,f.receipts);
const cents=s=>{assert.match(s,/^-?\d+\.\d{2}$/);const negative=s[0]==='-',text=negative?s.slice(1):s;const [a,b]=text.split('.');return(negative?-1n:1n)*(BigInt(a)*100n+BigInt(b));};
const money=n=>(n/100n).toString()+'.'+(n%100n).toString().padStart(2,'0');
test('Todas/42/55 derive all groups, contracts and exact totals from the same complete original closure',async()=>{
 const f=jurisdictionFixture(61),before=JSON.stringify(f),full=await prep(f),proof=ownF931Proof(full),all=ownF931JurisdictionScope(full),a=ownF931JurisdictionScope(full,'42'),b=ownF931JurisdictionScope(full,'55');
 assert.equal(a.version,'own-f931-jurisdiction-scope.v1');assert.equal(all.participations,61);assert.equal(a.participations,31);assert.equal(b.participations,30);assert.equal(a.closedGroups,1);assert.equal(b.closedGroups,1);assert.equal(a.contracts,31);assert.equal(b.contracts,30);
 for(const scope of [all,a,b]){assert.equal(scope.sourceProof,full.sourceProof);assert.strictEqual(scope.sourceHashes,full.sourceHashes);assert.equal(scope.universeProof,proof);assert.strictEqual(scope.universe.coverage,full.coverage);assert.strictEqual(scope.universe.totals,full.totals);assert.strictEqual(scope.universe.fiscalCoverage,full.fiscalCoverage);assert.equal(scope.fiscalPopulationCertified,false);assert.equal(scope.canGenerate,false);assert.equal(scope.canSubmit,false);assert.ok(Object.isFrozen(scope));}
 for(const key of Object.keys(full.totals)){assert.equal(cents(a.totals[key])+cents(b.totals[key]),cents(all.totals[key]));const expected=f.receipts[0].snapshot.employees.filter(e=>e.jurisdiction.code==='42').reduce((n,e)=>n+cents(e.totals[key]),0n);assert.equal(a.totals[key],money(expected));}
 assert.equal(ownF931VisibleScopeContracts(a,'','all',2).rows.length,11);assert.equal(ownF931VisibleScopeContracts(b,'','all',2).rows.length,10);assert.equal(ownF931VisibleScopeContracts(a,'absent','all',4).total,31);
 assert.notEqual(ownF931JurisdictionScopeProof(a),ownF931JurisdictionScopeProof(b));assert.equal(ownF931Proof(full),proof);assert.equal(JSON.stringify(f),before);
 const csv=ownF931JurisdictionScopeCsv(a);assert.match(csv,/Jurisdicción 42/);assert.match(csv,/"31"/);assert.match(csv,/UNIVERSO COMPLETO/);assert.equal((csv.match(/"Campo \d+ ·/g)||[]).length,60);for(const row of f.receipts[0].snapshot.employees){assert.ok(!csv.includes('"'+row.contractId+'"'));assert.ok(!csv.includes('"'+row.employeeNumber+'"'));assert.ok(!csv.includes('"'+row.totals.gross+'"'));}
});
test('old or unknown jurisdictions cannot silently become a complete42/55 view',async()=>{
 const old=await prep(reportFixture(2)),unknown=await prep(jurisdictionFixture(3,i=>i===1?null:'42'));
 for(const value of [old,unknown]){assert.equal(ownF931JurisdictionScope(value,'all').participations,value.participations);for(const choice of ['42','55'])assert.throws(()=>ownF931JurisdictionScope(value,choice),/No se puede asegurar/);}
 for(const choice of ['042','general','',42,null,'not_captured'])assert.throws(()=>ownF931JurisdictionScope(old,choice),/Elegí/);
 assert.throws(()=>ownF931JurisdictionScope({...old},'all'),/Verificá/);assert.throws(()=>ownF931JurisdictionScopeProof({...ownF931JurisdictionScope(old)}),/Revisá/);
});
test('an empty certified jurisdiction stays empty without inventing rows or changing full totals',async()=>{
 const full=await prep(jurisdictionFixture(4,()=> '42')),empty=ownF931JurisdictionScope(full,'55');assert.equal(empty.participations,0);assert.equal(empty.contracts,0);assert.equal(empty.closedGroups,0);assert.equal(empty.coverage[0].closedParticipations,0);assert.deepEqual(Object.values(empty.totals),Array(6).fill(null));assert.equal(full.participations,4);assert.notEqual(full.totals.gross,null);
});
