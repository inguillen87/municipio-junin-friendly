import test from 'node:test';
import assert from 'node:assert/strict';
import {F931_REFERENCE,F931_FIELDS,F931_VERSION_RULE,ownF931Params,ownF931VersionRequirement} from '../assets/own-f931-contract.js';
import {prepareOwnF931,ownF931Proof,ownF931VisibleFields,ownF931PreparationCsv} from '../assets/own-f931-preparation-model.js';
import {loadOwnF931Preparation} from '../assets/own-f931-preparation-client.js';
import {reportFixture,historicalReportFixture,rehashReportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {decimal,exactEvidence,quantize} from '../assets/own-payroll-exact.js';
const params=f=>({period:f.query.from,presentationDate:'2026-10-31',types:f.query.types});
const fixture=()=>historicalReportFixture('2026-09','monthly');
const prepare=f=>prepareOwnF931(params(f),f.details,f.receipts);

test('official V47.5 reference has 60 contiguous fields and 499 positions, not a homologated current layout',()=>{
 assert.equal(F931_FIELDS.length,60);assert.equal(F931_REFERENCE.version,'47.5');assert.equal(F931_REFERENCE.recordWidth,499);
 for(const [i,f]of F931_FIELDS.entries()){assert.equal(f.number,i+1);assert.equal(f.to-f.from+1,f.width);assert.equal(f.from,i?F931_FIELDS[i-1].to+1:1);assert.ok(Object.isFrozen(f));}
 assert.deepEqual(F931_FIELDS.filter(f=>[1,12,13,20,41,57,58,59,60].includes(f.number)).map(f=>[f.number,f.from,f.to]),[[1,1,11],[12,68,69],[13,70,81],[20,139,188],[41,320,328],[57,463,463],[58,464,475],[59,476,487],[60,488,499]]);
 assert.match(F931_REFERENCE.sha256,/^[a-f0-9]{64}$/);
});
test('RG5915 defers the V48 cutoff: November period and presentations remain before it',()=>{
 const p=params(fixture());
 for(const v of [p,{...p,period:'2026-11',presentationDate:'2026-11-01'},{...p,period:'2026-11',presentationDate:'2026-11-30'},{...p,period:'2025-01',presentationDate:'2026-11-30'}]){
  const r=ownF931VersionRequirement(v);assert.equal(r.mandatedVersion,null);assert.equal(r.byPeriod,false);assert.equal(r.byPresentation,false);assert.equal(r.layoutConfirmed,false);
 }
});

test('V48 uses December period OR December 1 presentation, including earlier rectifications',()=>{
 const p=params(fixture());
 for(const [v,byPeriod,byPresentation]of [[{...p,period:'2026-12',presentationDate:'2026-11-30'},true,false],[{...p,period:'2026-11',presentationDate:'2026-12-01'},false,true],[{...p,period:'2025-01',presentationDate:'2026-12-01'},false,true],[{...p,period:'2026-12',presentationDate:'2026-12-01'},true,true],[{...p,period:'2025-01',presentationDate:'2027-02-01'},false,true]]){
  const r=ownF931VersionRequirement(v);assert.equal(r.mandatedVersion,'48');assert.equal(r.byPeriod,byPeriod);assert.equal(r.byPresentation,byPresentation);assert.equal(r.layoutConfirmed,false);
 }
});

test('the amended rule points to RG5915 without certifying a current import layout',()=>{
 assert.equal(F931_VERSION_RULE.effectiveDate,'2026-12-01');assert.equal(F931_VERSION_RULE.firstPeriod,'2026-12');assert.match(F931_VERSION_RULE.url,/n%3A5915%7C/);assert.equal(F931_VERSION_RULE.articles,'1–2');
 assert.equal(F931_REFERENCE.version,'47.5');assert.equal(F931_REFERENCE.recordWidth,499);assert.equal(F931_FIELDS.length,60);assert.equal(ownF931VersionRequirement(params(fixture())).layoutConfirmed,false);
});
test('explicit dates/types, actual civil dates and strict fields; no automatic today or monthly default',()=>{
 const p=params(fixture());for(const bad of [{...p,presentationDate:null},{...p,presentationDate:'2026-02-29'},{...p,presentationDate:'2026-11-31'},{...p,presentationDate:'2026-10-01T00:00:00Z'},{...p,types:[]},{...p,types:['monthly','monthly']},{...p,period:'2026-13'},{...p,extra:'ignored'}])assert.throws(()=>ownF931Params(bad));
 assert.equal(ownF931Params({...p,presentationDate:'2024-02-29'}).presentationDate,'2024-02-29');
});
test('complete own closed payroll census preserves exact totals and counts; never certifies fiscal readiness',async()=>{
 const r=await prepare(fixture());assert.equal(r.participations,2);assert.equal(r.contracts,2);assert.equal(r.closedGroups,1);assert.equal(r.fieldReferences.length,60);assert.equal(r.canGenerate,false);assert.equal(r.canSubmit,false);assert.ok(r.requirements.some(i=>i.code==='DECLARATION_POPULATIONS'));assert.ok(Object.isFrozen(r));
 assert.match(r.totals.gross,/^\d+\.\d{2,}$/);assert.equal(r.requirements.find(i=>i.code==='FISCAL_FIELDS_AND_MAPPINGS').action.includes('no equivalen'),true);
});
test('multiple selected types include same contract participations without duplicating contract count',async()=>{
 const a=fixture(),b=historicalReportFixture('2026-09','supplementary',601),r=await prepareOwnF931({...params(a),types:['monthly','supplementary']},[...a.details,...b.details],[...a.receipts,...b.receipts]);
 assert.equal(r.closedGroups,2);assert.equal(r.participations,4);assert.equal(r.contracts,2);assert.deepEqual(r.coverage.map(c=>c.closedParticipations),[2,2]);
 assert.equal(r.canGenerate,false);
});
test('empty census reports no closed data without manufacturing employees or missing row errors',async()=>{
 const f=fixture();f.details[0].groups=[];f.receipts=[];const r=await prepare(f);assert.equal(r.participations,0);assert.equal(r.contracts,0);assert.equal(r.issues.length,1);assert.equal(r.issues[0].code,'NO_CLOSED_GROUPS');assert.equal(r.issues[0].count,0);assert.equal(r.totals.gross,null);
});
test('corrupt hashes, duplicate closures and incomplete type census fail globally',async()=>{
 const f=fixture();f.receipts[0].snapshotSha256='f'.repeat(64);await assert.rejects(prepare(f));
 const g=fixture();await assert.rejects(prepareOwnF931({...params(g),types:['monthly','supplementary']},g.details,g.receipts));
 const h=fixture();h.receipts.push(structuredClone(h.receipts[0]));await assert.rejects(prepare(h));
});
test('unknown original jurisdiction is distinguished, never read from current roster',async()=>{
 const r=await prepare(fixture());assert.equal(r.issues.find(i=>i.code==='JURISDICTION_NOT_CAPTURED').count,2);assert.equal(r.requirements.some(i=>i.code==='DECLARATION_POPULATIONS'),true);
});
test('valid subset closure is identified as partial coverage, not a full fiscal population',async()=>{
 const f=fixture(),s=f.receipts[0].snapshot;s.populationCount=3;s.populationComplete=false;rehashReportFixture(f);const r=await prepare(f);assert.equal(r.coverage[0].partialGroups,1);assert.equal(r.issues.find(i=>i.code==='PARTIAL_GROUP_COVERAGE').count,1);
});
test('fractional cents survive exact totals and produce a review requirement; no rounding',async()=>{
 const f=fixture(),s=f.receipts[0].snapshot,e=s.employees[0],row=s.concepts.find(r=>r.contractId===e.contractId&&r.nature==='remuneration');
 row.amount='100.101';row.exactValue=exactEvidence(decimal(row.amount));row.rounding={precision:3,mode:'exact'};row.trace=[{operation:'literal',reference:null,stage:null,result:row.exactValue}];
 Object.assign(e.totals,{remuneration:'112.611',gross:'132.611',net:'128.631'});e.precision=3;s.precision=3;Object.assign(s.totals,{remuneration:'225.221',gross:'245.221',net:'237.861'});rehashReportFixture(f);
 for(const k of Object.keys(s.totals)){s.totals[k]=quantize(decimal(s.totals[k]),{precision:3,mode:'exact'}).amount;e.totals[k]=quantize(decimal(e.totals[k]),{precision:3,mode:'exact'}).amount;}rehashReportFixture(f);
 const r=await prepare(f);assert.equal(r.totals.gross,'245.221');assert.ok(r.issues.find(i=>i.code==='SUBCENT_AMOUNTS').count>0);
});
test('unmapped calculation auxiliaries are not fiscal monetary concepts',async()=>{const r=await prepare(fixture());assert.equal(r.issues.some(i=>i.code==='SUBCENT_AMOUNTS'),false);});
test('search and all three pages do not trim CSV; CSV has no nominal data, salaries, free text, UUID or hashes',async()=>{
 const f=reportFixture(61),r=await prepare(f),csv=ownF931PreparationCsv(r);assert.equal(ownF931VisibleFields(r,'',1).rows.length,20);assert.equal(ownF931VisibleFields(r,'',3).rows.at(-1).number,60);assert.equal(ownF931VisibleFields(r,'remuneración',1).filtered<60,true);assert.equal(ownF931PreparationCsv(r),csv);
 assert.equal(csv.match(/"Campo \d+ ·/g).length,60);assert.equal(csv.replaceAll('\r\n','').includes('\n'),false);assert.ok(csv.endsWith('\r\n'));for(const e of f.receipts[0].snapshot.employees){assert.equal(csv.includes(e.contractId),false);assert.equal(csv.includes('"'+e.totals.gross+'"'),false);}assert.equal(csv.includes(f.receipts[0].snapshotSha256),false);assert.equal(csv.includes(f.receipts[0].body.reason),false);assert.equal(csv.includes(f.receipts[0].groupId),false);
 for(const line of csv.slice(1).split('\r\n').filter(Boolean))for(const cell of line.match(/"(?:[^"]|"")*"/g)??[])assert.doesNotMatch(cell.slice(1,-1),/^[\s]*[=+\-@\t\r\n]/);
 assert.throws(()=>ownF931PreparationCsv({...r}));assert.throws(()=>ownF931VisibleFields(r,'',0));
});
test('verified source detached from caller mutations and proof covers date, selected types and census',async()=>{
 const f=fixture(),r=await prepare(f),proof=ownF931Proof(r);f.receipts[0].snapshot.employees.length=0;assert.equal(r.participations,2);assert.equal(ownF931Proof(r),proof);const other=await prepareOwnF931({...params(fixture()),presentationDate:'2026-11-01'},fixture().details,fixture().receipts);assert.notEqual(ownF931Proof(other),proof);
});
function adapter(f){const calls=[];let sessions=0;return {calls,get sessions(){return sessions;},session:async()=>{sessions++;},read:async q=>{calls.push(q);const result=q.resource==='detail'?f.details.find(d=>d.liquidationType===q.liquidationType):f.receipts.find(r=>r.id===q.id);return structuredClone(result);}};}
test('GET-only client retrieves every selected group then rechecks all censuses and session',async()=>{
 const a=fixture(),b=historicalReportFixture('2026-09','supplementary',601),f={details:[...a.details,...b.details],receipts:[...a.receipts,...b.receipts]},deps=adapter(f),r=await loadOwnF931Preparation({...params(a),types:['monthly','supplementary']},deps);assert.equal(r.participations,4);assert.equal(deps.calls.filter(c=>c.resource==='group').length,2);assert.equal(deps.calls.filter(c=>c.resource==='detail').length,4);assert.equal(deps.sessions,2);
});
test('census/source changes, revoked permission, invalidated page and missing group abort entire client preparation',async()=>{
 const f=fixture(),a=adapter(f);let reads=0;const read=a.read;await assert.rejects(loadOwnF931Preparation(params(f),{...a,read:async q=>{const d=await read(q);if(++reads===3)d.stateVersion=ownRunHash('changed');return d;}}),/Cambió el histórico/);
 const b=adapter(f);let sessions=0;await assert.rejects(loadOwnF931Preparation(params(f),{...b,session:async()=>{if(++sessions===2)throw Error('REVOKED');}}),/REVOKED/);
 const c=adapter(f);await assert.rejects(loadOwnF931Preparation(params(f),{...c,valid:()=>c.calls.length<2}),{name:'AbortError'});
 const d=adapter(f);await assert.rejects(loadOwnF931Preparation(params(f),{...d,read:async q=>q.resource==='group'?undefined:d.read(q)}));
});
