-- 257 · Hugo pasa a encargarse sólo de asistencia: relojes, marcaciones, fichajes, horas extra, ausencias y licencias.
-- Pedido de Liquidación (Noelia) con los funcionarios, 25/11/2026: la liquidación, las novedades de nómina, el maestro
-- salarial, los legajos y las normas los gestiona Liquidación. Se crea el rol JUNIN_ASISTENCIA_INTEGRAL con el
-- subconjunto de asistencia del rol actual de Hugo (ningún permiso nuevo) y su membresía pasa a ese rol. Se retiran
-- también sus permisos de excepción que no son de asistencia (alta de legajos y exportación de novedades).
-- El rol HUGO_APROBADOR_INTEGRAL queda en el catálogo sin cambios, sin nadie asignado, por si hay que volver atrás.
-- Al cambiar el rol, el sistema cierra las sesiones abiertas de Hugo: vuelve a ingresar y ya ve sólo asistencia.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $m257$
DECLARE
 member uuid; kept int; removed int; overrides int;
 attendance constant text := '^(attendance|time|absence|leave)\.';
 reads constant text[] := ARRAY['actions.read','assistant.use','quality.read','lineage.read','management.analytics.read',
  'workforce.summary.read','workforce.structure.read','workforce.employee.read','legal.norm.read'];
BEGIN
 SELECT m.id INTO member FROM public.tenant_membership m
  WHERE m.role_key='HUGO_APROBADOR_INTEGRAL' AND m.status='active' AND lower(m.user_email)='hugo@junin.com';
 IF member IS NULL THEN RAISE EXCEPTION 'M257_HUGO_MEMBERSHIP_NOT_FOUND';END IF;
 IF (SELECT count(*) FROM public.tenant_membership WHERE role_key='HUGO_APROBADOR_INTEGRAL' AND status='active')<>1 THEN
  RAISE EXCEPTION 'M257_ROLE_SHARED';END IF;

 INSERT INTO public.iam_role(role_key,label,description,scope_kind,system_managed)
 VALUES('JUNIN_ASISTENCIA_INTEGRAL','Asistencia, relojes y fichajes',
  'Consulta y aprueba asistencia, relojes, marcaciones, fichajes, horas extra, ausencias y licencias. No aprueba liquidación, novedades de nómina, maestro salarial, legajos ni normas.',
  'tenant',true);
 INSERT INTO public.iam_role_capability(role_key,capability_key)
  SELECT 'JUNIN_ASISTENCIA_INTEGRAL',rc.capability_key FROM public.iam_role_capability rc
  WHERE rc.role_key='HUGO_APROBADOR_INTEGRAL' AND(rc.capability_key ~ attendance OR rc.capability_key=ANY(reads));
 GET DIAGNOSTICS kept=ROW_COUNT;
 SELECT count(*) INTO removed FROM public.iam_role_capability rc
  WHERE rc.role_key='HUGO_APROBADOR_INTEGRAL' AND NOT(rc.capability_key ~ attendance OR rc.capability_key=ANY(reads));
 -- El rol nuevo no puede traer pares incompatibles (es un subconjunto, pero se comprueba igual).
 IF EXISTS(SELECT 1 FROM public.iam_capability_conflict c
   JOIN public.iam_role_capability a ON a.role_key='JUNIN_ASISTENCIA_INTEGRAL' AND a.capability_key=c.capability_key
   JOIN public.iam_role_capability b ON b.role_key='JUNIN_ASISTENCIA_INTEGRAL' AND b.capability_key=c.conflicts_with_key)
 THEN RAISE EXCEPTION 'M257_SOD_CONFLICT';END IF;
 IF EXISTS(SELECT 1 FROM public.iam_role_capability WHERE role_key='JUNIN_ASISTENCIA_INTEGRAL'
   AND capability_key ~ '^(payroll|employee|budget)\.' ) THEN RAISE EXCEPTION 'M257_PAYROLL_LEFT';END IF;

 DELETE FROM public.tenant_membership_capability_override o
  WHERE o.membership_id=member AND o.allow_override AND NOT o.capability_key ~ attendance;
 GET DIAGNOSTICS overrides=ROW_COUNT;
 UPDATE public.tenant_membership SET role_key='JUNIN_ASISTENCIA_INTEGRAL',version=version+1,updated_at=clock_timestamp()
  WHERE id=member;
 UPDATE public.tenant_action_authority SET version=version+1,updated_at=clock_timestamp() WHERE membership_id=member;
 RAISE NOTICE 'M257 Hugo: % permisos de asistencia y consulta, % retirados, % excepciones retiradas',kept,removed,overrides;
END
$m257$;
