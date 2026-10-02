import {catalogUuid,catalogAttemptKey} from './native-employment-catalog-model.js';
import {validateLifecycleBootstrap} from './native-employment-lifecycle-model.js';
import {NativeLeaveError,NATIVE_LEAVE_VERSION,NATIVE_LEAVE_STATES,nativeLeavePayload,nativeLeaveProfile,nativeLeaveAllocations} from './native-leave-model.js';

export {catalogUuid as nativeLeaveUuid,catalogAttemptKey as nativeLeaveAttemptKey};
export const NATIVE_LEAVE_COMMANDS=Object.freeze(['create','update_draft','submit','approve','reject','cancel','profile_propose','profile_approve','profile_reject']);
export const nativeLeaveExact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code,message)=>{throw new NativeLeaveError(code,message);};
const text=(v,min,max)=>typeof v==='string'&&[...v].length>=min&&[...v].length<=max&&!/[\p{Cc}<>]/u.test(v)&&v===v.normalize('NFC').trim();
const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const checked=v=>{if(!v)fail('CONTRACT_INVALID','No se pudo verificar la consulta completa. Volvé a consultar antes de continuar.');};
export const nativeLeaveSame=(a,b)=>{const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;return JSON.stringify(sorted(a))===JSON.stringify(sorted(b));};

// A closed envelope binds every write to the reviewed identity, employment
// and complete ledger snapshot. Actor, tenant and capabilities come from the
// authenticated server context; none can be supplied in this envelope.
export function nativeLeaveCommand(v){
 if(!nativeLeaveExact(v,['contractId','identityToken','scopeVersion','employmentVersion','snapshotVersion','command','entityId','expectedVersion','payload','reason','evidenceStatus','manualValidationConfirmed'])||!catalogUuid(v.contractId)||![v.identityToken,v.scopeVersion,v.employmentVersion,v.snapshotVersion].every(hash)||!NATIVE_LEAVE_COMMANDS.includes(v.command)||!Number.isSafeInteger(v.expectedVersion)||v.expectedVersion<0||v.expectedVersion>100||typeof v.manualValidationConfirmed!=='boolean')fail('INPUT_INVALID','Volvé a consultar el legajo y revisá todos los campos de la operación.');
 const isNew=['create','profile_propose'].includes(v.command),isProfile=v.command.startsWith('profile_');
 if(isNew?v.entityId!==null||v.expectedVersion!==0:!catalogUuid(v.entityId)||v.expectedVersion<1)fail('INPUT_INVALID','Revisá la identidad y versión de la solicitud.');
 let payload=null;
 if(['create','update_draft'].includes(v.command))payload=nativeLeavePayload(v.payload);
 else if(v.command==='profile_propose')payload=nativeLeaveProfile(v.payload);
 else if(v.payload!==null)fail('INPUT_INVALID','La decisión no puede sustituir los datos revisados.');
 if(!['create','update_draft'].includes(v.command)&&!text(v.reason,10,1000)||['create','update_draft'].includes(v.command)&&v.reason!==null)fail('INPUT_INVALID','Ingresá un fundamento de entre 10 y 1000 caracteres, sin datos clínicos.');
 if(v.command==='approve'){
  if(!['verified','not_required'].includes(v.evidenceStatus)||v.manualValidationConfirmed!==true)fail('EVIDENCE_REQUIRED','La aprobación requiere respaldo revisado y confirmación humana.');
 }else if(v.command==='profile_approve'){
  if(v.evidenceStatus!==null||v.manualValidationConfirmed!==true)fail('EVIDENCE_REQUIRED','La declaración de saldo requiere confirmar la revisión del respaldo.');
 }else if(v.evidenceStatus!==null||v.manualValidationConfirmed!==false)fail('INPUT_INVALID','Revisá la confirmación y el respaldo de esta operación.');
 return Object.freeze({...v,contractId:v.contractId.toLowerCase(),entityId:v.entityId?.toLowerCase()??null,payload});
}

