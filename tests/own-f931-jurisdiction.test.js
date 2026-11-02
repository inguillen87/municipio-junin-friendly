import test from 'node:test';
import assert from 'node:assert/strict';
import {ownF931Params,ownF931Jurisdiction,OWN_F931_JURISDICTION_CHOICES} from '../assets/own-f931-contract.js';
import {prepareOwnF931,ownF931Proof,ownF931PreparationCsv,ownF931VisibleContracts,OWN_F931_JURISDICTION_BUCKETS} from '../assets/own-f931-preparation-model.js';
import {loadOwnF931Preparation} from '../assets/own-f931-preparation-client.js';
import {createObjectUrlRegistry} from '../assets/own-f931-preparation-panel.js';
import {OWN_JURISDICTIONS} from '../assets/own-payroll-jurisdiction-model.js';
import {decimal,exactAdd,exactEvidence,quantize} from '../assets/own-payroll-exact.js';
import {jurisdictionFixture} from './fixtures/own-payroll-jurisdiction-synthetic.js';
import {reportGroup,historicalReportFixture,rehashReportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {FISCAL_FACT_FIELDS,fiscalFactsHash} from '../assets/own-fiscal-facts-model.js';
import {sharedJurisdictionFixture,sharedJurisdictionCensus} from './fixtures/own-f931-jurisdiction-synthetic.js';
const TOTAL_KEYS=['remuneration','non_remuneration','deduction','employer_contribution','gross','net'];
const params=(f,jurisdiction)=>({period:f.query.from,presentationDate:'2026-10-31',types:[...f.query.types],...(jurisdiction===undefined?{}:{jurisdiction})});
const prepare=(f,jurisdiction,census)=>prepareOwnF931(params(f,jurisdiction),f.details,f.receipts,census);
const decimals=amount=>amount.includes('.')?amount.split('.')[1].length:0;
const sum=(x,y,precision)=>quantize(exactAdd(decimal(x),decimal(y)),{precision,mode:'exact'}).amount;
const buckets=values=>Object.fromEntries(OWN_F931_JURISDICTION_BUCKETS.map(k=>[k,values[k]??0]));
// Same re-labelling as historicalReportFixture, applied to a v2 jurisdiction fixture: the closed
// snapshot keeps its conserved jurisdictions; current rows and captures of that type are dropped.
function retyped(f,type,number){const receipt=f.receipts[0],detail=f.details[0];receipt.id=uid(number);receipt.groupId=receipt.id;receipt.key=uid(number+1000);receipt.body.liquidationType=type;receipt.bodySha256=ownRunHash(receipt.body);receipt.snapshot.liquidationType=type;receipt.snapshotSha256=ownRunHash(receipt.snapshot);detail.liquidationType=type;detail.rows=[];detail.captures=[];detail.groups=[reportGroup(receipt)];f.query.types=[type];return f;}
const merged=(a,b)=>({query:{from:a.query.from,to:a.query.from,types:[...a.query.types,...b.query.types]},details:[...a.details,...b.details],receipts:[...a.receipts,...b.receipts]});
function adapter(f){const calls=[];let sessions=0;return {calls,get sessions(){return sessions;},session:async()=>{sessions++;},read:async q=>{calls.push(structuredClone(q));const result=q.resource==='detail'?f.details.find(d=>d.liquidationType===q.liquidationType):f.receipts.find(r=>r.id===q.id);return structuredClone(result);}};}

test('strict 3-key and 4-key shapes normalize to one idempotent 4-key form; every other jurisdiction is rejected',()=>{
 const p=params(jurisdictionFixture(2));
 assert.deepEqual([...OWN_F931_JURISDICTION_CHOICES],['all','42','55']);
 const legacy=ownF931Params(p);assert.equal(legacy.jurisdiction,'all');assert.deepEqual(Object.keys(legacy).sort(),['jurisdiction','period','presentationDate','types']);
 const chosen=ownF931Params({...p,jurisdiction:'55'});assert.equal(chosen.jurisdiction,'55');assert.deepEqual(ownF931Params(chosen),chosen);assert.deepEqual(ownF931Params(legacy),legacy);
 for(const bad of ['not_reported','not_captured','43','',null,undefined,42,['42']])assert.throws(()=>ownF931Params({...p,jurisdiction:bad}));
 for(const bad of [{...p,extra:'ignored'},{...p,jurisdiction:'42',extra:'ignored'},null,[p]])assert.throws(()=>ownF931Params(bad));
 assert.equal(ownF931Jurisdiction('42'),'42');assert.throws(()=>ownF931Jurisdiction('all '));
});

test('all / 42 / 55 over one closed type: participations and exact totals partition; contracts, fiscal rows and issues stay on the complete universe',async()=>{
 const f=jurisdictionFixture(4),all=await prepare(f,'all'),a=await prepare(f,'42'),b=await prepare(f,'55'),legacy=await prepare(f),precision=decimals(all.totals.gross);
 assert.equal(ownF931Proof(legacy),ownF931Proof(all));assert.deepEqual(legacy.totals,all.totals);
 assert.deepEqual([all.participations,a.participations,b.participations],[4,2,2]);
 assert.deepEqual([all.scopeParticipations,a.scopeParticipations,b.scopeParticipations],[4,4,4]);
 assert.deepEqual([all.closedGroups,a.closedGroups,b.closedGroups,all.scopeContracts,a.scopeContracts],[1,1,1,4,4]);
 assert.deepEqual(all.jurisdictionCoverage,{scope:4,...buckets({'42':2,'55':2}),contractsInSeveralJurisdictions:0});
 assert.deepEqual(a.jurisdictionCoverage,all.jurisdictionCoverage);assert.deepEqual(b.jurisdictionCoverage,all.jurisdictionCoverage);
 for(const k of TOTAL_KEYS){assert.equal(all.totals[k],sum(a.totals[k],b.totals[k],precision));assert.equal(a.scopeTotals[k],all.totals[k]);assert.equal(b.scopeTotals[k],all.totals[k]);assert.equal(all.scopeTotals[k],all.totals[k]);}
 assert.deepEqual(all.coverage.map(c=>[c.closedParticipations,c.selectedParticipations]),[[4,4]]);assert.deepEqual(a.coverage.map(c=>[c.closedParticipations,c.selectedParticipations]),[[4,2]]);
 assert.deepEqual(a.coverage[0].jurisdictions,buckets({'42':2,'55':2}));
 assert.deepEqual(a.issues,all.issues);assert.deepEqual(b.issues,all.issues);
 assert.equal(a.fiscalRows.length,4);assert.equal(a.fiscalRows.filter(r=>r.selectedParticipations>0).length,2);assert.equal(a.fiscalCoverage.contracts,4);assert.equal(a.fiscalCoverage.selectedContracts,2);
 assert.deepEqual([ownF931VisibleContracts(a).rows.length,ownF931VisibleContracts(a).selected,ownF931VisibleContracts(a).total,ownF931VisibleContracts(all).rows.length,ownF931VisibleContracts(all).selected],[2,2,4,4,4]);
 assert.notEqual(ownF931Proof(a),ownF931Proof(all));assert.notEqual(ownF931Proof(a),ownF931Proof(b));
 assert.equal(a.canGenerate,false);assert.equal(a.canSubmit,false);assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.jurisdictionCoverage));
});

