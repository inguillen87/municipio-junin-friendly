// Reviewed relational scope through SQL131. This declares metadata, not business decisions.
export const MUNICIPAL_CONTINUITY_PROFILE='municipal-sql131';
export const MUNICIPAL_CONTINUITY_EXCLUSIONS=Object.freeze([
 'action_command_context','grh_core_source_version','grh_curated_source_version',
 'grh_effective_source_binding','grh_successor_stage','tenant_action_area_scope','tenant_action_employment_link'
]);
export const MUNICIPAL_CONTINUITY_TABLES=Object.freeze([
 'action_case','action_case_event','annual_position_budget_event',
 'attendance_evaluation_audit_event','attendance_evaluation_result','attendance_evaluation_run','attendance_evaluation_source',
 'employee_family_member','employee_family_member_event','employee_payroll_detail_read_event','employee_payroll_read_event',
 'native_employee_registration','native_employment_catalog_proposal','native_employment_catalog_review',
 'native_employment_change_proposal','native_employment_change_review','native_employment_lifecycle_proposal',
 'native_employment_lifecycle_review','native_leave_event','native_salary_event',
 'own_payroll_close_event','own_payroll_liquidation_event','own_payroll_novelty_event','own_payroll_program_event',
 'own_payroll_receipt_event','own_payroll_run_capture','own_payroll_run_position_capture','own_payroll_run_position_dimensions',
 'own_payroll_run_result','own_position_assignment_event','payroll_auxiliary_release','payroll_bank_report_read_event',
 'payroll_bank_source','payroll_control_import_batch','payroll_control_import_event','payroll_control_import_row',
 'payroll_detail_dataset','payroll_detail_delivery_job','payroll_detail_delivery_remote','payroll_detail_statement',
 'payroll_export_roster_read_event','payroll_fixed_annul_group','payroll_fixed_assignment','payroll_fixed_change',
 'payroll_fixed_correction_group','payroll_fixed_event','payroll_fixed_novelty','payroll_fixed_novelty_event',
 'payroll_fixed_review_group','payroll_monthly_annul_attempt','payroll_monthly_annul_proposal','payroll_monthly_annul_review',
 'payroll_monthly_close_event','payroll_monthly_close_run','payroll_monthly_correction_attempt',
 'payroll_monthly_correction_proposal','payroll_monthly_correction_review','payroll_monthly_source_read_event',
 'payroll_novelty_batch','payroll_novelty_event','payroll_novelty_issue','payroll_novelty_row','payroll_parameter_event',
 'payroll_parameter_proposal','payroll_reprocessing_case','payroll_reprocessing_event','payroll_source_report_read_event',
 'school_certificate','school_certificate_event','school_certificate_record','school_certificate_record_event',
 'school_certificate_source_date','school_certificate_source_recovery','time_assignment_spec','time_calendar_day',
 'time_catalog_entry','time_catalog_governance_event','time_rule_parameter','time_shift_spec','time_shift_weekly_interval',
 'time_source_contract','time_source_governance_event'
]);
const inheritance=[
 ['attendance_evaluation_audit_event','attendance_evaluation_run',['run_id','tenant_id'],['id','tenant_id']],
 ['attendance_evaluation_result','attendance_evaluation_run',['run_id','tenant_id'],['id','tenant_id']],
 ['attendance_evaluation_source','attendance_evaluation_run',['run_id','tenant_id'],['id','tenant_id']],
 ['own_payroll_run_result','own_payroll_run_capture',['capture_id'],['id']],
 ['payroll_control_import_row','payroll_control_import_batch',['batch_id','tenant_id'],['id','tenant_id']],
 ['payroll_detail_delivery_remote','payroll_detail_delivery_job',['job_id'],['id']],
 ['payroll_detail_statement','payroll_detail_dataset',['dataset_id','tenant_id'],['id','tenant_id']],
 ['payroll_novelty_issue','payroll_novelty_batch',['batch_id','tenant_id'],['id','tenant_id']],
 ['payroll_novelty_row','payroll_novelty_batch',['batch_id','tenant_id'],['id','tenant_id']],
 ['school_certificate_source_date','school_certificate_source_recovery',['recovery_id'],['id']],
 ['time_assignment_spec','time_catalog_entry',['catalog_entry_id','tenant_id','catalog_kind'],['id','tenant_id','catalog_kind']],
 ['time_calendar_day','time_catalog_entry',['catalog_entry_id','tenant_id','catalog_kind'],['id','tenant_id','catalog_kind']],
 ['time_catalog_governance_event','time_catalog_entry',['catalog_entry_id','tenant_id','catalog_certified_binding_id'],['id','tenant_id','certified_binding_id']],
 ['time_rule_parameter','time_catalog_entry',['catalog_entry_id','tenant_id','catalog_kind'],['id','tenant_id','catalog_kind']],
 ['time_shift_spec','time_catalog_entry',['catalog_entry_id','tenant_id','catalog_kind'],['id','tenant_id','catalog_kind']],
 ['time_shift_weekly_interval','time_catalog_entry',['catalog_entry_id','tenant_id','catalog_kind'],['id','tenant_id','catalog_kind']],
 ['time_source_governance_event','time_source_contract',['contract_id','tenant_id','contract_certified_binding_id'],['id','tenant_id','certified_binding_id']]
];
export const MUNICIPAL_CONTINUITY_INHERITANCE=Object.freeze(inheritance.map(([child,parent,childColumns,parentColumns])=>
 Object.freeze({child,parent,childColumns:Object.freeze(childColumns),parentColumns:Object.freeze(parentColumns)})));
