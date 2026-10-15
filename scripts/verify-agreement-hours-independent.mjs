// Independent release QA. Existing owned loopback servers; invented fixtures only.
// Imports and option parsing never connect. No production transport is supported.
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
const sourceFiles=['scripts/migrations/176-own-payroll-administrative-operator.sql','scripts/migrations/177-own-period-classification.sql','scripts/migrations/178-adopted-documentary-read.sql','scripts/migrations/179-own-agreement-working-time.sql','scripts/migrations/180-own-agreement-working-time-program.sql','scripts/lib/own-agreement-working-time-consumers.mjs','scripts/lib/own-agreement-working-time-installation.mjs','scripts/lib/own-agreement-working-time-qa-relocation.mjs','scripts/verify-own-agreement-working-time.mjs','assets/own-agreement-working-time-model.js','assets/own-agreement-working-time-program.js','assets/own-payroll-program-model.js','assets/own-payroll-run-model.js','lib/own-payroll-approved-input.js','lib/internal-own-payroll-run.js','assets/own-payroll-program-panel.js','assets/own-payroll-program-workspace-model.js','assets/own-payroll-report-variables.js','assets/payroll-navigation.js','lib/own-period-read-recovery.js','scripts/build-friendly.mjs','api/internal-own-agreement-working-time.js','assets/own-agreement-working-time-panel.css','assets/own-agreement-working-time-panel.js','assets/own-agreement-working-time-workspace.js','lib/internal-own-agreement-working-time.js','scripts/lib/own-agreement-working-time-browser.mjs','tests/fixtures/own-agreement-working-time-synthetic.js','tests/own-agreement-working-time-api.test.js','tests/own-agreement-working-time-input.test.js','tests/own-agreement-working-time-workspace.test.js','tests/own-agreement-working-time.test.js'];
sourceFiles.push('scripts/lib/own-agreement-working-time-catalog-qa.mjs','scripts/lib/classification-registration-use-installation.mjs','scripts/lib/classification-registration-use-pins.mjs','scripts/lib/adoption-administrative-identity-installation.mjs','scripts/migrations/167-classification-registration-use.sql');
sourceFiles.push('api/internal-own-period-classification.js','tests/own-period-classification-api.test.js','tests/own-period-read-recovery-delay.test.js');
export function agreementIndependentOptions(argv){
 const values={};for(const arg of argv){const match=/^--(major|source-commit|output)=(.+)$/.exec(arg);assert.ok(match&&!Object.hasOwn(values,match[1]),'INDEPENDENT_QA_ARGUMENT_INVALID');values[match[1]]=match[2];}
 assert.ok(['17','18'].includes(values.major),'INDEPENDENT_QA_MAJOR_INVALID');assert.match(values['source-commit']??'',/^[a-f0-9]{40}$/,'INDEPENDENT_QA_SOURCE_INVALID');
 assert.match(values.output??'',/^verification[\\/][A-Za-z0-9_.-]+$/,'INDEPENDENT_QA_OUTPUT_INVALID');
 return{major:Number(values.major),sourceCommit:values['source-commit'],output:values.output,transport:'local',browser:'chromium'};
}
export function assertIndependentProcessStart({identity,pidFile,cim}){
 const lines=pidFile.split(/\r?\n/);assert.equal(Number(lines[0]),identity.processId,'INDEPENDENT_QA_PID_CHANGED');
 assert.equal(path.resolve(lines[1]).toLowerCase(),path.resolve(identity.directory).toLowerCase(),'INDEPENDENT_QA_DATA_DIRECTORY_CHANGED');
 assert.equal(cim.ProcessId,identity.processId);assert.equal(fs.realpathSync(cim.ExecutablePath).toLowerCase(),fs.realpathSync(identity.executable).toLowerCase());
 const epoch=Number(lines[2]),created=Date.parse(cim.CreationDate)/1000;assert.ok(Number.isSafeInteger(epoch)&&epoch>0&&Number.isFinite(created)&&Math.abs(created-epoch)<3,'INDEPENDENT_QA_START_CHANGED');
 return{processId:identity.processId,postmasterStartEpoch:epoch,processCreatedAt:new Date(created*1000).toISOString(),executable:identity.executable,directory:identity.directory};
}
async function ownedServer(major){
 const identity=await verifyDocumentaryQaProcess(root,major),runtime=noeliaCircuitRuntime({root,major,transport:'local',browser:'chromium'});
 const command="$ErrorActionPreference='Stop';Get-CimInstance Win32_Process -Filter 'ProcessId="+identity.processId+"'|Select-Object ProcessId,ExecutablePath,@{n='CreationDate';e={$_.CreationDate.ToUniversalTime().ToString('o')}}|ConvertTo-Json -Compress";
 const processResult=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(processResult.status,0,processResult.stderr);
 const start=assertIndependentProcessStart({identity,pidFile:fs.readFileSync(path.join(identity.directory,'postmaster.pid'),'utf8'),cim:JSON.parse(processResult.stdout)});
 const sql="BEGIN READ ONLY;SET LOCAL statement_timeout='5s';SELECT jsonb_build_object('database',current_database(),'role',current_user,'major',current_setting('server_version_num')::int/10000,'address',host(inet_server_addr()),'port',inet_server_port(),'startEpoch',floor(extract(epoch FROM pg_postmaster_start_time()))::bigint,'neonProject',current_setting('neon.project_id',true),'neonBranch',current_setting('neon.branch_id',true),'otherClients',(SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()));ROLLBACK;";
 const r=spawnSync(runtime.executable,['-X','-A','-t','-q','-v','ON_ERROR_STOP=1','--no-password','-h','127.0.0.1','-p',String(identity.port),'-U','postgres','-d','own_payroll_run_qa','-c',sql],{encoding:'utf8',windowsHide:true,timeout:15000,env:runtime.environment});assert.equal(r.status,0,r.stderr);
 const proof=JSON.parse(r.stdout.trim().split(/\r?\n/).find(line=>line.startsWith('{')));assert.equal(proof.database,'own_payroll_run_qa');assert.equal(proof.role,'postgres');assert.equal(proof.major,major);assert.equal(proof.address,'127.0.0.1');assert.equal(proof.port,identity.port);assert.equal(proof.startEpoch,start.postmasterStartEpoch);assert.ok(proof.neonProject===null||proof.neonProject==='');assert.ok(proof.neonBranch===null||proof.neonBranch==='');assert.equal(proof.otherClients,0,'INDEPENDENT_QA_OTHER_CLIENTS');
 return{...identity,...start,otherClients:0,readOnlyPreflight:true};
}

