// Disposable PostgreSQL only. Composes unchanged legacy/auth facades from the existing QA harness.
import fs from 'node:fs';import assert from 'node:assert/strict';import {buildNativeMonthlyQa} from './verify-native-monthly-novelties-sql.mjs';
import {GRH_GUARDED_PREPARE_SQL} from '../lib/grh-import-prepare-sql.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--(expected-major|write-sql)=(.+)$/.exec(a);assert.ok(m);return[m[1],m[2]];}));
assert.ok(['17','18'].includes(args['expected-major'])&&args['write-sql']);assert.ok(!fs.existsSync(args['write-sql']));
const base=buildNativeMonthlyQa({serverMajor:args['expected-major'],requireConcurrency:false});const quote=s=>"'"+s.replaceAll("'","''")+"'";
const block=`
 DECLARE original_rows jsonb; own_subjects jsonb; answer jsonb; saved_key uuid:=gen_random_uuid(); count_before integer; events_before integer; writes_after integer;
 BEGIN
 original_rows:=jsonb_build_array((grh_rows->0)||jsonb_build_object('quantityDecimal',NULL,'amountCents','120034','observation','Ensayo de importación integral'));
 own_subjects:=jsonb_build_array(payroll_novelty_employee_v2(maker,'${base.ids.targetContract}'::uuid)->'subject');
 SELECT count(*) INTO count_before FROM payroll_novelty_batch;SELECT count(*) INTO events_before FROM payroll_novelty_event;
 SET LOCAL ROLE municontrol_actions_runtime_app;
 EXECUTE ${quote(GRH_GUARDED_PREPARE_SQL)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',original_rows,saved_key,repeat('f',64),own_subjects;
 RESET ROLE;
 PERFORM qa_assert(answer->>'verified'='1' AND answer#>>'{receipt,data,rowCount}'='1' AND answer#>>'{receipt,data,rows,0,amountCents}'='120034','guarded imported amount returned exactly');
 PERFORM qa_assert(answer#>>'{receipt,data,rows,0,employmentContractId}'='${base.ids.targetContract}' AND answer#>>'{receipt,data,payrollCalculated}'='false','only selected contract and no payroll effects');
 PERFORM qa_assert((SELECT count(*)=count_before+1 FROM payroll_novelty_batch) AND (SELECT count(*)=events_before+1 FROM payroll_novelty_event),'one existing writer creates one audited batch');
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 EXECUTE ${quote(GRH_GUARDED_PREPARE_SQL)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',original_rows,saved_key,repeat('f',64),own_subjects;
 PERFORM qa_assert(answer#>>'{receipt,replayed}'='true' AND (SELECT count(*)=count_before+1 FROM payroll_novelty_batch),'same guarded attempt replays without duplicating');
 BEGIN
  EXECUTE ${quote(GRH_GUARDED_PREPARE_SQL)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',original_rows,gen_random_uuid(),repeat('f',64),jsonb_set(own_subjects,'{0,identityToken}',to_jsonb(repeat('0',64)));
  RAISE EXCEPTION 'QA_EXPECTED_INITIAL_IDENTITY_REJECTION';
 EXCEPTION WHEN division_by_zero THEN NULL; END;
 PERFORM qa_assert((SELECT count(*)=count_before+1 FROM payroll_novelty_batch) AND (SELECT count(*)=events_before+1 FROM payroll_novelty_event),'initial identity failure creates nothing');
 -- The before-check deliberately names a different valid subject than the writer's legajo.
 -- No writer or trigger is mocked: postcondition must roll back its real insertion and audit.
 BEGIN
  EXECUTE ${quote(GRH_GUARDED_PREPARE_SQL)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',jsonb_set(original_rows,'{0,legajo}','"902"'::jsonb),gen_random_uuid(),repeat('e',64),own_subjects;
  RAISE EXCEPTION 'QA_EXPECTED_POST_IDENTITY_REJECTION';
 EXCEPTION WHEN division_by_zero THEN NULL; END;
 PERFORM qa_assert((SELECT count(*)=count_before+1 FROM payroll_novelty_batch) AND (SELECT count(*)=events_before+1 FROM payroll_novelty_event),'post-write identity failure atomically rolls back batch and audit');
 BEGIN
  EXECUTE ${quote(GRH_GUARDED_PREPARE_SQL)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',original_rows,saved_key,repeat('e',64),own_subjects;
  RAISE EXCEPTION 'QA_EXPECTED_IDEMPOTENCY_REJECTION';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PAYROLL_NOVELTY_IDEMPOTENCY_REUSE' THEN RAISE; END IF; END;
 PERFORM qa_assert((SELECT count(*)=count_before+1 FROM payroll_novelty_batch),'existing idempotency controls remain authoritative');
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 RAISE NOTICE 'GRH_ATOMIC_INTAKE_CHECKS_PASSED=7';
 END;
`;
const multiBlock=`
 DECLARE new_person uuid; new_contract uuid; input_rows jsonb:='[]'::jsonb; subjects jsonb:='[]'::jsonb; answer jsonb; baseline integer;
 BEGIN
 FOR i IN 1..12 LOOP
  new_person:=gen_random_uuid();new_contract:=gen_random_uuid();
  INSERT INTO person_identity(id,full_name) VALUES(new_person,'Persona sintética de importación '||i);
  INSERT INTO employment_contract SELECT (jsonb_populate_record(NULL::employment_contract,to_jsonb(c)||jsonb_build_object('id',new_contract,'person_id',new_person,'legacy_legajo',(91000+i)::text,'start_date','2020-01-01','end_date',NULL))).* FROM employment_contract c WHERE c.id='${base.ids.targetContract}'::uuid;
  input_rows:=input_rows||jsonb_build_array((grh_rows->0)||jsonb_build_object('rowOrdinal',i,'legajo',(91000+i)::text,'quantityDecimal',NULL,'amountCents',(120000+i)::text,'observation','Doce filas sintéticas completas'));
  subjects:=subjects||jsonb_build_array(payroll_novelty_employee_v2(maker,new_contract)->'subject');
 END LOOP;
 SELECT count(*) INTO baseline FROM payroll_novelty_batch;
 SET LOCAL ROLE municontrol_actions_runtime_app;
 EXECUTE ${quote(GRH_GUARDED_PREPARE_SQL)} INTO answer USING maker,'bulk',DATE '2026-10-01','monthly',input_rows,gen_random_uuid(),repeat('a',64),subjects;
 RESET ROLE;
 PERFORM qa_assert(answer#>>'{receipt,data,rowCount}'='12' AND jsonb_array_length(answer#>'{receipt,data,rows}')=12,'twelve rows are returned in one complete receipt');
 PERFORM qa_assert((SELECT count(*)=baseline+1 FROM payroll_novelty_batch),'twelve imported records create one governed batch, not twelve independent operations');
 PERFORM qa_assert(answer#>>'{receipt,data,rows,11,legajo}'='91012' AND answer#>>'{receipt,data,rows,11,amountCents}'='120012','last source row and exact amount are present');
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 RAISE NOTICE 'GRH_ATOMIC_MULTI_CHECKS_PASSED=3';
 END;
`;
const anchor="RAISE EXCEPTION USING ERRCODE='P1010',MESSAGE='RESTORE_NATIVE_MONTHLY_FIXTURES';";assert.equal(base.sql.split(anchor).length,2);
const sql=base.sql.replace(anchor,()=>block+'\n'+multiBlock+'\n'+anchor);assert.ok(sql.includes('native_monthly_qa'));fs.writeFileSync(args['write-sql'],sql,{flag:'wx'});
console.log(JSON.stringify({generated:true,databaseExecuted:false,ownChecksPlanned:10,inheritedChecksPlanned:base.report.checksPassed,productionWrites:0}));
