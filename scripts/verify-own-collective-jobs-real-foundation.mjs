// Linux/loopback integration with real IAM, source, adoption and canonical
// parameter functions. Every actor and personnel record is fictional.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { buildOwnerDecisionQa } from './lib/municipal-owner-adoption-decision-qa.mjs';
import { sealAdoptionReview } from '../assets/employment-adoption-review-model.js';
import { adoptionPreparationPayload } from '../assets/employment-adoption-preparation-model.js';
import { collectiveJobSnapshot } from '../lib/own-collective-jobs.js';

const root = path.resolve(import.meta.dirname, '..'), option = name => process.argv[process.argv.indexOf(name) + 1];
const executable = option('--psql'), dataDirectory = option('--data-directory'), output = path.resolve(root, option('--output'));
assert.ok(path.isAbsolute(executable) && path.isAbsolute(dataDirectory));
assert.ok(output.startsWith(path.join(root, 'verification') + path.sep) && !fs.existsSync(output));
fs.mkdirSync(output, { recursive: true });
const sourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
assert.match(sourceCommit, /^[a-f0-9]{40}$/);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const qa = buildOwnerDecisionQa({ major: 17, sourceCommit, read });
const q = value => "'" + String(value).replaceAll("'", "''") + "'", j = value => q(JSON.stringify(value)) + '::jsonb';
const args = ['-X', '-q', '-t', '-A', '-h', '127.0.0.1', '-p', '55417', '-U', 'postgres', '-d', 'own_payroll_run_qa', '-v', 'ON_ERROR_STOP=1', '-f', '-'];
const guard = `DO $destination$ BEGIN IF current_database()<>'own_payroll_run_qa' OR current_user<>'postgres'
 OR inet_server_addr()<>'127.0.0.1'::inet OR inet_server_port()<>55417
 OR current_setting('server_version_num')::integer/10000<>17
 OR current_setting('data_directory')<>${q(dataDirectory)}
 OR nullif(current_setting('neon.project_id',true),'') IS NOT NULL
 THEN RAISE EXCEPTION 'COLLECTIVE_REAL_QA_DESTINATION'; END IF; END $destination$;`;