test('the same contract closed with 42 in monthly and 55 in supplementary is a union, not a sum; its fiscal state is invariant',async()=>{
 const f=merged(jurisdictionFixture(2,()=>'42'),retyped(jurisdictionFixture(2,()=>'55'),'supplementary',701));
 const all=await prepare(f,'all'),a=await prepare(f,'42'),b=await prepare(f,'55'),precision=decimals(all.totals.gross);
 assert.deepEqual([all.participations,a.participations,b.participations],[4,2,2]);
 assert.deepEqual([all.contracts,a.contracts,b.contracts,all.scopeContracts],[2,2,2,2]);
 assert.ok(a.contracts+b.contracts>all.contracts,'contracts are not additive across jurisdictions');
 assert.deepEqual(all.jurisdictionCoverage,{scope:4,...buckets({'42':2,'55':2}),contractsInSeveralJurisdictions:2});
 assert.equal(all.issues.find(i=>i.code==='JURISDICTION_MIXED_CONTRACTS').count,2);assert.deepEqual(a.issues,all.issues);assert.deepEqual(b.issues,all.issues);
 const byType=Object.fromEntries(all.coverage.map(c=>[c.type,c.jurisdictions]));assert.deepEqual(byType.monthly,buckets({'42':2}));assert.deepEqual(byType.supplementary,buckets({'55':2}));
 assert.deepEqual(a.coverage.map(c=>[c.type,c.selectedParticipations]).sort(),[['monthly',2],['supplementary',0]]);assert.deepEqual(b.coverage.map(c=>[c.type,c.selectedParticipations]).sort(),[['monthly',0],['supplementary',2]]);
 for(const k of TOTAL_KEYS)assert.equal(all.totals[k],sum(a.totals[k],b.totals[k],precision));
 const states=r=>Object.fromEntries(r.fiscalRows.map(x=>[x.contractId,x.state]));assert.deepEqual(states(a),states(all));assert.deepEqual(states(b),states(all));
 assert.deepEqual(a.fiscalRows.map(r=>r.selectedTypes),[['monthly'],['monthly']]);assert.deepEqual(b.fiscalRows.map(r=>r.selectedTypes),[['supplementary'],['supplementary']]);
 assert.deepEqual(all.fiscalRows.map(r=>[...r.types].sort()),[['monthly','supplementary'],['monthly','supplementary']]);assert.deepEqual(all.fiscalRows.map(r=>r.selectedParticipations),[2,2]);
 const ids=r=>new Set(ownF931VisibleContracts(r).rows.map(x=>x.contractId));assert.deepEqual(new Set([...ids(a),...ids(b)]),ids(all));assert.equal(ids(a).size+ids(b).size,4);
});

