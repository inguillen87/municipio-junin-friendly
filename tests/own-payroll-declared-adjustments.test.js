import test from 'node:test';
import assert from 'node:assert/strict';
import {adjustmentCodes,adjustmentProgram,adjustmentSources,sealAdjustmentSources,adjustmentCapture,adjustmentHash} from './fixtures/own-payroll-declared-adjustments-synthetic.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {ownProgramStructure,ownProgramDefinition,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownRunCapture} from '../assets/own-payroll-run-model.js';
import {captureDeclaredAdjustmentSources,verifyDeclaredAdjustmentInput,normalizeDeclaredAdjustmentCapture} from '../assets/own-payroll-declared-adjustments-capture.js';
const code=value=>error=>error.code===value;
const definition=s=>s.programState.program.definition;
const capture=s=>captureDeclaredAdjustmentSources(definition(s),s);
const native=s=>s.monthly.nativeBatches[0].rows[0].values;
const calculate=s=>createOwnPayrollSnapshot(prepareOwnPayrollInput(s));

test('all nine direct amounts execute from an approved complete capture, without recalculating prior months',()=>{
 const events=adjustmentCodes.map((code,i)=>({code,cents:String(100+i),origin:'2026-09-01'})),s=adjustmentSources({events});
 ownProgramDefinition(definition(s),s.programState.salaryCatalog.items);const snap=calculate(s),audit=capture(s);
 assert.equal(audit.admissions.length,9);assert.equal(snap.result.rows.length,18);
 for(const admission of audit.admissions){const result=snap.result.rows.find(r=>r.contractId===admission.contractId&&r.conceptCode===admission.conceptCode);assert.equal(result.amount,(Number(admission.amountCents)/100).toFixed(2));}
 assert.equal(snap.result.employeeTotals[0].remuneration,'1.00');assert.equal(snap.result.employeeTotals[0].non_remuneration,'7.28');assert.equal(snap.result.employeeTotals[0].deduction,'1.08');
 assert.equal(audit.admissions[0].monetaryRecognition,'current_payroll_no_historical_recalculation');
});

test('signed cents sum exactly and retain every original origin, constance and row hash',()=>{
 const s=adjustmentSources(),before=structuredClone(s),audit=capture(s),snap=calculate(s);assert.deepEqual(s,before);
 assert.equal(audit.subtotals[0].amountCents,'1000');assert.deepEqual(audit.subtotals[0].byOriginMonth.map(v=>[v.adjustmentMonth,v.amountCents]),[['2026-08-01','1025'],['2026-09-01','-25']]);
 assert.equal(audit.admissions[0].sourceRowSha256,adjustmentHash(native(s)));assert.match(audit.admissions[0].legalInstrument,/Constancia/);
 assert.equal(snap.input.employees[0].inputs.find(v=>v.key==='declared450').value,'10.00000000');
});

test('imported and native source identities remain original and equivalent only under explicit own policy',()=>{
 const s=adjustmentSources({channel:'imported',events:[{code:'450',cents:'1234',origin:'2026-09-01'}]}),audit=capture(s);
 assert.equal(audit.admissions[0].sourceContract,'payroll-novelty-batch.v2');assert.equal(Object.hasOwn(s.monthly.batches[0].rows[0],'contractId'),false);assert.equal(calculate(s).result.rows.find(r=>r.conceptCode==='450').amount,'12.34');
});

test('empty complete monthly channels yield zero without manufacturing an event',()=>{
 const s=adjustmentSources({events:[]}),audit=capture(s),snap=calculate(s);assert.deepEqual(audit.admissions,[]);assert.deepEqual(audit.subtotals,[]);assert.ok(snap.input.employees.every(e=>e.inputs.every(v=>v.value==='0.00000000')));
});

for(const [label,mutate] of [
 ['native channel absent',s=>delete s.monthly.nativeBatches],['monthly channel absent',s=>delete s.monthly.batches],['monthly truncated',s=>s.monthly.complete=false],['population truncated',s=>s.population.complete=false],['fixed list truncated',s=>s.fixed.list.data.total=1],['fixed export truncated',s=>s.fixed.export.data.total=1],['native unapproved',s=>s.monthly.nativeBatches[0].status='draft'],['identity changed',s=>s.monthly.nativeBatches[0].rows[0].identityCurrent=false],['native hash changed',s=>s.monthly.nativeBatches[0].rowsSha256='0'.repeat(64)]
])test('complete source contract rejects '+label,()=>{const s=adjustmentSources();mutate(s);assert.throws(()=>calculate(s));});

