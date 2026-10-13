import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareProgramScaleReference,applyProgramScaleReference} from '../assets/own-payroll-program-scale-reference-model.js';
import {salaryRowKey,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {prepareProgramWorkspace} from '../assets/own-payroll-program-workspace-model.js';
import {hash,uid} from './fixtures/own-payroll-program-synthetic.js';
import {scaleReferenceFixture} from './fixtures/own-payroll-program-scale-reference-synthetic.js';
import {OWN_PARTICIPATION_VERSION} from '../assets/own-period-participation-program.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';

test('prepara auxiliares de varios convenios con la clase elegida y factor exacto, sin empleados ni valores heredados',()=>{
 const f=scaleReferenceFixture(),before=salarySerialized(f.draft),plan=prepareProgramScaleReference(f.boot,f.draft,f.intent);
 assert.equal(salarySerialized(f.draft),before);assert.equal(plan.program.rules.length,3);assert.equal(plan.program.bindings.length,3);assert.equal(plan.preview.amount,'150.015000');
 for(const r of plan.program.rules){assert.equal(r.nature,'auxiliary');assert.equal(r.unit,'money');assert.deepEqual(r.rounding,{mode:'exact',precision:6});assert.equal(r.expression.right.value,'1.50');}
 for(const b of plan.program.bindings){assert.equal(b.sourceKind,'scale_reference');assert.equal(b.sourceAgreementCode,'1');assert.equal(b.sourceCategoryCode,'3');assert.equal(b.onMissing,'error');assert.equal(b.combine,'single');}
 assert.ok(Object.isFrozen(plan.program.rules[0].expression));assert.deepEqual(applyProgramScaleReference(f.boot,f.draft,plan),plan.program);
 assert.equal(prepareProgramWorkspace(f.boot,plan.program,'Propuesta íntegra sintética de auxiliares').reviewConfirmed,false);
});
test('61 destinos se incluyen íntegros, incluso el último; un destino incompatible rechaza todo',()=>{
 const f=scaleReferenceFixture(Array.from({length:61},(_,i)=>String(i+1))),before=salarySerialized(f.draft),plan=prepareProgramScaleReference(f.boot,f.draft,f.intent);
 assert.equal(plan.program.rules.length,61);assert.ok(plan.program.rules.some(r=>r.agreementCode==='61'));
 f.boot.salaryCatalog.items.find(r=>r.kind==='auxiliary'&&r.agreementCode==='61').validUntil='2026-09';assert.throws(()=>prepareProgramScaleReference(f.boot,f.draft,f.intent));assert.equal(salarySerialized(f.draft),before);
});
test('la clase y su vigencia se eligen sin prolongar, sumar clases o suponer otra fuente',()=>{
 const f=scaleReferenceFixture();for(const patch of [{sourceKey:'missing'},{validFrom:'2026-09'},{validUntil:null},{validUntil:'2026-11'},{targets:['1','1']},{targets:[]},{extra:true}])assert.throws(()=>prepareProgramScaleReference(f.boot,f.draft,{...f.intent,...patch}));
});
test('cero declarado se conserva; factor ausente o precisión insuficiente bloquean sin redondear',()=>{
 const f=scaleReferenceFixture();assert.throws(()=>prepareProgramScaleReference(f.boot,f.draft,{...f.intent,precision:2}));for(const factor of ['',null,'1e2','1,50'])assert.throws(()=>prepareProgramScaleReference(f.boot,f.draft,{...f.intent,factor}));
 f.boot.salaryCatalog.items.find(r=>r.kind==='scale').value='0.000';assert.equal(prepareProgramScaleReference(f.boot,f.draft,f.intent).preview.amount,'0.000000');
});
test('la preparación requiere maestro aprobado, permiso, separación de códigos y precisión expresa',()=>{
 for(const change of [f=>f.boot.salaryCatalog.revision=0,f=>f.boot.permissions.canPropose=false,f=>delete f.draft.namespaceVersion,f=>f.draft.totalsPrecision=null]){const f=scaleReferenceFixture();change(f);assert.throws(()=>prepareProgramScaleReference(f.boot,f.draft,f.intent));}
});
test('cambiar fuente, borrador, plan, permiso o versión invalida la aplicación completa',()=>{
 const f=scaleReferenceFixture(),plan=prepareProgramScaleReference(f.boot,f.draft,f.intent);
 for(const change of [b=>b.scopeVersion=hash('d'),b=>b.program.version=hash('e'),b=>b.salaryCatalog.version=hash('f'),b=>b.salaryCatalog.items[0].label='Descripción modificada',b=>b.permissions.canPropose=false]){const boot=structuredClone(f.boot);change(boot);assert.throws(()=>applyProgramScaleReference(boot,f.draft,plan));}
 const modified=structuredClone(plan);modified.program.rules[0].expression.right.value='2';assert.throws(()=>applyProgramScaleReference(f.boot,f.draft,modified));
});
test('reemplazo explícito cierra la regla anterior sin cambiar su fuente ni borrarla',()=>{
 const f=scaleReferenceFixture(['1']),initial=prepareProgramScaleReference(f.boot,f.draft,f.intent);f.draft=structuredClone(initial.program);f.boot.program.definition=structuredClone(f.draft);f.boot.program.revision=1;f.boot.program.salaryVersion=f.boot.salaryCatalog.version;f.boot.program.proposalId='10000000-0000-4000-8000-000000000080';f.boot.program.approvalId='10000000-0000-4000-8000-000000000081';
 for(const r of f.draft.rules)r.validFrom='2026-09';f.boot.program.definition=structuredClone(f.draft);for(const r of f.boot.salaryCatalog.items)r.validFrom='2026-09';
 const source=f.boot.salaryCatalog.items.find(r=>r.kind==='scale');f.intent.sourceKey=salaryRowKey(source);f.intent.mode='replace';
 const plan=prepareProgramScaleReference(f.boot,f.draft,f.intent);assert.equal(plan.program.rules.length,2);assert.equal(plan.program.rules.find(r=>r.validFrom==='2026-09').validUntil,'2026-09');assert.ok(plan.program.rules.some(r=>r.validFrom==='2026-10'));
 assert.equal(f.draft.rules[0].validUntil,'2026-10');
});
test('valores mayores que2^53 conservan el cálculo exacto y su precisión',()=>{
 const f=scaleReferenceFixture();f.boot.salaryCatalog.items.find(r=>r.kind==='scale').value='9007199254740993.010';
 assert.equal(prepareProgramScaleReference(f.boot,f.draft,f.intent).preview.amount,'13510798882111489.515000');
});
test('un borrador vacío no permite retirar reglas de un programa ya aprobado',()=>{
 const f=scaleReferenceFixture(),plan=prepareProgramScaleReference(f.boot,f.draft,f.intent);f.boot.program.definition=structuredClone(plan.program);f.boot.program.revision=1;f.boot.program.salaryVersion=f.boot.salaryCatalog.version;f.boot.program.proposalId='10000000-0000-4000-8000-000000000080';f.boot.program.approvalId='10000000-0000-4000-8000-000000000081';
 assert.throws(()=>prepareProgramScaleReference(f.boot,f.draft,f.intent),/Conservá las reglas anteriores/);
});
test('los períodos parciales requieren un tratamiento expreso para cada nueva regla',()=>{
 const f=scaleReferenceFixture();f.draft.periodParticipation={version:OWN_PARTICIPATION_VERSION,fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:[]};
 assert.throws(()=>prepareProgramScaleReference(f.boot,f.draft,f.intent),/tratamiento de período parcial/);
 f.intent.periodTreatment={treatment:'declared_formula',reference:'Tratamiento parcial inventado QA'};
 const plan=prepareProgramScaleReference(f.boot,f.draft,f.intent);assert.equal(plan.program.periodParticipation.treatments.length,3);assert.ok(plan.program.periodParticipation.treatments.every(t=>t.treatment==='declared_formula'));
 f.intent.periodTreatment.treatment='fraction';assert.throws(()=>prepareProgramScaleReference(f.boot,f.draft,f.intent),/entrada única/);
});
test('primer programa con fracción declarada conserva y utiliza las fuentes ya elegidas; no las inventa',()=>{
 const f=scaleReferenceFixture(['1']);f.draft.periodParticipation={version:OWN_PARTICIPATION_VERSION,fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:[]};
 f.draft.bindings=['recognizedUnits','baseUnits'].map(sourceField=>({agreementCode:'1',key:sourceField,unit:'units',sourceKind:'period_fact',sourceField,onMissing:'error',combine:'single',ruleReference:'Fuente parcial inventada QA'}));
 f.intent.periodTreatment={treatment:'fraction',reference:'Fracción parcial inventada QA'};
 const plan=prepareProgramScaleReference(f.boot,f.draft,f.intent);assert.equal(plan.program.bindings.length,3);for(const b of f.draft.bindings)assert.deepEqual(plan.program.bindings.find(r=>r.key===b.key),b);
});
test('el adaptador y motor publicados usan la clase de referencia para tres contratos creados sólo en MuniControl',()=>{
 const f=scaleReferenceFixture(),plan=prepareProgramScaleReference(f.boot,f.draft,f.intent),sources=approvedSources(3);
 const complete=structuredClone(plan.program);
 for(const agreementCode of f.intent.targets){
  complete.rules.push({agreementCode,code:'100',nature:'remuneration',unit:'money',validFrom:'2026-10',validUntil:'2026-10',liquidationTypes:['monthly'],ruleReference:'Haber inventado QA desde auxiliar, sin norma municipal',rounding:{mode:'exact',precision:6},expression:{op:'multiply',left:{op:'auxiliary',code:'9000',stage:'exact'},right:{op:'literal',unit:'coefficient',value:'0.10'}}});
  const definition=f.boot.salaryCatalog.items.find(r=>r.kind==='auxiliary'&&r.agreementCode===agreementCode);f.boot.salaryCatalog.items.push({...definition,kind:'concept',nature:'remuneration',code:'100',label:'Haber inventado QA'});
 }
 sources.programState=f.boot;Object.assign(sources.programState.program,{revision:1,definition:ownProgramDefinition(complete,f.boot.salaryCatalog.items),salaryVersion:f.boot.salaryCatalog.version,proposalId:uid(80),approvalId:uid(81)});
 sources.monthly.batches=[];sources.population.employees.forEach((e,i)=>e.agreementCode=f.intent.targets[i]);
 const input=prepareOwnPayrollInput(sources),snapshot=createOwnPayrollSnapshot(input);
 assert.equal(input.employees.length,3);assert.ok(sources.population.employees.every(e=>e.origin==='MUNICONTROL'&&e.categoryCode==='6'));
 assert.ok(input.employees.every(e=>e.inputs[0].value==='100.01000000'&&e.inputs[0].sourceReference.includes(':escala:1:1:3:2026-10:2026-10')));
 assert.equal(snapshot.result.rowCount,6);assert.ok(snapshot.result.rows.filter(r=>r.nature==='auxiliary').every(r=>r.amount==='150.015000'&&r.rounding.mode==='exact'));assert.ok(snapshot.result.rows.filter(r=>r.nature==='remuneration').every(r=>r.amount==='15.001500'));
 assert.equal(snapshot.result.municipalApprovalVerified,false);assert.equal(snapshot.result.paymentExecuted,false);
});
