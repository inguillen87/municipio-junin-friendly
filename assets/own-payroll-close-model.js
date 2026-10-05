import {salaryExact,salaryHash,salaryUuid,salaryKey,salarySerialized} from './native-salary-catalog-model.js';
import {ownRunCapture} from './own-payroll-run-model.js';
import {OWN_RUN_READ,OWN_RUN_NOMINAL,OWN_RUN_TYPES,ownRunWorkspaceResult,verifiedWorkspaceCapture} from './own-payroll-run-workspace-model.js';
import {decimal,rational,exactAdd,exactSubtract,exactCompare,quantize,payrollRequire as require} from './own-payroll-exact.js';

export const OWN_CLOSE_READ=Object.freeze([...OWN_RUN_READ]);
export const OWN_CLOSE_NOMINAL=Object.freeze([...OWN_RUN_NOMINAL,'payroll.calculation.approve']);
export const OWN_CLOSE_WRITE=Object.freeze([...OWN_CLOSE_NOMINAL,'payroll.calculation.close']);
export const OWN_CLOSE_MAX_ROWS=10000;
export const OWN_CLOSE_TOTAL_KEYS=Object.freeze(['remuneration','non_remuneration','deduction','employer_contribution','gross','net']);
const period=v=>typeof v==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const code=v=>typeof v==='string'&&/^[0-9]{1,9}$/.test(v);
const invalid=(condition,message)=>require(condition,'CLOSE_CONTRACT_INVALID',message);
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));

export function ownCloseSavedTotals(capture){
 const {input,result}=ownRunWorkspaceResult(capture)??{};invalid(result,'Falta el resultado guardado.');
 for(const t of result.employeeTotals){
  const sums=Object.fromEntries(OWN_CLOSE_TOTAL_KEYS.slice(0,4).map(k=>[k,rational(0n)]));
  for(const row of result.rows.filter(r=>r.contractId===t.contractId))if(Object.hasOwn(sums,row.nature))sums[row.nature]=exactAdd(sums[row.nature],decimal(row.amount));
  sums.gross=exactAdd(sums.remuneration,sums.non_remuneration);sums.net=exactSubtract(sums.gross,sums.deduction);
  for(const key of OWN_CLOSE_TOTAL_KEYS)invalid(exactCompare(sums[key],decimal(t[key]))===0&&quantize(sums[key],{precision:input.totalsPrecision,mode:'exact'}).amount===t[key],'Los totales no concilian con los conceptos originales guardados.');
 }
 return capture;
}

export function ownCloseSelection(value){
 invalid(salaryExact(value,['kind','values'])&&['all','contracts','agreements','departments'].includes(value.kind)&&Array.isArray(value.values)&&value.values.length<=OWN_CLOSE_MAX_ROWS&&Reflect.ownKeys(value.values).length===value.values.length+1,'No se verificó el alcance completo.');
 invalid(value.kind==='all'?value.values.length===0:value.values.length>0&&value.values.every(value.kind==='contracts'?salaryUuid:code),'Elegí el alcance completo de la liquidación.');
 invalid(new Set(value.values).size===value.values.length,'El alcance repite destinos.');
 return {kind:value.kind,values:[...value.values].sort()};
}

export function ownCloseCommand(value){
 invalid(salaryExact(value,['period','liquidationType','scopeVersion','stateVersion','selection','command','groupId','reason','reviewConfirmed'])&&period(value.period)&&Object.hasOwn(OWN_RUN_TYPES,value.liquidationType)&&salaryHash(value.scopeVersion)&&salaryHash(value.stateVersion)&&['close','reopen'].includes(value.command)&&value.reviewConfirmed===true,'Revisá período, tipo, versión y decisión expresa.');
 invalid(typeof value.reason==='string'&&value.reason.trim()===value.reason&&value.reason.length>=10&&value.reason.length<=500&&!/[\u0000-\u001f\u007f]/.test(value.reason),'Informá un motivo de 10 a 500 caracteres.');
 const selection=ownCloseSelection(value.selection);
 invalid(value.command==='close'?value.groupId===null:salaryUuid(value.groupId)&&selection.kind==='all','La reapertura corresponde al grupo cerrado completo.');
 return {...value,selection};
}

