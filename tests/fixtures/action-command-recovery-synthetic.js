// Synthetic cases only. This fixture is never a municipal connection, decision or payroll write.
import {actionHistoryFixture,actionHistoryBootstrap,historyCapabilities} from './action-history-synthetic.js';
export const recoveryContract='55555555-5555-4555-8555-555555555555';
export const recoveryCapabilities=[...historyCapabilities,'time.overtime.enter'];
const copy=value=>structuredClone(value);
export function recoveryBootstrap(overtime=false){
 const b=actionHistoryBootstrap(overtime);b.principal.capabilities=recoveryCapabilities;
 b.options.subjects=[{contractId:recoveryContract,displayName:'Agente de prueba de recuperación',legajo:'QA-01',sector:'Área sintética',allowedConfidentialities:['standard','restricted']}];
 if(overtime){b.feature.canEnter=true;b.feature.canDecide=false;b.options.reasons=[{reasonCode:'service_continuity',label:'Continuidad de prueba',governanceStatus:'operational_provisional'}];b.options.decisionReasons=[{decisionReasonCode:'administrative_error',label:'Corrección de prueba',allowedCommands:['cancel','reject']}];}
 else b.options.reasons=[{code:'19',label:'Licencia anual de prueba',policyVersionId:'mendoza-ley-5811-title-vi.v1',policyRuleId:'annual-ordinary',supportsMinutes:false,confidentiality:'standard',allowedConfidentialities:['standard','restricted']}];
 return b;
}
export function actionRecoveryService(){
 const records=new Map(),ledger=new Map(),calls=[];let commits=0,sequence=0;
 const envelope=(record,replayed=false)=>({ok:true,caseType:record.caseType,replayed,data:{id:record.id,caseNumber:record.caseNumber,caseType:record.caseType,status:record.status,version:record.version,...(record.caseType==='overtime_entry'?{payrollImpact:{amount:null,rate:null,calculated:false,posted:false,attendanceReconciled:false}}:{})}});
 function apply(body,key){
  const fingerprint=JSON.stringify(body);calls.push({body:copy(body),key});
  if(ledger.has(key)){const previous=ledger.get(key);if(previous.fingerprint!==fingerprint)return{status:409,json:{ok:false,code:'ACTION_IDEMPOTENCY_KEY_REUSED',error:'Clave incompatible'}};return{status:200,json:{...copy(previous.receipt),replayed:true}};}
  let record;if(body.command==='create'){
   record=actionHistoryFixture(body.caseType==='overtime_entry'?3:0);record.id='11111111-1111-4111-8111-'+String(++sequence).padStart(12,'0');record.caseNumber=String(500+sequence);record.caseType=body.caseType;record.status='draft';record.version=1;record.projection=body.caseType==='overtime_entry'?'restricted_nominal':'nominal';record.sourceContext=actionHistoryFixture(0).sourceContext;
   record.subject={contractId:recoveryContract,displayName:'Agente de prueba de recuperación',legajo:'QA-01',sector:'Área sintética'};record.beneficiaryContractId=recoveryContract;record.payload=copy(body.payload);record.confidentiality=body.caseType==='overtime_entry'?'restricted':body.payload.confidentiality;record.policyVersionId=body.payload.policyVersionId;
  }else{
   record=records.get(body.caseId);if(!record)return{status:404,json:{ok:false,code:'ACTION_CASE_NOT_FOUND'}};
   if(body.command==='approve')return{status:409,json:{ok:false,code:'ACTION_SEPARATION_OF_DUTIES',error:'La persona preparadora no puede aprobar su propia solicitud.'}};
   if(record.version!==body.expectedVersion)return{status:409,json:{ok:false,code:'ACTION_VERSION_CONFLICT',error:'Versión distinta'}};
   record.version++;record.status=body.command==='update_draft'?'draft':body.command==='submit'?'submitted':body.command==='reject'?'rejected':'cancelled';if(body.payload)record.payload=copy(body.payload);
  }
  records.set(record.id,record);ledger.set(key,{fingerprint,id:record.id,receipt:copy(envelope(record))});commits++;return{status:body.command==='create'?201:200,json:envelope(record)};
 }
 function detail(id){const record=records.get(id);if(!record)return{ok:false};return{ok:true,data:copy(record),allowedCommands:record.status==='draft'?['update_draft','submit','cancel']:record.status==='submitted'?['approve','reject','cancel']:[],timeline:[],evidence:[]};}
 function list(type){const rows=[...records.values()].filter(r=>r.caseType===type).map(copy);return{ok:true,caseType:type,data:rows,pagination:{page:1,limit:25,total:rows.length,pages:rows.length?1:0}};}
 return{apply,detail,list,calls,get commits(){return commits;},get records(){return [...records.values()].map(copy);}};
}
