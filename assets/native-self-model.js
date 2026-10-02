import {nativeLeaveUuid} from './native-leave-contract.js';
export class NativeSelfError extends Error{constructor(message='No se pudo verificar el contrato de tu cuenta.'){super(message);this.code='NATIVE_SELF_CONTRACT_INVALID';}}
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v.slice(0,23)+'Z';
export function nativeSelfView(v){
 if(!exact(v,['version','state','subject'])||v.version!=='native-employee-self.v1'||!['native','unlinked','reference'].includes(v.state))throw new NativeSelfError();
 if(v.state!=='native'){if(v.subject!==null)throw new NativeSelfError();return v;}
 const s=v.subject;
 if(!exact(s,['contractId','legajo','employeeName','identityToken','sourceCutoff','origin','registrationId','registeredAt'])||!nativeLeaveUuid(s.contractId)||!nativeLeaveUuid(s.registrationId)||s.origin!=='MUNICONTROL'||s.sourceCutoff!==null||typeof s.legajo!=='string'||!/^[1-9][0-9]{0,8}$/.test(s.legajo)||! /^[a-f0-9]{64}$/.test(s.identityToken)||!(s.employeeName===null||typeof s.employeeName==='string'&&s.employeeName.length<=160)||!stamp(s.registeredAt))throw new NativeSelfError();
 return v;
}
