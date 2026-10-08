// Explicit operational cohort over the full verified source. Generates SQL only.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildFinalContractAdoptionInstallation} from './final-contract-adoption-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'ACTIVE_ADOPTION_ANCHOR_CHANGED: '+a.slice(0,80));return s.replace(a,()=>b);};
const V3='employment-adoption-input.v3',V4='employment-adoption-input.v4';
const ACTIVE_PROOF_TABLE='mc_active_adoption_facts';

export function activeContractAdoptionDefinitions(){
 const source=`CREATE FUNCTION public.employment_adoption_active_source_v1(p jsonb,p_revision uuid,p_package text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $active$
 DECLARE raw jsonb;rows_value jsonb;private_value jsonb;active_total integer;archived_total integer;
 BEGIN
 raw:=public.employment_adoption_final_source_v1(p,p_revision,p_package);
 -- The full source has already passed its ten seals, identities and complete coverage.
 -- Unknown states are not treated as inactive or silently discarded.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(raw->'rows') v WHERE v->>'status' NOT IN('active','inactive') OR v->>'status' IS NULL) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 SELECT count(*) FILTER(WHERE v->>'status'='active'),count(*) FILTER(WHERE v->>'status'='inactive') INTO active_total,archived_total FROM jsonb_array_elements(raw->'rows') v;
 IF active_total+archived_total<>(raw->>'total')::integer THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 WITH selected AS (SELECT v,row_number() OVER(ORDER BY n) ordinal FROM jsonb_array_elements(raw->'rows') WITH ORDINALITY x(v,n) WHERE v->>'status'='active')
 SELECT coalesce(jsonb_agg(v||jsonb_build_object('rowNumber',ordinal,'sourceRowNumber',v->'rowNumber') ORDER BY ordinal),'[]'::jsonb) INTO rows_value FROM selected;
 WITH selected_ids AS MATERIALIZED(SELECT r->>'contractId' id FROM jsonb_array_elements(rows_value) r)
 SELECT coalesce(jsonb_agg(f ORDER BY f->>'contractId'),'[]'::jsonb) INTO private_value FROM jsonb_array_elements(raw->'finalContracts') f JOIN selected_ids ON selected_ids.id=f->>'contractId';
 IF jsonb_array_length(private_value)<>active_total THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 RETURN raw||jsonb_build_object('source',(raw->'source')||jsonb_build_object('operationalCohort',jsonb_build_object('version','active-contracts.v1','sourceTotal',(raw->>'total')::integer,'archivedTotal',archived_total)),'total',active_total,'rows',rows_value,'finalContracts',private_value);
 END $active$`;
 const bootstrap=`CREATE FUNCTION public.employment_adoption_active_bootstrap_v1(p jsonb,p_revision uuid,p_package text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $active$
 DECLARE value jsonb;raw jsonb;
 BEGIN value:=public.employment_adoption_bootstrap_v1(p);raw:=public.employment_adoption_active_source_v1(p,p_revision,p_package);
 RETURN value||jsonb_build_object('version','employment-adoption-preparation.v4','rawReview',raw-'finalContracts');END $active$`;
 const proof=`CREATE FUNCTION public.employment_adoption_active_proof_v1(p_proposal uuid,p_contract uuid,p_version text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $active$
 DECLARE relation oid;value jsonb;BEGIN
 relation:=to_regclass('pg_temp.${ACTIVE_PROOF_TABLE}');
 IF relation IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=relation AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relpersistence='t' AND c.relnamespace=pg_my_temp_schema() AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 EXECUTE 'SELECT jsonb_build_object(''source'',source,''candidate'',candidate,''before'',before_fact,''body'',body_row) FROM pg_temp.${ACTIVE_PROOF_TABLE} WHERE proposal_id=$1 AND contract_id=$2 AND proposal_version=$3 AND applied_xid=pg_current_xact_id_if_assigned()' INTO value USING p_proposal,p_contract,p_version;
 IF value IS NULL THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;RETURN value;
 END $active$`;
 return [source,bootstrap,proof];
}

