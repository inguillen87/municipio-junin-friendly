/** Synthetic examples only: no municipal identities, source files or session credentials. */
export const syntheticEmployee = {
  contractId:'00000000-0000-4000-8000-000000000057',legajo:'0057',nombre:'PERSONA SINTÉTICA QA',
  canonicalPersonId:'qa-person-57',companyId:7,activo:true,liquidable:true,administrativeStatus:'active',
  payrollStatus:'preliquidated',controlState:'incluido_en_corrida_abierta',crosswalkStatus:'matched',
  sector:'Sector de prueba',organizacion:'Unidad de prueba',convenio:'Convenio de prueba',cargo:'Cargo de prueba'
};
export function syntheticSummaries() {
  return Array.from({length:25}, (_,i) => {
    const date=new Date(Date.UTC(2026,8-i,0));
    return {payrollDate:date.toISOString(),sourcePeriod:date.getUTCFullYear(),sourceMonth:date.getUTCMonth()+1,
      payrollType:'M',canonicalPayrollType:'monthly',closureStatus:i===0?'open':'closed',
      presentationStatus:i===0?'open':i===2?'closed_mismatch':'closed_reconciled',
      subjectEarnings:'1000.00',nonSubjectEarnings:i===0?null:'0.00',familyAllowance:'50.00',
      employeeWithholdings:'100.00',netPayable:i===2?'949.98':'950.00',employerContributions:'200.00',
      sourceCutoff:'2026-08-06',distinctConcepts:25};
  });
}
