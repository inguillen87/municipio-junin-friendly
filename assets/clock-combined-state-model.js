import {assertClockWorkspace,workspaceRows} from './clock-fleet-workspace-model.js';

// Read model only. No file, network, process, device or payroll operations.
// Hashes identify evidence bytes; their presence does not authenticate a publisher.
export const CLOCK_STATE_RECENT_MS=30*60*1000;
const FUTURE_TOLERANCE_MS=5*60*1000;
const fail=kind=>{throw Error('CLOCK_COMBINED_'+kind+'_INVALID');};
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const count=v=>Number.isSafeInteger(v)&&v>=0;
const clockId=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{1,63}$/.test(v);
const siteKey=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9._-]{1,95}$/.test(v);
const serial=v=>typeof v==='string'&&/^[A-Za-z0-9-]{6,64}$/.test(v);
const connector=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9._-]{7,127}$/.test(v);
const code=v=>v===null||typeof v==='string'&&/^[A-Z][A-Z0-9_]{0,70}$/.test(v);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const time=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(v)&&Number.isFinite(Date.parse(v))&&day(v.slice(0,10));
const nullableTime=v=>v===null||time(v);
const boundedTimes=(values,at)=>values.every(v=>v===null||time(v)&&Date.parse(v)<=Date.parse(at)+FUTURE_TOLERANCE_MS);
const lower=v=>v.toLowerCase();
function unique(rows,key,kind,nullable=false){const seen=new Set();for(const row of rows){const value=row[key];if(nullable&&value===null)continue;const k=lower(value);if(seen.has(k))fail(kind);seen.add(k);}}
function freshness(observedAt,sourceAt,asOf){
 if(sourceAt===null)return {state:'unknown',observedAt,sourceAt:null,ageMs:null};
 const ageMs=Math.max(0,Date.parse(asOf)-Math.min(Date.parse(observedAt),Date.parse(sourceAt)));
 return {state:ageMs>CLOCK_STATE_RECENT_MS?'stale':'fresh',observedAt,sourceAt,ageMs};
}
const absentFreshness=()=>({state:'unknown',observedAt:null,sourceAt:null,ageMs:null});