// A sibling178 foundation remains present throughout179/180. Thus the technical
// protocol must conserve actual documentary functions/data in addition to176/177.
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
  const lines=data.lines.map(({code,amount,quantity,agreement})=>({code,amount,quantity,agreement}));const datasetId=randomUUID(),passphrase='independent-synthetic-'+randomUUID(),payload={version:'payroll-detail-source.v1',sourceSha256:'a'.repeat(64),sourceDatabase:'qa_fixed_source',company:101,sourceLabel:'Fuente documental exclusivamente sintética QA201',date:'2026-09-30',period:2026,month:9,type:'M',closedFlag:1,concepts,statements:originals.map(x=>({legajo:x.number,lines}))},plain=JSON.stringify(payload);
  const delivered=execute(tx([`CREATE TEMP TABLE qa_cipher AS SELECT public.pgp_sym_encrypt_bytea(convert_to(${q(plain)},'UTF8'),${q(passphrase)},'compress-algo=1,cipher-algo=aes256') AS value`,`INSERT INTO payroll_detail_delivery_job(id,tenant_id,source_binding_id,source_sha256,cipher_sha256,payload_sha256,passphrase,payload_bytes,statement_count,line_count,requested_by,expires_at) SELECT ${q(datasetId)}::uuid,${q(qa.ids.tenant)}::uuid,${q(qa.ids.binding)}::uuid,${q(payload.sourceSha256)},encode(public.digest(value,'sha256'),'hex'),encode(public.digest(convert_to(${q(plain)},'UTF8'),'sha256'),'hex'),${q(passphrase)},octet_length(convert_to(${q(plain)},'UTF8')),3,${lines.length*3},${q(qa.ids.maker)}::uuid,clock_timestamp()+interval '1 hour' FROM qa_cipher`,`SELECT payroll_detail_delivery_v1(${q(datasetId)}::uuid,(SELECT value FROM qa_cipher))`]));assert.equal(delivered.statements,3);
  const actor=qa.actors.maker,principal={user:{email:actor.actorEmail},tenant:{source:'membership',id:actor.tenantId,membershipId:actor.membershipId,effectiveCapabilities:[...qa.caps,'payroll.read']}},session={email:actor.actorEmail,id:actor.actorSessionId,version:actor.actorSessionVersion,releaseSha:actor.releaseSha};
  const probe=async()=>{const rows=[];for(const p of originals){const d=await employeePayrollDetail(db,{query:{resource:'employeepayrolldetail',contractId:p.id,date:'2026-09-30',type:'M',period:'2026',month:'9'}},principal,session),l=await employeePayrollDocuments(db,{query:{resource:'employeepayrolldocuments',contractId:p.id}},principal,session);assert.equal(d.status,200);assert.equal(l.status,200);const pdf=createPayrollDetailPdf(createPayrollDetailModel(d.payload.data,{contractId:p.id,name:p.name,legajo:p.number}));rows.push({detailSha256:hash(JSON.stringify(d.payload.data)),librarySha256:hash(JSON.stringify(l.payload.data)),pdfSha256:hash(pdf)});}return rows;};
  const metadata=()=>db.run("SELECT to_jsonb(encode(public.digest(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]')::text,'sha256'),'hex')) FROM pg_proc p WHERE p.pronamespace="+q(qa.schema)+"::regnamespace AND p.proname IN('employee_payroll_detail_v1','employee_payroll_documents_v1','payroll_export_roster_v1','payroll_document_subject_v1')");
  const before=await probe(),beforeMetadata=await metadata();assert.equal(before.length,3);
  return{schema:qa.schema,destination,before,beforeMetadata,sourceSha256:patch.sourceSha256,probe,metadata,cleanup};
 }catch(e){await cleanup();throw e;}
}

