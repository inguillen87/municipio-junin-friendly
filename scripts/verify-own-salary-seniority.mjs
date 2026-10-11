// All subjects, documents and decisions in this verifier are invented QA data.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifySalaryAuxiliaryNamespace } from './verify-salary-auxiliary-namespace.mjs';
import { buildOwnSalarySeniorityInstallation, assertOwnSalarySeniorityDurability } from './lib/own-salary-seniority-installation.mjs';
import { ownInstallationFunctionPin } from './lib/own-payroll-installation.mjs';
import { buildOwnRunDateInstallation } from './lib/own-payroll-run-date-installation.mjs';
import { qaLiteral as q } from './lib/own-payroll-durable-qa.mjs';
import { createOwnSalarySeniorityHandler } from '../api/internal-own-salary-seniority.js';
import { salaryItems } from '../assets/native-salary-catalog-model.js';
import { ownProgramDefinition } from '../assets/own-payroll-program-model.js';
import { row } from '../tests/fixtures/native-salary-synthetic.js';
import { rule, policy } from '../tests/fixtures/own-payroll-synthetic.js';
import { emptyOwnReceiptParams } from '../assets/own-payroll-receipt-model.js';
import { createOwnReceiptPdf } from '../assets/own-payroll-receipt-pdf.js';
import { prepareOwnPlanilla } from '../assets/own-payroll-receipt-planilla-model.js';
import { createInternalDataHandler } from '../api/internal-data.js';
import { adoptSyntheticReceiptContracts } from './lib/adopted-own-payroll-receipt-qa.mjs';
import { observeOwnQaCommand } from './lib/qa-lock-observation.mjs';
const j = v => q(JSON.stringify(v)) + '::jsonb';

