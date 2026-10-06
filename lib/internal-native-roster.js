import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {nativeRoster,nativeRosterFilters,NativeRosterError,MAX_NATIVE_ROSTER_ROWS} from '../assets/native-roster-model.js';
import {readNativeDirectorySnapshot} from './internal-native-employee-read.js';

// A single read statement uses the existing native session/binding validator.
// No GRH views, identity resolution, write function, migration or new privileges.
export const NATIVE_ROSTER_SQL=`
WITH authority AS MATERIALIZED (SELECT public.native_employee_context_v1($1::jsonb) AS ctx),
clock AS (SELECT to_char((statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date,'YYYY-MM-DD') AS today),
directory AS MATERIALIZED (
 SELECT c.id::text AS "contractId", r.id::text AS "registrationId", c.person_id::text AS "personId",
 c.legacy_legajo AS legajo, p.full_name AS name,p.dni,p.cuil,p.sex_code AS "sexCode",to_char(p.birth_date,'YYYY-MM-DD') AS "birthDate",
 lifecycle.data->>'startDate' AS "startDate",lifecycle.data->>'endDate' AS "endDate",
 lifecycle.data->>'status' AS status,
 c.jurisdiction_code AS "jurisdictionCode",c.source_payload#>>'{employment,agreementName}' AS agreement,
 c.source_payload#>>'{employment,categoryName}' AS category,c.source_payload#>>'{employment,organizationName}' AS organization,
 c.source_payload#>>'{employment,sectorName}' AS sector,c.source_payload#>>'{employment,cargoName}' AS "jobTitle",
 r.legal_reference AS "legalReference",r.created_at AS "registeredAt"
 FROM authority CROSS JOIN clock JOIN employment_contract c ON c.tenant_id=(authority.ctx->>'tenantId')::uuid
 AND c.legacy_company_id=(authority.ctx->>'sourceCompanyId')::bigint AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL
 JOIN native_employee_registration r ON r.contract_id=c.id AND r.person_id=c.person_id AND r.tenant_id=c.tenant_id
 AND r.source_binding_id=(authority.ctx->>'sourceBindingId')::uuid
 JOIN person_identity p ON p.id=c.person_id
 CROSS JOIN LATERAL (SELECT public.native_employment_lifecycle_projection_v1($1::jsonb,c.id) AS data) lifecycle
), filtered AS MATERIALIZED (
 SELECT * FROM directory WHERE ($2='all' OR status=$2)
 AND ($3='' OR ($3='not_reported' AND "jurisdictionCode" IS NULL) OR "jurisdictionCode"=$3)
 AND ($4='' OR organization=$4) AND ($5='' OR sector=$5) AND ($6='' OR agreement=$6)
 AND ($7='' OR name ILIKE $7 ESCAPE chr(92) OR legajo ILIKE $7 ESCAPE chr(92) OR dni ILIKE $7 ESCAPE chr(92) OR cuil ILIKE $7 ESCAPE chr(92))
), limited AS (SELECT * FROM filtered ORDER BY name COLLATE "C",legajo,"contractId" LIMIT $8),
facets AS (SELECT jsonb_build_object(
 'organization',COALESCE(jsonb_agg(DISTINCT organization ORDER BY organization) FILTER(WHERE organization IS NOT NULL AND organization<>''),'[]'::jsonb),
 'sector',COALESCE(jsonb_agg(DISTINCT sector ORDER BY sector) FILTER(WHERE sector IS NOT NULL AND sector<>''),'[]'::jsonb),
 'agreement',COALESCE(jsonb_agg(DISTINCT agreement ORDER BY agreement) FILTER(WHERE agreement IS NOT NULL AND agreement<>''),'[]'::jsonb)) AS data FROM directory)
SELECT jsonb_build_object('scope',jsonb_build_object('tenantId',authority.ctx->>'tenantId','membershipId',authority.ctx->>'membershipId',
 'bindingId',authority.ctx->>'sourceBindingId','companyId',(authority.ctx->>'sourceCompanyId')::bigint),
 'today',clock.today,'queriedAt',statement_timestamp(),'total',(SELECT count(*) FROM filtered),'people',(SELECT count(DISTINCT "personId") FROM filtered),
 'counts',(SELECT jsonb_build_object('active',count(*) FILTER(WHERE status='active'),'pending_start',count(*) FILTER(WHERE status='pending_start'),
 'inactive',count(*) FILTER(WHERE status='inactive'),'state_error',count(*) FILTER(WHERE status='state_error')) FROM filtered),
 'facets',facets.data,'rows',COALESCE((SELECT jsonb_agg(to_jsonb(limited)-'personId' ORDER BY name COLLATE "C",legajo,"contractId") FROM limited),'[]'::jsonb)) AS result
FROM authority CROSS JOIN clock CROSS JOIN facets`;
// Explicit protocol upgrade keeps v1 consumers and their installation contract.
// The current UI requests v2: preserved adopted facts use the authenticated read
// projection; creation validators and the original lifecycle writers stay strict.
export const NATIVE_ROSTER_V2_SQL=NATIVE_ROSTER_SQL
 .replace('r.created_at AS "registeredAt"','r.created_at AS "registeredAt",lifecycle.data->>\'recordKind\' AS "recordKind"')
 .replace('public.native_employment_lifecycle_projection_v1($1::jsonb,c.id)','public.native_employee_read_projection_v1($1::jsonb,c.id)->\'contract\'')
 .replace("SELECT jsonb_build_object('scope',","SELECT jsonb_build_object('version','native-roster.v2','scope',")
 .replace("'state_error',count(*) FILTER(WHERE status='state_error')","'state_error',count(*) FILTER(WHERE status='state_error'),'unknown',count(*) FILTER(WHERE status='unknown')");
