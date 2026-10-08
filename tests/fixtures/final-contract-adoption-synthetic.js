import {reviewRaw,reviewId} from './employment-adoption-review-synthetic.js';
export const finalAdoptionSource={revisionId:reviewId(9010),packageSha256:'e'.repeat(64),sourceSha256:'f'.repeat(64),cutoff:'2026-10-01T15:17:29',coreManifestSha256:'1'.repeat(64),curatedManifestSha256:'2'.repeat(64),factsSha256:'3'.repeat(64)};
export function finalAdoptionRaw(count=57){
 const r=reviewRaw(count);r.source.finalRevision={...finalAdoptionSource};
 r.rows=r.rows.map((row,n)=>({...row,startDate:'2012-02-03',agreementCode:'2',categoryCode:'4',jurisdictionCode:n%2?'55':'42',
  previous:{status:row.status,startDate:row.startDate,endDate:row.endDate,agreementCode:row.agreementCode,categoryCode:row.categoryCode,organizationId:row.organizationId,sectorCode:row.sectorCode,jurisdictionCode:row.jurisdictionCode},sourceIssues:[]}));
 if(count){const last=r.rows.at(-1);last.status='inactive';last.endDate='2020-01-01';last.jurisdictionCode=null;}
 return r;
}
