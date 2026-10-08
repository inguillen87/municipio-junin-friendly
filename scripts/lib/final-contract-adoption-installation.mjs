// Final-cut adoption through the existing immutable proposal/independent decision.
// Generates a reviewable schema batch; never opens a connection or writes records.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildInactiveJurisdictionInstallation} from './adoption-inactive-jurisdiction-installation.mjs';
import {buildEmploymentAdoptionInstallation} from './employment-adoption-installation.mjs';
import {buildMunicipalAdoptionOperatorInstallation} from './municipal-adoption-operator-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {FINAL_CONTRACT_TRANSITION_COHORT_SQL,FINAL_CONTRACT_TRANSITION_ROWS_SQL} from './grh-final-contract-transition.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';

export const FINAL_ADOPTION_INPUT_VERSION='employment-adoption-input.v3';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(s,needle,value)=>{assert.equal(s.split(needle).length,2,'FINAL_ADOPTION_ANCHOR_CHANGED: '+needle.slice(0,80));return s.replace(needle,()=>value);};
const header=(name,args,result='jsonb',language='plpgsql')=>`CREATE FUNCTION public.employment_adoption_final_${name}_v1(${args}) RETURNS ${result} LANGUAGE ${language} SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $final$`;
const projection=s=>s.replaceAll('$1::uuid','p_revision').replaceAll('$2','p_company');

// SQL144 has array/table results, which the scalar installation parser does not
// accept. Pin its nine exact signatures and complete function metadata here.
export function finalSourcePrerequisite(read){
 const source=read('scripts/migrations/144-final-grh-source-revision.sql').replace(/\r\n?/g,'\n');
 const definitions=splitPostgresStatements(source).filter(s=>s.startsWith('CREATE FUNCTION public.grh_final_source_'));
 const pins=definitions.map(d=>{
  const m=/CREATE FUNCTION public\.(\w+)\(([^)]*)\)\s*RETURNS\s+(TABLE\([^)]*\)|text\[\]|\w+)\s+LANGUAGE\s+(\w+)/.exec(d);
  assert.ok(m,'FINAL_ADOPTION_SOURCE_HEADER_CHANGED');
  const table=m[3].startsWith('TABLE('),input=m[2]?m[2].split(',').map(s=>s.trim().split(/\s+/)):[],output=table?m[3].slice(6,-1).split(',').map(s=>s.trim().split(/\s+/)):[];
  const body=/AS \$\$([\s\S]*)\$\$\s*$/.exec(d);assert.ok(body);
  return {signature:'public.'+m[1]+'('+input.map(a=>a[1]).join(',')+')',name:m[1],sha256:createHash('sha256').update(body[1]).digest('hex'),argNames:[...input,...output].map(a=>a[0]),modes:table?[...input.map(()=>'i'),...output.map(()=>'t')]:null,result:table?'TABLE('+output.map(a=>a.join(' ')).join(', ')+')':m[3],language:m[4],set:table,volatility:/\bIMMUTABLE\b/.test(d)?'i':/\bSTABLE\b/.test(d)?'s':'v',defaults:input.some(a=>a[2]==='DEFAULT')?'false':''};
 });
 assert.equal(pins.length,9);assert.equal(new Set(pins.map(p=>p.signature)).size,9);
 const check=`DO $source_metadata$ DECLARE x jsonb;p pg_proc;BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pins))}::jsonb) LOOP
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
 IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR p.prosecdef OR p.proisstrict
 OR p.proretset IS DISTINCT FROM (x->>'set')::boolean OR pg_get_function_result(p.oid)<>x->>'result'
 OR p.provolatile<>x->>'volatility' OR p.proparallel<>'u' OR p.proleakproof OR p.prosupport<>0 OR p.procost<>100
 OR p.prorows<>(CASE WHEN p.proretset THEN 1000 ELSE 0 END)
 OR coalesce(to_jsonb(p.proargmodes),'null'::jsonb) IS DISTINCT FROM x->'modes'
 OR coalesce(to_jsonb(p.proargnames),'[]'::jsonb) IS DISTINCT FROM x->'argNames'
 OR coalesce(pg_get_expr(p.proargdefaults,0),'')<>x->>'defaults'
 OR coalesce(to_jsonb(p.proconfig),'[]'::jsonb) IS DISTINCT FROM '["search_path=pg_catalog, public, pg_temp"]'::jsonb
 OR (SELECT lanname FROM pg_language WHERE oid=p.prolang)<>x->>'language'
 OR encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')<>x->>'sha256'
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)
 THEN RAISE EXCEPTION 'FINAL_ADOPTION_SOURCE_METADATA' USING DETAIL=x->>'signature';END IF;END LOOP;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'grh_final_source_%')<>9
 OR (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN('grh_final_source_revision','grh_final_source_delta','grh_final_source_seal') AND relkind='r' AND relowner=current_user::regrole AND relrowsecurity AND NOT relforcerowsecurity AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(relacl,acldefault('r',relowner))) a WHERE a.grantee<>relowner))<>3
 OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid IN('public.grh_final_source_revision'::regclass,'public.grh_final_source_delta'::regclass,'public.grh_final_source_seal'::regclass) AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgfoid IN('public.grh_final_source_guard_v1()'::regprocedure,'public.grh_final_source_seal_guard_v1()'::regprocedure,'public.grh_final_source_seal_required_v1()'::regprocedure))<>8
 THEN RAISE EXCEPTION 'FINAL_ADOPTION_SOURCE_PROTECTION';END IF;END $source_metadata$`;
 return {pins,check};
}

