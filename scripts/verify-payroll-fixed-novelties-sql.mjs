// Generate isolated PostgreSQL 17/18 CI checks. This file never connects to a database.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migrationDir=path.join(root,'scripts/migrations');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const j=value=>q(JSON.stringify(value))+'::jsonb';
const sha=value=>createHash('sha256').update(value).digest('hex');
// Resolve the installed definition in migration order, including later replacements.
// Preserve its body exactly; only schema references are relocated for this CI transaction.
function latestFunction(name){
 const definitions=[];
 for(const file of fs.readdirSync(migrationDir).filter(name=>/^\d{3}-.+\.sql$/.test(name)).sort()){
  const source=fs.readFileSync(path.join(migrationDir,file),'utf8');
  const pattern=new RegExp('CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?'+name+'\\s*\\(','gi');
  for(const match of source.matchAll(pattern)){
   const start=match.index,open=source.indexOf('$$',start),close=source.indexOf('$$',open+2);
   assert.ok(open>start&&close>open,'Expected dollar-quoted original function: '+name);
   const end=source.indexOf(';',close+2);assert.ok(end>close,'Missing function terminator: '+name);
   definitions.push({file,sql:source.slice(start,end+1)});
  }
 }
 assert.ok(definitions.length,'Original authorization function missing: '+name);
 return {...definitions.at(-1),versions:definitions.map(({file})=>file)};
}

