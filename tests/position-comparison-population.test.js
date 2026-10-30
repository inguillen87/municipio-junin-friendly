// Original-population regressions. Synthetic calculation/close sources are not evidence
// of native SQL, municipal approvals, publication or production readiness.
import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonPopulationFixture,POPULATION_PROOF_SOURCE_KEYS} from './fixtures/position-comparison-population-synthetic.js';
import {comparisonFixture} from './fixtures/position-comparison-synthetic.js';
import {verifiedPositionComparison,positionComparisonDocument,positionComparisonSummary} from '../assets/position-comparison-model.js';
import {verifiedWorkspaceCapture} from '../assets/own-payroll-run-workspace-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';

const filters={active:'all',order:'number',view:'detailed'};
const clone=structuredClone;
function rebindSidecars(v,version){
 const c=v.captures[0];c.population.version=version;
 for(const sidecar of [c.positions,c.dimensions])if(sidecar.payload){sidecar.payload.populationVersion=version;sidecar.payloadSha256=ownRunHash(sidecar.payload);}
 return v;
}
// Negative envelopes only: defeat incidental stale sidecar hashes so each
// rejection must preserve the declared shape/type contract as well as H(data).
function resealNegativeProof(v){const c=v.captures[0];return rebindSidecars(v,ownRunHash({employees:c.population.employees,...c.populationProof.sources}));}
async function realBindings(f){
 const {comparison:v,originalCapture:c,closed}=f,r=v.captures[0];await verifiedWorkspaceCapture(c);
 assert.deepEqual(r.population,c.payload.population);assert.equal(r.id,c.id);assert.equal(r.payloadSha256,c.payloadSha256);
 assert.equal(c.saved.input.sourceVersions.population,c.payload.population.version);assert.equal(v.groups[0].snapshotSha256,closed.receipt.snapshotSha256);
 assert.deepEqual(v.employees.map(e=>e.resultSha256),closed.receipt.snapshot.employees.map(e=>e.resultSha256));
 for(const key of POPULATION_PROOF_SOURCE_KEYS)assert.equal(Object.hasOwn(r.populationProof.sources,key),Object.hasOwn(c.payload,key));
 for(const [key,value]of Object.entries(r.populationProof.sources))assert.deepEqual(value,c.payload[key]);
 assert.equal(ownRunHash({employees:r.population.employees,...r.populationProof.sources}),c.payload.population.version);
 for(const sidecar of [r.positions,r.dimensions])if(sidecar.payload)assert.equal(sidecar.payload.populationVersion,c.payload.population.version);
}

test('M10 population regression: v1 con captura compuesta real conserva rechazo por huella de población',async()=>{
 for(const source of ['sql192','sql193','context','conditions']){
  const f=await comparisonPopulationFixture({source});await realBindings(f);
  const v=clone(f.comparison);v.version='own-position-comparison.v1';delete v.captures[0].populationProof;
  assert.notEqual(ownRunHash(v.captures[0].population.employees),v.captures[0].population.version);
  await assert.rejects(verifiedPositionComparison(v),/La huella de la población original no coincide/);
 }
});

test('M10 population regression: control legado v1 mantiene array, contrato y aceptación anteriores',async()=>{
 const v=await comparisonFixture(2),before=JSON.stringify(v);assert.equal(v.version,'own-position-comparison.v1');assert.equal(Object.hasOwn(v.captures[0],'populationProof'),false);
 assert.equal(v.captures[0].population.version,ownRunHash(v.captures[0].population.employees));await verifiedPositionComparison(v);assert.equal(JSON.stringify(v),before);
});

test('M10 population regression: v2 sin extras declara employees y no cambia la huella array heredada',async()=>{
 const v=await comparisonFixture(2),original=v.captures[0].population.version;v.version='own-position-comparison.v2';v.captures[0].populationProof={version:'own-position-population-proof.v1',shape:'employees',sources:{}};
 const before=JSON.stringify(v);await verifiedPositionComparison(v);assert.equal(v.captures[0].population.version,original);assert.equal(JSON.stringify(v),before);
});

