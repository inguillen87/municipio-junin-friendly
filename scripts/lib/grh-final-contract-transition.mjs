// Private comparison against a complete sealed final cut. No adoption or mutation.
import {createHash} from 'node:crypto';
import {bindFinalSourceConsumersWithinTransaction} from './grh-final-source-consumers.mjs';
import {SUCCESSOR_ENTITIES} from './grh-successor-package.mjs';
import {stableJson} from './canonical-import.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const preparedReviews=new WeakSet();
export const FINAL_CONTRACT_TRANSITION_LIMIT=10000;
export const FINAL_CONTRACT_TRANSITION_ISSUES=Object.freeze(['SOURCE_KEY_INVALID','CONTRACT_NOT_FOUND',
 'CONTRACT_AMBIGUOUS','CONTRACT_SCOPE_CONFLICT','PERSON_LINK_MISSING','PERSON_LINK_AMBIGUOUS',
 'CORE_RECORD_MISSING','CORE_RECORD_AMBIGUOUS','ACTIVE_STATE_CONFLICT','SOURCE_FACTS_MISSING',
 'START_DATE_MISSING','DATE_INVALID','PERIOD_INVALID','STATUS_DATE_CONFLICT','CLASSIFICATION_MISSING',
 'JURISDICTION_MISSING_ACTIVE','JURISDICTION_UNKNOWN','JURISDICTION_CONFLICT','PERSON_FACTS_CHANGED']);

// PostgreSQL owns the projection: JSONB quantities and original person IDs never
// pass through JSON.parse/Number. Natural keys and the original person crosswalk
// are required; a matching DNI or a generated UUID is not an identity link.
const sourceSql=`WITH revision AS MATERIALIZED (
 SELECT r.*,selected.source_batch_id,c.baseline_batch_id AS core_baseline_batch_id,
 v.baseline_batch_id AS curated_baseline_batch_id
 FROM public.grh_final_source_revision r
 JOIN public.grh_effective_source_binding selected ON selected.tenant_id=r.tenant_id
  AND selected.source_binding_id=r.source_binding_id AND selected.source_version_id=r.parent_core_version_id
  AND selected.publication_sha256=r.parent_publication_sha256
 JOIN public.grh_core_source_version c ON c.id=r.parent_core_version_id
 JOIN public.grh_curated_source_version v ON v.id=r.parent_curated_version_id AND v.core_version_id=c.id
 WHERE r.id=$1::uuid),employees AS MATERIALIZED (
 SELECT row_key,record,record->>'company_id' AS company,record->>'legajo' AS legajo
 FROM public.grh_final_source_rows_v1($1::uuid,'curated/grh_employees')),core AS MATERIALIZED (
 SELECT row_key,record,record->>'company_source_id' AS company,record->>'employee_number' AS legajo
 FROM public.grh_final_source_rows_v1($1::uuid,'core/employmentReconciliation')),existing AS MATERIALIZED (
 SELECT ec.* FROM public.employment_contract ec,revision r
 WHERE ec.source_system='GRH' AND ec.tenant_id IS NULL AND ec.legacy_company_id::text=$2
 AND ec.source_batch_id IN(r.source_batch_id,r.core_baseline_batch_id,r.curated_baseline_batch_id))`;
export const FINAL_CONTRACT_TRANSITION_COHORT_SQL=`/* final-contract-transition:cohort */ ${sourceSql}
 SELECT (SELECT count(*)::integer FROM employees) AS candidate_rows,
 (SELECT count(*)::integer FROM core) AS core_rows,
 (SELECT count(*)::integer FROM existing) AS existing_rows,
 (SELECT count(*)::integer FROM employees e WHERE NOT EXISTS(SELECT 1 FROM core c WHERE (c.company,c.legajo)=(e.company,e.legajo))) AS missing_core_keys,
 (SELECT count(*)::integer FROM core c WHERE NOT EXISTS(SELECT 1 FROM employees e WHERE (e.company,e.legajo)=(c.company,c.legajo))) AS extra_core_keys,
 (SELECT count(*)::integer FROM (SELECT company,legajo FROM employees GROUP BY 1,2 HAVING count(*)>1) d) AS duplicate_candidate_keys,
 (SELECT count(*)::integer FROM (SELECT company,legajo FROM core GROUP BY 1,2 HAVING count(*)>1) d) AS duplicate_core_keys,
 (SELECT count(*)::integer FROM existing c WHERE NOT EXISTS(SELECT 1 FROM employees e WHERE (e.company,e.legajo)=(c.legacy_company_id::text,c.legacy_legajo))) AS missing_existing_keys,
 (SELECT count(*)::integer FROM employees WHERE company IS DISTINCT FROM $2) AS foreign_company_rows`;
