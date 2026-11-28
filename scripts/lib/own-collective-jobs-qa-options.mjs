import assert from 'node:assert/strict';
import path from 'node:path';

// CI uses the existing Docker service's published loopback port. The server
// sees its private container address and port 5432; local PG17 stays pinned to
// its original loopback address and server port 55417. Neither accepts a URL.
export function collectiveJobsQaOptions(args, env = process.env) {
  assert.ok(Array.isArray(args), 'QA arguments must be an array.');
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    assert.ok(['--psql', '--transport', '--output', '--skip-benchmark'].includes(key) && !values.has(key), 'Unknown or duplicate QA argument.');
    if (key === '--skip-benchmark') { values.set(key, true); continue; }
    const value = args[++i];
    assert.ok(typeof value === 'string' && value.length > 0 && !value.startsWith('--') && !/[\u0000-\u001f\u007f]/.test(value), 'QA arguments require complete values.');
    values.set(key, value);
  }
  const executable = values.get('--psql');
  assert.ok(executable && path.isAbsolute(executable), '--psql /absolute/local/psql is required.');
  const transport = values.get('--transport') ?? 'local';
  assert.ok(['local', 'ci'].includes(transport), 'Transport must be local or ci.');
  if (transport === 'ci') assert.equal(env.GITHUB_ACTIONS, 'true', 'The ci transport requires the actual GitHub Actions environment.');
  const argsForPsql = ['-X', '-q', '-t', '-A', '-h', '127.0.0.1', '-p', '55417', '-U', 'postgres', '-d', 'own_payroll_run_qa', '-v', 'ON_ERROR_STOP=1', '-f', '-'];
  const addressGuard = transport === 'ci'
    ? `inet_server_addr() IS NULL OR NOT (inet_server_addr() <<= '10.0.0.0/8'::inet
       OR inet_server_addr() <<= '172.16.0.0/12'::inet OR inet_server_addr() <<= '192.168.0.0/16'::inet)
       OR inet_server_port() IS DISTINCT FROM 5432`
    : `inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port() IS DISTINCT FROM 55417`;
  const guard = `DO $destination$ BEGIN IF current_database() IS DISTINCT FROM 'own_payroll_run_qa'
 OR current_user IS DISTINCT FROM 'postgres' OR session_user IS DISTINCT FROM 'postgres'
 OR ${addressGuard}
 OR current_setting('server_version_num')::integer/10000 IS DISTINCT FROM 17
 OR nullif(current_setting('neon.project_id',true),'') IS NOT NULL
 THEN RAISE EXCEPTION 'COLLECTIVE_QA_DESTINATION'; END IF; END $destination$;`;
  // PGHOSTADDR can otherwise redirect libpq even with an explicit -h argument.
  const processEnv = { ...env, PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: '55417', PGUSER: 'postgres', PGDATABASE: 'own_payroll_run_qa', PGOPTIONS: '', PGCONNECT_TIMEOUT: '10', PGCLIENTENCODING: 'UTF8', PGAPPNAME: 'own-collective-disposable-qa' };
  delete processEnv.PGSERVICE;
  delete processEnv.PGSERVICEFILE;
  return { executable, transport, destination: values.get('--output') ?? null, skipBenchmark: values.has('--skip-benchmark'), argsForPsql, guard, processEnv };
}
