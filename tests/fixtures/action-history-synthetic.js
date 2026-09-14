/** Invented action-center evidence. No municipal session or source data. */
export const historyCapabilities = ['actions.read', 'leave.request.all.manage', 'leave.request.payroll.read', 'time.overtime.read', 'time.overtime.approve'];
export const historyIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
export function actionSourceFixture(status = 'historical_read_only') {
  return { status, sourceCutoffAt: status === 'current' ? '2026-09-10T06:00:00.123456Z' : '2026-08-01T02:30:00.123456Z', currentCutoffAt: '2026-09-10T06:00:00.123456Z' };
}
export function actionHistoryFixture(index = 1) {
  const overtime = index === 3;
  const record = {
    id: historyIds[index], caseNumber: String(901 + index), caseType: overtime ? 'overtime_entry' : 'leave_request',
    beneficiaryContractId: '55555555-5555-4555-8555-555555555555',
    subject: { contractId: '55555555-5555-4555-8555-555555555555', displayName: 'Persona de prueba sintética', legajo: 'QA-01', sector: 'Área de prueba' },
    status: index === 2 ? 'approved' : 'submitted', confidentiality: overtime ? 'restricted' : 'standard',
    policyVersionId: overtime ? 'junin-mayor-esfuerzo-intake.v1' : 'mendoza-ley-5811-title-vi.v1',
    payload: overtime ? { workDate: '2026-07-30', declaredMinutes: 73, reasonCode: 'service_continuity' }
      : { reasonCode: '19', startsOn: '2026-08-03', endsOn: '2026-08-04', durationUnit: 'calendar_day', policyRuleId: 'annual-ordinary' },
    evidenceStatus: 'verified', version: 2, updatedAt: '2026-08-02T12:00:00Z',
    timestamps: { createdAt: '2026-07-31T13:00:00Z', updatedAt: '2026-08-02T12:00:00Z', decidedAt: index === 2 ? '2026-08-02T12:00:00Z' : null },
    projection: index === 2 ? 'payroll' : overtime ? 'restricted_nominal' : 'nominal',
    sourceContext: actionSourceFixture(index === 0 ? 'current' : 'historical_read_only'),
    payrollImpact: { calculated: false, posted: false, attendanceReconciled: false, amount: null, rate: null },
  };
  if (index === 2) { delete record.subject; delete record.beneficiaryContractId; }
  return record;
}
export function actionHistoryBootstrap(overtime = false) {
  const policy = 'junin-mayor-esfuerzo-intake.v1';
  return {
    ok: true, principal: { displayName: 'Operador de prueba sintética', role: 'RRHH_APROBADOR', capabilities: historyCapabilities },
    source: { label: 'Fuente sintética', cutoff: '2026-09-10T06:00:00Z' },
    ...(overtime ? {
      contract: { caseType: 'overtime_entry', policyVersionId: policy, confidentiality: 'restricted', calculated: false, posted: false, payrollMutation: false, declaredMinutes: { min: 1, max: 1440 } },
      feature: { caseType: 'overtime_entry', policyVersionId: policy, canEnter: false, canDecide: true, calculated: false, posted: false },
      options: { statuses: ['draft', 'submitted', 'pending_time_rules', 'rejected', 'cancelled'], subjects: [], reasons: [], decisionReasons: [] },
    } : {
      options: { views: [{ id: 'authorized', label: 'Todo mi alcance' }, { id: 'closed', label: 'Cerradas' }], defaultView: 'authorized', statuses: ['draft', 'submitted', 'approved', 'rejected', 'cancelled'], subjects: [], reasons: [] },
    }),
  };
}
