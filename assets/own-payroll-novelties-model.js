import {salaryExact, salaryUuid, salaryKey, salaryHash, salarySerialized} from './native-salary-catalog-model.js';
import {assertNativeMonthlySubject, validateOwnMonthlyInputRow} from './payroll-native-monthly-model.js';
export const OWN_NOVELTY_MAX_ROWS = 10000, OWN_NOVELTY_MAX_BYTES = 4 * 1024 * 1024;
export const OWN_NOVELTY_TYPES = ['monthly','first_fortnight','sac','vacation','supplementary','final','other'];
export const OWN_NOVELTY_READ = ['workforce.employee.read','payroll.novelty.read','payroll.novelty.nominal.read'];
export const OWN_NOVELTY_CAPS = {prepare:'payroll.novelty.prepare',submit:'payroll.novelty.prepare',approve:'payroll.novelty.approve',reject:'payroll.novelty.approve',cancel:'payroll.novelty.prepare'};
const rowKeys=['rowOrdinal','legajo','contractId','identityToken','conceptSourceId','costCenterSourceId','adjustmentMonth','quantityDecimal','amountCents','movementType','legalInstrument','observation','forced'];
const fail = (code,message) => {throw Object.assign(new Error(message),{code:'OWN_NOVELTY_'+code,status:422});};
const need=(value,code='INPUT_INVALID',message='Revisá el lote completo, sus identidades y valores.')=>{if(!value)fail(code,message);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const numeric=v=>v===null?null:v.includes('.')?v.replace(/0+$/,'').replace(/\.$/,''):v;
const month=v=>typeof v==='string'&&/^20(?:0[8-9]|[1-9]\d)-(0[1-9]|1[0-2])-01$/.test(v);
const business=r=>[r.contractId,r.conceptSourceId,r.costCenterSourceId??'',r.adjustmentMonth??'',r.movementType??''].join('\u001f');
export function ownNoveltyRows(rows,periodMonth){
 need(Array.isArray(rows)&&rows.length>0&&rows.length<=OWN_NOVELTY_MAX_ROWS&&Reflect.ownKeys(rows).length===rows.length+1,'LIMIT','El lote admite hasta 10.000 filas completas. No se recortaron filas.');
 let total=0n;const seen=new Set();
 const result=rows.map((r,i)=>{
  need(salaryExact(r,rowKeys)&&r.rowOrdinal===i+1&&salaryUuid(r.contractId)&&r.contractId===r.contractId.toLowerCase()&&salaryHash(r.identityToken));
  // Match the own subject's opaque employee number without selecting identity.
  const {contractId,identityToken,...values}=r;
  try{validateOwnMonthlyInputRow({...values,rowOrdinal:1},periodMonth);}catch{fail('INPUT_INVALID',`Revisá los valores completos de la fila ${i+1}.`);}
  need(!seen.has(business(r)),'DUPLICATE_ROW','Hay un destino repetido en el lote completo.');seen.add(business(r));
  const row={...r,quantityDecimal:numeric(r.quantityDecimal),amountCents:r.amountCents===null?null:BigInt(r.amountCents).toString()};
  if(row.amountCents!==null)total+=BigInt(row.amountCents);
  return row;
 });
 need(total>=-9223372036854775808n&&total<=9223372036854775807n,'LIMIT','La suma de importes supera el rango admitido.');return result;
}
export function ownNoveltyCommand(body){
 need(body&&typeof body==='object'&&OWN_NOVELTY_CAPS[body.command]&&body.reviewConfirmed===true);
 if(body.command==='prepare'){
  need(salaryExact(body,['command','periodMonth','payrollType','rows','reviewConfirmed'])&&month(body.periodMonth)&&OWN_NOVELTY_TYPES.includes(body.payrollType));
  const normalized={...body,rows:ownNoveltyRows(body.rows,body.periodMonth)};
  need(new TextEncoder().encode(salarySerialized(normalized)).length<=OWN_NOVELTY_MAX_BYTES,'LIMIT','El lote completo supera el tamaño admitido. No se dividió ni recortó.');return freeze(normalized);
 }
 need(salaryExact(body,['command','batchId','expectedRevision','reasonReference','reviewConfirmed'])&&salaryUuid(body.batchId)&&Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision>0);
 need(['reject','cancel'].includes(body.command)?typeof body.reasonReference==='string'&&body.reasonReference.startsWith('ref:')&&salaryKey(body.reasonReference.slice(4)):body.reasonReference===null);
 return freeze({...body});
}
export function ownNoveltyBatch(b){
 need(salaryExact(b,['version','id','revision','status','periodMonth','payrollType','rows','rowCount','rowsSha256','preparedBy','decidedBy','approvals','grhMutation','payrollCalculated','payrollPosted'])&&b.version==='own-payroll-novelty-batch.v1'&&salaryUuid(b.id)&&Number.isSafeInteger(b.revision)&&b.revision>0&&['draft','submitted','approved','rejected','cancelled'].includes(b.status)&&month(b.periodMonth)&&OWN_NOVELTY_TYPES.includes(b.payrollType)&&Array.isArray(b.rows)&&b.rowCount===b.rows.length&&salaryHash(b.rowsSha256)&&b.grhMutation===false&&b.payrollCalculated===false&&b.payrollPosted===false,'CONTRACT_INVALID');
 const actor=a=>salaryExact(a,['membershipId','personId'])&&salaryUuid(a.membershipId)&&salaryUuid(a.personId);
 need(actor(b.preparedBy)&&(b.decidedBy===null||actor(b.decidedBy))&&(!['approved','rejected'].includes(b.status)||b.decidedBy!==null&&b.decidedBy.personId!==b.preparedBy.personId&&b.decidedBy.membershipId!==b.preparedBy.membershipId),'CONTRACT_INVALID');
 need(Array.isArray(b.approvals)&&b.approvals.length<=2&&b.approvals.every(a=>actor(a)&&a.personId!==b.preparedBy.personId&&a.membershipId!==b.preparedBy.membershipId)&&new Set(b.approvals.map(a=>a.personId)).size===b.approvals.length&&new Set(b.approvals.map(a=>a.membershipId)).size===b.approvals.length,'CONTRACT_INVALID');
 for(const r of b.rows){need(salaryExact(r,['values','subject','identityCurrent'])&&typeof r.identityCurrent==='boolean','CONTRACT_INVALID');assertNativeMonthlySubject(r.subject);need(r.values.contractId===r.subject.contractId&&r.values.legajo===r.subject.legajo&&r.values.identityToken===r.subject.identityToken,'CONTRACT_INVALID');}
 need(salarySerialized(ownNoveltyRows(b.rows.map(r=>r.values),b.periodMonth))===salarySerialized(b.rows.map(r=>r.values)),'CONTRACT_INVALID');
 const required=b.rows.some(r=>r.values.forced)?2:1;
 need(b.approvals.length<=required&&(b.status!=='approved'||b.approvals.length===required&&salarySerialized(b.decidedBy)===salarySerialized(b.approvals.at(-1)))&&(b.status!=='draft'||b.approvals.length===0)&&(b.status!=='submitted'||b.approvals.length<required),'CONTRACT_INVALID');return b;
}
export function ownNoveltyBootstrap(v){
 need(salaryExact(v,['version','complete','subjects','batches','permissions'])&&v.version==='own-payroll-novelty-bootstrap.v1'&&v.complete===true&&Array.isArray(v.subjects)&&v.subjects.length<=10000&&Array.isArray(v.batches)&&v.batches.length<=1000&&salaryExact(v.permissions,['canPrepare','canApprove'])&&Object.values(v.permissions).every(x=>typeof x==='boolean'),'CONTRACT_INVALID');
 const ids=new Set();for(const s of v.subjects){assertNativeMonthlySubject(s);need(!ids.has(s.contractId),'CONTRACT_INVALID');ids.add(s.contractId);}
 const batches=new Set();for(const b of v.batches){need(salaryExact(b,['id','revision','status','periodMonth','payrollType','rowCount','preparedBy'])&&salaryUuid(b.id)&&!batches.has(b.id)&&Number.isInteger(b.revision)&&b.revision>0&&['draft','submitted','approved','rejected','cancelled'].includes(b.status)&&month(b.periodMonth)&&OWN_NOVELTY_TYPES.includes(b.payrollType)&&Number.isInteger(b.rowCount)&&b.rowCount>0&&b.rowCount<=10000&&salaryExact(b.preparedBy,['membershipId','personId'])&&Object.values(b.preparedBy).every(salaryUuid),'CONTRACT_INVALID');batches.add(b.id);}return v;
}
export function ownNoveltyReceipt(v,attempt=null){
 need(salaryExact(v,['version','requestKey','requestSha256','body','snapshot','replayed'])&&v.version==='own-payroll-novelty-receipt.v1'&&salaryKey(v.requestKey)&&salaryHash(v.requestSha256)&&typeof v.replayed==='boolean','CONTRACT_INVALID');
 ownNoveltyCommand(v.body);ownNoveltyBatch(v.snapshot);
 need(attempt===null||v.requestKey===attempt.key&&salarySerialized(v.body)===salarySerialized(attempt.body),'CONTRACT_INVALID');
 const statuses={prepare:'draft',submit:'submitted',approve:'approved',reject:'rejected',cancel:'cancelled'};
 need((v.snapshot.status===statuses[v.body.command]||v.body.command==='approve'&&v.snapshot.status==='submitted'&&v.snapshot.approvals.length===1&&v.snapshot.rows.some(r=>r.values.forced))&&(v.body.command==='prepare'?v.snapshot.periodMonth===v.body.periodMonth&&v.snapshot.payrollType===v.body.payrollType&&salarySerialized(v.snapshot.rows.map(r=>r.values))===salarySerialized(v.body.rows):v.snapshot.id===v.body.batchId&&v.snapshot.revision===v.body.expectedRevision+1),'CONTRACT_INVALID');return v;
}
export function prepareOwnNoveltyReview(boot,body){
 ownNoveltyBootstrap(boot);const normalized=ownNoveltyCommand(body),subjects=new Map(boot.subjects.map(s=>[s.contractId,s]));
 need(normalized.command==='prepare'&&boot.permissions.canPrepare,'FORBIDDEN','No tenés permiso para preparar novedades propias.');
 const rows=normalized.rows.map(values=>{const subject=subjects.get(values.contractId);need(subject&&subject.identityToken===values.identityToken&&subject.legajo===values.legajo,'IDENTITY_CHANGED','Cambió un legajo. Actualizá y revisá el lote completo.');return {values,subject:{...subject},identityCurrent:true};});
 return freeze({body:normalized,rows});
}
export function ownNoveltyCsv(batch){
 ownNoveltyBatch(batch);need(batch.rows.every(r=>r.identityCurrent),'IDENTITY_CHANGED','Volvé a verificar las identidades antes de descargar.');
 const cell=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
 return '\ufeff'+[['fila','legajo','concepto','unidades','importe_centavos','periodo','tipo','estado','centro_costo','mes_ajuste','movimiento','instrumento_legal','observacion','forzado'],...batch.rows.map(r=>[r.values.rowOrdinal,r.values.legajo,r.values.conceptSourceId,r.values.quantityDecimal,r.values.amountCents,batch.periodMonth,batch.payrollType,batch.status,r.values.costCenterSourceId,r.values.adjustmentMonth,r.values.movementType,r.values.legalInstrument,r.values.observation,r.values.forced?'si':'no'])].map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';
}
