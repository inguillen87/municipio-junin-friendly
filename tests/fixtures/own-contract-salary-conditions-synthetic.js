import { SALARY_CONDITIONS_VERSION, salaryConditionsHash } from '../../assets/own-contract-salary-conditions-model.js';
export const conditionsId = n => '10000000-0000-4000-8000-' + n.toString(16).padStart(12,'0');
export const conditionsHash = 'a'.repeat(64);
export const conditionsReason = 'Declaración exclusivamente sintética del conjunto completo';
export const syntheticConditionsDefinition = () => ({partialSeniorityYears:null,title:{status:'not_reported',code:null,percentage:null},unhealthyWork:null,asOfDate:'2026-10-01',documentReference:'Constancia exclusivamente sintética QA'});
export const syntheticConditionsItems = (count=1) => Array.from({length:count},(_,i)=>({contractId:conditionsId(i+1),identityToken:conditionsHash,definition:syntheticConditionsDefinition()}));
export const syntheticConditionsSource = (count=1) => ({version:conditionsHash,subjects:Array.from({length:count},(_,i)=>({contractId:conditionsId(i+1),registrationId:'20000000-0000-4000-8000-'+(i+1).toString(16).padStart(12,'0'),legajo:'QA-'+(i+1),employeeName:'Agente exclusivamente sintético',identityToken:conditionsHash,sourceCutoff:null,origin:'MUNICONTROL',registeredAt:'2026-09-01T12:00:00Z'}))});
export const syntheticConditionsBootstrap = (count=1) => ({version:SALARY_CONDITIONS_VERSION,period:'2026-10',scopeVersion:conditionsHash,source:syntheticConditionsSource(count),configuration:{version:conditionsHash,revision:0,items:[],proposalId:null,approvalId:null},proposals:[],permissions:{canPropose:true,canReview:false},complete:true,payrollCalculated:false,payrollPosted:false});
export const syntheticConditionsCommand = (count=1) => ({command:'propose',period:'2026-10',scopeVersion:conditionsHash,baseVersion:conditionsHash,sourceVersion:conditionsHash,proposalId:null,proposalSha256:null,items:syntheticConditionsItems(count),reason:conditionsReason,reviewConfirmed:false});
export async function syntheticConditionsDetail(count=1) {
 const body=syntheticConditionsCommand(count);
 return {version:SALARY_CONDITIONS_VERSION,period:'2026-10',scopeVersion:conditionsHash,body,baseItems:[],source:syntheticConditionsSource(count),current:true,proposal:{id:conditionsId(10001),requestSha256:await salaryConditionsHash(body),baseVersion:conditionsHash,sourceVersion:conditionsHash,itemCount:count,reason:body.reason,createdAt:'2026-10-10T12:00:00Z',authorLabel:'Preparador exclusivamente sintético',canReview:true,status:'pending',decision:null}};
}
export async function syntheticConditionsReceipt(count=1) {
 const body=syntheticConditionsCommand(count);
 return {version:SALARY_CONDITIONS_VERSION,eventId:conditionsId(10001),proposalId:conditionsId(10001),requestKey:conditionsId(10002),requestSha256:await salaryConditionsHash(body),body,status:'pending',revision:0,configurationVersion:conditionsHash,replayed:false,payrollCalculated:false,payrollPosted:false};
}
