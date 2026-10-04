import {verifyMonthlyBootstrap, savedNoveltyBatch, sameNoveltyDecision, verifyMonthlyBatch, monthlyWriteAttempt} from './payroll-native-monthly-model.js';

export const MONTHLY_DECISION_LIMITS = Object.freeze({batches:100, rows:5000});
export const MONTHLY_DECISION_COMMANDS = Object.freeze({submit:'Enviar a aprobación', approve:'Aprobar para exportar', reject:'Rechazar', cancel:'Cancelar lotes'});
const states = Object.freeze({submit:'submitted', approve:'approved', reject:'rejected', cancel:'cancelled'});
const reasons = Object.freeze({submit:'ready_for_review', approve:'validated_for_export', cancel:'cancelled_by_preparer'});
const rejectReasons = new Set(['invalid_rows','unsupported_concept','duplicate_or_conflict']);
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value;
const freeze = value => {if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const fail = text => {throw Error(text);};

export function monthlyDecisionAccess(payload) {
  verifyMonthlyBootstrap(payload);
  const p=payload.principal;
  return freeze({scope:[p.tenantId,p.membershipId,p.certifiedBindingId].map(v=>v.toLowerCase()).join('|'),
    email:p.email ?? null, role:p.roleKey ?? null, capabilities:[...p.capabilities].sort(), limits:structuredClone(payload.limits)});
}
export function monthlyDecisionAllowed(access,command=null) {
  const caps=access?.capabilities || [];
  return ['payroll.novelty.read','payroll.novelty.nominal.read'].every(cap=>caps.includes(cap))
    && (command ? Object.hasOwn(states,command) && caps.includes(['approve','reject'].includes(command)?'payroll.novelty.approve':'payroll.novelty.prepare')
      : caps.includes('payroll.novelty.prepare') || caps.includes('payroll.novelty.approve'));
}
export function sameMonthlyDecisionAccess(a,b) {
  const canonical=value=>value?{...value,capabilities:[...value.capabilities].sort()}:value;
  return JSON.stringify(stable(canonical(a)))===JSON.stringify(stable(canonical(b)));
}

export function monthlyDecisionPlan(batches,command,reason,access) {
  if(!monthlyDecisionAllowed(access,command)) fail('El acceso actual no permite esta decisión. Actualizá la consulta.');
  if(!Array.isArray(batches)||!batches.length||batches.length>MONTHLY_DECISION_LIMITS.batches) fail('Elegí entre 1 y 100 lotes. No se recorta la selección.');
  if(command==='reject'&&!rejectReasons.has(reason)) fail('Elegí un motivo de rechazo válido.');
  const items=batches.map(savedNoveltyBatch),ids=new Set(items.map(b=>b.id.toLowerCase()));
  if(ids.size!==items.length) fail('La selección contiene un lote repetido.');
  const rows=items.reduce((n,b)=>n+b.rowCount,0);
  if(rows>MONTHLY_DECISION_LIMITS.rows) fail(`La selección tiene ${rows} filas y supera las 5.000 de esta revisión conjunta. No se omitió ninguna fila ni se envió una decisión.`);
  for(const b of items) if(!b.allowedCommands.includes(command)) fail(`El lote ${b.id.slice(0,8).toUpperCase()} ya no admite la decisión elegida. Revisá su estado, permisos y preparador.`);
  return freeze({batches:items,command,reasonCode:command==='reject'?reason:reasons[command],access:structuredClone(access),rowCount:rows});
}
export function monthlyDecisionUnchanged(plan,current) {
  return Array.isArray(current)&&current.length===plan.batches.length
    && plan.batches.every((b,i)=>sameNoveltyDecision(b,current[i],plan.command));
}
export function monthlyDecisionAttempt(plan,batch,key) {
  if(!plan.batches.includes(batch)) fail('El lote no pertenece a la revisión completa.');
  return monthlyWriteAttempt({url:'/api/internal-payroll-novelties?version=2',command:plan.command,key,scopeKey:plan.access.scope,
    payload:{batchId:batch.id,expectedVersion:batch.version,reasonCode:plan.reasonCode,
      reasonReference:['reject','cancel'].includes(plan.command)?`ref:${key}`:null}});
}
export function assertMonthlyDecisionReceipt(batch,attempt,response) {
  if(response?.ok!==true||typeof response.replayed!=='boolean') fail('La confirmación no corresponde al envío. Recuperá el mismo intento.');
  const receipt=verifyMonthlyBatch(response.data,{mode:'receipt'}),payload=JSON.parse(attempt.body).payload;
  if(payload.batchId!==batch.id||payload.expectedVersion!==batch.version
    || receipt.id!==batch.id||receipt.version!==batch.version+1||receipt.status!==states[attempt.command]
    || ['contractVersion','sourceMode','periodMonth','payrollType','rowCount'].some(k=>receipt[k]!==batch[k])
    || receipt.exportable!==(attempt.command==='approve')) fail('La confirmación no corresponde al lote, alcance o decisión enviados. Recuperá el mismo intento.');
  // Historical v1 event receipts can be deliberately redacted. The verified
  // envelope still pins the whole batch's scope, count, original state/version.
  // When rows are supplied (always for v2), compare every original value.
  const rows=value=>value.map(({identityCurrent,...r})=>r);
  if(receipt.rows.length && JSON.stringify(stable(rows(receipt.rows)))!==JSON.stringify(stable(rows(batch.rows))))
    fail('La confirmación cambió las filas revisadas. Recuperá el mismo intento.');
  return receipt;
}
