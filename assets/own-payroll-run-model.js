import {verifyCatalogueValueInputs} from './own-payroll-catalogue-values.js';
import {verifyConditionalSourceCapture,verifyConditionalSourceInputs} from './own-payroll-conditional-sources.js';
import {verifyCappedSource} from './own-payroll-capped-deductions.js';
import {optionalScaleResolver,verifyOptionalScaleInputs} from './own-payroll-optional-scales.js';
import {verifyQuantityOnlyInput} from './own-payroll-quantity-only-capture.js';
import {verifyDeclaredAdjustmentCapture,verifyDeclaredAdjustmentInput} from './own-payroll-declared-adjustments-capture.js';
import { participationCapture } from './own-period-participation-model.js';
import { ownProgramParticipation } from './own-period-participation-program.js';
import { salaryExact, salaryHash, salaryUuid, salaryKey, salarySerialized } from './native-salary-catalog-model.js';
import { normalizeOwnPayrollInput } from './own-payroll-engine.js';
import { payrollRequire as require } from './own-payroll-exact.js';
import { ownProgramSeniority, ownProgramWorkingTime } from './own-payroll-program-model.js';
import { seniorityCapture } from './own-salary-seniority-model.js';
import { workingTimeCapture } from './own-contract-working-time-model.js';
import { agreementWorkingTimeCapture } from './own-agreement-working-time-model.js';
import { ownProgramAgreementWorkingTime } from './own-agreement-working-time-program.js';
import {salaryConditionsCapture} from './own-contract-salary-conditions-model.js';
import {salaryNativeCapture,SALARY_NATIVE_VERSION} from './own-contract-salary-conditions-native-model.js';
import {familyPayrollFactsCapture} from './own-contract-family-payroll-facts-model.js';
import {ownPayrollFamilyFacts} from './own-payroll-family-facts.js';
import {ownPayrollConditions} from './own-payroll-conditions.js';
import {ownRunDate} from './own-payroll-run-date.js';
import {ownProgramPeriodContext,periodContextCapture} from './own-payroll-period-context.js';
import {ownRunEmploymentPrintFacts} from './own-payroll-employment-print-facts.js';
export const OWN_RUN_VERSION = 'own-payroll-run.v1';
export const OWN_RUN_DATED_VERSION = 'own-payroll-run.v2';
export const OWN_RUN_COMMAND_VERSION = 'own-payroll-run-command.v2';
export const OWN_RUN_MAX_BODY = 512 * 1024;
export const OWN_RUN_MAX_RESPONSE = 4 * 1024 * 1024;
const code = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
export function ownRunCommand(v) {
  const fields=['period','liquidationType','selection','scopeVersion','programVersion','populationDomain'];
  const dated=v?.version===OWN_RUN_COMMAND_VERSION;
  require(salaryExact(v, dated?[...fields,'version','liquidationDate']:fields) && (!dated||ownRunDate(v.liquidationDate)) && typeof v.period === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v.period) && ['monthly', 'first_fortnight', 'sac', 'vacation', 'supplementary', 'final', 'other'].includes(v.liquidationType) && salaryHash(v.scopeVersion) && salaryHash(v.programVersion) && v.populationDomain === 'native_registered', 'RUN_INVALID', 'Declarar período, tipo, programa y población propia es obligatorio; el formulario nuevo también requiere una fecha válida.');
  const s = v.selection;
  require(salaryExact(s, ['kind', 'values']) && ['all', 'contracts', 'agreements', 'departments'].includes(s.kind) && Array.isArray(s.values) && s.values.length <= 10000 && (s.kind === 'all' ? s.values.length === 0 : s.values.length > 0 && s.values.every(s.kind === 'contracts' ? salaryUuid : code)) && new Set(s.values).size === s.values.length && Reflect.ownKeys(s.values).length === s.values.length + 1, 'SELECTION_INVALID', 'El alcance debe ser explícito y completo. Búsqueda y página no definen población.');
  return { ...v, selection: { kind: s.kind, values: [...s.values].sort() } };
}
export function ownRunBootstrap(v) {
  const dated=v?.version==='own-payroll-bootstrap.v2';
  require(salaryExact(v, ['version', 'scopeVersion', 'programVersion', 'canCalculate', 'runs', 'complete']) && (dated||v.version === 'own-payroll-bootstrap.v1') && [v.scopeVersion, v.programVersion].every(salaryHash) && typeof v.canCalculate === 'boolean' && v.complete === true && Array.isArray(v.runs) && v.runs.length <= 1000, 'RUN_CONTRACT_INVALID', 'No se pudo verificar el listado completo de corridas.');
  const ids = new Set(), keys = new Set();
  for (const r of v.runs) {
    require(salaryExact(r, ['id', 'key', 'period', 'liquidationType', 'selectionKind', 'selectionValueCount', 'createdAt', 'state', 'inputSha256', 'resultSha256',...(dated?['liquidationDate']:[])]) && (!dated||r.liquidationDate===null||ownRunDate(r.liquidationDate)) && salaryUuid(r.id) && salaryKey(r.key) && !ids.has(r.id) && !keys.has(r.key) && typeof r.createdAt === 'string' && ['captured', 'calculated'].includes(r.state) && Number.isInteger(r.selectionValueCount) && r.selectionValueCount >= 0 && r.selectionValueCount <= 10000 && (r.selectionKind === 'all' ? r.selectionValueCount === 0 : ['contracts', 'agreements', 'departments'].includes(r.selectionKind) && r.selectionValueCount > 0) && (r.state === 'calculated' ? [r.inputSha256, r.resultSha256].every(salaryHash) : r.inputSha256 === null && r.resultSha256 === null), 'RUN_CONTRACT_INVALID', 'Una corrida no cumple el contrato de consulta.');
    ownRunCommand({ period: r.period, liquidationType: r.liquidationType, selection: { kind: 'all', values: [] }, scopeVersion: v.scopeVersion, programVersion: v.programVersion, populationDomain: 'native_registered' }); ids.add(r.id); keys.add(r.key);
  }
  return v;
}
export function ownRunCapture(v, attempt = null) {
  require(salaryExact(v, ['version', 'id', 'key', 'body', 'bodySha256', 'algorithmSha256', 'payload', 'payloadSha256', 'createdAt', 'replayed', 'saved']) && v.version === (v.body?.version===OWN_RUN_COMMAND_VERSION?OWN_RUN_DATED_VERSION:OWN_RUN_VERSION) && salaryUuid(v.id) && salaryKey(v.key) && [v.bodySha256, v.algorithmSha256, v.payloadSha256].every(salaryHash) && typeof v.createdAt === 'string' && typeof v.replayed === 'boolean', 'RUN_CONTRACT_INVALID', 'No se pudo verificar la captura de la corrida.');
  ownRunCommand(v.body);
  const hasSeniority = ownProgramSeniority(v.payload?.programState?.program?.definition);
  require(salaryExact(v.payload, ['programState', 'population', 'monthly', 'fixed', 'period', 'liquidationType', 'selection', 'sourceInventory', ...(hasSeniority ? ['employmentFacts'] : []), ...(ownProgramPeriodContext(v.payload.programState?.program?.definition)?['periodContext']:[]), ...(ownProgramWorkingTime(v.payload.programState?.program?.definition) ? ['workingTime'] : []), ...(ownProgramAgreementWorkingTime(v.payload.programState?.program?.definition) ? ['agreementWorkingTime'] : []), ...(ownPayrollConditions(v.payload.programState?.program?.definition)?['salaryConditions']:[]), ...(ownPayrollFamilyFacts(v.payload.programState?.program?.definition)?['familyPayrollFacts']:[]), ...(ownProgramParticipation(v.payload.programState?.program?.definition) ? ['periodParticipation'] : [])]) && v.payload.period === v.body.period && v.payload.liquidationType === v.body.liquidationType && salarySerialized(v.payload.selection) === salarySerialized(v.body.selection) && v.payload.programState?.program?.version === v.body.programVersion, 'RUN_CONTRACT_INVALID', 'La captura no coincide con el alcance elegido.');
  if (ownProgramParticipation(v.payload.programState?.program?.definition)) participationCapture(v.payload.periodParticipation, v.payload.population?.employees ?? [], v.body.period);
  if(ownProgramPeriodContext(v.payload.programState?.program?.definition))periodContextCapture(v.payload.periodContext,v.body.period);
  if (hasSeniority) seniorityCapture(v.payload.employmentFacts, v.payload.population?.employees ?? [], v.body.period);
  if (ownProgramWorkingTime(v.payload.programState?.program?.definition)) workingTimeCapture(v.payload.workingTime, v.payload.population?.employees ?? [], v.body.period);
  if (ownProgramAgreementWorkingTime(v.payload.programState?.program?.definition)) agreementWorkingTimeCapture(v.payload.agreementWorkingTime, v.payload.population?.employees ?? [], v.body.period);
  if(ownPayrollConditions(v.payload.programState?.program?.definition))(v.payload.programState.program.definition.salaryConditionsVersion===SALARY_NATIVE_VERSION?salaryNativeCapture:salaryConditionsCapture)(v.payload.salaryConditions,v.payload.population?.employees??[],v.body.period);
  if(ownPayrollFamilyFacts(v.payload.programState?.program?.definition))familyPayrollFactsCapture(v.payload.familyPayrollFacts,v.payload.population?.employees??[],v.body.period);
  verifyCatalogueValueInputs(v.payload,v.saved?.input??null);
  verifyDeclaredAdjustmentCapture(v.payload);
  if(v.saved===null)optionalScaleResolver(v.payload);else verifyOptionalScaleInputs(v.payload,v.saved.input);
  if(v.saved===null)verifyConditionalSourceCapture(v.payload);else verifyConditionalSourceInputs(v.payload,v.saved.input);
  verifyQuantityOnlyInput(v.payload);
  verifyCappedSource(v.payload);
  ownRunEmploymentPrintFacts(v);
  if (attempt) require(v.key === attempt.key && salarySerialized(v.body) === salarySerialized(attempt.body), 'RUN_CONTRACT_INVALID', 'La captura cambió el cuerpo o la clave originales.');
  if (v.saved !== null) {ownRunSaved(v.saved, v.id, v.algorithmSha256);verifyDeclaredAdjustmentInput(v.payload,v.saved.input,v.saved.result);verifyQuantityOnlyInput(v.payload,v.saved.input);}
  return v;
}
export function ownRunSaved(v, captureId = null, algorithm = null) {
  require(salaryExact(v, ['version', 'id', 'algorithmSha256', 'inputSha256', 'resultSha256', 'input', 'result', 'recordedAt']) && v.version === 'own-payroll-saved.v1' && salaryUuid(v.id) && [v.algorithmSha256, v.inputSha256, v.resultSha256].every(salaryHash) && typeof v.recordedAt === 'string' && (!captureId || captureId === v.id) && (!algorithm || algorithm === v.algorithmSha256), 'RUN_CONTRACT_INVALID', 'No se pudo verificar el resultado persistido.');
  const input = normalizeOwnPayrollInput(v.input), r = v.result;
  require(salarySerialized(input) === salarySerialized(v.input), 'RUN_CONTRACT_INVALID', 'La entrada guardada no conserva su representación canónica.');
  require(salaryExact(r, ['version', 'period', 'liquidationType', 'selection', 'sourceVersions', 'employeeCount', 'rowCount', 'rows', 'employeeTotals', 'payrollCalculated', 'payrollPosted', 'municipalApprovalVerified', 'paymentExecuted']) && r.version === (input.version === 'own-payroll-input.v2' ? 'own-payroll-result.v2' : 'own-payroll-result.v1') && r.period === input.period && r.liquidationType === input.liquidationType && salarySerialized(r.selection) === salarySerialized(input.selection) && salarySerialized(r.sourceVersions) === salarySerialized(input.sourceVersions) && Array.isArray(r.rows) && r.rowCount === r.rows.length && Array.isArray(r.employeeTotals) && r.employeeCount === r.employeeTotals.length && r.employeeCount > 0 && r.payrollCalculated === true && r.payrollPosted === false && r.municipalApprovalVerified === false && r.paymentExecuted === false, 'RUN_CONTRACT_INVALID', 'El resultado no corresponde a las fuentes y al alcance de la corrida.');
  return v;
}

