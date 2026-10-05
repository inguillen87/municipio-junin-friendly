// Local disposable QA transport. Every query uses a new psql connection and
// explicit COMMIT. No database URL, shared package, shell or municipal endpoint.
import { execFile } from 'node:child_process';
import assert from 'node:assert/strict';
import { qaLiteral } from './own-payroll-durable-qa.mjs';
// Send the SQL as UTF-8 bytes, never via Windows argv/code-page conversion.
function execute(executable,args,sql) {
  return new Promise((resolve,reject)=>{
    const child=execFile(executable,[...args,'-f','-'],{maxBuffer:10*1024*1024,timeout:30000,windowsHide:true,env:{...process.env,PGCLIENTENCODING:'UTF8'}},(error,stdout,stderr)=>{
      if(error){error.stdout=stdout;error.stderr=stderr;reject(error);}else resolve({stdout,stderr});
    });
    child.stdin.on('error',()=>{}); // Callback retains the original psql failure.
    child.stdin.end(sql,'utf8');
  });
}
export function createOwnPayrollPsqlQa({ executable, port, major, schema, pins }) {
  assert.ok([17, 18].includes(major) && port === 55400 + major);
  assert.match(schema, /^mc_qa_fixed_092_[a-f0-9]{32}$/);
  assert.ok(pins.includes("current_database()<>'own_payroll_run_qa'") && pins.includes("current_setting('neon.project_id',true)"));
  const args = ['-X', '-q', '-t', '-A', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'own_payroll_run_qa', '-v', 'ON_ERROR_STOP=1'];
  const connections = [];
  const prefix = `BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='30s'; DO $destination$ BEGIN ${pins} END $destination$; SET LOCAL search_path=${schema},pg_catalog,public,pg_temp;`;
  async function run(statement, runtime = false) {
    const sql = `${prefix} ${runtime ? 'SET LOCAL ROLE municontrol_actions_runtime_app;' : ''} SELECT jsonb_build_object('qaConnectionPid',pg_backend_pid()); ${statement}; COMMIT;`;
    let result;
    try { result = await execute(executable, args, sql); }
    catch (e) { const pid = e.stdout?.split(/\r?\n/).find(s => s.startsWith('{"qaConnectionPid"')); if (pid) connections.push(JSON.parse(pid).qaConnectionPid); const message = e.stderr?.split(/\r?\n/).find(s => /ERROR:/.test(s)); throw Error(message ?? 'QA_PSQL_TRANSPORT_FAILED', { cause: e }); }
    const lines = result.stdout.trim().split(/\r?\n/); const metadata = JSON.parse(lines.shift()); assert.ok(Number.isSafeInteger(metadata.qaConnectionPid)); connections.push(metadata.qaConnectionPid);
    return lines.length ? JSON.parse(lines.at(-1)) : null;
  }
  return { args, prefix, connections, run,
    query: async (query, values) => {
      assert.match(query, /^SELECT public\.own_run_(?:bootstrap|attempt|capture|complete)_v1\([\s\S]+\) AS result$/);
      const rendered = query.replaceAll('public.own_run_', schema + '.own_run_').replace(/\$(\d+)/g, (_, n) => { assert.ok(Number(n) >= 1 && Number(n) <= values.length); return qaLiteral(values[Number(n) - 1]); });
      return [{ result: await run(rendered, true) }];
    },
  };
}