test('unknown jurisdictions stay inside Todas and block 42/55 for the whole scope with explicit counts',async()=>{
 const nullish=jurisdictionFixture(3,i=>i===1?null:'42'),all=await prepare(nullish,'all');
 assert.deepEqual(all.jurisdictionCoverage,{scope:3,...buckets({'42':2,not_reported:1}),contractsInSeveralJurisdictions:0});
 assert.equal(all.issues.find(i=>i.code==='JURISDICTION_NOT_CAPTURED').count,1);assert.equal(all.participations,3);assert.equal(all.fiscalRows.length,3);
 await assert.rejects(prepare(nullish,'42'),/no capturadas o sin informar[\s\S]*Sin informar en el alta: 1\. No capturada en el cálculo: 0\./);
 await assert.rejects(prepare(nullish,'55'),/Consultá "Todas las jurisdicciones"/);
 const legacy=historicalReportFixture('2026-09','monthly'),v1=await prepare(legacy,'all');
 assert.deepEqual(v1.jurisdictionCoverage,{scope:2,...buckets({not_captured:2}),contractsInSeveralJurisdictions:0});assert.equal(v1.issues.find(i=>i.code==='JURISDICTION_NOT_CAPTURED').count,2);
 await assert.rejects(prepare(legacy,'42'),/No capturada en el cálculo: 2\./);
 const monthly=jurisdictionFixture(2,()=>'42'),mixed=merged(monthly,historicalReportFixture(monthly.query.from,'supplementary',801)),m=await prepare(mixed,'all');
 assert.deepEqual(m.jurisdictionCoverage,{scope:4,...buckets({'42':2,not_captured:2}),contractsInSeveralJurisdictions:0});
 const byType=Object.fromEntries(m.coverage.map(c=>[c.type,c.jurisdictions]));assert.deepEqual(byType.monthly,buckets({'42':2}));assert.deepEqual(byType.supplementary,buckets({not_captured:2}));
 await assert.rejects(prepare(mixed,'42'),/No capturada en el cálculo: 2\./);
});

