-- 250 · Participación del período: lista de propuestas pendientes de un mes, para revisarlas todas juntas.
-- Hasta ahora quien revisaba tenía que buscar legajo por legajo para encontrar qué esperaba su decisión. Esta lectura
-- devuelve, para el período pedido, cada propuesta sin decisión con su contrato y legajo, y si esta cuenta puede decidirla
-- (persona y membresía distintas de quien la preparó). Usa el mismo contexto administrativo y la misma regla de revisión
-- independiente que own_participation_summary_v1. No decide, no escribe y no concede permisos nuevos.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $prerequisite$
BEGIN
 IF to_regprocedure('public.own_participation_summary_v1(jsonb,own_participation_event)') IS NULL
 OR to_regprocedure('public.native_salary_administrative_context_v1(jsonb)') IS NULL
 OR to_regprocedure('public.own_participation_lock_v1(jsonb)') IS NULL
 THEN RAISE EXCEPTION 'OWN_PARTICIPATION_PENDING_PREREQUISITE' USING ERRCODE='P0001';END IF;
 IF to_regprocedure('public.own_participation_pending_v1(jsonb,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'OWN_PARTICIPATION_PENDING_ALREADY_INSTALLED' USING ERRCODE='P0001';END IF;
END
$prerequisite$;
CREATE FUNCTION public.own_participation_pending_v1(p jsonb,period_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;items jsonb;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
 ctx:=public.native_salary_administrative_context_v1(p);PERFORM public.own_participation_lock_v1(ctx);
 SELECT coalesce(jsonb_agg(jsonb_build_object('proposalId',e.id,'contractId',e.contract_id,'legajo',e.source_snapshot#>>'{subject,legajo}',
   'createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',(public.own_participation_summary_v1(ctx,e)->'canReview')) ORDER BY e.recorded_at,e.id),'[]')
 INTO items FROM public.own_participation_event e
 WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period_month=(period_value||'-01')::date AND e.command='propose'
  AND NOT EXISTS(SELECT 1 FROM public.own_participation_event d WHERE d.proposal_id=e.id);
 IF jsonb_array_length(items)>2000 THEN RAISE EXCEPTION 'PARTICIPATION_LIMIT';END IF;
 RETURN jsonb_build_object('version','own-period-participation-pending.v1','period',period_value,'complete',true,'proposals',items);
END $$;
REVOKE ALL ON FUNCTION public.own_participation_pending_v1(jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_participation_pending_v1(jsonb,text) TO municontrol_actions_runtime_app;
