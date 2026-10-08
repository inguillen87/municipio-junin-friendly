// Adds an exact-cent preparation criterion. Historical policies remain readable.
// Generates reviewed statements only; no connection or business operation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'EXACT_PARAMETER_ANCHOR_CHANGED');return s.replace(a,()=>b);};
const metadata=pin=>pinsCheck([pin],'EXACT_PARAMETER_FUNCTION_CHANGED').replace(/\s+OR has_function_privilege\([\s\S]*?\n  THEN RAISE EXCEPTION/,'\n  THEN RAISE EXCEPTION');
function snapshot(slot,pin){
 let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true')
  .replace("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'');
 s=once(s,"public.digest(to_jsonb(p)::text,'sha256')",`public.digest((CASE WHEN p.oid=${quote(pin.signature)}::regprocedure THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')`);
 return s.replaceAll('municontrol_sql111.','municontrol_exact_parameter.');
}
export function buildExactParameterCentsInstallation({read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const file='scripts/migrations/041-governed-payroll-parameters.sql',source=read(file).replace(/\r\n?/g,'\n');
 const found=splitPostgresStatements(source).filter(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.payroll_parameter_build_draft_v1('));assert.equal(found.length,1);
 const original=found[0],beforePin=ownInstallationFunctionPin(original);
 assert.equal(beforePin.sha256,'694563eaec7f880f58ba78a9db6688113a1dbac03c686eeb92b21fe837ef165d','EXACT_PARAMETER_SOURCE_CHANGED');
 let changed=once(original,"NOT IN ('nearest_cent','truncate_cent')","NOT IN ('nearest_cent','truncate_cent','exact_cent')");
 changed=once(changed,'   computed:=(base_value*3)/2',"   IF p_draft->>'rounding'='exact_cent' AND (base_value*3)%2<>0 THEN\n     RAISE EXCEPTION 'PAYROLL_PARAMETER_PRECISION_LOSS' USING ERRCODE='P0001';\n   END IF;\n   computed:=(base_value*3)/2");
 const afterPin=ownInstallationFunctionPin(changed),beforeCheck=metadata(beforePin),afterCheck=metadata(afterPin);
 const before=snapshot('before',beforePin),after=snapshot('after',afterPin);
 const mode=`DO $exact_parameter_mode$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=${quote(beforePin.signature)}::regprocedure AND encode(public.digest(replace(prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')=${quote(beforePin.sha256)}) THEN PERFORM set_config('municontrol_exact_parameter.mode','install',true);ELSE PERFORM set_config('municontrol_exact_parameter.mode','verify',true);END IF;END $exact_parameter_mode$`;
 const choose=`DO $exact_parameter_check$ BEGIN IF current_setting('municontrol_exact_parameter.mode')='install' THEN EXECUTE ${quote(beforeCheck)};ELSE EXECUTE ${quote(afterCheck)};END IF;END $exact_parameter_check$`;
 const install=`DO $exact_parameter_install$ BEGIN IF current_setting('municontrol_exact_parameter.mode')='install' THEN EXECUTE ${quote(changed)};END IF;END $exact_parameter_install$`;
 const conservation=`DO $exact_parameter_conservation$ BEGIN IF current_setting('municontrol_exact_parameter.before')::jsonb IS DISTINCT FROM current_setting('municontrol_exact_parameter.after')::jsonb THEN RAISE EXCEPTION 'EXACT_PARAMETER_CONSERVATION_FAILED';END IF;END $exact_parameter_conservation$`;
 const proof=`SELECT jsonb_build_object('version','exact-parameter-cents-installation.v1','sourceCommit',${quote(sourceCommit)},'mode',current_setting('municontrol_exact_parameter.mode'),'newTables',0,'newFunctions',0,'adaptedFunctions',1,'businessWrites',0,'nominalRowsReturned',0,'preservedTables',jsonb_array_length(current_setting('municontrol_exact_parameter.after')::jsonb->'tables'),'preservationSha256',encode(public.digest(current_setting('municontrol_exact_parameter.after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return {version:'exact-parameter-cents-installation.v1',sourceCommit,sourceHashes:{[file]:createHash('sha256').update(source).digest('hex')},original,changed,beforePin,afterPin,beforeCheck,afterCheck,before,after,conservation,proof,statements:[mode,choose,before,install,afterCheck,after,conservation,proof],connects:false,executesSql:false};
}
