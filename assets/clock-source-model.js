// A source receipt is durable original data, not reconciled attendance or payroll.
const exact=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const time=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
const fail=()=>{throw Error('CLOCK_SOURCE_DASHBOARD_INVALID');};
export function assertClockSourceDashboard(v){
 const keys=['version','checkedAt','coreCheckedAt','sourceCheckedAt','snapshotConsistency','sourceBindingSha256','revision','devices','scope','reconciliationState','payrollModified','liveConnectionVerified'];
 if(!exact(v,keys)||v.version!=='clock-source-dashboard.v1'||v.snapshotConsistency!=='composed_revalidated'||v.scope!=='source_only'||v.reconciliationState!=='pending'||v.payrollModified!==false||v.liveConnectionVerified!==false||!sha(v.sourceBindingSha256)||!sha(v.revision)||!['checkedAt','coreCheckedAt','sourceCheckedAt'].every(k=>time(v[k]))||!Array.isArray(v.devices)||v.devices.length>200)fail();
 const seen=new Set();let total=0;
 for(const d of v.devices){
  if(!exact(d,['deviceId','siteId','siteKey','label','model','deviceState','enrolled','enabled','receipts','recordsPersisted','completedBatches','pendingBatches','lastReceivedAt','lastCapturedAt'])||!uuid(d.deviceId)||seen.has(d.deviceId)||!text(d.siteKey,96)||!/^[a-z0-9][a-z0-9._-]{1,95}$/.test(d.siteKey)||!text(d.label,180)||d.model!==null&&!text(d.model,120)||!['draft','active','offline','suspended','retired'].includes(d.deviceState)||typeof d.enrolled!=='boolean'||typeof d.enabled!=='boolean'||!['receipts','recordsPersisted','completedBatches','pendingBatches'].every(k=>Number.isSafeInteger(d[k])&&d[k]>=0)||!['lastReceivedAt','lastCapturedAt'].every(k=>d[k]===null||time(d[k])))fail();
  if(d.enrolled?!uuid(d.siteId):d.siteId!==null||d.enabled||d.receipts||d.recordsPersisted||d.completedBatches||d.pendingBatches||d.lastReceivedAt!==null||d.lastCapturedAt!==null)fail();
  if(d.receipts===0&&(d.recordsPersisted!==0||d.completedBatches!==0||d.pendingBatches!==0||d.lastReceivedAt!==null||d.lastCapturedAt!==null)||d.receipts>0&&(d.recordsPersisted<d.receipts||d.completedBatches+d.pendingBatches<1||d.completedBatches+d.pendingBatches>d.receipts||d.lastReceivedAt===null||d.lastCapturedAt===null))fail();
  total+=d.recordsPersisted;if(!Number.isSafeInteger(total))fail();seen.add(d.deviceId);
 }
 return v;
}
export function clockSourceStatus(d){
 if(!d.enrolled)return 'Inscripción pendiente';
 if(!d.enabled)return 'Recepción deshabilitada';
 if(['suspended','retired'].includes(d.deviceState))return 'Equipo suspendido o retirado';
 if(!d.receipts)return 'Esperando el primer envío';
 return d.pendingBatches?'Envíos por completar':'Archivo recibido';
}
