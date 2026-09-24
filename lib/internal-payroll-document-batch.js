import {createHash} from 'node:crypto';
import {normalizeBatchQuery,withinBatchRange,stableBatchValue,verifyBatchPreview,batchFailure,batchUuid,batchHash,batchNumber} from '../assets/payroll-document-batch-model.js';
const hash=v=>createHash('sha256').update(stableBatchValue(v)).digest('hex');
const deny=(status,code,error)=>({status,payload:{ok:false,code,error}});
export async function internalPayrollDocumentBatch(sql,req,binding,snapshot,{readRoster}){
 let q;try{q=normalizeBatchQuery(req.query);}catch{return deny(400,'PAYROLL_BATCH_QUERY_INVALID','Revisá los rangos: desde no puede superar hasta y los códigos deben ser numéricos.');}
 if(!batchUuid(binding?.tenantId)||!Number.isSafeInteger(binding.companyId)||binding.companyId<1||!binding.database||!batchHash(snapshot))batchFailure('PAYROLL_BATCH_SCOPE_INVALID');
 const response=await readRoster(q.datasetId);if(response.status!==200)return response;const roster=response.payload.data;
 if(roster?.found!==true)return deny(404,'PAYROLL_BATCH_DATASET_NOT_FOUND','La liquidación no está disponible para esta sesión.');
 if(roster.datasetId!==q.datasetId||!batchHash(roster.payloadHash)||!batchHash(roster.reportHash)||!Array.isArray(roster.rows)||roster.rows.length!==roster.total||roster.total>2000||roster.rows.some(r=>!batchNumber(r.legajo))||new Set(roster.rows.map(r=>r.legajo)).size!==roster.total)batchFailure('PAYROLL_BATCH_ROSTER_DRIFT');
 const params=[q.datasetId,binding.tenantId,binding.database,binding.companyId];
 const metadata=await sql.query(`/* payroll-batch:metadata */
 SELECT d.id::text AS id,to_char(d.payroll_date,'YYYY-MM-DD') AS date,d.source_period AS period,d.source_month AS month,d.payroll_type AS type,
 CASE d.source_closed_flag WHEN 1 THEN 'closed' WHEN 0 THEN 'open' ELSE 'unknown' END AS "closureStatus",
 d.payload_sha256 AS "payloadHash",d.source_sha256 AS "sourceHash",d.source_label AS "sourceLabel",d.statement_count AS total,
 to_char(batch.source_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'Z' AS "directoryCutoff"
 FROM payroll_detail_dataset d JOIN platform_tenant_source_binding b ON b.tenant_id=d.tenant_id AND b.id=d.source_binding_id
   AND b.source_database=d.source_database AND b.source_company_id=d.company_id AND b.source_system='GRH' AND b.verified IS TRUE
 JOIN grh_effective_source_batch_v1 batch ON batch.source_database=b.source_database AND batch.source_system=b.source_system
 WHERE d.id=$1::uuid AND d.tenant_id=$2::uuid AND d.source_database=$3 AND d.company_id=$4::bigint`,params);
 if(metadata.length!==1)batchFailure('PAYROLL_BATCH_SCOPE_INVALID');const meta=metadata[0];
 if(meta.id!==q.datasetId||meta.payloadHash!==roster.payloadHash||meta.date!==roster.date||meta.type!==roster.type||meta.closureStatus!==roster.closureStatus||meta.total!==roster.total)batchFailure('PAYROLL_BATCH_DATASET_DRIFT');
 const records=await sql.query(`/* payroll-batch:directory */
 WITH numbers AS (SELECT unnest($5::text[]) AS number)
 SELECT numbers.number,COALESCE(jsonb_agg(jsonb_build_object('contractId',c.id::text,'name',e.nombre,'sectorCode',e.sector_code,'sectorLabel',e.sector)) FILTER(WHERE c.id IS NOT NULL),'[]'::jsonb) AS assignments
 FROM numbers LEFT JOIN (employment_contract c JOIN grh_effective_source_batch_v1 batch ON batch.id=c.source_batch_id AND batch.source_database=$3 AND batch.source_system=c.source_system
 JOIN platform_tenant_source_binding b ON b.tenant_id=$2::uuid AND b.source_database=batch.source_database AND b.source_company_id=c.legacy_company_id AND b.source_system=c.source_system AND b.verified IS TRUE AND b.id=(SELECT source_binding_id FROM payroll_detail_dataset WHERE id=$1::uuid AND tenant_id=$2::uuid)
 LEFT JOIN grh_effective_employees_v1 e ON e.company_id=c.legacy_company_id AND e.legajo=c.legacy_legajo)
 ON c.source_system='GRH' AND c.legacy_company_id=$4::bigint AND c.legacy_legajo=numbers.number
 WHERE EXISTS(SELECT 1 FROM payroll_detail_dataset d WHERE d.id=$1::uuid AND d.tenant_id=$2::uuid AND d.source_database=$3 AND d.company_id=$4::bigint)
 GROUP BY numbers.number`,[...params,roster.rows.map(r=>r.legajo)]);
 if(records.length!==roster.total||new Set(records.map(r=>r.number)).size!==roster.total||records.some(r=>!roster.rows.some(s=>s.legajo===r.number)||!Array.isArray(r.assignments)||r.assignments.length>100))batchFailure('PAYROLL_BATCH_DIRECTORY_DRIFT');
 const all=records.map(r=>{const match=r.assignments.length===1?r.assignments[0]:null;let state=!r.assignments.length?'unmapped':r.assignments.length>1?'ambiguous':!match.name?.trim()?'identity_incomplete':'ready';
  if(match&&!batchUuid(match.contractId))batchFailure('PAYROLL_BATCH_DIRECTORY_DRIFT');
  return {number:r.number,contractId:state==='ready'?match.contractId:null,name:match?.name??null,sectorCode:match?.sectorCode??null,sectorLabel:match?.sectorLabel??null,state};
 }).sort((a,b)=>BigInt(a.number)<BigInt(b.number)?-1:BigInt(a.number)>BigInt(b.number)?1:a.number<b.number?-1:a.number>b.number?1:0);
 const filters=Object.fromEntries(['fromNumber','toNumber','fromSector','toSector'].map(k=>[k,q[k]]));
 const selected=all.filter(r=>withinBatchRange(r.number,q.fromNumber,q.toNumber)&&withinBatchRange(r.sectorCode,q.fromSector,q.toSector));
 const sectors=new Map();for(const r of all){if(!r.sectorCode)continue;const old=sectors.get(r.sectorCode);if(old&&old.label!==(r.sectorLabel??'Sin denominación'))batchFailure('PAYROLL_BATCH_SECTOR_AMBIGUOUS');if(old)old.records++;else sectors.set(r.sectorCode,{code:r.sectorCode,label:r.sectorLabel??'Sin denominación',records:1});}
 const dataset={id:meta.id,date:meta.date,period:meta.period,month:meta.month,type:meta.type,closureStatus:meta.closureStatus,payloadHash:meta.payloadHash,sourceHash:meta.sourceHash,rosterHash:roster.reportHash,sourceLabel:meta.sourceLabel};
 const directory={snapshot,cutoff:meta.directoryCutoff};const selectionHash=hash({tenantId:binding.tenantId,dataset,directory,filters,rows:selected});
 if(q.selectionHash&&q.selectionHash!==selectionHash)return deny(409,'PAYROLL_BATCH_SELECTION_CHANGED','Cambió la selección o su fuente. Consultá otra vez antes de descargar.');
 const total=selected.length,pages=Math.max(1,Math.ceil(total/q.limit));if(q.page>pages)return deny(409,'PAYROLL_BATCH_PAGE_CHANGED','La página solicitada ya no pertenece al resultado. Volvé a la primera.');
 const grouping=new Map();for(const r of selected){const code=r.sectorCode??null;if(!grouping.has(code))grouping.set(code,{code,label:r.sectorLabel??'Sin repartición informada',selected:0,eligible:0,review:0});const g=grouping.get(code);g.selected++;g[r.state==='ready'?'eligible':'review']++;}
 const d={version:'payroll-document-batch.v1',tenantId:binding.tenantId,dataset,directory,filters,selectionHash,
 counts:{dataset:roster.total,selected:total,eligible:selected.filter(r=>r.state==='ready').length,review:selected.filter(r=>r.state!=='ready').length,unclassifiedSector:all.filter(r=>!batchNumber(r.sectorCode)).length},
 sectors:[...sectors.values()].sort((a,b)=>a.code<b.code?-1:1),rows:selected.slice((q.page-1)*q.limit,q.page*q.limit),pagination:{page:q.page,limit:q.limit,total,pages},groups:[...grouping.values()].sort((a,b)=>String(a.code).localeCompare(String(b.code))),officialReceipt:false,signatureApplied:false,paymentDate:null,departmentBasis:'certified_directory_cutoff'};
 verifyBatchPreview(d);
 // Reauthorize at the end: source-bound directory reads cannot outlive a payroll-access revocation.
 const final=await readRoster(q.datasetId);if(final.status!==200)return final;
 if(final.payload.data?.found!==true||final.payload.data.reportHash!==roster.reportHash||final.payload.data.payloadHash!==roster.payloadHash)return deny(409,'PAYROLL_BATCH_SELECTION_CHANGED','Los datos cambiaron durante la consulta. Reintentá la selección.');
 return{status:200,payload:{ok:true,data:d}};
}
