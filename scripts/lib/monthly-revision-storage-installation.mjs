// Prepare an exact technical batch. Never connects or writes municipal records.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
export const MONTHLY_STORAGE_PROVIDER_BYTES=1073741824;
export const MONTHLY_STORAGE_CEILING_BYTES=1056964608;
export const MONTHLY_STORAGE_SQL_SHA256='b7490e825b208489981a52cbf2993041383eb7d845638116f36e32f4aa3c294d';
export const MONTHLY_STORAGE_TARGETS=Object.freeze([
 ['payroll_monthly_annul_command_v1','afa343eba56b58b0f7f6d010f74d066afbb7558ff0d004131b020e84f091da8d','34fe7e8aeaaaaa355d1b34370f93f5bd5e16c7099a89490dbabbd20adf10976d',true],
 ['payroll_monthly_correction_command_v1','e7fc7f5fa42905df600f9f15cdae88940207558a31072dabd744819001f27120','7078760970bc824886c94d0cc017c1233246bf09c7163b4a29b24213045bd4a9',true],
].map(([name,sha256,afterSha256,runtime])=>Object.freeze({name,sha256,afterSha256,runtime})));
const hash=s=>createHash('sha256').update(s).digest('hex');
const q=s=>"'"+s.replaceAll("'","''")+"'",prefix='municontrol_monthly_storage.';
const pin=t=>({name:t.name,signature:'public.'+t.name+(t.runtime?'(jsonb,jsonb,uuid)':'()'),sha256:t.sha256,argNames:t.runtime?['p_context','p_body','p_key']:[],defaults:'',resultType:t.runtime?'jsonb':'void',language:'plpgsql',returnsSet:false,strict:false,definer:true,volatility:'v',config:['search_path=pg_catalog, public, pg_temp'],runtime:t.runtime});
const files=['scripts/migrations/170-monthly-revision-storage-capacity.sql','scripts/lib/monthly-revision-storage-installation.mjs'];
export function buildMonthlyRevisionStorageInstallation({read,sourceCommit,verifiedBudgetBytes}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(verifiedBudgetBytes,MONTHLY_STORAGE_PROVIDER_BYTES,'MONTHLY_STORAGE_PROVIDER_BUDGET_REQUIRED');
 const sourceHashes=Object.fromEntries(files.map(f=>[f,hash(read(f).replace(/\r\n?/g,'\n'))]));
 assert.equal(sourceHashes[files[0]],MONTHLY_STORAGE_SQL_SHA256,'MONTHLY_STORAGE_SOURCE_CHANGED');
 const mutations=splitPostgresStatements(read(files[0])).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,''));
 assert.equal(mutations.length,1);assert.match(mutations[0],/^DO \$monthly_storage\$/);
 const beforePins=MONTHLY_STORAGE_TARGETS.map(pin),afterPins=beforePins.map((p,i)=>({...p,sha256:MONTHLY_STORAGE_TARGETS[i].afterSha256}));
 const beforeCheck=pinsCheck(beforePins,'MONTHLY_STORAGE_BEFORE_METADATA'),afterCheck=pinsCheck(afterPins,'MONTHLY_STORAGE_AFTER_METADATA');
 const states=MONTHLY_STORAGE_TARGETS.map((t,i)=>({signature:beforePins[i].signature,before:t.sha256,after:t.afterSha256}));
 const state=`DO $state$ DECLARE x jsonb;body_hash text;old_count integer:=0;new_count integer:=0; BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'MONTHLY_STORAGE_ISOLATION_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-monthly:storage:v1',0));
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(states))}::jsonb) LOOP
 SELECT encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') INTO body_hash FROM pg_proc p WHERE p.oid=to_regprocedure(x->>'signature');
 IF body_hash=x->>'before' THEN old_count:=old_count+1;ELSIF body_hash=x->>'after' THEN new_count:=new_count+1;ELSE RAISE EXCEPTION 'MONTHLY_STORAGE_STATE_CHANGED';END IF;END LOOP;
 IF old_count=2 THEN PERFORM set_config('${prefix}mode','install',true);ELSIF new_count=2 THEN PERFORM set_config('${prefix}mode','verify',true);ELSE RAISE EXCEPTION 'MONTHLY_STORAGE_PARTIAL_STATE';END IF;
 PERFORM set_config('${prefix}provider_budget_bytes',${q(String(verifiedBudgetBytes))},true);END $state$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const allowed='ARRAY['+beforePins.map(p=>q(p.signature)+'::regprocedure::oid').join(',')+']';
 const snapshot=slot=>{
  let s=preservationSnapshot(slot).replaceAll('municontrol_sql111.',prefix)
   .replaceAll(" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'')
   .replaceAll(" AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'');
  const anchor='public.digest(to_jsonb(p)::text';assert.equal(s.split(anchor).length,2);
  s=s.replace(anchor,`public.digest((CASE WHEN p.oid=ANY(${allowed}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);
  assert.ok(!s.includes('native_leave_'));return s;
 };
 const before=snapshot('before'),after=snapshot('after');
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(mutations[0])};END IF;END $apply$`;
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'MONTHLY_STORAGE_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const proof=mode=>`SELECT jsonb_build_object('version','monthly-revision-storage-installation.v1','sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',${mode},'providerBudgetBytes',${verifiedBudgetBytes},'storageCeilingBytes',${MONTHLY_STORAGE_CEILING_BYTES},'safetyMarginBytes',16777216,'adaptedFunctions',2,'newTables',0,'newFunctions',0,'businessWrites',0,'existingAclChanges',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return{sourceCommit,sourceHashes,beforePins,afterPins,mutations,beforeCheck,afterCheck,state,choose,before,after,apply,conservation,proof:proof(`current_setting('${prefix}mode')`),statements:[state,choose,before,apply,afterCheck,after,conservation,proof(`current_setting('${prefix}mode')`)],verification:['SET TRANSACTION READ ONLY',afterCheck,after,proof("'verify'")],connects:false,executesSql:false};
}
export function assertMonthlyRevisionStorageDurability(installed,durable){
 for(const p of[installed,durable]){assert.equal(p.version,'monthly-revision-storage-installation.v1');
  for(const[k,v]of Object.entries({providerBudgetBytes:MONTHLY_STORAGE_PROVIDER_BYTES,storageCeilingBytes:MONTHLY_STORAGE_CEILING_BYTES,safetyMarginBytes:16777216,adaptedFunctions:2,newTables:0,newFunctions:0,businessWrites:0,existingAclChanges:0,nominalRowsReturned:0}))assert.equal(p[k],v);
  assert.match(p.preservationSha256,/^[a-f0-9]{64}$/);
 }
 assert.ok(['install','verify'].includes(installed.mode));assert.equal(durable.mode,'verify');
 assert.equal(installed.sourceCommit,durable.sourceCommit);assert.deepEqual(installed.sourceHashes,durable.sourceHashes);assert.equal(installed.preservationSha256,durable.preservationSha256);
}