for(const [label,value,expected] of [
 ['origin absent',{adjustmentMonth:null},'DECLARED_ADJUSTMENT_ORIGIN_REQUIRED'],['origin future',{adjustmentMonth:'2026-11-01'},'OWN_NOVELTY_INPUT_INVALID'],['retroactive current',{adjustmentMonth:'2026-10-01'},'DECLARED_ADJUSTMENT_PRIOR_MONTH_REQUIRED'],['constance absent',{legalInstrument:null},'DECLARED_ADJUSTMENT_EVIDENCE_REQUIRED'],['quantity nonzero',{quantityDecimal:'1'},'DECLARED_ADJUSTMENT_QUANTITY_INCOMPATIBLE'],['amount absent',{amountCents:null},'OWN_NOVELTY_INPUT_INVALID'],['forced',{forced:true},null]
])test('known policy rejects '+label,()=>{const s=adjustmentSources();Object.assign(native(s),value);sealAdjustmentSources(s);assert.throws(()=>calculate(s),expected?code(expected):undefined);});

test('a fixed event for a declared code is an incidence even if its amount equals the monthly sum',()=>{
 const s=adjustmentSources();const list=s.fixed.list.data,exp=s.fixed.export.data;
 // Use the actual valid fixed fixture, then select the declared economic identity.
 return import('./fixtures/payroll-fixed-novelties-synthetic.js').then(({fixedApprovedRecord})=>{const r=fixedApprovedRecord(0,{conceptSourceId:'450',amountCents:'1000',quantityDecimal:null});Object.assign(r.subject,{contractId:s.population.employees[0].contractId,legajo:s.population.employees[0].employeeNumber,identityToken:s.population.employees[0].identityToken,origin:'MUNICONTROL',sourceCutoff:null,registrationId:'00000000-0000-4000-8000-000000090001',registeredAt:'2026-10-01T00:00:00Z'});list.rows=[r];list.total=1;exp.rows=[{recordId:r.id,version:r.version,proposalId:r.approved.id,subject:structuredClone(r.subject),values:structuredClone(r.approved.values)}];exp.total=1;assert.throws(()=>calculate(s),code('DECLARED_ADJUSTMENT_FIXED_INCOMPATIBLE'));});
});

test('capture and saved-result readers reject source, origin, inventory, input and result tampering',()=>{
 const original=adjustmentCapture();ownRunCapture(original);
 for(const change of [c=>delete c.payload.sourceInventory.declaredAdjustments,c=>c.payload.sourceInventory.declaredAdjustments.subtotals[0].amountCents='0',c=>c.payload.sourceInventory.declaredAdjustments.admissions[0].adjustmentMonth='2026-07-01',c=>c.saved.input.employees[0].inputs.find(v=>v.key==='declared450').value='99.00000000',c=>c.saved.result.rows.find(r=>r.conceptCode==='450').amount='99.00']){const c=structuredClone(original);change(c);assert.throws(()=>ownRunCapture(c));}
 const c=structuredClone(original);c.saved.input.employees[0].inputs.find(v=>v.key==='declared450').value='99.00000000';assert.throws(()=>verifyDeclaredAdjustmentInput(c.payload,c.saved.input),code('DECLARED_ADJUSTMENT_INPUT_CHANGED'));
});

test('future periods reuse policies without changing archived captures',()=>{
 const before=adjustmentCapture();const s=adjustmentSources({period:'2035-12',events:[{code:'450',cents:'700',origin:'2034-08-01'}]});assert.equal(calculate(s).result.rows.find(r=>r.conceptCode==='450').amount,'7.00');ownRunCapture(before);
});

test('policy succession preserves complete originals and rejects removal or rewrite',()=>{
 const before=adjustmentProgram(['450']),after=structuredClone(before),prior=before.monthlyDeclaredAdjustmentPolicies[0];
 after.monthlyDeclaredAdjustmentPolicies.push({...prior,policyId:'synthetic-successor450',validFrom:'2027-08',supersedes:{policyId:prior.policyId,policySha256:adjustmentHash(prior)},ruleReference:'Sucesión de prueba explícita'});
 ownProgramHistory(before,ownProgramStructure(after));
 for(const mutate of [p=>p.monthlyDeclaredAdjustmentPolicies.shift(),p=>p.monthlyDeclaredAdjustmentPolicies[0].ruleReference='Historia reescrita de prueba',p=>delete p.monthlyDeclaredAdjustmentsVersion]){const bad=structuredClone(after);mutate(bad);assert.throws(()=>{ownProgramHistory(before,bad);ownProgramStructure(bad);});}
});

