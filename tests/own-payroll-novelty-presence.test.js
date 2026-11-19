import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {ownProgramDefinition,ownProgramHistory,ownProgramStructure,OWN_PAYROLL_NOVELTY_PRESENCE_VERSION} from '../assets/own-payroll-program-model.js';
import {OWN_PAYROLL_NAMESPACE_VERSION,calculateOwnPayroll,normalizeOwnPayrollInput,OWN_PAYROLL_LIMITS} from '../assets/own-payroll-engine.js';
import {programWorkspaceChanges,PROGRAM_SOURCES} from '../assets/own-payroll-program-workspace-model.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {fixedApprovedRecord} from './fixtures/payroll-fixed-novelties-synthetic.js';
import {payrollInput,lit,fact,rule} from './fixtures/own-payroll-synthetic.js';

// Fictional concepts and identities. No approval or municipal writes are performed.
const binding=(family='monthly')=>({agreementCode:'1',key:'Has120',unit:'coefficient',sourceKind:family+'_presence',sourceCode:'120',onMissing:'zero',combine:'any',ruleReference:'Presencia completa sintética QA'});
function fixture(family='monthly'){
 const s=approvedSources(),b=binding(family);
 s.programState.program.definition={namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION,noveltyPresenceVersion:OWN_PAYROLL_NOVELTY_PRESENCE_VERSION,totalsPrecision:2,bindings:[b],rules:[rule('120',{op:'choose',condition:{op:'compare',operator:'ne',left:fact('Has120','coefficient'),right:lit('0')},then:lit('10','money'),else:lit('0','money')},{nature:'non_remuneration'})]};
 return s;
}
const code=x=>e=>e.code===x;
const presence=s=>prepareOwnPayrollInput(s).employees.map(e=>e.inputs.find(i=>i.key==='Has120').value);

test('an approved explicit zero event is present; a complete channel without an event is absent',()=>{
 const s=fixture();s.monthly.batches[0].rows[0].amountCents='0';
 assert.deepEqual(presence(s),['1','0']);
 const r=calculateOwnPayroll(prepareOwnPayrollInput(s));
 assert.deepEqual(r.rows.map(x=>x.amount),['10.00','0.00']);
 const changed=structuredClone(s);changed.monthly.batches=[];
 assert.deepEqual(presence(changed),['0','0']);
 assert.notEqual(prepareOwnPayrollInput(s).sourceVersions.novelties,prepareOwnPayrollInput(changed).sourceVersions.novelties);
 assert.notEqual(prepareOwnPayrollInput(s).employees[0].inputs[0].sourceReference,prepareOwnPayrollInput(changed).employees[0].inputs[0].sourceReference);
});

test('a numeric field remains missing even when the same event establishes presence',()=>{
 const s=fixture();s.monthly.batches[0].rows[0].amountCents=null;s.monthly.batches[0].rows[0].quantityDecimal='1';
 assert.deepEqual(presence(s),['1','0']);
 s.programState.program.definition.bindings.push({...binding(),key:'Amount120',unit:'money',sourceKind:'monthly_amount',combine:'sum'});
 s.programState.program.definition.rules[0].expression.then=fact('Amount120');
 assert.throws(()=>prepareOwnPayrollInput(s),code('SOURCE_VALUE_MISSING'));
});

test('an incomplete channel cannot produce an absent presence value',()=>{
 const s=fixture();s.monthly.batches=[];s.monthly.complete=false;
 assert.throws(()=>prepareOwnPayrollInput(s),code('SOURCE_INCOMPLETE'));
});

test('all matching approved rows are consumed, and any presence stays one',()=>{
 const s=fixture(),a=structuredClone(s.monthly.batches[0]),r=structuredClone(a.rows[0]);
 r.rowOrdinal=2;a.rows.push(r);a.rowCount=2;
 // Legacy approval fixtures declare export counts. Keep their checked count coherent.
 if(Object.hasOwn(a,'rowsCount'))a.rowsCount=2;
 const duplicate=structuredClone(s);duplicate.monthly.batches.push(duplicate.monthly.batches[0]);
 assert.throws(()=>prepareOwnPayrollInput(duplicate),code('SOURCE_SCOPE_INVALID'));
 // Two distinct approved batches carry the same concept without double activation.
 a.rows=[a.rows[0]];a.rowCount=1;a.id='10000000-0000-4000-8000-000000009901';
 s.monthly.batches.push(a);assert.deepEqual(presence(s),['1','0']);
});

