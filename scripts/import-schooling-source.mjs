// Technical backup recovery only. No application session, manual certificate,
// original-source UPDATE, source promotion or payroll operation is manufactured.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const hex=/^[a-f0-9]{64}$/, uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const exact=(value,keys)=>value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).sort().join()===keys.slice().sort().join();
export function validateSchoolingRecoveryPayload(payload) {
 assert.ok(exact(payload,['version','sourceSystem','sourceDatabase','sourceSha256','sourceDeclaredCutoff','rows']),'RECOVERY_PAYLOAD_INVALID');
 assert.equal(payload.version,'schooling-source-recovery.v1','RECOVERY_VERSION_INVALID');
 assert.equal(payload.sourceSystem,'GRH','RECOVERY_SYSTEM_INVALID');
 assert.ok(typeof payload.sourceDatabase==='string' && /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/.test(payload.sourceDatabase),'RECOVERY_DATABASE_INVALID');
 assert.match(payload.sourceSha256,hex,'RECOVERY_SHA_INVALID');
 assert.match(payload.sourceDeclaredCutoff,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,'RECOVERY_CUTOFF_INVALID');
 const t=new Date(payload.sourceDeclaredCutoff+'Z');
 assert.ok(Number.isFinite(t.getTime()) && t.toISOString().slice(0,19)===payload.sourceDeclaredCutoff,'RECOVERY_CUTOFF_INVALID');
 assert.ok(Array.isArray(payload.rows) && payload.rows.length>=1 && payload.rows.length<=5000,'RECOVERY_ROWS_INVALID');
 const seen=new Set();
 for(const row of payload.rows){
  assert.ok(exact(row,['familyId','companyId','legajo','identitySha256','sourceFields']),'RECOVERY_ROW_INVALID');
  assert.ok(typeof row.familyId==='string' && /^[1-9][0-9]{0,17}$/.test(row.familyId) && !seen.has(row.familyId),'RECOVERY_KEY_INVALID'); seen.add(row.familyId);
  assert.ok(Number.isSafeInteger(row.companyId) && row.companyId>0 && row.companyId<1e9,'RECOVERY_COMPANY_INVALID');
  assert.ok(typeof row.legajo==='string' && row.legajo.length>=1 && row.legajo.length<=64 && !/[\x00-\x1f\x7f]/.test(row.legajo),'RECOVERY_LEGAJO_INVALID');
  assert.match(row.identitySha256,hex,'RECOVERY_IDENTITY_INVALID');
  assert.ok(row.sourceFields && typeof row.sourceFields==='object' && !Array.isArray(row.sourceFields)
   && Object.keys(row.sourceFields).every(key=>['PRES_14','VENC_14'].includes(key))
   && Object.values(row.sourceFields).every(value=>value===null || typeof value==='string' && value.length<=80),'RECOVERY_FIELDS_INVALID');
 }
 assert.ok(Buffer.byteLength(JSON.stringify(payload))<=2097152,'RECOVERY_PAYLOAD_TOO_LARGE');
 return payload;
}
function validateRecoveryOptions({tenantId,bindingId,batchId,payload,operator,apply=false}) {
 for(const id of [tenantId,bindingId,batchId]) assert.match(id,uuid,'RECOVERY_COORDINATES_INVALID');
 validateSchoolingRecoveryPayload(payload);
 assert.ok(typeof operator==='string' && operator.trim()===operator && operator.length>=5 && operator.length<=160 && !/[\x00-\x1f\x7f]/.test(operator),'RECOVERY_OPERATOR_INVALID');
 assert.equal(typeof apply,'boolean','RECOVERY_APPLY_INVALID');
 return {tenantId,bindingId,batchId,payload,operator,apply};
}
/** Caller owns the transaction and must roll it back on any error. The returned
 * SQL receipt describes this transaction only; it is not a durable ACK until
 * the caller has successfully committed every publication stage.
 * No connection, transaction boundary, timeout or isolation is changed here.
 */
