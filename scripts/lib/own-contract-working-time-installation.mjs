// Reviewable code-only installation; never connects or performs a municipal command.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { splitPostgresStatements } from './sql-statements.mjs';
import { ownInstallationFunctionPin } from './own-payroll-installation.mjs';
import { pinsCheck, preservationSnapshot } from './native-leave-installation.mjs';
import { seniorityTableCheck } from './own-salary-seniority-installation.mjs';
import { WORKING_TIME_PRIOR_PINS } from './own-contract-working-time-source-pins.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const sha=s=>createHash('sha256').update(s).digest('hex');
const expected=Object.freeze({
 'scripts/migrations/163-own-contract-working-time.sql':'b4052dc8580afb2bbda0bad45bca5deaefb5baf2b39ed9f068b3dc71b0bcf539',
 'scripts/migrations/164-own-working-time-program-source.sql':'8824f94f5acad626b42dc88821dfcbf70a6cafae200083560a5052bc8bfc32b8',
 'scripts/lib/own-contract-working-time-source-pins.mjs':'f7bfec89a0ad3b96c401c849168b822265bc55961b2c1f38ad3bf970625bccfd',
});
const table='own_working_time_event',prefix='municontrol_working_time.';
const facades=new Set(['own_working_time_bootstrap_v1','own_working_time_detail_v1','own_working_time_attempt_v1','own_working_time_command_v1']);
const consumers=new Set(['own_program_definition_v1','own_program_command_v1','own_run_capture_v1']);
// pg_get_functiondef emits equivalent TO syntax; normalize only its header for
// the existing metadata reader, preserving every byte of the reviewed body.
function metadataSource(s){const at=s.search(/\bAS\s+\$/);assert.ok(at>=0);return s.slice(0,at).replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/i,"SET timezone='UTC'").replace(/\s+/g,' ')+s.slice(at);}
export function workingTimeTableCheck(){return seniorityTableCheck().replaceAll('own_seniority','own_working_time').replaceAll('SENIORITY','WORKING_TIME');}
export function buildOwnContractWorkingTimeInstallation({read,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(typeof read,'function');
 const sourceHashes={},texts=Object.keys(expected).map(f=>{const s=read(f).replace(/\r\n?/g,'\n');assert.equal(sha(s),expected[f],'WORKING_TIME_SOURCE_CHANGED: '+f);sourceHashes[f]=sha(s);return s;}),sources=texts.slice(0,2).map(splitPostgresStatements);
 const migration=sources[0],changed=sources[1].filter(s=>/^CREATE OR REPLACE FUNCTION public\./.test(s));assert.equal(changed.length,3);
 const newPins=migration.filter(s=>/^CREATE FUNCTION public\.own_working_time_/.test(s)).map(s=>{const p=ownInstallationFunctionPin(s);return{...p,runtime:facades.has(p.name)};});
 assert.equal(newPins.length,12);assert.equal(newPins.filter(p=>p.runtime).length,4);
 const afterConsumerPins=changed.map(s=>{const p=ownInstallationFunctionPin(metadataSource(s)),old=WORKING_TIME_PRIOR_PINS.find(x=>x.name===p.name);assert.ok(consumers.has(p.name)&&old);assert.deepEqual({...p,sha256:null,runtime:old.runtime},{...old,sha256:null});return{...p,runtime:old.runtime};});
 const afterPins=WORKING_TIME_PRIOR_PINS.map(p=>afterConsumerPins.find(n=>n.name===p.name)??p).concat(newPins);
 const beforeCheck=pinsCheck(WORKING_TIME_PRIOR_PINS,'WORKING_TIME_PREREQUISITE_CHANGED');
 const afterCheck=pinsCheck(afterPins,'WORKING_TIME_FUNCTION_CHANGED')+';'+workingTimeTableCheck()+";DO $count$ BEGIN IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_working_time_%')<>12 THEN RAISE EXCEPTION 'WORKING_TIME_FUNCTION_COUNT';END IF;END $count$";
 const ids=WORKING_TIME_PRIOR_PINS.filter(p=>consumers.has(p.name)).map(p=>q(p.signature)+'::regprocedure').join(',');
 const snapshot=slot=>{
  let s=preservationSnapshot(slot).replaceAll('native_leave_event',table).replaceAll('municontrol_sql111.',prefix);
  s=s.replace("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')","AND NOT(s.nspname='public' AND p.proname IN("+newPins.map(p=>q(p.name)).join(',')+'))');
  s=s.replace("public.digest(to_jsonb(p)::text,'sha256')","public.digest((CASE WHEN p.oid IN("+ids+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");
  s=s.replace("p.oid IS DISTINCT FROM to_regclass('public."+table+"')),","p.oid IS DISTINCT FROM to_regclass('public."+table+"') AND NOT(t.tgisinternal AND t.tgconstraint IN(SELECT oid FROM pg_constraint WHERE conrelid=to_regclass('public."+table+"') AND contype='f'))),");
  assert.ok(!s.includes('native_leave_%'));return s;
 };
 const before=snapshot('before'),after=snapshot('after');
 const mode="DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'WORKING_TIME_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132166);PERFORM set_config('"+prefix+"mode',CASE WHEN to_regclass('public."+table+"') IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$";
 const choose="DO $choose$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN EXECUTE "+q(beforeCheck)+";ELSE EXECUTE "+q(afterCheck)+";END IF;END $choose$";
 const mutations=[...migration,...sources[1]],apply="DO $apply$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN "+mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')+' END IF;END $apply$';
 const conservation="DO $conservation$ BEGIN IF current_setting('"+prefix+"before')::jsonb IS DISTINCT FROM current_setting('"+prefix+"after')::jsonb THEN RAISE EXCEPTION 'WORKING_TIME_PRIOR_STATE_CHANGED';END IF;END $conservation$";
 const proof=modeValue=>"SELECT jsonb_build_object('version','own-contract-working-time-installation.v1','sourceCommit',"+q(sourceCommit)+",'mode',"+modeValue+",'sourceHashes',"+q(JSON.stringify(sourceHashes))+"::jsonb,'newTables',1,'newFunctions',12,'runtimeFacades',4,'adaptedFunctions',3,'roleAssignmentsAdded',0,'existingAclChanges',0,'businessWrites',0,'nominalRowsReturned',0,'eventRows',(SELECT count(*) FROM public."+table+"),'preservationSha256',encode(public.digest(current_setting('"+prefix+"after')::jsonb::text,'sha256'),'hex')) AS proof";
 return{sourceCommit,sourceHashes,migration,changed,newPins,beforePins:WORKING_TIME_PRIOR_PINS,afterPins,beforeCheck,afterCheck,before,after,choose,apply,mode,conservation,mutations,statements:[mode,choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+prefix+"mode')")],verification:[afterCheck,after,proof("'verify'")],connects:false,executesSql:false};
}
export function assertOwnContractWorkingTimeDurability({installed,durable,batch}){
 for(const p of[installed,durable]){assert.equal(p.version,'own-contract-working-time-installation.v1');assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);for(const [k,v]of Object.entries({newTables:1,newFunctions:12,runtimeFacades:4,adaptedFunctions:3,roleAssignmentsAdded:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(p[k],v);assert.match(p.preservationSha256,/^[a-f0-9]{64}$/);}
 assert.ok(['install','verify'].includes(installed.mode));assert.equal(durable.mode,'verify');assert.ok(Number.isInteger(installed.eventRows)&&installed.eventRows>=0);assert.equal(installed.preservationSha256,durable.preservationSha256);assert.equal(installed.eventRows,durable.eventRows);
}
