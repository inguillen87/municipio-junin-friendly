// Catálogo sintético: contiene nombres y columnas, no registros de empleados.
import {NATIVE_READ_DOMAINS} from '../../scripts/lib/grh-successor-operational-read.mjs';
import {NATIVE_CONTINUITY_TABLES} from '../../scripts/lib/grh-successor-native-summary.mjs';
export function nativeCatalogFixture(){
 const roots=new Map(NATIVE_READ_DOMAINS.map(([n,b])=>[n,b]));
 const tables=NATIVE_CONTINUITY_TABLES.map(name=>({name,kind:'r',columns:['id','tenant_id',
 ...(name==='payroll_novelty_row'||name==='payroll_novelty_issue'?['batch_id']:[roots.get(name)??(name.startsWith('payroll_')?'certified_binding_id':'source_binding_id')])]}));
 tables.push({name:'employment_contract',kind:'r',columns:['id']},{name:'person_identity',kind:'r',columns:['id']});
 const foreignKeys=[];
 const edge=(child,parent,childColumns=['parent_id'],parentColumns=['id'])=>{
  for(const [table,columns]of [[child,childColumns],[parent,parentColumns]]){const t=tables.find(t=>t.name===table);t.columns=[...new Set([...t.columns,...columns])];}
  foreignKeys.push({child,parent,name:child+'_fk_'+foreignKeys.length,child_schema:'public',parent_schema:'public',validated:true,child_columns:childColumns,parent_columns:parentColumns});
 };
 edge('action_case_event','action_case',['case_id']);
 edge('employee_family_member','native_employee_registration',['native_registration_id']);
 edge('employee_family_member_event','employee_family_member',['member_id']);
 edge('native_employment_catalog_review','native_employment_catalog_proposal',['tenant_id','source_binding_id','proposal_id'],['tenant_id','source_binding_id','id']);
 edge('payroll_auxiliary_release','payroll_parameter_proposal',['proposal_id']);
 edge('payroll_fixed_assignment','payroll_fixed_change',['last_change_id','tenant_id'],['id','tenant_id']);
 edge('payroll_fixed_change','payroll_fixed_assignment',['assignment_id','tenant_id'],['id','tenant_id']);
 edge('payroll_fixed_event','payroll_fixed_change',['change_id','tenant_id'],['id','tenant_id']);
 edge('payroll_fixed_novelty_event','payroll_fixed_novelty',['record_id','tenant_id','certified_binding_id'],['id','tenant_id','certified_binding_id']);
 edge('payroll_fixed_novelty_event','payroll_fixed_novelty_event',['proposal_id']);
 edge('payroll_monthly_close_event','payroll_monthly_close_run',['run_id','tenant_id'],['id','tenant_id']);
 edge('payroll_novelty_event','payroll_novelty_batch',['batch_id','tenant_id'],['id','tenant_id']);
 edge('payroll_novelty_issue','payroll_novelty_batch',['batch_id','tenant_id'],['id','tenant_id']);
 edge('payroll_novelty_issue','payroll_novelty_row',['row_id','tenant_id','batch_id'],['id','tenant_id','batch_id']);
 edge('payroll_novelty_row','payroll_novelty_batch',['batch_id','tenant_id'],['id','tenant_id']);
 edge('payroll_novelty_row','native_employee_registration',['native_registration_id']);
 edge('payroll_parameter_event','payroll_parameter_proposal',['proposal_id','tenant_id'],['id','tenant_id']);
 edge('payroll_reprocessing_event','payroll_reprocessing_case',['case_id','tenant_id'],['id','tenant_id']);
 edge('school_certificate','employee_family_member',['own_family_id','tenant_id','source_binding_id'],['id','tenant_id','source_binding_id']);
 edge('school_certificate_event','school_certificate',['certificate_id','tenant_id'],['id','tenant_id']);
 edge('school_certificate_record','native_employee_registration',['native_registration_id']);
 edge('school_certificate_record_event','school_certificate_record',['record_id','tenant_id'],['id','tenant_id']);
 edge('action_case','employment_contract',['beneficiary_contract_id']);
 edge('native_employee_registration','person_identity',['person_id']);
 return {tables,foreignKeys};
}
