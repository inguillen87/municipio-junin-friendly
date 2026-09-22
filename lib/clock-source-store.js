import { assertSourceFleet, assertSourceReceipt, safeSourceError, sourceFail } from './clock-source-contract.js';

const targets = Object.freeze({writer:{env:'CLOCK_SOURCE_WRITER_DATABASE_URL',login:'clocks_source_ingest_app',role:'clocks_source_runtime'},reader:{env:'CLOCK_SOURCE_READER_DATABASE_URL',login:'clocks_source_reader_app',role:'clocks_source_reader'}});
export function sourceConnectionConfig(env, kind) {
  const target = targets[kind]; if (!target) sourceFail('CLOCK_SOURCE_NOT_CONFIGURED');
  const connectionString = env?.[target.env];
  if (typeof connectionString !== 'string' || !connectionString.trim()) sourceFail('CLOCK_SOURCE_NOT_CONFIGURED');
  let url;
  try { url = new URL(connectionString); } catch { sourceFail('CLOCK_SOURCE_NOT_CONFIGURED'); }
  if (!['postgres:','postgresql:'].includes(url.protocol) || decodeURIComponent(url.username) !== target.login || !url.password
    || url.pathname !== '/municontrol_clocks' || !/^[a-z0-9.-]+\.neon\.tech$/.test(url.hostname) || url.port && url.port !== '5432'
    || !['require','verify-full'].includes(url.searchParams.get('sslmode')) || url.hash
    || [...url.searchParams.keys()].some(key => !['sslmode','channel_binding'].includes(key)) || new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length) sourceFail('CLOCK_SOURCE_NOT_CONFIGURED');
  for (const key of ['DATABASE_URL','ACTIONS_DATABASE_URL','INTERNAL_DATABASE_URL']) {
    if (!env?.[key]) continue;
    try { const core = new URL(env[key]); if (core.hostname === url.hostname && core.pathname === url.pathname) sourceFail('CLOCK_SOURCE_NOT_CONFIGURED'); }
    catch (error) { if (error?.code === 'CLOCK_SOURCE_NOT_CONFIGURED') throw error; }
  }
  return {connectionString,...target};
}
const rows = result => Array.isArray(result) ? result : result?.rows;
// Do not cache authorization. Every request verifies its actual login, database,
// exact role membership and absence of table privileges before the source call.
export async function getClockSourceSql(env, kind, options = {}) {
  const target = sourceConnectionConfig(env,kind);
  const neon = options.neon ?? (await import('@neondatabase/serverless')).neon;
  const sql = neon(target.connectionString);
  const result = await sql.query(`SELECT current_database() AS database, current_user AS current_user, session_user AS session_user,
    NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls) AND r.rolcanlogin AS safe_login,
    ARRAY(SELECT parent.rolname::text FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid WHERE m.member=r.oid ORDER BY parent.rolname) AS roles,
    coalesce(has_function_privilege(current_user,to_regprocedure('clock_source.receive_v1(text,text,jsonb)'),'EXECUTE'),false) AS can_receive,
    coalesce(has_function_privilege(current_user,to_regprocedure('clock_source.fleet_v1(uuid,uuid[],text,text)'),'EXECUTE'),false) AS can_read,
    NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clock_source' AND c.relkind IN ('r','p')
      AND (has_table_privilege(current_user,c.oid,'SELECT') OR has_table_privilege(current_user,c.oid,'INSERT') OR has_table_privilege(current_user,c.oid,'UPDATE') OR has_table_privilege(current_user,c.oid,'DELETE') OR has_table_privilege(current_user,c.oid,'TRUNCATE'))) AS no_table_access
    FROM pg_roles r WHERE r.rolname=current_user`,[],{fetchOptions:{signal:AbortSignal.timeout(15000)}});
  const identity = rows(result)?.[0];
  if (identity?.database !== 'municontrol_clocks' || identity.current_user !== target.login || identity.session_user !== target.login || identity.safe_login !== true || identity.no_table_access !== true
    || !Array.isArray(identity.roles) || identity.roles.length !== 1 || identity.roles[0] !== target.role
    || identity.can_receive !== (kind === 'writer') || identity.can_read !== (kind === 'reader')) sourceFail('CLOCK_SOURCE_NOT_CONFIGURED');
  return sql;
}
export async function receiveClockSource(sql,connector,tokenHash,payload) {
  try {
    // The driver resolves transaction() after COMMIT, including deferred checks.
    // A lost response or failed COMMIT has no success acknowledgement here.
    const result = await sql.transaction(tx => [tx.query('SELECT clock_source.receive_v1($1::text,$2::text,$3::jsonb) AS result',[connector,tokenHash,JSON.stringify(payload)])],
      {isolationLevel:'ReadCommitted',fetchOptions:{signal:AbortSignal.timeout(20000)}});
    return assertSourceReceipt(rows(result?.[0])?.[0]?.result,payload);
  } catch (error) { throw safeSourceError(error); }
}
export async function readClockSourceFleet(sql,coordinates,deviceIds) {
  try {
    const result = await sql.transaction(tx => [tx.query('SELECT clock_source.fleet_v1($1::uuid,$2::uuid[],$3::text,$4::text) AS result',[coordinates.tenantId,deviceIds,coordinates.sourceBindingSha256,null])],
      {readOnly:true,isolationLevel:'RepeatableRead',fetchOptions:{signal:AbortSignal.timeout(20000)}});
    return assertSourceFleet(rows(result?.[0])?.[0]?.result,coordinates,deviceIds);
  } catch (error) { throw safeSourceError(error); }
}
