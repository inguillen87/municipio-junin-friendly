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
const temporalFamilies=['officialTotalsPolicies','rowEmissionPolicies','monthlyForcedAmountPolicies'];
const newId=(family,old,next)=>(family+'.'+(old.agreementCode??'x')+'.'+next+'.'+policySha256(old)).replace(/[^A-Za-z0-9._-]/g,'-').slice(0,128);
const successor=(old,id,next,until)=>({...structuredClone(old),policyId:id,supersedes:{policyId:old.policyId,policySha256:policySha256(old)},validFrom:next,validUntil:until});
const withoutPeriod=p=>{const {period,...rest}=structuredClone(p);return rest;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Misma regla funcional: convenio, código, naturaleza (concepto o auxiliar) y tipos de liquidación.
const sameRule=(a,b)=>a.agreementCode===b.agreementCode&&a.code===b.code&&(a.nature==='auxiliary')===(b.nature==='auxiliary')&&same(a.liquidationTypes,b.liquidationTypes);

/**
 * Revisión independiente (ChatGPT 6.2, 24/11/2026) incorporada: idempotente (correrlo dos veces no agrega nada), no
 * extiende lo que ya tiene una vigencia posterior declarada, verifica unicidad de identificadores y deja las
 * excepciones económicas (importes forzados) y la cobertura de fuentes con vigencia de un solo mes.
 */
export function rollProgramToNextMonth(definition,closedMonth){
 if(!month(closedMonth))throw Error('Elegí el mes cerrado.');
 const next=policyNextMonth(closedMonth),p=structuredClone(definition),summary={closedMonth,next,rules:0,quantityPhases:0,successors:0,temporal:0,skipped:0};
 const forcedPolicies=(p.monthlyForcedAmountPolicies??[]).filter(f=>f.period===closedMonth);
 const forcedTarget=r=>forcedPolicies.some(f=>f.agreementCode===r.agreementCode&&f.sourceCode===r.code&&same(r.liquidationTypes,[f.liquidationType]));
 const later=(list,x,match)=>list.some(y=>y!==x&&match(x,y)&&y.validFrom>closedMonth);
 for(const r of [...(p.rules??[])]){
  if(r.validUntil!==closedMonth)continue;
  if(later(p.rules,r,sameRule)){summary.skipped++;continue;}
  if(r.validFrom===closedMonth&&forcedTarget(r)){
   const copy={...structuredClone(r),validFrom:next,validUntil:null};p.rules.push(copy);
   for(const t of (p.periodParticipation?.treatments??[]).filter(x=>x.ruleKey===participationRuleKey(r)))p.periodParticipation.treatments.push({...structuredClone(t),ruleKey:participationRuleKey(copy)});
  }else r.validUntil=null;
  summary.rules++;
 }
 const samePhase=(a,b)=>a.agreementCode===b.agreementCode&&a.code===b.code&&a.stage===b.stage&&same(a.liquidationTypes,b.liquidationTypes);
 for(const q of p.quantityPhases??[])if(q.validUntil===closedMonth){if(later(p.quantityPhases,q,samePhase)){summary.skipped++;continue;}q.validUntil=null;summary.quantityPhases++;}
 const ids=new Set();
 const unique=id=>{if(ids.has(id))throw Error('Identificador de política repetido: '+id);ids.add(id);return id;};
 for(const family of [...ranged,...temporalFamilies])for(const x of p[family]??[])if(x.policyId)unique(x.policyId);
 const monthOnly=new Set(['sourceCoveragePolicies','monthlyForcedAmountPolicies']);
 // Políticas con vigencia (incluidas las ya migradas): sucesora desde el mes siguiente, si no tiene una.
 for(const family of [...ranged,...temporalFamilies]){
  const list=p[family];if(!Array.isArray(list))continue;
  for(const old of [...list]){
   if(!old.policyId||old.validUntil!==closedMonth)continue;
   if(list.some(x=>x.supersedes?.policyId===old.policyId)){summary.skipped++;continue;}
   list.push(successor(old,unique(newId(family,old,next)),next,monthOnly.has(family)?next:null));summary.successors++;
  }
 }
 // Políticas de un solo período: pasan a la versión con vigencia como sucesoras.
 const temporal=(family,versionField,version,identity,adapt=x=>x)=>{
  const list=p[family];if(!Array.isArray(list))return;let migrated=0;
  for(const old of [...list]){
   if(old.period!==closedMonth)continue;
   const id=identity(old);if(list.some(x=>x.supersedes?.policyId===id)){summary.skipped++;continue;}
   list.push(adapt({...withoutPeriod(old),version,policyId:unique(newId(family,old,next)),supersedes:{policyId:id,policySha256:policySha256(old)},validFrom:next,validUntil:monthOnly.has(family)?next:null}));summary.temporal++;migrated++;
  }
  if(migrated)p[versionField]=version;
 };
 temporal('officialTotalsPolicies','officialTotalsVersion',OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION,officialTotalsPolicyId);
 temporal('rowEmissionPolicies','rowEmissionVersion',OWN_PAYROLL_ROW_EMISSION_V2_VERSION,rowEmissionPolicyId,x=>{if(!Array.isArray(x.conditions))throw Error('La emisión de filas no declara sus condiciones.');return {...x,conditions:x.conditions.map(c=>({...c,stage:c.stage??'exact',valueDomain:c.valueDomain??'nonnegative_integer'}))};});
 temporal('monthlyForcedAmountPolicies','monthlyForcedAmountsVersion',OWN_MONTHLY_FORCED_AMOUNT_V2_VERSION,monthlyForcedPolicyId);
 return {program:p,summary};
}