export async function internalNativeRoster(sql,req,principal,session){
 const q=req.query||{};
 if(Object.keys(q).some(k=>!['resource','schema','search','status','jurisdiction','organization','sector','agreement'].includes(k))||Object.values(q).some(v=>typeof v!=='string')||q.schema!==undefined&&!['1','2'].includes(q.schema)||req.url&&new URL(req.url,'http://local.invalid').searchParams.size!==Object.keys(q).length)throw new NativeRosterError('La consulta del padrón no es válida.',400,'NATIVE_ROSTER_FILTERS_INVALID');
 const v2=q.schema==='2';
 const filters=nativeRosterFilters(Object.fromEntries(Object.entries(q).filter(([k])=>!['resource','schema'].includes(k))));let context;
 try{context=employeeContext(principal,session);}catch{throw new NativeRosterError('La sesión operativa dejó de ser válida. Ingresá nuevamente.',401,'NATIVE_ROSTER_SESSION_INVALID');}
 if(!principal.tenant.effectiveCapabilities?.includes('workforce.employee.read'))throw new NativeRosterError('No tenés permiso para consultar el padrón.',403,'NATIVE_ROSTER_FORBIDDEN');
 const pattern=filters.search?'%'+filters.search.replace(/[\\%_]/g,c=>'\\'+c)+'%':'';
 const before=v2?await readNativeDirectorySnapshot(sql,principal,session):null;
 let result;try{[result]=await sql.query(v2?NATIVE_ROSTER_V2_SQL:NATIVE_ROSTER_SQL,[JSON.stringify(context),filters.status,filters.jurisdiction,filters.organization,filters.sector,filters.agreement,pattern,MAX_NATIVE_ROSTER_ROWS+1]);}catch(e){
  if(e?.message==='NATIVE_EMPLOYEE_FORBIDDEN')throw new NativeRosterError('El permiso vigente no permite consultar el padrón.',403,'NATIVE_ROSTER_FORBIDDEN');
  if(e?.message==='NATIVE_EMPLOYEE_SESSION_INVALID')throw new NativeRosterError('La sesión operativa dejó de ser válida. Ingresá nuevamente.',401,'NATIVE_ROSTER_SESSION_INVALID');throw e;
 }
 const raw=result?.result;if(raw?.total>MAX_NATIVE_ROSTER_ROWS)throw new NativeRosterError('El listado supera 10.000 legajos. Acotá los filtros; no se descargó un archivo parcial.',422,'NATIVE_ROSTER_LIMIT');
 if(!raw||raw.scope?.tenantId!==context.tenantId||raw.scope?.membershipId!==context.membershipId)throw new NativeRosterError();
 if(!v2&&raw.version!==undefined&&raw.version!=='native-roster.v1')throw new NativeRosterError();
 if(v2){const after=await readNativeDirectorySnapshot(sql,principal,session);if(before.token!==after.token||JSON.stringify(before.scope)!==JSON.stringify(after.scope)||raw.scope.bindingId!==before.scope.bindingId||raw.scope.companyId!==before.scope.companyId||raw.version!=='native-roster.v2')throw new NativeRosterError('El padrón o su ámbito cambiaron durante la consulta. Volvé a consultar.',409,'NATIVE_ROSTER_CHANGED');}
 const data={version:'native-roster.v1',origin:'MUNICONTROL',complete:true,...raw,filters};
 data.snapshot=createHash('sha256').update(JSON.stringify({...data,queriedAt:null,...(v2?{cohortToken:before.token}:{})})).digest('hex');
 if(Buffer.byteLength(JSON.stringify(data),'utf8')>3_500_000)throw new NativeRosterError('El listado es demasiado grande para una descarga íntegra. Acotá los filtros; no se omitieron filas.',422,'NATIVE_ROSTER_LIMIT');
 return {status:200,payload:{ok:true,data:nativeRoster(data,filters)}};
}
