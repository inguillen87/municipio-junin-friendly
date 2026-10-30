// Purpose-limited projection for the CURRENT municipal preparer, not a receipt
// or access to another creator's full capture. Hashes verify DTO consistency;
// authoritative custody, complete census and current rights remain server duties.
import {salaryExact,salaryHash,salaryUuid,salarySerialized} from './native-salary-catalog-model.js';
import {OWN_RUN_TYPES} from './own-payroll-run-workspace-model.js';
import {ownPayrollEmployeeNumber} from './own-payroll-engine.js';
import {ownRunDate} from './own-payroll-run-date.js';
import {OWN_RUN_FULL_MAX_BYTES} from './own-payroll-response.js';

export const OWN_ANNUL_PREPARATION_VERSION='own-annul-preparation.v1';
export const OWN_ANNUL_PREPARATION_CUSTODY='tenant_binding_projected_preparation.v1';
const verified=new WeakMap();
const fail=(code='CONTRACT_INVALID')=>{throw Object.assign(Error('No se verificó la entrega completa para preparar otro cálculo. Actualizá la referencia desde tu sesión municipal.'),{code:'OWN_ANNUL_PREPARATION_'+code});};
const need=(condition,code)=>{if(!condition)fail(code);};
const exact=(value,keys)=>need(salaryExact(value,keys)&&Reflect.ownKeys(value).length===keys.length);
const dense=value=>Array.isArray(value)&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.hasOwn(value,i)).every(Boolean);
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const ordered=values=>same(values,[...new Set(values)].sort());
const positive=value=>Number.isSafeInteger(value)&&value>0;
const code=value=>typeof value==='string'&&/^[0-9]{1,9}$/.test(value);
const period=value=>typeof value==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
const date=value=>value===null||ownRunDate(value);
const instant=value=>typeof value==='string'&&value.length<=40&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(value))))].map(value=>value.toString(16).padStart(2,'0')).join('');
const groupKey=value=>value===null?'':value;
function groupsFor(affected){
 const counts=new Map();for(const row of affected)counts.set(row.liquidationDate,(counts.get(row.liquidationDate)??0)+1);
 return[...counts].sort(([a],[b])=>groupKey(a)<groupKey(b)?-1:groupKey(a)>groupKey(b)?1:0).map(([liquidationDate,count])=>({liquidationDate,count}));
}

