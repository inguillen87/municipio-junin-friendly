// Pure source construction for an explicit mixed backup cohort. No connection or write.
import assert from'node:assert/strict';
import{MIXED_ADOPTION_COHORT,MIXED_ADOPTION_PREPARATION_VERSION}from'../../assets/employment-adoption-mixed-cohort.js';
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'MIXED_ADOPTION_SOURCE_ANCHOR_CHANGED:'+a.slice(0,90));return s.replace(a,()=>b);};
export function mixedContractPartitionDefinition(){return `CREATE FUNCTION public.employment_adoption_mixed_partition_v1(ctx jsonb,raw jsonb,records jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $mixed$
DECLARE classified jsonb;selected jsonb;private_selected jsonb;cohort jsonb;n integer;
BEGIN
 IF jsonb_typeof(records) IS DISTINCT FROM 'array' OR jsonb_array_length(records)<>(raw->>'total')::integer
 OR jsonb_array_length(raw->'rows')<>(raw->>'total')::integer THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 -- Existing native contracts are recognized only through the immutable adoption
 -- application and registration; a matching legajo/DNI never supplies this link.
 WITH joined AS MATERIALIZED(SELECT r.v record,x.v candidate,x.n ordinal,
 EXISTS(SELECT 1 FROM public.employment_adoption_application a
 JOIN public.employment_adoption_decision d ON d.id=a.decision_id AND d.decision='approve'
 JOIN public.native_employee_registration registration ON registration.id=a.registration_id
 JOIN public.employment_contract c ON c.id=a.contract_id AND c.person_id=registration.person_id
 WHERE a.contract_id::text=r.v->>'contractId' AND registration.contract_id=c.id
 AND d.tenant_id=(ctx->>'tenantId')::uuid AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND registration.tenant_id=d.tenant_id AND registration.source_binding_id=d.source_binding_id
 AND c.source_system='MUNICONTROL' AND c.tenant_id=d.tenant_id
 AND registration.id::text=c.source_payload#>>'{native,registrationId}'
 AND a.before_contract->>'source_system'='GRH' AND a.before_contract->>'person_id'=c.person_id::text
 AND a.before_contract->>'legacy_legajo'=x.v->>'legajo'
 AND a.before_contract->>'legacy_company_id'=ctx->>'sourceCompanyId'
 AND a.before_person->>'id'=c.person_id::text) adopted
 FROM jsonb_array_elements(records) WITH ORDINALITY r(v,n)
 JOIN jsonb_array_elements(raw->'rows') WITH ORDINALITY x(v,n) ON r.n=x.n),
 partitioned AS(SELECT *,CASE WHEN adopted THEN 'adopted' WHEN record->>'contractId' IS NULL THEN 'pending'
 WHEN candidate->>'status'='inactive' THEN 'archived' WHEN candidate->'startDate'='null'::jsonb THEN 'deferred' ELSE 'selected' END state FROM joined)
 SELECT coalesce(jsonb_agg(jsonb_build_object('record',record,'candidate',candidate,'sourceRowNumber',ordinal,'state',state) ORDER BY ordinal),'[]'::jsonb)
 INTO classified FROM partitioned;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(classified) v WHERE v#>>'{candidate,status}' NOT IN('active','inactive')
 OR v#>>'{candidate,status}' IS NULL OR (v#>>'{record,contractId}') IS DISTINCT FROM (v#>>'{candidate,contractId}')
 OR v->>'state'='pending' AND (v#>'{record,before}' IS DISTINCT FROM 'null'::jsonb OR v#>>'{record,personId}' IS NOT NULL
 OR NOT(v#>'{record,issues}' ? 'CONTRACT_NOT_FOUND') OR v#>'{record,issues}' ?| ARRAY['CONTRACT_AMBIGUOUS','SOURCE_KEY_INVALID','CORE_RECORD_MISSING','CORE_RECORD_AMBIGUOUS','SOURCE_FACTS_MISSING','ACTIVE_STATE_CONFLICT'])
 OR v->>'state' NOT IN('pending','adopted') AND v#>>'{record,before,contract,source_system}' IS DISTINCT FROM 'GRH'
 OR v->>'state'='deferred' AND NOT public.employment_adoption_registry_eligible_v1(v->'candidate'))
 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 SELECT jsonb_build_object('version','${MIXED_ADOPTION_COHORT}',
 'sourceTotal',count(*),'knownTotal',count(*) FILTER(WHERE v->>'state'<>'pending'),
 'selectedTotal',count(*) FILTER(WHERE v->>'state'='selected'),'archivedTotal',count(*) FILTER(WHERE v->>'state'='archived'),
 'deferredTotal',count(*) FILTER(WHERE v->>'state'='deferred'),'pendingTotal',count(*) FILTER(WHERE v->>'state'='pending'),
 'adoptedTotal',count(*) FILTER(WHERE v->>'state'='adopted'),
 'deferredSourceRowNumbers',coalesce(jsonb_agg(v->'sourceRowNumber' ORDER BY (v->>'sourceRowNumber')::integer) FILTER(WHERE v->>'state'='deferred'),'[]'::jsonb),
 'adoptedSourceRowNumbers',coalesce(jsonb_agg(v->'sourceRowNumber' ORDER BY (v->>'sourceRowNumber')::integer) FILTER(WHERE v->>'state'='adopted'),'[]'::jsonb),
 'pendingSourceRows',coalesce(jsonb_agg(jsonb_build_object('rowKey',v#>'{record,rowKey}','sourceRowNumber',v->'sourceRowNumber',
 'factsSha256',public.employment_adoption_hash_v1(v->'record'),'reasons',v#>'{record,issues}') ORDER BY (v->>'sourceRowNumber')::integer)
 FILTER(WHERE v->>'state'='pending'),'[]'::jsonb)) INTO cohort FROM jsonb_array_elements(classified) v;
 IF (cohort->>'sourceTotal')::integer<>(raw->>'total')::integer
 OR (cohort->>'sourceTotal')::integer<>(cohort->>'knownTotal')::integer+(cohort->>'pendingTotal')::integer
 OR (cohort->>'knownTotal')::integer<>(cohort->>'selectedTotal')::integer+(cohort->>'archivedTotal')::integer+(cohort->>'deferredTotal')::integer+(cohort->>'adoptedTotal')::integer
 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 WITH numbered AS(SELECT v,row_number() OVER(ORDER BY (v->>'sourceRowNumber')::integer) selected_ordinal FROM jsonb_array_elements(classified) v WHERE v->>'state'='selected')
 SELECT coalesce(jsonb_agg((v->'candidate')||jsonb_build_object('rowNumber',selected_ordinal,'sourceRowNumber',v->'sourceRowNumber') ORDER BY selected_ordinal),'[]'::jsonb)
 INTO selected FROM numbered;
 WITH ids AS(SELECT v->>'contractId' id FROM jsonb_array_elements(selected) v)
 SELECT coalesce(jsonb_agg(v ORDER BY v->>'contractId'),'[]'::jsonb) INTO private_selected
 FROM jsonb_array_elements(raw->'finalContracts') v JOIN ids ON ids.id=v->>'contractId';
 n:=(cohort->>'selectedTotal')::integer;
 IF jsonb_array_length(selected)<>n OR jsonb_array_length(private_selected)<>n THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 RETURN raw||jsonb_build_object('source',(raw->'source')||jsonb_build_object('operationalCohort',cohort),'total',n,'rows',selected,'finalContracts',private_selected);
END $mixed$`;}

