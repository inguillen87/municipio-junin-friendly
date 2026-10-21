import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonFixture,uid} from './fixtures/position-comparison-synthetic.js';
import {comparisonV2Fixture,legacyComparisonProjection} from './fixtures/position-comparison-v2-synthetic.js';
import {monthlyDayEngineSources} from './fixtures/own-monthly-day-engine-synthetic.js';
import {policySources} from './fixtures/own-monthly-day-policy-synthetic.js';
import {syntheticSeniorityDefinition} from './fixtures/own-salary-seniority-synthetic.js';
import {syntheticWorkingTimeDefinition} from './fixtures/own-contract-working-time-synthetic.js';
import {agreementTimeDefinition} from './fixtures/own-agreement-working-time-synthetic.js';
import {syntheticConditionsDefinition} from './fixtures/own-contract-salary-conditions-synthetic.js';
import {budgetHash} from '../assets/annual-position-budget-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {ownRunPopulationPreimage} from '../assets/own-payroll-population-model.js';
import {verifiedPositionComparison,verifiedPositionComparisonV2,positionComparisonSummary,positionComparisonDocument} from '../assets/position-comparison-model.js';
const query={year:2026,revision:1,period:'2026-10',liquidationType:'monthly'};
const read=v=>verifiedPositionComparisonV2(v,query);

async function rebind(v){
 const c=v.captures[0],o=c.original;
 o.bodySha256=await budgetHash(o.body);o.payloadSha256=await budgetHash(o.payload);
 o.saved.inputSha256=await budgetHash(o.saved.input);o.saved.resultSha256=await budgetHash(o.saved.result);
 c.payloadSha256=o.payloadSha256;c.population=structuredClone(o.payload.population);
 for(const s of [c.positions,c.dimensions]){s.capturePayloadSha256=o.payloadSha256;if(s.payload){s.payload.populationVersion=c.population.version;s.payloadSha256=await budgetHash(s.payload);}}
 for(const e of v.employees){e.inputSha256=o.saved.inputSha256;e.resultSha256=o.saved.resultSha256;}
 return v;
}

test('V1 stays exact and neither exported reader negotiates another contract',async()=>{
 const v1=await comparisonFixture(2),before=salarySerialized(v1);
 assert.equal(await verifiedPositionComparison(v1,query),v1);assert.equal(salarySerialized(v1),before);
 await assert.rejects(read(v1));const v2=await comparisonV2Fixture();await assert.rejects(verifiedPositionComparison(v2,query));
});

test('RED predecessor array domain rejects the valid193 capture that explicit V2 verifies',async()=>{
 const v=await comparisonV2Fixture(),before=salarySerialized(v),legacy=legacyComparisonProjection(v);
 await assert.rejects(verifiedPositionComparison(legacy,query),/huella de la población/);
 assert.equal(await read(v),v);assert.equal(salarySerialized(v),before);
 assert.deepEqual(Object.keys(ownRunPopulationPreimage(v.captures[0].original)).sort(),['employees','monthlyDayDeclarations']);
});

test('V2 retains the historical ARRAY domain when no fact applies',async()=>{
 const v=await comparisonV2Fixture({legacy:true});await read(v);
 assert.equal(ownRunPopulationPreimage(v.captures[0].original),v.captures[0].original.payload.population.employees);
 await verifiedPositionComparison(legacyComparisonProjection(v),query);
});

test('an enriched ARRAY hash and a legacy OBJECT hash are both rejected even with outer seals updated',async()=>{
 for(const legacy of [false,true]){
  const v=await comparisonV2Fixture({legacy}),o=v.captures[0].original;
  o.payload.population.version=await budgetHash(legacy?{employees:o.payload.population.employees}:o.payload.population.employees);
  o.saved.input.sourceVersions.population=o.payload.population.version;o.saved.result.sourceVersions.population=o.payload.population.version;
  await rebind(v);await assert.rejects(read(v),/dominio/);
 }
});

test('193-only requires its own complete source and forbids implicit neutral157, null and extra facts',async()=>{
 const v=await comparisonV2Fixture();await read(v);
 for(const mutate of [o=>delete o.payload.monthlyDayDeclarations,o=>o.payload.monthlyDayDeclarations=null,o=>o.payload.periodParticipation=monthlyDayEngineSources(['30']).periodParticipation,o=>o.payload.currentRoster=[]]){
  const changed=structuredClone(v);mutate(changed.captures[0].original);await assert.rejects(read(changed));
 }
});

