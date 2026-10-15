// Pure draft preparation. No source read, authority, approval or payroll write.
import {civilDay} from './employment-adoption-review-model.js';
import {participationBootstrap,participationHash,participationPeriod,prepareParticipation} from './own-period-participation-model.js';

export const MONTHLY_THIRTY_DAY_POLICY_VERSION='own-monthly-thirty-day-policy.v1';
export const MONTHLY_NATIVE_DATES_VERSION='own-monthly-native-dates.v1';
export const MONTHLY_THIRTY_DAY_PREPARATION_VERSION='own-monthly-thirty-day-preparation.v1';
export class MonthlyThirtyDayPreparationError extends Error {
 constructor(code){super(code);this.name='MonthlyThirtyDayPreparationError';this.code=code;}
}
const need=(ok,code='MONTHLY_30_INPUT_INVALID')=>{if(!ok)throw new MonthlyThirtyDayPreparationError(code);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const period=v=>typeof v==='string'&&v.length===7&&participationPeriod(v);
const day=v=>typeof v==='string'&&v.length===10&&/^(19|20)[0-9]{2}-/.test(v)&&civilDay(v);
const hash=v=>typeof v==='string'&&v.length===64&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&v.length===36&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const reference=v=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=3&&v.length<=180&&!/[<>\u0000-\u001f\u007f]/.test(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
// Reject supplied getters/prototypes before reading any value or invoking JSON.
function inert(v,depth=0,ancestors=new Set(),budget={nodes:0}){
 need(depth<=24&&++budget.nodes<=30000,'MONTHLY_30_INPUT_LIMIT');
 if(v===null||['string','boolean'].includes(typeof v))return v;
 if(typeof v==='number'){need(Number.isSafeInteger(v));return v;}
 need(v&&typeof v==='object'&&!ancestors.has(v));
 const array=Array.isArray(v);need(!array||v.length<=500,'MONTHLY_30_INPUT_LIMIT');
 const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(v);
 need(Object.getPrototypeOf(v)===(array?Array.prototype:Object.prototype));
 need(keys.every(k=>typeof k==='string'&&Object.hasOwn(descriptors[k],'value')&&(array&&k==='length'||descriptors[k].enumerable)));
 if(array)need(keys.length===v.length+1&&Array.from({length:v.length},(_,i)=>String(i)).every(k=>Object.hasOwn(descriptors,k)));
 ancestors.add(v);
 const result=array?Array.from({length:v.length},(_,i)=>inert(descriptors[String(i)].value,depth+1,ancestors,budget)):Object.fromEntries(keys.map(k=>[k,inert(descriptors[k].value,depth+1,ancestors,budget)]));
 ancestors.delete(v);return result;
}
function policyInput(v){
 need(exact(v,['version','baseUnits','fullPeriod','partialMethod','startBoundary','endBoundary','effectiveFrom','effectiveUntil','reference']),'MONTHLY_30_POLICY_REQUIRED');
 need(v.version===MONTHLY_THIRTY_DAY_POLICY_VERSION&&v.baseUnits==='30'&&v.fullPeriod==='neutral_fraction'
  &&v.partialMethod==='inclusive_calendar_intersection'&&v.startBoundary==='inclusive'&&v.endBoundary==='inclusive'
  &&period(v.effectiveFrom)&&(v.effectiveUntil===null||period(v.effectiveUntil)&&v.effectiveUntil>=v.effectiveFrom)&&reference(v.reference),'MONTHLY_30_POLICY_INVALID');
 return v;
}
export function monthlyThirtyDayPolicy(input){return freeze(policyInput(inert(input)));}

/** The caller must choose this policy explicitly. The full-month base30 and
 * October16 example have municipal feedback; this general partial-calendar
 * convention remains a candidate, especially for exits and partial February.
 * sourceVersion is the existing157 pin, not a certification of caller dates. */
export async function prepareMonthlyThirtyDayParticipation(input){
 const v=inert(input);
 need(exact(v,['bootstrap','nativeDates','policy','asOfDate','documentReference','reason']));
 const b=participationBootstrap(v.bootstrap),policy=policyInput(v.policy),d=v.nativeDates;
 need(uuid(b.contractId)&&[b.scopeVersion,b.configuration.version,b.source.version,b.source.subject.identityToken].every(hash),'MONTHLY_30_SOURCE_CHANGED');
 need(period(b.period)&&b.period>=policy.effectiveFrom&&(policy.effectiveUntil===null||b.period<=policy.effectiveUntil),'MONTHLY_30_POLICY_OUT_OF_PERIOD');
 need(exact(d,['version','contractId','identityToken','sourceVersion','startDate','endDate'])&&d.version===MONTHLY_NATIVE_DATES_VERSION,'MONTHLY_30_NATIVE_DATES_REQUIRED');
 need(d.contractId===b.contractId&&d.contractId===b.source.subject.contractId&&d.identityToken===b.source.subject.identityToken&&d.sourceVersion===b.source.version,'MONTHLY_30_SOURCE_CHANGED');
 need(day(d.startDate)&&(d.endDate===null||day(d.endDate)&&d.endDate>=d.startDate),'MONTHLY_30_NATIVE_DATES_INVALID');
 const monthStart=b.period+'-01',year=Number(b.period.slice(0,4)),month=Number(b.period.slice(5));
 const monthEnd=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
 const fullPeriod=d.startDate<=monthStart&&(d.endDate===null||d.endDate>=monthEnd);
 need(fullPeriod===b.source.fullPeriod,'MONTHLY_30_RANGE_CHANGED');
 const from=d.startDate>monthStart?d.startDate:monthStart,until=d.endDate!==null&&d.endDate<monthEnd?d.endDate:monthEnd;
 const calendarDays=from>until?0:(Date.parse(until+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000+1;
 need(Number.isSafeInteger(calendarDays)&&calendarDays>=0&&calendarDays<=31,'MONTHLY_30_NATIVE_DATES_INVALID');
 const recognizedUnits=fullPeriod?'30':String(calendarDays);
 // No coefficient decimal, money precision or rounding stage is introduced.
 const definition={recognizedUnits,baseUnits:'30',asOfDate:v.asOfDate,documentReference:v.documentReference};
 const command=prepareParticipation(b,definition,v.reason);
 const result={version:MONTHLY_THIRTY_DAY_PREPARATION_VERSION,status:'proposal_draft',approved:false,executable:false,payrollCalculated:false,payrollPosted:false,
  policyStatus:'explicit_candidate_not_municipally_homologated',sourceVerification:'typed_caller_dates_not_server_certification',
  policy,pins:{contractId:b.contractId,identityToken:d.identityToken,scopeVersion:b.scopeVersion,baseVersion:b.configuration.version,sourceVersion:b.source.version,period:b.period},
  nativeDates:d,computation:{monthStart,monthEnd,coveredFrom:calendarDays?from:null,coveredUntil:calendarDays?until:null,calendarDays:String(calendarDays),fullPeriod,
   recognizedUnits,baseUnits:'30',effectiveFraction:{numerator:fullPeriod?'1':recognizedUnits,denominator:fullPeriod?'1':'30'}},
  command,policySha256:await participationHash(policy),nativeDatesSha256:await participationHash(d)};
 result.preparationSha256=await participationHash(result);return freeze(result);
}
