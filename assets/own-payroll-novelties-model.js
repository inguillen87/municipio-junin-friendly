import {salaryExact, salaryUuid, salaryKey, salaryHash, salarySerialized} from './native-salary-catalog-model.js';
import {assertNativeMonthlySubject, validateOwnMonthlyInputRow} from './payroll-native-monthly-model.js';
export const OWN_NOVELTY_MAX_ROWS = 10000, OWN_NOVELTY_MAX_BYTES = 4 * 1024 * 1024;
export const OWN_NOVELTY_TYPES = ['monthly','first_fortnight','sac','vacation','supplementary','final','other'];
export const OWN_NOVELTY_READ = ['workforce.employee.read','payroll.novelty.read','payroll.novelty.nominal.read'];
export const OWN_NOVELTY_CAPS = {prepare:'payroll.novelty.prepare',submit:'payroll.novelty.prepare',approve:'payroll.novelty.approve',reject:'payroll.novelty.approve',cancel:'payroll.novelty.prepare'};
export const OWN_NOVELTY_SUCCESSION_COMMAND='own-payroll-novelty-command.v3';
export const OWN_NOVELTY_SUCCESSION_BATCH='own-payroll-novelty-batch.v3';
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
 const succession=body.version===OWN_NOVELTY_SUCCESSION_COMMAND;
 if(body.command==='prepare'){
  need(salaryExact(body,['command','periodMonth','payrollType','rows','reviewConfirmed',...(succession?['version','supersedes','correctionReason']:[])])&&month(body.periodMonth)&&OWN_NOVELTY_TYPES.includes(body.payrollType));
  if(succession){ownNoveltySupersedes(body.supersedes);ownNoveltyCorrectionReason(body.correctionReason);}
  const normalized={...body,rows:ownNoveltyRows(body.rows,body.periodMonth)};
  need(new TextEncoder().encode(salarySerialized(normalized)).length<=OWN_NOVELTY_MAX_BYTES,'LIMIT','El lote completo supera el tamaño admitido. No se dividió ni recortó.');return freeze(normalized);
 }
 need(salaryExact(body,['command','batchId','expectedRevision','reasonReference','reviewConfirmed',...(succession?['version','affectedStateVersion']:[])])&&salaryUuid(body.batchId)&&Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision>0);
 if(succession)need(body.command==='approve'?salaryHash(body.affectedStateVersion):body.affectedStateVersion===null);
 need(['reject','cancel'].includes(body.command)?typeof body.reasonReference==='string'&&body.reasonReference.startsWith('ref:')&&salaryKey(body.reasonReference.slice(4)):body.reasonReference===null);
 return freeze({...body});
}
export function ownNoveltyBatch(b){
 const succession=b?.version===OWN_NOVELTY_SUCCESSION_BATCH;
 need(salaryExact(b,['version','id','revision','status','periodMonth','payrollType','rows','rowCount','rowsSha256','preparedBy','decidedBy','approvals','grhMutation','payrollCalculated','payrollPosted',...(succession?['supersedes','correctionReason']:[])])&&(b.version==='own-payroll-novelty-batch.v1'||succession)&&salaryUuid(b.id)&&Number.isSafeInteger(b.revision)&&b.revision>0&&['draft','submitted','approved','rejected','cancelled'].includes(b.status)&&month(b.periodMonth)&&OWN_NOVELTY_TYPES.includes(b.payrollType)&&Array.isArray(b.rows)&&b.rowCount===b.rows.length&&salaryHash(b.rowsSha256)&&b.grhMutation===false&&b.payrollCalculated===false&&b.payrollPosted===false,'CONTRACT_INVALID');
 if(succession){ownNoveltySupersedes(b.supersedes);ownNoveltyCorrectionReason(b.correctionReason);need(b.id!==b.supersedes.batchId,'CONTRACT_INVALID');}
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
 need((v.body.version===OWN_NOVELTY_SUCCESSION_COMMAND)===(v.snapshot.version===OWN_NOVELTY_SUCCESSION_BATCH),'CONTRACT_INVALID');
 if(v.body.command==='prepare'&&v.body.version===OWN_NOVELTY_SUCCESSION_COMMAND)need(salarySerialized(v.body.supersedes)===salarySerialized(v.snapshot.supersedes)&&v.body.correctionReason===v.snapshot.correctionReason,'CONTRACT_INVALID');
 need(attempt===null||v.requestKey===attempt.key&&salarySerialized(v.body)===salarySerialized(attempt.body),'CONTRACT_INVALID');
 const statuses={prepare:'draft',submit:'submitted',approve:'approved',reject:'rejected',cancel:'cancelled'};
 need((v.snapshot.status===statuses[v.body.command]||v.body.command==='approve'&&v.snapshot.status==='submitted'&&v.snapshot.approvals.length===1&&v.snapshot.rows.some(r=>r.values.forced))&&(v.body.command==='prepare'?v.snapshot.periodMonth===v.body.periodMonth&&v.snapshot.payrollType===v.body.payrollType&&salarySerialized(v.snapshot.rows.map(r=>r.values))===salarySerialized(v.body.rows):v.snapshot.id===v.body.batchId&&v.snapshot.revision===v.body.expectedRevision+1),'CONTRACT_INVALID');return v;
}
export function prepareOwnNoveltyReview(boot,body){
 ownNoveltyBootstrap(boot);const normalized=ownNoveltyCommand(body),subjects=new Map(boot.subjects.map(s=>[s.contractId,s]));
 need(normalized.version!==OWN_NOVELTY_SUCCESSION_COMMAND,'INPUT_INVALID','La corrección necesita revisar también el lote anterior y sus usos.');
 need(normalized.command==='prepare'&&boot.permissions.canPrepare,'FORBIDDEN','No tenés permiso para preparar novedades propias.');
 const rows=normalized.rows.map(values=>{const subject=subjects.get(values.contractId);need(subject&&subject.identityToken===values.identityToken&&subject.legajo===values.legajo,'IDENTITY_CHANGED','Cambió un legajo. Actualizá y revisá el lote completo.');return {values,subject:{...subject},identityCurrent:true};});
 return freeze({body:normalized,rows});
}
export function ownNoveltySupersedes(value){
 need(salaryExact(value,['batchId','expectedRevision','rowsSha256','snapshotSha256'])&&salaryUuid(value.batchId)&&Number.isSafeInteger(value.expectedRevision)&&value.expectedRevision>0&&salaryHash(value.rowsSha256)&&salaryHash(value.snapshotSha256),'CONTRACT_INVALID','No se verificó la versión completa del lote anterior.');return value;
}
export function ownNoveltyCorrectionReason(value){
 need(typeof value==='string'&&value===value.trim()&&value===value.normalize('NFC')&&value.length>=10&&value.length<=500&&!/[<>\u0000-\u001f\u007f]/.test(value),'INPUT_INVALID','Describí el motivo de la corrección, entre 10 y 500 caracteres.');return value;
}
const parentPins=context=>({batchId:context.batch.id,expectedRevision:context.batch.revision,rowsSha256:context.batch.rowsSha256,snapshotSha256:context.snapshotSha256});
const ordered=(items,key,validate)=>Array.isArray(items)&&Reflect.ownKeys(items).length===items.length+1&&items.every((item,i)=>validate(item)&&(i===0||key(item)>key(items[i-1])));
export function ownNoveltySuccessionContext(value){
 need(salaryExact(value,['version','batch','snapshotSha256','effective','identitiesCurrent','canPrepare','pendingSuccessor','approvedSuccessor','blockingUses','affectedState','affectedStateVersion'])&&value.version==='own-payroll-novelty-succession-context.v1'&&salaryHash(value.snapshotSha256)&&salaryHash(value.affectedStateVersion)&&['effective','identitiesCurrent','canPrepare'].every(k=>typeof value[k]==='boolean'),'CONTRACT_INVALID');
 ownNoveltyBatch(value.batch);need(value.batch.status==='approved','CONTRACT_INVALID');
 for(const [key,statuses]of [['pendingSuccessor',['draft','submitted']],['approvedSuccessor',['approved']]]){const s=value[key];need(s===null||salaryExact(s,['batchId','revision','status'])&&salaryUuid(s.batchId)&&s.batchId!==value.batch.id&&Number.isSafeInteger(s.revision)&&s.revision>0&&statuses.includes(s.status),'CONTRACT_INVALID');}
 need(!value.effective||value.approvedSuccessor===null,'CONTRACT_INVALID');
 const contracts=new Set(value.batch.rows.map(r=>r.values.contractId)),contractIds=ids=>ordered(ids,x=>x,id=>salaryUuid(id)&&contracts.has(id))&&ids.length>0;
 const state=value.affectedState;
 need(salaryExact(state,['version','captures','groups'])&&state.version==='own-payroll-novelty-affected-state.v1','CONTRACT_INVALID');
 need(ordered(state.captures,c=>c.runId,c=>salaryExact(c,['runId','bodySha256','payloadSha256','algorithmSha256','inputSha256','resultSha256','employees'])&&salaryUuid(c.runId)&&['bodySha256','payloadSha256','algorithmSha256'].every(k=>salaryHash(c[k]))&&(c.inputSha256===null||salaryHash(c.inputSha256))&&(c.resultSha256===null||salaryHash(c.resultSha256))&&(c.inputSha256===null)===(c.resultSha256===null)&&ordered(c.employees,e=>e.contractId,e=>salaryExact(e,['contractId','state','version','liquidationVersion'])&&contracts.has(e.contractId)&&['captured','calculated','confirmed','annulled','cancelled'].includes(e.state)&&Number.isSafeInteger(e.version)&&e.version>=0&&(e.liquidationVersion===null||Number.isSafeInteger(e.liquidationVersion)&&e.liquidationVersion>0)&&(c.resultSha256===null?e.state==='captured'&&e.liquidationVersion===null:e.state!=='captured'))&&c.employees.length>0),'CONTRACT_INVALID');
 need(ordered(state.groups,g=>g.groupId,g=>salaryExact(g,['groupId','state','snapshotSha256','bodySha256','contractIds'])&&salaryUuid(g.groupId)&&['closed','reopened'].includes(g.state)&&salaryHash(g.snapshotSha256)&&salaryHash(g.bodySha256)&&contractIds(g.contractIds)),'CONTRACT_INVALID');
 need(ordered(value.blockingUses,u=>u.kind+':'+u.id,u=>salaryExact(u,['kind','id','contractIds'])&&['confirmed','closed'].includes(u.kind)&&salaryUuid(u.id)&&contractIds(u.contractIds)),'CONTRACT_INVALID');
 const expected=[...state.captures.flatMap(c=>{const ids=c.employees.filter(e=>e.state==='confirmed').map(e=>e.contractId);return ids.length?[{kind:'confirmed',id:c.runId,contractIds:ids}]:[];}),...state.groups.filter(g=>g.state==='closed').map(g=>({kind:'closed',id:g.groupId,contractIds:g.contractIds}))].sort((a,b)=>(a.kind+':'+a.id)<(b.kind+':'+b.id)?-1:1);
 need(salarySerialized(expected)===salarySerialized(value.blockingUses),'CONTRACT_INVALID','La revisión no contiene todos los cálculos confirmados y cierres afectados.');return value;
}
export function ownNoveltySuccessionRows(context,values,{requireChange=true}={}){
 ownNoveltySuccessionContext(context);const before=context.batch.rows.map(r=>r.values),after=ownNoveltyRows(values,context.batch.periodMonth),mutable=new Set(['quantityDecimal','amountCents','legalInstrument','observation']);
 need(after.length===before.length,'SCOPE_CHANGED','La corrección debe conservar todas las filas y sus destinos originales.');
 need(after.every((r,i)=>rowKeys.every(key=>mutable.has(key)||salarySerialized(r[key])===salarySerialized(before[i][key]))),'SCOPE_CHANGED','La corrección conserva legajos, conceptos, centros de costo, movimientos e identidades.');
 need(!requireChange||salarySerialized(before)!==salarySerialized(after),'NO_CHANGE','Modificá al menos un valor o fundamento antes de preparar la corrección.');return after;
}
export function ownNoveltyAffectedStatePreimage(context){
 ownNoveltySuccessionContext(context);return {version:'own-payroll-novelty-affected-state-scope.v1',supersedes:parentPins(context),affectedState:context.affectedState};
}
export function prepareOwnNoveltySuccessionReview(context,boot,values,correctionReason){
 ownNoveltySuccessionContext(context);ownNoveltyBootstrap(boot);
 need(context.effective&&context.approvedSuccessor===null&&context.pendingSuccessor===null,'VERSION_CHANGED','El lote anterior ya tiene una corrección pendiente o aprobada.');
 need(context.canPrepare&&boot.permissions.canPrepare,'FORBIDDEN','No tenés permiso para preparar esta corrección.');need(context.identitiesCurrent,'IDENTITY_CHANGED','Cambió un legajo del lote anterior. Actualizá antes de corregir.');
 const rows=ownNoveltySuccessionRows(context,values),subjects=new Map(boot.subjects.map(s=>[s.contractId,s]));
 const reviewed=rows.map(values=>{const subject=subjects.get(values.contractId);need(subject&&subject.identityToken===values.identityToken&&subject.legajo===values.legajo,'IDENTITY_CHANGED','Cambió un legajo. Actualizá y revisá el lote completo.');return {values,subject:{...subject},identityCurrent:true};});
 return freeze({body:ownNoveltyCommand({version:OWN_NOVELTY_SUCCESSION_COMMAND,command:'prepare',periodMonth:context.batch.periodMonth,payrollType:context.batch.payrollType,rows,supersedes:parentPins(context),correctionReason,reviewConfirmed:true}),rows:reviewed});
}
export function reviewOwnNoveltySuccessionApproval(context,batch){
 ownNoveltySuccessionContext(context);ownNoveltyBatch(batch);
 need(batch.version===OWN_NOVELTY_SUCCESSION_BATCH&&batch.status==='submitted'&&batch.periodMonth===context.batch.periodMonth&&batch.payrollType===context.batch.payrollType&&salarySerialized(parentPins(context))===salarySerialized(batch.supersedes),'VERSION_CHANGED','Cambió la versión del lote anterior.');
 need(context.effective&&context.approvedSuccessor===null&&context.pendingSuccessor?.batchId===batch.id&&context.pendingSuccessor.revision===batch.revision,'VERSION_CHANGED','Cambió la corrección pendiente del lote anterior.');
 need(context.identitiesCurrent&&batch.rows.every(r=>r.identityCurrent),'IDENTITY_CHANGED','Actualizá las identidades antes de aprobar.');
 need(context.blockingUses.length===0,'SOURCE_IN_USE','Primero anulá los cálculos confirmados y reabrí los cierres afectados. Después volvé a revisar esta corrección.');
 ownNoveltySuccessionRows(context,batch.rows.map(r=>r.values));return context;
}
export function ownNoveltyCsv(batch){
 ownNoveltyBatch(batch);need(batch.rows.every(r=>r.identityCurrent),'IDENTITY_CHANGED','Volvé a verificar las identidades antes de descargar.');
 const cell=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
 return '\ufeff'+[['fila','legajo','concepto','unidades','importe_centavos','periodo','tipo','estado','centro_costo','mes_ajuste','movimiento','instrumento_legal','observacion','forzado'],...batch.rows.map(r=>[r.values.rowOrdinal,r.values.legajo,r.values.conceptSourceId,r.values.quantityDecimal,r.values.amountCents,batch.periodMonth,batch.payrollType,batch.status,r.values.costCenterSourceId,r.values.adjustmentMonth,r.values.movementType,r.values.legalInstrument,r.values.observation,r.values.forced?'si':'no'])].map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';
}