test('an empty census keeps null totals for every jurisdiction without inventing rows or errors',async()=>{
 for(const jurisdiction of ['all','42','55']){
  const f=jurisdictionFixture(2);f.details[0].groups=[];f.details[0].rows=[];f.details[0].captures=[];f.receipts=[];
  const r=await prepare(f,jurisdiction);
  assert.deepEqual([r.participations,r.scopeParticipations,r.contracts,r.scopeContracts,r.closedGroups],[0,0,0,0,0]);
  assert.equal(r.totals.gross,null);assert.equal(r.scopeTotals.gross,null);
  assert.deepEqual(r.jurisdictionCoverage,{scope:0,...buckets({}),contractsInSeveralJurisdictions:0});
  assert.deepEqual(r.issues.map(i=>i.code),['NO_CLOSED_GROUPS']);assert.equal(ownF931VisibleContracts(r).total,0);
 }
});

test('CSV keeps only labels and counts, names the chosen jurisdiction and the complete distribution; no nominal data, amounts or hashes',async()=>{
 const f=jurisdictionFixture(4),scopedReport=await prepare(f,'42'),allReport=await prepare(f,'all'),scoped=ownF931PreparationCsv(scopedReport),all=ownF931PreparationCsv(allReport);
 assert.ok(scoped.includes('"Jurisdicción elegida";"'+OWN_JURISDICTIONS['42']+'"'));assert.ok(all.includes('"Jurisdicción elegida";"'+OWN_JURISDICTIONS.all+'"'));
 assert.ok(scoped.includes('"Jurisdicciones conservadas en el alcance completo";"42: 2 · 55: 2"'));
 assert.ok(scoped.includes('"Participaciones propias cerradas";"2 de 4 del alcance completo"'));assert.ok(all.includes('"Participaciones propias cerradas";"4"'));
 assert.equal(scoped.match(/"Campo \d+ ·/g).length,60);assert.equal(all.match(/"Campo \d+ ·/g).length,60);
 for(const csv of [scoped,all]){
  for(const e of f.receipts[0].snapshot.employees){assert.equal(csv.includes(e.contractId),false);for(const k of TOTAL_KEYS)assert.equal(csv.includes('"'+e.totals[k]+'"'),false);}
  assert.equal(csv.includes(f.receipts[0].snapshotSha256),false);assert.equal(csv.includes(f.receipts[0].groupId),false);assert.equal(csv.includes(f.receipts[0].body.reason),false);
  for(const k of TOTAL_KEYS)assert.equal(csv.includes('"'+scopedReport.totals[k]+'"')||csv.includes('"'+allReport.totals[k]+'"'),false);
  for(const line of csv.slice(1).split('\r\n').filter(Boolean))for(const cell of line.match(/"(?:[^"]|"")*"/g)??[])assert.doesNotMatch(cell.slice(1,-1),/^[\s]*[=+\-@\t\r\n]/);
 }
 assert.throws(()=>ownF931PreparationCsv({...scopedReport}));
});

test('the GET-only client never sends the jurisdiction and keeps the complete census, rechecks and session for a scoped choice',async()=>{
 const f=jurisdictionFixture(4),deps=adapter(f),r=await loadOwnF931Preparation(params(f,'42'),deps);
 assert.equal(r.participations,2);assert.equal(r.scopeParticipations,4);assert.equal(r.params.jurisdiction,'42');
 assert.ok(deps.calls.every(c=>!Object.hasOwn(c,'jurisdiction')));assert.deepEqual(deps.calls.map(c=>c.resource),['detail','group','detail']);assert.equal(deps.sessions,2);
 const plain=adapter(f);await loadOwnF931Preparation(params(f),plain);assert.deepEqual(plain.calls,deps.calls);
});

