// Synthetic saved batches only. No municipal data or database connection.
export const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const row = (ordinal, patch = {}) => ({rowOrdinal:ordinal,employmentContractId:id(100+ordinal),
  legajo:String(1000+ordinal),conceptSourceId:'614',costCenterSourceId:null,adjustmentMonth:null,
  quantityDecimal:null,amountCents:'12345',movementType:null,legalInstrument:null,observation:null,
  forced:false,issues:[],...patch});
export const batch = (count = 60) => ({id:id(1),contractVersion:'payroll-novelty-batch.v1',sourceMode:'bulk',
  periodMonth:'2026-09-01',payrollType:'monthly',version:1,status:'draft',rowCount:count,
  exportable:false,canExport:false,allowedCommands:['submit','cancel'],blockingIssueCount:0,warningIssueCount:0,
  grhMutation:false,payrollCalculated:false,payrollPosted:false,rows:Array.from({length:count},(_,i)=>row(i+1))});
export const bootstrap = () => ({feature:{contractVersion:'payroll-novelty-batch.v2',approvalEffect:'export_only'},
  limits:{contractVersion:'payroll-novelty-batch.v2',approvalEffect:'export_only',maxRows:500,
    sourceModes:['individual','bulk'],payrollTypes:['monthly','first_fortnight','sac','vacation','supplementary','final','other'],
    native:{maxRows:1,sourceModes:['individual'],payrollTypes:['monthly']},grhMutation:false,payrollCalculated:false,payrollPosted:false},
  principal:{tenantId:id(2),membershipId:id(3),certifiedBindingId:id(4),
    capabilities:['payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.prepare','payroll.novelty.approve']},batches:[]});