let sequence = 0; const checks = [], metrics = {}, histories = [];
const record = label => { checks.push(label); console.log('PASS ' + label); };
function execute(statements, { runtime = false, repeatable = false } = {}) {
 const sql = `BEGIN ISOLATION LEVEL ${repeatable ? 'REPEATABLE READ' : 'READ COMMITTED'};
 SET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='2s'; SET LOCAL TIME ZONE 'UTC';
 ${guard} SET LOCAL search_path=pg_catalog,${qa.schema},public,pg_temp;
 ${runtime ? 'SET LOCAL ROLE municontrol_actions_runtime_app;' : ''}
 ${statements}; COMMIT;`;
 const stem = String(++sequence).padStart(3, '0');
 fs.writeFileSync(path.join(output, stem + '.sql'), sql);
 const result = spawnSync(executable, args, { input: sql, encoding: 'utf8', timeout: 150000, maxBuffer: 32 * 1024 * 1024 });
 fs.writeFileSync(path.join(output, stem + '.log'), (result.stdout ?? '') + (result.stderr ?? ''));
 assert.equal(result.status, 0, result.stderr?.slice(-6000) ?? String(result.error));
 const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
 return line?.startsWith('{') || line?.startsWith('[') ? JSON.parse(line) : line;
}
const query = (statement, actor = qa.actor) => execute(qa.normalized(statement.replaceAll('$ACTOR', j(actor))), { runtime: true });
const rowQuery = statement => execute(qa.normalized(statement));
function snapshot(value) { return collectiveJobSnapshot(value); }
const step = state => snapshot(query(`SELECT public.own_collective_job_step_v1(${q(state.id)}::uuid,${state.dispatchGeneration},8)`));
function drive(initial, phase) {
 let value = initial, iterations = 0; const started = performance.now();
 while (value.phase === phase) { value = step(value); assert.ok(++iterations < 1000); }
 assert.equal(value.phase, phase === 'preparing' ? 'prepared' : 'complete', JSON.stringify(value));
 return { state: value, iterations, milliseconds: Math.round(performance.now() - started) };
}
let seeded = false;
try {
 execute("DO $role$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') THEN CREATE ROLE municontrol_actions_runtime_app NOLOGIN;END IF;END $role$; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
 execute(qa.seed, { repeatable: true }); seeded = true;
 execute(qa.local.installation.join(';\n'), { repeatable: true });
 record('488 original functions and the complete fictional source are installed with real IAM and source guards');
 const rosterSource = read('tests/fixtures/own-collective-installed-roster.sql.txt');
 assert.equal(createHash('sha256').update(rosterSource).digest('hex'), '3b27f0b7be40a279f9b63009f9a50cafdf2921aadaddf18a7ab839bec79a843e');
 execute(qa.normalized(rosterSource) + `; REVOKE ALL ON FUNCTION ${qa.schema}.native_employee_roster_projection_batch_v1(jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION ${qa.schema}.native_employee_roster_projection_batch_v1(jsonb) TO municontrol_actions_runtime_app`);
 const packageSha = rowQuery(`SELECT jsonb_build_object('sha',package_sha256) FROM public.grh_final_source_revision WHERE id=${q(qa.ids.revision)}`).sha;
 const bootstrap = query(`SELECT public.employment_adoption_operational_bootstrap_v1($ACTOR,${q(qa.ids.revision)},${q(packageSha)})`);
 assert.equal(bootstrap.rawReview.total, 63);
 const review = await sealAdoptionReview(bootstrap.rawReview);
 const proposalBody = await adoptionPreparationPayload(review, bootstrap.catalogVersion, '', 'Antecedente exclusivamente ficticio para QA de lotes', 'Preparación completa exclusivamente ficticia para QA de lotes');
 const proposal = query(`SELECT public.employment_adoption_propose_v1($ACTOR,${j(proposalBody)},${q(randomUUID())})`);
 const detail = query(`SELECT public.municipal_adoption_review_v1($ACTOR,${q(proposal.receipt.proposalId)})`, qa.checker);
 const decisionBody = { reviewVersion: detail.reviewVersion, reviewConfirmed: true, review: {
  proposalId: proposal.receipt.proposalId, proposalVersion: detail.proposal.proposalVersion,
  sourceContextVersion: detail.proposal.sourceContextVersion, catalogVersion: detail.proposal.catalogVersion,
  decision: 'approve', reason: 'Revisión independiente exclusivamente ficticia para QA de lotes'
 } };
 const adopted = query(`SELECT public.municipal_adoption_command_v1($ACTOR,${j(decisionBody)},${q(randomUUID())})`, qa.checker);
 assert.equal(adopted.receipt.total, 63);
 const roster = query(`SELECT jsonb_agg(jsonb_build_object('contractId',b.contract_id,'data',b.data)) FROM public.native_employee_roster_projection_batch_v1($ACTOR) b`);
 assert.equal(roster.length, 63); assert.ok(roster.every(row => row.data.status === 'active' && row.data.recordKind === 'adopted'));
 record('63 contracts are independently adopted through the existing canonical circuit and read by the pinned batch projection');

 // Add only fictional fixture assignments, retaining the actual IAM resolver,
 // session checks and independent person/membership identities throughout.
 rowQuery(`INSERT INTO public.iam_capability(capability_key,label,description,scope_kind)
 SELECT v,'QA','Permiso exclusivamente ficticio para la prueba de lotes','tenant'
 FROM unnest(ARRAY['payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve']) v ON CONFLICT DO NOTHING;
 INSERT INTO public.iam_role_capability(role_key,capability_key)
 SELECT m.role_key,v FROM public.tenant_membership m CROSS JOIN unnest(ARRAY['payroll.parameter.read','payroll.parameter.prepare']) v
 WHERE m.id=${q(qa.actor.membershipId)}::uuid ON CONFLICT DO NOTHING;
 INSERT INTO public.iam_role_capability(role_key,capability_key)
 SELECT 'QA_ADOPTION_CHECKER',v FROM unnest(ARRAY['payroll.parameter.read','payroll.parameter.approve']) v
 ON CONFLICT DO NOTHING; SELECT jsonb_build_object('addedFixtureGrants',true)`);
 // The adoption foundation carries the seniority writer and agreement hours,
 // but not the separate per-contract working-time ledger. Install its complete
 // unchanged canonical migration, including its own prerequisites and ACL.
 execute(qa.normalized(read('scripts/migrations/163-own-contract-working-time.sql')));
 const source = read('scripts/migrations/225-own-collective-jobs.sql');
 execute(qa.normalized(source));
 record('migration 225 compiles against real tables, authoritative context and the installed projection signature');

 const records = rowQuery(`SELECT jsonb_agg(jsonb_build_object('contractId',c.id,'registrationId',r.id,'legajo',c.legacy_legajo,'proposalId',NULL)
 ORDER BY c.id) FROM public.native_employee_registration r JOIN public.employment_contract c ON c.id=r.contract_id
 WHERE r.tenant_id=${q(qa.actor.tenantId)}::uuid AND r.source_binding_id=${q(qa.ids.binding)}::uuid`);
 assert.equal(records.length, 63);
 for (const family of ['working-time', 'seniority']) {
  const definition = family === 'working-time'
   ? { dailyHours: '7.50000001', monthlyHours: null, asOfDate: '2026-10-01', documentReference: 'Constancia de jornada exclusivamente ficticia QA' }
   : { years: '0', months: null, asOfDate: '2026-10-01', documentReference: 'Constancia de antigüedad exclusivamente ficticia QA' };
  const file = { version: family === 'working-time' ? 'own-contract-working-time-collective.v1' : 'own-salary-seniority-collective.v1', period: '2026-10', scope: 'all_active', total: records.length, records: records.map(row => ({ ...row, definition })) };
  let prepared = snapshot(query(`SELECT public.own_collective_job_create_v1($ACTOR,${q(family)},${j(file)},'propose','Preparación íntegra exclusivamente ficticia QA',${q(randomUUID())})`));
  const preparing = drive(prepared, 'preparing'); prepared = preparing.state;
  const running = snapshot(query(`SELECT public.own_collective_job_confirm_v1($ACTOR,${q(prepared.id)},${q(prepared.reviewHash)})`));
  const proposing = drive(running, 'running'); assert.equal(proposing.state.confirmed, 63);
  const approving = snapshot(query(`SELECT public.own_collective_job_create_v1($ACTOR,${q(family)},${j(file)},'approve','Revisión independiente íntegra exclusivamente ficticia QA',${q(randomUUID())})`, qa.checker));
  const reviewed = drive(approving, 'preparing');
  const confirmed = snapshot(query(`SELECT public.own_collective_job_confirm_v1($ACTOR,${q(reviewed.state.id)},${q(reviewed.state.reviewHash)})`, qa.checker));
  const finished = drive(confirmed, 'running'); assert.equal(finished.state.confirmed, 63);
  const table = family === 'working-time' ? 'own_working_time_event' : 'own_seniority_event';
  const counts = rowQuery(`SELECT jsonb_build_object('propose',count(*) FILTER(WHERE command='propose'),'approve',count(*) FILTER(WHERE command='approve'),'actors',count(DISTINCT actor_person_id)) FROM public.${table}`);
  assert.deepEqual(counts, { propose: 63, approve: 63, actors: 2 });
  metrics[family] = { preparation: preparing.milliseconds, proposals: proposing.milliseconds, independentReview: reviewed.milliseconds, approvals: finished.milliseconds, totalChunks: preparing.iterations + proposing.iterations + reviewed.iterations + finished.iterations };
  histories.push({ family, proposalJob: proposing.state.id, approvalJob: finished.state.id, counts });
  record(`${family}: 63 proposals and independent approvals persist through canonical writers with the actual source/context shapes`);
 }
 const result = { version: 'own-collective-real-foundation-qa.v1', passed: true, schema: qa.schema, checks, metrics, histories,
  postgres: 17, originalFunctions: qa.definitions.length, fictionalActors: true, realIamResolvers: true, realSourceResolvers: true,
  migrationSha256: createHash('sha256').update(source).digest('hex'),
  realBatchProjectionSha256: '3b27f0b7be40a279f9b63009f9a50cafdf2921aadaddf18a7ab839bec79a843e', sourceHashes: qa.sourceHashes,
  syntheticOnly: true, productionVisited: false, municipalWrites: 0 };
 fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
 console.log(JSON.stringify({ passed: true, checks: checks.length, schema: qa.schema, metrics }));
} catch (error) {
 fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ passed: false, error: error.message, stack: error.stack, checks, metrics, schema: qa.schema, seeded, syntheticOnly: true, productionVisited: false }, null, 2));
 throw error;
}