export async function verifyOwnSalarySeniority(options) {
 return verifySalaryAuxiliaryNamespace({ ...options, continuation: async h => {
  const { qa, db, sql, relocate, adapter, deps, handlers, api, ok, setActor, period, oldBody, oldKey, old, calculated, closed, count } = h;
  const batch = buildOwnSalarySeniorityInstallation(h.options), dated = buildOwnRunDateInstallation(h.options);
  // The older QA foundation models these already-published dated facades here.
  // No productive function or real source is copied into a test fixture.
  await sql(dated.migration.filter(s => !s.includes('municipal_adoption_ready_v1')).map(relocate).join(';\n'));
  const canonical = s => s.replaceAll('search_path=pg_catalog, '+qa.schema+', public, pg_temp','search_path=pg_catalog, public, pg_temp').replaceAll(qa.schema,'public');
  const readyPins = [batch.beforeDefinitions.at(-1),batch.changed.at(-1)].map(s=>[ownInstallationFunctionPin(s).sha256,ownInstallationFunctionPin(canonical(relocate(s))).sha256]);
  const n = s => readyPins.reduce((text,[original,relocated])=>text.replaceAll(original,relocated),relocate(s));
  const statements = batch.statements.map(s=>s.startsWith('DO $choose$')?`DO $choose$ BEGIN IF current_setting('municontrol_seniority.mode')='install' THEN EXECUTE ${q(n(batch.beforeCheck))};ELSE EXECUTE ${q(n(batch.afterCheck))};END IF;END $choose$`:s.startsWith('DO $apply$')?`DO $apply$ BEGIN IF current_setting('municontrol_seniority.mode')='install' THEN ${[...batch.migration,...batch.changed].map(s=>'EXECUTE '+q(n(s))+';').join('\n')} END IF;END $apply$`:n(s));
  const installed = await sql(statements.join(';\n'));
  const durable = await sql(batch.verification.map(n).join(';\n'));
  assertOwnSalarySeniorityDurability({installed,durable,batch});
  const repeated = await sql(statements.join(';\n'));
  assert.equal(installed.mode,'install');assert.equal(repeated.mode,'verify');assert.deepEqual(repeated,durable);
  ok(true, 'conservative installation preserves all prior rows and metadata and is independently durable; rerun verifies only');
  await assert.rejects(()=>sql('GRANT SELECT ON '+qa.schema+'.own_seniority_event TO municontrol_actions_runtime_app;'+n(batch.afterCheck)),/SENIORITY_TABLE_SECURITY/);
  assert.deepEqual(await sql(batch.verification.map(n).join(';\n')),durable);
  ok(true, 'direct nominal table access is rejected by verification and rolled back');
  ok(true, 'new source compiles against the published own engine and dated capture');
  const seniorityAdapter = { query: async (query, values) => {
   if (!query.startsWith('SELECT public.own_seniority_')) return adapter.query(query, values);
   assert.match(query, /^SELECT public\.own_seniority_(?:bootstrap|detail|attempt|command)_v1\([\s\S]+\) AS result$/);
   const text = query.replaceAll('public.', qa.schema + '.').replace(/\$(\d+)/g, (_, n) => { assert.ok(Number(n) > 0 && Number(n) <= values.length); return q(values[Number(n) - 1]); });
   if(process.env.MC_QA_LOCK_OBSERVATION==='1'&&query.startsWith('SELECT public.own_seniority_command_v1(')){
    const observed=await observeOwnQaCommand({db,schema:qa.schema,execute:()=>db.run(text,true),record:v=>fs.appendFileSync(path.join(h.destination,'seniority-lock-observations.ndjson'),JSON.stringify(v)+'\n')});
    return [{result:observed}];
   }
   return [{ result: await db.run(text, true) }];
  } };
  handlers.seniority = createOwnSalarySeniorityHandler({ ...deps, getSql: () => seniorityAdapter });
  const people = calculated.payload.population.employees;
  assert.equal(people.length, count);
  const query = contractId => ({ resource: 'bootstrap', contractId, period });
  const prepare = async (employee, years, months = null) => {
   setActor(qa.actors.maker);
   const b = await api('seniority', { query: query(employee.contractId) }), key = randomUUID();
   const body = { command: 'propose', contractId: b.contractId, period, scopeVersion: b.scopeVersion, baseVersion: b.configuration.version, sourceVersion: b.source.version, proposalId: null, proposalSha256: null, definition: { years, months, asOfDate: period + '-01', documentReference: 'Constancia exclusivamente sintética QA' }, reason: 'Declaración de antigüedad exclusivamente sintética QA', reviewConfirmed: false };
   const receipt = await api('seniority', { body, key, expected: 201 });
   return { body, key, receipt };
  };
  const approve = async p => {
   setActor(qa.actors.checker);
   const b = await api('seniority', { query: query(p.body.contractId) });
   await api('seniority', { expected: 201, body: { ...p.body, command: 'approve', scopeVersion: b.scopeVersion, proposalId: p.receipt.proposalId, proposalSha256: p.receipt.requestSha256, definition: null, reason: 'Revisión independiente exclusivamente sintética QA', reviewConfirmed: true } });
   setActor(qa.actors.maker);
  };
  const first = await prepare(people[0], '0');
  assert.equal(first.receipt.body.definition.years, '0');
  setActor(qa.actors.samePerson);
  const ownReview = await api('seniority', { query: query(people[0].contractId) });
  assert.equal(ownReview.proposals.find(p => p.id === first.receipt.proposalId).canReview, false);
  await api('seniority', { expected: 403, body: { ...first.body, command: 'approve', scopeVersion: ownReview.scopeVersion, proposalId: first.receipt.proposalId, proposalSha256: first.receipt.requestSha256, definition: null, reason: 'Intento inválido exclusivamente sintético QA', reviewConfirmed: true } });
  ok(true, 'same person cannot approve using another membership');
  await approve(first);
  const recovered = await api('seniority', { query: { resource: 'attempt', key: first.key } });
  assert.deepEqual(recovered.body, first.body);
  assert.equal(recovered.requestKey, first.key);
  const replay = await api('seniority', { body: first.body, key: first.key, expected: 200 });
  assert.equal(replay.replayed, true);
  await api('seniority', { body: { ...first.body, reason: 'Contenido distinto exclusivamente sintético QA' }, key: first.key, expected: 409 });
  ok(true, 'approved attempt preserves the original body and key; reuse is rejected');
  const b0 = await api('seniority', { query: query(people[0].contractId) });
  assert.equal(b0.configuration.definition.years, '0');
  assert.equal(b0.configuration.definition.months, null);
  assert.equal(b0.configuration.revision, 1);
  const otherPeriod = period.slice(0, 4) + '-12';
  const separate = await api('seniority', { query: { ...query(people[0].contractId), period: otherPeriod } });
  assert.equal(separate.configuration.revision, 0);
  assert.equal(separate.configuration.definition, null);
  ok(true, 'zero is declared and months stay unknown; another month is not aged or inferred');
  for (let i = 1; i < people.length - 1; i++) await approve(await prepare(people[i], String(i)));
  ok(count > 25, 'recognized facts cover the entire native-only population across pages');
  const last = await prepare(people.at(-1), null);
  await approve(last);
  const salary = await api('salary'), items = salaryItems([...salary.catalog.items, row({ kind: 'auxiliary', code: '991', nature: 'auxiliary', unit: 'units', validFrom: period })]);
  const sp = await api('salary', { expected: 201, body: { command: 'propose', scopeVersion: salary.scopeVersion, baseVersion: salary.catalog.version, classificationVersion: salary.classification.version, proposalId: null, proposalSha256: null, items, reason: 'Auxiliar de conteo exclusivamente sintético QA', reviewConfirmed: false } });
  setActor(qa.actors.checker);
  const sr = await api('salary');
  await api('salary', { expected: 201, body: { command: 'approve', scopeVersion: sr.scopeVersion, baseVersion: sp.body.baseVersion, classificationVersion: sp.body.classificationVersion, proposalId: sp.proposalId, proposalSha256: sp.requestSha256, items: null, reason: 'Maestro revisado exclusivamente sintético QA', reviewConfirmed: true } });
  setActor(qa.actors.maker);
  const pb = await api('program'), programme = ownProgramDefinition({ ...pb.program.definition, employmentFactsVersion: 'own-salary-seniority.v1', rules: [...pb.program.definition.rules, rule('991', { op: 'input', key: 'recognizedYears', unit: 'units' }, { nature: 'auxiliary', unit: 'units', validFrom: period, rounding: policy('exact') })], bindings: [...pb.program.definition.bindings, { agreementCode: '1', key: 'recognizedYears', unit: 'units', sourceKind: 'employment_fact', sourceField: 'seniorityYears', onMissing: 'error', combine: 'single', ruleReference: 'Conteo aprobado exclusivamente sintético QA' }] }, items);
  const pp = await api('program', { expected: 201, body: { command: 'propose', scopeVersion: pb.scopeVersion, baseVersion: pb.program.version, salaryVersion: pb.salaryCatalog.version, proposalId: null, proposalSha256: null, program: programme, reason: 'Programa de conteo exclusivamente sintético QA', reviewConfirmed: false } });
  setActor(qa.actors.checker);
  const pr = await api('program');
  await api('program', { expected: 201, body: { ...pp.body, command: 'approve', scopeVersion: pr.scopeVersion, program: null, proposalId: pp.proposalId, proposalSha256: pp.requestSha256, reason: 'Programa revisado exclusivamente sintético QA', reviewConfirmed: true } });
  setActor(qa.actors.maker);
  setActor(qa.actors.checker);
  const closeState = await api('close', { query: { resource: 'detail', period, liquidationType: 'monthly' } });
  await api('close', { expected: 201, body: { period, liquidationType: 'monthly', scopeVersion: closeState.scopeVersion, stateVersion: closeState.stateVersion, selection: { kind: 'all', values: [] }, command: 'reopen', groupId: closed.groupId, reason: 'Reapertura exclusivamente sintética QA', reviewConfirmed: true } });
  const previousLiquidation = await api('liquidation', { query: { resource: 'detail', id: calculated.id } });
  await api('liquidation', { expected: 201, body: { runId: previousLiquidation.id, resultSha256: previousLiquidation.capture.saved.resultSha256, scopeVersion: previousLiquidation.scopeVersion, stateVersion: previousLiquidation.stateVersion, command: 'annul', selection: { kind: 'all', values: [] }, reason: 'Anulación previa exclusivamente sintética QA', reviewConfirmed: true } });
  ok(true, 'existing reopen and independent annulment precede replacement confirmation');
  setActor(qa.actors.maker);
  const runBoot = await api('run'), runBody = { ...oldBody, scopeVersion: runBoot.scopeVersion, programVersion: runBoot.programVersion }, missingKey = randomUUID();
  const priorResults = await db.run('SELECT to_jsonb(count(*)) FROM own_payroll_run_result');
  await api('run', { body: runBody, key: missingKey, expected: 422 });
  assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM own_payroll_run_result'), priorResults);
  const absentCapture = await api('run', { query: { resource: 'attempt', key: missingKey } });
  assert.equal(absentCapture.saved, null);
  assert.equal(absentCapture.payload.employmentFacts.records.at(-1).configuration.definition.years, null);
  ok(true, 'a required null on the last page blocks the whole result and preserves its captured attempt');
  await approve(await prepare(people.at(-1), String(count - 1)));
  const finalRun = await api('run', { body: runBody, expected: 201 });
  assert.equal(finalRun.saved.result.employeeCount, count);
  assert.equal(finalRun.payload.employmentFacts.records.length, count);
  assert.equal(finalRun.saved.input.employees[0].inputs.find(i => i.key === 'recognizedYears').value, '0.00000000');
  assert.equal(finalRun.saved.input.employees.at(-1).inputs.find(i => i.key === 'recognizedYears').value, (count - 1) + '.00000000');
  assert.deepEqual(finalRun.saved.result.employeeTotals.map(t => t.net), calculated.saved.result.employeeTotals.map(t => t.net));
  ok(true, 'native own capture includes every independently approved declared fact without changing salary totals');
  const frozen = structuredClone(finalRun.payload.employmentFacts), initialHash = finalRun.saved.resultSha256;
  await approve(await prepare(people[0], '7'));
  const recoveredRun = await api('run', { query: { resource: 'attempt', key: finalRun.key } });
  assert.deepEqual(recoveredRun.payload.employmentFacts, frozen);
  assert.equal(recoveredRun.saved.resultSha256, initialHash);
  const stillMissing = await api('run', { query: { resource: 'attempt', key: missingKey } });
  assert.equal(stillMissing.payload.employmentFacts.records.at(-1).configuration.definition.years, null);
  const recoveredOld = await api('run', { query: { resource: 'attempt', key: oldKey } });
  assert.deepEqual(recoveredOld.body, oldBody);
  assert.equal(recoveredOld.saved.resultSha256, old.saved.resultSha256);
  ok(true, 'later fact revisions do not reinterpret pending captures or either old saved input version');
  const superseding = await prepare(people[0], '8'), stale = await prepare(people[0], '9');
  await approve(superseding);
  setActor(qa.actors.checker);
  const staleDetail = await api('seniority', { query: { resource: 'detail', id: stale.receipt.proposalId } });
  assert.equal(staleDetail.current, false);
  const staleDecision = { ...stale.body, command: 'approve', scopeVersion: staleDetail.scopeVersion, proposalId: stale.receipt.proposalId, proposalSha256: stale.receipt.requestSha256, definition: null, reason: 'Revisión de propuesta anterior exclusivamente sintética QA', reviewConfirmed: true };
  await api('seniority', { body: staleDecision, expected: 409 });
  await api('seniority', { body: { ...staleDecision, command: 'reject', proposalSha256: '0'.repeat(64) }, expected: 409 });
  await api('seniority', { body: { ...staleDecision, command: 'reject' }, expected: 201 });
  setActor(qa.actors.maker);
  const afterReject = await api('seniority', { query: query(people[0].contractId) });
  assert.equal(afterReject.configuration.definition.years, '8');
  assert.equal(afterReject.proposals.find(p => p.id === stale.receipt.proposalId).status, 'rejected');
  await approve(await prepare(people[0], '7'));
  ok(true, 'superseded proposals cannot be approved; exact independent rejection preserves current facts');
  const immutableCount = await db.run('SELECT to_jsonb(count(*)) FROM own_seniority_event');
  await assert.rejects(() => sql("UPDATE " + qa.schema + ".own_seniority_event SET actor_label='Intento inválido QA'"), /SENIORITY_IMMUTABLE/);
  await assert.rejects(() => sql('DELETE FROM ' + qa.schema + '.own_seniority_event'), /SENIORITY_IMMUTABLE/);
  await assert.rejects(() => sql('TRUNCATE ' + qa.schema + '.own_seniority_event'), /SENIORITY_IMMUTABLE/);
  assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM own_seniority_event'), immutableCount);
  assert.deepEqual((await api('run', { query: { resource: 'attempt', key: finalRun.key } })).payload.employmentFacts, frozen);
  ok(true, 'owner update, deletion and truncation are rejected without losing immutable history or captured facts');
  setActor(qa.actors.checker);
  const ld = await api('liquidation', { query: { resource: 'detail', id: finalRun.id } });
  await api('liquidation', { expected: 201, body: { runId: ld.id, resultSha256: ld.capture.saved.resultSha256, scopeVersion: ld.scopeVersion, stateVersion: ld.stateVersion, command: 'confirm', selection: { kind: 'all', values: [] }, reason: 'Confirmación exclusivamente sintética QA', reviewConfirmed: true } });
  const cd = await api('close', { query: { resource: 'detail', period, liquidationType: 'monthly' } });
  const finalClose = await api('close', { expected: 201, body: { period, liquidationType: 'monthly', scopeVersion: cd.scopeVersion, stateVersion: cd.stateVersion, selection: { kind: 'all', values: [] }, command: 'close', groupId: null, reason: 'Cierre exclusivamente sintético QA', reviewConfirmed: true } });
  setActor(qa.actors.maker);
  const params = { ...emptyOwnReceiptParams(period), issuer: { name: 'Municipio exclusivamente sintético', taxId: '30990000001', address: 'Domicilio ficticio 123' } }, preview = await api('receipt', { previewParams: params });
  const rb = { command: 'prepare', scopeVersion: preview.scopeVersion, sourceVersion: preview.snapshot.sourceVersion, params, batchId: null, batchSha256: null, reason: 'Emisión exclusivamente sintética QA', reviewConfirmed: false }, emitted = await api('receipt', { body: rb, expected: 201 });
  setActor(qa.actors.checker);
  const rbatch = await api('receipt', { query: { resource: 'batch', id: emitted.batchId } }), rp = await api('receipt', { previewParams: params });
  await api('receipt', { expected: 201, body: { ...rb, command: 'approve', scopeVersion: rp.scopeVersion, sourceVersion: rp.snapshot.sourceVersion, params: null, batchId: emitted.batchId, batchSha256: rbatch.snapshotSha256, reason: 'Emisión revisada exclusivamente sintética QA', reviewConfirmed: true } });
  const approved = await api('receipt', { query: { resource: 'batch', id: emitted.batchId } }), pdf = await createOwnReceiptPdf(approved), planilla = await prepareOwnPlanilla(approved, [finalClose]);
  assert.equal(pdf.recordCount, count); assert.equal(planilla.selected, count);
  ok(true, 'declared facts complete native-only confirm, close, independently approved receipt PDF and planilla');
  setActor(qa.actors.maker);
  // This foundation also holds invented imported administrative actors. Its
  // actual directory cannot certify a mixed source with no published snapshot.
  // Complete their existing synthetic adoption circuit, without weakening the
  // directory's imported=0/source-version guards or touching productive data.
  await adoptSyntheticReceiptContracts(db,qa);
  const adoptedIds=await db.run("SELECT coalesce(jsonb_agg(contract_id ORDER BY contract_id),'[]') FROM employment_adoption_application");
  assert.ok(adoptedIds.length>0);
  for(const contractId of adoptedIds){
   await approve(await prepare({contractId},'0'));
   const b=await api('seniority',{query:query(contractId)});
   assert.equal(b.source.subject.origin,'MUNICONTROL');assert.equal(b.configuration.identityToken,b.source.subject.identityToken);
  }
  ok(true,'already published synthetic adoption retains its own exact identity in declared seniority; no directory guard is bypassed');
  if(options.browser!=='none'&&options.browser!==undefined){
   Object.assign(h.env,{FRIENDLY_GRH_SOURCE_DATABASE:'qa_fixed_source',FRIENDLY_GRH_COMPANY_ID:'101'});
   handlers.directory=createInternalDataHandler({env:h.env,requireCompatibleInternalAccess:deps.requireAccess,actionMutationSession:deps.sessionFor,getInternalSql:()=>adapter,getActionCenterSql:()=>adapter});
   const {verifyOwnSalarySeniorityBrowser}=await import('./lib/own-salary-seniority-browser.mjs');
   await verifyOwnSalarySeniorityBrowser({handlers,env:h.env,actors:qa.actors,setActor,people,period,output:h.destination,check:ok,browserName:options.browser,revoke:()=>sql('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid'),restore:()=>sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid')});
  }
  await sql('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id=' + q(qa.actors.maker.membershipId) + '::uuid');
  const revoked = await api('seniority', { query: query(people[0].contractId) });
  assert.equal(revoked.permissions.canPropose, false);
  await api('seniority', { query: { resource: 'attempt', key: first.key }, expected: 403 });
  await sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id=' + q(qa.actors.maker.membershipId) + '::uuid');
  ok(true, 'revocation immediately removes preparation and original attempt access without changing records');
  if(options.continuation) return options.continuation({...h,seniority:{people,finalRun,prepare,approve,installed,durable,repeated}});
  return { version: 'own-salary-seniority-qa.v1', employeeCount: count, newTables: 1, newFunctions: 12, adaptedFunctions: 4, installed,durable,repeated,syntheticOnly: true, productiveBusinessWrites: 0, seniorityRows: await db.run('SELECT to_jsonb(count(*)) FROM own_seniority_event') };
 } });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const o = {}; for (const arg of process.argv.slice(2)) { const m = /^--(major|transport|source-commit|output|browser)=(.+)$/.exec(arg); assert.ok(m && !Object.hasOwn(o, m[1])); o[m[1]] = m[2]; }
 try { const r = await verifyOwnSalarySeniority({ major: Number(o.major), transport: o.transport, sourceCommit: o['source-commit'], output: o.output, browser: o.browser ?? 'none' }); console.log(JSON.stringify({ ok: r.ok, major: r.major, checksPassed: r.checksPassed, employeeCount: r.employeeCount, syntheticOnly: true })); }
 catch (e) { console.error(e); process.exitCode = 1; }
}
