// Review-only SQL132–142 batch. Every municipal row remains inside SQL.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {ADOPTION_INSTALL_SHA,ADOPTION_INSTALL_TABLES,buildEmploymentAdoptionInstallation} from './employment-adoption-installation.mjs';
import {CONSUMER_BEFORE_PINS,CONSUMER_AFTER_PINS,CONSUMER_SOURCE_SHA,MONTHLY_ADOPTED_CONSTRAINT} from './adopted-consumers-installation-pins.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';import {pinsCheck} from './native-leave-installation.mjs';import {splitPostgresStatements} from './sql-statements.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex'),lf=v=>v.replace(/\r\n?/g,'\n');
const once=(s,needle,value)=>{assert.equal(s.split(needle).length,2,'Installation anchor drift');return s.replace(needle,()=>value);};
const baseCondition="s.nspname='public' AND(p.proname LIKE 'employment_adoption_%' OR p.proname IN('native_employee_read_projection_v1','native_employee_directory_snapshot_v1') OR p.proname LIKE 'native_employment_lifecycle_%_v2')";
const helperCondition="s.nspname='public' AND(p.proname LIKE 'payroll_fixed_registry_%_v2' OR p.proname='payroll_fixed_registry_adopted_subject_v1')";
export const ADOPTED_CONSUMERS_SOURCE_SHA=Object.freeze({...ADOPTION_INSTALL_SHA,...CONSUMER_SOURCE_SHA});
const version='adopted-consumers-installation.v1',prefix='municontrol_adopted_consumers_install.';
export function adoptedConsumersConditional(statements,condition){return `DO $conditional$ BEGIN IF ${condition} THEN ${statements.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $conditional$`;}
const conditional=adoptedConsumersConditional;
function monthlyCheck(adapted){return `DO $monthly$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.payroll_novelty_row'::regclass AND attname='legajo_snapshot' AND atttypid='varchar'::regtype AND atttypmod=${adapted?68:24} AND attnotnull AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payroll_novelty_row'::regclass AND conname='payroll_novelty_row_legajo_ck' AND contype='c' AND convalidated AND NOT condeferrable AND NOT condeferred AND pg_get_constraintdef(oid)=${q(adapted?MONTHLY_ADOPTED_CONSTRAINT:"CHECK (((legajo_snapshot)::text ~ '^(0|[1-9][0-9]{0,19})$'::text))")})
 THEN RAISE EXCEPTION 'ADOPTED_CONSUMERS_MONTHLY_SHAPE_CHANGED';END IF;END $monthly$`;}

