-- J2.1: internal legal work, not official case numbering or legal approval.
-- No real users, membership grants, payroll rows or document contents are changed.
CREATE TABLE public.legal_work_item(tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),id uuid NOT NULL DEFAULT gen_random_uuid(),code text NOT NULL CHECK(code~'^AJ-20[0-9]{2}-[0-9]{5}$'),current_version integer NOT NULL CHECK(current_version BETWEEN 1 AND 100),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,code));
CREATE TABLE public.legal_work_revision(tenant_id uuid NOT NULL,item_id uuid NOT NULL,version integer NOT NULL CHECK(version BETWEEN 1 AND 100),metadata jsonb NOT NULL,note text NOT NULL CHECK(length(btrim(note)) BETWEEN 5 AND 1500),actor_membership_id uuid NOT NULL,actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_name text NOT NULL,responsible_name text NOT NULL,request_key uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,item_id,version),UNIQUE(tenant_id,actor_membership_id,request_key),FOREIGN KEY(tenant_id,item_id) REFERENCES public.legal_work_item(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id));
ALTER TABLE public.legal_work_item ADD CONSTRAINT legal_work_current_revision_fk FOREIGN KEY(tenant_id,id,current_version) REFERENCES public.legal_work_revision(tenant_id,item_id,version) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.legal_work_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_work_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_work_item,public.legal_work_revision FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER legal_work_revision_immutable BEFORE UPDATE OR DELETE ON public.legal_work_revision FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_work_revision_no_truncate BEFORE TRUNCATE ON public.legal_work_revision FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_work_item_no_delete BEFORE DELETE ON public.legal_work_item FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_work_item_no_truncate BEFORE TRUNCATE ON public.legal_work_item FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE FUNCTION public.legal_work_head_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN IF (to_jsonb(NEW)-'current_version') IS DISTINCT FROM (to_jsonb(OLD)-'current_version') OR NEW.current_version<>OLD.current_version+1 THEN RAISE EXCEPTION 'LW_CONFLICT';END IF;RETURN NEW;END $$;
CREATE TRIGGER legal_work_item_version BEFORE UPDATE ON public.legal_work_item FOR EACH ROW EXECUTE FUNCTION public.legal_work_head_guard_v1();
CREATE FUNCTION public.legal_work_metadata_valid_v1(m jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text;d date;
BEGIN
 IF jsonb_typeof(m) IS DISTINCT FROM 'object' OR octet_length(m::text)>4000 OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(m) key) IS DISTINCT FROM ARRAY['nextStep','reference','responsibleId','status','targetDate','title'] THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['nextStep','reference','responsibleId','status','targetDate','title'] LOOP IF jsonb_typeof(m->k) IS DISTINCT FROM 'string' OR m->>k<>btrim(m->>k) OR m->>k~'[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RETURN false;END IF;END LOOP;
 IF length(m->>'title') NOT BETWEEN 5 AND 160 OR length(m->>'reference')>100 OR length(m->>'nextStep')>300 OR m->>'status' NOT IN ('pending','in_progress','waiting','closed') OR m->>'status'<>'closed' AND length(m->>'nextStep')<5 OR m->>'responsibleId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN false;END IF;
 IF m->>'targetDate'<>'' THEN IF m->>'targetDate'!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RETURN false;END IF;d:=(m->>'targetDate')::date;IF to_char(d,'YYYY-MM-DD')<>m->>'targetDate' THEN RETURN false;END IF;END IF;
 RETURN true;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;