// Qué dato faltó al calcular. El servidor informa la clave que pidió la fórmula, de qué fuente sale y a cuántas de las
// personas elegidas les falta. El texto se arma acá, con vocabulario propio: nunca se muestra texto libre del servidor.
export const OWN_RUN_MISSING_SOURCES = Object.freeze({
  family_fact: 'los datos familiares del período', employment_fact: 'la antigüedad reconocida del contrato',
  salary_condition_fact: 'las condiciones salariales del contrato', working_time_fact: 'la jornada del contrato',
  conditional_working_time_fact: 'la jornada del contrato', agreement_time_fact: 'la jornada del convenio',
  classification_fact: 'la clasificación del contrato', period_fact: 'la participación en el período',
  period_context_fact: 'el contexto del período', monthly_amount: 'una novedad mensual', monthly_quantity: 'una novedad mensual',
  monthly_presence: 'una novedad mensual', fixed_quantity: 'una novedad fija', fixed_presence: 'una novedad fija'
});
export const OWN_RUN_MISSING_FIELDS = Object.freeze({
  spouse: 'cónyuge', children: 'hijos', childrenWithDisability: 'hijos con discapacidad', dependants: 'personas a cargo',
  largeFamily: 'familia numerosa', prenatal: 'prenatal', prenatalAdjustmentMonths: 'meses de ajuste prenatal',
  preschool: 'preescolar', preschoolWithDisability: 'preescolar con discapacidad', primary: 'primaria',
  primaryWithDisability: 'primaria con discapacidad', secondary: 'secundaria', secondaryWithDisability: 'secundaria con discapacidad',
  seniorityYears: 'años de antigüedad', partialSeniorityYears: 'antigüedad parcial', titleStatus: 'título', titleCode: 'código de título',
  titlePercentage: 'porcentaje de título', unhealthyWork: 'tarea insalubre', teacherPayEnabled: 'adicional docente',
  teacherReferenceAmount: 'importe de referencia docente', housingHigherDedicationPayEnabled: 'vivienda o mayor dedicación',
  payrollMonthBaseDays: 'días base del mes', monthlyHours: 'horas mensuales', dailyHours: 'horas diarias', categoryCode: 'categoría',
  baseUnits: 'unidades base', recognizedUnits: 'unidades reconocidas', monthNumber: 'mes'
});
export const OWN_RUN_MISSING_ALSO_MAX = 12;
const missingEntry = (v, people) => typeof v.key === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(v.key)
  && (v.sourceKind === null || typeof v.sourceKind === 'string' && Object.hasOwn(OWN_RUN_MISSING_SOURCES, v.sourceKind))
  && (v.sourceField === null || typeof v.sourceField === 'string' && Object.hasOwn(OWN_RUN_MISSING_FIELDS, v.sourceField))
  && Number.isSafeInteger(v.without) && v.without >= 1 && v.without <= people;
