-- One bounded read of current follow-ups across the authorized municipality. No new tables or mutations.
CREATE FUNCTION public.legal_followup_agenda_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;items jsonb;population integer;day text;can_manage boolean;
BEGIN
 ctx:=legal_norm_context_v1(p,false);t:=(ctx->>'tenantId')::uuid;can_manage:=(ctx->>'canRegister')::boolean;
 day:=to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM-DD');
 WITH entries AS (
  SELECT f.id,jsonb_build_object('id',f.id,'normId',f.norm_id,'normVersion',f.norm_version,
   'currentNormVersion',n.current_version,'version',e.version,'title',e.title,'dueDate',coalesce(to_char(e.due_date,'YYYY-MM-DD'),''),
   'status',e.status,'recordedAt',e.recorded_at,
   'norm',jsonb_build_object('kind',n.kind,'number',n.number,'year',n.year,'issuer',n.issuer,'title',r.metadata->>'title')) AS item
  FROM legal_followup f
  JOIN legal_norm n ON n.tenant_id=f.tenant_id AND n.id=f.norm_id
  JOIN legal_norm_revision r ON r.tenant_id=f.tenant_id AND r.norm_id=f.norm_id AND r.version=f.norm_version
  JOIN LATERAL (SELECT v.version,v.title,v.due_date,v.status,v.recorded_at FROM legal_followup_event v
   WHERE v.tenant_id=f.tenant_id AND v.followup_id=f.id ORDER BY v.version DESC LIMIT 1) e ON true
  WHERE f.tenant_id=t
 )
 SELECT coalesce(jsonb_agg(item ORDER BY id),'[]'::jsonb),
  (SELECT count(*)::int FROM legal_followup WHERE tenant_id=t) INTO items,population FROM entries;
 IF population>1000 OR population<>jsonb_array_length(items) OR octet_length(items::text)>1500000 THEN RAISE EXCEPTION 'FOLLOWUP_AGENDA_UNAVAILABLE';END IF;
 RETURN jsonb_build_object('version','legal-followup-agenda.v1','today',day,'timezone','America/Argentina/Mendoza',
  'observedAt',clock_timestamp(),'canManage',can_manage,'limit',1000,'total',population,'rows',items,
  'revision',encode(digest(jsonb_build_array(day,can_manage,items)::text,'sha256'),'hex'));
END $$;
REVOKE ALL ON FUNCTION public.legal_followup_agenda_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_followup_agenda_v1(jsonb) TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_followup_agenda_v1(jsonb) IS 'Bounded tenant-session agenda; current follow-up revision and original norm version; no notes, actor emails, legal deadlines or writes';
