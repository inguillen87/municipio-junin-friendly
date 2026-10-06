// Full original own-run and adoption regression, existing loopback QA only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildAdoptedMonthlyQa } from './verify-adopted-monthly-novelties-sql.mjs';
import { adoptionQaOutputPath } from './verify-employment-adoption-preparation-sql.mjs';
import { buildOwnCloseSql } from './lib/own-payroll-close-sql.mjs';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
import { adoptedRunProgram, adoptedRunDefinitions, adoptedRunInput } from '../tests/fixtures/adopted-own-payroll-synthetic.js';
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
const j = v => q(JSON.stringify(v)) + '::jsonb';
const once = (s,a,b) => { assert.equal(s.split(a).length,2,'QA anchor changed');return s.replace(a,()=>b); };
const anchor = "RAISE EXCEPTION USING ERRCODE='P1361';EXCEPTION WHEN SQLSTATE 'P1361' THEN NULL;END;";
export const ADOPTED_RUN_PATCH_FUNCTIONS = ['own_run_capture_v1(jsonb,jsonb,uuid,text)','own_run_fixed_v1(jsonb,date,uuid[],text)'];

// Expected arithmetic comes from the actual JS engine. SQL fills only the
// independently captured IDs, source hashes and reference strings. The final
// log reader recomputes the entire input/result from the real captured sources.
function completeSql(snapshot) {
  return `ar_input:=${j(snapshot.input)};ar_result:=${j(snapshot.result)};
   ar_person:=ar_capture#>'{payload,population,employees,0}';
   ar_versions:=jsonb_build_object('population',ar_capture#>>'{payload,population,version}',
    'rules',own_run_hash_v1(jsonb_build_object('program',ar_capture#>'{payload,programState,program}','salary',ar_capture#>'{payload,programState,salaryCatalog}')),
    'novelties',own_run_hash_v1(jsonb_build_object('monthly',ar_capture#>'{payload,monthly}','fixed',ar_capture#>'{payload,fixed,export,data}')));
   ar_input:=ar_input||jsonb_build_object('period',ar_capture#>>'{body,period}','selection',ar_capture#>'{body,selection}','sourceVersions',ar_versions,'rules',ar_capture#>'{payload,programState,program,definition,rules}');
   ar_inputs:='[]';
   FOR ar_binding IN SELECT value FROM jsonb_array_elements(ar_capture#>'{payload,programState,program,definition,bindings}') LOOP
    ar_matches:=NULL;
    IF ar_binding->>'key'='base' THEN ar_reference:='Catálogo:'||(ar_capture#>>'{payload,programState,program,salaryVersion}');
    ELSIF ar_binding->>'key'='addition' THEN
     SELECT jsonb_agg(jsonb_build_object('sourceKind','monthly','contractId',r.value->>'employmentContractId','concept',r.value->>'conceptSourceId','quantity',r.value->'quantityDecimal','amount',r.value->'amountCents','reference',(b.value->>'id')||':'||(r.value->>'rowOrdinal')) ORDER BY b.ordinal,r.ordinal) INTO ar_matches
      FROM jsonb_array_elements(ar_capture#>'{payload,monthly,batches}') WITH ORDINALITY b(value,ordinal) CROSS JOIN LATERAL jsonb_array_elements(b.value->'rows') WITH ORDINALITY r(value,ordinal);
     ar_reference:='Novedades:'||own_run_hash_v1(coalesce(ar_matches,jsonb_build_object('complete',true,'period',ar_capture#>>'{body,period}','liquidationType','monthly','contractId',ar_person->>'contractId','binding',ar_binding)));
    ELSE
     SELECT jsonb_agg(jsonb_build_object('sourceKind','fixed','contractId',r.value#>>'{subject,contractId}','concept',r.value#>>'{values,conceptSourceId}','quantity',r.value#>'{values,quantityDecimal}','amount',r.value#>'{values,amountCents}','reference',(r.value->>'recordId')||':'||(r.value->>'proposalId')) ORDER BY r.ordinal) INTO ar_matches FROM jsonb_array_elements(ar_capture#>'{payload,fixed,export,data,rows}') WITH ORDINALITY r(value,ordinal);
     ar_reference:='Fijas:'||own_run_hash_v1(coalesce(ar_matches,jsonb_build_object('complete',true,'period',ar_capture#>>'{body,period}','liquidationType','monthly','contractId',ar_person->>'contractId','binding',ar_binding)));
    END IF;
    ar_inputs:=ar_inputs||jsonb_build_array((SELECT x.value||jsonb_build_object('sourceReference',ar_reference) FROM jsonb_array_elements(ar_input#>'{employees,0,inputs}') x WHERE x.value->>'key'=ar_binding->>'key'));
   END LOOP;
   ar_inputs:=(SELECT jsonb_agg(value ORDER BY value->>'key') FROM jsonb_array_elements(ar_inputs));
   ar_input:=jsonb_set(ar_input,'{employees}',jsonb_build_array(jsonb_build_object('contractId',ar_person->>'contractId','employeeNumber',ar_person->>'employeeNumber','agreementCode',ar_person->>'agreementCode','departmentCode',ar_person->>'departmentCode','inputs',ar_inputs)));
   ar_result:=ar_result||jsonb_build_object('period',ar_capture#>>'{body,period}','selection',ar_capture#>'{body,selection}','sourceVersions',ar_versions,
    'rows',(SELECT jsonb_agg(r.value||jsonb_build_object('contractId',ar_person->>'contractId','employeeNumber',ar_person->>'employeeNumber','agreementCode',ar_person->>'agreementCode','departmentCode',ar_person->>'departmentCode') ORDER BY r.ordinal) FROM jsonb_array_elements(ar_result->'rows') WITH ORDINALITY r(value,ordinal)),
    'employeeTotals',(SELECT jsonb_agg(value||jsonb_build_object('contractId',ar_person->>'contractId')) FROM jsonb_array_elements(ar_result->'employeeTotals')));
   SET LOCAL ROLE municontrol_actions_runtime_app;
   ar_saved:=own_run_complete_v1(maker,(ar_capture->>'id')::uuid,ar_input,ar_result,repeat('c',64));RESET ROLE;
   ar_capture:=own_run_attempt_v1(maker,(ar_capture->>'key')::uuid);`;
}

