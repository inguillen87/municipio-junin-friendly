import {ownRunDateLabel} from './own-payroll-run-date.js';
import {ownRunJurisdictions} from './own-payroll-jurisdiction-model.js';
import { ownRunCommand, ownRunCapture } from './own-payroll-run-model.js';
import { salarySerialized, salaryUuid } from './native-salary-catalog-model.js';

export const OWN_RUN_READ = Object.freeze(['workforce.employee.read','payroll.parameter.read','payroll.calculation.read']);
export const OWN_RUN_NOMINAL = Object.freeze([...OWN_RUN_READ,'payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export']);
export const OWN_RUN_PREPARE = Object.freeze([...OWN_RUN_NOMINAL,'payroll.calculation.prepare']);
export const OWN_RUN_TYPES = Object.freeze({monthly:'Mensual',first_fortnight:'Primera quincena',sac:'Aguinaldo',vacation:'Vacaciones',supplementary:'Suplementaria',final:'Final',other:'Otra'});
export const OWN_RUN_NATURES = Object.freeze({remuneration:'Remunerativo',non_remuneration:'No remunerativo',deduction:'Retención',employer_contribution:'Aporte patronal',auxiliary:'Auxiliar'});
const fail = message => { throw Error(message); };
export const hasOwnRunAccess = (caps, required) => required.every(c => caps?.has(c));
export function ownRunWorkspaceAccess(payload, now = Date.now()) {
  const {user,access,expiresAt} = payload ?? {};
  if(payload?.ok !== true || payload.authenticated !== true || payload.sessionVersion !== 2 || access?.context !== 'tenant'
    || !salaryUuid(access.tenant?.id) || typeof access.tenant.roleKey!=='string' || !access.tenant.roleKey || typeof user?.id !== 'string' || !user.id || typeof user.email !== 'string' || !user.email
    || !Array.isArray(access.tenantCapabilities) || access.tenantCapabilities.some(c=>typeof c !== 'string' || !/^[a-z][a-z0-9._-]{2,119}$/.test(c))
    || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt)<=now) throw Object.assign(Error('La sesión municipal no está vigente. Volvé a ingresar.'),{status:401});
  return {key:salarySerialized([user.id,user.email,access.tenant.id,access.tenant.roleKey]),caps:new Set(access.tenantCapabilities)};
}
const freeze = v => { if(v && typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v; };
export function ownRunWorkspaceAttempt(key, body, accessKey) {
  if(!salaryUuid(key) || typeof accessKey!=='string' || !accessKey) fail('No se pudo identificar el intento de cálculo.');
  return freeze({key,body:structuredClone(ownRunCommand(body)),accessKey});
}
export async function verifiedWorkspaceCapture(value, attempt = null) {
  ownRunCapture(value,attempt);ownRunJurisdictions(value);
  const hash = async v => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(v))))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(await hash(value.body)!==value.bodySha256 || await hash(value.payload)!==value.payloadSha256
    || value.saved && (await hash(value.saved.input)!==value.saved.inputSha256 || await hash(value.saved.result)!==value.saved.resultSha256))
    fail('No se pudo verificar la integridad de la corrida. Consultá el mismo intento.');
  if(value.saved) ownRunWorkspaceResult(value);
  return value;
}
export function formatOwnRunDecimal(value, money = true) {
  if(typeof value!=='string' || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value)) fail('El resultado contiene un importe sin verificar.');
  const negative=value.startsWith('-'), [integer,fraction]=value.replace(/^-/,'').split('.');
  return (money?'$ ':'')+(negative?'-':'')+BigInt(integer).toLocaleString('es-AR')+(fraction===undefined?'':','+fraction);
}
export function ownRunWorkspaceResult(capture) {
  ownRunCapture(capture);
  const saved=capture.saved;if(!saved)return null;
  const {input,result}=saved, people=new Map(input.employees.map(e=>[e.contractId,e]));
  const expected=input.employees.filter(e=>input.selection.kind==='all'||input.selection.values.includes(input.selection.kind==='contracts'?e.contractId:input.selection.kind==='agreements'?e.agreementCode:e.departmentCode));
  const expectedIds=new Set(expected.map(e=>e.contractId)), totalIds=new Set(), rowKeys=new Set();
  if(result.employeeCount!==expected.length || !Number.isFinite(Date.parse(saved.recordedAt))) fail('El resultado no contiene el alcance completo.');
  for(const t of result.employeeTotals){
    if(!expectedIds.has(t.contractId)||totalIds.has(t.contractId))fail('El resultado contiene legajos repetidos o ajenos.');
    totalIds.add(t.contractId);
    for(const key of ['remuneration','non_remuneration','deduction','employer_contribution','gross','net'])formatOwnRunDecimal(t[key]);
  }
  for(const r of result.rows){
    const employee=people.get(r.contractId), key=r.contractId+':'+r.conceptCode;
    const rule=input.rules.find(rule=>rule.code===r.conceptCode&&rule.agreementCode===r.agreementCode&&rule.validFrom<=input.period&&(rule.validUntil===null||rule.validUntil>=input.period)&&rule.liquidationTypes.includes(input.liquidationType));
    if(!employee||!expectedIds.has(r.contractId)||rowKeys.has(key)||r.employeeNumber!==employee.employeeNumber||r.departmentCode!==employee.departmentCode
      ||r.agreementCode!==employee.agreementCode||!rule||r.nature!==rule.nature||r.unit!==rule.unit||r.ruleReference!==rule.ruleReference
      ||salarySerialized(r.rounding)!==salarySerialized(rule.rounding))fail('Hay un concepto sin correspondencia con las fuentes guardadas.');
    formatOwnRunDecimal(r.amount,r.unit==='money');rowKeys.add(key);
  }
  const expectedRows=expected.reduce((n,e)=>n+input.rules.filter(r=>r.agreementCode===e.agreementCode&&r.validFrom<=input.period&&(r.validUntil===null||r.validUntil>=input.period)&&r.liquidationTypes.includes(input.liquidationType)).length,0);
  if(result.rowCount!==expectedRows||totalIds.size!==expectedIds.size)fail('El detalle de conceptos está incompleto.');
  return {input,result,people};
}
export function ownRunWorkspaceRows(capture, search = '', page = 1, pageSize = 25) {
  const verified=ownRunWorkspaceResult(capture);
  if(!verified || !Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1)fail('No hay un resultado completo para consultar.');
  const term=String(search).trim().toLowerCase(), rows=verified.result.rows.filter(r=>!term||r.employeeNumber.toLowerCase().includes(term)||r.conceptCode.toLowerCase().includes(term));
  const pages=Math.max(1,Math.ceil(rows.length/pageSize)), current=Math.min(page,pages);
  return {rows:rows.slice((current-1)*pageSize,current*pageSize),filtered:rows.length,total:verified.result.rowCount,page:current,pages};
}
const csv = v => {
  let value=String(v);
  if(/^[\s\uFEFF]*[=+\-@]/u.test(value)||/^[\t\r\n]/.test(value))value="'"+value;
  return '"'+value.replaceAll('"','""')+'"';
};
export function ownRunWorkspaceCsv(capture) {
  const {result}=ownRunWorkspaceResult(capture)??{};
  if(!result)fail('No hay un cálculo guardado para descargar.');
  return '\uFEFF'+[
    ['Periodo','Liquidacion','Fecha declarada de liquidacion','Legajo','Convenio','Reparticion','Concepto','Naturaleza','Unidad','Valor calculado','Respaldo de regla'],
    ...result.rows.map(r=>[result.period,OWN_RUN_TYPES[result.liquidationType],capture.body.liquidationDate??ownRunDateLabel(null),"'"+r.employeeNumber,"'"+r.agreementCode,"'"+r.departmentCode,"'"+r.conceptCode,OWN_RUN_NATURES[r.nature],r.unit,r.amount,r.ruleReference])
  ].map(row=>row.map(csv).join(';')).join('\r\n')+'\r\n';
}