const certifiedBindings=new Set([
 'attendance_evaluation_run','payroll_auxiliary_release','payroll_control_import_batch','payroll_control_import_event',
 'payroll_fixed_annul_group','payroll_fixed_assignment','payroll_fixed_change','payroll_fixed_correction_group',
 'payroll_fixed_event','payroll_fixed_novelty','payroll_fixed_novelty_event','payroll_fixed_review_group',
 'payroll_monthly_annul_attempt','payroll_monthly_annul_proposal','payroll_monthly_annul_review',
 'payroll_monthly_close_event','payroll_monthly_close_run','payroll_monthly_correction_attempt',
 'payroll_monthly_correction_proposal','payroll_monthly_correction_review','payroll_novelty_batch','payroll_novelty_event',
 'payroll_parameter_event','payroll_parameter_proposal','payroll_reprocessing_case','payroll_reprocessing_event',
 'time_catalog_entry','time_source_contract'
]);
export const MUNICIPAL_CONTINUITY_BINDINGS=Object.freeze(Object.fromEntries(MUNICIPAL_CONTINUITY_TABLES
 .filter(name=>!MUNICIPAL_CONTINUITY_INHERITANCE.some(p=>p.child===name))
 .map(name=>[name,certifiedBindings.has(name)?'certified_binding_id':'source_binding_id'])));

// SQL132/133 add decisions, seals and applications. SQL144 is source
// infrastructure, not a municipal business record or an adoption decision.
export const FINAL_MUNICIPAL_CONTINUITY_PROFILE='municipal-sql144';
const finalInheritance=Object.freeze([...MUNICIPAL_CONTINUITY_INHERITANCE,
 Object.freeze({child:'employment_adoption_seal',parent:'employment_adoption_proposal',childColumns:Object.freeze(['proposal_id']),parentColumns:Object.freeze(['id'])}),
 Object.freeze({child:'employment_adoption_application',parent:'employment_adoption_decision',childColumns:Object.freeze(['decision_id']),parentColumns:Object.freeze(['id'])})]);
const finalTables=Object.freeze([...MUNICIPAL_CONTINUITY_TABLES,'employment_adoption_proposal','employment_adoption_decision',
 'employment_adoption_seal','employment_adoption_application'].sort());
const finalBindings=Object.freeze({...MUNICIPAL_CONTINUITY_BINDINGS,employment_adoption_proposal:'source_binding_id',employment_adoption_decision:'source_binding_id'});
const profiles=Object.freeze({
 [MUNICIPAL_CONTINUITY_PROFILE]:Object.freeze({id:MUNICIPAL_CONTINUITY_PROFILE,tables:MUNICIPAL_CONTINUITY_TABLES,
  bindings:MUNICIPAL_CONTINUITY_BINDINGS,inheritance:MUNICIPAL_CONTINUITY_INHERITANCE,exclusions:MUNICIPAL_CONTINUITY_EXCLUSIONS}),
 [FINAL_MUNICIPAL_CONTINUITY_PROFILE]:Object.freeze({id:FINAL_MUNICIPAL_CONTINUITY_PROFILE,tables:finalTables,
  bindings:finalBindings,inheritance:finalInheritance,exclusions:Object.freeze([...MUNICIPAL_CONTINUITY_EXCLUSIONS,
   'grh_final_source_revision','grh_final_source_delta','grh_final_source_seal'])})
});
export function municipalContinuityProfile(id=MUNICIPAL_CONTINUITY_PROFILE){
 if(typeof id!=='string'||!Object.hasOwn(profiles,id))throw Object.assign(new Error('SUCCESSOR_CONTINUITY_PROFILE_INVALID'),{code:'SUCCESSOR_CONTINUITY_PROFILE_INVALID'});
 return profiles[id];
}
