// Presentation only: this module never authorizes a request or changes a capability.
const known = new Map([
 ['ACTION_SESSION_INVALID', [401, 'La sesión operativa venció o dejó de ser válida. Ingresá nuevamente para consultar.', false]],
 ['IDENTITY_SESSION_INVALID', [401, 'La sesión venció o fue revocada. Ingresá nuevamente.', false]],
 ['EMPLOYEE_PAYROLL_CAPABILITY_REQUIRED', [403, 'Tu perfil no tiene habilitada la consulta de liquidaciones y legajos.', false]],
 ['TENANT_IAM_SOD_CONFLICT', [403, 'La configuración de tu rol combina funciones incompatibles. Tecnología debe revisarla; este mensaje no significa que falten liquidaciones.', false]],
 ['ACTION_TENANT_AUTHORITY_REQUIRED', [403, 'Falta una habilitación operativa de tu cuenta para esta consulta.', false]],
 ['ACTION_RELEASE_NOT_CERTIFIED', [503, 'La consulta está bloqueada por la configuración del contrato de datos. No es una falta de permisos personales.', false]],
 ['ACTION_SOURCE_BINDING_REQUIRED', [503, 'La fuente municipal no está vinculada correctamente para esta consulta.', false]],
 ['ACTION_DATABASE_ROLE_REQUIRED', [503, 'La conexión de consultas operativas requiere revisión técnica.', false]],
 ['ACTION_SESSION_BUSY', [409, 'La sesión está siendo actualizada. Esperá unos segundos y volvé a consultar.', true]],
 ['GRH_SOURCE_CHANGED', [503, 'La fuente se actualizó durante la consulta. Volvé a consultar.', true]],
]);
export function payrollReadFailure(error) {
 const code = typeof error?.code === 'string' ? error.code : '';
 const candidate = code === 'P0001' && typeof error?.message === 'string' ? error.message : code;
 const match = candidate.length <= 96 ? known.get(candidate) : null;
 if (match) return { status: match[0], code: candidate, error: match[1], retryable: match[2] };
 return { status: 503, code: 'INTERNAL_DATA_UNAVAILABLE',
  error: 'No se pudo completar la consulta. Esto no confirma que falten datos ni permisos. Informá la referencia del error a Tecnología.', retryable: true };
}
export function payrollReadDiagnostic(error, resource, requestId) {
 return { code: payrollReadFailure(error).code,
  sqlstate: typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null,
  resource: typeof resource === 'string' && /^[a-z]{3,32}$/.test(resource) ? resource : 'unknown', requestId };
}
