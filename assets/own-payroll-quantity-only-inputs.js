// Explicit source contract for quantities owned by a payable concept.
// No programme opts in implicitly, and this contract does not replace a formula.
import {salaryExact,salaryHash,salarySerialized} from './native-salary-catalog-model.js';
import {payrollRequire as require,decimal} from './own-payroll-exact.js';
import {participationRules} from './own-period-participation-program.js';
import {policyCode,policyMonth,requirePolicyScope,requirePolicyDeclaration,resolvePolicySuccession,resolvedPolicyAppliesTo,policyBoundaryMonths} from './own-payroll-policy-validity.js';
import {OWN_MONTHLY_FORCED_AMOUNT_V2_VERSION,resolveMonthlyForcedPolicies} from './own-payroll-monthly-forced-amounts.js';

export const OWN_QUANTITY_ONLY_INPUTS_VERSION='own-quantity-only-inputs.v1';
const programFields=['quantityOnlyInputsVersion','quantityOnlyInputPolicies'];
const fields=['policyId','supersedes','agreementCode','validFrom','validUntil','liquidationType','sourceCode','quantityInputKey','quantityUnit','sourceKind','sourceContracts','amountPolicy','forcedPolicy','otherChannelPolicy','adjustmentMonthPolicy','absencePolicy','sourceSha256','ruleReference'];
const contracts={monthly_quantity:['own-payroll-novelty-batch.v1','payroll-novelty-batch.v2'],fixed_quantity:['payroll-fixed-export.v1']};
const units=['money','days','hours','minutes','units','percent','coefficient'];
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const present=p=>programFields.some(k=>Object.hasOwn(p??{},k));
const scope=p=>[p.agreementCode,p.liquidationType,p.sourceCode].join(':');
const active=(r,p,period)=>r.agreementCode===p.agreementCode&&r.validFrom<=period&&(r.validUntil===null||period<=r.validUntil)&&r.liquidationTypes.includes(p.liquidationType);
const key=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v);
const text=v=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=3&&v.length<=180&&!/[<>\u0000-\u001f\u007f]/.test(v);
const uses=(node,input)=>node&&typeof node==='object'&&((['input','match'].includes(node.op)&&node.key===input)||['left','right','value','condition','then','else'].some(k=>uses(node[k],input)));
export const quantityOnlyProgramFields=p=>present(p)?[...programFields]:[];
export const quantityOnlyScope=scope;

export function normalizeQuantityOnlyPolicies(raw){
 require(salaryExact(raw,['version','policies'])&&raw.version===OWN_QUANTITY_ONLY_INPUTS_VERSION&&Array.isArray(raw.policies)&&raw.policies.length>0&&raw.policies.length<=128&&Reflect.ownKeys(raw.policies).length===raw.policies.length+1,'QUANTITY_ONLY_CONTRACT_INVALID','Declarar versión y políticas completas para las entradas de cantidad.');
 const policies=raw.policies.map(p=>{
  require(salaryExact(p,fields),'QUANTITY_ONLY_CONTRACT_INVALID','La política tiene campos ausentes o no admitidos.');
  requirePolicyScope(p);requirePolicyDeclaration(p);
  require(p.liquidationType==='monthly'&&policyCode(p.sourceCode)&&key(p.quantityInputKey)&&units.includes(p.quantityUnit)&&Object.hasOwn(contracts,p.sourceKind)&&same(p.sourceContracts,contracts[p.sourceKind])&&p.amountPolicy==='absent_or_zero'&&p.forcedPolicy==='reject'&&p.otherChannelPolicy==='reject'&&p.adjustmentMonthPolicy==='absent_or_current_month'&&p.absencePolicy==='zero_only_after_existing_complete_capture'&&salaryHash(p.sourceSha256)&&text(p.ruleReference),'QUANTITY_ONLY_CONTRACT_INVALID','Revisar canal, unidad de cantidad, importe, Forzado, vigencia y respaldo.');
  return structuredClone(p);
 });
 resolvePolicySuccession(policies,{identity:p=>p.policyId,scope});
 return{version:OWN_QUANTITY_ONLY_INPUTS_VERSION,policies};
}

