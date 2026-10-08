// Real PostgreSQL regression using fictional records in an isolated QA schema.
// A fixed loopback connection and QA database are checked before any DDL.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {loaderQaSetup,loaderQaTarget} from '../tests/fixtures/successor-loader-postgres.js';
import {finalRevisionPackage} from '../tests/fixtures/final-source-revision-synthetic.js';
import {prepareFinalSourceRevisionWithinTransaction,FINAL_SOURCE_REVISION_SCHEMA_URL} from './lib/grh-final-source-revision.mjs';
import {executeFinalSourceRevision} from './prepare-grh-final-source-revision.mjs';
import {addFinalConservationQaTables} from '../tests/fixtures/final-source-conservation-postgres.js';
import {CONTINUITY_FOREIGN_KEYS_SQL} from './lib/grh-successor-continuity.mjs';
import {inspectMunicipalConservationWithinTransaction,compareMunicipalFootprints} from './lib/grh-municipal-footprint.mjs';
import {bindFinalSourceConsumersWithinTransaction} from './lib/grh-final-source-consumers.mjs';
import {prepareFinalContractTransitionWithinTransaction,summarizeFinalContractTransition} from './lib/grh-final-contract-transition.mjs';
import {addFinalTransitionQaLinks,finalTransitionQaPackage} from '../tests/fixtures/final-contract-transition-postgres.js';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const match=/^--(expected-major|port|database|data-directory|pg-driver|output)=(.+)$/.exec(arg);assert.ok(match,'Unknown QA option');return [match[1],match[2]];}));
const major=Number(args['expected-major']),port=Number(args.port);
assert.ok([17,18].includes(major));assert.ok(Number.isSafeInteger(port)&&port>=1024&&port<=65535);
const database=args.database??'final_source_revision_qa';
assert.ok(['final_source_revision_qa','own_payroll_run_qa'].includes(database),'QA database required');
if(database==='own_payroll_run_qa')assert.ok(args['data-directory'],'Existing local QA requires its exact data directory');
const root=fs.realpathSync(path.resolve(import.meta.dirname,'..')),schema='grh_final_revision_qa_'+major;
const driver=fs.realpathSync(args['pg-driver']??'');
assert.equal(path.basename(driver),'index.js');assert.equal(path.basename(path.dirname(driver)),'lib');
assert.equal(JSON.parse(fs.readFileSync(path.resolve(path.dirname(driver),'../package.json'),'utf8')).version,'8.16.3');
const output=path.resolve(args.output??'verification/final-source-revision-pg'+major+'.json');
assert.ok(output.startsWith(path.join(root,'verification')+path.sep),'QA output must remain in verification');
const expectedData=args['data-directory']?fs.realpathSync(args['data-directory']):null;
if(expectedData)assert.ok(expectedData.toLowerCase().startsWith(path.join(root,'verification') .toLowerCase()+path.sep));
const password=process.env.FINAL_SOURCE_QA_PASSWORD??'';
for(const name of Object.keys(process.env))if(/^PG/i.test(name))delete process.env[name];
const {default:pg}=await import(pathToFileURL(driver));
const connection={host:'127.0.0.1',port,database,user:'postgres',password,ssl:false,
 application_name:'municontrol-final-source-synthetic-qa',connectionTimeoutMillis:10000,query_timeout:30000};
let raw=new pg.Client(connection),created=false,namespace=null;
const target={...loaderQaTarget,databaseName:database},checks=[];
const normalized=sql=>sql.replaceAll('public.',schema+'.')
 .replaceAll("'public'::regnamespace","'"+schema+"'::regnamespace")
 .replaceAll("n.nspname='public'","n.nspname='"+schema+"'")
 .replaceAll("np.nspname='public'","np.nspname='"+schema+"'")
 .replace('CREATE SCHEMA grh_effective_qa_curated;','')
 .replace(/search_path=([a-z_,0-9]+)/g,(_,value)=>{
  const tokens=value.split(',');assert.ok(tokens.every(t=>['pg_catalog','public','pg_temp','grh_effective_qa_curated',schema].includes(t)));
  return 'search_path='+[...new Set(tokens.flatMap(t=>t==='public'?[schema,'public']:t==='grh_effective_qa_curated'?[schema]:[t]))].join(',');
 }).replaceAll(schema+'.digest','public.digest');
