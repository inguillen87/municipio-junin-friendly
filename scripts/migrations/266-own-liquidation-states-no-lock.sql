-- 266: la lectura liviana de estados (265) no toma el candado de las corridas.
-- own_run_lock_v1 es un candado exclusivo «probar y fallar» de todo el municipio: mientras una lectura de 40 segundos
-- lo tenía, cualquier otra lectura, cálculo o decisión de otra persona fallaba con «Otra operación está en curso».
-- Leer estados no escribe nada: una sola consulta ve una foto coherente de la base, y el comando que se arme con lo
-- leído vuelve a verificar stateVersion y scopeVersion con el candado tomado. Así, leer no bloquea a nadie.
DO $$BEGIN IF to_regprocedure('public.own_liquidation_states_v1(jsonb,uuid)') IS NULL THEN RAISE EXCEPTION 'M266_REQUIRES_265';END IF;END$$;
CREATE OR REPLACE FUNCTION public.own_liquidation_states_v1(p jsonb,run_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;c public.own_payroll_run_capture;value jsonb;BEGIN ctx:=public.own_liquidation_context_v1(p,true);c:=public.own_liquidation_capture_v1(ctx,run_id);
 value:=jsonb_build_object('version','own-liquidation-states.v1','id',c.id,'scopeVersion',public.native_salary_scope_v1(ctx),'stateVersion',public.own_liquidation_state_v1(ctx,c),'reviewAccessRequired',c.actor_membership_id IS DISTINCT FROM(ctx->>'membershipId')::uuid OR c.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR c.actor_email IS DISTINCT FROM ctx->>'actorEmail','employees',public.own_liquidation_rows_v1(ctx,c),'effects',jsonb_build_object('paymentExecuted',false,'accountingPosted',false,'periodClosed',false));
 IF octet_length(value::text)+8192>4194304 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;RETURN value;END $$;
REVOKE ALL ON FUNCTION public.own_liquidation_states_v1(jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_liquidation_states_v1(jsonb,uuid) TO municontrol_actions_runtime_app;
SELECT 'M266 estados sin candado: '||count(*)||' funciones' FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_liquidation_states_v1' AND prosrc NOT LIKE '%own_run_lock_v1%';
