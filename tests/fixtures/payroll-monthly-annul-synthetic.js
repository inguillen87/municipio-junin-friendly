// Public synthetic data only; no municipal source or database connection.
import {batch as historical,id} from './novelty-saved-review-synthetic.js';
export {id};
export const effects={grhMutation:false,payrollCalculated:false,payrollPosted:false};
export const scope='b'.repeat(64),stamp='2026-10-04T12:30:00.123456Z';
export function approved(n=1,count=60,native=false){
 const b=historical(count);delete b.allowedCommands;delete b.canExport;
 Object.assign(b,{id:id(1000+n),status:'approved',version:3,exportable:true,releaseSha:'a'.repeat(40),reasonCode:'validated_for_export',reasonReference:null,
 createdAt:stamp,updatedAt:stamp,submittedAt:stamp,decidedAt:stamp});
 b.rows[0].amountCents=null;b.rows[0].quantityDecimal='100.000001';
 if(count>1)b.rows[1].amountCents='0';if(count>2)b.rows[2].amountCents='9223372036854775807';
 if(native){Object.assign(b,{contractVersion:'payroll-novelty-batch.v2',sourceMode:'individual',rowCount:1});b.rows=[b.rows[0]];
  b.rows[0].subject={contractId:b.rows[0].employmentContractId,legajo:b.rows[0].legajo,employeeName:'Alta propia sintética',identityToken:'c'.repeat(64),
   sourceCutoff:null,origin:'MUNICONTROL',registrationId:id(6000+n),registeredAt:stamp};}
 return b;
}
export const candidate=b=>({version:'payroll-monthly-annul.v1',scopeKey:scope,proposalId:null,proposalSha256:null,status:'candidate',reason:null,
 canPropose:true,canReview:false,items:[{snapshotSha256:'d'.repeat(64),batch:b}],decision:null,effects:{...effects}});
export const bootstrap=rows=>({version:'payroll-monthly-annul.v1',scopeKey:scope,permissions:{canPropose:true,canReview:true},
 candidates:rows.map(b=>({batchId:b.id,expectedVersion:b.version,periodMonth:b.periodMonth,payrollType:b.payrollType,rowCount:b.rowCount,canPropose:true})),proposals:[],complete:true,effects:{...effects}});
export const proposal=items=>({version:'payroll-monthly-annul.v1',scopeKey:scope,proposalId:id(8000),proposalSha256:'e'.repeat(64),status:'pending',reason:'Motivo administrativo de ensayo',canPropose:false,canReview:true,
 items:items.flatMap(c=>c.items).sort((a,b)=>a.batch.id<b.batch.id?-1:1),decision:null,effects:{...effects}});
export const receipt=(body,key=id(9000),replayed=false)=>({version:'payroll-monthly-annul.v1',eventId:id(8000),proposalId:body.proposalId??id(8000),key,bodySha256:'f'.repeat(64),body:structuredClone(body),replayed,
 status:({propose:'pending',approve:'approved',reject:'rejected'})[body.command],recordedAt:stamp,effects:{...effects}});
