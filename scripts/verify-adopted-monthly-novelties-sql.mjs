// Synthetic writes only, within the existing loopback QA transaction.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildAdoptedFixedQa } from './verify-adopted-fixed-novelties-sql.mjs';
import { adoptionQaOutputPath } from './verify-employment-adoption-preparation-sql.mjs';
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const j = value => q(JSON.stringify(value)) + '::jsonb';
const once = (source, anchor, replacement) => {
  assert.equal(source.split(anchor).length, 2, 'QA anchor changed');
  return source.replace(anchor, () => replacement);
};
const anchor = "RAISE EXCEPTION USING ERRCODE='P1361';EXCEPTION WHEN SQLSTATE 'P1361' THEN NULL;END;";
export const ADOPTED_MONTHLY_PATCH_FUNCTIONS = [
  'payroll_novelty_assert_context_v1(jsonb,text)',
  'payroll_novelty_native_rows_valid_v2(jsonb,text)',
  'payroll_novelty_subject_v2(jsonb,uuid,boolean)',
  'payroll_novelty_native_subject_v2(jsonb,jsonb,date,boolean)'
];
export async function buildAdoptedMonthlyQa({ serverMajor, calibrateOnly = false }) {
  const base = await buildAdoptedFixedQa({ serverMajor, withMonthlySource: true });
  const { schema } = base;
  const names = ADOPTED_MONTHLY_PATCH_FUNCTIONS.map(name => schema + '.' + name);
  const calibration = `RAISE NOTICE 'SQL139_PINS %', (SELECT jsonb_object_agg(signature,encode(sha256(convert_to(replace(replace(p.prosrc,E'\\r\\n',E'\\n'),${q(schema + '.')},'public'||'.'),'UTF8')),'hex')) FROM unnest(ARRAY[${names.map(q).join(',')}]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature));`;
  if (calibrateOnly) return { ...base, sql: once(base.sql, anchor, calibration + '\n' + anchor) };
  const migration = fs.readFileSync(new URL('./migrations/139-adopted-monthly-novelties.sql', import.meta.url), 'utf8');
  const relocate = value => value.replaceAll('public.',schema+'.')
    .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
    .replaceAll('SET search_path=pg_catalog,public,pg_temp','SET search_path=pg_catalog,'+schema+',public,pg_temp')
    .replaceAll("ARRAY['search_path=public, pg_temp']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']")
    .replaceAll("ARRAY['search_path=pg_catalog, public, pg_temp']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']")
    .replace("replace(original.prosrc,E'\\r\\n',E'\\n')","replace(replace(original.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')");
  const caps = `INSERT INTO capabilities SELECT actor,c FROM unnest(ARRAY[(maker->>'membershipId')::uuid,(checker->>'membershipId')::uuid]) actor CROSS JOIN unnest(ARRAY['payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export']) c WHERE NOT EXISTS(SELECT 1 FROM capabilities a WHERE a.membership_id=actor AND a.capability_key=c);
   INSERT INTO capabilities SELECT (maker->>'membershipId')::uuid,'payroll.novelty.prepare' WHERE NOT EXISTS(SELECT 1 FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key='payroll.novelty.prepare');
   INSERT INTO capabilities SELECT (checker->>'membershipId')::uuid,'payroll.novelty.approve' WHERE NOT EXISTS(SELECT 1 FROM capabilities WHERE membership_id=(checker->>'membershipId')::uuid AND capability_key='payroll.novelty.approve');`;
  const row = (subject, amount='NULL', quantity="'100'") => `jsonb_build_array(jsonb_build_object('rowOrdinal',1,'legajo',${subject}->>'legajo','contractId',${subject}->>'contractId','identityToken',${subject}->>'identityToken','conceptSourceId','95','costCenterSourceId',NULL,'adjustmentMonth',NULL,'quantityDecimal',${quantity},'amountCents',${amount},'movementType','standard','legalInstrument','Resolución sintética mensual QA','observation',NULL,'forced',false))`;
  const prepare = (actor='maker',rows='mm_rows',key='mm_key',period="DATE '2026-10-01'") => `payroll_novelty_prepare_v2(${actor},'individual',${period},'monthly',${rows},${key},repeat('a',64))`;
  // Persist a genuine v2 monthly approval before the actor is adopted. Later
  // retry assertions use this exact original body, key and event snapshot.
  const sourceAnchor = "UPDATE employment_contract SET start_date=NULL,end_date=NULL,status='unknown',legacy_legajo=legacy_legajo";
  const legacy = `DECLARE prev_hire jsonb;prev_subject jsonb;prev_rows jsonb;prev_saved jsonb;prev_key uuid:=gen_random_uuid();BEGIN
   ${caps}
   prev_hire:=native_employee_create_v1(maker,new_draft||'{"dni":"99000139","cuil":"20990001392","legajo":"55139","fullName":"Registro sintético mensual anterior","startDate":"2026-10-01","agreementCode":"1","categoryCode":"1","organizationId":"10","sectorCode":"20"}'::jsonb,native_employee_catalog_v1(native_employee_context_v1(maker))->>'version',gen_random_uuid());
   prev_subject:=payroll_novelty_employee_v2(maker,(prev_hire->>'contractId')::uuid)->'subject';prev_rows:=${row('prev_subject',"'0'",'NULL')};
   prev_saved:=${prepare('maker','prev_rows','prev_key')};
   PERFORM payroll_novelty_transition_v2(maker,(prev_saved#>>'{data,id}')::uuid,'submit',1,'ready_for_review',NULL,gen_random_uuid(),repeat('b',64));
   PERFORM payroll_novelty_transition_v2(checker,(prev_saved#>>'{data,id}')::uuid,'approve',2,'validated_for_export',NULL,gen_random_uuid(),repeat('b',64));
   CREATE TEMP TABLE qa139_legacy ON COMMIT DROP AS SELECT prev_rows rows,prev_key key,prev_saved receipt,
    to_jsonb(mm139_b) batch,(SELECT jsonb_agg(to_jsonb(mm139_r) ORDER BY mm139_r.row_ordinal) FROM payroll_novelty_row mm139_r WHERE mm139_r.batch_id=mm139_b.id) stored_rows,
    (SELECT jsonb_agg(to_jsonb(mm139_e) ORDER BY mm139_e.id) FROM payroll_novelty_event mm139_e WHERE mm139_e.batch_id=mm139_b.id) events
    FROM payroll_novelty_batch mm139_b WHERE mm139_b.id=(prev_saved#>>'{data,id}')::uuid;
  END;`;
  const statements=[];let checks=0;
  const ok=(expression,label)=>{statements.push('PERFORM qa_assert(('+expression+'),'+q(label)+');checks:=checks+1;');checks++;};
  const rejects=(sql,error,label)=>ok('qa_rejects('+q(sql)+','+q(error)+')',label);
  const rejectExpr=(sql,args,error,label)=>ok('qa_rejects(format('+q(sql)+','+args+'),'+q(error)+')',label);
  const mutate=(sql,body)=>{statements.push('BEGIN '+sql);body();statements.push("RAISE EXCEPTION USING ERRCODE='P1392';EXCEPTION WHEN SQLSTATE 'P1392' THEN NULL;END;");};
  statements.push(`DECLARE mm_target uuid;mm_subject jsonb;mm_rows jsonb;mm_saved jsonb;mm_key uuid:=gen_random_uuid();mm_id uuid;mm_before text;mm_metadata jsonb;mm_old record;mm_life jsonb;mm_movement jsonb;mm_pending uuid;BEGIN
   ${caps}
   SELECT id INTO STRICT mm_target FROM employment_contract WHERE legacy_legajo='A/3501';SELECT * INTO STRICT mm_old FROM qa139_legacy;
   mm_before:=(SELECT md5(jsonb_build_object('batches',(SELECT jsonb_agg(to_jsonb(mm139_b) ORDER BY mm139_b.id) FROM payroll_novelty_batch mm139_b),'rows',(SELECT jsonb_agg(to_jsonb(mm139_r) ORDER BY mm139_r.batch_id,mm139_r.row_ordinal) FROM payroll_novelty_row mm139_r),'events',(SELECT jsonb_agg(to_jsonb(mm139_e) ORDER BY mm139_e.id) FROM payroll_novelty_event mm139_e))::text));
   SELECT jsonb_agg(to_jsonb(mm139_p)-'prosrc' ORDER BY mm139_p.oid) INTO mm_metadata FROM pg_proc mm139_p WHERE mm139_p.oid IN(SELECT to_regprocedure(mm139_sig) FROM unnest(ARRAY[${names.map(q).join(',')}]) mm139_sig);`);
  rejectExpr('SELECT payroll_novelty_employee_v2(%L::jsonb,%L::uuid)','maker,mm_target','PAYROLL_NOVELTY_IDENTITY_CHANGED','original monthly consumer refuses the adopted opaque contract');
  rejectExpr("SELECT payroll_novelty_assert_context_v1(%L::jsonb,'payroll.novelty.approve')",'checker','PAYROLL_NOVELTY_EMPLOYMENT_REQUIRED','original monthly context loses the adopted checker');
  statements.push('EXECUTE '+q(relocate(migration))+';');
  ok(`mm_metadata=(SELECT jsonb_agg(to_jsonb(mm139_p)-'prosrc' ORDER BY mm139_p.oid) FROM pg_proc mm139_p WHERE mm139_p.oid IN(SELECT to_regprocedure(mm139_sig) FROM unnest(ARRAY[${names.map(q).join(',')}]) mm139_sig))`,'all four patched private routines preserve OID, owner, ACL, volatility, argument names and settings');
  ok(`mm_before=(SELECT md5(jsonb_build_object('batches',(SELECT jsonb_agg(to_jsonb(mm139_b) ORDER BY mm139_b.id) FROM payroll_novelty_batch mm139_b),'rows',(SELECT jsonb_agg(to_jsonb(mm139_r) ORDER BY mm139_r.batch_id,mm139_r.row_ordinal) FROM payroll_novelty_row mm139_r),'events',(SELECT jsonb_agg(to_jsonb(mm139_e) ORDER BY mm139_e.id) FROM payroll_novelty_event mm139_e))::text))`,'installation preserves every original monthly batch, row and event byte');
  rejects(relocate(migration),'PAYROLL_MONTHLY_ADOPTION_DEFINITION_CHANGED: assert_context_v1','raw repetition refuses the changed prerequisites without rewriting stored records');
  ok(`NOT EXISTS(SELECT 1 FROM pg_proc mm139_p WHERE mm139_p.oid IN(SELECT to_regprocedure(mm139_sig) FROM unnest(ARRAY[${names.map(q).join(',')}]) mm139_sig) AND has_function_privilege('municontrol_actions_runtime_app',mm139_p.oid,'EXECUTE'))`,'private adapters receive no direct runtime grants');
  ok("payroll_novelty_assert_context_v1(maker,'payroll.novelty.prepare')->>'employmentLinked'='true' AND payroll_novelty_assert_context_v1(checker,'payroll.novelty.approve')->>'employmentLinked'='true'",'existing separately linked adopted operators resolve without creating new employment links');
  statements.push('SET LOCAL ROLE municontrol_actions_runtime_app;mm_subject:=payroll_novelty_employee_v2(maker,mm_target)->\'subject\';RESET ROLE;mm_rows:='+row('mm_subject')+';');
  ok("mm_subject->>'origin'='MUNICONTROL' AND mm_subject->>'legajo'='A/3501' AND mm_subject->>'sourceCutoff' IS NULL",'runtime selects the exact municipal contract UUID and opaque legajo without fabricated source cutoff');
  ok("payroll_novelty_native_rows_valid_v2(mm_rows,'individual') AND NOT payroll_novelty_rows_valid_v1(jsonb_build_array((mm_rows->0)-'contractId'-'identityToken'),'individual')",'opaque identifiers are accepted only by the explicit native row contract');
  ok("payroll_novelty_native_rows_valid_v2(jsonb_set(mm_rows,'{0,legajo}',to_jsonb(' A/009010 '::text)),'individual') AND payroll_novelty_native_rows_valid_v2(jsonb_set(mm_rows,'{0,legajo}',to_jsonb(repeat('😀',64))),'individual')",'raw leading zeroes, spaces and 64 Unicode codepoints fit the native snapshot');
  ok("NOT payroll_novelty_native_rows_valid_v2(jsonb_set(mm_rows,'{0,legajo}',to_jsonb(repeat('😀',65))),'individual') AND NOT payroll_novelty_native_rows_valid_v2(jsonb_set(mm_rows,'{0,legajo}',to_jsonb(chr(159))),'individual')",'overlong identifiers and C1 controls are rejected');
  ok("NOT payroll_novelty_native_rows_valid_v2(jsonb_set(mm_rows,'{0,conceptSourceId}','\"095\"'),'individual') AND NOT payroll_novelty_native_rows_valid_v2(mm_rows||mm_rows,'individual')",'concept grammar and the published one-row limit are preserved');
  statements.push('SET LOCAL ROLE municontrol_actions_runtime_app;mm_saved:='+prepare()+';RESET ROLE;mm_id:=(mm_saved#>>\'{data,id}\')::uuid;');
  ok("mm_saved#>>'{data,contractVersion}'='payroll-novelty-batch.v2' AND mm_saved#>>'{data,rows,0,legajo}'='A/3501' AND mm_saved#>>'{data,rows,0,quantityDecimal}'='100' AND mm_saved#>'{data,rows,0,amountCents}'='null' AND mm_saved#>>'{data,payrollCalculated}'='false'",'real writer stores the whole code95 quantity without inventing an amount or calculating salary');
  ok(prepare()+"=mm_saved||'{\"replayed\":true}'::jsonb",'a lost acknowledgement repeats the exact body and key without creating a second batch');
  rejectExpr("SELECT payroll_novelty_prepare_v2(%L::jsonb,'individual',DATE '2026-10-01','monthly',%L::jsonb,gen_random_uuid(),repeat('a',64))",'maker,mm_rows','PAYROLL_NOVELTY_DUPLICATE_BATCH','a new key cannot duplicate an already active adopted batch');
  rejectExpr("SELECT payroll_novelty_prepare_v2(%L::jsonb,'individual',DATE '2026-10-01','monthly',%L::jsonb,%L::uuid,repeat('a',64))","maker,jsonb_set(mm_rows,'{0,quantityDecimal}','\"101\"'),mm_key",'PAYROLL_NOVELTY_IDEMPOTENCY_REUSE','a pending key cannot replace saved business values');
  rejectExpr("SELECT payroll_novelty_prepare_v2(%L::jsonb,'individual',DATE '2026-10-01','monthly',%L::jsonb,gen_random_uuid(),repeat('a',64))","maker,jsonb_set(mm_rows,'{0,legajo}','\"3501\"')",'PAYROLL_NOVELTY_IDENTITY_CHANGED','a caller cannot substitute a numeric snapshot for the selected adopted contract');
  statements.push("PERFORM payroll_novelty_transition_v2(maker,mm_id,'submit',1,'ready_for_review',NULL,gen_random_uuid(),repeat('b',64));");
  mutate("INSERT INTO capabilities SELECT (maker->>'membershipId')::uuid,'payroll.novelty.approve' WHERE NOT EXISTS(SELECT 1 FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key='payroll.novelty.approve');",()=>rejectExpr("SELECT payroll_novelty_transition_v2(%L::jsonb,%L::uuid,'approve',2,'validated_for_export',NULL,gen_random_uuid(),repeat('b',64))",'maker,mm_id','PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED','an author with dual permissions still cannot approve its own monthly batch'));
  statements.push("SET LOCAL ROLE municontrol_actions_runtime_app;PERFORM payroll_novelty_transition_v2(checker,mm_id,'approve',2,'validated_for_export',NULL,gen_random_uuid(),repeat('b',64));RESET ROLE;");
  ok("payroll_novelty_export_v2(maker,mm_id)#>>'{data,rows,0,identityCurrent}'='true' AND (SELECT count(*)=3 FROM payroll_novelty_event WHERE batch_id=mm_id) AND (SELECT array_agg(issue_code::text ORDER BY issue_code)=ARRAY['concept_not_observed','movement_type_not_observed'] AND bool_and(severity='warning' AND NOT is_blocking) FROM payroll_novelty_issue WHERE batch_id=mm_id) AND payroll_novelty_export_v2(maker,mm_id)#>'{data,rows,0,issues}'=mm_saved#>'{data,rows,0,issues}'",'independent approval makes the exact adopted batch exportable and retains both original observations');
  ok(prepare('maker','mm_old.rows','mm_old.key')+"=mm_old.receipt||'{\"replayed\":true}'::jsonb",'an original pre-adoption response recovers unchanged after actor adoption');
  ok("mm_old.batch=(SELECT to_jsonb(mm139_b) FROM payroll_novelty_batch mm139_b WHERE id=(mm_old.batch->>'id')::uuid) AND mm_old.stored_rows=(SELECT jsonb_agg(to_jsonb(mm139_r) ORDER BY row_ordinal) FROM payroll_novelty_row mm139_r WHERE batch_id=(mm_old.batch->>'id')::uuid) AND mm_old.events=(SELECT jsonb_agg(to_jsonb(mm139_e) ORDER BY id) FROM payroll_novelty_event mm139_e WHERE batch_id=(mm_old.batch->>'id')::uuid)",'old approved state, origin, subject, requests, receipts and full event history are never relabeled');
  ok("payroll_novelty_export_v2(maker,(mm_old.batch->>'id')::uuid)#>>'{data,rows,0,amountCents}'='0' AND payroll_novelty_export_v2(maker,mm_id)#>'{data,rows,0,amountCents}'='null'",'known zero remains distinct from the adopted row missing amount');
  rejectExpr('SELECT payroll_novelty_employee_v2(%L::jsonb,%L::uuid)',`maker,${q(base.ids.targetContract)}::uuid`,'PAYROLL_NOVELTY_PERIOD_OUTSIDE_EMPLOYMENT','unknown employment dates cannot become an invented open interval');
  mutate("DELETE FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key='payroll.novelty.prepare';",()=>rejectExpr("SELECT payroll_novelty_prepare_v2(%L::jsonb,'individual',DATE '2026-10-01','monthly',%L::jsonb,%L::uuid,repeat('a',64))",'maker,mm_rows,mm_key','PAYROLL_NOVELTY_CAPABILITY_REQUIRED','revoked preparation permission blocks even an already saved retry'));
  mutate("UPDATE tenant_action_employment_link SET active=false WHERE membership_id=(checker->>'membershipId')::uuid;",()=>rejectExpr("SELECT payroll_novelty_assert_context_v1(%L::jsonb,'payroll.novelty.approve')",'checker','PAYROLL_NOVELTY_EMPLOYMENT_REQUIRED','withdrawn checker employment cannot be replaced by an approved subject'));
  mutate("UPDATE tenant_identity_session SET status='revoked' WHERE id=(maker->>'actorSessionId')::uuid;",()=>rejectExpr("SELECT payroll_novelty_employee_v2(%L::jsonb,%L::uuid)",'maker,mm_target','PAYROLL_NOVELTY_SESSION_INVALID','expired session fails before an adopted identity is disclosed'));
  mutate('',()=>{
    statements.push('mm_rows:='+row('mm_subject',"'9007199254740993'",'NULL')+';mm_saved:='+prepare('maker','mm_rows','gen_random_uuid()')+';');
    ok("mm_saved#>>'{data,rows,0,amountCents}'='9007199254740993' AND mm_saved#>'{data,rows,0,quantityDecimal}'='null'",'SQL stores an exact integer amount beyond JavaScript safe integers');
  });
  mutate('',()=>{
    statements.push("mm_rows:="+row('mm_subject')+";mm_saved:="+prepare('maker','mm_rows','gen_random_uuid()',"DATE '2026-11-01'")+`;mm_pending:=(mm_saved#>>'{data,id}')::uuid;PERFORM payroll_novelty_transition_v2(maker,mm_pending,'submit',1,'ready_for_review',NULL,gen_random_uuid(),repeat('b',64));
     mm_life:=native_employment_lifecycle_bootstrap_v2(maker,mm_target);mm_movement:=native_employment_lifecycle_propose_v2(maker,jsonb_build_object('contractId',mm_target,'identityToken',mm_life#>>'{subject,identityToken}','scopeVersion',mm_life->>'scopeVersion','baseVersion',mm_life#>>'{employment,version}','movement','terminate','date','2026-10-07','reason','Baja sintética antes de revisión mensual','legalReference','Resolución QA'),gen_random_uuid());
     PERFORM native_employment_lifecycle_review_v2(checker,jsonb_build_object('contractId',mm_target,'proposalId',mm_movement->>'proposalId','scopeVersion',native_employment_lifecycle_bootstrap_v2(checker,mm_target)->>'scopeVersion','decision','approve','reason','Revisión independiente de baja QA'),gen_random_uuid());`);
    ok("payroll_novelty_detail_v2(maker,mm_pending)#>>'{data,rows,0,identityCurrent}'='false'",'a later verified termination invalidates a pending monthly identity for the uncovered period');
    rejectExpr("SELECT payroll_novelty_transition_v2(%L::jsonb,%L::uuid,'approve',2,'validated_for_export',NULL,gen_random_uuid(),repeat('b',64))",'checker,mm_pending','PAYROLL_NOVELTY_IDENTITY_CHANGED','approval cannot use a stale preparation after a lifecycle change');
    statements.push("PERFORM payroll_novelty_transition_v2(checker,mm_pending,'reject',2,'invalid_rows','ref:'||gen_random_uuid()::text,gen_random_uuid(),repeat('b',64));");
    ok("payroll_novelty_detail_v2(maker,mm_pending)#>>'{data,status}'='rejected'",'independent rejection remains available for an invalidated monthly preparation');
  });
  statements.push('END;');
  const report={...base.report,checksPassed:base.report.checksPassed+checks,adoptedMonthlyChecksPassed:checks,fullMonthlyWriter:true,
    limitations:[...base.report.limitations,'SQL139 full synthetic writer and review checked with rollback only; installation protocol, municipal installation, own-run consumers and publication remain pending.']};
  let sql=once(base.sql,sourceAnchor,legacy+'\n'+sourceAnchor);
  sql=once(sql,anchor,statements.join('\n')+'\n'+anchor);
  sql=once(sql,'checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed);
  sql=once(sql,j(base.report),j(report));
  return {...base,sql,report};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--(expected-major|write-sql|calibrate-only)=(.+)$/.exec(arg);
    assert.ok(match); assert.equal(args[match[1]], undefined); args[match[1]] = match[2];
  }
  const file = adoptionQaOutputPath(args['write-sql']);
  const qa = await buildAdoptedMonthlyQa({ serverMajor: Number(args['expected-major']), calibrateOnly: args['calibrate-only'] === 'true' });
  fs.writeFileSync(file, qa.sql, { flag: 'wx' });
  console.log(JSON.stringify({ generated: true, databaseExecuted: false, calibrationOnly: args['calibrate-only']==='true', checksPlanned: qa.report.checksPassed, adoptedMonthlyChecksPlanned:qa.report.adoptedMonthlyChecksPassed }));
}