test('M10 population regression: v2 SQL192 conserva cinco fuentes originales y acredita asignación normativa explícita',async()=>{
 const f=await comparisonPopulationFixture({source:'sql192'});await realBindings(f);const v=f.comparison,before=JSON.stringify(f),c=v.captures[0];
 assert.deepEqual(Object.keys(c.populationProof.sources).sort(),['monthlyDays','monthlyDaysScope','periodParticipation','workingTime','agreementWorkingTime'].sort());
 await verifiedPositionComparison(v);const allocation=c.positions.payload.employees[0].allocations[0],summary=positionComparisonSummary(v).find(r=>r.code===allocation.rowCode),d=positionComparisonDocument(v,filters);
 assert.equal(summary.credited,allocation.quantity);assert.equal(summary.complete,true);assert.equal(d.rows[0][1],f.originalCapture.payload.population.employees[0].employeeNumber);assert.equal(d.rows[0][8],allocation.normative.row.label);
 assert.equal(JSON.stringify(f),before);
});

test('M10 population regression: v2 SQL193 conserva 16 o 30 días y ausencia real de 157 sin reemplazar la población',async()=>{
 for(const days of ['16','30']){
  const f=await comparisonPopulationFixture({source:'sql193',days});await realBindings(f);const v=f.comparison,c=v.captures[0],before=JSON.stringify(f);
  assert.deepEqual(Object.keys(c.populationProof.sources).sort(),['monthlyDayDeclarations','workingTime','agreementWorkingTime'].sort());assert.equal(Object.hasOwn(c.populationProof.sources,'periodParticipation'),false);
  assert.equal(c.populationProof.sources.monthlyDayDeclarations.records[0].configuration.definition.recognizedDays,days);await verifiedPositionComparison(v);assert.equal(JSON.stringify(f),before);
 }
});

test('M10 population regression: contexto, condiciones y seis fuentes de 180 conservan objetos y nulls originales',async()=>{
 for(const source of ['context','conditions','context-all']){
  const f=await comparisonPopulationFixture({source,count:source==='context'?1:2,assigned:source!=='context'});await realBindings(f);const before=JSON.stringify(f);await verifiedPositionComparison(f.comparison);
  if(source==='context-all'){
   const p=f.comparison.captures[0].populationProof.sources;
   assert.equal(p.workingTime.records[0].configuration.definition.dailyHours,null);assert.equal(p.employmentFacts.records[0].configuration.definition.months,null);assert.equal(p.salaryConditions.records[0].definition.unhealthyWork,null);assert.equal(p.periodParticipation.records[0].configuration.definition,null);
   assert.equal(Object.keys(p).length,6);
  }
  if(source==='context')assert.equal(positionComparisonDocument(f.comparison,filters).rows[0][7],'Sin captura de cargos');
  assert.equal(JSON.stringify(f),before);
 }
});

test('M10 population regression: versión, shape o campos extra de prueba no amplían el DTO cerrado',async()=>{
 const {comparison}=await comparisonPopulationFixture();
 for(const mutate of [v=>v.captures[0].populationProof.version='own-position-population-proof.v2',v=>v.captures[0].populationProof.shape='legacy_or_sources',v=>v.captures[0].populationProof.extra=true,v=>v.captures[0].unexpected={}]){
  const v=clone(comparison);mutate(v);await assert.rejects(verifiedPositionComparison(v));
 }
});

test('M10 population regression: sources requiere al menos un hecho y no acepta el objeto employees vacío como legacy',async()=>{
 const v=await comparisonFixture(1);v.version='own-position-comparison.v2';v.captures[0].populationProof={version:'own-position-population-proof.v1',shape:'sources',sources:{}};resealNegativeProof(v);
 await assert.rejects(verifiedPositionComparison(v));
});

