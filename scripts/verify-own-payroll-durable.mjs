// HTTP stream -> actual handler -> original authenticated PostgreSQL facades ->
// actual CPU calculation -> COMMIT -> independent-connection recovery.
// The HTTP access principal and IAM capability/SoD resolver are QA fixtures;
// database session, membership, release, binding and linked-person checks are real.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { buildOwnPayrollDurableQa, qaLiteral as q } from './lib/own-payroll-durable-qa.mjs';
import { createOwnPayrollPsqlQa } from './lib/own-payroll-psql-qa.mjs';
import { createOwnRunHandler } from '../api/internal-own-payroll-run.js';
import { RUN_CALCULATE, ownRunAlgorithmHash, ownRunHash } from '../lib/internal-own-payroll-run.js';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
const root = path.resolve(import.meta.dirname, '..'), execute = promisify(execFile);
const args = {}; for (const a of process.argv.slice(2)) { if (a === '--ci') { args.ci = true; continue; } const m = /^--(major|psql|output|browser)=(.+)$/.exec(a); assert.ok(m, 'Unknown argument'); assert.equal(args[m[1]], undefined); args[m[1]] = m[2]; }
assert.equal(args.ci, true); const major = Number(args.major); assert.ok([17, 18].includes(major));
assert.ok(args.browser === undefined || ['chrome','chromium','msedge'].includes(args.browser));
const output = path.resolve(args.output); assert.ok(output.startsWith(path.join(root, 'verification') + path.sep)); assert.ok(!fs.existsSync(output));
const executable = args.psql ?? 'psql', port = 55400 + major, qa = buildOwnPayrollDurableQa(major);
const db = createOwnPayrollPsqlQa({ executable, port, major, schema: qa.schema, pins: qa.pins });
const prefix = output.replace(/\.json$/, ''), seedFile = prefix + '-seed.sql'; assert.ok(!fs.existsSync(seedFile)); fs.writeFileSync(seedFile, qa.sql, { flag: 'wx' });
let installed = false, server, blocker, browser; let checks = 0, queryCalls = 0, loseAfter = null; const sqlDiagnostics=[];
const assertCheck = (value, label) => { assert.ok(value, label); checks++; };
const reports = [];
try {
  const seeded = await execute(executable, [...db.args, '-f', seedFile], { timeout: 90000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  installed = true; fs.writeFileSync(prefix + '-seed.log', seeded.stdout + seeded.stderr);
  const sources = await db.run("SELECT jsonb_build_object('contractId',(SELECT contract_id FROM native_employee_registration WHERE tenant_id=" + q(qa.ids.tenant) + "::uuid),'period',greatest('2026-10',to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM')),'captureCount',(SELECT count(*) FROM own_payroll_run_capture))");
  assertCheck(sources.captureCount === 0, 'seed commits sources without any forged capture or result');
  const actor = qa.actors.maker, principal = { user: { email: actor.actorEmail }, tenant: { source: 'membership', id: actor.tenantId, membershipId: actor.membershipId, effectiveCapabilities: RUN_CALCULATE } }, session = { email: actor.actorEmail, id: actor.actorSessionId, version: actor.actorSessionVersion, releaseSha: actor.releaseSha };
  const env = {}; const sql = { query: async (query, values) => { queryCalls++; let rows; try { rows = await db.query(query, values); } catch(e) { sqlDiagnostics.push({operation:/own_run_([a-z]+)_v1/.exec(query)?.[1],message:e.message}); throw e; } if (loseAfter && query.includes('own_run_' + loseAfter + '_v1')) { loseAfter = null; throw Error('QA_LOST_ACK_AFTER_COMMIT'); } return rows; } };
  const handler = createOwnRunHandler({ env, requireAccess: async (_req,_res) => ({ mode: 'managed', principal }), sessionFor: () => session, getSql: async () => sql });
  server = http.createServer((req, res) => { if(req.method==='GET' && req.url==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end('<!doctype html><html lang="es"><title>QA sintético durable C2</title><p>Prueba sintética de transporte; no es la UI municipal.</p></html>');return;} req.query = Object.fromEntries(new URL(req.url, 'http://local.invalid').searchParams); res.status = n => { res.statusCode = n; return res; }; res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return res; }; handler(req, res).catch(e => { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`; env.INTERNAL_APP_ORIGIN = origin;
  async function request(resource, body, key) { const response = await fetch(origin + '/api/internal-own-payroll-run' + resource, { ...(body ? { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ operation: 'calculate', payload: body }) } : {}) }); return { status: response.status, headers: Object.fromEntries(response.headers), value: await response.json() }; }
  const boot = await request('?resource=bootstrap'); assertCheck(boot.status === 200 && boot.value.data.canCalculate && boot.value.data.runs.length === 0, 'real handler bootstrap reads committed approved sources');
  const body = { period: sources.period, liquidationType: 'monthly', selection: { kind: 'contracts', values: [sources.contractId] }, scopeVersion: boot.value.data.scopeVersion, programVersion: boot.value.data.programVersion, populationDomain: 'native_registered' };
  const firstKey = randomUUID(), startCalls = queryCalls, first = await request('', body, firstKey);
  assertCheck(first.status === 201, 'actual HTTP POST creates and saves its own result: ' + JSON.stringify({ status:first.status,code:first.value.code,error:first.value.error }));
  const capture = first.value.data; const { sourceInventory: _inventory, ...capturedSources } = capture.payload;
  const snapshot = createOwnPayrollSnapshot(prepareOwnPayrollInput(capturedSources));
  assert.deepEqual(capture.saved.input, snapshot.input); assert.deepEqual(capture.saved.result, snapshot.result); checks++;
  assertCheck(queryCalls === startCalls + 2 && capture.algorithmSha256 === ownRunAlgorithmHash(), 'capture and result use separate committed connections and real algorithm bytes');
  assertCheck(capture.payload.monthly.batches.length === 2 && capture.saved.input.employees[0].inputs.find(i => i.key === 'addition').value === '20.25000000', 'both complete real monthly approvals feed exact addition');
  const recovered = await request('?resource=attempt&key=' + firstKey);
  assert.deepEqual(recovered.value.data.saved, capture.saved); assertCheck(recovered.status === 200, 'new connection recovers committed input, result and original timestamps');
  const replay = await request('', body, firstKey); assertCheck(replay.status === 200 && replay.headers['idempotency-replayed'] === 'true', 'ack replay does not recompute or duplicate'); assert.deepEqual(replay.value.data.saved, capture.saved); checks++;
  const conflict = await request('', { ...body, liquidationType: 'sac' }, firstKey); assertCheck(conflict.status === 409 && conflict.value.code === 'OWN_RUN_IDEMPOTENCY_REUSE', 'same key never changes persisted body');
  const pendingKey = randomUUID(); loseAfter = 'capture'; const lostCapture = await request('', body, pendingKey); assertCheck(lostCapture.status === 503, 'lost capture ack reports uncertainty');
  const pending = await request('?resource=attempt&key=' + pendingKey); assertCheck(pending.status === 200 && pending.value.data.saved === null, 'GET recovers pending capture without CPU or new result');
  const completed = await request('', body, pendingKey); assertCheck(completed.status === 200 && completed.value.data.saved !== null, 'same-key POST completes previously committed pending capture');
  const completeKey = randomUUID(); loseAfter = 'complete'; const lostComplete = await request('', body, completeKey); assertCheck(lostComplete.status === 503, 'lost result ack preserves uncertainty');
  const afterLost = await request('?resource=attempt&key=' + completeKey), replayLost = await request('', body, completeKey);
  assertCheck(afterLost.status === 200 && replayLost.status === 200 && afterLost.value.data.saved.inputSha256 === replayLost.value.data.saved.inputSha256 && afterLost.value.data.saved.resultSha256 === replayLost.value.data.saved.resultSha256, 'committed result survives lost ack and later replay exactly');
  // One live psql transaction holds the real scope lock; no sleeps or fabricated lock errors.
  blocker = spawn(executable, db.args, { windowsHide: true, stdio: ['pipe','pipe','pipe'] }); let blockText = '';
  const ready = new Promise((resolve,reject) => { const timeout = setTimeout(() => reject(Error('QA_BLOCKER_READY_TIMEOUT')), 10000); blocker.stdout.on('data', chunk => { blockText += chunk; if (blockText.includes('OWN_DURABLE_LOCK_READY')) { clearTimeout(timeout); resolve(); } }); blocker.once('exit', code => { clearTimeout(timeout); if (!blockText.includes('OWN_DURABLE_LOCK_READY')) reject(Error('QA_BLOCKER_TERMINAL_' + code)); }); });
  blocker.stdin.write(db.prefix + " SELECT pg_advisory_xact_lock(hashtextextended(" + q('own-run:v1:' + qa.ids.tenant + ':' + qa.ids.binding) + ",0)); SELECT 'OWN_DURABLE_LOCK_READY';\n"); await ready;
  assertCheck(blocker.exitCode === null, 'verified live independent connection holds actual PostgreSQL lock');
  const busyKey = randomUUID(), busy = await request('', body, busyKey); assertCheck(busy.status === 409 && busy.value.code === 'OWN_RUN_BUSY', 'concurrent scope lock returns real retryable conflict');
  const blockerEnded = new Promise(resolve => blocker.once('exit', resolve)); blocker.stdin.end('COMMIT;\n\\q\n'); await blockerEnded; blocker = null;
  const afterBusy = await request('', body, busyKey); assertCheck(afterBusy.status === 201, 'retry after real lock release saves whole result');
  const raceKey = randomUUID(), raced = await Promise.all([request('', body, raceKey), request('', body, raceKey)]);
  assertCheck(raced.every(r => [200,201,409].includes(r.status)), 'simultaneous same-key HTTP writes retain precise committed/conflict outcomes');
  const raceRecovered = await request('', body, raceKey); assertCheck(raceRecovered.status === 200 && raceRecovered.value.data.saved !== null, 'same-key race converges on one complete immutable result');
  const counts = await db.run("SELECT jsonb_build_object('captures',(SELECT count(*) FROM own_payroll_run_capture),'results',(SELECT count(*) FROM own_payroll_run_result),'raceCaptures',(SELECT count(*) FROM own_payroll_run_capture WHERE request_key=" + q(raceKey) + "::uuid),'raceResults',(SELECT count(*) FROM own_payroll_run_result r JOIN own_payroll_run_capture c ON c.id=r.capture_id WHERE c.request_key=" + q(raceKey) + "::uuid))");
  assertCheck(counts.captures === 5 && counts.results === 5 && counts.raceCaptures === 1 && counts.raceResults === 1, 'all retries leave exactly five complete runs, one per original key');
  const immutableBefore=await request('?resource=attempt&key='+firstKey);
  await assert.rejects(db.run('UPDATE own_payroll_run_result SET result=result WHERE capture_id='+q(capture.id)+'::uuid'),/OWN_RUN_IMMUTABLE/); checks++;
  assert.deepEqual((await request('?resource=attempt&key='+firstKey)).value.data.saved,immutableBefore.value.data.saved); checks++;
  let browserChecks=0;
  if(args.browser){
    const {chromium}=await import('playwright'); browser=await chromium.launch({headless:true,...(args.browser==='chromium'?{}:{channel:args.browser})}); const page=await browser.newPage();await page.goto(origin+'/');
    const browserKey=randomUUID();
    const browserRun=await page.evaluate(async({body,key})=>{const response=await fetch('/api/internal-own-payroll-run',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({operation:'calculate',payload:body})});return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')};},{body,key:browserKey});
    assertCheck(browserRun.status===201 && browserRun.data.data.saved!==null && browserRun.cache.includes('no-store'),'browser sends original JSON stream through actual handler and committed SQL');browserChecks++;
    const browserReplay=await page.evaluate(async({body,key})=>{const response=await fetch('/api/internal-own-payroll-run',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({operation:'calculate',payload:body})});return {status:response.status,data:await response.json()};},{body,key:browserKey});
    assert.deepEqual(browserReplay.data.data.saved,browserRun.data.data.saved);assertCheck(browserReplay.status===200,'browser retry recovers same immutable result without new capture');browserChecks++;
    const browserCounts=await db.run("SELECT jsonb_build_object('captures',(SELECT count(*) FROM own_payroll_run_capture),'results',(SELECT count(*) FROM own_payroll_run_result))");assertCheck(browserCounts.captures===6 && browserCounts.results===6,'browser writes exactly one additional synthetic run');browserChecks++;
  }
  await db.run("DELETE FROM capabilities WHERE membership_id=" + q(qa.ids.maker) + "::uuid AND capability_key='payroll.calculation.nominal.read'");
  const denied = await request('?resource=attempt&key=' + firstKey); assertCheck(denied.status === 403 && denied.value.code === 'OWN_RUN_FORBIDDEN' && !denied.value.data, 'actual SQL revocation defeats stale HTTP capability fixture and denies saved nominal data');
  if(browser){const pages=browser.contexts().flatMap(c=>c.pages());const revoked=await pages[0].evaluate(async key=>{const response=await fetch('/api/internal-own-payroll-run?resource=attempt&key='+key);return{status:response.status,data:await response.json()};},firstKey);assertCheck(revoked.status===403 && !revoked.data.data,'browser cannot recover nominal data after real SQL revocation');browserChecks++;}
  assertCheck(new Set(db.connections).size === db.connections.length && db.connections.length >= 20, 'every query used an independent backend connection');
  assertCheck(capture.saved.inputSha256 === ownRunHash(capture.saved.input) && capture.saved.resultSha256 === ownRunHash(capture.saved.result) && !capture.saved.result.payrollPosted && !capture.saved.result.paymentExecuted && !capture.saved.result.municipalApprovalVerified, 'original hashes and no municipal posting/payment survive commit');
  reports.push({ passed: true, checks, serverMajor: major, synthetic: true, committed: true, separateConnectionCount: db.connections.length, actualHttpHandler: true, browserRuntime:args.browser??null,browserChecks,actualAlgorithmHash: capture.algorithmSha256, monthlyBatches: 2, inputSha256: capture.saved.inputSha256, resultSha256: capture.saved.resultSha256, countsBeforeBrowser:counts, concurrentOutcomes: raced.map(r=>r.status), authenticationGatewayFixture: true, originalSqlSessionAndOwnershipChecks: true, productiveInstallation: false, productUiVerified: false, municipalApprovalVerified: false, paymentExecuted: false });
} catch (e) { reports.push({ passed: false, checks, message: e.message, sqlDiagnostics, synthetic: true, productiveInstallation: false }); process.exitCode = 1; }
finally {
  if (blocker && blocker.exitCode===null) { const ended=new Promise(resolve=>blocker.once('exit',resolve));blocker.stdin.end('ROLLBACK;\n\\q\n');await ended; }
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (installed) { try { await db.run('DROP SCHEMA ' + qa.schema + ' CASCADE'); const state = await db.run("SELECT jsonb_build_object('removed',to_regnamespace(" + q(qa.schema) + ") IS NULL)"); assert.equal(state.removed,true); reports.at(-1).syntheticSchemaRemoved = true; } catch(e) { reports.at(-1).cleanupError=e.message; process.exitCode=1; } }
  fs.writeFileSync(output, JSON.stringify(reports.at(-1),null,2)); console.log(JSON.stringify(reports.at(-1)));
}
