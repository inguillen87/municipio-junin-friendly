import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareProgramCopy, applyProgramCopy } from '../assets/own-payroll-program-copy-model.js';
import { ownProgramRuleKey, ownProgramDefinition } from '../assets/own-payroll-program-model.js';
import { prepareProgramWorkspace, programWorkspaceChanges } from '../assets/own-payroll-program-workspace-model.js';
import { calculateOwnPayroll } from '../assets/own-payroll-engine.js';
import { bootstrap, uid, hash } from './fixtures/own-payroll-program-synthetic.js';
import { copyFixture } from './fixtures/own-payroll-program-copy-synthetic.js';

test('copia varios convenios con fórmula, naturaleza, unidad, etapas y redondeo exactos; no muta ni aprueba',()=>{
  const {boot,draft,intent}=copyFixture(),before=structuredClone(draft),plan=prepareProgramCopy(boot,draft,intent);
  assert.deepEqual(draft,before);assert.equal(plan.program.rules.length,3);assert.equal(plan.program.totalsPrecision,2);
  for(const r of plan.program.rules.filter(r=>r.agreementCode!=='1')) {assert.deepEqual(r.expression,draft.rules[0].expression);assert.deepEqual(r.rounding,draft.rules[0].rounding);assert.equal(r.nature,'deduction');assert.equal(r.validFrom,'2026-10');assert.equal(r.ruleReference,intent.ruleReference);}
  assert.ok(Object.isFrozen(plan.program.rules[2].expression));assert.deepEqual(applyProgramCopy(boot,draft,plan),plan.program);
  assert.throws(()=>prepareProgramWorkspace(boot,applyProgramCopy(boot,draft,plan),'Propuesta sintética de varios convenios'),e=>e.code==='PROGRAM_PRECISION_REQUIRED');
  assert.deepEqual(draft,before,'la copia histórica no se transforma para sortear el control de reglas nuevas');
});
test('copia exacta expresamente preparada permite revisión sin redondear la fracción',()=>{
 const f=copyFixture();f.draft.rules[0].rounding={precision:3,mode:'exact'};const plan=prepareProgramCopy(f.boot,f.draft,f.intent);
 const body=prepareProgramWorkspace(f.boot,applyProgramCopy(f.boot,f.draft,plan),'Propuesta sintética exacta de varios convenios');
 assert.equal(body.reviewConfirmed,false);assert.equal(body.command,'propose');assert.ok(body.program.rules.every(r=>r.expression.value==='17.125'&&r.rounding.mode==='exact'));
});
test('cierre expresamente elegido conserva todas las claves anteriores y empieza una versión nueva',()=>{
  const f=copyFixture();f.draft.rules.push({...structuredClone(f.draft.rules[0]),agreementCode:'2'});f.boot.program.definition=structuredClone(f.draft);f.intent.targets=['2'];f.intent.mode='replace';
  const plan=prepareProgramCopy(f.boot,f.draft,f.intent);assert.equal(plan.program.rules.length,3);assert.equal(plan.program.rules.find(r=>r.agreementCode==='2'&&r.validFrom==='2026-01').validUntil,'2026-09');assert.ok(plan.program.rules.some(r=>r.agreementCode==='2'&&r.validFrom==='2026-10'));
  const diff=programWorkspaceChanges(f.draft,plan.program);assert.equal(diff.rows.filter(r=>r.status==='modified').length,1);assert.equal(diff.rows.filter(r=>r.status==='added').length,1);
});
test('cruce de año cierra en diciembre sin reconstruir ni borrar historial',()=>{
  const f=copyFixture();f.draft.rules.push({...structuredClone(f.draft.rules[0]),agreementCode:'2'});f.intent.targets=['2'];f.intent.mode='replace';f.intent.validFrom='2027-01';
  assert.equal(prepareProgramCopy(f.boot,f.draft,f.intent).program.rules.find(r=>r.agreementCode==='2'&&r.validFrom==='2026-01').validUntil,'2026-12');
});
test('un destino incompatible impide todo el conjunto y conserva el borrador',()=>{
  const f=copyFixture(),before=structuredClone(f.draft);f.boot.salaryCatalog.items.find(i=>i.agreementCode==='4').nature='remuneration';
  assert.throws(()=>prepareProgramCopy(f.boot,f.draft,f.intent),/definición aprobada compatible/);assert.deepEqual(f.draft,before);
});
test('regla ausente, destino repetido/origen, fecha/respaldo/campos inválidos bloquean',()=>{
  const f=copyFixture();for(const patch of [{sourceKey:'missing'},{targets:['2','2']},{targets:['1']},{targets:[]},{validFrom:'2026-13'},{validUntil:'2026-09'},{ruleReference:'=x'},{mode:'silently_replace'},{extra:true}])assert.throws(()=>prepareProgramCopy(f.boot,f.draft,{...f.intent,...patch}));
});
test('solapamiento, mismo inicio, tipos diferentes y reemplazo sin anterior no se resuelven automáticamente',()=>{
  const f=copyFixture();f.intent.targets=['2'];assert.throws(()=>prepareProgramCopy(f.boot,f.draft,{...f.intent,mode:'replace'}),/única regla previa/);
  f.draft.rules.push({...structuredClone(f.draft.rules[0]),agreementCode:'2'});assert.throws(()=>prepareProgramCopy(f.boot,f.draft,f.intent),/Ya existe/);
  assert.throws(()=>prepareProgramCopy(f.boot,f.draft,{...f.intent,mode:'replace',validFrom:'2026-01'}),/inicio posterior/);
  f.draft.rules[1].liquidationTypes=['monthly','sac'];assert.throws(()=>prepareProgramCopy(f.boot,f.draft,{...f.intent,mode:'replace'}),/mismos tipos/);
});
test('programa, catálogo, alcance o borrador cambiados invalidan la revisión',()=>{
  const f=copyFixture(),plan=prepareProgramCopy(f.boot,f.draft,f.intent);
  for(const edit of [b=>b.program.version=hash('d'),b=>b.salaryCatalog.version=hash('e'),b=>b.scopeVersion=hash('f')]){const b=structuredClone(f.boot);edit(b);assert.throws(()=>applyProgramCopy(b,f.draft,plan),/Cambió/);}
  const changed=structuredClone(f.draft);changed.rules[0].expression.value='0';assert.throws(()=>applyProgramCopy(f.boot,changed,plan),/Cambió/);
  const altered=structuredClone(plan);altered.program.rules[1].expression.value='0';assert.throws(()=>applyProgramCopy(f.boot,f.draft,altered),/Cambió/);
  const alteredCatalog=structuredClone(f.boot);alteredCatalog.salaryCatalog.items[0].label='Otra definición sin versión nueva';assert.throws(()=>applyProgramCopy(alteredCatalog,f.draft,plan),/Cambió/);
  f.boot.permissions.canPropose=false;assert.throws(()=>applyProgramCopy(f.boot,f.draft,plan),/no permite/);
});
test('más de una página de destinos se copian íntegros y la revisión conserva los anteriores',()=>{
  const targets=Array.from({length:61},(_,i)=>String(i+2)),f=copyFixture(targets),plan=prepareProgramCopy(f.boot,f.draft,f.intent);
  assert.equal(plan.program.rules.length,62);assert.equal(programWorkspaceChanges(f.draft,plan.program).rows.length,62);assert.equal(plan.program.rules.filter(r=>r.agreementCode!=='1').length,61);
});
test('la capacidad se rechaza globalmente sin truncar destinos ni reglas',()=>{
  const f=copyFixture();f.intent.targets=Array.from({length:1001},(_,i)=>String(i+2));assert.throws(()=>prepareProgramCopy(f.boot,f.draft,f.intent));assert.equal(f.draft.rules.length,1);
});
test('no acepta huecos o propiedades adicionales en los destinos',()=>{
  const f=copyFixture(),sparse=Array(1),extra=['2'];extra.metadata=true;
  for(const targets of [sparse,extra])assert.throws(()=>prepareProgramCopy(f.boot,f.draft,{...f.intent,targets}));
});
test('copia entradas necesarias exactas, reutiliza sólo las idénticas y bloquea fuentes diferentes',()=>{
  const f=copyFixture();f.intent.targets=['2'];f.draft.rules[0].expression={op:'input',unit:'money',key:'value'};
  const binding={agreementCode:'1',key:'value',unit:'money',sourceKind:'parameter',sourceCode:'606',onMissing:'error',combine:'single',ruleReference:'Fuente sintética explícita QA'};f.draft.bindings=[binding];
  for(const i of f.boot.salaryCatalog.items)i.value='10.00';
  const plan=prepareProgramCopy(f.boot,f.draft,f.intent);assert.equal(plan.program.bindings.length,2);assert.deepEqual(plan.program.bindings[1],{...binding,agreementCode:'2'});
  f.draft.bindings.push({...binding,agreementCode:'2',ruleReference:'Otro respaldo explícito QA'});f.draft.rules.push({...structuredClone(f.draft.rules[0]),code:'607',agreementCode:'2'});f.boot.salaryCatalog.items.push({...f.boot.salaryCatalog.items[1],code:'607'});
  assert.throws(()=>prepareProgramCopy(f.boot,f.draft,f.intent),/entrada value es diferente/);
  f.draft.bindings[1].ruleReference=binding.ruleReference;assert.equal(prepareProgramCopy(f.boot,f.draft,f.intent).program.bindings.length,2);
});
test('no copia dependencias automáticamente; exige reglas y unidades propias compatibles en cada destino',()=>{
  const f=copyFixture();const dep={...structuredClone(f.draft.rules[0]),code:'607'};f.draft.rules.push(dep);f.draft.rules[0].expression={op:'concept',code:'607',stage:'rounded'};f.boot.salaryCatalog.items.push({...f.boot.salaryCatalog.items[0],code:'607'});
  assert.throws(()=>prepareProgramCopy(f.boot,f.draft,f.intent),/regla referenciada vigente/);
  for(const target of f.intent.targets){f.draft.rules.push({...structuredClone(dep),agreementCode:target});f.boot.salaryCatalog.items.push({...f.boot.salaryCatalog.items[0],code:'607',agreementCode:target});}
  assert.equal(prepareProgramCopy(f.boot,f.draft,f.intent).program.rules.length,6);
});
test('las copias validadas se ejecutan en el motor propio exacto con entradas sintéticas, sin texto GRH',()=>{
  const f=copyFixture();for(const agreementCode of ['1','2','4']){f.draft.rules.push({...structuredClone(f.draft.rules[0]),agreementCode,code:'100',nature:'remuneration',expression:{op:'literal',unit:'money',value:'100.00'}});f.boot.salaryCatalog.items.push({...f.boot.salaryCatalog.items[0],agreementCode,code:'100',nature:'remuneration'});}const plan=prepareProgramCopy(f.boot,f.draft,f.intent);ownProgramDefinition(plan.program,f.boot.salaryCatalog.items);
  const result=calculateOwnPayroll({version:'own-payroll-input.v1',period:'2026-10',liquidationType:'monthly',selection:{kind:'all',values:[]},sourceVersions:{population:hash('a'),rules:hash('b'),novelties:hash('c')},populationComplete:true,totalsPrecision:2,
    employees:['1','2','4'].map((agreementCode,i)=>({contractId:uid(i+1),employeeNumber:String(200+i),agreementCode,departmentCode:'1',inputs:[]})),rules:plan.program.rules});
  assert.equal(result.rows.length,6);assert.ok(result.rows.filter(r=>r.conceptCode==='606').every(r=>r.amount==='17.12'));assert.ok(result.employeeTotals.every(t=>t.deduction==='17.12'&&t.net==='82.88'));
});