export function buildActiveContractAdoptionInstallation(options){
 const final=buildFinalContractAdoptionInstallation(options),all=[...final.newDefinitions,...final.afterDefinitions];
 const find=name=>{const found=all.filter(d=>d.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(found.length,1);return found[0];};
 const extend=s=>s.replaceAll(`IN('employment-adoption-input.v2','${V3}')`,`IN('employment-adoption-input.v2','${V3}','${V4}')`);
 const finalTest=(s,actor)=>s.replaceAll(`${actor}->>'version'='${V3}'`,`${actor}->>'version' IN('${V3}','${V4}')`);
 const names=['employment_adoption_propose_v1','employment_adoption_decide_v1','employment_adoption_final_after_v1','employment_adoption_final_update_allowed_v1','municipal_adoption_review_v1','native_employment_history_v1'];
 // Locate the actual published history signature, never guess a parallel reader.
 const history=final.afterPins.find(p=>/history/.test(p.name));assert.ok(history);names[5]=history.name;
 const beforeDefinitions=names.map(find),afterDefinitions=[...beforeDefinitions];
 let propose=extend(beforeDefinitions[0]);
 propose=once(propose,`raw:=CASE WHEN body_value->>'version'='${V3}'`, `raw:=CASE WHEN body_value->>'version'='${V4}' THEN public.employment_adoption_active_source_v1(p,(body_value#>>'{finalSource,revisionId}')::uuid,body_value#>>'{finalSource,packageSha256}') WHEN body_value->>'version'='${V3}'`);
 propose=once(propose,`CASE WHEN body_value->>'version'='${V3}' THEN body_value-ARRAY['version','finalSource']`, `CASE WHEN body_value->>'version'='${V4}' THEN body_value-ARRAY['version','finalSource','cohort'] WHEN body_value->>'version'='${V3}' THEN body_value-ARRAY['version','finalSource']`);
 // Extend the original final-source checks without changing legacy raw-source dispatch.
 propose=propose.replaceAll(`IF body_value->>'version'='${V3}'`, `IF body_value->>'version' IN('${V3}','${V4}')`);
 propose=once(propose,'fingerprint:=public.employment_adoption_hash_v1(body_value);',`IF body_value->>'version'='${V4}' AND (jsonb_typeof(body_value->'cohort') IS DISTINCT FROM 'string' OR body_value->>'cohort' IS DISTINCT FROM 'active-contracts.v1') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;fingerprint:=public.employment_adoption_hash_v1(body_value);`);
 afterDefinitions[0]=propose;
 for(const n of [1,4]){
  let value=beforeDefinitions[n];
  value=once(value,`raw:=CASE WHEN r.body->>'version'='${V3}'`, `raw:=CASE WHEN r.body->>'version'='${V4}' THEN public.employment_adoption_active_source_v1(p,(r.body#>>'{finalSource,revisionId}')::uuid,r.body#>>'{finalSource,packageSha256}') WHEN r.body->>'version'='${V3}'`);
  // Dispatch above remains version-specific; other final behavior includes v4.
  value=value.replaceAll(`IF r.body->>'version'='${V3}'`, `IF r.body->>'version' IN('${V3}','${V4}')`);
  afterDefinitions[n]=value;
 }
 // Materialize the already reverified immutable proof once per v4 decision.
 // Owner-only, indexed and transaction-local; neither clients nor runtime can
 // supply or read it. No durable copy, table, permission or timeout is added.
 afterDefinitions[1]=once(afterDefinitions[1],'  FOR f,entry IN SELECT',`  IF r.body->>'version'='${V4}' THEN
   IF to_regclass('pg_temp.${ACTIVE_PROOF_TABLE}') IS NOT NULL THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
   CREATE TEMP TABLE ${ACTIVE_PROOF_TABLE}(proposal_id uuid NOT NULL,contract_id uuid NOT NULL,proposal_version text NOT NULL,applied_xid xid8 NOT NULL,source jsonb NOT NULL,candidate jsonb NOT NULL,before_fact jsonb NOT NULL,body_row jsonb NOT NULL,PRIMARY KEY(proposal_id,contract_id)) ON COMMIT DROP;
   REVOKE ALL ON TABLE pg_temp.${ACTIVE_PROOF_TABLE} FROM PUBLIC,municontrol_actions_runtime_app;
   INSERT INTO pg_temp.${ACTIVE_PROOF_TABLE}
   WITH frozen AS MATERIALIZED(SELECT v FROM jsonb_array_elements(s.facts) v),sources AS MATERIALIZED(SELECT v FROM jsonb_array_elements(r.before_snapshot->'finalContracts') v),candidates AS MATERIALIZED(SELECT v FROM jsonb_array_elements(r.before_snapshot->'rows') v),requests AS MATERIALIZED(SELECT v FROM jsonb_array_elements(r.body->'rows') v)
   SELECT r.id,(proof_frozen.v#>>'{contract,id}')::uuid,r.proposal_version,pg_current_xact_id(),proof_source.v,proof_candidate.v,proof_frozen.v,proof_body.v
   FROM frozen proof_frozen JOIN sources proof_source ON proof_source.v->>'contractId'=proof_frozen.v#>>'{contract,id}' JOIN candidates proof_candidate ON proof_candidate.v->>'contractId'=proof_frozen.v#>>'{contract,id}' JOIN requests proof_body ON proof_body.v->>'contractId'=proof_frozen.v#>>'{contract,id}';
   GET DIAGNOSTICS changed=ROW_COUNT;
   IF changed<>r.total OR EXISTS(SELECT 1 FROM pg_temp.${ACTIVE_PROOF_TABLE} x WHERE x.source->>'personId' IS DISTINCT FROM x.before_fact#>>'{contract,person_id}' OR x.candidate->>'status' IS DISTINCT FROM 'active' OR x.candidate->'sourceIssues' IS DISTINCT FROM '[]'::jsonb OR x.body_row->'jurisdictionCode' IS DISTINCT FROM x.candidate->'jurisdictionCode') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
  END IF;
  FOR f,entry IN SELECT`);
 let after=once(beforeDefinitions[2],`IF r.body->>'version' IS DISTINCT FROM '${V3}'`, `IF r.body->>'version' IS DISTINCT FROM '${V3}' AND r.body->>'version' IS DISTINCT FROM '${V4}'`);
 after=once(after,'DECLARE row_value jsonb;candidate jsonb;before_value jsonb;n integer;','DECLARE row_value jsonb;candidate jsonb;before_value jsonb;proof jsonb;n integer;');
 const scan=" SELECT count(*),jsonb_agg(v)->0 INTO n,row_value FROM jsonb_array_elements(r.before_snapshot->'finalContracts')";
 after=once(after,scan,` IF r.body->>'version'='${V4}' THEN
 proof:=public.employment_adoption_active_proof_v1(r.id,(old_contract->>'id')::uuid,r.proposal_version);
 row_value:=proof->'source';candidate:=proof->'candidate';before_value:=proof->'before';
 IF row_value->>'personId' IS DISTINCT FROM old_contract->>'person_id' OR row_value->>'contractId' IS DISTINCT FROM old_contract->>'id' OR before_value->'contract' IS DISTINCT FROM old_contract OR candidate->>'contractId' IS DISTINCT FROM old_contract->>'id' OR candidate->>'status' IS DISTINCT FROM 'active' OR candidate->'sourceIssues' IS DISTINCT FROM '[]'::jsonb OR proof#>>'{body,contractId}' IS DISTINCT FROM old_contract->>'id' OR proof#>'{body,jurisdictionCode}' IS DISTINCT FROM candidate->'jurisdictionCode' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 ELSE
${scan}`);
 after=once(after,' RETURN old_contract||',' END IF;\n RETURN old_contract||');
 after=once(after,' RETURN old_contract||',` IF r.body->>'version'='${V4}' AND (r.body->>'cohort' IS DISTINCT FROM 'active-contracts.v1' OR candidate->>'status' IS DISTINCT FROM 'active') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 RETURN old_contract||`);afterDefinitions[2]=after;
 let allowed=finalTest(beforeDefinitions[3],'r.body');
 allowed=once(allowed," AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.facts) f WHERE f->'contract'=a.before_contract AND f->'person'=a.before_person)",` AND CASE WHEN r.body->>'version'='${V4}' THEN
  public.employment_adoption_active_proof_v1(r.id,a.contract_id,r.proposal_version)#>'{before,contract}'=a.before_contract AND public.employment_adoption_active_proof_v1(r.id,a.contract_id,r.proposal_version)#>'{before,person}'=a.before_person
 ELSE EXISTS(SELECT 1 FROM jsonb_array_elements(s.facts) f WHERE f->'contract'=a.before_contract AND f->'person'=a.before_person) END`);
 allowed=once(allowed," AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.body->'rows') x WHERE x->>'contractId'=a.contract_id::text AND x->>'jurisdictionCode' IS NOT DISTINCT FROM after_row.jurisdiction_code)",` AND CASE WHEN r.body->>'version'='${V4}' THEN
  public.employment_adoption_active_proof_v1(r.id,a.contract_id,r.proposal_version)#>>'{body,contractId}'=a.contract_id::text AND public.employment_adoption_active_proof_v1(r.id,a.contract_id,r.proposal_version)#>>'{body,jurisdictionCode}' IS NOT DISTINCT FROM after_row.jurisdiction_code
 ELSE EXISTS(SELECT 1 FROM jsonb_array_elements(r.body->'rows') x WHERE x->>'contractId'=a.contract_id::text AND x->>'jurisdictionCode' IS NOT DISTINCT FROM after_row.jurisdiction_code) END`);
 afterDefinitions[3]=allowed;
 afterDefinitions[5]=extend(beforeDefinitions[5]).replaceAll("(r.before_snapshot->'source')-'finalRevision'", "(r.before_snapshot->'source')-ARRAY['finalRevision','operationalCohort']");
 const priorPins=new Map([...final.afterPins,...final.newPins].map(p=>[p.name,p]));
 const pin=d=>{const p=ownInstallationFunctionPin(d);return {...p,runtime:priorPins.get(p.name)?.runtime??p.name==='employment_adoption_active_bootstrap_v1'};};
 const newDefinitions=activeContractAdoptionDefinitions(),newPins=newDefinitions.map(pin);
 let ready=find('municipal_adoption_ready_v1');
 for(let n=0;n<beforeDefinitions.length;n++)ready=ready.replaceAll(pin(beforeDefinitions[n]).sha256,pin(afterDefinitions[n]).sha256);
 ready=once(ready,' BEGIN ', ' BEGIN EXECUTE '+q(pinsCheck(newPins,'ACTIVE_ADOPTION_NEW_METADATA'))+';');
 beforeDefinitions.push(find('municipal_adoption_ready_v1'));afterDefinitions.push(ready);
 const beforePins=beforeDefinitions.map(pin),afterPins=afterDefinitions.map(pin);
 beforePins.forEach((p,n)=>assert.deepEqual({...p,sha256:null},{...afterPins[n],sha256:null}));
 const prefix='municontrol_active_adoption.',condition="s.nspname='public' AND p.proname LIKE 'employment_adoption_active_%'";
 const prerequisite=final.sourcePrerequisite.check;
 const beforeCheck=prerequisite+';'+pinsCheck([...beforePins,...final.afterPins.filter(p=>!names.includes(p.name)&&p.name!=='municipal_adoption_ready_v1'),...final.newPins.filter(p=>!names.includes(p.name))],'ACTIVE_ADOPTION_BEFORE_METADATA');
 const afterCheck=prerequisite+';'+pinsCheck([...afterPins,...newPins],'ACTIVE_ADOPTION_AFTER_METADATA');
 const state=`DO $state$ DECLARE n integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'ACTIVE_ADOPTION_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132147);SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${condition};IF n=0 THEN PERFORM set_config('${prefix}mode','first',true);ELSIF n=${newPins.length} THEN PERFORM set_config('${prefix}mode','repeat',true);ELSE RAISE EXCEPTION 'ACTIVE_ADOPTION_PARTIAL_STATE';END IF;END $state$`;
 const initial=`DO $initial$ BEGIN IF current_setting('${prefix}mode')='first' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $initial$`;
 const migration=[...newDefinitions,...afterDefinitions.map(d=>d.replace('CREATE FUNCTION public.','CREATE OR REPLACE FUNCTION public.')),`REVOKE ALL ON FUNCTION ${newPins.map(p=>p.signature).join(',')} FROM PUBLIC,municontrol_actions_runtime_app`,`GRANT EXECUTE ON FUNCTION ${newPins.filter(p=>p.runtime).map(p=>p.signature).join(',')} TO municontrol_actions_runtime_app`];
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const snap=slot=>{let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",`NOT(${condition})`).replaceAll('municontrol_sql111.',prefix);return once(s,'to_jsonb(p)::text',`(CASE WHEN p.oid IN(${beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);};
 const before=snap('before'),afterSnapshot=snap('after'),audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'ACTIVE_ADOPTION_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const runtime='DO $runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $runtime$';
 const readyChecks=[...final.readyChecks.map(s=>beforePins.slice(0,-1).reduce((v,p,n)=>v.replaceAll(p.sha256,afterPins[n].sha256),s)),pinsCheck(newPins,'ACTIVE_ADOPTION_NEW_METADATA')];
 const sourceHashes={...final.sourceHashes,'scripts/lib/active-contract-adoption-installation.mjs':createHash('sha256').update(options.read('scripts/lib/active-contract-adoption-installation.mjs').replace(/\r\n?/g,'\n')).digest('hex')};
 const proof=`SELECT jsonb_build_object('version','active-contract-adoption-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'newFunctions',${newPins.length},'adaptedFunctions',${afterPins.length},'newTables',0,'businessOperations',0,'nominalRowsReturned',0,'mode',coalesce(current_setting('${prefix}mode',true),'verify'),'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return {final,sourceHashes,readyChecks,beforeDefinitions,afterDefinitions,newDefinitions,beforePins,afterPins,newPins,state,initial,before,after:afterSnapshot,afterCheck,apply,audit,runtime,proof,migration,installation:[state,initial,before,apply,afterCheck,runtime,afterSnapshot,audit,proof],verification:['SET TRANSACTION READ ONLY',afterCheck,runtime,afterSnapshot,proof]};
}
