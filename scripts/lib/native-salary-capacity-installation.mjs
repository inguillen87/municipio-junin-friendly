// Capacity/read transport only. Generates a reviewable technical batch;
// no connection, source adoption, expression evaluation or municipal command.
import assert from 'node:assert/strict';
import {buildSalaryAuxiliaryNamespaceSql} from './salary-auxiliary-namespace-installation.mjs';
import {buildSalaryAdministrativeIdentityInstallation} from './salary-administrative-identity-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(source,from,to)=>{assert.equal(source.split(from).length,2,'SALARY_CAPACITY_SOURCE_ANCHOR_CHANGED');return source.replace(from,()=>to);};
const pin=(source,runtime=false)=>({...ownInstallationFunctionPin(source),runtime});

export const SALARY_STREAM_SQL=`CREATE FUNCTION public.native_salary_stream_v1(p jsonb,page integer,snapshot text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE value jsonb;payload bytea;fingerprint text;size integer;pages integer;
BEGIN
 IF page IS NULL OR page<0 OR page>=256 OR snapshot IS NOT NULL AND snapshot!~'^[a-f0-9]{64}$' OR page>0 AND snapshot IS NULL THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID';END IF;
 -- The existing bootstrap authenticates the whole scope and locks its read.
 -- Every page repeats that authorization; a fingerprint never grants access.
 value:=public.native_salary_bootstrap_v1(p);payload:=convert_to(value::text,'UTF8');size:=octet_length(payload);
 IF size>67108864 THEN RAISE EXCEPTION 'NATIVE_SALARY_LIMIT';END IF;
 fingerprint:=encode(public.digest(payload,'sha256'),'hex');pages:=(size+262143)/262144;
 IF snapshot IS NOT NULL AND snapshot<>fingerprint THEN RAISE EXCEPTION 'NATIVE_SALARY_SNAPSHOT_CHANGED';END IF;
 IF page>=pages THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID';END IF;
 RETURN jsonb_build_object('version','native-salary-stream.v1','scopeVersion',value->>'scopeVersion','snapshotSha256',fingerprint,'totalBytes',size,'pageBytes',262144,'pageCount',pages,'pageIndex',page,'hex',encode(substring(payload FROM page*262144+1 FOR 262144),'hex'));
END $$`;

export function buildNativeSalaryCapacityInstallation(options){
 const {sourceCommit}=options;assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const namespace=buildSalaryAuxiliaryNamespaceSql(options),administrative=buildSalaryAdministrativeIdentityInstallation(options);
 const itemsBefore=namespace.changed.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.native_salary_items_v1('));
 const commandBefore=administrative.changed.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.native_salary_command_v1('));
 const bootstrapBefore=administrative.changed.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.native_salary_bootstrap_v1('));
 assert.ok(itemsBefore&&commandBefore&&bootstrapBefore);
 let items=once(itemsBefore,'jsonb_array_length(items)>1000','jsonb_array_length(items)>10000');
 items=once(items,'octet_length(items::text)>2097152','octet_length(items::text)>4194304');
 items=once(items,
  'FROM unnest(remaining) k WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(items) r CROSS JOIN LATERAL jsonb_array_elements_text(r->\'dependencies\') d(x) WHERE public.native_salary_row_key_v1(r)=k AND d.x=ANY(remaining))',
  'FROM (SELECT public.native_salary_row_key_v1(r) AS k,r->\'dependencies\' AS dependencies FROM jsonb_array_elements(items) r) node WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text(node.dependencies) d(x) WHERE d.x=ANY(remaining))');
 // Keep the global128MiB budget; permit the complete tenant history up to64MiB.
 // Count, bytes, global lock and all previous immutable-request checks remain.
 const command=once(commandBefore,')::text)>8388608',')::text)>67108864');
 const bootstrap=once(bootstrapBefore,'octet_length(c::text)>16777216','octet_length(c::text)>67108864');
 const changed=[items,command,bootstrap],beforePins=[pin(itemsBefore),pin(commandBefore,true),pin(bootstrapBefore,true)];
 const prerequisites=[pin(administrative.context),administrative.helperPin];
 const streamPin=pin(SALARY_STREAM_SQL,true),afterPins=[...changed.map((s,i)=>pin(s,i>0)),streamPin];
 const beforeCheck=pinsCheck([...prerequisites,...beforePins],'SALARY_CAPACITY_PREREQUISITE_CHANGED');
 const afterCheck=pinsCheck([...prerequisites,...afterPins],'SALARY_CAPACITY_FUNCTION_CHANGED');
 const snapshot=slot=>{
  let source=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true');
  source=once(source,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')","AND p.oid IS DISTINCT FROM to_regprocedure('public.native_salary_stream_v1(jsonb,integer,text)')");
  source=once(source,"public.digest(to_jsonb(p)::text,'sha256')",`public.digest((CASE WHEN p.oid IN(${beforePins.map(p=>q(p.signature)+'::regprocedure').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')`);
  return source.replaceAll('municontrol_sql111.','municontrol_salary_capacity.');
 };
 const before=snapshot('before'),after=snapshot('after');
 const mode="DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'SALARY_CAPACITY_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132165);PERFORM set_config('municontrol_salary_capacity.mode',CASE WHEN to_regprocedure('public.native_salary_stream_v1(jsonb,integer,text)') IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$";
 const choose=`DO $check$ BEGIN IF current_setting('municontrol_salary_capacity.mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $check$`;
 const mutations=[...changed,SALARY_STREAM_SQL,'REVOKE ALL ON FUNCTION public.native_salary_stream_v1(jsonb,integer,text) FROM PUBLIC,municontrol_actions_runtime_app','GRANT EXECUTE ON FUNCTION public.native_salary_stream_v1(jsonb,integer,text) TO municontrol_actions_runtime_app'];
 const install=`DO $install$ BEGIN IF current_setting('municontrol_salary_capacity.mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $install$`;
 const conservation="DO $conservation$ BEGIN IF current_setting('municontrol_salary_capacity.before')::jsonb IS DISTINCT FROM current_setting('municontrol_salary_capacity.after')::jsonb THEN RAISE EXCEPTION 'SALARY_CAPACITY_CONSERVATION_FAILED';END IF;END $conservation$";
 const proof=`SELECT jsonb_build_object('version','native-salary-capacity-installation.v1','sourceCommit',${q(sourceCommit)},'mode',current_setting('municontrol_salary_capacity.mode'),'newTables',0,'newFunctions',1,'adaptedFunctions',3,'associationWrites',0,'businessWrites',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('municontrol_salary_capacity.after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return{sourceCommit,itemsBefore,commandBefore,bootstrapBefore,bootstrap,items,command,stream:SALARY_STREAM_SQL,beforePins,prerequisites,afterPins,mutations,beforeCheck,afterCheck,before,after,conservation,proof,statements:[mode,choose,before,install,afterCheck,after,conservation,proof],verification:[afterCheck,after,proof.replace("current_setting('municontrol_salary_capacity.mode')","'verify'")],connects:false,executesSql:false};
}
