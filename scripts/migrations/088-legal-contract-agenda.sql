-- E5 phase 3c: municipality-wide read-only contractual agenda from reviewed obligation dates.
CREATE FUNCTION public.legal_contract_agenda_v1(p jsonb)
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
 rows jsonb;
 population integer;
 revision text;
BEGIN
 ctx:=public.legal_norm_context_v1(p,false);
 t:=(ctx->>'tenantId')::uuid;
 today:=(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;

 WITH latest_obligation AS (
  SELECT DISTINCT ON(e.obligation_id)
   e.*
  FROM public.legal_contract_obligation_event e
  WHERE e.tenant_id=t
  ORDER BY e.obligation_id,e.sequence DESC
 ), current_contract AS (
  SELECT DISTINCT ON(r.contract_id)
   r.contract_id,r.revision,r.state,r.title
  FROM public.legal_contract_revision r
  WHERE r.tenant_id=t
  ORDER BY r.contract_id,r.revision DESC
 ), shaped AS (
  SELECT
   o.obligation_id AS id,
   o.sequence,
   o.status,
   o.obligation_type,
   o.title AS obligation_title,
   o.clause_locator,
   o.source_page,
   o.due_date,
   o.due_basis,
   o.currency,
   o.amount_minor,
   o.unit,
   o.responsible_label,
   o.evidence_case_document_id,
   o.recorded_at,
   c.id AS contract_id,
   c.number,
   c.year,
   c.contract_type,
   cc.revision AS contract_revision,
   cc.state AS contract_state,
   cc.title AS contract_title
  FROM latest_obligation o
  JOIN public.legal_contract c
   ON c.tenant_id=o.tenant_id AND c.id=o.contract_id
  JOIN current_contract cc
   ON cc.contract_id=c.id
 ), bounded AS (
  SELECT * FROM shaped
  ORDER BY
   CASE WHEN status='open' THEN 0 ELSE 1 END,
   due_date NULLS LAST,
   recorded_at DESC,
   id
  LIMIT 1000
 )
 SELECT count(*)::int,
  coalesce(jsonb_agg(jsonb_build_object(
   'id',b.id,
   'sequence',b.sequence,
   'status',b.status,
   'obligationType',b.obligation_type,
   'title',b.obligation_title,
   'clauseLocator',b.clause_locator,
   'sourcePage',b.source_page,
   'dueDate',coalesce(to_char(b.due_date,'YYYY-MM-DD'),''),
   'dueBasis',b.due_basis,
   'currency',b.currency,
   'amountMinor',b.amount_minor,
   'unit',b.unit,
   'responsibleLabel',b.responsible_label,
   'evidenceDocumentId',b.evidence_case_document_id,
   'recordedAt',b.recorded_at,
   'contractId',b.contract_id,
   'contractNumber',b.number,
   'contractYear',b.year,
   'contractType',b.contract_type,
   'contractRevision',b.contract_revision,
   'contractState',b.contract_state,
   'contractTitle',b.contract_title
  ) ORDER BY
   CASE WHEN b.status='open' THEN 0 ELSE 1 END,
   b.due_date NULLS LAST,
   b.recorded_at DESC,
   b.id),'[]'::jsonb)
 INTO population,rows
 FROM bounded b;

 revision:=encode(digest(convert_to(
  jsonb_build_object('today',today,'rows',rows)::text,'UTF8'
 ),'sha256'),'hex');

 RETURN jsonb_build_object(
  'version','legal-contract-agenda.v1',
  'today',to_char(today,'YYYY-MM-DD'),
  'timezone','America/Argentina/Mendoza',
  'limit',1000,
  'population',population,
  'revision',revision,
  'rows',rows
 );
END
$$;

REVOKE ALL ON FUNCTION public.legal_contract_agenda_v1(jsonb)
 FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_contract_agenda_v1(jsonb)
 TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_contract_agenda_v1(jsonb)
 IS 'Read-only contractual agenda from manually reviewed obligation dates and human-observed statuses; no inferred due dates or legal breach conclusions';
