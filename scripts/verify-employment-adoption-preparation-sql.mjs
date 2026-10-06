import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {buildAdoptionReviewQa} from './verify-employment-adoption-review-sql.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {adoptionReviewJson} from '../assets/employment-adoption-review-model.js';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
export function adoptionQaOutputPath(value){
 assert.equal(typeof value,'string');const workspace=fs.realpathSync(new URL('../',import.meta.url)),root=fs.realpathSync(new URL('../verification/',import.meta.url)),within=path.relative(workspace,root);assert.ok(!within.startsWith('..')&&!path.isAbsolute(within));const file=path.resolve(value),parent=fs.realpathSync(path.dirname(file)),relative=path.relative(root,parent);
 assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.extname(file)==='.sql','QA output must stay within this worktree verification directory');assert.ok(!fs.existsSync(file),'QA output cannot replace another result');return file;
}
export function buildAdoptionPreparationQa(options){
 const base=buildAdoptionReviewQa(options),{schema,ids}=base,anchor='-- LIFECYCLE_ROSTER_QA_ANCHOR',statements=[];let checks=0;
 const relocation=sql=>sql.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(').replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp');
 const migration=fs.readFileSync(new URL('./migrations/132-employment-adoption-preparation.sql',import.meta.url),'utf8');
 const serializer=splitPostgresStatements(fs.readFileSync(new URL('./migrations/112-native-salary-definitions.sql',import.meta.url),'utf8')).find(s=>s.startsWith('CREATE FUNCTION public.native_salary_serialized_v1('));assert.ok(serializer);
 const check=(expression,label)=>{statements.push('PERFORM qa_assert(('+expression+'),'+q(label)+');checks:=checks+1;');checks++;};
 const reject=(expression,error,label)=>check('qa_rejects('+q('SELECT '+expression)+','+q(error)+')',label);
 const call=(body='adoption_body',key='adoption_key')=>'employment_adoption_propose_v1(maker,'+body+','+key+')';
 const rejectedBody=(change,code,label)=>{statements.push('invalid_body:='+change+';');check('qa_rejects(format('+q('SELECT employment_adoption_propose_v1(%1$L::jsonb,%2$L::jsonb,gen_random_uuid())')+',maker,invalid_body),'+q('EMPLOYMENT_ADOPTION_'+code)+')',label);};
 statements.push(`BEGIN
 EXECUTE ${q(relocation(serializer))};REVOKE ALL ON FUNCTION native_salary_serialized_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
 EXECUTE ${q(relocation(migration))};
 original_contracts:=(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY id)::text) FROM employment_contract c);original_persons:=(SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY id)::text) FROM person_identity i);
 raw_review:=employment_adoption_source_v1(maker);adoption_boot:=employment_adoption_bootstrap_v1(maker);
 context_version:=employment_adoption_hash_v1(jsonb_build_object('scope',raw_review->'scope','source',raw_review->'source'));
 SELECT jsonb_agg(jsonb_build_object('contractId',x.v->>'contractId','contractVersion',employment_adoption_hash_v1(jsonb_build_object('sourceContextVersion',context_version,'row',x.v))) ORDER BY x.n) INTO adoption_versions FROM jsonb_array_elements(raw_review->'rows') WITH ORDINALITY x(v,n);
 SELECT jsonb_agg(x.v||jsonb_build_object('jurisdictionCode',coalesce(raw_review#>>ARRAY['rows',(x.n-1)::text,'jurisdictionCode'],'42')) ORDER BY x.n) INTO declared_rows FROM jsonb_array_elements(adoption_versions) WITH ORDINALITY x(v,n);
 adoption_body:=jsonb_build_object('sourceContextVersion',context_version,'selectionVersion',employment_adoption_hash_v1(adoption_versions),'catalogVersion',adoption_boot->>'catalogVersion','rows',declared_rows,'legalReference','Resolución sintética QA 132','reason','Preparación completa sintética sin aplicar adopción');
 adoption_saved:=${call()};`);
 const parity={z:'Texto sintético ñ " con salto\n',a:1,array:[null,false,'001']},parityHash=createHash('sha256').update(adoptionReviewJson(parity)).digest('hex');
 check(`employment_adoption_hash_v1(${j(parity)})=${q(parityHash)}`,'SQL and browser canonical hashes agree without normalizing source strings');
 check(`(raw_review->>'total')::int>50 AND jsonb_array_length(raw_review->'rows')=(raw_review->>'total')::int`,'source spans several UI pages without partial selection');
 check(`adoption_saved#>>'{receipt,status}'='pending' AND (adoption_saved#>>'{receipt,total}')::int=jsonb_array_length(declared_rows)`,'one receipt preserves every declared contract');
 check(`adoption_saved#>>'{receipt,effects,contractsAdopted}'='0' AND adoption_saved#>>'{receipt,effects,payrollCalculated}'='false' AND adoption_saved->>'applicationAvailable'='false'`,'preparation never claims an adoption, salary or application effect');
 check(`original_contracts=(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY id)::text) FROM employment_contract c) AND original_persons=(SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY id)::text) FROM person_identity i)`,'canonical contract/person facts remain byte-equivalent through proposal persistence');
 check(`(SELECT count(*) FROM employment_adoption_proposal)=1 AND (SELECT body=adoption_body AND before_snapshot=raw_review AND total=jsonb_array_length(declared_rows) FROM employment_adoption_proposal)`,'exact body and complete before snapshot persist atomically');
 statements.push(`adoption_replayed:=${call()};`);
 check(`(adoption_replayed-'receipt')=(adoption_saved-'receipt') AND ((adoption_replayed->'receipt')-'replayed')=((adoption_saved->'receipt')-'replayed') AND adoption_replayed#>>'{receipt,replayed}'='true' AND(SELECT count(*) FROM employment_adoption_proposal)=1`,'same-key replay preserves original receipt and stores no duplicate');
 statements.push(`adoption_replayed:=employment_adoption_attempt_v1(maker,adoption_key);`);
 check(`adoption_replayed=adoption_saved||jsonb_build_object('receipt',(adoption_saved->'receipt')||jsonb_build_object('replayed',true))`,'GET recovery identifies the immutable same actor and same attempt');
 check(`qa_rejects(format(${q('SELECT employment_adoption_attempt_v1(%1$L::jsonb,%2$L::uuid)')},checker,adoption_key),'EMPLOYMENT_ADOPTION_NOT_FOUND')`,'another authorized reader cannot recover the preparer attempt');
 statements.push(`invalid_body:=adoption_body||jsonb_build_object('reason','Otro contenido sintético para la misma clave');`);
 check(`qa_rejects(format(${q('SELECT employment_adoption_propose_v1(%1$L::jsonb,%2$L::jsonb,%3$L::uuid)')},maker,invalid_body,adoption_key),'EMPLOYMENT_ADOPTION_IDEMPOTENCY_REUSE')`,'same key and changed body cannot activate another write');
 rejectedBody(`adoption_body||jsonb_build_object('rows',(adoption_body->'rows')-0)`,'SELECTION_CHANGED','first omitted row rejects the complete proposal');
 rejectedBody(`jsonb_set(adoption_body,'{rows,0,contractVersion}',to_jsonb(repeat('f',64)))`,'SELECTION_CHANGED','changed contract version rejects every row');
 rejectedBody(`adoption_body||jsonb_build_object('sourceContextVersion',repeat('f',64))`,'SOURCE_CHANGED','changed source context rejects every row');
 rejectedBody(`adoption_body||jsonb_build_object('catalogVersion',repeat('f',64))`,'CATALOG_CHANGED','changed catalog cannot produce a stale declaration');
 rejectedBody(`jsonb_set(adoption_body,'{rows,0,jurisdictionCode}','"101"')`,'INPUT_INVALID','company number is never inferred as a jurisdiction');
 rejectedBody(`jsonb_set(adoption_body,'{rows,0,dni}','"99999990"')`,'INPUT_INVALID','caller cannot inject identity fields into proposal rows');
 rejectedBody(`jsonb_set(adoption_body,'{rows,1}',adoption_body#>'{rows,0}')`,'INPUT_INVALID','duplicate contract rejects the whole group');
 rejectedBody(`jsonb_set(adoption_body,'{rows,0}','null')`,'INPUT_INVALID','nonobject row fails a closed SQL shape');
 rejectedBody(`adoption_body||jsonb_build_object('rows',(SELECT jsonb_agg(adoption_body#>'{rows,0}') FROM generate_series(1,10001)))`,'LIMIT','capacity is one global refusal, without silently dividing the selection');
 statements.push(`BEGIN
 UPDATE person_identity SET full_name='NOMBRE SINTÉTICO CAMBIADO' WHERE id=(SELECT person_id FROM employment_contract WHERE id=${q(ids.targetContract)}::uuid);`);
 check(`qa_rejects(format(${q('SELECT employment_adoption_propose_v1(%1$L::jsonb,%2$L::jsonb,gen_random_uuid())')},maker,adoption_body),'EMPLOYMENT_ADOPTION_SELECTION_CHANGED')`,'fresh contract/person change is caught inside the guarded transaction');
 statements.push(`RAISE EXCEPTION USING ERRCODE='P1322';EXCEPTION WHEN SQLSTATE 'P1322' THEN NULL;END;`);
 const stale={...base.qaFoundation.actors.maker,actorSessionVersion:999999};reject(`employment_adoption_propose_v1(${j(stale)},'{}',gen_random_uuid())`,'ACTION_SESSION_INVALID','stale authority refuses access before proposal fields are considered');
 statements.push(`BEGIN DELETE FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key='employee.record.propose';`);
 check(`qa_rejects(format(${q('SELECT employment_adoption_propose_v1(%1$L::jsonb,%2$L::jsonb,gen_random_uuid())')},maker,adoption_body),'NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN')`,'revoked existing preparation permission causes no proposal write');
 check(`employment_adoption_attempt_v1(maker,adoption_key)#>>'{receipt,status}'='pending'`,'a read-authorized actor can recover a prior receipt after preparation permission is withdrawn');
 statements.push(`RAISE EXCEPTION USING ERRCODE='P1323';EXCEPTION WHEN SQLSTATE 'P1323' THEN NULL;END;`);
 reject('employment_adoption_bootstrap_v1('+j(stale)+')','ACTION_SESSION_INVALID','bootstrap rejects a stale session instead of exposing nominal rows');
 check(`NOT has_table_privilege('municontrol_actions_runtime_app','employment_adoption_proposal','SELECT') AND NOT has_table_privilege('municontrol_actions_runtime_app','employment_adoption_proposal','INSERT') AND(SELECT relrowsecurity FROM pg_class WHERE oid='employment_adoption_proposal'::regclass)`,'RLS and owner-only table access remain in force');
 check(`(SELECT count(*) FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND proname LIKE 'employment_adoption_%' AND has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'))=3 AND NOT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname LIKE 'employment_adoption_%' AND a.grantee=0)`,'only three authenticated facades are callable; private helpers are not public');
 check(`qa_rejects('UPDATE employment_adoption_proposal SET total=1','EMPLOYMENT_ADOPTION_IMMUTABLE') AND qa_rejects('DELETE FROM employment_adoption_proposal','EMPLOYMENT_ADOPTION_IMMUTABLE') AND qa_rejects('TRUNCATE employment_adoption_proposal','EMPLOYMENT_ADOPTION_IMMUTABLE')`,'prepared facts and decisions cannot be overwritten, deleted or truncated');
 statements.push(`adoption_boot:=employment_adoption_bootstrap_v1(maker);`);
 check(`jsonb_array_length(adoption_boot->'attempts')=1 AND adoption_boot#>>'{attempts,0,requestKey}'=adoption_key::text`,'bootstrap recovers the complete own attempt inventory after reload');
 statements.push(`BEGIN INSERT INTO employment_adoption_proposal SELECT v.* FROM generate_series(1,499) g(n) CROSS JOIN LATERAL jsonb_populate_record(NULL::employment_adoption_proposal,(SELECT to_jsonb(r) FROM employment_adoption_proposal r LIMIT 1)||jsonb_build_object('id',gen_random_uuid(),'request_key',gen_random_uuid(),'created_at',clock_timestamp()+g.n*interval '0 milliseconds')) v;`);
 check(`qa_rejects(format(${q('SELECT employment_adoption_propose_v1(%1$L::jsonb,%2$L::jsonb,gen_random_uuid())')},maker,adoption_body),'EMPLOYMENT_ADOPTION_LIMIT')`,'full proposal capacity never permits an additional partial or duplicate write');
 statements.push(`RAISE EXCEPTION USING ERRCODE='P1324';EXCEPTION WHEN SQLSTATE 'P1324' THEN NULL;END;RAISE EXCEPTION USING ERRCODE='P1321';EXCEPTION WHEN SQLSTATE 'P1321' THEN NULL;END;`);
 check(`to_regclass('employment_adoption_proposal') IS NULL`,'new SQL and synthetic proposal data roll back before unchanged existing regressions');
 const report={...base.report,checksPassed:base.report.checksPassed+checks,adoptionPreparationChecksPassed:checks,limitations:[...base.report.limitations,'132 stores preparation only with local synthetic contracts. No application, final-backup adoption, installation/rerun protocol, consumer adaptations, municipal acceptance or concurrent proposal connections are verified.']};
 let sql=base.sql.replace(anchor,()=>`DECLARE adoption_i integer;raw_review jsonb;adoption_boot jsonb;context_version text;adoption_versions jsonb;declared_rows jsonb;adoption_body jsonb;invalid_body jsonb;adoption_saved jsonb;adoption_replayed jsonb;adoption_key uuid:=gen_random_uuid();original_contracts text;original_persons text;BEGIN
 ${statements.join('\n')}
 END;
 `+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));
 // Seed the synthetic source before the original immutable-baseline guard is
 // installed. Never disable or alter that guard to fabricate later GRH rows.
 const seedAnchor='INSERT INTO employment_status_snapshot SELECT id';assert.equal(sql.split(seedAnchor).length,2);
 sql=sql.replace(seedAnchor,()=>`INSERT INTO employment_contract SELECT v.* FROM generate_series(1,57) g(n) CROSS JOIN LATERAL jsonb_populate_record(NULL::employment_contract,(SELECT to_jsonb(c) FROM employment_contract c WHERE id=${q(ids.targetContract)}::uuid)||jsonb_build_object('id',gen_random_uuid(),'legacy_legajo',(3500+g.n)::text)) v;
 `+seedAnchor);
 return {...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const a of process.argv.slice(2)){const m=/^--(expected-major|write-sql)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}const file=adoptionQaOutputPath(args['write-sql']),qa=buildAdoptionPreparationQa({serverMajor:Number(args['expected-major'])});fs.writeFileSync(file,qa.sql,{flag:'wx'});console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,adoptionPreparationChecksPlanned:qa.report.adoptionPreparationChecksPassed}));
}
