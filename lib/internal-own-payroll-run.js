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
import { prepareOwnPayrollInput } from './own-payroll-approved-input.js';
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
  if (/\bPAYROLL_FIXED_JURISDICTION_REQUIRED\b/.test(m)) return new OwnRunError('JURISDICTION_REQUIRED',422,'Este antecedente conserva la jurisdicción pendiente. Revisá y declarala antes de liquidar.');
  if (/\bOWN_CLOSE_REOPEN_REQUIRED\b/.test(m)) return new OwnRunError('REOPEN_REQUIRED',409,'Este legajo tiene una liquidación cerrada. Reabrí su grupo antes de calcular otra versión.');
  if (/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(m) || /SESSION_INVALID/.test(String(e?.code ?? ''))) return new OwnRunError('SESSION_INVALID', 401, 'La sesión venció. Volvé a ingresar.');
  if (/NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_SALARY_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT|CAPABILITY_REQUIRED|NOMINAL_READ_REQUIRED/.test(m)) return new OwnRunError('FORBIDDEN', 403, messages.FORBIDDEN[1]);
  if (/BUSY|lock_not_available/.test(m) || e?.code === '55P03') return new OwnRunError('BUSY', 409, messages.BUSY[1]);
  if (/PAYROLL_FIXED_ROW_LIMIT|OWN_PROGRAM_LIMIT|NATIVE_SALARY_LIMIT|\bPOSITION_(?:ASSIGNMENT|COMPARISON)_LIMIT\b/.test(m)) return new OwnRunError('LIMIT', 422, messages.LIMIT[1]);
  if (/\bPOSITION_ASSIGNMENT_CAPTURE_INVALID\b|\bPOSITION_COMPARISON_SOURCE_INVALID\b/.test(m)) return new OwnRunError('CONTRACT_INVALID', 503, 'No se verificó la fuente presupuestaria completa. No se creó una captura parcial.');
  if (/\bPOSITION_COMPARISON_IDENTITY_CHANGED\b/.test(m)) return new OwnRunError('SOURCE_IDENTITY_CHANGED', 409, 'Cambió la identidad de un contrato propio. Revisá el registro antes de otra captura.');
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
function checkedCapture(v, attempt,limit=OWN_RUN_MAX_RESPONSE) { ownRunCapture(v, attempt); checkedForcedDefinition(v.payload.programState.program.definition); checkedResponse(v,limit); try{ownRunJurisdictions(v);}catch{runFail('CONTRACT_INVALID',503,'No se verificó la jurisdicción completa capturada.');} if (v.bodySha256 !== ownRunHash(v.body) || v.payloadSha256 !== ownRunHash(v.payload)) runFail('CONTRACT_INVALID', 503, 'No se pudieron verificar las fuentes congeladas.'); if(ownProgramPeriodContext(v.payload.programState.program.definition)){const context=v.payload.periodContext,sources={employees:v.payload.population.employees,periodContext:context};for(const key of['employmentFacts','periodParticipation','workingTime','agreementWorkingTime','salaryConditions'])if(Object.hasOwn(v.payload,key))sources[key]=v.payload[key];if(context.sha256!==ownRunHash(periodContextFields(v.body.period))||v.payload.population.version!==ownRunHash(sources))runFail('CONTRACT_INVALID',503,'No se verificó el contexto original del período ni sus fuentes completas.');} return v; }
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
  try{recomputed=prepareOwnPayrollInput(sources);}catch{
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
function checkedSaved(v, capture, expected = null) {
  ownRunSaved(v, capture.id, capture.algorithmSha256);
  const p = capture.payload, input = v.input, versions = { population: p.population.version, rules: ownRunHash({ program: p.programState.program, salary: p.programState.salaryCatalog }), novelties: ownRunHash({ monthly: p.monthly, fixed: p.fixed.export.data }) };
  if (input.version !== (p.programState.program.definition.namespaceVersion === 'own-payroll-namespaces.v2' ? 'own-payroll-input.v2' : 'own-payroll-input.v1')) runFail('CONTRACT_INVALID', 503, 'La versión de referencias no corresponde al programa capturado.');
  if(ownPayrollConditions(input)!==ownPayrollConditions(p.programState.program.definition))runFail('CONTRACT_INVALID',503,'Las condiciones de la entrada no corresponden al programa capturado.');
  const fields = e => ({ contractId: e.contractId, employeeNumber: e.employeeNumber, agreementCode: e.agreementCode, departmentCode: e.departmentCode });
  if (v.inputSha256 !== ownRunHash(input) || v.resultSha256 !== ownRunHash(v.result) || input.period !== capture.body.period || input.liquidationType !== capture.body.liquidationType || salarySerialized(input.selection) !== salarySerialized(capture.body.selection) || salarySerialized(input.sourceVersions) !== salarySerialized(versions) || salarySerialized(input.rules) !== salarySerialized(participationRules(p.programState.program.definition)) || input.totalsPrecision !== p.programState.program.definition.totalsPrecision || salarySerialized(input.employees.map(fields)) !== salarySerialized([...p.population.employees].sort((a, b) => a.contractId < b.contractId ? -1 : 1).map(fields)) || expected && (v.inputSha256 !== expected.inputSha256 || v.resultSha256 !== expected.resultSha256)) runFail('CONTRACT_INVALID', 503, 'No se pudo verificar el resultado contra la captura y el cálculo originales.');
  checkedForcedInput(capture,input);
  checkedForcedResult(input,v.result);
  return v;
}
export function verifyOwnRunReceipt(value) {
  const capture=checkedCapture(value);
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
    const { sourceInventory: _audit, ...sources } = capture.payload;
    const snapshot = createOwnPayrollSnapshot(prepareOwnPayrollInput(sources));
    const completion=deps.fullJson===true?'own_run_complete_full_v1':'own_run_complete_v1';
    const saved = checkedSaved(await query('SELECT public.'+completion+'($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::text) AS result', [ctx, capture.id, JSON.stringify(snapshot.input), JSON.stringify(snapshot.result), algorithm]), capture, snapshot);
    return checkedResponse({ ...capture, saved },limit);
  } catch (e) { throw runError(e); }
}