function entity(v,profile){
 const states=profile?['pending','approved','rejected']:Object.keys(NATIVE_LEAVE_STATES);
 checked(nativeLeaveExact(v,['id','version','status','payload','createdAt','authorLabel','canUpdate','canSubmit','canReview','canCancel','history'])&&catalogUuid(v.id)&&Number.isSafeInteger(v.version)&&v.version>=1&&v.version<=100&&states.includes(v.status)&&stamp(v.createdAt)&&text(v.authorLabel,1,160)&&['canUpdate','canSubmit','canReview','canCancel'].every(k=>typeof v[k]==='boolean')&&Array.isArray(v.history)&&v.history.length===v.version);
 try{profile?nativeLeaveProfile(v.payload):nativeLeavePayload(v.payload);}catch{checked(false);}
 for(let i=0;i<v.history.length;i++){
  const e=v.history[i];checked(nativeLeaveExact(e,['version','command','status','payload','reason','evidenceStatus','manualValidationConfirmed','recordedAt','actorLabel'])&&e.version===i+1&&NATIVE_LEAVE_COMMANDS.includes(e.command)&&e.command.startsWith('profile_')===profile&&states.includes(e.status)&&stamp(e.recordedAt)&&text(e.actorLabel,1,160)&&typeof e.manualValidationConfirmed==='boolean'&&(e.reason===null||text(e.reason,10,1000)));
  try{profile?nativeLeaveProfile(e.payload):nativeLeavePayload(e.payload);}catch{checked(false);}
  if(i===0)checked(e.command===(profile?'profile_propose':'create')&&e.status===(profile?'pending':'draft'));
  else{
   const before=v.history[i-1],allowed=profile?{profile_approve:['pending','approved'],profile_reject:['pending','rejected']}:{update_draft:['draft','draft'],submit:['draft','submitted'],approve:['submitted','approved'],reject:['submitted','rejected']};
   checked(e.command==='cancel'&&!profile?['draft','submitted','approved'].includes(before.status)&&e.status==='cancelled':allowed[e.command]?.[0]===before.status&&allowed[e.command]?.[1]===e.status);
   if(e.command!=='update_draft')checked(nativeLeaveSame(before.payload,e.payload));
   else checked(['reasonCode','durationUnit','confidentiality'].every(k=>before.payload[k]===e.payload[k]));
  }
  if(e.command==='approve')checked(e.status==='approved'&&e.manualValidationConfirmed===true&&['verified','not_required'].includes(e.evidenceStatus)&&(e.payload.confidentiality==='standard'||e.evidenceStatus==='verified'));
  else checked(e.evidenceStatus===null&&e.manualValidationConfirmed===(e.command==='profile_approve'));
 }
 const last=v.history.at(-1);checked(last.status===v.status&&nativeLeaveSame(last.payload,v.payload));
 checked(v.createdAt===v.history[0].recordedAt&&v.authorLabel===v.history[0].actorLabel);
 checked(!profile||!v.canUpdate&&!v.canSubmit&&!v.canCancel);
 checked(profile?v.status==='pending'||!v.canReview:v.status==='draft'||!v.canUpdate&&!v.canSubmit);
 checked(profile||v.status==='submitted'||!v.canReview);
 checked(profile||['draft','submitted','approved'].includes(v.status)||!v.canCancel);
}

