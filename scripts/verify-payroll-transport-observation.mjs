import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// One finite diagnostic experiment. It never replaces the normal browser gate
// and preserves every failure; no retry-until-success or excluded case.
const root = path.resolve('verification/payroll-formula-transport');
fs.mkdirSync(root, { recursive: true });
const cases = [];
for (let index = 0; index < 8; index++) {
  const output = path.join(root, 'case-' + index);
  fs.mkdirSync(output, { recursive: false });
  const log = fs.openSync(path.join(output, 'original-verifier.log'), 'wx');
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, ['scripts/verify-payroll-formula-lab-browser.mjs'], {
    stdio: ['ignore', log, log],
    env: { ...process.env, TEMP: output, TMP: output, MUNICONTROL_TRANSPORT_CDP: '1' },
  });
  const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  fs.closeSync(log);
  cases.push({ index, pid: child.pid, startedAt, completedAt: new Date().toISOString(), exitCode, originalControls: true });
  fs.writeFileSync(path.join(root, 'finite-diagnostic.json'), JSON.stringify({ syntheticOnly: true, releaseGate: false, cases }, null, 2) + '\n');
  console.log(JSON.stringify(cases.at(-1)));
}
assert.equal(cases.length, 8);
assert.deepEqual(cases.filter(value => value.exitCode !== 0), [], 'All eight original browser verifications must pass; failures remain preserved');