test('census, source and session drift still abort a jurisdiction-scoped preparation',async()=>{
 const f=jurisdictionFixture(4),a=adapter(f);let reads=0;const read=a.read;
 await assert.rejects(loadOwnF931Preparation(params(f,'42'),{...a,read:async q=>{const d=await read(q);if(++reads===3)d.stateVersion=ownRunHash('changed');return d;}}),/Cambió el histórico/);
 const b=adapter(f);let sessions=0;await assert.rejects(loadOwnF931Preparation(params(f,'55'),{...b,session:async()=>{if(++sessions===2)throw Error('REVOKED');}}),/REVOKED/);
 const damaged=jurisdictionFixture(4);damaged.receipts[0].snapshotSha256='f'.repeat(64);await assert.rejects(loadOwnF931Preparation(params(damaged,'42'),adapter(damaged)));
 const c=adapter(f);await assert.rejects(loadOwnF931Preparation(params(f,'42'),{...c,valid:()=>c.calls.length<2}),{name:'AbortError'});
 const scoped=await prepare(f,'42'),other=await prepare(f,'55');assert.notEqual(ownF931Proof(scoped),ownF931Proof(other));
});

function fakeClock(){const timers=new Map();let next=0;return {schedule:(fn,delay)=>{const id=++next;timers.set(id,{fn,delay});return id;},cancel:id=>{timers.delete(id);},fire(id){const t=timers.get(id);if(!t)return false;timers.delete(id);t.fn();return true;},get pending(){return [...timers.keys()];},get delays(){return [...timers.values()].map(t=>t.delay);}};}
function fakeUrls(){const created=[],revoked=[];let n=0;return {created,revoked,createObjectURL:blob=>{const url='blob:synthetic/'+(++n);created.push({url,blob});return url;},revokeObjectURL:url=>{revoked.push(url);}};}

test('two rapid downloads keep their own revocation; a timer never revokes a newer URL',()=>{
 const clock=fakeClock(),urls=fakeUrls(),registry=createObjectUrlRegistry({createObjectURL:urls.createObjectURL,revokeObjectURL:urls.revokeObjectURL,schedule:clock.schedule,cancel:clock.cancel,delay:1000});
 const first=registry.open('first-csv'),second=registry.open('second-csv');
 assert.notEqual(first,second);assert.equal(registry.size,2);assert.deepEqual(clock.pending,[1,2]);assert.deepEqual(clock.delays,[1000,1000]);
 assert.equal(clock.fire(1),true);assert.deepEqual(urls.revoked,[first]);assert.equal(registry.size,1);
 assert.equal(clock.fire(2),true);assert.deepEqual(urls.revoked,[first,second]);assert.equal(registry.size,0);
 assert.equal(registry.releaseAll(),0);assert.equal(registry.release(first),false);assert.deepEqual(urls.revoked,[first,second]);
});

test('invalidation releases every pending URL exactly once, cancels its timers and never touches foreign URLs',()=>{
 const clock=fakeClock(),urls=fakeUrls(),registry=createObjectUrlRegistry({createObjectURL:urls.createObjectURL,revokeObjectURL:urls.revokeObjectURL,schedule:clock.schedule,cancel:clock.cancel,delay:1000});
 const first=registry.open('a'),second=registry.open('b');
 assert.equal(registry.releaseAll(),2);assert.deepEqual(urls.revoked,[first,second]);assert.deepEqual(clock.pending,[]);assert.equal(registry.size,0);
 assert.equal(clock.fire(1),false);assert.equal(clock.fire(2),false);assert.equal(registry.releaseAll(),0);assert.deepEqual(urls.revoked,[first,second]);
 assert.equal(registry.release('blob:synthetic/never-created'),false);assert.deepEqual(urls.revoked,[first,second]);
 const third=registry.open('c');assert.equal(registry.size,1);assert.equal(registry.releaseAll(),1);assert.deepEqual(urls.revoked,[first,second,third]);assert.equal(registry.releaseAll(),0);
});