test('M10 population regression: employees prohíbe fuentes presentes aunque el hash array y sidecars concilien',async()=>{
 const {comparison:v}=await comparisonPopulationFixture();v.captures[0].populationProof.shape='employees';rebindSidecars(v,ownRunHash(v.captures[0].population.employees));await assert.rejects(verifiedPositionComparison(v));
});

test('M10 population regression: omitir cualquiera de los nueve hechos preservando versión original rechaza el conjunto',async()=>{
 const seen=new Set();
 for(const source of ['sql192','sql193','context-all']){
  const {comparison}=await comparisonPopulationFixture({source});
  for(const key of Object.keys(comparison.captures[0].populationProof.sources)){
   seen.add(key);const v=clone(comparison);delete v.captures[0].populationProof.sources[key];await assert.rejects(verifiedPositionComparison(v),undefined,key);
  }
 }
 assert.deepEqual([...seen].sort(),[...POPULATION_PROOF_SOURCE_KEYS].sort());
});

test('M10 population regression: monthlyDays y monthlyDaysScope son un par incluso con huella negativa rehecha',async()=>{
 const {comparison}=await comparisonPopulationFixture({source:'sql192'});
 for(const key of ['monthlyDays','monthlyDaysScope']){const v=clone(comparison);delete v.captures[0].populationProof.sources[key];resealNegativeProof(v);await assert.rejects(verifiedPositionComparison(v),undefined,key);}
});

test('M10 population regression: fuente desconocida, null o array no se acepta sólo por rehacer su digest',async()=>{
 const {comparison}=await comparisonPopulationFixture({source:'context-all'});
 const unknown=clone(comparison);unknown.captures[0].populationProof.sources.unrecognizedSource={complete:true};resealNegativeProof(unknown);await assert.rejects(verifiedPositionComparison(unknown));
 for(const key of Object.keys(comparison.captures[0].populationProof.sources))for(const value of [null,[]]){const v=clone(comparison);v.captures[0].populationProof.sources[key]=value;resealNegativeProof(v);await assert.rejects(verifiedPositionComparison(v),undefined,key);}
 const outer=clone(comparison);outer.captures[0].populationProof.sources=[];await assert.rejects(verifiedPositionComparison(outer));
});

test('M10 population regression: cambiar un null interior no desaparece por normalizar o hash de versiones solamente',async()=>{
 const {comparison:v}=await comparisonPopulationFixture({source:'sql192'}),w=v.captures[0].populationProof.sources.workingTime.records[0].configuration.definition;
 assert.equal(w.dailyHours,null);w.dailyHours='0';await assert.rejects(verifiedPositionComparison(v));
});

test('M10 population regression: sources no permite fallback array aun con todos los sidecars vueltos a ligar',async()=>{
 const {comparison:v}=await comparisonPopulationFixture({source:'sql193'}),c=v.captures[0];assert.ok(Object.keys(c.populationProof.sources).length>0);rebindSidecars(v,ownRunHash(c.population.employees));
 await assert.rejects(verifiedPositionComparison(v));
});

test('M10 population regression: posiciones y dimensiones conservan el populationVersion original además de sus hashes propios',async()=>{
 const {comparison}=await comparisonPopulationFixture();
 for(const key of ['positions','dimensions']){const v=clone(comparison),sidecar=v.captures[0][key];sidecar.payload.populationVersion='f'.repeat(64);sidecar.payloadSha256=ownRunHash(sidecar.payload);await assert.rejects(verifiedPositionComparison(v),undefined,key);}
});

test('M10 population regression: última identidad de población no se sustituye conservando versión y captura originales',async()=>{
 const {comparison:v}=await comparisonPopulationFixture({source:'conditions',count:2});assert.equal(v.captures[0].population.employees.length,2);v.captures[0].population.employees.at(-1).identityToken='f'.repeat(64);
 await assert.rejects(verifiedPositionComparison(v));
});
