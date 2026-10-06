// Existing loopback QA databases only. Every fixture and write is synthetic.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildAdoptedOperatorContextQa } from './verify-adopted-operator-context-sql.mjs';
import { adoptionQaOutputPath } from './verify-employment-adoption-preparation-sql.mjs';
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
const j = v => q(JSON.stringify(v)) + '::jsonb';
const once = (source, anchor, replacement) => {
  assert.equal(source.split(anchor).length, 2, 'QA anchor changed');
  return source.replace(anchor, () => replacement);
};
const anchor = "RAISE EXCEPTION USING ERRCODE='P1361';EXCEPTION WHEN SQLSTATE 'P1361' THEN NULL;END;";
export const ADOPTED_FIXED_PATCH_FUNCTIONS = [
  'payroll_fixed_registry_context_v1(jsonb,text)',
  'payroll_fixed_registry_employee_by_contract_v1(jsonb,uuid)',
  'payroll_fixed_registry_propose_v1(jsonb,jsonb,uuid)',
  'payroll_fixed_registry_review_v1(jsonb,jsonb,uuid)',
  'payroll_fixed_registry_event_identity_v1(jsonb,public.payroll_fixed_novelty_event)',
  'payroll_fixed_registry_identity_current_v1(jsonb,public.payroll_fixed_novelty)',
  'payroll_fixed_registry_native_dates_v1(jsonb,uuid,jsonb)',
  'payroll_fixed_registry_export_v1(jsonb,date,text)'
];
export async function buildAdoptedFixedQa({ serverMajor, calibrateOnly = false }) {
  const base = await buildAdoptedOperatorContextQa({ serverMajor });
  const names = ADOPTED_FIXED_PATCH_FUNCTIONS.map(name => name.replaceAll('public.', base.schema + '.'));
  const calibration = `RAISE NOTICE 'SQL138_PINS %', (SELECT jsonb_object_agg(signature,encode(sha256(convert_to(replace(replace(p.prosrc,E'\\r\\n',E'\\n'),${q(base.schema + '.')},'public'||'.'),'UTF8')),'hex')) FROM unnest(ARRAY[${names.map(name => q(base.schema + '.' + name)).join(',')}]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature));`;
  if (calibrateOnly) return { ...base, sql: once(base.sql, anchor, calibration + '\n' + anchor) };
  const { schema, ids } = base;
  const migration = fs.readFileSync(new URL('./migrations/138-adopted-fixed-novelties.sql', import.meta.url), 'utf8');
  const relocated = migration.replaceAll('public.', schema + '.').replaceAll(schema + '.digest(', 'public.digest(')
    .replaceAll("'public'::regnamespace", q(schema) + '::regnamespace')
    .replaceAll('SET search_path=pg_catalog,public,pg_temp', 'SET search_path=pg_catalog,' + schema + ',public,pg_temp')
    .replace("ARRAY['search_path=pg_catalog, public, pg_temp']", "ARRAY['search_path=pg_catalog, " + schema + ", public, pg_temp']")
    .replace("replace(original.prosrc,E'\\r\\n',E'\\n')", "replace(replace(original.prosrc,E'\\r\\n',E'\\n')," + q(schema + '.') + ",'public'||'.')");
  const groupSql = ['117-fixed-novelty-annul-groups.sql','118-fixed-novelty-correction-groups.sql','119-fixed-novelty-review-groups.sql'].map(file =>
    fs.readFileSync(new URL('./migrations/' + file,import.meta.url),'utf8').replaceAll('public.',schema+'.')
      .replaceAll('SET search_path=pg_catalog,public,pg_temp','SET search_path=pg_catalog,'+schema+',public,pg_temp'));
  const statements = []; let checks = 0;
  const ok = (expression, label) => { statements.push('PERFORM qa_assert((' + expression + '),' + q(label) + ');checks:=checks+1;'); checks++; };
  const reject = (command, args, error, label) => ok('qa_rejects(format(' + q('SELECT ' + command + '(' + args.map((_, i) => '%' + (i + 1) + '$L::' + (i === args.length - 1 ? 'uuid' : 'jsonb')).join(',') + ')') + ',' + args.join(',') + '),' + q(error) + ')', label);
  const mutate = (sql, fn) => { statements.push('BEGIN ' + sql); fn(); statements.push("RAISE EXCEPTION USING ERRCODE='P1382';EXCEPTION WHEN SQLSTATE 'P1382' THEN NULL;END;"); };
  const target = 'fx_target';
  const values = j({conceptSourceId:'95',costCenterSourceId:null,payrollType:'monthly',quantityDecimal:'100',amountCents:null,forced:false,forcedReason:null,legalInstrument:'Resolución sintética QA 138',validFrom:'2020-01-01',validTo:'2020-01-31'});
  // Save a real original-facade proposal/approval before adoption. Later checks
  // compare every saved root/event/request/key byte, rather than forged receipts.
  const sourceAnchor = "UPDATE employment_contract SET start_date=NULL,end_date=NULL,status='unknown',legacy_legajo=legacy_legajo";
  const legacy = `DECLARE old_subject jsonb;old_body jsonb;old_saved jsonb;old_review jsonb;old_key uuid:=gen_random_uuid();old_review_key uuid:=gen_random_uuid();BEGIN
   old_subject:=payroll_fixed_registry_employee_by_contract_v1(maker,${q(ids.makerContract)}::uuid)->'subject';
   old_body:=jsonb_build_object('recordId',NULL,'expectedVersion',0,'contractId',old_subject->>'contractId','legajo',old_subject->>'legajo','identityToken',old_subject->>'identityToken','operation','set','values',${values}||'{"conceptSourceId":"27"}'::jsonb,'reason','Novedad anterior a la adopción sintética');
   old_saved:=payroll_fixed_registry_propose_v1(maker,old_body,old_key);
   old_review:=jsonb_build_object('recordId',old_saved->>'recordId','proposalId',old_saved->>'proposalId','expectedVersion',1,'decision','approve','reason','Revisión anterior a la adopción sintética');
   PERFORM payroll_fixed_registry_review_v1(checker,old_review,old_review_key);
   CREATE TEMP TABLE qa138_legacy ON COMMIT DROP AS SELECT old_body body,old_saved receipt,old_key key,old_review review_body,old_review_key review_key,
    to_jsonb(fx138_n) root,(SELECT jsonb_agg(to_jsonb(fx138_e) ORDER BY fx138_e.version) FROM payroll_fixed_novelty_event fx138_e WHERE fx138_e.record_id=fx138_n.id) events
    FROM payroll_fixed_novelty fx138_n WHERE fx138_n.id=(old_saved->>'recordId')::uuid;
  END;`;
  statements.push(`DECLARE fx_subject jsonb;fx_body jsonb;fx_saved jsonb;fx_review jsonb;fx_result jsonb;fx_list jsonb;fx_export jsonb;
   fx_key uuid:=gen_random_uuid();fx_review_key uuid:=gen_random_uuid();fx_metadata jsonb;fx_fingerprint text;fx_legacy record;fx_root uuid;fx_actor jsonb;fx_target uuid;fx_second uuid;fx_life jsonb;fx_life_saved jsonb;fx_group jsonb;fx_group_saved jsonb;
   BEGIN
   SELECT id INTO STRICT fx_target FROM employment_contract WHERE legacy_legajo='A/3501';
   SELECT id INTO STRICT fx_second FROM employment_contract WHERE legacy_legajo='3504';
   SELECT * INTO STRICT fx_legacy FROM qa138_legacy;
   ${groupSql.map(sql => 'EXECUTE '+q(sql)+';').join('\n')}
   SELECT jsonb_agg(to_jsonb(fx138_p)-'prosrc' ORDER BY fx138_p.oid) INTO fx_metadata FROM pg_proc fx138_p WHERE fx138_p.oid IN(SELECT to_regprocedure(fx138_sig) FROM unnest(ARRAY[${names.map(name => q(schema + '.' + name)).join(',')}]) fx138_sig);
   fx_fingerprint:=(SELECT md5(jsonb_agg(to_jsonb(fx138_e) ORDER BY fx138_e.id)::text) FROM payroll_fixed_novelty_event fx138_e);
   PERFORM qa_assert(qa_rejects(format('SELECT payroll_fixed_registry_context_v1(%L::jsonb,%L)',maker,'payroll.fixed.prepare'),'PAYROLL_FIXED_EMPLOYMENT_REQUIRED'),'before SQL138 adopted operator cannot prepare fixed novelties');checks:=checks+1;
   EXECUTE ${q(relocated)};`); checks++;
  ok(`fx_metadata=(SELECT jsonb_agg(to_jsonb(fx138_p)-'prosrc' ORDER BY fx138_p.oid) FROM pg_proc fx138_p WHERE fx138_p.oid IN(SELECT to_regprocedure(fx138_sig) FROM unnest(ARRAY[${names.map(name => q(schema + '.' + name)).join(',')}]) fx138_sig))`, 'eight patched facades preserve OIDs, owner, ACLs, volatility, parameter names and settings');
  ok(`fx_fingerprint=(SELECT md5(jsonb_agg(to_jsonb(fx138_e) ORDER BY fx138_e.id)::text) FROM payroll_fixed_novelty_event fx138_e)`, 'installation never rewrites or creates fixed events');
  ok(`qa_rejects(${q(relocated)},'PAYROLL_FIXED_ADOPTION_PREREQUISITE')`, 'a raw installation rerun is refused without changing existing definitions');
  ok(`NOT EXISTS(SELECT 1 FROM pg_proc fx138_p CROSS JOIN LATERAL aclexplode(coalesce(fx138_p.proacl,acldefault('f',fx138_p.proowner))) a WHERE fx138_p.pronamespace=${q(schema)}::regnamespace AND fx138_p.proname IN('payroll_fixed_registry_adopted_subject_v1','payroll_fixed_registry_subject_v2','payroll_fixed_registry_stored_subject_v2','payroll_fixed_registry_range_v2','payroll_fixed_registry_actor_v2') AND a.grantee<>fx138_p.proowner)`, 'all five new helpers remain private without new runtime or PUBLIC grants');
  ok(`payroll_fixed_registry_context_v1(maker,'payroll.fixed.prepare')->>'actorPersonId'=${q(ids.makerPerson)} AND payroll_fixed_registry_context_v1(checker,'payroll.fixed.approve')->>'employmentLinked'='true'`, 'already linked active adopted operators retain separate prepare and approve authority');
  mutate("DELETE FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key='workforce.employee.read';", () => ok(`payroll_fixed_registry_context_v1(maker,'payroll.fixed.prepare')->>'employmentLinked'='true' AND payroll_fixed_registry_employee_by_contract_v1(maker,${target})#>>'{subject,legajo}'='A/3501'`, 'fixed UUID handoff does not add workforce read as a payroll requirement'));
  statements.push(`SET LOCAL ROLE municontrol_actions_runtime_app;fx_subject:=payroll_fixed_registry_employee_by_contract_v1(maker,${target})->'subject';RESET ROLE;`);
  ok(`fx_subject->>'origin'='MUNICONTROL' AND fx_subject->>'legajo'='A/3501' AND fx_subject->>'sourceCutoff' IS NULL AND length(fx_subject->>'identityToken')=64`, 'runtime reads an opaque adopted legajo by its exact existing UUID without fabricated source cutoff');
  ok(`payroll_fixed_registry_detail_v1(maker,(fx_legacy.root->>'id')::uuid)#>>'{record,identityCurrent}'='true'`, 'original GRH fixed root remains current after the approved transfer');
  ok(`fx_legacy.root=(SELECT to_jsonb(fx138_n) FROM payroll_fixed_novelty fx138_n WHERE fx138_n.id=(fx_legacy.root->>'id')::uuid) AND fx_legacy.events=(SELECT jsonb_agg(to_jsonb(fx138_e) ORDER BY fx138_e.version) FROM payroll_fixed_novelty_event fx138_e WHERE fx138_e.record_id=(fx_legacy.root->>'id')::uuid)`, 'historical root, subject, cutoff, request body, hash, keys, actors and event times retain exact bytes');
  ok(`payroll_fixed_registry_propose_v1(maker,fx_legacy.body,fx_legacy.key)=fx_legacy.receipt||'{"duplicate":true}'::jsonb AND payroll_fixed_registry_attempt_v1(maker,'propose',fx_legacy.key)=fx_legacy.receipt||'{"duplicate":true}'::jsonb`, 'lost-ACK replay and attempt recovery preserve an original pre-adoption proposal');
  // Original foundation contains an approved 2026 record whose contract is
  // intentionally adopted with unknown dates. That whole export must fail;
  // positive tests use a separate 2020 period, with no rows removed or annulled.
  statements.push(`fx_list:=payroll_fixed_registry_list_v1(maker,DATE '2026-09-01');`);
  ok(`qa_rejects(format('SELECT payroll_fixed_registry_export_v1(%L::jsonb,%L::date,%L::text)',maker,'2026-09-01',fx_list->>'snapshotToken'),'PAYROLL_FIXED_IDENTITY_CHANGED')`, 'unknown approved historical identity blocks the complete 2026 export without omitted rows');
  statements.push(`fx_body:=jsonb_build_object('recordId',NULL,'expectedVersion',0,'contractId',fx_subject->>'contractId','legajo',fx_subject->>'legajo','identityToken',fx_subject->>'identityToken','operation','set','values',${values},'reason','Full time sintético sólo para control');
   SET LOCAL ROLE municontrol_actions_runtime_app;fx_saved:=payroll_fixed_registry_propose_v1(maker,fx_body,fx_key);RESET ROLE;fx_root:=(fx_saved->>'recordId')::uuid;`);
  ok(`fx_saved->>'recordVersion'='1' AND payroll_fixed_registry_propose_v1(maker,fx_body,fx_key)=fx_saved||'{"duplicate":true}'::jsonb AND (SELECT count(*) FROM payroll_fixed_novelty_event fx138_e WHERE fx138_e.record_id=fx_root)=1`, 'code 95 opaque-legajo proposal retains exact quantity/null amount and one event on retries');
  reject('payroll_fixed_registry_propose_v1',['maker',"fx_body||'{\"reason\":\"Contenido diferente QA\"}'::jsonb",'fx_key'],'PAYROLL_FIXED_IDEMPOTENCY_REUSE','an existing key cannot change its saved body');
  reject('payroll_fixed_registry_propose_v1',['maker',"fx_body||jsonb_build_object('identityToken',repeat('a',64))",'gen_random_uuid()'],'PAYROLL_FIXED_IDENTITY_CHANGED','a forged native identity token cannot create another root');
  statements.push(`fx_review:=jsonb_build_object('recordId',fx_root,'proposalId',fx_saved->>'proposalId','expectedVersion',1,'decision','approve','reason','Revisión independiente sintética QA');`);
  mutate("DELETE FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key='payroll.fixed.approve';",()=>reject('payroll_fixed_registry_review_v1',['maker','fx_review','gen_random_uuid()'],'PAYROLL_FIXED_CAPABILITY_REQUIRED','current employment cannot replace withdrawn fixed approval authority'));
  // The original QA maker intentionally has both fixed capabilities. Its own
  // proposal must still require another canonical person, membership and email.
  reject('payroll_fixed_registry_review_v1',['maker','fx_review','gen_random_uuid()'],'PAYROLL_FIXED_MAKER_CHECKER_REQUIRED','even two capabilities do not allow self-review');
  statements.push(`SET LOCAL ROLE municontrol_actions_runtime_app;fx_result:=payroll_fixed_registry_review_v1(checker,fx_review,fx_review_key);RESET ROLE;fx_list:=payroll_fixed_registry_list_v1(maker,DATE '2020-01-01');fx_export:=payroll_fixed_registry_export_v1(maker,DATE '2020-01-01',fx_list->>'snapshotToken');`);
  ok(`fx_result->>'recordVersion'='2' AND payroll_fixed_registry_review_v1(checker,fx_review,fx_review_key)=fx_result||'{"duplicate":true}'::jsonb`, 'independent approval replays exactly once');
  ok(`EXISTS(SELECT 1 FROM jsonb_array_elements(fx_export->'rows') r WHERE r->>'recordId'=fx_root::text AND r#>>'{values,quantityDecimal}'='100' AND r#>'{values,amountCents}'='null'::jsonb) AND fx_export#>>'{effects,payrollCalculated}'='false' AND fx_export#>>'{effects,payrollPosted}'='false'`, 'control export keeps code 95 quantity and absent amount without calculating payroll');
  ok(`EXISTS(SELECT 1 FROM jsonb_array_elements(fx_export->'rows') r WHERE r->>'recordId'=fx_legacy.root->>'id' AND r->'subject'=fx_legacy.root->'subject')`, 'historical approved row is exported with its exact GRH provenance snapshot');
  mutate('', () => {
    statements.push(`fx_actor:=payroll_fixed_registry_employee_by_contract_v1(maker,${q(ids.makerContract)}::uuid)->'subject';fx_body:=fx_body||jsonb_build_object('contractId',fx_actor->>'contractId','legajo',fx_actor->>'legajo','identityToken',fx_actor->>'identityToken','values',${values}||'{"conceptSourceId":"27"}'::jsonb);fx_saved:=payroll_fixed_registry_propose_v1(maker,fx_body,gen_random_uuid());fx_review:=jsonb_build_object('recordId',fx_saved->>'recordId','proposalId',fx_saved->>'proposalId','expectedVersion',1,'decision','approve','reason','Revisión independiente del solapamiento QA');`);
    reject('payroll_fixed_registry_review_v1',['checker','fx_review','gen_random_uuid()'],'PAYROLL_FIXED_OVERLAP','new native token cannot bypass overlapping historical GRH approval');
  });
  statements.push(`fx_body:=jsonb_build_object('recordId',fx_legacy.root->>'id','expectedVersion',2,'contractId',fx_legacy.root->>'employment_contract_id','legajo',fx_legacy.root#>>'{subject,legajo}','identityToken',fx_legacy.root->>'identity_token','operation','set','values',${values}||'{"conceptSourceId":"27","quantityDecimal":"101"}'::jsonb,'reason','Rectificación histórica sintética QA');fx_saved:=payroll_fixed_registry_propose_v1(maker,fx_body,gen_random_uuid());fx_review:=jsonb_build_object('recordId',fx_saved->>'recordId','proposalId',fx_saved->>'proposalId','expectedVersion',3,'decision','approve','reason','Revisión independiente de rectificación QA');PERFORM payroll_fixed_registry_review_v1(checker,fx_review,gen_random_uuid());`);
  ok(`payroll_fixed_registry_detail_v1(maker,(fx_legacy.root->>'id')::uuid)#>>'{record,approved,values,quantityDecimal}'='101' AND (SELECT to_jsonb(fx138_n) FROM payroll_fixed_novelty fx138_n WHERE fx138_n.id=(fx_legacy.root->>'id')::uuid)=fx_legacy.root`, 'historical correction uses original token and preserves the immutable root');
  statements.push(`fx_body:=jsonb_build_object('recordId',fx_root,'expectedVersion',2,'contractId',fx_subject->>'contractId','legajo',fx_subject->>'legajo','identityToken',fx_subject->>'identityToken','operation','annul','values',NULL,'reason','Anulación administrativa sintética QA');fx_saved:=payroll_fixed_registry_propose_v1(maker,fx_body,gen_random_uuid());fx_review:=jsonb_build_object('recordId',fx_root,'proposalId',fx_saved->>'proposalId','expectedVersion',3,'decision','approve','reason','Revisión independiente de anulación QA');PERFORM payroll_fixed_registry_review_v1(checker,fx_review,gen_random_uuid());fx_list:=payroll_fixed_registry_list_v1(maker,DATE '2020-01-01');fx_export:=payroll_fixed_registry_export_v1(maker,DATE '2020-01-01',fx_list->>'snapshotToken');`);
  ok(`payroll_fixed_registry_detail_v1(maker,fx_root)#>>'{record,approved,operation}'='annul' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(fx_export->'rows') r WHERE r->>'recordId'=fx_root::text) AND (SELECT count(*) FROM payroll_fixed_novelty_event fx138_e WHERE fx138_e.record_id=fx_root)=4`, 'administrative annulment excludes export while keeping all four history events');
  mutate('',()=>{
    statements.push(`fx_body:=jsonb_build_object('recordId',NULL,'expectedVersion',0,'contractId',fx_subject->>'contractId','legajo',fx_subject->>'legajo','identityToken',fx_subject->>'identityToken','operation','set','values',${values},'reason','Propuesta sintética para conjunto');fx_saved:=payroll_fixed_registry_propose_v1(maker,fx_body,gen_random_uuid());fx_review:=jsonb_build_object('recordId',fx_saved->>'recordId','proposalId',fx_saved->>'proposalId','expectedVersion',1,'decision','approve','reason','Revisión sintética para conjunto');PERFORM payroll_fixed_registry_review_v1(checker,fx_review,gen_random_uuid());
     fx_group:=jsonb_build_object('items',jsonb_build_array(jsonb_build_object('recordId',fx_legacy.root->>'id','expectedVersion',4,'contractId',fx_legacy.root->>'employment_contract_id','legajo',fx_legacy.root#>>'{subject,legajo}','identityToken',fx_legacy.root->>'identity_token','values',${values}||'{"conceptSourceId":"27","quantityDecimal":"102"}'::jsonb),jsonb_build_object('recordId',fx_saved->>'recordId','expectedVersion',2,'contractId',fx_subject->>'contractId','legajo',fx_subject->>'legajo','identityToken',fx_subject->>'identityToken','values',${values}||'{"quantityDecimal":"102"}'::jsonb)),'reason','Rectificación conjunta sintética QA');fx_key:=gen_random_uuid();SET LOCAL ROLE municontrol_actions_runtime_app;fx_group_saved:=payroll_fixed_correction_group_propose_v1(maker,fx_group,fx_key);RESET ROLE;`);
    ok(`fx_group_saved->>'total'='2' AND payroll_fixed_correction_group_propose_v1(maker,fx_group,fx_key)=fx_group_saved||'{"duplicate":true}'::jsonb`, 'existing SQL118 corrects both original and adopted opaque subjects atomically with exact group replay');
    statements.push(`fx_group:=jsonb_build_object('items',(SELECT jsonb_agg(jsonb_build_object('recordId',r->>'recordId','proposalId',r->>'proposalId','expectedVersion',(r->>'recordVersion')::int)) FROM jsonb_array_elements(fx_group_saved->'rows') r),'decision','approve','reason','Revisión independiente del conjunto QA');fx_key:=gen_random_uuid();SET LOCAL ROLE municontrol_actions_runtime_app;fx_group_saved:=payroll_fixed_review_group_decide_v1(checker,fx_group,fx_key);RESET ROLE;`);
    ok(`fx_group_saved->>'total'='2' AND payroll_fixed_review_group_decide_v1(checker,fx_group,fx_key)=fx_group_saved||'{"duplicate":true}'::jsonb`, 'existing SQL119 independently reviews the complete mixed group exactly once');
    statements.push(`fx_group:=jsonb_build_object('items',(SELECT jsonb_agg(jsonb_build_object('recordId',r->>'recordId','expectedVersion',(r->>'recordVersion')::int,'contractId',fx138_n.employment_contract_id,'legajo',fx138_n.subject->>'legajo','identityToken',fx138_n.identity_token)) FROM jsonb_array_elements(fx_group_saved->'rows') r JOIN payroll_fixed_novelty fx138_n ON fx138_n.id=(r->>'recordId')::uuid),'reason','Anulación conjunta sintética QA');fx_key:=gen_random_uuid();fx_group_saved:=payroll_fixed_group_annul_v1(maker,fx_group,fx_key);`);
    ok(`fx_group_saved->>'total'='2' AND payroll_fixed_group_attempt_v1(maker,fx_key)=fx_group_saved||'{"duplicate":true}'::jsonb`, 'existing SQL117 preserves mixed-subject annulment and exact attempt recovery');
    statements.push(`fx_group:=jsonb_build_object('items',(SELECT jsonb_agg(jsonb_build_object('recordId',r->>'recordId','proposalId',r->>'proposalId','expectedVersion',(r->>'recordVersion')::int)) FROM jsonb_array_elements(fx_group_saved->'rows') r),'decision','approve','reason','Revisión independiente de anulaciones QA');fx_group_saved:=payroll_fixed_review_group_decide_v1(checker,fx_group,gen_random_uuid());`);
    ok(`(SELECT bool_and(payroll_fixed_registry_detail_v1(maker,(r->>'recordId')::uuid)#>>'{record,approved,operation}'='annul') FROM jsonb_array_elements(fx_group_saved->'rows') r)`, 'every mixed-group member is annulled with its version history retained');
  });
  mutate('',()=>{
    statements.push(`fx_actor:=payroll_fixed_registry_employee_by_contract_v1(maker,fx_second)->'subject';fx_body:=jsonb_build_object('recordId',NULL,'expectedVersion',0,'contractId',fx_second,'legajo',fx_actor->>'legajo','identityToken',fx_actor->>'identityToken','operation','set','values',${values}||'{"validFrom":"2026-10-01","validTo":"2026-12-31"}'::jsonb,'reason','Novedad pendiente antes de baja QA');fx_saved:=payroll_fixed_registry_propose_v1(maker,fx_body,gen_random_uuid());
     fx_life:=native_employment_lifecycle_bootstrap_v2(maker,fx_second);fx_life_saved:=native_employment_lifecycle_propose_v2(maker,jsonb_build_object('contractId',fx_second,'identityToken',fx_life#>>'{subject,identityToken}','scopeVersion',fx_life->>'scopeVersion','baseVersion',fx_life#>>'{employment,version}','movement','terminate','date','2026-10-07','reason','Baja sintética antes de revisar novedad','legalReference','Resolución QA'),gen_random_uuid());
     PERFORM native_employment_lifecycle_review_v2(checker,jsonb_build_object('contractId',fx_second,'proposalId',fx_life_saved->>'proposalId','scopeVersion',native_employment_lifecycle_bootstrap_v2(checker,fx_second)->>'scopeVersion','decision','approve','reason','Revisión independiente de baja QA'),gen_random_uuid());
     fx_review:=jsonb_build_object('recordId',fx_saved->>'recordId','proposalId',fx_saved->>'proposalId','expectedVersion',1,'decision','approve','reason','Revisión posterior a baja sintética');`);
    reject('payroll_fixed_registry_review_v1',['checker','fx_review','gen_random_uuid()'],'PAYROLL_FIXED_DATES_INVALID','a verified termination after preparation blocks an outdated validity at review');
    statements.push(`fx_review:=fx_review||'{"decision":"reject"}'::jsonb;fx_result:=payroll_fixed_registry_review_v1(checker,fx_review,gen_random_uuid());`);
    ok(`fx_result->>'recordVersion'='2' AND payroll_fixed_registry_detail_v1(maker,(fx_saved->>'recordId')::uuid)#>>'{record,latest,review,decision}'='reject'`, 'an outdated validity can be independently rejected without approval or calculation');
  });
  ok(`qa_rejects(format('SELECT payroll_fixed_registry_employee_by_contract_v1(%L::jsonb,%L::uuid)',maker,${q(ids.targetContract)}::uuid),'PAYROLL_FIXED_DATES_INVALID')`, 'adopted unknown dates are unresolved rather than invented');
  ok(`qa_rejects(format('SELECT payroll_fixed_registry_employee_by_contract_v1(%L::jsonb,%L::uuid)',${j(base.qaFoundation.actors.outsider)},${target}),'PAYROLL_FIXED_NOT_FOUND')`, 'foreign tenant cannot select an adopted UUID');
  ok(`qa_rejects(format('SELECT payroll_fixed_registry_bootstrap_v1(%L::jsonb)',maker||'{"actorSessionVersion":999999}'::jsonb),'PAYROLL_FIXED_SESSION_INVALID')`, 'stale authoritative session is rejected with the existing fixed API error before subject access');
  for (const capability of ['payroll.fixed.prepare','payroll.novelty.nominal.read']) mutate(`DELETE FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key=${q(capability)};`, () => reject('payroll_fixed_registry_propose_v1',['maker','fx_legacy.body','fx_legacy.key'],'PAYROLL_FIXED_CAPABILITY_REQUIRED','revoked ' + capability + ' also blocks stored retry'));
  mutate("UPDATE tenant_action_employment_link SET active=false WHERE membership_id=(maker->>'membershipId')::uuid;", () => reject('payroll_fixed_registry_propose_v1',['maker','fx_legacy.body','fx_legacy.key'],'PAYROLL_FIXED_EMPLOYMENT_REQUIRED','withdrawn actor employment link blocks stored retry'));
  statements.push('END;');
  const report = { ...base.report, checksPassed: base.report.checksPassed + checks, adoptedFixedChecksPassed: checks,
    limitations: [...base.report.limitations, 'SQL138 verified only with rollback synthetic QA; atomic installation protocol, municipal installation/publication and acceptance remain pending.'] };
  let sql = once(base.sql, sourceAnchor, legacy + '\n' + sourceAnchor);
  sql = once(sql, anchor, statements.join('\n') + '\n' + anchor);
  sql = once(sql, 'checks<>' + base.report.checksPassed, 'checks<>' + report.checksPassed);
  sql = once(sql, j(base.report), j(report));
  return { ...base, sql, report };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--(expected-major|write-sql|calibrate-only)=(.+)$/.exec(arg);
    assert.ok(match); assert.equal(args[match[1]], undefined); args[match[1]] = match[2];
  }
  const file = adoptionQaOutputPath(args['write-sql']);
  const qa = await buildAdoptedFixedQa({ serverMajor: Number(args['expected-major']), calibrateOnly: args['calibrate-only'] === 'true' });
  fs.writeFileSync(file, qa.sql, { flag: 'wx' });
  console.log(JSON.stringify({ generated: true, databaseExecuted: false, calibrationOnly: args['calibrate-only']==='true', checksPlanned: qa.report.checksPassed, adoptedFixedChecksPlanned:qa.report.adoptedFixedChecksPassed }));
}
