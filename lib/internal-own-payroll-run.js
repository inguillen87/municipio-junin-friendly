import {ownRunJurisdictions} from '../assets/own-payroll-jurisdiction-model.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { employeeContext } from './internal-native-employees.js';
import { salaryKey, salarySerialized } from '../assets/native-salary-catalog-model.js';
import { ownRunCommand, ownRunBootstrap, ownRunCapture, ownRunSaved, OWN_RUN_MAX_RESPONSE } from '../assets/own-payroll-run-model.js';
import { prepareOwnPayrollInput } from './own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from './own-payroll-snapshot.js';
import { OwnPayrollError } from '../assets/own-payroll-exact.js';
export const RUN_READ = ['workforce.employee.read', 'payroll.parameter.read', 'payroll.calculation.read'];
export const RUN_NOMINAL = [...RUN_READ, 'payroll.calculation.nominal.read', 'payroll.novelty.read', 'payroll.novelty.nominal.read', 'payroll.novelty.export'];
export const RUN_CALCULATE = [...RUN_NOMINAL, 'payroll.calculation.prepare'];
export const ownRunHash = v => createHash('sha256').update(salarySerialized(v)).digest('hex');
export function ownRunAlgorithmHash() {
  const files = [new URL('../assets/own-payroll-engine.js', import.meta.url), new URL('../assets/own-payroll-exact.js', import.meta.url), new URL('../assets/own-payroll-program-model.js', import.meta.url), new URL('../assets/native-salary-catalog-model.js', import.meta.url), new URL('../assets/payroll-native-monthly-model.js', import.meta.url), new URL('../assets/own-payroll-novelties-model.js', import.meta.url), new URL('../assets/payroll-fixed-novelties-model.js', import.meta.url), new URL('../assets/civil-date.js', import.meta.url), new URL('./own-payroll-approved-input.js', import.meta.url), new URL('./own-payroll-snapshot.js', import.meta.url)];
  return createHash('sha256').update(salarySerialized(files.map(url => ({ path: url.pathname.split('/').at(-1), sha256: createHash('sha256').update(fs.readFileSync(url)).digest('hex') })))).digest('hex');
}
export class OwnRunError extends Error { constructor(code, status, message) { super(message); Object.assign(this, { code: 'OWN_RUN_' + code, status }); } }
export const runFail = (code, status, message) => { throw new OwnRunError(code, status, message); };
const messages = {
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
  if (/PAYROLL_FIXED_IDENTITY_CHANGED|PAYROLL_NOVELTY_IDENTITY_CHANGED/.test(m)) return new OwnRunError('SOURCE_IDENTITY_CHANGED', 409, 'Cambió la identidad de una novedad del alcance elegido. Revisá el registro antes de otra captura.');
  if (/PAYROLL_FIXED_DATES_INVALID|PAYROLL_NOVELTY_PERIOD_OUTSIDE_EMPLOYMENT/.test(m)) return new OwnRunError('SOURCE_VIGENCY_INVALID', 422, 'Una novedad no tiene una vigencia laboral válida para el período completo. Revisá sus fechas.');
  for (const [code, [status, message]] of Object.entries(messages)) if (new RegExp('\\bOWN_RUN_' + code + '\\b').test(m)) return new OwnRunError(code, status, message);
  return new OwnRunError('UNAVAILABLE', 503, 'No se confirmó la corrida. Consultá el mismo intento antes de iniciar otro.');
}
function checkedResponse(v) { if (Buffer.byteLength(JSON.stringify({ ok: true, data: v }), 'utf8') > OWN_RUN_MAX_RESPONSE) runFail('LIMIT', 422, 'El conjunto completo supera la capacidad de recuperación de esta API. No se recortaron filas.'); return v; }
function checkedCapture(v, attempt) { ownRunCapture(v, attempt); checkedResponse(v); try{ownRunJurisdictions(v);}catch{runFail('CONTRACT_INVALID',503,'No se verificó la jurisdicción completa capturada.');} if (v.bodySha256 !== ownRunHash(v.body) || v.payloadSha256 !== ownRunHash(v.payload)) runFail('CONTRACT_INVALID', 503, 'No se pudieron verificar las fuentes congeladas.'); return v; }
function checkedSaved(v, capture, expected = null) {
  ownRunSaved(v, capture.id, capture.algorithmSha256);
  const p = capture.payload, input = v.input, versions = { population: p.population.version, rules: ownRunHash({ program: p.programState.program, salary: p.programState.salaryCatalog }), novelties: ownRunHash({ monthly: p.monthly, fixed: p.fixed.export.data }) };
  const fields = e => ({ contractId: e.contractId, employeeNumber: e.employeeNumber, agreementCode: e.agreementCode, departmentCode: e.departmentCode });
  if (v.inputSha256 !== ownRunHash(input) || v.resultSha256 !== ownRunHash(v.result) || input.period !== capture.body.period || input.liquidationType !== capture.body.liquidationType || salarySerialized(input.selection) !== salarySerialized(capture.body.selection) || salarySerialized(input.sourceVersions) !== salarySerialized(versions) || salarySerialized(input.rules) !== salarySerialized(p.programState.program.definition.rules) || input.totalsPrecision !== p.programState.program.definition.totalsPrecision || salarySerialized(input.employees.map(fields)) !== salarySerialized([...p.population.employees].sort((a, b) => a.contractId < b.contractId ? -1 : 1).map(fields)) || expected && (v.inputSha256 !== expected.inputSha256 || v.resultSha256 !== expected.resultSha256)) runFail('CONTRACT_INVALID', 503, 'No se pudo verificar el resultado contra la captura y el cálculo originales.');
  return v;
}
export function verifyOwnRunReceipt(value) {
  const capture=checkedCapture(value);
  if(capture.saved)checkedSaved(capture.saved,capture);
  return capture;
}
export async function ownRunOperation(sql, principal, session, operation, input = {}, deps = {}) {
  try {
    const ctx = JSON.stringify(employeeContext(principal, session));
    const query = async (q, values) => { const rows = await sql.query(q, values); return (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result; };
    if (operation === 'bootstrap') {
      const dated=input.contractVersion==='2';
      const v = await query(dated?'SELECT public.own_run_bootstrap_v2($1::jsonb) AS result':'SELECT public.own_run_bootstrap_v1($1::jsonb) AS result', [ctx]);
      if(dated && v?.version!=='own-payroll-bootstrap.v2')runFail('CONTRACT_INVALID',503,'No se verificó el contrato con fecha declarada.');
      return checkedResponse(ownRunBootstrap(v));
    }
    if (!salaryKey(input.key)) runFail('INPUT_INVALID', 428, 'La operación requiere una referencia de intento.');
    if (operation === 'attempt') {
      const c = checkedCapture(await query('SELECT public.own_run_attempt_v1($1::jsonb,$2::uuid) AS result', [ctx, input.key])); if (c.key !== input.key) runFail('CONTRACT_INVALID', 503, 'El recibo pertenece a otro intento.'); if (c.saved) checkedSaved(c.saved, c); return c;
    }
    if (operation !== 'calculate') runFail('INPUT_INVALID', 400, 'Operación no admitida.');
    const body = ownRunCommand(input.body), algorithm = (deps.algorithmHash ?? ownRunAlgorithmHash)();
    const capture = checkedCapture(await query('SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result', [ctx, JSON.stringify(body), input.key, algorithm]), { key: input.key, body });
    if (capture.saved) { checkedSaved(capture.saved, capture); return capture; }
    if (capture.algorithmSha256 !== algorithm) runFail('ENGINE_CHANGED', ...messages.ENGINE_CHANGED);
    const { sourceInventory: _audit, ...sources } = capture.payload;
    const snapshot = createOwnPayrollSnapshot(prepareOwnPayrollInput(sources));
    const saved = checkedSaved(await query('SELECT public.own_run_complete_v1($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::text) AS result', [ctx, capture.id, JSON.stringify(snapshot.input), JSON.stringify(snapshot.result), algorithm]), capture, snapshot);
    return checkedResponse({ ...capture, saved });
  } catch (e) { throw runError(e); }
}
