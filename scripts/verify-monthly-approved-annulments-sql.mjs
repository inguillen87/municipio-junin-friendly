// Real 120 ledger/guard changes, after the unchanged 502 existing checks.
// Synthetic namespace, disposable PostgreSQL 17/18, unconditional outer rollback.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildMonthlyDecisionsQa} from './verify-payroll-monthly-decisions-sql.mjs';
import {buildMonthlyAnnulInstallation} from './lib/monthly-annul-installation.mjs';
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
export function buildMonthlyAnnulQa(options){
 const base=buildMonthlyDecisionsQa(options),schema=base.schema;
 const original=fs.readFileSync(new URL('./migrations/120-monthly-approved-annulments.sql',import.meta.url),'utf8').replace(/\r\n?/g,'\n');
 const installation=buildMonthlyAnnulInstallation({source:original,sourceCommit:'a'.repeat(40),read:file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8')});
 // Normalize only the synthetic namespace for the two unchanged source pins.
 const migration=original.replaceAll('public.',schema+'.').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
 .replace(/SET search_path=pg_catalog,public,pg_temp/g,`SET search_path=pg_catalog,${schema},public,pg_temp`)
 .replaceAll("convert_to(prosrc,'UTF8')",`convert_to(replace(prosrc,${q(schema+'.')},'public'||'.'),'UTF8')`);
 const relocate=sql=>sql.replaceAll('public.',schema+'.').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace').replaceAll("s.nspname='public'",'s.nspname='+q(schema))
 .replaceAll(schema+'.digest','public.digest')
 .replaceAll('SET search_path=pg_catalog,public,pg_temp',`SET search_path=pg_catalog,${schema},public,pg_temp`)
 .replaceAll('search_path=pg_catalog, public, pg_temp',`search_path=pg_catalog, ${schema}, public, pg_temp`)
 .replaceAll('search_path=public, pg_temp',`search_path=pg_catalog, ${schema}, public, pg_temp`)
 .replaceAll("convert_to(prosrc,'UTF8')",`convert_to(replace(prosrc,${q(schema+'.')},'public'||'.'),'UTF8')`)
 .replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')",`replace(replace(p.prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`);
 const statements=[];let count=0;
 const ok=(condition,label)=>{statements.push(`PERFORM qa_assert((${condition}),${q(label)});checks:=checks+1;`);count++;};
 const rejects=(sql,error,label)=>ok(`qa_rejects(${sql},${q(error)})`,label);
 ok(`(SELECT count(*)=26 FROM payroll_novelty_batch WHERE period_month=DATE '2026-11-01' AND status='approved')`,'26 previously approved complete batches remain available');
 // Prior synthetic writers enqueue the unchanged deferred audit. Discharge it
 // before DDL; production installation contains no preceding business writes.
 statements.push('SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;');
 statements.push(...installation.installation.map(s=>`EXECUTE ${q(relocate(s))};`));
 ok(`current_setting('municontrol_sql120.before')::jsonb=current_setting('municontrol_sql120.after')::jsonb`,'exact installation preserves all previous rows metadata permissions and guard identities');
 statements.push(...installation.durableVerification.map(s=>`EXECUTE ${q(relocate(s))};`));
 ok(`current_setting('municontrol_sql120.before')::jsonb=current_setting('municontrol_sql120.after')::jsonb`,'independent metadata verification retains the initial installation fingerprint');
 ok(`(SELECT count(*)=3 FROM pg_class WHERE relnamespace=${q(schema)}::regnamespace AND relname IN('payroll_monthly_annul_proposal','payroll_monthly_annul_review','payroll_monthly_annul_attempt') AND relrowsecurity)`,'three append-only private tables installed with RLS');
 ok(`(SELECT count(*)=4 FROM pg_proc WHERE pronamespace=${q(schema)}::regnamespace AND proname LIKE 'payroll_monthly_annul_%' AND has_function_privilege('municontrol_actions_runtime_app',oid,'EXECUTE'))`,'only four runtime facades are executable');
 ok(`NOT has_table_privilege('municontrol_actions_runtime_app','payroll_monthly_annul_review','INSERT')`,'runtime cannot forge a persisted review');
 rejects(q(migration),'PAYROLL_MONTHLY_ANNUL_PREREQUISITE_DRIFT','reinstall cannot overwrite the changed guarded ledger');
 statements.push(`annul_boot:=payroll_monthly_annul_bootstrap_v1(maker,DATE '2026-11-01');`);
 ok(`annul_boot->>'complete'='true' AND jsonb_array_length(annul_boot->'candidates')=26`,'bootstrap includes every approved batch, without page truncation');
 statements.push(`annul_items:='[]'::jsonb;
 FOR annul_id IN SELECT id FROM payroll_novelty_batch WHERE period_month=DATE '2026-11-01' AND status='approved' ORDER BY id LOOP
  annul_detail:=payroll_monthly_annul_detail_v1(maker,'candidate',annul_id);
  annul_items:=annul_items||jsonb_build_array(jsonb_build_object('batchId',annul_id,'expectedVersion',3,'snapshotSha256',annul_detail#>>'{items,0,snapshotSha256}'));
 END LOOP;
 annul_body:=jsonb_build_object('command','propose','proposalId',NULL,'proposalSha256',NULL,'items',annul_items,'reason','Motivo administrativo sintético completo');
 annul_key:=gen_random_uuid();annul_receipt:=payroll_monthly_annul_command_v1(maker,annul_body,annul_key);
 annul_proposal:=(annul_receipt->>'proposalId')::uuid;`);
 ok(`annul_receipt->>'status'='pending' AND (SELECT count(*)=26 FROM payroll_novelty_batch WHERE period_month=DATE '2026-11-01' AND status='approved')`,'proposal preserves all approvals, rows and eligibility until review');
 ok(`payroll_monthly_annul_command_v1(maker,annul_body,annul_key)=annul_receipt||jsonb_build_object('replayed',true)`,'proposer original request recovers the immutable receipt');
 ok(`payroll_monthly_annul_attempt_v1(maker,annul_key)=annul_receipt||jsonb_build_object('replayed',true)`,'read-only recovery keeps the original key/body');
 rejects(`format('SELECT payroll_monthly_annul_command_v1(%L::jsonb,%L::jsonb,%L::uuid)',maker,annul_body||jsonb_build_object('reason','Otra razón administrativa sintética'),annul_key)`,'PAYROLL_MONTHLY_ANNUL_IDEMPOTENCY_REUSE','same key with changed reason never becomes another proposal');
 rejects(`format('SELECT payroll_monthly_annul_command_v1(%L::jsonb,%L::jsonb,%L::uuid)',maker,annul_body,gen_random_uuid())`,'PAYROLL_MONTHLY_ANNUL_PENDING_EXISTS','overlapping pending proposals are refused');
 statements.push(`annul_detail:=payroll_monthly_annul_detail_v1(checker,'proposal',annul_proposal);
 annul_review:=jsonb_build_object('command','approve','proposalId',annul_proposal,'proposalSha256',annul_detail->>'proposalSha256','items',NULL,'reason','Decisión administrativa independiente sintética');`);
 ok(`annul_detail->>'canReview'='true' AND jsonb_array_length(annul_detail->'items')=26`,'other authorized person sees all frozen approved batches');
 rejects(`format('SELECT payroll_monthly_annul_command_v1(%L::jsonb,%L::jsonb,%L::uuid)',maker,annul_review,gen_random_uuid())`,'PAYROLL_MONTHLY_ANNUL_MAKER_CHECKER_REQUIRED','proposer cannot approve its own proposal');
 rejects(`format('SELECT payroll_monthly_annul_command_v1(%L::jsonb,%L::jsonb,%L::uuid)',same_person,annul_review,gen_random_uuid())`,'PAYROLL_MONTHLY_ANNUL_MAKER_CHECKER_REQUIRED','another membership of the same person cannot approve');
 ok(`payroll_monthly_annul_detail_v1(same_person,'proposal',annul_proposal)->>'canReview'='false'`,'same person never receives a review action');
 statements.push(`annul_review_receipt:=payroll_monthly_annul_command_v1(checker,annul_review||jsonb_build_object('command','reject'),gen_random_uuid());`);
 ok(`annul_review_receipt->>'status'='rejected' AND (SELECT count(*)=26 FROM payroll_novelty_batch WHERE period_month=DATE '2026-11-01' AND status='approved' AND version=3 AND exportable)`,'rejection leaves every original approval and eligibility unchanged');
 ok(`(SELECT count(*)=0 FROM payroll_novelty_event WHERE command='annul')`,'rejection never inserts an annul event');
 statements.push(`annul_key:=gen_random_uuid();annul_receipt:=payroll_monthly_annul_command_v1(maker,annul_body,annul_key);annul_proposal:=(annul_receipt->>'proposalId')::uuid;
 annul_detail:=payroll_monthly_annul_detail_v1(checker,'proposal',annul_proposal);
 annul_review:=annul_review||jsonb_build_object('proposalId',annul_proposal,'proposalSha256',annul_detail->>'proposalSha256');
 CREATE FUNCTION qa_abort_annul_v1() RETURNS trigger LANGUAGE plpgsql AS $abort$ BEGIN
  IF NEW.command='annul' AND (SELECT count(*) FROM payroll_novelty_event WHERE command='annul')=2 THEN RAISE EXCEPTION 'ANNUL_QA_ABORT';END IF;RETURN NEW;
 END $abort$;
 CREATE TRIGGER qa_abort_annul AFTER INSERT ON payroll_novelty_event FOR EACH ROW EXECUTE FUNCTION qa_abort_annul_v1();`);
 rejects(`format('SELECT payroll_monthly_annul_command_v1(%L::jsonb,%L::jsonb,%L::uuid)',checker,annul_review,gen_random_uuid())`,'ANNUL_QA_ABORT','failure after the first annulled batch rolls back the entire command');
 ok(`(SELECT count(*)=26 FROM payroll_novelty_batch WHERE period_month=DATE '2026-11-01' AND status='approved' AND version=3 AND exportable) AND (SELECT count(*)=0 FROM payroll_novelty_event WHERE command='annul') AND NOT EXISTS(SELECT 1 FROM payroll_monthly_annul_review ar WHERE ar.proposal_id=annul_proposal)`,'rollback conserves all batches, events and the pending proposal');
 statements.push(`DROP TRIGGER qa_abort_annul ON payroll_novelty_event;DROP FUNCTION qa_abort_annul_v1();`);
 rejects(`format('UPDATE payroll_novelty_batch SET status=''cancelled'',version=version+1,reason_code=''annulled_after_review'',reason_reference=%L,exportable=false WHERE id=%L::uuid','ref:'||gen_random_uuid()::text,annul_items#>>'{0,batchId}')`,'PAYROLL_MONTHLY_ANNUL_AUDIT_REQUIRED','direct approved cancellation cannot forge a review reference');
 statements.push(`annul_review_key:=gen_random_uuid();annul_review_receipt:=payroll_monthly_annul_command_v1(checker,annul_review,annul_review_key);
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;`);
 ok(`annul_review_receipt->>'status'='approved' AND (SELECT count(*)=26 AND sum(row_count)=39 FROM payroll_novelty_batch WHERE period_month=DATE '2026-11-01' AND status='cancelled' AND version=4 AND reason_code='annulled_after_review' AND NOT exportable)`,'independent approval atomically annuls all 26 complete batches');
 ok(`(SELECT bool_and(b.approved_by_membership_id=(i#>>'{guardBatch,approved_by_membership_id}')::uuid AND b.approved_by_person_id=(i#>>'{guardBatch,approved_by_person_id}')::uuid) FROM payroll_monthly_annul_proposal p CROSS JOIN LATERAL jsonb_array_elements(p.items) i JOIN payroll_novelty_batch b ON b.id=(i#>>'{batch,id}')::uuid WHERE p.id=annul_proposal)`,'original approving person and membership are preserved');
 ok(`(SELECT count(*)=26 FROM payroll_novelty_event WHERE command='annul' AND reason_reference='ref:'||(annul_review_receipt->>'eventId') AND from_status='approved' AND to_status='cancelled')`,'every original batch retains its independent append-only annul event');
 ok(`(SELECT bool_and(NOT grh_mutation AND NOT payroll_calculated AND NOT payroll_posted) FROM payroll_novelty_batch)`,'no monthly administrative action calculates posts or mutates GRH');
 ok(`payroll_monthly_annul_command_v1(checker,annul_review,annul_review_key)=annul_review_receipt||jsonb_build_object('replayed',true)`,'annuller original request replay creates no extra event');
 ok(`payroll_monthly_annul_detail_v1(checker,'proposal',annul_proposal)->'items'=annul_detail->'items'`,'reviewed original approval snapshots survive the new cancellation');
 ok(`(SELECT count(*)=39 FROM payroll_novelty_row WHERE batch_id IN(SELECT (i#>>'{batch,id}')::uuid FROM jsonb_array_elements(annul_detail->'items') i))`,'annulment preserves all original native and historical rows');
 statements.push(`SELECT b.id,e.idempotency_key INTO annul_id,annul_key FROM payroll_novelty_batch b JOIN payroll_novelty_event e ON e.batch_id=b.id AND e.command='submit' WHERE b.period_month=DATE '2026-11-01' AND b.contract_version='payroll-novelty-batch.v2' LIMIT 1;
 annul_receipt:=payroll_novelty_transition_v2(maker,annul_id,'submit',1,'ready_for_review',NULL,annul_key,repeat('b',64));`);
 ok(`annul_receipt->>'replayed'='true' AND annul_receipt#>>'{data,status}'='submitted' AND annul_receipt#>>'{data,version}'='2' AND annul_receipt#>>'{data,decidedAt}' IS NULL`,'old native submission receipt keeps its original state and timeline after annulment');
 rejects(`format('SELECT payroll_novelty_export_v2(%L::jsonb,%L::uuid)',maker,annul_items#>>'{0,batchId}')`,'PAYROLL_NOVELTY_EXPORT_INVALID','existing export path refuses an annulled batch');
 rejects(q('UPDATE payroll_monthly_annul_proposal SET reason=reason'),'PAYROLL_NOVELTY_APPEND_ONLY','proposal cannot be rewritten');
 rejects(q('DELETE FROM payroll_monthly_annul_review'),'PAYROLL_NOVELTY_APPEND_ONLY','review cannot be deleted');
 rejects(q('TRUNCATE payroll_monthly_annul_attempt'),'PAYROLL_NOVELTY_APPEND_ONLY','recovery receipts cannot be truncated');
 const declarations=`DECLARE annul_boot jsonb;annul_items jsonb;annul_body jsonb;annul_detail jsonb;annul_receipt jsonb;annul_review jsonb;annul_review_receipt jsonb;annul_id uuid;annul_key uuid;annul_review_key uuid;annul_proposal uuid; BEGIN`;
 const block=declarations+'\n'+statements.join('\n')+'\nEND;\n';
 const anchor="RAISE EXCEPTION USING ERRCODE='P1010',MESSAGE='RESTORE_NATIVE_MONTHLY_FIXTURES';";assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,monthlyAnnulChecksPassed:count,migration120Sha256:createHash('sha256').update(original).digest('hex'),checksPassed:base.report.checksPassed+count};
 let sql=base.sql.replace(anchor,()=>block+anchor).replace(`checks<>${base.report.checksPassed} THEN`,`checks<>${report.checksPassed} THEN`).replace(JSON.stringify(base.report),()=>JSON.stringify(report));
 assert.doesNotMatch(sql,/INSERT\s+INTO\s+public\./i);return {...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const options={};for(const arg of process.argv.slice(2)){const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(arg);if(arg==='--ci')continue;assert.ok(m,'Unknown argument');options[m[1]]=m[2];}
  assert.ok(process.argv.includes('--ci'));assert.ok(options['write-sql']);const test=buildMonthlyAnnulQa({serverMajor:options['expected-major'],requireConcurrency:Boolean(options['write-lock-sql'])});
  for(const[k,v]of [['write-sql',test.sql],['write-lock-sql',test.lockSql]])if(options[k])fs.writeFileSync(options[k],v,{flag:'wx'});
  console.log(JSON.stringify({databaseExecuted:false,checksPlanned:test.report.checksPassed,monthlyAnnulChecksPlanned:test.report.monthlyAnnulChecksPassed}));
 }catch(error){console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}
}