export function ownCloseDetail(value){
 invalid(salaryExact(value,['version','period','liquidationType','scopeVersion','stateVersion','populationDomain','rosterVersion','rows','captures','groups','canWrite','complete'])&&value.version==='own-close-detail.v1'&&period(value.period)&&Object.hasOwn(OWN_RUN_TYPES,value.liquidationType)&&[value.scopeVersion,value.stateVersion,value.rosterVersion].every(salaryHash)&&value.populationDomain==='native_registered'&&typeof value.canWrite==='boolean'&&value.complete===true,'No se pudo verificar la revisión completa.');
 invalid(Array.isArray(value.rows)&&value.rows.length<=OWN_CLOSE_MAX_ROWS&&Array.isArray(value.captures)&&value.captures.length<=1000&&Array.isArray(value.groups)&&value.groups.length<=1000,'La revisión completa supera la capacidad; no se omitieron filas.');
 const captures=new Map(),ids=new Set();
 for(const capture of value.captures){ownRunCapture(capture);invalid(capture.saved&&capture.body.period===value.period&&capture.body.liquidationType===value.liquidationType&&!captures.has(capture.id),'Una fuente no corresponde al período y tipo revisados.');ownCloseSavedTotals(capture);captures.set(capture.id,capture);}
 const groups=new Set();for(const g of value.groups){invalid(salaryExact(g,['id','state','employeeCount','populationCount','populationComplete','recordedAt','reopenedAt','actorLabel','reason','snapshotSha256','canReopen'])&&salaryUuid(g.id)&&!groups.has(g.id)&&['closed','reopened'].includes(g.state)&&Number.isSafeInteger(g.employeeCount)&&g.employeeCount>0&&g.employeeCount<=OWN_CLOSE_MAX_ROWS&&Number.isSafeInteger(g.populationCount)&&g.populationCount>=g.employeeCount&&g.populationCount<=OWN_CLOSE_MAX_ROWS&&g.populationComplete===(g.employeeCount===g.populationCount)&&date(g.recordedAt)&&(g.state==='closed'?g.reopenedAt===null:date(g.reopenedAt))&&typeof g.actorLabel==='string'&&g.actorLabel.length>0&&typeof g.reason==='string'&&g.reason.length>=10&&g.reason.length<=500&&salaryHash(g.snapshotSha256)&&typeof g.canReopen==='boolean'&&(!g.canReopen||value.canWrite)&&(g.state==='closed'||!g.canReopen),'El historial de cierre no se pudo verificar.');groups.add(g.id);}
 for(const row of value.rows){
  invalid(salaryExact(row,['contractId','employeeNumber','agreementCode','departmentCode','state','runId','resultSha256','liquidationVersion','groupId','canClose'])&&salaryUuid(row.contractId)&&code(row.employeeNumber)&&code(row.agreementCode)&&code(row.departmentCode)&&!ids.has(row.contractId)&&['missing','confirmed','closed'].includes(row.state)&&typeof row.canClose==='boolean'&&(!row.canClose||value.canWrite),'Un legajo no cumple el contrato de revisión.');ids.add(row.contractId);
  if(row.state==='missing'){invalid(row.runId===null&&row.resultSha256===null&&row.liquidationVersion===null&&row.groupId===null&&!row.canClose,'Un legajo sin confirmar no admite cierre.');continue;}
  const capture=captures.get(row.runId),employee=capture?.saved.input.employees.find(e=>e.contractId===row.contractId);
  invalid(capture&&capture.saved.resultSha256===row.resultSha256&&employee&&['employeeNumber','agreementCode','departmentCode'].every(k=>employee[k]===row[k])&&Number.isInteger(row.liquidationVersion)&&row.liquidationVersion>0,'El legajo no coincide con su resultado original confirmado.');
  invalid(row.state==='confirmed'?row.groupId===null:salaryUuid(row.groupId)&&!row.canClose&&value.groups.some(g=>g.id===row.groupId&&g.state==='closed'),'El estado de cierre no coincide con el grupo.');
 }
 return value;
}

export function selectedOwnCloseRows(detail,selection){
 ownCloseDetail(detail);const chosen=ownCloseSelection(selection);
 const field={contracts:'contractId',agreements:'agreementCode',departments:'departmentCode'}[chosen.kind];
 const rows=detail.rows.filter(row=>chosen.kind==='all'||chosen.values.includes(row[field]));
 invalid(rows.length>0&&chosen.values.every(v=>rows.some(row=>row[field]===v)),'No se encontró todo el alcance elegido.');
 invalid(rows.every(row=>row.state==='confirmed'&&row.canClose),'El alcance incluye legajos sin confirmar, cerrados o sin revisión independiente.');
 return [...rows].sort((a,b)=>a.contractId<b.contractId?-1:1);
}