test('shared contract (42 monthly, 55 supplementary without kept captures) keeps identity_not_captured in all/42/55 with the complete fiscal census; contracts are a union, totals a sum',async()=>{
 const f=sharedJurisdictionFixture(),census=await sharedJurisdictionCensus(f);
 const monthlyIds=f.receipts.find(r=>r.snapshot.liquidationType==='monthly').snapshot.employees.map(e=>e.contractId),sharedIds=f.receipts.find(r=>r.snapshot.liquidationType==='supplementary').snapshot.employees.map(e=>e.contractId),onlyMonthly=monthlyIds.filter(id=>!sharedIds.includes(id));
 assert.equal(sharedIds.length,2);assert.equal(onlyMonthly.length,2);assert.ok(sharedIds.every(id=>monthlyIds.includes(id)),'the supplementary close reuses two of the four monthly contracts');
 const all=await prepare(f,'all',census),a=await prepare(f,'42',census),b=await prepare(f,'55',census),precision=decimals(all.totals.gross);
 for(const r of [all,a,b]){
  assert.equal(r.fiscalCoverage.queried,true);
  assert.deepEqual([r.fiscalCoverage.contracts,r.fiscalCoverage.identityNotCaptured,r.fiscalCoverage.reviewed,r.fiscalCoverage.missing,r.fiscalCoverage.stale],[4,2,2,0,0]);
  assert.equal(r.issues.find(i=>i.code==='FISCAL_IDENTITY_NOT_CAPTURED').count,2);assert.equal(r.issues.find(i=>i.code==='JURISDICTION_MIXED_CONTRACTS').count,2);assert.equal(r.issues.some(i=>i.code==='FISCAL_FACTS_MISSING'||i.code==='FISCAL_FACTS_STALE'),false);
  for(const id of sharedIds){const row=r.fiscalRows.find(x=>x.contractId===id);assert.equal(row.state,'identity_not_captured');assert.equal(row.knownFields,null);assert.equal(row.unknownFields,null);assert.deepEqual([...row.types].sort(),['monthly','supplementary']);assert.equal(row.participations,2);}
  for(const id of onlyMonthly){const row=r.fiscalRows.find(x=>x.contractId===id);assert.equal(row.state,'documented');assert.equal(row.knownFields,FISCAL_FACT_FIELDS.length);assert.equal(row.unknownFields,0);assert.deepEqual(row.types,['monthly']);assert.equal(row.participations,1);}
  assert.equal(r.fiscalRows.length,4);assert.equal(r.canGenerate,false);assert.equal(r.canSubmit,false);
 }
 assert.deepEqual(a.issues,all.issues);assert.deepEqual(b.issues,all.issues);
 assert.deepEqual([all.participations,a.participations,b.participations,all.scopeParticipations,b.scopeParticipations],[6,4,2,6,6]);
 assert.deepEqual([all.contracts,a.contracts,b.contracts,all.scopeContracts,b.scopeContracts],[4,4,2,4,4]);assert.ok(a.contracts+b.contracts>all.contracts,'contracts are not additive across jurisdictions');
 for(const id of sharedIds){assert.deepEqual(a.fiscalRows.find(x=>x.contractId===id).selectedTypes,['monthly']);assert.deepEqual(b.fiscalRows.find(x=>x.contractId===id).selectedTypes,['supplementary']);assert.deepEqual([...all.fiscalRows.find(x=>x.contractId===id).selectedTypes].sort(),['monthly','supplementary']);}
 for(const id of onlyMonthly){assert.deepEqual(a.fiscalRows.find(x=>x.contractId===id).selectedTypes,['monthly']);assert.equal(b.fiscalRows.find(x=>x.contractId===id).selectedParticipations,0);assert.deepEqual(b.fiscalRows.find(x=>x.contractId===id).selectedTypes,[]);}
 assert.deepEqual([ownF931VisibleContracts(all).selected,ownF931VisibleContracts(a).selected,ownF931VisibleContracts(b).selected,ownF931VisibleContracts(b).total],[4,4,2,4]);
 assert.deepEqual(ownF931VisibleContracts(b).rows.map(r=>r.state),['identity_not_captured','identity_not_captured']);assert.deepEqual(ownF931VisibleContracts(b).rows.map(r=>r.contractId).sort(),[...sharedIds].sort());
 for(const k of TOTAL_KEYS){assert.equal(all.totals[k],sum(a.totals[k],b.totals[k],precision));assert.equal(a.scopeTotals[k],all.totals[k]);assert.equal(b.scopeTotals[k],all.totals[k]);}
 assert.deepEqual(all.jurisdictionCoverage,{scope:6,...buckets({'42':4,'55':2}),contractsInSeveralJurisdictions:2});
 assert.notEqual(ownF931Proof(a),ownF931Proof(b));assert.ok(ownF931Proof(all).includes('fiscalProof'));
});