function assertCaptureRow(r,updatedAt){
 const base=['clockId','status','lastError','cloudReception'];
 const full=['blocked','lastAttemptAt','lastCaptureAt','connectionFailureCount','uniqueLocalRecords','nextPollAt'];
 const review=r?.status==='review_required';
 if(!exact(r,review?base:[...base,...full])||!clockId(r.clockId)||!code(r.lastError)||r.cloudReception!=='not_configured')fail('LOCAL');
 if(review){if(r.lastError===null)fail('LOCAL');return;}
 if(!['waiting','captured_locally','blocked','retry_wait','network_wait','storage_wait','stopped','disabled'].includes(r.status)||typeof r.blocked!=='boolean'||r.status!=='disabled'&&r.blocked!==(r.status==='blocked')||!count(r.connectionFailureCount)||r.connectionFailureCount>1000||!count(r.uniqueLocalRecords)||!['lastAttemptAt','lastCaptureAt','nextPollAt'].every(k=>nullableTime(r[k])))fail('LOCAL');
 if(!boundedTimes([r.lastAttemptAt,r.lastCaptureAt],updatedAt)||r.blocked&&r.nextPollAt!==null||r.status==='captured_locally'&&(r.lastCaptureAt===null||r.lastError!==null)||['blocked','retry_wait','network_wait','storage_wait'].includes(r.status)&&r.lastError===null)fail('LOCAL');
 if(['retry_wait','network_wait','storage_wait'].includes(r.status)&&r.nextPollAt===null||r.status==='storage_wait'&&r.lastError!=='DISK_SPACE_LOW')fail('LOCAL');
}
function assertSenderStatus(s,checkedAt){
 const keys=['version','clockId','state','updatedAt','failures','code','nextAttemptAt','sent','confirmedRecords','remainingParts','lastReceiptAt','lastReconciledAt','captureFilesRemoved','physicalClockVerified'];
 if(!exact(s,keys)||s.version!=='zk40-sender-status.v1'||!clockId(s.clockId)||!['ready','pending','queue_confirmed','retry_wait','blocked'].includes(s.state)||!time(s.updatedAt)||!count(s.failures)||s.failures>1000||!code(s.code)||!count(s.sent)||s.sent>4||s.captureFilesRemoved!==false||s.physicalClockVerified!==false||!['lastReceiptAt','lastReconciledAt','nextAttemptAt'].every(k=>nullableTime(s[k]))||!['confirmedRecords','remainingParts'].every(k=>s[k]===null||count(s[k])))fail('LOCAL');
 if(!boundedTimes([s.updatedAt,s.lastReceiptAt,s.lastReconciledAt],checkedAt)||!boundedTimes([s.lastReceiptAt,s.lastReconciledAt],s.updatedAt))fail('LOCAL');
 if(s.state==='retry_wait'&&(s.code!=='ZK40_DELIVERY_NETWORK_RETRY'||s.failures<1||s.nextAttemptAt===null)||s.state!=='retry_wait'&&s.nextAttemptAt!==null||s.state==='blocked'&&(s.code===null||s.failures<1)||['ready','pending','queue_confirmed'].includes(s.state)&&(s.code!==null||s.failures!==0))fail('LOCAL');
 // A successful complete reconciliation has concrete counts. A later failure may
 // retain those counts; freshness is measured from lastReconciledAt, not updatedAt.
 if(s.lastReconciledAt===null&&(s.confirmedRecords!==null||s.remainingParts!==null||s.lastReceiptAt!==null)||s.lastReconciledAt!==null&&(s.confirmedRecords===null||s.remainingParts===null)||s.confirmedRecords>0&&s.lastReceiptAt===null||s.confirmedRecords===0&&s.lastReceiptAt!==null)fail('LOCAL');
 if(s.state==='pending'&&!(s.remainingParts>0)||s.state==='queue_confirmed'&&s.remainingParts!==0||['pending','queue_confirmed'].includes(s.state)&&s.lastReconciledAt===null)fail('LOCAL');
}

/**
 * Input is projected by a trusted, authenticated metadata reader. It must verify
 * regular stable files and bind their identities to the tenant's enrolled device.
 * This pure adapter validates that projection; it never opens a gateway file.
 */