// Mechanical exact aggregation of saved amounts; never evaluates a salary rule.
export function ownCloseSnapshot(detail,selection){
 const chosen=ownCloseSelection(selection),rows=selectedOwnCloseRows(detail,chosen),captures=new Map(detail.captures.map(c=>[c.id,c]));
 const totals=Object.fromEntries(OWN_CLOSE_TOTAL_KEYS.map(k=>[k,rational(0n)]));let precision=0;const employees=[],concepts=[];
 for(const row of rows){
  const capture=captures.get(row.runId),saved=capture.saved,employeeTotal=saved.result.employeeTotals.find(e=>e.contractId===row.contractId);
  invalid(employeeTotal&&OWN_CLOSE_TOTAL_KEYS.every(k=>typeof employeeTotal[k]==='string'),'Faltan importes del resultado original; no se supone cero.');
  precision=Math.max(precision,saved.input.totalsPrecision);
  for(const key of OWN_CLOSE_TOTAL_KEYS)totals[key]=exactAdd(totals[key],decimal(employeeTotal[key]));
  employees.push({contractId:row.contractId,employeeNumber:row.employeeNumber,agreementCode:row.agreementCode,departmentCode:row.departmentCode,runId:row.runId,inputSha256:saved.inputSha256,resultSha256:saved.resultSha256,liquidationVersion:row.liquidationVersion,precision:saved.input.totalsPrecision,conceptCount:saved.result.rows.filter(e=>e.contractId===row.contractId).length,totals:structuredClone(employeeTotal)});
  concepts.push(...saved.result.rows.filter(e=>e.contractId===row.contractId).map(e=>structuredClone(e)));
 }
 invalid(Number.isInteger(precision)&&precision>=0&&precision<=8,'No se verificó la precisión de las fuentes.');
 return {version:'own-close-snapshot.v1',period:detail.period,liquidationType:detail.liquidationType,populationDomain:detail.populationDomain,rosterVersion:detail.rosterVersion,selection:chosen,employeeCount:rows.length,populationCount:detail.rows.length,populationComplete:rows.length===detail.rows.length,precision,totals:Object.fromEntries(OWN_CLOSE_TOTAL_KEYS.map(k=>[k,quantize(totals[k],{precision,mode:'exact'}).amount])),employees,concepts,conceptCount:concepts.length,payrollCalculated:true,payrollPosted:false,paymentExecuted:false};
}

export function ownCloseAttempt(key,body,accessKey){
 invalid(salaryKey(key)&&typeof accessKey==='string'&&accessKey.length>0,'No se pudo identificar el intento de cierre.');
 const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
 return freeze({key,body:structuredClone(ownCloseCommand(body)),accessKey});
}

