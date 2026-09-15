import { BANK_REPORT_VERSION,BANK_CAPABILITIES,bankFail,bankExact,bankUuid,bankHash,bankSafeError,buildBankReport } from './internal-payroll-bank-source.js';
export { BANK_CAPABILITIES,bankFail,bankSafeError };
export function parseBankReportQuery(req) {
 const q=req.query??{};
 if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string')||!['catalog','report'].includes(q.resource)
  ||Object.keys(q).some(k=>!['resource','datasetId'].includes(k))||(q.resource==='catalog'?Object.keys(q).length!==1:!bankUuid(q.datasetId)||Object.keys(q).length!==2))bankFail('QUERY_INVALID');
 if(typeof req.url==='string'){
  let params;try{params=new URL(req.url,'http://localhost').searchParams}catch{bankFail('QUERY_INVALID')}
  const seen=new Set();for(const [key,value]of params){if(seen.has(key)||q[key]!==value)bankFail('QUERY_INVALID');seen.add(key)}
  if(seen.size!==Object.keys(q).length)bankFail('QUERY_INVALID');
 }
 return {resource:q.resource,datasetId:q.datasetId?.toLowerCase()??null};
}
export async function readBankReport(sql,principal,session,query) {
 const t=principal?.tenant,email=principal?.user?.email?.trim().toLowerCase();
 if(t?.source!=='membership'||!BANK_CAPABILITIES.every(k=>t.effectiveCapabilities?.includes(k)))bankFail('CAPABILITY_REQUIRED');
 if(!email||email!==session?.email?.trim().toLowerCase()||!bankUuid(t.id)||!bankUuid(t.membershipId)||!bankUuid(session?.id)
  ||!Number.isSafeInteger(session.version)||session.version<1)bankFail('SESSION_INVALID');
 if(!/^[a-f0-9]{40}$/.test(session.releaseSha)||session.releaseSha!==t.certifiedReleaseSha)bankFail('RELEASE_NOT_CERTIFIED');
 let rows;try{const result=await sql.query('SELECT public.payroll_bank_source_report_v1($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::uuid) AS result',
  [email,session.id,session.version,session.releaseSha,t.id,t.membershipId,query.datasetId]);rows=Array.isArray(result)?result:result?.rows}catch(error){throw bankSafeError(error)}
 if(!Array.isArray(rows)||rows.length!==1)bankFail('SOURCE_DRIFT');const data=rows[0]?.result;
 if(query.resource==='report'){const report=buildBankReport(data);if(report.dataset.datasetId.toLowerCase()!==query.datasetId)bankFail('SOURCE_DRIFT');return report}
 bankExact(data,['version','mode','items']);if(data.version!==BANK_REPORT_VERSION||data.mode!=='catalog'||!Array.isArray(data.items)||data.items.length>240)bankFail('SOURCE_DRIFT');
 const seen=new Set();for(const item of data.items){bankExact(item,['datasetId','period','date','type','statementCount','sourceLabel','sourceSha256','bankSourceAvailable']);
  if(!bankUuid(item.datasetId)||seen.has(item.datasetId)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(item.period)||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!/^[A-Z]$/.test(item.type)
   ||!Number.isSafeInteger(item.statementCount)||item.statementCount<1||item.statementCount>5000||typeof item.sourceLabel!=='string'||item.sourceLabel.length>250||/[\x00-\x1f\x7f]/.test(item.sourceLabel)
   ||!bankHash(item.sourceSha256)||typeof item.bankSourceAvailable!=='boolean')bankFail('SOURCE_DRIFT');seen.add(item.datasetId)}
 return data;
}
