// SPDX-License-Identifier: GPL-2.0-only
// Loopback equivalence check for managementAnalytics: the candidate implementation must return
// exactly the same payload as a reference implementation on a synthetic database, while issuing
// far fewer evaluations of the effective-source views. Synthetic data only; never a real DSN.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, value = 'true'] = item.replace(/^--/, '').split('=');
  return [key, value];
}));
const dsn = args.dsn || process.env.MANAGEMENT_QA_DSN;
if (!dsn || !/^postgres(ql)?:\/\/([^@/]+@)?(127\.0\.0\.1|localhost)[:/]/.test(dsn)) {
  console.error('MANAGEMENT_QA_DSN_LOOPBACK_REQUIRED');
  process.exit(2);
}
const referenceModule = args.reference ? pathToFileURL(resolve(root, args.reference)).href : null;
const candidateModule = pathToFileURL(resolve(root, args.candidate || 'api/internal-data.js')).href;

function marker(statement) {
  return String(statement).match(/\/\* management:([^*]+) \*\//)?.[1] || 'unknown';
}

// No database driver dependency: each parameterized statement is prepared and executed through
// psql, with every parameter typed by the casts the statements already carry, and the rows come
// back as one JSON document. Values are only ever synthetic window ids and dates.
const run = promisify(execFile);
async function psql(dsn, sqlText, { stdin = null } = {}) {
  const args = [dsn, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
  const options = { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PGCONNECT_TIMEOUT: '10' } };
  if (stdin !== null) { const child = execFile('psql', [...args, '-f', '-'], options); child.stdin.end(stdin); return new Promise((ok, fail) => { let out = '', err = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { err += d; }); child.on('close', (code) => (code === 0 ? ok(out) : fail(new Error(err.trim() || `psql exit ${code}`)))); }); }
  const { stdout } = await run('psql', [...args, '-c', sqlText], options);
  return stdout;
}
const literal = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);
function sqlAdapter(dsn, label) {
  const calls = [];
  return {
    calls,
    async query(text, values = []) {
      const started = process.hrtime.bigint();
      const name = `management_qa_${calls.length}_${Date.now()}`;
      const prepared = `PREPARE ${name} AS SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (${String(text)}\n) t; EXECUTE ${name}${values.length ? `(${values.map(literal).join(', ')})` : ''};`;
      const output = await psql(dsn, prepared);
      const rows = JSON.parse(output.trim() || '[]');
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      calls.push({ label, marker: marker(text), ms: Math.round(ms), rows: rows.length });
      return rows;
    },
  };
}

function canonical(value) {
  return JSON.stringify(value, (key, item) => (item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : item));
}

{
  if (args.load === 'true') {
    const { MANAGEMENT_ANALYTICS_SYNTHETIC_SQL } = await import(pathToFileURL(resolve(root, 'tests/fixtures/management-analytics-synthetic.js')).href);
    await psql(dsn, '', { stdin: MANAGEMENT_ANALYTICS_SYNTHETIC_SQL });
  }
  const { managementAnalytics: candidate } = await import(candidateModule);
  const candidateSql = sqlAdapter(dsn, 'candidate');
  const candidateStarted = process.hrtime.bigint();
  const candidateResult = await candidate(candidateSql);
  const candidateMs = Math.round(Number(process.hrtime.bigint() - candidateStarted) / 1e6);
  const report = {
    schema: 'management-analytics-loopback-check.v1',
    candidate: { totalMs: candidateMs, queries: candidateSql.calls, status: candidateResult.status ?? 200 },
  };
  if (referenceModule) {
    const { managementAnalytics: reference } = await import(referenceModule);
    const referenceSql = sqlAdapter(dsn, 'reference');
    const referenceStarted = process.hrtime.bigint();
    const referenceResult = await reference(referenceSql);
    const referenceMs = Math.round(Number(process.hrtime.bigint() - referenceStarted) / 1e6);
    report.reference = { totalMs: referenceMs, queries: referenceSql.calls, status: referenceResult.status ?? 200 };
    report.identical = canonical(referenceResult) === canonical(candidateResult);
    if (!report.identical) {
      const a = canonical(referenceResult), b = canonical(candidateResult);
      let index = 0;
      while (index < a.length && a[index] === b[index]) index += 1;
      report.firstDifference = { at: index, reference: a.slice(Math.max(0, index - 80), index + 120), candidate: b.slice(Math.max(0, index - 80), index + 120) };
    }
  }
  if (args['write-expected']) {
    await writeFile(resolve(root, args['write-expected']), JSON.stringify(JSON.parse(canonical(candidateResult)), null, 1) + '\n');
    report.expectedWritten = args['write-expected'];
  }
  if (args.expected) {
    const expected = canonical(JSON.parse(await readFile(resolve(root, args.expected), 'utf8')));
    report.matchesExpected = expected === canonical(candidateResult);
    if (!report.matchesExpected) {
      const a = expected, b = canonical(candidateResult);
      let index = 0;
      while (index < a.length && a[index] === b[index]) index += 1;
      report.firstExpectedDifference = { at: index, expected: a.slice(Math.max(0, index - 80), index + 120), candidate: b.slice(Math.max(0, index - 80), index + 120) };
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if ((referenceModule && !report.identical) || (args.expected && !report.matchesExpected)) process.exitCode = 1;
}