export function ownCloseReceipt(value,attempt=null){
 invalid(salaryExact(value,['version','id','key','body','bodySha256','groupId','snapshot','snapshotSha256','recordedAt','replayed'])&&value.version==='own-close-receipt.v1'&&salaryUuid(value.id)&&salaryKey(value.key)&&[value.bodySha256,value.snapshotSha256].every(salaryHash)&&salaryUuid(value.groupId)&&date(value.recordedAt)&&typeof value.replayed==='boolean','No se pudo verificar el cierre registrado.');
 const body=ownCloseCommand(value.body),s=value.snapshot;
 invalid(salaryExact(s,['version','period','liquidationType','populationDomain','rosterVersion','selection','employeeCount','populationCount','populationComplete','precision','totals','employees','concepts','conceptCount','payrollCalculated','payrollPosted','paymentExecuted'])&&s.version==='own-close-snapshot.v1'&&s.period===body.period&&s.liquidationType===body.liquidationType&&s.populationDomain==='native_registered'&&salaryHash(s.rosterVersion)&&Number.isSafeInteger(s.employeeCount)&&s.employeeCount>0&&s.employeeCount<=OWN_CLOSE_MAX_ROWS&&Number.isSafeInteger(s.populationCount)&&s.populationCount>=s.employeeCount&&s.populationCount<=OWN_CLOSE_MAX_ROWS&&s.populationComplete===(s.employeeCount===s.populationCount)&&Number.isInteger(s.precision)&&s.precision>=0&&s.precision<=8&&salaryExact(s.totals,OWN_CLOSE_TOTAL_KEYS)&&Array.isArray(s.employees)&&s.employees.length===s.employeeCount&&Array.isArray(s.concepts)&&Number.isSafeInteger(s.conceptCount)&&s.conceptCount===s.concepts.length&&s.payrollCalculated===true&&s.payrollPosted===false&&s.paymentExecuted===false,'No se verificó la copia histórica del alcance cerrado.');
 ownCloseSelection(s.selection);const ids=new Set(),totals=Object.fromEntries(OWN_CLOSE_TOTAL_KEYS.map(k=>[k,rational(0n)]));
 for(const e of s.employees){invalid(salaryExact(e,['contractId','employeeNumber','agreementCode','departmentCode','runId','inputSha256','resultSha256','liquidationVersion','precision','conceptCount','totals'])&&salaryUuid(e.contractId)&&!ids.has(e.contractId)&&salaryUuid(e.runId)&&[e.inputSha256,e.resultSha256].every(salaryHash)&&[e.employeeNumber,e.agreementCode,e.departmentCode].every(code)&&Number.isSafeInteger(e.liquidationVersion)&&e.liquidationVersion>0&&Number.isInteger(e.precision)&&e.precision>=0&&e.precision<=s.precision&&Number.isSafeInteger(e.conceptCount)&&e.conceptCount>=0&&e.conceptCount===s.concepts.filter(r=>r.contractId===e.contractId).length&&salaryExact(e.totals,['contractId',...OWN_CLOSE_TOTAL_KEYS])&&e.totals.contractId===e.contractId,'El histórico contiene un legajo sin respaldo.');ids.add(e.contractId);for(const k of OWN_CLOSE_TOTAL_KEYS)totals[k]=exactAdd(totals[k],decimal(e.totals[k]));}
 for(const k of OWN_CLOSE_TOTAL_KEYS)invalid(quantize(totals[k],{precision:s.precision,mode:'exact'}).amount===s.totals[k],'El total histórico no concilia con sus legajos.');
 invalid(s.concepts.every(r=>ids.has(r.contractId))&&new Set(s.concepts.map(r=>r.contractId+':'+r.conceptCode)).size===s.concepts.length,'El detalle histórico contiene conceptos repetidos o ajenos.');
 for(const e of s.employees){const sums=Object.fromEntries(OWN_CLOSE_TOTAL_KEYS.slice(0,4).map(k=>[k,rational(0n)]));for(const r of s.concepts.filter(r=>r.contractId===e.contractId)){invalid(salaryExact(r,['contractId','employeeNumber','agreementCode','departmentCode','conceptCode','nature','unit','amount','exactValue','rounding','ruleReference','dependencies','trace'])&&code(r.conceptCode)&&['remuneration','non_remuneration','deduction','employer_contribution','auxiliary'].includes(r.nature)&&['employeeNumber','agreementCode','departmentCode'].every(k=>r[k]===e[k]),'El concepto no corresponde al legajo histórico.');const amount=decimal(r.amount);if(Object.hasOwn(sums,r.nature))sums[r.nature]=exactAdd(sums[r.nature],amount);}sums.gross=exactAdd(sums.remuneration,sums.non_remuneration);sums.net=exactSubtract(sums.gross,sums.deduction);for(const k of OWN_CLOSE_TOTAL_KEYS)invalid(quantize(sums[k],{precision:e.precision,mode:'exact'}).amount===e.totals[k],'Los conceptos históricos no concilian con el total guardado.');}
 if(body.command==='close')invalid(value.groupId===value.id&&salarySerialized(s.selection)===salarySerialized(body.selection),'El cierre no coincide con el alcance declarado.');else invalid(value.groupId===body.groupId,'La reapertura corresponde a otro grupo.');
 if(attempt){invalid(value.key===attempt.key&&salarySerialized(body)===salarySerialized(attempt.body),'El recibo pertenece a otro intento.');if(attempt.snapshot)invalid(salarySerialized(s)===salarySerialized(attempt.snapshot),'El histórico no conserva el conjunto completo revisado.');}
 return value;
}
export async function verifiedOwnCloseDetail(value){ownCloseDetail(value);for(const c of value.captures)await verifiedWorkspaceCapture(c);return value;}
export async function verifiedOwnCloseReceipt(value,attempt=null){ownCloseReceipt(value,attempt);const hash=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(v))))].map(b=>b.toString(16).padStart(2,'0')).join('');invalid(await hash(value.body)===value.bodySha256&&await hash(value.snapshot)===value.snapshotSha256,'No se pudo verificar la integridad del cierre.');return value;}
