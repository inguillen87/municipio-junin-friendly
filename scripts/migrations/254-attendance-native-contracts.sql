-- 254 · Relojes vinculados a la nómina propia.
-- Los relojes vinculan cada marca con un contrato por el DNI del usuario del reloj. Tanto la recepción (PM-10 y ZK40),
-- la protección de vínculos como la lectura de jornadas aceptaban sólo contratos importados de GRH con lote publicado.
-- Desde el paso a la nómina propia los contratos vigentes son de MuniControl (sin lote de GRH), así que toda marca nueva
-- quedaba «sin vínculo» y el preparte no tenía personas con legajo. Esta migración acepta además contratos propios del
-- mismo municipio y empresa, con la misma regla de fechas y estado; por DNI prefiere el contrato propio y, si no hay,
-- usa GRH como antes. Un DNI con más de un contrato vigente sigue quedando como «ambiguo» para revisión manual.
-- Además vincula las marcas recibidas desde el 31/08/2026 que siguen sin vínculo, sólo cuando el DNI del reloj
-- corresponde a exactamente un contrato propio vigente ese día y no hay otro vínculo distinto para ese día.
-- No toca marcas ya vinculadas, aceptadas o rechazadas; no aprueba horas: el preparte sigue pidiendo revisión.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $m254$
DECLARE def text;
BEGIN
 -- Protección de vínculos
 def:=pg_get_functiondef('public.attendance_gateway_identity_guard_v1()'::regprocedure);
 IF (length(def)-length(replace(def,$g$    JOIN employment_contract contract
      ON contract.id = NEW.employment_contract_id
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = binding.source_company_id
     AND contract.status IN ('active','inactive')
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
$g$,'')))/length($g$    JOIN employment_contract contract
      ON contract.id = NEW.employment_contract_id
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = binding.source_company_id
     AND contract.status IN ('active','inactive')
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
$g$)<>1 THEN RAISE EXCEPTION 'M254_GUARD_NEEDLE';END IF;
 EXECUTE replace(def,$g$    JOIN employment_contract contract
      ON contract.id = NEW.employment_contract_id
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = binding.source_company_id
     AND contract.status IN ('active','inactive')
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
$g$,$gr$    JOIN employment_contract contract
      ON contract.id = NEW.employment_contract_id
     AND contract.legacy_company_id = binding.source_company_id
     AND contract.status IN ('active','inactive')
     AND ((contract.source_system = 'MUNICONTROL' AND contract.tenant_id = NEW.tenant_id)
       OR (contract.source_system = 'GRH' AND EXISTS (
         SELECT 1 FROM source_import_batch batch
         WHERE batch.id = contract.source_batch_id AND batch.source_system = 'GRH'
           AND batch.source_database = binding.source_database
           AND batch.validation_state = 'published' AND batch.legacy_import_run_id IS NOT NULL)))
$gr$);
 -- Recepción PM-10 y ZK40
 FOREACH def IN ARRAY ARRAY[pg_get_functiondef('public.attendance_pm10_receive_v1(text,text,jsonb,text)'::regprocedure),pg_get_functiondef('public.attendance_zk40_receive_v1(text,text,jsonb,text)'::regprocedure)] LOOP
  IF (length(def)-length(replace(def,$a$JOIN employment_contract ec ON ec.id=m.employment_contract_id AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id AND ec.status IN('active','inactive') AND ec.start_date<=lt::date AND (ec.end_date IS NULL OR ec.end_date>=lt::date)
 JOIN source_import_batch ib ON ib.id=ec.source_batch_id AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL
$a$,'')))/length($a$JOIN employment_contract ec ON ec.id=m.employment_contract_id AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id AND ec.status IN('active','inactive') AND ec.start_date<=lt::date AND (ec.end_date IS NULL OR ec.end_date>=lt::date)
 JOIN source_import_batch ib ON ib.id=ec.source_batch_id AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL
$a$)<>1 THEN RAISE EXCEPTION 'M254_RECEIVE_MAP_NEEDLE';END IF;
  IF (length(def)-length(replace(def,$b$IF matches=0 THEN
 SELECT count(*),min(ec.id::text)::uuid INTO source_matches,ecid FROM person_identity pi JOIN employment_contract ec ON ec.person_id=pi.id
 JOIN source_import_batch ib ON ib.id=ec.source_batch_id
 WHERE pi.dni=doc AND pi.identity_state IN('active','provisional') AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id AND ec.status IN('active','inactive') AND ec.start_date<=lt::date AND (ec.end_date IS NULL OR ec.end_date>=lt::date)
 AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL;
$b$,'')))/length($b$IF matches=0 THEN
 SELECT count(*),min(ec.id::text)::uuid INTO source_matches,ecid FROM person_identity pi JOIN employment_contract ec ON ec.person_id=pi.id
 JOIN source_import_batch ib ON ib.id=ec.source_batch_id
 WHERE pi.dni=doc AND pi.identity_state IN('active','provisional') AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id AND ec.status IN('active','inactive') AND ec.start_date<=lt::date AND (ec.end_date IS NULL OR ec.end_date>=lt::date)
 AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL;
$b$)<>1 THEN RAISE EXCEPTION 'M254_RECEIVE_DNI_NEEDLE';END IF;
  EXECUTE replace(replace(def,$a$JOIN employment_contract ec ON ec.id=m.employment_contract_id AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id AND ec.status IN('active','inactive') AND ec.start_date<=lt::date AND (ec.end_date IS NULL OR ec.end_date>=lt::date)
 JOIN source_import_batch ib ON ib.id=ec.source_batch_id AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL
$a$,$ar$JOIN employment_contract ec ON ec.id=m.employment_contract_id AND ec.legacy_company_id=b.source_company_id AND ec.status IN('active','inactive') AND ec.start_date<=lt::date AND (ec.end_date IS NULL OR ec.end_date>=lt::date)
 AND ((ec.source_system='MUNICONTROL' AND ec.tenant_id=c.tenant_id) OR (ec.source_system=b.source_system AND EXISTS(SELECT 1 FROM source_import_batch ib WHERE ib.id=ec.source_batch_id AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL)))
$ar$),$b$IF matches=0 THEN
 SELECT count(*),min(ec.id::text)::uuid INTO source_matches,ecid FROM person_identity pi JOIN employment_contract ec ON ec.person_id=pi.id
 JOIN source_import_batch ib ON ib.id=ec.source_batch_id
 WHERE pi.dni=doc AND pi.identity_state IN('active','provisional') AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id AND ec.status IN('active','inactive') AND ec.start_date<=lt::date AND (ec.end_date IS NULL OR ec.end_date>=lt::date)
 AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL;
$b$,$br$IF matches=0 THEN
 SELECT count(*),min(ec.id::text)::uuid INTO source_matches,ecid FROM person_identity pi JOIN employment_contract ec ON ec.person_id=pi.id
 WHERE pi.dni=doc AND pi.identity_state IN('active','provisional') AND ec.source_system='MUNICONTROL' AND ec.tenant_id=c.tenant_id AND ec.legacy_company_id=b.source_company_id AND ec.status IN('active','inactive') AND ec.start_date<=lt::date AND (ec.end_date IS NULL OR ec.end_date>=lt::date);
 IF source_matches=0 THEN
 SELECT count(*),min(ec.id::text)::uuid INTO source_matches,ecid FROM person_identity pi JOIN employment_contract ec ON ec.person_id=pi.id
 JOIN source_import_batch ib ON ib.id=ec.source_batch_id
 WHERE pi.dni=doc AND pi.identity_state IN('active','provisional') AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id AND ec.status IN('active','inactive') AND ec.start_date<=lt::date AND (ec.end_date IS NULL OR ec.end_date>=lt::date)
 AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL;
 END IF;
$br$);
 END LOOP;
 -- Lectura de jornadas (preparte)
 def:=pg_get_functiondef('public.attendance_clock_workday_source_v2(text,uuid,integer,text,uuid,uuid,text,date,date,uuid)'::regprocedure);
 IF (length(def)-length(replace(def,$c$  LEFT JOIN employment_contract ec ON ec.id=im.employment_contract_id AND NOT overlap.present
   AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id
   AND ec.status IN('active','inactive') AND ec.start_date<=r.local_timestamp::date
   AND (ec.end_date IS NULL OR ec.end_date>=r.local_timestamp::date)
   AND EXISTS(SELECT 1 FROM source_import_batch ib WHERE ib.id=ec.source_batch_id
    AND ib.source_system=b.source_system AND ib.source_database=b.source_database
    AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL)
$c$,'')))/length($c$  LEFT JOIN employment_contract ec ON ec.id=im.employment_contract_id AND NOT overlap.present
   AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id
   AND ec.status IN('active','inactive') AND ec.start_date<=r.local_timestamp::date
   AND (ec.end_date IS NULL OR ec.end_date>=r.local_timestamp::date)
   AND EXISTS(SELECT 1 FROM source_import_batch ib WHERE ib.id=ec.source_batch_id
    AND ib.source_system=b.source_system AND ib.source_database=b.source_database
    AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL)
$c$)<>1 THEN RAISE EXCEPTION 'M254_WORKDAY_NEEDLE';END IF;
 EXECUTE replace(def,$c$  LEFT JOIN employment_contract ec ON ec.id=im.employment_contract_id AND NOT overlap.present
   AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id
   AND ec.status IN('active','inactive') AND ec.start_date<=r.local_timestamp::date
   AND (ec.end_date IS NULL OR ec.end_date>=r.local_timestamp::date)
   AND EXISTS(SELECT 1 FROM source_import_batch ib WHERE ib.id=ec.source_batch_id
    AND ib.source_system=b.source_system AND ib.source_database=b.source_database
    AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL)
$c$,$cr$  LEFT JOIN employment_contract ec ON ec.id=im.employment_contract_id AND NOT overlap.present
   AND ec.legacy_company_id=b.source_company_id
   AND ec.status IN('active','inactive') AND ec.start_date<=r.local_timestamp::date
   AND (ec.end_date IS NULL OR ec.end_date>=r.local_timestamp::date)
   AND ((ec.source_system='MUNICONTROL' AND ec.tenant_id=p_tenant) OR (ec.source_system=b.source_system
   AND EXISTS(SELECT 1 FROM source_import_batch ib WHERE ib.id=ec.source_batch_id
    AND ib.source_system=b.source_system AND ib.source_database=b.source_database
    AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL)))
$cr$);
END
$m254$;