export const FINAL_CONTRACT_TRANSITION_ROWS_SQL=`/* final-contract-transition:rows */ ${sourceSql},linked AS (
 SELECT e.*,ec.n AS contract_count,ec.id AS contract_id,ec.person_id,
 ec.before_contract,p.id AS existing_person_id,to_jsonb(p) AS before_person,
 ec.allowed AS contract_allowed,x.n AS person_links,x.all_links AS all_person_links,
 cr.n AS core_count,cr.record AS core_record,
 e.record#>>'{source_payload,sourceFields,iddepartamento}' AS department_id,
 e.record#>>'{source_payload,sourceReferences,department,sourceFields,nombre}' AS department_name,
 e.record->>'fecha_ingreso' AS start_text,e.record->>'fecha_egreso' AS end_text
 FROM employees e CROSS JOIN revision r
 LEFT JOIN LATERAL (SELECT count(*)::integer AS n,
  (array_agg(c.id ORDER BY c.id))[1] AS id,(array_agg(c.person_id ORDER BY c.id))[1] AS person_id,
  (array_agg(to_jsonb(c) ORDER BY c.id))[1] AS before_contract,
  bool_and(c.source_system='GRH' AND c.tenant_id IS NULL
   AND c.source_batch_id IN(r.source_batch_id,r.core_baseline_batch_id,r.curated_baseline_batch_id)) AS allowed
  FROM public.employment_contract c WHERE c.legacy_company_id::text=e.company AND c.legacy_legajo=e.legajo) ec ON true
 LEFT JOIN public.person_identity p ON p.id=ec.person_id
 LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE sx.canonical_entity='person_identity' AND sx.canonical_id=p.id
   AND sx.source_batch_id IN(r.source_batch_id,r.core_baseline_batch_id,r.curated_baseline_batch_id))::integer AS n,
  count(*)::integer AS all_links FROM public.source_xref sx
  WHERE sx.source_system='GRH' AND sx.source_entity='persona' AND sx.source_id=e.record->>'person_id' AND sx.valid_to IS NULL) x ON true
 LEFT JOIN LATERAL (SELECT count(*)::integer AS n,(array_agg(c.record ORDER BY c.row_key))[1] AS record
  FROM core c WHERE (c.company,c.legajo)=(e.company,e.legajo)) cr ON true),facts AS (
 SELECT *,CASE WHEN department_id='1' AND department_name='042' THEN '42'
  WHEN department_id='2' AND department_name='055' THEN '55' END AS jurisdiction,
 coalesce(record#>>'{source_payload,sourceReferences,department,table}'='departamento'
  AND record#>>'{source_payload,sourceReferences,department,primaryKey,iddepartamento}'=department_id,false) AS department_link,
 coalesce(record#>>'{source_payload,sourceProvenance,table}'='legajo'
  AND btrim(record#>>'{source_payload,sourceProvenance,primaryKey,CODI_01}')=company
  AND btrim(record#>>'{source_payload,sourceProvenance,primaryKey,LEGA_12}')=legajo
  AND record#>>'{source_payload,sourceKey,companyCode}'=company
  AND record#>>'{source_payload,sourceKey,employeeNumber}'=legajo,false) AS original_key,
 start_text IS NULL OR start_text~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND left(start_text,4) BETWEEN '1900' AND '2100'
  AND pg_input_is_valid(start_text,'date') AS valid_start,
 end_text IS NULL OR end_text~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND left(end_text,4) BETWEEN '1900' AND '2100'
  AND pg_input_is_valid(end_text,'date') AS valid_end
 FROM linked)
 SELECT row_key,CASE WHEN contract_count=1 THEN contract_id::text END AS contract_id,
 CASE WHEN contract_count=1 THEN person_id::text END AS person_id,record::text AS source_record_json,
 CASE WHEN contract_count=1 THEN jsonb_build_object('contract',before_contract,'person',before_person)::text END AS previous_facts_json,
 jsonb_build_object('startDate',record->'fecha_ingreso','endDate',record->'fecha_egreso',
  'active',record->'activo','agreementCode',record->'convenio_code','categoryCode',record->'categoria_code',
  'organizationId',record#>'{source_payload,employment,organizationId}',
  'positionCode',record->'cargo_code','sectorCode',record->'sector_code',
  'jurisdictionCode',CASE WHEN department_link THEN jurisdiction END,
  'identity',jsonb_build_object('sourcePersonId',record->'person_id','name',record->'nombre',
    'dni',record->'dni','cuil',record->'cuil','birthDate',record->'fecha_nacimiento','sex',record->'sexo'),
  'sourcePayload',record->'source_payload','reconciliation',core_record)::text AS candidate_facts_json,
 array_remove(ARRAY[
  CASE WHEN company IS DISTINCT FROM $2 OR nullif(legajo,'') IS NULL OR NOT original_key THEN 'SOURCE_KEY_INVALID' END,
  CASE WHEN contract_count=0 THEN 'CONTRACT_NOT_FOUND' WHEN contract_count>1 THEN 'CONTRACT_AMBIGUOUS' END,
  CASE WHEN contract_count=1 AND contract_allowed IS NOT TRUE THEN 'CONTRACT_SCOPE_CONFLICT' END,
  CASE WHEN contract_count=1 AND (existing_person_id IS NULL OR person_links=0) THEN 'PERSON_LINK_MISSING' END,
  CASE WHEN all_person_links>1 OR person_links>1 THEN 'PERSON_LINK_AMBIGUOUS' END,
  CASE WHEN core_count=0 THEN 'CORE_RECORD_MISSING' WHEN core_count>1 THEN 'CORE_RECORD_AMBIGUOUS' END,
  CASE WHEN jsonb_typeof(record->'activo') IS DISTINCT FROM 'boolean'
   OR record->'activo' IS DISTINCT FROM record#>'{source_payload,employment,activeProxy}' OR core_count=1
   AND record->'activo' IS DISTINCT FROM core_record->'administrative_active' THEN 'ACTIVE_STATE_CONFLICT' END,
  CASE WHEN NOT original_key OR jsonb_typeof(record#>'{source_payload,sourceFields}') IS DISTINCT FROM 'object'
   THEN 'SOURCE_FACTS_MISSING' END,
  CASE WHEN start_text IS NULL THEN 'START_DATE_MISSING' END,
  CASE WHEN NOT valid_start OR NOT valid_end THEN 'DATE_INVALID' END,
  CASE WHEN valid_start AND valid_end AND end_text<start_text THEN 'PERIOD_INVALID' END,
  CASE WHEN record->'activo'='true'::jsonb AND end_text IS NOT NULL
   OR record->'activo'='false'::jsonb AND end_text IS NULL THEN 'STATUS_DATE_CONFLICT' END,
  CASE WHEN nullif(record->>'convenio_code','') IS NULL OR nullif(record->>'categoria_code','') IS NULL
   THEN 'CLASSIFICATION_MISSING' END,
  CASE WHEN record->'activo'='true'::jsonb AND department_id IS NULL THEN 'JURISDICTION_MISSING_ACTIVE' END,
  CASE WHEN department_id IS NOT NULL AND (NOT department_link OR jurisdiction IS NULL) THEN 'JURISDICTION_UNKNOWN' END,
  CASE WHEN contract_count=1 AND before_contract->>'jurisdiction_code' IS NOT NULL
   AND before_contract->>'jurisdiction_code' IS DISTINCT FROM CASE WHEN department_link THEN jurisdiction END
   THEN 'JURISDICTION_CONFLICT' END,
  CASE WHEN contract_count=1 AND existing_person_id IS NOT NULL AND (
   record->'nombre' IS DISTINCT FROM before_person->'full_name' OR record->'dni' IS DISTINCT FROM before_person->'dni'
   OR record->'cuil' IS DISTINCT FROM before_person->'cuil' OR record->'fecha_nacimiento' IS DISTINCT FROM before_person->'birth_date'
   OR record->'sexo' IS DISTINCT FROM before_person->'sex_code') THEN 'PERSON_FACTS_CHANGED' END
 ],NULL)::text[] AS issues FROM facts ORDER BY row_key`;

