// Byte-compatible adoption serialization and grouped source projection.
// The salary serializer and every existing request/body version are unchanged.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {buildActiveContractAdoptionInstallation} from './active-contract-adoption-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'ADOPTION_SERIALIZATION_ANCHOR_CHANGED');return s.replace(a,()=>b);};
// Aggregate each natural key once. Counts still include every conflicting
// contract/link, including foreign batches and tenants; no row is discarded.
export function groupedFinalAdoptionRows(before){
 let s=once(before,',linked AS (',`,core_grouped AS MATERIALIZED (
 SELECT company,legajo,count(*)::integer AS n,(array_agg(record ORDER BY row_key))[1] AS record
 FROM core GROUP BY company,legajo),contracts_grouped AS MATERIALIZED (
 SELECT c.legacy_company_id::text AS company,c.legacy_legajo AS legajo,count(*)::integer AS n,
 (array_agg(c.id ORDER BY c.id))[1] AS id,(array_agg(c.person_id ORDER BY c.id))[1] AS person_id,
 (array_agg(to_jsonb(c) ORDER BY c.id))[1] AS before_contract,
 bool_and(c.source_system='GRH' AND c.tenant_id IS NULL
  AND c.source_batch_id IN(r.source_batch_id,r.core_baseline_batch_id,r.curated_baseline_batch_id)) AS allowed
 FROM public.employment_contract c CROSS JOIN revision r
 WHERE EXISTS(SELECT 1 FROM employees e WHERE (e.company,e.legajo)=(c.legacy_company_id::text,c.legacy_legajo))
 GROUP BY c.legacy_company_id::text,c.legacy_legajo),links_grouped AS MATERIALIZED (
 SELECT sx.source_id,count(*)::integer AS all_links,
 array_agg(sx.canonical_id) FILTER(WHERE sx.canonical_entity='person_identity'
  AND sx.source_batch_id IN(r.source_batch_id,r.core_baseline_batch_id,r.curated_baseline_batch_id)) AS ids
 FROM public.source_xref sx CROSS JOIN revision r
 WHERE sx.source_system='GRH' AND sx.source_entity='persona' AND sx.valid_to IS NULL
 GROUP BY sx.source_id),linked AS (`);
 s=once(s,'e.*,ec.n AS contract_count','e.*,coalesce(ec.n,0) AS contract_count');
 s=once(s,'x.n AS person_links,x.all_links AS all_person_links',"(SELECT count(*)::integer FROM unnest(x.ids) cid WHERE cid=p.id) AS person_links,coalesce(x.all_links,0) AS all_person_links");
 s=once(s,'cr.n AS core_count','coalesce(cr.n,0) AS core_count');
 const begin=s.indexOf(' LEFT JOIN LATERAL (SELECT count(*)::integer AS n,');
 const end=s.indexOf(') cr ON true),facts AS (',begin);assert.ok(begin>0&&end>begin);
 s=s.slice(0,begin)+` LEFT JOIN contracts_grouped ec ON (ec.company,ec.legajo)=(e.company,e.legajo)
 LEFT JOIN public.person_identity p ON p.id=ec.person_id
 LEFT JOIN links_grouped x ON x.source_id=e.record->>'person_id'
 LEFT JOIN core_grouped cr ON (cr.company,cr.legajo)=(e.company,e.legajo)`+s.slice(end+') cr ON true'.length);
 return s;
}
export function buildActiveAdoptionSerializationInstallation(options){
 const previous=buildActiveContractAdoptionInstallation(options);
 const beforeHash=previous.final.original.migration.find(d=>d.startsWith('CREATE FUNCTION public.employment_adoption_hash_v1('));assert.ok(beforeHash);
 const beforeReady=previous.afterDefinitions.at(-1);
 const beforeRows=previous.final.newDefinitions.find(d=>d.startsWith('CREATE FUNCTION public.employment_adoption_final_rows_v1('));assert.ok(beforeRows);
 const serialized=`CREATE FUNCTION public.employment_adoption_serialized_fast_v1(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $serialized$
 DECLARE kind text;result text;BEGIN
 kind:=jsonb_typeof(v);
 -- Scalars never execute a recursive aggregate query. Object/array order and
 -- PostgreSQL numeric/string encoding are exactly the published serializer.
 IF kind='object' THEN
 SELECT '{'||coalesce(string_agg(to_jsonb(k)::text||':'||public.employment_adoption_serialized_fast_v1(x),',' ORDER BY k COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v) e(k,x);RETURN result;
 ELSIF kind='array' THEN
 SELECT '['||coalesce(string_agg(public.employment_adoption_serialized_fast_v1(x),',' ORDER BY n),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY e(x,n);RETURN result;
 ELSE RETURN v::text;END IF;END $serialized$`;
 const afterHash=once(beforeHash,'public.native_salary_serialized_v1(v)','public.employment_adoption_serialized_fast_v1(v)');
 const afterRows=groupedFinalAdoptionRows(beforeRows);
 const pin=d=>({...ownInstallationFunctionPin(d),runtime:false}),newPins=[pin(serialized)],beforePins=[pin(beforeHash),pin(beforeRows),pin(beforeReady)];
 const changed=[afterHash,afterRows];
 const replaced=s=>beforePins.slice(0,-1).reduce((v,p,n)=>v.replaceAll(p.sha256,pin(changed[n]).sha256),s);
 let ready=replaced(beforeReady);
 ready=once(ready,' BEGIN ',' BEGIN EXECUTE '+q(pinsCheck(newPins,'ADOPTION_SERIALIZATION_NEW_METADATA'))+';');
 const afterDefinitions=[...changed,ready],afterPins=afterDefinitions.map(pin);
 beforePins.forEach((p,n)=>assert.deepEqual({...p,sha256:null},{...afterPins[n],sha256:null}));
 const beforeCheck=previous.afterCheck+';'+pinsCheck(beforePins.slice(0,-1),'ADOPTION_SERIALIZATION_BEFORE_METADATA');
 const afterCheck=replaced(previous.afterCheck).replaceAll(beforePins.at(-1).sha256,afterPins.at(-1).sha256)+';'+pinsCheck([...afterPins.slice(0,-1),...newPins],'ADOPTION_SERIALIZATION_AFTER_METADATA');
 const prefix='municontrol_adoption_serialization.',condition="s.nspname='public' AND p.proname='employment_adoption_serialized_fast_v1'";
 const state=`DO $state$ DECLARE n integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'ADOPTION_SERIALIZATION_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132148);SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${condition};IF n=0 THEN PERFORM set_config('${prefix}mode','first',true);ELSIF n=1 THEN PERFORM set_config('${prefix}mode','repeat',true);ELSE RAISE EXCEPTION 'ADOPTION_SERIALIZATION_PARTIAL_STATE';END IF;END $state$`;
 const initial=`DO $initial$ BEGIN IF current_setting('${prefix}mode')='first' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $initial$`;
 const migration=[serialized,...afterDefinitions.map(d=>d.replace('CREATE FUNCTION public.','CREATE OR REPLACE FUNCTION public.')),`REVOKE ALL ON FUNCTION ${newPins[0].signature} FROM PUBLIC,municontrol_actions_runtime_app`];
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const snap=slot=>{let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",`NOT(${condition})`).replaceAll('municontrol_sql111.',prefix);return once(s,'to_jsonb(p)::text',`(CASE WHEN p.oid IN(${beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);};
 const before=snap('before'),after=snap('after'),audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'ADOPTION_SERIALIZATION_PRIOR_STATE_CHANGED';END IF;END $audit$`,runtime='DO $runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $runtime$';
 const readyChecks=[...previous.readyChecks.map(replaced),pinsCheck(newPins,'ADOPTION_SERIALIZATION_NEW_METADATA')];
 const sourceHashes={...previous.sourceHashes,'scripts/lib/active-adoption-serialization-installation.mjs':createHash('sha256').update(options.read('scripts/lib/active-adoption-serialization-installation.mjs').replace(/\r\n?/g,'\n')).digest('hex')};
 const proof=`SELECT jsonb_build_object('version','active-adoption-serialization-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'newFunctions',1,'adaptedFunctions',3,'newTables',0,'businessOperations',0,'nominalRowsReturned',0,'mode',coalesce(current_setting('${prefix}mode',true),'verify'),'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return {previous,newDefinitions:[serialized],beforeDefinitions:[beforeHash,beforeRows,beforeReady],afterDefinitions,newPins,beforePins,afterPins,sourceHashes,readyChecks,state,initial,before,after,afterCheck,migration,apply,audit,runtime,proof,installation:[state,initial,before,apply,afterCheck,runtime,after,audit,proof],verification:['SET TRANSACTION READ ONLY',afterCheck,runtime,after,proof]};
}

export function relocateActiveAdoptionSerialization(batch,qa,previous){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);const n=qa.normalized,source=batch.afterDefinitions.at(-1);
 const ready=n(source.slice(0,source.indexOf(' BEGIN ')))+' BEGIN '+batch.readyChecks.map(s=>'EXECUTE '+q(n(s))+';').join('\n')+' END $operator$';
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.afterPins.at(-1).signature.replace('public.',qa.schema+'.'),runtime:false};
 const before=n(batch.previous.final.sourcePrerequisite.check)+';'+n(pinsCheck([...batch.previous.afterPins.slice(0,-1),...batch.previous.newPins,...batch.beforePins.slice(0,-1)],'ADOPTION_SERIALIZATION_BEFORE_METADATA'))+';'+pinsCheck([previous.readyPin],'ADOPTION_SERIALIZATION_BEFORE_METADATA');
 const after=n(batch.previous.final.sourcePrerequisite.check)+';'+n(pinsCheck([...batch.previous.afterPins.slice(0,-1),...batch.previous.newPins,...batch.afterPins.slice(0,-1),...batch.newPins],'ADOPTION_SERIALIZATION_AFTER_METADATA'))+';'+pinsCheck([readyPin],'ADOPTION_SERIALIZATION_AFTER_METADATA');
 const initial=`DO $initial$ BEGIN IF current_setting('municontrol_adoption_serialization.mode')='first' THEN EXECUTE ${q(before)};ELSE EXECUTE ${q(after)};END IF;END $initial$`;
 const defs=[...batch.newDefinitions.map(n),...batch.afterDefinitions.slice(0,-1).map(d=>n(d.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '))),ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '),n(batch.migration.at(-1))];
 const apply=`DO $apply$ BEGIN IF current_setting('municontrol_adoption_serialization.mode')='first' THEN ${defs.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 return {...batch,readyPin,installation:batch.installation.map((s,i)=>i===1?initial:i===3?apply:i===4?after:n(s)),verification:batch.verification.map((s,i)=>i===1?after:n(s))};
}
