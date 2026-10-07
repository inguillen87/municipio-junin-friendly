// Upgrade the exact published SQL130 baseline in ONE transaction. The older
// standalone installers retain their original prerequisites and guards.
import assert from 'node:assert/strict';
import {buildAdoptedOwnNoveltyInstallation} from './adopted-own-novelties-installation.mjs';
import {adoptedConsumersConditional as conditional} from './adopted-consumers-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'PUBLISHED_ADOPTION_ANCHOR_CHANGED');return s.replace(a,()=>b);};
const prefix='municontrol_published_adoption.';
export function publishedAdoptionAtomicConditional(statements,condition){
 assert.ok(statements.every(s=>!s.includes('$published_adoption$')));
 // Nested DO statements already use $conditional$. Their text must not close
 // the enclosing SQL dollar literal, even when enclosed in EXECUTE quotes.
 return conditional(statements,condition).replace(/^DO \$conditional\$/,'DO $published_adoption$').replace(/\$conditional\$$/,'$published_adoption$');
}

// One transaction still covers every stage. Give each existing preservation
// scan its own statement deadline instead of accumulating all scans in one DO.
export function publishedAdoptionCachedRows(sql){
 if(!sql.startsWith('DO $snapshot$'))return sql;
 const start=sql.indexOf('  EXECUTE format('),end=sql.indexOf(' INTO n,h;',start)+' INTO n,h;'.length;
 assert.ok(start>0&&end>start,'PUBLISHED_ADOPTION_ROW_SCAN_CHANGED');
 const scan=sql.slice(start,end);assert.ok(scan.includes('FROM %I.%I r) hashed'));
 // The outer snapshots freshly hash ALL prior rows before and after the entire
 // transaction. Inner stages reuse those row facts, while still independently
 // reading all metadata, sequences, roles, ACLs and triggers at each boundary.
 // New tables are absent from the outer cache and receive the original scan.
 const cached=`  SELECT (value->>'rows')::bigint,value->>'rowsSha256' INTO n,h
  FROM jsonb_array_elements(current_setting('municontrol_published_adoption.before')::jsonb->'tables') WHERE (value->>'oid')::oid=c.oid;
  IF NOT FOUND THEN\n${scan}\n  END IF;`;
 return once(sql,scan,cached);
}
export function publishedAdoptionStages({consumerStatements,baseFirst,baseUpgrade,baseStatements,baseVerification,operatorStatements,upgrades}){
 const consumers=consumerStatements.flatMap(s=>s===baseFirst
  ?baseStatements.slice(0,-1).map(v=>conditional([publishedAdoptionCachedRows(v)],"current_setting('municontrol_adopted_consumers_install.mode')='first'"))
  :s===baseUpgrade?baseVerification.slice(0,4).map(v=>conditional([publishedAdoptionCachedRows(v)],"current_setting('municontrol_adopted_consumers_install.mode')='upgrade'")):[publishedAdoptionCachedRows(s)]);
 return [...consumers,...operatorStatements.map(publishedAdoptionCachedRows),...upgrades];
}