export async function prepareFinalContractTransitionWithinTransaction(input={}){
 const reader=await bindFinalSourceConsumersWithinTransaction(input),{client,signal}=input;
 if(reader.context.fingerprints['curated/grh_employees'].rows>FINAL_CONTRACT_TRANSITION_LIMIT)fail('GRH_FINAL_TRANSITION_GLOBAL_LIMIT');
 const originalRows=new Map();
 for(const entity of SUCCESSOR_ENTITIES){
  if(entity==='curated/grh_employees')for await(const row of reader.readRows(entity,{pageSize:1000}))
   originalRows.set(row.rowKey,row.recordJson);
  else await reader.verifyEntity(entity);
 }
 const sourceReceipt=await reader.assertComplete();
 const values=[reader.context.revision_id,reader.context.source_company_id];
 const query=async sql=>{signal?.throwIfAborted();const r=await client.query(sql,values);signal?.throwIfAborted();return r.rows;};
 const cohortRows=await query(FINAL_CONTRACT_TRANSITION_COHORT_SQL);
 const cohortFields=['candidate_rows','core_rows','existing_rows','missing_core_keys','extra_core_keys',
  'duplicate_candidate_keys','duplicate_core_keys','missing_existing_keys','foreign_company_rows'];
 const cohort=cohortRows?.[0];
 if(cohortRows?.length!==1||!cohort||Object.keys(cohort).length!==cohortFields.length
  ||cohortFields.some(k=>!Number.isSafeInteger(cohort[k])||cohort[k]<0)
  ||cohort.candidate_rows!==originalRows.size||cohort.core_rows!==sourceReceipt.counts['core/employmentReconciliation'])fail('GRH_FINAL_TRANSITION_COHORT');
 const rows=await query(FINAL_CONTRACT_TRANSITION_ROWS_SQL),seen=new Set(),contracts=new Set();let previousKey=null;
 if(!Array.isArray(rows)||rows.length!==originalRows.size)fail('GRH_FINAL_TRANSITION_INCOMPLETE');
 const fields=['row_key','contract_id','person_id','source_record_json','previous_facts_json','candidate_facts_json','issues'];
 const json=v=>typeof v==='string'&&v.startsWith('{')&&v.endsWith('}')&&Buffer.byteLength(v,'utf8')<=33554432;
 for(const row of rows){
  if(!row||Object.keys(row).length!==fields.length||fields.some(k=>!Object.hasOwn(row,k))
   ||!sha(row.row_key)||seen.has(row.row_key)||previousKey!==null&&row.row_key<=previousKey
   ||row.source_record_json!==originalRows.get(row.row_key)
   ||!json(row.candidate_facts_json)||row.contract_id!==null&&!uuid(row.contract_id)
   ||row.person_id!==null&&!uuid(row.person_id)||row.previous_facts_json!==null&&!json(row.previous_facts_json)
   ||!Array.isArray(row.issues)||new Set(row.issues).size!==row.issues.length
   ||row.issues.some(code=>!FINAL_CONTRACT_TRANSITION_ISSUES.includes(code))
   ||(row.contract_id===null)!==(row.person_id===null)||(row.contract_id===null)!==(row.previous_facts_json===null))fail('GRH_FINAL_TRANSITION_ROW');
  seen.add(row.row_key);previousKey=row.row_key;
  if(row.contract_id!==null){if(contracts.has(row.contract_id))fail('GRH_FINAL_TRANSITION_CONTRACT_REPEATED');contracts.add(row.contract_id);}
 }
 await reader.assertComplete();
 const globalIssues=['missing_core_keys','extra_core_keys','duplicate_candidate_keys','duplicate_core_keys',
  'missing_existing_keys','foreign_company_rows'].filter(k=>cohort[k]>0);
 const issueCounts=Object.fromEntries(FINAL_CONTRACT_TRANSITION_ISSUES.map(code=>[code,rows.filter(r=>r.issues.includes(code)).length]));
 const reviewRows=rows.map((r,i)=>({rowNumber:i+1,...r,factsSha256:hash(stableJson(r))}));
 const factsSha256=hash(stableJson({contextSha256:sourceReceipt.contextSha256,cohort,
  rows:reviewRows.map(r=>[r.row_key,r.factsSha256])}));
 const result=freeze({version:'grh-final-contract-transition.v1',sourceReceipt,context:reader.context,cohort,
  factsSha256,globalIssues,issueCounts,rows:reviewRows,
  reviewRequired:globalIssues.length>0||reviewRows.some(r=>r.issues.length>0),
  preparationOnly:true,sourceSelected:false,contractsApplied:0,municipalWrites:0});
 preparedReviews.add(result);return result;
}

/** The maintenance console gets counts and hashes only, never private facts. */
export function summarizeFinalContractTransition(review){
 if(!preparedReviews.has(review)||review?.version!=='grh-final-contract-transition.v1'||review.preparationOnly!==true
  ||review.sourceSelected!==false||review.contractsApplied!==0||review.municipalWrites!==0)fail('GRH_FINAL_TRANSITION_RECEIPT');
 return freeze({version:review.version,contextSha256:review.sourceReceipt.contextSha256,
  factsSha256:review.factsSha256,cohort:review.cohort,globalIssues:review.globalIssues,issueCounts:review.issueCounts,
  reviewRequired:review.reviewRequired,preparationOnly:true,sourceSelected:false,contractsApplied:0,municipalWrites:0});
}
