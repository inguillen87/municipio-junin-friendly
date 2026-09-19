import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function verifyNeonPlatform(sql,{projectId,branchId,major}={}) {
  if(!/^[a-z0-9-]{1,60}$/.test(projectId??'') || !/^br-[a-z0-9-]{1,60}$/.test(branchId??'') || ![17,18].includes(major))
    throw Error('PLATFORM_DATABASE_TARGET_INVALID');
  const rows=await sql.transaction([
    sql.query("SELECT set_config('statement_timeout','10000',true),set_config('lock_timeout','1000',true)",[]),
    sql.query(`SELECT current_setting('neon.project_id',true) AS project_id,
      current_setting('neon.branch_id',true) AS branch_id,current_setting('server_version_num') AS version_num,
      current_setting('server_version') AS version,current_setting('transaction_read_only') AS read_only,
      (SELECT count(*)::text FROM pg_tables WHERE schemaname='public') AS public_tables`,[]),
    sql.query(`SELECT ($1::numeric+$2::numeric)::text AS exact_sum,
      round(1234.565::numeric,2)::text AS positive_round,round(-1234.565::numeric,2)::text AS negative_round,
      (DATE '2024-02-29'+INTERVAL '1 year')::date::text AS leap_anniversary,
      to_char(TIMESTAMPTZ '2026-10-01 02:30:00+00' AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM-DD HH24:MI') AS local_clock_date,
      (jsonb_build_object('amount',$3::text)->>'amount') AS json_exact_amount`,['0.10','0.20','123456789012345.67']),
  ],{readOnly:true,isolationLevel:'RepeatableRead'});
  const target=rows[1]?.[0],sample=rows[2]?.[0];
  assert.equal(target?.project_id,projectId);assert.equal(target?.branch_id,branchId);
  assert.equal(Math.floor(Number(target?.version_num)/10000),major);assert.equal(target?.read_only,'on');
  assert.deepEqual(sample,{exact_sum:'0.30',positive_round:'1234.57',negative_round:'-1234.57',
    leap_anniversary:'2025-02-28',local_clock_date:'2026-09-30 23:30',json_exact_amount:'123456789012345.67'});
  return {version:'municontrol-neon-platform-check.v1',checkedAt:new Date().toISOString(),
    projectId,branchId,postgresVersion:target.version,nodeVersion:process.version,publicTables:target.public_tables,
    checksPassed:6,readOnly:true,databaseWrites:0,fullRestoreVerified:false,payrollCertified:false};
}
export async function main(argv=process.argv.slice(2)) {
  if(argv.length!==3 || !/^(17|18)$/.test(argv[2])) throw Error('PLATFORM_DATABASE_ARGUMENTS_INVALID');
  const connection=process.env.MUNICONTROL_PLATFORM_CHECK_URL;
  if(!connection || !/^postgres(?:ql)?:\/\//.test(connection)) throw Error('PLATFORM_DATABASE_CONNECTION_REQUIRED');
  const {neon}=await import('@neondatabase/serverless');
  const report=await verifyNeonPlatform(neon(connection),{projectId:argv[0],branchId:argv[1],major:Number(argv[2])});
  console.log(JSON.stringify(report));return report;
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
  main().catch(()=>{console.error('PLATFORM_DATABASE_CHECK_FAILED; no persistent changes requested.');process.exitCode=1;});
