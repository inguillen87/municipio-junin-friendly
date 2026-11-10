// Local, stub-based verification of the family payroll facts backend proposal (SQL 226 + lib + API).
//
// It complements the certified installation harness and does not replace it: identity, lifecycle and registry
// readers are synthetic stubs, so what this proves is the unit itself — the new definition validator against the
// screen model, the conserved workflow under its rename, and the HTTP/SQL/JS contract end to end.
//
// It never receives a URL, host, user or password. It only reaches a throwaway local cluster through a unix
// socket directory, inside a database it creates and drops. Every row is synthetic.
//
//   node scripts/verify-own-contract-family-payroll-facts-local.mjs --socket=/var/run/postgresql --port=55416
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {createOwnContractFamilyPayrollFactsHandler} from '../api/internal-own-contract-family-payroll-facts.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {FAMILY_PAYROLL_FACT_QUANTITIES, familyPayrollFactsDefinition, prepareFamilyPayrollFacts, decideFamilyPayrollFacts, familyPayrollFactsCapture} from '../assets/own-contract-family-payroll-facts-model.js';

const root = fs.realpathSync(new URL('..', import.meta.url));
const options = {};
for (const arg of process.argv.slice(2)) {
 const match = /^--(socket|port)=(.+)$/.exec(arg);
 assert.ok(match && !Object.hasOwn(options, match[1]), 'LOCAL_OPTION_INVALID');
 options[match[1]] = match[2];
}
assert.ok(path.isAbsolute(options.socket ?? '') && fs.statSync(options.socket).isDirectory(), 'LOCAL_SOCKET_DIRECTORY_REQUIRED');
assert.match(options.port ?? '', /^[0-9]{4,5}$/, 'LOCAL_PORT_REQUIRED');
const environment = {PATH: process.env.PATH, PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '5', PGAPPNAME: 'municontrol-family-facts-local'};
function psql(database, sql) {
 const run = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', options.socket, '-p', options.port, '-U', 'postgres', '-d', database, '-f', '-'],
  {input: sql, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, env: environment});
 if (run.status !== 0) throw Error((run.stderr || 'LOCAL_PSQL_FAILED').trim());
 return run.stdout;
}
const literal = v => "'" + String(v).replaceAll("'", "''") + "'";
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function published(file, name) {
 const match = new RegExp('CREATE FUNCTION public\\.' + name + '\\([\\s\\S]*?\\$\\$;').exec(read(file));
 assert.ok(match, 'LOCAL_PUBLISHED_FUNCTION_MISSING ' + name); return match[0];
}

