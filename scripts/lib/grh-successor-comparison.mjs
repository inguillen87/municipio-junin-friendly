// Source comparison only. No database, mutation, payroll arithmetic or publication authority.
import {createHash} from 'node:crypto';
import {projectGrhVersionRecord,GRH_VERSION_ENTITIES} from './grh-core-source-version.mjs';
import {stableJson} from './canonical-import.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const limits=Object.freeze({payrollRuns:10000,payrollSnapshot:20000,movements:1000000,payrollMonthly:500000,employmentReconciliation:20000});
export function successorRecord(entity,row){
 if(!GRH_VERSION_ENTITIES.includes(entity))fail('GRH_SUCCESSOR_ENTITY_INVALID');
 const projection=projectGrhVersionRecord(entity,row);
 // The dump regenerates histolegajo.ID. Its ID is evidence, not a dismissal or new hire.
 // Each company/employee/date/year/month/type assignment remains a distinct record.
 const key=entity==='payrollSnapshot'?{
  companyCode:projection.company_source_id,employeeNumber:projection.employee_number,
  payrollDate:projection.snapshot_date,period:projection.source_period,month:projection.source_month,payrollType:projection.payroll_type
 }:row.sourceKey;
 if(!key||Object.getPrototypeOf(key)!==Object.prototype)fail('GRH_SUCCESSOR_KEY_INVALID');
 return{key:hash(stableJson(key)),projection,projectionHash:hash(stableJson(projection)),rawHash:hash(stableJson(row))};
}
function fingerprint(rows){const digest=createHash('sha256');for(const [key,value]of [...rows].sort(([a],[b])=>a.localeCompare(b)))digest.update(key+':'+value.projectionHash+'\n');return digest.digest('hex');}
export async function compareGrhSuccessorEntity(entity,beforeRows,afterRows){
 if(!Object.hasOwn(limits,entity))fail('GRH_SUCCESSOR_ENTITY_INVALID');
 const before=new Map(),after=new Map(),fields={};let added=0,changed=0,unchanged=0,rawEvidenceChanged=0,evidenceOnlyChanges=0;
 const beforeContracts=new Map(),afterContracts=new Map();
 const track=(map,row)=>{if(entity==='payrollSnapshot'){const key=stableJson([row.projection.company_source_id,row.projection.employee_number]);map.set(key,(map.get(key)??0)+1);}};
 for await(const row of beforeRows){const item=successorRecord(entity,row);if(before.has(item.key))fail('GRH_SUCCESSOR_DUPLICATE_BASELINE_ASSIGNMENT');before.set(item.key,item);track(beforeContracts,item);if(before.size>limits[entity])fail('GRH_SUCCESSOR_RECORD_LIMIT');}
 for await(const row of afterRows){
  const item=successorRecord(entity,row);if(after.has(item.key))fail('GRH_SUCCESSOR_DUPLICATE_CANDIDATE_ASSIGNMENT');
  after.set(item.key,{projectionHash:item.projectionHash});track(afterContracts,item);if(after.size>limits[entity])fail('GRH_SUCCESSOR_RECORD_LIMIT');
  const prior=before.get(item.key);if(!prior){added++;continue;}
  if(prior.rawHash!==item.rawHash)rawEvidenceChanged++;
  if(prior.projectionHash===item.projectionHash){unchanged++;if(prior.rawHash!==item.rawHash)evidenceOnlyChanges++;continue;}
  changed++;
  for(const name of new Set([...Object.keys(prior.projection),...Object.keys(item.projection)])){
   if(stableJson(prior.projection[name])!==stableJson(item.projection[name]))fields[name]=(fields[name]??0)+1;
  }
 }
 const removed=before.size-(after.size-added);
 const summary={before:before.size,after:after.size,added,removed,changed,unchanged,rawEvidenceChanged,evidenceOnlyChanges,
  changedFields:Object.fromEntries(Object.entries(fields).sort(([a],[b])=>a.localeCompare(b))),
  baselineProjectionSha256:fingerprint(before),candidateProjectionSha256:fingerprint(after)};
 if(entity==='payrollSnapshot')summary.contracts={before:beforeContracts.size,after:afterContracts.size,
  beforeWithMultipleAssignments:[...beforeContracts.values()].filter(n=>n>1).length,
  afterWithMultipleAssignments:[...afterContracts.values()].filter(n=>n>1).length};
 return summary;
}
