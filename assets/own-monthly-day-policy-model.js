import {lifecycleActivity,LIFECYCLE_VERSION,ADOPTED_LIFECYCLE_VERSION} from './native-employment-lifecycle-model.js';
import {isoDay} from './native-employee-contract.js';
import {salaryExact,salaryHash,salaryUuid,salarySerialized} from './native-salary-catalog-model.js';
import {participationSource,participationPeriod} from './own-period-participation-model.js';
import {payrollRequire as require} from './own-payroll-exact.js';
export const MONTHLY_DAY_POLICY_VERSION='own-monthly-day-policy.v1';
export const MONTHLY_DAY_FACTS_VERSION='own-monthly-day-facts.v2';
export const MONTHLY_DAY_SOURCE_VERSION='own-monthly-day-source.v2';
const failure=()=>require(false,'MONTHLY_DAY_CONTRACT_INVALID','No se verificó la política mensual o la fuente propia completa de días.');
export function monthlyDayPlain(value,depth=0,budget={nodes:0}){
 if(++budget.nodes>300000||depth>20)failure();
 if(value===null||['string','boolean'].includes(typeof value)||typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object')failure();
 const array=Array.isArray(value),proto=Object.getPrototypeOf(value);if(!array&&proto!==Object.prototype&&proto!==null)failure();
 const keys=Reflect.ownKeys(value);if(keys.some(k=>typeof k!=='string')||keys.length>10001||array&&(keys.length!==value.length+1||value.length>10000))failure();
 const result=array?[]:{};
 for(const key of keys){if(array&&key==='length')continue;const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value')||!d.enumerable||array&&!/^(0|[1-9][0-9]*)$/.test(key))failure();Object.defineProperty(result,key,{value:monthlyDayPlain(d.value,depth+1,budget),enumerable:true,writable:true,configurable:true});}
 return result;
}
const exact=(v,k)=>salaryExact(v,k),hash=v=>salaryHash(v)&&v.length===64,uuid=v=>salaryUuid(v)&&v.length===36;
const reference=v=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=3&&v.length<=180&&!/[<>\u0000-\u001f\u007f]/.test(v);
const stamp=v=>typeof v==='string'&&isoDay(v.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const scopeKeys=['tenantId','sourceBindingId','membershipId','companyId','scopeVersion'];
export function monthlyDayScope(raw){const v=monthlyDayPlain(raw);require(exact(v,scopeKeys)&&['tenantId','sourceBindingId','membershipId'].every(k=>uuid(v[k]))&&typeof v.companyId==='string'&&/^[1-9][0-9]*$/.test(v.companyId)&&hash(v.scopeVersion),'MONTHLY_DAY_SCOPE_INVALID','Cambió el ámbito autorizado de captura.');return v;}
export function monthlyDayPolicy(raw){const p=monthlyDayPlain(raw);require(exact(p,['version','basis','unit','recognizedDays','baseDays','partial','reference'])&&p.version===MONTHLY_DAY_POLICY_VERSION&&p.basis==='verified_full_month'&&p.unit==='days'&&p.recognizedDays==='30'&&p.baseDays==='30'&&p.partial==='reject'&&reference(p.reference),'MONTHLY_DAY_POLICY_INVALID','El programa debe declarar expresamente 30 días para mes completo y rechazar días parciales sin base tipada.');return p;}
export function monthlyDaySource(raw,expected){
 const v=monthlyDayPlain(raw),scope=monthlyDayScope(expected.scope);
 require(exact(v,['version','scope','contractId','identityToken','period','employmentKind','participationSource','lifecycle','sha256'])&&v.version===MONTHLY_DAY_SOURCE_VERSION&&hash(v.sha256)&&v.contractId===expected.contractId&&v.identityToken===expected.identityToken&&v.period===expected.period&&uuid(v.contractId)&&hash(v.identityToken)&&participationPeriod(v.period)&&salarySerialized(monthlyDayScope(v.scope))===salarySerialized(scope)&&['native','adopted'].includes(v.employmentKind),'MONTHLY_DAY_SOURCE_CHANGED','La fuente no coincide con contrato, período o ámbito.');
 const s=participationSource(v.participationSource,v.contractId);require(s.period===v.period&&s.subject.identityToken===v.identityToken&&s.fullPeriod===true,'MONTHLY_DAY_PARTIAL_UNSUPPORTED','Los días tipados de este programa sólo admiten mes completo verificado; no se omite ningún contrato.');
 const l=v.lifecycle,adopted=v.employmentKind==='adopted';
 require(exact(l,['version','revision','appliedAt','intervals','today','status',...(adopted?['datesVerified']:[])])&&hash(l.version)&&Number.isInteger(l.revision)&&l.revision>=0&&l.revision<=100&&(l.revision===0?l.appliedAt===null:stamp(l.appliedAt))&&isoDay(l.today)&&['active','inactive','pending_start'].includes(l.status)&&(!adopted||l.datesVerified===true)&&Array.isArray(l.intervals)&&l.intervals.length>=1&&l.intervals.length<=51,'MONTHLY_DAY_DATES_REQUIRED','Faltan fechas laborales propias verificadas; no se supone cobertura.');
 let activity;try{activity=lifecycleActivity(l.intervals,l.today,adopted?ADOPTED_LIFECYCLE_VERSION:LIFECYCLE_VERSION);}catch{require(false,'MONTHLY_DAY_DATES_REQUIRED','El historial laboral está incompleto o se superpone.');}require(activity===l.status,'MONTHLY_DAY_DATES_REQUIRED','El estado laboral no coincide con sus fechas verificadas.');
 const first=v.period+'-01',last=new Date(Date.UTC(Number(v.period.slice(0,4)),Number(v.period.slice(5)),0)).toISOString().slice(0,10),rows=l.intervals.filter(r=>r.startDate<=last&&(r.endDate===null||r.endDate>=first));
 require(rows.length===1&&rows[0].startDate<=first&&(rows[0].endDate===null||rows[0].endDate>=last),'MONTHLY_DAY_PARTIAL_UNSUPPORTED','El período no es un mes completo verificado; requiere otra base aprobada.');return v;
}
export function monthlyDayCapture(raw,employees,period,scope,program){
 const v=monthlyDayPlain(raw),s=monthlyDayScope(scope),p=program,policy=monthlyDayPolicy(p.definition.monthlyDaysPolicy);
 require(p.definition.monthlyDaysVersion===MONTHLY_DAY_FACTS_VERSION&&Number.isInteger(p.revision)&&p.revision>0&&hash(p.version)&&uuid(p.proposalId)&&uuid(p.approvalId),'MONTHLY_DAY_PROGRAM_APPROVAL_REQUIRED','Se necesita la política dentro de un programa aprobado.');
 require(exact(v,['complete','version','monthlyDaysVersion','period','scope','programBasis','records','payloadSha256'])&&v.complete===true&&v.monthlyDaysVersion===MONTHLY_DAY_FACTS_VERSION&&v.period===period&&hash(v.version)&&hash(v.payloadSha256)&&salarySerialized(monthlyDayScope(v.scope))===salarySerialized(s),'MONTHLY_DAY_CAPTURE_INVALID','La captura no conserva su período y ámbito completos.');
 const b=v.programBasis;require(exact(b,['programVersion','revision','proposalId','approvalId','policy','policySha256'])&&b.programVersion===p.version&&b.revision===p.revision&&b.proposalId===p.proposalId&&b.approvalId===p.approvalId&&hash(b.policySha256)&&salarySerialized(monthlyDayPolicy(b.policy))===salarySerialized(policy),'MONTHLY_DAY_PROGRAM_CHANGED','La captura no corresponde a la política y aprobación originales del programa.');
 require(Array.isArray(employees)&&employees.length>0&&employees.length<=10000&&Array.isArray(v.records)&&v.records.length===employees.length,'MONTHLY_DAY_CAPTURE_INVALID','La captura debe conservar toda la selección sin recortes.');const selected=new Map(employees.map(e=>[e.contractId.toLowerCase(),e.identityToken])),seen=new Set();require(selected.size===employees.length,'MONTHLY_DAY_CAPTURE_INVALID','La selección contiene contratos repetidos.');
 for(const r of v.records){require(exact(r,['contractId','identityToken','fullPeriod','recognizedDays','baseDays','authority','source'])&&uuid(r.contractId)&&hash(r.identityToken)&&!seen.has(r.contractId.toLowerCase())&&selected.get(r.contractId.toLowerCase())===r.identityToken&&r.fullPeriod===true&&r.recognizedDays==='30'&&r.baseDays==='30'&&r.authority==='approved_program_full_month','MONTHLY_DAY_CAPTURE_INVALID','Cambió un registro o su autoridad de programa aprobado.');seen.add(r.contractId.toLowerCase());monthlyDaySource(r.source,{contractId:r.contractId,identityToken:r.identityToken,period,scope:s});}
 return v;
}
