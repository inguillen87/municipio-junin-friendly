// Review-only adaptation of existing annual assignments and original captures.
// No backfill, new table, permission change, nominal adoption or calculation.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {SQL127_SHA} from './annual-position-budget-installation.mjs';
import {SQL128_SHA} from './position-assignment-installation.mjs';
import {SQL129_SHA} from './position-comparison-installation.mjs';
import {buildAdoptedOwnNoveltyInstallation} from './adopted-own-novelties-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const names=['position_assignment_resolve_v1','position_assignment_bootstrap_v1','position_assignment_command_v1','position_comparison_capture_trigger_v1','position_comparison_detail_v1'];
const runtime=new Set(['annual_budget_bootstrap_v1','annual_budget_attempt_v1','annual_budget_command_v1','position_assignment_bootstrap_v1','position_assignment_attempt_v1','position_assignment_command_v1','position_assignment_capture_v1','position_comparison_detail_v1']);
export function buildAdoptedPositionsInstallation(options){
 const previous=buildAdoptedOwnNoveltyInstallation(options),sourceHashes={...previous.sourceHashes,'127-annual-position-budget.sql':SQL127_SHA,'128-own-position-assignments.sql':SQL128_SHA,'129-own-position-comparison.sql':SQL129_SHA};
 const definitions=['127-annual-position-budget.sql','128-own-position-assignments.sql','129-own-position-comparison.sql'].flatMap(file=>{const s=options.read('scripts/migrations/'+file).replace(/\r\n?/g,'\n');assert.equal(hash(s),sourceHashes[file],'Unreviewed annual position source '+file);return splitPostgresStatements(s).filter(s=>/^CREATE FUNCTION public\./.test(s));});
 const pin=s=>({...ownInstallationFunctionPin(s),runtime:runtime.has(ownInstallationFunctionPin(s).name)}),beforePins=definitions.filter(s=>names.includes(pin(s).name)).map(pin);assert.equal(beforePins.length,5);
 const migration=definitions.filter(s=>names.includes(pin(s).name)).map(s=>{
  const name=pin(s).name;const replace=(a,b,n)=>{assert.equal(s.split(a).length,n+1,'ADOPTED_POSITIONS_ANCHOR_CHANGED');s=s.replaceAll(a,b);};
  if(name==='position_comparison_detail_v1'){
   // A STABLE read uses one database snapshot. Each immutable capture/result
   // is checked once; every employee still checks its own result/input hashes,
   // period/type and exact identity before entering the response.
   const integrity="public.own_run_hash_v1(c.payload)<>c.payload_sha256 OR public.own_run_hash_v1(c.payload#>'{population,employees}')<>c.payload#>>'{population,version}' OR public.own_run_hash_v1(r.result)<>r.result_sha256";
   replace(integrity+' OR ','',1);
   replace('IF NOT c.id=ANY(ids) THEN',"IF NOT c.id=ANY(ids) THEN\n    IF "+integrity+" THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;",1);
  }
  if(name!=='position_assignment_resolve_v1'&&name!=='position_comparison_detail_v1')replace('public.native_employment_change_subject_v1(ctx,',"(public.payroll_fixed_registry_subject_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),",1);
  if(name==='position_assignment_bootstrap_v1'||name==='position_assignment_command_v1')replace('target);','target,true)->\'subject\');',1);
  if(name==='position_comparison_capture_trigger_v1')replace("(e->>'contractId')::uuid);","(e->>'contractId')::uuid,true)->'subject');",1);
  if(name==='position_assignment_resolve_v1'||name==='position_comparison_capture_trigger_v1')replace('public.native_employment_lifecycle_range_v1(ctx,',"public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),",1);
  if(name==='position_assignment_command_v1')replace('public.native_employment_lifecycle_review IN SHARE MODE NOWAIT','public.native_employment_lifecycle_review,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal IN SHARE MODE NOWAIT',1);
  return s.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ');
 });
 const afterPins=migration.map(pin);for(let i=0;i<5;i++)assert.deepEqual({...beforePins[i],sha256:null},{...afterPins[i],sha256:null});
 const dependencyDefinitions=[...definitions.filter(s=>!names.includes(pin(s).name)),...previous.operator.consumers.migration.filter(s=>/^CREATE FUNCTION public\./.test(s)),...previous.operator.consumers.base.migration.filter(s=>s.startsWith('CREATE FUNCTION public.native_employment_lifecycle_adopted_state_v2('))];assert.equal(dependencyDefinitions.length,27);
 const dependencies=dependencyDefinitions.map(s=>({...pin(s),runtime:runtime.has(pin(s).name)}));
 const ids=beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(','),prefix='municontrol_adopted_positions.';
 const snapshot=slot=>preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("s.nspname='public' AND p.proname LIKE 'native_leave_%'",'false').replace("to_jsonb(p)::text","(CASE WHEN p.oid IN("+ids+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text").replaceAll('municontrol_sql111.',prefix);
 const dependencyCheck=pinsCheck(dependencies,'ADOPTED_POSITIONS_PREREQUISITE_CHANGED'),beforeCheck=pinsCheck(beforePins,'ADOPTED_POSITIONS_BEFORE_METADATA'),afterCheck=pinsCheck(afterPins,'ADOPTED_POSITIONS_AFTER_METADATA');
 const originalReader=beforePins.find(p=>p.name==='position_comparison_detail_v1'),legacyPins=afterPins.map(p=>p.name===originalReader.name?originalReader:p),legacyCheck=pinsCheck(legacyPins,'ADOPTED_POSITIONS_LEGACY_METADATA');
 const mode=`DO $mode$ DECLARE adapted integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'ADOPTED_POSITIONS_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132142);PERFORM pg_advisory_xact_lock(132143);PERFORM pg_advisory_xact_lock(128129);SELECT count(*) INTO adapted FROM pg_proc p WHERE p.oid IN(${ids}) AND encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') IN(${afterPins.map(p=>q(p.sha256)).join(',')});IF adapted=0 THEN PERFORM set_config('${prefix}mode','first',true);ELSIF adapted=5 THEN PERFORM set_config('${prefix}mode','repeat',true);ELSIF adapted=4 AND EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(${q(originalReader.signature)}) AND encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')=${q(originalReader.sha256)}) THEN PERFORM set_config('${prefix}mode','legacy',true);ELSE RAISE EXCEPTION 'ADOPTED_POSITIONS_PARTIAL_STATE';END IF;END $mode$`;
 const initial=`DO $initial$ BEGIN IF current_setting('${prefix}mode')='first' THEN EXECUTE ${q(beforeCheck)};ELSIF current_setting('${prefix}mode')='legacy' THEN EXECUTE ${q(legacyCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $initial$`;
 const priorAudit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'ADOPTED_POSITIONS_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const proof=`SELECT jsonb_build_object('version','adopted-positions-installation.v2','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'allChecksPassed',true,'adaptedFunctions',5,'newTables',0,'newFunctions',0,'permissionChanges',0,'businessOperations',0,'nominalRowsReturned',0,'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text FROM pg_proc p WHERE p.oid IN(${ids})),'sha256'),'hex')) AS proof`;
 return {sourceCommit:options.sourceCommit,sourceHashes,connects:false,executesSql:false,beforeDefinitions:definitions.filter(s=>names.includes(pin(s).name)),dependencyDefinitions,beforePins,afterPins,dependencies,migration,initial,beforeCheck,afterCheck,legacyCheck,installation:[mode,dependencyCheck,initial,snapshot('before'),...migration,snapshot('after'),priorAudit,dependencyCheck,afterCheck,proof],durableVerification:['SET TRANSACTION READ ONLY',mode,dependencyCheck,afterCheck,snapshot('after'),proof]};
}
export function assertAdoptedPositionsDurability({installed,durable,batch}){
 const fields=['version','sourceCommit','sourceHashes','allChecksPassed','adaptedFunctions','newTables','newFunctions','permissionChanges','businessOperations','nominalRowsReturned','priorFingerprint','objectFingerprint'];assert.deepEqual(Object.keys(installed).sort(),fields.sort());assert.deepEqual(installed,durable);assert.equal(installed.version,'adopted-positions-installation.v2');assert.equal(installed.sourceCommit,batch.sourceCommit);assert.deepEqual(installed.sourceHashes,batch.sourceHashes);
 for(const [k,v] of Object.entries({allChecksPassed:true,adaptedFunctions:5,newTables:0,newFunctions:0,permissionChanges:0,businessOperations:0,nominalRowsReturned:0}))assert.equal(installed[k],v);for(const k of ['priorFingerprint','objectFingerprint'])assert.match(installed[k],/^[a-f0-9]{64}$/);return {passed:true,priorStatePreserved:true,independentDurabilityVerified:true};
}
