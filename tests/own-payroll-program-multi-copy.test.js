import test from 'node:test';import assert from 'node:assert/strict';
import {prepareProgramCopies,applyProgramCopy} from '../assets/own-payroll-program-copy-model.js';
import {ownProgramRuleKey} from '../assets/own-payroll-program-model.js';
import {multiCopyFixture as fixture} from './fixtures/own-payroll-program-copy-synthetic.js';
import {calculateOwnPayroll} from '../assets/own-payroll-engine.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';
test('copia cuatro fórmulas a todos los convenios en un conjunto, conservando expresión, unidad, tipos y redondeo',()=>{
 const f=fixture(),before=structuredClone(f.draft),plan=prepareProgramCopies(f.boot,f.draft,f.intent);assert.deepEqual(f.draft,before);assert.equal(plan.program.rules.length,12);
 for(const source of before.rules)for(const agreementCode of f.intent.targets)assert.deepEqual(plan.program.rules.find(r=>r.code===source.code&&r.agreementCode===agreementCode),{...source,agreementCode,validFrom:'2026-10',ruleReference:f.intent.ruleReference});
 assert.deepEqual(applyProgramCopy(f.boot,f.draft,plan),plan.program);assert.ok(Object.isFrozen(plan.program));assert.ok(Object.isFrozen(plan.intent.sourceKeys));
});
test('las dependencias elegidas explícitamente se validan juntas, aunque la dependiente aparezca primero',()=>{
 const f=fixture();f.draft.rules[0].expression={op:'concept',code:'607',stage:'rounded'};f.boot.program.definition=structuredClone(f.draft);
 const plan=prepareProgramCopies(f.boot,f.draft,f.intent);assert.equal(plan.program.rules.length,12);assert.deepEqual(plan.program.rules.find(r=>r.code==='606'&&r.agreementCode==='2').expression,f.draft.rules[0].expression);
});
test('una dependencia no seleccionada ni existente en destino rechaza todo sin agregarla implícitamente',()=>{
 const f=fixture();f.draft.rules[0].expression={op:'concept',code:'607',stage:'rounded'};f.boot.program.definition=structuredClone(f.draft);f.intent.sourceKeys=[ownProgramRuleKey(f.draft.rules[0])];const before=structuredClone(f.draft);
 assert.throws(()=>prepareProgramCopies(f.boot,f.draft,f.intent),/regla referenciada vigente/);assert.deepEqual(f.draft,before);
});
test('cierre conjunto conserva las cuatro versiones previas de cada destino con el mes anterior exacto',()=>{
 const f=fixture();for(const agreementCode of f.intent.targets)for(const source of [...f.draft.rules].filter(r=>r.agreementCode==='1'))f.draft.rules.push({...structuredClone(source),agreementCode});f.boot.program.definition=structuredClone(f.draft);f.intent.mode='replace';f.intent.validFrom='2027-01';
 const plan=prepareProgramCopies(f.boot,f.draft,f.intent);assert.equal(plan.program.rules.length,20);assert.equal(plan.program.rules.filter(r=>r.agreementCode!=='1'&&r.validUntil==='2026-12').length,8);assert.equal(plan.program.rules.filter(r=>r.validFrom==='2027-01').length,8);
});
test('un convenio con un concepto incompatible impide el conjunto entero, sin modificar el borrador',()=>{
 const f=fixture(),before=structuredClone(f.draft);f.boot.salaryCatalog.items.find(i=>i.agreementCode==='4'&&i.code==='550').nature='remuneration';assert.throws(()=>prepareProgramCopies(f.boot,f.draft,f.intent),/definición aprobada compatible/);assert.deepEqual(f.draft,before);
});
test('una superposición en la última fórmula impide todas las copias',()=>{
 const f=fixture();f.draft.rules.push({...structuredClone(f.draft.rules.at(-1)),agreementCode:'4'});f.boot.program.definition=structuredClone(f.draft);const before=structuredClone(f.draft);assert.throws(()=>prepareProgramCopies(f.boot,f.draft,f.intent),/Ya existe/);assert.deepEqual(f.draft,before);
});
test('rechaza selección duplicada, vacía, desconocida, dispersa o con campos extra; no confunde una con varias',()=>{
 const f=fixture(),sparse=Array(2),extra=[f.intent.sourceKeys[0]];extra.hidden=true;
 for(const sourceKeys of [[],['missing'],[f.intent.sourceKeys[0],f.intent.sourceKeys[0]],sparse,extra])assert.throws(()=>prepareProgramCopies(f.boot,f.draft,{...f.intent,sourceKeys}));
 assert.throws(()=>prepareProgramCopies(f.boot,f.draft,{...f.intent,sourceKey:f.intent.sourceKeys[0]}));assert.throws(()=>prepareProgramCopies(f.boot,f.draft,{...f.intent,extra:true}));
});
test('ningún origen seleccionado puede ser convenio destino',()=>{
 const f=fixture();f.draft.rules.push({...structuredClone(f.draft.rules[0]),code:'608',agreementCode:'2'});f.boot.salaryCatalog.items.push({...f.boot.salaryCatalog.items[0],code:'608',agreementCode:'2'});f.boot.program.definition=structuredClone(f.draft);f.intent.sourceKeys.push(ownProgramRuleKey(f.draft.rules.at(-1)));assert.throws(()=>prepareProgramCopies(f.boot,f.draft,f.intent),/origen/);
});
test('fórmulas del mismo concepto hacia el mismo destino no se resuelven tomando la primera',()=>{
 const f=fixture();f.draft.rules.push({...structuredClone(f.draft.rules[0]),validFrom:'2027-01'});f.draft.rules[0].validUntil='2026-12';f.boot.program.definition=structuredClone(f.draft);f.intent.sourceKeys=f.draft.rules.map(ownProgramRuleKey);assert.throws(()=>prepareProgramCopies(f.boot,f.draft,f.intent));
});
test('fuentes compartidas se copian una vez por destino y jamás se sobrescriben',()=>{
 const f=fixture();for(const rule of f.draft.rules)rule.expression={op:'input',unit:'money',key:'value'};
 f.draft.bindings=[{agreementCode:'1',key:'value',unit:'money',sourceKind:'parameter',sourceCode:'606',onMissing:'error',combine:'single',ruleReference:'Fuente sintética común explícita'}];for(const item of f.boot.salaryCatalog.items)if(item.code==='606')item.value='10.00';f.boot.program.definition=structuredClone(f.draft);
 assert.equal(prepareProgramCopies(f.boot,f.draft,f.intent).program.bindings.length,3);
 f.draft.bindings.push({...f.draft.bindings[0],agreementCode:'2',ruleReference:'Fuente distinta expresamente declarada'});f.draft.rules.push({...structuredClone(f.draft.rules[0]),code:'999',agreementCode:'2'});f.boot.salaryCatalog.items.push({...f.boot.salaryCatalog.items[0],agreementCode:'2',code:'999'});f.boot.program.definition=structuredClone(f.draft);assert.throws(()=>prepareProgramCopies(f.boot,f.draft,f.intent),/entrada value es diferente/);
});
test('las cuatro fórmulas alcanzan los 61 convenios completos',()=>{
 const f=fixture(Array.from({length:61},(_,i)=>String(i+2)));assert.equal(prepareProgramCopies(f.boot,f.draft,f.intent).program.rules.length,248);
});
test('el conjunto copiado se calcula exactamente para empleados sintéticos de cada convenio',()=>{
 const f=fixture();for(const agreementCode of ['1','2','4']){f.draft.rules.push({...structuredClone(f.draft.rules[0]),agreementCode,code:'100',nature:'remuneration',expression:{op:'literal',unit:'money',value:'10000.00'}});f.boot.salaryCatalog.items.push({...f.boot.salaryCatalog.items[0],agreementCode,code:'100',nature:'remuneration'});}
 const plan=prepareProgramCopies(f.boot,f.draft,f.intent),result=calculateOwnPayroll({version:'own-payroll-input.v1',period:'2026-10',liquidationType:'monthly',selection:{kind:'all',values:[]},sourceVersions:{population:hash('a'),rules:hash('b'),novelties:hash('c')},populationComplete:true,totalsPrecision:2,employees:['1','2','4'].map((agreementCode,i)=>({contractId:uid(i+1),employeeNumber:String(200+i),agreementCode,departmentCode:'1',inputs:[]})),rules:plan.program.rules});
 assert.equal(result.rows.length,15);for(const code of ['606','607','612','550'])assert.ok(result.rows.filter(r=>r.conceptCode===code).every(r=>r.amount===code+'.12'));assert.ok(result.employeeTotals.every(t=>t.deduction==='2375.48'&&t.net==='7624.52'));
});
test('el límite de reglas es global: no devuelve un programa parcial',()=>{
 const f=fixture(Array.from({length:248},(_,i)=>String(i+2)));f.draft.rules.push({...structuredClone(f.draft.rules[0]),liquidationTypes:['sac']});f.boot.program.definition=structuredClone(f.draft);f.intent.sourceKeys=f.draft.rules.map(ownProgramRuleKey);const before=structuredClone(f.draft);assert.throws(()=>prepareProgramCopies(f.boot,f.draft,f.intent),{code:'QUANTITY_LIMIT'});assert.deepEqual(f.draft,before);
});
test('editar la selección o el resultado, cambiar catálogo o revocar preparación invalida el plan completo',()=>{
 const f=fixture(),plan=prepareProgramCopies(f.boot,f.draft,f.intent);
 for(const mutate of [p=>p.intent.sourceKeys.pop(),p=>p.intent.targets.pop(),p=>p.program.rules[4].expression.value='0']){const changed=structuredClone(plan);mutate(changed);assert.throws(()=>applyProgramCopy(f.boot,f.draft,changed));}
 const other=structuredClone(f.boot);other.salaryCatalog.items[0].label='Cambio del catálogo sin nueva versión';assert.throws(()=>applyProgramCopy(other,f.draft,plan),/Cambió/);f.boot.permissions.canPropose=false;assert.throws(()=>applyProgramCopy(f.boot,f.draft,plan),/no permite/);
});