export function buildPublishedNoveltyAdoptionInstallation(options){
 const bulk=buildAdoptedOwnNoveltyInstallation(options),originalOperator=bulk.operator,c=originalOperator.consumers,n=bulk.novelty;
 const former=c.beforePins.find(p=>p.name==='own_run_capture_v1');
 assert.deepEqual({...former,sha256:null},{...n.consumerPin,sha256:null});
 assert.notEqual(former.sha256,n.consumerPin.sha256);
 const bootstrap=n.newPins.find(p=>p.name==='own_novelty_bootstrap_v1');
 const upgradedBootstrap=bulk.newPins.find(p=>p.name===bootstrap.name);
 assert.deepEqual({...bootstrap,sha256:null},{...upgradedBootstrap,sha256:null});
 const beforePins=c.beforePins.map(p=>p.name===former.name?n.consumerPin:p);
 const initialChecks=[pinsCheck(beforePins,'PUBLISHED_ADOPTION_BEFORE_METADATA'),n.afterPins,bulk.runtimeObjects];
 const consumerInitial=conditional([initialChecks[0],c.initialCheckStatements[1]],"current_setting('municontrol_adopted_consumers_install.mode') IN('first','upgrade')");
 // The reviewed SQL140 substitutions also apply to SQL130. Bind its internal
 // check to that exact published body; retain every substitution count and
 // metadata/ACL check. The result is pinned to the composed bulk capture.
 const consumerMigration=c.migration.map(s=>s.includes('OWN_RUN_ADOPTION_DEFINITION_CHANGED')?once(s,former.sha256,n.consumerPin.sha256):s);
 const consumerFirst=conditional(consumerMigration,"current_setting('municontrol_adopted_consumers_install.mode') IN('first','upgrade')");
 const previousCapture=c.afterPins.find(p=>p.name===former.name);
 const mapCapture=s=>s.includes(previousCapture.sha256)?once(s,previousCapture.sha256,bulk.capturePin.sha256):s;
 const consumerPost=c.postChecks.map(mapCapture);
 const consumerStatements=c.statements.slice(0,-1).map(s=>s===c.initialChecks?consumerInitial:s===c.first?consumerFirst:c.postChecks.includes(s)?consumerPost[c.postChecks.indexOf(s)]:s);
 const consumers={...c,initialChecks:consumerInitial,initialCheckStatements:[initialChecks[0],c.initialCheckStatements[1]],migration:consumerMigration,first:consumerFirst,postChecks:consumerPost,statements:[...consumerStatements,c.proof]};
 const definitions=originalOperator.definitions.map((s,i)=>i?s:s.slice(0,s.indexOf(' BEGIN '))+' BEGIN '+consumerPost.map(s=>'EXECUTE '+q(s)+';').join('\n')+' END $operator$');
 const operatorPins=originalOperator.pins.map((p,i)=>i?p:{...ownInstallationFunctionPin(definitions[0]),runtime:false});
 const operatorMigration=[...definitions,...originalOperator.migration.slice(definitions.length)];
 const operatorFirst=conditional(operatorMigration,"current_setting('municontrol_operator_install.mode')='first'");
 const operatorPost=pinsCheck(operatorPins,'MUNICIPAL_ADOPTION_FUNCTION_METADATA');
 const operatorStatements=originalOperator.statements.slice(0,-1).map(s=>s===originalOperator.first?operatorFirst:s===originalOperator.post?operatorPost:c.postChecks.includes(s)?consumerPost[c.postChecks.indexOf(s)]:s);
 const operator={...originalOperator,consumers,definitions,pins:operatorPins,migration:operatorMigration,first:operatorFirst,post:operatorPost,statements:[...operatorStatements,originalOperator.proof]};
 // SQL130's table, rows, sixteen functions, grants and triggers already exist.
 // Preserve them. Only bootstrap, capture and operator readiness change bodies.
 const upgrades=[bulk.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_novelty_bootstrap_v1(')).replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '),
  ...bulk.migration.filter(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.'))];
 assert.equal(upgrades.length,3);
 const operatorCondition="s.nspname='public' AND p.proname LIKE 'municipal_adoption_%'";
 const snapshot=slot=>{
  let sql=slot==='before'?c.before:c.after;
  sql=once(sql,"CASE WHEN p.oid IN(","CASE WHEN p.oid IN(to_regprocedure('public.own_novelty_bootstrap_v1(jsonb)'),");
  sql=once(sql,"OR p.proname='payroll_fixed_registry_adopted_subject_v1')))","OR p.proname='payroll_fixed_registry_adopted_subject_v1')) OR ("+operatorCondition+"))");
  return sql.replaceAll('municontrol_adopted_consumers_install.',prefix);
 };
 const before=snapshot('before'),after=snapshot('after');
 const audit=c.priorAudit.replaceAll('municontrol_adopted_consumers_install.',prefix).replaceAll('ADOPTED_CONSUMERS_','PUBLISHED_ADOPTION_');
 const state=`DO $state$ DECLARE a integer;h integer;o integer;t integer;BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'PUBLISHED_ADOPTION_ISOLATION_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(130);PERFORM pg_advisory_xact_lock(132136);PERFORM pg_advisory_xact_lock(132142);PERFORM pg_advisory_xact_lock(132143);
 SELECT count(*) INTO a FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND(p.proname LIKE 'employment_adoption_%' OR p.proname IN('native_employee_read_projection_v1','native_employee_directory_snapshot_v1') OR p.proname LIKE 'native_employment_lifecycle_%_v2');
 SELECT count(*) INTO h FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND(p.proname LIKE 'payroll_fixed_registry_%_v2' OR p.proname='payroll_fixed_registry_adopted_subject_v1');
 SELECT count(*) INTO o FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${operatorCondition};
 SELECT count(*) INTO t FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN('employment_adoption_proposal','employment_adoption_seal','employment_adoption_decision','employment_adoption_application');
 IF a=0 AND h=0 AND o=0 AND t=0 THEN PERFORM set_config('${prefix}mode','first',true);
 ELSIF a=47 AND h=5 AND o=5 AND t=4 THEN PERFORM set_config('${prefix}mode','repeat',true);
 ELSE RAISE EXCEPTION 'PUBLISHED_ADOPTION_PARTIAL_STATE';END IF;END $state$`;
 const finalChecks=[...bulk.consumerChecks,pinsCheck(bulk.finalPins,'PUBLISHED_ADOPTION_AFTER_METADATA'),bulk.runtimeObjects,c.verification.at(-4)];
 const initial=`current_setting('${prefix}mode')='first'`;
 const stages=publishedAdoptionStages({consumerStatements,baseFirst:c.baseFirst,baseUpgrade:c.baseUpgrade,baseStatements:c.base.statements,baseVerification:c.base.verification,operatorStatements,upgrades});
 const apply=stages.map(s=>publishedAdoptionAtomicConditional([s],initial));
 const check=conditional(initialChecks,initial);
 const preflightChecks=[...initialChecks,pinsCheck(c.base.priorPins,'PUBLISHED_ADOPTION_PREREQUISITE_METADATA'),c.base.guardBeforeCheck,c.initialCheckStatements[1]];
 const preflight=[state,conditional(preflightChecks,initial),conditional(finalChecks,`NOT(${initial})`),"SELECT jsonb_build_object('allChecksPassed',true,'businessOperations',0,'nominalRowsReturned',0) AS proof"];
 const dataProof=c.dataProof.replaceAll('municontrol_adopted_consumers_install.',prefix);
 const fingerprint=`encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')`;
 const sourceHashes={...bulk.sourceHashes};
 const functionCondition="s.nspname='public' AND(p.proname LIKE 'employment_adoption_%' OR p.proname IN('native_employee_read_projection_v1','native_employee_directory_snapshot_v1') OR p.proname LIKE 'native_employment_lifecycle_%_v2' OR p.proname LIKE 'payroll_fixed_registry_%_v2' OR p.proname='payroll_fixed_registry_adopted_subject_v1' OR p.proname LIKE 'municipal_adoption_%' OR p.proname LIKE 'own_novelty_%' OR p.oid IN("+[c.base.guardAfter,...c.afterPins].map(p=>'to_regprocedure('+q(p.signature)+')').join(',')+"))";
 const tables="(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN('employment_adoption_proposal','employment_adoption_seal','employment_adoption_decision','employment_adoption_application'))";
 const objects=`jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${functionCondition}),'adoptionTables',(${c.base.tableShapeSql}),'tableObjects',jsonb_build_object('tables',(SELECT jsonb_agg(to_jsonb(t) ORDER BY oid) FROM pg_class t WHERE oid IN ${tables}),'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY attrelid,attnum) FROM pg_attribute a WHERE attrelid IN ${tables}),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY oid) FROM pg_constraint k WHERE conrelid IN ${tables}),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY indexrelid) FROM pg_index i WHERE indrelid IN ${tables}),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY oid) FROM pg_trigger t WHERE tgrelid IN ${tables})),'monthlyColumn',(SELECT to_jsonb(a) FROM pg_attribute a WHERE a.attrelid='public.payroll_novelty_row'::regclass AND a.attname='legajo_snapshot'),'monthlyConstraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.conname COLLATE "C") FROM pg_constraint k WHERE k.conrelid='public.payroll_novelty_row'::regclass AND k.conname IN('payroll_novelty_row_legajo_ck','payroll_novelty_row_legajo_snapshot_not_null')))`;
 const proof=`SELECT jsonb_build_object('version','published-novelty-adoption-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'allChecksPassed',true,'newTables',4,'newFunctions',57,'adaptedFunctions',21,'roleAssignmentsAdded',0,'businessOperations',0,'nominalRowsReturned',0,'priorFingerprint',${fingerprint},'objectsFingerprint',encode(public.digest((${objects})::text,'sha256'),'hex'),'dataFingerprint',encode(public.digest(current_setting('${prefix}data')::jsonb::text,'sha256'),'hex'),'counts',current_setting('${prefix}data')::jsonb) AS proof`;
 return {version:'published-novelty-adoption-installation.v1',sourceCommit:options.sourceCommit,connects:false,executesSql:false,sourceHashes,bulk,consumers,operator,beforePins,initialChecks,consumerStatements,upgrades,state,before,after,audit,stages,apply,check,preflightChecks,preflight,finalChecks,dataProof,proof,
  installation:[state,check,before,...apply,...finalChecks,after,audit,dataProof,proof],
  durableVerification:['SET TRANSACTION READ ONLY',state,...finalChecks,after,dataProof,proof]};
}
export function assertPublishedNoveltyAdoptionDurability({installed,durable,batch}){
 const fields=['version','sourceCommit','sourceHashes','allChecksPassed','newTables','newFunctions','adaptedFunctions','roleAssignmentsAdded','businessOperations','nominalRowsReturned','priorFingerprint','objectsFingerprint','dataFingerprint','counts'];
 for(const p of [installed,durable]){
  assert.deepEqual(Object.keys(p).sort(),fields.toSorted());
  for(const [k,v] of Object.entries({version:batch.version,sourceCommit:batch.sourceCommit,sourceHashes:batch.sourceHashes,allChecksPassed:true,newTables:4,newFunctions:57,adaptedFunctions:21,roleAssignmentsAdded:0,businessOperations:0,nominalRowsReturned:0}))assert.deepEqual(p[k],v);
  for(const f of ['priorFingerprint','objectsFingerprint','dataFingerprint'])assert.match(p[f],/^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(p.counts).sort(),['employment_adoption_application','employment_adoption_decision','employment_adoption_proposal','employment_adoption_seal']);
  for(const count of Object.values(p.counts)){assert.deepEqual(Object.keys(count).sort(),['count','hash']);assert.ok(Number.isSafeInteger(count.count)&&count.count>=0);assert.match(count.hash,/^[a-f0-9]{64}$/);}
 }
 assert.deepEqual(installed,durable,'PUBLISHED_ADOPTION_NOT_DURABLE');
 return {passed:true,priorRowsAndSecurityPreserved:true,independentDurabilityVerified:true,businessOperations:0,nominalRowsReturned:0};
}
