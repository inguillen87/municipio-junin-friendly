// Existing owned loopback QA only. Canonical authority SQL over fictional rows.
// Imports and fixture construction never open a connection. No production mode.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync,execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {buildMunicipalOwnerAdoptionAuthorityInstallation,assertMunicipalOwnerAdoptionAuthorityDurability,OWNER_ADOPTION_AUTHORITY_SOURCE_PINS,OWNER_ADOPTION_OPERATIONAL_PAIR_BASELINES} from './lib/municipal-owner-adoption-authority-installation.mjs';
import {ADOPTION_ADMINISTRATIVE_CONTEXT} from './lib/adoption-administrative-identity-installation.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {ownerAdoptionQaTransport,OWNER_ADOPTION_QA_IDENTITY_SQL,captureOwnerAdoptionQaDestination,assertOwnerAdoptionQaDestination,ownerAdoptionQaDestinationGuard,ownerAdoptionQaCiInitialGuard} from './lib/municipal-owner-adoption-qa-transport.mjs';
import {verifyDocumentaryQaProcess} from './lib/adopted-documentary-read-qa.mjs';
import {assertIndependentProcessStart} from './verify-agreement-hours-independent.mjs';
import {performancePreservationSnapshot} from './verify-documentary-roster-performance.mjs';
import {finalReviewAdmissionQaCleanup,finalReviewAdmissionQaDirectory,finalReviewAdmissionQaDirectoryPredicate} from './lib/final-grh-source-review-admission-qa.mjs';
import {ownerAdoptionAuthorityFromDatabase} from '../lib/internal-municipal-owner-decision-authority.js';

const root=path.resolve(import.meta.dirname,'..'),lf=s=>s.replace(/\r\n?/g,'\n'),read=p=>lf(fs.readFileSync(path.join(root,p),'utf8'));
const hash=s=>createHash('sha256').update(s).digest('hex'),q=s=>"'"+String(s).replaceAll("'","''")+"'",j=s=>q(JSON.stringify(s))+'::jsonb';
const schemaPattern=/^mc_qa_fixed_092_[a-f0-9]{32}$/;
export function ownerAuthorityQaOptions(argv){const args={};for(const arg of argv){const m=/^--(major|output|source-commit|transport|operational-pair-baseline)=(.+)$/.exec(arg);assert.ok(m&&!Object.hasOwn(args,m[1]),'OWNER_QA_ARGUMENT_INVALID');args[m[1]]=m[2];}assert.ok(['17','18'].includes(args.major));assert.match(args['source-commit']??'',/^[a-f0-9]{40}$/);assert.match(args.output??'',/^verification[\\/][A-Za-z0-9_.-]+$/);assert.ok(args.transport===undefined||['local','ci'].includes(args.transport),'OWNER_QA_TRANSPORT_REQUIRED');assert.ok(args['operational-pair-baseline']===undefined||OWNER_ADOPTION_OPERATIONAL_PAIR_BASELINES.includes(args['operational-pair-baseline']),'OWNER_AUTHORITY184_OPERATIONAL_PAIR_BASELINE_REQUIRED');return{major:Number(args.major),sourceCommit:args['source-commit'],output:args.output,transport:args.transport??'local',...(args['operational-pair-baseline']===undefined?{}:{operationalPairBaseline:args['operational-pair-baseline']})};}
const sourceFiles=[...Object.keys(OWNER_ADOPTION_AUTHORITY_SOURCE_PINS),'scripts/lib/municipal-owner-adoption-authority-installation.mjs','scripts/migrations/002-canonical-integration.sql','scripts/migrations/132-employment-adoption-preparation.sql','scripts/migrations/133-employment-adoption-application.sql','tests/fixtures/native-employee-installed-067.json','lib/internal-municipal-owner-decision-authority.js','lib/internal-platform-owner-policy.js','lib/internal-native-employees.js','assets/municipal-adoption-owner-decision-model.js','package.json','package-lock.json'];
const runnerFile='scripts/verify-municipal-owner-adoption-authority.mjs',testFile='tests/municipal-owner-adoption-authority-qa.test.js';
// The existing Playwright SDK bundles its JavaScript parser. Parse syntax only;
// no source is evaluated. Its package and parser bytes join the final bookend.
const qaRequire=createRequire(import.meta.url),sdkPackage=qaRequire.resolve('playwright/package.json'),parserFile=path.join(path.dirname(sdkPackage),'lib/transform/babelBundle.js'),{babelParse}=qaRequire(parserFile);
const externalParserFiles=[sdkPackage,parserFile];
function moduleSpecifiers(source,file){
 const ast=babelParse(source,file,true),result=[];
 function visit(node){if(!node||typeof node!=='object')return;if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source)result.push(node.source.value);
  if(node.type==='ImportExpression'){assert.equal(node.source.type,'StringLiteral','OWNER_QA_DYNAMIC_IMPORT_REQUIRED:'+file);result.push(node.source.value);}
  if(node.type==='CallExpression'&&(node.callee?.type==='Import'||node.callee?.type==='Identifier'&&node.callee.name==='require')){if(node.arguments.length===1&&node.arguments[0]?.type==='StringLiteral')result.push(node.arguments[0].value);else if(node.callee.type==='Import')throw Error('OWNER_QA_DYNAMIC_IMPORT_REQUIRED:'+file);}
  for(const[key,value]of Object.entries(node)){if(['loc','start','end','extra','comments','tokens'].includes(key))continue;if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
 }
 visit(ast);return result;
}
// Follow all local static/re-export and literal dynamic imports, not a hand-kept
// allowlist. Record complete raw bytes, including the runner and its tests.
export function ownerAuthorityQaSourceClosure({readBytes=p=>fs.readFileSync(path.join(root,p)),entries=[runnerFile,testFile,'tests/municipal-owner-adoption-ci-integration.test.js','tests/municipal-owner-adoption-qa-transport.test.js','tests/municipal-owner-adoption-workflow.test.js'],additional=sourceFiles}={}){
 const rows=new Map(),externalModules=new Set();
 const visit=file=>{assert.equal(typeof file,'string');assert.ok(!file.includes('\\')&&!path.posix.isAbsolute(file)&&!file.split('/').includes('..'),'OWNER_QA_SOURCE_PATH_INVALID');if(rows.has(file))return;assert.ok(rows.size<1000,'OWNER_QA_SOURCE_CLOSURE_LIMIT');const bytes=readBytes(file);assert.ok(Buffer.isBuffer(bytes),'OWNER_QA_SOURCE_BYTES_REQUIRED');rows.set(file,hash(bytes));if(!/\.(?:js|mjs)$/.test(file))return;
  let imports;try{imports=moduleSpecifiers(bytes.toString('utf8'),file);}catch(error){throw Error('OWNER_QA_SOURCE_LEXICAL_ERROR:'+file,{cause:error});}for(const specifier of imports){if(specifier.startsWith('.')){const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier));assert.ok(!resolved.startsWith('../'),'OWNER_QA_SOURCE_OUTSIDE_REPOSITORY');visit(resolved);}else externalModules.add(specifier);}
 };
 for(const file of [...entries,...additional])visit(file);
 return{files:Object.fromEntries([...rows].sort(([a],[b])=>a.localeCompare(b))),externalModules:[...externalModules].sort(),externalParser:{nodeVersion:process.version,files:Object.fromEntries(externalParserFiles.map(file=>[file,hash(fs.readFileSync(file))])),repositorySource:false}};
}
export function assertOwnerAuthorityQaSourceBookend(expected,{readBytes=p=>fs.readFileSync(path.join(root,p)),committedBytes,readExternalBytes=p=>fs.readFileSync(p)}={}){
 for(const[file,sha256]of Object.entries(expected.files)){const bytes=readBytes(file);assert.ok(Buffer.isBuffer(bytes));assert.equal(hash(bytes),sha256,'OWNER_QA_SOURCE_CHANGED:'+file);if(committedBytes)assert.ok(bytes.equals(committedBytes(file)),'OWNER_QA_COMMITTED_SOURCE_CHANGED:'+file);}
 assert.equal(process.version,expected.externalParser.nodeVersion,'OWNER_QA_NODE_RUNTIME_CHANGED');for(const[file,sha256]of Object.entries(expected.externalParser.files))assert.equal(hash(readExternalBytes(file)),sha256,'OWNER_QA_PARSER_CHANGED');
 return{passed:true,fileCount:Object.keys(expected.files).length,rawBytesVerified:true,committedBytesVerified:typeof committedBytes==='function',externalParserRawBookend:true};
}
function statement(source,pattern){const found=splitPostgresStatements(source).filter(s=>pattern.test(s));assert.equal(found.length,1,'OWNER_QA_CANONICAL_SOURCE_MISSING:'+pattern);return found[0].replace(/^(?:\s*--[^\n]*\n)+\s*/,'');}
const definition=(source,name)=>statement(source,new RegExp('CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\('));
const table=(source,name)=>statement(source,new RegExp('CREATE TABLE(?: IF NOT EXISTS)? (?:public\\.)?'+name+'\\s*\\('));
const body=definition=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(definition);assert.ok(m);return m[2];};