/** Devuelve el aviso normalizado o null. Sólo acepta la forma exacta, claves del vocabulario y conteos coherentes.
 *  «also» es opcional: otros datos sin valor que las fórmulas pedirían después, hallados con una simulación que no se guarda. */
export function ownRunMissing(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const keys = Object.keys(v).sort().join(',');
  if (keys !== 'key,people,sourceField,sourceKind,without' && keys !== 'also,key,people,sourceField,sourceKind,without') return null;
  if (!Number.isSafeInteger(v.people) || v.people < 1 || v.people > 10000 || !missingEntry(v, v.people)) return null;
  const base = { key: v.key, sourceKind: v.sourceKind, sourceField: v.sourceField, without: v.without, people: v.people };
  if (!Object.hasOwn(v, 'also')) return base;
  if (!Array.isArray(v.also) || v.also.length < 1 || v.also.length > OWN_RUN_MISSING_ALSO_MAX) return null;
  const seen = new Set([v.key]), also = [];
  for (const item of v.also) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).sort().join(',') !== 'key,sourceField,sourceKind,without' || !missingEntry(item, v.people) || seen.has(item.key)) return null;
    seen.add(item.key); also.push({ key: item.key, sourceKind: item.sourceKind, sourceField: item.sourceField, without: item.without });
  }
  return { ...base, also };
}
const missingLabel = m => (m.sourceKind === null ? 'un dato que usa la fórmula' : OWN_RUN_MISSING_SOURCES[m.sourceKind]) + (m.sourceField === null ? '' : ' (' + OWN_RUN_MISSING_FIELDS[m.sourceField] + ')');
export function ownRunMissingMessage(v) {
  const m = ownRunMissing(v); if (!m) return null;
  const first = 'Falta cargar ' + missingLabel(m) + ': sin valor en ' + m.without + ' de ' + m.people + (m.people === 1 ? ' persona elegida' : ' personas elegidas')
    + '. No se supuso cero. Completá ese dato, aprobalo y volvé a calcular. Clave en las reglas: ' + m.key + '.';
  if (!m.also) return first;
  return first + ' Después las fórmulas también van a pedir, según una simulación que no se guarda: '
    + m.also.map(a => missingLabel(a) + ', sin valor en ' + a.without + ' (clave ' + a.key + ')').join('; ') + '.';
}