export function validateNativeLeaveBootstrap(v,contractId){
 checked(nativeLeaveExact(v,['version','scopeVersion','snapshotVersion','subject','employment','permissions','complete','requests','profileProposals','balances'])&&v.version===NATIVE_LEAVE_VERSION&&hash(v.scopeVersion)&&hash(v.snapshotVersion)&&v.complete===true);
 try{validateLifecycleBootstrap({version:'native-employment-lifecycle.v1',scopeVersion:v.scopeVersion,subject:v.subject,employment:v.employment,permissions:{canPropose:false,canReview:false},proposals:[],historyTruncated:false},contractId);}catch{checked(false);}
 checked(nativeLeaveExact(v.permissions,['canCreate','canProposeProfile'])&&Object.values(v.permissions).every(x=>typeof x==='boolean')&&Array.isArray(v.requests)&&v.requests.length<=1000&&Array.isArray(v.profileProposals)&&v.profileProposals.length<=500&&Array.isArray(v.balances)&&v.balances.length<=500);
 const ids=new Set();for(const [rows,profile]of [[v.requests,false],[v.profileProposals,true]])for(const row of rows){entity(row,profile);checked(!ids.has(row.id.toLowerCase()));ids.add(row.id.toLowerCase());}
 const pools=new Set();for(const p of v.balances){
  checked(nativeLeaveExact(p,['year','reasonCode','durationUnit','mode','entitledUnits','reservedUnits','approvedUnits','availableUnits'])&&Number.isSafeInteger(p.year)&&p.year>=2000&&p.year<=2100&&typeof p.reasonCode==='string'&&['calendar_day','minute'].includes(p.durationUnit)&&['confirmed','not_applicable','unavailable'].includes(p.mode)&&[p.reservedUnits,p.approvedUnits].every(n=>Number.isSafeInteger(n)&&n>=0));
  const key=p.reasonCode+':'+p.year+':'+p.durationUnit;checked(!pools.has(key));pools.add(key);
  if(p.mode==='confirmed')checked(Number.isSafeInteger(p.entitledUnits)&&p.entitledUnits>=0&&p.entitledUnits<=1000000&&p.availableUnits===p.entitledUnits-p.reservedUnits-p.approvedUnits&&p.availableUnits>=0);
  else checked(p.entitledUnits===null&&p.availableUnits===null);
  const counted={reservedUnits:0,approvedUnits:0};for(const r of v.requests)if(['submitted','approved'].includes(r.status))for(const part of nativeLeaveAllocations(r.payload))if(part.reasonCode===p.reasonCode&&part.year===p.year&&part.durationUnit===p.durationUnit)counted[r.status==='submitted'?'reservedUnits':'approvedUnits']+=part.units;
  checked(counted.reservedUnits===p.reservedUnits&&counted.approvedUnits===p.approvedUnits);
 }
 for(const r of v.requests)for(const p of nativeLeaveAllocations(r.payload))checked(pools.has(p.reasonCode+':'+p.year+':'+p.durationUnit));
 return v;
}

export function validateNativeLeaveReceipt(v,contractId,expected=null){
 checked(nativeLeaveExact(v,['version','command','contractId','entityId','entityVersion','status','payload','requestSha256','replayed','payrollModified'])&&v.version===NATIVE_LEAVE_VERSION&&NATIVE_LEAVE_COMMANDS.includes(v.command)&&catalogUuid(v.contractId)&&v.contractId.toLowerCase()===contractId.toLowerCase()&&catalogUuid(v.entityId)&&Number.isSafeInteger(v.entityVersion)&&v.entityVersion>=1&&v.entityVersion<=100&&hash(v.requestSha256)&&typeof v.replayed==='boolean'&&v.payrollModified===false);
 try{v.command.startsWith('profile_')?nativeLeaveProfile(v.payload):nativeLeavePayload(v.payload);}catch{checked(false);}
 const statuses={create:'draft',update_draft:'draft',submit:'submitted',approve:'approved',reject:'rejected',cancel:'cancelled',profile_propose:'pending',profile_approve:'approved',profile_reject:'rejected'};checked(v.status===statuses[v.command]);
 if(expected){const e=nativeLeaveCommand(expected);checked(v.command===e.command&&v.entityVersion===e.expectedVersion+1&&(e.entityId===null||e.entityId===v.entityId.toLowerCase())&&(e.payload===null||nativeLeaveSame(e.payload,v.payload)));}
 return v;
}
