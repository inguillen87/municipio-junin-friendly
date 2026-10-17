import {createHash} from 'node:crypto';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {payrollRequire as require} from '../assets/own-payroll-exact.js';
import {MONTHLY_DAY_FACTS_VERSION,monthlyDayCapture} from '../assets/own-monthly-day-policy-model.js';
const hash=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
export function verifyMonthlyDayCapture(raw,employees,period,scope,program){
 const v=monthlyDayCapture(raw,employees,period,scope,program),{complete,version,payloadSha256,...payload}=v;
 require(hash(payload)===payloadSha256&&hash([MONTHLY_DAY_FACTS_VERSION,payloadSha256])===version&&hash(v.programBasis.policy)===v.programBasis.policySha256,'MONTHLY_DAY_HASH_CHANGED','La captura o política no conserva su huella completa.');
 for(const r of v.records){const{sha256,...source}=r.source;require(hash(source)===sha256,'MONTHLY_DAY_HASH_CHANGED','Cambió la fuente laboral íntegra capturada.');}return v;
}
