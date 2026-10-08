// Integrates declared missing active facts into the existing complete proposal.
// Generates SQL only. No source promotion, adoption or nominal operation here.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {buildFinalIdentityProfileInstallation} from './final-identity-profile-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",V4='employment-adoption-input.v4',V5='employment-adoption-input.v5';
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'DECLARATIONS_ANCHOR_CHANGED: '+a.slice(0,100));return s.replace(a,()=>b);};
export function activeSourceDeclarationsDefinitions(){
 const source=`CREATE FUNCTION public.employment_adoption_declared_source_v1(p jsonb,p_revision uuid,p_package text,declared jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $declared$
 DECLARE raw jsonb;ctx jsonb;catalog jsonb;decl_value jsonb;row_value jsonb;patched jsonb;field text;value text;n integer;row_values jsonb;private_values jsonb;
 BEGIN
 raw:=public.employment_adoption_active_source_v1(p,p_revision,p_package);
 ctx:=public.native_employee_context_v1(p);catalog:=public.native_employee_catalog_v1(ctx);
 IF jsonb_typeof(declared) IS DISTINCT FROM 'array' OR jsonb_array_length(declared) NOT BETWEEN 1 AND 10000 OR octet_length(declared::text)>2097152 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(declared) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 FOR decl_value IN SELECT v FROM jsonb_array_elements(declared) v LOOP
  IF ARRAY(SELECT jsonb_object_keys(decl_value) ORDER BY 1) IS DISTINCT FROM ARRAY['contractId','reason','reference','values'] OR jsonb_typeof(decl_value->'contractId') IS DISTINCT FROM 'string' OR decl_value->>'contractId'!~'^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$' OR jsonb_typeof(decl_value->'values') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
  FOREACH field IN ARRAY ARRAY['reference','reason'] LOOP
   IF jsonb_typeof(decl_value->field) IS DISTINCT FROM 'string' OR length(decl_value->>field) NOT BETWEEN (CASE WHEN field='reference' THEN 3 ELSE 10 END) AND (CASE WHEN field='reference' THEN 180 ELSE 1000 END) OR decl_value->>field IS DISTINCT FROM normalize(btrim(decl_value->>field),NFC) OR decl_value->>field~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
  END LOOP;
  SELECT count(*),(jsonb_agg(v))->0 INTO n,row_value FROM jsonb_array_elements(raw->'rows') v WHERE lower(v->>'contractId')=lower(decl_value->>'contractId');
  IF n<>1 OR row_value->>'status' IS DISTINCT FROM 'active' OR (SELECT count(*) FROM jsonb_object_keys(decl_value->'values'))=0 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
  FOR field,value IN SELECT k,v#>>'{}' FROM jsonb_each(decl_value->'values') x(k,v) LOOP
   IF field NOT IN('startDate','agreementCode','categoryCode','jurisdictionCode') OR row_value->field IS DISTINCT FROM 'null'::jsonb OR jsonb_typeof(decl_value->'values'->field) IS DISTINCT FROM 'string' OR NOT (row_value->'sourceIssues' ? CASE WHEN field='startDate' THEN 'START_DATE_MISSING' WHEN field='jurisdictionCode' THEN 'JURISDICTION_MISSING_ACTIVE' ELSE 'CLASSIFICATION_MISSING' END) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
   IF field='startDate' THEN
    IF value!~'^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR NOT pg_input_is_valid(value,'date') OR to_char(value::date,'YYYY-MM-DD') IS DISTINCT FROM value OR value::date>(raw->>'today')::date THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
   ELSIF field='jurisdictionCode' THEN IF value NOT IN('42','55') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
   ELSIF value!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
  END LOOP;
  patched:=row_value||(decl_value->'values');
  IF decl_value->'values' ?| ARRAY['agreementCode','categoryCode'] AND (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'items') i WHERE i->>'kind'='agreements' AND i->>'code'=patched->>'agreementCode') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'items') i WHERE i->>'kind'='categories' AND i->>'agreementCode'=patched->>'agreementCode' AND i->>'code'=patched->>'categoryCode')) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 END LOOP;
 IF (SELECT count(*)<>count(DISTINCT lower(v->>'contractId')) FROM jsonb_array_elements(declared) v) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;
 -- Remove only the three explicitly resolved missing-fact observations.
 -- Other source conflicts survive and block the complete proposal as before.
 WITH ds AS MATERIALIZED(SELECT d FROM jsonb_array_elements(declared) d),rr AS(SELECT x.r,x.ordinal AS row_order,ds.d,x.r||coalesce(ds.d->'values','{}'::jsonb) fixed FROM jsonb_array_elements(raw->'rows') WITH ORDINALITY x(r,ordinal) LEFT JOIN ds ON lower(ds.d->>'contractId')=lower(x.r->>'contractId'))
 SELECT jsonb_agg(fixed||jsonb_build_object('sourceIssues',(SELECT coalesce(jsonb_agg(i ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements(r->'sourceIssues') WITH ORDINALITY y(i,ord) WHERE NOT(d IS NOT NULL AND (i='"START_DATE_MISSING"'::jsonb AND d->'values' ? 'startDate' OR i='"CLASSIFICATION_MISSING"'::jsonb AND fixed->>'agreementCode' IS NOT NULL AND fixed->>'categoryCode' IS NOT NULL AND d->'values' ?| ARRAY['agreementCode','categoryCode'] OR i='"JURISDICTION_MISSING_ACTIVE"'::jsonb AND d->'values' ? 'jurisdictionCode')))) ORDER BY row_order) INTO row_values FROM rr;
 WITH ds AS MATERIALIZED(SELECT d FROM jsonb_array_elements(declared) d)
 SELECT jsonb_agg(CASE WHEN d IS NULL THEN f ELSE f||jsonb_build_object('sourcePayload',(f->'sourcePayload')||jsonb_build_object('municipalDeclaration',d)) END ORDER BY f->>'contractId') INTO private_values FROM jsonb_array_elements(raw->'finalContracts') f LEFT JOIN ds ON lower(d->>'contractId')=lower(f->>'contractId');
 RETURN raw||jsonb_build_object('source',(raw->'source')||jsonb_build_object('municipalDeclarations',jsonb_build_object('version','municipal-source-declarations.v1','rows',declared)),'rows',row_values,'finalContracts',private_values);
 END $declared$`;
 const bootstrap=`CREATE FUNCTION public.employment_adoption_declared_bootstrap_v1(p jsonb,p_revision uuid,p_package text,source_version text,catalog_version text,declared jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $declared$
 DECLARE ctx jsonb;value jsonb;original jsonb;raw jsonb;
 BEGIN ctx:=public.native_employment_change_context_v1(p,'employee.record.propose');value:=public.employment_adoption_bootstrap_v1(p);original:=public.employment_adoption_active_source_v1(p,p_revision,p_package);
 IF source_version IS DISTINCT FROM public.employment_adoption_hash_v1(jsonb_build_object('scope',original->'scope','source',original->'source')) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SOURCE_CHANGED';END IF;
 IF catalog_version IS DISTINCT FROM value->>'catalogVersion' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_CATALOG_CHANGED';END IF;
 raw:=public.employment_adoption_declared_source_v1(p,p_revision,p_package,declared);
 RETURN value||jsonb_build_object('version','employment-adoption-preparation.v5','rawReview',raw-'finalContracts');END $declared$`;
 return[source,bootstrap];
}
export function buildActiveSourceDeclarationsInstallation(options){
 const previous=buildFinalIdentityProfileInstallation(options),current=previous.current,active=current.previous;
 const beforeDefinitions=[...active.afterDefinitions.slice(0,-1),current.afterDefinitions.at(-1)];
 const pin=d=>({...ownInstallationFunctionPin(d),runtime:active.afterPins.find(p=>p.name===ownInstallationFunctionPin(d).name)?.runtime??false});
 const beforePins=beforeDefinitions.map(pin),afterDefinitions=beforeDefinitions.slice(0,-1).map((s,index)=>{
  let v=s.replaceAll(`'${V4}'`,`'${V4}','${V5}'`);
  // Equality/inequality branches must remain valid predicates, not value lists.
  for(const actor of ['body_value','r.body'])v=v.replaceAll(`${actor}->>'version'='${V4}','${V5}'`,`${actor}->>'version' IN('${V4}','${V5}')`).replaceAll(`${actor}->>'version' IS DISTINCT FROM '${V4}','${V5}'`,`${actor}->>'version' NOT IN('${V4}','${V5}')`);
  if([0,1,4].includes(index)){
   const actor=index===0?'body_value':'r.body',call=`public.employment_adoption_active_source_v1(p,(${actor}#>>'{finalSource,revisionId}')::uuid,${actor}#>>'{finalSource,packageSha256}')`;
   v=once(v,call,`CASE WHEN ${actor}->>'version'='${V5}' THEN public.employment_adoption_declared_source_v1(p,(${actor}#>>'{finalSource,revisionId}')::uuid,${actor}#>>'{finalSource,packageSha256}',${actor}->'declarations') ELSE ${call} END`);
  }
  if(index===0)v=once(v,`CASE WHEN body_value->>'version' IN('${V4}','${V5}') THEN body_value-ARRAY['version','finalSource','cohort']`,`CASE WHEN body_value->>'version'='${V5}' THEN body_value-ARRAY['version','finalSource','cohort','declarations'] WHEN body_value->>'version'='${V4}' THEN body_value-ARRAY['version','finalSource','cohort']`);
  if(index===5)v=v.replaceAll("ARRAY['finalRevision','operationalCohort']","ARRAY['finalRevision','operationalCohort','municipalDeclarations']");
  return v;
 });
 const newDefinitions=activeSourceDeclarationsDefinitions(),newPins=newDefinitions.map((d,n)=>({...ownInstallationFunctionPin(d),runtime:n===1}));
 const changedPins=afterDefinitions.map(pin),replacePins=s=>beforePins.slice(0,-1).reduce((v,p,n)=>v.replaceAll(p.sha256,changedPins[n].sha256),s);
 let ready=replacePins(beforeDefinitions.at(-1));ready=once(ready,' BEGIN ',' BEGIN EXECUTE '+q(pinsCheck(newPins,'DECLARATIONS_NEW_METADATA'))+';');afterDefinitions.push(ready);
 const afterPins=afterDefinitions.map(pin),beforeCheck=previous.afterCheck,afterCheck=replacePins(beforeCheck).replaceAll(beforePins.at(-1).sha256,afterPins.at(-1).sha256)+';'+pinsCheck(newPins,'DECLARATIONS_NEW_METADATA');
 beforePins.forEach((p,n)=>assert.deepEqual({...p,sha256:null},{...afterPins[n],sha256:null}));
 const prefix='municontrol_source_declarations.',names=newPins.map(p=>q(p.name)).join(','),condition=`s.nspname='public' AND p.proname IN(${names})`;
 const state=`DO $state$ DECLARE n integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'DECLARATIONS_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132150);SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${condition};IF n=0 THEN PERFORM set_config('${prefix}mode','first',true);ELSIF n=2 THEN PERFORM set_config('${prefix}mode','repeat',true);ELSE RAISE EXCEPTION 'DECLARATIONS_PARTIAL_STATE';END IF;END $state$`;
 const initial=`DO $initial$ BEGIN IF current_setting('${prefix}mode')='first' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $initial$`;
 const migration=[...newDefinitions,...afterDefinitions.map(d=>d.replace('CREATE FUNCTION public.','CREATE OR REPLACE FUNCTION public.')),`REVOKE ALL ON FUNCTION ${newPins.map(p=>p.signature).join(',')} FROM PUBLIC,municontrol_actions_runtime_app`,`GRANT EXECUTE ON FUNCTION ${newPins[1].signature} TO municontrol_actions_runtime_app`];
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const snapshot=slot=>{let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",`NOT(${condition})`).replaceAll('municontrol_sql111.',prefix);return once(s,'to_jsonb(p)::text',`(CASE WHEN p.oid IN(${beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);};
 const before=snapshot('before'),after=snapshot('after'),audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'DECLARATIONS_PRIOR_STATE_CHANGED';END IF;END $audit$`,runtime='DO $runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $runtime$';
 const sourceHashes={...previous.sourceHashes,'scripts/lib/active-source-declarations-installation.mjs':createHash('sha256').update(options.read('scripts/lib/active-source-declarations-installation.mjs').replace(/\r\n?/g,'\n')).digest('hex')};
 const proof=`SELECT jsonb_build_object('version','active-source-declarations-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'newFunctions',2,'adaptedFunctions',7,'newTables',0,'businessOperations',0,'nominalRowsReturned',0,'mode',coalesce(current_setting('${prefix}mode',true),'verify'),'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return{previous,current,beforeDefinitions,afterDefinitions,newDefinitions,beforePins,afterPins,newPins,sourceHashes,beforeCheck,afterCheck,state,initial,before,after,migration,apply,audit,runtime,proof,installation:[state,initial,before,apply,afterCheck,runtime,after,audit,proof],verification:['SET TRANSACTION READ ONLY',afterCheck,runtime,after,proof]};
}
