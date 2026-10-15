// Independent182 QA: existing owned loopback servers, invented data only.
// The documentary sentinel setup below preserves the reviewed201 QA recipe.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {noeliaCircuitRuntime} from './lib/noelia-circuit-runtime.mjs';
import {verifyDocumentaryQaProcess,documentaryQaFoundation,documentaryQaBridge,documentaryBaselineStatements,documentaryEffectiveBatchStatement,relocateDocumentary178} from './lib/adopted-documentary-read-qa.mjs';
import {buildAdoptedOwnNoveltyInstallation} from './lib/adopted-own-novelties-installation.mjs';
import {relocateNoeliaNoveltyInstallation} from './lib/noelia-payroll-circuit-qa.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {syntheticDetail} from './payroll-detail-synthetic.mjs';
import {employeePayrollDetail} from '../lib/internal-payroll-detail.js';
import {employeePayrollDocuments} from '../lib/internal-payroll-documents.js';
import {createPayrollDetailModel} from '../assets/payroll-detail-model.js';
import {createPayrollDetailPdf} from '../assets/payroll-detail-export.js';
import {performanceExternalProof} from './verify-documentary-roster-performance.mjs';

const root=path.resolve(import.meta.dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),hash=value=>createHash('sha256').update(value).digest('hex');

