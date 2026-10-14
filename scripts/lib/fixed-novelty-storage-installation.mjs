// Prepare an exact technical batch. Never connects or writes municipal records.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
export const FIXED_STORAGE_PROVIDER_BYTES=1073741824;
export const FIXED_STORAGE_CEILING_BYTES=1056964608;
export const FIXED_STORAGE_SQL_SHA256='c66288bf25367240095c7b45c183539672354a6ae0eb1f501390c8d16f92f001';
export const FIXED_STORAGE_TARGETS=Object.freeze([
 ['payroll_fixed_registry_capacity_v1','310a4196e2421d1a2be01f3dab4a25e936eec1833f47cdc264b679edd0f2e52c','cf5c5bf19addbf32411dcd1541a255d45135e21b606a1909fceece494645fa71',false],
 ['payroll_fixed_group_annul_v1','cf6b2010ce415c0f79b90f7694d9d36d2245b6b5984af04195be09b5c64303da','3ea50153baa24af2516455ecbb49d120d2e6ce995fcb929ba4e9fde2d151f005',true],
 ['payroll_fixed_correction_group_propose_v1','dd03d3bdc5b61248c7e64018bb7c953e883e89019b3bda69fa3d799533d58add','684f5454f146483007040f431118d1ce91d1365b02ff70074b3b81bb62a96dff',true],
 ['payroll_fixed_review_group_decide_v1','45464be19ad884186f82c669f22095f8f3f77388c21e4ff97884d096a0982999','8691400dfd17a2f2543c2487f30dd4e02cf754c242a0fa4a7b60864afff66e89',true],
].map(([name,sha256,afterSha256,runtime])=>Object.freeze({name,sha256,afterSha256,runtime})));
const hash=s=>createHash('sha256').update(s).digest('hex');
const q=s=>"'"+s.replaceAll("'","''")+"'",prefix='municontrol_fixed_storage.';
const pin=t=>({name:t.name,signature:'public.'+t.name+(t.runtime?'(jsonb,jsonb,uuid)':'()'),sha256:t.sha256,argNames:t.runtime?['p_context','p_payload','p_key']:[],defaults:'',resultType:t.runtime?'jsonb':'void',language:'plpgsql',returnsSet:false,strict:false,definer:true,volatility:'v',config:['search_path=pg_catalog, public, pg_temp'],runtime:t.runtime});
const files=['scripts/migrations/169-fixed-novelty-storage-capacity.sql','scripts/lib/fixed-novelty-storage-installation.mjs'];
export function buildFixedNoveltyStorageInstallation({read,sourceCommit,verifiedBudgetBytes}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(verifiedBudgetBytes,FIXED_STORAGE_PROVIDER_BYTES,'FIXED_STORAGE_PROVIDER_BUDGET_REQUIRED');
 const sourceHashes=Object.fromEntries(files.map(f=>[f,hash(read(f).replace(/\r\n?/g,'\n'))]));
 assert.equal(sourceHashes[files[0]],FIXED_STORAGE_SQL_SHA256,'FIXED_STORAGE_SOURCE_CHANGED');
 const mutations=splitPostgresStatements(read(files[0])).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,''));
 assert.equal(mutations.length,1);assert.match(mutations[0],/^DO \$fixed_storage\$/);
 const beforePins=FIXED_STORAGE_TARGETS.map(pin),afterPins=beforePins.map((p,i)=>({...p,sha256:FIXED_STORAGE_TARGETS[i].afterSha256}));
 const beforeCheck=pinsCheck(beforePins,'FIXED_STORAGE_BEFORE_METADATA'),afterCheck=pinsCheck(afterPins,'FIXED_STORAGE_AFTER_METADATA');
 const states=FIXED_STORAGE_TARGETS.map((t,i)=>({signature:beforePins[i].signature,before:t.sha256,after:t.afterSha256}));
 const state=`DO $state$ DECLARE x jsonb;body_hash text;old_count integer:=0;new_count integer:=0; BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'FIXED_STORAGE_ISOLATION_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(132171);PERFORM pg_advisory_xact_lock(hashtextextended('payroll-fixed:capacity:v1',0));
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(states))}::jsonb) LOOP
 SELECT encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') INTO body_hash FROM pg_proc p WHERE p.oid=to_regprocedure(x->>'signature');
 IF body_hash=x->>'before' THEN old_count:=old_count+1;ELSIF body_hash=x->>'after' THEN new_count:=new_count+1;ELSE RAISE EXCEPTION 'FIXED_STORAGE_STATE_CHANGED';END IF;END LOOP;
 IF old_count=4 THEN PERFORM set_config('${prefix}mode','install',true);ELSIF new_count=4 THEN PERFORM set_config('${prefix}mode','verify',true);ELSE RAISE EXCEPTION 'FIXED_STORAGE_PARTIAL_STATE';END IF;
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
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'FIXED_STORAGE_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const proof=mode=>`SELECT jsonb_build_object('version','fixed-novelty-storage-installation.v1','sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',${mode},'providerBudgetBytes',${verifiedBudgetBytes},'storageCeilingBytes',${FIXED_STORAGE_CEILING_BYTES},'safetyMarginBytes',16777216,'adaptedFunctions',4,'newTables',0,'newFunctions',0,'businessWrites',0,'existingAclChanges',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return{sourceCommit,sourceHashes,beforePins,afterPins,mutations,beforeCheck,afterCheck,state,choose,before,after,apply,conservation,proof:proof(`current_setting('${prefix}mode')`),statements:[state,choose,before,apply,afterCheck,after,conservation,proof(`current_setting('${prefix}mode')`)],verification:['SET TRANSACTION READ ONLY',afterCheck,after,proof("'verify'")],connects:false,executesSql:false};
}
export function assertFixedNoveltyStorageDurability(installed,durable){
 for(const p of[installed,durable]){assert.equal(p.version,'fixed-novelty-storage-installation.v1');
  for(const[k,v]of Object.entries({providerBudgetBytes:FIXED_STORAGE_PROVIDER_BYTES,storageCeilingBytes:FIXED_STORAGE_CEILING_BYTES,safetyMarginBytes:16777216,adaptedFunctions:4,newTables:0,newFunctions:0,businessWrites:0,existingAclChanges:0,nominalRowsReturned:0}))assert.equal(p[k],v);
  assert.match(p.preservationSha256,/^[a-f0-9]{64}$/);
 }
 assert.ok(['install','verify'].includes(installed.mode));assert.equal(durable.mode,'verify');
 assert.equal(installed.sourceCommit,durable.sourceCommit);assert.deepEqual(installed.sourceHashes,durable.sourceHashes);assert.equal(installed.preservationSha256,durable.preservationSha256);
}
