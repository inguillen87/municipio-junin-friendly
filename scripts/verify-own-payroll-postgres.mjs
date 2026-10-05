// Independent numeric oracle. Loopback only, SELECT only, invented cases only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { decimal, quantize } from '../assets/own-payroll-exact.js';
import { calculateOwnPayroll } from '../assets/own-payroll-engine.js';
import { payrollInput, payrollId } from '../tests/fixtures/own-payroll-synthetic.js';

const major = process.argv.find(a => a.startsWith('--major='))?.slice(8);
assert(['17', '18'].includes(major), 'Declarar --major=17 o --major=18 para QA local.');
const ci = process.argv.includes('--ci');
assert(!ci || process.env.CI === 'true', 'El ejecutable de CI sólo se usa en el runner de pruebas.');
const root = path.resolve(import.meta.dirname, '..');
const executable = ci ? 'psql' : path.join(root, `verification/postgresql-qa-20261004/pg${major}/pgsql/bin/psql.exe`);
const execute = sql => JSON.parse(execFileSync(executable, ['-X', '-h', '127.0.0.1', '-p', major === '17' ? '55417' : '55418', '-U', 'postgres', '-d', 'native_monthly_qa', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-c', sql], { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim());
const actualMajor = execute("SELECT jsonb_build_object('major',current_setting('server_version_num')::integer/10000)");
assert.equal(String(actualMajor.major), major);
const values = ['1.005', '1.015', '-1.005', '-1.015', '0.004', '-0.004', '12345.6789', '9007199254740993.01'];
const cases = values.flatMap(value => [0, 2, 4, 8].flatMap(precision => ['half_up', 'half_even', 'toward_zero', 'floor', 'ceiling'].map(mode => ({ value, precision, mode }))));
const tuples = cases.map((c, i) => `(${i},${c.value}::numeric,${c.precision},'${c.mode}')`).join(',');
const oracle = execute(`WITH cases(id,value,precision,mode) AS (VALUES ${tuples}), scaled AS (SELECT *,value*power(10::numeric,precision) AS v FROM cases), rounded AS (SELECT *,CASE mode WHEN 'toward_zero' THEN trunc(v) WHEN 'floor' THEN floor(v) WHEN 'ceiling' THEN ceil(v) WHEN 'half_even' THEN CASE WHEN abs(v-trunc(v))=0.5 AND mod(abs(trunc(v)),2)=0 THEN trunc(v) ELSE round(v) END ELSE round(v) END AS q FROM scaled) SELECT jsonb_agg(jsonb_build_object('id',id,'amount',round(q/power(10::numeric,precision),precision)::text) ORDER BY id) FROM rounded`);
for (const [i, c] of cases.entries()) assert.equal(quantize(decimal(c.value), { precision: c.precision, mode: c.mode }).amount, oracle[i].amount, `Diferencia con PostgreSQL ${major}, caso ${i}`);
const result = calculateOwnPayroll(payrollInput());
const golden = execute("WITH e(id,base,addition) AS (VALUES(1,100.10::numeric,20.00::numeric),(2,350.15::numeric,0.00::numeric)), gross AS (SELECT *,round(base*0.125,2) AS extra,base+round(base*0.125,2)+addition AS gross FROM e) SELECT jsonb_agg(jsonb_build_object('id',id,'extra',extra::text,'gross',gross::text,'deduction',round(gross*0.03,2)::text,'net',(gross-round(gross*0.03,2))::text,'contribution',round(base*0.15,2)::text) ORDER BY id) FROM gross");
let comparisons = cases.length;
for (const expected of golden) {
  const total = result.employeeTotals.find(r => r.contractId === payrollId(expected.id));
  for (const field of ['gross', 'deduction', 'net']) { assert.equal(total[field], expected[field]); comparisons++; }
  assert.equal(total.employer_contribution, expected.contribution); comparisons++;
  assert.equal(result.rows.find(r => r.contractId === payrollId(expected.id) && r.conceptCode === '110').amount, expected.extra); comparisons++;
}
const report = { major: Number(major), comparisons, passed: true, host: '127.0.0.1', municipalWrites: 0, statements: 'SELECT only', synthetic: true };
fs.writeFileSync(path.join(root, `verification/own-payroll-engine-pg${major}-20261004.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