test('an explicit period_fact keeps157 mandatory alongside193',async()=>{
 const v=await comparisonV2Fixture({typedOnly:false});await read(v);
 assert.deepEqual(Object.keys(ownRunPopulationPreimage(v.captures[0].original)).sort(),['employees','monthlyDayDeclarations','periodParticipation']);
 delete v.captures[0].original.payload.periodParticipation;await assert.rejects(read(v));
});

test('nonmonthly selection keeps157 but excludes193 without changing programme expressions',async()=>{
 // Source-schema projection only: no nonmonthly calculation is asserted.
 const v=await comparisonV2Fixture(),o=v.captures[0].original;o.saved=null;
 o.body.liquidationType=o.payload.liquidationType='supplementary';
 delete o.payload.monthlyDayDeclarations;o.payload.periodParticipation=monthlyDayEngineSources(['30']).periodParticipation;
 assert.deepEqual(Object.keys(ownRunPopulationPreimage(o)).sort(),['employees','periodParticipation']);
 o.payload.monthlyDayDeclarations=monthlyDayEngineSources(['30'],{typedOnly:true}).monthlyDayDeclarations;
 assert.throws(()=>ownRunPopulationPreimage(o));
});

test('the canonical capture schema projects every applicable source family, not a193-only subset',async()=>{
 // Reuse existing typed declarations/policies; no new payroll expression.
 const v=await comparisonV2Fixture({typedOnly:false}),o=v.captures[0].original,p=o.payload,d=p.programState.program.definition,e=p.population.employees[0],date=o.body.period+'-01';o.saved=null;
 const config=definition=>({version:'a'.repeat(64),revision:1,proposalId:uid(501),approvalId:uid(502),identityToken:e.identityToken,definition});
 Object.assign(d,{employmentFactsVersion:'own-salary-seniority.v1',workingTimeVersion:'own-contract-working-time.v1',agreementWorkingTimeVersion:'own-agreement-working-time.v1',salaryConditionsVersion:'own-contract-salary-conditions.v1',periodContextVersion:'own-payroll-period-context.v1'});
 p.employmentFacts={complete:true,version:'a'.repeat(64),records:[{contractId:e.contractId,identityToken:e.identityToken,configuration:config(syntheticSeniorityDefinition())}]};
 p.workingTime={complete:true,version:'b'.repeat(64),records:[{contractId:e.contractId,identityToken:e.identityToken,configuration:config(syntheticWorkingTimeDefinition())}]};
 p.agreementWorkingTime={complete:true,version:'c'.repeat(64),records:[{agreementCode:e.agreementCode,agreementToken:'d'.repeat(64),revision:1,definition:agreementTimeDefinition(),approvalId:uid(503),approvedAgreementToken:'d'.repeat(64)}]};
 p.salaryConditions={complete:true,version:'e'.repeat(64),records:[{contractId:e.contractId,identityToken:e.identityToken,revision:1,definition:syntheticConditionsDefinition(),approvalId:uid(504)}]};
 p.periodContext={version:'own-payroll-period-context.v1',period:o.body.period,monthNumber:'10',sha256:await budgetHash({version:'own-payroll-period-context.v1',period:o.body.period,monthNumber:'10'})};
 const day=policySources(1);d.monthlyDaysVersion=day.programState.program.definition.monthlyDaysVersion;d.monthlyDaysPolicy=day.programState.program.definition.monthlyDaysPolicy;
 p.monthlyDays=day.monthlyDays;p.monthlyDaysScope=day.monthlyDaysScope;p.programState.scopeVersion=o.body.scopeVersion=day.monthlyDaysScope.scopeVersion;
 const keys=['employees','employmentFacts','periodParticipation','workingTime','agreementWorkingTime','salaryConditions','periodContext','monthlyDays','monthlyDaysScope','monthlyDayDeclarations'];
 const preimage=ownRunPopulationPreimage(o);assert.deepEqual(Object.keys(preimage).sort(),keys.sort());
 assert.equal(preimage.workingTime,p.workingTime);assert.equal(preimage.monthlyDaysScope,p.monthlyDaysScope);assert.equal(preimage.salaryConditions.records[0].definition.unhealthyWork,null);assert.equal(date,'2026-10-01');
});

