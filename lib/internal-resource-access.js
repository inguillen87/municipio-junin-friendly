export const TENANT_DATA_CAPABILITIES = Object.freeze({
  WORKFORCE_SUMMARY_READ: 'workforce.summary.read',
  WORKFORCE_STRUCTURE_READ: 'workforce.structure.read',
  WORKFORCE_EMPLOYEE_READ: 'workforce.employee.read',
  PAYROLL_READ: 'payroll.read',
  ABSENCE_ANALYTICS_READ: 'absence.analytics.read',
  ABSENCE_NOMINAL_READ: 'absence.nominal.read',
  LEAVE_POLICY_READ: 'leave.policy.read',
  LEAVE_PREVIEW_READ: 'leave.preview.read',
  MANAGEMENT_ANALYTICS_READ: 'management.analytics.read',
  QUALITY_READ: 'quality.read',
  LINEAGE_READ: 'lineage.read',
  BUDGET_APPROVED_READ: 'budget.approved.read',
  ASSISTANT_USE: 'assistant.use',
  ACTIONS_READ: 'actions.read',
});

const C = TENANT_DATA_CAPABILITIES;

const INTERNAL_DATA_RESOURCE_CAPABILITIES = Object.freeze({
  summary: Object.freeze([C.WORKFORCE_SUMMARY_READ]),
  structure: Object.freeze([C.WORKFORCE_STRUCTURE_READ]),
  integrationquality: Object.freeze([C.QUALITY_READ]),
  payrollcontrol: Object.freeze([C.PAYROLL_READ]),
  absenceanalytics: Object.freeze([C.ABSENCE_ANALYTICS_READ]),
  absenceevents: Object.freeze([C.ABSENCE_NOMINAL_READ]),
  leavenormative: Object.freeze([C.LEAVE_POLICY_READ]),
  leavepreview: Object.freeze([C.LEAVE_PREVIEW_READ]),
  managementanalytics: Object.freeze([C.MANAGEMENT_ANALYTICS_READ]),
  qualityoverview: Object.freeze([C.QUALITY_READ]),
  qualityissues: Object.freeze([C.QUALITY_READ]),
  importlineage: Object.freeze([C.LINEAGE_READ]),
  employees: Object.freeze([C.WORKFORCE_EMPLOYEE_READ]),
  employee: Object.freeze([C.WORKFORCE_EMPLOYEE_READ]),
  budgetapproved: Object.freeze([C.BUDGET_APPROVED_READ]),
});

const ASSISTANT_INTENT_CAPABILITIES = Object.freeze({
  workforce_summary: Object.freeze([C.ASSISTANT_USE, C.WORKFORCE_SUMMARY_READ]),
  payroll_control: Object.freeze([C.ASSISTANT_USE, C.PAYROLL_READ]),
  integration_quality: Object.freeze([C.ASSISTANT_USE, C.QUALITY_READ]),
  quality_analysis: Object.freeze([C.ASSISTANT_USE, C.QUALITY_READ]),
  absence_analysis: Object.freeze([C.ASSISTANT_USE, C.ABSENCE_ANALYTICS_READ]),
  leave_policy: Object.freeze([C.ASSISTANT_USE, C.LEAVE_POLICY_READ]),
  operational_summary: Object.freeze([C.ASSISTANT_USE, C.WORKFORCE_SUMMARY_READ]),
  structure_analysis: Object.freeze([C.ASSISTANT_USE, C.WORKFORCE_STRUCTURE_READ]),
  absence_event_list: Object.freeze([C.ASSISTANT_USE, C.ABSENCE_NOMINAL_READ]),
  quality_issue_list: Object.freeze([C.ASSISTANT_USE, C.QUALITY_READ]),
  import_lineage: Object.freeze([C.ASSISTANT_USE, C.LINEAGE_READ]),
  employee_search: Object.freeze([C.ASSISTANT_USE, C.WORKFORCE_EMPLOYEE_READ]),
  employee_detail: Object.freeze([C.ASSISTANT_USE, C.WORKFORCE_EMPLOYEE_READ]),
  management_comparison: Object.freeze([C.ASSISTANT_USE, C.MANAGEMENT_ANALYTICS_READ]),
  budget_approved: Object.freeze([C.ASSISTANT_USE, C.BUDGET_APPROVED_READ]),
  executive_analysis: Object.freeze([
    C.ASSISTANT_USE,
    C.WORKFORCE_SUMMARY_READ,
    C.PAYROLL_READ,
    C.ABSENCE_ANALYTICS_READ,
    C.QUALITY_READ,
  ]),
  help_navigation: Object.freeze([C.ASSISTANT_USE]),
  section_explanation: Object.freeze([C.ASSISTANT_USE]),
  task_guidance: Object.freeze([C.ASSISTANT_USE]),
  glossary: Object.freeze([C.ASSISTANT_USE]),
  help: Object.freeze([C.ASSISTANT_USE]),
});

function normalizedKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function capabilitiesForInternalDataResource(resource) {
  const capabilities = INTERNAL_DATA_RESOURCE_CAPABILITIES[normalizedKey(resource)];
  return capabilities ? [...capabilities] : null;
}

export function capabilitiesForAssistantIntent(intent) {
  const capabilities = ASSISTANT_INTENT_CAPABILITIES[normalizedKey(intent)];
  return capabilities ? [...capabilities] : null;
}

export function capabilitiesForActionCenter() {
  return [C.ACTIONS_READ];
}

export function principalHasCapabilities(principal, required, mode = 'all') {
  if (!Array.isArray(required) || required.length === 0) return true;
  const effective = principal?.tenant?.effectiveCapabilities;
  if (!Array.isArray(effective)) return false;
  const granted = new Set(effective.map(String));
  return mode === 'any'
    ? required.some((capability) => granted.has(capability))
    : required.every((capability) => granted.has(capability));
}

export const INTERNAL_RESOURCE_ACCESS_CONTRACT = Object.freeze({
  version: 'tenant_resource_access.v1',
  capabilityMode: 'all',
  internalData: INTERNAL_DATA_RESOURCE_CAPABILITIES,
  assistant: ASSISTANT_INTENT_CAPABILITIES,
});