export function normalizeQuantityOnlyProgram(programme){
 if(!present(programme))return{};
 require(programme.namespaceVersion==='own-payroll-namespaces.v2','QUANTITY_ONLY_CONTRACT_INVALID','La política requiere referencias separadas de conceptos y auxiliares.');
 const normalized=normalizeQuantityOnlyPolicies({version:programme.quantityOnlyInputsVersion,policies:programme.quantityOnlyInputPolicies});
 const rules=participationRules(programme),phases=programme.quantityPhases??[];
 const forced=programme.monthlyForcedAmountsVersion===OWN_MONTHLY_FORCED_AMOUNT_V2_VERSION?resolveMonthlyForcedPolicies(programme.monthlyForcedAmountPolicies):(programme.monthlyForcedAmountPolicies??[]).map(policy=>({policy,validFrom:policy.period,validUntil:policy.period}));
 for(const entry of resolvePolicySuccession(normalized.policies,{identity:p=>p.policyId,scope})){
  const p=entry.policy,related=[...rules,...phases].filter(r=>r.agreementCode===p.agreementCode&&r.liquidationTypes.includes(p.liquidationType));
  const bindings=programme.bindings.filter(b=>b.agreementCode===p.agreementCode&&b.sourceCode===p.sourceCode&&/^(monthly|fixed)_/.test(b.sourceKind));
  require(bindings.length===1&&bindings[0].key===p.quantityInputKey&&bindings[0].sourceKind===p.sourceKind&&bindings[0].unit===p.quantityUnit&&bindings[0].combine==='sum'&&bindings[0].onMissing==='zero','QUANTITY_ONLY_BINDING_REQUIRED','La cantidad requiere una entrada exacta y no puede coexistir con otra interpretación del mismo código.');
  for(const month of policyBoundaryMonths(entry,related)){
   const owners=rules.filter(r=>active(r,p,month)&&r.code===p.sourceCode&&r.nature!=='auxiliary');
   require(owners.length===1&&owners[0].unit==='money','QUANTITY_ONLY_OWNER_REQUIRED','Debe existir un único concepto monetario vigente; esta política no crea su fórmula.');
   require(related.some(r=>active(r,p,month)&&uses(r.expression,p.quantityInputKey)),'QUANTITY_ONLY_CONSUMER_REQUIRED','Una regla o cantidad vigente debe consumir la entrada declarada.');
  }
  require(!forced.some(f=>f.policy.agreementCode===p.agreementCode&&f.policy.sourceCode===p.sourceCode&&f.policy.liquidationType===p.liquidationType&&(f.validUntil===null||f.validUntil>=entry.validFrom)&&(entry.validUntil===null||f.validFrom<=entry.validUntil)),'QUANTITY_ONLY_POLICY_COLLISION','Un importe forzado no puede reemplazar esta cantidad durante la misma vigencia.');
  require(!(programme.monthlyDeclaredAdjustmentPolicies??[]).some(f=>f.agreementCode===p.agreementCode&&f.sourceCode===p.sourceCode&&f.liquidationType===p.liquidationType&&(f.validUntil===null||f.validUntil>=entry.validFrom)&&(entry.validUntil===null||entry.validUntil>=f.validFrom)),'QUANTITY_ONLY_POLICY_COLLISION','El mismo código no admite a la vez importe declarado y sólo cantidad.');
 }
 return{quantityOnlyInputsVersion:normalized.version,quantityOnlyInputPolicies:normalized.policies};
}

export function quantityOnlyProgramHistory(before,after){
 if(!present(before))return;
 require(present(after),'PROGRAM_HISTORY_REQUIRED','Conservar las políticas de cantidad ya revisadas.');
 const old=normalizeQuantityOnlyPolicies({version:before.quantityOnlyInputsVersion,policies:before.quantityOnlyInputPolicies}),next=normalizeQuantityOnlyPolicies({version:after.quantityOnlyInputsVersion,policies:after.quantityOnlyInputPolicies});
 require(old.policies.every(p=>next.policies.some(n=>same(p,n))),'PROGRAM_HISTORY_REQUIRED','Las decisiones anteriores se conservan completas; el cambio debe declarar una sucesión.');
}

export function quantityOnlySourceResolver(programme){
 const options=normalizeQuantityOnlyProgram(programme),policies=options.quantityOnlyInputPolicies??[];
 const resolved=policies.length?resolvePolicySuccession(policies,{identity:p=>p.policyId,scope}):[];
 return({row,family,agreementCode,period,liquidationType,sourceContract})=>{
  if(!resolved.length)return null;
  require(policyMonth(period)&&policyCode(agreementCode)&&row&&typeof row==='object','QUANTITY_ONLY_SCOPE_INVALID','La entrada debe conservar el alcance de su captura.');
  const entries=resolved.filter(e=>e.policy.sourceCode===row.conceptSourceId&&resolvedPolicyAppliesTo(e,{period,liquidationType,agreementCode}));
  if(!entries.length){
   require(!resolved.some(e=>e.policy.agreementCode===agreementCode&&e.policy.sourceCode===row.conceptSourceId),'QUANTITY_ONLY_POLICY_REQUIRED','El código no tiene política de cantidad vigente para este período y tipo.');
   return null;
  }
  require(entries.length===1,'QUANTITY_ONLY_POLICY_AMBIGUOUS','La entrada tiene más de una política de cantidad.');
  const p=entries[0].policy;
  require(family===p.sourceKind.split('_')[0],'QUANTITY_ONLY_CHANNEL_INCOMPATIBLE','La novedad proviene de un canal distinto al declarado; no se omite.');
  require(p.sourceContracts.includes(sourceContract),'QUANTITY_ONLY_SOURCE_CONTRACT_INVALID','Conservar el contrato original completo del canal.');
  require(row.forced===false,'QUANTITY_ONLY_FORCED_INCOMPATIBLE','Forzado no tiene interpretación monetaria en esta política de cantidad.');
  require(row.amountCents===null||row.amountCents==='0','QUANTITY_ONLY_AMOUNT_INCOMPATIBLE','La fórmula consume cantidad y la fuente declara un importe sin tratamiento; corregí el importe.');
  require(typeof row.quantityDecimal==='string'&&/^-?(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/.test(row.quantityDecimal)&&!/^-0(?:\.0+)?$/.test(row.quantityDecimal),'QUANTITY_ONLY_QUANTITY_REQUIRED','Una fila existente necesita cantidad informada; nulo no equivale a ausencia.');
  decimal(row.quantityDecimal);
  require(family!=='monthly'||row.adjustmentMonth===null||row.adjustmentMonth===period+'-01','QUANTITY_ONLY_ORIGIN_INCOMPATIBLE','Una cantidad de otro mes requiere una decisión propia de retroactividad.');
  return p;
 };
}
