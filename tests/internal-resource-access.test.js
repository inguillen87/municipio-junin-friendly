import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INTERNAL_RESOURCE_ACCESS_CONTRACT,
  TENANT_DATA_CAPABILITIES,
  capabilitiesForActionCenter,
  capabilitiesForAssistantIntent,
  capabilitiesForInternalDataResource,
  principalHasCapabilities,
} from '../lib/internal-resource-access.js';

test('cada recurso interno publicado requiere una capability tenant explícita', () => {
  const resources = [
    'summary', 'structure', 'integrationquality', 'payrollcontrol',
    'absenceanalytics', 'absenceevents', 'leavenormative', 'leavepreview',
    'managementanalytics', 'qualityoverview', 'qualityissues', 'importlineage',
    'employees', 'employee', 'budgetapproved',
  ];
  for (const resource of resources) {
    const required = capabilitiesForInternalDataResource(resource);
    assert.ok(Array.isArray(required) && required.length > 0, resource);
  }
  assert.equal(capabilitiesForInternalDataResource('unknown'), null);
});

test('consultas nominales del asistente exigen assistant.use y permiso nominal', () => {
  const required = capabilitiesForAssistantIntent('employee_detail');
  assert.deepEqual(required, [
    TENANT_DATA_CAPABILITIES.ASSISTANT_USE,
    TENANT_DATA_CAPABILITIES.WORKFORCE_EMPLOYEE_READ,
  ]);
  assert.ok(capabilitiesForAssistantIntent('absence_event_list')
    .includes(TENANT_DATA_CAPABILITIES.ABSENCE_NOMINAL_READ));
});

test('análisis ejecutivo exige todas las fuentes que combina', () => {
  const required = capabilitiesForAssistantIntent('executive_analysis');
  assert.deepEqual(new Set(required), new Set([
    TENANT_DATA_CAPABILITIES.ASSISTANT_USE,
    TENANT_DATA_CAPABILITIES.WORKFORCE_SUMMARY_READ,
    TENANT_DATA_CAPABILITIES.PAYROLL_READ,
    TENANT_DATA_CAPABILITIES.ABSENCE_ANALYTICS_READ,
    TENANT_DATA_CAPABILITIES.QUALITY_READ,
  ]));
});

test('guía del asistente no concede acceso implícito a RRHH', () => {
  assert.deepEqual(capabilitiesForAssistantIntent('help'), [TENANT_DATA_CAPABILITIES.ASSISTANT_USE]);
  assert.deepEqual(capabilitiesForActionCenter(), [TENANT_DATA_CAPABILITIES.ACTIONS_READ]);
});

test('estado de relojes exige assistant.use y attendance.read', () => {
  assert.deepEqual(capabilitiesForAssistantIntent('attendance_status'), [
    TENANT_DATA_CAPABILITIES.ASSISTANT_USE,
    TENANT_DATA_CAPABILITIES.ATTENDANCE_READ,
  ]);
  assert.deepEqual(capabilitiesForAssistantIntent('out_of_scope'), [
    TENANT_DATA_CAPABILITIES.ASSISTANT_USE,
  ]);
});

test('principalHasCapabilities falla cerrado sin tenant o ante capability faltante', () => {
  const principal = {
    tenant: {
      effectiveCapabilities: [
        TENANT_DATA_CAPABILITIES.ASSISTANT_USE,
        TENANT_DATA_CAPABILITIES.QUALITY_READ,
      ],
    },
  };
  assert.equal(principalHasCapabilities(principal, [TENANT_DATA_CAPABILITIES.ASSISTANT_USE]), true);
  assert.equal(principalHasCapabilities(principal, [
    TENANT_DATA_CAPABILITIES.ASSISTANT_USE,
    TENANT_DATA_CAPABILITIES.PAYROLL_READ,
  ]), false);
  assert.equal(principalHasCapabilities(principal, [
    TENANT_DATA_CAPABILITIES.QUALITY_READ,
    TENANT_DATA_CAPABILITIES.PAYROLL_READ,
  ], 'any'), true);
  assert.equal(principalHasCapabilities({ platform: { roles: ['PLATFORM_OWNER'] } }, [
    TENANT_DATA_CAPABILITIES.WORKFORCE_EMPLOYEE_READ,
  ]), false);
});

test('contrato de acceso queda versionado e inmutable en su superficie', () => {
  assert.equal(INTERNAL_RESOURCE_ACCESS_CONTRACT.version, 'tenant_resource_access.v1');
  assert.equal(INTERNAL_RESOURCE_ACCESS_CONTRACT.capabilityMode, 'all');
  assert.ok(Object.isFrozen(INTERNAL_RESOURCE_ACCESS_CONTRACT));
});