function frozenRows(h){
 const names=[['own_payroll_run_capture','id'],['own_payroll_run_result','capture_id'],['own_payroll_close_event','id'],['own_payroll_receipt_event','id']];
 return Promise.all(names.map(async([table,key])=>({table,key,ids:await h.db.run('SELECT coalesce(jsonb_agg('+key+' ORDER BY '+key+'),\'[]\'::jsonb) FROM '+table)})));
}
async function protectedState(h,rows){
 const out={};for(const r of rows){const ids='ARRAY['+r.ids.map(v=>q(v)+'::uuid').join(',')+']::uuid[]';out[r.table]=await h.db.run("SELECT jsonb_build_object('count',count(*),'sha256',encode(public.digest(coalesce(jsonb_agg(to_jsonb(t) ORDER BY "+r.key+"),'[]')::text,'sha256'),'hex')) FROM "+r.table+' t WHERE '+r.key+'=ANY('+ids+')');}
 out.administrativeContext176=await h.db.run("SELECT to_jsonb(encode(public.digest(to_jsonb(p)::text,'sha256'),'hex')) FROM pg_proc p WHERE p.oid="+q(h.qa.schema+'.native_salary_administrative_context_v1(jsonb)')+'::regprocedure');return out;
}
export async function verifyAgreementHoursIndependent(options){
 const {major,sourceCommit,output}=options;agreementIndependentOptions(['--major='+major,'--source-commit='+sourceCommit,'--output='+output]);assert.ok(!fs.existsSync(output));
 const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,hash(read(file))]));const committedSourceHashes=Object.fromEntries(sourceFiles.map(file=>{const committed=execFileSync('git',['-C',root,'show',sourceCommit+':'+file],{maxBuffer:16*1024*1024}).toString('utf8');assert.equal(read(file).replace(/\r\n?/g,'\n'),committed.replace(/\r\n?/g,'\n'),'INDEPENDENT_QA_COMMITTED_SOURCE_CHANGED: '+file);return[file,hash(committed)];})),preflight=await ownedServer(major);
 const {verifySalaryConditionsProgram}=await import('./verify-own-salary-conditions-program.mjs');const {runOwnPayrollAdministrativeOperatorQa}=await import('./lib/own-payroll-administrative-operator-qa.mjs');const {runOwnPeriodClassificationQa}=await import('./lib/own-period-classification-qa.mjs');const {finalAdoptedHistory}=await import('./lib/own-period-classification-final-qa.mjs');const {runOwnAgreementWorkingTimeQa}=await import('./verify-own-agreement-working-time.mjs');assert.equal(typeof runOwnAgreementWorkingTimeQa,'function');
 const auditDestination=path.resolve(output+'-independent-audit');assert.ok(!fs.existsSync(auditDestination));fs.mkdirSync(auditDestination);
 const audit=(name,value)=>fs.writeFileSync(path.join(auditDestination,name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 audit('source-and-preflight',{sourceCommit,sourceHashes,committedSourceHashes,preflight,syntheticOnly:true});
 const outerQa=documentaryQaFoundation(major),outerDb=documentaryQaBridge(outerQa,major),priorOuter=performanceExternalProof(outerDb,outerQa);audit('outer-before',priorOuter);let documentary,proof;
 try{
  documentary=await documentaryGuard(options);
  const result=await verifySalaryConditionsProgram({...options,transport:'local',browser:'none',continuation:async h=>{
   const administrative=await runOwnPayrollAdministrativeOperatorQa(h);assert.equal(administrative.ok,true);audit('administrative176',administrative);
   const classification=await runOwnPeriodClassificationQa(h,{browser:'chromium',finalAdoptedFixture:args=>finalAdoptedHistory({...args,major,transport:'local'})});assert.equal(classification.ok,true);assert.equal(classification.finalProof.historicalCaptureConfirmedClosedReceipt,true);assert.equal(classification.finalProof.inactive,55);audit('classification177',classification);
   const consumerMetadata=await h.db.run("SET TRANSACTION READ ONLY;SELECT jsonb_agg(jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,'proconfig',p.proconfig,'bodySha256',encode(public.digest(p.prosrc,'sha256'),'hex'),'metadataSha256',encode(public.digest((to_jsonb(p)-'prosrc')::text,'sha256'),'hex')) ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace="+q(h.qa.schema)+"::regnamespace AND p.proname IN('own_program_definition_v1','own_program_command_v1','own_run_capture_v1','municipal_adoption_ready_v1')");
   assert.equal(consumerMetadata.length,4);audit('consumer-metadata-before179180',consumerMetadata);
   const rows=await frozenRows(h);assert.ok(rows.every(r=>r.ids.length>0),'INDEPENDENT_PRIOR_SAVED_STATE_REQUIRED');const old=await protectedState(h,rows);
   const agreement=await runOwnAgreementWorkingTimeQa(h,{...options,browser:'chromium',continuation:async next=>{
    assert.deepEqual(await protectedState(next,rows),old,'INDEPENDENT_EXISTING_CAPTURES_CLOSES_RECEIPTS_CHANGED');
    const a=next.agreementWorkingTime;assert.equal(a.batch.capture177Preserved,true);assert.equal(a.run.saved.input.employees.length,a.employees.length);assert.ok(a.run.saved.input.employees.every(e=>e.inputs.some(i=>i.key==='agreementMonthlyHours'&&i.value==='160.25000001')));assert.ok(a.run.saved.input.employees.some(e=>e.inputs.find(i=>i.key==='contractMonthlyHours')?.value!=='160.25000001'));
    const again=await next.api('run',{query:{resource:'attempt',key:a.run.key}});assert.deepEqual(again.payload,a.run.payload);assert.deepEqual(again.saved,a.run.saved);
    return{passed:true,separateApprovedHourSources:true,unchangedAttempt:true,oldSnapshotCounts:Object.fromEntries(rows.map(r=>[r.table,r.ids.length])),oldSnapshotsAndContext176Preserved:true,protocol:a.proof};
   }});
   assert.equal(await documentary.metadata(),documentary.beforeMetadata,'INDEPENDENT_DOCUMENTARY178_METADATA_CHANGED');
   assert.equal(administrative.state,'verified');assert.equal(classification.state,'verified');assert.equal(agreement.passed,true);
   proof={version:'agreement-hours-independent-qa.v1',state:'verified',passed:true,major,sourceCommit,sourceHashes,committedSourceHashes,committedSourcesVerifiedWithExplicitLineEndingNormalization:true,preflight,administrative,classification,agreement,actualSql:true,actualHandlers:true,actualBrowser:true,documentary178InstalledDuring179180:true,nominalRowsReturnedInPublicProof:0,municipalBusinessWrites:0,syntheticOnly:true};return proof;
  }});
  assert.equal(result.continuation?.state,'verified');assert.ok(proof?.passed);assert.deepEqual(await documentary.probe(),documentary.before,'INDEPENDENT_ORIGINAL_DOCUMENTS_CHANGED');assert.equal(await documentary.metadata(),documentary.beforeMetadata);
  proof.documentary={originalDocuments:3,sourceSha256:documentary.sourceSha256,functionsAndAclUnchanged:true,detailLibraryAndPdfBytesUnchanged:true};
  assert.deepEqual(Object.fromEntries(sourceFiles.map(file=>[file,hash(read(file))])),sourceHashes,'INDEPENDENT_SOURCE_CHANGED_DURING_QA');
 }catch(error){audit('failure',{state:'failed',sourceCommit,major,error:String(error.stack??error),syntheticOnly:true});throw error;
 }finally{await documentary?.cleanup();const finalOuter=performanceExternalProof(outerDb,outerQa);audit('outer-after',finalOuter);const matched=JSON.stringify(finalOuter)===JSON.stringify(priorOuter);audit('cleanup-conservation',{matched,syntheticDocumentarySchemaRemoved:!!documentary,scope:'all pre-existing database objects and rows including leave, reader bodies, attributes, indexes and materialized rows'});assert.deepEqual(finalOuter,priorOuter,'INDEPENDENT_QA_PRIOR_GLOBAL_STATE_CHANGED');}
 proof.postflight=await ownedServer(major);assert.equal(proof.postflight.processCreatedAt,preflight.processCreatedAt);proof.documentary.syntheticSchemaRemoved=true;
 proof.outerConservation={passed:true,auditDestination:path.relative(root,auditDestination),leaveExcluded:false,readerBodiesExcluded:false,allPriorAttributesIndexesAndMaterializedRowsIncluded:true};
 fs.writeFileSync(path.resolve(output,'independent-agreement-hours-proof.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});return proof;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await verifyAgreementHoursIndependent(agreementIndependentOptions(process.argv.slice(2)));console.log(JSON.stringify({passed:result.passed,major:result.major,actualSql:true,actualBrowser:true,syntheticOnly:true}));}catch(e){console.error(e.stack);process.exitCode=1;}
}
