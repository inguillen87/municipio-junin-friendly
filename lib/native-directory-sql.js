// Authenticated current census only. No historical source views or entitlement.
// Parameters retain the existing directory binding order: database/company/tenant/context.
export function nativeDirectorySql(){return `
 WITH authority AS MATERIALIZED (SELECT public.native_employee_directory_snapshot_v1($4::jsonb) AS proof),
 directory AS MATERIALIZED (
  SELECT c.id AS "contractId",c.person_id AS "canonicalPersonId",c.legacy_company_id AS "companyId",c.legacy_legajo AS legajo,
   c.source_system AS "recordOrigin",c.jurisdiction_code AS "jurisdictionCode",p.full_name AS nombre,p.dni,p.cuil,p.sex_code AS sexo,
   p.data_quality_score AS "identityQualityScore",p.identity_state AS "identityState",
   (projection.data->>'startDate')::date AS "fechaIngreso",(projection.data->>'endDate')::date AS "fechaEgreso",
   c.status AS "contractStatus",c.source_system AS "sourceSystem",c.source_batch_id AS "sourceBatchId",NULL::timestamptz AS "sourceCutoff",
   projection.data->>'status' AS "administrativeStatus",'not_certified'::text AS "payrollStatus",NULL::date AS "statusSnapshotDate",
   'registro_municipal_sin_liquidacion_propia'::text AS "controlState",projection.data->>'status'='active' AS activo,false AS liquidable,
   NULLIF(btrim(c.source_payload#>>'{employment,organizationName}'),'') AS organizacion,
   NULLIF(btrim(c.source_payload#>>'{employment,sectorName}'),'') AS sector,
   NULLIF(btrim(c.source_payload#>>'{employment,categoryName}'),'') AS categoria,
   NULLIF(btrim(c.source_payload#>>'{employment,agreementName}'),'') AS convenio,
   NULLIF(btrim(c.source_payload#>>'{employment,cargoName}'),'') AS cargo,
   'not_loaded'::text AS "crosswalkStatus",NULL::text AS "crosswalkMethod",NULL::numeric AS "crosswalkConfidence"
  FROM authority JOIN employment_contract c ON c.tenant_id=$3::uuid AND c.legacy_company_id=$2::bigint
   AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL
  JOIN person_identity p ON p.id=c.person_id
  CROSS JOIN LATERAL (SELECT public.native_employee_read_projection_v1($4::jsonb,c.id)->'contract' AS data) projection
  WHERE authority.proof#>>'{scope,database}'=$1::text AND authority.proof#>>'{scope,tenantId}'=$3::text
   AND (authority.proof#>>'{scope,companyId}')::bigint=$2::bigint AND (authority.proof->>'imported')::integer=0
 ), closed_month AS (SELECT NULL::date AS month),
 closed_contracts AS (SELECT NULL::uuid AS employment_contract_id WHERE false),
 multiple_active_people AS (SELECT "canonicalPersonId" FROM directory WHERE activo IS TRUE GROUP BY "canonicalPersonId" HAVING count(DISTINCT "contractId")>1)
 `;}
