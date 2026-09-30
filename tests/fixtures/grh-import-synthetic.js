// Synthetic data only; no municipal records. SQL execution is stubbed here and tested separately in PostgreSQL.
import {GRH_GUARDED_PREPARE_SQL} from '../../lib/grh-import-prepare-sql.js';
export const id=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0'),caps=['payroll.novelty.read','payroll.novelty.prepare','payroll.novelty.nominal.read','workforce.employee.read'];
export const principal=()=>({user:{email:'operator@example.invalid'},tenant:{id:id(1),membershipId:id(2),source:'membership',effectiveCapabilities:[...caps]}});
export const session=()=>({email:'operator@example.invalid',id:id(3),version:2,releaseSha:'a'.repeat(40)});
export const line=(dni='99000001',amount='00000123.45')=>' '.repeat(5)+dni+' '.repeat(31)+amount;
export const input=(patch={})=>({profileId:'junin55',concept:'614',periodMonth:'2026-08-01',payrollType:'monthly',contentBase64:Buffer.from(line()).toString('base64'),choices:[],previewToken:null,...patch});
export function fixture(count=1){
 const records=Array.from({length:count},(_,i)=>({contractId:id(100+i),personId:id(500+i),dni:String(99000001+i),legajo:String(1001+i),name:'Persona QA '+i,startDate:'2020-01-01',endDate:null,cutoff:'2026-09-22T15:16:58.000000Z',expectedIdentityToken:'b'.repeat(64)}));
 const state={records,sourceToken:'c'.repeat(64),writes:0,readCalls:[],runtimeCalls:[],afterCandidates:null,guardFailure:false,subjectPatch:null};
 const readSql={query:async(q,args)=>{state.readCalls.push(q);if(q.includes('effective-source:snapshot'))return[{token:state.sourceToken}];if(q.includes('SELECT source_database'))return[{database:'GRH_QA',company:'101'}];if(q.includes('grh-import:read-only-candidates')){const result=structuredClone(state.records);state.afterCandidates?.();return result;}throw Error('Unexpected read SQL');}};
 const runtime={query:async(q,args)=>{state.runtimeCalls.push(q);if(q.includes('SELECT payroll_novelty_bootstrap_v1'))return[{result:{principal:{tenantId:id(1),membershipId:id(2),certifiedBindingId:id(4),capabilities:[...caps],employmentLinked:true}}}];
  if(q.includes('WITH ORDINALITY x(item,ord)'))return JSON.parse(args[1]).map((r,i)=>({ordinal:i+1,value:{version:'payroll-novelty-employee.v2',subject:{contractId:r.contractId,legajo:r.legajo,employeeName:r.name,identityToken:r.expectedIdentityToken,sourceCutoff:r.cutoff,...state.subjectPatch}}}));
  if(q===GRH_GUARDED_PREPARE_SQL){if(state.guardFailure)throw Object.assign(Error('division by zero'),{code:'22012'});state.writes++;const rows=JSON.parse(args[4]),subjects=JSON.parse(args[7]);return[{result:{verified:1,receipt:{replayed:false,data:{id:id(900),contractVersion:'payroll-novelty-batch.v1',periodMonth:args[2],payrollType:args[3],rowCount:rows.length,status:'draft',version:1,sourceMode:args[1],exportable:false,rows:rows.map((r,i)=>({...r,employmentContractId:subjects[i].contractId,issues:[]})),grhMutation:false,payrollCalculated:false,payrollPosted:false}}}}];}
  throw Error('Unexpected runtime SQL');}};
 return{state,readSql,runtime,payload:input({contentBase64:Buffer.from(records.map(r=>line(r.dni)).join('\r\n')).toString('base64')})};
}
