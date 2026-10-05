import { salaryExact, salaryHash, salaryUuid, salaryKey, salarySerialized } from './native-salary-catalog-model.js';
import { normalizeOwnPayrollInput } from './own-payroll-engine.js';
import { payrollRequire as require } from './own-payroll-exact.js';
export const OWN_RUN_VERSION = 'own-payroll-run.v1';
export const OWN_RUN_MAX_BODY = 512 * 1024;
export const OWN_RUN_MAX_RESPONSE = 4 * 1024 * 1024;
const code = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
export function ownRunCommand(v) {
  require(salaryExact(v, ['period', 'liquidationType', 'selection', 'scopeVersion', 'programVersion', 'populationDomain']) && typeof v.period === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v.period) && ['monthly', 'first_fortnight', 'sac', 'vacation', 'supplementary', 'final', 'other'].includes(v.liquidationType) && salaryHash(v.scopeVersion) && salaryHash(v.programVersion) && v.populationDomain === 'native_registered', 'RUN_INVALID', 'Declarar período, tipo, programa y población propia es obligatorio.');
  const s = v.selection;
  require(salaryExact(s, ['kind', 'values']) && ['all', 'contracts', 'agreements', 'departments'].includes(s.kind) && Array.isArray(s.values) && s.values.length <= 10000 && (s.kind === 'all' ? s.values.length === 0 : s.values.length > 0 && s.values.every(s.kind === 'contracts' ? salaryUuid : code)) && new Set(s.values).size === s.values.length && Reflect.ownKeys(s.values).length === s.values.length + 1, 'SELECTION_INVALID', 'El alcance debe ser explícito y completo. Búsqueda y página no definen población.');
  return { ...v, selection: { kind: s.kind, values: [...s.values].sort() } };
}
export function ownRunBootstrap(v) {
  require(salaryExact(v, ['version', 'scopeVersion', 'programVersion', 'canCalculate', 'runs', 'complete']) && v.version === 'own-payroll-bootstrap.v1' && [v.scopeVersion, v.programVersion].every(salaryHash) && typeof v.canCalculate === 'boolean' && v.complete === true && Array.isArray(v.runs) && v.runs.length <= 1000, 'RUN_CONTRACT_INVALID', 'No se pudo verificar el listado completo de corridas.');
  const ids = new Set(), keys = new Set();
  for (const r of v.runs) {
    require(salaryExact(r, ['id', 'key', 'period', 'liquidationType', 'selectionKind', 'selectionValueCount', 'createdAt', 'state', 'inputSha256', 'resultSha256']) && salaryUuid(r.id) && salaryKey(r.key) && !ids.has(r.id) && !keys.has(r.key) && typeof r.createdAt === 'string' && ['captured', 'calculated'].includes(r.state) && Number.isInteger(r.selectionValueCount) && r.selectionValueCount >= 0 && r.selectionValueCount <= 10000 && (r.selectionKind === 'all' ? r.selectionValueCount === 0 : ['contracts', 'agreements', 'departments'].includes(r.selectionKind) && r.selectionValueCount > 0) && (r.state === 'calculated' ? [r.inputSha256, r.resultSha256].every(salaryHash) : r.inputSha256 === null && r.resultSha256 === null), 'RUN_CONTRACT_INVALID', 'Una corrida no cumple el contrato de consulta.');
    ownRunCommand({ period: r.period, liquidationType: r.liquidationType, selection: { kind: 'all', values: [] }, scopeVersion: v.scopeVersion, programVersion: v.programVersion, populationDomain: 'native_registered' }); ids.add(r.id); keys.add(r.key);
  }
  return v;
}
export function ownRunCapture(v, attempt = null) {
  require(salaryExact(v, ['version', 'id', 'key', 'body', 'bodySha256', 'algorithmSha256', 'payload', 'payloadSha256', 'createdAt', 'replayed', 'saved']) && v.version === OWN_RUN_VERSION && salaryUuid(v.id) && salaryKey(v.key) && [v.bodySha256, v.algorithmSha256, v.payloadSha256].every(salaryHash) && typeof v.createdAt === 'string' && typeof v.replayed === 'boolean', 'RUN_CONTRACT_INVALID', 'No se pudo verificar la captura de la corrida.');
  ownRunCommand(v.body);
  require(salaryExact(v.payload, ['programState', 'population', 'monthly', 'fixed', 'period', 'liquidationType', 'selection', 'sourceInventory']) && v.payload.period === v.body.period && v.payload.liquidationType === v.body.liquidationType && salarySerialized(v.payload.selection) === salarySerialized(v.body.selection) && v.payload.programState?.program?.version === v.body.programVersion, 'RUN_CONTRACT_INVALID', 'La captura no coincide con el alcance elegido.');
  if (attempt) require(v.key === attempt.key && salarySerialized(v.body) === salarySerialized(attempt.body), 'RUN_CONTRACT_INVALID', 'La captura cambió el cuerpo o la clave originales.');
  if (v.saved !== null) ownRunSaved(v.saved, v.id, v.algorithmSha256);
  return v;
}
export function ownRunSaved(v, captureId = null, algorithm = null) {
  require(salaryExact(v, ['version', 'id', 'algorithmSha256', 'inputSha256', 'resultSha256', 'input', 'result', 'recordedAt']) && v.version === 'own-payroll-saved.v1' && salaryUuid(v.id) && [v.algorithmSha256, v.inputSha256, v.resultSha256].every(salaryHash) && typeof v.recordedAt === 'string' && (!captureId || captureId === v.id) && (!algorithm || algorithm === v.algorithmSha256), 'RUN_CONTRACT_INVALID', 'No se pudo verificar el resultado persistido.');
  const input = normalizeOwnPayrollInput(v.input), r = v.result;
  require(salarySerialized(input) === salarySerialized(v.input), 'RUN_CONTRACT_INVALID', 'La entrada guardada no conserva su representación canónica.');
  require(salaryExact(r, ['version', 'period', 'liquidationType', 'selection', 'sourceVersions', 'employeeCount', 'rowCount', 'rows', 'employeeTotals', 'payrollCalculated', 'payrollPosted', 'municipalApprovalVerified', 'paymentExecuted']) && r.version === 'own-payroll-result.v1' && r.period === input.period && r.liquidationType === input.liquidationType && salarySerialized(r.selection) === salarySerialized(input.selection) && salarySerialized(r.sourceVersions) === salarySerialized(input.sourceVersions) && Array.isArray(r.rows) && r.rowCount === r.rows.length && Array.isArray(r.employeeTotals) && r.employeeCount === r.employeeTotals.length && r.employeeCount > 0 && r.payrollCalculated === true && r.payrollPosted === false && r.municipalApprovalVerified === false && r.paymentExecuted === false, 'RUN_CONTRACT_INVALID', 'El resultado no corresponde a las fuentes y al alcance de la corrida.');
  return v;
}
