// Generates a conservative extension of the published adoption circuit only.
// No source import, identity resolution, adoption or payroll operation is executed.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {buildActiveSourceDeclarationsInstallation} from './active-source-declarations-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",V6='employment-adoption-input.v6',policy='preserve-original-pending.v1';
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'REGISTRY_ANCHOR_CHANGED: '+a.slice(0,100));return s.replace(a,()=>b);};
export function registryOriginalFactsDefinitions(){
 const eligible=`CREATE FUNCTION public.employment_adoption_registry_eligible_v1(row_value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $registry$
 DECLARE issues jsonb;start_text text;
 BEGIN
 IF jsonb_typeof(row_value) IS DISTINCT FROM 'object' OR NOT row_value ?& ARRAY['status','startDate','endDate','agreementCode','categoryCode','jurisdictionCode','sourceIssues'] OR row_value->>'status' IS DISTINCT FROM 'active' OR row_value->'endDate' IS DISTINCT FROM 'null'::jsonb THEN RETURN false;END IF;
 issues:=row_value->'sourceIssues';IF jsonb_typeof(issues) IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(issues) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' NOT IN('START_DATE_MISSING','CLASSIFICATION_MISSING','JURISDICTION_MISSING_ACTIVE')) OR (SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements(issues) x) THEN RETURN false;END IF;
 IF row_value->'startDate' IS DISTINCT FROM 'null'::jsonb THEN
 start_text:=row_value->>'startDate';IF jsonb_typeof(row_value->'startDate') IS DISTINCT FROM 'string' OR start_text!~'^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR NOT pg_input_is_valid(start_text,'date') THEN RETURN false;END IF;
 IF to_char(start_text::date,'YYYY-MM-DD') IS DISTINCT FROM start_text THEN RETURN false;END IF;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(row_value) x(k,v) WHERE k IN('agreementCode','categoryCode') AND v IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(v) IS DISTINCT FROM 'string' OR btrim(v#>>'{}')='')) OR row_value->'jurisdictionCode' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(row_value->'jurisdictionCode') IS DISTINCT FROM 'string' OR row_value->>'jurisdictionCode' NOT IN('42','55')) THEN RETURN false;END IF;
 RETURN (issues ? 'START_DATE_MISSING')=(row_value->'startDate'='null'::jsonb) AND (issues ? 'CLASSIFICATION_MISSING')=(row_value->'agreementCode'='null'::jsonb OR row_value->'categoryCode'='null'::jsonb) AND (issues ? 'JURISDICTION_MISSING_ACTIVE')=(row_value->'jurisdictionCode'='null'::jsonb);
 END $registry$`;
 const bootstrap=`CREATE FUNCTION public.employment_adoption_registry_bootstrap_v1(p jsonb,p_revision uuid,p_package text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $registry$
 DECLARE value jsonb;raw jsonb;
 BEGIN PERFORM public.municipal_adoption_ready_v1();value:=public.employment_adoption_bootstrap_v1(p);raw:=public.employment_adoption_active_source_v1(p,p_revision,p_package);
 RETURN value||jsonb_build_object('version','employment-adoption-preparation.v6','canPrepare',(value->>'canPrepare')::boolean AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(raw->'rows') x WHERE NOT public.employment_adoption_registry_eligible_v1(x)),'rawReview',raw-'finalContracts');END $registry$`;
 return[eligible,bootstrap];
}
export function buildRegistryOriginalFactsInstallation(options){
 const previous=buildActiveSourceDeclarationsInstallation(options),beforeDefinitions=previous.afterDefinitions;
 const beforePins=previous.afterPins,pin=d=>({...ownInstallationFunctionPin(d),runtime:beforePins.find(p=>p.name===ownInstallationFunctionPin(d).name)?.runtime??false});
 const afterDefinitions=beforeDefinitions.slice(0,-1).map((s,index)=>{
  // Extend only explicit version lists. Old version equality branches stay intact.
  let v=s.replaceAll("'employment-adoption-input.v4','employment-adoption-input.v5'","'employment-adoption-input.v4','employment-adoption-input.v5','"+V6+"'");
  if(index===0){
   v=once(v,"CASE WHEN body_value->>'version'='employment-adoption-input.v5' THEN body_value-ARRAY['version','finalSource','cohort','declarations']",`CASE WHEN body_value->>'version'='${V6}' THEN body_value-ARRAY['version','finalSource','cohort','sourceFactsPolicy'] WHEN body_value->>'version'='employment-adoption-input.v5' THEN body_value-ARRAY['version','finalSource','cohort','declarations']`);
   v=once(v,"fingerprint:=public.employment_adoption_hash_v1(body_value);",`IF body_value->>'version'='${V6}' AND (jsonb_typeof(body_value->'sourceFactsPolicy') IS DISTINCT FROM 'string' OR body_value->>'sourceFactsPolicy' IS DISTINCT FROM '${policy}') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;fingerprint:=public.employment_adoption_hash_v1(body_value);`);
   const missing=`(v->>'jurisdictionCode' IS NULL AND jsonb_typeof(v->'jurisdictionCode')='null'
 AND raw#>>ARRAY['rows',(n-1)::text,'jurisdictionCode'] IS NULL
 AND raw#>>ARRAY['rows',(n-1)::text,'status']='inactive'
 AND raw#>>ARRAY['rows',(n-1)::text,'endDate'] IS NOT NULL
 AND (raw#>>ARRAY['rows',(n-1)::text,'endDate'])::date<(raw->>'today')::date
 AND (raw#>>ARRAY['rows',(n-1)::text,'startDate'] IS NULL OR (raw#>>ARRAY['rows',(n-1)::text,'startDate'])::date<=(raw#>>ARRAY['rows',(n-1)::text,'endDate'])::date))`;
   v=once(v,missing,`(${missing} OR body_value->>'version'='${V6}' AND raw#>ARRAY['rows',(n-1)::text,'jurisdictionCode']='null'::jsonb AND public.employment_adoption_registry_eligible_v1(raw->'rows'->(n::integer-1)))`);
   v=once(v,"x->'sourceIssues' IS DISTINCT FROM '[]'::jsonb",`(CASE WHEN body_value->>'version'='${V6}' THEN NOT public.employment_adoption_registry_eligible_v1(x) ELSE x->'sourceIssues' IS DISTINCT FROM '[]'::jsonb END)`);
   v=once(v,' -- Revalidate authority at persistence,',` IF body_value->>'version'='${V6}' AND EXISTS(SELECT 1 FROM jsonb_array_elements(body_value->'rows') WITH ORDINALITY x(v,n) WHERE v->'jurisdictionCode' IS DISTINCT FROM raw#>ARRAY['rows',(n-1)::text,'jurisdictionCode']) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 -- Revalidate authority at persistence,`);
  }
  if(index===1)v=once(v,"x.candidate->'sourceIssues' IS DISTINCT FROM '[]'::jsonb",`(CASE WHEN r.body->>'version'='${V6}' THEN NOT public.employment_adoption_registry_eligible_v1(x.candidate) ELSE x.candidate->'sourceIssues' IS DISTINCT FROM '[]'::jsonb END)`);
  if(index===2)v=once(v,"candidate->>'status' IS DISTINCT FROM 'active' OR candidate->'sourceIssues' IS DISTINCT FROM '[]'::jsonb",`candidate->>'status' IS DISTINCT FROM 'active' OR (CASE WHEN r.body->>'version'='${V6}' THEN r.body->>'sourceFactsPolicy' IS DISTINCT FROM '${policy}' OR NOT public.employment_adoption_registry_eligible_v1(candidate) ELSE candidate->'sourceIssues' IS DISTINCT FROM '[]'::jsonb END)`);
  if(index===3){
   v=once(v,"AND after_row.status='inactive' AND after_row.end_date IS NOT NULL", "AND (after_row.status='active' AND after_row.end_date IS NULL OR after_row.status='inactive' AND after_row.end_date IS NOT NULL");
   v=once(v,'after_row.start_date<=after_row.end_date)))','after_row.start_date<=after_row.end_date))))');
   v=once(v,"AND to_jsonb(after_row)=public.employment_adoption_final_after_v1",`AND (after_row.jurisdiction_code IS NOT NULL OR after_row.status='inactive' OR r.body->>'version'='${V6}' AND r.body->>'sourceFactsPolicy'='${policy}' AND before_row.jurisdiction_code IS NULL) AND to_jsonb(after_row)=public.employment_adoption_final_after_v1`);
  }
  return v;
 });
 const newDefinitions=registryOriginalFactsDefinitions(),newPins=newDefinitions.map((d,n)=>({...ownInstallationFunctionPin(d),runtime:n===1}));
 const changedPins=afterDefinitions.map(pin),replacePins=s=>beforePins.slice(0,-1).reduce((v,p,n)=>v.replaceAll(p.sha256,changedPins[n].sha256),s);
 let ready=replacePins(beforeDefinitions.at(-1));ready=once(ready,' BEGIN ',' BEGIN EXECUTE '+q(pinsCheck(newPins,'REGISTRY_NEW_METADATA'))+';');afterDefinitions.push(ready);
 const afterPins=afterDefinitions.map(pin),beforeCheck=previous.afterCheck,afterCheck=replacePins(beforeCheck).replaceAll(beforePins.at(-1).sha256,afterPins.at(-1).sha256)+';'+pinsCheck(newPins,'REGISTRY_NEW_METADATA');
 beforePins.forEach((p,n)=>assert.deepEqual({...p,sha256:null},{...afterPins[n],sha256:null}));
 const prefix='municontrol_registry_original.',condition=`s.nspname='public' AND p.proname IN(${newPins.map(p=>q(p.name)).join(',')})`;
 const state=`DO $state$ DECLARE n integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'REGISTRY_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132160);SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${condition};IF n=0 THEN PERFORM set_config('${prefix}mode','first',true);ELSIF n=2 THEN PERFORM set_config('${prefix}mode','repeat',true);ELSE RAISE EXCEPTION 'REGISTRY_PARTIAL_STATE';END IF;END $state$`;
 const initial=`DO $initial$ BEGIN IF current_setting('${prefix}mode')='first' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $initial$`;
 const migration=[...newDefinitions,...afterDefinitions.map(d=>d.replace('CREATE FUNCTION public.','CREATE OR REPLACE FUNCTION public.')),`REVOKE ALL ON FUNCTION ${newPins.map(p=>p.signature).join(',')} FROM PUBLIC,municontrol_actions_runtime_app`,`GRANT EXECUTE ON FUNCTION ${newPins[1].signature} TO municontrol_actions_runtime_app`];
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const snapshot=slot=>{let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",`NOT(${condition})`).replaceAll('municontrol_sql111.',prefix);return once(s,'to_jsonb(p)::text',`(CASE WHEN p.oid IN(${beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);};
 const before=snapshot('before'),after=snapshot('after'),audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'REGISTRY_PRIOR_STATE_CHANGED';END IF;END $audit$`,runtime='DO $runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $runtime$';
 const sourceHashes={...previous.sourceHashes,'scripts/lib/registry-original-facts-installation.mjs':createHash('sha256').update(options.read('scripts/lib/registry-original-facts-installation.mjs').replace(/\r\n?/g,'\n')).digest('hex')};
 const proof=`SELECT jsonb_build_object('version','registry-original-facts-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'newFunctions',2,'adaptedFunctions',7,'newTables',0,'businessOperations',0,'nominalRowsReturned',0,'mode',coalesce(current_setting('${prefix}mode',true),'verify'),'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return{previous,beforeDefinitions,afterDefinitions,newDefinitions,beforePins,afterPins,newPins,sourceHashes,beforeCheck,afterCheck,state,initial,before,after,migration,apply,audit,runtime,proof,installation:[state,initial,before,apply,afterCheck,runtime,after,audit,proof],verification:['SET TRANSACTION READ ONLY',afterCheck,runtime,after,proof]};
}
