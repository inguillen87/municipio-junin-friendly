import {employeeContext} from './internal-native-employees.js';
import {AdoptionReviewError,ADOPTION_REVIEW_MAX_ROWS,sealAdoptionReview,verifiedAdoptionReview} from '../assets/employment-adoption-review-model.js';

// One authenticated statement and snapshot. Reads installed facts, never the backup.
export const ADOPTION_REVIEW_SQL=`WITH authority AS MATERIALIZED (SELECT public.native_employee_context_v1($1::jsonb) AS ctx),
selected AS MATERIALIZED (
 SELECT a.ctx,b.source_batch_id,b.source_version_id,b.publication_sha256,c.baseline_batch_id AS core_baseline,
 c.source_sha256,c.manifest_sha256,c.source_cutoff,v.id AS curated_id,v.baseline_batch_id AS curated_baseline,v.manifest_sha256 AS curated_manifest
 FROM authority a JOIN public.grh_effective_source_binding b ON b.tenant_id=(a.ctx->>'tenantId')::uuid AND b.source_binding_id=(a.ctx->>'sourceBindingId')::uuid
 JOIN public.grh_core_source_version c ON c.id=b.source_version_id AND c.tenant_id=b.tenant_id AND c.source_binding_id=b.source_binding_id AND c.source_company_id=(a.ctx->>'sourceCompanyId')::bigint
 JOIN public.grh_curated_source_version v ON v.core_version_id=c.id AND v.tenant_id=b.tenant_id AND v.source_binding_id=b.source_binding_id AND v.source_batch_id=b.source_batch_id AND v.import_run_id=b.import_run_id
), cohort AS MATERIALIZED (
 SELECT c.*,count(*) FILTER(WHERE c.status='active') OVER(PARTITION BY c.person_id) AS active_person_contracts
 FROM public.employment_contract c JOIN selected s ON c.legacy_company_id=(s.ctx->>'sourceCompanyId')::bigint
 AND c.source_system='GRH' AND c.tenant_id IS NULL AND c.source_batch_id IN(s.source_batch_id,s.core_baseline,s.curated_baseline)
), numbered AS MATERIALIZED (
 SELECT row_number() OVER(ORDER BY c.id) AS "rowNumber",c.id::text AS "contractId",c.legacy_legajo AS legajo,p.full_name AS name,c.status,
 to_char(c.start_date,'YYYY-MM-DD') AS "startDate",to_char(c.end_date,'YYYY-MM-DD') AS "endDate",c.agreement_code AS "agreementCode",c.category_code AS "categoryCode",
 c.organization_unit_source_id AS "organizationId",c.sector_source_id AS "sectorCode",c.jurisdiction_code AS "jurisdictionCode",c.active_person_contracts AS "activeContractsForPerson"
 FROM cohort c LEFT JOIN public.person_identity p ON p.id=c.person_id
), limited AS (SELECT * FROM numbered ORDER BY "rowNumber" LIMIT $2)
SELECT jsonb_build_object('scope',jsonb_build_object('tenantId',s.ctx->>'tenantId','membershipId',s.ctx->>'membershipId','bindingId',s.ctx->>'sourceBindingId','companyId',(s.ctx->>'sourceCompanyId')::bigint),
 'source',jsonb_build_object('coreVersionId',s.source_version_id,'curatedVersionId',s.curated_id,'sourceBatchId',s.source_batch_id,'coreBaselineBatchId',s.core_baseline,'curatedBaselineBatchId',s.curated_baseline,
 'sourceSha256',s.source_sha256,'coreManifestSha256',s.manifest_sha256,'curatedManifestSha256',s.curated_manifest,'publicationSha256',s.publication_sha256,'cutoff',to_char(s.source_cutoff,'YYYY-MM-DD"T"HH24:MI:SS')),
 'today',to_char((statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date,'YYYY-MM-DD'),'queriedAt',statement_timestamp(),
 'total',(SELECT count(*) FROM cohort),'rows',COALESCE((SELECT jsonb_agg(to_jsonb(limited) ORDER BY "rowNumber") FROM limited),'[]'::jsonb)) AS result FROM selected s`;

export async function internalAdoptionReview(sql,req,principal,session){
 if(Object.keys(req.query??{}).some(k=>k!=='resource')||Object.values(req.query??{}).some(v=>typeof v!=='string')||req.url&&new URL(req.url,'http://local.invalid').searchParams.size!==Object.keys(req.query??{}).length)throw new AdoptionReviewError('La revisión requiere el padrón completo, sin filtros de búsqueda.',400,'ADOPTION_REVIEW_QUERY_INVALID');
 let context;try{context=employeeContext(principal,session);}catch{throw new AdoptionReviewError('La sesión operativa venció. Ingresá nuevamente.',401,'ADOPTION_REVIEW_SESSION_INVALID');}
 if(!principal.tenant.effectiveCapabilities?.includes('workforce.employee.read'))throw new AdoptionReviewError('Tu cuenta no permite revisar el padrón.',403,'ADOPTION_REVIEW_FORBIDDEN');
 let results;try{results=await sql.query(ADOPTION_REVIEW_SQL,[JSON.stringify(context),ADOPTION_REVIEW_MAX_ROWS+1]);}catch(e){
  if(/NATIVE_EMPLOYEE_FORBIDDEN/.test(e?.message??''))throw new AdoptionReviewError('Se retiró el permiso para revisar el padrón.',403,'ADOPTION_REVIEW_FORBIDDEN');
  if(/NATIVE_EMPLOYEE_SESSION_INVALID|ACTION_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(e?.message??''))throw new AdoptionReviewError('La sesión operativa venció. Ingresá nuevamente.',401,'ADOPTION_REVIEW_SESSION_INVALID');
  if(/NATIVE_EMPLOYEE_BINDING_INVALID/.test(e?.message??''))throw new AdoptionReviewError('Cambió el ámbito municipal. Consultá nuevamente.',409,'ADOPTION_REVIEW_SCOPE_CHANGED');throw e;
 }
 if(!Array.isArray(results)||results.length!==1||results[0]?.result?.scope?.tenantId!==context.tenantId||results[0]?.result?.scope?.membershipId!==context.membershipId)throw new AdoptionReviewError();
 const data=await verifiedAdoptionReview(await sealAdoptionReview(results[0].result));return {status:200,payload:{ok:true,data}};
}
