-- E5 phase 3d: unified read-only legal alert center from reviewed dates.
CREATE FUNCTION public.legal_alert_center_v1(p jsonb)
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
 unified AS (
  SELECT
   'followup'::text AS source_type,
   f.id AS item_id,
   f.version AS item_version,
   f.title,
   f.due_date,
   f.status,
   ''::text AS responsible_label,
   f.norm_id AS source_id,
   f.norm_version AS source_version,
   f.kind::text AS source_kind,
   f.number AS source_number,
   f.year AS source_year,
   f.source_title,
   f.recorded_at
  FROM latest_followup f
  UNION ALL
  SELECT
   'contract_obligation'::text,
   o.obligation_id,
   o.sequence,
   o.title,
   o.due_date,
   o.status,
   o.responsible_label,
   o.contract_id,
   o.contract_revision,
   o.contract_type::text,
   o.number,
   o.year,
   o.source_title,
   o.recorded_at
  FROM latest_obligation o
 ),
 ordered AS (
  SELECT *
  FROM unified
  ORDER BY
   CASE
    WHEN source_type='followup' AND status='open' THEN 0
    WHEN source_type='contract_obligation' AND status='open' THEN 0
    ELSE 1
   END,
   due_date NULLS LAST,
   recorded_at DESC,
   source_type,
   item_id
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
   'recordedAt',o.recorded_at
  ) ORDER BY
   CASE
    WHEN o.source_type='followup' AND o.status='open' THEN 0
    WHEN o.source_type='contract_obligation' AND o.status='open' THEN 0
    ELSE 1
   END,
   o.due_date NULLS LAST,
   o.recorded_at DESC,
   o.source_type,
   o.item_id
  ),'[]'::jsonb)
 INTO population,items
 FROM ordered o;

 IF population>1500
  OR jsonb_array_length(items)<>population
  OR octet_length(items::text)>2000000
 THEN RAISE EXCEPTION 'LEGAL_ALERT_CENTER_UNAVAILABLE'; END IF;

 revision:=encode(digest(convert_to(
  jsonb_build_object('today',today,'rows',items)::text,'UTF8'
 ),'sha256'),'hex');

 RETURN jsonb_build_object(
  'version','legal-alert-center.v1',
  'today',to_char(today,'YYYY-MM-DD'),
  'timezone','America/Argentina/Mendoza',
  'limit',1500,
  'population',population,
  'revision',revision,
  'rows',items
 );
END
$$;

REVOKE ALL ON FUNCTION public.legal_alert_center_v1(jsonb)
 FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_alert_center_v1(jsonb)
 TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_alert_center_v1(jsonb)
 IS 'Unified tenant-scoped read-only alerts from reviewed follow-up and contractual obligation dates; no private notes, actor emails, inferred deadlines or legal conclusions';
