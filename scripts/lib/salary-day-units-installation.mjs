// Finite code-only adaptation. Builds reviewable SQL; never connects or runs it.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {DAY_UNIT_PRIOR_PINS,DAY_UNIT_FINAL_HASHES} from './salary-day-units-pins.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex'),q=s=>"'"+s.replaceAll("'","''")+"'";
export const DAY_UNIT_SQL_SHA256='abc14c49804fcd313ba3e2bb27f3232317b0f5e325f3d02cf412cfd041df7006';
const sourceFiles=['scripts/migrations/166-own-payroll-day-units.sql','scripts/lib/salary-day-units-pins.mjs','scripts/lib/salary-day-units-installation.mjs','assets/native-salary-catalog-model.js','assets/native-salary-file-model.js','assets/native-salary-file-panel.js','assets/own-payroll-engine.js','assets/own-payroll-program-model.js','assets/own-payroll-program-workspace-model.js','src/islands/NativeSalaryCatalog.jsx'];
export function buildSalaryDayUnitsInstallation({read,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(typeof read,'function');
 const sourceHashes=Object.fromEntries(sourceFiles.map(f=>[f,sha(read(f).replace(/\r\n?/g,'\n'))]));
 assert.equal(sourceHashes[sourceFiles[0]],DAY_UNIT_SQL_SHA256,'DAY_UNITS_SOURCE_CHANGED');
 const mutations=splitPostgresStatements(read(sourceFiles[0])).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,''));assert.equal(mutations.length,1);assert.match(mutations[0],/^DO \$day_units\$/);
 const beforePins=DAY_UNIT_PRIOR_PINS,afterPins=beforePins.map(p=>({...p,sha256:DAY_UNIT_FINAL_HASHES[p.name]}));
 assert.equal(beforePins.length,4);assert.equal(new Set(beforePins.map(p=>p.signature)).size,4);
 const beforeCheck=pinsCheck(beforePins,'DAY_UNITS_BEFORE_METADATA'),afterCheck=pinsCheck(afterPins,'DAY_UNITS_AFTER_METADATA'),prefix='municontrol_day_units.';
 const state=`DO $state$ DECLARE n integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'DAY_UNITS_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132168);SELECT count(*) INTO n FROM jsonb_array_elements(${q(JSON.stringify(afterPins))}::jsonb) x JOIN pg_proc p ON p.oid=to_regprocedure(x->>'signature') WHERE encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')=x->>'sha256';IF n=4 THEN PERFORM set_config('${prefix}mode','verify',true);ELSIF n=0 THEN PERFORM set_config('${prefix}mode','install',true);ELSE RAISE EXCEPTION 'DAY_UNITS_PARTIAL_STATE';END IF;END $state$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const signatures=beforePins.map(p=>q(p.signature)+'::regprocedure').join(',');
 const snapshot=slot=>{
  let s=preservationSnapshot(slot).replaceAll('municontrol_sql111.',prefix).replaceAll(" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'').replaceAll(" AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'');
  const anchor='public.digest(to_jsonb(p)::text';assert.equal(s.split(anchor).length,2);
  s=s.replace(anchor,`public.digest((CASE WHEN p.oid IN(${signatures}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);
  assert.ok(!s.includes('native_leave_'));return s;
 };
 const before=snapshot('before'),after=snapshot('after'),apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(mutations[0])};END IF;END $apply$`;
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'DAY_UNITS_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const proof=mode=>`SELECT jsonb_build_object('version','own-payroll-day-units-installation.v1','sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',${mode},'adaptedFunctions',4,'newTables',0,'newFunctions',0,'businessWrites',0,'existingAclChanges',0,'roleAssignmentsAdded',0,'nominalRowsReturned',0,'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return {sourceCommit,sourceHashes,beforePins,afterPins,mutations,beforeCheck,afterCheck,state,choose,before,after,apply,conservation,proof:proof(`current_setting('${prefix}mode')`),statements:[state,choose,before,apply,afterCheck,after,conservation,proof(`current_setting('${prefix}mode')`)],verification:['SET TRANSACTION READ ONLY',afterCheck,after,proof("'verify'")],connects:false,executesSql:false};
}
export function assertSalaryDayUnitsDurability({installed,durable,batch}){
 for(const proof of [installed,durable]){
  assert.equal(proof.version,'own-payroll-day-units-installation.v1');assert.equal(proof.sourceCommit,batch.sourceCommit);assert.deepEqual(proof.sourceHashes,batch.sourceHashes);
  for(const [field,value]of Object.entries({adaptedFunctions:4,newTables:0,newFunctions:0,businessWrites:0,existingAclChanges:0,roleAssignmentsAdded:0,nominalRowsReturned:0}))assert.equal(proof[field],value);
  assert.match(proof.preservationSha256,/^[a-f0-9]{64}$/);
 }
 assert.ok(['install','verify'].includes(installed.mode));assert.equal(durable.mode,'verify');assert.equal(installed.preservationSha256,durable.preservationSha256);
}
