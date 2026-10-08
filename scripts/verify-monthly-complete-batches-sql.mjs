// Existing disposable PostgreSQL QA only. Real facades, synthetic people, outer rollback.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {buildNativeMonthlyQa} from './verify-native-monthly-novelties-sql.mjs';
import {buildMonthlyBatchCapacityInstallation} from './lib/monthly-batch-capacity-installation.mjs';
import {GRH_GUARDED_PREPARE_SQL} from '../lib/grh-import-prepare-sql.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
export function relocateMonthlyCapacity(batch,schema){
 assert.match(schema,/^mc_qa_[a-z0-9_]+$/);
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(').replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,`SET search_path=pg_catalog,${schema},public,pg_temp`);
 const body=s=>/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(s)?.[2];
 const pairs=[...batch.originals,...batch.changed].map(s=>[hash(body(s)),hash(body(relocate(s)))]);
 return batch.statements.map(original=>{let s=relocate(original);for(const [before,after]of pairs)s=s.replaceAll(before,after);return s.replaceAll('search_path=pg_catalog, public, pg_temp',`search_path=pg_catalog, ${schema}, public, pg_temp`).replaceAll('search_path=public, pg_temp',`search_path=pg_catalog, ${schema}, public, pg_temp`);});
}
export function buildMonthlyCompleteBatchesQa({serverMajor}){
 const base=buildNativeMonthlyQa({serverMajor,requireConcurrency:false}),batch=buildMonthlyBatchCapacityInstallation({read:f=>fs.readFileSync(path.join(root,f),'utf8'),sourceCommit:'9'.repeat(40)}),capacity=relocateMonthlyCapacity(batch,base.schema);
 const maker={actorEmail:'maker@example.invalid',actorSessionId:base.ids.makerSession,actorSessionVersion:1,membershipId:base.ids.maker,releaseSha:'9'.repeat(40),tenantId:base.ids.tenant};
 const guarded=GRH_GUARDED_PREPARE_SQL.replaceAll('public.',base.schema+'.'),report={version:'monthly-complete-batches-qa.v1',major:Number(serverMajor),synthetic:true,rolledBack:true,checks:14,inheritedChecks:base.report.checksPassed,schema:base.schema};
 const sql=`
 DO $capacity_scope$ BEGIN PERFORM set_config('search_path','pg_catalog,${base.schema},public,pg_temp',true);END $capacity_scope$;
 ${capacity.join(';\n')};
 -- Repeat the exact installation. Verify mode must retain OIDs, rows and grants.
 ${capacity.join(';\n')};
 DO $complete_batches$ DECLARE maker jsonb:=${q(JSON.stringify(maker))}::jsonb;record_person uuid;record_contract uuid;legajo_value text;i integer;rows_value jsonb:='[]';subjects_value jsonb:='[]';first_rows jsonb;first_subjects jsonb;answer jsonb;new_key uuid:=gen_random_uuid();before_batches bigint;before_rows bigint;before_events bigint;checks integer:=0;
 BEGIN
 PERFORM qa_assert(payroll_novelty_bootstrap_v1(maker)#>>'{limits,maxRows}'='2000' AND payroll_novelty_bootstrap_v2(maker)#>>'{limits,maxRows}'='2000','both published facades expose installed capacity');checks:=checks+1;
 FOR i IN 1..2001 LOOP
  record_person:=gen_random_uuid();record_contract:=gen_random_uuid();legajo_value:=(10000+i)::text;
  INSERT INTO person_identity SELECT (jsonb_populate_record(NULL::person_identity,to_jsonb(p)||jsonb_build_object('id',record_person,'full_name','Persona sintética de lote '||i,'dni',(99010000+i)::text,'cuil',NULL))).* FROM person_identity p WHERE p.id='${base.ids.targetPerson}'::uuid;
  INSERT INTO employment_contract SELECT (jsonb_populate_record(NULL::employment_contract,to_jsonb(c)||jsonb_build_object('id',record_contract,'person_id',record_person,'legacy_legajo',legajo_value))).* FROM employment_contract c WHERE c.id='${base.ids.targetContract}'::uuid;
  INSERT INTO employment_status_snapshot SELECT (jsonb_populate_record(NULL::employment_status_snapshot,to_jsonb(s)||jsonb_build_object('employment_contract_id',record_contract))).* FROM employment_status_snapshot s WHERE s.employment_contract_id='${base.ids.targetContract}'::uuid;
  INSERT INTO grh_employees(company_id,legajo) SELECT legacy_company_id,legacy_legajo FROM employment_contract WHERE id=record_contract;
  rows_value:=rows_value||jsonb_build_array(jsonb_build_object('rowOrdinal',i,'legajo',legajo_value,'conceptSourceId','614','costCenterSourceId',NULL,'adjustmentMonth',NULL,'quantityDecimal',NULL,'amountCents',CASE WHEN i=1 THEN '0' ELSE i::text END,'movementType',NULL,'legalInstrument',NULL,'observation','Fixture sintético de lote completo','forced',false));
  subjects_value:=subjects_value||jsonb_build_array(payroll_novelty_employee_v2(maker,record_contract)->'subject');
 END LOOP;
 PERFORM qa_assert(jsonb_array_length(rows_value)=2001 AND jsonb_array_length(subjects_value)=2001,'all synthetic original contracts checked through published facade');checks:=checks+1;
 SELECT jsonb_agg(v ORDER BY n) INTO first_rows FROM jsonb_array_elements(rows_value) WITH ORDINALITY x(v,n) WHERE n<=759;
 SELECT jsonb_agg(v ORDER BY n) INTO first_subjects FROM jsonb_array_elements(subjects_value) WITH ORDINALITY x(v,n) WHERE n<=759;
 SELECT count(*) INTO before_batches FROM payroll_novelty_batch;SELECT count(*) INTO before_rows FROM payroll_novelty_row;SELECT count(*) INTO before_events FROM payroll_novelty_event;
 SET LOCAL ROLE municontrol_actions_runtime_app;
 EXECUTE ${q(guarded)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',first_rows,new_key,repeat('a',64),first_subjects;
 RESET ROLE;
 PERFORM qa_assert(answer->>'verified'='1' AND answer#>>'{receipt,data,rowCount}'='759' AND jsonb_array_length(answer#>'{receipt,data,rows}')=759,'one real guarded save returns all 759 rows');checks:=checks+1;
 PERFORM qa_assert(answer#>>'{receipt,data,rows,0,amountCents}'='0' AND answer#>>'{receipt,data,rows,758,amountCents}'='759','zero and final original amount retained exactly');checks:=checks+1;
 PERFORM qa_assert((SELECT count(*)=before_batches+1 FROM payroll_novelty_batch) AND (SELECT count(*)=before_rows+759 FROM payroll_novelty_row) AND (SELECT count(*)=before_events+1 FROM payroll_novelty_event),'single audited batch persisted without chunking');checks:=checks+1;
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 EXECUTE ${q(guarded)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',first_rows,new_key,repeat('a',64),first_subjects;
 PERFORM qa_assert(answer#>>'{receipt,replayed}'='true' AND (SELECT count(*)=before_batches+1 FROM payroll_novelty_batch) AND (SELECT count(*)=before_rows+759 FROM payroll_novelty_row),'same full request replays without duplicates');checks:=checks+1;
 BEGIN
  EXECUTE ${q(guarded)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',first_rows,gen_random_uuid(),repeat('a',64),jsonb_set(first_subjects,'{758,identityToken}',to_jsonb(repeat('0',64)));
  RAISE EXCEPTION 'EXPECTED_LAST_IDENTITY_REJECTION';
 EXCEPTION WHEN division_by_zero THEN NULL;END;
 PERFORM qa_assert((SELECT count(*)=before_rows+759 FROM payroll_novelty_row) AND (SELECT count(*)=before_events+1 FROM payroll_novelty_event),'last identity failure writes nothing');checks:=checks+1;
 -- Deliberately mismatch only the last writer legajo with its verified subject.
 -- This passes the precondition, then the real postcondition rolls back all inserts.
 BEGIN
  EXECUTE ${q(guarded)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',jsonb_set(first_rows,'{758,legajo}',to_jsonb('12000'::text)),gen_random_uuid(),repeat('b',64),first_subjects;
  RAISE EXCEPTION 'EXPECTED_POSTCONDITION_REJECTION';
 EXCEPTION WHEN division_by_zero THEN NULL;END;
 PERFORM qa_assert((SELECT count(*)=before_rows+759 FROM payroll_novelty_row) AND (SELECT count(*)=before_events+1 FROM payroll_novelty_event),'postcondition failure rolls back entire real batch and audit');checks:=checks+1;
 SELECT jsonb_agg(v ORDER BY n) INTO first_rows FROM jsonb_array_elements(rows_value) WITH ORDINALITY x(v,n) WHERE n<=2000;
 SELECT jsonb_agg(v ORDER BY n) INTO first_subjects FROM jsonb_array_elements(subjects_value) WITH ORDINALITY x(v,n) WHERE n<=2000;
 PERFORM qa_assert(payroll_novelty_rows_valid_v1(first_rows,'bulk') AND NOT payroll_novelty_rows_valid_v1(rows_value,'bulk'),'SQL boundary accepts 2000 and rejects 2001 complete rows');checks:=checks+1;
 EXECUTE ${q(guarded)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',first_rows,gen_random_uuid(),repeat('c',64),first_subjects;
 PERFORM qa_assert(answer#>>'{receipt,data,rowCount}'='2000' AND jsonb_array_length(answer#>'{receipt,data,rows}')=2000 AND answer#>>'{receipt,data,rows,1999,rowOrdinal}'='2000','whole maximum saved and returned');checks:=checks+1;
 PERFORM qa_assert((SELECT count(*)=before_batches+2 FROM payroll_novelty_batch) AND (SELECT count(*)=before_rows+2759 FROM payroll_novelty_row) AND (SELECT count(*)=before_events+2 FROM payroll_novelty_event),'two complete guarded batches and only two audit events');checks:=checks+1;
 BEGIN
  EXECUTE ${q(guarded)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',rows_value,gen_random_uuid(),repeat('d',64),subjects_value;
  RAISE EXCEPTION 'EXPECTED_CAPACITY_REJECTION';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%PAYROLL_NOVELTY_PREPARE_INVALID%' THEN RAISE;END IF;END;
 PERFORM qa_assert((SELECT count(*)=before_rows+2759 FROM payroll_novelty_row),'2001-row rejection retains every previous row and adds none');checks:=checks+1;
 PERFORM qa_assert(NOT payroll_novelty_rows_valid_v1(jsonb_build_array(first_rows->0,first_rows->0),'bulk'),'duplicates stay invalid');checks:=checks+1;
 PERFORM qa_assert((SELECT bool_and(NOT grh_mutation AND NOT payroll_calculated AND NOT payroll_posted) FROM payroll_novelty_batch) AND (SELECT count(*)=0 FROM employment_movement),'no legacy mutation, salary calculation or posting');checks:=checks+1;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF checks<>14 THEN RAISE EXCEPTION 'COMPLETE_BATCH_CHECKS_MISMATCH:%',checks;END IF;
 RAISE NOTICE 'COMPLETE_BATCH_CHECKS=%',checks;
 END $complete_batches$;
 `;
 // Monthly tables live in their own rollback-only fixture subtransaction.
 // Exercise capacity before that subtransaction restores the baseline,
 // retaining every inherited check and its cleanup/rollback verification.
 const anchor="RAISE EXCEPTION USING ERRCODE='P1010',MESSAGE='RESTORE_NATIVE_MONTHLY_FIXTURES';";
 assert.equal(base.sql.split(anchor).length,2,'Expected one inherited rollback sentinel');
 return {...base,capacityBatch:batch,report,sql:base.sql.replace(anchor,()=>`EXECUTE ${q(sql)};\n ${anchor}`)+`\n SELECT ${q(JSON.stringify(report))}::jsonb AS monthly_complete_batch_result;\n`};
}
function main(){
 const args={};for(const a of process.argv.slice(2)){const m=/^--(expected-major|write-sql)=(.+)$/.exec(a);assert.ok(m);args[m[1]]=m[2];}
 assert.ok(['17','18'].includes(args['expected-major'])&&args['write-sql']);assert.ok(!fs.existsSync(args['write-sql']));const qa=buildMonthlyCompleteBatchesQa({serverMajor:args['expected-major']});fs.writeFileSync(args['write-sql'],qa.sql,{flag:'wx'});console.log(JSON.stringify({generated:true,executed:false,report:qa.report}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
