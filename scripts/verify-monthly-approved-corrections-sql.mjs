// Complete inherited checks plus real SQL121 in a disposable namespace.
// Generation never connects; execution is restricted to synthetic PG17/18 QA.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildMonthlyAnnulQa} from './verify-monthly-approved-annulments-sql.mjs';
import {buildMonthlyCorrectionGuardPins} from './lib/monthly-correction-guards.mjs';
import {functionPin,pinsCheck} from './lib/native-leave-installation.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {buildMonthlyCorrectionInstallation} from './lib/monthly-correction-installation.mjs';
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
export function buildMonthlyCorrectionQa(options){
 const base=buildMonthlyAnnulQa(options),schema=base.schema,original=read('scripts/migrations/121-monthly-approved-corrections.sql');
 const guards=buildMonthlyCorrectionGuardPins(read),migration=splitPostgresStatements(original);
 const facades=new Set(['payroll_monthly_correction_bootstrap_v1','payroll_monthly_correction_detail_v1','payroll_monthly_correction_preview_v1','payroll_monthly_correction_attempt_v1','payroll_monthly_correction_command_v1']);
 const ownPins=migration.filter(s=>s.includes('CREATE FUNCTION public.payroll_monthly_correction_')).map(functionPin).map(p=>({...p,runtime:facades.has(p.name)}));
 assert.equal(ownPins.filter(p=>p.runtime).length,5);assert.ok(migration.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 const relocate=sql=>sql.replaceAll('public.',schema+'.').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace').replaceAll("s.nspname='public'",'s.nspname='+q(schema))
  .replaceAll(schema+'.digest','public.digest')
  .replaceAll('SET search_path=pg_catalog,public,pg_temp',`SET search_path=pg_catalog,${schema},public,pg_temp`)
  .replaceAll('search_path=pg_catalog, public, pg_temp',`search_path=pg_catalog, ${schema}, public, pg_temp`)
  .replaceAll('search_path=public, pg_temp',`search_path=pg_catalog, ${schema}, public, pg_temp`)
  .replaceAll("convert_to(prosrc,'UTF8')",`convert_to(replace(prosrc,${q(schema+'.')},'public'||'.'),'UTF8')`)
  .replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')",`replace(replace(p.prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`);
 const statements=[];let count=0;
 const exec=sql=>statements.push(sql),ok=(condition,label)=>{exec(`PERFORM qa_assert((${condition}),${q(label)});checks:=checks+1;`);count++;};
 const rejects=(sql,error,label)=>ok(`qa_rejects(${sql},${q(error)})`,label);
 const snapshot=`jsonb_build_object('batches',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM payroll_novelty_batch b),'rows',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM payroll_novelty_row r),'issues',(SELECT jsonb_agg(to_jsonb(i)-ARRAY['correction_review_id','correction_version'] ORDER BY id) FROM payroll_novelty_issue i),'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM payroll_novelty_event e))`;
 exec('SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;');
 exec(`prior_data:=${snapshot};`);
 const installation=buildMonthlyCorrectionInstallation({source:original,read,sourceCommit:'a'.repeat(40)});
 for(const statement of installation.installation.slice(0,-1))exec(`EXECUTE ${q(relocate(statement))};`);
 exec(`EXECUTE ${q(relocate(installation.installation.at(-1)))} INTO installation_proof;`);
 ok(`installation_proof->>'beforeFingerprint'=installation_proof->>'afterFingerprint' AND (installation_proof->>'priorTableCount')::integer>0`,'installation preserves every prior table, row, function and security object');
 for(const statement of installation.durableVerification.slice(0,-1))exec(`EXECUTE ${q(relocate(statement))};`);
 exec(`EXECUTE ${q(relocate(installation.durableVerification.at(-1)))} INTO durability_proof;`);
 ok(`installation_proof-'beforeFingerprint'=durability_proof`,'a fresh audit in the local transaction keeps all installed object and prior-state fingerprints');
 rejects(q(relocate(`ALTER TABLE public.payroll_monthly_correction_review DISABLE ROW LEVEL SECURITY;${installation.newObjectAudit}`)),'SQL121_NEW_TABLE_SECURITY','installation audit refuses weakened table security');
 rejects(q(relocate(`ALTER FUNCTION public.payroll_novelty_prepare_v2(jsonb,text,date,text,jsonb,uuid,text) COST 200;${installation.afterPinsCheck}`)),'SQL121_GUARD_METADATA','installation audit refuses existing writer metadata drift');
 rejects(q(relocate(`ALTER TABLE public.payroll_novelty_issue DROP CONSTRAINT payroll_novelty_issue_correction_pair_ck;${installation.issueAudit}`)),'SQL121_ISSUE_PAIR_CHECK','installation audit refuses loss of the paired history guard');
 rejects(q(relocate(`ALTER TABLE public.payroll_novelty_event SET(autovacuum_enabled=false);${installation.after};${installation.priorAudit}`)),'SQL121_PRIOR_STATE_CHANGED','installation audit refuses an unrelated prior table metadata change');
 ok(`prior_data=${snapshot}`,'installation preserves all previous monthly rows and values');
 ok(`(SELECT count(*)=0 FROM payroll_novelty_issue WHERE correction_review_id IS NOT NULL OR correction_version IS NOT NULL)`,'new nullable issue history fields do not classify or rewrite old issues');
 ok(`(SELECT count(*)=3 FROM pg_class WHERE relnamespace=${q(schema)}::regnamespace AND relname IN('payroll_monthly_correction_proposal','payroll_monthly_correction_review','payroll_monthly_correction_attempt') AND relrowsecurity)`,'three private append-only correction tables use RLS');
 ok(`(SELECT count(*)=5 FROM pg_proc WHERE pronamespace=${q(schema)}::regnamespace AND starts_with(proname,'payroll_monthly_correction_') AND has_function_privilege('municontrol_actions_runtime_app',oid,'EXECUTE'))`,'runtime can execute only the five reviewed facades');
 ok(`NOT has_table_privilege('municontrol_actions_runtime_app','payroll_monthly_correction_review','INSERT') AND NOT has_function_privilege('municontrol_actions_runtime_app','payroll_monthly_correction_authorized_item_v1(uuid,uuid,integer)','EXECUTE')`,'runtime cannot forge review authority or invoke private guards');
 rejects(q(relocate(original)),'PAYROLL_MONTHLY_CORRECTION_PREREQUISITE_DRIFT','reinstallation cannot overwrite already adapted functions');
 exec(`FOR group_i IN 1..26 LOOP
  IF group_i%2=0 THEN group_rows:=jsonb_build_array((monthly_rows->0)||jsonb_build_object('quantityDecimal',(100+group_i)::text));
  ELSE group_rows:=jsonb_build_array((grh_rows->0)||jsonb_build_object('quantityDecimal',(100+group_i)::text),(grh_rows->0)||jsonb_build_object('rowOrdinal',2,'conceptSourceId','81','quantityDecimal',(100+group_i)::text,'amountCents','0'));END IF;
  key_value:=gen_random_uuid();prepare_keys:=array_append(prepare_keys,key_value);
  IF group_i%2=0 THEN value:=payroll_novelty_prepare_v2(maker,'individual',DATE '2026-12-01','monthly',group_rows,key_value,repeat('a',64));
  ELSE value:=payroll_novelty_prepare_v1(maker,'bulk',DATE '2026-12-01','monthly',group_rows,key_value,repeat('a',64));END IF;
  group_ids:=array_append(group_ids,(value#>>'{data,id}')::uuid);prepare_receipts:=array_append(prepare_receipts,value);
  key_value:=gen_random_uuid();submit_keys:=array_append(submit_keys,key_value);value:=payroll_novelty_transition_v2(maker,group_ids[group_i],'submit',1,'ready_for_review',NULL,key_value,repeat('b',64));submit_receipts:=array_append(submit_receipts,value);
  key_value:=gen_random_uuid();approve_keys:=array_append(approve_keys,key_value);value:=payroll_novelty_transition_v2(checker,group_ids[group_i],'approve',2,'validated_for_export',NULL,key_value,repeat('b',64));approve_receipts:=array_append(approve_receipts,value);
 END LOOP;
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 source_ctx:=payroll_monthly_annul_context_v1(maker,'payroll.novelty.prepare');
 before_rows:=(SELECT jsonb_agg(to_jsonb(r) ORDER BY batch_id,row_ordinal) FROM payroll_novelty_row r WHERE batch_id=ANY(group_ids));
 before_batches:=(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM payroll_novelty_batch b WHERE id=ANY(group_ids));
 boot:=payroll_monthly_correction_bootstrap_v1(maker,DATE '2026-12-01');`);
 ok(`jsonb_array_length(boot->'candidates')=26 AND boot->>'complete'='true' AND (SELECT sum(row_count)=39 FROM payroll_novelty_batch WHERE id=ANY(group_ids))`,'complete bootstrap includes all 26 batches and 39 source rows without paging truncation');
 ok(`(SELECT bool_and(btrim(b.content_sha256)=payroll_monthly_correction_content_v1(source_ctx,(payroll_monthly_correction_detail_v1(maker,'candidate',b.id)#>'{items,0,batch}'))) FROM payroll_novelty_batch b WHERE id=ANY(group_ids))`,'correction fingerprint matches every existing native and historical writer exactly');
 exec(`targets:='[]'::jsonb;FOR group_id IN SELECT unnest(group_ids) ORDER BY 1 LOOP detail:=payroll_monthly_correction_detail_v1(maker,'candidate',group_id);targets:=targets||jsonb_build_array(jsonb_build_object('batchId',group_id,'expectedVersion',3,'snapshotSha256',detail#>>'{items,0,snapshotSha256}'));END LOOP;
 body:=jsonb_build_object('command','preview','proposalId',NULL,'proposalSha256',NULL,'previewSha256',NULL,'items',targets,'patch',jsonb_build_object('observation','Corrección administrativa sintética completa'),'reason','Revisar todos los lotes sintéticos completos');
 verified:=payroll_monthly_correction_preview_v1(maker,body);`);
 ok(`jsonb_array_length(verified->'items')=26 AND (SELECT sum((i#>>'{batch,rowCount}')::integer)=39 FROM jsonb_array_elements(verified->'items') i)`,'preview compares every selected original and corrected row');
 ok(`(SELECT count(*)=0 FROM payroll_monthly_correction_proposal) AND before_rows=(SELECT jsonb_agg(to_jsonb(r) ORDER BY batch_id,row_ordinal) FROM payroll_novelty_row r WHERE batch_id=ANY(group_ids))`,'read preview neither proposes nor changes any original row');
 exec(`value:=payroll_monthly_correction_preview_v1(maker,body||jsonb_build_object('patch',jsonb_build_object('quantityDecimal','0','amountCents',NULL)));`);
 ok(`(SELECT count(*)=39 AND bool_and(r->>'quantityDecimal'='0' AND r->'amountCents'='null'::jsonb) FROM jsonb_array_elements(value->'items') i CROSS JOIN LATERAL jsonb_array_elements(i#>'{after,rows}') r)`,'zero units remain exact text and cleared amounts remain null across the complete preview');
 exec(`value:=payroll_monthly_correction_preview_v1(maker,body||jsonb_build_object('patch',jsonb_build_object('quantityDecimal',NULL,'amountCents','0')));`);
 ok(`(SELECT count(*)=39 AND bool_and(r->'quantityDecimal'='null'::jsonb AND r->>'amountCents'='0') FROM jsonb_array_elements(value->'items') i CROSS JOIN LATERAL jsonb_array_elements(i#>'{after,rows}') r)`,'zero cents never become a missing amount and null units never become zero');
 exec(`value:=payroll_monthly_correction_preview_v1(maker,body||jsonb_build_object('patch',jsonb_build_object('quantityDecimal','999999999999.123456','amountCents','999999999999999999')));`);
 ok(`(SELECT count(*)=39 AND bool_and(r->>'quantityDecimal'='999999999999.123456' AND r->>'amountCents'='999999999999999999') FROM jsonb_array_elements(value->'items') i CROSS JOIN LATERAL jsonb_array_elements(i#>'{after,rows}') r)`,'maximum supported exact decimal and integer amounts are not rounded or coerced');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('patch',jsonb_build_object('quantityDecimal','-0.000000')))`,'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD','negative zero is refused without numeric coercion');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('patch',jsonb_build_object('quantityDecimal','1.1234567')))`,'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD','excess decimals are refused without truncation');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('patch',jsonb_build_object('quantityDecimal',1)))`,'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD','JSON numbers cannot replace an exact decimal string');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('patch',jsonb_build_object('adjustmentMonth','2027-01-01')))`,'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD','future adjustment rejects the complete selection');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('patch',jsonb_build_object('conceptSourceId','95')))`,'PAYROLL_MONTHLY_CORRECTION_DUPLICATE_DESTINATION','uniform concept correction refuses duplicate destinations instead of merging rows');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('patch',jsonb_build_object('forced',true)))`,'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD','forced correction requires a supplied amount and justification for every row');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('reason',U&'Correccio\\0301n administrativa no normalizada'))`,'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD','decomposed reason is refused instead of changing the submitted text');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('items',(body->'items')||jsonb_build_array(body#>'{items,0}')))`,'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD','repeated batch refuses the whole preview');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('patch',jsonb_build_object('payrollType','sac')))`,'PAYROLL_MONTHLY_CORRECTION_NATIVE_TYPE_UNSUPPORTED','unsupported native payroll type refuses all batches without omission');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('patch',jsonb_build_object('quantityDecimal',NULL,'amountCents',NULL)))`,'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD','empty quantity and amount refuse the complete correction');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('patch',jsonb_build_object('payrollType','monthly')))`,'PAYROLL_MONTHLY_CORRECTION_NO_CHANGE','unchanged batch cannot be skipped from a complete selection');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,body||jsonb_build_object('patch',jsonb_build_object('contractId',gen_random_uuid())))`,'PAYROLL_MONTHLY_CORRECTION_INVALID_PAYLOAD','patch cannot assign or replace an employee identity');
 rejects(`format('SELECT payroll_monthly_correction_preview_v1(%L::jsonb,%L::jsonb)',maker,jsonb_set(body,'{items,25,snapshotSha256}',to_jsonb(repeat('0',64))))`,'PAYROLL_MONTHLY_CORRECTION_VERSION_CONFLICT','stale final batch invalidates the whole preview');
 rejects(`format('UPDATE payroll_novelty_row SET observation=%L WHERE batch_id=%L::uuid','Cambio sin revisión',group_ids[1])`,'PAYROLL_MONTHLY_CORRECTION_AUDIT_REQUIRED','direct row update cannot forge transaction-local review authority');
 rejects(`format('UPDATE payroll_novelty_batch SET version=version+1,reason_code=''corrected_after_review'',reason_reference=%L WHERE id=%L::uuid','ref:'||gen_random_uuid(),group_ids[1])`,'PAYROLL_MONTHLY_CORRECTION_AUDIT_REQUIRED','direct batch update cannot forge a persisted correction');
 exec(`PERFORM set_config('municontrol.correction.review',gen_random_uuid()::text,true);`);
 rejects(`format('UPDATE payroll_novelty_row SET observation=%L WHERE batch_id=%L::uuid','Cambio con GUC falso',group_ids[1])`,'PAYROLL_MONTHLY_CORRECTION_AUDIT_REQUIRED','session settings do not authorize an approved row update');
 exec(`body:=body||jsonb_build_object('command','propose','previewSha256',verified->'previewSha256');key_value:=gen_random_uuid();proposal_receipt:=payroll_monthly_correction_command_v1(maker,body,key_value);proposal_id:=(proposal_receipt->>'proposalId')::uuid;
 detail:=payroll_monthly_correction_detail_v1(checker,'proposal',proposal_id);
 review_body:=jsonb_build_object('command','approve','proposalId',proposal_id,'proposalSha256',detail->'proposalSha256','previewSha256',NULL,'items',NULL,'patch',NULL,'reason','Revisión independiente sintética completa');`);
 ok(`proposal_receipt->>'status'='pending' AND before_batches=(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM payroll_novelty_batch b WHERE id=ANY(group_ids)) AND before_rows=(SELECT jsonb_agg(to_jsonb(r) ORDER BY batch_id,row_ordinal) FROM payroll_novelty_row r WHERE batch_id=ANY(group_ids))`,'proposal keeps every original row and approved batch unchanged until review');
 ok(`payroll_monthly_correction_command_v1(maker,body,key_value)=proposal_receipt||jsonb_build_object('replayed',true) AND payroll_monthly_correction_attempt_v1(maker,key_value)=proposal_receipt||jsonb_build_object('replayed',true)`,'lost proposal response recovers its exact original key and body');
 rejects(`format('SELECT payroll_monthly_correction_command_v1(%L::jsonb,%L::jsonb,%L::uuid)',maker,body||jsonb_build_object('reason','Otro motivo sintético completo'),key_value)`,'PAYROLL_MONTHLY_CORRECTION_IDEMPOTENCY_REUSE','changed reason with the original key cannot replace the first attempt');
 rejects(`format('SELECT payroll_monthly_correction_command_v1(%L::jsonb,%L::jsonb,gen_random_uuid())',maker,body)`,'PAYROLL_MONTHLY_CORRECTION_PENDING_EXISTS','overlapping pending correction is refused');
 ok(`detail->>'canReview'='true' AND jsonb_array_length(detail->'items')=26 AND payroll_monthly_correction_detail_v1(maker,'proposal',proposal_id)->>'canReview'='false'`,'independent reviewer sees the entire frozen comparison while proposer cannot approve');
 rejects(`format('SELECT payroll_monthly_correction_command_v1(%L::jsonb,%L::jsonb,gen_random_uuid())',maker,review_body)`,'PAYROLL_MONTHLY_CORRECTION_MAKER_CHECKER_REQUIRED','proposer cannot decide its own correction');
 rejects(`format('SELECT payroll_monthly_correction_command_v1(%L::jsonb,%L::jsonb,gen_random_uuid())',same_person,review_body)`,'PAYROLL_MONTHLY_CORRECTION_MAKER_CHECKER_REQUIRED','another membership of the proposing person cannot decide');
 exec(`value:=payroll_monthly_correction_command_v1(checker,review_body||jsonb_build_object('command','reject'),gen_random_uuid());`);
 ok(`value->>'status'='rejected' AND before_batches=(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM payroll_novelty_batch b WHERE id=ANY(group_ids)) AND before_rows=(SELECT jsonb_agg(to_jsonb(r) ORDER BY batch_id,row_ordinal) FROM payroll_novelty_row r WHERE batch_id=ANY(group_ids))`,'rejection preserves all original values and approval versions');
 exec(`key_value:=gen_random_uuid();proposal_receipt:=payroll_monthly_correction_command_v1(maker,body,key_value);proposal_id:=(proposal_receipt->>'proposalId')::uuid;detail:=payroll_monthly_correction_detail_v1(checker,'proposal',proposal_id);review_body:=review_body||jsonb_build_object('proposalId',proposal_id,'proposalSha256',detail->'proposalSha256');
 CREATE FUNCTION qa_abort_correction_v1() RETURNS trigger LANGUAGE plpgsql AS $abort$ BEGIN IF NEW.command='correct' AND (SELECT count(*) FROM payroll_novelty_event WHERE command='correct')=2 THEN RAISE EXCEPTION 'CORRECTION_QA_ABORT';END IF;RETURN NEW;END $abort$;
 CREATE TRIGGER qa_abort_correction AFTER INSERT ON payroll_novelty_event FOR EACH ROW EXECUTE FUNCTION qa_abort_correction_v1();`);
 rejects(`format('SELECT payroll_monthly_correction_command_v1(%L::jsonb,%L::jsonb,gen_random_uuid())',checker,review_body)`,'CORRECTION_QA_ABORT','failure after the first corrected batch rolls back every update and review');
 ok(`before_batches=(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM payroll_novelty_batch b WHERE id=ANY(group_ids)) AND before_rows=(SELECT jsonb_agg(to_jsonb(r) ORDER BY batch_id,row_ordinal) FROM payroll_novelty_row r WHERE batch_id=ANY(group_ids)) AND NOT EXISTS(SELECT 1 FROM payroll_monthly_correction_review r WHERE r.proposal_id=monthly_correction_qa.proposal_id)`,'failed approval conserves all original batches and rows and leaves no review');
 exec('DROP TRIGGER qa_abort_correction ON payroll_novelty_event;DROP FUNCTION qa_abort_correction_v1();');
 exec(`review_key:=gen_random_uuid();review_receipt:=payroll_monthly_correction_command_v1(checker,review_body,review_key);SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;`);
 ok(`review_receipt->>'status'='approved' AND (SELECT count(*)=26 AND sum(row_count)=39 AND bool_and(version=4 AND status='approved' AND reason_code='corrected_after_review' AND exportable) FROM payroll_novelty_batch WHERE id=ANY(group_ids))`,'approval atomically corrects all 26 approved batches and retains 39 rows');
 ok(`(SELECT jsonb_agg(to_jsonb(r)-'observation' ORDER BY batch_id,row_ordinal) FROM payroll_novelty_row r WHERE batch_id=ANY(group_ids))=(SELECT jsonb_agg(original.row_value-'observation' ORDER BY original.row_value->>'batch_id',(original.row_value->>'row_ordinal')::integer) FROM jsonb_array_elements(before_rows) AS original(row_value)) AND (SELECT bool_and(observation='Corrección administrativa sintética completa') FROM payroll_novelty_row WHERE batch_id=ANY(group_ids))`,'uniform patch changes only the chosen field and preserves every row identity and exact value');
 ok(`(SELECT count(*)=26 FROM payroll_novelty_event WHERE command='correct' AND batch_id=ANY(group_ids) AND resulting_version=4)`,'each batch retains one immutable versioned correction event');
 ok(`payroll_monthly_correction_command_v1(checker,review_body,review_key)=review_receipt||jsonb_build_object('replayed',true)`,'approved response replay does not add a correction event');
 ok(`payroll_monthly_correction_detail_v1(checker,'proposal',proposal_id)->'items'=detail->'items'`,'the original complete comparison remains immutable after approval');
 exec(`FOR group_i IN 1..26 LOOP
  IF group_i%2=0 THEN group_rows:=jsonb_build_array((monthly_rows->0)||jsonb_build_object('quantityDecimal',(100+group_i)::text));value:=payroll_novelty_prepare_v2(maker,'individual',DATE '2026-12-01','monthly',group_rows,prepare_keys[group_i],repeat('a',64));
  ELSE group_rows:=jsonb_build_array((grh_rows->0)||jsonb_build_object('quantityDecimal',(100+group_i)::text),(grh_rows->0)||jsonb_build_object('rowOrdinal',2,'conceptSourceId','81','quantityDecimal',(100+group_i)::text,'amountCents','0'));value:=payroll_novelty_prepare_v1(maker,'bulk',DATE '2026-12-01','monthly',group_rows,prepare_keys[group_i],repeat('a',64));END IF;
  PERFORM qa_assert(value-'replayed'=prepare_receipts[group_i]-'replayed','old preparation receipt preserves every field after correction');
  value:=payroll_novelty_transition_v2(maker,group_ids[group_i],'submit',1,'ready_for_review',NULL,submit_keys[group_i],repeat('b',64));
  PERFORM qa_assert(value-'replayed'=submit_receipts[group_i]-'replayed','old submission receipt preserves every field after correction');
  value:=payroll_novelty_transition_v2(checker,group_ids[group_i],'approve',2,'validated_for_export',NULL,approve_keys[group_i],repeat('b',64));
  PERFORM qa_assert(value-'replayed'=approve_receipts[group_i]-'replayed','old approval receipt preserves every field after correction');
 END LOOP;`);count+=78;exec('checks:=checks+78;');
 rejects(`format('SELECT payroll_novelty_prepare_v1(%L::jsonb,''bulk'',DATE ''2026-12-01'',''monthly'',%L::jsonb,%L::uuid,repeat(''a'',64))',maker,jsonb_build_array((grh_rows->0)||jsonb_build_object('quantityDecimal','101','observation','Otro texto de reintento'),(grh_rows->0)||jsonb_build_object('rowOrdinal',2,'conceptSourceId','81','quantityDecimal','101','amountCents','0')),prepare_keys[1])`,'PAYROLL_NOVELTY_IDEMPOTENCY_REUSE','historical preparation recovery refuses altered data even when the command hash and key are reused');
 rejects(`format('SELECT payroll_novelty_prepare_v2(%L::jsonb,''individual'',DATE ''2026-12-01'',''monthly'',%L::jsonb,%L::uuid,repeat(''a'',64))',maker,jsonb_build_array((monthly_rows->0)||jsonb_build_object('quantityDecimal','102','observation','Otro texto de reintento')),prepare_keys[2])`,'PAYROLL_NOVELTY_IDEMPOTENCY_REUSE','native preparation recovery refuses altered data without changing writer validation');
 ok(`(SELECT bool_and(payroll_novelty_detail_v2(maker,b.id)#>>'{data,rows,0,observation}'='Corrección administrativa sintética completa') FROM payroll_novelty_batch b WHERE id=ANY(group_ids))`,'existing detail facade serves current corrected values');
 ok(`(SELECT bool_and(jsonb_array_length(payroll_novelty_export_v2(maker,b.id)#>'{data,rows}')=b.row_count) FROM payroll_novelty_batch b WHERE id=ANY(group_ids))`,'existing export facade remains complete for corrected approved batches');
 exec(`targets:='[]'::jsonb;FOR group_id IN SELECT unnest(group_ids) ORDER BY 1 LOOP value:=payroll_monthly_correction_detail_v1(maker,'candidate',group_id);targets:=targets||jsonb_build_array(jsonb_build_object('batchId',group_id,'expectedVersion',4,'snapshotSha256',value#>>'{items,0,snapshotSha256}'));END LOOP;
 body:=body||jsonb_build_object('command','preview','previewSha256',NULL,'items',targets,'patch',jsonb_build_object('observation',NULL));verified:=payroll_monthly_correction_preview_v1(maker,body);body:=body||jsonb_build_object('command','propose','previewSha256',verified->'previewSha256');value:=payroll_monthly_correction_command_v1(maker,body,gen_random_uuid());second_id:=(value->>'proposalId')::uuid;value:=payroll_monthly_correction_detail_v1(checker,'proposal',second_id);
 value:=payroll_monthly_correction_command_v1(checker,review_body||jsonb_build_object('proposalId',second_id,'proposalSha256',value->'proposalSha256'),gen_random_uuid());SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;`);
 ok(`(SELECT count(*)=26 AND bool_and(version=5 AND status='approved') FROM payroll_novelty_batch WHERE id=ANY(group_ids)) AND (SELECT bool_and(observation IS NULL) FROM payroll_novelty_row WHERE batch_id=ANY(group_ids))`,'a second independently reviewed correction clears chosen text without zero or identity substitution');
 ok(`(SELECT bool_and(payroll_novelty_event_snapshot_v2(e.id,e.tenant_id,true)#>>'{rows,0,observation}'='Corrección administrativa sintética completa') FROM payroll_novelty_event e WHERE batch_id=ANY(group_ids) AND command='correct' AND resulting_version=4)`,'first correction event keeps its own values after a later correction');
 ok(`payroll_monthly_correction_detail_v1(checker,'proposal',proposal_id)->'items'=detail->'items'`,'first proposal history retains both originals and first corrected values');
 exec(`targets:='[]'::jsonb;FOR group_id IN SELECT unnest(group_ids) ORDER BY 1 LOOP value:=payroll_monthly_annul_detail_v1(maker,'candidate',group_id);targets:=targets||jsonb_build_array(jsonb_build_object('batchId',group_id,'expectedVersion',5,'snapshotSha256',value#>>'{items,0,snapshotSha256}'));END LOOP;
 value:=payroll_monthly_annul_command_v1(maker,jsonb_build_object('command','propose','proposalId',NULL,'proposalSha256',NULL,'items',targets,'reason','Anulación sintética posterior a dos correcciones'),gen_random_uuid());second_id:=(value->>'proposalId')::uuid;value:=payroll_monthly_annul_detail_v1(checker,'proposal',second_id);
 value:=payroll_monthly_annul_command_v1(checker,jsonb_build_object('command','approve','proposalId',second_id,'proposalSha256',value->'proposalSha256','items',NULL,'reason','Revisión sintética de la anulación completa'),gen_random_uuid());SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;`);
 ok(`(SELECT count(*)=26 AND bool_and(version=6 AND status='cancelled' AND NOT exportable) FROM payroll_novelty_batch WHERE id=ANY(group_ids))`,'existing SQL120 whole-set annulment accepts corrected approved batches');
 ok(`(SELECT bool_and(payroll_novelty_event_snapshot_v2(e.id,e.tenant_id,true)#>>'{rows,0,observation}'='Corrección administrativa sintética completa') FROM payroll_novelty_event e WHERE batch_id=ANY(group_ids) AND command='correct' AND resulting_version=4)`,'annulment never rewrites the values of a prior correction event');
 ok(`payroll_novelty_prepare_v1(maker,'bulk',DATE '2026-12-01','monthly',jsonb_build_array((grh_rows->0)||jsonb_build_object('quantityDecimal','101'),(grh_rows->0)||jsonb_build_object('rowOrdinal',2,'conceptSourceId','81','quantityDecimal','101','amountCents','0')),prepare_keys[1],repeat('a',64))-'replayed'=prepare_receipts[1]-'replayed'`,'historical original preparation receipt survives two corrections and complete annulment');
 ok(`payroll_novelty_prepare_v2(maker,'individual',DATE '2026-12-01','monthly',jsonb_build_array((monthly_rows->0)||jsonb_build_object('quantityDecimal','102')),prepare_keys[2],repeat('a',64))-'replayed'=prepare_receipts[2]-'replayed'`,'native original preparation receipt survives two corrections and complete annulment');
 ok(`(SELECT bool_and(NOT grh_mutation AND NOT payroll_calculated AND NOT payroll_posted) FROM payroll_novelty_batch) AND (SELECT bool_and(NOT grh_mutation AND NOT payroll_calculated AND NOT payroll_posted) FROM payroll_novelty_event)`,'all correction and previous operations remain administrative without payroll calculation or GRH writes');
 rejects(q('UPDATE payroll_monthly_correction_proposal SET reason=reason'),'PAYROLL_NOVELTY_APPEND_ONLY','correction proposals cannot be rewritten');
 rejects(q('DELETE FROM payroll_monthly_correction_review'),'PAYROLL_NOVELTY_APPEND_ONLY','correction decisions cannot be deleted');
 rejects(q('TRUNCATE payroll_monthly_correction_attempt'),'PAYROLL_NOVELTY_APPEND_ONLY','original attempt receipts cannot be truncated');
 const block=`DECLARE prior_data jsonb;installation_proof jsonb;durability_proof jsonb;before_rows jsonb;before_batches jsonb;source_ctx jsonb;boot jsonb;targets jsonb;body jsonb;verified jsonb;detail jsonb;review_body jsonb;value jsonb;proposal_receipt jsonb;review_receipt jsonb;
 group_ids uuid[]:=ARRAY[]::uuid[];prepare_keys uuid[]:=ARRAY[]::uuid[];submit_keys uuid[]:=ARRAY[]::uuid[];approve_keys uuid[]:=ARRAY[]::uuid[];prepare_receipts jsonb[]:=ARRAY[]::jsonb[];submit_receipts jsonb[]:=ARRAY[]::jsonb[];approve_receipts jsonb[]:=ARRAY[]::jsonb[];
 group_i integer;group_id uuid;group_rows jsonb;key_value uuid;review_key uuid;proposal_id uuid;second_id uuid;BEGIN
 ${statements.join('\n')}
 END;\n`;
 // Substitute the unambiguous lexical variable rather than a same-name column.
 const finalBlock=block.replace('DECLARE prior_data','<<monthly_correction_qa>>\nDECLARE prior_data');
 const anchor="RAISE EXCEPTION USING ERRCODE='P1010',MESSAGE='RESTORE_NATIVE_MONTHLY_FIXTURES';";assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,monthlyCorrectionChecksPassed:count,migration121Sha256:createHash('sha256').update(original).digest('hex'),checksPassed:base.report.checksPassed+count,monthlyCorrectionFunctions:ownPins.length,monthlyCorrectionFacades:5};
 let sql=base.sql.replace(anchor,()=>finalBlock+anchor).replace(`checks<>${base.report.checksPassed} THEN`,`checks<>${report.checksPassed} THEN`).replace(JSON.stringify(base.report),()=>JSON.stringify(report));
 assert.doesNotMatch(sql,/INSERT\s+INTO\s+public\./i);assert.match(sql,/ROLLBACK;\s*$/);return {...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args={};for(const arg of process.argv.slice(2)){if(arg==='--ci')continue;const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(arg);assert.ok(m,'Unknown argument');args[m[1]]=m[2];}
  assert.ok(process.argv.includes('--ci'));assert.ok(args['write-sql']);const qa=buildMonthlyCorrectionQa({serverMajor:args['expected-major'],requireConcurrency:Boolean(args['write-lock-sql'])});
  for(const[k,value]of [['write-sql',qa.sql],['write-lock-sql',qa.lockSql]])if(args[k])fs.writeFileSync(args[k],value,{flag:'wx'});
  console.log(JSON.stringify({databaseExecuted:false,checksPlanned:qa.report.checksPassed,monthlyCorrectionChecksPlanned:qa.report.monthlyCorrectionChecksPassed}));
 }catch(error){console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}
}