export function buildAdoptedConsumersInstallation({read,sourceCommit}){
 const base=buildEmploymentAdoptionInstallation({read,sourceCommit});
 const consumerSources=Object.keys(CONSUMER_SOURCE_SHA).map(file=>{const s=lf(read('scripts/migrations/'+file));assert.equal(hash(s),CONSUMER_SOURCE_SHA[file],'Unreviewed consumer migration '+file);return s;});
 const migration=consumerSources.flatMap(s=>splitPostgresStatements(s).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,'')));assert.ok(migration.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 const helperPins=migration.filter(s=>/^CREATE FUNCTION public\./.test(s)).map(d=>({...ownInstallationFunctionPin(d),runtime:false}));assert.equal(helperPins.length,5);
 assert.equal(CONSUMER_BEFORE_PINS.length,19);assert.equal(CONSUMER_AFTER_PINS.length,19);
 for(let i=0;i<19;i++)assert.deepEqual({...CONSUMER_BEFORE_PINS[i],sha256:null},{...CONSUMER_AFTER_PINS[i],sha256:null});
 const adaptedSignatures=[base.guardBefore.signature,...CONSUMER_BEFORE_PINS.map(p=>p.signature)],adaptedOids=adaptedSignatures.map(s=>'to_regprocedure('+q(s)+')').join(',');
 const snapshot=slot=>{
  let s=slot==='before'?base.statements[2]:base.verification.at(-3);assert.ok(s.includes("'municontrol_adoption_install."+slot+"'"));
  s=once(s,baseCondition,'('+baseCondition+' OR '+helperCondition+')').replaceAll('municontrol_adoption_install.',prefix);
  s=once(s,"CASE WHEN p.oid=to_regprocedure('public.grh_effective_baseline_guard_v1()')",'CASE WHEN p.oid IN('+adaptedOids+')');
  // Only the reviewed varchar widening and named CHECK replacement are excluded.
  // Every other column/default/constraint/index/ACL and every row is fingerprinted.
  s=once(s,"'attribute',to_jsonb(a)","'attribute',CASE WHEN c.oid=to_regclass('public.payroll_novelty_row') AND a.attname='legajo_snapshot' THEN jsonb_set(to_jsonb(a),'{atttypmod}','24'::jsonb) ELSE to_jsonb(a) END");
  // PG18 rebuilds this column's NOT NULL constraint during varchar widening.
  // Normalize its OID only; retain all semantic/security fields. Sort the
  // monthly constraints by name so that this internal OID change cannot reorder
  // the array. The durable object proof below retains the actual new OID.
  s=once(s,'jsonb_agg(to_jsonb(k) ORDER BY k.oid)',"jsonb_agg(CASE WHEN c.oid=to_regclass('public.payroll_novelty_row') AND k.contype='n' AND k.conname='payroll_novelty_row_legajo_snapshot_not_null' THEN to_jsonb(k)-'oid' ELSE to_jsonb(k) END ORDER BY CASE WHEN c.oid=to_regclass('public.payroll_novelty_row') THEN k.conname END COLLATE \"C\",k.oid)");
  s=once(s,'WHERE k.conrelid=c.oid)',"WHERE k.conrelid=c.oid AND NOT(c.oid=to_regclass('public.payroll_novelty_row') AND k.conname='payroll_novelty_row_legajo_ck'))");
  return s;
 };
 const before=snapshot('before'),after=snapshot('after');
 const state=`DO $state$ DECLARE n integer;h integer;t integer;BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'ADOPTED_CONSUMERS_ISOLATION_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(132136);PERFORM pg_advisory_xact_lock(132142);
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${baseCondition};
 SELECT count(*) INTO h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${helperCondition};
 SELECT count(*) INTO t FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN(${ADOPTION_INSTALL_TABLES.map(q).join(',')});
 IF n=0 AND t=0 AND h=0 THEN PERFORM set_config('${prefix}mode','first',true);
 ELSIF n=47 AND t=4 AND h=0 THEN PERFORM set_config('${prefix}mode','upgrade',true);
 ELSIF n=47 AND t=4 AND h=5 THEN PERFORM set_config('${prefix}mode','repeat',true);
 ELSE RAISE EXCEPTION 'ADOPTED_CONSUMERS_PARTIAL_STATE';END IF;END $state$`;
 const isInitial=`current_setting('${prefix}mode') IN('first','upgrade')`;
 const initialCheckStatements=[pinsCheck(CONSUMER_BEFORE_PINS,'ADOPTED_CONSUMERS_BEFORE_METADATA'),monthlyCheck(false)];
 const initialChecks=conditional(initialCheckStatements,isInitial);
 const baseFirst=conditional(base.statements.slice(0,-1),`current_setting('${prefix}mode')='first'`);
 const baseUpgrade=conditional(base.verification.slice(0,4),`current_setting('${prefix}mode')='upgrade'`);
 const first=conditional(migration,isInitial);
 const priorPins=base.priorPins.map(p=>p.name==='native_employment_change_context_v1'?CONSUMER_AFTER_PINS.find(p=>p.name==='native_employment_change_context_v1'):p);
 const postChecks=[pinsCheck(priorPins,'ADOPTED_CONSUMERS_PREREQUISITE_METADATA'),...base.verification.slice(1,4),pinsCheck(helperPins,'ADOPTED_CONSUMERS_HELPER_METADATA'),pinsCheck(CONSUMER_AFTER_PINS,'ADOPTED_CONSUMERS_AFTER_METADATA'),monthlyCheck(true)];
 const ownCountCheck=`DO $objects$ BEGIN
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${baseCondition})<>47 OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${helperCondition})<>5
 THEN RAISE EXCEPTION 'ADOPTED_CONSUMERS_PARTIAL_STATE';END IF;END $objects$`;
 const priorAudit=base.statements.at(-3).replaceAll('municontrol_adoption_install.',prefix).replaceAll('ADOPTION_INSTALL_','ADOPTED_CONSUMERS_');assert.ok(priorAudit.includes("old-'triggers' IS DISTINCT FROM new-'triggers'"));
 const dataProof=base.statements.at(-2).replaceAll('municontrol_adoption_install.',prefix);
 const objects=`SELECT jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${baseCondition} OR ${helperCondition} OR p.oid IN(${adaptedOids})),
 'adoptionTables',(${base.tableShapeSql}),'monthlyColumn',(SELECT to_jsonb(a) FROM pg_attribute a WHERE a.attrelid='public.payroll_novelty_row'::regclass AND a.attname='legajo_snapshot'),
 'monthlyConstraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.conname COLLATE "C") FROM pg_constraint k WHERE k.conrelid='public.payroll_novelty_row'::regclass AND k.conname IN('payroll_novelty_row_legajo_ck','payroll_novelty_row_legajo_snapshot_not_null')))`;
 const proof=`SELECT jsonb_build_object('version',${q(version)},'sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(ADOPTED_CONSUMERS_SOURCE_SHA))}::jsonb,'mode',coalesce(current_setting('${prefix}mode',true),'verify'),
 'allChecksPassed',true,'newTables',4,'newFunctions',52,'adaptedFunctions',20,'runtimeFacades',13,'adoptionWriterGranted',false,'roleAssignmentsAdded',0,'nominalRowsReturned',0,
 'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',encode(public.digest((${objects})::text,'sha256'),'hex'),
 'dataFingerprint',encode(public.digest(current_setting('${prefix}data')::jsonb::text,'sha256'),'hex'),'counts',current_setting('${prefix}data')::jsonb) AS proof`;
 return {version,connects:false,executesSql:false,sourceCommit,sourceHashes:ADOPTED_CONSUMERS_SOURCE_SHA,base,helperPins,beforePins:CONSUMER_BEFORE_PINS,afterPins:CONSUMER_AFTER_PINS,migration,state,before,after,baseFirst,baseUpgrade,first,initialChecks,initialCheckStatements,postChecks,priorAudit,dataProof,proof,
  statements:[state,initialChecks,before,baseFirst,baseUpgrade,first,...postChecks,ownCountCheck,after,priorAudit,dataProof,proof],verification:[...postChecks,ownCountCheck,after,dataProof,proof]};
}