test('duplicate, missing predecessor, mixed channels and indirect formula cannot authorize a policy',()=>{
 const base=adjustmentProgram(['450']);
 for(const mutate of [p=>p.monthlyDeclaredAdjustmentPolicies.push(structuredClone(p.monthlyDeclaredAdjustmentPolicies[0])),p=>p.monthlyDeclaredAdjustmentPolicies[0].supersedes={policyId:'missing',policySha256:'a'.repeat(64)},p=>p.bindings[0].sourceKind='fixed_amount',p=>p.rules[0].expression={op:'literal',unit:'money',value:'0'},p=>p.rules[0].rounding.precision=0,p=>p.monthlyDeclaredAdjustmentsVersion='unknown']){const bad=structuredClone(base);mutate(bad);assert.throws(()=>ownProgramStructure(bad));}
});

test('legacy programmes stay byte compatible and do not gain retroactivity from the new module',()=>{
 const s=approvedSources(),before=calculate(s);assert.equal(captureDeclaredAdjustmentSources(definition(s),s),null);assert.deepEqual(calculate(s),before);
 s.monthly.batches[0].rows[0].adjustmentMonth='2026-09-01';assert.throws(()=>calculate(s),code('RETROACTIVE_RULE_REQUIRED'));
});

test('official V5 calculation and close retain the verified capture link, economic amount and original origins',async()=>{
 const {officialCloseDetail}=await import('./fixtures/own-payroll-official-close-synthetic.js');
 const {salaryItems}=await import('../assets/native-salary-catalog-model.js');
 const {prepareOwnPayrollRowEmissionApprovedInput}=await import('../lib/own-payroll-approved-input.js');
 const {calculateOwnPayrollWithRowEmission}=await import('../assets/own-payroll-row-emission.js');
 const {verifiedOwnOfficialCapture,buildOwnOfficialCloseSnapshot,verifiedOwnOfficialCloseSnapshot}=await import('../assets/own-payroll-official-snapshot-model.js');
 const detail=officialCloseDetail(),c=detail.captures[0],p=c.payload,d=p.programState.program.definition,extra=adjustmentProgram(['450']);
 d.monthlyDeclaredAdjustmentsVersion=extra.monthlyDeclaredAdjustmentsVersion;d.monthlyDeclaredAdjustmentPolicies=extra.monthlyDeclaredAdjustmentPolicies;
 d.rules.push(...extra.rules);d.bindings.push(...extra.bindings);d.officialTotalsPolicies[0].contributions['995'].push('450');
 const total=d.rules.find(r=>r.code===d.officialTotalsPolicies[0].totalCodes['995']);total.expression={op:'add',left:total.expression,right:{op:'concept',code:'450',stage:'exact'}};
 p.programState.salaryCatalog.items=salaryItems([...p.programState.salaryCatalog.items,...adjustmentSources({codes:['450'],events:[]}).programState.salaryCatalog.items]);
 p.programState.program.definition=ownProgramDefinition(d,p.programState.salaryCatalog.items);
 const b=adjustmentSources({codes:['450'],count:1}).monthly.nativeBatches[0],e=p.population.employees[0];
 for(const entry of b.rows){Object.assign(entry.values,{contractId:e.contractId,legajo:e.employeeNumber,identityToken:e.identityToken});Object.assign(entry.subject,{contractId:e.contractId,legajo:e.employeeNumber,identityToken:e.identityToken});}
 b.rowsSha256=adjustmentHash(b.rows.map(({values,subject})=>({values,subject})));p.monthly.nativeBatches=[...(p.monthly.nativeBatches??[]),b];
 p.sourceInventory.declaredAdjustments=captureDeclaredAdjustmentSources(p.programState.program.definition,p);
 const auditBefore=structuredClone(p.sourceInventory.declaredAdjustments),input=prepareOwnPayrollRowEmissionApprovedInput(p),result=calculateOwnPayrollWithRowEmission(input);
 Object.assign(c.saved,{input,result,inputSha256:adjustmentHash(input),resultSha256:adjustmentHash(result)});c.payloadSha256=adjustmentHash(p);
 for(const row of detail.rows)row.resultSha256=c.saved.resultSha256;
 await verifiedOwnOfficialCapture(c);const closed=buildOwnOfficialCloseSnapshot(detail,{kind:'all',values:[]});await verifiedOwnOfficialCloseSnapshot(closed);
 assert.equal(closed.sources[0].payloadSha256,c.payloadSha256);assert.equal(closed.concepts.find(r=>r.conceptCode==='450').amount,'10.00');
 assert.deepEqual(c.payload.sourceInventory.declaredAdjustments,auditBefore);assert.equal(auditBefore.subtotals[0].byOriginMonth.length,2);
 const changed=structuredClone(c);changed.payload.sourceInventory.declaredAdjustments.subtotals[0].byOriginMonth[0].adjustmentMonth='2026-01-01';changed.payloadSha256=adjustmentHash(changed.payload);
 await assert.rejects(()=>verifiedOwnOfficialCapture(changed));
});
