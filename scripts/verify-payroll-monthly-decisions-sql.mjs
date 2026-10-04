// Existing 101 facades, synthetic schema and full rollback; no new migration.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {buildNativeMonthlyQa} from './verify-native-monthly-novelties-sql.mjs';

export function buildMonthlyDecisionsQa(options){
  const base=buildNativeMonthlyQa(options);
  const block=`
 DECLARE group_ids uuid[]:=ARRAY[]::uuid[]; group_keys uuid[]:=ARRAY[]::uuid[]; group_receipts jsonb[]:=ARRAY[]::jsonb[];
 group_value jsonb; group_rows jsonb; group_mode text; group_version integer; group_i integer; group_count integer;
 BEGIN
 FOR group_i IN 1..26 LOOP
  IF group_i%2=0 THEN group_rows:=jsonb_build_array((monthly_rows->0)||jsonb_build_object('quantityDecimal',group_i::text));group_mode:='individual';group_version:=2;
  ELSE group_rows:=jsonb_build_array((grh_rows->0)||jsonb_build_object('quantityDecimal',group_i::text),
    (grh_rows->0)||jsonb_build_object('rowOrdinal',2,'conceptSourceId','81','quantityDecimal',group_i::text,'amountCents','0'));group_mode:='bulk';group_version:=1;END IF;
  IF group_version=2 THEN group_value:=payroll_novelty_prepare_v2(maker,group_mode,DATE '2026-11-01','monthly',group_rows,gen_random_uuid(),repeat('a',64));
  ELSE group_value:=payroll_novelty_prepare_v1(maker,group_mode,DATE '2026-11-01','monthly',group_rows,gen_random_uuid(),repeat('a',64));END IF;
  group_ids:=array_append(group_ids,(group_value#>>'{data,id}')::uuid);group_keys:=array_append(group_keys,gen_random_uuid());
 END LOOP;
 PERFORM qa_assert((SELECT count(*)=26 AND sum(row_count)=39 FROM payroll_novelty_batch WHERE id=ANY(group_ids)),'26 complete native/historical batches exist for the decision selection');checks:=checks+1;
 FOR group_i IN 1..26 LOOP
  group_value:=payroll_novelty_detail_v2(maker,group_ids[group_i]);
  PERFORM qa_assert(jsonb_array_length(group_value#>'{data,rows}')=(group_value#>>'{data,rowCount}')::integer,'every selected detail is complete');
  group_value:=payroll_novelty_transition_v2(maker,group_ids[group_i],'submit',1,'ready_for_review',NULL,group_keys[group_i],repeat('b',64));
  PERFORM qa_assert(group_value#>>'{data,status}'='submitted' AND group_value#>>'{data,version}'='2','submit is recorded for its exact whole batch');
  group_receipts:=array_append(group_receipts,group_value);
 END LOOP;checks:=checks+52;
 PERFORM qa_assert((SELECT count(*)=26 AND bool_and(status='submitted' AND version=2) FROM payroll_novelty_batch WHERE id=ANY(group_ids)),'all 26 submissions are conserved');checks:=checks+1;
 PERFORM qa_assert(qa_rejects(format('SELECT payroll_novelty_transition_v2(%L::jsonb,%L::uuid,%L,2,%L,NULL,gen_random_uuid(),repeat(''b'',64))',maker,group_ids[26],'approve','validated_for_export'),'PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED'),'preparer cannot approve the final selected native batch');checks:=checks+1;
 FOR group_i IN 1..26 LOOP
  group_value:=payroll_novelty_transition_v2(checker,group_ids[group_i],'approve',2,'validated_for_export',NULL,gen_random_uuid(),repeat('b',64));
  PERFORM qa_assert(group_value#>>'{data,status}'='approved' AND group_value#>>'{data,version}'='3' AND group_value#>>'{data,exportable}'='true','independent approval is export only');
 END LOOP;checks:=checks+26;
 FOR group_i IN 1..26 LOOP
  group_value:=payroll_novelty_transition_v2(maker,group_ids[group_i],'submit',1,'ready_for_review',NULL,group_keys[group_i],repeat('b',64));
  PERFORM qa_assert(group_value->>'replayed'='true' AND ((group_value-'replayed')#-'{data,submittedAt}'#-'{data,decidedAt}')=((group_receipts[group_i]-'replayed')#-'{data,submittedAt}'#-'{data,decidedAt}'),'recovered receipt retains every original event field and row after approval');
  IF group_i%2=0 THEN PERFORM qa_assert(group_value#>>'{data,decidedAt}' IS NULL AND group_value#>>'{data,submittedAt}'=group_value#>>'{data,updatedAt}','native receipt keeps its original event timeline');
  ELSE PERFORM qa_assert(group_value#>>'{data,decidedAt}' IS NOT NULL AND group_value#>>'{data,updatedAt}'=group_receipts[group_i]#>>'{data,updatedAt}','historical raw timeline is current but immutable event timestamp is preserved for v2 projection');END IF;
 END LOOP;checks:=checks+52;
 PERFORM qa_assert((SELECT count(*)=78 FROM payroll_novelty_event WHERE batch_id=ANY(group_ids)),'lost response recovery creates no fourth event');checks:=checks+1;
 PERFORM qa_assert(qa_rejects(format('SELECT payroll_novelty_transition_v2(%L::jsonb,%L::uuid,%L,2,%L,NULL,%L::uuid,repeat(''b'',64))',maker,group_ids[26],'approve','validated_for_export',group_keys[26]),'PAYROLL_NOVELTY_IDEMPOTENCY_REUSE'),'recovering cannot replace the original command');checks:=checks+1;
 PERFORM qa_assert(qa_rejects(format('SELECT payroll_novelty_transition_v2(%L::jsonb,%L::uuid,%L,1,%L,NULL,%L::uuid,repeat(''b'',64))',outsider,group_ids[26],'submit','ready_for_review',group_keys[26]),'PAYROLL_NOVELTY_NOT_FOUND'),'other scope cannot recover the selected batch');checks:=checks+1;
 PERFORM qa_assert((SELECT bool_and(NOT grh_mutation AND NOT payroll_calculated AND NOT payroll_posted) FROM payroll_novelty_batch WHERE id=ANY(group_ids)),'selected decisions never calculate post or mutate GRH');checks:=checks+1;
 END;
 `;
  const newChecks=137,anchor="RAISE EXCEPTION USING ERRCODE='P1010',MESSAGE='RESTORE_NATIVE_MONTHLY_FIXTURES';";
  assert.equal(base.sql.split(anchor).length,2);
  const report={...base.report,monthlyDecisionChecksPassed:newChecks,monthlyDecisionBatches:26,monthlyDecisionRows:39,checksPassed:base.report.checksPassed+newChecks,
    limitations:[...base.report.limitations,'Each existing batch transition commits independently in production; this QA schema rolls back all synthetic fixtures. It does not claim atomic multi-batch decisions or human acceptance.']};
  let sql=base.sql.replace(anchor,()=>block+anchor);
  const expectedCount=`checks<>${base.report.checksPassed} THEN`;
  assert.equal(sql.split(expectedCount).length,2);sql=sql.replace(expectedCount,`checks<>${report.checksPassed} THEN`);
  assert.equal(sql.split(JSON.stringify(base.report)).length,2);sql=sql.replace(JSON.stringify(base.report),()=>JSON.stringify(report));
  return {...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m,'Only disposable SQL output arguments are accepted');return [m[1],m[2]];}));
  assert.ok(args['write-sql']);const qa=buildMonthlyDecisionsQa({serverMajor:args['expected-major'],requireConcurrency:true});
  for(const [key,value]of [['write-sql',qa.sql],['write-lock-sql',qa.lockSql]]){const target=path.resolve(args[key]);assert.ok(!fs.existsSync(target));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value,{flag:'wx'});}
  console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,monthlyDecisionChecksPlanned:qa.report.monthlyDecisionChecksPassed}));
}
