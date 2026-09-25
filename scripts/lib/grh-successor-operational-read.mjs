// Preflight de lectura: sellos y dependencias nativas; nunca instala ni publica datos.
import {verifySuccessorPackage,SUCCESSOR_ENTITIES,successorHash} from './grh-successor-package.mjs';
import {stableJson} from './canonical-import.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=code=>{throw Object.assign(new Error(code),{code});};
export const NATIVE_READ_DOMAINS=Object.freeze([
 ['native_employee_registration','source_binding_id','contract_id','created_at'],
 ['employee_family_member','source_binding_id','contract_id','recorded_at'],
 ['school_certificate','source_binding_id','contract_id','recorded_at'],
 ['school_certificate_record','source_binding_id','contract_id','recorded_at'],
 ['action_case','source_binding_id','beneficiary_contract_id','updated_at'],
 ['payroll_fixed_assignment','certified_binding_id','employment_contract_id','updated_at'],
 ['payroll_fixed_novelty','certified_binding_id','employment_contract_id','created_at'],
 ['payroll_novelty_batch','certified_binding_id',null,'updated_at'],
 ['payroll_parameter_proposal','certified_binding_id',null,'updated_at'],
 ['payroll_monthly_close_run','certified_binding_id',null,'updated_at'],
 ['payroll_reprocessing_case','certified_binding_id',null,'updated_at'],
 ['native_employment_catalog_proposal','source_binding_id',null,'created_at'],
 ['native_employment_catalog_review','source_binding_id',null,'reviewed_at']
].map(Object.freeze));
const targetKeys=['projectId','branchId','databaseName','tenantId','bindingId','coreVersionId','curatedVersionId','publicationSha256'];
export function validateSuccessorTarget(value){
 if(!value||Object.keys(value).sort().join('|')!==[...targetKeys].sort().join('|')
   ||!['tenantId','bindingId','coreVersionId','curatedVersionId'].every(k=>uuid(value[k]))||!sha(value.publicationSha256)
   ||![value.projectId,value.branchId].every(v=>typeof v==='string'&&/^[a-z0-9-]{5,80}$/.test(v))
   ||typeof value.databaseName!=='string'||!/^[a-zA-Z0-9_]{1,63}$/.test(value.databaseName))fail('SUCCESSOR_TARGET_INVALID');
 return Object.freeze({...value});
}
const selection=`SELECT p.*,c.source_sha256,c.source_cutoff,c.manifest_sha256 AS core_manifest,c.entity_evidence AS core_evidence,
 s.entity_fingerprints AS core_seals,v.manifest_sha256 AS curated_manifest,v.entity_evidence AS curated_evidence,
 cs.entity_fingerprints AS curated_seals,v.source_sha256 AS curated_source_sha256,v.source_cutoff AS curated_cutoff,
 c.source_database,c.source_company_id,v.id AS curated_version_id,v.source_batch_id AS curated_batch,v.import_run_id AS curated_import
 FROM public.grh_effective_source_binding p
 JOIN public.grh_core_source_version c ON c.id=p.source_version_id AND c.tenant_id=p.tenant_id AND c.source_binding_id=p.source_binding_id
 JOIN public.grh_core_source_version_seal s ON s.version_id=c.id
 JOIN public.grh_curated_source_version v ON v.id=$4::uuid AND v.core_version_id=c.id AND v.tenant_id=p.tenant_id AND v.source_binding_id=p.source_binding_id
 JOIN public.grh_curated_source_version_seal cs ON cs.version_id=v.id
 JOIN public.platform_tenant_source_binding b ON b.id=p.source_binding_id AND b.tenant_id=p.tenant_id
 JOIN public.tenant_identity_policy policy ON policy.tenant_id=b.tenant_id AND policy.certified_source_binding_id=b.id
 WHERE p.tenant_id=$1::uuid AND p.source_binding_id=$2::uuid AND p.source_version_id=$3::uuid AND p.publication_sha256=$5
 AND b.verified AND policy.tenant_data_plane_ready AND b.source_system='GRH' AND b.source_database=c.source_database AND b.source_company_id=c.source_company_id`;
const selectedMeta=`WITH selected AS (${selection}) SELECT to_jsonb(s)||jsonb_build_object(
 'database',current_database(),'project',current_setting('neon.project_id',true),'branch',current_setting('neon.branch_id',true),
 'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),
 'snapshot',txid_current_snapshot()::text,'databaseBytes',pg_database_size(current_database())::text,
 'stagingInstalled',to_regclass('public.grh_successor_stage') IS NOT NULL) AS observation FROM selected s`;