export function buildOwnerAuthorityQa({major,sourceCommit,read:sourceRead=read,schema='mc_qa_fixed_092_'+randomUUID().replaceAll('-',''),operationalPairBaseline='pre107'}){
 assert.ok([17,18].includes(major));assert.match(schema,schemaPattern);const batch=buildMunicipalOwnerAdoptionAuthorityInstallation({read:sourceRead,sourceCommit,operationalPairBaseline});
 const alternateOperationalPairDefinition=buildMunicipalOwnerAdoptionAuthorityInstallation({read:sourceRead,sourceCommit,operationalPairBaseline:operationalPairBaseline==='pre107'?'published107':'pre107'}).supportDefinitions[0];
 const sources=Object.fromEntries(sourceFiles.map(p=>[p,lf(sourceRead(p))]));
 const from=(number,name)=>definition(sources[Object.keys(sources).find(p=>p.startsWith('scripts/migrations/'+number+'-'))],name);
 const originals=[...batch.prerequisiteDefinitions,from('006','tenant_iam_effective_capabilities')],supportDefinitions=batch.supportDefinitions;
 const obsoleteDefinitions=[from('007','action_center_assert_tenant_read_session_v2'),from('004','tenant_iam_assert_no_sod_conflict')];
 const published=JSON.parse(sources['tests/fixtures/native-employee-installed-067.json']);assert.equal(published.version,'native-employee-installed-067.v1');
 const contexts=published.functions.filter(f=>f.name==='native_employee_context_v1');assert.equal(contexts.length,1);assert.equal(hash(contexts[0].body),batch.prerequisitePins[1].sha256);
 const originalContext=body(originals[1]);originals[1]=originals[1].replace(originalContext,()=>contexts[0].body);
 for(let n=0;n<6;n++)assert.equal(hash(body(originals[n])),batch.prerequisitePins[n].sha256,'OWNER_QA_PREREQUISITE_BODY_CHANGED:'+n);
 const relocate=sql=>sql.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replace(/\b([ns]\.nspname=)('+)public\2/g,(_,selector,quotes)=>selector+quotes+schema+quotes)
  .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
  .replaceAll('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+schema+', public, pg_temp')
  .replaceAll('search_path=public, pg_temp','search_path=pg_catalog, '+schema+', public, pg_temp')
  .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp');
 const hashes=Object.fromEntries([...originals,...supportDefinitions,batch.newDefinition].map(d=>[hash(body(d)),hash(body(relocate(d)))]));
 const normalized=sql=>{let s=relocate(sql);for(const[from,to]of Object.entries(hashes))s=s.replaceAll(from,to);return s;};
 const local=Object.fromEntries(['rehearsal','installation','repetition','verification','rollback','rollbackVerification'].map(k=>[k,batch[k].map(normalized)]));
 for(const [phase,values]of Object.entries(local)){assert.equal(values.length,batch[phase].length);assert.ok(values.every(s=>!s.includes('public.municipal_owner_adoption_authority_v1')));}
 const ids=Object.fromEntries(['tenant','foreignTenant','binding','foreignBinding','membership','foreignMembership','session','foreignSession','person','foreignPerson','contract','foreignContract','batch','foreignBatch'].map(k=>[k,randomUUID()]));
 const actor={actorEmail:'owner-authority@example.invalid',actorSessionId:ids.session,actorSessionVersion:3,membershipId:ids.membership,releaseSha:'a'.repeat(40),tenantId:ids.tenant};
 const foreign={...actor,actorEmail:'foreign-authority@example.invalid',actorSessionId:ids.foreignSession,membershipId:ids.foreignMembership,tenantId:ids.foreignTenant};
 const migration=n=>sources[Object.keys(sources).find(p=>p.startsWith('scripts/migrations/'+n+'-'))];
 const tables=[...['iam_capability','iam_capability_conflict','iam_role','iam_role_capability','platform_tenant','platform_tenant_source_binding','platform_user_role','tenant_membership','tenant_membership_capability_override'].map(n=>table(migration('004'),n)),...['tenant_identity_policy','tenant_identity_session'].map(n=>table(migration('005'),n)),...['source_import_batch','person_identity','employment_contract'].map(n=>table(migration('002'),n))];
 // Full canonical declarations, including their constraints and foreign keys.
 // Only the pre-existing application-user/import-run roots are fixture tables.
 const ddl=["CREATE TABLE internal_users(email text PRIMARY KEY,display_name text,password_hash text,active boolean NOT NULL,auth_mode varchar(16) NOT NULL,identity_version integer NOT NULL CHECK(identity_version>0))","CREATE TABLE data_import_runs(id bigint PRIMARY KEY)",...tables,
  'CREATE UNIQUE INDEX owner_qa_binding_tenant ON platform_tenant_source_binding(tenant_id,id)','CREATE UNIQUE INDEX owner_qa_membership_tenant ON tenant_membership(id,tenant_id)',
  ...['version','revoked_by_user_email'].map(column=>statement(migration('012'),new RegExp('ALTER TABLE platform_user_role\\s+ADD COLUMN IF NOT EXISTS '+column+'\\b'))),
  'ALTER TABLE employment_contract ADD COLUMN tenant_id uuid REFERENCES platform_tenant(id)',
  table(migration('067'),'native_employee_registration'),table(migration('132'),'employment_adoption_proposal'),...['employment_adoption_seal','employment_adoption_decision','employment_adoption_application'].map(n=>table(migration('133'),n)),
  ...['tenant_action_authority','tenant_action_employment_link','tenant_action_area_scope'].map(n=>table(migration('006'),n))];
 const utilities=['normalize_digits','is_valid_cuil'].map(n=>from('002',n));
 const canonicalFunctions=[...supportDefinitions,...originals].map(d=>relocate(d).replace(/CREATE(?: OR REPLACE)? FUNCTION (?!mc_qa_)(\w+)\(/,'CREATE FUNCTION '+schema+'.$1('));
 const signatures=batch.prerequisitePins.map(p=>p.signature).concat('public.tenant_iam_effective_capabilities(uuid)',...batch.supportPins.map(p=>p.signature));
 const acl=signatures.map((s,n)=>'REVOKE ALL ON FUNCTION '+s.replace('public.',schema+'.')+' FROM PUBLIC,municontrol_actions_runtime_app'+(n===5?';GRANT EXECUTE ON FUNCTION '+s.replace('public.',schema+'.')+' TO municontrol_actions_runtime_app':''));
 const fixtureRows=[];
 for(const[a,foreignFlag]of[[actor,false],[foreign,true]]){const t=foreignFlag?ids.foreignTenant:ids.tenant,b=foreignFlag?ids.foreignBinding:ids.binding,pi=foreignFlag?ids.foreignPerson:ids.person,c=foreignFlag?ids.foreignContract:ids.contract,sb=foreignFlag?ids.foreignBatch:ids.batch,company=foreignFlag?202:101;
  fixtureRows.push(`INSERT INTO internal_users VALUES(${q(a.actorEmail)},'Responsable ficticio QA',NULL,true,'managed',4)`,
   `INSERT INTO platform_tenant(id,slug,legal_name,short_name,tenant_kind,jurisdiction,status,created_by_user_email) VALUES(${q(t)},${q(foreignFlag?'authority-foreign':'authority-main')},'Municipio ficticio QA','QA','sandbox','Ficticia','active',${q(a.actorEmail)})`,
   `INSERT INTO platform_tenant_source_binding(id,tenant_id,source_system,source_database,source_company_id,verified,verified_by_user_email,verified_at) VALUES(${q(b)},${q(t)},'GRH','owner_qa_source',${company},true,${q(a.actorEmail)},now())`,
   `INSERT INTO tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at) VALUES(${q(a.membershipId)},${q(t)},${q(a.actorEmail)},'QA_AUTHORITY_OPERATOR','active',${q(a.actorEmail)},now())`,
   `INSERT INTO tenant_identity_policy(tenant_id,tenant_data_plane_ready,certified_source_binding_id,certified_release_sha,certified_by_user_email,certified_at) VALUES(${q(t)},true,${q(b)},${q(actor.releaseSha)},${q(a.actorEmail)},now())`,
   `INSERT INTO tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,expires_at) VALUES(${q(a.actorSessionId)},${q(a.actorEmail)},${q(t)},'membership','mfa',3,4,now()+interval '1 hour')`,
   `INSERT INTO tenant_action_authority(membership_id,tenant_id) VALUES(${q(a.membershipId)},${q(t)})`,
   `INSERT INTO source_import_batch(id,source_system,source_database,source_file_name,source_sha256,source_cutoff,legacy_import_run_id,validation_state) VALUES(${q(sb)},'GRH','owner_qa_source','fictional',${q((foreignFlag?'B':'A').repeat(64))},now(),1,'published')`,
   `INSERT INTO person_identity(id,full_name,dni) VALUES(${q(pi)},'Identidad administrativa ficticia QA',${q(foreignFlag?'99000082':'99000081')})`,
   `INSERT INTO employment_contract(id,person_id,source_system,source_batch_id,legacy_company_id,legacy_legajo,status,start_date,end_date) VALUES(${q(c)},${q(pi)},'GRH',${q(sb)},${company},'QA-184','inactive','2000-01-01','2020-01-01')`,
   `INSERT INTO tenant_action_employment_link(membership_id,tenant_id,source_binding_id,employment_contract_id,linked_by_user_email) VALUES(${q(a.membershipId)},${q(t)},${q(b)},${q(c)},${q(a.actorEmail)})`,
   `INSERT INTO platform_user_role(user_email,role_key,granted_by_user_email) VALUES(${q(a.actorEmail)},'PLATFORM_OWNER',${q(a.actorEmail)})`);
 }
 const caps=['actions.read','workforce.employee.read','employee.record.propose'];
 const seed=[...utilities.map(relocate),...ddl.map(relocate),
  "INSERT INTO iam_role(role_key,label,description,scope_kind) VALUES('QA_AUTHORITY_OPERATOR','QA','Ficticio','tenant'),('PLATFORM_OWNER','QA','Ficticio','platform')",
  ...caps.map(c=>`INSERT INTO iam_capability(capability_key,label,description,scope_kind) VALUES(${q(c)},'QA','Ficticio','tenant')`),
  "INSERT INTO iam_capability(capability_key,label,description,scope_kind) VALUES('platform.tenants.manage','QA','Ficticio','platform')",
  ...caps.map(c=>`INSERT INTO iam_role_capability VALUES('QA_AUTHORITY_OPERATOR',${q(c)})`),"INSERT INTO iam_role_capability VALUES('PLATFORM_OWNER','platform.tenants.manage')","INSERT INTO data_import_runs VALUES(1)",...fixtureRows,...canonicalFunctions,...acl,
  "CREATE TABLE qa_prior_event(id integer PRIMARY KEY,payload jsonb NOT NULL)","INSERT INTO qa_prior_event VALUES(1,'{\"source\":\"fictional immutable sentinel\"}')","CREATE MATERIALIZED VIEW qa_prior_materialized AS SELECT * FROM qa_prior_event"].join(';\n');
 return{major,schema,ids,actor,foreign,batch,local,originals,supportDefinitions,alternateOperationalPairDefinition,obsoleteDefinitions,hashes,normalized,relocate,sourceHashes:Object.fromEntries(Object.entries(sources).map(([p,s])=>[p,hash(s)])),seed:'CREATE SCHEMA '+schema+';GRANT USAGE ON SCHEMA '+schema+' TO municontrol_actions_runtime_app;SET LOCAL search_path='+schema+',pg_catalog,public,pg_temp;'+seed};
}

export function ownerAuthorityQaPrerequisiteCases(qa){
 const changed=qa.originals[4].replace(body(qa.originals[4]),()=>body(qa.originals[4])+'\n-- deliberately altered QA body\n');
 const unknownPair=qa.supportDefinitions[0].replace(body(qa.supportDefinitions[0]),()=>body(qa.supportDefinitions[0])+'\n-- deliberately unrecognized QA helper body\n');
 const error='OWNER_AUTHORITY184_PREREQUISITE_CHANGED';
 return[
  ...[['obsoleteSession007',qa.obsoleteDefinitions[0]],['obsoleteSoD004',qa.obsoleteDefinitions[1]],['alteredPublishedSoD',changed]].map(([label,d])=>[label,qa.relocate(d.replace(/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?/,'CREATE OR REPLACE FUNCTION public.')),error]),
  ['privateReviewedPairAclChanged',`GRANT EXECUTE ON FUNCTION ${qa.schema}.tenant_iam_reviewed_operational_pair_v1(text,text,text) TO municontrol_actions_runtime_app`,error],
  ['privateNativeAccountConfigChanged',`ALTER FUNCTION ${qa.schema}.native_account_contract_v1(uuid,uuid,uuid,boolean) SET search_path=public,pg_temp`,error],
  ['differentOperationalPairBaseline',qa.relocate(qa.alternateOperationalPairDefinition.replace(/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?/,'CREATE OR REPLACE FUNCTION public.')),error],
  ['unknownOperationalPairBody',qa.relocate(unknownPair.replace(/^CREATE(?: OR REPLACE)? FUNCTION (?:public\.)?/,'CREATE OR REPLACE FUNCTION public.')),error],
  ['mixedOperationalPairMetadata',`ALTER FUNCTION ${qa.schema}.tenant_iam_reviewed_operational_pair_v1(text,text,text) SECURITY DEFINER`,error],
 ];
}

// These fictional role rows exercise the published SoD implementation itself.
// Every scenario rolls back; no role assignment or permission is changed outside
// the isolated fixture, and the resolver's independent denial cases stay intact.
export function ownerAuthorityQaOperationalSodCases(qa){
 return[
  ['reviewedOperationalPair','MUNICIPIO_ADMIN_OPERATIVO','absence.enter','absence.validate',null],
  [qa.batch.operationalPairBaseline==='published107'?'published107CatalogCapabilityPair':'catalogPairStillIndependent','MUNICIPIO_ADMIN_OPERATIVO','employee.catalog.approve','employee.catalog.propose',qa.batch.operationalPairBaseline==='published107'?null:'TENANT_IAM_SOD_CONFLICT'],
  ['publishedIntegralPair','PLATFORM_OWNER_OPERATIVO_INTEGRAL','payroll.novelty.approve','payroll.novelty.prepare',null],
  ['unreviewedIntegralPair','PLATFORM_OWNER_OPERATIVO_INTEGRAL','employee.record.approve','employee.record.propose','TENANT_IAM_SOD_CONFLICT'],
 ].map(([label,role,left,right,error])=>[label,[
  `INSERT INTO iam_role(role_key,label,description,scope_kind) VALUES(${q(role)},'QA','Ficticio','tenant')`,
  ...[left,right].map(c=>`INSERT INTO iam_capability(capability_key,label,description,scope_kind) VALUES(${q(c)},'QA','Ficticio','tenant') ON CONFLICT(capability_key) DO NOTHING`),
  ...[left,right].map(c=>`INSERT INTO iam_role_capability(role_key,capability_key) VALUES(${q(role)},${q(c)})`),
  `UPDATE tenant_membership SET role_key=${q(role)} WHERE id=${q(qa.ids.membership)}`,
  `INSERT INTO iam_capability_conflict VALUES(${q(left)},${q(right)},'Prueba ficticia de separación')`,
  `SELECT ${qa.schema}.tenant_iam_assert_no_sod_conflict(${q(qa.ids.membership)})`,
  "SELECT jsonb_build_object('validated',true)",
 ],error]);
}

export function ownerAuthorityQaCases(qa){const a=qa.actor,i=qa.ids,mid=q(i.membership),email=q(a.actorEmail),sid=q(i.session),sc=q(i.tenant),override=c=>`INSERT INTO tenant_membership_capability_override(membership_id,capability_key,deny_override,reason,granted_by_user_email) VALUES(${mid},${q(c)},true,'Prueba ficticia',${email})`;
 return[
  ['ownerAssignmentRevoked',`UPDATE platform_user_role SET active=false,revoked_at=now(),revoked_by_user_email=${email} WHERE user_email=${email}`,'OWNER_ADOPTION_AUTHORITY_REQUIRED'],
  ['ownerRoleMissing',`DELETE FROM platform_user_role WHERE user_email=${email}`,'OWNER_ADOPTION_AUTHORITY_REQUIRED'],
  ['platformCapabilityMappingMissing',"DELETE FROM iam_role_capability WHERE role_key='PLATFORM_OWNER'",'OWNER_ADOPTION_AUTHORITY_REQUIRED'],
  ['platformCapabilityWrongScope',"UPDATE iam_capability SET scope_kind='tenant' WHERE capability_key='platform.tenants.manage'",'OWNER_ADOPTION_AUTHORITY_REQUIRED'],
  ['platformRoleWrongScope',"UPDATE iam_role SET scope_kind='tenant' WHERE role_key='PLATFORM_OWNER'",'OWNER_ADOPTION_AUTHORITY_REQUIRED'],
  ['tenantProposalDenied',override('employee.record.propose'),'EMPLOYMENT_ADOPTION_FORBIDDEN'],
  ['tenantReadDenied',override('workforce.employee.read'),'NATIVE_EMPLOYEE_FORBIDDEN'],
  ['actionsReadDenied',override('actions.read'),'ACTION_TENANT_AUTHORITY_REQUIRED'],
  ['separationOfDuties',"INSERT INTO iam_capability_conflict VALUES('employee.record.propose','workforce.employee.read','Prueba ficticia de separación')",'TENANT_IAM_SOD_CONFLICT'],
  ['membershipSuspended',`UPDATE tenant_membership SET status='suspended',suspended_at=now() WHERE id=${mid}`,'ACTION_SESSION_INVALID'],
  ['tenantSuspended',`UPDATE platform_tenant SET status='suspended' WHERE id=${sc}`,'ACTION_SESSION_INVALID'],
  ['sourceUnverified',`UPDATE platform_tenant_source_binding SET verified=false,verified_at=NULL WHERE id=${q(i.binding)}`,'ACTION_SOURCE_BINDING_REQUIRED'],
  ['sourceForeignCompany',`UPDATE employment_contract SET legacy_company_id=999 WHERE id=${q(i.contract)}`,'EMPLOYMENT_ADOPTION_ACTOR_REQUIRED'],
  ['sourceUnpublished',`UPDATE source_import_batch SET validation_state='validated' WHERE id=${q(i.batch)}`,'EMPLOYMENT_ADOPTION_ACTOR_REQUIRED'],
  ['linkRevoked',`UPDATE tenant_action_employment_link SET active=false,revoked_at=now() WHERE membership_id=${mid}`,'EMPLOYMENT_ADOPTION_ACTOR_REQUIRED'],
  ['sessionRevoked',`UPDATE tenant_identity_session SET status='revoked',revoked_at=now() WHERE id=${sid}`,'ACTION_SESSION_INVALID'],
  ['sessionStale',`UPDATE tenant_identity_session SET last_seen_at=now()-interval '2 hours' WHERE id=${sid}`,'ACTION_SESSION_INVALID'],
  ['sessionExpired',`UPDATE tenant_identity_session SET created_at=now()-interval '3 hours',expires_at=now()-interval '1 hour' WHERE id=${sid}`,'ACTION_SESSION_INVALID'],
  ['sessionPasswordOnly',`UPDATE tenant_identity_session SET auth_level='password' WHERE id=${sid}`,'ACTION_SESSION_INVALID'],
  ['identityVersionChanged',`UPDATE internal_users SET identity_version=5 WHERE email=${email}`,'ACTION_SESSION_INVALID'],
  ['legacyAccount',`UPDATE internal_users SET auth_mode='legacy',password_hash='synthetic-only' WHERE email=${email}`,'OWNER_ADOPTION_AUTHORITY_REQUIRED'],
  ['accountInactive',`UPDATE internal_users SET active=false WHERE email=${email}`,'ACTION_SESSION_INVALID'],
  ['releaseChanged','', 'ACTION_RELEASE_NOT_CERTIFIED',{...a,releaseSha:'b'.repeat(40)}],
  ['foreignTenantSameSession','', 'ACTION_SESSION_INVALID',{...a,tenantId:i.foreignTenant}],
  ['foreignMembershipSameSession','', 'ACTION_SESSION_INVALID',{...a,membershipId:i.foreignMembership}],
  ['sessionVersionChanged','', 'ACTION_SESSION_INVALID',{...a,actorSessionVersion:4}],
  ...['actorPersonId','isOwner','policy','authority'].map(k=>['clientSupplied_'+k,'','OWNER_ADOPTION_AUTHORITY_INPUT_INVALID',{...a,[k]:k==='actorPersonId'?i.person:{allowed:true}}]),
  ['sessionVersionCoercion','','OWNER_ADOPTION_AUTHORITY_INPUT_INVALID',{...a,actorSessionVersion:'3'}],
 ];
}

export function assertOwnerAuthoritySqlDestination(proof,{major,identity}){assert.equal(proof.database,'own_payroll_run_qa');assert.equal(proof.role,'postgres');assert.equal(proof.major,major);assert.equal(proof.address,'127.0.0.1');assert.equal(proof.port,55400+major);assert.equal(proof.startEpoch,major===17?1792025447:1792025448);assert.equal(proof.startEpoch,identity.postmasterStartEpoch);assert.equal(finalReviewAdmissionQaDirectory(proof.directory),finalReviewAdmissionQaDirectory(identity.directory),'OWNER_QA_DIRECTORY_CHANGED');assert.ok(!proof.neonProject&&!proof.neonBranch);assert.equal(proof.otherClients,0,'OWNER_QA_OTHER_CLIENTS');return proof;}
async function processGuard(major){const identity=await verifyDocumentaryQaProcess(root,major);const c=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-CimInstance Win32_Process -Filter 'ProcessId="+identity.processId+"'|Select-Object ProcessId,ExecutablePath,@{n='CreationDate';e={$_.CreationDate.ToUniversalTime().ToString('o')}}|ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(c.status,0,c.stderr);return{...identity,...assertIndependentProcessStart({identity,pidFile:fs.readFileSync(path.join(identity.directory,'postmaster.pid'),'utf8'),cim:JSON.parse(c.stdout)})};}

// Read the identity emitted by the actual owned psql holder, not caller input.
// A partial stdout line is not evidence and cannot authorize an exception.
export function ownerAuthorityQaHolderIdentity(stdout){
 assert.equal(typeof stdout,'string');const line=/^([^\n]*)\n/.exec(stdout);if(!line)return null;const value=JSON.parse(line[1].replace(/\r$/,''));
 assert.deepEqual(Object.keys(value).sort(),['applicationName','backendStart','pid']);assert.ok(Number.isSafeInteger(value.pid)&&value.pid>0&&value.pid<=2147483647);assert.equal(value.applicationName,'owner184-serialization-holder');assert.match(value.backendStart,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);return Object.freeze(value);
}

export async function verifyMunicipalOwnerAdoptionAuthority(options){
 const{major,output,sourceCommit,transport,operationalPairBaseline='pre107'}=ownerAuthorityQaOptions(['--major='+options.major,'--output='+options.output,'--source-commit='+options.sourceCommit,...(options.transport===undefined?[]:['--transport='+options.transport]),...(options.operationalPairBaseline===undefined?[]:['--operational-pair-baseline='+options.operationalPairBaseline])]);
 const connection=ownerAdoptionQaTransport({root,major,sourceCommit,transport,browser:'none'});
 const destination=path.join(root,output);assert.ok(!fs.existsSync(destination));const sourceClosure=ownerAuthorityQaSourceClosure(),sourceBefore=assertOwnerAuthorityQaSourceBookend(sourceClosure,{committedBytes:file=>execFileSync('git',['-C',root,'show',sourceCommit+':'+file],{maxBuffer:16*1024*1024})}),qa=buildOwnerAuthorityQa({major,sourceCommit,operationalPairBaseline});
 for(const[file,expected]of Object.entries(qa.sourceHashes)){const committed=lf(execFileSync('git',['-C',root,'show',sourceCommit+':'+file],{maxBuffer:16*1024*1024}).toString('utf8'));assert.equal(hash(committed),expected,'OWNER_QA_COMMITTED_SOURCE_CHANGED:'+file);}
 const identity=connection.processGuardRequired?await processGuard(major):null,{runtime,args}=connection;
 fs.mkdirSync(destination);let sequence=0,seeded=false,failure,cleanupFailure,outerFailure,sourceFailure,report,beforeGuard,outerBefore,destinationIdentity=null,serialization=null;const checks=[];
 let pins=transport==='ci'?ownerAdoptionQaCiInitialGuard({major}):`IF current_database()<>'own_payroll_run_qa' OR current_user<>'postgres' OR current_setting('server_version_num')::int/10000<>${major} OR inet_server_port()<>${55400+major} OR host(inet_server_addr())<>'127.0.0.1' OR ${finalReviewAdmissionQaDirectoryPredicate(identity.directory)} OR floor(extract(epoch FROM pg_postmaster_start_time()))::bigint<>${major===17?1792025447:1792025448} OR nullif(current_setting('neon.project_id',true),'') IS NOT NULL OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN RAISE EXCEPTION 'OWNER_QA_DESTINATION_CHANGED';END IF;`;
 const tx=(statements,{end='COMMIT',readOnly=false}={})=>`BEGIN ISOLATION LEVEL REPEATABLE READ${readOnly?' READ ONLY':''};SET LOCAL TIME ZONE 'UTC';SET LOCAL statement_timeout='45s';SET LOCAL lock_timeout='2s';SET LOCAL search_path=pg_catalog,${qa.schema},public,pg_temp;DO $guard$ BEGIN ${pins} END $guard$;${statements.join(';\n')};${end};`;
 const run=(sql,expected)=>{const file=path.join(destination,String(++sequence).padStart(3,'0')+'.sql');fs.writeFileSync(file,sql,{flag:'wx'});const r=spawnSync(runtime.executable,[...args,'-f',file],{encoding:'utf8',windowsHide:true,timeout:60000,env:runtime.environment,maxBuffer:12*1024*1024});fs.writeFileSync(file+'.log',(r.stdout??'')+(r.stderr??''));if(expected){assert.equal(r.status,3);assert.match(r.stderr,new RegExp('\\b'+expected+'\\b'));return;}assert.equal(r.status,0,r.stderr?.slice(-5000));const line=r.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);return line?.startsWith('{')||line?.startsWith('[')?JSON.parse(line):line;};
 const guard=()=>{const proof=run(tx([OWNER_ADOPTION_QA_IDENTITY_SQL],{readOnly:true}));if(destinationIdentity)return assertOwnerAdoptionQaDestination(proof,destinationIdentity);destinationIdentity=captureOwnerAdoptionQaDestination(proof,{major,transport,localIdentity:identity});pins=ownerAdoptionQaDestinationGuard(destinationIdentity);return proof;};
 const snapshot=()=>run(tx([performancePreservationSnapshot(),"SELECT jsonb_build_object('fingerprint',encode(public.digest(current_setting('municontrol_documentary_install.after')::jsonb::text,'sha256'),'hex'),'tables',jsonb_array_length(current_setting('municontrol_documentary_install.after')::jsonb->'tables'))"],{readOnly:true}));
 const ok=label=>checks.push(label),call=(actor=qa.actor)=>`SELECT ${qa.schema}.municipal_owner_adoption_authority_v1(${j(actor)})`;
 try{
  beforeGuard=guard();outerBefore=snapshot();fs.writeFileSync(path.join(destination,'preflight.json'),JSON.stringify({identity,transport,destinationIdentity,beforeGuard,outerBefore,sourceHashes:qa.sourceHashes,sourceClosure,sourceBefore},null,2));
  run(tx([qa.seed]));seeded=true;run(tx([qa.normalized(qa.batch.beforeCheck)]));ok('all six scalar, two private transitive and TABLE capability prerequisites have exact canonical bodies, metadata and ACL');
  const fixtureBaseline=snapshot();
  for(const[label,mutation,error]of ownerAuthorityQaPrerequisiteCases(qa)){run(tx([mutation,...qa.local.installation]),error);assert.deepEqual(snapshot(),fixtureBaseline);ok(label+' is rejected before installation without changing the canonical baseline');}
  run(tx([`GRANT EXECUTE ON FUNCTION ${qa.schema}.tenant_iam_effective_capabilities(uuid) TO municontrol_actions_runtime_app`,...qa.local.installation]),'OWNER_AUTHORITY184_CAPABILITY_SOURCE_CHANGED');assert.deepEqual(snapshot(),fixtureBaseline);ok('broadened private TABLE capability ACL is rejected before installing the resolver');
  run(tx([`ALTER FUNCTION ${qa.schema}.tenant_iam_assert_no_sod_conflict(uuid) SET search_path=public,pg_temp`,...qa.local.installation]),'OWNER_AUTHORITY184_PREREQUISITE_CHANGED');assert.deepEqual(snapshot(),fixtureBaseline);ok('modified canonical SoD metadata is rejected before installing the resolver');
  const rehearsal=run(tx(qa.local.rehearsal,{end:'ROLLBACK'}));assert.equal(rehearsal.mode,'install');run(tx(qa.local.rollbackVerification,{readOnly:true}));assert.deepEqual(snapshot(),fixtureBaseline);ok('rehearsal rolls back and a separate connection proves absence and the complete prior state');
  run(tx(qa.local.repetition),'OWNER_AUTHORITY184_PHASE_REQUIRED');assert.deepEqual(snapshot(),fixtureBaseline);ok('repetition refuses an absent resolver before any creation');
  const installed=run(tx(qa.local.installation)),durable=run(tx(qa.local.verification,{readOnly:true})),repeated=run(tx(qa.local.repetition));const durability=assertMunicipalOwnerAdoptionAuthorityDurability({installed,durable,repeated,batch:qa.batch});ok('install, independent READ ONLY durability and strict verify repetition preserve all prior rows and objects');
  run(tx(qa.local.installation),'OWNER_AUTHORITY184_PHASE_REQUIRED');ok('first-install phase rejects an already installed resolver');
  const authorityBaseline=snapshot(),resolved=run(tx(['SET LOCAL ROLE municontrol_actions_runtime_app',call()]));
  assert.deepEqual(resolved.scope,{tenantId:qa.ids.tenant,membershipId:qa.ids.membership,bindingId:qa.ids.binding,companyId:101});assert.equal(resolved.authority.actor.personId,qa.ids.person);assert.equal(resolved.authority.actor.identityVersion,4);assert.deepEqual(snapshot(),authorityBaseline);ok('runtime resolves a real PLATFORM_OWNER and an existing inactive administrative person with current MFA without data writes');
  const session={id:qa.actor.actorSessionId,version:3,email:qa.actor.actorEmail,releaseSha:qa.actor.releaseSha};const access={mode:'managed',session:{id:session.id,version:3,email:session.email},principal:{authorized:true,user:{email:session.email,identityVersion:4},platform:{roles:['PLATFORM_OWNER'],capabilities:['platform.tenants.manage']},session:{id:session.id,version:3,mfa:true,authLevel:'mfa',expiresAt:new Date(Date.now()+3600000).toISOString()},tenant:{id:qa.ids.tenant,membershipId:qa.ids.membership,source:'membership',dataPlaneReady:true,certifiedReleaseSha:session.releaseSha,effectiveCapabilities:['workforce.employee.read','employee.record.propose'],sourceBindings:[{system:'GRH',database:'owner_qa_source',companyId:101,verified:true}]}}};
  assert.deepEqual(ownerAdoptionAuthorityFromDatabase(access,session,resolved,qa.batch.policy),resolved);ok('the real backend authority boundary validates the database result and pinned server policy');
  for(const[label,statements,error]of ownerAuthorityQaOperationalSodCases(qa)){const value=run(tx(statements.map(qa.relocate),{end:'ROLLBACK'}),error);if(!error)assert.deepEqual(value,{validated:true});assert.deepEqual(snapshot(),authorityBaseline);ok(label+' uses the actual published effective-capability and SoD guards without durable changes');}
  for(const[label,mutation,error,actor]of ownerAuthorityQaCases(qa)){run(tx([...(mutation?[qa.relocate(mutation)]:[]),call(actor)],{end:'ROLLBACK'}),error);assert.deepEqual(snapshot(),authorityBaseline);ok(label+' is rejected without any durable mutation');}
  for(const mutation of [v=>v.authority.actor.personId='00000000-0000-0000-0000-000000000000',v=>v.authority.policySha256='b'.repeat(64),v=>v.authority.actor.identityVersion=5,v=>v.scope.companyId=202]){const changed=structuredClone(resolved);mutation(changed);assert.throws(()=>ownerAdoptionAuthorityFromDatabase(access,session,changed,qa.batch.policy),{code:'OWNER_ADOPTION_AUTHORITY_REQUIRED'});}ok('backend rejects forged actor, policy, identity-version and company results');
  const recovery=run(tx([qa.relocate(`UPDATE tenant_identity_session SET auth_level='recovery' WHERE id=${q(qa.ids.session)}`),call()],{end:'ROLLBACK'}));assert.deepEqual(recovery,resolved);ok('current recovery MFA is accepted without changing authority identity');
  // Advisory serialization uses a real independent connection and observes its
  // held lock before testing NOWAIT. No fixed sleep is treated as evidence.
  const lock=`hashtextextended('PLATFORM_OWNER:GOVERNANCE',12012)`,locker=spawn(runtime.executable,[...args,'-f','-'],{windowsHide:true,env:{...runtime.environment,PGAPPNAME:'owner184-serialization-holder'},stdio:['pipe','pipe','pipe']});let lockOutput='',lockError='';locker.stdout.on('data',b=>lockOutput+=b);locker.stderr.on('data',b=>lockError+=b);const exited=new Promise(resolve=>locker.once('close',code=>resolve(code)));locker.stdin.end(tx([`SELECT jsonb_build_object('pid',pg_backend_pid(),'applicationName',current_setting('application_name'),'backendStart',to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) FROM pg_stat_activity WHERE pid=pg_backend_pid()`,`SELECT pg_advisory_xact_lock(${lock})`,`SELECT pg_sleep(15)`],{end:'ROLLBACK'}));
  try{const deadline=performance.now()+8000;let holder=null,observed=false;while(performance.now()<deadline&&!holder){holder=ownerAuthorityQaHolderIdentity(lockOutput);if(!holder)await new Promise(r=>setTimeout(r,25));}assert.ok(holder,'OWNER_QA_SERIALIZATION_HOLDER_NOT_OBSERVED');pins=ownerAdoptionQaDestinationGuard(destinationIdentity,{allowedClient:holder});
   while(performance.now()<deadline){observed=run(tx([`SELECT jsonb_build_object('held',EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.pid=${holder.pid} AND a.application_name=${q(holder.applicationName)} AND a.backend_start=${q(holder.backendStart)}::timestamptz AND l.locktype='advisory' AND l.granted))`],{readOnly:true})).held;if(observed)break;await new Promise(r=>setTimeout(r,25));}assert.equal(observed,true,'OWNER_QA_SERIALIZATION_LOCK_NOT_OBSERVED');run(tx([call()]),'OWNER_ADOPTION_AUTHORITY_BUSY');serialization={holder,lockObserved:true,typedBusyObserved:true};ok('a real concurrent governance lock blocks authority resolution with the typed busy error');
  }finally{try{const exitCode=await exited;fs.writeFileSync(path.join(destination,'serialization-holder.stdout.log'),lockOutput);fs.writeFileSync(path.join(destination,'serialization-holder.stderr.log'),lockError);assert.equal(exitCode,0,lockError||lockOutput);}finally{pins=ownerAdoptionQaDestinationGuard(destinationIdentity);}}
  assert.deepEqual(snapshot(),authorityBaseline);run(tx([call()],{readOnly:true}),'read-only');ok('resolver is intentionally incompatible with READ ONLY transactions while its separate durability verifier is READ ONLY');
  run(tx(qa.local.rollback));run(tx(qa.local.rollbackVerification,{readOnly:true}));assert.deepEqual(snapshot(),fixtureBaseline);ok('technical rollback removes only the resolver and independently restores complete fixture metadata and rows');
  report={version:'municipal-owner-adoption-authority-qa.v1',passed:true,major,sourceCommit,transport,operationalPairBaseline,destinationIdentity,serialization,sourceHashes:qa.sourceHashes,sourceClosure,sourceBefore,checksPassed:checks.length,checks,rehearsal,installed,durable,repeated,durability,resolverExecuted:true,canonicalAuthorityFunctions:7,canonicalPrivateSupportFunctions:2,fixtureAdministrationStatus:'inactive',actorDataSynthetic:true,productionWrites:0,municipalAcceptance:false,existingApiConnected:false};
 }catch(e){failure=e;fs.writeFileSync(path.join(destination,'failure.txt'),e.stack??String(e));}
 finally{
  try{if(seeded)run(tx(finalReviewAdmissionQaCleanup(qa.schema)));}catch(e){cleanupFailure=e;fs.writeFileSync(path.join(destination,'cleanup-failure.txt'),e.stack??String(e));}
  try{const outerAfter=outerBefore?snapshot():null,postflight=guard(),processAfter=connection.processGuardRequired?await processGuard(major):{windowsProcessVerified:false,ciContextVerified:ownerAdoptionQaTransport({root,major,sourceCommit,transport}).ciContextVerified};fs.writeFileSync(path.join(destination,'postflight.json'),JSON.stringify({outerBefore,outerAfter,postflight,processAfter},null,2));if(outerBefore)assert.deepEqual(outerAfter,outerBefore,'OWNER_QA_OUTSIDE_STATE_CHANGED');if(report){report.syntheticSchemaRemoved=!cleanupFailure;report.priorDatabasePreserved=true;report.postflightOtherClients=0;report.fullOuterConservation={materializedRows:true,leaveRowsExcluded:false,functionsExcluded:false,attributesIndexesAclRls:true};}}catch(e){outerFailure=e;fs.writeFileSync(path.join(destination,'conservation-failure.txt'),e.stack??String(e));}
  try{const sourceAfter=assertOwnerAuthorityQaSourceBookend(sourceClosure);fs.writeFileSync(path.join(destination,'source-bookend.json'),JSON.stringify({sourceCommit,sourceClosure,sourceBefore,sourceAfter},null,2));if(report)report.sourceAfter=sourceAfter;}catch(e){sourceFailure=e;fs.writeFileSync(path.join(destination,'source-bookend-failure.txt'),e.stack??String(e));}
 }
 if(failure||cleanupFailure||outerFailure||sourceFailure)throw new AggregateError([failure,cleanupFailure,outerFailure,sourceFailure].filter(Boolean),'OWNER_AUTHORITY_QA_FAILED');fs.writeFileSync(path.join(destination,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))verifyMunicipalOwnerAdoptionAuthority(ownerAuthorityQaOptions(process.argv.slice(2))).then(r=>console.log(JSON.stringify({passed:r.passed,major:r.major,checksPassed:r.checksPassed,priorDatabasePreserved:r.priorDatabasePreserved,syntheticSchemaRemoved:r.syntheticSchemaRemoved}))).catch(e=>{console.error(e.stack);for(const cause of e.errors??[])console.error(cause.stack);process.exitCode=1;});
