// Adapts one existing command facade. It generates statements, never connects.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'EXACT_PROGRAM_ANCHOR_CHANGED');return s.replace(a,()=>b);};
const metadata=pin=>pinsCheck([pin],'EXACT_PROGRAM_FUNCTION_CHANGED').replace(/\s+OR has_function_privilege\([\s\S]*?\n  THEN RAISE EXCEPTION/,'\n  THEN RAISE EXCEPTION');
function snapshot(slot,pin){
 let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true')
  .replace("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'');
 s=once(s,"public.digest(to_jsonb(p)::text,'sha256')",`public.digest((CASE WHEN p.oid=${quote(pin.signature)}::regprocedure THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')`);
 return s.replaceAll('municontrol_sql111.','municontrol_exact_program.');
}
export function buildExactProgramPrecisionInstallation({read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const file='scripts/migrations/122-own-payroll-programs.sql',source=read(file).replace(/\r\n?/g,'\n');
 const found=splitPostgresStatements(source).filter(s=>s.startsWith('CREATE FUNCTION public.own_program_command_v1('));assert.equal(found.length,1);
 const original=found[0],beforePin=ownInstallationFunctionPin(original);
 assert.equal(beforePin.sha256,'1d14c0ac01222dd4c48d24864118ced2ddad0a12ce2febd670e1501af763020e','EXACT_PROGRAM_SOURCE_CHANGED');
 const anchor="  pid:=eid;baseline:=current_program->'definition';source_items:=catalog->'items';";
 const guard=`  IF EXISTS(
   SELECT 1 FROM jsonb_array_elements(definition->'rules') candidate(value)
   WHERE NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(coalesce(nullif(current_program->'definition','null')->'rules','[]')) historical(value)
    WHERE candidate.value-'validUntil'=historical.value-'validUntil'
    AND (candidate.value->'validUntil'=historical.value->'validUntil' OR candidate.value->'validUntil'<>'null'::jsonb AND (historical.value->'validUntil'='null'::jsonb OR candidate.value->>'validUntil'<=historical.value->>'validUntil'))
   ) AND (candidate.value#>>'{rounding,mode}'<>'exact' OR jsonb_path_exists(candidate.value,
    '$.expression.** ? ((@.op == "round" && @.rounding.mode != "exact") || (@.op == "concept" && @.stage != "exact"))'))
  ) THEN RAISE EXCEPTION 'OWN_PROGRAM_PRECISION_REQUIRED';END IF;
`;
 const changed=once(original,anchor,guard+anchor).replace('CREATE FUNCTION public.own_program_command_v1(','CREATE OR REPLACE FUNCTION public.own_program_command_v1(');
 const afterPin=ownInstallationFunctionPin(changed),beforeCheck=metadata(beforePin),afterCheck=metadata(afterPin);
 assert.ok(changed.indexOf('RETURN public.own_program_attempt_v1(p,key)')<changed.indexOf('OWN_PROGRAM_PRECISION_REQUIRED'),'REPLAY_MUST_PRECEDE_NEW_RULE_POLICY');
 const before=snapshot('before',beforePin),after=snapshot('after',afterPin);
 const mode=`DO $exact_program_mode$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=${quote(beforePin.signature)}::regprocedure AND encode(public.digest(replace(prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')=${quote(beforePin.sha256)}) THEN PERFORM set_config('municontrol_exact_program.mode','install',true);ELSE PERFORM set_config('municontrol_exact_program.mode','verify',true);END IF;END $exact_program_mode$`;
 const choose=`DO $exact_program_check$ BEGIN IF current_setting('municontrol_exact_program.mode')='install' THEN EXECUTE ${quote(beforeCheck)};ELSE EXECUTE ${quote(afterCheck)};END IF;END $exact_program_check$`;
 const install=`DO $exact_program_install$ BEGIN IF current_setting('municontrol_exact_program.mode')='install' THEN EXECUTE ${quote(changed)};END IF;END $exact_program_install$`;
 const conservation=`DO $exact_program_conservation$ BEGIN IF current_setting('municontrol_exact_program.before')::jsonb IS DISTINCT FROM current_setting('municontrol_exact_program.after')::jsonb THEN RAISE EXCEPTION 'EXACT_PROGRAM_CONSERVATION_FAILED';END IF;END $exact_program_conservation$`;
 const proof=`SELECT jsonb_build_object('version','exact-program-precision-installation.v1','sourceCommit',${quote(sourceCommit)},'mode',current_setting('municontrol_exact_program.mode'),'newTables',0,'newFunctions',0,'adaptedFunctions',1,'businessWrites',0,'nominalRowsReturned',0,'preservedTables',jsonb_array_length(current_setting('municontrol_exact_program.after')::jsonb->'tables'),'preservationSha256',encode(public.digest(current_setting('municontrol_exact_program.after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return {version:'exact-program-precision-installation.v1',sourceCommit,sourceHashes:{[file]:createHash('sha256').update(source).digest('hex')},original,changed,beforePin,afterPin,beforeCheck,afterCheck,before,after,conservation,proof,statements:[mode,choose,before,install,afterCheck,after,conservation,proof],connects:false,executesSql:false};
}
