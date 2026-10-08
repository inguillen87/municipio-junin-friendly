// Contrato cerrado de evidencia agregada. No genera SQL ni modifica registros municipales.
import {createHash} from 'node:crypto';
import {stableJson} from './canonical-import.mjs';
import {municipalContinuityProfile} from './grh-municipal-continuity-schema.mjs';
export const NATIVE_CONTINUITY_TABLES=Object.freeze([
 'action_case','action_case_event','employee_family_member','employee_family_member_event',
 'native_employee_registration','native_employment_catalog_proposal','native_employment_catalog_review',
 'payroll_auxiliary_release','payroll_fixed_assignment','payroll_fixed_change','payroll_fixed_event',
 'payroll_fixed_novelty','payroll_fixed_novelty_event','payroll_monthly_close_event','payroll_monthly_close_run',
 'payroll_novelty_batch','payroll_novelty_event','payroll_novelty_issue','payroll_novelty_row',
 'payroll_parameter_event','payroll_parameter_proposal','payroll_reprocessing_case','payroll_reprocessing_event',
 'school_certificate','school_certificate_event','school_certificate_record','school_certificate_record_event'
]);
export const nativeContinuityHash=value=>createHash('sha256').update(stableJson(value)).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const planKeys='links|planSha256|roots|tables|version';
export function summarizeNativeContinuity(plan){
 const municipal=plan?.version==='grh-native-continuity-plan.v2';
 const requiredKeys=municipal?'excludedScopeTables|links|planSha256|profileId|roots|tables|version':planKeys;
 if(!plan||Object.keys(plan).sort().join('|')!==requiredKeys||(!municipal&&plan.version!=='grh-native-continuity-plan.v1')||!sha(plan.planSha256))fail('NATIVE_CONTINUITY_PLAN_INVALID');
 let profile;if(municipal){try{profile=municipalContinuityProfile(plan.profileId);}catch{fail('NATIVE_CONTINUITY_PLAN_INVALID');}
  if(stableJson(plan.excludedScopeTables)!==stableJson(profile.exclusions))fail('NATIVE_CONTINUITY_PLAN_INVALID');}
 const {planSha256,...content}=plan;if(nativeContinuityHash(content)!==planSha256)fail('NATIVE_CONTINUITY_PLAN_CHANGED');
 if(!Array.isArray(plan.roots)||!Array.isArray(plan.tables)||!Array.isArray(plan.links))fail('NATIVE_CONTINUITY_PLAN_INVALID');
 const actual=plan.tables.map(t=>t.name);if(new Set(actual).size!==actual.length)fail('NATIVE_CONTINUITY_PLAN_INVALID');
 const expected=municipal?profile.tables:NATIVE_CONTINUITY_TABLES;
 const unreviewedTables=actual.filter(n=>!expected.includes(n));
 const missingTables=expected.filter(n=>!actual.includes(n));
 const rootSet=new Set(plan.roots),actualSet=new Set(actual);
 const nativeLinks=plan.links.filter(f=>actualSet.has(f.parent));
 const domains=plan.tables.map(t=>({table:t.name,root:rootSet.has(t.name),
  scope:t.binding?'tenant_and_declared_binding':municipal?'declared_parent_scope':'tenant_and_parent_batch',bindingColumn:t.binding,
  nativeParents:[...new Set(nativeLinks.filter(f=>f.child===t.name).map(f=>f.parent))].sort(),
  declaredForeignKeys:plan.links.filter(f=>f.child===t.name).length}));
 const report={version:municipal?'grh-native-dependency-coverage.v2':'grh-native-dependency-coverage.v1',planSha256,
  ...(municipal?{profileId:plan.profileId,excludedScopeTables:[...plan.excludedScopeTables]}:{}),
  rootTables:plan.roots.length,dependentTables:actual.length-plan.roots.length,totalTables:actual.length,
  internalForeignKeys:nativeLinks.length,contractForeignKeys:plan.links.filter(f=>f.parent==='employment_contract').length,
  personForeignKeys:plan.links.filter(f=>f.parent==='person_identity').length,
  compositeForeignKeys:nativeLinks.filter(f=>f.child_columns.length>1).length,
  selfReferences:nativeLinks.filter(f=>f.child===f.parent).length,
  directScopeTables:domains.filter(d=>d.bindingColumn!==null).length,
  inheritedScopeTables:domains.filter(d=>d.bindingColumn===null).length,
  coverageComplete:unreviewedTables.length===0&&missingTables.length===0,unreviewedTables,missingTables,domains,
  scope:'declared_relational_catalog_only',businessRowsReviewed:false,attachmentBytesVerified:false,
  nativeConflictsResolved:false,sourcePromotionAuthorized:false,operationalSourceChanged:false};
 if(![report.rootTables,report.dependentTables,report.totalTables].every(integer))fail('NATIVE_CONTINUITY_PLAN_INVALID');
 return Object.freeze({...report,reportSha256:nativeContinuityHash(report)});
}
