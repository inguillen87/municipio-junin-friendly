-- 251 · Maestro salarial: lectura liviana de las propuestas pendientes, para «Aprobar todo».
-- native_salary_bootstrap_v1 devuelve el catálogo completo y todas las propuestas con sus filas: varios megabytes que se
-- leen por bloques y tardan decenas de segundos. Para saber qué espera decisión alcanza con el resumen de cada propuesta
-- pendiente. Esta función devuelve sólo eso, con la misma regla de revisión independiente de native_salary_proposal_v1.
-- La aprobación sigue usando el comando de siempre. No decide, no escribe y no concede permisos nuevos.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $prerequisite$
BEGIN
 IF to_regprocedure('public.native_salary_proposal_v1(jsonb,native_salary_event)') IS NULL
 OR to_regprocedure('public.native_salary_administrative_context_v1(jsonb)') IS NULL
 OR to_regprocedure('public.native_salary_scope_v1(jsonb)') IS NULL
 THEN RAISE EXCEPTION 'NATIVE_SALARY_PENDING_PREREQUISITE' USING ERRCODE='P0001';END IF;
 IF to_regprocedure('public.native_salary_pending_v1(jsonb)') IS NOT NULL
 THEN RAISE EXCEPTION 'NATIVE_SALARY_PENDING_ALREADY_INSTALLED' USING ERRCODE='P0001';END IF;
END
$prerequisite$;
CREATE FUNCTION public.native_salary_pending_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;items jsonb;
BEGIN
 ctx:=public.native_salary_administrative_context_v1(p);
 SELECT coalesce(jsonb_agg(public.native_salary_proposal_v1(ctx,e)-'items'-'baseItems' ORDER BY e.recorded_at,e.id),'[]') INTO items
 FROM public.native_salary_event e
 WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose'
  AND NOT EXISTS(SELECT 1 FROM public.native_salary_event d WHERE d.proposal_id=e.id);
 IF jsonb_array_length(items)>1000 THEN RAISE EXCEPTION 'NATIVE_SALARY_LIMIT';END IF;
 RETURN jsonb_build_object('version','native-salary-pending.v1','scopeVersion',public.native_salary_scope_v1(ctx),'complete',true,'proposals',items);
END $$;
REVOKE ALL ON FUNCTION public.native_salary_pending_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.native_salary_pending_v1(jsonb) TO municontrol_actions_runtime_app;
