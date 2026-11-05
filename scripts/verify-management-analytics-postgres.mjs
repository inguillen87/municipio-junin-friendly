// SPDX-License-Identifier: GPL-2.0-only
// Loopback equivalence check for managementAnalytics: the candidate implementation must return
// exactly the same payload as a reference implementation on a synthetic database, while issuing
// far fewer evaluations of the effective-source views. Synthetic data only; never a real DSN.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

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

function sqlAdapter(pool, label) {
  const calls = [];
  return {
    calls,
    async query(text, values = []) {
      const started = process.hrtime.bigint();
      const result = await pool.query(String(text), values);
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      calls.push({ label, marker: marker(text), ms: Math.round(ms), rows: result.rows.length });
      return result.rows;
    },
  };
}

function canonical(value) {
  return JSON.stringify(value, (key, item) => (item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : item));
}

const pool = new pg.Pool({ connectionString: dsn, max: 4 });
try {
  if (args.load === 'true') {
    const { MANAGEMENT_ANALYTICS_SYNTHETIC_SQL } = await import(pathToFileURL(resolve(root, 'tests/fixtures/management-analytics-synthetic.js')).href);
    await pool.query(MANAGEMENT_ANALYTICS_SYNTHETIC_SQL);
  }
  const { managementAnalytics: candidate } = await import(candidateModule);
  const candidateSql = sqlAdapter(pool, 'candidate');
  const candidateStarted = process.hrtime.bigint();
  const candidateResult = await candidate(candidateSql);
  const candidateMs = Math.round(Number(process.hrtime.bigint() - candidateStarted) / 1e6);
  const report = {
    schema: 'management-analytics-loopback-check.v1',
    candidate: { totalMs: candidateMs, queries: candidateSql.calls, status: candidateResult.status ?? 200 },
  };
  if (referenceModule) {
    const { managementAnalytics: reference } = await import(referenceModule);
    const referenceSql = sqlAdapter(pool, 'reference');
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
} finally {
  await pool.end();
}
