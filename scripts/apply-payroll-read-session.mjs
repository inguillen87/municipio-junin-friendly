// Default is read-only preflight. Applying requires explicit project, branch and --apply.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {neon} from '@neondatabase/serverless';
const root=fileURLToPath(new URL('../',import.meta.url));
const contract=JSON.parse(fs.readFileSync(path.join(root,'contracts/payroll-read-session.v1.json'),'utf8'));
const migration=fs.readFileSync(path.join(root,'scripts/migrations/105-payroll-independent-read-session.sql'),'utf8').replaceAll('\r\n','\n');
export const MIGRATION_SHA256='04707ff4374b8a0c3434126ec6c151344303a7b3d080c8514b7376ecda34cf92';
const version='105-payroll-independent-read-session';
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code})};
const targetSql="SELECT current_database() AS database,current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,current_user AS role";
const stateSql=`SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'hash',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'securityDefiner',p.prosecdef,'config',p.proconfig) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('action_center_assert_tenant_read_session_v2','employee_payroll_assert_read_session_v1','employee_payroll_history_v1','employee_payroll_detail_v1','employee_payroll_documents_v1')),
 'capabilityFingerprint',(SELECT md5(string_agg(role_key||':'||capability_key,',' ORDER BY role_key,capability_key)) FROM iam_role_capability),
 'publicationFingerprint',(SELECT md5(coalesce(string_agg(publication_sha256,',' ORDER BY tenant_id,source_binding_id),'')) FROM grh_effective_source_binding),
 'sourceCutoff',(SELECT max(source_cutoff) FROM grh_effective_source_batch_v1),
 'helperRuntimeExecutable',CASE WHEN to_regprocedure('public.employee_payroll_assert_read_session_v1(text,uuid,integer,text,uuid,uuid)') IS NULL THEN NULL ELSE has_function_privilege('municontrol_actions_runtime_app','public.employee_payroll_assert_read_session_v1(text,uuid,integer,text,uuid,uuid)','EXECUTE') END
) AS state`;
function functionRow(state,signature){return state.functions.find(f=>f.signature===signature.replace(/^public\./,''))}
export async function applyPayrollReadSession({sql,expectedProject,expectedBranch,apply=false,commit=null}){
 if(!/^[a-z0-9-]{3,80}$/.test(expectedProject??'')||!/^br-[a-z0-9-]{3,80}$/.test(expectedBranch??''))fail('PAYROLL_READ_EXPLICIT_TARGET_REQUIRED');
 if(hash(migration)!==MIGRATION_SHA256)fail('PAYROLL_READ_MIGRATION_CHANGED');
 const [target]=await sql.query(targetSql);
 if(target.project!==expectedProject||target.branch!==expectedBranch||target.database!=='neondb'||target.role!=='neondb_owner')fail('PAYROLL_READ_TARGET_MISMATCH');
 const [{state:before}]=await sql.query(stateSql);
 const original=functionRow(before,contract.guardSignature);if(original?.hash!==contract.guardHash)fail('PAYROLL_READ_GUARD_DRIFT');
 for(const c of contract.callers){const f=functionRow(before,c.signature);if(!f||![c.oldHash,c.newHash,c.alternativeOldHash,c.alternativeNewHash].filter(Boolean).includes(f.hash)||!f.securityDefiner||f.owner!==target.role)fail('PAYROLL_READER_SOURCE_DRIFT')}
 const ledger=await sql.query('SELECT checksum_sha256 FROM schema_migrations WHERE version=$1',[version]);
 if(ledger.some(r=>r.checksum_sha256!==MIGRATION_SHA256))fail('PAYROLL_READ_LEDGER_DRIFT');
 const receipt={version:'payroll-read-release.v1',checkedAt:new Date().toISOString(),commit,target,migrationSha256:MIGRATION_SHA256,sourceCutoff:before.sourceCutoff,sourcePromoted:false,roleCapabilitiesChanged:false,writeApprovalGuardChanged:false};
 if(!apply)return {...receipt,mode:'preflight',databaseWrites:0,ready:true};
 if(!/^[a-f0-9]{32}$/.test(before.capabilityFingerprint)||! /^[a-f0-9]{32}$/.test(before.publicationFingerprint))fail('PAYROLL_READ_STATE_FINGERPRINT_REQUIRED');
 const ledgerSql=`DO $ledger$ BEGIN
  IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='${version}' AND checksum_sha256<>'${MIGRATION_SHA256}') THEN RAISE EXCEPTION 'PAYROLL_READ_LEDGER_DRIFT'; END IF;
  INSERT INTO schema_migrations(version,checksum_sha256) VALUES('${version}','${MIGRATION_SHA256}') ON CONFLICT(version) DO NOTHING;
 END $ledger$;`;
 const preserveSql=`DO $preserve$ DECLARE snapshot jsonb; BEGIN
  ${stateSql.replace(' AS state',' INTO snapshot')};
  IF snapshot->>'capabilityFingerprint'<>'${before.capabilityFingerprint}' OR snapshot->>'publicationFingerprint'<>'${before.publicationFingerprint}' THEN RAISE EXCEPTION 'PAYROLL_READ_UNEXPECTED_STATE_CHANGE'; END IF;
 END $preserve$;`;
 const answers=await sql.transaction([sql.query("SET LOCAL lock_timeout='5s'"),sql.query("SET LOCAL statement_timeout='45s'"),sql.query(migration),sql.query(preserveSql),sql.query(ledgerSql),sql.query(stateSql)]);
 const after=answers.at(-1)[0].state;
 assert.equal(functionRow(after,contract.guardSignature).hash,contract.guardHash);
 assert.equal(functionRow(after,contract.helperSignature).hash,contract.helperHash);assert.equal(after.helperRuntimeExecutable,false);
 for(const c of contract.callers){const f=functionRow(after,c.signature),old=functionRow(before,c.signature);assert.ok([c.newHash,c.alternativeNewHash].filter(Boolean).includes(f.hash));assert.equal(f.owner,old.owner);assert.equal(f.acl,old.acl)}
 return {...receipt,mode:'applied',ready:true,readersVerified:contract.callers.length,privateHelperVerified:true,salaryDataWrites:0,helperHash:contract.helperHash};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {values}=parseArgs({options:{apply:{type:'boolean'},'expected-project':{type:'string'},'expected-branch':{type:'string'},output:{type:'string'}},strict:true});
  const url=process.env.SCHEMA_OWNER_DATABASE_URL;if(typeof url!=='string'||!url.startsWith('postgresql://'))fail('PAYROLL_READ_OWNER_CONNECTION_REQUIRED');
  const result=await applyPayrollReadSession({sql:neon(url),expectedProject:values['expected-project'],expectedBranch:values['expected-branch'],apply:values.apply===true,commit:process.env.MUNICONTROL_RELEASE_SHA??null});
  if(values.output)fs.writeFileSync(path.resolve(values.output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
 }catch(e){console.error(typeof e?.code==='string'&&/^[A-Z0-9_]{2,80}$/.test(e.code)?e.code:'PAYROLL_READ_RELEASE_FAILED');process.exitCode=1;}
}
