import {registryPendingRaw} from './registry-original-facts-synthetic.js';
import {OPERATIONAL_ADOPTION_COHORT} from '../../assets/employment-adoption-operational-cohort.js';
// Synthetic authoritative response; never filters a real client-side search.
export function operationalRaw(count=869){
 const r=registryPendingRaw(count),pending=r.rows.filter(v=>v.startDate===null);
 r.source.operationalCohort={...r.source.operationalCohort,version:OPERATIONAL_ADOPTION_COHORT,deferredTotal:pending.length,deferredSourceRowNumbers:pending.map(v=>v.sourceRowNumber)};
 r.rows=r.rows.filter(v=>v.startDate!==null).map((v,n)=>({...v,rowNumber:n+1}));r.total=r.rows.length;return r;
}
