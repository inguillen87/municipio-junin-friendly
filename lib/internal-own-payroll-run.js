import {monthlyDayDeclarationsApply,ownProgramParticipationSourceRequired} from '../assets/own-monthly-day-declaration-program.js';
import {approvedMonthlyDayInputs} from './own-monthly-day-declaration-input.js';
import {monthlyDayApplies} from '../assets/own-monthly-day-policy-program.js';
import {verifyMonthlyDayCapture} from './own-monthly-day-policy-input.js';
import {fixedForcedExpressionSet,ownFixedForcedRuleKey,normalizeFixedForcedAmountsPolicy} from '../assets/own-payroll-engine.js';
import {ownProgramPeriodContext,periodContextFields} from '../assets/own-payroll-period-context.js';
import { participationRules } from '../assets/own-period-participation-program.js';
import {ownPayrollConditions} from '../assets/own-payroll-conditions.js';
import {OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';
import {ownRunJurisdictions} from '../assets/own-payroll-jurisdiction-model.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { employeeContext } from './internal-native-employees.js';
import { salaryKey, salarySerialized, salaryExact } from '../assets/native-salary-catalog-model.js';
import { ownRunCommand, ownRunBootstrap, ownRunCapture, ownRunSaved, OWN_RUN_MAX_RESPONSE } from '../assets/own-payroll-run-model.js';
import { prepareOwnPayrollInput,prepareOwnPayrollInputComplete } from './own-payroll-approved-input.js';
import {fixedListV2,fixedExportV2} from '../assets/payroll-fixed-capacity-model.js';
import { createOwnPayrollSnapshot } from './own-payroll-snapshot.js';
import { OwnPayrollError, rational, exactEvidence, quantize, exactCompare } from '../assets/own-payroll-exact.js';
export const RUN_READ = ['workforce.employee.read', 'payroll.parameter.read', 'payroll.calculation.read'];
export const RUN_NOMINAL = [...RUN_READ, 'payroll.calculation.nominal.read', 'payroll.novelty.read', 'payroll.novelty.nominal.read', 'payroll.novelty.export'];
export const RUN_CALCULATE = [...RUN_NOMINAL, 'payroll.calculation.prepare'];
export const ownRunHash = v => createHash('sha256').update(salarySerialized(v)).digest('hex');
export function ownRunAlgorithmHash() {
  // Capture the adapters and explicit period policy with the existing engine.
  const files = [new URL('../assets/own-contract-working-time-model.js', import.meta.url), new URL('../assets/own-salary-seniority-model.js', import.meta.url), new URL('../assets/employment-adoption-review-model.js', import.meta.url), new URL('../assets/own-payroll-engine.js', import.meta.url), new URL('../assets/own-payroll-exact.js', import.meta.url), new URL('../assets/own-payroll-program-model.js', import.meta.url), new URL('../assets/native-salary-catalog-model.js', import.meta.url), new URL('../assets/payroll-native-monthly-model.js', import.meta.url), new URL('../assets/own-payroll-novelties-model.js', import.meta.url), new URL('../assets/payroll-fixed-novelties-model.js', import.meta.url), new URL('../assets/civil-date.js', import.meta.url), new URL('./own-payroll-approved-input.js', import.meta.url), new URL('./own-payroll-snapshot.js', import.meta.url)];
  files.push(new URL('../assets/own-period-participation-model.js', import.meta.url), new URL('../assets/own-period-participation-program.js', import.meta.url));
  files.push(new URL('../assets/own-payroll-conditions.js',import.meta.url),new URL('../assets/own-contract-salary-conditions-model.js',import.meta.url));
  files.push(new URL('../assets/own-payroll-period-context.js',import.meta.url));
  files.push(new URL('../assets/own-agreement-working-time-model.js',import.meta.url),new URL('../assets/own-agreement-working-time-program.js',import.meta.url));
  files.push(new URL('./internal-own-payroll-run.js',import.meta.url));
  files.push(new URL('../assets/payroll-fixed-capacity-model.js',import.meta.url));
  files.push(new URL('../assets/employment-adoption-mixed-cohort.js',import.meta.url),new URL('../assets/employment-adoption-operational-cohort.js',import.meta.url),new URL('../assets/employment-source-declarations.js',import.meta.url),new URL('../assets/native-employee-contract.js',import.meta.url),new URL('../assets/native-employment-catalog-model.js',import.meta.url),new URL('../assets/native-employment-lifecycle-model.js',import.meta.url),new URL('../assets/own-monthly-day-declaration-model.js',import.meta.url),new URL('../assets/own-monthly-day-declaration-program.js',import.meta.url),new URL('../assets/own-monthly-day-policy-model.js',import.meta.url),new URL('../assets/own-monthly-day-policy-program.js',import.meta.url),new URL('./own-monthly-day-declaration-input.js',import.meta.url),new URL('./own-monthly-day-policy-input.js',import.meta.url),new URL('../assets/own-payroll-run-model.js',import.meta.url));
  return createHash('sha256').update(salarySerialized(files.map(url => ({ path: url.pathname.split('/').at(-1), sha256: createHash('sha256').update(fs.readFileSync(url)).digest('hex') })))).digest('hex');
}
export class OwnRunError extends Error { constructor(code, status, message) { super(message); Object.assign(this, { code: 'OWN_RUN_' + code, status }); } }
export const runFail = (code, status, message) => { throw new OwnRunError(code, status, message); };
const messages = {
  FORCED_RULE_REQUIRED: [422, 'El importe forzado necesita una política aprobada y compatible; no se aplicó un reemplazo implícito.'],
  FORCED_POLICY_INVALID: [422, 'No se verificó la política completa del importe fijo forzado.'],
  FORCED_LINEAGE_REQUIRED: [422, 'Falta la declaración de procedencia revisada del programa.'],
  FORCED_SOURCE_COLLISION: [422, 'Hay más de una novedad para el mismo contrato y concepto forzado; no se eligió ni sumó una fuente.'],
  FORCED_AMOUNT_MISSING: [422, 'Falta el importe fijo forzado; sin informar no equivale a cero.'],
  FORCED_QUANTITY_UNKNOWN: [422, 'El programa exige una cantidad que el importe forzado no acredita.'],
  FORCED_PRECISION_LOSS: [422, 'La precisión aprobada alteraría el importe forzado; no se redondeó de otra manera.'],
  FORCED_SOURCE_CHANGED: [422, 'El importe forzado no coincide con la fuente y política capturadas.'],
  SOURCE_UNUSED: [422, 'Hay una novedad aprobada sin tratamiento en el programa; no se omitieron filas.'],
  INPUT_INVALID: [422, 'Revisá período, tipo y alcance completo.'], FORBIDDEN: [403, 'Tu cuenta no permite esta operación sobre las corridas.'], EMPLOYMENT_REQUIRED: [403, 'Se necesita una identidad municipal vinculada.'], NOT_FOUND: [404, 'No se encontró el intento en tu ámbito.'], SCOPE_CHANGED: [409, 'Cambió la cuenta o el ámbito. Recuperá el intento desde su cuenta original.'], PROGRAM_CHANGED: [409, 'Cambió el programa aprobado. Actualizá y revisá la selección.'], PROGRAM_REQUIRED: [422, 'Falta aprobar un programa compatible con el catálogo actual.'], SELECTION_INVALID: [422, 'No se verificó la totalidad de la población elegida.'], PRORATION_REQUIRED: [422, 'La vigencia laboral parcial requiere una política expresa de prorrateo.'], HISTORY_REQUIRED: [422, 'El encuadre de un período anterior requiere una fuente histórica propia verificada.'], IDEMPOTENCY_REUSE: [409, 'La referencia pertenece a otro contenido. Consultá el mismo intento.'], RESULT_CONFLICT: [409, 'La corrida ya tiene otro resultado; no se reemplazó.'], ENGINE_CHANGED: [409, 'La versión del motor cambió. Se conserva la captura anterior y no se recalcula con otra versión.'], LIMIT: [422, 'El conjunto supera la capacidad. No se recortaron registros.'], BUSY: [409, 'Otra operación está en curso. Consultá o reintentá el mismo envío.'],
};
export function runError(e) {
  if (e instanceof OwnRunError) return e;
  if (e instanceof OwnPayrollError) return new OwnRunError(e.code, /CONTRACT_INVALID/.test(e.code) ? 503 : 422, e.message);
  const m = String(e?.message ?? '');
  if (/\bMONTHLY_DAY_PARTIAL_UNSUPPORTED\b/.test(m)) return new OwnRunError('MONTHLY_DAY_PARTIAL_UNSUPPORTED',422,'La selección incluye un período parcial que necesita una base de días aprobada. No se omitió ningún contrato.');
  if (/\bMONTHLY_DAY_DATES_REQUIRED\b/.test(m)) return new OwnRunError('MONTHLY_DAY_DATES_REQUIRED',422,'Verificá las fechas laborales propias de toda la selección; no se supone cobertura del mes.');
  if (/\bMONTHLY_DAY_(?:PROGRAM_CHANGED|SOURCE_CHANGED|SCOPE_CHANGED)\b/.test(m)) return new OwnRunError('MONTHLY_DAY_SOURCE_CHANGED',409,'Cambió el programa, el ámbito o la fuente de días. Actualizá antes de otra captura.');
  if (/\bMONTHLY_DAY_(?:TYPE_UNSUPPORTED|CAPTURE_INVALID)\b/.test(m)) return new OwnRunError('MONTHLY_DAY_CONTRACT_INVALID',503,'No se verificó la captura mensual completa. Consultá el mismo intento antes de continuar.');
  if (/\bPAYROLL_FIXED_JURISDICTION_REQUIRED\b/.test(m)) return new OwnRunError('JURISDICTION_REQUIRED',422,'Este antecedente conserva la jurisdicción pendiente. Revisá y declarala antes de liquidar.');
  if (/\bOWN_CLOSE_REOPEN_REQUIRED\b/.test(m)) return new OwnRunError('REOPEN_REQUIRED',409,'Este legajo tiene una liquidación cerrada. Reabrí su grupo antes de calcular otra versión.');
  if (/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(m) || /SESSION_INVALID/.test(String(e?.code ?? ''))) return new OwnRunError('SESSION_INVALID', 401, 'La sesión venció. Volvé a ingresar.');
  if (/NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_SALARY_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT|CAPABILITY_REQUIRED|NOMINAL_READ_REQUIRED/.test(m)) return new OwnRunError('FORBIDDEN', 403, messages.FORBIDDEN[1]);
  if (/BUSY|lock_not_available/.test(m) || e?.code === '55P03') return new OwnRunError('BUSY', 409, messages.BUSY[1]);
  if (/PAYROLL_FIXED_ROW_LIMIT|OWN_PROGRAM_LIMIT|NATIVE_SALARY_LIMIT|\bPOSITION_(?:ASSIGNMENT|COMPARISON)_LIMIT\b/.test(m)) return new OwnRunError('LIMIT', 422, messages.LIMIT[1]);
  if (/\bPOSITION_ASSIGNMENT_CAPTURE_INVALID\b|\bPOSITION_COMPARISON_SOURCE_INVALID\b/.test(m)) return new OwnRunError('CONTRACT_INVALID', 503, 'No se verificó la fuente presupuestaria completa. No se creó una captura parcial.');
  if (/\bPOSITION_COMPARISON_IDENTITY_CHANGED\b/.test(m)) return new OwnRunError('SOURCE_IDENTITY_CHANGED', 409, 'Cambió la identidad de un contrato propio. Revisá el registro antes de otra captura.');
  if (/MONTHLY_DAY_DECLARATION_/.test(String(e?.code??''))||/MONTHLY_DAY_DECLARATION_/.test(m)) return new OwnRunError('DECLARED_DAYS_INVALID',422,'No se verificaron los días declarados y aprobados para toda la selección. Revisá la declaración vigente; no se calculó un resultado parcial.');
  if (/PARTICIPATION_SOURCE_CHANGED|PARTICIPATION_IDENTITY_CHANGED/.test(m)) return new OwnRunError('SOURCE_IDENTITY_CHANGED',409,'Cambió el contrato o su historial desde la participación aprobada. Revisá su declaración antes de calcular.');
  if (/PAYROLL_FIXED_IDENTITY_CHANGED|PAYROLL_NOVELTY_IDENTITY_CHANGED/.test(m)) return new OwnRunError('SOURCE_IDENTITY_CHANGED', 409, 'Cambió la identidad de una novedad del alcance elegido. Revisá el registro antes de otra captura.');
  if (/PAYROLL_FIXED_DATES_INVALID|PAYROLL_NOVELTY_PERIOD_OUTSIDE_EMPLOYMENT/.test(m)) return new OwnRunError('SOURCE_VIGENCY_INVALID', 422, 'Una novedad no tiene una vigencia laboral válida para el período completo. Revisá sus fechas.');
  // Only the three definition-validator errors emitted by this feature cross
  // programme/capture boundaries; unrelated SQL failures retain their mapping.
  for(const code of ['FORCED_POLICY_INVALID','FORCED_LINEAGE_REQUIRED','FORCED_SOURCE_CHANGED'])
    if(new RegExp('\\bOWN_PROGRAM_'+code+'\\b').test(m))return new OwnRunError(code,...messages[code]);
  for (const [code, [status, message]] of Object.entries(messages)) if (new RegExp('\\bOWN_RUN_' + code + '\\b').test(m)) return new OwnRunError(code, status, message);
  return new OwnRunError('UNAVAILABLE', 503, 'No se confirmó la corrida. Consultá el mismo intento antes de iniciar otro.');
}
function checkedResponse(v,limit=OWN_RUN_MAX_RESPONSE) { if (Buffer.byteLength(JSON.stringify({ ok: true, data: v }), 'utf8') > limit) runFail('LIMIT', 422, 'El conjunto completo supera la capacidad de recuperación de esta API. No se recortaron filas.'); return v; }
function completeFixedCapture(capture){
 const p=capture.payload,l=p?.fixed?.list?.data?.version,e=p?.fixed?.export?.data?.version;
 if(l==='payroll-fixed-list.v1'&&e==='payroll-fixed-export.v1')return false;
 if(l!=='payroll-fixed-list.v2'||e!=='payroll-fixed-export.v2')runFail('CONTRACT_INVALID',503,'La captura mezcla contratos de novedades o no conserva su versión completa.');
 try{
  const list=fixedListV2(p.fixed.list,capture.body.period+'-01'),exported=fixedExportV2(p.fixed.export,list),a=p.sourceInventory;
  if(a.fixedCapacityVersion!=='payroll-fixed-capacity.v2'||salarySerialized(a.fixedCounts)!==salarySerialized(list.counts)||a.fixedListCount!==list.total||a.fixedExportCount!==exported.total||a.fixedSnapshotToken!==list.snapshotToken||a.fixedExportSha256!==ownRunHash(exported))throw Error('fixed inventory');
  return true;
 }catch{runFail('CONTRACT_INVALID',503,'No se verificó la captura completa de novedades ni sus cantidades.');}
}
const adapterFor=capture=>completeFixedCapture(capture)?prepareOwnPayrollInputComplete:prepareOwnPayrollInput;
function checkedMonthlyDayInventory(capture){
 const p=capture.payload,a=p.sourceInventory,definition=p.programState.program.definition;
 const has192=monthlyDayApplies(definition,capture.body.liquidationType),has193=monthlyDayDeclarationsApply(definition,capture.body.liquidationType);
 if(!a||typeof a!=='object')runFail('CONTRACT_INVALID',503,'Falta el inventario completo capturado.');
 for(const [key,enabled]of [['monthlyDays',has192],['monthlyDayDeclarations',has193]])if(Object.hasOwn(a,key)!==enabled)runFail('CONTRACT_INVALID',503,'El inventario de días no coincide con el programa y tipo capturados.');
 if(has192){const f=p.monthlyDays,v=a.monthlyDays;
  if(!salaryExact(v,['version','total','complete','authority','programApprovalId'])||v.version!==f.version||v.total!==f.records.length||v.complete!==true||v.authority!=='approved_program_full_month'||v.programApprovalId!==p.programState.program.approvalId)runFail('CONTRACT_INVALID',503,'No se verificó el inventario de días del programa aprobado.');
 }
 if(has193){const f=p.monthlyDayDeclarations,v=a.monthlyDayDeclarations;
  if(!salaryExact(v,['version','total','complete','authority'])||v.version!==f.version||v.total!==f.records.length||v.complete!==true||v.authority!=='independently_approved_monthly_declaration')runFail('CONTRACT_INVALID',503,'No se verificó el inventario de declaraciones de días aprobadas.');
 }
 return capture;
}
function checkedCapture(v, attempt,limit=OWN_RUN_MAX_RESPONSE) { ownRunCapture(v, attempt); completeFixedCapture(v); checkedForcedDefinition(v.payload.programState.program.definition); checkedMonthlyDayInventory(v); if(monthlyDayDeclarationsApply(v.payload.programState.program.definition,v.body.liquidationType))approvedMonthlyDayInputs(v.payload.monthlyDayDeclarations,v.payload.population.employees,v.body.period); checkedResponse(v,limit); try{ownRunJurisdictions(v);}catch{runFail('CONTRACT_INVALID',503,'No se verificó la jurisdicción completa capturada.');} if (v.bodySha256 !== ownRunHash(v.body) || v.payloadSha256 !== ownRunHash(v.payload)) runFail('CONTRACT_INVALID', 503, 'No se pudieron verificar las fuentes congeladas.'); if(monthlyDayApplies(v.payload.programState.program.definition,v.body.liquidationType)){verifyMonthlyDayCapture(v.payload.monthlyDays,v.payload.population.employees,v.body.period,v.payload.monthlyDaysScope,v.payload.programState.program);if(v.payload.monthlyDaysScope.scopeVersion!==v.payload.programState.scopeVersion)runFail('CONTRACT_INVALID',503,'Cambió el ámbito capturado de días.');}
 if(ownProgramPeriodContext(v.payload.programState.program.definition)||monthlyDayApplies(v.payload.programState.program.definition,v.body.liquidationType)||monthlyDayDeclarationsApply(v.payload.programState.program.definition,v.body.liquidationType)){const context=v.payload.periodContext,sources={employees:v.payload.population.employees,...(context?{periodContext:context}:{})};if(monthlyDayApplies(v.payload.programState.program.definition,v.body.liquidationType)){sources.monthlyDays=v.payload.monthlyDays;sources.monthlyDaysScope=v.payload.monthlyDaysScope;}for(const key of['employmentFacts','periodParticipation','workingTime','agreementWorkingTime','salaryConditions','monthlyDayDeclarations'])if(Object.hasOwn(v.payload,key))sources[key]=v.payload[key];if(context&&context.sha256!==ownRunHash(periodContextFields(v.body.period))||v.payload.population.version!==ownRunHash(sources))runFail('CONTRACT_INVALID',503,'No se verificó el contexto original del período ni sus fuentes completas.');} return v; }
const forcedFeatureKeys = ['fixedForcedAmountsVersion','fixedForcedAmountsPolicy'];
const hasForcedFeature = value => forcedFeatureKeys.some(key => Object.hasOwn(value ?? {},key));
function checkedForcedDefinition(definition) {
  if (!hasForcedFeature(definition)) return false;
  // This binds the current native AST. Documentary lineage remains a reviewed
  // declaration; neither its digest nor this check proves historical U coverage.
  const policy=definition.fixedForcedAmountsPolicy;
  try{
    if(definition.fixedForcedAmountsVersion!=='own-fixed-forced-amount.v1'||definition.namespaceVersion!=='own-payroll-namespaces.v2'||
      salarySerialized(normalizeFixedForcedAmountsPolicy(policy,definition.rules))!==salarySerialized(policy)||
      policy.quantityLineage.expressionSetSha256!==ownRunHash(fixedForcedExpressionSet(definition.rules,policy.policies)))throw Error('forced definition');
  }catch{runFail('CONTRACT_INVALID',503,'La declaración de procedencia no conserva la política y el AST aprobado capturados.');}
  return true;
}
function checkedForcedInput(capture,input) {
  const definition=capture.payload.programState.program.definition,enabled=checkedForcedDefinition(definition);
  if(enabled!==hasForcedFeature(input)||!enabled&&input.employees.some(e=>Object.hasOwn(e,'fixedForcedAmounts')))
    runFail('CONTRACT_INVALID',503,'La entrada no conserva la versión de importes forzados del programa capturado.');
  if(!enabled)return;
  if(forcedFeatureKeys.some(key=>salarySerialized(input[key])!==salarySerialized(definition[key])))
    runFail('CONTRACT_INVALID',503,'La entrada no conserva la política de importes forzados capturada.');
  const {sourceInventory:_inventory,...sources}=capture.payload;let recomputed;
  try{recomputed=adapterFor(capture)(sources);}catch{
    runFail('CONTRACT_INVALID',503,'No se verificó el ledger de importes forzados contra las fuentes completas capturadas.');
  }
  if(salarySerialized(recomputed)!==salarySerialized(input))
    runFail('CONTRACT_INVALID',503,'La entrada o el ledger no corresponden a las identidades, aprobaciones y valores capturados.');
}
function checkedForcedResult(input,result) {
  if(!hasForcedFeature(input))return;
  try{
    for(const employee of input.employees)for(const ledger of employee.fixedForcedAmounts){
      const rule=input.rules.find(r=>ownFixedForcedRuleKey(r)===ledger.ruleKey),
        rows=result.rows.filter(r=>r.contractId===employee.contractId&&r.conceptCode===rule.code&&r.nature===rule.nature),
        exact=rational(BigInt(ledger.amountCents),100n),rounded=quantize(exact,rule.rounding),
        evidence=exactEvidence(exact),reference=[ledger.recordId,ledger.recordVersion,ledger.proposalId,ledger.policySha256,ledger.sourceRowSha256].join(':');
      if(rows.length!==1||exactCompare(exact,rounded.value)!==0)throw Error('forced result');
      const row=rows[0];
      if(!salaryExact(row,['contractId','employeeNumber','agreementCode','departmentCode','conceptCode','nature','unit','amount','exactValue','rounding','ruleReference','dependencies','trace'])||['employeeNumber','agreementCode','departmentCode'].some(k=>row[k]!==employee[k])||row.unit!==rule.unit||row.ruleReference!==rule.ruleReference||row.amount!==rounded.amount||
        salarySerialized(row.rounding)!==salarySerialized(rule.rounding)||salarySerialized(row.exactValue)!==salarySerialized(evidence)||
        salarySerialized(row.dependencies)!=='[]'||salarySerialized(row.trace)!==salarySerialized([{operation:'fixed_forced_amount',reference,stage:'exact',result:evidence}]))throw Error('forced result');
    }
  }catch{runFail('CONTRACT_INVALID',503,'El resultado forzado no conserva el importe, la regla y la procedencia de la entrada capturada.');}
}
function checkedMonthlyDaySavedInput(capture,input) {
  const definition=capture.payload.programState.program.definition;
  // The forced path already verifies the whole adapted input below its own
  // contract. This adds the same frozen-source check for ordinary193 recovery,
  // without calculating a result or comparing against any current database read.
  if(!monthlyDayDeclarationsApply(definition,capture.body.liquidationType)||hasForcedFeature(definition))return;
  const {sourceInventory:_inventory,...sources}=capture.payload;let recomputed;
  try{recomputed=adapterFor(capture)(sources);}catch{
    runFail('CONTRACT_INVALID',503,'No se verificó la entrada de días aprobados contra las fuentes completas capturadas.');
  }
  if(salarySerialized(recomputed)!==salarySerialized(input))
    runFail('CONTRACT_INVALID',503,'La entrada de días o su procedencia no corresponden a la aprobación congelada.');
}
function checkedSaved(v, capture, expected = null) {
  ownRunSaved(v, capture.id, capture.algorithmSha256);
  if(monthlyDayDeclarationsApply(capture.payload.programState.program.definition,capture.body.liquidationType)&&ownProgramParticipationSourceRequired(capture.payload.programState.program.definition,capture.body.liquidationType)!==Object.hasOwn(capture.payload,'periodParticipation'))runFail('CONTRACT_INVALID',503,'Las fuentes guardadas no corresponden a las entradas explícitas del programa.');
  const p = capture.payload, input = v.input, versions = { population: p.population.version, rules: ownRunHash({ program: p.programState.program, salary: p.programState.salaryCatalog }), novelties: ownRunHash({ monthly: p.monthly, fixed: p.fixed.export.data }) };
  if (input.version !== (p.programState.program.definition.namespaceVersion === 'own-payroll-namespaces.v2' ? 'own-payroll-input.v2' : 'own-payroll-input.v1')) runFail('CONTRACT_INVALID', 503, 'La versión de referencias no corresponde al programa capturado.');
  if(ownPayrollConditions(input)!==ownPayrollConditions(p.programState.program.definition))runFail('CONTRACT_INVALID',503,'Las condiciones de la entrada no corresponden al programa capturado.');
  const fields = e => ({ contractId: e.contractId, employeeNumber: e.employeeNumber, agreementCode: e.agreementCode, departmentCode: e.departmentCode });
  if (v.inputSha256 !== ownRunHash(input) || v.resultSha256 !== ownRunHash(v.result) || input.period !== capture.body.period || input.liquidationType !== capture.body.liquidationType || salarySerialized(input.selection) !== salarySerialized(capture.body.selection) || salarySerialized(input.sourceVersions) !== salarySerialized(versions) || salarySerialized(input.rules) !== salarySerialized(participationRules(p.programState.program.definition)) || input.totalsPrecision !== p.programState.program.definition.totalsPrecision || salarySerialized(input.employees.map(fields)) !== salarySerialized([...p.population.employees].sort((a, b) => a.contractId < b.contractId ? -1 : 1).map(fields)) || expected && (v.inputSha256 !== expected.inputSha256 || v.resultSha256 !== expected.resultSha256)) runFail('CONTRACT_INVALID', 503, 'No se pudo verificar el resultado contra la captura y el cálculo originales.');
  checkedForcedInput(capture,input);
  checkedMonthlyDaySavedInput(capture,input);
  checkedForcedResult(input,v.result);
  return v;
}
export function verifyOwnRunReceipt(value,{fullJson=false}={}) {
  // Negotiated wire capacity never chooses or relabels the stored fixed version.
  const capture=checkedCapture(value,null,fullJson===true?OWN_RUN_FULL_MAX_BYTES:OWN_RUN_MAX_RESPONSE);
  if(capture.saved)checkedSaved(capture.saved,capture);
  return capture;
}
export async function ownRunOperation(sql, principal, session, operation, input = {}, deps = {}) {
  try {
    const limit=deps.fullJson===true?OWN_RUN_FULL_MAX_BYTES:OWN_RUN_MAX_RESPONSE;
    const fixedV2=deps.fixedV2===true;
    if(fixedV2&&deps.fullJson!==true)runFail('INPUT_INVALID',406,'El cálculo con novedades completas requiere lectura completa acordada.');
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
    const capture = checkedCapture(await query(fixedV2?'SELECT public.own_run_capture_fixed_full_v2($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result':'SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result', [ctx, JSON.stringify(body), input.key, algorithm]), { key: input.key, body },limit);
    if(fixedV2&&!capture.replayed&&!completeFixedCapture(capture))runFail('CONTRACT_INVALID',503,'La nueva captura no conserva el protocolo completo solicitado.');
    if (capture.saved) { checkedSaved(capture.saved, capture); return capture; }
    if (capture.algorithmSha256 !== algorithm) runFail('ENGINE_CHANGED', ...messages.ENGINE_CHANGED);
    const { sourceInventory: _audit, ...sources } = capture.payload;
    const snapshot = createOwnPayrollSnapshot(adapterFor(capture)(sources));
    const completion=completeFixedCapture(capture)?(deps.fullJson===true?'own_run_complete_fixed_full_v2':'own_run_complete_fixed_v2'):(deps.fullJson===true?'own_run_complete_full_v1':'own_run_complete_v1');
    const saved = checkedSaved(await query('SELECT public.'+completion+'($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::text) AS result', [ctx, capture.id, JSON.stringify(snapshot.input), JSON.stringify(snapshot.result), algorithm]), capture, snapshot);
    return checkedResponse({ ...capture, saved },limit);
  } catch (e) { throw runError(e); }
}
