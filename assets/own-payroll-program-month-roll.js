// «Preparar el mes siguiente» para el programa de liquidación. Sólo propone: el resultado pasa por las mismas
// validaciones de definición e historial y por la aprobación independiente de siempre.
// Lo que vencía en el mes cerrado sigue vigente sin fecha de fin, por sucesión explícita:
// - reglas y fases de cantidad cuyo fin era ese mes quedan abiertas (su identidad no incluye el fin de vigencia); las
//   reglas atadas a un importe forzado de un solo período se copian desde el mes siguiente;
// - la cobertura de fuentes se declara mes a mes: su sucesora vale sólo para el mes siguiente;
// - las políticas con vigencia declaran una sucesora desde el mes siguiente que cita a su antecesora por ID y SHA256;
// - las políticas por período único (totales oficiales, emisión de filas, importes forzados) pasan a su versión con
//   vigencia, también como sucesoras de la anterior.
// No toca fórmulas, importes, fuentes ni convenios: si algo cambió en la fuente, se corrige como siempre.
import {policySha256,policyNextMonth} from './own-payroll-policy-validity.js';
import {OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION,officialTotalsPolicyId} from './own-payroll-official-totals.js';
import {OWN_PAYROLL_ROW_EMISSION_V2_VERSION,rowEmissionPolicyId} from './own-payroll-row-emission.js';
import {OWN_MONTHLY_FORCED_AMOUNT_V2_VERSION,monthlyForcedPolicyId} from './own-payroll-monthly-forced-amounts.js';
import {participationRuleKey} from './own-period-participation-program.js';

const month=v=>typeof v==='string'&&/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(v);
const ranged=['quantityOnlyInputPolicies','monthlyDeclaredAdjustmentPolicies','conditionalSourcePolicies','familyTariffPolicies','sourceCoveragePolicies'];
const newId=(family,old,next)=>(family+'.'+(old.agreementCode??'x')+'.'+next+'.'+policySha256(old).slice(0,12)).replace(/[^A-Za-z0-9._-]/g,'-').slice(0,128);
const successor=(old,id,next)=>({...structuredClone(old),policyId:id,supersedes:{policyId:old.policyId,policySha256:policySha256(old)},validFrom:next,validUntil:null});
const withoutPeriod=p=>{const {period,...rest}=structuredClone(p);return rest;};

export function rollProgramToNextMonth(definition,closedMonth){
 if(!month(closedMonth))throw Error('Elegí el mes cerrado.');
 const next=policyNextMonth(closedMonth),p=structuredClone(definition),summary={closedMonth,next,rules:0,quantityPhases:0,successors:0,temporal:0};
 // Una regla atada a un importe forzado de un solo período conserva ese período exacto: se copia desde el mes siguiente.
 const forced=new Set((p.monthlyForcedAmountPolicies??[]).filter(f=>f.period===closedMonth).map(f=>f.agreementCode+':'+f.sourceCode));
 for(const r of [...(p.rules??[])]){
  if(r.validUntil!==closedMonth)continue;
  if(r.validFrom===closedMonth&&forced.has(r.agreementCode+':'+r.code)){
   const copy={...structuredClone(r),validFrom:next,validUntil:null};p.rules.push(copy);
   const t=p.periodParticipation?.treatments?.find(x=>x.ruleKey===participationRuleKey(r));
   if(t)p.periodParticipation.treatments.push({...structuredClone(t),ruleKey:participationRuleKey(copy)});
  }else r.validUntil=null;
  summary.rules++;
 }
 for(const q of p.quantityPhases??[])if(q.validUntil===closedMonth){q.validUntil=null;summary.quantityPhases++;}
 for(const family of ranged){
  const list=p[family];if(!Array.isArray(list))continue;
  for(const old of [...list])if(old.validUntil===closedMonth&&!list.some(x=>x.supersedes?.policyId===old.policyId)){const s=successor(old,newId(family,old,next),next);if(family==='sourceCoveragePolicies')s.validUntil=next;list.push(s);summary.successors++;}
 }
 const temporal=(family,versionField,version,identity,adapt=x=>x)=>{
  const list=p[family];if(!Array.isArray(list))return;
  for(const old of [...list]){
   if(old.period!==closedMonth)continue;
   const id=identity(old);if(list.some(x=>x.supersedes?.policyId===id))continue;
   list.push(adapt({...withoutPeriod(old),version,policyId:newId(family,old,next),supersedes:{policyId:id,policySha256:policySha256(old)},validFrom:next,validUntil:null}));summary.temporal++;
  }
  p[versionField]=version;
 };
 temporal('officialTotalsPolicies','officialTotalsVersion',OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION,officialTotalsPolicyId);
 temporal('rowEmissionPolicies','rowEmissionVersion',OWN_PAYROLL_ROW_EMISSION_V2_VERSION,rowEmissionPolicyId,x=>({...x,conditions:x.conditions.map(c=>({stage:'exact',valueDomain:'nonnegative_integer',...c}))}));
 temporal('monthlyForcedAmountPolicies','monthlyForcedAmountsVersion',OWN_MONTHLY_FORCED_AMOUNT_V2_VERSION,monthlyForcedPolicyId);
 return {program:p,summary};
}
