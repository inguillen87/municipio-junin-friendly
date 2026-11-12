import {cappedResultFields,verifyCappedSource} from '../assets/own-payroll-capped-deductions.js';
import {ownProgramPeriodContext,periodContextFields} from '../assets/own-payroll-period-context.js';
import { participationRules } from '../assets/own-period-participation-program.js';
import {ownPayrollConditions} from '../assets/own-payroll-conditions.js';
import {ownPayrollFamilyFacts,OWN_PAYROLL_FAMILY_FACTS_VERSION} from '../assets/own-payroll-family-facts.js';
import {OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';
import {ownRunJurisdictions} from '../assets/own-payroll-jurisdiction-model.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { employeeContext } from './internal-native-employees.js';
import { salaryExact, salaryHash, salaryKey, salarySerialized } from '../assets/native-salary-catalog-model.js';
import { ownRunCommand, ownRunBootstrap, ownRunCapture, ownRunSaved, OWN_RUN_MAX_RESPONSE } from '../assets/own-payroll-run-model.js';
import { prepareOwnPayrollInput, prepareOwnPayrollOfficialApprovedInput, prepareOwnPayrollRowEmissionApprovedInput, prepareOwnPayrollFamilyTariffApprovedInput } from './own-payroll-approved-input.js';
import { ownProgramOfficialTotals } from '../assets/own-payroll-official-program.js';
import { ownPayrollFamilyTariffs } from '../assets/own-payroll-family-tariffs.js';
import { ownProgramRowEmission } from '../assets/own-payroll-row-emission-program.js';
import { calculateOwnPayrollWithOfficialTotals } from '../assets/own-payroll-official-totals.js';
import { calculateOwnPayrollWithRowEmission, OWN_PAYROLL_EMISSION_INPUT_VERSION } from '../assets/own-payroll-row-emission.js';
import { ownHistoricalOfficialInput } from '../assets/own-payroll-historical-result-model.js';
import {verifyQuantityOnlyInput} from '../assets/own-payroll-quantity-only-capture.js';
import {verifyDeclaredAdjustmentInput} from '../assets/own-payroll-declared-adjustments-capture.js';
import { createOwnPayrollSnapshot } from './own-payroll-snapshot.js';
import { OwnPayrollError } from '../assets/own-payroll-exact.js';
export const RUN_READ = ['workforce.employee.read', 'payroll.parameter.read', 'payroll.calculation.read'];
export const RUN_NOMINAL = [...RUN_READ, 'payroll.calculation.nominal.read', 'payroll.novelty.read', 'payroll.novelty.nominal.read', 'payroll.novelty.export'];
export const RUN_CALCULATE = [...RUN_NOMINAL, 'payroll.calculation.prepare'];
export const ownRunHash = v => createHash('sha256').update(salarySerialized(v)).digest('hex');
export function ownRunAlgorithmHash() {
  // Capture the adapters and explicit period policy with the existing engine.
  const files = [new URL('../assets/own-contract-working-time-model.js', import.meta.url), new URL('../assets/own-salary-seniority-model.js', import.meta.url), new URL('../assets/employment-adoption-review-model.js', import.meta.url), new URL('../assets/own-payroll-engine.js', import.meta.url), new URL('../assets/own-payroll-exact.js', import.meta.url), new URL('../assets/own-payroll-program-model.js', import.meta.url), new URL('../assets/own-payroll-declared-adjustments.js', import.meta.url), new URL('../assets/own-payroll-declared-adjustments-capture.js', import.meta.url), new URL('../assets/own-payroll-capped-deductions.js', import.meta.url), new URL('../assets/own-payroll-capped-sources.js', import.meta.url), new URL('../assets/own-payroll-special-methods.js', import.meta.url), new URL('../assets/own-payroll-quantity-only-inputs.js', import.meta.url), new URL('../assets/own-payroll-quantity-only-capture.js', import.meta.url), new URL('../assets/native-salary-catalog-model.js', import.meta.url), new URL('../assets/payroll-native-monthly-model.js', import.meta.url), new URL('../assets/own-payroll-novelties-model.js', import.meta.url), new URL('../assets/payroll-fixed-novelties-model.js', import.meta.url), new URL('../assets/civil-date.js', import.meta.url), new URL('./own-payroll-approved-input.js', import.meta.url), new URL('./own-payroll-snapshot.js', import.meta.url)];
  files.push(new URL('../assets/own-period-participation-model.js', import.meta.url), new URL('../assets/own-period-participation-program.js', import.meta.url));
  files.push(new URL('../assets/payroll-operator-identity.js', import.meta.url));
  files.push(new URL('../assets/own-payroll-conditions.js',import.meta.url),new URL('../assets/own-contract-salary-conditions-model.js',import.meta.url),new URL('../assets/own-contract-salary-conditions-native-model.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-period-context.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-family-facts.js',import.meta.url),new URL('../assets/own-contract-family-payroll-facts-model.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-novelty-presence.js',import.meta.url));
  files.push(new URL('../assets/own-agreement-working-time-model.js',import.meta.url),new URL('../assets/own-agreement-working-time-program.js',import.meta.url));
  // El motor quedó repartido en módulos. Todo lo que evalúa una expresión, una cantidad, una tarifa familiar, el total
  // oficial o la emisión de renglones forma parte de la identidad del algoritmo, igual que los productores de la entrada.
  files.push(new URL('../assets/own-payroll-expression.js',import.meta.url),new URL('../assets/own-payroll-special-methods.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-quantity.js',import.meta.url),new URL('../assets/own-payroll-quantity-program.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-family-tariffs.js',import.meta.url),new URL('./own-payroll-family-tariff-source.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-policy-validity.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-optional-scales.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-conditional-sources.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-source-coverage.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-official-program.js',import.meta.url),new URL('../assets/own-payroll-official-totals.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-row-emission.js',import.meta.url),new URL('../assets/own-payroll-row-emission-program.js',import.meta.url));
  files.push(new URL('./own-payroll-nonapplication.js',import.meta.url),new URL('./own-payroll-programme-source-preparation.js',import.meta.url));
  // Importes mensuales forzados (609/649): el productor de la entrada resuelve su fuente con este módulo.
  files.push(new URL('../assets/own-payroll-monthly-forced-amounts.js',import.meta.url));
  // Módulos de los que depende el lector de adopción que usa el productor de la entrada.
  files.push(new URL('../assets/employment-adoption-mixed-cohort.js',import.meta.url),new URL('../assets/employment-adoption-operational-cohort.js',import.meta.url),new URL('../assets/employment-source-declarations.js',import.meta.url));
  return createHash('sha256').update(salarySerialized(files.map(url => ({ path: url.pathname.split('/').at(-1), sha256: createHash('sha256').update(fs.readFileSync(url)).digest('hex') })))).digest('hex');
}
export class OwnRunError extends Error { constructor(code, status, message) { super(message); Object.assign(this, { code: 'OWN_RUN_' + code, status }); } }
export const runFail = (code, status, message) => { throw new OwnRunError(code, status, message); };
const messages = {
  OPTIONAL_SCALE_CAPTURE_INVALID: [503, 'No se verificó el catálogo aprobado completo de las escalas opcionales. No se confirmó la corrida.'],
  OPTIONAL_SCALE_INPUT_INVALID: [503, 'El adicional no coincide con la configuración capturada o su ausencia demostrada. No se confirmó el resultado.'],
  FAMILY_APPROVAL_REQUIRED: [422, 'Falta la declaración familiar aprobada del contrato y período. Sin informar no equivale a cero.'],
  FAMILY_CAPTURE_INVALID: [503, 'No se verificó la captura familiar original completa. No se confirmó la corrida.'],
  FAMILY_INPUT_INVALID: [503, 'La entrada familiar no coincide con las declaraciones aprobadas capturadas. No se confirmó el resultado.'],
  INPUT_INVALID: [422, 'Revisá período, tipo y alcance completo.'], FORBIDDEN: [403, 'Tu cuenta no permite esta operación sobre las corridas.'], EMPLOYMENT_REQUIRED: [403, 'Se necesita una identidad municipal vinculada.'], NOT_FOUND: [404, 'No se encontró el intento en tu ámbito.'], SCOPE_CHANGED: [409, 'Cambió la cuenta o el ámbito. Recuperá el intento desde su cuenta original.'], PROGRAM_CHANGED: [409, 'Cambió el programa aprobado. Actualizá y revisá la selección.'], PROGRAM_REQUIRED: [422, 'Falta aprobar un programa compatible con el catálogo actual.'], SELECTION_INVALID: [422, 'No se verificó la totalidad de la población elegida.'], PRORATION_REQUIRED: [422, 'La vigencia laboral parcial requiere una política expresa de prorrateo.'], HISTORY_REQUIRED: [422, 'El encuadre de un período anterior requiere una fuente histórica propia verificada.'], IDEMPOTENCY_REUSE: [409, 'La referencia pertenece a otro contenido. Consultá el mismo intento.'], RESULT_CONFLICT: [409, 'La corrida ya tiene otro resultado; no se reemplazó.'], ENGINE_CHANGED: [409, 'La versión del motor cambió. Se conserva la captura anterior y no se recalcula con otra versión.'], LIMIT: [422, 'El conjunto supera la capacidad. No se recortaron registros.'], BUSY: [409, 'Otra operación está en curso. Consultá o reintentá el mismo envío.'],
};
export function runError(e) {
  if (e instanceof OwnRunError) return e;
  if (e instanceof OwnPayrollError) return new OwnRunError(e.code, /CONTRACT_INVALID/.test(e.code) ? 503 : 422, e.message);
  const m = String(e?.message ?? '');
  const quantityOnlyMessages={
    AMOUNT_INCOMPATIBLE:'Esta fórmula usa sólo la cantidad. La novedad declara además un importe sin tratamiento; revisá ese importe antes de calcular.',
    QUANTITY_REQUIRED:'Una novedad presente necesita cantidad informada. Revisá la fila; nulo no equivale a ausencia.',
    CHANNEL_INCOMPATIBLE:'La novedad proviene de un canal distinto al aprobado para esta cantidad. Revisá el canal mensual o fijo.',
    FORCED_INCOMPATIBLE:'La política de cantidad no admite Forzado. Revisá la novedad antes de calcular.',
    ORIGIN_INCOMPATIBLE:'La cantidad corresponde a otro mes. Necesita una política expresa de ajuste para ese período.',
    POLICY_REQUIRED:'Falta una política de cantidad vigente para el convenio, período y tipo elegidos.',
    CHANNEL_INCOMPLETE:'Falta verificar la población y los canales completos de novedades antes de calcular cantidades o acreditar ausencia.',
    IDENTITY_REQUIRED:'La novedad no conserva la identidad del contrato capturado. Revisá su fuente.',
    REVIEW_REQUIRED:'La fuente de cantidad necesita su revisión completa e independiente.',
    INPUT_CHANGED:'La cantidad o su referencia no coincide con las novedades originales de la captura. No se guardó el resultado.'
  };
  for(const[suffix,message]of Object.entries(quantityOnlyMessages))if(new RegExp('\\bQUANTITY_ONLY_'+suffix+'\\b').test(m))return new OwnRunError('QUANTITY_ONLY_'+suffix,422,message);
  if(/\bQUANTITY_ONLY_[A-Z_]+\b/.test(m))return new OwnRunError('QUANTITY_ONLY_CONTRACT_INVALID',503,'No se pudo verificar la política de cantidad contra la captura completa. Consultá el mismo intento.');
  const coverageErrors={
    SOURCE_COVERAGE_POLICY_REQUIRED:'Falta la cobertura de fuente para el convenio, período y tipo elegidos.',
    SOURCE_COVERAGE_CHANNEL_INCOMPLETE:'No se verificaron los tres canales completos de novedades; no se puede acreditar ausencia.',
    SOURCE_COVERAGE_UNKNOWN_EVENT:'Una novedad pertenece a un código fuera del inventario revisado.',
    SOURCE_COVERAGE_EXCLUDED_EVENT:'Reapareció una novedad de un concepto excluido; revisá su disposición antes de calcular.'
  };
  for(const[code,message]of Object.entries(coverageErrors))if(new RegExp('\\bOWN_RUN_'+code+'\\b').test(m))return new OwnRunError(code,422,message);
  if (/\bPAYROLL_FIXED_JURISDICTION_REQUIRED\b/.test(m)) return new OwnRunError('JURISDICTION_REQUIRED',422,'Este antecedente conserva la jurisdicción pendiente. Revisá y declarala antes de liquidar.');
  if (/\bOWN_CLOSE_REOPEN_REQUIRED\b/.test(m)) return new OwnRunError('REOPEN_REQUIRED',409,'Este legajo tiene una liquidación cerrada. Reabrí su grupo antes de calcular otra versión.');
  if (/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(m) || /SESSION_INVALID/.test(String(e?.code ?? ''))) return new OwnRunError('SESSION_INVALID', 401, 'La sesión venció. Volvé a ingresar.');
  if (/NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_SALARY_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT|CAPABILITY_REQUIRED|NOMINAL_READ_REQUIRED/.test(m)) return new OwnRunError('FORBIDDEN', 403, messages.FORBIDDEN[1]);
  if (/BUSY|lock_not_available/.test(m) || e?.code === '55P03') return new OwnRunError('BUSY', 409, messages.BUSY[1]);
  if (/PAYROLL_FIXED_ROW_LIMIT|OWN_PROGRAM_LIMIT|NATIVE_SALARY_LIMIT|FAMILY_PAYROLL_FACTS_LIMIT|\bPOSITION_(?:ASSIGNMENT|COMPARISON)_LIMIT\b/.test(m)) return new OwnRunError('LIMIT', 422, messages.LIMIT[1]);
  if (/\bFAMILY_PAYROLL_FACTS_IDENTITY_CHANGED\b/.test(m)) return new OwnRunError('SOURCE_IDENTITY_CHANGED',409,'Cambió la identidad de un contrato desde su declaración familiar aprobada. Revisá la fuente antes de otra captura.');
  if (/\bPOSITION_ASSIGNMENT_CAPTURE_INVALID\b|\bPOSITION_COMPARISON_SOURCE_INVALID\b/.test(m)) return new OwnRunError('CONTRACT_INVALID', 503, 'No se verificó la fuente presupuestaria completa. No se creó una captura parcial.');
  if (/\bPOSITION_COMPARISON_IDENTITY_CHANGED\b/.test(m)) return new OwnRunError('SOURCE_IDENTITY_CHANGED', 409, 'Cambió la identidad de un contrato propio. Revisá el registro antes de otra captura.');
  if (/PARTICIPATION_SOURCE_CHANGED|PARTICIPATION_IDENTITY_CHANGED/.test(m)) return new OwnRunError('SOURCE_IDENTITY_CHANGED',409,'Cambió el contrato o su historial desde la participación aprobada. Revisá su declaración antes de calcular.');
  if (/PAYROLL_FIXED_IDENTITY_CHANGED|PAYROLL_NOVELTY_IDENTITY_CHANGED/.test(m)) return new OwnRunError('SOURCE_IDENTITY_CHANGED', 409, 'Cambió la identidad de una novedad del alcance elegido. Revisá el registro antes de otra captura.');
  if (/PAYROLL_FIXED_DATES_INVALID|PAYROLL_NOVELTY_PERIOD_OUTSIDE_EMPLOYMENT/.test(m)) return new OwnRunError('SOURCE_VIGENCY_INVALID', 422, 'Una novedad no tiene una vigencia laboral válida para el período completo. Revisá sus fechas.');
  // Rechazos de la captura y del finalizador con total oficial. El primero es el único que la persona resuelve desde
  // Calcular: ese programa liquida un convenio por corrida.
  if (/\bOWN_RUN_OFFICIAL_MULTIPLE_AGREEMENTS_UNSUPPORTED\b/.test(m)) return new OwnRunError('SINGLE_AGREEMENT_REQUIRED', 422, 'Con las reglas vigentes se calcula un convenio por vez. Elegí un solo convenio. No se creó ningún cálculo.');
  if (/\bOWN_RUN_OFFICIAL_POLICY_REQUIRED\b/.test(m)) return new OwnRunError('OFFICIAL_POLICY_REQUIRED', 422, 'Las reglas aprobadas no definen los totales para ese convenio, período y tipo de liquidación. No se creó ningún cálculo.');
  if (/\bOWN_RUN_(?:OFFICIAL_PROGRAM|ROW_EMISSION_PROGRAM|FAMILY_TARIFF_V4)_REQUIRED\b/.test(m)) return new OwnRunError('PROGRAM_REQUIRED', 422, messages.PROGRAM_REQUIRED[1]);
  if (/\bOWN_RUN_(?:QUANTITY|OFFICIAL)_FAMILY_REQUIRED\b/.test(m)) return new OwnRunError('OFFICIAL_NOT_INSTALLED', 503, 'El cálculo con totales oficiales todavía no está instalado completo. No se creó ningún cálculo.');
  if (/\bOWN_RUN_(?:OFFICIAL|ROW_EMISSION|FAMILY_TARIFF)_[A-Z_]+\b/.test(m)) return new OwnRunError('CONTRACT_INVALID', 503, 'La base no pudo comprobar el cálculo con totales oficiales contra su captura. No se guardó el resultado.');
  for (const [code, [status, message]] of Object.entries(messages)) if (new RegExp('\\bOWN_RUN_' + code + '\\b').test(m)) return new OwnRunError(code, status, message);
  return new OwnRunError('UNAVAILABLE', 503, 'No se confirmó la corrida. Consultá el mismo intento antes de iniciar otro.');
}
function checkedResponse(v,limit=OWN_RUN_MAX_RESPONSE) { if (Buffer.byteLength(JSON.stringify({ ok: true, data: v }), 'utf8') > limit) runFail('LIMIT', 422, 'El conjunto completo supera la capacidad de recuperación de esta API. No se recortaron filas.'); return v; }
// Un resultado con total oficial (V4) o con política de emisión de renglones (V5) declara su versión en la entrada guardada.
// El validador histórico del sobre sólo conoce V1/V2: para estos valida el sobre sin el resultado, y el resultado se
// comprueba entero en checkedOfficialSaved.
const officialSaved = saved => ownHistoricalOfficialInput(saved?.input);
const officialProgram = capture => ownProgramOfficialTotals(capture.payload.programState.program.definition);
const capturedVersions = p => ({ population: p.population.version, rules: ownRunHash({ program: p.programState.program, salary: p.programState.salaryCatalog }), novelties: ownRunHash({ monthly: p.monthly, fixed: p.fixed.export.data }) });
// Cada característica del programa capturado elige su productor explícito: tarifa familiar diferida, emisión de renglones
// o sólo total oficial. Un programa sin total oficial sigue por la ruta histórica.
function officialInput(payload) {
  const definition = payload.programState.program.definition;
  return ownPayrollFamilyTariffs(definition) ? prepareOwnPayrollFamilyTariffApprovedInput(payload)
    : ownProgramRowEmission(definition) ? prepareOwnPayrollRowEmissionApprovedInput(payload) : prepareOwnPayrollOfficialApprovedInput(payload);
}
function officialSnapshot(payload) {
  const input = officialInput(payload), emission = input.version === OWN_PAYROLL_EMISSION_INPUT_VERSION;
  const result = emission ? calculateOwnPayrollWithRowEmission(input) : calculateOwnPayrollWithOfficialTotals(input);
  // La base registró al capturar qué tarifas y qué decisiones de emisión esperaba: la entrada y el resultado deben coincidir
  // con ese inventario antes de pedir que se guarden.
  const inventory = payload.sourceInventory ?? {}, tariffs = Object.hasOwn(input, 'familyTariffCapture'), same = (a, b) => salarySerialized(a) === salarySerialized(b);
  if (tariffs !== Object.hasOwn(inventory, 'familyTariffs') || tariffs && !same(input.familyTariffCapture, inventory.familyTariffs)) runFail('CONTRACT_INVALID', 503, 'La tarifa familiar de la entrada no coincide con la que quedó capturada. No se guardó el resultado.');
  const rows = inventory.rowEmission;
  if (emission !== Object.hasOwn(inventory, 'rowEmission') || emission && (rows.rulesSha256 !== input.sourceVersions.rules || rows.policiesSha256 !== ownRunHash(input.rowEmissionPolicies) || rows.populationVersion !== input.sourceVersions.population || rows.expectedDecisionCount !== result.emissionDecisionCount || !same(rows.contractIds, input.employees.map(e => e.contractId).sort()))) runFail('CONTRACT_INVALID', 503, 'La emisión de renglones calculada no coincide con el inventario capturado. No se guardó el resultado.');
  return { input, result, inputSha256: ownRunHash(input), resultSha256: ownRunHash(result) };
}
function checkedCapture(v, attempt,limit=OWN_RUN_MAX_RESPONSE) {
  ownRunCapture(officialSaved(v?.saved) ? { ...v, saved: null } : v, attempt); checkedResponse(v,limit);
  try { ownRunJurisdictions(v); } catch { runFail('CONTRACT_INVALID',503,'No se verificó la jurisdicción completa capturada.'); }
  if (v.bodySha256 !== ownRunHash(v.body) || v.payloadSha256 !== ownRunHash(v.payload)) runFail('CONTRACT_INVALID', 503, 'No se pudieron verificar las fuentes congeladas.');
  const p = v.payload, definition = p.programState.program.definition;
  if (ownProgramPeriodContext(definition) || ownPayrollFamilyFacts(definition)) {
    const sources = { employees: p.population.employees };
    for (const key of ['periodContext','employmentFacts','periodParticipation','workingTime','agreementWorkingTime','salaryConditions','familyPayrollFacts']) if (Object.hasOwn(p,key)) sources[key] = p[key];
    if (ownProgramPeriodContext(definition) && p.periodContext.sha256 !== ownRunHash(periodContextFields(v.body.period))
        || ownPayrollFamilyFacts(definition) && p.familyPayrollFacts.version !== ownRunHash([OWN_PAYROLL_FAMILY_FACTS_VERSION,v.body.period,p.familyPayrollFacts.records])
        || p.population.version !== ownRunHash(sources)) runFail('CONTRACT_INVALID',503,'No se verificó el período original ni sus fuentes completas.');
  }
  return v;
}
// Igual que con los históricos, leer un resultado oficial no lo vuelve a calcular: la base lo comprobó al guardarlo y la
// pantalla lo recalcula entero al abrirlo. Acá se exige que el contenido conserve sus huellas y que la entrada guardada sea
// exactamente la que producen las fuentes capturadas. Recién calculado, además, debe ser idéntico a lo calculado.
function checkedOfficialSaved(v, capture, expected) {
  const fail = () => runFail('CONTRACT_INVALID', 503, 'No se pudo verificar el resultado con total oficial contra su captura original.');
  const input = v?.input, result = v?.result, emission = input?.version === OWN_PAYROLL_EMISSION_INPUT_VERSION;
  const resultFields = [...cappedResultFields(input?.cappedDeductionsVersion?{cappedDeductionsVersion:input.cappedDeductionsVersion}:{}),'version', 'period', 'liquidationType', 'selection', 'sourceVersions', 'employeeCount', 'rowCount', 'rows', 'employeeTotals', 'payrollCalculated', 'payrollPosted', 'municipalApprovalVerified', 'paymentExecuted', 'quantityCount', 'quantities', 'officialTotalsVersion', 'officialTotalsPolicy', 'lineEmployeeTotals', 'totalReconciliations'];
  if (Object.hasOwn(input??{}, 'officialTotalsCapture')) resultFields.push('officialTotalsCapture');
  if (ownPayrollFamilyTariffs(input)) resultFields.push('familyTariffsVersion', 'familyTariffDecisionCount', 'familyTariffDecisions');
  if (emission) resultFields.push('rowEmissionVersion', 'rowEmissionPolicies', 'receiptRowCount', 'receiptRowKeys', 'emissionDecisionCount', 'rowEmissions');
  if (!salaryExact(v, ['version', 'id', 'algorithmSha256', 'inputSha256', 'resultSha256', 'input', 'result', 'recordedAt']) || v.version !== 'own-payroll-saved.v1' || v.id !== capture.id || v.algorithmSha256 !== capture.algorithmSha256 || ![v.inputSha256, v.resultSha256].every(salaryHash) || typeof v.recordedAt !== 'string'
      || !salaryExact(result, resultFields) || result.version !== (emission ? 'own-payroll-result.v5' : 'own-payroll-result.v4') || !Array.isArray(result.employeeTotals) || result.employeeCount !== result.employeeTotals.length || !Array.isArray(input.employees) || result.employeeCount !== input.employees.length || !Array.isArray(result.rows) || result.rowCount !== result.rows.length
      || result.payrollCalculated !== true || result.payrollPosted !== false || result.municipalApprovalVerified !== false || result.paymentExecuted !== false) fail();
  const p = capture.payload;
  verifyDeclaredAdjustmentInput(p,input,result);verifyQuantityOnlyInput(p,input);verifyCappedSource(p,input,result);
  if (v.inputSha256 !== ownRunHash(input) || v.resultSha256 !== ownRunHash(result) || input.period !== capture.body.period || input.liquidationType !== capture.body.liquidationType || salarySerialized(input.selection) !== salarySerialized(capture.body.selection)
      || result.officialTotalsVersion !== (input.officialTotalsCapture ? 'own-payroll-official-totals.v2' : 'own-payroll-official-totals.v1') || salarySerialized(result.officialTotalsPolicy) !== salarySerialized(input.officialTotalsPolicy) || salarySerialized(result.officialTotalsCapture??null) !== salarySerialized(input.officialTotalsCapture??null)
      || result.period !== input.period || result.liquidationType !== input.liquidationType || salarySerialized(result.selection) !== salarySerialized(input.selection)
      || salarySerialized(input.sourceVersions) !== salarySerialized(capturedVersions(p)) || salarySerialized(result.sourceVersions) !== salarySerialized(input.sourceVersions)
      || expected && (v.inputSha256 !== expected.inputSha256 || v.resultSha256 !== expected.resultSha256)) fail();
  if (expected) return v;
  let derived; try { derived = ownRunHash(officialInput(p)); } catch { fail(); }
  if (derived !== v.inputSha256) fail();
  return v;
}
function checkedSaved(v, capture, expected = null) {
  if (officialProgram(capture) !== officialSaved(v)) runFail('CONTRACT_INVALID', 503, 'La versión del resultado no corresponde al programa capturado.');
  return officialSaved(v) ? checkedOfficialSaved(v, capture, expected) : checkedHistoricalSaved(v, capture, expected);
}
function checkedHistoricalSaved(v, capture, expected = null) {
  ownRunSaved(v, capture.id, capture.algorithmSha256);
  const p = capture.payload, input = v.input, versions = capturedVersions(p);
  if (input.version !== (p.programState.program.definition.namespaceVersion === 'own-payroll-namespaces.v2' ? 'own-payroll-input.v2' : 'own-payroll-input.v1')) runFail('CONTRACT_INVALID', 503, 'La versión de referencias no corresponde al programa capturado.');
  if(ownPayrollConditions(input)!==ownPayrollConditions(p.programState.program.definition))runFail('CONTRACT_INVALID',503,'Las condiciones de la entrada no corresponden al programa capturado.');
  if(ownPayrollFamilyFacts(input)!==ownPayrollFamilyFacts(p.programState.program.definition))runFail('CONTRACT_INVALID',503,'Los hechos familiares de la entrada no corresponden al programa capturado.');
  // Only the opt-in consumer uses this additional proof. Reading a historical
  // receipt keeps its original input/result/algorithm hashes and never recalculates it.
  if(ownPayrollFamilyFacts(input)&&ownRunHash(prepareOwnPayrollInput(p))!==v.inputSha256)runFail('CONTRACT_INVALID',503,'La entrada familiar conservada no corresponde a las declaraciones aprobadas capturadas.');
  const fields = e => ({ contractId: e.contractId, employeeNumber: e.employeeNumber, agreementCode: e.agreementCode, departmentCode: e.departmentCode });
  if (v.inputSha256 !== ownRunHash(input) || v.resultSha256 !== ownRunHash(v.result) || input.period !== capture.body.period || input.liquidationType !== capture.body.liquidationType || salarySerialized(input.selection) !== salarySerialized(capture.body.selection) || salarySerialized(input.sourceVersions) !== salarySerialized(versions) || salarySerialized(input.rules) !== salarySerialized(participationRules(p.programState.program.definition)) || input.totalsPrecision !== p.programState.program.definition.totalsPrecision || salarySerialized(input.employees.map(fields)) !== salarySerialized([...p.population.employees].sort((a, b) => a.contractId < b.contractId ? -1 : 1).map(fields)) || expected && (v.inputSha256 !== expected.inputSha256 || v.resultSha256 !== expected.resultSha256)) runFail('CONTRACT_INVALID', 503, 'No se pudo verificar el resultado contra la captura y el cálculo originales.');
  return v;
}
export function verifyOwnRunReceipt(value,deps={}) {
  const capture=checkedCapture(value,null,deps.fullJson===true?OWN_RUN_FULL_MAX_BYTES:OWN_RUN_MAX_RESPONSE);
  if(capture.saved)checkedSaved(capture.saved,capture);
  return capture;
}
export async function ownRunOperation(sql, principal, session, operation, input = {}, deps = {}) {
  try {
    const limit=deps.fullJson===true?OWN_RUN_FULL_MAX_BYTES:OWN_RUN_MAX_RESPONSE;
    const ctx = JSON.stringify(employeeContext(principal, session));
    const query = async (q, values) => { const rows = await sql.query(q, values); return (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result; };
    if (operation === 'bootstrap') {
      const dated=input.contractVersion==='2';
      const v = await query(dated?'SELECT public.own_run_bootstrap_v2($1::jsonb) AS result':'SELECT public.own_run_bootstrap_v1($1::jsonb) AS result', [ctx]);
      if(dated && v?.version!=='own-payroll-bootstrap.v2')runFail('CONTRACT_INVALID',503,'No se verificó el contrato con fecha declarada.');
      return checkedResponse(ownRunBootstrap(v),limit);
    }
    if (!salaryKey(input.key)) runFail('INPUT_INVALID', 428, 'La operación requiere una referencia de intento.');
    if (operation === 'attempt') {
      const c = checkedCapture(await query('SELECT public.own_run_attempt_v1($1::jsonb,$2::uuid) AS result', [ctx, input.key]),null,limit); if (c.key !== input.key) runFail('CONTRACT_INVALID', 503, 'El recibo pertenece a otro intento.'); if (c.saved) checkedSaved(c.saved, c); return c;
    }
    if (operation !== 'calculate') runFail('INPUT_INVALID', 400, 'Operación no admitida.');
    const body = ownRunCommand(input.body), algorithm = (deps.algorithmHash ?? ownRunAlgorithmHash)();
    const capture = checkedCapture(await query('SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result', [ctx, JSON.stringify(body), input.key, algorithm]), { key: input.key, body },limit);
    if (capture.saved) { checkedSaved(capture.saved, capture); return capture; }
    if (capture.algorithmSha256 !== algorithm) runFail('ENGINE_CHANGED', ...messages.ENGINE_CHANGED);
    const official = officialProgram(capture);
    const sources=capture.payload; // Opt-in producers validate their captured source inventory.
    const snapshot = official ? officialSnapshot(capture.payload) : createOwnPayrollSnapshot(prepareOwnPayrollInput(sources));
    // El resultado con total oficial lo guarda su finalizador, que lo comprueba entero en la base antes de conservarlo.
    const completion = (official ? 'own_run_complete_official' : 'own_run_complete') + (deps.fullJson === true ? '_full_v1' : '_v1');
    const saved = checkedSaved(await query('SELECT public.'+completion+'($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::text) AS result', [ctx, capture.id, JSON.stringify(snapshot.input), JSON.stringify(snapshot.result), algorithm]), capture, snapshot);
    return checkedResponse({ ...capture, saved },limit);
  } catch (e) { throw runError(e); }
}