export async function buildAdoptedOwnRunQa({serverMajor}) {
  const base = await buildAdoptedMonthlyQa({serverMajor,withOwnRunSource:true}), {schema,ids}=base;
  const relocate = s => s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
    .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
    .replaceAll('SET search_path=pg_catalog,public,pg_temp','SET search_path=pg_catalog,'+schema+',public,pg_temp');
  const migration=fs.readFileSync(new URL('./migrations/140-adopted-own-payroll-capture.sql',import.meta.url),'utf8');
  const relocated=relocate(migration)
    .replaceAll("'search_path=pg_catalog, public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'))
    .replace("replace(original.prosrc,E'\\r\\n',E'\\n')","replace(replace(original.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')");
  const closed=buildOwnCloseSql(p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
  const setup=['122-own-payroll-programs.sql','123-own-payroll-runs.sql','124-own-payroll-liquidation-decisions.sql'].map(file=>fs.readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));
  setup.push(closed.sql);
  const declare=`ar_boot jsonb;ar_body jsonb;ar_review jsonb;ar_receipt jsonb;ar_capture jsonb;ar_input jsonb;ar_result jsonb;ar_saved jsonb;ar_versions jsonb;ar_person jsonb;ar_inputs jsonb;ar_binding jsonb;ar_matches jsonb;ar_reference text;ar_contract uuid;ar_key uuid:=gen_random_uuid();`;
  const legacy=`DECLARE ${declare} ar_hire jsonb;BEGIN
   ${setup.map(s=>'EXECUTE '+q(relocate(s))+';').join('\n')}
   INSERT INTO capabilities SELECT a.id,c FROM unnest(ARRAY[(maker->>'membershipId')::uuid,(checker->>'membershipId')::uuid]) a(id) CROSS JOIN unnest(ARRAY['payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve','payroll.calculation.read','payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export']) c WHERE NOT EXISTS(SELECT 1 FROM capabilities x WHERE x.membership_id=a.id AND x.capability_key=c);
   INSERT INTO capabilities SELECT (maker->>'membershipId')::uuid,'payroll.calculation.prepare';
   ar_hire:=native_employee_create_v1(maker,new_draft||'{"dni":"99000041","cuil":"20990000418","legajo":"19041","fullName":"Corrida anterior sintética QA","startDate":"2026-10-01","agreementCode":"1","categoryCode":"1","organizationId":"10","sectorCode":"20"}',native_employee_catalog_v1(native_employee_context_v1(maker))->>'version',gen_random_uuid());
   ar_contract:=(ar_hire->>'contractId')::uuid;
   ar_boot:=native_salary_bootstrap_v1(maker);ar_body:=jsonb_build_object('command','propose','scopeVersion',ar_boot->>'scopeVersion','baseVersion',ar_boot#>>'{catalog,version}','classificationVersion',ar_boot#>>'{classification,version}','items',native_salary_items_v1((ar_boot#>'{catalog,items}')||${j(adoptedRunDefinitions())}),'proposalId',NULL,'proposalSha256',NULL,'reason','Definiciones inventadas QA; no homologación municipal','reviewConfirmed',false);
   ar_receipt:=native_salary_command_v1(maker,ar_body,gen_random_uuid());
   ar_review:=ar_body||jsonb_build_object('command','approve','scopeVersion',native_salary_bootstrap_v1(checker)->>'scopeVersion','proposalId',ar_receipt->>'proposalId','proposalSha256',ar_receipt->>'requestSha256','items',NULL,'reason','Revisión independiente de definiciones inventadas QA','reviewConfirmed',true);PERFORM native_salary_command_v1(checker,ar_review,gen_random_uuid());
   ar_boot:=own_program_bootstrap_v1(maker);ar_body:=jsonb_build_object('command','propose','scopeVersion',ar_boot->>'scopeVersion','baseVersion',ar_boot#>>'{program,version}','salaryVersion',ar_boot#>>'{salaryCatalog,version}','proposalId',NULL,'proposalSha256',NULL,'program',${j(adoptedRunProgram())},'reason','Programa inventado QA; sin norma municipal','reviewConfirmed',false);
   ar_receipt:=own_program_command_v1(maker,ar_body,gen_random_uuid());
   ar_review:=ar_body||jsonb_build_object('command','approve','scopeVersion',own_program_bootstrap_v1(checker)->>'scopeVersion','proposalId',ar_receipt->>'proposalId','proposalSha256',ar_receipt->>'requestSha256','program',NULL,'reviewConfirmed',true);PERFORM own_program_command_v1(checker,ar_review,gen_random_uuid());
   ar_boot:=own_run_bootstrap_v1(maker);ar_body:=jsonb_build_object('period','2026-10','liquidationType','monthly','selection',jsonb_build_object('kind','contracts','values',jsonb_build_array(ar_contract)),'scopeVersion',ar_boot->>'scopeVersion','programVersion',ar_boot->>'programVersion','populationDomain','native_registered');
   ar_capture:=own_run_capture_v1(maker,ar_body,ar_key,repeat('c',64));
   ${completeSql(createOwnPayrollSnapshot(adoptedRunInput('2026-10','19041')))}
   CREATE TEMP TABLE qa140_legacy ON COMMIT DROP AS SELECT ar_capture capture,
    (SELECT to_jsonb(c) FROM own_payroll_run_capture c WHERE c.id=(ar_capture->>'id')::uuid) stored_capture,
    (SELECT to_jsonb(r) FROM own_payroll_run_result r WHERE r.capture_id=(ar_capture->>'id')::uuid) stored_result;
  END;`;
  const s=[];let checks=0;
  const ok=(expr,label)=>{s.push('PERFORM qa_assert(('+expr+'),'+q(label)+');checks:=checks+1;');checks++;};
  const refuse=(sql,args,error,label)=>ok('qa_rejects(format('+q(sql)+','+args+'),'+q(error)+')',label);
  const mutation=(sql,fn)=>{s.push('BEGIN '+sql);fn();s.push("RAISE EXCEPTION USING ERRCODE='P1402';EXCEPTION WHEN SQLSTATE 'P1402' THEN NULL;END;");};
  const names=ADOPTED_RUN_PATCH_FUNCTIONS.map(n=>schema+'.'+n);
  s.push(`DECLARE ${declare} ar_subject jsonb;ar_rows jsonb;ar_monthly jsonb;ar_fixed jsonb;ar_before text;ar_metadata jsonb;ar_old record;ar_life jsonb;ar_life_receipt jsonb;ar_all_refused boolean;ar_count bigint;BEGIN
   SELECT * INTO STRICT ar_old FROM qa140_legacy;SELECT id INTO STRICT ar_contract FROM employment_contract WHERE legacy_legajo='A/3501';
   ar_boot:=own_run_bootstrap_v1(maker);ar_body:=jsonb_build_object('period','2026-11','liquidationType','monthly','selection',jsonb_build_object('kind','contracts','values',jsonb_build_array(ar_contract)),'scopeVersion',ar_boot->>'scopeVersion','programVersion',ar_boot->>'programVersion','populationDomain','native_registered');
   ar_before:=(SELECT md5(jsonb_build_object('captures',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM own_payroll_run_capture c),'results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.capture_id) FROM own_payroll_run_result r))::text));
   SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) INTO ar_metadata FROM pg_proc p WHERE p.oid IN(SELECT to_regprocedure(sig) FROM unnest(ARRAY[${names.map(q).join(',')}]) sig);`);
  refuse('SELECT own_run_capture_v1(%L::jsonb,%L::jsonb,gen_random_uuid(),repeat(\'c\',64))','maker,ar_body','NATIVE_EMPLOYMENT_LIFECYCLE_IDENTITY_CHANGED','original capture cannot resolve the approved adopted contract');
  s.push('EXECUTE '+q(relocated)+';');
  ok(`ar_metadata=(SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(SELECT to_regprocedure(sig) FROM unnest(ARRAY[${names.map(q).join(',')}]) sig))`,'both routines retain OID, owner, ACL, settings and argument metadata');
  ok("ar_before=(SELECT md5(jsonb_build_object('captures',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM own_payroll_run_capture c),'results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.capture_id) FROM own_payroll_run_result r))::text))",'installation never changes existing capture or calculated result');
  ok('qa_rejects('+q(relocated)+",'OWN_RUN_ADOPTION_DEFINITION_CHANGED: capture_v1')",'unreviewed raw repetition refuses the changed prerequisite');
  ok("own_run_attempt_v1(maker,(ar_old.capture->>'key')::uuid)=ar_old.capture AND own_run_capture_v1(maker,ar_old.capture->'body',(ar_old.capture->>'key')::uuid,repeat('f',64))=ar_old.capture",'old complete run retains its exact body, key, algorithm, input, result and replay');
  s.push(`ar_subject:=payroll_novelty_employee_v2(maker,ar_contract)->'subject';
   ar_rows:=jsonb_build_array(jsonb_build_object('rowOrdinal',1,'legajo',ar_subject->>'legajo','contractId',ar_contract,'identityToken',ar_subject->>'identityToken','conceptSourceId','120','costCenterSourceId',NULL,'adjustmentMonth',NULL,'quantityDecimal',NULL,'amountCents','2000','movementType',NULL,'legalInstrument','Fuente mensual inventada QA','observation',NULL,'forced',false));
   ar_monthly:=payroll_novelty_prepare_v2(maker,'individual',DATE '2026-11-01','monthly',ar_rows,gen_random_uuid(),repeat('a',64));
   PERFORM payroll_novelty_transition_v2(maker,(ar_monthly#>>'{data,id}')::uuid,'submit',1,'ready_for_review',NULL,gen_random_uuid(),repeat('b',64));
   PERFORM payroll_novelty_transition_v2(checker,(ar_monthly#>>'{data,id}')::uuid,'approve',2,'validated_for_export',NULL,gen_random_uuid(),repeat('b',64));
   ar_fixed:=payroll_fixed_registry_propose_v1(maker,jsonb_build_object('recordId',NULL,'expectedVersion',0,'contractId',ar_contract,'legajo',ar_subject->>'legajo','identityToken',ar_subject->>'identityToken','operation','set','reason','Fuente fija inventada para cálculo QA','values',jsonb_build_object('conceptSourceId','121','costCenterSourceId',NULL,'payrollType','monthly','quantityDecimal',NULL,'amountCents','125','forced',false,'forcedReason',NULL,'legalInstrument','Fuente fija inventada QA','validFrom','2026-11-01','validTo','2026-11-30')),gen_random_uuid());
   PERFORM payroll_fixed_registry_review_v1(checker,jsonb_build_object('recordId',ar_fixed->>'recordId','proposalId',ar_fixed->>'proposalId','expectedVersion',1,'decision','approve','reason','Revisión independiente de fuente fija inventada QA'),gen_random_uuid());
   SET LOCAL ROLE municontrol_actions_runtime_app;ar_capture:=own_run_capture_v1(maker,ar_body,ar_key,repeat('c',64));RESET ROLE;`);
  ok("ar_capture#>>'{payload,population,employees,0,employeeNumber}'='A/3501' AND jsonb_array_length(ar_capture#>'{payload,population,employees}')=1 AND ar_capture->'saved'='null'",'runtime captures exactly the selected opaque municipal contract without claiming calculation');
  ok("jsonb_array_length(ar_capture#>'{payload,monthly,batches}')=1 AND ar_capture#>>'{payload,fixed,export,data,total}'='1' AND ar_capture#>>'{payload,monthly,batches,0,rows,0,amountCents}'='2000' AND ar_capture#>>'{payload,fixed,export,data,rows,0,values,amountCents}'='125'",'both real independently approved monthly and fixed sources enter the complete capture');
  ok("ar_capture#>>'{payload,monthly,batches,0,rows,0,issues,0,code}'='concept_not_observed' AND ar_capture#>>'{payload,population,employees,0,identityToken}'=ar_subject->>'identityToken'",'original source observation and exact current identity remain captured');
  ok("own_run_capture_v1(maker,ar_body,ar_key,repeat('f',64))=ar_capture||'{\"replayed\":true}'",'uncertain capture replays original algorithm and sources rather than replacing them');
  refuse('SELECT own_run_capture_v1(%L::jsonb,%L::jsonb,%L::uuid,repeat(\'c\',64))',"maker,ar_body||'{\"period\":\"2026-12\"}',ar_key",'OWN_RUN_IDEMPOTENCY_REUSE','a pending key cannot change the period or body');
  s.push(completeSql(createOwnPayrollSnapshot(adoptedRunInput('2026-11','A/3501','20.00000000','1.25000000'))));
  ok("ar_capture#>>'{saved,result,payrollCalculated}'='true' AND ar_capture#>>'{saved,result,payrollPosted}'='false' AND ar_capture#>>'{saved,result,paymentExecuted}'='false' AND ar_capture#>>'{saved,input,employees,0,employeeNumber}'='A/3501'",'actual complete facade stores a deterministic technical result with no posting or payment');
  ok("ar_capture#>>'{saved,result,employeeTotals,0,net}'='129.84' AND (SELECT r->>'amount'='21.25' FROM jsonb_array_elements(ar_capture#>'{saved,result,rows}') r WHERE r->>'conceptCode'='120')",'invented arithmetic consumes both approved sources exactly and preserves cent rounding');
  ok("own_run_complete_v1(maker,(ar_capture->>'id')::uuid,ar_input,ar_result,repeat('c',64))=ar_capture->'saved'",'a completed calculation retries without another stored result');
  refuse('SELECT own_run_complete_v1(%L::jsonb,%L::uuid,%L::jsonb,%L::jsonb,repeat(\'f\',64))',"maker,ar_capture->>'id',ar_input,ar_result",'OWN_RUN_ENGINE_CHANGED','a pending algorithm cannot be replaced silently');
  mutation("DELETE FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key='payroll.calculation.nominal.read';",()=>refuse('SELECT own_run_attempt_v1(%L::jsonb,%L::uuid)',"maker,ar_key",'OWN_RUN_FORBIDDEN','nominal revocation removes access to the stored result'));
  mutation("UPDATE tenant_action_employment_link SET active=false WHERE membership_id=(maker->>'membershipId')::uuid;",()=>refuse('SELECT own_run_attempt_v1(%L::jsonb,%L::uuid)',"maker,ar_key",'OWN_RUN_EMPLOYMENT_REQUIRED','revoked operator link cannot recover a nominal calculation'));
  refuse("UPDATE employment_contract SET legacy_legajo='Alterado' WHERE id=%L::uuid","ar_contract",'NATIVE_EMPLOYEE_IMMUTABLE','canonical guard prevents changing the adopted identifier used by the captured payroll');
  const lifecycleTermination=date=>`ar_life:=native_employment_lifecycle_bootstrap_v2(maker,ar_contract);
   ar_life_receipt:=native_employment_lifecycle_propose_v2(maker,jsonb_build_object('contractId',ar_contract,'identityToken',ar_life#>>'{subject,identityToken}','scopeVersion',ar_life->>'scopeVersion','baseVersion',ar_life#>>'{employment,version}','movement','terminate','date',${q(date)},'reason','Baja sintética para comprobar la captura','legalReference','Resolución inventada QA'),gen_random_uuid());
   PERFORM native_employment_lifecycle_review_v2(checker,jsonb_build_object('contractId',ar_contract,'proposalId',ar_life_receipt->>'proposalId','scopeVersion',native_employment_lifecycle_bootstrap_v2(checker,ar_contract)->>'scopeVersion','decision','approve','reason','Revisión independiente de baja sintética QA'),gen_random_uuid());`;
  mutation(lifecycleTermination('2026-10-07'),()=>refuse('SELECT own_run_capture_v1(%L::jsonb,%L::jsonb,gen_random_uuid(),repeat(\'c\',64))',"maker,ar_body",'OWN_RUN_SELECTION_INVALID','approved adopted termination overrides the originally active canonical date range'));
  mutation(lifecycleTermination('2026-11-20'),()=>refuse('SELECT own_run_capture_v1(%L::jsonb,%L::jsonb,gen_random_uuid(),repeat(\'c\',64))',"maker,ar_body",'OWN_RUN_PRORATION_REQUIRED','approved partial adopted interval cannot become an invented full-month calculation'));
  refuse('SELECT own_run_capture_v1(%L::jsonb,%L::jsonb,gen_random_uuid(),repeat(\'c\',64))',"maker,ar_body||jsonb_build_object('selection',jsonb_build_object('kind','contracts','values',(SELECT jsonb_agg(x ORDER BY x) FROM unnest(ARRAY[ar_contract::text,gen_random_uuid()::text]) x)))",'OWN_RUN_SELECTION_INVALID','one missing selected contract invalidates the whole capture');
  refuse('SELECT own_run_capture_v1(%L::jsonb,%L::jsonb,gen_random_uuid(),repeat(\'c\',64))',"maker,ar_body||jsonb_build_object('selection',jsonb_build_object('kind','contracts','values',(SELECT jsonb_agg(x ORDER BY x) FROM unnest(ARRAY[ar_contract::text,"+q(ids.targetContract)+"]) x)))",'PAYROLL_FIXED_DATES_INVALID','one selected unknown municipal history invalidates the complete capture without omitted rows');
  s.push(`ar_count:=(SELECT count(*) FROM own_payroll_run_capture);ar_all_refused:=false;
   BEGIN PERFORM own_run_capture_v1(maker,ar_body||jsonb_build_object('selection',jsonb_build_object('kind','all','values','[]'::jsonb)),gen_random_uuid(),repeat('c',64));
   EXCEPTION WHEN OTHERS THEN
    -- UUID order determines which incomplete fixture is encountered first.
    -- Both documented refusals must leave the entire all-scope unsaved.
    IF SQLERRM NOT IN('PAYROLL_FIXED_DATES_INVALID','OWN_RUN_SELECTION_INVALID') THEN RAISE; END IF;
    ar_all_refused:=true;END;`);
  ok('ar_all_refused AND ar_count=(SELECT count(*) FROM own_payroll_run_capture)','all scope globally refuses missing dates or classification without saving a partial population');
  ok("ar_old.stored_capture=(SELECT to_jsonb(c) FROM own_payroll_run_capture c WHERE c.id=(ar_old.capture->>'id')::uuid) AND ar_old.stored_result=(SELECT to_jsonb(r) FROM own_payroll_run_result r WHERE r.capture_id=(ar_old.capture->>'id')::uuid)",'old capture and result remain byte-equivalent after all new operations');
  s.push("RAISE NOTICE 'ADOPTED_RUN_LEGACY_CONTRACT:%',own_run_attempt_v1(maker,(ar_old.capture->>'key')::uuid);RAISE NOTICE 'ADOPTED_RUN_SYNTHETIC_CONTRACT:%',ar_capture;END;");
  const report={...base.report,checksPassed:base.report.checksPassed+checks,adoptedOwnRunChecksPassed:checks,
    limitations:[...base.report.limitations,'SQL140 captures and computes real approved synthetic adopted sources. Municipal homologation, atomic 136-140 installation, adapted close/report consumers and production remain pending.']};
  // All additional fresh hires and approved programs belong to the initial
  // fixture, before the existing lifecycle test captures its unchanged state.
  const freshSnapshotAnchor='CREATE TEMP TABLE qa136_fresh_before(value jsonb);';
  let sql=once(base.sql,freshSnapshotAnchor,legacy+'\n'+freshSnapshotAnchor);
  // This synthetic source initially has no classification. Declare only our
  // calculation fixture's encuadre before the original canonical guard exists.
  const adoptedFixtureAnchor="ALTER TABLE employment_contract ADD CONSTRAINT employment_contract_grh_authority_ck CHECK(source_system='GRH');";
  sql=once(sql,adoptedFixtureAnchor,"UPDATE employment_contract SET agreement_code='1',category_code='1',organization_unit_source_id='10',sector_source_id='20' WHERE legacy_legajo='A/3501';"+adoptedFixtureAnchor);
  sql=once(sql,anchor,s.join('\n')+'\n'+anchor);
  sql=once(sql,'checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed);
  sql=once(sql,j(base.report),j(report));
  // This compound suite adds the complete original own-run regressions to
  // adoption, fixed and monthly QA. Keep a bounded local deadline for all
  // checks; application timeouts and the QA lock timeout remain unchanged.
  sql=once(sql,"SET LOCAL statement_timeout='180s';","SET LOCAL statement_timeout='300s';");
  if(Number(serverMajor)===17)sql=once(sql,"current_database()<>'own_payroll_run_qa'","current_database()<>'fixed_novelties_qa'");
  return {...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args={};for(const a of process.argv.slice(2)){const m=/^--(expected-major|write-sql)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
  const file=adoptionQaOutputPath(args['write-sql']),qa=await buildAdoptedOwnRunQa({serverMajor:Number(args['expected-major'])});
  fs.writeFileSync(file,qa.sql,{flag:'wx'});console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,newChecks:qa.report.adoptedOwnRunChecksPassed}));
}