import {assertIndependentProcessStart} from './verify-agreement-hours-independent.mjs';
import {verifyOwnAgreementWorkingTime} from './verify-own-agreement-working-time.mjs';
import {runPeriodContextQa} from './lib/own-payroll-period-context-qa.mjs';
const inheritedSourceFiles=['scripts/migrations/176-own-payroll-administrative-operator.sql','scripts/migrations/177-own-period-classification.sql','scripts/migrations/178-adopted-documentary-read.sql','scripts/migrations/179-own-agreement-working-time.sql','scripts/migrations/180-own-agreement-working-time-program.sql','scripts/lib/own-agreement-working-time-consumers.mjs','scripts/lib/own-agreement-working-time-installation.mjs','scripts/lib/own-agreement-working-time-qa-relocation.mjs','scripts/verify-own-agreement-working-time.mjs','assets/own-agreement-working-time-model.js','assets/own-agreement-working-time-program.js','assets/own-payroll-program-model.js','assets/own-payroll-run-model.js','lib/own-payroll-approved-input.js','lib/internal-own-payroll-run.js','assets/own-payroll-program-panel.js','assets/own-payroll-program-workspace-model.js','assets/own-payroll-report-variables.js','assets/payroll-navigation.js','lib/own-period-read-recovery.js','scripts/build-friendly.mjs','api/internal-own-agreement-working-time.js','assets/own-agreement-working-time-panel.css','assets/own-agreement-working-time-panel.js','assets/own-agreement-working-time-workspace.js','lib/internal-own-agreement-working-time.js','scripts/lib/own-agreement-working-time-browser.mjs','tests/fixtures/own-agreement-working-time-synthetic.js','tests/own-agreement-working-time-api.test.js','tests/own-agreement-working-time-input.test.js','tests/own-agreement-working-time-workspace.test.js','tests/own-agreement-working-time.test.js'];
inheritedSourceFiles.push('scripts/lib/own-agreement-working-time-catalog-qa.mjs','scripts/lib/classification-registration-use-installation.mjs','scripts/lib/classification-registration-use-pins.mjs','scripts/lib/adoption-administrative-identity-installation.mjs','scripts/migrations/167-classification-registration-use.sql');
inheritedSourceFiles.push('api/internal-own-period-classification.js','tests/own-period-classification-api.test.js','tests/own-period-read-recovery-delay.test.js');
async function documentaryGuard({major,sourceCommit,output}){
 const qa=documentaryQaFoundation(major),db=documentaryQaBridge(qa,major),destination=path.resolve(output+'-documentary-guard');assert.ok(!fs.existsSync(destination));fs.mkdirSync(destination);
 let step=0,seeded=false;const j=v=>q(JSON.stringify(v))+'::jsonb';
 const execute=sql=>{const file=path.join(destination,String(++step).padStart(3,'0')+'.sql');fs.writeFileSync(file,sql,{flag:'wx'});const r=spawnSync(db.executable,[...db.args,'--no-password','-f',file],{encoding:'utf8',windowsHide:true,env:db.environment,maxBuffer:16*1024*1024,timeout:180000});fs.writeFileSync(file+'.log',(r.stdout??'')+(r.stderr??''));assert.equal(r.status,0,r.stderr?.slice(-4000));const last=r.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);return last?.startsWith('{')||last?.startsWith('[')?JSON.parse(last):null;};
 const tx=statements=>'BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL statement_timeout=\'160s\';SET LOCAL lock_timeout=\'2s\';SET LOCAL search_path='+qa.schema+',pg_catalog,public,pg_temp;DO $$ BEGIN '+qa.pins+' END $$;'+statements.join(';\n')+';COMMIT;';
 const cleanup=async()=>{if(seeded){execute(tx(['DROP SCHEMA '+qa.schema+' CASCADE']));seeded=false;}};
 try{
  execute(qa.sql);seeded=true;const base=relocateNoeliaNoveltyInstallation(buildAdoptedOwnNoveltyInstallation({read,sourceCommit}),qa);
  execute(tx(base.operator.consumers.statements));execute(tx(base.operator.statements));
  execute(tx([...documentaryBaselineStatements(read,{major,baseline:'canonical'}).map(qa.normalized),...splitPostgresStatements(read('scripts/migrations/053-payroll-source-report.sql')).map(qa.normalized),qa.normalized(documentaryEffectiveBatchStatement(read))]));
  const patch=relocateDocumentary178(read,qa);execute(tx([patch.statement]));
  const originals=await db.run("SELECT jsonb_agg(jsonb_build_object('id',c.id,'number',c.legacy_legajo,'name',p.full_name) ORDER BY c.legacy_legajo) FROM employment_contract c JOIN person_identity p ON p.id=c.person_id WHERE c.source_system='GRH' AND c.legacy_company_id=101");assert.equal(originals.length,3);
  const data=syntheticDetail(),concepts=Object.fromEntries(data.lines.map(({code,description,totalGroup,calculationClass,sourceType,unit})=>[code,{description,totalGroup,calculationClass,type:sourceType,unit}]));
  const lines=data.lines.map(({code,amount,quantity,agreement})=>({code,amount,quantity,agreement}));const datasetId=randomUUID(),passphrase='independent-synthetic-'+randomUUID(),payload={version:'payroll-detail-source.v1',sourceSha256:'a'.repeat(64),sourceDatabase:'qa_fixed_source',company:101,sourceLabel:'Fuente documental exclusivamente sintética QA182',date:'2026-09-30',period:2026,month:9,type:'M',closedFlag:1,concepts,statements:originals.map(x=>({legajo:x.number,lines}))},plain=JSON.stringify(payload);
  const delivered=execute(tx([`CREATE TEMP TABLE qa_cipher AS SELECT public.pgp_sym_encrypt_bytea(convert_to(${q(plain)},'UTF8'),${q(passphrase)},'compress-algo=1,cipher-algo=aes256') AS value`,`INSERT INTO payroll_detail_delivery_job(id,tenant_id,source_binding_id,source_sha256,cipher_sha256,payload_sha256,passphrase,payload_bytes,statement_count,line_count,requested_by,expires_at) SELECT ${q(datasetId)}::uuid,${q(qa.ids.tenant)}::uuid,${q(qa.ids.binding)}::uuid,${q(payload.sourceSha256)},encode(public.digest(value,'sha256'),'hex'),encode(public.digest(convert_to(${q(plain)},'UTF8'),'sha256'),'hex'),${q(passphrase)},octet_length(convert_to(${q(plain)},'UTF8')),3,${lines.length*3},${q(qa.ids.maker)}::uuid,clock_timestamp()+interval '1 hour' FROM qa_cipher`,`SELECT payroll_detail_delivery_v1(${q(datasetId)}::uuid,(SELECT value FROM qa_cipher))`]));assert.equal(delivered.statements,3);
  const actor=qa.actors.maker,principal={user:{email:actor.actorEmail},tenant:{source:'membership',id:actor.tenantId,membershipId:actor.membershipId,effectiveCapabilities:[...qa.caps,'payroll.read']}},session={email:actor.actorEmail,id:actor.actorSessionId,version:actor.actorSessionVersion,releaseSha:actor.releaseSha};
  const probe=async()=>{const rows=[];for(const p of originals){const d=await employeePayrollDetail(db,{query:{resource:'employeepayrolldetail',contractId:p.id,date:'2026-09-30',type:'M',period:'2026',month:'9'}},principal,session),l=await employeePayrollDocuments(db,{query:{resource:'employeepayrolldocuments',contractId:p.id}},principal,session);assert.equal(d.status,200);assert.equal(l.status,200);const pdf=createPayrollDetailPdf(createPayrollDetailModel(d.payload.data,{contractId:p.id,name:p.name,legajo:p.number}));rows.push({detailSha256:hash(JSON.stringify(d.payload.data)),librarySha256:hash(JSON.stringify(l.payload.data)),pdfSha256:hash(pdf)});}return rows;};
  const metadata=()=>db.run("SELECT to_jsonb(encode(public.digest(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]')::text,'sha256'),'hex')) FROM pg_proc p WHERE p.pronamespace="+q(qa.schema)+"::regnamespace AND p.proname IN('employee_payroll_detail_v1','employee_payroll_documents_v1','payroll_export_roster_v1','payroll_document_subject_v1')");
  const before=await probe(),beforeMetadata=await metadata();assert.equal(before.length,3);
  return{schema:qa.schema,destination,before,beforeMetadata,sourceSha256:patch.sourceSha256,probe,metadata,cleanup};
 }catch(e){await cleanup();throw e;}
}

