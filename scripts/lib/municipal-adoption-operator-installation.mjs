// Review-only generation; no connections, SQL execution or municipal writes here.
import assert from 'node:assert/strict';
import {buildAdoptedConsumersInstallation,adoptedConsumersConditional} from './adopted-consumers-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
export function buildMunicipalAdoptionOperatorInstallation(options){
 const consumers=buildAdoptedConsumersInstallation(options),names=['ready','queue','review','attempt','command'].map(n=>'municipal_adoption_'+n+'_v1');
 const header=(name,args,returns='jsonb')=>`CREATE FUNCTION public.municipal_adoption_${name}_v1(${args}) RETURNS ${returns} LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $operator$`;
 const scope=`jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId','bindingId',ctx->>'sourceBindingId','companyId',(ctx->>'sourceCompanyId')::integer)`;
 const auth=`ctx:=public.employment_adoption_context_v1(p);IF NOT public.action_center_context_has_capability(ctx,'workforce.employee.read') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_FORBIDDEN';END IF;`;
 const ready=`PERFORM public.municipal_adoption_ready_v1();`;
 const checkReady=consumers.postChecks.map(s=>'EXECUTE '+q(s)+';').join('\n');
 const definitions=[
 `${header('ready','','void')} BEGIN ${checkReady} END $operator$`,
 `${header('queue','p jsonb')} DECLARE ctx jsonb;n integer;rows_value jsonb;BEGIN ${auth} ${ready}
 SELECT count(*) INTO n FROM public.employment_adoption_proposal r WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF n>500 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_LIMIT';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('proposal',coalesce(d.receipt,public.employment_adoption_envelope_v1(r,true)->'receipt'),'independent',r.actor_membership_id<>(ctx->>'membershipId')::uuid AND r.actor_person_id<>(ctx->>'actorPersonId')::uuid AND r.actor_email<>lower(p->>'actorEmail')) ORDER BY r.created_at,r.id),'[]') INTO rows_value
 FROM public.employment_adoption_proposal r LEFT JOIN public.employment_adoption_decision d ON d.proposal_id=r.id WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid;
 RETURN jsonb_build_object('version','municipal-adoption-operator.v1','scope',${scope},'total',n,'rows',rows_value);END $operator$`,
 `${header('review','p jsonb,target uuid')} DECLARE ctx jsonb;r public.employment_adoption_proposal;s public.employment_adoption_seal;d public.employment_adoption_decision;stage jsonb;raw jsonb;catalog jsonb;current_value boolean;BEGIN ${auth} ${ready}
 stage:=public.employment_adoption_decision_source_v1(p,target);SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=target;SELECT * INTO s FROM public.employment_adoption_seal WHERE proposal_id=target;SELECT * INTO d FROM public.employment_adoption_decision WHERE proposal_id=target;
 raw:=public.employment_adoption_source_v1(p);raw:=jsonb_set(raw,'{scope,membershipId}',to_jsonb(r.actor_membership_id::text));catalog:=public.native_employee_catalog_v1(ctx);
 current_value:=raw-'queriedAt'-'today'=r.before_snapshot-'queriedAt'-'today' AND catalog->>'version'=r.body->>'catalogVersion' AND public.employment_adoption_facts_v1(r)=s.facts AND public.employment_adoption_hash_v1(s.facts)=s.facts_sha256;
 RETURN jsonb_build_object('version','municipal-adoption-operator.v1','scope',${scope},'proposal',coalesce(d.receipt,stage->'proposal'),'body',stage->'body','rawReview',stage->'rawReview','reviewVersion',stage->>'reviewVersion','current',coalesce(current_value,false),'applicationAvailable',true);END $operator$`,
 `${header('attempt','p jsonb,k uuid')} DECLARE ctx jsonb;d public.employment_adoption_decision;BEGIN ${auth}
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 SELECT * INTO d FROM public.employment_adoption_decision WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=k;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_NOT_FOUND';END IF;
 IF d.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid OR d.actor_email<>lower(p->>'actorEmail') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_IDEMPOTENCY_REUSE';END IF;
 RETURN jsonb_build_object('version','municipal-adoption-operator.v1','scope',${scope},'requestKey',k,'bodySha256',public.employment_adoption_hash_v1(d.body||jsonb_build_object('reviewConfirmed',true)),'receipt',jsonb_set(d.receipt,'{replayed}','true'));END $operator$`,
 `${header('command','p jsonb,input jsonb,k uuid')} DECLARE ctx jsonb;receipt_value jsonb;BEGIN ${auth}
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(input) key) IS DISTINCT FROM ARRAY['review','reviewConfirmed','reviewVersion']::text[] OR input->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 ${ready} receipt_value:=public.employment_adoption_decide_v1(p,input-'reviewConfirmed',k);
 RETURN jsonb_build_object('version','municipal-adoption-operator.v1','scope',${scope},'requestKey',k,'bodySha256',public.employment_adoption_hash_v1(input),'receipt',receipt_value);END $operator$`
 ];
 const pins=definitions.map((d,i)=>({...ownInstallationFunctionPin(d),runtime:i>0})),condition="s.nspname='public' AND p.proname LIKE 'municipal_adoption_%'";
 const state=`DO $state$ DECLARE n integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'MUNICIPAL_ADOPTION_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132142);PERFORM pg_advisory_xact_lock(132143);SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${condition};IF n=0 THEN PERFORM set_config('municontrol_operator_install.mode','first',true);ELSIF n=5 THEN PERFORM set_config('municontrol_operator_install.mode','repeat',true);ELSE RAISE EXCEPTION 'MUNICIPAL_ADOPTION_PARTIAL_STATE';END IF;END $state$`;
 const migration=[...definitions,`REVOKE ALL ON FUNCTION ${pins.map(p=>p.signature).join(',')} FROM PUBLIC,municontrol_actions_runtime_app`,`GRANT EXECUTE ON FUNCTION ${pins.filter(p=>p.runtime).map(p=>p.signature).join(',')} TO municontrol_actions_runtime_app`];
 const first=adoptedConsumersConditional(migration,"current_setting('municontrol_operator_install.mode')='first'");
 const snap=slot=>{let s=preservationSnapshot(slot);const anchor="NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')";assert.ok(s.includes(anchor));s=s.replace(anchor,()=>`NOT(${condition})`).replaceAll(" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'');return s.replaceAll('municontrol_sql111.','municontrol_operator_install.');};
 const before=snap('before'),after=snap('after'),post=pinsCheck(pins,'MUNICIPAL_ADOPTION_FUNCTION_METADATA');
 const audit=`DO $audit$ BEGIN IF current_setting('municontrol_operator_install.before')::jsonb IS DISTINCT FROM current_setting('municontrol_operator_install.after')::jsonb THEN RAISE EXCEPTION 'MUNICIPAL_ADOPTION_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const proof=`SELECT jsonb_build_object('version','municipal-adoption-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(consumers.sourceHashes))}::jsonb,'functionPins',${q(JSON.stringify(pins))}::jsonb,'mode',coalesce(current_setting('municontrol_operator_install.mode',true),'verify'),'allChecksPassed',true,'newFunctions',5,'runtimeFacades',4,'newTables',0,'roleAssignmentsAdded',0,'nominalRowsReturned',0,'privateWriterGranted',false,'priorFingerprint',encode(public.digest(current_setting('municontrol_operator_install.after')::jsonb::text,'sha256'),'hex'),'objectsFingerprint',(SELECT encode(public.digest(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,'sha256'),'hex') FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${condition})) AS proof`;
 return {consumers,definitions,pins,migration,first,state,before,after,post,audit,proof,statements:[state,...consumers.postChecks,before,first,post,after,audit,proof],verification:[...consumers.postChecks,post,after,proof]};
}
export function assertMunicipalAdoptionDurability({installed,durable,batch,sourceCommit}){
 const fields=['version','sourceCommit','sourceHashes','functionPins','mode','allChecksPassed','newFunctions','runtimeFacades','newTables','roleAssignmentsAdded','nominalRowsReturned','privateWriterGranted','priorFingerprint','objectsFingerprint'];
 for(const p of [installed,durable]){
  assert.deepEqual(Object.keys(p).sort(),fields.toSorted());assert.equal(p.sourceCommit,sourceCommit);assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.deepEqual(p.sourceHashes,batch.consumers.sourceHashes);assert.deepEqual(p.functionPins,batch.pins);assert.ok(['first','repeat','verify'].includes(p.mode));
  for(const[k,v]of Object.entries({version:'municipal-adoption-installation.v1',allChecksPassed:true,newFunctions:5,runtimeFacades:4,newTables:0,roleAssignmentsAdded:0,nominalRowsReturned:0,privateWriterGranted:false}))assert.equal(p[k],v);
  for(const k of ['priorFingerprint','objectsFingerprint'])assert.match(p[k],/^[a-f0-9]{64}$/);
 }
 for(const k of ['priorFingerprint','objectsFingerprint'])assert.equal(installed[k],durable[k],'MUNICIPAL_ADOPTION_NOT_DURABLE: '+k);
 return {passed:true,sourceCommit,priorStatePreserved:true,nominalRowsReturned:0};
}
