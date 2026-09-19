// Isolated-schema tests on an explicitly selected QA branch. Always rolls back.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {Client} from '@neondatabase/serverless';
const url=new URL(process.env.MC_LEGAL_QA_DATABASE_URL||'');
assert.equal(url.hostname,'ep-falling-rain-aca27ph1.sa-east-1.aws.neon.tech');assert.equal(url.pathname,'/neondb');
const client=new Client({connectionString:url.href});const schema='legal_078_qa_'+Date.now();let checks=0;
const ok=(value,message)=>{assert.ok(value,message);checks++;};
const source=fs.readFileSync('scripts/migrations/069-native-legal-registry.sql','utf8');
const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const tenant=uid(1),otherTenant=uid(2),member=uid(3),reader=uid(4),otherMember=uid(5),session=uid(6);
const context=(id=member,t=tenant)=>({actorEmail:id+'@example.invalid',actorSessionId:session,actorSessionVersion:1,tenantId:t,membershipId:id});
try{await client.connect();}catch(error){console.log(JSON.stringify({ok:false,stage:'connect',code:error.code||null,name:error.name,websocket:String(error.message).includes('WebSocket'),authentication:String(error.message).includes('password authentication failed')}));process.exit(1);}
try{
 await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='20s'");await client.query("SET LOCAL lock_timeout='5s'");
 await client.query(`CREATE SCHEMA ${schema};SET LOCAL search_path=${schema},public,pg_temp;
 CREATE TABLE platform_tenant(id uuid PRIMARY KEY,status text);
 CREATE TABLE internal_users(email text PRIMARY KEY,active boolean,auth_mode text,identity_version integer);
 CREATE TABLE tenant_membership(id uuid PRIMARY KEY,tenant_id uuid,user_email text,role_key text,status text,UNIQUE(id,tenant_id));
 CREATE TABLE tenant_identity_session(id uuid PRIMARY KEY,user_email text,active_tenant_id uuid,session_version integer,identity_version integer,source text,auth_level text,status text,expires_at timestamptz,last_seen_at timestamptz);
 CREATE TABLE iam_role(role_key text PRIMARY KEY,scope_kind text);
 CREATE TABLE iam_capability(capability_key text PRIMARY KEY,label text,description text,scope_kind text,sensitivity text);
 CREATE TABLE iam_role_capability(role_key text,capability_key text,PRIMARY KEY(role_key,capability_key));
 CREATE FUNCTION tenant_iam_assert_no_sod_conflict(uuid) RETURNS void LANGUAGE sql AS 'SELECT NULL::void';
 CREATE FUNCTION tenant_iam_effective_capabilities(mid uuid) RETURNS TABLE(capability_key text) LANGUAGE sql SET search_path=${schema},public,pg_temp AS $$SELECT r.capability_key FROM tenant_membership m JOIN iam_role_capability r ON r.role_key=m.role_key WHERE m.id=mid$$;`);
 await client.query('INSERT INTO platform_tenant VALUES($1,\'active\'),($2,\'active\')',[tenant,otherTenant]);
 for(const [id,t,role] of [[member,tenant,'MUNICIPIO_ADMIN_OPERATIVO'],[reader,tenant,'QA_READER'],[otherMember,otherTenant,'MUNICIPIO_ADMIN_OPERATIVO']]){
  await client.query("INSERT INTO internal_users VALUES($1,true,'managed',1)",[id+'@example.invalid']);
  await client.query("INSERT INTO tenant_membership VALUES($1,$2,$3,$4,'active')",[id,t,id+'@example.invalid',role]);
 }
 await client.query("INSERT INTO tenant_identity_session VALUES($1,$2,$3,1,1,'membership','mfa','active',now()+interval '1 hour',now())",[session,member+'@example.invalid',tenant]);
 for(const role of ['MUNICIPIO_ADMIN_OPERATIVO','PLATFORM_OWNER_OPERATIVO_INTEGRAL','NOMINA_GESTION_INTEGRAL','HUGO_APROBADOR_INTEGRAL','QA_READER'])await client.query("INSERT INTO iam_role VALUES($1,'tenant')",[role]);
 await client.query(source.replaceAll('SET search_path=pg_catalog,public,pg_temp',`SET search_path=pg_catalog,${schema},public,pg_temp`));
 await client.query("INSERT INTO iam_role_capability VALUES('QA_READER','legal.norm.read')");
 const call=async(op,d={},key=null,ctx=context())=>(await client.query('SELECT legal_norm_operation_v1($1::jsonb,$2,$3::jsonb,$4::uuid) AS result',[JSON.stringify(ctx),op,JSON.stringify(d),key])).rows[0].result;
 const rejects=async(fn,expected)=>{await client.query('SAVEPOINT rejected');try{await fn();assert.fail('Expected '+expected);}catch(error){assert.equal(error.message,expected);checks++;}finally{await client.query('ROLLBACK TO SAVEPOINT rejected');await client.query('RELEASE SAVEPOINT rejected');}};
 const pdf=Buffer.from('%PDF-1.4\nSYNTHETIC DATABASE TRANSPORT ONLY\n%%EOF');
 const draft={id:null,expectedVersion:0,identity:{kind:'ordenanza',issuer:'HCD',number:'9999',year:1990},metadata:{title:'Norma sintética de archivo',summary:'Ensayo reversible',topics:'residuos',sourceReference:'Expediente sintético QA',stage:'acto_registrado',issueDate:'1990-01-01',publicationDate:'',effectiveDate:'',articles:[{label:'Artículo 1',page:1,text:'Se establece un registro sintético de luminarias.'}]},document:{filename:'norma.pdf',contentBase64:pdf.toString('base64'),sha256:createHash('sha256').update(pdf).digest('hex'),pages:1},reason:'Alta sintética de prueba'};
 ok((await call('bootstrap')).total===0,'empty registry');
 const reviewSource=fs.readFileSync('scripts/migrations/078-legal-documentary-review.sql','utf8');
 await client.query(reviewSource.replaceAll('SET search_path=pg_catalog,public,pg_temp',`SET search_path=pg_catalog,${schema},public,pg_temp`));
 const review=async(filter='all',page=1,ctx=context())=>(await client.query('SELECT legal_documentary_review_v1($1::jsonb,$2::jsonb) result',[JSON.stringify(ctx),JSON.stringify({filter,page})])).rows[0].result;
 ok((await review()).total===0,'empty documentary review does not invent norms');

 const key=randomUUID(),receipt=await call('save',draft,key),id=receipt.id;
 const initialReview=await review();ok(initialReview.total===1&&initialReview.summary.no_publication_date===1&&initialReview.summary.no_effective_date===1,'missing documentary fields counted explicitly');
 ok(initialReview.legalConclusion===false&&initialReview.rows[0].version===1,'source version without legal conclusion');
 ok((await review('no_articles')).total===0,'transcribed articles do not count as missing');
 for(const filter of ['all','no_articles','no_issue_date','no_publication_date','no_effective_date','no_topics','no_summary','projects']){const x=await review(filter);ok(x.total===x.summary[filter],'filter and count agree '+filter);}
 await rejects(()=>review('unknown'),'LEGAL_INPUT_INVALID');await rejects(()=>review('all',0),'LEGAL_INPUT_INVALID');await rejects(()=>review('all',201),'LEGAL_INPUT_INVALID');await rejects(()=>review('all','1'),'LEGAL_INPUT_INVALID');

 ok(receipt.recordVersion===1&&!receipt.replayed,'created first revision');
 const detail=(await call('detail',{id,version:null})).record;
 ok(detail.metadata.title===draft.metadata.title&&detail.legalStatus==='no_determinada','no legal validity inferred');
 ok(detail.history.length===1&&detail.recordedBy===member+'@example.invalid','immutable actor trail');
 const bytes=await call('download',{id,version:1});ok(Buffer.from(bytes.contentBase64,'base64').equals(pdf),'original bytes preserved');
 ok((await call('list',{q:'luminarias',kind:'',year:'',page:1})).total===1,'search across explicit article text');
 ok((await call('list',{q:'',kind:'ordenanza',year:'1990',page:1})).rows.length===1,'historical year and type filters');
 ok((await call('list',{q:'',kind:'decreto',year:'',page:1})).total===0,'filters do not invent matches');
 ok((await call('save',draft,key)).replayed,'exact retry does not duplicate');
 ok((await call('attempt',{},key)).id===id,'recover original attempt');
 await rejects(()=>call('save',{...draft,reason:'Otra solicitud'},key),'LEGAL_IDEMPOTENCY_CONFLICT');
 await rejects(()=>call('save',draft,randomUUID()),'LEGAL_DUPLICATE');
 const revision={...draft,id,expectedVersion:1,document:null,metadata:{...draft.metadata,title:'Título corregido'},reason:'Corrección sintética documentada'};
 const revised=await call('save',revision,randomUUID());ok(revised.recordVersion===2,'append correction');
 ok((await call('detail',{id,version:1})).record.metadata.title===draft.metadata.title,'older metadata preserved');
 ok((await call('detail',{id,version:null})).record.history.length===2,'history grows');
 ok((await review()).total===1&&(await review()).rows[0].version===2,'only latest version counted, not both revisions');
 ok(Buffer.from((await call('download',{id,version:2})).contentBase64,'base64').equals(pdf),'unchanged source reused on metadata correction');
 await rejects(()=>call('save',revision,randomUUID()),'LEGAL_VERSION_CONFLICT');
 await rejects(()=>call('save',{...revision,expectedVersion:2,identity:{...draft.identity,year:1991}},randomUUID()),'LEGAL_IDENTITY_IMMUTABLE');
 await rejects(()=>call('save',{...revision,expectedVersion:2,metadata:{...draft.metadata,articles:[{label:'Artículo 1',text:'fuente',page:2}]}},randomUUID()),'LEGAL_INPUT_INVALID');
 for(const metadata of [{...draft.metadata,title:null},{...draft.metadata,issueDate:'1990-02-30'},{...draft.metadata,extra:'permission'},{...draft.metadata,articles:[...draft.metadata.articles,...draft.metadata.articles]}])await rejects(()=>call('save',{...revision,expectedVersion:2,metadata},randomUUID()),'LEGAL_INPUT_INVALID');
 await rejects(()=>call('save',{...revision,expectedVersion:2,document:{...draft.document,sha256:'0'.repeat(64)}},randomUUID()),'LEGAL_DOCUMENT_INVALID');
 await rejects(()=>call('detail',{id:randomUUID(),version:null}),'LEGAL_NOT_FOUND');
 await rejects(()=>client.query("UPDATE legal_norm_revision SET reason='mutated' WHERE norm_id=$1",[id]),'legal_norm_revision is append-only; UPDATE is not allowed');
 await client.query('UPDATE tenant_identity_session SET user_email=$1 WHERE id=$2',[reader+'@example.invalid',session]);
 ok((await call('bootstrap',{},null,context(reader))).canRegister===false,'read-only profile can query');
 ok((await review('all',1,context(reader))).total===1,'documentary read-only profile permitted');
 await rejects(()=>call('save',draft,randomUUID(),context(reader)),'LEGAL_FORBIDDEN');
 await client.query('UPDATE tenant_identity_session SET user_email=$1,active_tenant_id=$2 WHERE id=$3',[otherMember+'@example.invalid',otherTenant,session]);
 ok((await call('list',{q:'',kind:'',year:'',page:1},null,context(otherMember,otherTenant))).total===0,'other tenant cannot infer record count');
 ok((await review('all',1,context(otherMember,otherTenant))).summary.all===0,'documentary review cannot enumerate another tenant');
 await rejects(()=>call('detail',{id,version:null},null,context(otherMember,otherTenant)),'LEGAL_NOT_FOUND');
 await rejects(()=>call('download',{id,version:1},null,context(otherMember,otherTenant)),'LEGAL_NOT_FOUND');
 await rejects(()=>call('attempt',{},key,context(otherMember,otherTenant)),'LEGAL_NOT_FOUND');
 await client.query("UPDATE tenant_identity_session SET user_email=$1,active_tenant_id=$2,auth_level='password' WHERE id=$3",[member+'@example.invalid',tenant,session]);
 await rejects(()=>call('bootstrap'),'LEGAL_SESSION_INVALID');
 await rejects(()=>review(),'LEGAL_SESSION_INVALID');
 await client.query("UPDATE tenant_identity_session SET auth_level='mfa',status='revoked' WHERE id=$1",[session]);
 await rejects(()=>call('bootstrap'),'LEGAL_SESSION_INVALID');
 await rejects(()=>review(),'LEGAL_SESSION_INVALID');
 for(const name of ['legal_norm','legal_norm_document','legal_norm_revision','legal_norm_attempt']){
  const rights=(await client.query("SELECT has_table_privilege('municontrol_actions_runtime_app',$1,'SELECT,INSERT,UPDATE,DELETE') AS allowed",[schema+'.'+name])).rows[0];ok(!rights.allowed,'runtime direct table access rejected '+name);
 }
 const functions=(await client.query("SELECT p.proname,has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname LIKE 'legal_norm_%'",[schema])).rows;
 ok(functions.every(x=>x.allowed===(x.proname==='legal_norm_operation_v1')),'runtime has only bounded operation facade');
 await client.query('ROLLBACK');
 const absent=(await client.query('SELECT to_regnamespace($1) IS NULL AS absent',[schema])).rows[0].absent;ok(absent,'QA schema removed by rollback');
 fs.mkdirSync('verification',{recursive:true});const report={ok:true,checksPassed:checks,migrationSha256:createHash('sha256').update(source).digest('hex'),isolatedSchema:true,allChangesRolledBack:true,productionWrites:0,existingSodHelper:'synthetic stub; MFA and tenant checks are the new actual function'};
 fs.writeFileSync('verification/legal-registry-sql.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({ok:false,checksPassed:checks,message:error.message,code:error.code||null,allChangesRolledBack:true}));process.exitCode=1;}
finally{await client.end();}
