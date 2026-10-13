import { employeeContext } from './internal-native-employees.js';
import { salarySerialized } from '../assets/native-salary-catalog-model.js';

// An ephemeral key only. Never persisted or included in a response/log.
export function ownPeriodReadScopeKey(principal, session) {
 return salarySerialized({ context: employeeContext(principal, session), user: principal.user, tenant: principal.tenant });
}

export const OWN_PERIOD_READ_RECOVERY_WAIT_MS = 1000;
const waitForReadRecovery = ms => new Promise(resolve => setTimeout(resolve, ms));

// A short pause gives the original holder time to release its lock. Verify
// access after the pause; a persistent BUSY remains the same observable error.
// Only read resources are accepted, with at most two SQL reads and no command.
export async function recoverOwnPeriodRead({ method, operation, busyCode, read, reauthorize, waitForRecovery = waitForReadRecovery }) {
 if(method!=='GET'||!['bootstrap','detail','attempt','census'].includes(operation)||!['SENIORITY_BUSY','PARTICIPATION_BUSY','ART_DAYS_BUSY','FISCAL_FACTS_BUSY','WORKING_TIME_BUSY'].includes(busyCode)||typeof read!=='function'||typeof reauthorize!=='function'||typeof waitForRecovery!=='function')throw new TypeError('OWN_PERIOD_READ_RECOVERY_INVALID');
 try { return await read(); }
 catch(error) {
  if(error?.status!==409||error?.code!==busyCode)throw error;
  await waitForRecovery(OWN_PERIOD_READ_RECOVERY_WAIT_MS);
  if(await reauthorize()!==true)return null;
  return read();
 }
}