export async function importSchoolingSourceWithinTransaction(client,options) {
 const {tenantId,bindingId,batchId,payload,operator,apply}=validateRecoveryOptions(options);
 assert.equal(typeof client?.query,'function','RECOVERY_CLIENT_REQUIRED');
 const payloadJson=JSON.stringify(payload),expectedRows=payload.rows.length,expectedSourceSha=payload.sourceSha256;
 // SAVEPOINT fails before the facade can write when an autocommit connection
 // is accidentally supplied. Never recover or commit the caller's transaction.
 try { await client.query('SAVEPOINT schooling_source_import_transaction'); }
 catch(error) {
  if(error?.code==='25P01') throw Object.assign(new Error('RECOVERY_TRANSACTION_REQUIRED'),{code:'RECOVERY_TRANSACTION_REQUIRED'});
  throw error;
 }
 await client.query('RELEASE SAVEPOINT schooling_source_import_transaction');
 const rows=(await client.query('SELECT public.school_certificate_source_import_v4($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::text,$6::boolean) AS result',
  [tenantId,bindingId,batchId,payloadJson,operator,apply])).rows;
 const r=rows?.[0]?.result;
 assert.ok(rows?.length===1 && exact(r,['version','applied','replayed','rows','matched','sourceSha256','rowsetSha256','originalRowsModified','manualRecordsCreated','payrollModified']),'RECOVERY_RECEIPT_INVALID');
 assert.ok(r.version==='schooling-source-import.v1' && r.applied===apply && typeof r.replayed==='boolean' && r.rows===expectedRows && r.matched===r.rows
  && r.sourceSha256===expectedSourceSha && hex.test(r.rowsetSha256) && r.originalRowsModified===0 && r.manualRecordsCreated===0 && r.payrollModified===false,'RECOVERY_RECEIPT_INVALID');
 return r;
}
export async function importSchoolingSource(client,options) {
 const validated=validateRecoveryOptions(options),{apply}=validated;
 await client.query(`BEGIN ISOLATION LEVEL READ COMMITTED ${apply?'READ WRITE':'READ ONLY'}`);
 try {
  await client.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'");
  const r=await importSchoolingSourceWithinTransaction(client,validated);
  await client.query('COMMIT');
  return r;
 } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
}
async function main(){
 const args={};for(const a of process.argv.slice(2)){const m=/^--([a-z-]+)=(.+)$/.exec(a);assert.ok(m,'RECOVERY_ARGUMENT_INVALID');assert.ok(!Object.hasOwn(args,m[1]),'RECOVERY_ARGUMENT_DUPLICATED');args[m[1]]=m[2];}
 const allowed=['payload','expected-payload-sha','expected-migration-sha','expected-host','expected-branch','tenant','binding','batch','operator','apply'];
 assert.ok(Object.keys(args).every(k=>allowed.includes(k)) && allowed.filter(k=>k!=='apply').every(k=>args[k]),'RECOVERY_ARGUMENT_REQUIRED');
 assert.ok(args.apply===undefined || ['false','true'].includes(args.apply),'RECOVERY_APPLY_INVALID');
 assert.match(args['expected-payload-sha'],hex);assert.match(args['expected-migration-sha'],hex);
 const bytes=fs.readFileSync(path.resolve(args.payload));assert.ok(bytes.length<=2097152,'RECOVERY_PAYLOAD_TOO_LARGE');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),args['expected-payload-sha'],'RECOVERY_PAYLOAD_CHANGED');
 const payload=validateSchoolingRecoveryPayload(JSON.parse(bytes.toString('utf8')));
 const url=new URL(process.env.SCHOOLING_RECOVERY_DATABASE_URL??'');
 assert.ok(['postgres:','postgresql:'].includes(url.protocol) && url.hostname===args['expected-host'] && url.pathname==='/neondb'
  && decodeURIComponent(url.username)==='neondb_owner' && url.password && ['require','verify-full'].includes(url.searchParams.get('sslmode')),'RECOVERY_OWNER_TARGET_INVALID');
 assert.ok([...url.searchParams.keys()].every(k=>['sslmode','channel_binding'].includes(k)) && !url.hash,'RECOVERY_ROUTING_INVALID');
 const {Pool,neonConfig}=await import('@neondatabase/serverless');neonConfig.webSocketConstructor=WebSocket;
 const pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:10000});let client;
 try{
  client=await pool.connect();
  const identity=(await client.query("SELECT current_user AS role,current_setting('neon.branch_id',true) AS branch,checksum_sha256 FROM schema_migrations WHERE version='094-schooling-source-recovery'")).rows;
  assert.ok(identity.length===1 && identity[0].role==='neondb_owner' && identity[0].branch===args['expected-branch'] && identity[0].checksum_sha256===args['expected-migration-sha'],'RECOVERY_SCHEMA_OR_TARGET_MISMATCH');
  const result=await importSchoolingSource(client,{tenantId:args.tenant,bindingId:args.binding,batchId:args.batch,payload,operator:args.operator,apply:args.apply==='true'});
  console.log(JSON.stringify(result));
 }finally{client?.release();await pool.end();}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(()=>{console.error('SCHOOLING_SOURCE_IMPORT_FAILED; no successful commit is asserted. Recheck the exact payload and target before retry.');process.exitCode=1;});