export function buildFixedNoveltiesQa({serverMajor,requireConcurrency=false}){
 assert.ok([17,18].includes(Number(serverMajor)),'Expected PostgreSQL major must be 17 or 18');
 const schema='mc_qa_fixed_092_'+randomUUID().replaceAll('-','');
 const migration=fs.readFileSync(path.join(migrationDir,'092-payroll-fixed-novelties.sql'),'utf8');
 for(const operation of ['bootstrap','employee','list','detail','attempt','export','propose','review'])assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.payroll_fixed_'+operation+'_v1('),'Migration 092 is incomplete: missing '+operation+' facade');
 const authorization=latestFunction('payroll_novelty_assert_context_v1');
 const relocate=source=>source.replaceAll('public.',schema+'.')
  .replaceAll(schema+'.digest(','public.digest(')
  .replace(/SET search_path\s*=\s*public,\s*pg_temp/gi,`SET search_path=pg_catalog,${schema},public,pg_temp`)
  .replace(/SET search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/gi,`SET search_path=pg_catalog,${schema},public,pg_temp`);
 const ids=Object.fromEntries(['tenant','foreignTenant','blockedTenant','binding','foreignBinding','blockedBinding','sourceBatch','foreignBatch','blockedBatch','maker','checker','samePerson','reader','unlinked','outsider','blocked','makerSession','checkerSession','samePersonSession','readerSession','unlinkedSession','outsiderSession','blockedSession','makerPerson','checkerPerson','targetPerson','foreignPerson','blockedPerson','makerContract','checkerContract','targetContract','foreignContract','blockedContract'].map(name=>[name,randomUUID()]));
 const release='9'.repeat(40);
 const context=(member,session,tenant,email)=>({actorEmail:email,actorSessionId:session,actorSessionVersion:1,membershipId:member,releaseSha:release,tenantId:tenant});
 const actors={
  maker:context(ids.maker,ids.makerSession,ids.tenant,'maker@example.invalid'),
  checker:context(ids.checker,ids.checkerSession,ids.tenant,'checker@example.invalid'),
  samePerson:context(ids.samePerson,ids.samePersonSession,ids.tenant,'same-person@example.invalid'),
  reader:context(ids.reader,ids.readerSession,ids.tenant,'reader@example.invalid'),
  unlinked:context(ids.unlinked,ids.unlinkedSession,ids.tenant,'unlinked@example.invalid'),
  outsider:context(ids.outsider,ids.outsiderSession,ids.foreignTenant,'outsider@example.invalid'),
  blocked:context(ids.blocked,ids.blockedSession,ids.blockedTenant,'blocked@example.invalid'),
 };
 const statements=[];let checks=0;
 const exec=sql=>statements.push(sql);
 const ok=(expression,label)=>{statements.push(`PERFORM qa_assert((${expression}),${q(label)}); checks:=checks+1;`);checks++;};
 const rejects=(statement,error,label)=>ok(`qa_rejects(${statement},${q(error)})`,label);
 const call=(operation,actor='maker',tail='')=>`payroll_fixed_${operation}_v1(${actor}${tail?', '+tail:''})`;
 const rejectCall=(operation,tail,values,error,label,actor='maker')=>rejects(`format(${q('SELECT '+call(operation,'%1$L::jsonb',tail))},${[actor,...values].join(',')})`,'PAYROLL_FIXED_'+error,label);
 const propose=(payload,key=q(randomUUID())+'::uuid',actor='maker')=>call('propose',actor,`${payload},${key}`);
 const review=(payload,key=q(randomUUID())+'::uuid',actor='checker')=>call('review',actor,`${payload},${key}`);
 const badPropose=(payload,error,label,actor='maker',key=q(randomUUID()))=>rejectCall('propose','%2$L::jsonb,%3$L::uuid',[payload,key],error,label,actor);
 const badReview=(payload,error,label,actor='checker',key=q(randomUUID()))=>rejectCall('review','%2$L::jsonb,%3$L::uuid',[payload,key],error,label,actor);
 const initialKey=randomUUID(),initialReviewKey=randomUUID();
 const values={conceptSourceId:'80',costCenterSourceId:null,payrollType:'monthly',quantityDecimal:'1.5',amountCents:null,forced:false,forcedReason:null,legalInstrument:'Declaración administrativa de ensayo',validFrom:'2026-01-15',validTo:null};
 const lockKey=`hashtextextended(${q('payroll-fixed:binding:v1:'+ids.blockedTenant+':'+ids.blockedBinding)},0)`;
 const baseTables=`
 CREATE TABLE platform_tenant(id uuid PRIMARY KEY,status text);
 CREATE TABLE internal_users(email text PRIMARY KEY,active boolean,identity_version integer);
 CREATE TABLE tenant_membership(id uuid PRIMARY KEY,tenant_id uuid,user_email text,role_key text,status text,UNIQUE(id,tenant_id));
 CREATE TABLE tenant_identity_session(id uuid PRIMARY KEY,user_email text,active_tenant_id uuid,session_version integer,identity_version integer,source text,auth_level text,status text,expires_at timestamptz,last_seen_at timestamptz);
 CREATE TABLE platform_tenant_source_binding(id uuid PRIMARY KEY,tenant_id uuid,source_system text,source_company_id bigint,source_database text,verified boolean,UNIQUE(tenant_id,id));
 CREATE TABLE tenant_identity_policy(tenant_id uuid PRIMARY KEY,tenant_data_plane_ready boolean,certified_release_sha text,certified_source_binding_id uuid);
 CREATE TABLE tenant_action_authority(membership_id uuid,tenant_id uuid);
 CREATE TABLE person_identity(id uuid PRIMARY KEY,full_name text);
 CREATE TABLE source_import_batch(id uuid PRIMARY KEY,source_system text,source_database text,validation_state text,legacy_import_run_id bigint,source_cutoff timestamptz);
 CREATE TABLE employment_contract(id uuid PRIMARY KEY,person_id uuid,source_system text,source_batch_id uuid,legacy_company_id bigint,legacy_legajo text,status text);
 CREATE TABLE employment_status_snapshot(employment_contract_id uuid,source_system text,source_batch_id uuid,administrative_status text,snapshot_date date,recorded_at timestamptz DEFAULT clock_timestamp());
 CREATE TABLE tenant_action_employment_link(membership_id uuid,tenant_id uuid,source_binding_id uuid,employment_contract_id uuid,active boolean);
 CREATE TABLE capabilities(membership_id uuid,capability_key text);
 CREATE FUNCTION tenant_iam_assert_no_sod_conflict(uuid) RETURNS void LANGUAGE sql AS 'SELECT NULL::void';
 CREATE FUNCTION tenant_iam_effective_capabilities(mid uuid) RETURNS TABLE(capability_key text) LANGUAGE sql SET search_path=pg_catalog,${schema},pg_temp AS $f$ SELECT c.capability_key FROM capabilities c WHERE c.membership_id=mid $f$;
 ${relocate(authorization.sql)}
 REVOKE ALL ON FUNCTION payroll_novelty_assert_context_v1(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
 CREATE FUNCTION qa_assert(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $f$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FIXED_NOVELTIES_QA_FAILED: %',label; END IF; END $f$;
 CREATE FUNCTION qa_rejects(statement text,wanted text) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,${schema},public,pg_temp AS $f$
 BEGIN EXECUTE statement; RETURN false; EXCEPTION WHEN OTHERS THEN IF SQLERRM=wanted THEN RETURN true; END IF; RAISE; END $f$;
 `;
 const fixtures=`
 INSERT INTO platform_tenant VALUES(${q(ids.tenant)},'active'),(${q(ids.foreignTenant)},'active'),(${q(ids.blockedTenant)},'active');
 INSERT INTO platform_tenant_source_binding VALUES(${q(ids.binding)},${q(ids.tenant)},'GRH',101,'qa_fixed_source',true),(${q(ids.foreignBinding)},${q(ids.foreignTenant)},'GRH',202,'qa_fixed_foreign',true),(${q(ids.blockedBinding)},${q(ids.blockedTenant)},'GRH',303,'qa_fixed_blocked',true);
 INSERT INTO tenant_identity_policy SELECT tenant_id,true,${q(release)},id FROM platform_tenant_source_binding;
 ${Object.values(actors).map(a=>`INSERT INTO internal_users VALUES(${q(a.actorEmail)},true,1);
 INSERT INTO tenant_membership VALUES(${q(a.membershipId)},${q(a.tenantId)},${q(a.actorEmail)},'QA_ROLE','active');
 INSERT INTO tenant_identity_session VALUES(${q(a.actorSessionId)},${q(a.actorEmail)},${q(a.tenantId)},1,1,'membership','mfa','active',now()+interval '1 hour',now());
 INSERT INTO tenant_action_authority VALUES(${q(a.membershipId)},${q(a.tenantId)});`).join('\n')}
 INSERT INTO capabilities SELECT id,c FROM tenant_membership CROSS JOIN unnest(ARRAY['payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.audit.read']) c;
 INSERT INTO capabilities SELECT id,c FROM tenant_membership CROSS JOIN unnest(ARRAY['payroll.novelty.prepare','payroll.novelty.export']) c WHERE user_email IN ('maker@example.invalid','outsider@example.invalid','blocked@example.invalid');
 INSERT INTO capabilities SELECT id,'payroll.novelty.approve' FROM tenant_membership WHERE user_email IN ('maker@example.invalid','checker@example.invalid','same-person@example.invalid','unlinked@example.invalid','outsider@example.invalid');
 INSERT INTO capabilities VALUES(${q(ids.unlinked)},'payroll.novelty.prepare');
 INSERT INTO person_identity VALUES(${q(ids.makerPerson)},'Preparador de ensayo'),(${q(ids.checkerPerson)},'Revisor de ensayo'),(${q(ids.targetPerson)},'Agente destinatario de ensayo'),(${q(ids.foreignPerson)},'Agente de otro municipio'),(${q(ids.blockedPerson)},'Agente para concurrencia');
 INSERT INTO source_import_batch VALUES(${q(ids.sourceBatch)},'GRH','qa_fixed_source','published',92001,'2026-09-10T00:00:00Z'),(${q(ids.foreignBatch)},'GRH','qa_fixed_foreign','published',92002,'2026-09-10T00:00:00Z'),(${q(ids.blockedBatch)},'GRH','qa_fixed_blocked','published',92003,'2026-09-10T00:00:00Z');
 INSERT INTO employment_contract VALUES(${q(ids.makerContract)},${q(ids.makerPerson)},'GRH',${q(ids.sourceBatch)},101,'901','active'),(${q(ids.checkerContract)},${q(ids.checkerPerson)},'GRH',${q(ids.sourceBatch)},101,'902','active'),(${q(ids.targetContract)},${q(ids.targetPerson)},'GRH',${q(ids.sourceBatch)},101,'903','active'),(${q(ids.foreignContract)},${q(ids.foreignPerson)},'GRH',${q(ids.foreignBatch)},202,'904','active'),(${q(ids.blockedContract)},${q(ids.blockedPerson)},'GRH',${q(ids.blockedBatch)},303,'905','active');
 INSERT INTO employment_status_snapshot SELECT id,'GRH',source_batch_id,'active','2026-09-10',clock_timestamp() FROM employment_contract;
 INSERT INTO tenant_action_employment_link VALUES(${q(ids.maker)},${q(ids.tenant)},${q(ids.binding)},${q(ids.makerContract)},true),(${q(ids.checker)},${q(ids.tenant)},${q(ids.binding)},${q(ids.checkerContract)},true),(${q(ids.samePerson)},${q(ids.tenant)},${q(ids.binding)},${q(ids.makerContract)},true),(${q(ids.outsider)},${q(ids.foreignTenant)},${q(ids.foreignBinding)},${q(ids.foreignContract)},true),(${q(ids.blocked)},${q(ids.blockedTenant)},${q(ids.blockedBinding)},${q(ids.blockedContract)},true);
 `;
 exec("ctx:=payroll_novelty_assert_context_v1(maker,'payroll.novelty.prepare');");
 ok(`ctx->>'tenantId'=${q(ids.tenant)} AND ctx->>'certifiedBindingId'=${q(ids.binding)} AND ctx->>'actorPersonId'=${q(ids.makerPerson)}`,'original authorization resolves certified scope and actual actor person');
 exec("ctx:=payroll_novelty_assert_context_v1(same_person,'payroll.novelty.approve');");
 ok(`ctx->>'membershipId'=${q(ids.samePerson)} AND ctx->>'actorPersonId'=${q(ids.makerPerson)}`,'independent login cannot change its linked canonical person');
 exec(`result:=${call('bootstrap')};`);
 ok(`result->>'version'='payroll-fixed-bootstrap.v1' AND result#>>'{principal,certifiedBindingId}'=${q(ids.binding)} AND result#>>'{limits,maxRecords}'='500' AND result#>>'{limits,maxHistory}'='100'`,'real bootstrap exposes certified scope and bounded record/history limits');
 ok("result#>>'{effects,approvalEffect}'='control_export_only' AND result#>>'{effects,grhMutation}'='false' AND result#>>'{effects,payrollCalculated}'='false' AND result#>>'{effects,payrollPosted}'='false'",'fixed novelties never claim GRH mutation, calculation or payroll posting');
 exec(`result:=${call('employee','maker',"'903'")}; subject:=result->'subject';
 payload:=jsonb_build_object('recordId',NULL,'expectedVersion',0,'contractId',subject->>'contractId','legajo',subject->>'legajo','identityToken',subject->>'identityToken','operation','set','values',${j(values)},'reason','Alta permanente de ensayo');
 initial_payload:=payload;
 SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY id)::text) INTO contracts_before FROM employment_contract c;`);
 ok(`result->>'version'='payroll-fixed-employee.v1' AND subject->>'contractId'=${q(ids.targetContract)} AND subject->>'legajo'='903' AND length(subject->>'identityToken')=64`,'exact legajo lookup resolves canonical contract and identity');
 rejectCall('employee','%2$L',["'Agente'"],'INVALID_PAYLOAD','employee lookup does not search by name');
 rejectCall('employee','%2$L',["'0903'"],'INVALID_PAYLOAD','noncanonical legajo cannot silently select another employee');
 if(requireConcurrency){
  ok(`EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid<>pg_backend_pid() AND granted AND objsubid=1 AND classid=(((${lockKey})>>32)&4294967295)::oid AND objid=((${lockKey})&4294967295)::oid)`,'second connection holds this exact certified binding lock');
  exec(`result:=${call('employee','blocked',"'905'")};`);
  badPropose("payload||jsonb_build_object('contractId',result#>>'{subject,contractId}','legajo',result#>>'{subject,legajo}','identityToken',result#>>'{subject,identityToken}')",'SESSION_BUSY','independent concurrent binding writer fails before any mutation','blocked');
 }
 exec(`receipt:=${propose('payload',q(initialKey)+'::uuid')}; record_id:=(receipt->>'recordId')::uuid; proposal_id:=(receipt->>'proposalId')::uuid;`);
 ok("receipt->>'version'='payroll-fixed-receipt.v1' AND receipt->>'command'='propose' AND receipt->>'recordVersion'='1' AND receipt->>'duplicate'='false'",'first proposal returns an immutable version-one receipt');
 exec(`result:=${call('detail','maker','record_id')};`);
 ok("result#>>'{record,version}'='1' AND result#>'{record,approved}'='null'::jsonb AND result#>>'{record,pending,id}'=proposal_id::text AND result#>>'{record,pending,proposedBy}'=maker->>'actorEmail'",'pending proposal is distinct from approval and actor is server-resolved');
 ok("result#>>'{record,canPropose}'='false' AND result#>>'{record,pending,canReview}'='false'",'maker cannot propose over pending state or review own proposal');
 exec(`result:=${call('detail','checker','record_id')};`);
 ok("result#>>'{record,pending,canReview}'='true' AND result#>>'{record,canPropose}'='false'",'independent linked checker receives only the allowed review action');
 exec(`result:=${call('detail','same_person','record_id')};`);
 ok("result#>>'{record,pending,canReview}'='false'",'row permission refuses another membership of the same canonical person');
 exec(`result:=${call('detail','maker','record_id')};`);
 ok("result#>'{record,pending,values,validTo}'='null'::jsonb AND result#>'{record,pending,values,amountCents}'='null'::jsonb AND result#>>'{record,pending,values,quantityDecimal}'='1.5'",'no default end date, amount or concept-80 rule is invented');
 exec(`result:=${call('list','maker',"DATE '2026-06-01'")}; snapshot:=result->>'snapshotToken';
 result:=${call('export','maker',"DATE '2026-06-01',snapshot")};`);
 ok("result->>'total'='0' AND jsonb_array_length(result->'rows')=0",'pending declaration does not enter approved export');
 exec(`result:=${propose('initial_payload',q(initialKey)+'::uuid')};`);
 ok("result->>'recordVersion'='1' AND result->>'recordId'=record_id::text AND result->>'proposalId'=proposal_id::text AND result->>'duplicate'='true'",'exact proposal retry yields original receipt');
 badPropose("initial_payload||'{\"reason\":\"Intento diferente de ensayo\"}'",'IDEMPOTENCY_REUSE','same key with another body is rejected','maker',q(initialKey));
 badPropose("payload||jsonb_build_object('recordId',record_id,'expectedVersion',1)",'PENDING_EXISTS','one pending proposal per record');
 exec("review_payload:=jsonb_build_object('recordId',record_id,'proposalId',proposal_id,'expectedVersion',1,'decision','approve','reason','Revisión administrativa de ensayo');");
 badReview('review_payload','MAKER_CHECKER_REQUIRED','maker cannot approve own proposal','maker');
 badReview('review_payload','MAKER_CHECKER_REQUIRED','another login of the same canonical person cannot approve','same_person');
 badReview('review_payload','EMPLOYMENT_REQUIRED','unlinked reviewer cannot approve','unlinked');
 badReview("review_payload||'{\"expectedVersion\":99}'",'VERSION_CONFLICT','review cannot rebase a stale version');
 exec(`approved_receipt:=${review('review_payload',q(initialReviewKey)+'::uuid')}; initial_review:=review_payload;
 result:=${call('detail','maker','record_id')};`);
 ok("approved_receipt->>'recordVersion'='2' AND result#>>'{record,version}'='2' AND result#>'{record,pending}'='null'::jsonb AND result#>>'{record,approved,id}'=proposal_id::text AND result#>>'{record,approved,review,reviewedBy}'=checker->>'actorEmail'",'different person approves and clears only the pending state');
 ok("result#>>'{record,canPropose}'='true' AND result#>>'{record,approved,canReview}'='false'",'reviewed proposal is immutable while preparer may propose the next version');
 exec(`result:=${call('detail','unlinked','record_id')};`);
 ok("result#>>'{record,canPropose}'='false'",'prepare capability alone cannot grant a row action without a canonical actor person');
 exec(`result:=${call('list','maker',"DATE '2026-06-01'")}; snapshot:=result->>'snapshotToken';
 result:=${call('export','maker',"DATE '2026-06-01',snapshot")};`);
 ok("result->>'total'='1' AND result#>>'{rows,0,recordId}'=record_id::text AND result#>>'{rows,0,values,quantityDecimal}'='1.5' AND result#>'{rows,0,values,amountCents}'='null'::jsonb",'export includes only the approved immutable values');
 exec(`payload:=initial_payload||jsonb_build_object('recordId',record_id,'expectedVersion',2,'values',${j(values)}||jsonb_build_object('quantityDecimal','2','amountCents','12345','validFrom','2026-06-15','validTo','2026-06-30'),'reason','Corrección del registro de ensayo');
 change_receipt:=${propose('payload')};`);
 badPropose("payload||'{\"expectedVersion\":1}'",'VERSION_CONFLICT','proposal cannot silently overwrite a newer version');
 rejectCall('export',"DATE '2026-06-01',%2$L",['snapshot'],'SNAPSHOT_CHANGED','export requires the exact current list snapshot after proposal changes');
 exec(`result:=${call('list','maker',"DATE '2026-06-01'")}; snapshot:=result->>'snapshotToken';
 result:=${call('export','maker',"DATE '2026-06-01',snapshot")};`);
 ok("result#>>'{rows,0,values,quantityDecimal}'='1.5'",'unreviewed change preserves the effective approved values');
 exec(`review_payload:=jsonb_build_object('recordId',record_id,'proposalId',change_receipt->>'proposalId','expectedVersion',3,'decision','reject','reason','Rechazo administrativo de ensayo');
 result:=${review('review_payload')};
 result:=${call('detail','maker','record_id')};`);
 ok("result#>>'{record,version}'='4' AND result#>>'{record,approved,id}'=proposal_id::text AND result#>'{record,pending}'='null'::jsonb AND result#>>'{record,latest,review,decision}'='reject'",'rejection never replaces the previous effective approval');
 exec(`payload:=payload||'{"expectedVersion":4}'::jsonb; change_receipt:=${propose('payload')};
 review_payload:=jsonb_build_object('recordId',record_id,'proposalId',change_receipt->>'proposalId','expectedVersion',5,'decision','approve','reason','Aprobación de corrección de ensayo');
 result:=${review('review_payload')};
 result:=${call('list','maker',"DATE '2026-06-01'")}; snapshot:=result->>'snapshotToken';
 result:=${call('export','maker',"DATE '2026-06-01',snapshot")};`);
 ok("result#>>'{rows,0,proposalId}'=change_receipt->>'proposalId' AND result#>>'{rows,0,values,quantityDecimal}'='2' AND result#>>'{rows,0,values,amountCents}'='12345'",'partial-month validity exports declared amounts without prorating or salary calculations');
 exec(`result:=${propose('initial_payload',q(initialKey)+'::uuid')};`);
 ok("result->>'recordVersion'='1' AND result->>'duplicate'='true'",'proposal replay preserves the old receipt after later reviews and revisions');
 exec(`result:=${review('initial_review',q(initialReviewKey)+'::uuid')};`);
 ok("result->>'recordVersion'='2' AND result->>'duplicate'='true'",'review replay preserves its original receipt after later revisions');
 badReview("initial_review||'{\"reason\":\"Otra revisión diferente\"}'",'IDEMPOTENCY_REUSE','review key cannot be reused for altered content','checker',q(initialReviewKey));
 exec(`result:=${call('attempt','maker',`'propose',${q(initialKey)}::uuid`)};`);
 ok("result->>'recordVersion'='1' AND result->>'duplicate'='true'",'lost response recovery returns the exact prior actor-bound proposal');
 rejectCall('attempt',"'review',%2$L::uuid",[q(initialReviewKey)],'NOT_FOUND','attempt key cannot be recovered by a different membership');
 rejectCall('detail','%2$L::uuid',['record_id'],'NOT_FOUND','foreign tenant cannot read another record','outsider');
 badPropose('initial_payload','NOT_FOUND','foreign tenant cannot propose against another source contract','outsider');
 badPropose('payload','CAPABILITY_REQUIRED','read-only actor cannot propose','reader');
 badPropose('initial_payload','EMPLOYMENT_REQUIRED','unlinked actor cannot prepare even with capability','unlinked');
 badReview('review_payload','CAPABILITY_REQUIRED','read-only actor cannot review','reader');
 rejectCall('export',"DATE '2026-06-01',%2$L",['snapshot'],'CAPABILITY_REQUIRED','read-only actor cannot export nominal values','reader');

 // Inclusive civil overlap: a shared boundary day conflicts; next day does not.
 exec(`second_payload:=initial_payload||jsonb_build_object('values',${j(values)}||jsonb_build_object('validFrom','2026-06-30','validTo','2026-06-30'));
 second_receipt:=${propose('second_payload')};
 review_payload:=jsonb_build_object('recordId',second_receipt->>'recordId','proposalId',second_receipt->>'proposalId','expectedVersion',1,'decision','approve','reason','Revisión de solapamiento de ensayo');`);
 badReview('review_payload','OVERLAP','overlapping approved identity/concept/centre/payroll is blocked on inclusive last day');
 exec(`result:=${call('detail','maker',"(second_receipt->>'recordId')::uuid")};`);
 ok("result#>>'{record,version}'='1' AND result#>'{record,approved}'='null'::jsonb AND result#>>'{record,pending,id}'=second_receipt->>'proposalId'",'failed approval leaves the pending proposal unchanged');
 exec(`result:=${review("review_payload||jsonb_build_object('decision','reject')")};
 second_payload:=second_payload||jsonb_build_object('recordId',second_receipt->>'recordId','expectedVersion',2,'values',${j(values)}||jsonb_build_object('validFrom','2026-07-01','validTo',NULL));
 second_receipt:=${propose('second_payload')};
 review_payload:=jsonb_build_object('recordId',second_receipt->>'recordId','proposalId',second_receipt->>'proposalId','expectedVersion',3,'decision','approve','reason','Revisión del período siguiente');
 result:=${review('review_payload')};`);
 ok("result->>'recordVersion'='4'",'nonoverlapping next-day approved period is allowed');
 // An annulment is a proposal and preserves approval until independently approved.
 exec(`annul_payload:=initial_payload||jsonb_build_object('recordId',record_id,'expectedVersion',6,'operation','annul','values',NULL,'reason','Anulación administrativa de ensayo');
 annul_receipt:=${propose('annul_payload')};
 result:=${call('detail','maker','record_id')};`);
 ok("result#>>'{record,approved,id}'=change_receipt->>'proposalId' AND result#>>'{record,pending,operation}'='annul'",'pending annulment retains the effective approved version');
 exec(`review_payload:=jsonb_build_object('recordId',record_id,'proposalId',annul_receipt->>'proposalId','expectedVersion',7,'decision','reject','reason','Rechazo de la anulación');
 result:=${review('review_payload')};
 result:=${call('detail','maker','record_id')};`);
 ok("result#>>'{record,version}'='8' AND result#>>'{record,approved,id}'=change_receipt->>'proposalId'",'rejected annulment leaves approval effective');
 exec(`annul_receipt:=${propose("annul_payload||'{\"expectedVersion\":8}'")};
 review_payload:=jsonb_build_object('recordId',record_id,'proposalId',annul_receipt->>'proposalId','expectedVersion',9,'decision','approve','reason','Aprobación de anulación');
 result:=${review('review_payload')};
 result:=${call('detail','maker','record_id')};`);
 ok("result#>>'{record,version}'='10' AND result#>>'{record,approved,operation}'='annul' AND jsonb_array_length(result->'history')=5 AND result#>>'{history,4,id}'=proposal_id::text",'approved annulment preserves complete proposal history and original identity');
 exec(`result:=${call('list','maker',"DATE '2026-06-01'")}; snapshot:=result->>'snapshotToken';
 result:=${call('export','maker',"DATE '2026-06-01',snapshot")};`);
 ok("result->>'total'='0'",'approved annulment removes that declaration from the current controlled export');
 // Every boundary invokes the unmodified session/binding assertion, including retries.
 for(const [mutation,undo,error,label] of [
  [`UPDATE tenant_identity_session SET session_version=2 WHERE id='${ids.makerSession}'`,`UPDATE tenant_identity_session SET session_version=1 WHERE id='${ids.makerSession}'`,'SESSION_INVALID','stale session version is rejected'],
  [`UPDATE tenant_identity_session SET auth_level='password' WHERE id='${ids.makerSession}'`,`UPDATE tenant_identity_session SET auth_level='mfa' WHERE id='${ids.makerSession}'`,'SESSION_INVALID','MFA is required for database reads'],
  [`UPDATE tenant_identity_session SET status='revoked' WHERE id='${ids.makerSession}'`,`UPDATE tenant_identity_session SET status='active' WHERE id='${ids.makerSession}'`,'SESSION_INVALID','revoked session cannot recover old attempts'],
  [`UPDATE internal_users SET identity_version=2 WHERE email='maker@example.invalid'`,`UPDATE internal_users SET identity_version=1 WHERE email='maker@example.invalid'`,'SESSION_INVALID','identity version change invalidates prior sessions'],
  [`UPDATE tenant_membership SET status='inactive' WHERE id='${ids.maker}'`,`UPDATE tenant_membership SET status='active' WHERE id='${ids.maker}'`,'SESSION_INVALID','inactive municipal membership is rejected'],
  [`UPDATE tenant_identity_policy SET certified_release_sha=repeat('0',40) WHERE tenant_id='${ids.tenant}'`,`UPDATE tenant_identity_policy SET certified_release_sha='${release}' WHERE tenant_id='${ids.tenant}'`,'RELEASE_NOT_CERTIFIED','uncertified release cannot read or replay'],
  [`UPDATE platform_tenant_source_binding SET verified=false WHERE id='${ids.binding}'`,`UPDATE platform_tenant_source_binding SET verified=true WHERE id='${ids.binding}'`,'BINDING_REQUIRED','uncertified binding fails closed'],
  [`DELETE FROM capabilities WHERE membership_id='${ids.maker}' AND capability_key='payroll.novelty.nominal.read'`,`INSERT INTO capabilities VALUES('${ids.maker}','payroll.novelty.nominal.read')`,'CAPABILITY_REQUIRED','nominal read permission is rechecked even for a known attempt'],
 ]){exec(mutation+';');rejectCall('attempt',"'propose',%2$L::uuid",[q(initialKey)],error,label);exec(undo+';');}
 exec(`DELETE FROM capabilities WHERE membership_id=${q(ids.maker)} AND capability_key='payroll.novelty.prepare';`);
 badPropose('initial_payload','CAPABILITY_REQUIRED','revoked preparation permission blocks idempotent replay','maker',q(initialKey));
 exec(`INSERT INTO capabilities VALUES(${q(ids.maker)},'payroll.novelty.prepare');
 DELETE FROM capabilities WHERE membership_id=${q(ids.checker)} AND capability_key='payroll.novelty.approve';`);
 badReview('initial_review','CAPABILITY_REQUIRED','revoked approval permission blocks prior review replay','checker',q(initialReviewKey));
 exec(`INSERT INTO capabilities VALUES(${q(ids.checker)},'payroll.novelty.approve');
 DELETE FROM capabilities WHERE membership_id=${q(ids.maker)} AND capability_key='payroll.novelty.export';`);
 rejectCall('export',"DATE '2026-06-01',%2$L",['snapshot'],'CAPABILITY_REQUIRED','export capability is revalidated after selection');
 exec(`INSERT INTO capabilities VALUES(${q(ids.maker)},'payroll.novelty.export');`);
 for(const [body,error,label] of [
  ["'null'::jsonb",'INVALID_PAYLOAD','SQL rejects JSON-null proposal'],["initial_payload-'reason'",'INVALID_PAYLOAD','proposal shape is exact'],
  ["initial_payload||'{\"proposedBy\":\"forged@example.invalid\"}'",'INVALID_PAYLOAD','client cannot forge proposal author'],["initial_payload||'{\"reason\":\"<forged>\"}'",'INVALID_PAYLOAD','markup rejected in administrative reason'],
  ["jsonb_set(initial_payload,'{values,conceptSourceId}','\"080\"')",'INVALID_PAYLOAD','concept ID is canonical and not silently coerced'],
  ["jsonb_set(initial_payload,'{values,quantityDecimal}','null')",'INVALID_PAYLOAD','at least one explicit quantity or amount is required'],
  ["jsonb_set(initial_payload,'{values,quantityDecimal}','\"-0\"')",'INVALID_PAYLOAD','negative zero quantity rejected'],
  ["jsonb_set(initial_payload,'{values,amountCents}','\"-0\"')",'INVALID_PAYLOAD','negative zero amount rejected'],
  ["jsonb_set(initial_payload,'{values,amountCents}','12345')",'INVALID_PAYLOAD','amount uses exact decimal string not JSON floating point'],
  ["jsonb_set(initial_payload,'{values,amountCents}','\"1.50\"')",'INVALID_PAYLOAD','fractional cents rejected'],
  ["jsonb_set(initial_payload,'{values,quantityDecimal}','\"1.1234567\"')",'INVALID_PAYLOAD','quantity precision bounded'],
  ["jsonb_set(initial_payload,'{values,forced}','true')",'INVALID_PAYLOAD','forced declaration requires explicit justification'],
  ["initial_payload||jsonb_build_object('values',(initial_payload->'values')||jsonb_build_object('forced',true,'forcedReason','Fundamento declarado de ensayo'))",'INVALID_PAYLOAD','forced quantity alone cannot invent an amount'],
  ["jsonb_set(initial_payload,'{values,forcedReason}','\"Justificación innecesaria\"')",'INVALID_PAYLOAD','unforced declaration cannot carry hidden forced status'],
  ["jsonb_set(initial_payload,'{values,validFrom}','\"2026-02-30\"')",'DATES_INVALID','invalid civil date rejected'],
  ["jsonb_set(initial_payload,'{values,validTo}','\"2026-01-14\"')",'DATES_INVALID','end before start rejected'],
  ["jsonb_set(initial_payload,'{values,validTo}','\"2101-01-01\"')",'DATES_INVALID','civil dates outside supported range rejected'],
 ])badPropose(body,error,label);
 rejectCall('list','%2$L::date',["'2026-06-02'"],'DATES_INVALID','period must start on first day of month');
 badReview("initial_review||'{\"reviewedBy\":\"forged@example.invalid\"}'",'INVALID_PAYLOAD','client cannot forge reviewer author');
 exec(`zero_receipt:=${propose("initial_payload||jsonb_build_object('values',"+j(values)+"||jsonb_build_object('conceptSourceId','90','quantityDecimal',NULL,'amountCents','0'))")};
 result:=${call('detail','maker',"(zero_receipt->>'recordId')::uuid")};`);
 ok("result#>>'{record,pending,values,amountCents}'='0' AND result#>'{record,pending,values,quantityDecimal}'='null'::jsonb",'explicit zero remains distinct from unknown quantity');
 // Refresh source provenance without changing the canonical identity.
 exec(`UPDATE source_import_batch SET legacy_import_run_id=92004,source_cutoff='2026-09-11T00:00:00Z' WHERE id=${q(ids.sourceBatch)};
 UPDATE person_identity SET full_name='Nombre actual de ensayo' WHERE id=${q(ids.targetPerson)};
 result:=${call('employee','maker',"'903'")};`);
 ok("result#>>'{subject,identityToken}'=subject->>'identityToken'",'equivalent source refresh and name refresh preserve canonical identity token');
 exec(`result:=${call('detail','maker','record_id')};`);
 ok("result#>>'{record,identityCurrent}'='true' AND result#>'{record,subject}'=subject",'historical name and cutoff remain the original proposal snapshot after refresh');
 exec(`UPDATE source_import_batch SET legacy_import_run_id=92001,source_cutoff='2026-09-10T00:00:00Z' WHERE id=${q(ids.sourceBatch)};
 UPDATE person_identity SET full_name='Agente destinatario de ensayo' WHERE id=${q(ids.targetPerson)};
 result:=${call('list','maker',"DATE '2026-07-01'")}; snapshot:=result->>'snapshotToken';
 UPDATE employment_contract SET person_id=${q(ids.checkerPerson)} WHERE id=${q(ids.targetContract)};
 result:=${call('detail','maker','record_id')};`);
 ok("result#>>'{record,identityCurrent}'='false' AND result#>'{record,subject}'=subject",'changed canonical person marks the retained historical identity stale');
 badPropose('initial_payload','IDENTITY_CHANGED','changed canonical person cannot accept an old identity token');
 exec(`review_payload:=jsonb_build_object('recordId',zero_receipt->>'recordId','proposalId',zero_receipt->>'proposalId','expectedVersion',1,'decision','approve','reason','Revisión con identidad modificada');`);
 badReview('review_payload','IDENTITY_CHANGED','approval revalidates current canonical identity');
 rejectCall('export',"DATE '2026-07-01',%2$L",['snapshot'],'SNAPSHOT_CHANGED','identity change invalidates an earlier list snapshot');
 exec(`result:=${call('list','maker',"DATE '2026-07-01'")}; snapshot:=result->>'snapshotToken';`);
 rejectCall('export',"DATE '2026-07-01',%2$L",['snapshot'],'IDENTITY_CHANGED','fresh list cannot authorize export of a changed canonical person');
 exec(`UPDATE employment_contract SET person_id=${q(ids.targetPerson)} WHERE id=${q(ids.targetContract)};`);
 ok('(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY id)::text)=contracts_before FROM employment_contract c)','all real proposal/review/export operations leave imported contracts unchanged');
 for(const table of ['payroll_fixed_novelty','payroll_fixed_novelty_event']){
  for(const mutation of [`UPDATE ${table} SET tenant_id=tenant_id`,`DELETE FROM ${table}`,`TRUNCATE ${table==='payroll_fixed_novelty'?'payroll_fixed_novelty,payroll_fixed_novelty_event':table}`])rejects(q(mutation),'PAYROLL_FIXED_IMMUTABLE',`${table} rejects ${mutation.split(' ')[0]}`);
  ok(`NOT has_table_privilege('municontrol_actions_runtime_app',${q(schema+'.'+table)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,`${table} denies all direct runtime privileges`);
  ok(`(SELECT relrowsecurity FROM pg_class WHERE oid=${q(schema+'.'+table)}::regclass)`,`${table} has RLS enabled`);
 }
 const facadeSignatures=['bootstrap(jsonb)','employee(jsonb,text)','list(jsonb,date)','detail(jsonb,uuid)','attempt(jsonb,text,uuid)','export(jsonb,date,text)','propose(jsonb,jsonb,uuid)','review(jsonb,jsonb,uuid)'].map(signature=>signature.replace('(','_v1('));
 for(const signature of facadeSignatures)ok(`has_function_privilege('municontrol_actions_runtime_app',${q(schema+'.payroll_fixed_'+signature)},'EXECUTE')`,'runtime receives bounded facade '+signature);
 ok(`NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=${q(schema)} AND p.proname LIKE 'payroll_fixed_%' AND p.proname NOT IN ('payroll_fixed_bootstrap_v1','payroll_fixed_employee_v1','payroll_fixed_list_v1','payroll_fixed_detail_v1','payroll_fixed_attempt_v1','payroll_fixed_export_v1','payroll_fixed_propose_v1','payroll_fixed_review_v1') AND has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'))`,'runtime cannot execute any internal fixed-novelty helper');
 ok(`NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname=${q(schema)} AND p.proname LIKE 'payroll_fixed_%' AND a.grantee=0 AND a.privilege_type='EXECUTE')`,'PUBLIC cannot execute fixed-novelty facades or helpers');
 ok(`NOT has_function_privilege('municontrol_actions_runtime_app',${q(schema+'.payroll_novelty_assert_context_v1(jsonb,text)')},'EXECUTE')`,'original authorization helper remains private as in migration026');
 // Reach the actual event limit using the real propose/review writers, including their capacity guard.
 exec(`review_payload:=jsonb_build_object('recordId',zero_receipt->>'recordId','proposalId',zero_receipt->>'proposalId','expectedVersion',1,'decision','reject','reason','Revisión de capacidad de ensayo');
 PERFORM ${review('review_payload')};
 FOR qa_i IN 2..100 LOOP
  payload:=initial_payload||jsonb_build_object('recordId',zero_receipt->>'recordId','expectedVersion',2*(qa_i-1),'values',(initial_payload->'values')||jsonb_build_object('conceptSourceId','90','quantityDecimal',NULL,'amountCents','0'));
  capacity_receipt:=${propose('payload','gen_random_uuid()')};
  review_payload:=jsonb_build_object('recordId',zero_receipt->>'recordId','proposalId',capacity_receipt->>'proposalId','expectedVersion',2*qa_i-1,'decision','reject','reason','Revisión de capacidad de ensayo');
  PERFORM ${review('review_payload','gen_random_uuid()')};
 END LOOP;
 result:=${call('detail','maker',"(zero_receipt->>'recordId')::uuid")};`);
 ok("jsonb_array_length(result->'history')=100 AND result#>>'{record,version}'='200' AND result#>>'{history,99,version}'='1'",'full one-hundred-proposal history remains readable through real writers');
 badPropose("payload||'{\"expectedVersion\":200}'",'ROW_LIMIT','101st proposal is rejected before creating an unreadable history');
 ok("(SELECT count(*)=200 FROM payroll_fixed_novelty_event e WHERE e.record_id=(zero_receipt->>'recordId')::uuid)",'history limit failure appends no event');
 // Only private fixture seeds are used to reach the 500-root list boundary economically.
 exec(`INSERT INTO payroll_fixed_novelty(tenant_id,certified_binding_id,employment_contract_id,person_id,identity_token,subject)
 SELECT n.tenant_id,n.certified_binding_id,n.employment_contract_id,n.person_id,n.identity_token,n.subject
 FROM payroll_fixed_novelty n CROSS JOIN generate_series(1,500-(SELECT count(*)::integer FROM payroll_fixed_novelty WHERE tenant_id=${q(ids.tenant)}::uuid AND certified_binding_id=${q(ids.binding)}::uuid)) g
 WHERE n.id=record_id;
 INSERT INTO payroll_fixed_novelty_event(tenant_id,certified_binding_id,record_id,version,command,payload,actor_membership_id,actor_person_id,actor_email,actor_session_id,idempotency_key,request_sha256)
 SELECT n.tenant_id,n.certified_binding_id,n.id,1,'propose',initial_payload,${q(ids.maker)}::uuid,${q(ids.makerPerson)}::uuid,'maker@example.invalid',${q(ids.makerSession)}::uuid,gen_random_uuid(),encode(public.digest(convert_to(initial_payload::text,'UTF8'),'sha256'),'hex')
 FROM payroll_fixed_novelty n WHERE n.tenant_id=${q(ids.tenant)}::uuid AND n.certified_binding_id=${q(ids.binding)}::uuid AND NOT EXISTS(SELECT 1 FROM payroll_fixed_novelty_event e WHERE e.record_id=n.id);
 result:=${call('list','maker','NULL::date')};`);
 ok("result->>'total'='500' AND jsonb_array_length(result->'rows')=500",'maximum root list returns all records without truncation');
 badPropose('initial_payload','ROW_LIMIT','501st root cannot make the administrative register unreadable');
 ok(`(SELECT count(*)=500 FROM payroll_fixed_novelty WHERE tenant_id=${q(ids.tenant)}::uuid AND certified_binding_id=${q(ids.binding)}::uuid)`,'root capacity rejection does not leave an orphan identity');

 const pins=`IF nullif(current_setting('neon.project_id',true),'') IS NOT NULL OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL OR current_database()<>'fixed_novelties_qa' OR current_setting('server_version_num')::int/10000<>${Number(serverMajor)} THEN RAISE EXCEPTION 'FIXED_NOVELTIES_QA_LOCAL_CI_REQUIRED'; END IF;`;
 const report={ok:true,checksPassed:checks,serverMajor:Number(serverMajor),migrationSha256:sha(migration),authorizationMigration:authorization.file,authorizationVersions:authorization.versions,authorizationSha256:sha(authorization.sql),syntheticSchemaRolledBack:true,municipalRowsWritten:0,concurrentConnectionCheck:requireConcurrency,limitations:['IAM capability resolver and separation-of-duties helper use synthetic fixtures; original session, membership, MFA, release, binding, authority, capability and employment-person checks run unchanged.']};
 const sql=`-- Isolated fixed novelties QA, actual migration SHA256 ${report.migrationSha256}.
 BEGIN ISOLATION LEVEL READ COMMITTED;
 SET LOCAL statement_timeout='90s';
 SET LOCAL lock_timeout='2s';
 DO $qa$
 DECLARE maker jsonb:=${j(actors.maker)}; checker jsonb:=${j(actors.checker)}; same_person jsonb:=${j(actors.samePerson)}; reader jsonb:=${j(actors.reader)}; unlinked jsonb:=${j(actors.unlinked)}; outsider jsonb:=${j(actors.outsider)}; blocked jsonb:=${j(actors.blocked)};
 ctx jsonb; subject jsonb; result jsonb; payload jsonb; initial_payload jsonb; initial_review jsonb; review_payload jsonb; capacity_receipt jsonb;
 receipt jsonb; approved_receipt jsonb; change_receipt jsonb; second_payload jsonb; second_receipt jsonb; annul_payload jsonb; annul_receipt jsonb; zero_receipt jsonb;
 record_id uuid; proposal_id uuid; snapshot text; contracts_before text; checks integer:=0; qa_i integer;
 BEGIN
 ${pins}
 IF to_regclass('public.payroll_fixed_novelty') IS NOT NULL OR to_regclass('public.payroll_novelty_batch') IS NOT NULL THEN RAISE EXCEPTION 'FIXED_NOVELTIES_QA_EMPTY_CI_DATABASE_REQUIRED'; END IF;
 IF to_regnamespace(${q(schema)}) IS NOT NULL THEN RAISE EXCEPTION 'FIXED_NOVELTIES_QA_SCHEMA_EXISTS'; END IF;
 BEGIN
 CREATE SCHEMA ${schema};
 SET LOCAL search_path=${schema},pg_catalog,public,pg_temp;
 ${baseTables}
 ${relocate(migration)}
 ${fixtures}
 ${statements.join('\n')}
 RAISE EXCEPTION USING ERRCODE='P0920',MESSAGE='FIXED_NOVELTIES_QA_ROLLBACK_SUCCESS';
 EXCEPTION WHEN SQLSTATE 'P0920' THEN NULL;
 END;
 IF to_regnamespace(${q(schema)}) IS NOT NULL OR checks<>${checks} THEN RAISE EXCEPTION 'FIXED_NOVELTIES_QA_NOT_ROLLED_BACK'; END IF;
 PERFORM set_config('mc.fixed_novelties_qa_report',${j(report)}::text,true);
 END $qa$;
 SELECT current_setting('mc.fixed_novelties_qa_report')::jsonb AS evidence;
 ROLLBACK;
 `;
 assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql),'Synthetic public writes prohibited');
 const lockSql=`-- Only a second transaction-scoped binding lock; no fixture/schema writes.
 BEGIN;
 SET LOCAL idle_in_transaction_session_timeout='60s';
 DO $pins$ BEGIN ${pins} END $pins$;
 SELECT pg_advisory_xact_lock(${lockKey});
 SELECT 'FIXED_NOVELTIES_QA_LOCK_READY' AS readiness;
 SELECT pg_sleep(45);
 ROLLBACK;
 `;
 return {sql,lockSql,report,schema,ids};
}

function main(){
 const args={};
 for(const arg of process.argv.slice(2)){
  if(arg==='--help'){console.log('node scripts/verify-payroll-fixed-novelties-sql.mjs --ci --expected-major=17 --write-sql=PATH [--require-concurrency --write-lock-sql=LOCK_PATH]\nPrerequisites: disposable empty fixed_novelties_qa database; pgcrypto extension; municontrol_actions_runtime_app role. Execute with psql -v ON_ERROR_STOP=1. For concurrency start lock SQL first, wait FIXED_NOVELTIES_QA_LOCK_READY, then execute main SQL. No database connection is made by this generator.');return;}
  if(arg==='--ci'){args.ci=true;continue;}
  if(arg==='--require-concurrency'){args.requireConcurrency=true;continue;}
  const match=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(arg);assert.ok(match,'Unknown or incomplete argument');assert.equal(args[match[1]],undefined,'Duplicate argument');args[match[1]]=match[2];
 }
 assert.equal(args.ci,true,'Only --ci generation is supported; no Neon execution');assert.ok(args['write-sql'],'Explicit output path required');
 assert.ok(!args.requireConcurrency||args['write-lock-sql'],'Concurrency requires --write-lock-sql for a second connection');
 const test=buildFixedNoveltiesQa({serverMajor:args['expected-major'],requireConcurrency:Boolean(args.requireConcurrency)});
 const outputs=[['write-sql',test.sql],['write-lock-sql',test.lockSql]].filter(([key])=>args[key]).map(([key,contents])=>({key,contents,output:path.resolve(args[key])}));
 assert.equal(new Set(outputs.map(item=>item.output)).size,outputs.length,'Output paths must differ');
 for(const {output} of outputs)assert.ok(!fs.existsSync(output),'Output exists; choose a new path');
 for(const {output,contents} of outputs){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,contents,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,sqlPath:path.resolve(args['write-sql']),lockSqlPath:args['write-lock-sql']?path.resolve(args['write-lock-sql']):null,checksPlanned:test.report.checksPassed,migrationSha256:test.report.migrationSha256,authorizationSha256:test.report.authorizationSha256,concurrentConnectionCheckPlanned:test.report.concurrentConnectionCheck}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(error){console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}
