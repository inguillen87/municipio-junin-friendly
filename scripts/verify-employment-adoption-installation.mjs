// Committed synthetic schema in the two EXISTING loopback QA databases only.
// Never creates a database, role, runtime grant or external connection.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {buildAdoptionReviewQa} from './verify-employment-adoption-review-sql.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {ADOPTION_INSTALL_FILES,ADOPTION_INSTALL_TABLES,adoptionTableShapeSql,buildEmploymentAdoptionInstallation,assertEmploymentAdoptionDurability,firstAdoptionInstallationStatement} from './lib/employment-adoption-installation.mjs';
import {preservationSnapshot} from './lib/native-leave-installation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n?/g,'\n'),q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Fixture anchor drift');return s.replace(a,()=>b);};

export function adoptionInstallationQaFoundation(major){
 assert.ok([17,18].includes(major));const base=buildAdoptionReviewQa({serverMajor:major}),{schema,ids}=base;
 const relocate=sql=>sql.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
 .replaceAll("s.nspname='public'","s.nspname="+q(schema))
 .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
 .replaceAll("ARRAY['search_path=public, pg_temp']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']")
 .replaceAll("ARRAY['search_path=pg_catalog, public, pg_temp']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']")
 .replaceAll("'search_path=public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'))
 .replaceAll("'search_path=pg_catalog, public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'))
 .replaceAll('"search_path=pg_catalog, public, pg_temp"','"search_path=pg_catalog, '+schema+', public, pg_temp"')
 .replaceAll('"search_path=public, pg_temp"','"search_path=pg_catalog, '+schema+', public, pg_temp"')
 .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp');
 const normalized=sql=>relocate(sql).replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')")
 .replaceAll("replace(prosrc,E'\\r\\n',E'\\n')","replace(replace(prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')")
 .replace("md5(replace((SELECT prosrc","md5(replace(replace((SELECT prosrc")
 .replace("E'\\r\\n',E'\\n'))<>","E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.'))<>")
 .replace("(shapes->(item->>'name'))::text",()=>`replace((shapes->(item->>'name'))::text,${q(schema)},'public')`);
 const definition=(file,name)=>{const s=splitPostgresStatements(read('scripts/migrations/'+file)).find(s=>new RegExp('CREATE (?:OR REPLACE )?FUNCTION (?:public\\.)?'+name+'\\(').test(s));assert.ok(s,name);return s;};
 const defaults=`tenant_id uuid DEFAULT ${q(ids.tenant)}::uuid,source_binding_id uuid DEFAULT ${q(ids.binding)}::uuid,baseline_batch_id uuid DEFAULT ${q(ids.sourceBatch)}::uuid,source_sha256 text DEFAULT repeat('a',64),manifest_sha256 text DEFAULT repeat('b',64),source_cutoff timestamp DEFAULT timestamp '2026-09-10 15:17:30'`;
 let setup=base.qaFoundation.setup;
 setup=once(setup,'CREATE TABLE grh_effective_source_binding(id integer);',`CREATE TABLE grh_effective_source_binding(id integer,tenant_id uuid DEFAULT ${q(ids.tenant)}::uuid,source_binding_id uuid DEFAULT ${q(ids.binding)}::uuid,import_run_id bigint DEFAULT 1,publication_sha256 text DEFAULT repeat('d',64),source_version_id uuid,baseline_batch_id uuid,source_batch_id uuid);`);
 setup=once(setup,'CREATE TABLE grh_curated_source_version(id integer);',`CREATE TABLE grh_curated_source_version(id uuid DEFAULT gen_random_uuid(),core_version_id uuid,tenant_id uuid DEFAULT ${q(ids.tenant)}::uuid,source_binding_id uuid DEFAULT ${q(ids.binding)}::uuid,source_batch_id uuid,import_run_id bigint DEFAULT 1,baseline_batch_id uuid DEFAULT ${q(ids.sourceBatch)}::uuid,manifest_sha256 text DEFAULT repeat('c',64));`);
 const destinationPin=base.qaFoundation.pins.replaceAll("current_database()<>'fixed_novelties_qa'",`current_database()<>${q(major===17?'fixed_novelties_qa':'own_payroll_run_qa')}`);
 const seed=`BEGIN; SET LOCAL statement_timeout='180s'; SET LOCAL lock_timeout='2s'; DO $seed$ BEGIN
 ${destinationPin}
 IF to_regnamespace(${q(schema)}) IS NOT NULL THEN RAISE EXCEPTION 'ADOPTION_INSTALL_QA_SCHEMA_EXISTS';END IF;
 ${setup}
 ALTER TABLE employment_contract ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT clock_timestamp(),ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),ADD COLUMN IF NOT EXISTS data_quality_score numeric(5,2);
 ${relocate(definition('101-native-monthly-novelties.sql','payroll_novelty_subject_v2'))};
 ${relocate(definition('101-native-monthly-novelties.sql','payroll_novelty_native_subject_v2'))};
 ${relocate(definition('102-native-family-schooling.sql','employee_family_subject_v2'))};
 INSERT INTO capabilities VALUES(${q(ids.maker)},'employee.record.propose'),(${q(ids.checker)},'employee.record.approve');
 EXECUTE ${q(normalized(read('scripts/migrations/104-native-employment-changes.sql')))};
 CREATE TABLE grh_core_source_version(id uuid PRIMARY KEY,source_company_id bigint NOT NULL,${defaults});
 INSERT INTO grh_core_source_version(id,source_company_id) VALUES(${q(ids.sourceBatch)},101);
 INSERT INTO grh_effective_source_binding(id,source_version_id,baseline_batch_id,source_batch_id) VALUES(104,${q(ids.sourceBatch)},${q(ids.sourceBatch)},${q(ids.sourceBatch)});
 INSERT INTO grh_curated_source_version(core_version_id,source_batch_id) VALUES(${q(ids.sourceBatch)},${q(ids.sourceBatch)});
 ${relocate(definition('096-grh-effective-source.sql','grh_effective_baseline_guard_v1'))};
 REVOKE ALL ON FUNCTION grh_effective_baseline_guard_v1() FROM PUBLIC,municontrol_actions_runtime_app;
 CREATE TRIGGER grh_effective_baseline_rows BEFORE INSERT OR UPDATE OR DELETE ON employment_contract FOR EACH ROW EXECUTE FUNCTION grh_effective_baseline_guard_v1();
 CREATE TRIGGER grh_effective_baseline_truncate BEFORE TRUNCATE ON employment_contract FOR EACH STATEMENT EXECUTE FUNCTION grh_effective_baseline_guard_v1();
 EXECUTE ${q(normalized(read('scripts/migrations/104-native-employment-changes.sql')))};
 CREATE TABLE employee_family_member(id uuid PRIMARY KEY,contract_id uuid,employee_person_id uuid,tenant_id uuid,source_binding_id uuid,native_registration_id uuid,family_name text,birth_date date,valid_to date,identity_token text,identity_snapshot jsonb,valid_from date,recorded_at timestamptz,contract_identity_token text);
 ${relocate(definition('102-native-family-schooling.sql','school_certificate_native_family_v5'))};
 REVOKE ALL ON FUNCTION school_certificate_native_family_v5(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
 EXECUTE ${q(normalized(read('scripts/migrations/110-native-employment-lifecycle.sql')))};
 ${relocate(definition('112-native-salary-definitions.sql','native_salary_serialized_v1'))};
 REVOKE ALL ON FUNCTION native_salary_serialized_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
 END $seed$;COMMIT;`;
 const guard=`DO $local$ BEGIN ${destinationPin} IF to_regnamespace(${q(schema)}) IS NULL THEN RAISE EXCEPTION 'ADOPTION_INSTALL_QA_SCHEMA_MISSING';END IF;END $local$`;
 const transaction=(statements,{readOnly=false,rollback=false}={})=>`BEGIN ISOLATION LEVEL REPEATABLE READ ${readOnly?'READ ONLY':''};SET LOCAL timezone='UTC';SET LOCAL statement_timeout='180s';SET LOCAL lock_timeout='2s';SET LOCAL search_path=pg_catalog,${schema},public,pg_temp;${guard};SELECT pg_backend_pid() AS qa_pid;\n${statements.join(';\n')};\n${rollback?'ROLLBACK':'COMMIT'};`;
 const shapeSql=normalized(adoptionTableShapeSql());
 const calibration=transaction([`DO $calibration$ BEGIN ${ADOPTION_INSTALL_FILES.map(f=>'EXECUTE '+q(normalized(read('scripts/migrations/'+f)))+';').join('\n')} END $calibration$`,
 `SELECT jsonb_build_object('shape',(${shapeSql}),'pins',(SELECT jsonb_object_agg(key,encode(public.digest(replace(value::text,${q(schema)},'public'),'sha256'),'hex')) FROM jsonb_each((${shapeSql}))))`],{rollback:true});
 const history=`DO $history$ DECLARE maker jsonb:=${j(base.qaFoundation.actors.maker)};checker jsonb:=${j(base.qaFoundation.actors.checker)};raw jsonb;boot jsonb;cv text;versions jsonb;rows jsonb;body jsonb;saved jsonb;stage jsonb;result jsonb;BEGIN
 raw:=employment_adoption_source_v1(maker);boot:=employment_adoption_bootstrap_v1(maker);cv:=employment_adoption_hash_v1(jsonb_build_object('scope',raw->'scope','source',raw->'source'));
 SELECT jsonb_agg(jsonb_build_object('contractId',x.v->>'contractId','contractVersion',employment_adoption_hash_v1(jsonb_build_object('sourceContextVersion',cv,'row',x.v))) ORDER BY x.n) INTO versions FROM jsonb_array_elements(raw->'rows') WITH ORDINALITY x(v,n);
 SELECT jsonb_agg(x.v||jsonb_build_object('jurisdictionCode',coalesce(raw#>>ARRAY['rows',(x.n-1)::text,'jurisdictionCode'],'42')) ORDER BY x.n) INTO rows FROM jsonb_array_elements(versions) WITH ORDINALITY x(v,n);
 body:=jsonb_build_object('sourceContextVersion',cv,'selectionVersion',employment_adoption_hash_v1(versions),'catalogVersion',boot->>'catalogVersion','rows',rows,'legalReference','Resolución sintética QA durable','reason','Preservar el lote y su comprobante entre conexiones');
 saved:=employment_adoption_propose_v1(maker,body,gen_random_uuid());stage:=employment_adoption_decision_source_v1(checker,(saved#>>'{receipt,proposalId}')::uuid);
 result:=employment_adoption_decide_v1(checker,jsonb_build_object('reviewVersion',stage->>'reviewVersion','review',jsonb_build_object('proposalId',saved#>>'{receipt,proposalId}','proposalVersion',saved#>>'{receipt,proposalVersion}','sourceContextVersion',cv,'catalogVersion',boot->>'catalogVersion','decision','approve','reason','Revisión independiente sintética antes de repetir instalación')),gen_random_uuid());
 IF result->>'status'<>'approved' OR (result#>>'{effects,contractsAdopted}')::integer<>jsonb_array_length(rows) OR jsonb_array_length(rows)<3 THEN RAISE EXCEPTION 'ADOPTION_INSTALL_QA_HISTORY_NOT_SAVED';END IF;
 END $history$`;
 return {schema,ids,actors:base.qaFoundation.actors,destinationPin,seed,guard,transaction,normalized,calibration,history,cleanup:`BEGIN;${guard};DROP SCHEMA ${schema} CASCADE;COMMIT;`};
}

export function runAdoptionInstallationQa({major,psql,output,sourceCommit,calibrate=false}){
 const binary=fs.realpathSync(psql),expected=path.join(root,'verification','postgresql-qa-20261004','pg'+major,'pgsql','bin','psql.exe');assert.equal(binary.toLowerCase(),fs.realpathSync(expected).toLowerCase());
 const destination=path.resolve(output);assert.ok(destination.startsWith(path.join(root,'verification')+path.sep));fs.mkdirSync(destination,{recursive:false});
 const foundation=adoptionInstallationQaFoundation(major),database=major===17?'fixed_novelties_qa':'own_payroll_run_qa',port=major===17?55417:55418;let step=0;
 const childEnv={...process.env};for(const key of Object.keys(childEnv))if(/^PG/i.test(key))delete childEnv[key];
 const run=(sql,expectedError)=>{const name=String(++step).padStart(2,'0'),file=path.join(destination,name+'.sql');fs.writeFileSync(file,sql,{flag:'wx'});const r=spawnSync(binary,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',database,'-f',file],{encoding:'utf8',maxBuffer:8*1024*1024,env:childEnv});fs.writeFileSync(path.join(destination,name+'.log'),r.stdout+'\n'+r.stderr);if(expectedError){assert.equal(r.status,3,'Expected SQL rejection at step '+name);assert.ok(r.stderr.includes('ERROR:  '+expectedError),'Unexpected SQL rejection: '+r.stderr.slice(-1600));return;}assert.equal(r.status,0,'QA SQL step '+name+' failed: '+r.stderr.slice(-1800));return r.stdout.trim().split(/\r?\n/).filter(Boolean);};
 // Whole database before/after: schema, tables, rows, sequences, ACLs, IAM,
 // membership and functions. No nominal row is printed or stored outside SQL.
 const databaseProof=()=>{const s=preservationSnapshot('after');return JSON.parse(run(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL timezone='UTC';SET LOCAL statement_timeout='180s';DO $local$ BEGIN ${foundation.destinationPin} END $local$;${s};SELECT jsonb_build_object('fingerprint',encode(public.digest(current_setting('municontrol_sql111.after')::jsonb::text,'sha256'),'hex'),'qaSchemas',(SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'mc_qa_%'));COMMIT;`).at(-1));};
 const priorDatabase=databaseProof();assert.equal(priorDatabase.qaSchemas,0);
 let seeded=false,result;
 try{
  run(foundation.seed);seeded=true;
  if(calibrate){result={calibrationOnly:true,major,shape:JSON.parse(run(foundation.calibration).at(-1))};}
  else{
   const batch=buildEmploymentAdoptionInstallation({read,sourceCommit});
   const relocated=s=>s===batch.first?foundation.normalized(firstAdoptionInstallationStatement(batch.migration.map(foundation.normalized),foundation.normalized(batch.guardBeforeCheck))):foundation.normalized(s);
   const execute=statements=>JSON.parse(run(foundation.transaction(statements.map(relocated))).at(-1));
   const beforeFailedInstall=databaseProof();
   run(foundation.transaction([...batch.statements.map(relocated),"DO $fault$ BEGIN RAISE EXCEPTION 'QA_FIRST_INSTALL_COMMIT_INTERRUPTED';END $fault$"]), 'QA_FIRST_INSTALL_COMMIT_INTERRUPTED');
   assert.deepEqual(databaseProof(),beforeFailedInstall,'Failed first transaction left rows, DDL or grants');
   const installed=execute(batch.statements),durable=JSON.parse(run(foundation.transaction(batch.verification.map(foundation.normalized),{readOnly:true})).at(-1));
   assertEmploymentAdoptionDurability({installed,durable,sourceCommit});
   const repeatedEmpty=execute(batch.statements);assert.equal(repeatedEmpty.mode,'repeat');assertEmploymentAdoptionDurability({installed:durable,durable:repeatedEmpty,sourceCommit});
   run(foundation.transaction([foundation.history]).replace('BEGIN ISOLATION LEVEL REPEATABLE READ','BEGIN ISOLATION LEVEL READ COMMITTED'));
   const stored=JSON.parse(run(foundation.transaction(batch.verification.map(foundation.normalized),{readOnly:true})).at(-1));
   assert.ok(stored.counts.employment_adoption_proposal.count>0);assert.ok(stored.counts.employment_adoption_application.count>=3);
   const repeated=execute(batch.statements),storedDurable=JSON.parse(run(foundation.transaction(batch.verification.map(foundation.normalized),{readOnly:true})).at(-1));assert.equal(repeated.mode,'repeat');assertEmploymentAdoptionDurability({installed:stored,durable:repeated,sourceCommit});assertEmploymentAdoptionDurability({installed:repeated,durable:storedDurable,sourceCommit});
   const failures=[
    ['ALTER TABLE employment_adoption_proposal ADD COLUMN unexpected text','ADOPTION_INSTALL_TABLE_METADATA'],
    ['GRANT SELECT ON employment_adoption_proposal TO municontrol_actions_runtime_app','ADOPTION_INSTALL_TABLE_METADATA'],
    ['GRANT EXECUTE ON FUNCTION employment_adoption_decide_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app','ADOPTION_INSTALL_FUNCTION_METADATA'],
    ['ALTER FUNCTION native_employment_lifecycle_adopted_date_v2(text) COST 101','ADOPTION_INSTALL_FUNCTION_METADATA'],
    ['ALTER FUNCTION native_employment_lifecycle_context_v1(jsonb,text) COST 101','ADOPTION_INSTALL_PREREQUISITE_METADATA'],
    ['ALTER FUNCTION native_employment_lifecycle_adopted_date_v2(text) RENAME TO missing_adopted_date','ADOPTION_INSTALL_PARTIAL_STATE'],
    ['CREATE FUNCTION '+foundation.schema+'.employment_adoption_unreviewed_fixture() RETURNS void LANGUAGE sql AS '+q('SELECT NULL::void'),'ADOPTION_INSTALL_PARTIAL_STATE'],
    ["DO $drift$ DECLARE d text;BEGIN SELECT pg_get_functiondef('grh_effective_baseline_guard_v1()'::regprocedure) INTO d;EXECUTE replace(d,'BEGIN','BEGIN /* drift fixture */');END $drift$",'ADOPTION_INSTALL_BASELINE_AFTER'],
   ];
   for(const [mutation,error] of failures){run(foundation.transaction([mutation,...batch.statements.map(relocated)],{rollback:true}),error);const restored=JSON.parse(run(foundation.transaction(batch.verification.map(foundation.normalized),{readOnly:true})).at(-1));assertEmploymentAdoptionDurability({installed:stored,durable:restored,sourceCommit});}
   result={major,installed,durable,repeatedEmpty,stored,repeated,storedDurable,expectedRejections:['QA_FIRST_INSTALL_COMMIT_INTERRUPTED',...failures.map(([,code])=>code)],atomicRollbackConserved:true,independentConnections:true,municipalWrites:false};
  }
 }finally{if(seeded)run(foundation.cleanup);const restoredDatabase=databaseProof();assert.deepEqual(restoredDatabase,priorDatabase,'Existing QA database was not conserved after cleanup');if(result)result.databaseConserved=true;}
 fs.writeFileSync(path.join(destination,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const a of process.argv.slice(2)){const m=/^--(major|psql|output|source-commit|calibrate)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
 const result=runAdoptionInstallationQa({major:Number(args.major),psql:args.psql,output:args.output,sourceCommit:args['source-commit'],calibrate:args.calibrate==='true'});console.log(JSON.stringify({passed:true,major:result.major,calibrationOnly:!!result.calibrationOnly,municipalWrites:false}));
}