test('each original inner/outer pin and each same-run link is mandatory',async()=>{
 const mutations=[v=>v.captures[0].payloadSha256='a'.repeat(64),v=>v.captures[0].original.id=uid(111),v=>v.captures[0].original.bodySha256='b'.repeat(64),v=>v.captures[0].original.payloadSha256='c'.repeat(64),v=>v.captures[0].original.saved.inputSha256='d'.repeat(64),v=>v.captures[0].original.saved.resultSha256='e'.repeat(64),v=>v.captures[0].original.saved.algorithmSha256='f'.repeat(64),v=>v.captures[0].original.saved=null,v=>v.employees[0].inputSha256='a'.repeat(64),v=>v.employees[0].resultSha256='b'.repeat(64),v=>v.captures[0].population.employees[0].employeeNumber='9999'];
 const fixture=await comparisonV2Fixture();for(const mutate of mutations){const v=structuredClone(fixture);mutate(v);await assert.rejects(read(v));}
});

test('coherent wrapper hashes cannot hide another population sourceVersion in saved input/result',async()=>{
 const v=await comparisonV2Fixture(),o=v.captures[0].original;
 o.saved.input.sourceVersions.population='a'.repeat(64);o.saved.result.sourceVersions.population='a'.repeat(64);
 await rebind(v);await assert.rejects(read(v),/fuentes completas/);
});

test('resealed outer population cannot hide a changed193 inner fact version',async()=>{
 const v=await comparisonV2Fixture(),o=v.captures[0].original;
 o.payload.monthlyDayDeclarations.records[0].configuration.definition.documentReference='Otra constancia exclusivamente sintética';
 o.payload.population.version=await budgetHash({employees:o.payload.population.employees,monthlyDayDeclarations:o.payload.monthlyDayDeclarations});
 o.saved.input.sourceVersions.population=o.payload.population.version;o.saved.result.sourceVersions.population=o.payload.population.version;
 await rebind(v);await assert.rejects(read(v),/hechos completos/);
});

test('a partial close binds one employee while both sidecars retain the complete original population',async()=>{
 const v=await comparisonV2Fixture({count:3,closeCount:1});await read(v);
 assert.equal(v.captures.length,1);assert.equal(v.groups[0].populationComplete,false);assert.equal(v.captures[0].positions.payload.employeeCount,3);
 v.captures[0].positions.payload.employees.pop();v.captures[0].positions.payload.employeeCount=2;v.captures[0].positions.payloadSha256=await budgetHash(v.captures[0].positions.payload);await assert.rejects(read(v));
});

test('absent original positions/dimensions remain absent and never borrow a current assignment or name',async()=>{
 const v=await comparisonV2Fixture();for(const s of [v.captures[0].positions,v.captures[0].dimensions])Object.assign(s,{status:'not_captured',payload:null,payloadSha256:null});
 await read(v);assert.ok(positionComparisonSummary(v).every(r=>r.difference===null));
 assert.equal(positionComparisonDocument(v,{active:'all',order:'number',view:'detailed'}).rows[0][2],null);
});

test('one complete response accepts mixed original domains but rejects clipping, duplicates and unused captures',async()=>{
 const v=await comparisonV2Fixture({count:2,closeCount:1}),legacy=await comparisonV2Fixture({legacy:true,count:2,closeCount:1,closeOffset:1,captureId:uid(901),groupId:uid(902)});
 v.captures.push(...legacy.captures);v.groups.push(...legacy.groups);v.employees.push(...legacy.employees);await read(v);
 for(const mutate of [x=>x.employees.pop(),x=>x.employees.push(structuredClone(x.employees[0])),x=>x.captures.push(structuredClone(x.captures[0])),x=>x.captures.pop()]){const changed=structuredClone(v);mutate(changed);await assert.rejects(read(changed));}
});

