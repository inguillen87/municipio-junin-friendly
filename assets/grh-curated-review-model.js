import {exactReviewKeys,reviewHash,reviewCount,successorSource,reviewGeneratedAt,rejectSuccessorReview,successorReviewData,SUCCESSOR_REVIEW_VERSION} from './grh-successor-review-model.js';
export const CURATED_REVIEW_VERSION='grh-curated-successor-comparison.v1';
export const COORDINATED_REVIEW_VERSION='grh-coordinated-successor-review.v1';
export const CURATED_REVIEW_SCHEMA=Object.freeze({
 employees:['curated-employees.json','Legajos','address employment externalId identity personId relatedRecordCounts sourceKey unionMemberships'],
 absences:['curated-absences.json','Ausencias','absenceDate days employeeExternalId period presentationDate quantity reason reasonCode registeredDate sourceFields sourceKey untilDate'],
 leaves:['curated-leaves.json','Licencias','days employeeExternalId endDate observations sourceFields sourceKey startDate typeCode'],
 familyMembers:['curated-family-members.json','Familiares','birthDate courseCode cuil deductionPercentage documentNumber documentTypeCode employeeExternalId employeeSourceKey endDate fullName incapacityCode observations relationship relationshipId schoolingCode sexCode sourceFields sourceKey sourceProvenance'],
 sectors:['curated-sectors.json','Sectores','abbreviation budgetActivityId contracted name sourceKey'],
 categories:['curated-categories.json','Categorías','abbreviation additionalAmount baseSalary companyCode guaranteeAmount initial maximum name positionCount scaleCode sourceKey'],
 unions:['curated-unions.json','Gremios','name sourceFields sourceKey'],
 unionMemberships:['curated-union-memberships.json','Afiliaciones gremiales','employeeExternalId endDate sourceFields sourceKey unionName workplace'],
 agreements:['curated-agreements.json','Convenios','name sourceFields sourceKey'],
 absenceReasons:['curated-absence-reasons.json','Motivos de ausencia','abbreviation affectsAttendanceBonus annualLimit appliesToSex calculationMethod calendarDays generatesDiscountedDays isLeave leaveType monthlyLimit name sourceKey typeCode'],
 familyRelationships:['curated-family-relationships.json','Vínculos familiares','code inverseCode name sourceKey'],
 jobRoles:['curated-job-roles.json','Cargos','companyCode mission name parentId reportsTo sourceKey'],
 organizations:['curated-organizations.json','Organizaciones','abbreviation activeSourceValue code companyCode name parentId sourceKey'],
 exitReasons:['curated-exit-reasons.json','Motivos de baja','name sourceActiveValue sourceKey typeCode'],
 employmentStatuses:['curated-employment-statuses.json','Situaciones de revista','name sourceKey']
});
export const CURATED_REVIEW_DOMAINS=Object.freeze(Object.keys(CURATED_REVIEW_SCHEMA));
for(const value of Object.values(CURATED_REVIEW_SCHEMA))Object.freeze(value);
const COUNTS=['before','after','added','removed','changed','unchanged'];
const SCOPE=Object.freeze({databaseQueries:0,databaseWrites:0,sourcePromoted:false,containsPersonalRecords:false,containsSalaryAmounts:false,nativeOperationsCompared:false,canonicalCompared:false});
export function curatedReviewData(value){
 if(!exactReviewKeys(value,['version','generatedAt','baseline','candidate','artifacts','comparisonComplete','scope'])||value.version!==CURATED_REVIEW_VERSION
  ||value.comparisonComplete!==true||!exactReviewKeys(value.scope,Object.keys(SCOPE))||Object.entries(SCOPE).some(([k,v])=>value.scope[k]!==v)
  ||!exactReviewKeys(value.artifacts,CURATED_REVIEW_DOMAINS))rejectSuccessorReview();
 const baseline=successorSource(value.baseline),candidate=successorSource(value.candidate);reviewGeneratedAt(value.generatedAt);
 if(baseline.sourceSha256===candidate.sourceSha256||baseline.manifestSha256===candidate.manifestSha256||baseline.sourceCutoff>=candidate.sourceCutoff)rejectSuccessorReview();
 const artifacts=Object.freeze(Object.fromEntries(CURATED_REVIEW_DOMAINS.map(name=>{
  const row=value.artifacts[name];if(!exactReviewKeys(row,[...COUNTS,'changedFields','baselineProjectionSha256','candidateProjectionSha256','baselineBytes','candidateBytes'])
   ||COUNTS.some(k=>!reviewCount(row[k])||row[k]>100000)||row.before!==row.unchanged+row.changed+row.removed||row.after!==row.unchanged+row.changed+row.added
   ||!reviewHash(row.baselineProjectionSha256)||!reviewHash(row.candidateProjectionSha256)
   ||!reviewCount(row.baselineBytes)||row.baselineBytes<2||row.baselineBytes>48*1024*1024||!reviewCount(row.candidateBytes)||row.candidateBytes<2||row.candidateBytes>48*1024*1024)rejectSuccessorReview();
  const fields=row.changedFields;if(!fields||typeof fields!=='object'||Array.isArray(fields)||Object.keys(fields).some(k=>!CURATED_REVIEW_SCHEMA[name][2].split(' ').includes(k))
   ||Object.values(fields).some(n=>!reviewCount(n)||n===0||n>row.changed)||Object.values(fields).reduce((a,b)=>a+b,0)<row.changed
   ||(row.changed===0)!==(Object.keys(fields).length===0))rejectSuccessorReview();
  if((row.added+row.removed+row.changed===0)!==(row.baselineProjectionSha256.toLowerCase()===row.candidateProjectionSha256.toLowerCase()))rejectSuccessorReview();
  return[name,Object.freeze({...row,changedFields:Object.freeze({...fields})})];
 })));
 return Object.freeze({version:CURATED_REVIEW_VERSION,generatedAt:value.generatedAt,baseline,candidate,comparisonComplete:true,scope:SCOPE,artifacts});
}
export function coordinatedReviewData(value){
 if(!exactReviewKeys(value,['version','generatedAt','coreReportSha256','core','curated','scope'])||value.version!==COORDINATED_REVIEW_VERSION||!reviewHash(value.coreReportSha256))rejectSuccessorReview();
 const core=successorReviewData(value.core),curated=curatedReviewData(value.curated);reviewGeneratedAt(value.generatedAt);
 const scope={databaseQueries:0,databaseWrites:0,sourcePromoted:false,nativeOperationsCompared:false,canonicalCompared:false,coreArtifactsReread:false,curatedArtifactsRead:true,containsPersonalRecords:false,containsSalaryAmounts:false};
 if(!exactReviewKeys(value.scope,Object.keys(scope))||Object.entries(scope).some(([k,v])=>value.scope[k]!==v))rejectSuccessorReview();
 for(const key of ['baseline','candidate'])for(const field of ['profileId','sourceSha256','sourceCutoff'])if(core[key][field]!==curated[key][field])rejectSuccessorReview();
 return Object.freeze({version:COORDINATED_REVIEW_VERSION,generatedAt:value.generatedAt,coreReportSha256:value.coreReportSha256.toLowerCase(),core,curated,scope:Object.freeze(scope)});
}
export function expandedReviewData(value){return value?.version===COORDINATED_REVIEW_VERSION?coordinatedReviewData(value):value?.version===CURATED_REVIEW_VERSION?curatedReviewData(value):successorReviewData(value);}
export const isExpandedReview=version=>[SUCCESSOR_REVIEW_VERSION,CURATED_REVIEW_VERSION,COORDINATED_REVIEW_VERSION].includes(version);