-- Marcas ya recibidas: vincular por DNI con un único contrato propio vigente ese día.
CREATE TEMP TABLE m254_match ON COMMIT DROP AS
WITH pol AS (
 SELECT p.tenant_id,sb.source_company_id FROM tenant_identity_policy p
 JOIN platform_tenant_source_binding sb ON sb.id=p.certified_source_binding_id AND sb.tenant_id=p.tenant_id AND sb.source_system='GRH' AND sb.verified
 WHERE p.tenant_data_plane_ready
), hm AS (
 SELECT ec.tenant_id,ec.id contract_id,ec.start_date,ec.end_date,
  encode(hmac(convert_to('clock-v1:'||ec.tenant_id||':'||pi.dni,'UTF8'),k.secret,'sha256'),'hex') ih
 FROM employment_contract ec JOIN pol ON pol.tenant_id=ec.tenant_id AND ec.legacy_company_id=pol.source_company_id
 JOIN person_identity pi ON pi.id=ec.person_id AND pi.dni IS NOT NULL AND pi.dni<>'' AND pi.identity_state IN('active','provisional')
 JOIN attendance_clock_identity_key k ON k.tenant_id=ec.tenant_id
 WHERE ec.source_system='MUNICONTROL' AND ec.status IN('active','inactive')
), cand AS (
 SELECT cp.id punch_id,cp.tenant_id,cp.device_id,re.identity_hmac_sha256 ih,(cp.occurred_at AT TIME ZONE s.timezone)::date dday
 FROM attendance_canonical_punch cp
 JOIN attendance_raw_event re ON re.id=cp.raw_event_id AND re.tenant_id=cp.tenant_id
 JOIN attendance_marking_site s ON s.id=cp.site_id AND s.tenant_id=cp.tenant_id
 WHERE cp.reconciliation_state='unmapped' AND cp.review_state='pending' AND cp.occurred_at>=timestamptz '2026-08-31 00:00:00-03'
)
SELECT c.punch_id,c.tenant_id,c.device_id,c.ih,c.dday,min(h.contract_id::text)::uuid contract_id,count(DISTINCT h.contract_id) n
FROM cand c JOIN hm h ON h.tenant_id=c.tenant_id AND h.ih=c.ih AND h.start_date<=c.dday AND (h.end_date IS NULL OR h.end_date>=c.dday)
GROUP BY 1,2,3,4,5;

