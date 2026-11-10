// Opt-in consumption of the explicit approved SQL193 declaration, separate
// from SQL192 full-month policy facts and generic157 participation fractions.
import {payrollRequire as require} from './own-payroll-exact.js';
import {participationRuleKey,ownProgramParticipation} from './own-period-participation-program.js';
import {MONTHLY_DAY_DECLARATION_FACTS_VERSION} from './own-monthly-day-declaration-model.js';
export const ownProgramMonthlyDayDeclarations=p=>p&&typeof p==='object'&&Object.getOwnPropertyDescriptor(p,'monthlyDayDeclarationVersion')?.value===MONTHLY_DAY_DECLARATION_FACTS_VERSION;
export const monthlyDayDeclarationsApply=(p,type)=>ownProgramMonthlyDayDeclarations(p)&&type==='monthly';
// A declared_formula treatment is not itself a generic157 input. For opted
// monthly programmes, require157 only when an explicit period_fact consumes it.
// Every predecessor programme keeps its original mandatory157 capture.
export function ownProgramParticipationSourceRequired(program,type){
 if(!ownProgramParticipation(program))return false;
 if(!monthlyDayDeclarationsApply(program,type))return true;
 require(Array.isArray(program.bindings),'MONTHLY_DECLARED_DAYS_PROGRAM_INVALID','No se verificaron las entradas completas del programa de días.');
 return program.bindings.some(b=>b.sourceKind==='period_fact');
}
const children=n=>['left','right','value','condition','then','else'].flatMap(k=>n[k]&&typeof n[k]==='object'?[n[k]]:[]);
const inputs=n=>n.op==='input'?[n.key]:children(n).flatMap(inputs);
const references=n=>['concept','auxiliary'].includes(n.op)?[[n.op,n.code]]:children(n).flatMap(references);
export function validateMonthlyDayDeclarationProgram(program){
 if(!ownProgramMonthlyDayDeclarations(program))return;
 require(program.namespaceVersion==='own-payroll-namespaces.v2'&&program.periodParticipation?.version==='own-period-participation.v1','MONTHLY_DECLARED_DAYS_PROGRAM_INVALID','Los días declarados necesitan referencias separadas y tratamiento explícito de todas las fórmulas.');
 const keys=new Set(program.bindings.filter(b=>b.sourceKind==='monthly_day_declaration_fact').map(b=>b.agreementCode+':'+b.key));
 require(keys.size>0,'MONTHLY_DECLARED_DAYS_PROGRAM_INVALID','El programa debe consumir sus entradas de días declaradas.');
 const rules=program.rules,day=new Set(rules.filter(r=>inputs(r.expression).some(k=>keys.has(r.agreementCode+':'+k))));let changed=true;
 while(changed){changed=false;for(const r of rules)if(!day.has(r)&&references(r.expression).some(([kind,code])=>rules.some(t=>t.agreementCode===r.agreementCode&&t.code===code&&(t.nature==='auxiliary'?'auxiliary':'concept')===kind&&t.validFrom<=(r.validUntil??'9999-12')&&r.validFrom<=(t.validUntil??'9999-12')&&t.liquidationTypes.some(type=>r.liquidationTypes.includes(type))&&day.has(t)))){day.add(r);changed=true;}}
 for(const r of day){
  require(r.liquidationTypes.length===1&&r.liquidationTypes[0]==='monthly','MONTHLY_DECLARED_DAYS_TYPE_UNSUPPORTED','Sólo las fórmulas mensuales pueden consumir días declarados, también por referencias transitivas.');
  require(program.periodParticipation.treatments.find(t=>t.ruleKey===participationRuleKey(r))?.treatment==='declared_formula','MONTHLY_DECLARED_DAYS_DOUBLE_FRACTION','La fórmula que ya consume días declarados no admite otra fracción implícita.');
 }
}