export function normalizeClockLocalEvidence(value,{tenantId,asOf,devices}){
 if(!uuid(tenantId)||!time(asOf)||!Array.isArray(devices))fail('CONTEXT');
 if(!exact(value,['version','tenantId','checkedAt','bindings','capture','deliveries'])||value.version!=='clock-local-evidence.v1'||!uuid(value.tenantId)||lower(value.tenantId)!==lower(tenantId)||!time(value.checkedAt)||!boundedTimes([value.checkedAt],asOf)||!Array.isArray(value.bindings)||value.bindings.length>200||!Array.isArray(value.deliveries)||value.deliveries.length>200)fail('LOCAL');
 const core=new Map(devices.map(d=>[lower(d.deviceId),d])),bindings=new Map(),captureRows=new Map(),senderRows=new Map();
 for(const b of value.bindings){
  if(!exact(b,['deviceId','siteKey','clockId','serial','connectorId','connectorKey'])||!uuid(b.deviceId)||!siteKey(b.siteKey)||!clockId(b.clockId)||!serial(b.serial)||!(b.connectorId===null&&b.connectorKey===null||uuid(b.connectorId)&&connector(b.connectorKey)))fail('LOCAL');
  const d=core.get(lower(b.deviceId));if(!d||d.siteKey!==b.siteKey)fail('BINDING');bindings.set(b.clockId,b);
 }
 for(const key of ['deviceId','clockId','serial'])unique(value.bindings,key,'BINDING');
 for(const key of ['connectorId','connectorKey'])unique(value.bindings,key,'BINDING',true);
 let captureUpdatedAt=null,captureSha256=null;
 if(value.capture!==null){
  const c=value.capture;
  if(!exact(c,['sha256','summary','identities'])||!sha(c.sha256)||!exact(c.summary,['schema','updatedAt','clocks','cloudReception'])||c.summary.schema!=='clock-fleet-summary.v1'||!time(c.summary.updatedAt)||!boundedTimes([c.summary.updatedAt],value.checkedAt)||c.summary.cloudReception!=='not_configured'||!Array.isArray(c.summary.clocks)||c.summary.clocks.length>200||!Array.isArray(c.identities)||c.identities.length!==c.summary.clocks.length)fail('LOCAL');
  const identities=new Map();
  for(const entry of c.identities){
   if(!exact(entry,['sha256','identity'])||!sha(entry.sha256)||!exact(entry.identity,['schema','clockId','serial'])||entry.identity.schema!=='clock-fleet-identity.v1'||!clockId(entry.identity.clockId)||!serial(entry.identity.serial)||identities.has(entry.identity.clockId))fail('LOCAL');
   const b=bindings.get(entry.identity.clockId);if(!b||b.serial!==entry.identity.serial)fail('BINDING');identities.set(entry.identity.clockId,entry.identity);
  }
  for(const r of c.summary.clocks){assertCaptureRow(r,c.summary.updatedAt);if(!identities.has(r.clockId)||captureRows.has(r.clockId))fail('BINDING');captureRows.set(r.clockId,r);}
  captureUpdatedAt=c.summary.updatedAt;captureSha256=c.sha256;
 }
 for(const entry of value.deliveries){
  if(!exact(entry,['identitySha256','identity','statusSha256','status'])||!sha(entry.identitySha256)||!sha(entry.statusSha256)||!exact(entry.identity,['schema','clockId','serial','connectorKey'])||entry.identity.schema!=='clock-fleet-delivery-identity.v1')fail('LOCAL');
  const i=entry.identity,b=bindings.get(i.clockId);if(!b||b.connectorId===null||i.serial!==b.serial||i.connectorKey!==b.connectorKey||senderRows.has(i.clockId))fail('BINDING');
  assertSenderStatus(entry.status,value.checkedAt);if(entry.status.clockId!==i.clockId)fail('BINDING');senderRows.set(i.clockId,entry);
 }
 return value.bindings.map(b=>({deviceId:b.deviceId,siteKey:b.siteKey,checkedAt:value.checkedAt,
  capture:captureRows.has(b.clockId)?{...captureRows.get(b.clockId),updatedAt:captureUpdatedAt,sha256:captureSha256}:null,
  delivery:senderRows.has(b.clockId)?{...senderRows.get(b.clockId).status,sha256:senderRows.get(b.clockId).statusSha256}:null}));
}

function mappingRows(value,{tenantId,asOf,devices}){
 if(value===null)return new Map();
 if(!exact(value,['version','tenantId','checkedAt','target','population','from','to','rows'])||value.version!=='clock-identity-mapping-summary.v1'||!uuid(value.tenantId)||lower(value.tenantId)!==lower(tenantId)||!time(value.checkedAt)||!boundedTimes([value.checkedAt],asOf)||value.target!=='own_employment'||value.population!=='canonical_marks'||!day(value.from)||!day(value.to)||value.from>value.to||!Array.isArray(value.rows)||value.rows.length>200)fail('MAPPING');
 const core=new Map(devices.map(d=>[lower(d.deviceId),d])),out=new Map();
 for(const r of value.rows){
  if(!exact(r,['deviceId','siteKey','total','linked','unmapped','ambiguous'])||!uuid(r.deviceId)||!siteKey(r.siteKey)||!['total','linked','unmapped','ambiguous'].every(k=>count(r[k]))||!Number.isSafeInteger(r.linked+r.unmapped+r.ambiguous)||r.total!==r.linked+r.unmapped+r.ambiguous)fail('MAPPING');
  const d=core.get(lower(r.deviceId));if(!d||d.siteKey!==r.siteKey||out.has(lower(r.deviceId)))fail('BINDING');out.set(lower(r.deviceId),{...r,checkedAt:value.checkedAt,from:value.from,to:value.to});
 }
 return out;
}