-- Un vínculo por persona, reloj y día (como hace la recepción), sólo si no hay otro vínculo activo ese día.
CREATE TEMP TABLE m254_map ON COMMIT DROP AS
SELECT DISTINCT ON (x.tenant_id,x.device_id,x.ih,x.dday) x.tenant_id,x.device_id,x.ih,x.dday,x.contract_id,
 (SELECT m.id FROM attendance_identity_map m WHERE m.tenant_id=x.tenant_id AND m.device_id=x.device_id AND m.identity_hmac_sha256=x.ih AND m.status='active'
   AND m.valid_from<=x.dday AND coalesce(m.valid_to,DATE '9999-12-31')>=x.dday ORDER BY m.id LIMIT 1) existing_id,
 (SELECT count(*) FROM attendance_identity_map m WHERE m.tenant_id=x.tenant_id AND m.device_id=x.device_id AND m.identity_hmac_sha256=x.ih AND m.status='active'
   AND m.valid_from<=x.dday AND coalesce(m.valid_to,DATE '9999-12-31')>=x.dday) existing_count,
 (SELECT cn.created_by_membership_id FROM attendance_connector cn WHERE cn.tenant_id=x.tenant_id AND cn.device_id=x.device_id ORDER BY cn.created_at LIMIT 1) actor
