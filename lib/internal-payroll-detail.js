import { createPayrollDetailModel } from '../assets/payroll-detail-model.js';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function normalizeDetailQuery(query={}){
 const get=k=>{if(Array.isArray(query[k]))throw new Error('Consulta repetida');return String(query[k]??'')};
 const contractId=get('contractId'),payrollDate=get('date'),payrollType=get('type'),period=get('period'),month=get('month');
 if(!UUID.test(contractId)||!/^\d{4}-\d{2}-\d{2}$/.test(payrollDate)||new Date(payrollDate+'T00:00:00Z').toISOString().slice(0,10)!==payrollDate||! /^[A-Z]$/.test(payrollType)||! /^(19|20)\d{2}$/.test(period)||! /^(?:[1-9]|1[0-2])$/.test(month))throw new Error('Seleccioná un legajo y un período válidos');
 return{contractId,payrollDate,payrollType,period:Number(period),month:Number(month)};
}
export async function employeePayrollDetail(sql,req,principal,session){
 let q;try{q=normalizeDetailQuery(req.query)}catch{return{status:400,payload:{ok:false,code:'PAYROLL_DETAIL_QUERY_INVALID',error:'Seleccioná un legajo y un período válidos.'}}}
 const email=String(principal?.user?.email||'').trim().toLowerCase(),tenant=principal?.tenant;
 if(!email||email!==String(session?.email||'').trim().toLowerCase()||tenant?.source!=='membership'||!UUID.test(String(tenant.id))||!UUID.test(String(tenant.membershipId))||!UUID.test(String(session?.id))||!Number.isSafeInteger(session?.version)||session.version<1||! /^[a-f0-9]{40}$/.test(String(session?.releaseSha)))return{status:401,payload:{ok:false,code:'PAYROLL_DETAIL_SESSION_INVALID',error:'La sesión ya no es válida.'}};
 const [row]=await sql.query('SELECT employee_payroll_detail_v1($1,$2::uuid,$3::integer,$4,$5::uuid,$6::uuid,$7::uuid,$8::date,$9,$10::integer,$11::integer) AS result',[email,session.id,session.version,session.releaseSha,tenant.id,tenant.membershipId,q.contractId,q.payrollDate,q.payrollType,q.period,q.month]);
 const data=row?.result;
 if(!data||data.version!=='payroll-detail.v1'||typeof data.found!=='boolean'||typeof data.available!=='boolean')throw new Error('PAYROLL_DETAIL_CONTRACT_DRIFT');
 if(!data.found)return{status:404,payload:{ok:false,code:'PAYROLL_DETAIL_NOT_FOUND',error:'No encontramos la ficha seleccionada.'}};
 if(!data.available)return{status:200,payload:{ok:true,data:{version:'payroll-detail.v1',found:true,available:false,lines:[]}}};
 if(data.payrollDate!==q.payrollDate||data.payrollType!==q.payrollType||data.sourcePeriod!==q.period||data.sourceMonth!==q.month)throw new Error('PAYROLL_DETAIL_CONTEXT_DRIFT');
 createPayrollDetailModel(data,{name:'Validación del contrato',legajo:'1'});
 const safe=Object.fromEntries(['version','found','available','datasetId','statementId','statementHash','sourceHash','sourceLabel','payrollDate','sourcePeriod','sourceMonth','payrollType','closureStatus','officialReceipt','signatureApplied'].map(k=>[k,data[k]]));
 safe.lines=data.lines.map(r=>Object.fromEntries(['code','description','totalGroup','calculationClass','sourceType','quantity','amount','agreement','unit'].map(k=>[k,r[k]])));
 safe.historyTotals=data.historyTotals?Object.fromEntries(['subjectEarnings','nonSubjectEarnings','familyAllowance','employeeWithholdings','netPayable','employerContributions','sourceCutoff','itemCount'].map(k=>[k,data.historyTotals[k]])):null;
 return{status:200,payload:{ok:true,data:safe}};
}