function captureState(local,asOf){
 const s=local?.capture;
 if(!s)return {state:'unknown',label:'Captura sin verificar',freshness:absentFreshness(),reportedState:null,blocked:null,lastAttemptAt:null,lastCaptureAt:null,captureAgeMs:null,nextPollAt:null,code:null};
 const fresh=freshness(local.checkedAt,s.updatedAt,asOf),captureAgeMs=s.lastCaptureAt?Math.max(0,Date.parse(asOf)-Date.parse(s.lastCaptureAt)):null;
 const reportedState=s.status;
 const current=reportedState==='captured_locally'?(captureAgeMs>CLOCK_STATE_RECENT_MS?'previous':'recent'):reportedState;
 const state=fresh.state==='stale'?'stale':current;
 const labels={stale:'Estado de captura anterior',recent:'Captura reciente',previous:'Última captura anterior',blocked:'Captura bloqueada',retry_wait:'Captura en reintento',network_wait:'Esperando red',storage_wait:'Espacio pendiente',stopped:'Captura detenida',disabled:'Captura deshabilitada',waiting:'Esperando captura',review_required:'Revisar captura'};
 return {state,label:labels[state],freshness:fresh,reportedState,blocked:s.blocked??null,lastAttemptAt:s.lastAttemptAt??null,lastCaptureAt:s.lastCaptureAt??null,captureAgeMs,nextPollAt:s.nextPollAt??null,code:s.lastError};
}
function deliveryState(local,asOf){
 const s=local?.delivery;
 if(!s)return {state:'unknown',label:'Envío sin verificar',freshness:absentFreshness(),queueFreshness:absentFreshness(),reportedState:null,remainingParts:null,lastKnownRemainingParts:null,confirmedRecords:null,lastKnownConfirmedRecords:null,lastReceiptAt:null,lastReconciledAt:null,nextAttemptAt:null,code:null};
 const fresh=freshness(local.checkedAt,s.updatedAt,asOf),queue=freshness(local.checkedAt,s.lastReconciledAt,asOf),state=fresh.state==='stale'?'stale':s.state;
 const labels={stale:'Estado de envío anterior',ready:'Envío preparado',pending:'Partes por enviar',queue_confirmed:'Cola verificada al corte',retry_wait:'Envío en reintento',blocked:'Envío bloqueado'};
 return {state,label:labels[state],freshness:fresh,queueFreshness:queue,reportedState:s.state,remainingParts:queue.state==='fresh'?s.remainingParts:null,lastKnownRemainingParts:s.remainingParts,confirmedRecords:queue.state==='fresh'?s.confirmedRecords:null,lastKnownConfirmedRecords:s.confirmedRecords,lastReceiptAt:s.lastReceiptAt,lastReconciledAt:s.lastReconciledAt,nextAttemptAt:s.nextAttemptAt,code:s.code};
}
function receptionState(device,checkedAt,asOf){
 if(!device)return {state:'unknown',label:'Sin recepción verificada',freshness:absentFreshness(),lastReceivedAt:null,lastDeclaredCaptureAt:null,receipts:null,recordsConfirmed:null,newCanonical:null,observations:null,duplicates:null};
 const fresh=freshness(checkedAt,checkedAt,asOf),state=fresh.state==='stale'?'stale':device.receipts===0?'waiting':Date.parse(asOf)-Date.parse(device.lastReceivedAt)>CLOCK_STATE_RECENT_MS?'previous':'recent';
 const labels={stale:'Consulta de recepción anterior',waiting:'Sin acuses recibidos',previous:'Último acuse anterior',recent:'Recepción reciente'};
 return {state,label:labels[state],freshness:fresh,lastReceivedAt:device.lastReceivedAt,lastDeclaredCaptureAt:device.lastCapturedAt,receipts:device.receipts,recordsConfirmed:device.recordsConfirmed,newCanonical:device.newCanonical,observations:device.observations,duplicates:device.duplicates};
}
function mappingState(row,asOf){
 if(!row)return {state:'unknown',label:'Vinculación sin verificar',freshness:absentFreshness(),from:null,to:null,total:null,linked:null,unmapped:null,ambiguous:null};
 const fresh=freshness(row.checkedAt,row.checkedAt,asOf),state=fresh.state==='stale'?'stale':row.total===0?'empty':row.unmapped||row.ambiguous?'review':'linked';
 const labels={stale:'Consulta de vinculación anterior',empty:'Sin marcas en el período',review:'Revisar vinculación',linked:'Vinculadas en el período'};
 return {state,label:labels[state],freshness:fresh,from:row.from,to:row.to,total:row.total,linked:row.linked,unmapped:row.unmapped,ambiguous:row.ambiguous};
}

