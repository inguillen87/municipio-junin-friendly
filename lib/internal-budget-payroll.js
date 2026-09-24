// Reuse session-bound payroll readers, but never send amounts, names, DNI or CUIL to the comparison.
import {internalPayrollRoster} from './internal-payroll-roster.js';
import {internalPayrollSourceReport} from './internal-payroll-source-report.js';
import {verifyBudgetPayrollRoster} from '../assets/budget-payroll-model.js';
export const BUDGET_PAYROLL_CAPABILITIES=Object.freeze(['workforce.structure.read','workforce.employee.read','payroll.read']);
export async function internalBudgetPayroll(sql,req,principal,session){
 const q=req.query??{},resource=q.resource;
 if(!['budgetpayrollcatalog','budgetpayrollroster'].includes(resource)||Object.keys(q).some(k=>!['resource','datasetId'].includes(k))||resource==='budgetpayrollcatalog'&&q.datasetId!==undefined)return{status:400,payload:{ok:false,error:'Consulta de cotejo inválida.'}};
 if(!BUDGET_PAYROLL_CAPABILITIES.every(c=>principal?.tenant?.effectiveCapabilities?.includes(c)))return{status:403,payload:{ok:false,error:'El cotejo requiere permisos de estructura, legajos y nómina.'}};
 if(!session)return{status:401,payload:{ok:false,error:'La sesión debe verificarse nuevamente.'}};
 if(resource==='budgetpayrollcatalog')return internalPayrollSourceReport(sql,{query:{resource:'payrollsourcereport'}},principal,session);
 const result=await internalPayrollRoster(sql,{query:{resource:'payrollexportroster',datasetId:q.datasetId}},principal,session);
 if(result.status!==200)return result;
 const d=result.payload.data;
 if(!d.found)return{status:404,payload:{ok:false,code:'BUDGET_PAYROLL_NOT_FOUND',error:'La liquidación no está disponible para esta sesión.'}};
 const data={version:'budget-payroll-roster.v1',tenantId:principal.tenant.id,datasetId:d.datasetId,date:d.date,type:d.type,total:d.total,sourceLabel:d.sourceLabel,closureStatus:d.closureStatus,payloadHash:d.payloadHash,reportHash:d.reportHash,official:false,rows:d.rows.map(r=>({number:r.legajo}))};
 verifyBudgetPayrollRoster(data);
 return{status:200,payload:{ok:true,data}};
}
