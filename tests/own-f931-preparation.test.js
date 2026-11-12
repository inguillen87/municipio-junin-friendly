import test from 'node:test';
import assert from 'node:assert/strict';
import {F931_REFERENCE,F931_VERSION_RULE,F931_FIELDS,ownF931Params,ownF931VersionRequirement} from '../assets/own-f931-contract.js';
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
test('RG5915 moves both independent V48 cutoffs to December without choosing a pre-cutoff version',()=>{
 assert.equal(F931_VERSION_RULE.effectiveDate,'2026-12-01');assert.equal(F931_VERSION_RULE.firstPeriod,'2026-12');
 assert.equal(F931_VERSION_RULE.url,'https://www.argentina.gob.ar/normativa/nacional/norma-430768/actualizacion');
 assert.match(F931_VERSION_RULE.articles,/17 y 19/);assert.match(F931_VERSION_RULE.articles,/RG 5915\/2026/);assert.match(F931_VERSION_RULE.articles,/puntos 3 y 4/);assert.ok(Object.isFrozen(F931_VERSION_RULE));
 const p=params(fixture()),cases=[
  ['2026-09','2026-10-31',null,false,false],
  ['2026-11','2026-11-01',null,false,false],
  ['2026-11','2026-11-30',null,false,false],
  ['2026-11','2026-12-01','48',false,true],
  ['2026-12','2026-11-30','48',true,false],
  ['2026-12','2026-12-01','48',true,true],
  ['2025-01','2026-11-30',null,false,false],
  ['2025-01','2026-12-01','48',false,true],
  ['2027-01','2027-02-01','48',true,true],
 ];
 for(const [period,presentationDate,version,byPeriod,byPresentation]of cases){
  const r=ownF931VersionRequirement({...p,period,presentationDate});
  assert.deepEqual([r.mandatedVersion,r.byPeriod,r.byPresentation],[version,byPeriod,byPresentation],period+' / '+presentationDate);
  assert.equal(r.layoutConfirmed,false);assert.equal(r.referenceVersion,'47.5');assert.equal(r.referenceWidth,499);assert.ok(Object.isFrozen(r));
  if(version===null)assert.doesNotMatch(r.label,/Requiere versi[oó]n (?:47\.8|48)/);
 }
});
test('labor jurisdiction cannot select a fiscal version or establish a declaration population',()=>{
 const p=params(fixture());
 for(const presentationDate of ['2026-11-30','2026-12-01']){
  const base=ownF931VersionRequirement({...p,period:'2026-11',presentationDate});
  for(const jurisdiction of ['all','42','55'])assert.deepEqual(ownF931VersionRequirement({...p,period:'2026-11',presentationDate,jurisdiction}),base);
  for(const fiscalPopulation of ['General','42','55'])assert.throws(()=>ownF931VersionRequirement({...p,presentationDate,fiscalPopulation}));
 }
});
test('V48 date requirement keeps generation, submission and fiscal population homologation pending',async()=>{
 const f=fixture(),r=await prepareOwnF931({...params(f),presentationDate:'2026-12-01'},f.details,f.receipts);
 assert.equal(r.versionRequirement.mandatedVersion,'48');assert.equal(r.versionRequirement.layoutConfirmed,false);assert.equal(r.canGenerate,false);assert.equal(r.canSubmit,false);
 assert.ok(r.requirements.some(x=>x.code==='DECLARATION_POPULATIONS'));assert.ok(r.requirements.some(x=>x.code==='FISCAL_FIELDS_AND_MAPPINGS'));assert.ok(r.requirements.some(x=>x.code==='FIELD_REPRESENTATION'));
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

// Lectura histórica (censo de cierres + recibos + capturas originales) de un cierre con total oficial (V4/V5).
// Corpus sintético del paquete de cierres; ningún dato municipal.
async function officialHistory(name){
 const {officialCloseDetail,officialCloseReceipt,hash}=await import('./fixtures/own-payroll-official-close-synthetic.js');
 const {reportGroup}=await import('./fixtures/own-payroll-report-synthetic.js');
 const {reportCensusFixture,liquidationDetailFor}=await import('./fixtures/own-payroll-report-census-synthetic.js');
 const {buildOwnOfficialCloseSnapshot}=await import('../assets/own-payroll-official-snapshot-model.js');
 const {verifiedOwnReportCensus}=await import('../assets/own-payroll-report-census-model.js');
 const detail=officialCloseDetail(name,1),capture=detail.captures[0],uid=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const rows=capture.payload.population.employees.map((e,i)=>({contractId:e.contractId,employeeNumber:e.employeeNumber,registrationId:uid(30000+i),identityToken:e.identityToken,jurisdictionCode:i%2?'55':'42'}));
 capture.payload.sourceInventory.jurisdictions={version:'own-run-jurisdictions.v1',complete:true,total:rows.length,rows};capture.payloadSha256=hash(capture.payload);
 const snapshot=buildOwnOfficialCloseSnapshot(detail,{kind:'all',values:[]}),receipt=officialCloseReceipt(snapshot);detail.groups=[reportGroup(receipt)];
 const query={from:snapshot.period,to:snapshot.period,types:[snapshot.liquidationType]};
 return {capture,receipt,snapshot,census:await verifiedOwnReportCensus(reportCensusFixture({query,details:[detail],receipts:[receipt]})),liquidationDetailFor,
  params:{period:snapshot.period,presentationDate:'2026-11-10',types:[snapshot.liquidationType],jurisdiction:'all'}};
}
for(const name of ['days14_both_omitted','legacy_v4_unchanged','full_population37'])test('la lectura histórica acepta un cierre con total oficial y suma sus totales oficiales: '+name,async()=>{
 const {prepareOwnF931Historical}=await import('../assets/own-f931-preparation-model.js'),f=await officialHistory(name),before=JSON.stringify(f.capture);
 const r=await prepareOwnF931Historical(f.params,[f.census],[structuredClone(f.receipt)],[f.capture]);
 assert.equal(r.version,'own-f931-preparation.v2');assert.deepEqual(r.totals,f.snapshot.totals,'los totales son los oficiales del cierre');
 assert.notEqual(f.snapshot.totals.net,f.snapshot.lineTotals.net,'en este caso el neto oficial difiere de la suma de renglones');
 assert.equal(JSON.stringify(f.capture),before,'la captura recibida no se modifica');
});
test('la lectura histórica rechaza una captura oficial alterada o que no corresponde al cierre',async()=>{
 const {prepareOwnF931Historical}=await import('../assets/own-f931-preparation-model.js');
 const changes={
  'importe de un renglón':c=>{c.saved.result.rows[0].amount='1.00';},
  'neto oficial':c=>{c.saved.result.employeeTotals[0].net='999.99';},
  'huella del resultado':c=>{c.saved.resultSha256='f'.repeat(64);},
  'versión rebajada a la histórica':c=>{c.saved.input.version='own-payroll-input.v2';},
 };
 for(const [label,change]of Object.entries(changes)){const f=await officialHistory('days14_both_omitted');change(f.capture);await assert.rejects(prepareOwnF931Historical(f.params,[f.census],[structuredClone(f.receipt)],[f.capture]),undefined,label);}
 const f=await officialHistory('days14_both_omitted'),other=await officialHistory('full_population37');
 await assert.rejects(prepareOwnF931Historical(f.params,[f.census],[structuredClone(f.receipt)],[other.capture]),/no corresponde|ajena|Faltan/,'la captura de otra corrida no reemplaza a la del cierre');
 await assert.rejects(prepareOwnF931Historical(f.params,[f.census],[structuredClone(f.receipt)],[]),/Faltan capturas originales/);
});
test('la lectura histórica elige el lector por la versión que declara el resultado guardado',async()=>{
 const fs=await import('node:fs'),source=fs.readFileSync(new URL('../assets/own-f931-preparation-model.js',import.meta.url),'utf8');
 assert.match(source,/if\(ownHistoricalOfficialInput\(capture\?\.saved\?\.input\)\)return verifiedRunCapture\(capture\);\n await verifiedWorkspaceCapture\(capture\);/,'V4/V5: lector oficial; V1/V2: el cotejo histórico de siempre');
 assert.match(source,/const originals=\[\];for\(const capture of structuredClone\(captures\)\)originals\.push\(await verifiedHistoricalCapture\(capture\)\);/,'se usa la copia verificada, no la recibida');
 assert.match(source,/const verified=ownRunResult\(capture\);/);
});

