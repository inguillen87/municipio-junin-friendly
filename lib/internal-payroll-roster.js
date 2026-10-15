import { payrollRoster } from '../assets/payroll-roster-model.js';
import {createHash} from 'node:crypto';
import {stableBatchValue,batchNumber,batchHash,batchFailure} from '../assets/payroll-document-batch-model.js';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(v);
const nullable=(v,max)=>v===null||text(v,max);
const hash=v=>createHash('sha256').update(stableBatchValue(v)).digest('hex');
// Internal projection from the authenticated roster facade. Never part of the
// public roster DTO, and never reconstructed from client-provided identities.
export function verifiedDocumentaryDirectory(value,{tenantId,datasetId,bindingId,database,companyId,cutoff,rows}){
 const fail=()=>batchFailure('PAYROLL_BATCH_DIRECTORY_DRIFT');
 if(!exact(value,['version','scope','cutoff','records','readVersion'])||value.version!=='payroll-document-assignments.v1'
  ||!exact(value.scope,['tenantId','bindingId','database','companyId','datasetId'])
  ||![value.scope.tenantId,value.scope.bindingId,value.scope.datasetId].every(v=>typeof v==='string'&&UUID.test(v))
  ||value.scope.tenantId.toLowerCase()!==tenantId.toLowerCase()||value.scope.datasetId.toLowerCase()!==datasetId.toLowerCase()
  ||bindingId!==undefined&&value.scope.bindingId.toLowerCase()!==bindingId.toLowerCase()
  ||!text(value.scope.database,128)||!value.scope.database||!Number.isSafeInteger(value.scope.companyId)||value.scope.companyId<1
  ||database!==undefined&&value.scope.database!==database||companyId!==undefined&&value.scope.companyId!==companyId
  ||!text(value.cutoff,40)||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(value.cutoff)
  ||!Number.isFinite(Date.parse(value.cutoff))||new Date(value.cutoff).toISOString().slice(0,19)+'Z'!==value.cutoff
  ||cutoff!==undefined&&value.cutoff!==cutoff||!Array.isArray(rows)||rows.length>2000
  ||!Array.isArray(value.records)||value.records.length!==rows.length||!batchHash(value.readVersion))fail();
 const numbers=new Set(rows.map(r=>r.legajo)),seen=new Set();if(numbers.size!==rows.length)fail();
 for(const record of value.records){
  if(!exact(record,['number','assignments'])||!batchNumber(record.number)||!numbers.has(record.number)||seen.has(record.number)
   ||!Array.isArray(record.assignments)||record.assignments.length>100)fail();
  seen.add(record.number);
  for(const a of record.assignments)if(!exact(a,['contractId','name','sectorCode','sectorLabel'])
   ||typeof a.contractId!=='string'||!UUID.test(a.contractId)||!nullable(a.name,240)||!nullable(a.sectorCode,40)||!nullable(a.sectorLabel,240))fail();
 }
 const {readVersion,...projection}=value;if(hash(projection)!==readVersion)fail();
 return structuredClone(value);
}
export async function internalPayrollRoster(sql, req, principal, session) {
  const q = req.query || {}, email = String(principal?.user?.email || '').trim().toLowerCase(), t = principal?.tenant;
  if (Object.keys(q).some(k => !['resource','datasetId'].includes(k)) || typeof q.datasetId !== 'string' || !UUID.test(q.datasetId)) return { status:400, payload:{ok:false,error:'Elegí una liquidación válida.'} };
  if (!email || email !== String(session?.email || '').trim().toLowerCase() || t?.source !== 'membership' || !UUID.test(String(t.id)) || !UUID.test(String(t.membershipId)) || !UUID.test(String(session?.id)) || !Number.isSafeInteger(session?.version) || session.version < 1 || !/^[a-f0-9]{40}$/.test(String(session?.releaseSha))) return {status:401,payload:{ok:false,error:'La sesión ya no es válida.'}};
  const required = ['payroll.read','workforce.employee.read'];
  if (!required.every(k => t.effectiveCapabilities?.includes(k))) return {status:403,payload:{ok:false,error:'Tu usuario no tiene permiso para consultar la identificación de nómina.'}};
  const [r] = await sql.query('SELECT payroll_export_roster_v1($1,$2::uuid,$3::integer,$4,$5::uuid,$6::uuid,$7::uuid) AS result', [email,session.id,session.version,session.releaseSha,t.id,t.membershipId,q.datasetId]);
  const raw = r?.result; payrollRoster(raw);
  if (raw.found && raw.datasetId !== q.datasetId) throw new Error('PAYROLL_ROSTER_CONTEXT_DRIFT');
  if (!raw.found) return {status:200,payload:{ok:true,data:{version:'payroll-export-roster.v1',found:false,official:false}}};
  const fields = ['version','found','official','datasetId','date','type','total','sourceLabel','closureStatus','payloadHash','reportHash'];
  const rowFields = ['legajo','name','dni','cuil','sex','contractMatches','identityCutoff','contractStatus','concept993','concept995'];
  const documentaryDirectory=raw.documentaryDirectory===undefined?undefined:verifiedDocumentaryDirectory(raw.documentaryDirectory,{tenantId:t.id,datasetId:q.datasetId,rows:raw.rows});
  return {status:200,...(documentaryDirectory?{documentaryDirectory}:{}),payload:{ok:true,data:{...Object.fromEntries(fields.map(k=>[k,raw[k]])),rows:raw.rows.map(row=>Object.fromEntries(rowFields.map(k=>[k,row[k]])))}}};
}
