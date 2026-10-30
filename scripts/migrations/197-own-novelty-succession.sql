-- PRIVATE SOURCE CANDIDATE: not executed, installed, admitted or production-ready.
-- Explicit successor of130/176 and canonical125-bound124. No115 reconstruction.
DO $mode$ BEGIN IF current_setting('standard_conforming_strings')<>'on' THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_STRINGS_REQUIRED';END IF;END $mode$;
DO $new_absence$ BEGIN
 IF to_regclass('public.own_novelty_approved_successor_uk') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(ARRAY['own_novelty_active_v1','own_novelty_effective_v1','own_novelty_affected_state_v1','own_novelty_succession_validate_v1','own_novelty_content_v3','own_novelty_capture_source_state_v1','own_novelty_capture_current_v1','own_novelty_succession_context_v1']))
  OR EXISTS(SELECT 1 FROM public.own_payroll_novelty_event WHERE snapshot->>'version'='own-payroll-novelty-batch.v3' OR body->>'version'='own-payroll-novelty-command.v3') THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_ALREADY_PRESENT';END IF;
END $new_absence$;

DO $before_pins$
DECLARE signature text;fingerprint text;configuration text[];volatility "char";lang text;result_value text;argtypes text;argnames text[];defaults_value text;runtime_value boolean;setof_value boolean;f pg_proc;
BEGIN
 FOR signature,fingerprint,configuration,volatility,lang,result_value,argtypes,argnames,defaults_value,runtime_value,setof_value IN SELECT * FROM(VALUES
 ('public.own_novelty_command_v1(jsonb,jsonb,uuid)','f447b8944d701d1aaa03f858a7a13ab5d83bb723d6191c51f54e0343fdb0de44',ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']::text[],'v','plpgsql','jsonb','jsonb, jsonb, uuid',ARRAY['p','body_value','key_value']::text[],NULL::text,true,false),
 ('public.own_novelty_conflict_v1(jsonb,date,text,jsonb)','7277374db616acf40943a00ee85d488bf251902e6df18d15fa411a9fbf63b00c',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','boolean','jsonb, date, text, jsonb',ARRAY['ctx','period_value','type_value','r']::text[],NULL::text,false,false),
 ('public.own_novelty_sources_v1(jsonb,date,text,uuid[])','56ad14cb761541880c1a37ccca2aa8387b7ee20e598ccbcd645309568dfa5253',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','jsonb','jsonb, date, text, uuid[]',ARRAY['p','period_value','type_value','selected']::text[],NULL::text,false,false),
 ('public.own_liquidation_rows_v1(jsonb,public.own_payroll_run_capture)','7220b153509fc944c787104ce52c12af15678b8db29dbebf1dbecb32f993ea25',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','plpgsql','jsonb','jsonb, public.own_payroll_run_capture',ARRAY['ctx','c']::text[],NULL::text,false,false),
 ('public.own_liquidation_state_v1(jsonb,public.own_payroll_run_capture)','5b88bf203e7366bec1f587f31cf42f5c361e3d83bfe0f200c766527533eb6686',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','text','jsonb, public.own_payroll_run_capture',ARRAY['ctx','c']::text[],NULL::text,false,false),
 ('public.own_liquidation_command_v1(jsonb,jsonb,uuid)','575d80c105d2ebf149e914bbfd975f21dbafa8c8bdd64d0eaf3e55ff357b96bc',ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']::text[],'v','plpgsql','jsonb','jsonb, jsonb, uuid',ARRAY['p','body','key']::text[],NULL::text,true,false),
 ('public.own_novelty_context_v1(jsonb,text)','5435b42ea82e6fd2dbe5596b6308c1c94295900f3f36e5cbce95dcbc1994442b',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','jsonb','jsonb, text',ARRAY['p','cap']::text[],'NULL::text',false,false),
 ('public.own_novelty_current_v1(jsonb)','10f9413639371fc6713d36ae7b1f0ff5db1dad488fe1563872f4899ea3b67422',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','public.own_payroll_novelty_event','jsonb',ARRAY['ctx']::text[],NULL::text,false,true),
 ('public.own_novelty_rows_v1(jsonb,date)','e4265156f14b341ec4c20844f9b929b4efeada6a59c9af071ce0f48a22412166',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'i','plpgsql','void','jsonb, date',ARRAY['rows_value','period_value']::text[],NULL::text,false,false),
 ('public.own_novelty_content_v1(jsonb,date,text,jsonb)','5cfb2aa0934fa6db1c6f9150aab6fed75fce303bc60caa9ac4240af0ac7bcca4',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'i','sql','text','jsonb, date, text, jsonb',ARRAY['ctx','period_value','type_value','rows_value']::text[],NULL::text,false,false),
 ('public.own_novelty_view_v1(jsonb,jsonb,uuid[])','e07cbef287d99fe52cf845aa9a58c13482deab02f12ef348c7381acfc5773518',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','jsonb','jsonb, jsonb, uuid[]',ARRAY['ctx','snapshot_value','selected']::text[],'NULL::uuid[]',false,false),
 ('public.own_novelty_receipt_v1(public.own_payroll_novelty_event,boolean)','7740ebda96ab35e6ad225c593155aa5f513ee0401b293c80d2ccab2000b303a2',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','jsonb','public.own_payroll_novelty_event, boolean',ARRAY['e','replayed']::text[],NULL::text,false,false),
 ('public.own_novelty_lock_v1(jsonb)','b13fd67d76cab56b857accba0880e7c26a4b688df79cf3e50ac1b1fe488bf45c',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','void','jsonb',ARRAY['ctx']::text[],NULL::text,false,false),
 ('public.own_novelty_destination_lock_v1(jsonb,date,text,jsonb)','c0e3bf1fd06046034635d26b811c3dced9b5369efea060f00e81c07de7b3753e',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','void','jsonb, date, text, jsonb',ARRAY['ctx','period_value','type_value','r']::text[],NULL::text,false,false),
 ('public.own_novelty_immutable_v1()','0339f43f25c5cfc88b58c06249d81292e35a0c926c002c2d75facbcc4a9c1bc5',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','trigger','',NULL::text[],NULL::text,false,false),
 ('public.own_novelty_legacy_row_v1()','67574fdae58f4a9c71ff5364253efe4c2efcff5e909766bcbfd431b23ab9a39b',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','trigger','',NULL::text[],NULL::text,false,false),
 ('public.own_run_context_v1(jsonb,boolean,boolean)','7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','jsonb','jsonb, boolean, boolean',ARRAY['p','nominal','write_access']::text[],'false, false',false,false),
 ('public.own_run_lock_v1(jsonb)','8bc4c4699b0a633aef50bf9aeb6e1c1d6d1b5da6a3017241056dbad689b862b5',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','void','jsonb',ARRAY['ctx']::text[],NULL::text,false,false),
 ('public.own_run_hash_v1(jsonb)','a6c00700c94b5e07fdf49c00c9ea07212239f46a11f4a921b706367e74c66393',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'i','sql','text','jsonb',ARRAY['v']::text[],NULL::text,false,false),
 ('public.own_close_active_v1(jsonb,text,text)','57ee61a1eefe972e1329b42ce5034f711d77bb1aa1b2c78c38f2582f8577d309',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','jsonb','jsonb, text, text',ARRAY['ctx','period_value','type_value']::text[],NULL::text,false,false),
 ('public.own_close_guard_v1(jsonb,text,text,uuid[])','303b2da7e5d518d9f309911a92538738a2c3ea8c1ef53ddec06d85bac370ae31',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','plpgsql','void','jsonb, text, text, uuid[]',ARRAY['ctx','period_value','type_value','contracts']::text[],NULL::text,false,false),
 ('public.own_liquidation_current_v1(jsonb,text,text)','fbca9a87a49cfe054e5f9d39f117a05f630bdae80b913f3df8c6a39c44f99e48',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','jsonb','jsonb, text, text',ARRAY['ctx','period','payroll_type']::text[],NULL::text,false,false)
 )pins(signature,sha,configuration,volatility,lang,result_value,argtypes,argnames,defaults_value,runtime_value,setof_value) LOOP
 SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure(signature);
 IF f.oid IS NULL OR f.proowner<>current_user::regrole OR NOT f.prosecdef OR f.proisstrict OR f.proretset IS DISTINCT FROM setof_value OR f.prokind<>'f' OR f.proparallel<>'u' OR f.proleakproof OR f.prosupport<>0 OR f.proconfig IS DISTINCT FROM configuration OR f.provolatile<>volatility
  OR f.prolang<>(SELECT oid FROM pg_language WHERE lanname=lang) OR f.prorettype IS DISTINCT FROM to_regtype(result_value) OR ARRAY(SELECT unnest(f.proargtypes::oid[])) IS DISTINCT FROM ARRAY(SELECT to_regtype(t)::oid FROM unnest(string_to_array(argtypes,', ')) t) OR f.proargnames IS DISTINCT FROM argnames OR pg_get_expr(f.proargdefaults,0) IS DISTINCT FROM defaults_value
  OR encode(public.digest(replace(f.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>fingerprint
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee<>f.proowner AND NOT(runtime_value AND a.grantee='municontrol_actions_runtime_app'::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
  OR has_function_privilege('municontrol_actions_runtime_app',f.oid,'EXECUTE') IS DISTINCT FROM runtime_value THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_SOURCE_DRIFT' USING DETAIL=signature;END IF;
 END LOOP;
END $before_pins$;

DO $relation_security$ DECLARE name_value text;t pg_class;item record;BEGIN
 FOREACH name_value IN ARRAY ARRAY['own_payroll_novelty_event','own_payroll_run_capture','own_payroll_run_result','own_payroll_liquidation_event','own_payroll_close_event'] LOOP
 SELECT * INTO t FROM pg_class WHERE oid=to_regclass('public.'||name_value);
 IF t.oid IS NULL OR t.relkind<>'r' OR t.relowner<>current_user::regrole OR NOT t.relrowsecurity OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=t.oid)
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a WHERE a.grantee<>t.relowner)
  OR has_table_privilege('municontrol_actions_runtime_app',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_RELATION_DRIFT' USING DETAIL=name_value;END IF;
 END LOOP;
 FOR item IN SELECT * FROM(VALUES('own_payroll_novelty_event','own_novelty_immutable',27),('own_payroll_novelty_event','own_novelty_no_truncate',34)) v(tab,name,kind) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger trg WHERE trg.tgrelid=to_regclass('public.'||item.tab) AND trg.tgname=item.name AND trg.tgfoid='public.own_novelty_immutable_v1()'::regprocedure AND trg.tgtype=item.kind AND trg.tgenabled='O' AND NOT trg.tgisinternal AND trg.tgnargs=0 AND trg.tgqual IS NULL AND NOT trg.tgdeferrable AND NOT trg.tginitdeferred) THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_RELATION_DRIFT';END IF;
 END LOOP;
IF NOT EXISTS(SELECT 1 FROM pg_trigger trg WHERE trg.tgrelid='public.payroll_novelty_row'::regclass AND trg.tgname='own_novelty_legacy_row' AND trg.tgfoid='public.own_novelty_legacy_row_v1()'::regprocedure AND trg.tgtype=7 AND trg.tgenabled='O' AND NOT trg.tgisinternal AND trg.tgnargs=0 AND trg.tgqual IS NULL AND NOT trg.tgdeferrable AND NOT trg.tginitdeferred) THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_RELATION_DRIFT';END IF;
END $relation_security$;

CREATE UNIQUE INDEX own_novelty_approved_successor_uk ON public.own_payroll_novelty_event(tenant_id,source_binding_id,((snapshot#>>'{supersedes,batchId}')::uuid)) WHERE command='approve' AND status='approved' AND snapshot->>'version'='own-payroll-novelty-batch.v3';

-- Permanent approved edges retire an ancestor; pending/rejected proposals do not.
CREATE FUNCTION public.own_novelty_active_v1(ctx jsonb) RETURNS SETOF public.own_payroll_novelty_event
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $active$
 SELECT x.* FROM public.own_novelty_current_v1(ctx) x WHERE x.status IN('draft','submitted','approved') AND NOT(x.status='approved' AND EXISTS(
  SELECT 1 FROM public.own_payroll_novelty_event a WHERE a.tenant_id=x.tenant_id AND a.source_binding_id=x.source_binding_id AND a.command='approve' AND a.status='approved'
   AND a.snapshot->>'version'='own-payroll-novelty-batch.v3' AND a.snapshot#>>'{supersedes,batchId}'=x.batch_id::text))
$active$;
CREATE FUNCTION public.own_novelty_effective_v1(ctx jsonb) RETURNS SETOF public.own_payroll_novelty_event
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $effective$
 SELECT x.* FROM public.own_novelty_active_v1(ctx) x WHERE x.status='approved'
$effective$;

-- Full scoped history, including captures that did not contain the predecessor.
-- No LIMIT, latest-run shortcut, nominal fields, fabricated cancellation or sum.
CREATE FUNCTION public.own_novelty_affected_state_v1(ctx jsonb,parent_value public.own_payroll_novelty_event) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $affected$
DECLARE ids uuid[];c public.own_payroll_run_capture;r public.own_payroll_run_result;g public.own_payroll_close_event;person jsonb;last_value jsonb;
 captures_value jsonb:='[]';groups_value jsonb:='[]';employees_value jsonb;contracts_value jsonb;state_value text;
BEGIN
 IF parent_value.tenant_id IS DISTINCT FROM(ctx->>'tenantId')::uuid OR parent_value.source_binding_id IS DISTINCT FROM(ctx->>'sourceBindingId')::uuid THEN RAISE EXCEPTION 'OWN_NOVELTY_NOT_FOUND';END IF;
 ids:=ARRAY(SELECT DISTINCT(x#>>'{values,contractId}')::uuid FROM jsonb_array_elements(parent_value.snapshot->'rows') x ORDER BY 1);
 FOR c IN SELECT x.* FROM public.own_payroll_run_capture x WHERE x.tenant_id=parent_value.tenant_id AND x.source_binding_id=parent_value.source_binding_id
  AND x.body->>'period'=to_char(parent_value.period_month,'YYYY-MM') AND x.body->>'liquidationType'=parent_value.payroll_type
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.payload#>'{population,employees}') e WHERE(e->>'contractId')::uuid=ANY(ids)) ORDER BY x.id LOOP
  SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;employees_value:='[]';
  IF c.body_sha256 IS DISTINCT FROM public.own_run_hash_v1(c.body) OR c.payload_sha256 IS DISTINCT FROM public.own_run_hash_v1(c.payload)
   OR r.capture_id IS NOT NULL AND(r.input_sha256 IS DISTINCT FROM public.own_run_hash_v1(r.input) OR r.result_sha256 IS DISTINCT FROM public.own_run_hash_v1(r.result) OR r.algorithm_sha256 IS DISTINCT FROM c.algorithm_sha256) THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_CONTRACT_INVALID';END IF;
  FOR person IN SELECT x FROM jsonb_array_elements(c.payload#>'{population,employees}') x WHERE(x->>'contractId')::uuid=ANY(ids) ORDER BY x->>'contractId' COLLATE "C" LOOP
   SELECT x INTO last_value FROM public.own_payroll_liquidation_event e CROSS JOIN LATERAL jsonb_array_elements(e.changes) x
    WHERE e.tenant_id=c.tenant_id AND e.source_binding_id=c.source_binding_id AND e.capture_id=c.id AND x->>'contractId'=person->>'contractId' ORDER BY(x->>'version')::integer DESC LIMIT 1;
   IF r.capture_id IS NULL AND last_value IS NOT NULL THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_CONTRACT_INVALID';END IF;
   state_value:=CASE WHEN r.capture_id IS NULL THEN 'captured' ELSE coalesce(last_value->>'state','calculated') END;
   employees_value:=employees_value||jsonb_build_array(jsonb_build_object('contractId',person->>'contractId','state',state_value,'version',coalesce((last_value->>'version')::integer,0),'liquidationVersion',(last_value->>'liquidationVersion')::integer));
  END LOOP;
  captures_value:=captures_value||jsonb_build_array(jsonb_build_object('runId',c.id,'bodySha256',c.body_sha256,'payloadSha256',c.payload_sha256,'algorithmSha256',c.algorithm_sha256,'inputSha256',r.input_sha256,'resultSha256',r.result_sha256,'employees',employees_value));
 END LOOP;
 FOR g IN SELECT x.* FROM public.own_payroll_close_event x WHERE x.tenant_id=parent_value.tenant_id AND x.source_binding_id=parent_value.source_binding_id
  AND x.period=to_char(parent_value.period_month,'YYYY-MM') AND x.liquidation_type=parent_value.payroll_type AND x.command='close'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.snapshot->'employees') e WHERE(e->>'contractId')::uuid=ANY(ids)) ORDER BY x.id LOOP
  IF g.snapshot_sha256 IS DISTINCT FROM public.own_run_hash_v1(g.snapshot) OR g.body_sha256 IS DISTINCT FROM public.own_run_hash_v1(g.body) THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_CONTRACT_INVALID';END IF;
  SELECT jsonb_agg(x->>'contractId' ORDER BY x->>'contractId' COLLATE "C") INTO contracts_value FROM jsonb_array_elements(g.snapshot->'employees') x WHERE(x->>'contractId')::uuid=ANY(ids);
  state_value:=CASE WHEN EXISTS(SELECT 1 FROM public.own_payroll_close_event x WHERE x.tenant_id=g.tenant_id AND x.source_binding_id=g.source_binding_id AND x.group_id=g.id AND x.command='reopen') THEN 'reopened' ELSE 'closed' END;
  groups_value:=groups_value||jsonb_build_array(jsonb_build_object('groupId',g.id,'state',state_value,'snapshotSha256',g.snapshot_sha256,'bodySha256',g.body_sha256,'contractIds',contracts_value));
 END LOOP;
 RETURN jsonb_build_object('version','own-payroll-novelty-affected-state.v1','captures',captures_value,'groups',groups_value);
END $affected$;

CREATE FUNCTION public.own_novelty_succession_validate_v1(ctx jsonb,period_value date,type_value text,rows_value jsonb,supersedes_value jsonb,proposal_value uuid) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $validate$
DECLARE parent_value public.own_payroll_novelty_event;ancestor_value public.own_payroll_novelty_event;link_value jsonb;ids uuid[]:='{}';r jsonb;old_value jsonb;
BEGIN
 IF NOT public.own_program_exact_v1(supersedes_value,ARRAY['batchId','expectedRevision','rowsSha256','snapshotSha256']) OR jsonb_typeof(supersedes_value->'batchId') IS DISTINCT FROM 'string'
  OR supersedes_value->>'batchId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(supersedes_value->'expectedRevision') IS DISTINCT FROM 'number' OR supersedes_value->>'expectedRevision'!~'^[1-9][0-9]{0,4}$' OR(supersedes_value->>'expectedRevision')::integer>10000
  OR jsonb_typeof(supersedes_value->'rowsSha256') IS DISTINCT FROM 'string' OR supersedes_value->>'rowsSha256'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(supersedes_value->'snapshotSha256') IS DISTINCT FROM 'string' OR supersedes_value->>'snapshotSha256'!~'^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_INPUT_INVALID';END IF;
 SELECT * INTO parent_value FROM public.own_novelty_effective_v1(ctx) x WHERE x.batch_id=(supersedes_value->>'batchId')::uuid;
 IF NOT FOUND OR parent_value.revision<>(supersedes_value->>'expectedRevision')::integer OR parent_value.snapshot->>'rowsSha256' IS DISTINCT FROM supersedes_value->>'rowsSha256'
  OR public.own_run_hash_v1(parent_value.snapshot) IS DISTINCT FROM supersedes_value->>'snapshotSha256' OR parent_value.period_month IS DISTINCT FROM period_value OR parent_value.payroll_type IS DISTINCT FROM type_value
  OR parent_value.snapshot->>'version' NOT IN('own-payroll-novelty-batch.v1','own-payroll-novelty-batch.v3') THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_PARENT_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM public.own_novelty_current_v1(ctx) x WHERE x.status IN('draft','submitted') AND x.snapshot->>'version'='own-payroll-novelty-batch.v3'
  AND x.snapshot#>>'{supersedes,batchId}'=parent_value.batch_id::text AND x.batch_id IS DISTINCT FROM proposal_value) THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_PENDING';END IF;
 PERFORM public.own_novelty_rows_v1(rows_value,period_value);
 IF jsonb_array_length(rows_value)<>jsonb_array_length(parent_value.snapshot->'rows') OR rows_value=(SELECT jsonb_agg(x->'values' ORDER BY n) FROM jsonb_array_elements(parent_value.snapshot->'rows') WITH ORDINALITY a(x,n)) THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_ROWS_CHANGED';END IF;
 FOR r IN SELECT x FROM jsonb_array_elements(rows_value) x LOOP
  old_value:=parent_value.snapshot->'rows'->((r->>'rowOrdinal')::integer-1)->'values';
  IF r-ARRAY['quantityDecimal','amountCents','legalInstrument','observation'] IS DISTINCT FROM old_value-ARRAY['quantityDecimal','amountCents','legalInstrument','observation'] THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_DESTINATION_CHANGED';END IF;
 END LOOP;
 ancestor_value:=parent_value;
 LOOP
  IF ancestor_value.batch_id=ANY(ids) OR cardinality(ids)>=1000 THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_CONTRACT_INVALID';END IF;ids:=array_append(ids,ancestor_value.batch_id);
  EXIT WHEN ancestor_value.snapshot->>'version'<>'own-payroll-novelty-batch.v3';link_value:=ancestor_value.snapshot->'supersedes';
  SELECT * INTO ancestor_value FROM public.own_payroll_novelty_event x WHERE x.tenant_id=parent_value.tenant_id AND x.source_binding_id=parent_value.source_binding_id
   AND x.batch_id=(link_value->>'batchId')::uuid AND x.revision=(link_value->>'expectedRevision')::integer AND x.status='approved';
  IF NOT FOUND OR ancestor_value.snapshot->>'rowsSha256' IS DISTINCT FROM link_value->>'rowsSha256' OR public.own_run_hash_v1(ancestor_value.snapshot) IS DISTINCT FROM link_value->>'snapshotSha256' THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_CONTRACT_INVALID';END IF;
 END LOOP;RETURN ids;
END $validate$;

CREATE FUNCTION public.own_novelty_content_v3(ctx jsonb,p_period date,p_type text,rows_value jsonb,supersedes_value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $content$
 SELECT public.own_run_hash_v1(jsonb_build_object('contractVersion','own-payroll-novelty-content.v3','tenantId',ctx->>'tenantId','certifiedBindingId',ctx->>'certifiedBindingId','periodMonth',to_char(p_period,'YYYY-MM-DD'),'payrollType',p_type,'supersedes',supersedes_value,
 'rows',(SELECT jsonb_agg(r-'rowOrdinal' ORDER BY concat_ws(chr(31),r->>'contractId',r->>'conceptSourceId',coalesce(r->>'costCenterSourceId',''),coalesce(r->>'adjustmentMonth',''),coalesce(r->>'movementType','')) COLLATE "C",(r-'rowOrdinal')::text COLLATE "C") FROM jsonb_array_elements(rows_value) r)))
$content$;

-- This state is source lineage only; it never changes a capture or finance state.
CREATE FUNCTION public.own_novelty_capture_source_state_v1(ctx jsonb,c public.own_payroll_run_capture,target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $source_state$
DECLARE captured_value jsonb;effective_value jsonb;edges_value jsonb;
BEGIN
 IF c.tenant_id IS DISTINCT FROM(ctx->>'tenantId')::uuid OR c.source_binding_id IS DISTINCT FROM(ctx->>'sourceBindingId')::uuid THEN RAISE EXCEPTION 'OWN_NOVELTY_NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('batchId',b->>'id','revision',b->'revision','rowsSha256',b->>'rowsSha256') ORDER BY b->>'id' COLLATE "C"),'[]') INTO captured_value
  FROM jsonb_array_elements(coalesce(c.payload#>'{monthly,nativeBatches}','[]')) b WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(b->'rows') r WHERE r#>>'{values,contractId}'=target::text);
 SELECT coalesce(jsonb_agg(jsonb_build_object('batchId',e.batch_id,'revision',e.revision,'rowsSha256',e.snapshot->>'rowsSha256') ORDER BY e.batch_id),'[]') INTO effective_value
  FROM public.own_novelty_effective_v1(ctx) e WHERE e.period_month=(c.body->>'period'||'-01')::date AND e.payroll_type=c.body->>'liquidationType' AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.snapshot->'rows') r WHERE r#>>'{values,contractId}'=target::text);
 SELECT coalesce(jsonb_agg(jsonb_build_object('eventId',e.id,'batchId',e.batch_id,'revision',e.revision,'supersedes',e.snapshot->'supersedes') ORDER BY e.id),'[]') INTO edges_value
  FROM public.own_payroll_novelty_event e WHERE e.tenant_id=c.tenant_id AND e.source_binding_id=c.source_binding_id AND e.period_month=(c.body->>'period'||'-01')::date AND e.payroll_type=c.body->>'liquidationType'
   AND e.command='approve' AND e.status='approved' AND e.snapshot->>'version'='own-payroll-novelty-batch.v3' AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.snapshot->'rows') r WHERE r#>>'{values,contractId}'=target::text);
 RETURN jsonb_build_object('contractId',target,'captured',captured_value,'effective',effective_value,'approvedEdges',edges_value);
END $source_state$;
CREATE FUNCTION public.own_novelty_capture_current_v1(ctx jsonb,c public.own_payroll_run_capture,target uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capture_current$
DECLARE s jsonb;BEGIN s:=public.own_novelty_capture_source_state_v1(ctx,c,target);
 -- Preserve the legacy domain when no succession has ever affected this scope.
 RETURN s->'approvedEdges'='[]'::jsonb OR s->'captured'=s->'effective';
END $capture_current$;

CREATE FUNCTION public.own_novelty_succession_context_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $context$
DECLARE ctx jsonb;e public.own_payroll_novelty_event;pending_value public.own_payroll_novelty_event;approved_value public.own_payroll_novelty_event;
 affected_value jsonb;supersedes_value jsonb;blocking_value jsonb;identity_value boolean;effective_value boolean;value jsonb;
BEGIN
 ctx:=public.own_novelty_context_v1(p);
 IF NOT(public.action_center_context_has_capability(ctx,'payroll.novelty.prepare') OR public.action_center_context_has_capability(ctx,'payroll.novelty.approve')) THEN RAISE EXCEPTION 'OWN_NOVELTY_FORBIDDEN';END IF;
 PERFORM public.own_run_lock_v1(ctx);PERFORM public.own_novelty_lock_v1(ctx);
 SELECT * INTO e FROM public.own_payroll_novelty_event x WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.batch_id=target AND x.command='approve' AND x.status='approved' ORDER BY x.revision DESC LIMIT 1;IF NOT FOUND THEN RAISE EXCEPTION 'OWN_NOVELTY_NOT_FOUND';END IF;
 supersedes_value:=jsonb_build_object('batchId',e.batch_id,'expectedRevision',e.revision,'rowsSha256',e.snapshot->>'rowsSha256','snapshotSha256',public.own_run_hash_v1(e.snapshot));
 affected_value:=public.own_novelty_affected_state_v1(ctx,e);
 SELECT x.* INTO pending_value FROM public.own_novelty_current_v1(ctx) x WHERE x.status IN('draft','submitted') AND x.snapshot->>'version'='own-payroll-novelty-batch.v3' AND x.snapshot#>>'{supersedes,batchId}'=target::text;
 IF(SELECT count(*) FROM public.own_novelty_current_v1(ctx) x WHERE x.status IN('draft','submitted') AND x.snapshot->>'version'='own-payroll-novelty-batch.v3' AND x.snapshot#>>'{supersedes,batchId}'=target::text)>1 THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_CONTRACT_INVALID';END IF;
 SELECT x.* INTO approved_value FROM public.own_payroll_novelty_event x WHERE x.tenant_id=e.tenant_id AND x.source_binding_id=e.source_binding_id AND x.command='approve' AND x.status='approved' AND x.snapshot->>'version'='own-payroll-novelty-batch.v3' AND x.snapshot#>>'{supersedes,batchId}'=target::text;
 identity_value:=NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.own_novelty_view_v1(ctx,e.snapshot)->'rows') r WHERE r->'identityCurrent' IS DISTINCT FROM 'true'::jsonb);
 effective_value:=EXISTS(SELECT 1 FROM public.own_novelty_effective_v1(ctx) x WHERE x.batch_id=e.batch_id);
 SELECT coalesce(jsonb_agg(v ORDER BY v->>'kind' COLLATE "C",v->>'id' COLLATE "C"),'[]') INTO blocking_value FROM(
  SELECT jsonb_build_object('kind','confirmed','id',c->>'runId','contractIds',(SELECT jsonb_agg(x->>'contractId' ORDER BY x->>'contractId' COLLATE "C") FROM jsonb_array_elements(c->'employees') x WHERE x->>'state'='confirmed')) v FROM jsonb_array_elements(affected_value->'captures') c WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(c->'employees') x WHERE x->>'state'='confirmed')
  UNION ALL SELECT jsonb_build_object('kind','closed','id',g->>'groupId','contractIds',g->'contractIds') FROM jsonb_array_elements(affected_value->'groups') g WHERE g->>'state'='closed') z;
 value:=jsonb_build_object('version','own-payroll-novelty-succession-context.v1','batch',e.snapshot,'snapshotSha256',public.own_run_hash_v1(e.snapshot),'effective',effective_value,'identitiesCurrent',identity_value,
  'canPrepare',effective_value AND identity_value AND pending_value.id IS NULL AND public.action_center_context_has_capability(ctx,'payroll.novelty.prepare'),
  'pendingSuccessor',CASE WHEN pending_value.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('batchId',pending_value.batch_id,'revision',pending_value.revision,'status',pending_value.status) END,
  'approvedSuccessor',CASE WHEN approved_value.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('batchId',approved_value.batch_id,'revision',approved_value.revision,'status','approved') END,'blockingUses',blocking_value,
  'affectedState',affected_value,'affectedStateVersion',public.own_run_hash_v1(jsonb_build_object('version','own-payroll-novelty-affected-state-scope.v1','supersedes',supersedes_value,'affectedState',affected_value)));
 IF octet_length(value::text)+8192>4194304 THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;RETURN value;
END $context$;


CREATE OR REPLACE FUNCTION public.own_novelty_command_v1(p jsonb,body_value jsonb,key_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_payroll_novelty_event;prior public.own_payroll_novelty_event;batch uuid;revision_value integer;status_value text;period_value date;type_value text;command_value text:=body_value->>'command';content_value text;r jsonb;s jsonb;rows_value jsonb:='[]';snapshot_value jsonb;actor_value jsonb;ref text;v3 boolean:=coalesce(body_value->>'version'='own-payroll-novelty-command.v3',false);lineage uuid[]:='{}';parent_value public.own_payroll_novelty_event;affected_value jsonb;affected_sha text;
BEGIN
 IF command_value IS NULL OR command_value NOT IN('prepare','submit','approve','reject','cancel') OR body_value->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR key_value IS NULL OR key_value::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body_value::text)>4194304 THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
 ctx:=public.own_novelty_context_v1(p,CASE WHEN command_value IN('approve','reject') THEN 'payroll.novelty.approve' ELSE 'payroll.novelty.prepare' END);
 SELECT * INTO prior FROM public.own_payroll_novelty_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key_value;
 IF FOUND THEN IF prior.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR prior.actor_email<>ctx->>'actorEmail' OR prior.body<>body_value OR prior.request_sha256<>public.own_run_hash_v1(body_value) THEN RAISE EXCEPTION 'OWN_NOVELTY_IDEMPOTENCY_REUSE';END IF;RETURN public.own_novelty_receipt_v1(prior,true);END IF;
 IF command_value IN('approve','cancel') THEN PERFORM public.own_run_lock_v1(ctx);END IF;PERFORM public.own_novelty_lock_v1(ctx);
 SELECT * INTO prior FROM public.own_payroll_novelty_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key_value;
 IF FOUND THEN IF prior.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR prior.actor_email<>ctx->>'actorEmail' OR prior.body<>body_value OR prior.request_sha256<>public.own_run_hash_v1(body_value) THEN RAISE EXCEPTION 'OWN_NOVELTY_IDEMPOTENCY_REUSE';END IF;RETURN public.own_novelty_receipt_v1(prior,true);END IF;
 actor_value:=jsonb_build_object('membershipId',ctx->>'membershipId','personId',ctx->>'actorPersonId');
 IF command_value='prepare' THEN
  IF NOT public.own_program_exact_v1(body_value,ARRAY['command','periodMonth','payrollType','rows','reviewConfirmed']||CASE WHEN v3 THEN ARRAY['version','supersedes','correctionReason'] ELSE ARRAY[]::text[] END) OR jsonb_typeof(body_value->'periodMonth') IS DISTINCT FROM 'string' OR coalesce(body_value->>'periodMonth','')!~'^20(0[8-9]|[1-9][0-9])-(0[1-9]|1[0-2])-01$' OR jsonb_typeof(body_value->'payrollType') IS DISTINCT FROM 'string' OR body_value->>'payrollType' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
  period_value:=(body_value->>'periodMonth')::date;type_value:=body_value->>'payrollType';PERFORM public.own_novelty_rows_v1(body_value->'rows',period_value);
   IF v3 THEN
    IF jsonb_typeof(body_value->'correctionReason') IS DISTINCT FROM 'string' OR length(body_value->>'correctionReason') NOT BETWEEN 10 AND 500 OR btrim(body_value->>'correctionReason')<>body_value->>'correctionReason' OR normalize(body_value->>'correctionReason',NFC)<>body_value->>'correctionReason' OR body_value->>'correctionReason'~'[[:cntrl:]<>]' THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_INPUT_INVALID';END IF;
    lineage:=public.own_novelty_succession_validate_v1(ctx,period_value,type_value,body_value->'rows',body_value->'supersedes',NULL);
   END IF;
  content_value:=CASE WHEN v3 THEN public.own_novelty_content_v3(ctx,period_value,type_value,body_value->'rows',body_value->'supersedes') ELSE public.own_novelty_content_v1(ctx,period_value,type_value,body_value->'rows') END;PERFORM pg_advisory_xact_lock(hashtextextended('payroll-novelty-active:'||content_value,0));
  IF EXISTS(SELECT 1 FROM public.own_novelty_current_v1(ctx) x WHERE x.status IN('draft','submitted','approved') AND x.content_sha256=content_value) OR EXISTS(SELECT 1 FROM public.payroll_novelty_batch b WHERE b.tenant_id=(ctx->>'tenantId')::uuid AND b.certified_binding_id=(ctx->>'sourceBindingId')::uuid AND b.status IN('draft','submitted','approved') AND btrim(b.content_sha256)=content_value) THEN RAISE EXCEPTION 'OWN_NOVELTY_DUPLICATE_BATCH';END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(body_value->'rows') ORDER BY value->>'contractId',value->>'conceptSourceId',value->>'costCenterSourceId',value->>'adjustmentMonth',value->>'movementType' LOOP
   PERFORM public.own_novelty_destination_lock_v1(ctx,period_value,type_value,r);
   IF (NOT v3 AND public.own_novelty_conflict_v1(ctx,period_value,type_value,r)) OR (v3 AND EXISTS(SELECT 1 FROM public.own_novelty_active_v1(ctx) x CROSS JOIN LATERAL jsonb_array_elements(x.snapshot->'rows') old_row WHERE NOT(x.batch_id=ANY(lineage)) AND x.batch_id IS DISTINCT FROM NULL::uuid AND x.period_month=period_value AND x.payroll_type=type_value AND old_row#>>'{values,contractId}'=r->>'contractId' AND old_row#>>'{values,conceptSourceId}'=r->>'conceptSourceId' AND old_row#>>'{values,costCenterSourceId}' IS NOT DISTINCT FROM r->>'costCenterSourceId' AND old_row#>>'{values,adjustmentMonth}' IS NOT DISTINCT FROM r->>'adjustmentMonth' AND old_row#>>'{values,movementType}' IS NOT DISTINCT FROM r->>'movementType')) OR EXISTS(SELECT 1 FROM public.payroll_novelty_row nr JOIN public.payroll_novelty_batch nb ON nb.id=nr.batch_id WHERE nb.tenant_id=(ctx->>'tenantId')::uuid AND nb.certified_binding_id=(ctx->>'sourceBindingId')::uuid AND nb.status IN('draft','submitted','approved') AND nb.period_month=period_value AND nb.payroll_type=type_value AND nr.employment_contract_id=(r->>'contractId')::uuid AND nr.concept_source_id=r->>'conceptSourceId' AND nr.cost_center_source_id IS NOT DISTINCT FROM r->>'costCenterSourceId' AND nr.adjustment_month IS NOT DISTINCT FROM (r->>'adjustmentMonth')::date AND nr.movement_type IS NOT DISTINCT FROM r->>'movementType') THEN RAISE EXCEPTION 'OWN_NOVELTY_CONFLICT';END IF;
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(body_value->'rows') LOOP s:=public.payroll_novelty_native_subject_v2(ctx,r,period_value,true);rows_value:=rows_value||jsonb_build_array(jsonb_build_object('values',r,'subject',s,'identityCurrent',true));END LOOP;
  batch:=gen_random_uuid();revision_value:=1;status_value:='draft';
  snapshot_value:=jsonb_build_object('version',CASE WHEN v3 THEN 'own-payroll-novelty-batch.v3' ELSE 'own-payroll-novelty-batch.v1' END,'id',batch,'revision',1,'status','draft','periodMonth',to_char(period_value,'YYYY-MM-DD'),'payrollType',type_value,'rows',rows_value,'rowCount',jsonb_array_length(rows_value),'rowsSha256',public.own_run_hash_v1((SELECT jsonb_agg(x-'identityCurrent' ORDER BY ord) FROM jsonb_array_elements(rows_value) WITH ORDINALITY a(x,ord))),'preparedBy',actor_value,'decidedBy',NULL,'approvals','[]'::jsonb,'grhMutation',false,'payrollCalculated',false,'payrollPosted',false)||CASE WHEN v3 THEN jsonb_build_object('supersedes',body_value->'supersedes','correctionReason',body_value->'correctionReason') ELSE '{}'::jsonb END;
 ELSE
  IF NOT public.own_program_exact_v1(body_value,ARRAY['command','batchId','expectedRevision','reasonReference','reviewConfirmed']||CASE WHEN v3 THEN ARRAY['version','affectedStateVersion'] ELSE ARRAY[]::text[] END) OR jsonb_typeof(body_value->'batchId') IS DISTINCT FROM 'string' OR coalesce(body_value->>'batchId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body_value->'expectedRevision') IS DISTINCT FROM 'number' OR coalesce(body_value->>'expectedRevision','')!~'^[1-9][0-9]{0,4}$' THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
  ref:=body_value->>'reasonReference';IF command_value IN('reject','cancel') THEN IF jsonb_typeof(body_value->'reasonReference') IS DISTINCT FROM 'string' OR coalesce(ref,'')!~'^ref:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;ELSIF body_value->'reasonReference' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'OWN_NOVELTY_INPUT_INVALID';END IF;
  batch:=(body_value->>'batchId')::uuid;SELECT * INTO e FROM public.own_novelty_current_v1(ctx) WHERE batch_id=batch;IF NOT FOUND THEN RAISE EXCEPTION 'OWN_NOVELTY_NOT_FOUND';END IF;
   IF (e.snapshot->>'version'='own-payroll-novelty-batch.v3') IS DISTINCT FROM v3 THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_VERSION_REQUIRED';END IF;
   IF v3 AND((command_value='approve' AND(jsonb_typeof(body_value->'affectedStateVersion') IS DISTINCT FROM 'string' OR body_value->>'affectedStateVersion'!~'^[a-f0-9]{64}$')) OR(command_value<>'approve' AND body_value->'affectedStateVersion' IS DISTINCT FROM 'null'::jsonb)) THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_INPUT_INVALID';END IF;
  IF e.revision<>(body_value->>'expectedRevision')::integer THEN RAISE EXCEPTION 'OWN_NOVELTY_VERSION_CHANGED';END IF;
  IF command_value IN('submit','cancel') AND(e.snapshot#>>'{preparedBy,personId}'<>ctx->>'actorPersonId' OR e.snapshot#>>'{preparedBy,membershipId}'<>ctx->>'membershipId') THEN RAISE EXCEPTION 'OWN_NOVELTY_FORBIDDEN';END IF;
  IF command_value IN('approve','reject') AND(e.snapshot#>>'{preparedBy,personId}'=ctx->>'actorPersonId' OR e.snapshot#>>'{preparedBy,membershipId}'=ctx->>'membershipId') THEN RAISE EXCEPTION 'OWN_NOVELTY_INDEPENDENT_REQUIRED';END IF;
  IF command_value='approve' AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.snapshot->'approvals') reviewer WHERE reviewer->>'personId'=ctx->>'actorPersonId' OR reviewer->>'membershipId'=ctx->>'membershipId') THEN RAISE EXCEPTION 'OWN_NOVELTY_INDEPENDENT_REQUIRED';END IF;
  IF command_value='submit' AND e.status<>'draft' OR command_value IN('approve','reject') AND e.status<>'submitted' OR command_value='cancel' AND e.status NOT IN('draft','submitted','approved') THEN RAISE EXCEPTION 'OWN_NOVELTY_STATE_INVALID';END IF;
  IF command_value='cancel' THEN
   PERFORM public.own_run_lock_v1(ctx);LOCK TABLE public.own_payroll_run_capture IN SHARE MODE NOWAIT;
   IF EXISTS(SELECT 1 FROM public.own_payroll_run_capture c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.payload#>'{monthly,nativeBatches}','[]')) b WHERE c.tenant_id=e.tenant_id AND c.source_binding_id=e.source_binding_id AND b->>'id'=batch::text) THEN RAISE EXCEPTION 'OWN_NOVELTY_IN_USE';END IF;
    IF v3 AND e.status='approved' THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSOR_EFFECTIVE';END IF;
  END IF;
  snapshot_value:=public.own_novelty_view_v1(ctx,e.snapshot);IF command_value IN('submit','approve') AND EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot_value->'rows') row_item WHERE row_item->'identityCurrent' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'OWN_NOVELTY_IDENTITY_CHANGED';END IF;
   IF v3 AND command_value IN('submit','approve') THEN
    period_value:=e.period_month;type_value:=e.payroll_type;
    lineage:=public.own_novelty_succession_validate_v1(ctx,period_value,type_value,(SELECT jsonb_agg(x->'values' ORDER BY n) FROM jsonb_array_elements(e.snapshot->'rows') WITH ORDINALITY a(x,n)),e.snapshot->'supersedes',e.batch_id);
    FOR r IN SELECT x->'values' FROM jsonb_array_elements(e.snapshot->'rows') x ORDER BY x#>>'{values,contractId}',x#>>'{values,conceptSourceId}',x#>>'{values,costCenterSourceId}',x#>>'{values,adjustmentMonth}',x#>>'{values,movementType}' LOOP
     PERFORM public.own_novelty_destination_lock_v1(ctx,period_value,type_value,r);IF EXISTS(SELECT 1 FROM public.own_novelty_active_v1(ctx) x CROSS JOIN LATERAL jsonb_array_elements(x.snapshot->'rows') old_row WHERE NOT(x.batch_id=ANY(lineage)) AND x.batch_id IS DISTINCT FROM e.batch_id AND x.period_month=period_value AND x.payroll_type=type_value AND old_row#>>'{values,contractId}'=r->>'contractId' AND old_row#>>'{values,conceptSourceId}'=r->>'conceptSourceId' AND old_row#>>'{values,costCenterSourceId}' IS NOT DISTINCT FROM r->>'costCenterSourceId' AND old_row#>>'{values,adjustmentMonth}' IS NOT DISTINCT FROM r->>'adjustmentMonth' AND old_row#>>'{values,movementType}' IS NOT DISTINCT FROM r->>'movementType') OR EXISTS(SELECT 1 FROM public.payroll_novelty_row nr JOIN public.payroll_novelty_batch nb ON nb.id=nr.batch_id WHERE nb.tenant_id=(ctx->>'tenantId')::uuid AND nb.certified_binding_id=(ctx->>'sourceBindingId')::uuid AND nb.status IN('draft','submitted','approved') AND nb.period_month=period_value AND nb.payroll_type=type_value AND nr.employment_contract_id=(r->>'contractId')::uuid AND nr.concept_source_id=r->>'conceptSourceId' AND nr.cost_center_source_id IS NOT DISTINCT FROM r->>'costCenterSourceId' AND nr.adjustment_month IS NOT DISTINCT FROM (r->>'adjustmentMonth')::date AND nr.movement_type IS NOT DISTINCT FROM r->>'movementType') THEN RAISE EXCEPTION 'OWN_NOVELTY_CONFLICT';END IF;
    END LOOP;
    IF command_value='approve' THEN
     -- Canonical own_run lock was acquired before own_novelty lock.
     LOCK TABLE public.own_payroll_run_capture,public.own_payroll_run_result,public.own_payroll_liquidation_event,public.own_payroll_close_event IN SHARE MODE NOWAIT;
     SELECT * INTO STRICT parent_value FROM public.own_novelty_current_v1(ctx) x WHERE x.batch_id=(e.snapshot#>>'{supersedes,batchId}')::uuid;
     affected_value:=public.own_novelty_affected_state_v1(ctx,parent_value);
     affected_sha:=public.own_run_hash_v1(jsonb_build_object('version','own-payroll-novelty-affected-state-scope.v1','supersedes',e.snapshot->'supersedes','affectedState',affected_value));
     IF affected_sha IS DISTINCT FROM body_value->>'affectedStateVersion' THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_AFFECTED_STATE_CHANGED';END IF;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(affected_value->'captures') c CROSS JOIN LATERAL jsonb_array_elements(c->'employees') x WHERE x->>'state'='confirmed') OR EXISTS(SELECT 1 FROM jsonb_array_elements(affected_value->'groups') g WHERE g->>'state'='closed') THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_ACTIVE_USE';END IF;
    END IF;
   END IF;
   revision_value:=e.revision+1;status_value:=CASE command_value WHEN 'submit' THEN 'submitted' WHEN 'approve' THEN CASE WHEN jsonb_array_length(e.snapshot->'approvals')=0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.snapshot->'rows') row_item WHERE row_item#>'{values,forced}'='true'::jsonb) THEN 'submitted' ELSE 'approved' END WHEN 'reject' THEN 'rejected' ELSE 'cancelled' END;period_value:=e.period_month;type_value:=e.payroll_type;content_value:=e.content_sha256;
  snapshot_value:=e.snapshot||jsonb_build_object('revision',revision_value,'status',status_value,'approvals',CASE WHEN command_value='approve' THEN(e.snapshot->'approvals')||jsonb_build_array(actor_value) ELSE e.snapshot->'approvals' END,'decidedBy',CASE WHEN command_value='reject' OR command_value='approve' AND status_value='approved' THEN actor_value ELSE e.snapshot->'decidedBy' END);
 END IF;
 -- A committed command must have a recoverable complete receipt within the
 -- existing serverless response budget, including its original body.
 IF revision_value>10000 OR octet_length(snapshot_value::text)+octet_length(body_value::text)+8192>4194304 OR (SELECT count(*) FROM public.own_novelty_current_v1(ctx))>=1000 AND command_value='prepare' THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-novelty:capacity:v1',0)) THEN RAISE EXCEPTION 'OWN_NOVELTY_BUSY';END IF;
 IF (SELECT coalesce(sum(octet_length(snapshot::text)+octet_length(body::text)),0) FROM public.own_payroll_novelty_event)+octet_length(snapshot_value::text)+octet_length(body_value::text)>536870912 THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;
 INSERT INTO public.own_payroll_novelty_event(tenant_id,source_binding_id,batch_id,revision,command,status,period_month,payroll_type,content_sha256,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,request_key,request_sha256,body,snapshot) VALUES((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,batch,revision_value,command_value,status_value,period_value,type_value,content_value,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key_value,public.own_run_hash_v1(body_value),body_value,snapshot_value) RETURNING * INTO e;
 RETURN public.own_novelty_receipt_v1(e,false);END $$;

CREATE OR REPLACE FUNCTION public.own_novelty_conflict_v1(ctx jsonb,period_value date,type_value text,r jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.own_novelty_active_v1(ctx) e CROSS JOIN LATERAL jsonb_array_elements(e.snapshot->'rows') old WHERE e.status IN('draft','submitted','approved') AND e.period_month=period_value AND e.payroll_type=type_value AND old#>>'{values,contractId}'=r->>'contractId' AND old#>>'{values,conceptSourceId}'=r->>'conceptSourceId' AND old#>>'{values,costCenterSourceId}' IS NOT DISTINCT FROM r->>'costCenterSourceId' AND old#>>'{values,adjustmentMonth}' IS NOT DISTINCT FROM r->>'adjustmentMonth' AND old#>>'{values,movementType}' IS NOT DISTINCT FROM r->>'movementType')
$$;

CREATE OR REPLACE FUNCTION public.own_novelty_sources_v1(p jsonb,period_value date,type_value text,selected uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.own_payroll_novelty_event;s jsonb;result_value jsonb:='[]';BEGIN ctx:=public.own_run_context_v1(p,true,true);
 LOCK TABLE public.own_payroll_novelty_event IN SHARE MODE NOWAIT;
 FOR e IN SELECT x.* FROM public.own_novelty_effective_v1(ctx) x WHERE x.status='approved' AND x.period_month=period_value AND x.payroll_type=type_value AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.snapshot->'rows') r WHERE (r#>>'{values,contractId}')::uuid=ANY(selected)) ORDER BY x.batch_id LOOP
  s:=public.own_novelty_view_v1(ctx,e.snapshot,selected);IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'rows') r WHERE (r#>>'{values,contractId}')::uuid=ANY(selected) AND r->'identityCurrent' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'OWN_NOVELTY_IDENTITY_CHANGED';END IF;
  result_value:=result_value||jsonb_build_array(s);
 END LOOP;IF octet_length(result_value::text)>4194304 THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;RETURN result_value;END $$;

CREATE OR REPLACE FUNCTION public.own_liquidation_rows_v1(ctx jsonb,c public.own_payroll_run_capture) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE person jsonb;last_change jsonb;events jsonb;blocked uuid;rows_value jsonb:='[]';active jsonb;state text;revision integer;liquidation integer;allowed jsonb;independent boolean;BEGIN
 active:=public.own_liquidation_current_v1(ctx,c.body->>'period',c.body->>'liquidationType');
 independent:=c.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid AND c.actor_membership_id IS DISTINCT FROM(ctx->>'membershipId')::uuid AND c.actor_email IS DISTINCT FROM ctx->>'actorEmail';
 FOR person IN SELECT value FROM jsonb_array_elements((SELECT input->'employees' FROM public.own_payroll_run_result WHERE capture_id=c.id)) ORDER BY value->>'contractId' LOOP
  SELECT x.value INTO last_change FROM public.own_payroll_liquidation_event e CROSS JOIN LATERAL jsonb_array_elements(e.changes) x WHERE e.capture_id=c.id AND x.value->>'contractId'=person->>'contractId' ORDER BY(x.value->>'version')::integer DESC LIMIT 1;
  state:=coalesce(last_change->>'state','calculated');revision:=coalesce((last_change->>'version')::integer,0);liquidation:=(last_change->>'liquidationVersion')::integer;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'command',e.command,'version',x.value->'version','liquidationVersion',x.value->'liquidationVersion','recordedAt',e.recorded_at,'actorLabel',e.actor_label,'reason',e.body->>'reason') ORDER BY(x.value->>'version')::integer),'[]') INTO events FROM public.own_payroll_liquidation_event e CROSS JOIN LATERAL jsonb_array_elements(e.changes) x WHERE e.capture_id=c.id AND x.value->>'contractId'=person->>'contractId';
  SELECT(value->>'runId')::uuid INTO blocked FROM jsonb_array_elements(active) WHERE value->>'contractId'=person->>'contractId' AND value->>'state'='confirmed' AND value->>'runId'<>c.id::text;
  allowed:='[]';IF state='calculated' AND independent AND blocked IS NULL AND public.action_center_context_has_capability(ctx,'payroll.calculation.approve') AND public.own_novelty_capture_current_v1(ctx,c,(person->>'contractId')::uuid) THEN allowed:=allowed||'"confirm"'::jsonb;END IF;
  IF state='confirmed' AND independent AND public.action_center_context_has_capability(ctx,'payroll.calculation.approve') THEN allowed:=allowed||'"annul"'::jsonb;END IF;
  IF state='calculated' AND c.actor_person_id=(ctx->>'actorPersonId')::uuid AND c.actor_membership_id=(ctx->>'membershipId')::uuid AND c.actor_email=ctx->>'actorEmail' AND public.action_center_context_has_capability(ctx,'payroll.calculation.prepare') THEN allowed:=allowed||'"cancel"'::jsonb;END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.own_close_active_v1(ctx,c.body->>'period',c.body->>'liquidationType')) g CROSS JOIN LATERAL jsonb_array_elements(g.value#>'{snapshot,employees}') e WHERE e.value->>'contractId'=person->>'contractId') THEN allowed:='[]';END IF;
  rows_value:=rows_value||jsonb_build_array(jsonb_build_object('contractId',person->>'contractId','state',state,'version',revision,'liquidationVersion',liquidation,'blockedBy',blocked,'allowedCommands',allowed,'events',events));
 END LOOP;RETURN rows_value;END $$;

CREATE OR REPLACE FUNCTION public.own_liquidation_state_v1(ctx jsonb,c public.own_payroll_run_capture) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.payload#>'{population,employees}') person WHERE public.own_novelty_capture_source_state_v1(ctx,c,(person->>'contractId')::uuid)->'approvedEdges'<>'[]'::jsonb) THEN public.own_run_hash_v1(jsonb_build_object('scopeVersion',public.native_salary_scope_v1(ctx),'runId',c.id,'resultSha256',(SELECT result_sha256 FROM public.own_payroll_run_result WHERE capture_id=c.id),'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'bodySha256',e.body_sha256) ORDER BY e.id),'[]') FROM public.own_payroll_liquidation_event e JOIN public.own_payroll_run_capture r ON r.id=e.capture_id WHERE e.tenant_id=c.tenant_id AND e.source_binding_id=c.source_binding_id AND r.body->>'period'=c.body->>'period' AND r.body->>'liquidationType'=c.body->>'liquidationType'))) ELSE public.own_run_hash_v1(jsonb_build_object('version','own-liquidation-state-succession.v1','legacyState',public.own_run_hash_v1(jsonb_build_object('scopeVersion',public.native_salary_scope_v1(ctx),'runId',c.id,'resultSha256',(SELECT result_sha256 FROM public.own_payroll_run_result WHERE capture_id=c.id),'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'bodySha256',e.body_sha256) ORDER BY e.id),'[]') FROM public.own_payroll_liquidation_event e JOIN public.own_payroll_run_capture r ON r.id=e.capture_id WHERE e.tenant_id=c.tenant_id AND e.source_binding_id=c.source_binding_id AND r.body->>'period'=c.body->>'period' AND r.body->>'liquidationType'=c.body->>'liquidationType'))),'nativeNoveltySources',(SELECT jsonb_agg(public.own_novelty_capture_source_state_v1(ctx,c,(person->>'contractId')::uuid) ORDER BY person->>'contractId' COLLATE "C") FROM jsonb_array_elements(c.payload#>'{population,employees}') person))) END $$;

CREATE OR REPLACE FUNCTION public.own_liquidation_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;c public.own_payroll_run_capture;e public.own_payroll_liquidation_event;r public.own_payroll_run_result;rows_value jsonb;person jsonb;row_value jsonb;selection jsonb;changes jsonb:='[]';chosen text[]:='{}';kind text;val text;command text;fingerprint text;revision integer;liquidation integer;event_id uuid:=gen_random_uuid();at_time timestamptz:=clock_timestamp();receipt_value jsonb;BEGIN
 IF NOT public.own_program_exact_v1(body,ARRAY['runId','resultSha256','scopeVersion','stateVersion','command','selection','reason','reviewConfirmed']) OR jsonb_typeof(body->'runId') IS DISTINCT FROM 'string' OR(body->>'runId')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(body->'command') IS DISTINCT FROM 'string' OR body->>'command' NOT IN('confirm','annul','cancel') OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>524288 OR body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR length(body->>'reason') NOT BETWEEN 10 AND 500 OR btrim(body->>'reason')<>body->>'reason' OR body->>'reason'~'[[:cntrl:]]' THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;
 FOREACH val IN ARRAY ARRAY['resultSha256','scopeVersion','stateVersion'] LOOP IF jsonb_typeof(body->val) IS DISTINCT FROM 'string' OR body->>val!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;END LOOP;
 command:=body->>'command';ctx:=public.own_liquidation_context_v1(p,true,command);PERFORM public.own_run_lock_v1(ctx);fingerprint:=public.own_run_hash_v1(body);
 SELECT * INTO e FROM public.own_payroll_liquidation_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'OWN_LIQ_FORBIDDEN';END IF;IF e.body<>body OR e.body_sha256<>fingerprint THEN RAISE EXCEPTION 'OWN_LIQ_IDEMPOTENCY_REUSE';END IF;RETURN e.receipt||jsonb_build_object('replayed',true);END IF;
 c:=public.own_liquidation_capture_v1(ctx,(body->>'runId')::uuid);SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;
 IF body->>'resultSha256'<>r.result_sha256 THEN RAISE EXCEPTION 'OWN_LIQ_RESULT_CHANGED';END IF;
 IF body->>'scopeVersion'<>public.native_salary_scope_v1(ctx) OR body->>'stateVersion'<>public.own_liquidation_state_v1(ctx,c) THEN RAISE EXCEPTION 'OWN_LIQ_STATE_CHANGED';END IF;
 selection:=body->'selection';kind:=selection->>'kind';IF NOT public.own_program_exact_v1(selection,ARRAY['kind','values']) OR jsonb_typeof(selection->'kind') IS DISTINCT FROM 'string' OR kind NOT IN('all','contracts','agreements','departments') OR jsonb_typeof(selection->'values') IS DISTINCT FROM 'array' OR jsonb_array_length(selection->'values')>10000 OR(kind='all' AND jsonb_array_length(selection->'values')<>0) OR(kind<>'all' AND jsonb_array_length(selection->'values')=0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(selection->'values') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}'!~CASE WHEN kind='contracts' THEN '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' ELSE '^[0-9]{1,9}$' END) OR(SELECT count(DISTINCT value) FROM jsonb_array_elements(selection->'values'))<>jsonb_array_length(selection->'values') THEN RAISE EXCEPTION 'OWN_LIQ_SELECTION_INVALID';END IF;
 PERFORM public.own_close_guard_v1(ctx,c.body->>'period',c.body->>'liquidationType',ARRAY(SELECT(value->>'contractId')::uuid FROM jsonb_array_elements(r.input->'employees') WHERE kind='all' OR selection->'values' ? (value->>CASE kind WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END)));
 rows_value:=public.own_liquidation_rows_v1(ctx,c);
 FOR person IN SELECT value FROM jsonb_array_elements(r.input->'employees') ORDER BY value->>'contractId' LOOP
  val:=CASE kind WHEN 'contracts' THEN person->>'contractId' WHEN 'agreements' THEN person->>'agreementCode' WHEN 'departments' THEN person->>'departmentCode' ELSE NULL END;
  IF kind='all' OR selection->'values' ? val THEN
   SELECT value INTO row_value FROM jsonb_array_elements(rows_value) WHERE value->>'contractId'=person->>'contractId';
   IF command='confirm' AND NOT public.own_novelty_capture_current_v1(ctx,c,(person->>'contractId')::uuid) THEN RAISE EXCEPTION 'OWN_LIQ_SOURCE_CHANGED';END IF;
   IF NOT row_value->'allowedCommands' ? command THEN RAISE EXCEPTION 'OWN_LIQ_DECISION_INVALID';END IF;
   revision:=(row_value->>'version')::integer+1;liquidation:=(row_value->>'liquidationVersion')::integer;
   IF command='confirm' THEN SELECT coalesce(max((x.value->>'liquidationVersion')::integer),0)+1 INTO liquidation FROM public.own_payroll_liquidation_event z JOIN public.own_payroll_run_capture pc ON pc.id=z.capture_id CROSS JOIN LATERAL jsonb_array_elements(z.changes) x WHERE z.tenant_id=c.tenant_id AND z.source_binding_id=c.source_binding_id AND pc.body->>'period'=c.body->>'period' AND pc.body->>'liquidationType'=c.body->>'liquidationType' AND x.value->>'contractId'=person->>'contractId';END IF;
   changes:=changes||jsonb_build_array(jsonb_build_object('contractId',person->>'contractId','state',CASE command WHEN 'confirm' THEN 'confirmed' WHEN 'annul' THEN 'annulled' ELSE 'cancelled' END,'version',revision,'liquidationVersion',liquidation));chosen:=array_append(chosen,val);
  END IF;
 END LOOP;
 IF jsonb_array_length(changes)=0 OR(kind<>'all' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(selection->'values') x WHERE NOT x=ANY(chosen))) THEN RAISE EXCEPTION 'OWN_LIQ_SELECTION_INVALID';END IF;
 receipt_value:=jsonb_build_object('version','own-liquidation-receipt.v1','id',event_id,'key',key,'body',body,'bodySha256',fingerprint,'runId',c.id,'resultSha256',r.result_sha256,'affected',changes,'recordedAt',at_time,'replayed',false);
 IF octet_length(receipt_value::text)+8192>4194304 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-run:capacity:v1',0)) THEN RAISE EXCEPTION 'OWN_LIQ_BUSY';END IF;
 IF(SELECT coalesce(sum(octet_length(le.body::text)+octet_length(le.changes::text)+octet_length(le.receipt::text)),0) FROM public.own_payroll_liquidation_event le)+octet_length(body::text)+octet_length(changes::text)+octet_length(receipt_value::text)>67108864 OR(SELECT count(*) FROM public.own_payroll_liquidation_event le WHERE le.capture_id=c.id)>=4000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 INSERT INTO public.own_payroll_liquidation_event(id,tenant_id,source_binding_id,capture_id,command,actor_membership_id,actor_person_id,actor_email,actor_label,actor_session_id,actor_session_version,release_sha,request_key,body,body_sha256,changes,receipt,recorded_at) VALUES(event_id,c.tenant_id,c.source_binding_id,c.id,command,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',coalesce(nullif(ctx->>'actorLabel',''),'Autoridad municipal'),(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key,body,fingerprint,changes,receipt_value,at_time);
 RETURN receipt_value;END $$;

REVOKE ALL ON FUNCTION public.own_novelty_active_v1(jsonb),public.own_novelty_effective_v1(jsonb),public.own_novelty_affected_state_v1(jsonb,public.own_payroll_novelty_event),public.own_novelty_succession_validate_v1(jsonb,date,text,jsonb,jsonb,uuid),public.own_novelty_content_v3(jsonb,date,text,jsonb,jsonb),public.own_novelty_capture_source_state_v1(jsonb,public.own_payroll_run_capture,uuid),public.own_novelty_capture_current_v1(jsonb,public.own_payroll_run_capture,uuid),public.own_novelty_succession_context_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_novelty_succession_context_v1(jsonb,uuid) TO municontrol_actions_runtime_app;

DO $after_pins$
DECLARE signature text;fingerprint text;configuration text[];volatility "char";lang text;result_value text;argtypes text;argnames text[];defaults_value text;runtime_value boolean;setof_value boolean;f pg_proc;
BEGIN
 FOR signature,fingerprint,configuration,volatility,lang,result_value,argtypes,argnames,defaults_value,runtime_value,setof_value IN SELECT * FROM(VALUES
 ('public.own_novelty_command_v1(jsonb,jsonb,uuid)','50a861d556da41453156037fec7bf6acb3dab4f982ea9be727102cf9fd2a8d15',ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']::text[],'v','plpgsql','jsonb','jsonb, jsonb, uuid',ARRAY['p','body_value','key_value']::text[],NULL::text,true,false),
 ('public.own_novelty_conflict_v1(jsonb,date,text,jsonb)','a4b1035578af53e8de784dbe6b56a53b701f3513e208a9025423469e4a5da692',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','boolean','jsonb, date, text, jsonb',ARRAY['ctx','period_value','type_value','r']::text[],NULL::text,false,false),
 ('public.own_novelty_sources_v1(jsonb,date,text,uuid[])','011fdb01ae085e71435df24e02c39fbae852018dd9843a267ee323012f5a83f1',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','jsonb','jsonb, date, text, uuid[]',ARRAY['p','period_value','type_value','selected']::text[],NULL::text,false,false),
 ('public.own_liquidation_rows_v1(jsonb,public.own_payroll_run_capture)','63f6be4704f214cf9c1f72bf76083b30414d9c1288da248e83fc1162a60824ee',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','plpgsql','jsonb','jsonb, public.own_payroll_run_capture',ARRAY['ctx','c']::text[],NULL::text,false,false),
 ('public.own_liquidation_state_v1(jsonb,public.own_payroll_run_capture)','5754c7b42f1237433119005646a1dd232db2aa1a8cb232bf7ed87281fd25162f',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','text','jsonb, public.own_payroll_run_capture',ARRAY['ctx','c']::text[],NULL::text,false,false),
 ('public.own_liquidation_command_v1(jsonb,jsonb,uuid)','1fbfd0c44d963f0c1f870ed8ad3175775f1b946d48c029eff83252454124ad92',ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']::text[],'v','plpgsql','jsonb','jsonb, jsonb, uuid',ARRAY['p','body','key']::text[],NULL::text,true,false),
 ('public.own_novelty_active_v1(jsonb)','4d4672f272c9355961b17a09a3f5a5f47370d5a6baa3d760d24e9ddadac17e9e',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','public.own_payroll_novelty_event','jsonb',ARRAY['ctx']::text[],NULL::text,false,true),
 ('public.own_novelty_effective_v1(jsonb)','ded18d58297036b18a17bbb8a938caad7c93359f7b4d290653c4fa89d5d52fb9',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','public.own_payroll_novelty_event','jsonb',ARRAY['ctx']::text[],NULL::text,false,true),
 ('public.own_novelty_affected_state_v1(jsonb,public.own_payroll_novelty_event)','54f64c7ddeacf3fc8ef2cc8fb43365590e3af8865df6bc122922f8e537bca940',ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']::text[],'v','plpgsql','jsonb','jsonb, public.own_payroll_novelty_event',ARRAY['ctx','parent_value']::text[],NULL::text,false,false),
 ('public.own_novelty_succession_validate_v1(jsonb,date,text,jsonb,jsonb,uuid)','48f89034291430cba1a999b4374c9235a446e704693048a91fbdc7e0b4a13ada',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','uuid[]','jsonb, date, text, jsonb, jsonb, uuid',ARRAY['ctx','period_value','type_value','rows_value','supersedes_value','proposal_value']::text[],NULL::text,false,false),
 ('public.own_novelty_content_v3(jsonb,date,text,jsonb,jsonb)','45c4d3da919e016f3f1fc98f67156368e817efff3aec7607a5c8223ff791eb7e',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'i','sql','text','jsonb, date, text, jsonb, jsonb',ARRAY['ctx','p_period','p_type','rows_value','supersedes_value']::text[],NULL::text,false,false),
 ('public.own_novelty_capture_source_state_v1(jsonb,public.own_payroll_run_capture,uuid)','094fe8354f1deaf421fd723742873f684829faff8807fc7ccff4d938a22c2d2d',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','plpgsql','jsonb','jsonb, public.own_payroll_run_capture, uuid',ARRAY['ctx','c','target']::text[],NULL::text,false,false),
 ('public.own_novelty_capture_current_v1(jsonb,public.own_payroll_run_capture,uuid)','9d420ef84acebc971f857e48cb26aa89ee46adf39692ca78017e5c7b9b68a7c2',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','plpgsql','boolean','jsonb, public.own_payroll_run_capture, uuid',ARRAY['ctx','c','target']::text[],NULL::text,false,false),
 ('public.own_novelty_succession_context_v1(jsonb,uuid)','caccf49e21392a335d40ce9f2c4504dfe51555220c4890ded30f238c270d8bec',ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']::text[],'v','plpgsql','jsonb','jsonb, uuid',ARRAY['p','target']::text[],NULL::text,true,false),
 ('public.own_novelty_context_v1(jsonb,text)','5435b42ea82e6fd2dbe5596b6308c1c94295900f3f36e5cbce95dcbc1994442b',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','jsonb','jsonb, text',ARRAY['p','cap']::text[],'NULL::text',false,false),
 ('public.own_novelty_current_v1(jsonb)','10f9413639371fc6713d36ae7b1f0ff5db1dad488fe1563872f4899ea3b67422',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','public.own_payroll_novelty_event','jsonb',ARRAY['ctx']::text[],NULL::text,false,true),
 ('public.own_novelty_rows_v1(jsonb,date)','e4265156f14b341ec4c20844f9b929b4efeada6a59c9af071ce0f48a22412166',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'i','plpgsql','void','jsonb, date',ARRAY['rows_value','period_value']::text[],NULL::text,false,false),
 ('public.own_novelty_content_v1(jsonb,date,text,jsonb)','5cfb2aa0934fa6db1c6f9150aab6fed75fce303bc60caa9ac4240af0ac7bcca4',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'i','sql','text','jsonb, date, text, jsonb',ARRAY['ctx','period_value','type_value','rows_value']::text[],NULL::text,false,false),
 ('public.own_novelty_view_v1(jsonb,jsonb,uuid[])','e07cbef287d99fe52cf845aa9a58c13482deab02f12ef348c7381acfc5773518',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','jsonb','jsonb, jsonb, uuid[]',ARRAY['ctx','snapshot_value','selected']::text[],'NULL::uuid[]',false,false),
 ('public.own_novelty_receipt_v1(public.own_payroll_novelty_event,boolean)','7740ebda96ab35e6ad225c593155aa5f513ee0401b293c80d2ccab2000b303a2',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','jsonb','public.own_payroll_novelty_event, boolean',ARRAY['e','replayed']::text[],NULL::text,false,false),
 ('public.own_novelty_lock_v1(jsonb)','b13fd67d76cab56b857accba0880e7c26a4b688df79cf3e50ac1b1fe488bf45c',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','void','jsonb',ARRAY['ctx']::text[],NULL::text,false,false),
 ('public.own_novelty_destination_lock_v1(jsonb,date,text,jsonb)','c0e3bf1fd06046034635d26b811c3dced9b5369efea060f00e81c07de7b3753e',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','void','jsonb, date, text, jsonb',ARRAY['ctx','period_value','type_value','r']::text[],NULL::text,false,false),
 ('public.own_novelty_immutable_v1()','0339f43f25c5cfc88b58c06249d81292e35a0c926c002c2d75facbcc4a9c1bc5',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','trigger','',NULL::text[],NULL::text,false,false),
 ('public.own_novelty_legacy_row_v1()','67574fdae58f4a9c71ff5364253efe4c2efcff5e909766bcbfd431b23ab9a39b',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','trigger','',NULL::text[],NULL::text,false,false),
 ('public.own_run_context_v1(jsonb,boolean,boolean)','7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','jsonb','jsonb, boolean, boolean',ARRAY['p','nominal','write_access']::text[],'false, false',false,false),
 ('public.own_run_lock_v1(jsonb)','8bc4c4699b0a633aef50bf9aeb6e1c1d6d1b5da6a3017241056dbad689b862b5',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'v','plpgsql','void','jsonb',ARRAY['ctx']::text[],NULL::text,false,false),
 ('public.own_run_hash_v1(jsonb)','a6c00700c94b5e07fdf49c00c9ea07212239f46a11f4a921b706367e74c66393',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'i','sql','text','jsonb',ARRAY['v']::text[],NULL::text,false,false),
 ('public.own_close_active_v1(jsonb,text,text)','57ee61a1eefe972e1329b42ce5034f711d77bb1aa1b2c78c38f2582f8577d309',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','jsonb','jsonb, text, text',ARRAY['ctx','period_value','type_value']::text[],NULL::text,false,false),
 ('public.own_close_guard_v1(jsonb,text,text,uuid[])','303b2da7e5d518d9f309911a92538738a2c3ea8c1ef53ddec06d85bac370ae31',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','plpgsql','void','jsonb, text, text, uuid[]',ARRAY['ctx','period_value','type_value','contracts']::text[],NULL::text,false,false),
 ('public.own_liquidation_current_v1(jsonb,text,text)','fbca9a87a49cfe054e5f9d39f117a05f630bdae80b913f3df8c6a39c44f99e48',ARRAY['search_path=pg_catalog, public, pg_temp']::text[],'s','sql','jsonb','jsonb, text, text',ARRAY['ctx','period','payroll_type']::text[],NULL::text,false,false)
 )pins(signature,sha,configuration,volatility,lang,result_value,argtypes,argnames,defaults_value,runtime_value,setof_value) LOOP
 SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure(signature);
 IF f.oid IS NULL OR f.proowner<>current_user::regrole OR NOT f.prosecdef OR f.proisstrict OR f.proretset IS DISTINCT FROM setof_value OR f.prokind<>'f' OR f.proparallel<>'u' OR f.proleakproof OR f.prosupport<>0 OR f.proconfig IS DISTINCT FROM configuration OR f.provolatile<>volatility
  OR f.prolang<>(SELECT oid FROM pg_language WHERE lanname=lang) OR f.prorettype IS DISTINCT FROM to_regtype(result_value) OR ARRAY(SELECT unnest(f.proargtypes::oid[])) IS DISTINCT FROM ARRAY(SELECT to_regtype(t)::oid FROM unnest(string_to_array(argtypes,', ')) t) OR f.proargnames IS DISTINCT FROM argnames OR pg_get_expr(f.proargdefaults,0) IS DISTINCT FROM defaults_value
  OR encode(public.digest(replace(f.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>fingerprint
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee<>f.proowner AND NOT(runtime_value AND a.grantee='municontrol_actions_runtime_app'::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
  OR has_function_privilege('municontrol_actions_runtime_app',f.oid,'EXECUTE') IS DISTINCT FROM runtime_value THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_SOURCE_DRIFT' USING DETAIL=signature;END IF;
 END LOOP;
END $after_pins$;

DO $relation_security$ DECLARE name_value text;t pg_class;item record;BEGIN
 FOREACH name_value IN ARRAY ARRAY['own_payroll_novelty_event','own_payroll_run_capture','own_payroll_run_result','own_payroll_liquidation_event','own_payroll_close_event'] LOOP
 SELECT * INTO t FROM pg_class WHERE oid=to_regclass('public.'||name_value);
 IF t.oid IS NULL OR t.relkind<>'r' OR t.relowner<>current_user::regrole OR NOT t.relrowsecurity OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=t.oid)
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a WHERE a.grantee<>t.relowner)
  OR has_table_privilege('municontrol_actions_runtime_app',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_RELATION_DRIFT' USING DETAIL=name_value;END IF;
 END LOOP;
 FOR item IN SELECT * FROM(VALUES('own_payroll_novelty_event','own_novelty_immutable',27),('own_payroll_novelty_event','own_novelty_no_truncate',34)) v(tab,name,kind) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger trg WHERE trg.tgrelid=to_regclass('public.'||item.tab) AND trg.tgname=item.name AND trg.tgfoid='public.own_novelty_immutable_v1()'::regprocedure AND trg.tgtype=item.kind AND trg.tgenabled='O' AND NOT trg.tgisinternal AND trg.tgnargs=0 AND trg.tgqual IS NULL AND NOT trg.tgdeferrable AND NOT trg.tginitdeferred) THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_RELATION_DRIFT';END IF;
 END LOOP;
IF NOT EXISTS(SELECT 1 FROM pg_trigger trg WHERE trg.tgrelid='public.payroll_novelty_row'::regclass AND trg.tgname='own_novelty_legacy_row' AND trg.tgfoid='public.own_novelty_legacy_row_v1()'::regprocedure AND trg.tgtype=7 AND trg.tgenabled='O' AND NOT trg.tgisinternal AND trg.tgnargs=0 AND trg.tgqual IS NULL AND NOT trg.tgdeferrable AND NOT trg.tginitdeferred) THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_RELATION_DRIFT';END IF;
END $relation_security$;

-- Source-derived lexical forms for the two typed DDL expressions. This accepts
-- only deparser whitespace/parentheses differences, never another SQL token.
-- All Boolean operators in the accepted predicate are AND. No literal content,
-- identifier, cast, field path or operator is removed or rewritten.
DO $index_security$
DECLARE k pg_index;t pg_class;source_text text;tokens text[];expected text[];token_value text;char_value text;pos_value integer;end_value integer;which_value integer;
BEGIN
 SELECT * INTO t FROM pg_class WHERE oid=to_regclass('public.own_novelty_approved_successor_uk');SELECT * INTO k FROM pg_index WHERE indexrelid=t.oid;
 IF t.oid IS NULL OR t.relkind<>'i' OR t.relowner<>current_user::regrole OR t.relam<>(SELECT oid FROM pg_am WHERE amname='btree') OR t.reloptions IS NOT NULL
  OR k.indrelid<>'public.own_payroll_novelty_event'::regclass OR NOT k.indisunique OR NOT k.indisvalid OR NOT k.indisready OR NOT k.indislive OR NOT k.indimmediate OR k.indisprimary OR k.indisexclusion OR k.indnullsnotdistinct
  OR k.indnkeyatts<>3 OR k.indnatts<>3 OR k.indexprs IS NULL OR k.indpred IS NULL
  OR ARRAY(SELECT unnest(k.indkey::smallint[])) IS DISTINCT FROM ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.indrelid AND attname='tenant_id'),(SELECT attnum FROM pg_attribute WHERE attrelid=k.indrelid AND attname='source_binding_id'),0::smallint]
  OR EXISTS(SELECT 1 FROM unnest(k.indcollation::oid[]) x WHERE x<>0) OR EXISTS(SELECT 1 FROM unnest(k.indoption::smallint[]) x WHERE x<>0)
  OR EXISTS(SELECT 1 FROM unnest(k.indclass::oid[]) x WHERE x<>(SELECT c.oid FROM pg_opclass c JOIN pg_namespace n ON n.oid=c.opcnamespace WHERE n.nspname='pg_catalog' AND c.opcname='uuid_ops' AND c.opcmethod=t.relam))
 THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_INDEX_DRIFT';END IF;
 FOR which_value IN 1..2 LOOP
  source_text:=CASE which_value WHEN 1 THEN pg_get_expr(k.indexprs,k.indrelid,false) ELSE pg_get_expr(k.indpred,k.indrelid,false) END;
  tokens:='{}';pos_value:=1;
  WHILE pos_value<=length(source_text) LOOP
   char_value:=substring(source_text FROM pos_value FOR 1);
   IF char_value IN(' ','(',')',chr(9),chr(10),chr(13)) THEN pos_value:=pos_value+1;CONTINUE;END IF;
   IF char_value=chr(39) THEN
    end_value:=pos_value+1;
    WHILE end_value<=length(source_text) LOOP
     IF substring(source_text FROM end_value FOR 1)=chr(39) THEN
      IF substring(source_text FROM end_value+1 FOR 1)=chr(39) THEN end_value:=end_value+2;CONTINUE;END IF;
      EXIT;
     END IF;
     end_value:=end_value+1;
    END LOOP;
    IF end_value>length(source_text) THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_INDEX_DRIFT';END IF;
    token_value:=substring(source_text FROM pos_value FOR end_value-pos_value+1);pos_value:=end_value+1;
   ELSIF char_value~'^[A-Za-z_]$' THEN
    end_value:=pos_value+1;WHILE end_value<=length(source_text) AND substring(source_text FROM end_value FOR 1)~'^[A-Za-z0-9_]$' LOOP end_value:=end_value+1;END LOOP;
    token_value:=lower(substring(source_text FROM pos_value FOR end_value-pos_value));pos_value:=end_value;
   ELSIF substring(source_text FROM pos_value FOR 3) IN('#>>','->>') THEN token_value:=substring(source_text FROM pos_value FOR 3);pos_value:=pos_value+3;
   ELSIF substring(source_text FROM pos_value FOR 2)='::' THEN token_value:='::';pos_value:=pos_value+2;
   ELSIF char_value IN('=','[',']') THEN token_value:=char_value;pos_value:=pos_value+1;
   ELSE RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_INDEX_DRIFT';END IF;
   tokens:=array_append(tokens,token_value);
  END LOOP;
  expected:=CASE which_value WHEN 1 THEN ARRAY['snapshot','#>>','''{supersedes,batchId}''','::','text','[',']','::','uuid']
   ELSE ARRAY['command','=','''approve''','::','text','and','status','=','''approved''','::','text','and','snapshot','->>','''version''','::','text','=','''own-payroll-novelty-batch.v3''','::','text'] END;
  IF tokens IS DISTINCT FROM expected THEN RAISE EXCEPTION 'OWN_NOVELTY_SUCCESSION_INDEX_DRIFT';END IF;
 END LOOP;
END $index_security$;
