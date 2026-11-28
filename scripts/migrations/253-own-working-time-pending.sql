-- 253 · Jornada contractual: lista de propuestas pendientes de un mes, para aprobarlas juntas desde «Aprobar todo».
-- La jornada contractual se aprueba contrato por contrato; quien revisaba tenía que abrir cada legajo. Esta lectura devuelve, para el
-- período pedido, cada propuesta sin decisión con su contrato y si esta cuenta puede decidirla, con el mismo contexto y la
-- misma regla de revisión independiente que own_working_time_summary_v1. No decide, no escribe y no concede permisos nuevos.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $prerequisite$
BEGIN
 IF to_regprocedure('public.own_working_time_summary_v1(jsonb,own_working_time_event)') IS NULL
 OR to_regprocedure('public.native_salary_administrative_context_v1(jsonb)') IS NULL
 OR to_regprocedure('public.own_working_time_lock_v1(jsonb)') IS NULL
 THEN RAISE EXCEPTION 'OWN_WORKING_TIME_PENDING_PREREQUISITE' USING ERRCODE='P0001';END IF;
 IF to_regprocedure('public.own_working_time_pending_v1(jsonb,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'OWN_WORKING_TIME_PENDING_ALREADY_INSTALLED' USING ERRCODE='P0001';END IF;
END
$prerequisite$;
CREATE FUNCTION public.own_working_time_pending_v1(p jsonb,period_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;items jsonb;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'WORKING_TIME_INPUT_INVALID';END IF;
 ctx:=public.native_salary_administrative_context_v1(p);PERFORM public.own_working_time_lock_v1(ctx);
 SELECT coalesce(jsonb_agg(jsonb_build_object('proposalId',s.x->>'id','contractId',s.cid,'createdAt',s.x->>'createdAt','authorLabel',s.x->>'authorLabel','canReview',s.x->'canReview') ORDER BY s.at,s.eid),'[]')
 INTO items FROM (SELECT public.own_working_time_summary_v1(ctx,e) x,e.contract_id cid,e.recorded_at at,e.id eid FROM public.own_working_time_event e
  WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period_month=(period_value||'-01')::date AND e.command='propose') s
 WHERE s.x->>'status'='pending';
 IF jsonb_array_length(items)>10000 THEN RAISE EXCEPTION 'WORKING_TIME_LIMIT';END IF;
 RETURN jsonb_build_object('version','own-contract-working-time-pending.v1','period',period_value,'complete',true,'proposals',items);
END $$;
REVOKE ALL ON FUNCTION public.own_working_time_pending_v1(jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_working_time_pending_v1(jsonb,text) TO municontrol_actions_runtime_app;