export function finalContractAdoptionDefinitions(){
 const rows=`${header('rows','p_revision uuid,p_company text','SETOF jsonb','sql')} SELECT to_jsonb(row_value) FROM (${projection(FINAL_CONTRACT_TRANSITION_ROWS_SQL)}) row_value $final$`;
 const source=`${header('source','p jsonb,p_revision uuid,p_package text')}
 DECLARE ctx jsonb;selected_revision public.grh_final_source_revision;seal public.grh_final_source_seal;parent jsonb;cohort jsonb;entity text;observed jsonb;facts jsonb;records jsonb;private_records jsonb;result jsonb;total integer;p_company text;
 BEGIN
 ctx:=public.native_employee_context_v1(p);p_company:=ctx->>'sourceCompanyId';
 IF NOT public.action_center_context_has_capability(ctx,'workforce.employee.read') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_FORBIDDEN';END IF;
 PERFORM public.municipal_adoption_ready_v1();
 SELECT * INTO selected_revision FROM public.grh_final_source_revision WHERE id=p_revision AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND package_sha256=p_package;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SOURCE_CHANGED';END IF;
 PERFORM public.grh_final_source_parent_v1(selected_revision.id);
 SELECT * INTO seal FROM public.grh_final_source_seal WHERE revision_id=selected_revision.id;
 IF NOT FOUND OR ARRAY(SELECT jsonb_object_keys(seal.fingerprints) ORDER BY 1) IS DISTINCT FROM ARRAY(SELECT unnest(public.grh_final_source_entities_v1()) ORDER BY 1) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SOURCE_CHANGED';END IF;
 FOREACH entity IN ARRAY public.grh_final_source_entities_v1() LOOP
  observed:=public.grh_final_source_fingerprint_v1(selected_revision.id,entity,false);
  IF observed IS DISTINCT FROM seal.fingerprints->entity THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SOURCE_CHANGED';END IF;
 END LOOP;
 parent:=public.employment_adoption_source_v1(p);
 SELECT to_jsonb(cohort_row) INTO cohort FROM (${projection(FINAL_CONTRACT_TRANSITION_COHORT_SQL)}) cohort_row;
 IF (cohort->>'candidate_rows')::integer>10000 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_LIMIT';END IF;
 IF (cohort->>'candidate_rows')::integer<>(cohort->>'existing_rows')::integer OR (cohort->>'candidate_rows')::integer<>(cohort->>'core_rows')::integer
 OR EXISTS(SELECT 1 FROM jsonb_each_text(cohort) x WHERE x.key NOT IN('candidate_rows','existing_rows','core_rows') AND x.value<>'0') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 SELECT count(*),jsonb_agg(jsonb_build_object('rowKey',x.v->>'row_key','contractId',x.v->>'contract_id','personId',x.v->>'person_id',
  'source',(x.v->>'source_record_json')::jsonb,'before',(x.v->>'previous_facts_json')::jsonb,'candidate',(x.v->>'candidate_facts_json')::jsonb,'issues',x.v->'issues') ORDER BY x.v->>'contract_id')
 INTO total,records FROM public.employment_adoption_final_rows_v1(selected_revision.id,ctx->>'sourceCompanyId') x(v);
 IF total<>(cohort->>'candidate_rows')::integer OR total<1 OR records IS NULL
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(records) x WHERE x->>'contractId' IS NULL OR x->>'personId' IS NULL OR jsonb_typeof(x->'before') IS DISTINCT FROM 'object') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 -- All quantities/source fields remain PostgreSQL JSONB, including large integers.
 facts:=jsonb_build_object('revisionId',selected_revision.id,'packageSha256',selected_revision.package_sha256,'sourceSha256',selected_revision.source_sha256,
 'cutoff',to_char(selected_revision.source_cutoff,'YYYY-MM-DD"T"HH24:MI:SS'),'coreManifestSha256',selected_revision.core_manifest_sha256,'curatedManifestSha256',selected_revision.curated_manifest_sha256,
 'factsSha256',public.employment_adoption_hash_v1(jsonb_build_object('fingerprints',seal.fingerprints,'cohort',cohort,'records',records)));
 SELECT jsonb_agg(jsonb_build_object('contractId',v->>'contractId','personId',v->>'personId','positionCode',v#>'{candidate,positionCode}','sourcePayload',v#>'{source,source_payload}') ORDER BY v->>'contractId') INTO private_records FROM jsonb_array_elements(records) v;
 WITH active_counts AS (SELECT v->>'personId' person,count(*) n FROM jsonb_array_elements(records) v WHERE v#>>'{candidate,active}'='true' GROUP BY 1)
 SELECT jsonb_build_object('scope',parent->'scope','source',(parent->'source')||jsonb_build_object('finalRevision',facts),
 'today',parent->'today','queriedAt',parent->'queriedAt','total',total,'rows',jsonb_agg(jsonb_build_object(
 'rowNumber',x.n,'contractId',x.v->>'contractId','legajo',x.v#>>'{source,legajo}','name',x.v#>>'{source,nombre}',
 'status',CASE x.v#>>'{candidate,active}' WHEN 'true' THEN 'active' WHEN 'false' THEN 'inactive' ELSE 'state_error' END,
 'startDate',x.v#>'{candidate,startDate}','endDate',x.v#>'{candidate,endDate}','agreementCode',x.v#>'{candidate,agreementCode}',
 'categoryCode',x.v#>'{candidate,categoryCode}','organizationId',x.v#>'{candidate,organizationId}','sectorCode',x.v#>'{candidate,sectorCode}',
 'jurisdictionCode',x.v#>'{candidate,jurisdictionCode}','activeContractsForPerson',
 coalesce(a.n,0),
 'previous',jsonb_build_object('status',x.v#>>'{before,contract,status}','startDate',x.v#>>'{before,contract,start_date}',
 'endDate',x.v#>>'{before,contract,end_date}','agreementCode',x.v#>>'{before,contract,agreement_code}',
 'categoryCode',x.v#>>'{before,contract,category_code}','organizationId',x.v#>>'{before,contract,organization_unit_source_id}',
 'sectorCode',x.v#>>'{before,contract,sector_source_id}','jurisdictionCode',x.v#>>'{before,contract,jurisdiction_code}'),
 'sourceIssues',x.v->'issues') ORDER BY x.n),'finalContracts',private_records) INTO result FROM jsonb_array_elements(records) WITH ORDINALITY x(v,n) LEFT JOIN active_counts a ON a.person=x.v->>'personId';
 IF octet_length(result::text)>8388608 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_LIMIT';END IF;
 RETURN result;
 END $final$`;
 const after=`${header('after','r public.employment_adoption_proposal,old_contract jsonb,native_value jsonb')}
 DECLARE row_value jsonb;candidate jsonb;before_value jsonb;n integer;
 BEGIN
 IF r.body->>'version' IS DISTINCT FROM '${FINAL_ADOPTION_INPUT_VERSION}' THEN RETURN NULL;END IF;
 SELECT count(*),jsonb_agg(v)->0 INTO n,row_value FROM jsonb_array_elements(r.before_snapshot->'finalContracts') v WHERE v->>'contractId'=old_contract->>'id';
 IF n<>1 OR row_value->>'personId' IS DISTINCT FROM old_contract->>'person_id' OR row_value->>'contractId' IS DISTINCT FROM old_contract->>'id' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 -- The existing immutable seal already holds complete prior contracts/persons.
 -- Keep the original final payload once; reviewed candidate fields stay in rows.
 SELECT count(*),jsonb_agg(f)->0 INTO n,before_value FROM public.employment_adoption_seal s CROSS JOIN LATERAL jsonb_array_elements(s.facts) f WHERE s.proposal_id=r.id AND f#>>'{contract,id}'=old_contract->>'id';
 IF n<>1 OR before_value->'contract' IS DISTINCT FROM old_contract THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 SELECT count(*),jsonb_agg(v)->0 INTO n,candidate FROM jsonb_array_elements(r.before_snapshot->'rows') v WHERE v->>'contractId'=old_contract->>'id';
 IF n<>1 OR candidate->'sourceIssues' IS DISTINCT FROM '[]'::jsonb OR candidate->>'status' NOT IN('active','inactive') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 RETURN old_contract||jsonb_build_object('source_system','MUNICONTROL','source_batch_id',NULL,'tenant_id',r.tenant_id,
 'start_date',candidate->'startDate','end_date',candidate->'endDate','status',candidate->>'status',
 'agreement_code',candidate->'agreementCode','category_code',candidate->'categoryCode','organization_unit_source_id',candidate->'organizationId',
 'position_source_id',row_value->'positionCode','sector_source_id',candidate->'sectorCode','jurisdiction_code',candidate->'jurisdictionCode',
 'source_payload',(row_value->'sourcePayload')||jsonb_build_object('native',native_value||jsonb_build_object('finalRevisionId',r.body#>>'{finalSource,revisionId}',
 'finalPackageSha256',r.body#>>'{finalSource,packageSha256}')));
 END $final$`;
 const bootstrap=`${header('bootstrap','p jsonb,p_revision uuid,p_package text')}
 DECLARE value jsonb;raw jsonb;
 BEGIN value:=public.employment_adoption_bootstrap_v1(p);raw:=public.employment_adoption_final_source_v1(p,p_revision,p_package);
 RETURN value||jsonb_build_object('version','employment-adoption-preparation.v3','rawReview',raw-'finalContracts');END $final$`;
 const available=`${header('available','p jsonb')}
 DECLARE ctx jsonb;records jsonb;n integer;
 BEGIN ctx:=public.native_employee_context_v1(p);
 IF NOT public.action_center_context_has_capability(ctx,'workforce.employee.read') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_FORBIDDEN';END IF;
 PERFORM public.municipal_adoption_ready_v1();
 SELECT count(*),coalesce(jsonb_agg(jsonb_build_object('revisionId',r.id,'packageSha256',r.package_sha256,'cutoff',to_char(r.source_cutoff,'YYYY-MM-DD"T"HH24:MI:SS')) ORDER BY r.id),'[]'::jsonb)
 INTO n,records FROM public.grh_final_source_revision r JOIN public.grh_final_source_seal seal ON seal.revision_id=r.id
 JOIN public.grh_effective_source_binding selected ON selected.tenant_id=r.tenant_id AND selected.source_binding_id=r.source_binding_id
 AND selected.source_version_id=r.parent_core_version_id AND selected.publication_sha256=r.parent_publication_sha256
 WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF n>1 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SOURCE_CHANGED';END IF;
 RETURN jsonb_build_object('version','employment-adoption-final-sources.v1','scope',jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId','bindingId',ctx->>'sourceBindingId','companyId',(ctx->>'sourceCompanyId')::integer),'total',n,'rows',records);END $final$`;
 return [rows,source,after,bootstrap,available];
}

