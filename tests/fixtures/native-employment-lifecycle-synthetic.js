import {LIFECYCLE_VERSION,lifecycleAfter,lifecycleActivity} from '../../assets/native-employment-lifecycle-model.js';
export const CONTRACT='22222222-2222-4222-8222-222222222222',ID='33333333-3333-4333-8333-333333333333';
export function lifecycleFixture(operation='propose',decision='approve',movement='terminate'){
 const intervals=movement==='terminate'?[{startDate:'2026-09-21',endDate:null}]:[{startDate:'2026-09-21',endDate:'2026-10-01'}];
 const date=movement==='terminate'?'2026-10-01':'2026-11-01',subject={contractId:CONTRACT,legajo:'5001',employeeName:'PERSONA SINTÉTICA QA',identityToken:'e'.repeat(64),sourceCutoff:null,origin:'MUNICONTROL',registrationId:ID,registeredAt:'2026-09-21T12:00:00Z'};
 const revision=movement==='terminate'?0:1;
 const bootstrap={version:LIFECYCLE_VERSION,scopeVersion:'d'.repeat(64),subject,employment:{version:'a'.repeat(64),revision,appliedAt:revision?'2026-10-01T12:00:00Z':null,intervals,today:'2026-10-02',status:lifecycleActivity(intervals,'2026-10-02')},permissions:{canPropose:true,canReview:true},proposals:[],historyTruncated:false};
 const proposal={id:ID,contractId:CONTRACT,subject:structuredClone(subject),status:'pending',movement,date,reason:'Movimiento administrativo sintético QA',legalReference:'Instrumento sintético QA',createdAt:'2026-10-01T12:00:00Z',authorLabel:'PERSONA AUTORA QA',baseVersion:'a'.repeat(64),canReview:true,before:{intervals:structuredClone(intervals)},after:{intervals:lifecycleAfter(intervals,movement,date)},review:null};
 const body={operation,payload:operation==='propose'?{contractId:CONTRACT,identityToken:subject.identityToken,scopeVersion:bootstrap.scopeVersion,baseVersion:bootstrap.employment.version,movement,date,reason:proposal.reason,legalReference:proposal.legalReference}:{contractId:CONTRACT,proposalId:ID,scopeVersion:bootstrap.scopeVersion,decision,reason:'Decisión independiente sintética QA'}};
 const saved=structuredClone(proposal),current=structuredClone(bootstrap),receipt={version:LIFECYCLE_VERSION,operation,contractId:CONTRACT,proposalId:ID,status:operation==='propose'?'pending':decision==='approve'?'approved':'rejected',employmentVersion:'a'.repeat(64),revision,replayed:false,payrollModified:false};
 if(operation==='review'){
  saved.status=receipt.status;saved.canReview=false;saved.review={decision,reason:body.payload.reason,reviewedAt:'2026-10-01T14:00:00Z',reviewerLabel:'PERSONA REVISORA QA'};
  if(decision==='approve'){receipt.employmentVersion='b'.repeat(64);receipt.revision++;current.employment={...current.employment,intervals:structuredClone(saved.after.intervals),version:receipt.employmentVersion,revision:receipt.revision,appliedAt:saved.review.reviewedAt,status:lifecycleActivity(saved.after.intervals,current.employment.today)};}
 }
 return {body,bootstrap,proposal,saved,current,receipt,envelope:{version:LIFECYCLE_VERSION,proposal:saved}};
}