ALTER TABLE public.legal_work_revision ADD CONSTRAINT legal_work_metadata_valid CHECK(public.legal_work_metadata_valid_v1(metadata));
CREATE FUNCTION public.legal_work_context_v1(p jsonb,writing boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE u public.internal_users%ROWTYPE;m public.tenant_membership%ROWTYPE;s public.tenant_identity_session%ROWTYPE;can_write boolean;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p) key) IS DISTINCT FROM ARRAY['actorEmail','actorSessionId','actorSessionVersion','membershipId','tenantId'] THEN RAISE EXCEPTION 'LW_SESSION_INVALID';END IF;
 SELECT * INTO u FROM public.internal_users WHERE email=p->>'actorEmail' AND active AND auth_mode='managed' FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'LW_SESSION_INVALID';END IF;
 SELECT * INTO m FROM public.tenant_membership WHERE id=(p->>'membershipId')::uuid AND tenant_id=(p->>'tenantId')::uuid AND user_email=u.email AND status='active' FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'LW_SESSION_INVALID';END IF;
 SELECT * INTO s FROM public.tenant_identity_session WHERE id=(p->>'actorSessionId')::uuid AND user_email=u.email AND active_tenant_id=m.tenant_id AND session_version=(p->>'actorSessionVersion')::integer AND identity_version=u.identity_version AND source='membership' AND auth_level IN ('mfa','recovery') AND status='active' AND expires_at>clock_timestamp() AND last_seen_at>clock_timestamp()-interval '1 hour' FOR SHARE NOWAIT;
 IF NOT FOUND OR writing AND s.auth_level<>'mfa' THEN RAISE EXCEPTION 'LW_SESSION_INVALID';END IF;
 PERFORM 1 FROM public.platform_tenant WHERE id=m.tenant_id AND status='active' FOR SHARE NOWAIT;IF NOT FOUND THEN RAISE EXCEPTION 'LW_SESSION_INVALID';END IF;
 PERFORM public.tenant_iam_assert_no_sod_conflict(m.id);
 IF NOT EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities(m.id) WHERE capability_key='legal.norm.read') THEN RAISE EXCEPTION 'LW_FORBIDDEN';END IF;
 SELECT EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities(m.id) WHERE capability_key='legal.norm.register') INTO can_write;
 IF writing AND NOT can_write THEN RAISE EXCEPTION 'LW_FORBIDDEN';END IF;
 RETURN jsonb_build_object('tenantId',m.tenant_id,'membershipId',m.id,'name',u.display_name,'sessionId',s.id,'canManage',can_write AND s.auth_level='mfa');
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'LW_BUSY';WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'LW_SESSION_INVALID';
END $$;
CREATE FUNCTION public.legal_work_detail_v1(t uuid,n uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('id',i.id,'code',i.code,'recordVersion',i.current_version,'metadata',r.metadata,'updatedAt',r.recorded_at,'responsibleName',u.display_name,'history',(SELECT jsonb_agg(jsonb_build_object('version',v.version,'metadata',v.metadata,'note',v.note,'actor',v.actor_name,'responsibleName',v.responsible_name,'recordedAt',v.recorded_at) ORDER BY v.version DESC) FROM public.legal_work_revision v WHERE v.tenant_id=t AND v.item_id=n))
 FROM public.legal_work_item i JOIN public.legal_work_revision r ON r.tenant_id=i.tenant_id AND r.item_id=i.id AND r.version=i.current_version JOIN public.tenant_membership m ON m.id=(r.metadata->>'responsibleId')::uuid AND m.tenant_id=i.tenant_id JOIN public.internal_users u ON u.email=m.user_email WHERE i.tenant_id=t AND i.id=n
$$;
CREATE FUNCTION public.legal_work_operation_v1(p jsonb,op text,d jsonb DEFAULT '{}'::jsonb,k uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;member uuid;keys text[];item public.legal_work_item%ROWTYPE;prior public.legal_work_revision%ROWTYPE;meta jsonb;fingerprint text;n uuid;v integer;seq integer;code_value text;result jsonb;owner_row public.tenant_membership%ROWTYPE;owner_name text;today date:=(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;
BEGIN
 ctx:=public.legal_work_context_v1(p,op IN ('save','attempt'));t:=(ctx->>'tenantId')::uuid;member:=(ctx->>'membershipId')::uuid;
 IF op IS NULL OR op NOT IN ('bootstrap','list','detail','save','attempt') OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>12000 THEN RAISE EXCEPTION 'LW_INPUT_INVALID';END IF;
 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(d) key;
 IF op='bootstrap' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'LW_INPUT_INVALID';END IF;
  RETURN jsonb_build_object('version','legal-work.v1','canManage',(ctx->>'canManage')::boolean,'membershipId',member,'today',today,'responsibles',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.display_name) ORDER BY x.display_name,x.id),'[]'::jsonb) FROM (SELECT m.id,u.display_name FROM public.tenant_membership m JOIN public.internal_users u ON u.email=m.user_email WHERE m.tenant_id=t AND m.status='active' AND u.active AND u.auth_mode='managed' AND EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities(m.id) WHERE capability_key='legal.norm.read') ORDER BY u.display_name,m.id LIMIT 250)x));
 ELSIF op='list' THEN
  IF keys IS DISTINCT FROM ARRAY['mine','page','q','status'] OR jsonb_typeof(d->'mine') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'page') IS DISTINCT FROM 'number' OR d->>'page'!~'^[1-9][0-9]{0,3}$' OR (d->>'page')::int>1000 OR jsonb_typeof(d->'q') IS DISTINCT FROM 'string' OR length(d->>'q')>100 OR d->>'q'~'[\x00-\x1f\x7f]' OR jsonb_typeof(d->'status') IS DISTINCT FROM 'string' OR d->>'status' NOT IN ('','pending','in_progress','waiting','closed') THEN RAISE EXCEPTION 'LW_INPUT_INVALID';END IF;
  WITH found AS MATERIALIZED (
   SELECT i.id,i.code,i.current_version AS "recordVersion",r.metadata,r.recorded_at AS "updatedAt",u.display_name AS "responsibleName",r.metadata->>'status'<>'closed' AND nullif(r.metadata->>'targetDate','')::date<today AS overdue
   FROM public.legal_work_item i JOIN public.legal_work_revision r ON r.tenant_id=i.tenant_id AND r.item_id=i.id AND r.version=i.current_version
   JOIN public.tenant_membership m ON m.id=(r.metadata->>'responsibleId')::uuid AND m.tenant_id=i.tenant_id JOIN public.internal_users u ON u.email=m.user_email
   WHERE i.tenant_id=t AND (NOT (d->>'mine')::boolean OR m.id=member) AND (btrim(d->>'q')='' OR strpos(lower(i.code||' '||(r.metadata->>'title')||' '||(r.metadata->>'reference')),lower(btrim(d->>'q')))>0)
  ),filtered AS (SELECT * FROM found WHERE d->>'status'='' OR metadata->>'status'=d->>'status')
  SELECT jsonb_build_object('version','legal-work.v1','today',today,'page',(d->>'page')::int,'pageSize',20,'total',(SELECT count(*) FROM filtered),'counts',jsonb_build_object('all',(SELECT count(*) FROM found),'open',(SELECT count(*) FROM found WHERE metadata->>'status'<>'closed'),'overdue',(SELECT count(*) FROM found WHERE overdue),'closed',(SELECT count(*) FROM found WHERE metadata->>'status'='closed')),'rows',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT * FROM filtered ORDER BY "updatedAt" DESC,id LIMIT 20 OFFSET ((d->>'page')::int-1)*20)x)) INTO result;
  RETURN result;
 ELSIF op='detail' THEN
  IF keys IS DISTINCT FROM ARRAY['id'] OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'LW_INPUT_INVALID';END IF;
  result:=public.legal_work_detail_v1(t,(d->>'id')::uuid);IF result IS NULL THEN RAISE EXCEPTION 'LW_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-work.v1','record',result);
 END IF;
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LW_INPUT_INVALID';END IF;
 IF op='attempt' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'LW_INPUT_INVALID';END IF;
  SELECT * INTO prior FROM public.legal_work_revision WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
  IF NOT FOUND THEN RAISE EXCEPTION 'LW_NOT_FOUND';END IF;
  SELECT * INTO item FROM public.legal_work_item WHERE tenant_id=t AND id=prior.item_id;
  RETURN jsonb_build_object('version','legal-work.v1','id',item.id,'code',item.code,'recordVersion',prior.version,'replayed',true);
 END IF;
 IF keys IS DISTINCT FROM ARRAY['expectedVersion','id','metadata','note'] OR NOT public.legal_work_metadata_valid_v1(d->'metadata') OR jsonb_typeof(d->'note') IS DISTINCT FROM 'string' OR length(btrim(d->>'note')) NOT BETWEEN 5 AND 1500 OR d->>'note'<>btrim(d->>'note') OR d->>'note'~'[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' OR jsonb_typeof(d->'expectedVersion') IS DISTINCT FROM 'number' OR d->>'expectedVersion'!~'^[0-9]{1,2}$' OR jsonb_typeof(d->'id') NOT IN ('null','string') THEN RAISE EXCEPTION 'LW_INPUT_INVALID';END IF;
 n:=(d->>'id')::uuid;v:=(d->>'expectedVersion')::int;meta:=d->'metadata';
 IF (n IS NULL)<>(v=0) OR n IS NULL AND meta->>'status'<>'pending' THEN RAISE EXCEPTION 'LW_INPUT_INVALID';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('legal-work-v1:'||t::text,0)) THEN RAISE EXCEPTION 'LW_BUSY';END IF;
 fingerprint:=encode(public.digest(d::text,'sha256'),'hex');
 SELECT * INTO prior FROM public.legal_work_revision WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
 IF FOUND THEN
  IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'LW_KEY_CONFLICT';END IF;
  SELECT * INTO item FROM public.legal_work_item WHERE tenant_id=t AND id=prior.item_id;
  RETURN jsonb_build_object('version','legal-work.v1','id',item.id,'code',item.code,'recordVersion',prior.version,'replayed',true);
 END IF;
 SELECT * INTO owner_row FROM public.tenant_membership WHERE id=(meta->>'responsibleId')::uuid AND tenant_id=t AND status='active' FOR SHARE NOWAIT;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.internal_users WHERE email=owner_row.user_email AND active AND auth_mode='managed') OR NOT EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities(owner_row.id) WHERE capability_key='legal.norm.read') THEN RAISE EXCEPTION 'LW_RESPONSIBLE_INVALID';END IF;
 SELECT display_name INTO owner_name FROM public.internal_users WHERE email=owner_row.user_email;
 IF (SELECT sum(pg_database_size(oid)) FROM pg_database)+16777216+131072>536870912 THEN RAISE EXCEPTION 'LW_STORAGE';END IF;
 IF n IS NULL THEN
  SELECT count(*)+1 INTO seq FROM public.legal_work_item WHERE tenant_id=t AND code LIKE 'AJ-'||extract(year FROM today)::text||'-%';
  IF seq>99999 THEN RAISE EXCEPTION 'LW_STORAGE';END IF;
  code_value:='AJ-'||extract(year FROM today)::text||'-'||lpad(seq::text,5,'0');n:=gen_random_uuid();
  INSERT INTO public.legal_work_item(tenant_id,id,code,current_version) VALUES(t,n,code_value,1) RETURNING * INTO item;
 ELSE
  SELECT * INTO item FROM public.legal_work_item WHERE tenant_id=t AND id=n FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'LW_NOT_FOUND';END IF;
  IF item.current_version<>v THEN RAISE EXCEPTION 'LW_CONFLICT';END IF;
  IF v>=100 THEN RAISE EXCEPTION 'LW_HISTORY_LIMIT';END IF;
  UPDATE public.legal_work_item SET current_version=v+1 WHERE tenant_id=t AND id=n RETURNING * INTO item;
 END IF;
 INSERT INTO public.legal_work_revision(tenant_id,item_id,version,metadata,note,actor_membership_id,actor_session_id,actor_name,responsible_name,request_key,request_sha256) VALUES(t,n,item.current_version,meta,d->>'note',member,(ctx->>'sessionId')::uuid,ctx->>'name',owner_name,k,fingerprint);
 RETURN jsonb_build_object('version','legal-work.v1','id',n,'code',item.code,'recordVersion',item.current_version,'replayed',false);
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'LW_BUSY';WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'LW_INPUT_INVALID';
END $$;
REVOKE ALL ON FUNCTION public.legal_work_head_guard_v1(),public.legal_work_metadata_valid_v1(jsonb),public.legal_work_context_v1(jsonb,boolean),public.legal_work_detail_v1(uuid,uuid),public.legal_work_operation_v1(jsonb,text,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_work_operation_v1(jsonb,text,jsonb,uuid) TO municontrol_actions_runtime_app;
