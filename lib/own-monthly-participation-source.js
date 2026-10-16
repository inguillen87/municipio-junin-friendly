// Server preparation from one fixed authenticated SQL facade. No business write.
import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {ParticipationError,participationError} from './internal-own-period-participation.js';
import {salaryExact,salaryHash,salaryUuid,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {participationBootstrap,participationPeriod,participationDefinition} from '../assets/own-period-participation-model.js';
import {civilDay} from '../assets/employment-adoption-review-model.js';
import {MONTHLY_NATIVE_DATES_VERSION,MONTHLY_THIRTY_DAY_POLICY_VERSION,prepareMonthlyThirtyDayParticipation} from '../assets/own-monthly-thirty-day-preparation.js';

const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const NATIVE_MONTHLY_POLICY=freeze({id:'junin-monthly-confirmed-30.v1',version:'own-monthly-confirmed-cases.v1',baseUnits:'30',fullPeriod:'neutral_fraction',supportedCases:['full_month','october16_entry'],reference:'Confirmación municipal comunicada el 15/10/2026: mes completo de 30 días e ingreso el 16 de octubre:16/30.'});
export const NATIVE_MONTHLY_SOURCE_VERSION='own-monthly-participation-source.v1';
export const NATIVE_MONTHLY_PREPARATION_VERSION='own-monthly-native-preparation.v1';
const hash=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const fail=(code,status,message)=>{throw new ParticipationError('MONTHLY_'+code,status,message);};
const need=(v,code='CONTRACT_INVALID',status=503,message='No se verificaron las fechas y la consulta completa del legajo.')=>{if(!v)fail(code,status,message);};
// Never invoke a getter, coercion or serializer supplied by a caller.
function plain(v,depth=0,seen=new Set(),budget={n:0}){
 need(depth<=24&&++budget.n<=50000,'INPUT_INVALID',422,'La preparación supera su capacidad; no se recortó el contenido.');
 if(v===null||['string','boolean'].includes(typeof v))return v;
 if(typeof v==='number'){need(Number.isSafeInteger(v));return v;}
 need(v&&typeof v==='object'&&!seen.has(v));const array=Array.isArray(v),descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(v);
 need(Object.getPrototypeOf(v)===(array?Array.prototype:Object.prototype)&&keys.every(k=>typeof k==='string'&&Object.hasOwn(descriptors[k],'value')&&(array&&k==='length'||descriptors[k].enumerable)));
 if(array)need(v.length<=1000&&keys.length===v.length+1&&Array.from({length:v.length},(_,i)=>String(i)).every(k=>Object.hasOwn(descriptors,k)));
 seen.add(v);const result=array?Array.from({length:v.length},(_,i)=>plain(descriptors[String(i)].value,depth+1,seen,budget)):Object.fromEntries(keys.map(k=>[k,plain(descriptors[k].value,depth+1,seen,budget)]));seen.delete(v);return result;
}
const day=v=>typeof v==='string'&&v.length===10&&/^(19|20)[0-9]{2}-/.test(v)&&civilDay(v);
const stamp=v=>v===null||typeof v==='string'&&Number.isFinite(Date.parse(v));
export function nativeMonthlyPreparationInput(raw){
 const v=plain(raw);need(salaryExact(v,['contractId','period','policyId','asOfDate','documentReference','reason']),'INPUT_INVALID',422,'Elegí legajo, período, política, fecha, constancia y fundamento.');
 need(salaryUuid(v.contractId)&&v.contractId.length===36&&typeof v.period==='string'&&v.period.length===7&&participationPeriod(v.period)&&v.policyId===NATIVE_MONTHLY_POLICY.id,'INPUT_INVALID',422,'Elegí explícitamente la política de base 30 y un legajo y período válidos.');
 participationDefinition({recognizedUnits:'0',baseUnits:'30',asOfDate:v.asOfDate,documentReference:v.documentReference},v.period);
 need(typeof v.reason==='string'&&v.reason===v.reason.trim()&&v.reason===v.reason.normalize('NFC')&&v.reason.length>=10&&v.reason.length<=1000&&!/[<>\u0000-\u001f\u007f]/.test(v.reason),'INPUT_INVALID',422,'Informá el fundamento completo de esta preparación.');return v;
}
export function nativeMonthlySource(raw,{contractId,period,tenantId,membershipId}={}){
 const s=plain(raw);need(salaryExact(s,['version','scope','bootstrap','lifecycle','sha256'])&&s.version===NATIVE_MONTHLY_SOURCE_VERSION&&salaryHash(s.sha256)&&s.sha256.length===64);
 const{sha256,...payload}=s;need(hash(payload)===sha256);need(salaryExact(s.scope,['tenantId','sourceBindingId','membershipId','companyId'])&&[s.scope.tenantId,s.scope.sourceBindingId,s.scope.membershipId].every(v=>salaryUuid(v)&&v.length===36)&&typeof s.scope.companyId==='string'&&/^[1-9][0-9]*$/.test(s.scope.companyId));
 const b=participationBootstrap(s.bootstrap);need(b.contractId===contractId&&b.period===period&&s.scope.tenantId===tenantId&&s.scope.membershipId===membershipId);
 need(b.permissions.canPropose,'FORBIDDEN',403,'Tu cuenta no permite preparar participación.');
 const l=s.lifecycle,adopted=Object.hasOwn(l??{},'datesVerified');need(salaryExact(l,['version','revision','appliedAt','intervals','today','status',...(adopted?['datesVerified']:[])])&&salaryHash(l.version)&&l.version.length===64&&Number.isInteger(l.revision)&&l.revision>=0&&l.revision<=100&&(l.revision===0?l.appliedAt===null:l.appliedAt!==null&&stamp(l.appliedAt))&&day(l.today)&&['active','inactive','pending_start','unknown','state_error'].includes(l.status));
 need(!['unknown','state_error'].includes(l.status),'DATES_REQUIRED',422,'El estado del legajo requiere verificar sus fechas; no se supone cobertura del período.');
 need(!adopted||l.datesVerified===true,'DATES_REQUIRED',422,'El legajo no tiene fechas laborales verificadas; no se supone cero ni mes completo.');
 need(Array.isArray(l.intervals)&&l.intervals.length>=1&&l.intervals.length<=51,'DATES_REQUIRED',422,'No se verificaron todos los intervalos laborales.');let previous=null;
 for(const [i,r]of l.intervals.entries()){need(salaryExact(r,['startDate','endDate'])&&day(r.startDate)&&(r.endDate===null||day(r.endDate)&&r.endDate>=r.startDate)&&(!i||previous!==null&&r.startDate>previous),'DATES_REQUIRED',422,'Las fechas laborales están incompletas, superpuestas o fuera del alcance admitido.');previous=r.endDate;}
 return freeze(s);
}
export async function prepareNativeMonthlySource(raw,input,scope){
 const v=nativeMonthlyPreparationInput(input),s=nativeMonthlySource(raw,{...scope,contractId:v.contractId,period:v.period}),b=s.bootstrap;
 const first=v.period+'-01',last=new Date(Date.UTC(Number(v.period.slice(0,4)),Number(v.period.slice(5)),0)).toISOString().slice(0,10);
 const intersections=s.lifecycle.intervals.filter(r=>r.startDate<=last&&(r.endDate===null||r.endDate>=first));
 need(intersections.length===1,'CASE_UNCONFIRMED',422,'Esta preparación admite una sola franja en el período. Conservá los intervalos y prepará una declaración documentada sin inferir días.');
 const r=intersections[0],full=r.startDate<=first&&(r.endDate===null||r.endDate>=last);need(full===b.source.fullPeriod,'SOURCE_CHANGED',409,'Cambió la cobertura del período. Volvé a consultar las fechas.');
 const example=v.period.endsWith('-10')&&r.startDate===v.period+'-16'&&(r.endDate===null||r.endDate>=last);
 need(full||example,'CASE_UNCONFIRMED',422,'La confirmación disponible cubre mes completo y alta el 16 de octubre. Otras altas, bajas o febrero parcial requieren su declaración documentada.');
 const policy={version:MONTHLY_THIRTY_DAY_POLICY_VERSION,baseUnits:'30',fullPeriod:'neutral_fraction',partialMethod:'inclusive_calendar_intersection',startBoundary:'inclusive',endBoundary:'inclusive',effectiveFrom:v.period,effectiveUntil:v.period,reference:NATIVE_MONTHLY_POLICY.reference};
 const preparation=await prepareMonthlyThirtyDayParticipation({bootstrap:b,nativeDates:{version:MONTHLY_NATIVE_DATES_VERSION,contractId:b.contractId,identityToken:b.source.subject.identityToken,sourceVersion:b.source.version,startDate:r.startDate,endDate:r.endDate},policy,asOfDate:v.asOfDate,documentReference:v.documentReference,reason:v.reason});
 const result={version:NATIVE_MONTHLY_PREPARATION_VERSION,status:'reviewable_draft',sourceVerification:'server_lifecycle_snapshot',durableEvidence:false,approved:false,executable:false,payrollCalculated:false,payrollPosted:false,policy:NATIVE_MONTHLY_POLICY,policySha256:hash(NATIVE_MONTHLY_POLICY),confirmedCase:full?'full_month':'october16_entry',source:s,preparation,command:preparation.command};
 return freeze({...result,sha256:hash(result)});
}
export async function prepareNativeMonthlyParticipation(sql,principal,session,input){
 try{const v=nativeMonthlyPreparationInput(input),ctx=employeeContext(principal,session),rows=await sql.query('SELECT public.own_monthly_participation_source_v1($1::jsonb,$2::uuid,$3::text) AS result',[JSON.stringify(ctx),v.contractId,v.period]),records=Array.isArray(rows)?rows:rows?.rows;need(Array.isArray(records)&&records.length===1&&salaryExact(records[0],['result']));return await prepareNativeMonthlySource(records[0].result,v,{tenantId:ctx.tenantId,membershipId:ctx.membershipId});}
 catch(e){if(e instanceof ParticipationError)throw e;throw participationError(e);}
}