export function createClockCombinedState(input){
 if(!exact(input,['workspace','tenantId','asOf','localEvidence','identityMapping'])||!uuid(input.tenantId)||!time(input.asOf))fail('CONTEXT');
 const {workspace,tenantId,asOf}=input;
 assertClockWorkspace(workspace);
 if(!time(workspace.reception.checkedAt)||!boundedTimes([workspace.reception.checkedAt,workspace.archive?.sourceCheckedAt??null],asOf))fail('CONTEXT');
 const devices=workspace.reception.devices;
 const localRows=input.localEvidence===null?[]:normalizeClockLocalEvidence(input.localEvidence,{tenantId,asOf,devices}),byDevice=new Map(localRows.map(r=>[lower(r.deviceId),r]));
 const mapping=mappingRows(input.identityMapping,{tenantId,asOf,devices});
 const rows=workspaceRows(workspace).map(r=>{
  const d=r.device,id=d?lower(d.deviceId):null,local=id?byDevice.get(id):null;
  const capture=captureState(local,asOf),delivery=deliveryState(local,asOf),reception=receptionState(d,workspace.reception.checkedAt,asOf),linking=mappingState(id?mapping.get(id):null,asOf);
  const administration=!d?'registration_required':['suspended','retired'].includes(d.deviceState)||['suspended','retired'].includes(d.connectorState)?'restricted':!d.enrolled||d.connectorState==='not_configured'||d.deviceState==='draft'?'configuration_required':'configured';
  const signals=[];
  if(administration==='registration_required')signals.push({key:'registration',label:'Inscripción pendiente'});
  if(administration==='restricted')signals.push({key:'restriction',label:'Equipo o conector restringido'});
  if(administration==='configuration_required')signals.push({key:'configuration',label:'Configuración pendiente'});
  if(['blocked','review_required','network_wait','storage_wait','retry_wait','stopped','disabled'].includes(capture.state))signals.push({key:'capture',label:capture.label});
  if(['blocked','retry_wait'].includes(delivery.state))signals.push({key:'delivery',label:delivery.label});
  if(delivery.remainingParts>0)signals.push({key:'backlog',label:'Partes locales pendientes'});
  if(reception.state==='recent')signals.push({key:'receipt',label:'Recepción reciente'});
  if(linking.state==='review')signals.push({key:'mapping',label:'Vinculación por revisar en el período'});
  if([capture,delivery,reception,linking].some(s=>s.state==='stale'))signals.push({key:'stale',label:'Hay estados anteriores al corte'});
  return {siteKey:r.point.siteKey,label:r.point.label,model:r.point.model,deviceId:d?.deviceId??null,administration,canConsult:d?.canConsult??false,capture,delivery,reception,mapping:linking,signals};
 });
 return {version:'clock-combined-state.v1',asOf,rows,liveConnectionVerified:false,coverageVerified:false,payrollModified:false};
}
