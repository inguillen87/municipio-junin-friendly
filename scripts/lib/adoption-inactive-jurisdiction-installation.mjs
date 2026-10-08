// Schema-only evolution of reviewed adoption consumers. No connection or row command.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildOwnJurisdictionInstallation} from './own-payroll-jurisdiction-installation.mjs';
import {buildEmploymentAdoptionInstallation} from './employment-adoption-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';

const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const once=(source,needle,value)=>{assert.equal(source.split(needle).length,2,'INACTIVE_JURISDICTION_ANCHOR_CHANGED: '+needle.slice(0,70));return source.replace(needle,()=>value);};
const version='employment-adoption-input.v2',prefix='municontrol_inactive_jurisdiction.';
const sqlPending=`(v->>'jurisdictionCode' IS NULL AND jsonb_typeof(v->'jurisdictionCode')='null'
 AND raw#>>ARRAY['rows',(n-1)::text,'jurisdictionCode'] IS NULL
 AND raw#>>ARRAY['rows',(n-1)::text,'status']='inactive'
 AND raw#>>ARRAY['rows',(n-1)::text,'endDate'] IS NOT NULL
 AND (raw#>>ARRAY['rows',(n-1)::text,'endDate'])::date<(raw->>'today')::date
 AND (raw#>>ARRAY['rows',(n-1)::text,'startDate'] IS NULL OR (raw#>>ARRAY['rows',(n-1)::text,'startDate'])::date<=(raw#>>ARRAY['rows',(n-1)::text,'endDate'])::date))`;

