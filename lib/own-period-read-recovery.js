import { employeeContext } from './internal-native-employees.js';
import { salarySerialized } from '../assets/native-salary-catalog-model.js';

// An ephemeral key only. Never persisted or included in a response/log.
export function ownPeriodReadScopeKey(principal, session) {
 return salarySerialized({ context: employeeContext(principal, session), user: principal.user, tenant: principal.tenant });
}

// The SQL guard remains observable. A persistent BUSY is returned unchanged.
// This helper accepts only read resources and makes at most two SQL reads.
export async function recoverOwnPeriodRead({ method, operation, busyCode, read, reauthorize }) {
 if(method!=='GET'||!['bootstrap','detail','attempt','census'].includes(operation)||!['SENIORITY_BUSY','PARTICIPATION_BUSY','ART_DAYS_BUSY','FISCAL_FACTS_BUSY'].includes(busyCode)||typeof read!=='function'||typeof reauthorize!=='function')throw new TypeError('OWN_PERIOD_READ_RECOVERY_INVALID');
 try { return await read(); }
 catch(error) {
  if(error?.status!==409||error?.code!==busyCode)throw error;
  if(await reauthorize()!==true)return null;
  return read();
 }
}