FROM m254_match x WHERE x.n=1 ORDER BY x.tenant_id,x.device_id,x.ih,x.dday;

INSERT INTO attendance_identity_map(tenant_id,device_id,identity_hmac_sha256,employment_contract_id,valid_from,valid_to,created_by_membership_id)
SELECT tenant_id,device_id,ih,contract_id,dday,dday,actor FROM m254_map WHERE existing_count=0 AND actor IS NOT NULL;

UPDATE attendance_canonical_punch cp SET version=cp.version+1,reconciliation_state='mapped',identity_map_id=m.id,employment_contract_id=m.employment_contract_id
FROM m254_match x JOIN attendance_identity_map m ON m.tenant_id=x.tenant_id AND m.device_id=x.device_id AND m.identity_hmac_sha256=x.ih AND m.status='active'
 AND m.valid_from<=x.dday AND coalesce(m.valid_to,DATE '9999-12-31')>=x.dday AND m.employment_contract_id=x.contract_id
WHERE cp.id=x.punch_id AND x.n=1 AND cp.reconciliation_state='unmapped' AND cp.review_state='pending'
 AND (SELECT count(*) FROM attendance_identity_map o WHERE o.tenant_id=x.tenant_id AND o.device_id=x.device_id AND o.identity_hmac_sha256=x.ih AND o.status='active'
   AND o.valid_from<=x.dday AND coalesce(o.valid_to,DATE '9999-12-31')>=x.dday)=1;
