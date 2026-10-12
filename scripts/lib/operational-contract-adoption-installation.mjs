// New explicit cohort over the full sealed source. Generates an installation;
// never connects, adopts records, invents dates or changes an earlier request.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildRegistryOriginalFactsInstallation} from './registry-original-facts-installation.mjs';
import {buildOwnPeriodParticipationSql} from './own-period-participation-installation.mjs';
import {buildSalaryAuxiliaryNamespaceSql} from './salary-auxiliary-namespace-installation.mjs';
import {buildOwnRunDateInstallation} from './own-payroll-run-date-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {OPERATIONAL_ADOPTION_INPUT_VERSION as V7,OPERATIONAL_ADOPTION_COHORT as COHORT} from '../../assets/employment-adoption-operational-cohort.js';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'OPERATIONAL_ADOPTION_ANCHOR_CHANGED: '+a.slice(0,90));return s.replace(a,()=>b);};
export function operationalContractAdoptionDefinitions(){
 const source=`CREATE FUNCTION public.employment_adoption_operational_source_v1(p jsonb,p_revision uuid,p_package text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $operative$
 DECLARE raw jsonb;selected_rows jsonb;private_rows jsonb;deferred_rows jsonb;deferred_total integer;selected_total integer;
 BEGIN
 raw:=public.employment_adoption_active_source_v1(p,p_revision,p_package);
 -- Only an explicit original NULL entry date can defer a record. Source/key,
 -- identity, scope and date conflicts must remain observable, never disappear.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(raw->'rows') r WHERE r->'startDate'='null'::jsonb AND NOT public.employment_adoption_registry_eligible_v1(r)) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 SELECT count(*),coalesce(jsonb_agg(r->'sourceRowNumber' ORDER BY n),'[]'::jsonb) INTO deferred_total,deferred_rows FROM jsonb_array_elements(raw->'rows') WITH ORDINALITY x(r,n) WHERE r->'startDate'='null'::jsonb;
 WITH selected AS(SELECT r,row_number() OVER(ORDER BY n) ordinal FROM jsonb_array_elements(raw->'rows') WITH ORDINALITY x(r,n) WHERE r->'startDate' IS DISTINCT FROM 'null'::jsonb)
 SELECT count(*),coalesce(jsonb_agg(r||jsonb_build_object('rowNumber',ordinal) ORDER BY ordinal),'[]'::jsonb) INTO selected_total,selected_rows FROM selected;
 IF selected_total+deferred_total<>(raw->>'total')::integer THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 WITH ids AS MATERIALIZED(SELECT r->>'contractId' id FROM jsonb_array_elements(selected_rows) r)
 SELECT coalesce(jsonb_agg(f ORDER BY f->>'contractId'),'[]'::jsonb) INTO private_rows FROM jsonb_array_elements(raw->'finalContracts') f JOIN ids ON ids.id=f->>'contractId';
 IF jsonb_array_length(private_rows)<>selected_total THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 RETURN raw||jsonb_build_object('source',(raw->'source')||jsonb_build_object('operationalCohort',jsonb_build_object('version','${COHORT}','sourceTotal',raw#>'{source,operationalCohort,sourceTotal}','archivedTotal',raw#>'{source,operationalCohort,archivedTotal}','deferredTotal',deferred_total,'deferredSourceRowNumbers',deferred_rows)),'total',selected_total,'rows',selected_rows,'finalContracts',private_rows);
 END $operative$`;
 const bootstrap=`CREATE FUNCTION public.employment_adoption_operational_bootstrap_v1(p jsonb,p_revision uuid,p_package text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $operative$
 DECLARE value jsonb;raw jsonb;
 BEGIN PERFORM public.municipal_adoption_ready_v1();value:=public.employment_adoption_bootstrap_v1(p);raw:=public.employment_adoption_operational_source_v1(p,p_revision,p_package);
 RETURN value||jsonb_build_object('version','employment-adoption-preparation.v7','canPrepare',(value->>'canPrepare')::boolean AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(raw->'rows') r WHERE r->'sourceIssues' IS DISTINCT FROM '[]'::jsonb),'rawReview',raw-'finalContracts');
 END $operative$`;
 return[source,bootstrap];
}
export function publishedOperationalAdoptionBaseline(options){
 const sourceHashes={},read=p=>{const s=options.read(p).replace(/\r\n?/g,'\n');sourceHashes[p]=createHash('sha256').update(s).digest('hex');return s;};
 // The command guard upgrade is a separate technical lot. Read only the
 // already published namespace, seniority and participation composition.
 const opts={...options,read,commandContentionGuard:false};
 const participation=buildOwnPeriodParticipationSql(opts),namespace=buildSalaryAuxiliaryNamespaceSql(opts),date=buildOwnRunDateInstallation(opts);
 const definition=(rows,name)=>{const found=rows.filter(s=>new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.'+name+'\\(').test(s));assert.equal(found.length,1,'OPERATIONAL_PUBLISHED_SOURCE_MISSING:'+name);return found[0].replace('CREATE OR REPLACE FUNCTION ','CREATE FUNCTION ');};
 const beforeConsumers=[definition(participation.before,'own_close_roster_v1'),definition(namespace.originals,'own_receipt_snapshot_v1'),definition(date.migration,'own_run_capture_v1')];
 const consumers=[definition(participation.changed,'own_close_roster_v1'),definition(namespace.changed,'own_receipt_snapshot_v1'),definition(participation.changed,'own_run_capture_v1')];
 for(const p of ['scripts/lib/own-period-participation-installation.mjs','scripts/lib/own-salary-seniority-installation.mjs','scripts/lib/salary-auxiliary-namespace-installation.mjs','scripts/lib/salary-administrative-identity-installation.mjs','scripts/lib/exact-program-precision-installation.mjs'])read(p);
 return{ready:definition(participation.changed,'municipal_adoption_ready_v1'),beforeConsumers,consumers,sourceHashes};
}
export function buildOperationalContractAdoptionInstallation(options){
 const previous=buildRegistryOriginalFactsInstallation(options),publishedBaseline=publishedOperationalAdoptionBaseline(options);
 const beforeDefinitions=[...previous.afterDefinitions.slice(0,-1),publishedBaseline.ready];
 const beforePins=beforeDefinitions.map(d=>({...ownInstallationFunctionPin(d),runtime:previous.afterPins.find(p=>p.name===ownInstallationFunctionPin(d).name)?.runtime??false})),pin=d=>({...ownInstallationFunctionPin(d),runtime:beforePins.find(p=>p.name===ownInstallationFunctionPin(d).name)?.runtime??false});
 const afterDefinitions=beforeDefinitions.slice(0,-1).map((s,index)=>{
  let v=s.replaceAll("'employment-adoption-input.v4','employment-adoption-input.v5','employment-adoption-input.v6'","'employment-adoption-input.v4','employment-adoption-input.v5','employment-adoption-input.v6','"+V7+"'");
  const actor=index===0?'body_value':'r.body';
  if([0,1,4].includes(index)){
   const call=`public.employment_adoption_active_source_v1(p,(${actor}#>>'{finalSource,revisionId}')::uuid,${actor}#>>'{finalSource,packageSha256}')`;
   v=once(v,call,`CASE WHEN ${actor}->>'version'='${V7}' THEN public.employment_adoption_operational_source_v1(p,(${actor}#>>'{finalSource,revisionId}')::uuid,${actor}#>>'{finalSource,packageSha256}') ELSE ${call} END`);
  }
  if(index===0)v=once(v,"CASE WHEN body_value->>'version'='employment-adoption-input.v6' THEN body_value-ARRAY['version','finalSource','cohort','sourceFactsPolicy']",`CASE WHEN body_value->>'version'='${V7}' THEN body_value-ARRAY['version','finalSource','cohort'] WHEN body_value->>'version'='employment-adoption-input.v6' THEN body_value-ARRAY['version','finalSource','cohort','sourceFactsPolicy']`);
  v=v.replaceAll("IS DISTINCT FROM 'active-contracts.v1'",`IS DISTINCT FROM (CASE WHEN ${actor}->>'version'='${V7}' THEN '${COHORT}' ELSE 'active-contracts.v1' END)`);
  return v;
 });
 const newDefinitions=operationalContractAdoptionDefinitions(),newPins=newDefinitions.map((d,n)=>({...ownInstallationFunctionPin(d),runtime:n===1}));
 const changedPins=afterDefinitions.map(pin),replace=s=>beforePins.slice(0,-1).reduce((v,p,n)=>v.replaceAll(p.sha256,changedPins[n].sha256),s);
 let ready=replace(beforeDefinitions.at(-1));ready=once(ready,' BEGIN ',' BEGIN EXECUTE '+q(pinsCheck(newPins,'OPERATIONAL_ADOPTION_NEW_METADATA'))+';');afterDefinitions.push(ready);
 const afterPins=afterDefinitions.map(pin),beforeCheck=previous.afterCheck.replaceAll(previous.afterPins.at(-1).sha256,beforePins.at(-1).sha256),afterCheck=replace(beforeCheck).replaceAll(beforePins.at(-1).sha256,afterPins.at(-1).sha256)+';'+pinsCheck(newPins,'OPERATIONAL_ADOPTION_NEW_METADATA');
 beforePins.forEach((p,n)=>assert.deepEqual({...p,sha256:null},{...afterPins[n],sha256:null}));
 const prefix='municontrol_operational_adoption.',condition=`s.nspname='public' AND p.proname IN(${newPins.map(p=>q(p.name)).join(',')})`;
 const state=`DO $state$ DECLARE n integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'OPERATIONAL_ADOPTION_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132163);SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${condition};IF n=0 THEN PERFORM set_config('${prefix}mode','first',true);ELSIF n=2 THEN PERFORM set_config('${prefix}mode','repeat',true);ELSE RAISE EXCEPTION 'OPERATIONAL_ADOPTION_PARTIAL_STATE';END IF;END $state$`;
 const initial=`DO $initial$ BEGIN IF current_setting('${prefix}mode')='first' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $initial$`;
 const migration=[...newDefinitions,...afterDefinitions.map(d=>d.replace('CREATE FUNCTION public.','CREATE OR REPLACE FUNCTION public.')),`REVOKE ALL ON FUNCTION ${newPins.map(p=>p.signature).join(',')} FROM PUBLIC,municontrol_actions_runtime_app`,`GRANT EXECUTE ON FUNCTION ${newPins[1].signature} TO municontrol_actions_runtime_app`];
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const snapshot=slot=>{let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",`NOT(${condition})`).replaceAll('municontrol_sql111.',prefix);return once(s,'to_jsonb(p)::text',`(CASE WHEN p.oid IN(${beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);};
 const before=snapshot('before'),after=snapshot('after'),audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'OPERATIONAL_ADOPTION_PRIOR_STATE_CHANGED';END IF;END $audit$`,runtime='DO $runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $runtime$';
 const sourceHashes={...previous.sourceHashes,...publishedBaseline.sourceHashes,...Object.fromEntries(['scripts/lib/operational-contract-adoption-installation.mjs','assets/employment-adoption-operational-cohort.js'].map(p=>[p,createHash('sha256').update(options.read(p).replace(/\r\n?/g,'\n')).digest('hex')]))};
 const proof=`SELECT jsonb_build_object('version','operational-contract-adoption-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'newFunctions',2,'adaptedFunctions',7,'newTables',0,'businessOperations',0,'nominalRowsReturned',0,'mode',coalesce(current_setting('${prefix}mode',true),'verify'),'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return{previous,publishedBaseline,beforeDefinitions,afterDefinitions,newDefinitions,beforePins,afterPins,newPins,sourceHashes,beforeCheck,afterCheck,state,initial,before,after,migration,apply,audit,runtime,proof,installation:[state,initial,before,apply,afterCheck,runtime,after,audit,proof],verification:['SET TRANSACTION READ ONLY',afterCheck,runtime,after,proof]};
}
