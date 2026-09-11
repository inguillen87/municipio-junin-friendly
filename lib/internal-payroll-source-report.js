import {payrollSourceReport} from '../assets/payroll-source-report-model.js';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export async function internalPayrollSourceReport(sql,req,principal,session){
 const keys=Object.keys(req.query||{});if(keys.some(k=>!['resource','datasetId'].includes(k))||Array.isArray(req.query?.datasetId)||req.query?.datasetId!==undefined&&!UUID.test(req.query.datasetId))return{status:400,payload:{ok:false,error:'Elegí una liquidación válida.'}};
 const email=String(principal?.user?.email||'').trim().toLowerCase(),t=principal?.tenant;
 if(!email||email!==String(session?.email||'').trim().toLowerCase()||t?.source!=='membership'||!UUID.test(String(t.id))||!UUID.test(String(t.membershipId))||!UUID.test(String(session?.id))||!Number.isSafeInteger(session?.version)||session.version<1||!/^[a-f0-9]{40}$/.test(String(session?.releaseSha)))return{status:401,payload:{ok:false,error:'La sesión ya no es válida.'}};
 const [row]=await sql.query('SELECT payroll_source_report_v1($1,$2::uuid,$3::integer,$4,$5::uuid,$6::uuid,$7::uuid) AS result',[email,session.id,session.version,session.releaseSha,t.id,t.membershipId,req.query?.datasetId||null]);const raw=payrollSourceReport(row?.result);
 if(raw.mode!==(req.query?.datasetId?'report':'catalog'))throw Error('PAYROLL_REPORT_MODE_DRIFT');
 if(raw.mode==='report'&&raw.found&&raw.datasetId!==req.query.datasetId)throw Error('PAYROLL_REPORT_DATASET_DRIFT');
 const keysOut=raw.mode==='catalog'?['version','mode','total','truncated','official']:raw.found?['version','mode','found','datasetId','reportHash','payloadHash','date','type','statementCount','lineCount','sourceLabel','closureStatus','official']:['version','mode','found','official'];
 const data=Object.fromEntries(keysOut.map(k=>[k,raw[k]]));
 if(raw.mode==='catalog')data.items=raw.items.map(r=>Object.fromEntries(['datasetId','date','type','statementCount','lineCount','closureStatus','payloadHash','sourceLabel'].map(k=>[k,r[k]])));
 if(raw.mode==='report'&&raw.found)data.rows=raw.rows.map(r=>Object.fromEntries(['code','description','totalGroup','unit','sourceRows','missingAmounts','amount'].map(k=>[k,r[k]])));
 return{status:200,payload:{ok:true,data}};
}