test('scoped client reads the complete fiscal census twice, sends no jurisdiction to any API and rejects a valid re-sealed census change between reads',async()=>{
 const f=sharedJurisdictionFixture(),census=await sharedJurisdictionCensus(f);
 const fiscalAdapter=(onRead=async()=>{})=>{const base=adapter(f),fiscalCalls=[];let reads=0;return {calls:base.calls,fiscalCalls,get sessions(){return base.sessions;},session:base.session,read:base.read,readFiscal:async q=>{fiscalCalls.push(structuredClone(q));const value=structuredClone(census);await onRead(++reads,value);return value;}};};
 const deps=fiscalAdapter(),r=await loadOwnF931Preparation(params(f,'42'),deps);
 assert.deepEqual([r.participations,r.scopeParticipations,r.contracts,r.fiscalCoverage.identityNotCaptured,r.fiscalCoverage.reviewed],[4,6,4,2,2]);
 assert.deepEqual(deps.fiscalCalls,[{resource:'census',period:f.query.from},{resource:'census',period:f.query.from}]);
 assert.ok([...deps.calls,...deps.fiscalCalls].every(c=>!Object.hasOwn(c,'jurisdiction')));
 assert.deepEqual(deps.calls.map(c=>c.resource),['detail','group','detail','group','detail','detail']);assert.equal(deps.sessions,2);
 const plain=fiscalAdapter();await loadOwnF931Preparation(params(f),plain);assert.deepEqual(plain.calls,deps.calls);assert.deepEqual(plain.fiscalCalls,deps.fiscalCalls);
 const resealed=fiscalAdapter(async(reads,value)=>{if(reads===2){value.rows[0].source.version='f'.repeat(64);value.rows[0].current=false;value.stateVersion=await fiscalFactsHash(value.rows);}});
 await assert.rejects(loadOwnF931Preparation(params(f,'55'),resealed),/Cambió el registro fiscal/);assert.equal(resealed.fiscalCalls.length,2);
 const revoked=fiscalAdapter(async reads=>{if(reads===2)throw Object.assign(Error('Permiso fiscal retirado'),{status:403});});
 await assert.rejects(loadOwnF931Preparation(params(f,'42'),revoked),/Permiso fiscal retirado/);
});

