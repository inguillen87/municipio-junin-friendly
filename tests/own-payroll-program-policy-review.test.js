// Synthetic policy changes through the existing program normalizer and proposal path.
import test from 'node:test';
import assert from 'node:assert/strict';
import {emissionSources} from './fixtures/own-payroll-row-emission-synthetic.js';
import {familyTariffSources} from './fixtures/own-payroll-family-tariff-synthetic.js';
import {program} from './fixtures/own-payroll-program-synthetic.js';
import {rule} from './fixtures/own-payroll-synthetic.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {ownProgramStructure} from '../assets/own-payroll-program-model.js';
import {monthlyForcedExpectedExpression} from '../assets/own-payroll-monthly-forced-amounts.js';
import {programWorkspaceChanges,prepareProgramWorkspace,describeProgramPolicy,programPolicyLabel,PROGRAM_FAMILY_FIELDS,PROGRAM_SOURCES} from '../assets/own-payroll-program-workspace-model.js';

const H='a'.repeat(64),clone=structuredClone;
function officialAddition(){
 const sources=emissionSources({optIn:false}),before=sources.programState.program.definition,after=clone(before);
 after.officialTotalsPolicies.push({...clone(before.officialTotalsPolicies[0]),period:'2026-11',sourceReference:'Nueva declaración sintética de totales para noviembre'});
 return{sources,before,after};
}
test('adding only a new total policy is a real change and uses the normal proposal command',()=>{
 const {sources,before,after}=officialAddition(),old=salarySerialized(before),boot=clone(sources.programState);boot.permissions.canPropose=true;
 const diff=programWorkspaceChanges(before,after),changes=diff.rows.filter(r=>r.status!=='unchanged');
 assert.equal(diff.changed,1);assert.deepEqual(changes.map(r=>r.key),['officialTotalsPolicies']);
 assert.equal(changes[0].before.length,1);assert.equal(changes[0].after.length,2);
 const command=prepareProgramWorkspace(boot,after,'Propuesta de nueva política exclusivamente sintética');
 assert.equal(command.command,'propose');assert.equal(command.reviewConfirmed,false);assert.deepEqual(command.program.officialTotalsPolicies,after.officialTotalsPolicies);assert.equal(salarySerialized(before),old);
});
for(const field of ['quantityPhases','officialTotalsPolicies','rowEmissionPolicies'])test('complete before/after review detects a change only in '+field,()=>{
 const before=emissionSources().programState.program.definition,after=clone(before);after[field][0].sourceReference='Cambio sintético visible únicamente en la política';
 const diff=programWorkspaceChanges(before,after);assert.equal(diff.changed,1);const row=diff.rows.find(r=>r.key===field);assert.equal(row.status,'modified');assert.deepEqual(row.before,before[field]);assert.deepEqual(row.after,after[field]);
 assert.match(describeProgramPolicy(field,row.after),/Cambio sintético visible únicamente en la política/);
});
test('family tariff rows, mapping evidence and source hashes are retained in the complete review',()=>{
 const rows=['3','7','8','10','9','11'].map(typeCode=>({regionCode:'1',typeCode,upperBound:'999999.00',amount:'7.00',sourceSha256:H}));
 const before=familyTariffSources({rows}).programState.program.definition,after=clone(before);after.familyTariffPolicies[0].sourceReference='Nuevo respaldo ficticio para comparación';
 const diff=programWorkspaceChanges(before,after);assert.equal(diff.changed,1);const row=diff.rows.find(r=>r.key==='familyTariffPolicies');assert.equal(row.status,'modified');assert.deepEqual(row.after,after.familyTariffPolicies);
 const description=describeProgramPolicy(row.key,row.after);for(const text of ['Tabla de importes','7.00','999999.00',H,'Correspondencias de tarifas','Nuevo respaldo ficticio'])assert.ok(description.includes(text),text);
});
function forcedProgram(){
 const p={agreementCode:'1',period:'2026-10',liquidationType:'monthly',sourceContract:'own-payroll-novelty-batch.v1',sourceKind:'monthly_amount',sourceCode:'609',amountInputKey:'amount609',presenceInputKey:'presence609',treatment:'declared_amount_passthrough',quantityPolicy:'explicit_zero',sourceSha256:H,ruleReference:'Política mensual exclusivamente sintética'};
 return ownProgramStructure({namespaceVersion:'own-payroll-namespaces.v2',noveltyPresenceVersion:'own-payroll-novelty-presence.v1',monthlyForcedAmountsVersion:'own-monthly-forced-passthrough.v1',monthlyForcedAmountPolicies:[p],totalsPrecision:2,
 rules:[rule('609',monthlyForcedExpectedExpression(p),{nature:'deduction',validFrom:p.period,validUntil:p.period})],bindings:[
 {agreementCode:'1',key:p.amountInputKey,unit:'money',sourceKind:'monthly_amount',sourceCode:'609',combine:'single',onMissing:'zero',ruleReference:'Importe único sintético'},
 {agreementCode:'1',key:p.presenceInputKey,unit:'coefficient',sourceKind:'monthly_presence',sourceCode:'609',combine:'any',onMissing:'zero',ruleReference:'Presencia sintética completa'}]});
}
test('the forced amount policy is counted without altering its declared amount or approval workflow',()=>{
 const before=forcedProgram(),after=clone(before);after.monthlyForcedAmountPolicies[0].ruleReference='Otro respaldo sintético visible';const diff=programWorkspaceChanges(before,after);
 assert.equal(diff.changed,1);assert.equal(diff.rows.find(r=>r.key==='monthlyForcedAmountPolicies').status,'modified');
 const text=describeProgramPolicy('monthlyForcedAmountPolicies',after.monthlyForcedAmountPolicies);assert.match(text,/Usar el importe aprobado sin recalcularlo/);assert.match(text,/Cantidad cero declarada/);assert.match(text,/Otro respaldo sintético visible/);
});
test('all validated optional fields appear, including unchanged versions, and no-op remains zero',()=>{
 const p=emissionSources().programState.program.definition,diff=programWorkspaceChanges(p,clone(p));assert.equal(diff.changed,0);
 for(const key of ['familyPayrollFactsVersion','quantityPhasesVersion','quantityPhases','officialTotalsVersion','officialTotalsPolicies','rowEmissionVersion','rowEmissionPolicies']){
  const row=diff.rows.find(r=>r.key===key);assert.ok(row,key);assert.equal(row.status,'unchanged');assert.deepEqual(row.before,p[key]);assert.deepEqual(row.after,p[key]);
 }
});
test('existing simple programs retain their previous rows and do not gain empty policy blocks',()=>{
 const p=program(),diff=programWorkspaceChanges(null,p);assert.equal(diff.rows.length,p.rules.length+p.bindings.length);assert.equal(diff.rows.some(r=>r.kind==='policies'),false);
});
test('future validity and succession evidence remain readable and exact without numeric coercion',()=>{
 const value=[{policyId:'policy-future',validFrom:'2028-11',validUntil:null,supersedes:{policyId:'policy-prior',policySha256:H},rows:[{regionCode:'1',amount:'9007199254740993.00000001',upperBound:'99999999999999999.00',sourceSha256:H}]}];
 const text=describeProgramPolicy('familyTariffPolicies',value);for(const s of ['2028-11','Hasta: Sin término','policy-prior',H,'9007199254740993.00000001','99999999999999999.00'])assert.ok(text.includes(s),s);
 assert.match(programPolicyLabel('familyTariffPolicies'),/Tarifas familiares/);assert.match(PROGRAM_SOURCES.family_tariff,/Tarifa familiar/);assert.equal(PROGRAM_FAMILY_FIELDS.childrenWithDisability,'Hijos con discapacidad');
});
test('seeing a changed policy does not bypass existing historical restrictions',()=>{
 const s=emissionSources(),boot=clone(s.programState);boot.permissions.canPropose=true;const after=clone(boot.program.definition);after.rowEmissionPolicies[0].sourceReference='Respaldo sintético reescrito sobre política histórica';
 assert.equal(programWorkspaceChanges(boot.program.definition,after).changed,1);assert.throws(()=>prepareProgramWorkspace(boot,after,'Intento sintético de reescribir historia'));
});
test('invalid programs still fail before producing a comparison',()=>{
 const p=program();p.unknownPolicy={amount:'1.00'};assert.throws(()=>programWorkspaceChanges(null,p));
});
