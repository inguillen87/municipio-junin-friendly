-- 108: TXT Junín 638 (AMARU) desde novedades fijas aprobadas.
-- Layout respaldado por GRH: formato 1 "Formato Junin", amaru.txt.
-- item 0: DNI posición 5 longitud 8; item 1: importe posición 44 longitud 11.
-- Sólo lectura/exportación. No liquida, no importa a GRH y no concede capacidades nuevas.
DO $baseline$ BEGIN
 IF to_regprocedure('public.payroll_fixed_registry_junin638_v1(jsonb,date,text)') IS NOT NULL THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_JUNIN638_ALREADY_INSTALLED';
 END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.payroll_fixed_registry_context_v1(jsonb,text)'::regprocedure),'UTF8')),'hex')
    IS DISTINCT FROM '15196f142d2cdd8940ef022c1bbe5d1a15c4a5a3a9b774332ea2b3d31898540a' THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_JUNIN638_BASELINE_CHANGED';
 END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.payroll_fixed_registry_export_v1(jsonb,date,text)'::regprocedure),'UTF8')),'hex')
    IS DISTINCT FROM 'b78d28f0da27745748f7be861a7721ae720257251fb51bc80a3b6c28d29cbb39' THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_JUNIN638_BASELINE_CHANGED';
 END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.payroll_fixed_registry_list_v1(jsonb,date)'::regprocedure),'UTF8')),'hex')
    IS DISTINCT FROM '655527aefed19eb6199fb0ba525f75dbac416ff82608ec44aec1175c11bb4fee' THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_JUNIN638_BASELINE_CHANGED';
 END IF;
END $baseline$;

CREATE FUNCTION public.payroll_fixed_registry_junin638_v1(
 p_context jsonb,p_period date,p_snapshot text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 ctx jsonb;
 exported jsonb;
 rows_json jsonb;
 bad_count integer;
BEGIN
 ctx:=public.payroll_fixed_registry_context_v1(p_context,'payroll.novelty.export');
 exported:=public.payroll_fixed_registry_export_v1(p_context,p_period,p_snapshot);

 SELECT count(*) INTO bad_count
 FROM jsonb_array_elements(exported->'rows') r
 LEFT JOIN public.employment_contract c
   ON c.id=(r#>>'{subject,contractId}')::uuid
  AND c.tenant_id=(ctx->>'tenantId')::uuid
 LEFT JOIN public.person_identity pi ON pi.id=c.person_id
 WHERE r#>>'{values,conceptSourceId}'='638'
   AND (
     c.id IS NULL OR pi.id IS NULL
     OR pi.dni IS NULL OR pi.dni!~'^[0-9]{5,8}$' OR pi.dni~'^0+$'
   );
 IF bad_count>0 THEN RAISE EXCEPTION 'PAYROLL_FIXED_JUNIN638_DNI_REQUIRED'; END IF;

 SELECT count(*) INTO bad_count
 FROM jsonb_array_elements(exported->'rows') r
 WHERE r#>>'{values,conceptSourceId}'='638'
   AND (
     r#>>'{values,amountCents}' IS NULL
     OR r#>>'{values,amountCents}'!~'^[0-9]+$'
     OR (r#>>'{values,amountCents}')::numeric>9999999999
   );
 IF bad_count>0 THEN RAISE EXCEPTION 'PAYROLL_FIXED_JUNIN638_AMOUNT_REQUIRED'; END IF;

 SELECT coalesce(jsonb_agg(
   jsonb_build_object(
     'recordId',r->>'recordId',
     'version',(r->>'version')::integer,
     'proposalId',r->>'proposalId',
     'contractId',c.id,
     'dni',pi.dni,
     'amountCents',r#>>'{values,amountCents}'
   )
   ORDER BY lpad(pi.dni,8,'0'),r->>'recordId'
 ),'[]'::jsonb)
 INTO rows_json
 FROM jsonb_array_elements(exported->'rows') r
 JOIN public.employment_contract c
   ON c.id=(r#>>'{subject,contractId}')::uuid
  AND c.tenant_id=(ctx->>'tenantId')::uuid
 JOIN public.person_identity pi ON pi.id=c.person_id
 WHERE r#>>'{values,conceptSourceId}'='638';

 RETURN jsonb_build_object(
   'version','payroll-fixed-junin638.v1',
   'periodMonth',exported->>'periodMonth',
   'snapshotToken',exported->>'snapshotToken',
   'concept','638',
   'receiver','AMARU',
   'sourceFormat',jsonb_build_object(
     'id',1,
     'name','Formato Junin',
     'filename','amaru.txt',
     'dniStart',5,
     'dniLength',8,
     'amountStart',44,
     'amountLength',11
   ),
   -- CRLF sin línea final es la convención de exportación de MuniControl;
   -- el respaldo GRH fija posiciones/ancho, no documenta terminadores.
   'format',jsonb_build_object(
     'recordBytes',55,
     'lineEnding','CRLF',
     'trailingLineEnding',false
   ),
   'rows',rows_json,
   'total',jsonb_array_length(rows_json),
   'effects',exported->'effects'
 );
EXCEPTION
 WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY';
END $$;

REVOKE ALL ON FUNCTION public.payroll_fixed_registry_junin638_v1(jsonb,date,text)
 FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_fixed_registry_junin638_v1(jsonb,date,text)
 TO municontrol_actions_runtime_app;