function entitySql(entity){
 const [kind,name]=entity.split('/');if(!SUCCESSOR_ENTITIES.includes(entity))fail('SUCCESSOR_ENTITY_INVALID');
 const reader=kind==='core'?`public.grh_core_source_unsealed_rows_v1(s.source_version_id,'${name}')`:`public.grh_curated_source_unsealed_rows_v1(s.curated_version_id,'${name}')`;
 const key=kind==='core'?'source_id':'row_key';
 const semantic=entity==='core/payrollSnapshot'?"(SELECT count(*) FROM (SELECT 1 FROM proposed GROUP BY record->'company_source_id',record->'employee_number',record->'snapshot_date',record->'source_period',record->'source_month',record->'payroll_type' HAVING count(*)>1) repeated)":'0';
 return `/* successor-preflight:entity:${entity} */ WITH selected AS (${selection}),
 baseline AS MATERIALIZED(SELECT r.${key} AS row_key,r.record FROM selected s CROSS JOIN LATERAL ${reader} r),
 delta AS MATERIALIZED(SELECT * FROM jsonb_to_recordset($6::jsonb) AS d("rowKey" text,operation text,"previousRecord" jsonb,record jsonb)),
 proposed AS(SELECT b.* FROM baseline b WHERE NOT EXISTS(SELECT 1 FROM delta d WHERE d."rowKey"=b.row_key)
 UNION ALL SELECT d."rowKey",d.record FROM delta d WHERE d.operation IN('add','replace'))
 SELECT jsonb_build_object('entity','${entity}',
 'baselineFingerprint',(SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(row_key||record::text),'' ORDER BY row_key),''))) FROM baseline),
 'candidateFingerprint',(SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(row_key||record::text),'' ORDER BY row_key),''))) FROM proposed),
 'duplicateBaseKeys',(SELECT count(*)-count(DISTINCT row_key) FROM baseline),
 'duplicateCandidateKeys',(SELECT count(*)-count(DISTINCT row_key) FROM proposed),
 'unexpectedExistingAdds',(SELECT count(*) FROM delta d JOIN baseline b ON b.row_key=d."rowKey" WHERE d.operation='add'),
 'previousMismatches',(SELECT count(*) FROM delta d LEFT JOIN baseline b ON b.row_key=d."rowKey" WHERE d.operation IN('replace','remove') AND (b.row_key IS NULL OR b.record IS DISTINCT FROM d."previousRecord")),
 'semanticDuplicates',${semantic},'checkedChanges',(SELECT count(*) FROM delta)) AS observation`;
}
function nativeSql([table,binding,contract,time]){
 const intersection=contract?`count(*) FILTER(WHERE r.${contract} IN(SELECT id FROM affected))`:'NULL::bigint';
 return `/* successor-preflight:native:${table} */ WITH selected AS (${selection}),
 affected AS(SELECT c.id FROM public.employment_contract c JOIN selected s ON c.source_batch_id=s.source_batch_id
 WHERE c.source_system='GRH' AND c.legacy_company_id=s.source_company_id AND c.legacy_legajo=ANY($6::text[]))
 SELECT jsonb_build_object('domain','${table}','rows',count(*),'fingerprint',md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')),
 'affectedContractRows',${intersection},'afterPublication',count(*) FILTER(WHERE r.${time}>s.published_at)) AS observation
 FROM public.${table} r JOIN selected s ON r.tenant_id=s.tenant_id AND r.${binding}=s.source_binding_id`;
}
const cohortSql=`/* successor-preflight:cohort */ WITH selected AS (${selection})
 SELECT jsonb_build_object('rows',count(*),'fingerprint',md5(coalesce(string_agg(md5(to_jsonb(c)::text),'' ORDER BY c.id),'')),
 'otherBatches',count(*) FILTER(WHERE c.source_batch_id<>s.source_batch_id),
 'afterPublication',count(*) FILTER(WHERE c.updated_at>s.published_at),
 'affectedContracts',count(*) FILTER(WHERE c.legacy_legajo=ANY($6::text[]))) AS observation
 FROM public.employment_contract c JOIN selected s ON c.source_system='GRH' AND c.legacy_company_id=s.source_company_id`;
