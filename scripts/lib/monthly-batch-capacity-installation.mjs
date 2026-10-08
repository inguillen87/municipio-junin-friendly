// Technical capacity only. No source selection, nominal rows, grants or payroll effects.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MONTHLY_BATCH_MAX_ROWS} from '../../assets/payroll-native-monthly-model.js';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';

const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'MONTHLY_CAPACITY_ANCHOR_CHANGED');return s.replace(a,()=>b);};
const constraints=Object.freeze([
 ['payroll_novelty_batch','payroll_novelty_batch_row_count_ck',"CHECK (((row_count >= 1) AND (row_count <= 500) AND (((source_mode)::text = 'bulk'::text) OR (row_count = 1))))","CHECK ((((row_count >= 1) AND (row_count <= 500)) AND (((source_mode)::text = 'bulk'::text) OR (row_count = 1))))"],
 ['payroll_novelty_row','payroll_novelty_row_ordinal_ck','CHECK (((row_ordinal >= 1) AND (row_ordinal <= 500)))'],
 ['payroll_novelty_issue','payroll_novelty_issue_row_pair_ck','CHECK ((((row_id IS NULL) AND (row_ordinal IS NULL)) OR ((row_id IS NOT NULL) AND ((row_ordinal >= 1) AND (row_ordinal <= 500)))))'],
]);
const pinsMetadata=pins=>pinsCheck(pins,'MONTHLY_CAPACITY_FUNCTION_CHANGED').replace(/\s+OR has_function_privilege\([\s\S]*?\n  THEN RAISE EXCEPTION/,'\n  THEN RAISE EXCEPTION');
function constraintCheck(expanded){
 const expected=constraints.map(([table,name,definition,definition17=definition])=>({table:'public.'+table,name,definition:expanded?once(definition,'<= 500','<= '+MONTHLY_BATCH_MAX_ROWS):definition,definition17:expanded?once(definition17,'<= 500','<= '+MONTHLY_BATCH_MAX_ROWS):definition17}));
 return `DO $capacity_constraints$ DECLARE x jsonb;k pg_constraint;major integer:=current_setting('server_version_num')::integer/10000;BEGIN
 IF major NOT IN(17,18) THEN RAISE EXCEPTION 'MONTHLY_CAPACITY_SERVER_VERSION';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(${quote(JSON.stringify(expected))}::jsonb) LOOP
  SELECT * INTO k FROM pg_constraint WHERE conrelid=to_regclass(x->>'table') AND conname=x->>'name';
  IF k.oid IS NULL OR k.contype<>'c' OR NOT k.convalidated OR k.condeferrable OR k.condeferred OR k.connoinherit OR NOT k.conislocal OR k.coninhcount<>0
   OR pg_get_constraintdef(k.oid) NOT IN(x->>'definition',x->>'definition17') THEN RAISE EXCEPTION 'MONTHLY_CAPACITY_CONSTRAINT_CHANGED' USING DETAIL=format('%s.%s expected=%s or %s actual=%s',x->>'table',x->>'name',x->>'definition',x->>'definition17',pg_get_constraintdef(k.oid));END IF;
 END LOOP;END $capacity_constraints$`;
}
function snapshot(slot,pins){
 let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true')
  .replace("AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'');
 const allowed=constraints.map(([table,name])=>`(k.conrelid='public.${table}'::regclass AND k.conname=${quote(name)})`).join(' OR ');
 s=once(s,'WHERE k.conrelid=c.oid)',`WHERE k.conrelid=c.oid AND NOT(${allowed}))`);
 const functionIds=pins.map(p=>quote(p.signature)+'::regprocedure').join(',');
 s=once(s,"public.digest(to_jsonb(p)::text,'sha256')",`public.digest((CASE WHEN p.oid IN(${functionIds}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')`);
 return s.replaceAll('municontrol_sql111.','municontrol_monthly_capacity.');
}
export function buildMonthlyBatchCapacityInstallation({read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(MONTHLY_BATCH_MAX_ROWS,2000);
 const sourceHashes={},sources={};
 for(const file of ['026-governed-payroll-novelties.sql','101-native-monthly-novelties.sql']){
  const fullPath='scripts/migrations/'+file,source=read(fullPath).replace(/\r\n?/g,'\n');
  sourceHashes[fullPath]=createHash('sha256').update(source).digest('hex');sources[file]=splitPostgresStatements(source);
 }
 const names=['payroll_novelty_rows_valid_v1','payroll_novelty_bootstrap_v1','payroll_novelty_bootstrap_v2'];
 const originals=names.map((name,index)=>{
  const file=index===0?'026-governed-payroll-novelties.sql':'101-native-monthly-novelties.sql';
  const found=sources[file].filter(s=>new RegExp('^CREATE OR REPLACE FUNCTION public\\.'+name+'\\(').test(s));assert.equal(found.length,1);return found[0];
 });
 const changed=originals.map((definition,index)=>index===0
  ?once(once(once(definition,'jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500','jsonb_array_length(p_rows) NOT BETWEEN 1 AND '+MONTHLY_BATCH_MAX_ROWS),
   'row_ordinal_text::integer NOT BETWEEN 1 AND 500','row_ordinal_text::integer NOT BETWEEN 1 AND '+MONTHLY_BATCH_MAX_ROWS),
   "row_ordinal_text !~ '^[1-9][0-9]{0,2}$'","row_ordinal_text !~ '^[1-9][0-9]{0,3}$'")
  :once(definition,"'maxRows', 500","'maxRows', "+MONTHLY_BATCH_MAX_ROWS));
 const beforePins=originals.map(ownInstallationFunctionPin),afterPins=changed.map(ownInstallationFunctionPin);
 assert.deepEqual(beforePins.map(p=>p.sha256),['183ec51dd323fa3a18cc4a7e93501c84892f2895ca35caad8bdcdb56372e8b4a','8616a8a071755753293466c0de9533d33aa1fcd39c422aa8a435cd21ddd3eebb','23985aa7fa9fdfe91175573498deb6d864d721a5f8f33fbe33a3ece1673b548f']);
 const beforeCheck=pinsMetadata(beforePins),afterCheck=pinsMetadata(afterPins),oldConstraints=constraintCheck(false),newConstraints=constraintCheck(true);
 const before=snapshot('before',beforePins),after=snapshot('after',afterPins);
 const conservation=`DO $capacity_conservation$ BEGIN IF current_setting('municontrol_monthly_capacity.before')::jsonb IS DISTINCT FROM current_setting('municontrol_monthly_capacity.after')::jsonb THEN RAISE EXCEPTION 'MONTHLY_CAPACITY_CONSERVATION_FAILED';END IF;END $capacity_conservation$`;
 const mode=`DO $capacity_mode$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.payroll_novelty_rows_valid_v1(jsonb,text)'::regprocedure AND encode(public.digest(replace(prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')=${quote(beforePins[0].sha256)}) THEN
  PERFORM set_config('municontrol_monthly_capacity.mode','install',true);
 ELSE PERFORM set_config('municontrol_monthly_capacity.mode','verify',true);END IF;END $capacity_mode$`;
 const conditional=s=>`DO $capacity_install$ BEGIN IF current_setting('municontrol_monthly_capacity.mode')='install' THEN EXECUTE ${quote(s)};END IF;END $capacity_install$`;
 const choose=(beforeSql,afterSql)=>`DO $capacity_choose$ BEGIN IF current_setting('municontrol_monthly_capacity.mode')='install' THEN EXECUTE ${quote(beforeSql)};ELSE EXECUTE ${quote(afterSql)};END IF;END $capacity_choose$`;
 const alter=constraints.map(([table,name,definition])=>`ALTER TABLE public.${table} DROP CONSTRAINT ${name},ADD CONSTRAINT ${name} ${table==='payroll_novelty_batch'?`CHECK (row_count BETWEEN 1 AND ${MONTHLY_BATCH_MAX_ROWS} AND (source_mode='bulk' OR row_count=1))`:once(definition,'<= 500','<= '+MONTHLY_BATCH_MAX_ROWS)}`);
 const proof=`SELECT jsonb_build_object('version','monthly-batch-capacity-installation.v1','sourceCommit',${quote(sourceCommit)},'writerLimit',${MONTHLY_BATCH_MAX_ROWS},'mode',current_setting('municontrol_monthly_capacity.mode'),'newTables',0,'newFunctions',0,'adaptedFunctions',3,'adaptedConstraints',3,'businessWrites',0,'nominalRowsReturned',0,'sourceHashes',${quote(JSON.stringify(sourceHashes))}::jsonb,'preservedTables',jsonb_array_length(current_setting('municontrol_monthly_capacity.after')::jsonb->'tables'),'preservationSha256',encode(public.digest(current_setting('municontrol_monthly_capacity.after')::jsonb::text,'sha256'),'hex')) AS proof`;
 const statements=["LOCK TABLE public.payroll_novelty_batch,public.payroll_novelty_row,public.payroll_novelty_issue IN SHARE ROW EXCLUSIVE MODE",mode,choose(beforeCheck,afterCheck),choose(oldConstraints,newConstraints),before,...changed.map(conditional),...alter.map(conditional),afterCheck,newConstraints,after,conservation,proof];
 return {version:'monthly-batch-capacity-installation.v1',sourceCommit,sourceHashes,originals,beforePins,afterPins,constraints,changed,beforeCheck,afterCheck,oldConstraints,newConstraints,before,after,conservation,proof,statements,connects:false,executesSql:false};
}
