// Actual SQL122 plus every original salary/identity/lifecycle regression.
// Disposable PostgreSQL only; this file never connects to a database itself.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildNativeSalaryQa } from './verify-native-salary-sql.mjs';
import { program, definitions } from '../tests/fixtures/own-payroll-program-synthetic.js';
import { programFingerprint } from '../lib/internal-own-payroll-program.js';
import { command } from '../tests/fixtures/own-payroll-program-synthetic.js';
import {exactProgram} from '../tests/fixtures/own-payroll-exact-program-synthetic.js';
import {buildExactProgramPrecisionInstallation} from './lib/exact-program-precision-installation.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const q = v => "'" + String(v).replaceAll("'", "''") + "'", j = v => q(JSON.stringify(v)) + '::jsonb';
export function buildOwnProgramQa({ serverMajor, withMonthlySource = false, exactPrecision = false }) {
  const base = buildNativeSalaryQa({ serverMajor, withMonthlySource }), { schema, ids } = base;
  const migration = fs.readFileSync(path.join(root, 'scripts/migrations/122-own-payroll-programs.sql'), 'utf8').replaceAll('\r\n', '\n');
  const relocate = s => s.replaceAll('public.', schema + '.').replaceAll(schema + '.digest(', 'public.digest(').replaceAll("'public'::regnamespace", q(schema) + '::regnamespace').replace(/SET search_path\s*=\s*pg_catalog,public,pg_temp/g, 'SET search_path=pg_catalog,' + schema + ',public,pg_temp');
  const statements = []; let count = 0;
  const exec = s => statements.push(s), ok = (s, label) => { exec('PERFORM qa_assert((' + s + '),' + q(label) + ');checks:=checks+1;'); count++; };
  const reject = (s, code, label) => ok('qa_rejects(' + q(relocate(s)) + ',' + q(code) + ')', label);
  const write = (actor = 'maker', body = 'program_body', key = 'gen_random_uuid()') => 'own_program_command_v1(' + actor + ',' + body + ',' + key + ')';
  const rejected = (body, code, label, actor = 'maker', key = 'gen_random_uuid()') => ok('qa_rejects(format(' + q('SELECT own_program_command_v1(%1$L::jsonb,%2$L::jsonb,%3$L::uuid)') + ',' + actor + ',' + body + ',' + key + '),' + q('OWN_PROGRAM_' + code) + ')', label);
  exec("BEGIN CREATE FUNCTION own_program_partial_stub() RETURNS boolean LANGUAGE sql AS 'SELECT true';");
  reject(migration, 'OWN_PROGRAM_OBJECT_CONFLICT', 'partial existing helpers stop before creating the new table');
  ok("to_regclass('own_payroll_program_event') IS NULL", 'conflicting install leaves no partial table');
  exec("RAISE EXCEPTION USING ERRCODE='P1222',MESSAGE='RESTORE_PARTIAL_PROGRAM_FIXTURE';EXCEPTION WHEN SQLSTATE 'P1222' THEN NULL;END;");
  exec(`program_contracts_before:=(SELECT md5(jsonb_agg(to_jsonb(ec) ORDER BY id)::text) FROM employment_contract ec);
    EXECUTE ${q(relocate(migration))};program_boot:=own_program_bootstrap_v1(maker);`);
  ok("program_boot#>>'{program,revision}'='0' AND program_boot#>'{program,definition}'='null'::jsonb AND program_boot->>'payrollCalculated'='false' AND program_boot->>'payrollPosted'='false'", 'empty program does not invent an approval or calculation');
  ok("(SELECT count(*)=14 AND count(*) FILTER(WHERE has_function_privilege('municontrol_actions_runtime_app',oid,'EXECUTE'))=3 FROM pg_proc WHERE pronamespace=" + q(schema) + "::regnamespace AND proname LIKE 'own_program_%') AND NOT has_table_privilege('municontrol_actions_runtime_app','own_payroll_program_event','SELECT') AND (SELECT relrowsecurity FROM pg_class WHERE oid='own_payroll_program_event'::regclass)", 'only three facades; private immutable event table has RLS');
  exec('SET LOCAL ROLE municontrol_actions_runtime_app;program_boot:=own_program_bootstrap_v1(reader);RESET ROLE;');
  ok("program_boot#>>'{permissions,canPropose}'='false' AND program_boot#>>'{permissions,canReview}'='false'", 'real runtime reader receives no write permission');
  // Add invented definitions through the existing approved112 facade.
  exec(`salary_boot:=native_salary_bootstrap_v1(maker);salary_body:=salary_body||jsonb_build_object('scopeVersion',salary_boot->>'scopeVersion','baseVersion',salary_boot#>>'{catalog,version}','classificationVersion',salary_boot#>>'{classification,version}','items',native_salary_items_v1((salary_boot#>'{catalog,items}')||${j(definitions())}),'reason','Invented own-engine QA definitions, no municipal homologation');
    salary_receipt:=native_salary_command_v1(maker,salary_body,gen_random_uuid());salary_review:=salary_review||jsonb_build_object('scopeVersion',native_salary_bootstrap_v1(checker)->>'scopeVersion','baseVersion',salary_body->>'baseVersion','classificationVersion',salary_body->>'classificationVersion','proposalId',salary_receipt->>'proposalId','proposalSha256',salary_receipt->>'requestSha256','reason','Independent review of invented QA definitions');PERFORM native_salary_command_v1(checker,salary_review,gen_random_uuid());
    program_boot:=own_program_bootstrap_v1(maker);program_body:=${j(command())}||jsonb_build_object('scopeVersion',program_boot->>'scopeVersion','baseVersion',program_boot#>>'{program,version}','salaryVersion',program_boot#>>'{salaryCatalog,version}');`);
  ok('own_program_definition_v1(' + j(program()) + ",program_boot#>'{salaryCatalog,items}')=" + j(program()), 'real SQL and JavaScript validate the same whole exact program');
  ok('encode(public.digest(native_salary_serialized_v1(' + j(command()) + "),'sha256'),'hex')=" + q(programFingerprint(command())), 'program request hashes match across JavaScript and PostgreSQL');
  const invalid = [
    [p => p.bindings.find(b => b.key === 'base').sourceCode = '999999999', 'SOURCE_DEFINITION_MISSING'],
    [p => p.bindings.find(b => b.key === 'base').combine = 'sum', 'BINDING_INVALID'],
    [p => p.bindings[0].unit = 'hours', 'BINDING_INVALID'],
    [p => p.bindings.push({ ...p.bindings[0] }), 'BINDING_DUPLICATE'],
    [p => p.bindings.push({ ...p.bindings[1], key: 'unused' }), 'BINDING_UNUSED'],
    [p => p.rules[0].expression = { op: 'concept', code: '110', stage: 'rounded' }, 'CYCLE'],
    [p => p.rules[0].validUntil = '2026-10', 'DEPENDENCY'],
    [p => p.rules[0].expression = { op: 'eval', text: 'legacy()' }, 'OPERATION_UNSUPPORTED'],
    [p => p.rules[0].rounding.mode = 'guessed', 'INPUT_INVALID'],
    [p => p.rules[0].code = 100, 'INPUT_INVALID'],
    [p => p.rules[0].validUntil = 202611, 'INPUT_INVALID'],
    [p => p.rules[0].liquidationTypes = [null], 'INPUT_INVALID'],
    [p => p.bindings[0].sourceCode = 120, 'BINDING_INVALID'],
  ];
  for (const [change, code] of invalid) { const p = program(); change(p); rejected('program_body||jsonb_build_object(\'program\',' + j(p) + ')', code, 'reject malformed program ' + code); }
  rejected("program_body||jsonb_build_object('salaryVersion',repeat('f',64))", 'BASE_CHANGED', 'catalog version cannot be substituted');
  rejected("program_body||jsonb_build_object('scopeVersion',repeat('f',64))", 'SCOPE_CHANGED', 'membership scope cannot be substituted');
  rejected("program_body||jsonb_build_object('reviewConfirmed','false')", 'INPUT_INVALID', 'text is not a boolean review declaration');
  rejected("program_body||jsonb_build_object('scopeVersion',own_program_bootstrap_v1(reader)->>'scopeVersion')", 'FORBIDDEN', 'read alone cannot propose', 'reader');
  rejected("program_body||jsonb_build_object('scopeVersion',own_program_bootstrap_v1(unlinked)->>'scopeVersion')", 'EMPLOYMENT_REQUIRED', 'unlinked identity cannot write', 'unlinked');
  ok('(SELECT count(*) FROM own_payroll_program_event)=0', 'every invalid operation leaves no event');
  exec('program_key:=gen_random_uuid();program_receipt:=' + write('maker', 'program_body', 'program_key') + ';program_id:=(program_receipt->>\'proposalId\')::uuid;');
  ok("program_receipt->>'status'='pending' AND own_program_bootstrap_v1(maker)#>>'{program,revision}'='0' AND program_receipt->'body'=program_body", 'proposal conserves the exact complete body and cannot become effective alone');
  ok(write('maker', 'program_body', 'program_key') + "-'replayed'=program_receipt-'replayed' AND own_program_attempt_v1(maker,program_key)->>'replayed'='true' AND (SELECT count(*) FROM own_payroll_program_event)=1", 'retry and recovery retain the same key/body with no duplicate');
  rejected("program_body||jsonb_build_object('reason','Changed synthetic request content')", 'IDEMPOTENCY_REUSE', 'same key cannot overwrite content', 'maker', 'program_key');
  exec(`program_boot:=own_program_bootstrap_v1(checker);program_review:=jsonb_build_object('command','approve','scopeVersion',program_boot->>'scopeVersion','baseVersion',program_body->>'baseVersion','salaryVersion',program_body->>'salaryVersion','proposalId',program_id,'proposalSha256',program_receipt->>'requestSha256','program',NULL,'reason','Independent synthetic full-program review','reviewConfirmed',true);`);
  rejected("program_review||jsonb_build_object('scopeVersion',own_program_bootstrap_v1(same_person)->>'scopeVersion')", 'INDEPENDENT_REQUIRED', 'same person cannot review through another membership', 'same_person');
  rejected("program_review||jsonb_build_object('proposalSha256',repeat('f',64))", 'PROPOSAL_CHANGED', 'review pins the complete proposal hash', 'checker');
  exec('program_review_key:=gen_random_uuid();program_approval:=' + write('checker', 'program_review', 'program_review_key') + ';program_boot:=own_program_bootstrap_v1(maker);');
  ok("program_boot#>>'{program,revision}'='1' AND program_boot#>'{program,definition}'=" + j(program()) + " AND program_boot#>>'{program,salaryVersion}'=program_body->>'salaryVersion' AND program_boot#>>'{program,approvalId}'=program_approval->>'eventId'", 'independent approval publishes exactly the pinned own program');
  exec("RAISE NOTICE 'OWN_PROGRAM_SYNTHETIC_CONTRACT:%',jsonb_build_object('bootstrap',program_boot,'proposal',program_receipt,'approval',program_approval);");
  ok(write('checker', 'program_review', 'program_review_key') + "-'replayed'=program_approval-'replayed' AND (SELECT count(*) FROM own_payroll_program_event)=2", 'approval retry does not increment revision or add another event');
  rejected('program_review', 'DECIDED', 'new key cannot decide an already decided proposal', 'checker');
  rejected("program_body||jsonb_build_object('baseVersion',program_boot#>>'{program,version}','program',jsonb_set(program_body->'program','{rules}',(program_body#>'{program,rules}')-5))", 'HISTORY_REQUIRED', 'approved rule keys cannot be erased');
  // Prepare two different full proposals against one base. Approving one makes
  // the other stale, while its independent rejection remains possible.
  exec(`program_body:=program_body||jsonb_build_object('baseVersion',program_boot#>>'{program,version}','program',jsonb_set(program_body->'program','{rules,0,ruleReference}','"Synthetic revised full-program policy"'));program_receipt:=${write()};program_id:=(program_receipt->>'proposalId')::uuid;program_stale:=program_receipt;
    program_body:=jsonb_set(program_body,'{program,rules,0,ruleReference}','"Another synthetic revision with full history"');program_receipt:=${write()};program_review:=program_review||jsonb_build_object('proposalId',program_receipt->>'proposalId','proposalSha256',program_receipt->>'requestSha256','baseVersion',program_body->>'baseVersion');PERFORM ${write('checker', 'program_review')};
    program_review:=program_review||jsonb_build_object('proposalId',program_stale->>'proposalId','proposalSha256',program_stale->>'requestSha256');`);
  rejected('program_review', 'BASE_CHANGED', 'stale full program cannot be approved', 'checker');
  exec('program_review:=program_review||jsonb_build_object(\'command\',\'reject\');program_receipt:=' + write('checker', 'program_review') + ';');
  ok("program_receipt->>'status'='rejected' AND own_program_bootstrap_v1(maker)#>>'{program,revision}'='2'", 'stale proposal can be rejected without replacing current rules');
  // Revocation affects both reads and recovered attempts, including retries.
  exec('BEGIN DELETE FROM capabilities WHERE membership_id=' + q(ids.maker) + " AND capability_key='payroll.parameter.prepare';");
  ok('qa_rejects(format(' + q('SELECT own_program_attempt_v1(%1$L::jsonb,%2$L::uuid)') + ',maker,program_key),\'OWN_PROGRAM_FORBIDDEN\')', 'revoked write permission prevents receipt recovery');
  exec("RAISE EXCEPTION USING ERRCODE='P1222',MESSAGE='RESTORE_PROGRAM_PERMISSION';EXCEPTION WHEN SQLSTATE 'P1222' THEN NULL;END;");
  for (const sql of ['UPDATE own_payroll_program_event SET body=body', 'DELETE FROM own_payroll_program_event', 'TRUNCATE own_payroll_program_event CASCADE']) reject(sql, 'OWN_PROGRAM_IMMUTABLE', 'immutable history ' + sql.split(' ')[0]);
  reject(migration, 'OWN_PROGRAM_ALREADY_INSTALLED', 'reinstallation refuses before modifying any object');
  ok('(SELECT md5(jsonb_agg(to_jsonb(ec) ORDER BY id)::text) FROM employment_contract ec)=program_contracts_before', 'all prior canonical employees retained exactly');
  if(exactPrecision){
    const batch=buildExactProgramPrecisionInstallation({read:p=>fs.readFileSync(path.join(root,p),'utf8'),sourceCommit:'a'.repeat(40)});
    exec("program_contracts_before:=(SELECT native_salary_serialized_v1(jsonb_agg(to_jsonb(e) ORDER BY id)) FROM own_payroll_program_event e);");
    exec('EXECUTE '+q(relocate(batch.changed))+';');
    ok("(SELECT native_salary_serialized_v1(jsonb_agg(to_jsonb(e) ORDER BY id)) FROM own_payroll_program_event e)=program_contracts_before",'precision installation changes no historical event, receipt or body');
    exec('program_receipt:=own_program_attempt_v1(maker,program_key);program_body:=program_receipt->\'body\';program_receipt:='+write('maker','program_body','program_key')+';');
    ok("program_receipt->>'replayed'='true' AND program_receipt->'body'=program_body",'legacy rounded request replays its exact original body before the new precision guard');
    exec("program_boot:=own_program_bootstrap_v1(maker);program_body:=program_body||jsonb_build_object('scopeVersion',program_boot->>'scopeVersion','baseVersion',program_boot#>>'{program,version}','salaryVersion',program_boot#>>'{salaryCatalog,version}','program',program_boot#>'{program,definition}');");
    rejected("jsonb_set(program_body,'{program,rules,0,ruleReference}','\"Historical rounding reintroduced as changed QA content\"')",'PRECISION_REQUIRED','changing a legacy rounded rule requires an exact policy');
    // Closing old definitions is allowed without rewriting their historic math.
    exec("program_body:=jsonb_set(program_body,'{program,rules}',(SELECT jsonb_agg(r||jsonb_build_object('validUntil','2026-12') ORDER BY r->>'agreementCode',r->>'code',r->>'validFrom') FROM jsonb_array_elements(program_body#>'{program,rules}') r));program_receipt:="+write()+";program_review:=program_review||jsonb_build_object('command','approve','scopeVersion',own_program_bootstrap_v1(checker)->>'scopeVersion','baseVersion',program_body->>'baseVersion','salaryVersion',program_body->>'salaryVersion','proposalId',program_receipt->>'proposalId','proposalSha256',program_receipt->>'requestSha256');program_approval:="+write('checker','program_review')+';');
    ok("program_approval->>'status'='approved' AND (SELECT bool_and(r#>>'{rounding,mode}'<>'exact') FROM jsonb_array_elements(own_program_bootstrap_v1(maker)#>'{program,definition,rules}') r)",'independent approval closes old rules retaining their original policies');
    exec("program_boot:=own_program_bootstrap_v1(maker);program_body:=program_body||jsonb_build_object('baseVersion',program_boot#>>'{program,version}','program',program_boot#>'{program,definition}');");
    rejected("jsonb_set(program_body,'{program,rules,0,validUntil}','null')",'PRECISION_REQUIRED','extending a historic rounded rule is new content, not preservation');
    const exact=exactProgram();exact.rules.forEach(r=>r.validFrom='2027-01');
    exec("program_body:=program_body||jsonb_build_object('program',own_program_definition_v1("+j(exact)+"||jsonb_build_object('rules',(program_boot#>'{program,definition,rules}')||"+j(exact.rules)+"),program_boot#>'{salaryCatalog,items}'));");
    const newIndex=1; // normalized order: concept100 old row, then its new row
    for(const mode of ['half_up','half_even','toward_zero','floor','ceiling'])rejected(`jsonb_set(program_body,'{program,rules,${newIndex},rounding,mode}',${j(mode)})`,'PRECISION_REQUIRED','new final policy rejected: '+mode);
    const branch={op:'choose',condition:{op:'compare',operator:'eq',left:{op:'literal',value:'1',unit:'coefficient'},right:{op:'literal',value:'1',unit:'coefficient'}},then:{op:'input',unit:'money',key:'base'},else:{op:'round',value:{op:'literal',unit:'money',value:'100.015'},rounding:{precision:2,mode:'half_up'}}};
    rejected(`jsonb_set(program_body,'{program,rules,${newIndex},expression}',${j(branch)})`,'PRECISION_REQUIRED','SQL examines unchosen conditional branches without evaluating an expression');
    rejected("jsonb_set(program_body,'{program,rules,3,expression,left,stage}','\"rounded\"')",'PRECISION_REQUIRED','new downstream rule cannot take the rounded upstream value');
    exec('program_key:=gen_random_uuid();program_receipt:='+write('maker','program_body','program_key')+';');
    ok("program_receipt->>'status'='pending' AND program_receipt->'body'=program_body",'complete exact proposal preserves old rows and every exact new row');
    exec("program_review:=program_review||jsonb_build_object('baseVersion',program_body->>'baseVersion','proposalId',program_receipt->>'proposalId','proposalSha256',program_receipt->>'requestSha256');program_approval:="+write('checker','program_review')+';');
    ok("program_approval->>'status'='approved' AND own_program_bootstrap_v1(maker)#>'{program,definition}'=program_body->'program'",'independent approval publishes the entire synthetic exact program');
    exec('program_receipt:='+write('maker','program_body','program_key')+';');
    ok("program_receipt->>'replayed'='true' AND program_receipt->'body'=program_body",'exact request remains replayable after its independent approval');
  }
  const block = `DECLARE program_boot jsonb;program_body jsonb;program_receipt jsonb;program_approval jsonb;program_review jsonb;program_stale jsonb;program_key uuid;program_review_key uuid;program_id uuid;program_contracts_before text;BEGIN ${statements.join('\n')} END;`;
  const anchor = "RAISE EXCEPTION USING ERRCODE='P1121',MESSAGE='RESTORE_SALARY_FIXTURES';"; assert.equal(base.sql.split(anchor).length, 2);
  const report = { ...base.report, ownProgramChecksPassed: count, checksPassed: base.report.checksPassed + count, migration122Sha256: createHash('sha256').update(migration).digest('hex'), limitations: [...base.report.limitations, '122 validates and approves synthetic own programs. No productive installation, payroll calculation/posting or municipal normative approval.'] };
  assert.ok(base.sql.includes("current_database()<>'native_employment_lifecycle_qa'"));
  return { ...base, report, sql: base.sql.replace("current_database()<>'native_employment_lifecycle_qa'", exactPrecision ? "current_database()<>'own_payroll_run_qa'" : "current_database()<>'own_payroll_program_qa'").replace(anchor, () => block + '\n' + anchor).replace('checks<>' + base.report.checksPassed, 'checks<>' + report.checksPassed).replace(j(base.report), () => j(report)) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  const args = {}; for (const a of process.argv.slice(2)) { if (a === '--ci') { args.ci = true; continue; } if(a==='--exact-precision'){args.exactPrecision=true;continue;} const m = /^--(expected-major|write-sql)=(.+)$/.exec(a); assert.ok(m); assert.equal(args[m[1]], undefined); args[m[1]] = m[2]; }
  assert.equal(args.ci, true); assert.ok(args['write-sql']); const qa = buildOwnProgramQa({ serverMajor: args['expected-major'],exactPrecision:args.exactPrecision===true }), target = path.resolve(args['write-sql']);
  assert.ok(!fs.existsSync(target)); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, qa.sql, { flag: 'wx' }); console.log(JSON.stringify({ generated: true, databaseExecuted: false, checksPlanned: qa.report.checksPassed, ownProgramChecksPlanned: qa.report.ownProgramChecksPassed }));
} catch (e) { console.error(JSON.stringify({ ok: false, message: e.message })); process.exitCode = 1; }