// A unix socket has no network address: this is the proof that the destination is the local cluster.
assert.equal(psql('postgres', "SELECT (inet_server_addr() IS NULL)::text||'|'||current_setting('server_version_num')").trim().split('|')[0], 'true', 'LOCAL_SOCKET_REQUIRED');
const database = 'mc_family_local_' + randomBytes(8).toString('hex');
const checks = [];
const check = (name, ok) => { checks.push([name, !!ok]); if (!ok) console.log('FAIL', name); };
psql('postgres', 'CREATE DATABASE ' + database + ';');
try {
 const id = n => '50000000-0000-4000-8000-' + n.toString(16).padStart(12, '0');
 const tenant = id(1), binding = id(2), people = [id(11), id(12)], memberships = [id(21), id(22)], sessions = [id(31), id(32)], count = 855;
 const emails = ['preparer-family-local@example.invalid', 'reviewer-family-local@example.invalid'];
 psql(database, `
CREATE EXTENSION pgcrypto;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') THEN CREATE ROLE municontrol_actions_runtime_app NOLOGIN;END IF;END $$;
CREATE TABLE public.platform_tenant(id uuid PRIMARY KEY);
CREATE TABLE public.person_identity(id uuid PRIMARY KEY);
CREATE TABLE public.tenant_identity_session(id uuid PRIMARY KEY,session_version integer,status text,expires_at timestamptz,last_seen_at timestamptz);
CREATE TABLE public.platform_tenant_source_binding(tenant_id uuid,id uuid,PRIMARY KEY(tenant_id,id));
CREATE TABLE public.tenant_membership(id uuid,tenant_id uuid,source_binding_id uuid,person_id uuid,email text,label text,capabilities text[],verified boolean,PRIMARY KEY(id,tenant_id));
CREATE TABLE public.native_employee_registration(contract_id uuid PRIMARY KEY,id uuid,tenant_id uuid,source_binding_id uuid,legajo text,in_range boolean,token text,registered_at timestamptz);
CREATE TABLE public.employment_contract(id uuid);CREATE TABLE public.employment_adoption_application(id uuid);CREATE TABLE public.employment_adoption_decision(id uuid);
CREATE TABLE public.employment_adoption_proposal(id uuid);CREATE TABLE public.native_employment_lifecycle_review(id uuid);
-- Synthetic stand-ins for the identity, lifecycle and registry readers.
CREATE FUNCTION public.native_salary_administrative_context_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE m public.tenant_membership;
BEGIN
 SELECT * INTO m FROM public.tenant_membership WHERE id=(p->>'membershipId')::uuid AND tenant_id=(p->>'tenantId')::uuid AND email=p->>'actorEmail';
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_SALARY_FORBIDDEN';END IF;
 RETURN jsonb_build_object('tenantId',m.tenant_id,'sourceBindingId',m.source_binding_id,'membershipId',m.id,'actorPersonId',m.person_id,'actorEmail',m.email,'actorLabel',m.label,'capabilities',to_jsonb(m.capabilities),'scopes','[]'::jsonb,'parameterActorVerified',m.verified);
END $$;
CREATE FUNCTION public.action_center_context_has_capability(ctx jsonb,capability text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(ctx->'capabilities' ? capability,false) $$;
CREATE FUNCTION public.native_salary_lock_v1(ctx jsonb) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.payroll_fixed_registry_range_v2(ctx jsonb,contract uuid,first_date date,last_date date,strict boolean) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT in_range FROM public.native_employee_registration WHERE contract_id=contract $$;
CREATE FUNCTION public.payroll_fixed_registry_subject_v2(ctx jsonb,contract uuid,strict boolean) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('subject',jsonb_build_object('contractId',contract_id,'registrationId',id,'legajo',legajo,'employeeName','Agente exclusivamente sintético','identityToken',token,'sourceCutoff',NULL,'origin','MUNICONTROL','registeredAt',registered_at)) FROM public.native_employee_registration WHERE contract_id=contract $$;
${published('scripts/migrations/112-native-salary-definitions.sql', 'native_salary_serialized_v1')}
${published('scripts/migrations/112-native-salary-definitions.sql', 'native_salary_scope_v1')}
${published('scripts/migrations/122-own-payroll-programs.sql', 'own_program_exact_v1')}
${published('scripts/migrations/122-own-payroll-programs.sql', 'own_program_text_v1')}
${read('scripts/migrations/226-own-contract-family-payroll-facts.sql')}
INSERT INTO public.platform_tenant VALUES(${literal(tenant)});
INSERT INTO public.platform_tenant_source_binding VALUES(${literal(tenant)},${literal(binding)});
INSERT INTO public.person_identity VALUES(${literal(people[0])}),(${literal(people[1])});
INSERT INTO public.tenant_identity_session VALUES(${literal(sessions[0])},1,'active',now()+interval '1 day',now()),(${literal(sessions[1])},1,'active',now()+interval '1 day',now());
INSERT INTO public.tenant_membership VALUES
 (${literal(memberships[0])},${literal(tenant)},${literal(binding)},${literal(people[0])},${literal(emails[0])},'Preparador exclusivamente sintético',ARRAY['workforce.employee.read','payroll.parameter.read','payroll.calculation.nominal.read','payroll.parameter.prepare'],true),
 (${literal(memberships[1])},${literal(tenant)},${literal(binding)},${literal(people[1])},${literal(emails[1])},'Revisora exclusivamente sintética',ARRAY['workforce.employee.read','payroll.parameter.read','payroll.calculation.nominal.read','payroll.parameter.approve'],true);
INSERT INTO public.native_employee_registration
 SELECT ('60000000-0000-4000-8000-'||lpad(to_hex(n),12,'0'))::uuid,('70000000-0000-4000-8000-'||lpad(to_hex(n),12,'0'))::uuid,${literal(tenant)},${literal(binding)},'QA-'||n,n<=${count},encode(digest('synthetic:'||n,'sha256'),'hex'),TIMESTAMPTZ '2026-09-01 12:00:00+00'
 FROM generate_series(1,${count + 1}) n;
CREATE FUNCTION public.mc_local_definition_verdict(d jsonb,period_value text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN PERFORM public.own_family_payroll_facts_definition_v1(d,period_value);RETURN true;
EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAMILY_PAYROLL_FACTS_INPUT_INVALID' THEN RETURN false;END IF;RAISE;END $$;
`);

 // ---- 1. The only new SQL logic: the definition validator decides exactly as the screen model does. ----
 const valid = () => ({quantities: Object.fromEntries(FAMILY_PAYROLL_FACT_QUANTITIES.map(k => [k, null])), prenatalAdjustmentMonths: null, tariffSelection: {region: null, semesterAverage: null}, asOfDate: '2026-10-01', documentReference: 'Constancia exclusivamente sintética QA'});
 const corpus = [{d: valid(), p: '2026-10'}];
 const add = (mutate, p = '2026-10') => { const d = valid(); const replaced = mutate(d); corpus.push({d: replaced === undefined ? d : replaced, p}); };
 const scalars = [null, '0', '1', '9', '10', '24', '25', '99', '100', '00', '01', '007', '-1', '+1', '1.0', '1,0', ' 1', '1 ', '1\n', '', 'a', '１', '٣', '1e1', '0x1', 0, 1, 1.5, true, false, [], {}, ['1'], {value: '1'}];
 for (const key of FAMILY_PAYROLL_FACT_QUANTITIES) for (const value of scalars) add(d => { d.quantities[key] = value; });
 for (const value of scalars) add(d => { d.prenatalAdjustmentMonths = value; });
 for (const value of [...scalars, '123456789', '1234567890', '000000001']) add(d => { d.tariffSelection.region = value; });
 for (const value of [...scalars, '0.0', '0.00', '0.000', '1.5', '1.50', '1.505', '.5', '5.', '01.50', '123456789012345', '1234567890123456', '123456789012345.99', '1234567890123456.99', '1 000.00', '1.000,50']) add(d => { d.tariffSelection.semesterAverage = value; });
 for (const key of FAMILY_PAYROLL_FACT_QUANTITIES) add(d => { delete d.quantities[key]; });
 add(d => { d.quantities.grandchildren = '1'; }); add(d => { d.quantities = null; }); add(d => { d.quantities = []; }); add(d => { d.quantities = 'spouse'; }); add(d => { d.quantities = {}; });
 add(d => { d.tariffSelection = null; }); add(d => { d.tariffSelection = {}; }); add(d => { d.tariffSelection = {region: null}; }); add(d => { d.tariffSelection.amount = '1000.00'; }); add(d => { d.tariffSelection = ['1', null]; });
 for (const key of ['quantities', 'prenatalAdjustmentMonths', 'tariffSelection', 'asOfDate', 'documentReference']) add(d => { delete d[key]; });
 add(d => { d.dni = 'synthetic'; }); add(d => { d.children = '2'; }); add(() => null); add(() => []); add(() => 'definition'); add(() => 7); add(() => ({}));
 for (const value of ['2026-10-31', '2026-11-01', '2027-01-01', '2026-02-28', '2026-02-29', '2026-02-30', '2024-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-10-00', '2026-10-32', '1899-12-31', '1900-01-01', '2100-01-01', '2026-10-1', '2026-1-01', '20261001', '2026/10/01', '01-10-2026', ' 2026-10-01', '2026-10-01 ', '2026-10-01T00:00:00Z', '', null, 20261001, true]) add(d => { d.asOfDate = value; });
 for (const value of ['ab', 'abc', ' abc', 'abc ', 'a<b', 'a>b', 'x'.repeat(180), 'x'.repeat(181), 'éxx', 'éxx', 'ab\ncd', 'a\tb c', 'abc\u007f', '', null, 123, ['abc'], {text: 'abc'}]) add(d => { d.documentReference = value; });
 for (const period of ['2026-10', '2026-09', '2026-11', '2026-9', '1899-12', '1900-01', '2099-12', '2100-01', '2026-13', '2026-00', '', '2026-10-01', 'octubre', null]) add(() => {}, period);
 const model = corpus.map(({d, p}) => { try { familyPayrollFactsDefinition(d, p); return true; } catch { return false; } });
 const stored = JSON.parse(psql(database, `SELECT jsonb_agg(public.mc_local_definition_verdict(c->'d',c->>'p') ORDER BY n) FROM jsonb_array_elements(${literal(JSON.stringify(corpus))}::jsonb) WITH ORDINALITY x(c,n);`));
 const different = corpus.map((c, i) => model[i] === stored[i] ? null : {case: i, model: model[i], sql: stored[i], d: c.d, p: c.p}).filter(Boolean);
 check('definition validator: ' + corpus.length + ' declarations get the same verdict from the screen model and from SQL', different.length === 0 && stored.length === corpus.length);
 if (different.length) console.log(JSON.stringify(different.slice(0, 12)));
 check('definition validator: the corpus exercises both verdicts', model.filter(Boolean).length > 40 && model.filter(v => !v).length > 400);
 check('a quantity that was not declared stays empty and is not a zero', stored[0] === true && JSON.parse(psql(database, `SELECT public.own_family_payroll_facts_definition_v1(${literal(JSON.stringify(valid()))}::jsonb,'2026-10')->'quantities'->'children';`)) === null);

 // ---- 2. The conserved workflow, through the real handler, lib and model. ----
 const origin = 'https://municipio.example', endpoint = '/api/internal-own-contract-family-payroll-facts';
 const caps = [['workforce.employee.read', 'payroll.parameter.read', 'payroll.calculation.nominal.read', 'payroll.parameter.prepare'], ['workforce.employee.read', 'payroll.parameter.read', 'payroll.calculation.nominal.read', 'payroll.parameter.approve']];
 const actor = i => ({principal: {user: {email: emails[i]}, tenant: {source: 'membership', id: tenant, membershipId: memberships[i], effectiveCapabilities: caps[i]}}, session: {email: emails[i], id: sessions[i], version: 1, releaseSha: 'd'.repeat(40)}});
 const sql = {query: async (text, values) => [{result: JSON.parse(psql(database, text.replace(/\$([0-9]+)/g, (_, n) => literal(values[n - 1])) + ';'))}]};
 const response = () => ({headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.value = v; return this; }});
 async function call(i, request) {
  const a = actor(i), out = response();
  await createOwnContractFamilyPayrollFactsHandler({env: {INTERNAL_APP_ORIGIN: origin}, requireAccess: async () => ({mode: 'managed', principal: a.principal}), sessionFor: () => a.session, getSql: async () => sql})(request, out);
  return out;
 }
 const get = (i, query) => call(i, {method: 'GET', url: endpoint + '?' + new URLSearchParams(query), query, headers: {origin}});
 const post = (i, payload, key) => call(i, {method: 'POST', url: endpoint, query: {}, headers: {origin, 'content-type': 'application/json', 'idempotency-key': key}, body: JSON.stringify({operation: 'command', payload})});
 const period = '2026-10', reason = 'Declaración exclusivamente sintética del conjunto completo';
 const declare = (subjects, shift = 0) => subjects.map((s, i) => {
  const d = valid(), n = i + shift;
  if (n % 5 === 0) Object.assign(d.quantities, {spouse: '1', children: String(n % 4), primary: String(n % 3)});
  if (n % 7 === 0) { d.quantities.prenatal = '1'; d.prenatalAdjustmentMonths = String(n % 25); }
  if (n % 11 === 0) d.quantities.childrenWithDisability = '0';
  if (n % 3 === 0) d.tariffSelection = {region: '1', semesterAverage: (1000000 + n) + '.5'};
  return {contractId: s.contractId, identityToken: s.identityToken, definition: d};
 });

 let boot = await get(0, {resource: 'bootstrap', period});
 check('bootstrap returns the whole verified population of own contracts, without the one outside the period', boot.statusCode === 200 && boot.value.data.source.subjects.length === count && boot.value.data.configuration.revision === 0 && boot.value.data.proposals.length === 0);
 check('the preparer can prepare and cannot review; no payroll effect is reported', boot.value.data.permissions.canPropose === true && boot.value.data.permissions.canReview === false && boot.value.data.payrollCalculated === false && boot.value.data.payrollPosted === false);
 const items = declare(boot.value.data.source.subjects), proposal = prepareFamilyPayrollFacts(boot.value.data, items, reason), key = randomUUID();
 const proposed = await post(0, proposal, key);
 check('one write conserves the complete declaration as a pending proposal', proposed.statusCode === 201 && proposed.value.data.status === 'pending' && proposed.value.data.body.items.length === count && proposed.value.data.revision === 0);
 const replay = await post(0, proposal, key);
 check('repeating the same attempt returns the conserved receipt and writes nothing', replay.statusCode === 200 && replay.headers['Idempotency-Replayed'] === 'true' && replay.value.data.eventId === proposed.value.data.eventId && psql(database, 'SELECT count(*) FROM public.own_family_payroll_facts_event;').trim() === '1');
 const attempt = await get(0, {resource: 'attempt', key});
 check('the attempt is readable by its key with its original body', attempt.statusCode === 200 && attempt.value.data.replayed === true && attempt.value.data.body.items.length === count);
 const reused = await post(0, {...proposal, reason: reason + ' con otro contenido'}, key);
 check('the same key with other content is refused', reused.statusCode === 409 && reused.value.code === 'FAMILY_PAYROLL_FACTS_IDEMPOTENCY_REUSE');
 const partial = structuredClone(proposal); partial.items.pop();
 const trimmed = await post(0, partial, randomUUID());
 check('a declaration that leaves one contract out is refused as a population change', trimmed.statusCode === 409 && trimmed.value.code === 'FAMILY_PAYROLL_FACTS_POPULATION_CHANGED');
 const foreign = structuredClone(proposal); foreign.items[0].identityToken = 'f'.repeat(64);
 const substituted = await post(0, foreign, randomUUID());
 check('a declaration for another identity is refused as a population change', substituted.statusCode === 409 && substituted.value.code === 'FAMILY_PAYROLL_FACTS_POPULATION_CHANGED');

 // The preparer's own view: the proposal exists but that same person cannot decide it.
 boot = await get(0, {resource: 'bootstrap', period});
 const own = boot.value.data.proposals[0];
 check('the preparer sees the pending proposal and cannot review it', boot.statusCode === 200 && boot.value.data.proposals.length === 1 && own.status === 'pending' && own.canReview === false && own.itemCount === count);
 const selfDecision = {command: 'approve', period, scopeVersion: boot.value.data.scopeVersion, baseVersion: own.baseVersion, sourceVersion: own.sourceVersion, proposalId: own.id, proposalSha256: own.requestSha256, items: null, reason: 'Aprobación exclusivamente sintética sin independencia', reviewConfirmed: true};
 const self = await post(0, selfDecision, randomUUID());
 check('the preparer cannot approve: the membership lacks the approving capability', self.statusCode === 403 && self.value.code === 'FAMILY_PAYROLL_FACTS_FORBIDDEN');
 psql(database, `UPDATE public.tenant_membership SET capabilities=capabilities||ARRAY['payroll.parameter.approve'] WHERE id=${literal(memberships[0])};`);
 const elevated = actor(0); elevated.principal.tenant.effectiveCapabilities = [...caps[0], 'payroll.parameter.approve'];
 const selfOut = response();
 await createOwnContractFamilyPayrollFactsHandler({env: {INTERNAL_APP_ORIGIN: origin}, requireAccess: async () => ({mode: 'managed', principal: elevated.principal}), sessionFor: () => elevated.session, getSql: async () => sql})({method: 'POST', url: endpoint, query: {}, headers: {origin, 'content-type': 'application/json', 'idempotency-key': randomUUID()}, body: JSON.stringify({operation: 'command', payload: selfDecision})}, selfOut);
 check('even holding both capabilities, the author cannot approve the own proposal', selfOut.statusCode === 403 && selfOut.value.code === 'FAMILY_PAYROLL_FACTS_INDEPENDENT_REQUIRED');
 psql(database, `UPDATE public.tenant_membership SET capabilities=array_remove(capabilities,'payroll.parameter.approve') WHERE id=${literal(memberships[0])};`);

 // The independent reviewer.
 let review = await get(1, {resource: 'bootstrap', period});
 const detail = await get(1, {resource: 'detail', id: own.id});
 check('another person can open the complete proposal and review it', review.statusCode === 200 && detail.statusCode === 200 && detail.value.data.proposal.canReview === true && detail.value.data.current === true && detail.value.data.body.items.length === count);
 const approval = await decideFamilyPayrollFacts(review.value.data, detail.value.data, 'approve', 'Aprobación exclusivamente sintética e independiente');
 const approved = await post(1, approval, randomUUID());
 check('the independent approval conserves revision 1', approved.statusCode === 201 && approved.value.data.status === 'approved' && approved.value.data.revision === 1);
 const again = await post(1, {...approval, reason: 'Segunda decisión exclusivamente sintética'}, randomUUID());
 check('a decided proposal is not decided again', again.statusCode === 409 && again.value.code === 'FAMILY_PAYROLL_FACTS_DECIDED');
 boot = await get(0, {resource: 'bootstrap', period});
 const current = boot.value.data.configuration;
 check('the approved declaration becomes the current revision, complete and unchanged', boot.statusCode === 200 && current.revision === 1 && current.items.length === count && salarySerialized(current.items) === salarySerialized(proposal.items) && boot.value.data.proposals[0].status === 'approved');
 check('an empty quantity is conserved as empty and a declared zero as zero', current.items[1].definition.quantities.children === null && current.items[0].definition.quantities.children === '0' && current.items[11].definition.quantities.childrenWithDisability === '0');
 const same = await post(0, {...proposal, baseVersion: current.version}, randomUUID());
 check('proposing the declaration that is already current is refused', same.statusCode === 422 && same.value.code === 'FAMILY_PAYROLL_FACTS_INPUT_INVALID');
 const stale = await post(0, proposal, randomUUID());
 check('a proposal prepared over the previous revision is refused as a changed base', stale.statusCode === 409 && stale.value.code === 'FAMILY_PAYROLL_FACTS_BASE_CHANGED');

 // A second proposal, rejected: the current revision does not move.
 const second = prepareFamilyPayrollFacts(boot.value.data, declare(boot.value.data.source.subjects, 1), reason);
 const secondOut = await post(0, second, randomUUID());
 review = await get(1, {resource: 'bootstrap', period});
 const secondDetail = await get(1, {resource: 'detail', id: secondOut.value.data.proposalId});
 const rejected = await post(1, await decideFamilyPayrollFacts(review.value.data, secondDetail.value.data, 'reject', 'Rechazo exclusivamente sintético e independiente'), randomUUID());
 boot = await get(0, {resource: 'bootstrap', period});
 check('a rejected proposal leaves the current revision untouched', secondOut.statusCode === 201 && rejected.statusCode === 201 && rejected.value.data.status === 'rejected' && boot.value.data.configuration.revision === 1 && boot.value.data.configuration.version === current.version && boot.value.data.proposals.map(p => p.status).join() === 'approved,rejected');

 // A third proposal stays pending while the population changes: approval must refuse it.
 const third = await post(0, prepareFamilyPayrollFacts(boot.value.data, declare(boot.value.data.source.subjects, 2), reason), randomUUID());
 review = await get(1, {resource: 'bootstrap', period});
 const thirdDetail = await get(1, {resource: 'detail', id: third.value.data.proposalId});
 const thirdApproval = await decideFamilyPayrollFacts(review.value.data, thirdDetail.value.data, 'approve', 'Aprobación exclusivamente sintética tras un cambio');
 psql(database, `UPDATE public.native_employee_registration SET in_range=true WHERE legajo='QA-${count + 1}';`);
 const late = await post(1, thirdApproval, randomUUID());
 check('an approval after the population changed is refused and nothing is conserved', late.statusCode === 409 && late.value.code === 'FAMILY_PAYROLL_FACTS_BASE_CHANGED' && psql(database, "SELECT count(*) FROM public.own_family_payroll_facts_event WHERE command='approve';").trim() === '1');
 const changed = await get(1, {resource: 'detail', id: third.value.data.proposalId});
 check('the pending proposal is shown as no longer current', changed.statusCode === 200 && changed.value.data.current === false);
 psql(database, `UPDATE public.native_employee_registration SET in_range=false WHERE legajo='QA-${count + 1}';`);

 // Capture for a consumer: complete records at the approved revision; an identity change is refused.
 const context = JSON.stringify({tenantId: tenant, sourceBindingId: binding});
 const employees = current.items.slice(0, 40).map(i => ({contractId: i.contractId, identityToken: i.identityToken}));
 const capture = JSON.parse(psql(database, `SELECT public.own_family_payroll_facts_capture_v1(${literal(context)}::jsonb,${literal(JSON.stringify(employees))}::jsonb,'2026-10');`));
 let captureModel = true; try { familyPayrollFactsCapture(capture, employees, period); } catch (e) { captureModel = false; console.log(String(e?.message ?? e)); }
 check('capture returns each requested contract with its approved declaration and revision', capture.complete === true && capture.records.length === 40 && capture.records.every((r, i) => r.revision === 1 && r.approvalId === current.approvalId && JSON.stringify(r.definition) === JSON.stringify(current.items[i].definition)));
 check('the screen model accepts the captured records', captureModel);
 const other = JSON.parse(psql(database, `SELECT public.own_family_payroll_facts_capture_v1(${literal(context)}::jsonb,${literal(JSON.stringify(employees))}::jsonb,'2026-09');`));
 check('a period without an approved declaration captures no facts instead of zeros', other.records.length === 40 && other.records.every(r => r.revision === 0 && r.definition === null && r.approvalId === null));
 const refuse = statement => { try { psql(database, statement); return ''; } catch (e) { return String(e.message); } };
 check('capture refuses a contract whose identity changed', /FAMILY_PAYROLL_FACTS_IDENTITY_CHANGED/.test(refuse(`SELECT public.own_family_payroll_facts_capture_v1(${literal(context)}::jsonb,${literal(JSON.stringify([{...employees[0], identityToken: 'f'.repeat(64)}]))}::jsonb,'2026-10');`)));
 check('conserved events cannot be updated, deleted or truncated', ['UPDATE public.own_family_payroll_facts_event SET revision=9;', 'DELETE FROM public.own_family_payroll_facts_event;', 'TRUNCATE public.own_family_payroll_facts_event;'].every(s => /FAMILY_PAYROLL_FACTS_IMMUTABLE/.test(refuse(s))));
 check('the runtime role can only execute the four entry points', psql(database, `SELECT string_agg(p.proname,',' ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'own_family_payroll_facts_%' AND has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE');`).trim() === 'own_family_payroll_facts_attempt_v1,own_family_payroll_facts_bootstrap_v1,own_family_payroll_facts_command_v1,own_family_payroll_facts_detail_v1' && psql(database, "SELECT has_table_privilege('municontrol_actions_runtime_app','public.own_family_payroll_facts_event','SELECT')::text;").trim() === 'false');
 check('installing twice is refused as an object conflict', /FAMILY_PAYROLL_FACTS_OBJECT_CONFLICT/.test(refuse(read('scripts/migrations/226-own-contract-family-payroll-facts.sql'))));
 const expired = (psql(database, `UPDATE public.tenant_identity_session SET expires_at=now()-interval '1 minute' WHERE id=${literal(sessions[0])};`), await get(0, {resource: 'bootstrap', period}));
 check('an expired session reads nothing', expired.statusCode === 401 && expired.value.data === undefined);
} finally {
 psql('postgres', 'DROP DATABASE IF EXISTS ' + database + ' WITH (FORCE);');
}
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log((ok ? 'ok   ' : 'FAIL ') + name);
console.log(checks.length - failed.length + ' de ' + checks.length + ' comprobaciones locales');
process.exit(failed.length ? 1 : 0);
