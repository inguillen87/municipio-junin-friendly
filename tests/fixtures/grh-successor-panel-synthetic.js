// Synthetic aggregate reports only: no municipal names, IDs, payroll amounts or credentials.
import {SUCCESSOR_REQUIRED} from '../../assets/grh-successor-review-model.js';
import {CURATED_REVIEW_DOMAINS} from '../../assets/grh-curated-review-model.js';
const digest=character=>character.repeat(64);
const source=(day,d,m)=>({profileId:'grh-junin-2026-09-'+day,sourceSha256:digest(d),sourceCutoff:'2026-09-'+day+'T15:16:58',manifestSha256:digest(m)});
const entity=(before,after,added,removed,changed,unchanged,fields={},evidence=0)=>({before,after,added,removed,changed,unchanged,rawEvidenceChanged:changed+evidence,evidenceOnlyChanges:evidence,changedFields:fields,baselineProjectionSha256:digest('a'),candidateProjectionSha256:digest(added+removed+changed?'b':'a')});
const current=(type,state='open')=>({companyCode:'101',payrollDate:'2026-09-30',period:2026,month:9,payrollType:type,closureStatus:state});
export function successorFixture(){return{
 version:'grh-successor-comparison.v1',generatedAt:'2026-09-24T02:00:00.000Z',baseline:source('10','1','2'),candidate:source('22','3','4'),
 entities:{payrollRuns:entity(3,4,1,0,1,2,{closure_status:1,source_closed_flag:1}),
  payrollSnapshot:{...entity(3,4,1,0,0,3,{},3),contracts:{before:3,after:3,beforeWithMultipleAssignments:0,afterWithMultipleAssignments:1}},
  movements:entity(12,13,2,1,1,10,{quantity:1}),payrollMonthly:entity(10,11,1,0,2,8,{net:2,net_payable:2}),
  employmentReconciliation:entity(3,3,0,0,1,2,{administrative_active:1},2)},
 runEvidence:{baseline:{currentRuns:[current('M'),current('O'),current('V')],latestClosedByType:{M:'2026-08-31',O:'2026-08-31',V:'2026-08-31'}},candidate:{currentRuns:[current('M'),current('O'),current('P'),current('V','closed')],latestClosedByType:{M:'2026-08-31',O:'2026-08-31',V:'2026-09-30'}}},
 comparisonComplete:true,scope:{databaseQueries:0,databaseWrites:0,sourcePromoted:false,containsPersonalRecords:false,containsSalaryAmounts:false,nativeOperationsCompared:false,curatedEntitiesCompared:false,arithmeticCertification:false},
 publication:{ready:false,legacyImporterCompatible:false,required:[...SUCCESSOR_REQUIRED]},methodology:{snapshotIdentity:'company/employee/payrollDate/period/month/payrollType',sourceIdRotationIsNotDismissal:true,monetaryComparison:'exact normalized decimal fields; null is distinct from zero',rawEvidenceHashesCompared:true,noMixedMonthClosureInference:true}
};}
export function curatedFixture(){return{version:'grh-curated-successor-comparison.v1',generatedAt:'2026-09-24T02:00:00.000Z',baseline:source('10','1','5'),candidate:source('22','3','6'),
 artifacts:Object.fromEntries(CURATED_REVIEW_DOMAINS.map(name=>[name,{before:1,after:1,added:0,removed:0,changed:0,unchanged:1,changedFields:{},baselineProjectionSha256:digest('a'),candidateProjectionSha256:digest('a'),baselineBytes:100,candidateBytes:100}])),
 comparisonComplete:true,scope:{databaseQueries:0,databaseWrites:0,sourcePromoted:false,containsPersonalRecords:false,containsSalaryAmounts:false,nativeOperationsCompared:false,canonicalCompared:false}
};}
export function coordinatedFixture(){return{version:'grh-coordinated-successor-review.v1',generatedAt:'2026-09-24T02:00:00.000Z',coreReportSha256:digest('f'),core:successorFixture(),curated:curatedFixture(),
 scope:{databaseQueries:0,databaseWrites:0,sourcePromoted:false,nativeOperationsCompared:false,canonicalCompared:false,coreArtifactsReread:false,curatedArtifactsRead:true,containsPersonalRecords:false,containsSalaryAmounts:false}};}