test('wrong identities, forced values and retroactive rows retain their existing guards',()=>{
 for(const [mutate,expected] of [
  [s=>s.monthly.batches[0].rows[0].subject.identityToken='f'.repeat(64),'SOURCE_IDENTITY_CHANGED'],
  [s=>Object.assign(s.monthly.batches[0].rows[0],{forced:true,observation:'Justificación sintética de modo forzado'}),'FORCED_RULE_REQUIRED'],
  [s=>s.monthly.batches[0].rows[0].adjustmentMonth='2026-09-01','RETROACTIVE_RULE_REQUIRED']
 ]){const s=fixture();mutate(s);assert.throws(()=>prepareOwnPayrollInput(s),code(expected));}
});

test('presence in the monthly family cannot consume an unrelated fixed event or concept',()=>{
 const s=fixture();s.monthly.batches[0].rows[0].conceptSourceId='100';
 assert.throws(()=>prepareOwnPayrollInput(s),code('SOURCE_UNUSED'));
});

test('fixed presence uses the exact approved list and matching export',()=>{
 const s=fixture('fixed'),record=fixedApprovedRecord(1,{conceptSourceId:'120',quantityDecimal:null,amountCents:'0',validFrom:'2026-10-01',validTo:'2026-10-31'});
 s.monthly.batches=[];record.subject=structuredClone(approvedSources().monthly.batches[0].rows[0].subject);
 s.fixed.list.data.rows=[record];s.fixed.list.data.total=1;
 s.fixed.export.data.rows=[{recordId:record.id,version:record.version,proposalId:record.approved.id,subject:structuredClone(record.subject),values:structuredClone(record.approved.values)}];s.fixed.export.data.total=1;
 assert.deepEqual(presence(s),['1','0']);
 s.fixed.export.data.rows[0].values.amountCents='1';
 assert.throws(()=>prepareOwnPayrollInput(s));
});

test('feature opt-in and explicit presence shape are mandatory',()=>{
 const s=fixture(),p=s.programState.program.definition;
 assert.deepEqual(ownProgramDefinition(p,s.programState.salaryCatalog.items),ownProgramStructure(p));
 for(const mutate of[p=>delete p.noveltyPresenceVersion,p=>p.noveltyPresenceVersion='unknown',p=>delete p.namespaceVersion,p=>p.bindings[0].unit='money',p=>p.bindings[0].combine='sum',p=>p.bindings[0].onMissing='error']){
  const v=structuredClone(p);mutate(v);assert.throws(()=>ownProgramStructure(v));
 }
});

test('history and review differences preserve the presence contract',()=>{
 const p=fixture().programState.program.definition,old=structuredClone(p);delete old.noveltyPresenceVersion;old.bindings=[];old.rules[0].expression=lit('10','money');
 assert.equal(programWorkspaceChanges(old,p).noveltyPresenceVersion.after,OWN_PAYROLL_NOVELTY_PRESENCE_VERSION);
 assert.throws(()=>ownProgramHistory(p,old),code('PROGRAM_HISTORY_REQUIRED'));
 assert.match(PROGRAM_SOURCES.monthly_presence,/Presencia/);
});

test('bounded input capacity handles a full convenio and rejects overflow',()=>{
 assert.equal(OWN_PAYROLL_LIMITS.inputs,512);
 const s=payrollInput();s.employees=s.employees.slice(0,1);s.employees[0].inputs=Array.from({length:512},(_,i)=>({key:'Input'+i,unit:'money',value:'0',sourceReference:'Fuente sintética completa'}));
 s.rules=[rule('100',fact('Input0'))];assert.equal(normalizeOwnPayrollInput(s).employees[0].inputs.length,512);
 s.employees[0].inputs.push({key:'Overflow',unit:'money',value:'0',sourceReference:'Fuente sintética completa'});
 assert.throws(()=>normalizeOwnPayrollInput(s));
});
