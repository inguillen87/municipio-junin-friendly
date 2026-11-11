import {OWN_PAYROLL_OFFICIAL_TOTALS_VERSION,normalizeOfficialTotalsPolicy} from './own-payroll-official-totals.js';
import {salarySerialized} from './native-salary-catalog-model.js';
import {payrollRequire as require} from './own-payroll-exact.js';

export const ownProgramOfficialTotals=p=>p!==null&&typeof p==='object'&&Object.getOwnPropertyDescriptor(p,'officialTotalsVersion')?.value===OWN_PAYROLL_OFFICIAL_TOTALS_VERSION;
export const officialProgramFields=p=>ownProgramOfficialTotals(p)?['officialTotalsVersion','officialTotalsPolicies']:[];
export const officialPolicyKey=p=>[p.agreementCode,p.period,p.liquidationType].join(':');
const active=(r,p)=>r.agreementCode===p.agreementCode&&r.validFrom<=p.period&&(r.validUntil===null||r.validUntil>=p.period)&&r.liquidationTypes.includes(p.liquidationType);
export function normalizeOfficialTotalsProgram(program){
 require(program.namespaceVersion==='own-payroll-namespaces.v2'&&program.quantityPhasesVersion==='own-payroll-quantity-phases.v1','OFFICIAL_TOTALS_PROGRAM_REQUIRED','Los totales oficiales requieren cantidades y referencias separadas.');
 const list=program.officialTotalsPolicies;
 require(Array.isArray(list)&&Object.getPrototypeOf(list)===Array.prototype&&list.length>0&&list.length<=1000&&Reflect.ownKeys(list).length===list.length+1&&Object.values(Object.getOwnPropertyDescriptors(list)).every(d=>Object.hasOwn(d,'value')),'OFFICIAL_TOTALS_PROGRAM_INVALID','Las políticas oficiales deben declararse completas.');
 const policies=list.map(normalizeOfficialTotalsPolicy).sort((a,b)=>officialPolicyKey(a).localeCompare(officialPolicyKey(b))),keys=new Set();
 for(const p of policies){
  require(!keys.has(officialPolicyKey(p)),'OFFICIAL_TOTALS_POLICY_OVERLAP','No se repite una política del mismo convenio, mes y tipo.');keys.add(officialPolicyKey(p));
  const rows=program.rules.filter(r=>active(r,p)),payable=new Map(rows.filter(r=>r.nature!=='auxiliary').map(r=>[r.code,r]));
  for(const code of Object.values(p.totalCodes))require(rows.some(r=>r.code===code&&r.nature==='auxiliary'&&r.unit==='money'),'OFFICIAL_TOTAL_RULE_REQUIRED','Cada total necesita un auxiliar monetario vigente.');
  const mapped=Object.values(p.contributions).flat();
  require(mapped.length===payable.size&&mapped.every(code=>payable.has(code)),'OFFICIAL_TOTAL_CLOSURE_REQUIRED','El cierre de aportes debe coincidir con todos los conceptos pagables, sin filas ficticias.');
 }
 return{officialTotalsVersion:OWN_PAYROLL_OFFICIAL_TOTALS_VERSION,officialTotalsPolicies:policies};
}
export function officialTotalsProgramHistory(before,after){
 if(!ownProgramOfficialTotals(before))return;
 require(ownProgramOfficialTotals(after),'PROGRAM_HISTORY_REQUIRED','Conservá el contrato de totales oficiales anterior.');
 const future=new Map(after.officialTotalsPolicies.map(p=>[officialPolicyKey(p),salarySerialized(p)]));
 require(before.officialTotalsPolicies.every(p=>future.get(officialPolicyKey(p))===salarySerialized(p)),'PROGRAM_HISTORY_REQUIRED','Una política oficial anterior debe conservarse exacta; agregá otro período.');
}
export function selectOfficialTotalsPolicy(program,period,liquidationType,selectedEmployees){
 require(ownProgramOfficialTotals(program),'OFFICIAL_TOTALS_PROGRAM_REQUIRED','El programa no declara totales oficiales.');
 const agreements=new Set(selectedEmployees.map(e=>e.agreementCode));
 require(agreements.size===1,'OFFICIAL_MULTIPLE_AGREEMENTS_UNSUPPORTED','Esta versión de salida oficial calcula un convenio por corrida.');
 const agreementCode=[...agreements][0],found=program.officialTotalsPolicies.filter(p=>p.agreementCode===agreementCode&&p.period===period&&p.liquidationType===liquidationType);
 require(found.length===1,'OFFICIAL_TOTALS_POLICY_REQUIRED','Falta una política oficial exacta para el convenio, mes y tipo elegidos.');
 return found[0];
}
