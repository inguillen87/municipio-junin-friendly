import {test} from 'node:test';
import assert from 'node:assert/strict';
import {program,bootstrap,command,uid} from './fixtures/own-payroll-program-synthetic.js';
import {ownProgramStructure,ownProgramCommand} from '../assets/own-payroll-program-model.js';
import {requireExactProgramChanges} from '../assets/own-payroll-program-precision.js';
import {prepareProgramWorkspace,programWorkspaceAttempt,changeExpressionOperation} from '../assets/own-payroll-program-workspace-model.js';
import {programError} from '../lib/internal-own-payroll-program.js';
import {calculateOwnPayroll} from '../assets/own-payroll-engine.js';
import {payrollInput} from './fixtures/own-payroll-synthetic.js';
import {exactProgram as terminatingProgram} from './fixtures/own-payroll-exact-program-synthetic.js';
import fs from 'node:fs';
import {buildExactProgramPrecisionInstallation} from '../scripts/lib/exact-program-precision-installation.mjs';

export function exactProgram(){
 const p=program(),walk=n=>{if(n.op==='concept')n.stage='exact';for(const k of ['left','right','value','condition','then','else'])if(n[k]&&typeof n[k]==='object')walk(n[k]);};
 for(const r of p.rules){r.rounding.mode='exact';walk(r.expression);}return p;
}
test('nuevas reglas conservan todas las etapas sin modificar el contenido',()=>{
 const p=exactProgram(),saved=structuredClone(p);assert.equal(requireExactProgramChanges(null,p),p);assert.deepEqual(p,saved);
 const body=prepareProgramWorkspace(bootstrap(),p,'Reglas sintéticas exactas y completas');assert.deepEqual(body.program,p);
});
for(const mode of ['half_up','half_even','toward_zero','floor','ceiling'])test(`rechaza criterio nuevo ${mode} sin cambiar la carga`,()=>{
 const p=exactProgram();p.rules[0].rounding.mode=mode;const saved=structuredClone(p);
 assert.throws(()=>prepareProgramWorkspace(bootstrap(),p,'Reglas sintéticas completas'),e=>e.code==='PROGRAM_PRECISION_REQUIRED');assert.deepEqual(p,saved);
});
test('revisa ramas condicionales y etapas profundas, aunque nunca se elijan al calcular',()=>{
 const p=exactProgram(),leaf={op:'literal',value:'1.00',unit:'money'};
 p.rules[0].expression={op:'choose',condition:{op:'compare',operator:'eq',left:leaf,right:leaf},then:leaf,else:{op:'round',rounding:{mode:'half_even',precision:2},value:leaf}};
 assert.throws(()=>requireExactProgramChanges(null,ownProgramStructure(p)),/resultado exacto/);
 p.rules[0].expression.else.rounding.mode='exact';assert.doesNotThrow(()=>requireExactProgramChanges(null,ownProgramStructure(p)));
});
test('no permite referencias nuevas al resultado cuantizado de otro concepto',()=>{
 const p=exactProgram();p.rules.find(r=>r.code==='110').expression.left.stage='rounded';
 assert.throws(()=>requireExactProgramChanges(null,p),e=>e.code==='PROGRAM_PRECISION_REQUIRED');
});
test('historia idéntica y cierre conservan su criterio; extenderlo o copiarlo exige exactitud',()=>{
 const before=program(),after=structuredClone(before);assert.doesNotThrow(()=>requireExactProgramChanges(before,after));
 after.rules.forEach(r=>r.validUntil='2026-12');assert.doesNotThrow(()=>requireExactProgramChanges(before,after));
 const closed=structuredClone(after);after.rules[0].validUntil=null;assert.throws(()=>requireExactProgramChanges(closed,after));
 after.rules[0].validUntil='2026-12';after.rules.push({...structuredClone(after.rules[0]),agreementCode:'2'});assert.throws(()=>requireExactProgramChanges(before,after));
});
test('clave y cuerpo históricos de un intento no se convierten a otra política',()=>{
 const body=command(),saved=structuredClone(body),attempt=programWorkspaceAttempt(uid(77),body,'Cuenta QA');
 assert.deepEqual(attempt.body,ownProgramCommand(saved));assert.deepEqual(body,saved);assert.equal(attempt.key,uid(77));
});
test('errores SQL de precisión son accionables y no se confunden con indisponibilidad',()=>{
 const e=programError(Error('OWN_PROGRAM_PRECISION_REQUIRED'));assert.equal(e.status,422);assert.equal(e.code,'OWN_PROGRAM_PRECISION_REQUIRED');assert.match(e.message,/Conservamos la carga/);
});
test('controles nuevos eligen exactitud sin cambiar políticas históricas',()=>{
 assert.equal(changeExpressionOperation(null,'concept').stage,'exact');assert.equal(changeExpressionOperation(null,'round').rounding.mode,'exact');
 assert.equal(changeExpressionOperation({op:'concept',code:'1',stage:'rounded'},'concept').stage,'rounded');
});
test('cálculo propio conserva fracciones sin tolerancia ni cambios para cuadrar totales',()=>{
 const p=terminatingProgram(),result=calculateOwnPayroll(payrollInput({rules:p.rules,totalsPrecision:p.totalsPrecision}));
 assert.equal(result.rows.find(r=>r.conceptCode==='110').amount,'12.51250000');
 assert.equal(result.employeeTotals[0].net,'128.63412500');
 assert.throws(()=>calculateOwnPayroll(payrollInput({rules:p.rules,totalsPrecision:2})),e=>e.code==='ROUNDING_NEEDED');
 const nonterminating=exactProgram();assert.throws(()=>calculateOwnPayroll(payrollInput({rules:nonterminating.rules})),e=>e.code==='ROUNDING_NEEDED');
});
test('una regla no exacta en la última página bloquea el conjunto completo',()=>{
 const p=terminatingProgram();p.rules=Array.from({length:120},(_,i)=>({...structuredClone(p.rules[0]),code:String(5000+i)}));p.rules.at(-1).rounding.mode='half_up';
 const before=structuredClone(p);assert.throws(()=>requireExactProgramChanges(null,ownProgramStructure(p)),e=>e.code==='PROGRAM_PRECISION_REQUIRED'&&/5119/.test(e.message));assert.deepEqual(p,before);
});
test('lote técnico acotado y determinista; una fuente diferente impide generarlo',()=>{
 const read=p=>fs.readFileSync(p,'utf8'),args={read,sourceCommit:'a'.repeat(40)},first=buildExactProgramPrecisionInstallation(args),again=buildExactProgramPrecisionInstallation(args);
 assert.deepEqual(first,again);assert.equal(first.connects,false);assert.equal(first.executesSql,false);assert.equal(first.beforePin.signature,first.afterPin.signature);
 assert.notEqual(first.beforePin.sha256,first.afterPin.sha256);assert.deepEqual(first.beforePin.config,first.afterPin.config);
 assert.throws(()=>buildExactProgramPrecisionInstallation({...args,read:p=>read(p).replace('cmd:=body->','cmd :=body->')}),/EXACT_PROGRAM_SOURCE_CHANGED/);
 assert.throws(()=>buildExactProgramPrecisionInstallation({...args,sourceCommit:'rama-sin-commit'}));
});
test('el paquete publica el validador que importa el editor de reglas',()=>{
 assert.match(fs.readFileSync('scripts/build-friendly.mjs','utf8'),/'assets\/own-payroll-program-precision\.js'/);
});
