import {OWN_PAYROLL_ROW_EMISSION_VERSION,ownPayrollRowEmission,normalizeRowEmissionPolicies,validateRowEmissionContext,rowEmissionPolicyKey} from './own-payroll-row-emission.js';
import {quantityInputPhases} from './own-payroll-quantity-program.js';
import {participationRules} from './own-period-participation-program.js';
import {salarySerialized} from './native-salary-catalog-model.js';
import {payrollRequire as require} from './own-payroll-exact.js';

export const ownProgramRowEmission=ownPayrollRowEmission;
export const rowEmissionProgramFields=p=>ownProgramRowEmission(p)?['rowEmissionVersion','rowEmissionPolicies']:[];
/** Proposed scope only. A source reference is evidence, not municipal approval. */
export function proposeC1RowEmissionPolicies({sourceReference,sourceSha256}){
 return normalizeRowEmissionPolicies(['302','306'].map(conceptCode=>({agreementCode:'1',period:'2026-10',liquidationType:'monthly',conceptCode,conditions:[{quantityCode:'1',unit:'days',operator:'gt',value:'14'},{quantityCode:conceptCode,unit:'units',operator:'gt',value:'0'}],whenFalse:'omit_receipt_row',nonzeroAction:'error',sourceReference,sourceSha256})));
}
export function normalizeRowEmissionProgram(program){
 require(program.namespaceVersion==='own-payroll-namespaces.v2'&&program.quantityPhasesVersion==='own-payroll-quantity-phases.v1'&&program.officialTotalsVersion==='own-payroll-official-totals.v1','ROW_EMISSION_PROGRAM_REQUIRED','La omisión explícita necesita cantidades y totales oficiales conservados.');
 const policies=normalizeRowEmissionPolicies(program.rowEmissionPolicies);
 validateRowEmissionContext(participationRules(program),quantityInputPhases(program),policies,program.officialTotalsPolicies);
 return{rowEmissionVersion:OWN_PAYROLL_ROW_EMISSION_VERSION,rowEmissionPolicies:policies};
}
export function rowEmissionProgramHistory(before,after){
 if(!ownProgramRowEmission(before))return;
 require(ownProgramRowEmission(after),'PROGRAM_HISTORY_REQUIRED','Conservá la versión explícita de emisión del programa anterior.');
 const current=new Map(after.rowEmissionPolicies.map(p=>[rowEmissionPolicyKey(p),salarySerialized(p)]));
 require(before.rowEmissionPolicies.every(p=>current.get(rowEmissionPolicyKey(p))===salarySerialized(p)),'PROGRAM_HISTORY_REQUIRED','Una decisión de emisión histórica no se reinterpreta ni se elimina.');
}
