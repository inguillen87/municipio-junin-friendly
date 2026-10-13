// Exact technical protocol only. Does not connect or publish business catalogs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {CLASSIFICATION_USE_PRIOR_PINS,CLASSIFICATION_USE_FINAL_HASHES,CLASSIFICATION_USE_ADMINISTRATIVE_PIN} from './classification-registration-use-pins.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex'),q=s=>"'"+s.replaceAll("'","''")+"'",prefix='municontrol_classification_use.';
export const CLASSIFICATION_USE_SQL_SHA256='8eef9142231b660bdac357312cc1c9ee29ab79a65e04422c5bd5bfab77189c38';
const files=['scripts/migrations/167-classification-registration-use.sql','scripts/lib/classification-registration-use-pins.mjs','scripts/lib/classification-registration-use-installation.mjs','assets/native-employment-catalog-model.js','assets/native-employment-catalog-file-model.js','assets/native-employment-catalog.js','assets/native-employment-catalog.css','assets/native-employee-confirmation-model.js','assets/native-employee-create.js','scripts/build-friendly.mjs'];
export function buildClassificationRegistrationUseInstallation({read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const sourceHashes=Object.fromEntries(files.map(f=>[f,hash(read(f).replace(/\r\n?/g,'\n'))]));assert.equal(sourceHashes[files[0]],CLASSIFICATION_USE_SQL_SHA256,'CLASSIFICATION_USE_SOURCE_CHANGED');
 const mutations=splitPostgresStatements(read(files[0])).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,''));assert.equal(mutations.length,1);assert.match(mutations[0],/^DO \$classification_use\$/);
 const beforePins=CLASSIFICATION_USE_PRIOR_PINS,afterPins=beforePins.map(p=>({...p,sha256:CLASSIFICATION_USE_FINAL_HASHES[p.name]}));assert.equal(beforePins.length,5);assert.equal(new Set(beforePins.map(p=>p.signature)).size,5);
 const prerequisite=pinsCheck([CLASSIFICATION_USE_ADMINISTRATIVE_PIN],'CLASSIFICATION_USE_ADMINISTRATIVE_PREREQUISITE');
 const beforeCheck=pinsCheck(beforePins,'CLASSIFICATION_USE_BEFORE_METADATA'),afterCheck=pinsCheck(afterPins,'CLASSIFICATION_USE_AFTER_METADATA');
 const state=`DO $state$ DECLARE n integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'CLASSIFICATION_USE_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132169);SELECT count(*) INTO n FROM jsonb_array_elements(${q(JSON.stringify(afterPins))}::jsonb) x JOIN pg_proc p ON p.oid=to_regprocedure(x->>'signature') WHERE encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')=x->>'sha256';IF n=5 THEN PERFORM set_config('${prefix}mode','verify',true);ELSIF n=0 THEN PERFORM set_config('${prefix}mode','install',true);ELSE RAISE EXCEPTION 'CLASSIFICATION_USE_PARTIAL_STATE';END IF;END $state$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const signatures=beforePins.map(p=>q(p.signature)+'::regprocedure').join(',');
 const snapshot=slot=>{let s=preservationSnapshot(slot).replaceAll('municontrol_sql111.',prefix).replaceAll(" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'').replaceAll(" AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'');const anchor='public.digest(to_jsonb(p)::text';assert.equal(s.split(anchor).length,2);s=s.replace(anchor,`public.digest((CASE WHEN p.oid IN(${signatures}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);assert.ok(!s.includes('native_leave_'));return s;};
 const before=snapshot('before'),after=snapshot('after'),apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(mutations[0])};END IF;END $apply$`;
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'CLASSIFICATION_USE_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const proof=mode=>`SELECT jsonb_build_object('version','classification-registration-use-installation.v1','sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',${mode},'adaptedFunctions',5,'newTables',0,'newFunctions',0,'businessWrites',0,'existingAclChanges',0,'roleAssignmentsAdded',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return{sourceCommit,sourceHashes,beforePins,afterPins,prerequisite,mutations,beforeCheck,afterCheck,state,choose,before,after,apply,conservation,proof:proof(`current_setting('${prefix}mode')`),statements:[prerequisite,state,choose,before,apply,afterCheck,after,conservation,proof(`current_setting('${prefix}mode')`)],verification:['SET TRANSACTION READ ONLY',prerequisite,afterCheck,after,proof("'verify'")],connects:false,executesSql:false};
}
export function assertClassificationUseDurability(installed,durable){
 for(const p of[installed,durable]){assert.equal(p.version,'classification-registration-use-installation.v1');for(const[k,v]of Object.entries({adaptedFunctions:5,newTables:0,newFunctions:0,businessWrites:0,existingAclChanges:0,roleAssignmentsAdded:0,nominalRowsReturned:0}))assert.equal(p[k],v);assert.match(p.preservationSha256,/^[a-f0-9]{64}$/);}
 assert.ok(['install','verify'].includes(installed.mode));assert.equal(durable.mode,'verify');assert.equal(installed.sourceCommit,durable.sourceCommit);assert.deepEqual(installed.sourceHashes,durable.sourceHashes);assert.equal(installed.preservationSha256,durable.preservationSha256);
}
