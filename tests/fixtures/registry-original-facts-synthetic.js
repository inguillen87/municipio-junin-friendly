import {activeAdoptionRaw} from './active-contract-adoption-synthetic.js';
export function registryPendingRaw(count=869){
 const r=activeAdoptionRaw(count);r.source.operationalCohort={version:'active-contracts.v1',sourceTotal:count+1583,archivedTotal:1583};
 for(let n=0;n<Math.min(14,count);n++){const v=r.rows[n];v.startDate=null;v.sourceIssues=['START_DATE_MISSING'];if(n<2){v.agreementCode=null;v.categoryCode=null;v.sourceIssues.push('CLASSIFICATION_MISSING');}if(n===0){v.jurisdictionCode=null;v.sourceIssues.push('JURISDICTION_MISSING_ACTIVE');}}
 return r;
}