const query=async(sql,values)=>{const result=await raw.query(normalized(sql),values);
 if(sql===CONTINUITY_FOREIGN_KEYS_SQL)result.rows=result.rows.map(r=>({...r,
  child_schema:r.child_schema===schema?'public':r.child_schema==='public'?'qa_external_public':r.child_schema,
  parent_schema:r.parent_schema===schema?'public':r.parent_schema==='public'?'qa_external_public':r.parent_schema}));
 return result;};
const ok=(value,label)=>{assert.ok(value,label);checks.push(label);};
const identity=async()=>{
 const r=(await raw.query("SELECT current_database() AS db,current_setting('server_version_num')::integer/10000 AS major,current_setting('data_directory') AS data,current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch")).rows[0];
 assert.equal(r.db,database);assert.equal(r.major,major);assert.ok(!r.project&&!r.branch,'No hosted source target');
 if(expectedData)assert.equal(fs.realpathSync(r.data).toLowerCase(),expectedData.toLowerCase());
};
const context=()=>raw.query(`SELECT set_config('neon.project_id',$1,false),set_config('neon.branch_id',$2,false)`,[target.projectId,target.branchId]);
async function footprint(scope){
 assert.ok([schema,'public'].includes(scope));
 const tables=(await raw.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[scope])).rows;
 const proof={};for(const {tablename} of tables){
  assert.match(tablename,/^[a-z_][a-z_0-9]*$/);
  if(scope===schema&&tablename.startsWith('grh_final_source_'))continue;
  proof[tablename]=(await raw.query(`SELECT count(*)::integer AS rows,md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')) AS digest FROM ${scope}.${tablename} r`)).rows[0];
 }return proof;
}
async function denied(action,code){
 await raw.query('SAVEPOINT expected_rejection');try{
  await assert.rejects(action,e=>e.message.includes(code)||e.code===code);checks.push('rejected '+code);
 }finally{await raw.query('ROLLBACK TO SAVEPOINT expected_rejection');}
}
async function consumerRead(revision,pack,label){
 const reader=await bindFinalSourceConsumersWithinTransaction({client:{query},target,revisionId:revision,expectedPackageSha256:pack.payloadSha256});
 await assert.rejects(reader.assertComplete(),{code:'GRH_FINAL_CONSUMER_INCOMPLETE'});
 let total=0;const observed={};
 for(const entity of Object.keys(pack.entities)){
  let count=0;for await(const row of reader.readRows(entity,{pageSize:2})){
   assert.equal(row.contextSha256,reader.context.contextSha256);assert.equal(row.entity,entity);assert.equal(typeof row.recordJson,'string');
   count++;total++;
  }assert.equal(count,pack.entities[entity].candidate.rows);observed[entity]=count;
 }
 const receipt=await reader.assertComplete();assert.deepEqual(receipt.counts,observed);assert.equal(receipt.entities,10);
 assert.equal(receipt.sourceSelected,false);assert.equal(receipt.municipalWrites,0);
 ok(total===Object.values(pack.entities).reduce((n,e)=>n+e.candidate.rows,0),label+' consumes all ten final sets through actual SQL cursors');
 ok((await query("SELECT count(*)::integer AS n FROM pg_cursors WHERE name LIKE 'mc_final_consumer_%'")).rows[0].n===0,label+' closes every server cursor');
 return reader;
}
try{
 await raw.connect();await identity();await raw.query("SET TIME ZONE 'UTC'");
 assert.equal((await raw.query('SELECT to_regnamespace($1) IS NULL AS absent',[schema])).rows[0].absent,true);
 const original=await footprint('public');
 if(database==='own_payroll_run_qa'){
  // The approved fixture may create these in a fresh CI database; never add them to an existing local database.
  assert.ok((await raw.query("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') AND EXISTS(SELECT 1 FROM pg_extension WHERE extname='pgcrypto') AS ready")).rows[0].ready);
 }
 let setup=normalized(loaderQaSetup(major));assert.ok(setup.startsWith('BEGIN;'));
 setup=setup.replace('BEGIN;',`BEGIN ISOLATION LEVEL SERIALIZABLE;CREATE SCHEMA ${schema};SET LOCAL search_path=${schema},public,pg_temp;`)
  .replace("current_database()<>'successor_stage_qa'",`current_database()<>'${database}'`)
  .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;');
 assert.equal(setup.split('SET CONSTRAINTS ALL IMMEDIATE; COMMIT;').length,2);
 setup=setup.replace('SET CONSTRAINTS ALL IMMEDIATE; COMMIT;','SET CONSTRAINTS ALL IMMEDIATE;');
 await raw.query(setup);created=true;
 await addFinalConservationQaTables(query,target);
 await addFinalTransitionQaLinks(query);
 namespace=(await raw.query('SELECT oid::text AS oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].oid;
 const baseline=await footprint(schema),pack=await finalRevisionPackage();
 const base={client:{query},prepared:pack,target,expectedPackageSha256:pack.payloadSha256,installSchema:false};
 await raw.query('COMMIT');
 let released=0;const connect=async()=>({query,release(){released++;}});
 const rehearsal=await executeFinalSourceRevision({...base,connect,installSchema:true});
 ok(rehearsal.rolledBack&&!rehearsal.committed,'maintenance rehearsal rolls back its own transaction');
 ok((await query("SELECT to_regclass('public.grh_final_source_revision') IS NULL AS absent")).rows[0].absent,'rehearsal removes its new schema and leaves no revision');
 await query(fs.readFileSync(FINAL_SOURCE_REVISION_SCHEMA_URL,'utf8'));
 await raw.query(`BEGIN ISOLATION LEVEL SERIALIZABLE;SET LOCAL search_path=${schema},public,pg_temp`);
 await raw.query('SAVEPOINT candidate_empty');
 let first=await prepareFinalSourceRevisionWithinTransaction(base);
 ok(first.municipalConservation.tables===86&&first.municipalConservation.preserved,'all 86 municipal domains preserved, including adoption');
 const scopeProof=await inspectMunicipalConservationWithinTransaction({client:{query},target});
 for(const table of ['employment_adoption_proposal','employment_adoption_decision','employment_adoption_seal','employment_adoption_application']){
  ok(scopeProof.entities[table].rows===1,'other municipality excluded from '+table);
  const initial=await footprint(schema);let changed=false;
  const tamperingClient={async query(text,values){const result=await query(text,values);
   if(!changed&&text.startsWith('SELECT public.grh_final_source_parent_v1')){
    changed=true;await query(`UPDATE public.${table} SET synthetic='changed same-count record' WHERE id='03030303-0303-4303-8303-030303030301'::uuid`);
   }return result;}};
  await assert.rejects(prepareFinalSourceRevisionWithinTransaction({...base,client:tamperingClient}),{code:'GRH_FINAL_REVISION_MUNICIPAL_PRESERVATION'});
  assert.ok(changed);assert.deepEqual(await footprint(schema),initial);checks.push('same-count '+table+' mutation rejected and rolled back');
 }
 await raw.query('SAVEPOINT other_municipality');
 await query("UPDATE public.employment_adoption_application SET synthetic='other municipality fixture' WHERE id='03030303-0303-4303-8303-030303030302'::uuid");
 const otherProof=await inspectMunicipalConservationWithinTransaction({client:{query},target});
 ok(compareMunicipalFootprints(scopeProof,otherProof).preserved,'other municipality data does not enter the target footprint');
 await raw.query('ROLLBACK TO SAVEPOINT other_municipality');
 ok(first.entities===10&&first.deltaRows===410&&!first.operationalSourceChanged,'ten domains and 410 differences without selection');
 const consumer=await consumerRead(first.revisionId,pack,'serializable preparation');
 const comparison=await prepareFinalContractTransitionWithinTransaction({client:{query},target,revisionId:first.revisionId,expectedPackageSha256:pack.payloadSha256});
 ok(comparison.rows.length===3&&comparison.cohort.missing_core_keys===2&&comparison.reviewRequired,'transition preserves all final employees and exposes the existing fixture core gaps');
 ok(comparison.rows.filter(r=>r.issues.includes('CONTRACT_NOT_FOUND')).length===2,'transition does not create UUIDs for missing canonical contracts');
 ok(comparison.rows.find(r=>r.contract_id!==null).issues.includes('PERSON_FACTS_CHANGED'),'transition does not silently replace current personal identity');
 await assert.rejects(bindFinalSourceConsumersWithinTransaction({client:{query},target,revisionId:first.revisionId,expectedPackageSha256:'0'.repeat(64)}),{code:'GRH_FINAL_CONSUMER_CONTEXT'});
 checks.push('consumer rejects another package despite a valid sealed revision');
 await query('SAVEPOINT consumer_authority');
 await query('UPDATE public.platform_tenant_source_binding SET verified=false WHERE id=$1::uuid',[target.bindingId]);
 await assert.rejects(consumer.assertComplete(),{code:'GRH_FINAL_CONSUMER_CONTEXT'});
 await query('ROLLBACK TO SAVEPOINT consumer_authority');checks.push('consumer rejects withdrawn source certification');
 for await(const row of consumer.readRows('curated/grh_employees',{pageSize:1})){assert.ok(row);break;}
 await assert.rejects(consumer.assertComplete(),{code:'GRH_FINAL_CONSUMER_INCOMPLETE'});
 ok((await query("SELECT count(*)::integer AS n FROM pg_cursors WHERE name LIKE 'mc_final_consumer_%'")).rows[0].n===0,'interrupted consumer closes its real cursor without certifying completeness');
 for(const entity of Object.keys(pack.entities)){
  const n=(await query('SELECT count(*)::integer AS n FROM public.grh_final_source_rows_v1($1::uuid,$2)',[first.revisionId,entity])).rows[0].n;
  ok(n===pack.entities[entity].candidate.rows,'complete reconstruction '+entity);
 }
 const runs=(await query("SELECT record->>'source_month' AS month,record->>'payroll_type' AS type,record->>'closure_status' AS status FROM public.grh_final_source_rows_v1($1,'core/payrollRuns') ORDER BY 1,2",[first.revisionId])).rows;
 assert.deepEqual(runs,[{month:'10',type:'M',status:'open'},{month:'10',type:'O',status:'open'},{month:'9',type:'M',status:'closed'}]);checks.push('September closure and both open October types');
 const monthly=(await query("SELECT record->>'quantity_sum' AS quantity,record->>'net' AS zero,record->>'net_payable' AS missing,record->>'total_subject_earnings' AS exact FROM public.grh_final_source_rows_v1($1,'core/payrollMonthly') LIMIT 1",[first.revisionId])).rows[0];
 assert.deepEqual(monthly,{quantity:'9007199254740993.0000001',zero:'0',missing:null,exact:'12345678901234567890.0123456789'});checks.push('exact decimals and NULL distinct from zero');
 const literal=(await query("SELECT record->'source_payload' AS payload FROM public.grh_final_source_rows_v1($1,'curated/grh_employees') WHERE record->>'legajo'='001'",[first.revisionId])).rows[0].payload;
 assert.deepEqual(literal,pack.changes.find(c=>c.entity==='curated/grh_employees').record.source_payload);checks.push('complete original employee payload');
 assert.deepEqual(await footprint(schema),baseline);checks.push('all prior synthetic tables conserved with full row digests');
 await denied(()=>query("UPDATE public.grh_final_source_revision SET package_sha256=repeat('0',64)"),'GRH_FINAL_REVISION_IMMUTABLE');
 await denied(()=>query('DELETE FROM public.grh_final_source_delta'),'GRH_FINAL_REVISION_IMMUTABLE');
 await denied(()=>query('TRUNCATE public.grh_final_source_seal'),'GRH_FINAL_REVISION_IMMUTABLE');
 await denied(()=>query('INSERT INTO public.grh_final_source_seal SELECT * FROM public.grh_final_source_seal'),'GRH_FINAL_REVISION_SEALED');
 await denied(()=>query('SELECT * FROM public.grh_final_source_rows_v1($1,$2)',['99999999-9999-4999-8999-999999999999','curated/grh_employees']),'GRH_FINAL_REVISION_UNSEALED');
 await denied(()=>query('SELECT * FROM public.grh_final_source_rows_v1($1,$2)',[first.revisionId,'unknown']),'GRH_FINAL_REVISION_ENTITY');
 const acl=(await query("SELECT bool_and(relrowsecurity AND NOT has_table_privilege('municontrol_actions_runtime_app',oid,'SELECT,INSERT,UPDATE,DELETE')) AS private FROM pg_class WHERE oid IN('public.grh_final_source_revision'::regclass,'public.grh_final_source_delta'::regclass,'public.grh_final_source_seal'::regclass)")).rows[0];
 ok(acl.private,'RLS and no runtime table access');
 await denied(async()=>{await raw.query('SET LOCAL ROLE municontrol_actions_runtime_app');await query('SELECT * FROM public.grh_final_source_rows_v1($1,$2)',[first.revisionId,'curated/grh_employees']);},'42501');
 const header=(await query('SELECT tenant_id::text,source_binding_id::text,parent_core_version_id::text,parent_curated_version_id::text,parent_publication_sha256,source_profile,source_sha256,to_char(source_cutoff,\'YYYY-MM-DD"T"HH24:MI:SS\') AS source_cutoff,core_manifest_sha256,curated_manifest_sha256,package_sha256,evidence FROM public.grh_final_source_revision')).rows[0];
 const seal=(await query('SELECT fingerprints FROM public.grh_final_source_seal')).rows[0].fingerprints;
 const changes=(await query('SELECT entity,row_key,operation,previous_record,record,source_payload FROM public.grh_final_source_delta ORDER BY entity,row_key')).rows;
 await raw.query('ROLLBACK TO SAVEPOINT candidate_empty');
 async function candidate({alterHeader=()=>{},alterChanges=()=>{},alterSeal=()=>{},noSeal=false,wrongTransaction=false}={}){
  const h=structuredClone(header),d=structuredClone(changes),f=structuredClone(seal);alterHeader(h);alterChanges(d);alterSeal(f);
  await query('SET CONSTRAINTS final_revision_seal_at_commit DEFERRED');
  const id=(await query(`INSERT INTO public.grh_final_source_revision(${Object.keys(h).join(',')}${wrongTransaction?',created_transaction':''}) VALUES(${Object.keys(h).map((_,i)=>'$'+(i+1)).join(',')}${wrongTransaction?',txid_current()+1':''}) RETURNING id::text`,Object.values(h).map(v=>typeof v==='object'?JSON.stringify(v):v))).rows[0].id;
  if(!noSeal){await query(`INSERT INTO public.grh_final_source_delta SELECT $1::uuid,entity,row_key,operation,previous_record,record,source_payload FROM jsonb_to_recordset($2::jsonb) AS d(entity text,row_key text,operation text,previous_record jsonb,record jsonb,source_payload jsonb)`,[id,JSON.stringify(d)]);
   await query('INSERT INTO public.grh_final_source_seal VALUES($1,$2,clock_timestamp())',[id,JSON.stringify(f)]);}
  await query('SET CONSTRAINTS final_revision_seal_at_commit IMMEDIATE');
 }
 await denied(()=>candidate({noSeal:true}),'GRH_FINAL_REVISION_SEAL_REQUIRED');
 await denied(()=>candidate({wrongTransaction:true}),'GRH_FINAL_REVISION_TRANSACTION');
 await denied(()=>candidate({alterHeader:h=>delete h.evidence['curated/grh_family']}),'GRH_FINAL_REVISION_INCOMPLETE');
 await denied(()=>candidate({alterHeader:h=>h.evidence['curated/grh_employees'].changes.replace++}),'GRH_FINAL_REVISION_CHANGE_COUNT');
 await denied(()=>candidate({alterHeader:h=>h.evidence['curated/grh_employees'].baseline.md5='0'.repeat(32)}),'GRH_FINAL_REVISION_BASELINE_DRIFT');
 await denied(()=>candidate({alterChanges:d=>d.find(r=>r.entity==='curated/grh_employees').previous_record.nombre='Wrong previous'}),'GRH_FINAL_REVISION_PREVIOUS_MISMATCH');
 await denied(()=>candidate({alterChanges:d=>d.find(r=>r.entity==='curated/grh_employees').record.company_id=102}),'GRH_FINAL_REVISION_COMPANY');
 await denied(()=>candidate({alterSeal:f=>f['core/payrollRuns'].md5='0'.repeat(32)}),'GRH_FINAL_REVISION_CANDIDATE_DRIFT');
 await denied(()=>candidate({alterHeader:h=>h.source_binding_id='99999999-9999-4999-8999-999999999999'}),'23503');
 let chunk=0;const broken={query:async(sql,values)=>{
  if(sql.includes('final-revision:delta */')&&++chunk===2)return query('SELECT 1/0');return query(sql,values);
 }};
 await assert.rejects(prepareFinalSourceRevisionWithinTransaction({...base,client:broken}),{code:'22012'});
 ok((await query('SELECT count(*)::integer AS n FROM public.grh_final_source_revision')).rows[0].n===0,'SQL failure rolls back all preceding chunks');
 const abort=new AbortController();const interrupted={query:async(sql,values)=>{
  const r=await query(sql,values);if(sql.includes('final-revision:delta */'))abort.abort();return r;
 }};
 await assert.rejects(prepareFinalSourceRevisionWithinTransaction({...base,client:interrupted,signal:abort.signal}),{name:'AbortError'});
 ok((await query('SELECT count(*)::integer AS n FROM public.grh_final_source_delta')).rows[0].n===0,'cancellation rolls back partial rows');
 assert.deepEqual(await footprint(schema),baseline);checks.push('preservation after failed SQL and cancellation');
 const transitionPack=await finalTransitionQaPackage();
 const transitionBase={...base,prepared:transitionPack,expectedPackageSha256:transitionPack.payloadSha256};
 const transitionRevision=await prepareFinalSourceRevisionWithinTransaction(transitionBase);
 const projection=await prepareFinalContractTransitionWithinTransaction({client:{query},target,revisionId:transitionRevision.revisionId,expectedPackageSha256:transitionPack.payloadSha256});
 ok(projection.rows.length===3&&projection.cohort.missing_core_keys===0&&projection.globalIssues.length===0,'transition compares coherent complete final core and curated cohorts');
 const mapped=projection.rows.find(r=>r.contract_id!==null),mappedFacts=JSON.parse(mapped.candidate_facts_json);
 ok(mapped.contract_id==='66666666-6666-4666-8666-666666666666'&&!mapped.issues.includes('PERSON_LINK_MISSING'),'exact original bigint person crosswalk preserves the canonical contract UUID');
 ok(mappedFacts.startDate==='2015-01-01'&&mappedFacts.endDate==='2026-09-30'&&mappedFacts.active===false,'final dates and administrative state are separate from the old active contract');
 ok(mappedFacts.agreementCode==='SYNTHETIC'&&mappedFacts.categoryCode==='TEST'&&mappedFacts.organizationId==='SYNTHETIC_AREA'&&mappedFacts.positionCode==='POSITION','final classification and organization are retained in proposed facts');
 ok(mappedFacts.jurisdictionCode==='42'&&projection.rows.some(r=>JSON.parse(r.candidate_facts_json).jurisdictionCode==='55'),'jurisdictions require the original department key and named table reference');
 ok(mappedFacts.sourcePayload.sourceFields.SUEL_12==='9007199254740993.0000001'&&mappedFacts.sourcePayload.sourceFields.NOLI_12==='0'&&mappedFacts.sourcePayload.sourceFields.CUEN_12===null,'literal salary, liquidation indicator and missing bank value conserved without eligibility inference');
 const incompatible=projection.rows.find(r=>r.issues.includes('PERIOD_INVALID'));
 ok(incompatible&&JSON.parse(incompatible.candidate_facts_json).endDate==='2014-12-31','incompatible final date is visible instead of silently nulled');
 const previous=JSON.parse(mapped.previous_facts_json);
 ok(previous.contract.status==='active'&&previous.contract.id===mapped.contract_id,'old contract facts remain separately reviewable');
 const summary=summarizeFinalContractTransition(projection);
 ok(!/Synthetic original identity|9007199254740993|sourcePayload|candidate_facts_json/.test(JSON.stringify(summary)),'maintenance console exposes counts and hashes without personal or source payloads');
 await raw.query('SAVEPOINT wrong_person_crosswalk');
 await query("UPDATE public.source_xref SET source_id='9007199254740999' WHERE source_entity='persona'");
 const wrongLink=await prepareFinalContractTransitionWithinTransaction({client:{query},target,revisionId:transitionRevision.revisionId,expectedPackageSha256:transitionPack.payloadSha256});
 ok(wrongLink.rows.find(r=>r.contract_id===mapped.contract_id).issues.includes('PERSON_LINK_MISSING'),'same employee key cannot substitute for a missing exact person crosswalk');
 await raw.query('ROLLBACK TO SAVEPOINT wrong_person_crosswalk');
 await raw.query('SAVEPOINT foreign_contract_scope');
 await query("UPDATE public.employment_contract SET tenant_id='01010101-0101-4101-8101-010101010101' WHERE id=$1::uuid",[mapped.contract_id]);
 const wrongScope=await prepareFinalContractTransitionWithinTransaction({client:{query},target,revisionId:transitionRevision.revisionId,expectedPackageSha256:transitionPack.payloadSha256});
 ok(wrongScope.rows.find(r=>r.contract_id===mapped.contract_id).issues.includes('CONTRACT_SCOPE_CONFLICT'),'another municipality contract cannot be silently adopted by its legacy key');
 ok(wrongScope.factsSha256!==projection.factsSha256,'same-count contract content change invalidates the proposal facts hash');
 await raw.query('ROLLBACK TO SAVEPOINT foreign_contract_scope');
 assert.deepEqual(await footprint(schema),baseline);checks.push('transition comparison preserves every existing synthetic row');
 await raw.query('ROLLBACK TO SAVEPOINT candidate_empty');
 await raw.query('COMMIT');
 let transitionReleases=0;
 const transitionRehearsal=await executeFinalSourceRevision({...transitionBase,reviewContracts:true,
  connect:async()=>({query,release(){transitionReleases++;}})});
 ok(transitionRehearsal.rolledBack&&transitionReleases===1&&transitionRehearsal.contractTransition.cohort.candidate_rows===3,
  'maintenance rehearsal performs complete contract comparison in the same transaction and releases it');
 ok((await query('SELECT count(*)::integer AS n FROM public.grh_final_source_revision')).rows[0].n===0,
  'maintenance contract review rehearsal leaves no saved final revision');
 await raw.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 first=await prepareFinalSourceRevisionWithinTransaction(base);
 const committedComparison=await prepareFinalContractTransitionWithinTransaction({client:{query},target,revisionId:first.revisionId,expectedPackageSha256:pack.payloadSha256});
 await raw.query('COMMIT');await raw.end();
 raw=new pg.Client(connection);await raw.connect();await identity();await raw.query("SET TIME ZONE 'UTC'");await context();
 const replay=await executeFinalSourceRevision({...base,connect,commit:true});
 ok(replay.replayed&&replay.revisionId===first.revisionId,'durable replay after COMMIT and reconnection');
 ok((await query('SELECT count(*)::integer AS n FROM public.grh_final_source_delta')).rows[0].n===410,'durability without duplicate rows');
 assert.deepEqual(await footprint(schema),baseline);checks.push('all source, contract and native rows conserved after durable replay');
 ok(replay.committed&&!replay.rolledBack&&released===2,'maintenance confirms and releases its committed replay');
 await raw.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await consumerRead(first.revisionId,pack,'read-only durable revision');
 const durableComparison=await prepareFinalContractTransitionWithinTransaction({client:{query},target,revisionId:first.revisionId,expectedPackageSha256:pack.payloadSha256});
 ok(durableComparison.factsSha256===committedComparison.factsSha256&&durableComparison.rows.length===3,
  'durable read-only reconnection yields the same complete contract facts without new grants');
 const oldTransaction=await bindFinalSourceConsumersWithinTransaction({client:{query},target,revisionId:first.revisionId,expectedPackageSha256:pack.payloadSha256});
 await raw.query('COMMIT');await raw.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await assert.rejects(oldTransaction.assertComplete(),{code:'GRH_FINAL_CONSUMER_CHANGED'});checks.push('consumer rejects reuse after COMMIT even on the same physical connection');
 await raw.query('ROLLBACK');
 assert.deepEqual(await footprint('public'),original);checks.push('all existing public table rows unchanged');
 await raw.query(`BEGIN;DO $cleanup$ BEGIN IF (SELECT oid::text FROM pg_namespace WHERE nspname='${schema}') IS DISTINCT FROM '${namespace}' THEN RAISE EXCEPTION 'QA_NAMESPACE_CHANGED';END IF;END $cleanup$;DROP SCHEMA ${schema} CASCADE;COMMIT`);created=false;
 ok((await raw.query('SELECT to_regnamespace($1) IS NULL AS absent',[schema])).rows[0].absent,'isolated synthetic schema removed');
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({major,checks,passed:true,synthetic:true,durability:true,cleanup:true,sourceSelected:false,municipalWrites:0},null,2));
 console.log(JSON.stringify({major,passed:true,checks:checks.length,durability:true,cleanup:true}));
}catch(error){
 try{await raw.query('ROLLBACK');}catch{}
 // A committed fixture may remain only if cleanup cannot verify its exact namespace.
 if(created&&namespace)try{
  const r=(await raw.query('SELECT oid::text AS oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0];
  if(r){assert.equal(r.oid,namespace);await raw.query(`DROP SCHEMA ${schema} CASCADE`);}
 }catch(cleanupError){throw new AggregateError([error,cleanupError],'FINAL_SOURCE_QA_CLEANUP_REQUIRED');}
 throw error;
}finally{await raw.end();}
