-- Additive read-only alert center. Migration 089 and its v1 facade remain unchanged.
CREATE FUNCTION public.legal_alert_center_v2(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $$
DECLARE
 ctx jsonb;
 t uuid;
 today date;
 items jsonb;
 population integer;
 revision text;
BEGIN
 ctx:=public.legal_norm_context_v1(p,false);
 t:=(ctx->>'tenantId')::uuid;
 today:=(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;

 WITH latest_followup AS (
  SELECT DISTINCT ON(e.followup_id)
   f.id,e.version,e.title,e.due_date,e.status,e.recorded_at,
   f.norm_id,f.norm_version,n.kind,n.number,n.year,
   coalesce(r.metadata->>'title','') AS source_title
  FROM public.legal_followup f
  JOIN public.legal_followup_event e
   ON e.tenant_id=f.tenant_id AND e.followup_id=f.id
  JOIN public.legal_norm n
   ON n.tenant_id=f.tenant_id AND n.id=f.norm_id
  JOIN public.legal_norm_revision r
   ON r.tenant_id=f.tenant_id AND r.norm_id=f.norm_id AND r.version=f.norm_version
  WHERE f.tenant_id=t
  ORDER BY e.followup_id,e.version DESC
 ),
 latest_coordination AS (
  SELECT DISTINCT ON(e.followup_id)
   e.followup_id,e.revision,e.followup_version,e.responsible_membership_id,
   e.responsible_label,e.next_action,e.recorded_at
  FROM public.legal_coordination_event e
  WHERE e.tenant_id=t
  ORDER BY e.followup_id,e.revision DESC
 ),
 latest_obligation AS (
  SELECT DISTINCT ON(e.obligation_id)
   e.obligation_id,e.sequence,e.title,e.due_date,e.status,e.responsible_label,e.recorded_at,
   e.contract_id,e.contract_revision,c.contract_type,c.number,c.year,cr.title AS source_title
  FROM public.legal_contract_obligation_event e
  JOIN public.legal_contract c
   ON c.tenant_id=e.tenant_id AND c.id=e.contract_id
  JOIN public.legal_contract_revision cr
   ON cr.tenant_id=e.tenant_id AND cr.contract_id=e.contract_id AND cr.revision=e.contract_revision
  WHERE e.tenant_id=t
  ORDER BY e.obligation_id,e.sequence DESC
 ),
 latest_matter AS (
  SELECT DISTINCT ON(e.matter_id)
   m.id,e.revision,e.title,e.target_date,e.state,e.recorded_at,
   e.responsible_membership_id,e.responsible_label,e.next_action,e.owning_area,
   m.norm_id,m.norm_version,n.kind,n.number,n.year,
   coalesce(r.metadata->>'title','') AS source_title
  FROM public.legal_matter m
  JOIN public.legal_matter_event e
   ON e.tenant_id=m.tenant_id AND e.matter_id=m.id
  JOIN public.legal_norm n
   ON n.tenant_id=m.tenant_id AND n.id=m.norm_id
  JOIN public.legal_norm_revision r
   ON r.tenant_id=m.tenant_id AND r.norm_id=m.norm_id AND r.version=m.norm_version
  WHERE m.tenant_id=t
  ORDER BY e.matter_id,e.revision DESC
 ),
 eligible_responsibles AS MATERIALIZED (
  -- Evaluate current 081 eligibility once per recorded responsible membership.
  SELECT r.id,public.legal_coordination_member_v1(t,r.id) IS NOT NULL AS eligible
  FROM (
   SELECT c.responsible_membership_id AS id FROM latest_coordination c
   WHERE c.responsible_membership_id IS NOT NULL
   UNION
   SELECT m.responsible_membership_id FROM latest_matter m
  ) r
 ),
 unified AS (
  SELECT
   'followup'::text AS source_type,
   f.id AS item_id,f.version AS item_version,f.title,f.due_date,f.status,
   coalesce(c.responsible_label,'') AS responsible_label,
   f.norm_id AS source_id,f.norm_version AS source_version,
   f.kind::text AS source_kind,f.number AS source_number,f.year AS source_year,f.source_title,
   greatest(f.recorded_at,c.recorded_at) AS recorded_at,
   c.responsible_membership_id AS responsible_id,
   er.eligible AS responsible_eligible,
   coalesce(c.next_action,'') AS next_action,
   coalesce(c.revision,0) AS coordination_revision,
   coalesce(c.followup_version,0) AS coordination_followup_version,
   ''::text AS owning_area,
   f.status='open' AS pending
  FROM latest_followup f
  LEFT JOIN latest_coordination c ON c.followup_id=f.id
  LEFT JOIN eligible_responsibles er ON er.id=c.responsible_membership_id
  UNION ALL
  SELECT
   'contract_obligation'::text,o.obligation_id,o.sequence,o.title,o.due_date,o.status,o.responsible_label,
   o.contract_id,o.contract_revision,o.contract_type::text,o.number,o.year,o.source_title,o.recorded_at,
   NULL::uuid,NULL::boolean,''::text,0,0,''::text,o.status='open'
  FROM latest_obligation o
  UNION ALL
  SELECT
   'matter'::text,m.id,m.revision,m.title,m.target_date,m.state,m.responsible_label,
   m.norm_id,m.norm_version,m.kind::text,m.number,m.year,m.source_title,m.recorded_at,
   m.responsible_membership_id,
   er.eligible,
   m.next_action,0,0,m.owning_area,m.state NOT IN('closed','cancelled')
  FROM latest_matter m
  JOIN eligible_responsibles er ON er.id=m.responsible_membership_id
 )
 SELECT count(*)::int,
  coalesce(jsonb_agg(jsonb_build_object(
   'sourceType',o.source_type,
   'itemId',o.item_id,
   'itemVersion',o.item_version,
   'title',o.title,
   'dueDate',coalesce(to_char(o.due_date,'YYYY-MM-DD'),''),
   'status',o.status,
   'responsibleLabel',o.responsible_label,
   'sourceId',o.source_id,
   'sourceVersion',o.source_version,
   'sourceKind',o.source_kind,
   'sourceNumber',o.source_number,
   'sourceYear',o.source_year,
   'sourceTitle',o.source_title,
   'recordedAt',o.recorded_at,
   'responsibleId',o.responsible_id,
   'responsibleEligible',o.responsible_eligible,
   'nextAction',o.next_action,
   'coordinationRevision',o.coordination_revision,
   'coordinationFollowupVersion',o.coordination_followup_version,
   'owningArea',o.owning_area
  ) ORDER BY
   CASE WHEN o.pending THEN 0 ELSE 1 END,
   o.due_date NULLS LAST,
   o.recorded_at DESC,
   o.source_type,
   o.item_id
  ),'[]'::jsonb)
 INTO population,items
 FROM unified o;

 IF population>1500
  OR jsonb_array_length(items)<>population
  OR octet_length(items::text)>2000000
 THEN RAISE EXCEPTION 'LEGAL_ALERT_CENTER_UNAVAILABLE'; END IF;

 revision:=encode(digest(convert_to(
  jsonb_build_object('today',today,'rows',items)::text,'UTF8'
 ),'sha256'),'hex');
 RETURN jsonb_build_object(
  'version','legal-alert-center.v2',
  'today',to_char(today,'YYYY-MM-DD'),
  'timezone','America/Argentina/Mendoza',
  'limit',1500,
  'population',population,
  'revision',revision,
  'rows',items
 );
END
$$;

REVOKE ALL ON FUNCTION public.legal_alert_center_v2(jsonb)
 FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_alert_center_v2(jsonb)
 TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_alert_center_v2(jsonb)
 IS 'Tenant-scoped read-only alerts with recorded coordination and matter responsibility; current eligibility, exact source versions, no private history, actor fields, inferred deadlines or legal conclusions';
