// Aceptación con PostgreSQL desechable y datos inventados. Nunca usa la conexión de producción.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {loaderQaPackage,loaderQaSetup,loaderQaTarget} from '../tests/fixtures/successor-loader-postgres.js';
import {executeSuccessorStage} from './stage-grh-successor.mjs';
import {SOURCE_CAPACITY_QUERY} from './lib/grh-source-capacity.mjs';
const driverPath=process.env.SUCCESSOR_QA_PG_DRIVER;
assert.ok(driverPath&&path.isAbsolute(driverPath),'QA_DRIVER_REQUIRED');
const {default:pg}=await import(pathToFileURL(driverPath));
const port=Number(process.env.SUCCESSOR_QA_PORT||55464);
assert.ok(Number.isSafeInteger(port)&&port>=1024&&port<=65535,'QA_PORT_INVALID');
const raw=new pg.Client({host:'127.0.0.1',port,user:process.env.SUCCESSOR_QA_USER||'qa_operator',database:'successor_stage_qa',password:process.env.PGPASSWORD,connectionTimeoutMillis:10000});
const checks=[];const output=path.resolve('verification/successor-loader');fs.mkdirSync(output,{recursive:true});
let queries=[],connects=0;
await raw.connect();
async function preserved(){
 const names=(await raw.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'grh_successor_stage%' ORDER BY tablename")).rows;
 const result={};for(const {tablename} of names){assert.match(tablename,/^[a-z_][a-z_0-9]*$/);result[tablename]=(await raw.query(`SELECT count(*)::integer AS rows,md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')) AS digest FROM public.${tablename} r`)).rows[0];}
 return result;
}
const absent=async()=>assert.equal((await raw.query("SELECT to_regclass('public.grh_successor_stage') IS NULL AS absent")).rows[0].absent,true);
try{
 const [identity]=(await raw.query("SELECT current_database() AS database,current_setting('server_version_num')::integer/10000 AS major")).rows;
 assert.equal(identity.database,'successor_stage_qa');assert.ok([17,18].includes(identity.major));
 await raw.query(loaderQaSetup(identity.major));const prepared=await loaderQaPackage(),baseline=await preserved();
 const run=(options={},hook=async()=>{})=>executeSuccessorStage({connect:async()=>{connects++;return {release(){},query:async(text,values)=>{queries.push(text);const override=await hook(text,values,'before');if(override)return override;const result=await raw.query(text,values);await hook(text,values,'after',result);return result;}};},prepared,target:loaderQaTarget,expectedPackageSha256:prepared.payloadSha256,installSchema:true,...options});
 const rehearsal=await run();assert.equal(rehearsal.rolledBack,true);assert.equal(rehearsal.committed,false);assert.equal(rehearsal.deltaRows,403);await absent();assert.deepEqual(await preserved(),baseline);
 checks.push('Esquema, 403 diferencias en tres lotes y sello se ensayan juntos y se revierten sin cambiar ninguna tabla previa.');
 const noConnection=connects;await assert.rejects(run({expectedPackageSha256:'0'.repeat(64)}),{code:'SUCCESSOR_STAGE_PACKAGE_CHANGED'});assert.equal(connects,noConnection);
 checks.push('Paquete distinto del hash confirmado falla antes de abrir una conexión.');
 await assert.rejects(run({installSchema:false}),{code:'SUCCESSOR_STAGE_SCHEMA_REQUIRED'});await absent();
 await assert.rejects(run({target:{...loaderQaTarget,branchId:'br-other'}}),{code:'SUCCESSOR_STAGE_TARGET_OR_TRANSACTION'});await absent();
 checks.push('Instalación y destino explícitos: sin autorización de esquema o en otra rama no se carga nada.');
 const saved=await run({commit:true});
 assert.equal(saved.committed,true);assert.equal(saved.inserted,true);assert.equal(saved.sealed,true);
 const repeated=await run({commit:true});
 assert.equal(repeated.replayed,true);assert.equal(repeated.inserted,false);assert.equal(repeated.stageId,saved.stageId);
 assert.equal((await raw.query('SELECT count(*)::integer AS n FROM public.grh_successor_stage_delta')).rows[0].n,403);
 assert.deepEqual(await preserved(),baseline);
 checks.push('La repetición verifica el mismo candidato sellado sin duplicarlo ni modificar tablas anteriores.');
 assert.equal(repeated.operational,false);assert.equal(repeated.sourcePromoted,false);assert.equal(repeated.nativeConflictsResolved,false);
 assert.equal(repeated.nativeReviewRequired,true);
 checks.push('El comprobante de preparación no declara seleccionada la fuente ni resueltas las dependencias nativas.');
 const result={version:'successor-loader-qa.v1',checkedAt:new Date().toISOString(),postgresMajor:identity.major,checksPassed:checks.length,checks,synthetic:true,productionWrites:0};
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{try{await raw.query('ROLLBACK');}catch{}await raw.end();}