test('a universe closed only as 42 consulted as 55 keeps null selected totals and every global verdict; partial coverage and sub-cent amounts outside the selection still block',async()=>{
 const known=jurisdictionFixture(4,()=>'42'),all=await prepare(known,'all'),none=await prepare(known,'55');
 assert.deepEqual([none.participations,none.contracts,none.scopeParticipations,none.scopeContracts,none.closedGroups],[0,0,4,4,1]);
 for(const k of TOTAL_KEYS){assert.equal(none.totals[k],null);assert.equal(none.scopeTotals[k],all.totals[k]);assert.notEqual(all.totals[k],null);}
 assert.deepEqual(none.issues,all.issues);assert.deepEqual(none.jurisdictionCoverage,all.jurisdictionCoverage);assert.deepEqual(none.coverage.map(c=>[c.closedParticipations,c.selectedParticipations,c.notClosedRows,c.closedGroups]),[[4,0,0,1]]);
 assert.deepEqual([ownF931VisibleContracts(none).rows.length,ownF931VisibleContracts(none).selected,ownF931VisibleContracts(none).total],[0,0,4]);
 assert.equal(none.fiscalRows.length,4);assert.ok(none.fiscalRows.every(r=>r.selectedParticipations===0&&r.selectedTypes.length===0&&r.state==='not_queried'));
 assert.ok(ownF931PreparationCsv(none).includes('"Participaciones propias cerradas";"0 de 4 del alcance completo"'));
 // Partial coverage recorded only in the unselected supplementary 55 close.
 const partial=sharedJurisdictionFixture(),ps=partial.receipts.find(r=>r.snapshot.liquidationType==='supplementary').snapshot;ps.populationCount=ps.employeeCount+1;ps.populationComplete=false;rehashReportFixture(partial);
 const p=await prepare(partial,'42');assert.equal(p.participations,4);assert.equal(p.issues.find(i=>i.code==='PARTIAL_GROUP_COVERAGE').type,'supplementary');assert.equal(p.issues.find(i=>i.code==='PARTIAL_GROUP_COVERAGE').count,1);
 assert.deepEqual(p.coverage.find(c=>c.type==='supplementary').partialGroups,1);assert.equal(p.coverage.find(c=>c.type==='supplementary').selectedParticipations,0);
 // Sub-cent amount only in an unselected 55 participation; the 42 view still reports it.
 const fraction=sharedJurisdictionFixture(),fs=fraction.receipts.find(r=>r.snapshot.liquidationType==='supplementary').snapshot,fe=fs.employees[0],row=fs.concepts.find(r=>r.contractId===fe.contractId&&r.nature==='remuneration');
 const bump=v=>quantize(exactAdd(decimal(v),decimal('0.001')),{precision:3,mode:'exact'}).amount,exact3=v=>quantize(decimal(v),{precision:3,mode:'exact'}).amount;
 row.amount=bump(row.amount);row.exactValue=exactEvidence(decimal(row.amount));row.rounding={precision:3,mode:'exact'};row.trace=[{operation:'literal',reference:null,stage:null,result:row.exactValue}];
 const retainedContractId=fe.totals.contractId;assert.equal(retainedContractId,fe.contractId);for(const k of ['remuneration','gross','net'])fe.totals[k]=bump(fe.totals[k]);for(const k of TOTAL_KEYS)fe.totals[k]=exact3(fe.totals[k]);assert.equal(fe.totals.contractId,retainedContractId);fe.precision=3;
 for(const k of ['remuneration','gross','net'])fs.totals[k]=bump(fs.totals[k]);for(const k of Object.keys(fs.totals))fs.totals[k]=exact3(fs.totals[k]);fs.precision=3;rehashReportFixture(fraction);
 const s=await prepare(fraction,'42');assert.ok(s.issues.find(i=>i.code==='SUBCENT_AMOUNTS').count>0);assert.equal(s.participations,4);assert.equal(decimals(s.totals.gross),3);
 const untouched=await prepare(sharedJurisdictionFixture(),'42');assert.equal(untouched.issues.some(i=>i.code==='SUBCENT_AMOUNTS'),false);assert.equal(decimals(untouched.totals.gross),2);
});
