import {nativeLeaveOperation,nativeLeaveError,NativeLeaveOperationError} from './internal-native-leave.js';
export function nativeSelfError(error){
 const source=String(error?.code??'')+' '+String(error?.message??'');
 if(/\bNATIVE_SELF_SESSION_INVALID\b/.test(source))return new NativeLeaveOperationError('SESSION_INVALID',401,'La sesión cambió. Volvé a ingresar.');
 if(/\bNATIVE_SELF_(?:FORBIDDEN|IDENTITY_INVALID)\b/.test(source))return new NativeLeaveOperationError('FORBIDDEN',403,'No se pudo verificar el vínculo de tu cuenta con su contrato. Consultá con Administración.');
 return nativeLeaveError(error);
}
// Reuse the exact private-body/receipt validation, with dedicated SQL facades
// that independently require the current account's own native contract.
export function nativeSelfLeaveOperation(sql,principal,session,operation,input={}){
 return nativeLeaveOperation({query(query,values){
  const facade={bootstrap:'native_self_leave_bootstrap_v1',attempt:'native_self_leave_attempt_v1',command:'native_self_leave_command_v1'}[operation];
  if(!facade||!query.includes('public.native_leave_'+operation+'_v1('))throw Error('NATIVE_LEAVE_INPUT_INVALID');
  return sql.query(query.replace('public.native_leave_'+operation+'_v1(', 'public.'+facade+'('),values);
 }},principal,session,operation,input);
}
