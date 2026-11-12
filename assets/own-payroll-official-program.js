import {OWN_PAYROLL_OFFICIAL_TOTALS_VERSION,OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION,OWN_PAYROLL_OFFICIAL_TOTALS_CAPTURE_V2_VERSION,officialTotalsPolicyVersionCompatible,officialTotalsPolicyKey,officialTotalsPolicyId,officialTotalsPoliciesSha256,normalizeOfficialTotalsPolicies,normalizeOfficialTotalsCapture,resolveOfficialTotalsPolicies} from './own-payroll-official-totals.js';
import {salarySerialized} from './native-salary-catalog-model.js';
import {payrollRequire as require} from './own-payroll-exact.js';
import {policyBoundaryMonths,resolvedPolicyAppliesTo} from './own-payroll-policy-validity.js';

export const ownProgramOfficialTotals=p=>p!==null&&typeof p==='object'&&officialTotalsPolicyVersionCompatible(Object.getOwnPropertyDescriptor(p,'officialTotalsVersion')?.value,Object.getOwnPropertyDescriptor(p,'officialTotalsVersion')?.value);
export const officialProgramFields=p=>ownProgramOfficialTotals(p)?['officialTotalsVersion','officialTotalsPolicies']:[];
export const officialPolicyKey=officialTotalsPolicyKey;
const active=(r,p)=>r.agreementCode===p.agreementCode&&r.validFrom<=p.period&&(r.validUntil===null||r.validUntil>=p.period)&&r.liquidationTypes.includes(p.liquidationType);
export function normalizeOfficialTotalsProgram(program){
 require(program.namespaceVersion==='own-payroll-namespaces.v2'&&program.quantityPhasesVersion==='own-payroll-quantity-phases.v1','OFFICIAL_TOTALS_PROGRAM_REQUIRED','Los totales oficiales requieren cantidades y referencias separadas.');
 const temporal=program.officialTotalsVersion===OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION,policies=normalizeOfficialTotalsPolicies(program.officialTotalsPolicies,program.officialTotalsVersion);
 const entries=temporal?resolveOfficialTotalsPolicies(policies):policies.map(policy=>({policy}));
 for(const entry of entries){
  const p=entry.policy,relevant=program.rules.filter(r=>r.agreementCode===p.agreementCode&&r.liquidationTypes.includes(p.liquidationType));
  // Rule membership is constant between these boundaries. An open policy is
  // checked after every declared rule start/end, without enumerating years.
  const periods=temporal?policyBoundaryMonths(entry,relevant):[p.period];
  for(const period of periods){
   const rows=relevant.filter(r=>active(r,{agreementCode:p.agreementCode,liquidationType:p.liquidationType,period})),payable=new Map(rows.filter(r=>r.nature!=='auxiliary').map(r=>[r.code,r]));
   for(const code of Object.values(p.totalCodes))require(rows.some(r=>r.code===code&&r.nature==='auxiliary'&&r.unit==='money'),'OFFICIAL_TOTAL_RULE_REQUIRED','Cada total necesita un auxiliar monetario vigente en todo su intervalo efectivo.');
   const mapped=Object.values(p.contributions).flat();
   require(mapped.length===payable.size&&mapped.every(code=>payable.has(code)),'OFFICIAL_TOTAL_CLOSURE_REQUIRED','El cierre de aportes debe coincidir con todos los conceptos pagables en cada intervalo, sin filas ficticias.');
  }
 }
 return{officialTotalsVersion:program.officialTotalsVersion,officialTotalsPolicies:policies};
}
export function officialTotalsProgramHistory(before,after){
 if(!ownProgramOfficialTotals(before))return;
 require(ownProgramOfficialTotals(after)&&(before.officialTotalsVersion!==OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION||after.officialTotalsVersion===OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION),'PROGRAM_HISTORY_REQUIRED','Conservá el contrato de totales oficiales anterior y su evidencia de vigencia.');
 const future=new Map(after.officialTotalsPolicies.map(p=>[officialPolicyKey(p),salarySerialized(p)]));
 require(before.officialTotalsPolicies.every(p=>future.get(officialPolicyKey(p))===salarySerialized(p)),'PROGRAM_HISTORY_REQUIRED','Una política oficial anterior debe conservarse exacta; declarará su sucesión una nueva política.');
}
export function selectOfficialTotalsPolicy(program,period,liquidationType,selectedEmployees){
 require(ownProgramOfficialTotals(program),'OFFICIAL_TOTALS_PROGRAM_REQUIRED','El programa no declara totales oficiales.');
 const agreements=new Set(selectedEmployees.map(e=>e.agreementCode));
 require(agreements.size===1,'OFFICIAL_MULTIPLE_AGREEMENTS_UNSUPPORTED','Esta versión de salida oficial calcula un convenio por corrida.');
 const agreementCode=[...agreements][0],found=program.officialTotalsVersion===OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION?resolveOfficialTotalsPolicies(normalizeOfficialTotalsPolicies(program.officialTotalsPolicies,program.officialTotalsVersion)).filter(entry=>resolvedPolicyAppliesTo(entry,{period,liquidationType,agreementCode})).map(entry=>entry.policy):program.officialTotalsPolicies.filter(p=>p.agreementCode===agreementCode&&p.period===period&&p.liquidationType===liquidationType);
 require(found.length===1,'OFFICIAL_TOTALS_POLICY_REQUIRED','Falta una política oficial exacta para el convenio, mes y tipo elegidos.');
 return found[0];
}
export function captureOfficialTotalsPolicy(program,period,liquidationType,selectedEmployees){
 const officialTotalsPolicy=selectOfficialTotalsPolicy(program,period,liquidationType,selectedEmployees);
 if(program.officialTotalsVersion===OWN_PAYROLL_OFFICIAL_TOTALS_VERSION)return{officialTotalsPolicy};
 const policies=normalizeOfficialTotalsPolicies(program.officialTotalsPolicies,program.officialTotalsVersion).filter(p=>p.agreementCode===officialTotalsPolicy.agreementCode&&p.liquidationType===liquidationType);
 const officialTotalsCapture=normalizeOfficialTotalsCapture({version:OWN_PAYROLL_OFFICIAL_TOTALS_CAPTURE_V2_VERSION,period,liquidationType,agreementCode:officialTotalsPolicy.agreementCode,policies,policiesSha256:officialTotalsPoliciesSha256(policies),selectedPolicyId:officialTotalsPolicyId(officialTotalsPolicy)});
 return{officialTotalsPolicy,officialTotalsCapture};
}
