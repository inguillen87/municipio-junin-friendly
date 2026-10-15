// Explicit local synthetic QA only. This runner never accepts a connection URL.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {noeliaCircuitRuntime} from './lib/noelia-circuit-runtime.mjs';
import {verifyDocumentaryQaProcess} from './lib/adopted-documentary-read-qa.mjs';
import {buildFinalGrhSourceReviewAdmissionInstallation,assertFinalGrhSourceReviewAdmissionDurability} from './lib/final-grh-source-review-admission-installation.mjs';
import {finalReviewAdmissionQaFoundation,relocateFinalReviewAdmissionInstallation,finalReviewAdmissionQaGlobalSnapshot,finalReviewAdmissionQaOptions,finalReviewAdmissionQaTransaction,finalReviewAdmissionQaSeed,finalReviewAdmissionQaDirectoryPredicate,finalReviewAdmissionQaCleanup} from './lib/final-grh-source-review-admission-qa.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const files=['scripts/migrations/183-final-grh-source-review-admission.sql','scripts/lib/final-grh-source-review-admission-installation.mjs','scripts/lib/final-grh-source-review-admission-qa.mjs','scripts/verify-final-grh-source-review-admission.mjs'];

export async function verifyFinalReviewAdmission({major,sourceCommit,output}){
 const processIdentity=await verifyDocumentaryQaProcess(root,major,{transport:'local'}),runtime=noeliaCircuitRuntime({root,major,browser:'none',transport:'local'}),qa=finalReviewAdmissionQaFoundation(major),read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const batch=buildFinalGrhSourceReviewAdmissionInstallation({read,major,sourceCommit}),bookendFiles=[...new Set([...files,...Object.keys(batch.sourceHashes),'scripts/lib/final-contract-adoption-qa.mjs'])],sourceHashes=Object.fromEntries(bookendFiles.map(p=>[p,hash(fs.readFileSync(path.join(root,p)))])),destination=path.resolve(root,output);
 assert.equal(path.dirname(destination),path.join(root,'verification'));assert.equal(fs.existsSync(destination),false,'FINAL_REVIEW_QA_EVIDENCE_EXISTS');fs.mkdirSync(destination);
 const applicationName='mc-fr183:'+qa.schema;assert.ok(Buffer.byteLength(applicationName)<=63);
 const environment={...runtime.environment,PGAPPNAME:applicationName},args=['-X','--quiet','--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port',String(55400+major),'--username','postgres','--dbname','own_payroll_run_qa','--no-password','--tuples-only','--no-align'];
 let step=0,seeded=false,prior,report,local;const checks=[],pass=label=>{checks.push(label);fs.writeFileSync(path.join(destination,'progress.json'),JSON.stringify({checks,checkCount:checks.length},null,2));};
 const run=(sql,expected)=>{
  const file=path.join(destination,String(++step).padStart(3,'0')+'.sql');fs.writeFileSync(file,sql,{flag:'wx'});
  const r=spawnSync(runtime.executable,[...args,'-f',file],{encoding:'utf8',windowsHide:true,env:environment,maxBuffer:12*1024*1024,timeout:180000});fs.writeFileSync(file+'.log',(r.stdout??'')+(r.stderr??''));
  if(expected){assert.equal(r.status,3,r.stderr?.slice(-4500));assert.match(r.stderr??'',expected);return;}
  assert.equal(r.status,0,r.stderr?.slice(-4500));return(r.stdout??'').trim().split(/\r?\n/).filter(Boolean).at(-1);
 };
 const basicGuard=`DO $qa183$ BEGIN ${qa.pins} IF current_user<>'postgres' OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port()<>${55400+major} OR ${finalReviewAdmissionQaDirectoryPredicate(processIdentity.directory)} THEN RAISE EXCEPTION 'FINAL_REVIEW_QA_LOCAL_IDENTITY';END IF;END $qa183$`;
 const tx=(statements,end='COMMIT')=>finalReviewAdmissionQaTransaction({statements,schema:qa.schema,guard:basicGuard,end});
 // Transaction characteristics precede every query, including identity guards.
 // The canonical phase statements remain byte-equal after namespace relocation.
 const protocol=(t,mutation)=>{
  const statements=[...t.statements],index=statements.indexOf(local.destination);assert.ok(index>=0);
  statements.splice(index,0,basicGuard,...(mutation?[mutation]:[]));return`${t.begin};${statements.join(';\n')};${t.completion};`;
 };
 const aggregate=sql=>JSON.parse(run(tx(['SET TRANSACTION READ ONLY',sql])));
 const globalFootprint=()=>aggregate(finalReviewAdmissionQaGlobalSnapshot()+`;SELECT jsonb_build_object('sha256',encode(public.digest(current_setting('municontrol_final_review.after')::jsonb::text,'sha256'),'hex'),'schemaCount',(SELECT count(*) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'))`);
 const tableNames=['grh_final_source_revision','grh_final_source_delta','grh_final_source_seal'];
 const sourceFootprint=(onlyOriginal=false)=>aggregate(`SELECT jsonb_object_agg(table_name,proof) FROM(${tableNames.map(name=>`SELECT ${q(name)} table_name,jsonb_build_object('rows',count(*),'sha256',encode(public.digest(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text COLLATE "C"),''),'sha256'),'hex')) proof FROM ${qa.schema}.${name} t${onlyOriginal?' WHERE '+(name==='grh_final_source_revision'?'id':'revision_id')+'='+q(qa.revision)+'::uuid':''}`).join(' UNION ALL ')}) rows`);
 const managed=()=>aggregate(`SELECT coalesce(jsonb_agg(jsonb_build_object('name',conname,'expression',pg_get_expr(conbin,conrelid,false),'validated',convalidated,'noInherit',connoinherit) ORDER BY conname),'[]') FROM pg_constraint WHERE conrelid=${q(qa.schema+'.grh_final_source_revision')}::regclass AND conname LIKE 'grh_final_source_revision_source_%_check'`);
 const cloneRevision=(tuple,id)=>`INSERT INTO ${qa.schema}.grh_final_source_revision SELECT(jsonb_populate_record(NULL::${qa.schema}.grh_final_source_revision,to_jsonb(original)||jsonb_build_object('id',${q(id)},'source_profile',${q(tuple.profile)},'source_sha256',${q(tuple.sha256)},'source_cutoff',${q(tuple.cutoff)},'package_sha256',repeat('8',64),'created_transaction',txid_current(),'created_at',clock_timestamp()))).* FROM ${qa.schema}.grh_final_source_revision original WHERE id=${q(qa.revision)}::uuid`;
 try{
  const identity=aggregate(`DO $$ BEGIN IF to_regclass('public.employment_contract') IS NOT NULL OR to_regclass('public.grh_final_source_revision') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND(rolsuper OR rolbypassrls)) OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') THEN RAISE EXCEPTION 'FINAL_REVIEW_QA_NOT_DISPOSABLE';END IF;END $$;SELECT jsonb_build_object('databaseOid',(SELECT oid::bigint FROM pg_database WHERE datname=current_database()),'major',current_setting('server_version_num')::int/10000,'database',current_database(),'role',current_user,'host',host(inet_server_addr()),'port',inet_server_port())`);
  assert.equal(identity.major,major);assert.equal(identity.database,'own_payroll_run_qa');assert.equal(identity.role,'postgres');assert.equal(identity.host,'127.0.0.1');assert.equal(identity.port,55400+major);assert.ok(Number.isSafeInteger(identity.databaseOid));pass('existing owned process, loopback/database/role/major/data-directory and non-production public schema verified before fixture writes');
  local=relocateFinalReviewAdmissionInstallation(batch,qa,{read,databaseOid:identity.databaseOid});prior=globalFootprint();
  run(finalReviewAdmissionQaSeed(qa,basicGuard));seeded=true;run(tx([qa.sourceFixture]));const oldRows=sourceFootprint(true),oldChecks=managed();assert.equal(oldRows.grh_final_source_revision.rows,1);assert.equal(oldRows.grh_final_source_seal.rows,1);assert.equal(oldChecks.length,3);pass('canonical144 full synthetic source is sealed with nine original relocated function bodies and three old tuple components');
  const before=JSON.parse(run(protocol({begin:'BEGIN',statements:local.preflight,completion:'COMMIT'})));assert.equal(before.mode,'preflight_before');pass('reviewed preflight validates all source pins, owner-only ACL, exact shape/keys/defaults/constraints and eight triggers');
  const newTuple={profile:'grh-junin-2026-10-14',sha256:'3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4',cutoff:'2026-10-14T15:18:17'};
  run(tx([cloneRevision(newTuple,randomUUID())]),/violates check constraint "grh_final_source_revision_source_(?:profile|sha256|cutoff)_check"/);assert.deepEqual(sourceFootprint(true),oldRows);pass('before183 complete14Oct tuple is rejected by the actual old CHECKs without changing source rows');
  const negatives=[
   ['reader EXECUTE grant',`GRANT EXECUTE ON FUNCTION ${qa.schema}.grh_final_source_rows_v1(uuid,text) TO pg_monitor`,/FINAL_ADOPTION_SOURCE_METADATA/],
   ['table SELECT grant',`GRANT SELECT ON ${qa.schema}.grh_final_source_delta TO pg_monitor`,/FINAL_ADOPTION_SOURCE_PROTECTION|FINAL_REVIEW_TABLE_PROTECTION/],
   ['disabled immutable trigger',`ALTER TABLE ${qa.schema}.grh_final_source_delta DISABLE TRIGGER a_final_revision_guard`,/FINAL_ADOPTION_SOURCE_PROTECTION|FINAL_REVIEW_TRIGGER_SHAPE/],
   ['deferrable foreign key',`DO $$ DECLARE c text;BEGIN SELECT conname INTO STRICT c FROM pg_constraint WHERE conrelid='${qa.schema}.grh_final_source_delta'::regclass AND contype='f';EXECUTE format('ALTER TABLE ${qa.schema}.grh_final_source_delta ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',c);END $$`,/FINAL_REVIEW_CONSTRAINT_FLAGS/],
   ['RLS disabled',`ALTER TABLE ${qa.schema}.grh_final_source_revision DISABLE ROW LEVEL SECURITY`,/FINAL_ADOPTION_SOURCE_PROTECTION|FINAL_REVIEW_TABLE_PROTECTION/],
   ['unexpected column',`ALTER TABLE ${qa.schema}.grh_final_source_delta ADD COLUMN qa_unreviewed text`,/FINAL_REVIEW_COLUMN_SHAPE/],
   ['CHECK not validated',`ALTER TABLE ${qa.schema}.grh_final_source_revision DROP CONSTRAINT grh_final_source_revision_source_profile_check,ADD CONSTRAINT grh_final_source_revision_source_profile_check CHECK(source_profile='grh-junin-2026-10-01') NOT VALID`,/FINAL_REVIEW_CONSTRAINT_FLAGS/],
   ['CHECK no inherit',`ALTER TABLE ${qa.schema}.grh_final_source_revision DROP CONSTRAINT grh_final_source_revision_source_profile_check,ADD CONSTRAINT grh_final_source_revision_source_profile_check CHECK(source_profile='grh-junin-2026-10-01') NO INHERIT`,/FINAL_REVIEW_CONSTRAINT_FLAGS/],
   ['missing tuple component',`ALTER TABLE ${qa.schema}.grh_final_source_revision DROP CONSTRAINT grh_final_source_revision_source_profile_check`,/FINAL_REVIEW_UNREVIEWED_STATE/],
   ['wrong existing CHECK expression',`ALTER TABLE ${qa.schema}.grh_final_source_revision DROP CONSTRAINT grh_final_source_revision_source_profile_check,ADD CONSTRAINT grh_final_source_revision_source_profile_check CHECK(source_profile LIKE 'grh-junin-%')`,/FINAL_REVIEW_CHECK_SHAPE/],
   ['function search path drift',`ALTER FUNCTION ${qa.schema}.grh_final_source_rows_v1(uuid,text) SET search_path=pg_catalog,public,pg_temp`,/FINAL_ADOPTION_SOURCE_METADATA/],
  ];
  for(const[label,mutation,error]of negatives){run(protocol(local.transactions.rehearsal,mutation),error);assert.deepEqual(sourceFootprint(true),oldRows);assert.deepEqual(managed(),oldChecks);pass(label+' is rejected and its entire negative transaction rolls back');}
  const rehearsal=JSON.parse(run(protocol(local.transactions.rehearsal)));assert.equal(rehearsal.mode,'install');assert.deepEqual(managed(),oldChecks);assert.deepEqual(sourceFootprint(true),oldRows);pass('full reviewed installation rehearsal rolls back all CHECK DDL and preserves original rows');
  const installed=JSON.parse(run(protocol(local.transactions.install))),durable=JSON.parse(run(protocol(local.transactions.durable))),repeated=JSON.parse(run(protocol(local.transactions.repeat))),durability=assertFinalGrhSourceReviewAdmissionDurability({installed,durable,repeated,major,sourceCommit});assert.deepEqual(sourceFootprint(true),oldRows);assert.equal(managed().length,1);pass('install, independent read-only durable verification and idempotent repeat pass exact wrapper protocol with old rows unchanged');
  const rollback=JSON.parse(run(protocol(local.guardedRollback)));assert.equal(rollback.mode,'rollback');assert.deepEqual(managed().map(x=>x.name),oldChecks.map(x=>x.name));assert.deepEqual(sourceFootprint(true),oldRows);pass('guarded rollback restores all three exact old CHECKs when no14Oct review exists');
  const second=JSON.parse(run(protocol(local.transactions.install))),secondDurable=JSON.parse(run(protocol(local.transactions.durable))),secondRepeat=JSON.parse(run(protocol(local.transactions.repeat)));assertFinalGrhSourceReviewAdmissionDurability({installed:second,durable:secondDurable,repeated:secondRepeat,major,sourceCommit});pass('reinstallation after genuine rollback passes installation/read-only/repeat with no source pointer or business write');
  const oldTuple={profile:'grh-junin-2026-10-01',sha256:'50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f',cutoff:'2026-10-01T15:17:29'};
  for(let mask=1;mask<7;mask++){
   const tuple=Object.fromEntries(['profile','sha256','cutoff'].map((key,i)=>[key,(mask&(1<<i)?newTuple:oldTuple)[key]]));run(tx([cloneRevision(tuple,randomUUID())]),/violates check constraint "grh_final_source_revision_source_tuple_check"/);assert.deepEqual(sourceFootprint(true),oldRows);pass('mixed source tuple '+mask+' is rejected atomically with original144 guards intact');
  }
  const newRevision=randomUUID();run(tx([cloneRevision(newTuple,newRevision),`INSERT INTO ${qa.schema}.grh_final_source_delta SELECT ${q(newRevision)}::uuid,entity,row_key,operation,previous_record,record,source_payload FROM ${qa.schema}.grh_final_source_delta WHERE revision_id=${q(qa.revision)}::uuid`,`INSERT INTO ${qa.schema}.grh_final_source_seal(revision_id,fingerprints) SELECT ${q(newRevision)}::uuid,fingerprints FROM ${qa.schema}.grh_final_source_seal WHERE revision_id=${q(qa.revision)}::uuid`,`SET CONSTRAINTS ${qa.schema}.final_revision_seal_at_commit IMMEDIATE`]));assert.deepEqual(sourceFootprint(true),oldRows);assert.equal(sourceFootprint().grh_final_source_revision.rows,2);pass('exact14Oct tuple can append a separately sealed synthetic review through unchanged144 parent/evidence/immutability guards');
  const both=sourceFootprint(),newChecks=managed();run(protocol(local.guardedRollback),/FINAL_REVIEW_ROLLBACK_NEW_SOURCE_EXISTS/);assert.deepEqual(sourceFootprint(),both);assert.deepEqual(managed(),newChecks);pass('rollback refuses existing14Oct review, preserving both reviews and the new constraint without deleting anything');
  const preserved=JSON.parse(run(protocol(local.transactions.repeat)));assert.equal(preserved.mode,'repeat');assert.deepEqual(sourceFootprint(),both);pass('repeat with both reviews is read-only for source rows, metadata and all business data');
  report={ok:true,version:'final-grh-source-review-admission-qa.v1',sourceCommit,sourceState:'reviewed-local-candidate',sourceHashes,major,processIdentity,schema:qa.schema,transport:'existing-loopback-only',productionCompatible:false,checks,checkCount:checks.length,actualSql:true,actualCanonical144:true,actualReviewedInstallation:true,relocation:local.relocation,sourceCounts:{originalRevisions:1,appendedSyntheticRevisions:1,originalDeltaRows:oldRows.grh_final_source_delta.rows},durability,phases:{rehearsal,installed,durable,repeated,rollback,second,secondDurable,secondRepeat,preserved},sourceActivated:false,municipalAdoption:false,businessWrites:false,productionWrites:false,nominalDataReturned:false};
 }catch(error){fs.writeFileSync(path.join(destination,'failure.json'),JSON.stringify({ok:false,sourceCommit,sourceHashes,major,checks,error:{message:error.message,stack:error.stack}},null,2));throw error;}
 finally{
  if(seeded){
   try{run(tx(finalReviewAdmissionQaCleanup(qa.schema)));assert.deepEqual(globalFootprint(),prior,'FINAL_REVIEW_QA_OUTSIDE_SCOPE_CHANGED');if(report)report.cleanup={schemaAbsent:true,allPriorRowsMetadataAndRolesUnchanged:true,externalDependenciesRejected:true};}
   catch(error){fs.writeFileSync(path.join(destination,'cleanup-failure.json'),JSON.stringify({ok:false,error:error.message},null,2));throw error;}
  }
  for(const file of bookendFiles)assert.equal(hash(fs.readFileSync(path.join(root,file))),sourceHashes[file],'FINAL_REVIEW_QA_SOURCE_CHANGED');
 }
 fs.writeFileSync(path.join(destination,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await verifyFinalReviewAdmission(finalReviewAdmissionQaOptions(process.argv.slice(2)));console.log(JSON.stringify({ok:report.ok,major:report.major,checkCount:report.checkCount,cleanup:report.cleanup,productionWrites:false}));
}
