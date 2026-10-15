// The declared payroll period is the only source. No date, clock, attendance
// or day-count policy participates in this versioned context.
import {salaryExact,salaryHash,salarySerialized} from './native-salary-catalog-model.js';
import {payrollRequire as require} from './own-payroll-exact.js';

export const OWN_PAYROLL_PERIOD_CONTEXT_VERSION='own-payroll-period-context.v1';
export const ownProgramPeriodContext=p=>p!==null&&typeof p==='object'&&Object.getOwnPropertyDescriptor(p,'periodContextVersion')?.value===OWN_PAYROLL_PERIOD_CONTEXT_VERSION;
const keys=['version','period','monthNumber','sha256'];
export function periodContextFields(period){
 require(typeof period==='string'&&period.length===7&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(period),'PERIOD_CONTEXT_INVALID','El contexto requiere el período de liquidación declarado, con año y mes válidos.');
 const month=period.slice(5);
 return{version:OWN_PAYROLL_PERIOD_CONTEXT_VERSION,period,monthNumber:month[0]==='0'?month.slice(1):month};
}
export function periodContextCapture(value,period){
 const fields=periodContextFields(period);
 require(salaryExact(value,keys)&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>Object.hasOwn(d,'value')&&d.enumerable),'PERIOD_CONTEXT_INVALID','No se verificó el contexto completo del período.');
 require(value.version===fields.version&&value.period===fields.period&&typeof value.monthNumber==='string'&&['1','2','3','4','5','6','7','8','9','10','11','12'].includes(value.monthNumber)&&value.monthNumber===fields.monthNumber&&salaryHash(value.sha256),'PERIOD_CONTEXT_INVALID','El mes o la versión no corresponden al período declarado. No se convierten números ni se usa una fecha alternativa.');
 return value;
}
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(value))))].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function createPeriodContext(period){const fields=periodContextFields(period);return{...fields,sha256:await hash(fields)};}
export async function verifiedPeriodContextCapture(value,period){
 periodContextCapture(value,period);
 require(value.sha256===await hash(periodContextFields(period)),'SOURCE_VERSION_INVALID','La huella del contexto no conserva el período y su mes declarados.');
 return value;
}