export function buildFinalContractAdoptionInstallation(options){
 const inactive=buildInactiveJurisdictionInstallation(options),original=buildEmploymentAdoptionInstallation(options),operator=buildMunicipalAdoptionOperatorInstallation(options);
 const find=(definitions,name)=>{const values=definitions.filter(d=>d.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(values.length,1);return values[0];};
 const basePropose=inactive.afterDefinitions[1],baseAllowed=inactive.afterDefinitions[2];
 const baseDecide=find(original.migration,'employment_adoption_decide_v1'),baseStage=find(original.migration,'employment_adoption_decision_source_v1');
 const sourceCall=`public.employment_adoption_final_source_v1(p,(body_value#>>'{finalSource,revisionId}')::uuid,body_value#>>'{finalSource,packageSha256}')`;
 let propose=once(basePropose,'raw:=public.employment_adoption_source_v1(p);',`raw:=CASE WHEN body_value->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' THEN ${sourceCall} ELSE public.employment_adoption_source_v1(p) END;`);
 propose=propose.replaceAll("body_value->>'version' IS NOT DISTINCT FROM 'employment-adoption-input.v2'",`body_value->>'version' IN('employment-adoption-input.v2','${FINAL_ADOPTION_INPUT_VERSION}')`);
 // Extend only the exact v3 body; old/v2 schemas and pending request hashes stay intact.
 propose=once(propose,"CASE WHEN body_value->>'version'='employment-adoption-input.v2' THEN body_value-'version' ELSE body_value END",`CASE WHEN body_value->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' THEN body_value-ARRAY['version','finalSource'] WHEN body_value->>'version'='employment-adoption-input.v2' THEN body_value-'version' ELSE body_value END`);
 propose=once(propose,"body_value->>'version' IS DISTINCT FROM 'employment-adoption-input.v2'",`body_value->>'version' NOT IN('employment-adoption-input.v2','${FINAL_ADOPTION_INPUT_VERSION}')`);
 propose=once(propose,'version_value:=public.employment_adoption_hash_v1(',`IF body_value->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' AND EXISTS(SELECT 1 FROM jsonb_array_elements(raw->'rows') x WHERE x->'sourceIssues' IS DISTINCT FROM '[]'::jsonb) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 IF body_value->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' AND octet_length(raw::text)+octet_length(body_value::text)>8388608 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_LIMIT';END IF;
 version_value:=public.employment_adoption_hash_v1(`);
 propose=once(propose,'fingerprint:=public.employment_adoption_hash_v1(body_value);',`IF body_value->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' AND (jsonb_typeof(body_value->'finalSource') IS DISTINCT FROM 'object'
 OR ARRAY(SELECT jsonb_object_keys(body_value->'finalSource') ORDER BY 1) IS DISTINCT FROM ARRAY['packageSha256','revisionId']
 OR jsonb_typeof(body_value#>'{finalSource,revisionId}') IS DISTINCT FROM 'string' OR body_value#>>'{finalSource,revisionId}'!~'^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$'
 OR jsonb_typeof(body_value#>'{finalSource,packageSha256}') IS DISTINCT FROM 'string' OR body_value#>>'{finalSource,packageSha256}'!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 fingerprint:=public.employment_adoption_hash_v1(body_value);`);
 let decide=once(baseDecide,'raw:=public.employment_adoption_source_v1(p);',`raw:=CASE WHEN r.body->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' THEN public.employment_adoption_final_source_v1(p,(r.body#>>'{finalSource,revisionId}')::uuid,r.body#>>'{finalSource,packageSha256}') ELSE public.employment_adoption_source_v1(p) END;`);
 decide=once(decide,'   INSERT INTO public.native_employee_registration',`   IF r.body->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' THEN new_contract:=public.employment_adoption_final_after_v1(r,old_contract,new_contract->'source_payload'->'native');END IF;
   INSERT INTO public.native_employee_registration`);
 const update="   UPDATE public.employment_contract SET source_system='MUNICONTROL',source_batch_id=NULL,tenant_id=r.tenant_id,jurisdiction_code=entry->>'jurisdictionCode',source_payload=new_contract->'source_payload' WHERE id=(old_contract->>'id')::uuid;";
 decide=once(decide,update,`   UPDATE public.employment_contract SET (source_system,source_batch_id,tenant_id,jurisdiction_code,start_date,end_date,status,agreement_code,category_code,organization_unit_source_id,position_source_id,sector_source_id,source_payload)=
   (SELECT n.source_system,n.source_batch_id,n.tenant_id,n.jurisdiction_code,n.start_date,n.end_date,n.status,n.agreement_code,n.category_code,n.organization_unit_source_id,n.position_source_id,n.sector_source_id,n.source_payload FROM jsonb_populate_record(NULL::public.employment_contract,new_contract) n) WHERE id=(old_contract->>'id')::uuid;`);
 const originalAllowed=once(baseAllowed,'public.employment_adoption_update_allowed_v1(', 'public.employment_adoption_final_original_allowed_v1(');
 let finalAllowed=once(baseAllowed,'public.employment_adoption_update_allowed_v1(', 'public.employment_adoption_final_update_allowed_v1(');
 finalAllowed=once(finalAllowed," AND (to_jsonb(before_row)-ARRAY['source_system','source_batch_id','tenant_id','jurisdiction_code','source_payload'])=(to_jsonb(after_row)-ARRAY['source_system','source_batch_id','tenant_id','jurisdiction_code','source_payload'])",'');
 finalAllowed=once(finalAllowed," AND before_row.source_payload=after_row.source_payload-'native' AND NOT before_row.source_payload ? 'native'"," AND NOT before_row.source_payload ? 'native'");
 finalAllowed=finalAllowed.replaceAll("r.body->>'version'='employment-adoption-input.v2'",`r.body->>'version'='${FINAL_ADOPTION_INPUT_VERSION}'`)
 .replaceAll("before_row.status='inactive'","after_row.status='inactive'").replaceAll('before_row.end_date','after_row.end_date').replaceAll('before_row.start_date','after_row.start_date');
 finalAllowed=once(finalAllowed,' WHERE a.contract_id=before_row.id',` WHERE r.body->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' AND to_jsonb(after_row)=public.employment_adoption_final_after_v1(r,to_jsonb(before_row),after_row.source_payload->'native') AND a.contract_id=before_row.id`);
 const allowed=`CREATE FUNCTION public.employment_adoption_update_allowed_v1(before_row public.employment_contract,after_row public.employment_contract) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $final$
 SELECT public.employment_adoption_final_original_allowed_v1(before_row,after_row) OR public.employment_adoption_final_update_allowed_v1(before_row,after_row) $final$`;
 const stage=once(baseStage,"'rawReview',r.before_snapshot", "'rawReview',r.before_snapshot-'finalContracts'");
 const beforeDefinitions=[basePropose,baseDecide,baseAllowed,baseStage],afterDefinitions=[propose,decide,allowed,stage];
 const operatorReview=find(operator.definitions,'municipal_adoption_review_v1');
 let updatedReview=once(operatorReview,'raw:=public.employment_adoption_source_v1(p);',`raw:=CASE WHEN r.body->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' THEN public.employment_adoption_final_source_v1(p,(r.body#>>'{finalSource,revisionId}')::uuid,r.body#>>'{finalSource,packageSha256}') ELSE public.employment_adoption_source_v1(p) END;`);
 // A decided proposal retains its frozen review. Its original imported cohort
 // has already moved to municipal ownership and cannot be reviewed as pending.
 updatedReview=once(updatedReview,' raw:=CASE',` IF r.body->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' AND d.id IS NOT NULL THEN current_value:=false;ELSE BEGIN\n raw:=CASE`);
 // A competing proposal may remain pending after this cohort was adopted.
 // Its authorized immutable review stays available for rejection. Only known
 // source conflicts become stale; authority and metadata failures still fail.
 updatedReview=once(updatedReview,' RETURN jsonb_build_object(', ` EXCEPTION WHEN raise_exception THEN IF r.body->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' AND SQLERRM IN('EMPLOYMENT_ADOPTION_SOURCE_CHANGED','EMPLOYMENT_ADOPTION_SELECTION_CHANGED','EMPLOYMENT_ADOPTION_CATALOG_CHANGED','GRH_FINAL_REVISION_PARENT_CHANGED') THEN current_value:=false;ELSE RAISE;END IF;END;END IF;\n RETURN jsonb_build_object(`);
 beforeDefinitions.push(operatorReview);afterDefinitions.push(updatedReview);
 const oldHistory=inactive.afterDefinitions[3];
 let history=once(oldHistory,"IF source_value IS DISTINCT FROM r.before_snapshot->'source'", "IF source_value IS DISTINCT FROM (r.before_snapshot->'source')-'finalRevision'");
 history=history.replaceAll("r.body->>'version'='employment-adoption-input.v2'",`r.body->>'version' IN('employment-adoption-input.v2','${FINAL_ADOPTION_INPUT_VERSION}')`);
 history=history.replaceAll("a.before_contract->>'status'='inactive'",`(a.before_contract->>'status'='inactive' OR r.body->>'version'='${FINAL_ADOPTION_INPUT_VERSION}' AND a.after_contract->>'status'='inactive')`);
 // The frozen historical parent remains explicit. The final cut is recorded in
 // the immutable application and canonical native provenance, not relabelled.
 beforeDefinitions.push(oldHistory);afterDefinitions.push(history);
 const oldAttempt=find(original.migration,'employment_adoption_attempt_v1');
 const attempt=once(oldAttempt,'ctx:=public.native_employee_context_v1(p);',"ctx:=public.native_employment_lifecycle_adopted_context_v2(p);IF NOT public.action_center_context_has_capability(ctx,'workforce.employee.read') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_FORBIDDEN';END IF;");
 beforeDefinitions.push(oldAttempt);afterDefinitions.push(attempt);
 const newDefinitions=[...finalContractAdoptionDefinitions(),originalAllowed,finalAllowed];
 const existingPins=new Map([...original.pins,...operator.pins,...inactive.afterPins].map(p=>[p.name,p]));
 const pin=d=>{const p=ownInstallationFunctionPin(d);return {...p,runtime:existingPins.get(p.name)?.runtime??['employment_adoption_final_bootstrap_v1','employment_adoption_final_available_v1'].includes(p.name)};};
 const newPins=newDefinitions.map(pin),sourcePrerequisite=finalSourcePrerequisite(options.read);
 let ready=inactive.afterDefinitions.at(-1);
 for(let n=0;n<beforeDefinitions.length;n++){
  const before=pin(beforeDefinitions[n]),after=pin(afterDefinitions[n]);
  assert.deepEqual({...before,sha256:null},{...after,sha256:null});
  ready=ready.replaceAll(before.sha256,after.sha256);
 }
 const addedChecks=[sourcePrerequisite.check,pinsCheck(newPins,'FINAL_ADOPTION_NEW_METADATA')];
 ready=once(ready,' BEGIN ', ' BEGIN '+addedChecks.map(s=>'EXECUTE '+q(s)+';').join('\n'));
 beforeDefinitions.push(inactive.afterDefinitions.at(-1));afterDefinitions.push(ready);
 const beforePins=beforeDefinitions.map(pin),afterPins=afterDefinitions.map(pin);
 assert.equal(new Set(beforePins.map(p=>p.signature)).size,beforePins.length,'FINAL_ADOPTION_DUPLICATE_FUNCTION');
 assert.equal(new Set(afterPins.map(p=>p.signature)).size,afterPins.length,'FINAL_ADOPTION_DUPLICATE_FUNCTION');
 const beforeCheck=sourcePrerequisite.check+';'+pinsCheck(beforePins,'FINAL_ADOPTION_BEFORE_METADATA'),afterCheck=sourcePrerequisite.check+';'+pinsCheck([...afterPins,...newPins],'FINAL_ADOPTION_AFTER_METADATA');
 const prefix='municontrol_final_adoption.',condition="s.nspname='public' AND p.proname LIKE 'employment_adoption_final_%'";
 const state=`DO $state$ DECLARE n integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'FINAL_ADOPTION_ISOLATION_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(132145);SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${condition};
 IF n=0 THEN PERFORM set_config('${prefix}mode','first',true);ELSIF n=${newPins.length} THEN PERFORM set_config('${prefix}mode','repeat',true);ELSE RAISE EXCEPTION 'FINAL_ADOPTION_PARTIAL_STATE';END IF;END $state$`;
 const initial=`DO $initial$ BEGIN IF current_setting('${prefix}mode')='first' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $initial$`;
 const migration=[...newDefinitions,...afterDefinitions.map(d=>d.replace('CREATE FUNCTION public.','CREATE OR REPLACE FUNCTION public.')),
 `REVOKE ALL ON FUNCTION ${newPins.map(p=>p.signature).join(',')} FROM PUBLIC,municontrol_actions_runtime_app`,
 `GRANT EXECUTE ON FUNCTION ${newPins.filter(p=>p.runtime).map(p=>p.signature).join(',')} TO municontrol_actions_runtime_app`];
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const snap=slot=>{
  let sql=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true')
  .replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",`NOT(${condition})`).replaceAll('municontrol_sql111.',prefix);
  return once(sql,'to_jsonb(p)::text',`(CASE WHEN p.oid IN(${beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);
 };
 const before=snap('before'),after=snap('after'),audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'FINAL_ADOPTION_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const runtime='DO $runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $runtime$';
 const sourceHashes={...inactive.sourceHashes,...original.sourceHashes,...operator.consumers.sourceHashes,...Object.fromEntries(['scripts/lib/final-contract-adoption-installation.mjs','scripts/lib/grh-final-contract-transition.mjs','scripts/lib/municipal-adoption-operator-installation.mjs','scripts/migrations/144-final-grh-source-revision.sql'].map(p=>[p,createHash('sha256').update(options.read(p).replace(/\r\n?/g,'\n')).digest('hex')]))};
 const ids=[...afterPins,...newPins].map(p=>'to_regprocedure('+q(p.signature)+')').join(',');
 const proof=`SELECT jsonb_build_object('version','final-contract-adoption-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,
 'newFunctions',${newPins.length},'adaptedFunctions',${afterPins.length},'newTables',0,'businessOperations',0,'nominalRowsReturned',0,'mode',coalesce(current_setting('${prefix}mode',true),'verify'),
 'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectsFingerprint',(SELECT encode(public.digest(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid IN(${ids}))) AS proof`;
 const readyChecks=[...inactive.readyChecks.map(s=>beforePins.slice(0,-1).reduce((v,p,n)=>v.replaceAll(p.sha256,afterPins[n].sha256),s)),...addedChecks];
 return {inactive,original,operator,sourceHashes,sourcePrerequisite,readyChecks,newDefinitions,beforeDefinitions,afterDefinitions,beforePins,afterPins,newPins,state,initial,before,after,migration,apply,afterCheck,audit,runtime,proof,
 installation:[state,initial,before,apply,afterCheck,runtime,after,audit,proof],verification:['SET TRANSACTION READ ONLY',afterCheck,runtime,after,proof]};
}