test('capacity and required receipt fields fail the whole query before partial validation/export',async()=>{
 const fixture=await comparisonV2Fixture();
 for(const mutate of [v=>v.groups=Array(1001).fill(v.groups[0]),v=>v.captures=Array(10001).fill(v.captures[0]),v=>v.employees=Array(10001).fill(v.employees[0]),v=>delete v.captures[0].original,v=>v.captures[0].original.currentProgram={version:'unsupported'},v=>v.employees[0].captureId=uid(999)]){const v=structuredClone(fixture);mutate(v);await assert.rejects(read(v));}
});

// R2 causal source-linkage regressions. Existing15 cases above stay byte exact.
import {conditionSources} from './fixtures/own-payroll-conditions-synthetic.js';
import {saved as fixtureSaved} from './fixtures/own-payroll-run-synthetic.js';
import {verifiedWorkspaceCapture} from '../assets/own-payroll-run-workspace-model.js';

test('source linkage: a coherently rehashed department999 cannot replace the original department',async()=>{
 const v=await comparisonV2Fixture(),o=v.captures[0].original,original=salarySerialized(o.payload),id=o.saved.input.employees[0].contractId;
 o.saved.input.employees[0].departmentCode='999';
 for(const row of o.saved.result.rows)if(row.contractId===id)row.departmentCode='999';
 await rebind(v);assert.equal(salarySerialized(o.payload),original);
 await assert.rejects(read(v),/fuentes originales/);
});

test('source linkage: a partial close cannot conceal another omitted employee from the ALL input',async()=>{
 const v=await comparisonV2Fixture({count:2,closeCount:1}),o=v.captures[0].original,original=salarySerialized(o.payload),removed=o.saved.input.employees[1].contractId;
 o.saved.input.employees=o.saved.input.employees.filter(e=>e.contractId!==removed);
 o.saved.result.rows=o.saved.result.rows.filter(e=>e.contractId!==removed);
 o.saved.result.employeeTotals=o.saved.result.employeeTotals.filter(e=>e.contractId!==removed);
 o.saved.result.employeeCount=o.saved.input.employees.length;o.saved.result.rowCount=o.saved.result.rows.length;
 await rebind(v);assert.equal(salarySerialized(o.payload),original);
 assert.equal(v.employees.length,1);assert.equal(v.captures[0].population.employees.length,2);
 assert.equal(v.captures[0].positions.payload.employeeCount,2);
 await assert.rejects(read(v),/fuentes originales/);
});

test('source linkage: a valid literal999 rule with resealed input cannot replace the captured programme rule',async()=>{
 const v=await comparisonV2Fixture(),o=v.captures[0].original,original=salarySerialized(o.payload);
 const rule=o.saved.input.rules.find(r=>r.code==='900');assert.equal(rule.unit,'money');
 rule.expression={op:'literal',unit:'money',value:'999'};
 await rebind(v);assert.equal(salarySerialized(o.payload),original);
 await assert.rejects(read(v),/fuentes originales/);
});

test('source linkage: valid precision7 with coherent hashes cannot replace the original precision8',async()=>{
 const v=await comparisonV2Fixture(),o=v.captures[0].original,original=salarySerialized(o.payload);
 assert.equal(o.saved.input.totalsPrecision,8);o.saved.input.totalsPrecision=7;
 await rebind(v);assert.equal(salarySerialized(o.payload),original);
 await assert.rejects(read(v),/fuentes originales/);
});

test('valid alternative receipts do not replace the original namespace or salary-condition contract',async()=>{
 const legacy=await comparisonV2Fixture({legacy:true}),namespaced=await comparisonV2Fixture();
 await verifiedWorkspaceCapture(namespaced.captures[0].original);
 legacy.captures[0].original.saved=structuredClone(namespaced.captures[0].original.saved);
 await rebind(legacy);await assert.rejects(read(legacy));
 const v=await comparisonV2Fixture(),alternative=structuredClone(v.captures[0].original),sources=conditionSources(1);
 alternative.payload={...sources,sourceInventory:{populationDomain:'native_registered'}};
 alternative.payloadSha256=await budgetHash(alternative.payload);alternative.saved=fixtureSaved(alternative);
 await verifiedWorkspaceCapture(alternative);
 v.captures[0].original.saved=structuredClone(alternative.saved);await rebind(v);
 await assert.rejects(read(v));
});
