-- 259 · Activa la aprobación propia para Liquidación de Haberes (Miriam Noelia Scerca).
-- Respaldo: «Nota: Liquidación con aprobación propia y control posterior», firmada el 25/11/2026.
-- Solicita: Miriam Noelia Scerca (Liquidación de Haberes). Autoriza y realiza el control posterior: Hugo Leucrini.
-- La nota firmada no completó cargo, vigencia ni responsable del control: se registra el control posterior a cargo
-- de quien autoriza y vigencia hasta el 31/03/2027, revocable antes desde la base (revoked_at + motivo).
-- La huella sha256 identifica el PDF firmado recibido; el documento no se guarda en el repositorio.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $m259$
DECLARE member public.tenant_membership%ROWTYPE;
BEGIN
 IF to_regprocedure('public.own_single_operator_v1(jsonb,uuid)') IS NULL THEN RAISE EXCEPTION 'M259_REQUIRES_258';END IF;
 SELECT * INTO member FROM public.tenant_membership m WHERE lower(m.user_email)='noelia@junin.com' AND m.status='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'M259_MEMBERSHIP_NOT_FOUND';END IF;
 INSERT INTO public.own_single_operator_authorization(tenant_id,membership_id,operator_label,authorized_by,reviewer,
  authorization_reference,document_sha256,valid_from,valid_until)
 VALUES(member.tenant_id,member.id,'Miriam Noelia Scerca · Liquidación de Haberes','Hugo Leucrini','Hugo Leucrini',
  'Nota «Liquidación con aprobación propia y control posterior», firmada el 25/11/2026 por Hugo Leucrini (autoriza) y Miriam Noelia Scerca (solicita).',
  '38b74e996bd16d2e40479572012c4e46c92956af9f4a080c08f76b3012a70aac','2026-11-25','2027-03-31');
 RAISE NOTICE 'M259 aprobación propia activa para % hasta el 31/03/2027',member.user_email;
END
$m259$;
