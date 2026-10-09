// Generate isolated, synthetic PG17/18 regression SQL. Never opens a connection.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildNativeSalaryQa } from './verify-native-salary-sql.mjs';
import { syntheticAccountingDefinition } from '../tests/fixtures/own-payroll-accounting-synthetic.js';
import { buildOwnAccountingInstallation } from './lib/own-accounting-installation.mjs';
import { buildOwnAccountingBankInstallation } from './lib/own-accounting-bank-installation.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const q = v => "'" + String(v).replaceAll("'", "''") + "'", j = v => q(JSON.stringify(v)) + '::jsonb';
export function buildOwnAccountingQa({ serverMajor }) {
 const base = buildNativeSalaryQa({ serverMajor }), { schema } = base;
 const source = fs.readFileSync(path.join(root, 'scripts/migrations/147-own-payroll-accounting-mappings.sql'), 'utf8').replaceAll('\r\n', '\n');
 const helpers = fs.readFileSync(path.join(root, 'scripts/migrations/122-own-payroll-programs.sql'), 'utf8').replaceAll('\r\n', '\n');
 const relocate = s => s.replaceAll('public.', schema + '.').replaceAll(schema + '.digest(', 'public.digest(').replaceAll("'public'::regnamespace", q(schema) + '::regnamespace').replaceAll("s.nspname='public'","s.nspname="+q(schema)).replace(/SET search_path\s*=\s*pg_catalog,public,pg_temp/g, 'SET search_path=pg_catalog,' + schema + ',public,pg_temp').replaceAll('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+schema+', public, pg_temp').replaceAll('search_path=public, pg_temp','search_path=pg_catalog, '+schema+', public, pg_temp').replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')");
 const installation = buildOwnAccountingInstallation({ read: f => fs.readFileSync(path.join(root,f),'utf8'), sourceCommit: 'a'.repeat(40) });
 const bankInstallation = buildOwnAccountingBankInstallation({ read: f => fs.readFileSync(path.join(root,f),'utf8'), sourceCommit: 'a'.repeat(40) });
 const statements = []; let count = 0;
 const exec = s => statements.push(s), ok = (s, label) => { exec('PERFORM qa_assert((' + s + '),' + q(label) + ');checks:=checks+1;'); count++; };
 const write = (actor = 'maker', body = 'ac_body', key = 'gen_random_uuid()') => 'own_accounting_command_v1(' + actor + ',' + body + ',' + key + ')';
 const reject = (body, code, label, actor = 'maker', key = 'gen_random_uuid()') => ok('qa_rejects(format(' + q('SELECT own_accounting_command_v1(%1$L::jsonb,%2$L::jsonb,%3$L::uuid)') + ',' + actor + ',' + body + ',' + key + '),' + q('ACCOUNTING_' + code) + ')', label);
 exec(`ac_before:=(SELECT md5(jsonb_agg(to_jsonb(ec) ORDER BY id)::text) FROM employment_contract ec);
 EXECUTE ${q(relocate(helpers))};
 -- The inherited minimal fixture extracts the real007 helper body but omits
 -- its published private ACL. Apply that same revocation before the snapshot;
 -- the installation metadata check remains strict, including PUBLIC access.
 REVOKE ALL ON FUNCTION action_center_context_has_capability(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
 BEGIN CREATE FUNCTION own_accounting_partial_stub() RETURNS boolean LANGUAGE sql AS 'SELECT true';`);
 ok('qa_rejects(' + q(relocate(source)) + ",'ACCOUNTING_OBJECT_CONFLICT')", 'partial install refuses to adopt unknown helper');
 ok("to_regclass('own_payroll_accounting_event') IS NULL", 'partial installation changes no object');
 exec("RAISE EXCEPTION USING ERRCODE='P1472',MESSAGE='RESTORE_ACCOUNTING_PARTIAL';EXCEPTION WHEN SQLSTATE 'P1472' THEN NULL;END;EXECUTE " + q(relocate(installation.installation.slice(0,-1).join(';\n'))) + ';EXECUTE '+q(relocate(installation.proof))+' INTO ac_install_proof;EXECUTE '+q(relocate(installation.durableVerification.slice(0,-1).join(';\n')))+';EXECUTE '+q(relocate(installation.durableProof))+' INTO ac_durable_proof;');
 ok("ac_install_proof->>'beforeFingerprint'=ac_install_proof->>'preservationSha256' AND ac_install_proof-'beforeFingerprint'=ac_durable_proof AND ac_install_proof->>'eventRows'='0'", 'installation and durable proof preserve all prior tables, rows, functions and security');
 for(const [mutation,checkSql,code,label] of [
 ['ALTER TABLE own_payroll_accounting_event ADD COLUMN unexpected text',installation.tableCheck,'ACCOUNTING_TABLE_SHAPE','extra table field stops verification'],
 ['GRANT SELECT(body) ON own_payroll_accounting_event TO municontrol_actions_runtime_app',installation.tableCheck,'ACCOUNTING_TABLE_SHAPE','direct column grant stops verification'],
 ['ALTER TABLE own_payroll_accounting_event DISABLE ROW LEVEL SECURITY',installation.tableCheck,'ACCOUNTING_TABLE_SECURITY','RLS disabled stops verification'],
 ['GRANT SELECT ON own_payroll_accounting_event TO municontrol_actions_runtime_app',installation.tableCheck,'ACCOUNTING_TABLE_SECURITY','runtime direct table grant stops verification'],
 ['ALTER TABLE own_payroll_accounting_event DISABLE TRIGGER own_accounting_immutable',installation.tableCheck,'ACCOUNTING_IMMUTABLE_GUARD','disabled immutable trigger stops verification'],
 ['GRANT EXECUTE ON FUNCTION own_accounting_sources_v1(jsonb) TO municontrol_actions_runtime_app',installation.ownCheck,'ACCOUNTING_FUNCTION_METADATA','private helper grant stops verification'],
 ['ALTER FUNCTION own_accounting_command_v1(jsonb,jsonb,uuid) COST 101',installation.ownCheck,'ACCOUNTING_FUNCTION_METADATA','changed function metadata stops verification'],
 ]) { exec('BEGIN '+mutation+';');ok('qa_rejects('+q(relocate(checkSql))+','+q(code)+')',label);exec("RAISE EXCEPTION USING ERRCODE='P1474',MESSAGE='RESTORE_ACCOUNTING_METADATA';EXCEPTION WHEN SQLSTATE 'P1474' THEN NULL;END;"); }
 ok('qa_rejects(' + q(relocate(source)) + ",'ACCOUNTING_ALREADY_INSTALLED')", 'second install fails before mutating installed objects');
 exec("BEGIN EXECUTE " + q(relocate("CREATE OR REPLACE FUNCTION public.native_employee_catalog_v1(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fault$ BEGIN RETURN jsonb_build_object('origin','GRH');END $fault$;")) + ';');
 ok("qa_rejects(format('SELECT own_accounting_bootstrap_v1(%L::jsonb)',maker),'ACCOUNTING_SOURCE_REQUIRED')", 'GRH fallback classification cannot become own accounting authority');
 exec("RAISE EXCEPTION USING ERRCODE='P1473',MESSAGE='RESTORE_ACCOUNTING_FALLBACK';EXCEPTION WHEN SQLSTATE 'P1473' THEN NULL;END;");
 exec(`ac_class:=native_employment_catalog_bootstrap_v1(maker);
 ac_class_body:=jsonb_build_object('scopeVersion',ac_class->>'scopeVersion','baseVersion',ac_class#>>'{catalog,version}','items',ac_class#>'{catalog,items}','reason','Own synthetic classification approval for accounting');
 ac_class_receipt:=native_employment_catalog_propose_v1(maker,ac_class_body,gen_random_uuid());
 PERFORM native_employment_catalog_review_v1(checker,jsonb_build_object('scopeVersion',native_employment_catalog_bootstrap_v1(checker)->>'scopeVersion','proposalId',ac_class_receipt->>'proposalId','decision','approve','reason','Independent own classification review'),gen_random_uuid());
 ac_boot:=own_accounting_bootstrap_v1(maker);ac_sources:=ac_boot->'sources';
 ac_definition:=jsonb_build_object('mappings',jsonb_build_array(${j(syntheticAccountingDefinition().mappings[0])}||jsonb_build_object('agreementCode',ac_sources#>>'{concepts,0,agreementCode}','departmentCode',ac_sources#>>'{departments,0,code}','conceptCode',ac_sources#>>'{concepts,0,code}','nature',ac_sources#>>'{concepts,0,nature}','validFrom','2026-10-01')),'assignments',jsonb_build_array(${j(syntheticAccountingDefinition().assignments[0])}||jsonb_build_object('contractId',ac_sources#>>'{contracts,0,contractId}','validFrom','2026-10-01')));
 ac_body:=jsonb_build_object('command','propose','scopeVersion',ac_boot->>'scopeVersion','baseVersion',ac_boot#>>'{configuration,version}','sourceVersion',ac_sources->>'version','proposalId',NULL,'proposalSha256',NULL,'definition',ac_definition,'reason','Complete synthetic destinations, accounts and institution','reviewConfirmed',false);`);
 ok("ac_boot#>>'{configuration,revision}'='0' AND ac_boot#>'{configuration,definition}'='null'::jsonb AND ac_boot->>'complete'='true' AND ac_boot->>'accountingPosted'='false' AND ac_boot->>'paymentExecuted'='false'", 'empty configuration never invents a destination, posting or payment');
 ok("jsonb_array_length(ac_sources->'contracts')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ac_sources->'contracts') x WHERE x ?| ARRAY['dni','cuil','dateOfBirth'])", 'sources contain explicit own registrations and no document or birth date');
 ok("(SELECT count(*)=13 AND count(*) FILTER(WHERE has_function_privilege('municontrol_actions_runtime_app',oid,'EXECUTE'))=4 FROM pg_proc WHERE pronamespace=" + q(schema) + "::regnamespace AND proname LIKE 'own_accounting_%') AND NOT has_table_privilege('municontrol_actions_runtime_app','own_payroll_accounting_event','SELECT') AND (SELECT relrowsecurity FROM pg_class WHERE oid='own_payroll_accounting_event'::regclass)", 'four facades only; immutable RLS table has no runtime direct grant');
 exec('SET LOCAL ROLE municontrol_actions_runtime_app;ac_boot:=own_accounting_bootstrap_v1(reader);RESET ROLE;');
 ok("ac_boot#>>'{permissions,canPropose}'='false' AND ac_boot#>>'{permissions,canReview}'='false'", 'real runtime reader can consult without mutation capability');
 reject('ac_body', 'FORBIDDEN', 'reader never prepares', 'reader');
 reject("ac_body||jsonb_build_object('scopeVersion',native_salary_scope_v1(native_salary_context_v1(unlinked)))", 'EMPLOYMENT_REQUIRED', 'unlinked preparer cannot write', 'unlinked');
 reject("ac_body||jsonb_build_object('scopeVersion',repeat('f',64))", 'SCOPE_CHANGED', 'changed actor scope cannot write');
 reject("ac_body||jsonb_build_object('baseVersion',repeat('f',64))", 'BASE_CHANGED', 'changed configuration cannot write');
 reject("ac_body||jsonb_build_object('sourceVersion',repeat('f',64))", 'BASE_CHANGED', 'changed complete source cannot write');
 reject("ac_body||jsonb_build_object('actorEmail','forged@example.invalid')", 'INPUT_INVALID', 'client cannot choose actor');
 for (const [field, value, code, label] of [
 ['creditorReference', 0, 'INPUT_INVALID', 'missing creditor is not numeric zero'],
 ['budgetItemReference', '<script>', 'INPUT_INVALID', 'markup never enters destination'],
 ['validFrom', '2026-02-30', 'INPUT_INVALID', 'civil date rejects impossible February'],
 ['validUntil', '2027-01-01', 'INPUT_INVALID', 'annual destination cannot cross fiscal year'],
 ['agreementCode', '999999999', 'SOURCE_REQUIRED', 'foreign agreement never resolves'],
 ['departmentCode', '999999999', 'SOURCE_REQUIRED', 'foreign department never resolves'],
 ['conceptCode', '999999999', 'SOURCE_REQUIRED', 'foreign concept never resolves'],
 ['validFrom', '2026-09-30', 'SOURCE_REQUIRED', 'approved concept covers the complete declared interval'],
 ['nature', 'employer_contribution', 'SOURCE_REQUIRED', 'nature must match approved concept'],
 ]) reject(`jsonb_set(ac_body,'{definition,mappings,0,${field}}',${j(value)})`, code, label);
 reject("jsonb_set(ac_body,'{definition,assignments,0,contractId}',to_jsonb('aaaaaaaa-0000-4000-8000-000000000009'::text))", 'SOURCE_REQUIRED', 'explicit unknown contract never resolves by person or legajo');
 reject("jsonb_set(ac_body,'{definition,mappings}',(ac_definition->'mappings')||(ac_definition->'mappings'))", 'OVERLAP', 'duplicated complete mappings fail atomically');
 reject("jsonb_set(ac_body,'{definition,assignments}',(ac_definition->'assignments')||jsonb_build_array((ac_definition#>'{assignments,0}')||jsonb_build_object('conceptCode',ac_sources#>>'{concepts,0,code}')))", 'OVERLAP', 'generic institution never silently overrides specific institution');
 reject("jsonb_set(ac_body,'{definition,mappings}',(SELECT jsonb_agg(ac_definition#>'{mappings,0}') FROM generate_series(1,2001)))", 'LIMIT', 'capacity rejects entire mapping set, no truncation');
 ok("(SELECT count(*) FROM own_payroll_accounting_event)=0", 'all invalid attempts preserve empty event table');
 ok("jsonb_array_length(own_accounting_definition_v1(jsonb_build_object('mappings',ac_definition->'mappings','assignments',(SELECT jsonb_agg((ac_definition#>'{assignments,0}')||jsonb_build_object('conceptCode',CASE WHEN g.n%2=0 THEN NULL ELSE ac_sources#>>'{concepts,0,code}' END,'validFrom',to_char(DATE '2000-01-01'+g.n,'YYYY-MM-DD'),'validUntil',to_char(DATE '2000-01-01'+g.n,'YYYY-MM-DD'))) FROM generate_series(0,9999) AS g(n))),ac_sources)->'assignments')=10000", 'ten thousand generic/specific civil intervals are verified complete without truncation');
 exec('ac_key:=gen_random_uuid();ac_receipt:=' + write('maker', 'ac_body', 'ac_key') + ';ac_id:=(ac_receipt->>\'proposalId\')::uuid;');
 ok("ac_receipt->>'status'='pending' AND ac_receipt->'body'=ac_body AND own_accounting_bootstrap_v1(maker)#>>'{configuration,revision}'='0'", 'whole proposal conserves all distinct fields without approving configuration');
 ok(write('maker','ac_body','ac_key') + "-'replayed'=ac_receipt-'replayed' AND own_accounting_attempt_v1(maker,ac_key)->>'replayed'='true'", 'replay and recovery retain original body/key');
 // Upgrade after an older request is durably pending. The original request,
 // idempotency key, prior definition and receipt must survive unchanged.
 exec('EXECUTE '+q(relocate(bankInstallation.installation.slice(0,-1).join(';\n')))+';EXECUTE '+q(relocate(bankInstallation.proof))+' INTO ac_install_proof;EXECUTE '+q(relocate(bankInstallation.durableVerification.slice(0,-1).join(';\n')))+';EXECUTE '+q(relocate(bankInstallation.durableProof))+' INTO ac_durable_proof;');
 ok("ac_install_proof->>'beforeFingerprint'=ac_install_proof->>'preservationSha256' AND ac_install_proof-'beforeFingerprint'=ac_durable_proof AND ac_install_proof->>'eventRows'='1' AND ac_install_proof->>'replacedFunctions'='1'", 'bank validator upgrade preserves every existing row and object, including old pending proposal');
 ok(write('maker','ac_body','ac_key') + "-'replayed'=ac_receipt-'replayed' AND own_accounting_attempt_v1(maker,ac_key)->'body'=ac_body", 'old pending request replays byte-identically after SQL150');
 ok('qa_rejects('+q(relocate(bankInstallation.migration.join(';\n')))+",'ACCOUNTING_BANK_ALREADY_INSTALLED')", 'second SQL150 install refuses to repeat upgrade');
 exec("ac_bank_definition:=jsonb_set(ac_definition,'{mappings,0}',ac_definition#>'{mappings,0}'||jsonb_build_object('bankDestinationVersion','own-accounting-bank-destination.v1','bankConceptReference','BANK-CONCEPT-QA','bankMovementReference','BANK-MOVEMENT-QA','netCreditorKind','none','netCreditorReference',NULL,'indicatesNet',false));");
 ok("own_accounting_definition_v1(ac_bank_definition,ac_sources)=ac_bank_definition", 'new bank concept, movement, None net creditor and false flag survive independently of accounts');
 for(const [kind,reference] of [['not_informed',null],['none',null],['reference','0'],['reference','000123']]) for(const indicatesNet of [null,false,true]){
  const definition="jsonb_set(ac_bank_definition,'{mappings,0}',ac_bank_definition#>'{mappings,0}'||"+j({netCreditorKind:kind,netCreditorReference:reference,indicatesNet})+')';
  ok('own_accounting_definition_v1('+definition+',ac_sources)='+definition,'typed net creditor '+kind+' / flag '+indicatesNet+' / reference '+reference);
 }
 for(const [field,value] of [['bankDestinationVersion','unknown'],['bankConceptReference',' '],['bankMovementReference','<script>'],['netCreditorKind','unknown'],['netCreditorKind',{toString:'none'}],['netCreditorReference','INCOMPATIBLE'],['indicatesNet','false'],['indicatesNet',0]]){
  ok('qa_rejects(format('+q("SELECT own_accounting_definition_v1(%L::jsonb,%L::jsonb)")+",jsonb_set(ac_bank_definition,'{mappings,0,"+field+"}',"+j(value)+"),ac_sources),'ACCOUNTING_INPUT_INVALID')",'reject malformed bank declaration '+field+' '+JSON.stringify(value));
 }
 ok("qa_rejects(format('SELECT own_accounting_definition_v1(%L::jsonb,%L::jsonb)',jsonb_set(ac_bank_definition,'{mappings,0}',(ac_bank_definition#>'{mappings,0}')-'indicatesNet'),ac_sources),'ACCOUNTING_INPUT_INVALID')", 'partial new row never becomes a legacy row');
 ok("qa_rejects(format('SELECT own_accounting_definition_v1(%L::jsonb,%L::jsonb,%L::jsonb)',ac_bank_definition,ac_sources,ac_definition),'ACCOUNTING_HISTORY_REQUIRED')", 'upgrading fields cannot rewrite an older mapping in place');
 reject("ac_body||jsonb_build_object('reason','Different synthetic reason')", 'IDEMPOTENCY_REUSE', 'same key cannot change body', 'maker', 'ac_key');
 ok("qa_rejects(format('SELECT own_accounting_attempt_v1(%L::jsonb,%L::uuid)',checker,ac_key),'ACCOUNTING_NOT_FOUND')", 'another reviewer cannot retrieve preparer attempt');
 exec("ac_detail:=own_accounting_detail_v1(checker,ac_id);ac_review:=ac_body||jsonb_build_object('command','approve','scopeVersion',native_salary_scope_v1(native_salary_context_v1(checker)),'proposalId',ac_id,'proposalSha256',ac_receipt->>'requestSha256','definition',NULL,'reason','Independent review of every synthetic accounting destination','reviewConfirmed',true);");
 ok("ac_detail->'body'=ac_body AND ac_detail->'sources'=ac_sources AND ac_detail->>'current'='true' AND ac_detail#>>'{proposal,canReview}'='true'", 'independent detail returns complete captured source/base/whole proposal');
 reject("ac_review||jsonb_build_object('scopeVersion',native_salary_scope_v1(native_salary_context_v1(same_person)))", 'INDEPENDENT_REQUIRED', 'another login of same person cannot approve', 'same_person');
 reject("ac_review||jsonb_build_object('proposalSha256',repeat('f',64))", 'PROPOSAL_CHANGED', 'reviewed fingerprint cannot change', 'checker');
 exec('ac_review_key:=gen_random_uuid();ac_approval:=' + write('checker','ac_review','ac_review_key') + ';');
 ok("ac_approval->>'status'='approved' AND ac_approval->>'revision'='1' AND own_accounting_bootstrap_v1(maker)#>'{configuration,definition}'=ac_definition AND ac_approval->>'accountingPosted'='false' AND ac_approval->>'paymentExecuted'='false'", 'independent approval activates every destination without posting or paying');
 ok(write('maker','ac_body','ac_key') + "-'replayed'=ac_receipt-'replayed' AND " + write('checker','ac_review','ac_review_key') + "-'replayed'=ac_approval-'replayed'", 'approval never breaks original prepare/decision replay');
 reject('ac_review', 'DECIDED', 'second decision cannot apply twice', 'checker');
 const archived = "ac_sources||jsonb_build_object('agreements','[]'::jsonb,'departments','[]'::jsonb,'concepts','[]'::jsonb,'contracts','[]'::jsonb)";
 const closed = "jsonb_set(jsonb_set(ac_definition,'{mappings,0,validUntil}','\"2026-10-31\"'),'{assignments,0,validUntil}','\"2026-10-31\"')";
 ok(`own_accounting_definition_v1(ac_definition,${archived},ac_definition)=ac_definition`, 'archived references retain unchanged complete approved history');
 ok(`own_accounting_definition_v1(${closed},${archived},ac_definition)=${closed}`, 'archived references allow only earlier explicit closing dates');
 ok(`qa_rejects(format('SELECT own_accounting_definition_v1(%L::jsonb,%L::jsonb,%L::jsonb)',jsonb_set(ac_definition,'{mappings,0,budgetItemReference}','\"ALTERED\"'),${archived},ac_definition),'ACCOUNTING_HISTORY_REQUIRED')`, 'archiving never permits overwriting historic destinations');
 for (const kind of ['mappings','assignments']) {
  const successor = `jsonb_set(${closed},'{${kind}}',(${closed}->'${kind}')||jsonb_build_array((${closed}#>'{${kind},0}')||jsonb_build_object('validFrom','2026-11-01','validUntil','2026-12-31')))`;
  ok(`qa_rejects(format('SELECT own_accounting_definition_v1(%L::jsonb,%L::jsonb,%L::jsonb)',${successor},${archived},ac_definition),'ACCOUNTING_SOURCE_REQUIRED')`, 'archived reference cannot create a new ' + kind + ' interval');
 }
 exec("ac_boot:=own_accounting_bootstrap_v1(maker);ac_body:=ac_body||jsonb_build_object('baseVersion',ac_boot#>>'{configuration,version}');");
 reject("jsonb_set(ac_body,'{definition,mappings,0,budgetItemReference}','\"NEW-DESTINATION\"')", 'HISTORY_REQUIRED', 'approved destination cannot be overwritten');
 reject("jsonb_set(ac_body,'{definition,assignments}','[]')", 'HISTORY_REQUIRED', 'old institution history cannot be removed');
 exec("ac_definition:=jsonb_set(ac_definition,'{mappings,0,validUntil}','\"2026-10-31\"');ac_definition:=jsonb_set(ac_definition,'{mappings}',(ac_definition->'mappings')||jsonb_build_array((ac_definition#>'{mappings,0}')||jsonb_build_object('validFrom','2026-11-01','validUntil','2026-12-31','budgetItemReference','NEW-DESTINATION','ruleReference','New synthetic destination with declared validity')));ac_body:=ac_body||jsonb_build_object('definition',ac_definition);ac_key:=gen_random_uuid();ac_receipt:=" + write('maker','ac_body','ac_key') + ';');
 ok("ac_receipt->>'status'='pending' AND ac_receipt#>>'{body,definition,mappings,0,budgetItemReference}'='001.01' AND ac_receipt#>>'{body,definition,mappings,1,budgetItemReference}'='NEW-DESTINATION'", 'closing and adding retains historic reference and explicit new destination');
 exec("ac_review:=ac_review||jsonb_build_object('baseVersion',ac_body->>'baseVersion','proposalId',ac_receipt->>'proposalId','proposalSha256',ac_receipt->>'requestSha256');ac_approval:=" + write('checker','ac_review') + ';');
 ok("ac_approval->>'revision'='2' AND own_accounting_bootstrap_v1(maker)#>'{configuration,definition}'=ac_definition AND (SELECT body FROM own_payroll_accounting_event WHERE id=ac_id)#>>'{definition,mappings,0,validUntil}'='2026-12-31'", 'new approval leaves original version immutable');
 exec("ac_boot:=own_accounting_bootstrap_v1(maker);ac_body:=ac_body||jsonb_build_object('baseVersion',ac_boot#>>'{configuration,version}','definition',jsonb_set(ac_definition,'{assignments,0,validUntil}','\"2026-12-31\"'));FOR ac_n IN 1..26 LOOP ac_receipt:=" + write('maker', "ac_body||jsonb_build_object('reason','Synthetic complete proposal '||ac_n)") + ';END LOOP;ac_boot:=own_accounting_bootstrap_v1(maker);');
 ok("jsonb_array_length(ac_boot->'proposals')=28 AND ac_boot->>'complete'='true'", 'more than one display page is returned complete');
 exec("DELETE FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key='payroll.parameter.prepare';");
 ok("qa_rejects(format('SELECT own_accounting_attempt_v1(%L::jsonb,%L::uuid)',maker,ac_key),'ACCOUNTING_FORBIDDEN')", 'revocation stops recovering private original receipt');
 reject('ac_body','FORBIDDEN','revocation stops pending write');
 exec("INSERT INTO capabilities VALUES((maker->>'membershipId')::uuid,'payroll.parameter.prepare');");
 for (const sql of ['UPDATE own_payroll_accounting_event SET body=body','DELETE FROM own_payroll_accounting_event','TRUNCATE own_payroll_accounting_event CASCADE']) ok('qa_rejects(' + q(sql) + ",'ACCOUNTING_IMMUTABLE')", 'immutable history ' + sql.split(' ')[0]);
 ok('(SELECT md5(jsonb_agg(to_jsonb(ec) ORDER BY id)::text) FROM employment_contract ec)=ac_before', 'existing own/imported contracts remain byte-identical');
 const block = `DECLARE ac_before text;ac_install_proof jsonb;ac_durable_proof jsonb;ac_class jsonb;ac_class_body jsonb;ac_class_receipt jsonb;ac_boot jsonb;ac_sources jsonb;ac_definition jsonb;ac_bank_definition jsonb;ac_body jsonb;ac_review jsonb;ac_detail jsonb;ac_receipt jsonb;ac_approval jsonb;ac_key uuid;ac_review_key uuid;ac_id uuid;ac_n integer;BEGIN ${statements.join('\n')} END;`;
 const anchor = "RAISE EXCEPTION USING ERRCODE='P1121',MESSAGE='RESTORE_SALARY_FIXTURES';"; assert.equal(base.sql.split(anchor).length, 2);
 const report = { ...base.report, ownAccountingChecksPassed: count, checksPassed: base.report.checksPassed + count, migration147Sha256: createHash('sha256').update(source).digest('hex'), limitations: [...base.report.limitations, '147 persists only synthetic configuration: no productive install, municipal accounting, payment or human acceptance.'] };
 return { ...base, report, sql: base.sql.replace("current_database()<>'native_employment_lifecycle_qa'", "current_database()<>'own_payroll_accounting_qa'").replace(anchor, () => block + '\n' + anchor).replace('checks<>' + base.report.checksPassed, 'checks<>' + report.checksPassed).replace(j(base.report), () => j(report)) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
 const args = {}; for (const a of process.argv.slice(2)) { if (a === '--ci') { args.ci = true; continue; } const m = /^--(expected-major|write-sql)=(.+)$/.exec(a); assert.ok(m); assert.equal(args[m[1]], undefined); args[m[1]] = m[2]; }
 assert.equal(args.ci, true); assert.ok(args['write-sql']); const qa = buildOwnAccountingQa({ serverMajor: args['expected-major'] }), target = path.resolve(args['write-sql']); assert.ok(!fs.existsSync(target)); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, qa.sql, { flag: 'wx' }); console.log(JSON.stringify({ generated: true, databaseExecuted: false, checksPlanned: qa.report.checksPassed, ownAccountingChecksPlanned: qa.report.ownAccountingChecksPassed }));
} catch (e) { console.error(JSON.stringify({ ok: false, message: e.message })); process.exitCode = 1; }
