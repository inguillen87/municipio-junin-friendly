-- 265: lectura liviana de una corrida para decidir sobre ella (confirmar, anular o descartar).
-- La tarjeta «Liquidar un convenio» busca, entre todas las corridas del mes, qué personas están calculadas o confirmadas.
-- Con el detalle completo cada corrida grande pesa varios MB y tarda casi un minuto: con 50 corridas, media hora.
-- Esta función devuelve lo mismo que own_liquidation_detail_v1 menos el resultado técnico (capture): estado, versión,
-- eventos y comandos permitidos por persona, con las mismas versiones de alcance y de estado que exige el comando.
-- No cambia ninguna decisión, permiso ni dato guardado: usa las mismas funciones de contexto, lectura y filas vigentes.
DO $$BEGIN
 IF to_regprocedure('public.own_liquidation_context_v1(jsonb,boolean,text)') IS NULL
  OR to_regprocedure('public.own_liquidation_capture_v1(jsonb,uuid)') IS NULL
  OR to_regprocedure('public.own_liquidation_rows_v1(jsonb,public.own_payroll_run_capture)') IS NULL
  OR to_regprocedure('public.own_liquidation_state_v1(jsonb,public.own_payroll_run_capture)') IS NULL
  OR to_regprocedure('public.native_salary_scope_v1(jsonb)') IS NULL
  OR to_regprocedure('public.own_run_lock_v1(jsonb)') IS NULL THEN RAISE EXCEPTION 'M265_DEPENDENCY_MISSING';END IF;
 IF to_regprocedure('public.own_liquidation_states_v1(jsonb,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'M265_ALREADY_INSTALLED';END IF;
END$$;
CREATE FUNCTION public.own_liquidation_states_v1(p jsonb,run_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;c public.own_payroll_run_capture;value jsonb;BEGIN ctx:=public.own_liquidation_context_v1(p,true);PERFORM public.own_run_lock_v1(ctx);c:=public.own_liquidation_capture_v1(ctx,run_id);
 value:=jsonb_build_object('version','own-liquidation-states.v1','id',c.id,'scopeVersion',public.native_salary_scope_v1(ctx),'stateVersion',public.own_liquidation_state_v1(ctx,c),'reviewAccessRequired',c.actor_membership_id IS DISTINCT FROM(ctx->>'membershipId')::uuid OR c.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR c.actor_email IS DISTINCT FROM ctx->>'actorEmail','employees',public.own_liquidation_rows_v1(ctx,c),'effects',jsonb_build_object('paymentExecuted',false,'accountingPosted',false,'periodClosed',false));
 IF octet_length(value::text)+8192>4194304 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;RETURN value;END $$;
REVOKE ALL ON FUNCTION public.own_liquidation_states_v1(jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_liquidation_states_v1(jsonb,uuid) TO municontrol_actions_runtime_app;
SELECT 'M265 estados livianos de corrida: '||count(*)||' funciones' FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_liquidation_states_v1';
