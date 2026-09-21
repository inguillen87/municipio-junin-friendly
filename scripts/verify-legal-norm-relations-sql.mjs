// Exercises the actual migration in a disposable schema; no synthetic row enters public.
// SQL emission is offline. Database execution requires explicit project, branch, host and major pins.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const json=value=>quote(JSON.stringify(value))+'::jsonb';
const read=name=>fs.readFileSync(path.join(root,'scripts/migrations',name),'utf8');
const extract=(source,start,end)=>{
 assert.equal(source.split(start).length,2,`Expected exactly one ${start}`);
 const section=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 assert.ok(section.endsWith('\n')&&section.includes('$$;'),`Incomplete SQL section ${start}`);
 return section;
};

export function buildRelationsQa({projectId,branchId,serverMajor,requireConcurrency=false,ci=false}){
 if(!ci){assert.match(projectId||'',/^[a-z0-9-]+$/,'Explicit expected project is required');assert.match(branchId||'',/^br-[a-z0-9-]+$/,'Explicit expected branch is required');}
 assert.ok([17,18].includes(Number(serverMajor)),'Expected server major must be 17 or 18');
 const schema='mc_qa_relations_090_'+randomUUID().replaceAll('-','');
 const migration=read('090-legal-norm-relations.sql');
 const registry=read('069-native-legal-registry.sql');
 const immutable=extract(read('002-canonical-integration.sql'),'CREATE OR REPLACE FUNCTION reject_immutable_source_change()','CREATE OR REPLACE FUNCTION validate_source_batch_system()');
 const context=extract(registry,'CREATE FUNCTION legal_norm_context_v1(','CREATE FUNCTION legal_norm_metadata_valid_v1(');
 const detail=extract(registry,'CREATE FUNCTION legal_norm_detail_v1(','CREATE FUNCTION legal_norm_operation_v1(');
 const relocate=sql=>sql.replaceAll('public.',schema+'.').replaceAll('SET search_path=pg_catalog,public,pg_temp',`SET search_path=pg_catalog,${schema},public,pg_temp`);
 const ids=Object.fromEntries(['tenant','otherTenant','blockedTenant','writer','reader','peer','outsider','blockedMember','writerSession','readerSession','peerSession','outsiderSession','blockedSession','source','target','foreignNorm','sourceDoc','targetDoc','foreignDoc','key','cancelKey'].map(k=>[k,randomUUID()]));
 const ctx=(member,session,tenant,email)=>({actorEmail:email,actorSessionId:session,actorSessionVersion:1,tenantId:tenant,membershipId:member});
 const writer=ctx(ids.writer,ids.writerSession,ids.tenant,'writer@example.invalid');
 const reader=ctx(ids.reader,ids.readerSession,ids.tenant,'reader@example.invalid');
 const peer=ctx(ids.peer,ids.peerSession,ids.tenant,'peer@example.invalid');
 const outsider=ctx(ids.outsider,ids.outsiderSession,ids.otherTenant,'outsider@example.invalid');
 const blocked=ctx(ids.blockedMember,ids.blockedSession,ids.blockedTenant,'blocked@example.invalid');
 const body={command:'create',sourceNormId:ids.source,sourceVersion:1,targetNormId:ids.target,targetVersion:1,relationType:'modifies',sourceArticleLabel:'Artículo 1',targetArticleLabel:'Artículo 1',basisNote:'Fundamento documental sintético de ensayo aislado.',reason:'Alta sintética de ensayo aislado'};
 const statements=[];let checks=0;
 const exec=sql=>statements.push(sql);
 const ok=(expr,label)=>{statements.push(`PERFORM qa_assert((${expr}),${quote(label)}); checks:=checks+1;`);checks++;};
 const rejects=(c,op,d,k,error,label)=>ok(`qa_rejects(${c},${quote(op)},${d},${k},${quote(error)})`,label);
 const call=(c,op,d="'{}'::jsonb",k='NULL')=>`legal_norm_relation_operation_v1(${c},${quote(op)},${d},${k})`;
 const fresh='gen_random_uuid()';
 const command=(sequence,status)=>`jsonb_build_object('command','set_status','id',relation_id,'expectedSequence',${sequence},'status',${quote(status)},'reason','Cambio sintético de ensayo aislado')`;

 ok(`jsonb_array_length(${call('c','list',`jsonb_build_object('normId',${quote(ids.source)})`)}->'rows')=0`,'empty relation list stays empty');
 exec(`result:=${call('r','bootstrap',`jsonb_build_object('sourceNormId',${quote(ids.source)},'sourceVersion',1)`)};`);
 ok("(result->'source'->>'version')::int=1 AND (result->'source'->>'currentVersion')::int=2 AND result->'source'->>'title'='Norma fuente versión 1' AND NOT (result->>'canManage')::boolean",'bootstrap preserves requested historic source version for reader');
 ok("jsonb_array_length(result->'targets')=1 AND result->'targets'->0->>'id'="+quote(ids.target),'bootstrap catalog excludes source and foreign tenant');
 exec(`result:=${call('r','target',`jsonb_build_object('normId',${quote(ids.target)},'version',1)`)};`);
 ok("(result->'target'->>'version')::int=1 AND (result->'target'->>'currentVersion')::int=2 AND result->'target'->>'title'='Norma destino versión 1'",'target endpoint preserves requested historic revision');
 rejects('c','target',`jsonb_build_object('normId',${quote(ids.target)},'version',3)`,'NULL','RELATION_NORM_NOT_FOUND','nonexistent target revision rejected');
 rejects('r','save','payload',fresh,'LEGAL_FORBIDDEN','reader cannot create');
 rejects('c','save',`payload||'{"sourceVersion":3}'`,fresh,'RELATION_NORM_NOT_FOUND','missing exact source version rejected');
 rejects('c','save',`payload||'{"sourceArticleLabel":"Artículo 2"}'`,fresh,'RELATION_ARTICLE_NOT_FOUND','article from newer source revision rejected');
 rejects('c','save',`payload||'{"targetArticleLabel":"Artículo 2"}'`,fresh,'RELATION_ARTICLE_NOT_FOUND','article from newer target revision rejected');
 rejects('c','save',`payload||jsonb_build_object('targetNormId',${quote(ids.foreignNorm)})`,fresh,'RELATION_NORM_NOT_FOUND','cross-tenant target cannot be attached');
 rejects('c','save',`payload||jsonb_build_object('targetNormId',${quote(ids.source)})`,fresh,'RELATION_INPUT_INVALID','self relationship rejected');
 rejects('c','save',`payload||jsonb_build_object('tenantId',${quote(ids.otherTenant)})`,fresh,'RELATION_INPUT_INVALID','caller cannot supply tenant authority');
 if(requireConcurrency)rejects('blocked','save','payload',fresh,'RELATION_BUSY','independent connection blocks concurrent tenant writer');
 exec(`receipt:=${call('c','save','payload',quote(ids.key)+'::uuid')}; relation_id:=(receipt->>'id')::uuid;`);
 ok("(receipt->>'sequence')::int=1 AND receipt->>'status'='declared' AND NOT (receipt->>'replayed')::boolean",'create appends initial declaration');
 ok(`${call('c','save','payload',quote(ids.key)+'::uuid')}=receipt||'{"replayed":true}'::jsonb`,'same key and content replay exact receipt');
 ok('(SELECT count(*)=1 FROM legal_norm_relation_event)','replay does not append a second event');
 rejects('c','save',`payload||'{"reason":"Contenido diferente para la misma clave"}'`,quote(ids.key)+'::uuid','RELATION_IDEMPOTENCY_CONFLICT','same key and different content rejected');
 rejects('c','save','payload',fresh,'RELATION_DUPLICATE','active duplicate rejected');
 rejects('c','save',`payload||'{"sourceArticleLabel":"ARTÍCULO 1","targetArticleLabel":" artículo 1 "}'`,fresh,'RELATION_DUPLICATE','equivalent case and trimmed article references cannot duplicate');
 ok(`${call('c','attempt',"'{}'::jsonb",quote(ids.key)+'::uuid')}=receipt||'{"replayed":true}'::jsonb`,'same membership can recover lost receipt');
 rejects('r','attempt',"'{}'::jsonb",quote(ids.key)+'::uuid','LEGAL_FORBIDDEN','reader cannot recover write receipt');
 rejects('peer','attempt',"'{}'::jsonb",quote(ids.key)+'::uuid','RELATION_NOT_FOUND','other writer cannot recover another membership receipt');
 rejects('outside','attempt',"'{}'::jsonb",quote(ids.key)+'::uuid','RELATION_NOT_FOUND','other tenant cannot recover receipt');
 rejects('outside','detail',"jsonb_build_object('id',relation_id)",'NULL','RELATION_NOT_FOUND','other tenant cannot read relation history');
 rejects('outside','list',`jsonb_build_object('normId',${quote(ids.source)})`,'NULL','RELATION_NORM_NOT_FOUND','other tenant cannot list source relations');
 rejects('outside','target',`jsonb_build_object('normId',${quote(ids.target)},'version',1)`,'NULL','RELATION_NORM_NOT_FOUND','other tenant cannot read target revision');
 rejects('outside','bootstrap',`jsonb_build_object('sourceNormId',${quote(ids.source)},'sourceVersion',1)`,'NULL','RELATION_NORM_NOT_FOUND','other tenant cannot bootstrap source revision');
 exec(`result:=${call('r','detail',"jsonb_build_object('id',relation_id)")};`);
 ok("result->>'id'=relation_id::text AND jsonb_array_length(result->'history')=1 AND (result->'history'->0->>'sequence')::int=1",'detail SQL compiles and returns exact requested relation');
 rejects('c','save',`${command(1,'cancelled')}||'{"command":null}'`,fresh,'RELATION_INPUT_INVALID','null command rejected by database facade');
 exec(`cancel_receipt:=${call('c','save',command(1,'cancelled'),quote(ids.cancelKey)+'::uuid')};`);
 ok("(cancel_receipt->>'sequence')::int=2 AND cancel_receipt->>'status'='cancelled'",'set_status SQL compiles and appends cancellation');
 ok(`${call('c','save',command(1,'cancelled'),quote(ids.cancelKey)+'::uuid')}=cancel_receipt||'{"replayed":true}'::jsonb`,'status retry returns original receipt despite old expected sequence');
 rejects('c','save',command(1,'declared'),fresh,'RELATION_VERSION_CONFLICT','stale competing status command rejected');
 rejects('c','save',command(2,'cancelled'),fresh,'RELATION_TRANSITION_INVALID','unchanged state rejected');
 ok(`(${call('c','save',command(2,'declared'),fresh)}->>'sequence')::int=3`,'cancellation can be reopened without competing declaration');
 ok(`(${call('c','save',command(3,'cancelled'),fresh)}->>'sequence')::int=4`,'second cancellation keeps full history');
 exec(`replacement_receipt:=${call('c','save',`payload||'{"sourceArticleLabel":"ARTÍCULO 1","targetArticleLabel":"ARTÍCULO 1"}'`,fresh)};`);
 rejects('c','save',command(4,'declared'),fresh,'RELATION_DUPLICATE','reopening cannot duplicate active equivalent replacement');
 exec(`result:=${call('r','detail',"jsonb_build_object('id',relation_id)")};`);
 ok("jsonb_array_length(result->'history')=4 AND result->'history'->0->>'status'='cancelled' AND result->'history'->3->>'status'='declared'",'history includes immutable original declaration after cancellation and replacement');
 ok('(SELECT count(*)=2 FROM legal_norm_relation) AND (SELECT count(*)=5 FROM legal_norm_relation_event)','rejected and replayed commands leave no partial events');
 exec(`INSERT INTO legal_norm_revision SELECT tenant_id,norm_id,3,document_id,metadata||'{"title":"Norma fuente versión 3"}',search_text,reason,actor_membership_id,actor_session_id,actor_email,recorded_at FROM legal_norm_revision WHERE norm_id=${quote(ids.source)}::uuid AND version=2;
 UPDATE legal_norm SET current_version=3 WHERE id=${quote(ids.source)}::uuid;`);
 exec(`result:=${call('r','list',`jsonb_build_object('normId',${quote(ids.source)})`)};`);
 ok("jsonb_array_length(result->'rows')=2 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') e WHERE (e->'source'->>'version')::int<>1 OR e->'source'->>'title'<>'Norma fuente versión 1' OR (e->'target'->>'version')::int<>1 OR e->'target'->>'title'<>'Norma destino versión 1')",'later norm revision never retargets existing relations');
 exec(`result:=${call('r','list',`jsonb_build_object('normId',${quote(ids.target)})`)};`);
 ok("jsonb_array_length(result->'rows')=2",'incoming endpoint retains the same relation history');
 exec(`PERFORM ${call('c','save',`payload||'{"relationType":"repeals"}'`,fresh)};`);
 ok(`legal_norm_detail_v1(${quote(ids.tenant)}::uuid,${quote(ids.target)}::uuid,1)->>'legalStatus'='no_determinada' AND (SELECT current_version=2 FROM legal_norm WHERE id=${quote(ids.target)}::uuid)`,'declared repeal never infers legal status or modifies target norm');
 rejects(`c||'{"actorSessionVersion":2}'`,'list',`jsonb_build_object('normId',${quote(ids.source)})`,'NULL','LEGAL_SESSION_INVALID','stale session version rejected');
 exec(`UPDATE tenant_identity_session SET auth_level='password' WHERE id=${quote(ids.writerSession)}::uuid;`);
 rejects('c','detail',"jsonb_build_object('id',relation_id)",'NULL','LEGAL_SESSION_INVALID','MFA required again for database reads');
 exec(`UPDATE tenant_identity_session SET auth_level='mfa',status='revoked' WHERE id=${quote(ids.writerSession)}::uuid;`);
 rejects('c','save',command(4,'declared'),fresh,'LEGAL_SESSION_INVALID','revoked session cannot write');
 exec(`UPDATE tenant_identity_session SET status='active' WHERE id=${quote(ids.writerSession)}::uuid;
 DELETE FROM capabilities WHERE membership_id=${quote(ids.writer)}::uuid AND capability_key='legal.norm.register';`);
 rejects('c','save',command(4,'declared'),fresh,'LEGAL_FORBIDDEN','write capability revocation checked live');
 exec(`INSERT INTO capabilities VALUES(${quote(ids.writer)}::uuid,'legal.norm.register');`);
 for(const table of ['legal_norm_relation','legal_norm_relation_event']){
  const truncate=table==='legal_norm_relation'?'TRUNCATE legal_norm_relation,legal_norm_relation_event':`TRUNCATE ${table}`;
  for(const mutation of [`UPDATE ${table} SET tenant_id=tenant_id`,`DELETE FROM ${table}`,truncate])ok(`qa_sql_rejects(${quote(mutation)},'55000')`,`${table} blocks ${mutation.split(' ')[0]}`);
  ok(`NOT has_table_privilege('municontrol_actions_runtime_app',${quote(schema+'.'+table)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,`${table} has no direct runtime privileges`);
  ok(`(SELECT relrowsecurity FROM pg_class WHERE oid=${quote(schema+'.'+table)}::regclass)`,`${table} enables row security`);
 }
 ok(`NOT has_function_privilege('municontrol_actions_runtime_app',${quote(schema+'.legal_norm_relation_article_exists_v1(uuid,uuid,integer,text)')},'EXECUTE')`,'article lookup helper is private');
 ok(`has_function_privilege('municontrol_actions_runtime_app',${quote(schema+'.legal_norm_relation_operation_v1(jsonb,text,jsonb,uuid)')},'EXECUTE')`,'bounded operation facade has runtime execute');
 ok(`qa_sql_rejects(${quote(`INSERT INTO legal_norm_relation(tenant_id,source_norm_id,source_norm_version,target_norm_id,target_norm_version) VALUES('${ids.tenant}','${ids.source}',999,'${ids.target}',1)`)},'23503')`,'foreign key enforces exact source revision');
 ok(`qa_sql_rejects(${quote(`INSERT INTO legal_norm_relation(tenant_id,source_norm_id,source_norm_version,target_norm_id,target_norm_version) VALUES('${ids.tenant}','${ids.source}',1,'${ids.target}',999)`)},'23503')`,'foreign key enforces exact target revision');
 ok(`qa_sql_rejects(${quote(`INSERT INTO legal_norm_relation(tenant_id,source_norm_id,source_norm_version,target_norm_id,target_norm_version) VALUES('${ids.tenant}','${ids.source}',1,'${ids.foreignNorm}',1)`)},'23503')`,'foreign key rejects foreign tenant endpoint');
 // Generate 1,000 valid, distinct historic endpoints below the existing per-source limit.
 exec(`FOR i IN 1..4 LOOP
  INSERT INTO legal_norm(tenant_id,kind,issuer,number,year,current_version) VALUES(${quote(ids.tenant)}::uuid,'ordenanza','HCD','CAP-'||i,2026,CASE WHEN i=4 THEN 1 ELSE 334 END) RETURNING id INTO cap_norm_id;
  cap_norms:=array_append(cap_norms,cap_norm_id);
 END LOOP;
 INSERT INTO legal_norm_document(tenant_id,norm_id,filename,content,sha256,pages) SELECT ${quote(ids.tenant)}::uuid,n,'capacity.pdf',decode(repeat('61',10),'hex'),repeat('0',64),1 FROM unnest(cap_norms) n;
 INSERT INTO legal_norm_revision(tenant_id,norm_id,version,document_id,metadata,search_text,reason,actor_membership_id,actor_session_id,actor_email)
 SELECT n.tenant_id,n.id,v,d.id,jsonb_build_object('title','Norma de capacidad sintética','articles','[]'::jsonb),'ensayo','Capacidad de ensayo',${quote(ids.writer)}::uuid,${quote(ids.writerSession)}::uuid,'writer@example.invalid'
 FROM legal_norm n JOIN legal_norm_document d ON d.norm_id=n.id CROSS JOIN LATERAL generate_series(1,n.current_version) v WHERE n.id=ANY(cap_norms);
 INSERT INTO legal_norm_relation(tenant_id,source_norm_id,source_norm_version,target_norm_id,target_norm_version)
 SELECT ${quote(ids.tenant)}::uuid,cap_norms[1+((g-1)%3)],1+((g-1)/3),cap_norms[4],1 FROM generate_series(1,1000) g;
 INSERT INTO legal_norm_relation_event(tenant_id,relation_id,sequence,status,relation_type,source_article_label,target_article_label,basis_note,reason,actor_membership_id,actor_session_id,actor_label,request_key,request_sha256)
 SELECT tenant_id,id,1,'declared','references','','','Fundamento sintético de capacidad','Alta sintética de capacidad',${quote(ids.writer)}::uuid,${quote(ids.writerSession)}::uuid,'writer@example.invalid',gen_random_uuid(),repeat('0',64) FROM legal_norm_relation WHERE target_norm_id=cap_norms[4];`);
 ok(`jsonb_array_length(${call('c','list',"jsonb_build_object('normId',cap_norms[4])")}->'rows')=1000`,'maximum incoming endpoint remains readable');
 rejects('c','save',"payload||jsonb_build_object('targetNormId',cap_norms[4],'sourceArticleLabel','','targetArticleLabel','')",fresh,'RELATION_CAPACITY','new incoming relation cannot make endpoint unreadable');
 rejects('c','save',"payload||jsonb_build_object('sourceNormId',cap_norms[4],'sourceArticleLabel','','targetArticleLabel','')",fresh,'RELATION_CAPACITY','new outgoing relation cannot make endpoint unreadable');
 ok('(SELECT count(*)=1003 FROM legal_norm_relation) AND (SELECT count(*)=1006 FROM legal_norm_relation_event)','capacity rejection remains atomic');

 const environmentGuard=ci?"current_setting('neon.project_id',true) IS NOT NULL OR current_setting('neon.branch_id',true) IS NOT NULL":`current_setting('neon.project_id',true) IS DISTINCT FROM ${quote(projectId)} OR current_setting('neon.branch_id',true) IS DISTINCT FROM ${quote(branchId)}`;
 const pins=`IF ${environmentGuard} OR current_setting('server_version_num')::int/10000<>${Number(serverMajor)} THEN RAISE EXCEPTION 'RELATION_QA_TARGET_INVALID'; END IF;`;
 const tables=`
 CREATE TABLE internal_users(email text PRIMARY KEY,active boolean,auth_mode text,identity_version integer);
 CREATE TABLE platform_tenant(id uuid PRIMARY KEY,status text);
 CREATE TABLE tenant_membership(id uuid PRIMARY KEY,tenant_id uuid,user_email text,status text,UNIQUE(id,tenant_id));
 CREATE TABLE tenant_identity_session(id uuid PRIMARY KEY,user_email text,active_tenant_id uuid,session_version integer,identity_version integer,source text,auth_level text,status text,expires_at timestamptz,last_seen_at timestamptz);
 CREATE TABLE capabilities(membership_id uuid,capability_key text);
 CREATE FUNCTION tenant_iam_assert_no_sod_conflict(uuid) RETURNS void LANGUAGE sql AS 'SELECT NULL::void';
 CREATE FUNCTION tenant_iam_effective_capabilities(mid uuid) RETURNS TABLE(capability_key text) LANGUAGE sql SET search_path=pg_catalog,${schema},pg_temp AS $f$ SELECT c.capability_key FROM capabilities c WHERE c.membership_id=mid $f$;
 ${registry.slice(registry.indexOf('CREATE TABLE legal_norm ('),registry.indexOf('CREATE INDEX legal_norm_revision_search'))}
 ${immutable}
 ${relocate(context)}
 ${relocate(detail)}
 ${relocate(migration)}
 CREATE FUNCTION qa_assert(v boolean,label text) RETURNS void LANGUAGE plpgsql AS $f$ BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'RELATION_QA_FAILED: %',label; END IF; END $f$;
 CREATE FUNCTION qa_rejects(p jsonb,op text,d jsonb,k uuid,wanted text) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,${schema},pg_temp AS $f$
 BEGIN PERFORM legal_norm_relation_operation_v1(p,op,d,k); RETURN false; EXCEPTION WHEN OTHERS THEN IF SQLERRM=wanted THEN RETURN true; END IF; RAISE; END $f$;
 CREATE FUNCTION qa_sql_rejects(statement text,wanted text) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,${schema},pg_temp AS $f$
 BEGIN EXECUTE statement; RETURN false; EXCEPTION WHEN OTHERS THEN IF SQLSTATE=wanted THEN RETURN true; END IF; RAISE; END $f$;
 `;
 const memberships=[writer,reader,peer,outsider,blocked];
 const fixtures=`
 INSERT INTO platform_tenant VALUES(${quote(ids.tenant)},'active'),(${quote(ids.otherTenant)},'active'),(${quote(ids.blockedTenant)},'active');
 ${memberships.map(c=>`INSERT INTO internal_users VALUES(${quote(c.actorEmail)},true,'managed',1);
 INSERT INTO tenant_membership VALUES(${quote(c.membershipId)},${quote(c.tenantId)},${quote(c.actorEmail)},'active');
 INSERT INTO tenant_identity_session VALUES(${quote(c.actorSessionId)},${quote(c.actorEmail)},${quote(c.tenantId)},1,1,'membership','mfa','active',now()+interval '1 hour',now());`).join('\n')}
 INSERT INTO capabilities SELECT id,'legal.norm.read' FROM tenant_membership;
 INSERT INTO capabilities SELECT id,'legal.norm.register' FROM tenant_membership WHERE user_email<>'reader@example.invalid';
 INSERT INTO legal_norm(id,tenant_id,kind,issuer,number,year,current_version) VALUES
 (${quote(ids.source)},${quote(ids.tenant)},'ordenanza','HCD','QA-SOURCE',2026,2),
 (${quote(ids.target)},${quote(ids.tenant)},'decreto','EJECUTIVO','QA-TARGET',2026,2),
 (${quote(ids.foreignNorm)},${quote(ids.otherTenant)},'ordenanza','HCD','QA-FOREIGN',2026,1);
 INSERT INTO legal_norm_document(id,tenant_id,norm_id,filename,content,sha256,pages) VALUES
 (${quote(ids.sourceDoc)},${quote(ids.tenant)},${quote(ids.source)},'source.pdf',decode(repeat('61',10),'hex'),repeat('0',64),1),
 (${quote(ids.targetDoc)},${quote(ids.tenant)},${quote(ids.target)},'target.pdf',decode(repeat('61',10),'hex'),repeat('0',64),1),
 (${quote(ids.foreignDoc)},${quote(ids.otherTenant)},${quote(ids.foreignNorm)},'foreign.pdf',decode(repeat('61',10),'hex'),repeat('0',64),1);
 INSERT INTO legal_norm_revision(tenant_id,norm_id,version,document_id,metadata,search_text,reason,actor_membership_id,actor_session_id,actor_email)
 SELECT n.tenant_id,n.id,v,d.id,jsonb_build_object('title',CASE WHEN n.id=${quote(ids.source)}::uuid THEN 'Norma fuente versión ' ELSE 'Norma destino versión ' END||v,'articles',jsonb_build_array(jsonb_build_object('label','Artículo '||v,'text','Texto documental sintético','page',1))),'ensayo','Alta documental sintética',m.id,s.id,m.user_email
 FROM legal_norm n JOIN legal_norm_document d ON d.norm_id=n.id JOIN tenant_membership m ON m.tenant_id=n.tenant_id AND m.user_email IN ('writer@example.invalid','outsider@example.invalid') JOIN tenant_identity_session s ON s.user_email=m.user_email CROSS JOIN LATERAL generate_series(1,n.current_version) v;
 `;
 const sha=createHash('sha256').update(migration).digest('hex');
 const report={ok:true,checksPassed:checks,serverMajor:Number(serverMajor),migrationSha256:sha,syntheticSchemaRolledBack:true,municipalRowsWritten:0,concurrentConnectionCheck:requireConcurrency,ci,limitations:['IAM capability resolver uses a synthetic table; separation-of-duties helper is a stub. Actual legal session, MFA, tenant and capability checks run unchanged.','The migration is tested in an isolated schema; installed public function identity and ACLs require separate catalog checks.']};
 const sql=`-- Generated from migration SHA256 ${sha}; all fixtures live in ${schema}.
 BEGIN ISOLATION LEVEL READ COMMITTED;
 SET LOCAL statement_timeout='90s';
 SET LOCAL lock_timeout='2s';
 DO $qa$
 DECLARE c jsonb:=${json(writer)}; r jsonb:=${json(reader)}; peer jsonb:=${json(peer)}; outside jsonb:=${json(outsider)}; blocked jsonb:=${json(blocked)};
payload jsonb:=${json(body)}; result jsonb; receipt jsonb; cancel_receipt jsonb; replacement_receipt jsonb; relation_id uuid; checks integer:=0; i integer; cap_norm_id uuid; cap_norms uuid[]:=ARRAY[]::uuid[];
 BEGIN
 ${pins}
 IF to_regnamespace(${quote(schema)}) IS NOT NULL THEN RAISE EXCEPTION 'RELATION_QA_SCHEMA_EXISTS'; END IF;
 BEGIN
 CREATE SCHEMA ${schema};
 SET LOCAL search_path=${schema},pg_catalog,public,pg_temp;
 ${tables}
 ${fixtures}
 ${statements.join('\n ')}
 RAISE EXCEPTION USING ERRCODE='P0900',MESSAGE='RELATION_QA_ROLLBACK_SUCCESS';
 EXCEPTION WHEN SQLSTATE 'P0900' THEN NULL;
 END;
 IF to_regnamespace(${quote(schema)}) IS NOT NULL OR checks<>${checks} THEN RAISE EXCEPTION 'RELATION_QA_NOT_ROLLED_BACK'; END IF;
 PERFORM set_config('mc.relations_qa_report',${json(report)}::text,true);
 END $qa$;
 SELECT current_setting('mc.relations_qa_report')::jsonb AS evidence;
 ROLLBACK;
 `;
 const lockSql=`-- Hold only a transaction-scoped advisory lock; creates no rows or schemas.
 BEGIN;
 DO $pins$ BEGIN ${pins} END $pins$;
SELECT pg_advisory_xact_lock(hashtextextended(${quote('legal-norm-relation:'+ids.blockedTenant)},0));
SELECT 'RELATION_QA_LOCK_READY' AS readiness;
 SELECT pg_sleep(45);
 ROLLBACK;
 `;
 assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql),'No public fixture writes permitted');
 return {sql,lockSql,schema,ids,report};
}

async function main(){
 const args={};
 for(const arg of process.argv.slice(2)){
  if(arg==='--help'){console.log('CI (execute output using psql -v ON_ERROR_STOP=1 -f PATH): node scripts/verify-legal-norm-relations-sql.mjs --ci --expected-major=17 --write-sql=PATH [--require-concurrency --write-lock-sql=LOCK_PATH]\nCI prerequisites on the disposable database: CREATE EXTENSION pgcrypto; CREATE ROLE municontrol_actions_runtime_app;\nNeon offline: node scripts/verify-legal-norm-relations-sql.mjs --expected-project=PROJECT --expected-branch=BRANCH --expected-major=18 --write-sql=PATH [--require-concurrency --write-lock-sql=PATH]\nRun with two connections: MC_RELATIONS_QA_DATABASE_URL=... node scripts/verify-legal-norm-relations-sql.mjs --expected-project=PROJECT --expected-branch=BRANCH --expected-major=18 --expected-host=HOST\nOptional MC_RELATIONS_QA_PG_MODULE supplies an existing pg module path. Execution always checks an independent connection holding the advisory lock.');return;}
  if(arg==='--ci'){args.ci=true;continue;}
  if(arg==='--require-concurrency'){args.requireConcurrency=true;continue;}
  const match=/^--(expected-project|expected-branch|expected-major|expected-host|write-sql|write-lock-sql)=(.+)$/.exec(arg);
  assert.ok(match,'Unknown or incomplete argument');assert.equal(args[match[1]],undefined,'Duplicate argument');args[match[1]]=match[2];
 }
 const offline=Boolean(args['write-sql']);
 assert.ok(!args.ci||offline,'--ci requires --write-sql; execute generated SQL using psql');
 const test=buildRelationsQa({projectId:args['expected-project'],branchId:args['expected-branch'],serverMajor:args['expected-major'],requireConcurrency:offline?Boolean(args.requireConcurrency):true,ci:Boolean(args.ci)});
 if(offline){
  assert.ok(!args.requireConcurrency||args['write-lock-sql'],'Concurrent SQL emission requires --write-lock-sql for the independent connection');
  for(const [key,contents] of [['write-sql',test.sql],['write-lock-sql',test.lockSql]])if(args[key]){const output=path.resolve(args[key]);assert.ok(!fs.existsSync(output),'Output already exists; choose a new review artifact path');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,contents,{flag:'wx'});}
  console.log(JSON.stringify({generated:true,databaseExecuted:false,sqlPath:path.resolve(args['write-sql']),lockSqlPath:args['write-lock-sql']?path.resolve(args['write-lock-sql']):null,checksPlanned:test.report.checksPassed,migrationSha256:test.report.migrationSha256,concurrentConnectionCheckPlanned:test.report.concurrentConnectionCheck}));return;
 }
 assert.ok(!args['write-lock-sql'],'--write-lock-sql requires --write-sql');
 const url=new URL(process.env.MC_RELATIONS_QA_DATABASE_URL||'');
 assert.ok(args['expected-host'],'Explicit expected host required for execution');assert.equal(url.hostname,args['expected-host']);assert.equal(url.pathname,'/neondb');
 const module=process.env.MC_RELATIONS_QA_PG_MODULE;
 const pg=await import(module?(path.isAbsolute(module)?pathToFileURL(module).href:module):'@neondatabase/serverless');
 const Client=pg.Client??pg.default?.Client;assert.equal(typeof Client,'function','PostgreSQL Client export required');
 const options={connectionString:url.href,application_name:'mc_legal_relations_090_isolated_qa',connectionTimeoutMillis:10000};
 const client=new Client(options),blocker=new Client(options);let connected=false,blockedConnected=false;
 try{
  await client.connect();connected=true;await blocker.connect();blockedConnected=true;
  for(const connection of [client,blocker]){
   const current=(await connection.query("SELECT current_setting('neon.project_id',true) project,current_setting('neon.branch_id',true) branch,current_setting('server_version_num')::int/10000 major")).rows[0];
   assert.equal(current.project,args['expected-project']);assert.equal(current.branch,args['expected-branch']);assert.equal(Number(current.major),Number(args['expected-major']));
  }
  await blocker.query('BEGIN');
  await blocker.query("SET LOCAL idle_in_transaction_session_timeout='120s'");
  await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['legal-norm-relation:'+test.ids.blockedTenant]);
  const raw=await client.query(test.sql),results=Array.isArray(raw)?raw:[raw];
  const evidence=results.find(r=>r.rows?.[0]?.evidence)?.rows[0].evidence;
  assert.deepEqual(evidence,test.report);
  assert.equal((await client.query('SELECT to_regnamespace($1) IS NULL AS absent',[test.schema])).rows[0].absent,true);
  console.log(JSON.stringify(evidence));
 }finally{
  if(connected)await client.query('ROLLBACK').catch(()=>{});
  if(blockedConnected)await blocker.query('ROLLBACK').catch(()=>{});
  if(connected)await client.end();if(blockedConnected)await blocker.end();
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({ok:false,message:String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/gi,'[redacted connection URL]'),code:error.code||null}));process.exitCode=1;});
