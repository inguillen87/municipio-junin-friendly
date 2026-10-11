import test from 'node:test';
import assert from 'node:assert/strict';
import { participationDefinition, participationCapture, participationCommand, prepareParticipation } from '../assets/own-period-participation-model.js';
import { syntheticParticipationBootstrap } from './fixtures/own-period-participation-synthetic.js';
import { participationRules, participationRuleKey } from '../assets/own-period-participation-program.js';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { ownProgramDefinition, ownProgramHistory } from '../assets/own-payroll-program-model.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
import { ownRunHash as hash } from '../lib/internal-own-payroll-run.js';
import { auxiliarySources } from './fixtures/own-payroll-auxiliary-synthetic.js';
import { uid } from './fixtures/own-payroll-program-synthetic.js';
import { requireExactProgramChanges } from '../assets/own-payroll-program-precision.js';
import { approvedSources } from './fixtures/own-payroll-approved-synthetic.js';
import { fixedApprovedRecord } from './fixtures/payroll-fixed-novelties-synthetic.js';
import { prepareProgramCopy } from '../assets/own-payroll-program-copy-model.js';
import { copyFixture } from './fixtures/own-payroll-program-copy-synthetic.js';
import { ownProgramRuleKey } from '../assets/own-payroll-program-model.js';
const definition = () => ({recognizedUnits:'1',baseUnits:'3',asOfDate:'2026-10-01',documentReference:'Constancia exclusivamente sintética QA'});
function seal(s) {s.periodParticipation.version=hash(['own-period-participation.v1',s.period,s.periodParticipation.records]);s.population.version=hash({employees:s.population.employees,periodParticipation:s.periodParticipation});return s;}
function source(count=37) {
 const s=auxiliarySources(count),p=s.programState.program.definition;
 p.periodParticipation={version:'own-period-participation.v1',fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:p.rules.map(r=>({ruleKey:participationRuleKey(r),treatment:r.code==='88'?'fraction':'declared_formula',reference:'Tratamiento exclusivamente sintético documentado'}))};
 for(const sourceField of ['recognizedUnits','baseUnits'])p.bindings.push({agreementCode:'1',key:sourceField,unit:'units',sourceKind:'period_fact',sourceField,onMissing:'error',combine:'single',ruleReference:'Participación exclusivamente sintética QA'});
 s.periodParticipation={complete:true,version:'a'.repeat(64),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,fullPeriod:i===0,configuration:{version:'a'.repeat(64),sourceVersion:'a'.repeat(64),revision:1,definition:definition(),proposalId:uid(300+i),approvalId:uid(400+i),identityToken:e.identityToken}}))};
 return seal(s);
}
test('the same documented quantities require a fresh independent review after employment changes, without falsifying their values',()=>{
 const b=syntheticParticipationBootstrap(),d=definition();
 Object.assign(b.configuration,{revision:1,definition:d,proposalId:uid(300),approvalId:uid(400),identityToken:b.source.subject.identityToken,sourceVersion:b.source.version});
 assert.throws(()=>prepareParticipation(b,d,'Revisión exclusivamente sintética QA'),/no contiene cambios/);
 b.source.version='b'.repeat(64);b.source.fullPeriod=false;
 const p=prepareParticipation(b,d,'Nueva vigencia laboral exclusivamente sintética QA');
 assert.deepEqual(p.definition,d);assert.equal(p.sourceVersion,b.source.version);assert.equal(p.baseVersion,b.configuration.version);
});
test('documentary quantities preserve cents-level precision, zero and unknown without calendar inference',()=>{
 for(const recognizedUnits of ['0','0.00000001','1','2.5']) assert.equal(participationDefinition({...definition(),recognizedUnits},'2026-10').recognizedUnits,recognizedUnits);
 assert.equal(participationDefinition({...definition(),recognizedUnits:null,baseUnits:null},'2026-10').recognizedUnits,null);
 for(const change of [{baseUnits:'0'},{baseUnits:'0.00000000'},{recognizedUnits:'4'},{recognizedUnits:'1.000000001'},{recognizedUnits:'-1'},{recognizedUnits:1},{baseUnits:'01'},{asOfDate:'2026-02-30'},{asOfDate:'2026-11-01'},{dayCount:30}]) assert.throws(()=>participationDefinition({...definition(),...change},'2026-10'));
});
test('all 37 contracts participate; exact one-third remains rational and dependent totals are not prorated twice',()=>{
 const s=source(),original=structuredClone(s.programState.program.definition.rules),input=prepareOwnPayrollInput(s),result=createOwnPayrollSnapshot(input).result;
 assert.equal(result.employeeCount,37);assert.equal(result.employeeTotals[0].net,'114.69');assert.ok(result.employeeTotals.slice(1).every(r=>r.net==='38.23'));
 assert.deepEqual(s.programState.program.definition.rules,original);
 assert.equal(input.employees.at(-1).inputs.find(i=>i.key==='recognizedUnits').value,'1');assert.equal(input.employees.at(-1).inputs.find(i=>i.key==='baseUnits').value,'3');
 assert.ok(!JSON.stringify(input).includes('employeeName'));
});
test('explicit zero participation produces zero; full continuity uses 1/1 even when no quantity fact was approved',()=>{
 const s=source(2);s.periodParticipation.records[1].configuration.definition.recognizedUnits='0';
 Object.assign(s.periodParticipation.records[0].configuration,{revision:0,definition:null,proposalId:null,approvalId:null,identityToken:null,sourceVersion:null});seal(s);
 const result=createOwnPayrollSnapshot(prepareOwnPayrollInput(s)).result;
 assert.equal(result.employeeTotals[0].net,'114.69');assert.equal(result.employeeTotals[1].net,'0.00');
});
for(const [label,mutate] of [
 ['missing later-page record',s=>s.periodParticipation.records.pop()],
 ['unknown numerator',s=>s.periodParticipation.records.at(-1).configuration.definition.recognizedUnits=null],
 ['unknown base',s=>s.periodParticipation.records.at(-1).configuration.definition.baseUnits=null],
 ['unapproved partial declaration',s=>Object.assign(s.periodParticipation.records.at(-1).configuration,{revision:0,definition:null,proposalId:null,approvalId:null,identityToken:null,sourceVersion:null})],
 ['changed identity',s=>s.periodParticipation.records.at(-1).identityToken='f'.repeat(64)],
 ['missing treatment',s=>s.programState.program.definition.periodParticipation.treatments.pop()],
 ['duplicate treatment',s=>s.programState.program.definition.periodParticipation.treatments[1]=s.programState.program.definition.periodParticipation.treatments[0]],
 ['zero fallback',s=>s.programState.program.definition.bindings.at(-1).onMissing='zero'],
 ['unsupported time unit',s=>s.programState.program.definition.bindings.at(-1).unit='hours'],
 ['implicit full-period calendar',s=>s.programState.program.definition.periodParticipation.fullPeriod='30_days'],
]) test(label+' blocks the whole result',()=>{const s=source();mutate(s);seal(s);assert.throws(()=>prepareOwnPayrollInput(s));});
test('capture version protects partial status and documentary source; old programs reject unsolicited participation',()=>{
 const s=source();s.periodParticipation.records.at(-1).fullPeriod=true;assert.throws(()=>prepareOwnPayrollInput(s),/fuentes aprobadas exactas/);
 const old=auxiliarySources(1);old.periodParticipation=source(1).periodParticipation;assert.throws(()=>prepareOwnPayrollInput(old));
 assert.throws(()=>ownProgramHistory(source(1).programState.program.definition,auxiliarySources(1).programState.program.definition),/política explícita/);
});
test('policy addition is a real expression change subject to exact precision; repeated normalization does not apply it twice',()=>{
 const s=source(1),p=ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items);
 assert.deepEqual(ownProgramDefinition(p,s.programState.salaryCatalog.items),p);
 assert.deepEqual(participationRules(p),participationRules(ownProgramDefinition(p,s.programState.salaryCatalog.items)));
 const after=structuredClone(p);after.rules.find(r=>r.code==='88').rounding.mode='half_up';
 assert.throws(()=>requireExactProgramChanges(auxiliarySources(1).programState.program.definition,after),/precisión exacta/);
});
test('partial fixed validity blocks by default; an explicit decision consumes approved cents without multiplying or inferring dates',()=>{
 const s=approvedSources(1),p=s.programState.program.definition;
 p.namespaceVersion='own-payroll-namespaces.v2';
 // The old fixture's auxiliary parameter predates the explicit namespace.
 p.bindings.find(b=>b.key==='base').sourceKind='auxiliary_parameter';
 for(const d of s.programState.salaryCatalog.items)if(d.nature==='auxiliary')d.kind='auxiliary';
 p.periodParticipation={version:'own-period-participation.v1',fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:p.rules.map(r=>({ruleKey:participationRuleKey(r),treatment:'declared_formula',reference:'Valores aprobados exclusivamente sintéticos'}))};
 p.bindings.find(b=>b.key==='addition').sourceKind='fixed_amount';
 const row=fixedApprovedRecord(1,{conceptSourceId:'120',quantityDecimal:null,amountCents:'225',validFrom:'2026-10-15',validTo:null});row.subject=structuredClone(s.monthly.batches[0].rows[0].subject);
 s.monthly.batches=[];s.fixed.list.data.rows=[row];s.fixed.list.data.total=1;
 s.fixed.export.data.rows=[{recordId:row.id,version:row.version,proposalId:row.approved.id,subject:row.subject,values:row.approved.values}];s.fixed.export.data.total=1;
 const e=s.population.employees[0];s.periodParticipation={complete:true,version:'a'.repeat(64),records:[{contractId:e.contractId,identityToken:e.identityToken,fullPeriod:false,configuration:{version:'a'.repeat(64),sourceVersion:'a'.repeat(64),revision:1,definition:definition(),proposalId:uid(300),approvalId:uid(400),identityToken:e.identityToken}}]};seal(s);
 assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='PRORATION_REQUIRED');
 p.periodParticipation.fixedValidity='declared_values';const input=prepareOwnPayrollInput(s);
 assert.equal(input.employees[0].inputs.find(i=>i.key==='addition').value,'2.25000000');
 row.identityCurrent=false;assert.throws(()=>prepareOwnPayrollInput(s));
});
test('copying a fractional rule carries both exact quantity sources and its documented treatment to every target',()=>{
 const f=copyFixture(['2','4']);f.draft.namespaceVersion='own-payroll-namespaces.v2';
 f.draft.rules[0].rounding={precision:3,mode:'exact'};
 f.draft.periodParticipation={version:'own-period-participation.v1',fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:[{ruleKey:participationRuleKey(f.draft.rules[0]),treatment:'fraction',reference:'Tratamiento exclusivamente sintético para copiar'}]};
 f.draft.bindings=['recognizedUnits','baseUnits'].map(sourceField=>({agreementCode:'1',key:sourceField,unit:'units',sourceKind:'period_fact',sourceField,onMissing:'error',combine:'single',ruleReference:'Fuente exclusivamente sintética para copiar'}));
 f.intent.sourceKey=ownProgramRuleKey(f.draft.rules[0],f.draft.namespaceVersion);
 const plan=prepareProgramCopy(f.boot,f.draft,f.intent);
 assert.equal(plan.program.bindings.length,6);assert.equal(plan.program.periodParticipation.treatments.length,3);
 assert.ok(plan.program.periodParticipation.treatments.every(t=>t.treatment==='fraction'&&t.reference==='Tratamiento exclusivamente sintético para copiar'));
 assert.equal(f.draft.periodParticipation.treatments.length,1);
});
import { independentParticipationReference } from '../scripts/lib/period-participation-qa-reference.mjs';

test('QA reference matches prior monetary scope instead of the first random UUID with an unrelated monthly addition',()=>{
 const input=(contractId,addition)=>({contractId,inputs:[{key:'base',unit:'money',value:'100.10'},{key:'addition',unit:'money',value:addition},{key:'recognizedYears',unit:'units',value:'0.00000000'}]});
 const previous={saved:{input:{employees:[input('unrelated','20.25'),input('matching','0.00000000')]},result:{employeeTotals:[{contractId:'unrelated',net:'243.56'},{contractId:'matching',net:'223.92'}],rows:[{contractId:'matching',conceptCode:'88',nature:'remuneration',amount:'7.29'},{contractId:'matching',conceptCode:'95',nature:'remuneration',amount:'107.40'}]}}};
 assert.deepEqual(independentParticipationReference(previous,input('new','0.00000000')),{baselineId:'matching',expectedFull:'223.92',expectedThird:'147.46',selectedCents:'11469'});
 assert.throws(()=>independentParticipationReference(previous,input('new','1.00')),/same complete monetary inputs/);
});