/** Fork the pinned complete reader; its historical all-UUID reader is never weakened. */
export function deriveMixedContractSourceDefinition(source){
 let mixed=once(source,'CREATE FUNCTION public.employment_adoption_final_source_v1(','CREATE FUNCTION public.employment_adoption_mixed_source_v1(');
 mixed=once(mixed,"IF (cohort->>'candidate_rows')::integer<>(cohort->>'existing_rows')::integer OR ", 'IF ');
 mixed=once(mixed,"ORDER BY x.v->>'contract_id'","ORDER BY x.v->>'row_key'");
 mixed=once(mixed,"OR EXISTS(SELECT 1 FROM jsonb_array_elements(records) x WHERE x->>'contractId' IS NULL OR x->>'personId' IS NULL OR jsonb_typeof(x->'before') IS DISTINCT FROM 'object')",`OR EXISTS(SELECT 1 FROM jsonb_array_elements(records) x WHERE
 ((x->>'contractId' IS NULL OR x->>'personId' IS NULL OR jsonb_typeof(x->'before') IS DISTINCT FROM 'object')
 AND NOT(x->>'contractId' IS NULL AND x->>'personId' IS NULL AND x->'before'='null'::jsonb AND x->'issues' ? 'CONTRACT_NOT_FOUND' AND NOT(x->'issues' ? 'CONTRACT_AMBIGUOUS'))))`);
 // The full exact records/cohort/ten seals are hashed above this partition.
 // Filtering happens afterwards and returns explicit counts for every source row.
 mixed=once(mixed,' IF octet_length(result::text)>8388608', ' result:=public.employment_adoption_mixed_partition_v1(ctx,result,records);\n IF octet_length(result::text)>8388608');
 assert.ok(mixed.includes("'records',records"));assert.ok(mixed.includes('adoption_source_streaming_fingerprint_v1'));
 return mixed;
}
export function mixedContractBootstrapDefinition(){return `CREATE FUNCTION public.employment_adoption_mixed_bootstrap_v1(p jsonb,p_revision uuid,p_package text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $mixed$
DECLARE value jsonb;raw jsonb;BEGIN
 PERFORM public.municipal_adoption_ready_v1();value:=public.employment_adoption_bootstrap_v1(p);raw:=public.employment_adoption_mixed_source_v1(p,p_revision,p_package);
 RETURN value||jsonb_build_object('version','${MIXED_ADOPTION_PREPARATION_VERSION}','canPrepare',(value->>'canPrepare')::boolean AND (raw->>'total')::integer>0
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(raw->'rows') v WHERE v->'sourceIssues' IS DISTINCT FROM '[]'::jsonb),'rawReview',raw-'finalContracts');
END $mixed$`;}

export function deriveMixedContractAvailableDefinition(source){
 let value=once(source,'CREATE FUNCTION public.employment_adoption_final_available_v1(','CREATE FUNCTION public.employment_adoption_mixed_available_v1(');
 value=once(value,"IF n>1 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SOURCE_CHANGED'","IF n>2 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SOURCE_CHANGED'");
 return once(value,"'employment-adoption-final-sources.v1'","'employment-adoption-final-sources.v2'");
}
