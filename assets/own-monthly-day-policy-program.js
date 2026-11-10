import {payrollRequire as require} from './own-payroll-exact.js';
import {participationRuleKey} from './own-period-participation-program.js';
import {MONTHLY_DAY_FACTS_VERSION,monthlyDayPolicy} from './own-monthly-day-policy-model.js';
export const ownProgramMonthlyDays=p=>p&&typeof p==='object'&&Object.getOwnPropertyDescriptor(p,'monthlyDaysVersion')?.value===MONTHLY_DAY_FACTS_VERSION;
export const monthlyDayApplies=(p,type)=>ownProgramMonthlyDays(p)&&type==='monthly';
const children=n=>['left','right','value','condition','then','else'].flatMap(k=>n[k]&&typeof n[k]==='object'?[n[k]]:[]);
const inputs=n=>n.op==='input'?[n.key]:children(n).flatMap(inputs);
const references=n=>['concept','auxiliary'].includes(n.op)?[[n.op,n.code]]:children(n).flatMap(references);
export function validateMonthlyDayPolicyProgram(program){
 if(!ownProgramMonthlyDays(program))return;
 monthlyDayPolicy(program.monthlyDaysPolicy);
 require(program.namespaceVersion==='own-payroll-namespaces.v2'&&program.periodParticipation?.version==='own-period-participation.v1','MONTHLY_DAY_PROGRAM_INVALID','Los días mensuales necesitan referencias separadas y tratamiento explícito de las fórmulas.');
 const keys=new Set(program.bindings.filter(b=>b.sourceKind==='monthly_day_fact').map(b=>b.agreementCode+':'+b.key));require(keys.size>0,'MONTHLY_DAY_PROGRAM_INVALID','El programa debe usar sus entradas de días declaradas.');
 const rules=program.rules,day=new Set(rules.filter(r=>inputs(r.expression).some(k=>keys.has(r.agreementCode+':'+k))));let changed=true;
 while(changed){changed=false;for(const r of rules)if(!day.has(r)&&references(r.expression).some(([kind,code])=>rules.some(t=>t.agreementCode===r.agreementCode&&t.code===code&&(t.nature==='auxiliary'?'auxiliary':'concept')===kind&&t.validFrom<=(r.validUntil??'9999-12')&&r.validFrom<=(t.validUntil??'9999-12')&&t.liquidationTypes.some(type=>r.liquidationTypes.includes(type))&&day.has(t)))){day.add(r);changed=true;}}
 for(const r of day){require(r.liquidationTypes.length===1&&r.liquidationTypes[0]==='monthly','MONTHLY_DAY_TYPE_UNSUPPORTED','Sólo una regla mensual puede consumir días mensuales, también por referencias transitivas.');require(program.periodParticipation.treatments.find(t=>t.ruleKey===participationRuleKey(r))?.treatment==='declared_formula','MONTHLY_DAY_DOUBLE_FRACTION','La fórmula que consume días ya declara su proporción; no se agrega otra fracción.');}
}