export function buildInactiveJurisdictionInstallation(options){
 assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const original=buildEmploymentAdoptionInstallation(options),jurisdiction=buildOwnJurisdictionInstallation(options);
 const read=file=>options.read('scripts/migrations/'+file).replace(/\r\n?/g,'\n');
 const sources=['132-employment-adoption-preparation.sql','133-employment-adoption-application.sql','134-employment-adoption-history-read.sql','138-adopted-fixed-novelties.sql'];
 const definitions=sources.flatMap(file=>splitPostgresStatements(read(file)).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,'')));
 const find=name=>{const matches=definitions.filter(s=>s.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(matches.length,1);return matches[0];};
 const names=['employment_adoption_bootstrap_v1','employment_adoption_propose_v1','employment_adoption_update_allowed_v1','employment_adoption_history_read_v1','payroll_fixed_registry_adopted_subject_v1'];
 const beforeDefinitions=names.map(find),afterDefinitions=[];
 afterDefinitions.push(once(beforeDefinitions[0],"'version','employment-adoption-preparation.v1','rawReview'","'version','employment-adoption-preparation.v2','rawReview'"));
 let propose=beforeDefinitions[1];
 propose=once(propose,"jsonb_object_keys(body_value) key) IS DISTINCT FROM ARRAY['catalogVersion'","jsonb_object_keys(CASE WHEN body_value->>'version'='"+version+"' THEN body_value-'version' ELSE body_value END) key) IS DISTINCT FROM ARRAY['catalogVersion'");
 // An unknown marker or a non-string marker is never silently removed.
 propose=once(propose," FOREACH field IN ARRAY",` IF body_value ? 'version' AND (jsonb_typeof(body_value->'version') IS DISTINCT FROM 'string' OR body_value->>'version' IS DISTINCT FROM '${version}') THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_INPUT_INVALID';END IF;\n FOREACH field IN ARRAY`);
 propose=once(propose,"jsonb_typeof(v->'jurisdictionCode') IS DISTINCT FROM 'string'",`(jsonb_typeof(v->'jurisdictionCode') IS DISTINCT FROM 'string' AND NOT(body_value->>'version' IS NOT DISTINCT FROM '${version}' AND jsonb_typeof(v->'jurisdictionCode')='null'))`);
 propose=once(propose," OR v->>'jurisdictionCode' NOT IN('42','55'))",` OR (jsonb_typeof(v->'jurisdictionCode')='string' AND v->>'jurisdictionCode' NOT IN('42','55')))`);
 const selected=" OR raw#>>ARRAY['rows',(n-1)::text,'jurisdictionCode'] IS NOT NULL";
 propose=once(propose,selected,` OR (jsonb_typeof(v->'jurisdictionCode')='null' AND NOT(body_value->>'version' IS NOT DISTINCT FROM '${version}' AND ${sqlPending}))\n${selected}`);
 afterDefinitions.push(propose);
 let allowed=beforeDefinitions[2];
 allowed=once(allowed," AND after_row.jurisdiction_code IN('42','55')",` AND (after_row.jurisdiction_code IN('42','55') OR (before_row.jurisdiction_code IS NULL AND after_row.jurisdiction_code IS NULL
 AND before_row.status='inactive' AND before_row.end_date IS NOT NULL AND before_row.end_date<(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date
 AND (before_row.start_date IS NULL OR before_row.start_date<=before_row.end_date)))`);
 allowed=once(allowed," AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.body->'rows') x",` AND (after_row.jurisdiction_code IS NOT NULL OR r.body->>'version'='${version}')\n AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.body->'rows') x`);
 allowed=once(allowed,"x->>'jurisdictionCode'=after_row.jurisdiction_code",`x->>'jurisdictionCode' IS NOT DISTINCT FROM after_row.jurisdiction_code`);
 afterDefinitions.push(allowed);
 let history=beforeDefinitions[3];
 history=once(history,"'version','employment-adoption-history.v1'",`'version',CASE WHEN c.jurisdiction_code IS NULL AND r.body->>'version'='${version}' AND a.after_contract->>'jurisdiction_code' IS NULL AND a.before_contract->>'status'='inactive' THEN 'employment-adoption-history.v2' ELSE 'employment-adoption-history.v1' END`);
 history=once(history,"'adoptedAt',d.created_at)",`'adoptedAt',d.created_at)||CASE WHEN c.jurisdiction_code IS NULL AND r.body->>'version'='${version}' AND a.after_contract->>'jurisdiction_code' IS NULL AND a.before_contract->>'status'='inactive' THEN jsonb_build_object('jurisdictionStatus','pending_inactive_origin') ELSE '{}'::jsonb END`);
 afterDefinitions.push(history);
 // The common adopted payroll subject gate covers fixed/monthly novelties and calculations.
 afterDefinitions.push(once(beforeDefinitions[4]," subject:=jsonb_build_object",` IF c.jurisdiction_code IS NULL THEN RAISE EXCEPTION 'PAYROLL_FIXED_JURISDICTION_REQUIRED';END IF;\n subject:=jsonb_build_object`));
 const beforePins=beforeDefinitions.map((d,i)=>({...ownInstallationFunctionPin(d),runtime:[0,1,3].includes(i)}));
 const afterPins=afterDefinitions.map((d,i)=>({...ownInstallationFunctionPin(d),runtime:beforePins[i].runtime}));
 for(let n=0;n<beforePins.length;n++){
  assert.deepEqual({...beforePins[n],sha256:null},{...afterPins[n],sha256:null});
  const known=n===4?jurisdiction.beforePins:original.pins;
  if(n!==4)assert.equal(known.find(p=>p.name===beforePins[n].name)?.sha256,beforePins[n].sha256);
 }
 let ready=jurisdiction.ready;
 for(let n=0;n<beforePins.length;n++){assert.ok(ready.includes(beforePins[n].sha256),'INACTIVE_JURISDICTION_READY_PIN_MISSING: '+beforePins[n].name);ready=ready.replaceAll(beforePins[n].sha256,afterPins[n].sha256);}
 beforeDefinitions.push(jurisdiction.ready);afterDefinitions.push(ready);
 beforePins.push(jurisdiction.afterPins.at(-1));afterPins.push({...ownInstallationFunctionPin(ready),runtime:false});
 const beforeCheck=pinsCheck(beforePins,'INACTIVE_JURISDICTION_BEFORE_METADATA');
 const afterCheck=pinsCheck(afterPins,'INACTIVE_JURISDICTION_AFTER_METADATA');
 const signatures=beforePins.map(p=>p.signature),ids=signatures.map(s=>'to_regprocedure('+q(s)+')').join(',');
 const state=`DO $state$ DECLARE before_count integer;after_count integer; BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('search_path')<>'pg_catalog, public, pg_temp' THEN RAISE EXCEPTION 'INACTIVE_JURISDICTION_CONTEXT_CHANGED';END IF;
 PERFORM pg_advisory_xact_lock(132136);PERFORM pg_advisory_xact_lock(132142);PERFORM pg_advisory_xact_lock(132143);PERFORM pg_advisory_xact_lock(143);
 SELECT count(*) FILTER(WHERE actual=item->>'before'),count(*) FILTER(WHERE actual=item->>'after') INTO before_count,after_count FROM (
 SELECT item,encode(public.digest(p.prosrc,'sha256'),'hex') AS actual FROM jsonb_array_elements(${q(JSON.stringify(beforePins.map((p,n)=>({signature:p.signature,before:p.sha256,after:afterPins[n].sha256}))))}::jsonb) x(item)
 LEFT JOIN pg_proc p ON p.oid=to_regprocedure(item->>'signature')) checks;
 IF before_count=6 THEN PERFORM set_config('${prefix}mode','first',true);ELSIF after_count=6 THEN PERFORM set_config('${prefix}mode','repeat',true);ELSE RAISE EXCEPTION 'INACTIVE_JURISDICTION_PARTIAL_STATE';END IF;END $state$`;
 const initial=`DO $initial$ BEGIN IF current_setting('${prefix}mode')='first' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $initial$`;
 const preservation=slot=>{
  let sql=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'true').replaceAll('municontrol_sql111.',prefix);
  sql=once(sql,'to_jsonb(p)::text',`(CASE WHEN p.oid IN(${ids}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);return sql;
 };
 const before=preservation('before'),after=preservation('after');
 const migration=afterDefinitions.map(s=>s.replace('CREATE FUNCTION public.','CREATE OR REPLACE FUNCTION public.'));
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'INACTIVE_JURISDICTION_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const runtime='DO $runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $runtime$';
 const sourceHashes={...jurisdiction.sourceHashes,...Object.fromEntries(sources.map(file=>[file,createHash('sha256').update(read(file)).digest('hex')]))};
 const proof=`SELECT jsonb_build_object('version','inactive-jurisdiction-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'adaptedFunctions',6,'newTables',0,'newFunctions',0,'permissionChanges',0,'businessOperations',0,'nominalRowsReturned',0,'mode',coalesce(current_setting('${prefix}mode',true),'verify'),'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectsFingerprint',(SELECT encode(public.digest(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid IN(${ids}))) AS proof`;
 const readyChecks=jurisdiction.readyChecks.map(s=>beforePins.slice(0,5).reduce((v,p,n)=>v.replaceAll(p.sha256,afterPins[n].sha256),s));
 return {sourceCommit:options.sourceCommit,sourceHashes,beforeDefinitions,afterDefinitions,beforePins,afterPins,readyChecks,state,initial,before,after,migration,apply,afterCheck,audit,runtime,proof,installation:[state,initial,before,apply,afterCheck,runtime,after,audit,proof],verification:['SET TRANSACTION READ ONLY',afterCheck,runtime,after,proof]};
}