export function ownAnnulPreparationDto(value){
 exact(value,['version','custodyPolicy','scopeVersion','source','period','liquidationType','populationDomain','runs','affected','confirmedAffectedContractIds','dateGroups','sourceStateSha256','complete','preparationSha256']);
 need(value.version===OWN_ANNUL_PREPARATION_VERSION&&value.custodyPolicy===OWN_ANNUL_PREPARATION_CUSTODY&&salaryHash(value.scopeVersion)&&period(value.period)&&Object.hasOwn(OWN_RUN_TYPES,value.liquidationType)&&value.populationDomain==='native_registered'&&salaryHash(value.sourceStateSha256)&&salaryHash(value.preparationSha256)&&value.complete===true);
 exact(value.source,['id','receiptVersion','bodySha256','receiptSha256','recordedAt']);
 need(salaryUuid(value.source.id)&&['own-annul-receipt.v1','own-annul-receipt.v2'].includes(value.source.receiptVersion)&&salaryHash(value.source.bodySha256)&&salaryHash(value.source.receiptSha256)&&instant(value.source.recordedAt));
 need(dense(value.runs)&&value.runs.length>0&&value.runs.length<=1000&&dense(value.affected)&&value.affected.length>0&&value.affected.length<=10000);
 const runs=new Map();
 for(const row of value.runs){
  exact(row,['id','creatorScopeVersion','stateVersion','bodySha256','payloadSha256','algorithmSha256','inputSha256','resultSha256','liquidationDate','employeeCount','conceptRowCount']);
  need(salaryUuid(row.id)&&!runs.has(row.id)&&[row.creatorScopeVersion,row.stateVersion,row.bodySha256,row.payloadSha256,row.algorithmSha256,row.inputSha256,row.resultSha256].every(salaryHash)&&date(row.liquidationDate)&&positive(row.employeeCount)&&row.employeeCount<=10000&&positive(row.conceptRowCount));
  // creatorScopeVersion is provenance. It may differ across runs and from the
  // current scopeVersion; it never lends the creator's authority to this reader.
  runs.set(row.id,row);
 }
 need(ordered(value.runs.map(row=>row.id)));
 const ids=new Set(),used=new Map();
 for(const row of value.affected){
  exact(row,['runId','resultSha256','contractId','employeeNumber','agreementCode','departmentCode','liquidationDate','state','version','liquidationVersion']);
  const run=runs.get(row.runId);
  need(run&&salaryUuid(row.contractId)&&!ids.has(row.contractId)&&salaryHash(row.resultSha256)&&row.resultSha256===run.resultSha256&&ownPayrollEmployeeNumber(row.employeeNumber)&&code(row.agreementCode)&&code(row.departmentCode)&&date(row.liquidationDate)&&row.liquidationDate===run.liquidationDate&&row.state==='annulled'&&positive(row.version)&&positive(row.liquidationVersion),'AFFECTED_CHANGED');
  ids.add(row.contractId);used.set(row.runId,(used.get(row.runId)??0)+1);
 }
 need(ordered(value.affected.map(row=>row.contractId))&&used.size===runs.size&&[...used].every(([id,count])=>count<=runs.get(id).employeeCount),'INCOMPLETE');
 need(dense(value.confirmedAffectedContractIds)&&value.confirmedAffectedContractIds.length<=value.affected.length&&value.confirmedAffectedContractIds.every(id=>salaryUuid(id)&&ids.has(id))&&ordered(value.confirmedAffectedContractIds));
 need(value.confirmedAffectedContractIds.length===0,'CONFIRMED_AGAIN');
 need(dense(value.dateGroups)&&value.dateGroups.length>0&&value.dateGroups.length<=value.runs.length);
 for(const group of value.dateGroups){exact(group,['liquidationDate','count']);need(date(group.liquidationDate)&&positive(group.count));}
 need(same(value.dateGroups,groupsFor(value.affected)),'DATE_GROUPS_CHANGED');
 // The API still enforces its negotiated4/32MiB profile. This is the absolute
 // full-response ceiling, never permission to expand a normal response budget.
 need(new TextEncoder().encode(JSON.stringify({ok:true,data:value})).length<=OWN_RUN_FULL_MAX_BYTES,'LIMIT');
 return value;
}

export async function verifiedOwnAnnulPreparation(value,expected){
 exact(expected,['scopeVersion','sourceId']);need(salaryHash(expected.scopeVersion)&&salaryUuid(expected.sourceId));
 const identity=freeze({...expected});
 // Clone and freeze before the digest await so a caller cannot swap the last
 // employee or date while verification is pending. Do not freeze caller input.
 const copy=freeze(structuredClone(value));ownAnnulPreparationDto(copy);
 need(copy.scopeVersion===identity.scopeVersion&&copy.source.id===identity.sourceId,'SCOPE_CHANGED');
 const {preparationSha256,...content}=copy;
 need(await digest(content)===preparationSha256,'CONTENT_CHANGED');
 verified.set(copy,identity);return copy;
}
function requireVerified(value){need(verified.has(value),'VERIFICATION_REQUIRED');return value;}
export function ownAnnulPreparationDates(value){return requireVerified(value).dateGroups;}
export function assertSameOwnAnnulPreparation(before,after){
 requireVerified(before);requireVerified(after);
 need(same(verified.get(before),verified.get(after))&&same(before,after),'CHANGED');return after;
}
export function ownAnnulPreparationForDate(value,liquidationDate){
 requireVerified(value);need(date(liquidationDate)&&value.dateGroups.some(group=>group.liquidationDate===liquidationDate),'DATE_REQUIRED');
 const affected=value.affected.filter(row=>row.liquidationDate===liquidationDate);
 // Local form context only: sourceReference is NOT an ignored extra field in
 // own-payroll-run-command.v2. A later voluntary calculation has its own command.
 return freeze({period:value.period,liquidationType:value.liquidationType,populationDomain:value.populationDomain,scopeVersion:value.scopeVersion,liquidationDate,selection:{kind:'contracts',values:affected.map(row=>row.contractId)},affected:structuredClone(affected),sourceReference:{...value.source,sourceStateSha256:value.sourceStateSha256,preparationSha256:value.preparationSha256},reviewConfirmed:false});
}
