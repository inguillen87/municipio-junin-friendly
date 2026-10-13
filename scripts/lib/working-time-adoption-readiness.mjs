// Code-only, immutable repair of one obsolete dependency pin. Never connects.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {buildOwnContractWorkingTimeInstallation} from './own-contract-working-time-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",sha=v=>createHash('sha256').update(v).digest('hex');
export const READINESS_PRIOR='eddc888e00ca8c3156858f189a29bf98cbe15e774262c1904dac5c65e501a6ca';
export const READINESS_FINAL='c4546ebd3e2dacfff29aad1edfea16b6dc4061774598110e7b10c58f264fdb08';
export const CAPTURE_PRIOR='18061aa38556ee715edf0413b9583cd8717d58717c1cfa0ff24fddc8c778ff6d';
export const CAPTURE_FINAL='60c5d7ebf6bfc2fa7eb83fbaa4ac64e9381c70b41ed35fd18057ef326ffe8ef7';
const readyPin=hash=>({name:'municipal_adoption_ready_v1',signature:'public.municipal_adoption_ready_v1()',sha256:hash,argNames:[],defaults:'',resultType:'void',language:'plpgsql',returnsSet:false,strict:false,definer:true,volatility:'v',config:['search_path=pg_catalog, public, pg_temp','TimeZone=UTC'],runtime:false});
export function buildWorkingTimeAdoptionReadinessRepair({read,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);const file='scripts/migrations/165-working-time-adoption-readiness.sql',text=read(file).replace(/\r\n?/g,'\n');
 assert.equal(sha(text),'d1e6a4c16eb875f5e8d9b47d029a5664f923a676e537c0cb54ddb80da578fe48','READINESS_REPAIR_SOURCE_CHANGED');
 const mutations=splitPostgresStatements(text).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,''));assert.equal(mutations.length,1);assert.match(mutations[0],/^DO \$repair\$/);assert.ok([READINESS_PRIOR,READINESS_FINAL,CAPTURE_PRIOR,CAPTURE_FINAL].every(p=>text.includes(p)));
 const working=buildOwnContractWorkingTimeInstallation({read,sourceCommit});const capture=working.afterPins.find(p=>p.name==='own_run_capture_v1');assert.equal(capture.sha256,CAPTURE_FINAL);
 const prefix='municontrol_readiness_repair.',state=`DO $state$ DECLARE h text;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'READINESS_REPAIR_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132167);SELECT encode(public.digest(replace(prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') INTO h FROM pg_proc WHERE oid=to_regprocedure('public.municipal_adoption_ready_v1()');IF h=${q(READINESS_PRIOR)} THEN PERFORM set_config('${prefix}mode','repair',true);ELSIF h=${q(READINESS_FINAL)} THEN PERFORM set_config('${prefix}mode','verify',true);ELSE RAISE EXCEPTION 'READINESS_REPAIR_GUARD_CHANGED';END IF;END $state$`;
 const prior=pinsCheck([readyPin(READINESS_PRIOR),capture],'READINESS_REPAIR_BEFORE_METADATA'),afterCheck=pinsCheck([readyPin(READINESS_FINAL),capture],'READINESS_REPAIR_AFTER_METADATA');
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='repair' THEN EXECUTE ${q(prior)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const snapshot=slot=>{
  let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replaceAll('municontrol_sql111.',prefix);
  s=s.replace("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'');
  const anchor='to_jsonb(p)::text';assert.equal(s.split(anchor).length,2);return s.replace(anchor,"(CASE WHEN p.oid=to_regprocedure('public.municipal_adoption_ready_v1()') THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text");
 };
 const before=snapshot('before'),after=snapshot('after'),apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='repair' THEN EXECUTE ${q(mutations[0])};END IF;END $apply$`;
 const runtime='DO $runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $runtime$',audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'READINESS_REPAIR_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const sourceHashes={...working.sourceHashes,[file]:sha(text),'scripts/lib/working-time-adoption-readiness.mjs':sha(read('scripts/lib/working-time-adoption-readiness.mjs').replace(/\r\n?/g,'\n'))},proof=`SELECT jsonb_build_object('version','working-time-adoption-readiness-repair.v1','sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',coalesce(current_setting('${prefix}mode',true),'verify'),'adaptedFunctions',1,'newTables',0,'newFunctions',0,'businessWrites',0,'existingAclChanges',0,'roleAssignmentsAdded',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return{sourceCommit,sourceHashes,working,mutations,beforeCheck:prior,afterCheck,state,choose,before,after,apply,runtime,audit,proof,statements:[state,choose,before,apply,afterCheck,runtime,after,audit,proof],verification:['SET TRANSACTION READ ONLY',afterCheck,runtime,after,proof],connects:false,executesSql:false};
}
