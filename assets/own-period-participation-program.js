import { salaryExact } from './native-salary-catalog-model.js';
import { payrollRequire as require } from './own-payroll-exact.js';
import { ownPayrollRuleIdentity } from './own-payroll-engine.js';

export const OWN_PARTICIPATION_VERSION = 'own-period-participation.v1';
export const ownProgramParticipation = p => p?.periodParticipation?.version === OWN_PARTICIPATION_VERSION;
export const participationRuleKey = r => [r.agreementCode, ownPayrollRuleIdentity(r, true), r.validFrom, r.liquidationTypes.join(',')].join(':');
const reference = v => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= 3 && v.length <= 180 && !/[<>\u0000-\u001f\u007f]/.test(v);
export function participationPolicy(program) {
 const p = program.periodParticipation;
 require(salaryExact(p, ['version','fullPeriod','fixedValidity','treatments']) && p.version === OWN_PARTICIPATION_VERSION && p.fullPeriod === 'neutral_fraction' && ['reject','declared_values'].includes(p.fixedValidity) && Array.isArray(p.treatments) && p.treatments.length === program.rules.length && Reflect.ownKeys(p.treatments).length === p.treatments.length+1, 'PARTICIPATION_POLICY_REQUIRED', 'Declarar período completo, novedades parciales y tratamiento de todas las reglas es obligatorio.');
 const rules = new Map(program.rules.map(r => [participationRuleKey(r),r])), seen = new Set();
 for (const t of p.treatments) {
  require(salaryExact(t,['ruleKey','treatment','reference']) && typeof t.ruleKey === 'string' && rules.has(t.ruleKey) && !seen.has(t.ruleKey) && ['fraction','declared_formula'].includes(t.treatment) && reference(t.reference), 'PARTICIPATION_POLICY_INVALID', 'Cada regla necesita un único tratamiento documentado para el período parcial.');
  seen.add(t.ruleKey);
  if (t.treatment === 'fraction') {
   const r = rules.get(t.ruleKey);
   require(r.unit === 'money', 'PARTICIPATION_POLICY_INVALID', 'La fracción se aplica expresamente a un resultado monetario.');
   for (const sourceField of ['recognizedUnits','baseUnits']) require(program.bindings.filter(b=>b.agreementCode===r.agreementCode && b.sourceKind==='period_fact' && b.sourceField===sourceField).length===1, 'PARTICIPATION_BINDING_REQUIRED', 'La fracción necesita una entrada única de cantidad reconocida y otra de base en el mismo convenio.');
  }
 }
 return {...p,treatments:p.treatments.map(t=>({...t})).sort((a,b)=>a.ruleKey<b.ruleKey?-1:a.ruleKey>b.ruleKey?1:0)};
}
// Lower an explicit reviewed treatment to existing rational operations. Never
// quantize a coefficient or alter the original formula stored in the program.
export function participationRules(program) {
 if (!ownProgramParticipation(program)) return program.rules;
 const policy = participationPolicy(program), byKey = new Map(policy.treatments.map(t=>[t.ruleKey,t]));
 return program.rules.map(r=>{
  if (byKey.get(participationRuleKey(r)).treatment !== 'fraction') return r;
  const input = sourceField => ({op:'input',unit:'units',key:program.bindings.find(b=>b.agreementCode===r.agreementCode && b.sourceKind==='period_fact' && b.sourceField===sourceField).key});
  return {...r,expression:{op:'multiply',left:r.expression,right:{op:'divide',left:input('recognizedUnits'),right:input('baseUnits')}}};
 });
}
