import {normalizeDocumentLibrary} from '../assets/payroll-document-library-model.js';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export async function employeePayrollDocuments(sql,req,principal,session){
 const q=req?.query||{};const id=q.contractId;
 if(typeof id!=='string'||!UUID.test(id)||Object.keys(q).some(k=>!['resource','contractId'].includes(k)))return{status:400,payload:{ok:false,code:'PAYROLL_DOCUMENT_QUERY_INVALID',error:'Seleccioná un legajo válido.'}};
 const email=String(principal?.user?.email||'').trim().toLowerCase(),tenant=principal?.tenant;
 if(!email||email!==String(session?.email||'').trim().toLowerCase()||tenant?.source!=='membership'||!UUID.test(String(tenant.id))||!UUID.test(String(tenant.membershipId))||!UUID.test(String(session?.id))||!Number.isSafeInteger(session?.version)||session.version<1||! /^[a-f0-9]{40}$/.test(String(session?.releaseSha)))return{status:401,payload:{ok:false,code:'PAYROLL_DOCUMENT_SESSION_INVALID',error:'La sesión ya no es válida.'}};
 const [row]=await sql.query('SELECT employee_payroll_documents_v1($1,$2::uuid,$3::integer,$4,$5::uuid,$6::uuid,$7::uuid) AS result',[email,session.id,session.version,session.releaseSha,tenant.id,tenant.membershipId,id]);
 const data=row?.result;
 if(data?.version!=='payroll-document-library.v1'||typeof data.found!=='boolean')throw Error('PAYROLL_DOCUMENT_CONTRACT_DRIFT');
 if(!data.found)return{status:404,payload:{ok:false,code:'PAYROLL_DOCUMENT_NOT_FOUND',error:'No encontramos el legajo seleccionado.'}};
 return{status:200,payload:{ok:true,data:normalizeDocumentLibrary(data)}};
}