const plans=new WeakMap();
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function planSuccessorOperationalRead(packageInput,targetInput){
 const pack=verifySuccessorPackage(structuredClone(packageInput)),target=validateSuccessorTarget(targetInput);
 const values=[target.tenantId,target.bindingId,target.coreVersionId,target.curatedVersionId,target.publicationSha256];
 const affected=[...new Set(pack.changes.flatMap(c=>[c.previousRecord,c.record].filter(Boolean).map(r=>r.employee_number??r.legajo).filter(v=>typeof v==='string')))].sort();
 if(affected.length>10000)fail('SUCCESSOR_AFFECTED_SCOPE_LIMIT');
 const queries=[{tag:'metadata',text:selectedMeta,values}];
 for(const entity of SUCCESSOR_ENTITIES){
  const changes=pack.changes.filter(c=>c.entity===entity).map(c=>({rowKey:c.rowKey,operation:c.operation,previousRecord:c.previousRecord,record:c.record}));
  queries.push({tag:entity,text:entitySql(entity),values:[...values,JSON.stringify(changes)]});
 }
 queries.push({tag:'cohort',text:cohortSql,values:[...values,affected]});
 for(const domain of NATIVE_READ_DOMAINS)queries.push({tag:domain[0],text:nativeSql(domain),values:[...values,affected]});
 queries.push({tag:'metadata-end',text:selectedMeta,values});
 const plan=freeze({version:'grh-successor-operational-read-plan.v1',queries,options:{readOnly:true,isolationLevel:'RepeatableRead'}});
 plans.set(plan,{pack,target,affectedCount:affected.length});return plan;
}
const asCount=v=>Number.isSafeInteger(v)&&v>=0;
const sqlFingerprint=v=>v&&asCount(v.rows)&&typeof v.md5==='string'&&/^[a-f0-9]{32}$/.test(v.md5);
const civilTime=v=>typeof v==='string'?v.slice(0,19).replace(' ','T'):null;
export function evaluateSuccessorOperationalRead(plan,results){
 const context=plans.get(plan);if(!context||!Array.isArray(results)||results.length!==plan.queries.length)fail('SUCCESSOR_READ_RESULT_INVALID');
 const {pack,target}=context;
 const observations=results.map(rows=>{if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.observation)fail('SUCCESSOR_READ_INCOMPLETE');return rows[0].observation;});
 const first=observations[0],last=observations.at(-1);
 for(const m of [first,last]){
  if(m.project!==target.projectId||m.branch!==target.branchId||m.database!==target.databaseName||m.readOnly!=='on'||m.isolation!=='repeatable read')fail('SUCCESSOR_READ_TARGET_MISMATCH');
  if(m.tenant_id!==target.tenantId||m.source_binding_id!==target.bindingId||m.source_version_id!==target.coreVersionId
   ||m.curated_version_id!==target.curatedVersionId||m.publication_sha256!==target.publicationSha256
   ||m.curated_batch!==m.source_batch_id||String(m.curated_import)!==String(m.import_run_id))fail('SUCCESSOR_READ_SELECTION_MISMATCH');
  if(m.source_sha256!==pack.baseline.sourceSha256||m.curated_source_sha256!==pack.baseline.sourceSha256
   ||civilTime(m.source_cutoff)!==pack.baseline.cutoff||civilTime(m.curated_cutoff)!==pack.baseline.cutoff
   ||String(m.source_company_id)!=='101'||m.source_database!=='grh_junin')fail('SUCCESSOR_READ_SOURCE_MISMATCH');
  if(!uuid(m.source_batch_id)||!sha(m.core_manifest)||!sha(m.curated_manifest)||typeof m.snapshot!=='string')fail('SUCCESSOR_READ_RESULT_INVALID');
 }
 const ignoreSize=m=>Object.fromEntries(Object.entries(m).filter(([k])=>k!=='databaseBytes'));
 if(stableJson(ignoreSize(first))!==stableJson(ignoreSize(last)))fail('SUCCESSOR_READ_SNAPSHOT_CHANGED');
 const findings=[],entities={};let index=1;
 for(const entity of SUCCESSOR_ENTITIES){
  const r=observations[index++],[kind,name]=entity.split('/'),expected=pack.entities[entity];
  if(r.entity!==entity||!sqlFingerprint(r.baselineFingerprint)||!sqlFingerprint(r.candidateFingerprint)
   ||!['duplicateBaseKeys','duplicateCandidateKeys','unexpectedExistingAdds','previousMismatches','semanticDuplicates','checkedChanges'].every(k=>asCount(r[k])))fail('SUCCESSOR_READ_RESULT_INVALID');
  const attestation=first[kind+'_evidence']?.[name],seal=first[kind+'_seals']?.[name];
  const projectionMatches=attestation?.candidateProjectionSha256===expected.baseline.sha256&&attestation?.counts?.candidate===expected.baseline.rows;
  const sealMatches=sqlFingerprint(seal)&&stableJson(seal)===stableJson(r.baselineFingerprint);
  const changes=Object.values(expected.changes).reduce((a,b)=>a+b,0);
  const compatible=projectionMatches&&sealMatches&&r.baselineFingerprint.rows===expected.baseline.rows&&r.candidateFingerprint.rows===expected.candidate.rows
   &&r.checkedChanges===changes&&(changes>0||stableJson(r.baselineFingerprint)===stableJson(r.candidateFingerprint))
   &&[r.duplicateBaseKeys,r.duplicateCandidateKeys,r.unexpectedExistingAdds,r.previousMismatches,r.semanticDuplicates].every(n=>n===0);
  if(!compatible)findings.push({domain:entity,code:'BASELINE_OR_DELTA_MISMATCH'});
  entities[entity]={projectionMatches,sealMatches,compatible,checkedChanges:r.checkedChanges,
   previousMismatches:r.previousMismatches,unexpectedExistingAdds:r.unexpectedExistingAdds,semanticDuplicates:r.semanticDuplicates,
   baselineFingerprint:{rows:r.baselineFingerprint.rows,md5:r.baselineFingerprint.md5},candidateFingerprint:{rows:r.candidateFingerprint.rows,md5:r.candidateFingerprint.md5}};
 }
 const cohort=observations[index++];
 if(!['rows','otherBatches','afterPublication','affectedContracts'].every(k=>asCount(cohort[k]))||!/^[a-f0-9]{32}$/.test(cohort.fingerprint??''))fail('SUCCESSOR_READ_RESULT_INVALID');
 if(cohort.otherBatches||cohort.rows!==pack.entities['core/employmentReconciliation'].baseline.rows)findings.push({domain:'employment_contract',code:'COHORT_MISMATCH'});
 const native={};let nativeReviewRequired=cohort.afterPublication>0;
 for(const [domain,,contract]of NATIVE_READ_DOMAINS){
  const r=observations[index++];
  if(r.domain!==domain||!asCount(r.rows)||!asCount(r.afterPublication)||r.afterPublication>r.rows
   ||!/^[a-f0-9]{32}$/.test(r.fingerprint??'')||(contract?(!asCount(r.affectedContractRows)||r.affectedContractRows>r.rows):r.affectedContractRows!==null))fail('SUCCESSOR_READ_RESULT_INVALID');
  const review=contract?r.affectedContractRows>0:r.rows>0;if(review)nativeReviewRequired=true;
  native[domain]={rows:r.rows,fingerprint:r.fingerprint,affectedContractRows:r.affectedContractRows,afterPublication:r.afterPublication,reviewRequired:review};
 }
 const report={version:'grh-successor-operational-preflight.v1',target,packageSha256:pack.payloadSha256,
  baselineSourceSha256:pack.baseline.sourceSha256,candidateSourceSha256:pack.candidate.sourceSha256,sourceCutoff:pack.baseline.cutoff,
  snapshot:first.snapshot,sourceBatchId:first.source_batch_id,importRunId:String(first.import_run_id),
  baselineCompatible:findings.length===0,findings,entities,affectedSourceReferences:context.affectedCount,
  manifests:{coreExact:first.core_manifest===pack.baseline.coreManifestSha256,curatedExact:first.curated_manifest===pack.baseline.curatedManifestSha256,
   coreStored:first.core_manifest,coreCompared:pack.baseline.coreManifestSha256},
  cohort:{rows:cohort.rows,otherBatches:cohort.otherBatches,afterPublication:cohort.afterPublication,affectedContracts:cohort.affectedContracts,fingerprint:cohort.fingerprint},native,
  nativeReviewRequired,nativeConflictsResolved:false,stagingInstalled:first.stagingInstalled===true,
  databaseBytes:String(first.databaseBytes),readOnly:true,writeStatements:0,operationalSourceChanged:false,
  stagingLoadAuthorized:false,publicationAuthorized:false,capacityCertified:false,restorationTested:false,containsPersonalRecords:false};
 if(!/^\d{1,16}$/.test(report.databaseBytes)||!/^\d+:\d+:(?:\d+(?:,\d+)*)?$/.test(report.snapshot))fail('SUCCESSOR_READ_RESULT_INVALID');
 return freeze({...report,reportSha256:successorHash(stableJson(report))});
}