export function assertAdoptedConsumersDurability({installed,durable,sourceCommit}){
 const fields=['version','sourceCommit','sourceHashes','mode','allChecksPassed','newTables','newFunctions','adaptedFunctions','runtimeFacades','adoptionWriterGranted','roleAssignmentsAdded','nominalRowsReturned','priorFingerprint','objectFingerprint','dataFingerprint','counts'];
 for(const p of [installed,durable]){
  assert.deepEqual(Object.keys(p).sort(),fields.toSorted(),'ADOPTED_CONSUMERS_PROOF_SHAPE');assert.equal(p.version,version);assert.equal(p.sourceCommit,sourceCommit);assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.deepEqual(p.sourceHashes,ADOPTED_CONSUMERS_SOURCE_SHA);assert.ok(['first','upgrade','repeat','verify'].includes(p.mode));
  for(const[k,v]of Object.entries({allChecksPassed:true,newTables:4,newFunctions:52,adaptedFunctions:20,runtimeFacades:13,adoptionWriterGranted:false,roleAssignmentsAdded:0,nominalRowsReturned:0}))assert.equal(p[k],v);
  for(const f of ['priorFingerprint','objectFingerprint','dataFingerprint'])assert.match(p[f],/^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(p.counts).sort(),[...ADOPTION_INSTALL_TABLES].sort());for(const x of Object.values(p.counts)){assert.deepEqual(Object.keys(x).sort(),['count','hash']);assert.ok(Number.isSafeInteger(x.count)&&x.count>=0);assert.match(x.hash,/^[a-f0-9]{64}$/);}
 }
 for(const f of ['priorFingerprint','objectFingerprint','dataFingerprint','counts'])assert.deepEqual(durable[f],installed[f],'ADOPTED_CONSUMERS_NOT_DURABLE: '+f);
 return {passed:true,sourceCommit,nominalRowsReturned:0,businessOperations:0,priorStatePreserved:true};
}