export const periodContextQaSourceFiles=Object.freeze([...new Set([...inheritedSourceFiles,
 'assets/own-payroll-period-context.js','assets/own-payroll-run-workspace-model.js','lib/own-payroll-programme-source-preparation.js',
 'scripts/lib/own-payroll-period-context-consumers.mjs','scripts/lib/own-payroll-period-context-installation.mjs','scripts/lib/own-payroll-period-context-qa.mjs','scripts/lib/own-payroll-period-context-browser.mjs','scripts/migrations/182-own-payroll-period-context.sql',
 'scripts/verify-own-payroll-period-context.mjs','scripts/verify-own-payroll-period-context-browser.mjs','tests/fixtures/own-payroll-period-context-synthetic.js','tests/own-payroll-period-context.test.js','tests/own-payroll-period-context-input.test.js','tests/own-payroll-period-context-installation.test.js','tests/own-payroll-period-context-qa.test.js','tests/own-payroll-programme-source-preparation.test.js','.vercelignore',
 'assets/own-payroll-run-panel.js','assets/own-payroll-run-panel.css','assets/own-payroll-report-panel.js','assets/own-payroll-report-panel.css','assets/own-payroll-report-model.js','api/internal-employment-catalog.js','api/internal-data.js',
 'scripts/lib/own-program-browser-assets.mjs','scripts/verify-own-payroll-program-browser.mjs','tests/own-program-browser-foundation-qa.test.js'
])]);
export function periodContextQaOptions(argv){
 const args={};for(const arg of argv){const m=/^--(major|source-commit|output)=(.+)$/.exec(arg);assert.ok(m&&!Object.hasOwn(args,m[1]),'PERIOD_CONTEXT_QA_ARGUMENT_INVALID');args[m[1]]=m[2];}
 assert.ok(['17','18'].includes(args.major),'PERIOD_CONTEXT_QA_MAJOR_INVALID');assert.match(args['source-commit']??'',/^[a-f0-9]{40}$/,'PERIOD_CONTEXT_QA_SOURCE_INVALID');assert.match(args.output??'',/^verification[\\/][A-Za-z0-9_.-]+$/,'PERIOD_CONTEXT_QA_OUTPUT_INVALID');
 return{major:Number(args.major),sourceCommit:args['source-commit'],output:args.output,transport:'local',browser:'none'};
}
async function guardedOwnedServer(major){
 const expected={17:{pid:5988,start:1792025447,port:55417},18:{pid:34448,start:1792025448,port:55418}}[major];assert.ok(expected);
 const identity=await verifyDocumentaryQaProcess(root,major),runtime=noeliaCircuitRuntime({root,major,transport:'local',browser:'none'});assert.equal(identity.processId,expected.pid,'PERIOD_CONTEXT_QA_SERVER_REPLACED');
 const cimCommand="Get-CimInstance Win32_Process -Filter 'ProcessId="+expected.pid+"' | Select-Object ProcessId,ExecutablePath,@{n='CreationDate';e={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress";
 const cim=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',cimCommand],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(cim.status,0,cim.stderr);
 const process=assertIndependentProcessStart({identity,pidFile:fs.readFileSync(path.join(identity.directory,'postmaster.pid'),'utf8'),cim:JSON.parse(cim.stdout)});assert.equal(process.postmasterStartEpoch,expected.start,'PERIOD_CONTEXT_QA_START_CHANGED');
 const statement="BEGIN READ ONLY;SELECT jsonb_build_object('database',current_database(),'major',current_setting('server_version_num')::int/10000,'port',current_setting('port')::int,'address',host(inet_server_addr()),'neonProject',current_setting('neon.project_id',true),'neonBranch',current_setting('neon.branch_id',true),'otherClients',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()));COMMIT;";
 const r=spawnSync(runtime.executable,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','--no-password','-h','127.0.0.1','-p',String(expected.port),'-U','postgres','-d','own_payroll_run_qa'],{input:statement,encoding:'utf8',windowsHide:true,env:runtime.environment,timeout:15000});assert.equal(r.status,0,r.stderr);const database=JSON.parse(r.stdout.trim());
 assert.equal(database.database,'own_payroll_run_qa');assert.equal(database.major,major);assert.equal(database.port,expected.port);assert.equal(database.address,'127.0.0.1');assert.equal(database.neonProject,null);assert.equal(database.neonBranch,null);assert.equal(database.otherClients,0,'PERIOD_CONTEXT_QA_OTHER_CLIENTS');return{process,database};
}
export async function verifyOwnPayrollPeriodContext(options){
 periodContextQaOptions(['--major='+options.major,'--source-commit='+options.sourceCommit,'--output='+options.output]);assert.ok(!fs.existsSync(options.output),'PERIOD_CONTEXT_QA_OUTPUT_EXISTS');
 const sourceHashes=Object.fromEntries(periodContextQaSourceFiles.map(file=>{const local=read(file),committed=execFileSync('git',['-C',root,'show',options.sourceCommit+':'+file],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(local.replace(/\r\n?/g,'\n'),committed.replace(/\r\n?/g,'\n'),'PERIOD_CONTEXT_QA_SOURCE_CHANGED: '+file);return[file,hash(local)];}));
 const preflight=await guardedOwnedServer(options.major),auditDirectory=path.resolve(options.output+'-independent-audit');assert.ok(!fs.existsSync(auditDirectory));fs.mkdirSync(auditDirectory);
 const audit=(name,value)=>fs.writeFileSync(path.join(auditDirectory,name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});audit('source-and-preflight',{sourceCommit:options.sourceCommit,sourceHashes,preflight,syntheticOnly:true});
 const outerQa=documentaryQaFoundation(options.major),outerDb=documentaryQaBridge(outerQa,options.major),outerBefore=performanceExternalProof(outerDb,outerQa);audit('outer-before',outerBefore);let sentinel,proof,originalFailure,cleanupError;
 try{
  sentinel=await documentaryGuard(options);
  const result=await verifyOwnAgreementWorkingTime({...options,browser:'chromium',continuation:async h=>{proof=await runPeriodContextQa(h,options);return proof;}});assert.equal(result.continuation?.ok,true);assert.ok(proof?.ok);
  assert.deepEqual(await sentinel.probe(),sentinel.before,'PERIOD_CONTEXT_QA_DOCUMENTARY_BYTES_CHANGED');assert.equal(await sentinel.metadata(),sentinel.beforeMetadata,'PERIOD_CONTEXT_QA_DOCUMENTARY_METADATA_CHANGED');
  assert.deepEqual(Object.fromEntries(periodContextQaSourceFiles.map(file=>[file,hash(read(file))])),sourceHashes,'PERIOD_CONTEXT_QA_SOURCES_CHANGED_DURING_RUN');
 }catch(e){originalFailure=e;audit('failure',{error:e.stack,sourceCommit:options.sourceCommit,major:options.major});}
 finally{
  try{await sentinel?.cleanup();}catch(e){cleanupError=e;audit('cleanup-error',{error:e.stack});}
  try{const outerAfter=performanceExternalProof(outerDb,outerQa);audit('outer-after',outerAfter);assert.deepEqual(outerAfter,outerBefore,'PERIOD_CONTEXT_QA_OUTER_STATE_CHANGED');audit('cleanup-conservation',{passed:!cleanupError,allPriorPublicObjectsRowsSequencesPreserved:true,documentarySchemaRemoved:!!sentinel&&!cleanupError});}catch(e){cleanupError??=e;audit('outer-conservation-error',{error:e.stack});}
 }
 let postflight,postflightError;try{postflight=await guardedOwnedServer(options.major);audit('postflight',postflight);assert.deepEqual(postflight,preflight,'PERIOD_CONTEXT_QA_SERVER_IDENTITY_CHANGED');}catch(e){postflightError=e;audit('postflight-error',{error:e.stack});}
 if(originalFailure)throw originalFailure;if(cleanupError)throw cleanupError;if(postflightError)throw postflightError;
 const final={...proof,sourceCommit:options.sourceCommit,sourceHashes,sourceFilesVerified:periodContextQaSourceFiles.length,preflight,postflight,allPriorPublicObjectsRowsSequencesPreserved:true,documentary178:{sources:3,detailLibraryPdfBytesPreserved:true,functionsAndAclPreserved:true,fixtureRemoved:true},municipalAcceptance:false};fs.writeFileSync(path.resolve(options.output,'independent-period-context182-proof.json'),JSON.stringify(final,null,2)+'\n',{flag:'wx'});return final;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1])){try{const r=await verifyOwnPayrollPeriodContext(periodContextQaOptions(process.argv.slice(2)));console.log(JSON.stringify({ok:r.ok,major:r.major,actualSql:true,actualHandlers:true,syntheticOnly:true}));}catch(e){console.error(e.stack);process.exitCode=1;}}

