// Extends unchanged published regression foundations. Generates SQL only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildOwnAccountingQa } from './verify-own-payroll-accounting-sql.mjs';
import { buildOwnBankAccountsInstallation } from './lib/own-bank-accounts-installation.mjs';
import { syntheticBankAccountsDefinition, syntheticCbu } from '../tests/fixtures/own-bank-accounts-synthetic.js';
const root=path.resolve(import.meta.dirname,'..'),q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
export function buildOwnBankAccountsQa({serverMajor}) {
 const base=buildOwnAccountingQa({serverMajor}),{schema}=base,installation=buildOwnBankAccountsInstallation({read:f=>fs.readFileSync(path.join(root,f),'utf8'),sourceCommit:'a'.repeat(40)});
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace').replaceAll("s.nspname='public'","s.nspname="+q(schema)).replace(/SET search_path\s*=\s*pg_catalog,public,pg_temp/g,'SET search_path=pg_catalog,'+schema+',public,pg_temp').replaceAll('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+schema+', public, pg_temp').replaceAll('search_path=public, pg_temp','search_path=pg_catalog, '+schema+', public, pg_temp').replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')");
 const statements=[];let count=0;const exec=s=>statements.push(s),ok=(s,label)=>{exec('PERFORM qa_assert(('+s+'),'+q(label)+');checks:=checks+1;');count++;};
 const write=(actor='maker',body='ba_body',key='gen_random_uuid()')=>'own_bank_accounts_command_v1('+actor+','+body+','+key+')';
 const reject=(body,code,label,actor='maker',key='gen_random_uuid()')=>ok('qa_rejects(format('+q('SELECT own_bank_accounts_command_v1(%1$L::jsonb,%2$L::jsonb,%3$L::uuid)')+','+actor+','+body+','+key+'),'+q('BANK_ACCOUNTS_'+code)+')',label);
 // The inherited minimal fixture omits the published ACL of the real 007 helper.
 // Restore that exact private ACL before the preservation snapshot; keep the
 // installation's prerequisite/metadata checks unchanged.
 exec('REVOKE ALL ON FUNCTION action_center_context_has_capability(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;EXECUTE '+q(relocate(installation.installation.slice(0,-1).join(';\n')))+';EXECUTE '+q(relocate(installation.proof))+' INTO ba_installed;EXECUTE '+q(relocate(installation.durableVerification.slice(0,-1).join(';\n')))+';EXECUTE '+q(relocate(installation.durableProof))+' INTO ba_durable;');
 ok("ba_installed-'beforeFingerprint'=ba_durable AND ba_installed->>'beforeFingerprint'=ba_installed->>'preservationSha256' AND ba_installed->>'eventRows'='0'",'SQL149 empty installation preserves prior data/functions and durable metadata');
 for(const [mutation,check,code]of[
 ['GRANT SELECT ON own_bank_account_event TO municontrol_actions_runtime_app',installation.tableCheck,'BANK_ACCOUNTS_TABLE_SECURITY'],
 ['ALTER TABLE own_bank_account_event DISABLE TRIGGER own_bank_accounts_immutable',installation.tableCheck,'BANK_ACCOUNTS_IMMUTABLE_GUARD'],
 ['GRANT EXECUTE ON FUNCTION own_bank_accounts_cbu_v1(jsonb) TO municontrol_actions_runtime_app',installation.ownCheck,'BANK_ACCOUNTS_FUNCTION_METADATA'],
 ['ALTER FUNCTION own_bank_accounts_command_v1(jsonb,jsonb,uuid) COST 101',installation.ownCheck,'BANK_ACCOUNTS_FUNCTION_METADATA'],
 ]){exec('BEGIN '+mutation+';');ok('qa_rejects('+q(relocate(check))+','+q(code)+')','Metadata drift rejected: '+mutation);exec("RAISE EXCEPTION USING ERRCODE='P1491',MESSAGE='RESTORE_BANK_METADATA';EXCEPTION WHEN SQLSTATE 'P1491' THEN NULL;END;");}
 exec(`ba_boot:=own_bank_accounts_bootstrap_v1(maker);ba_sources:=ba_boot->'sources';ba_definition:=jsonb_build_object('accounts',jsonb_build_array(${j(syntheticBankAccountsDefinition().accounts[0])}||jsonb_build_object('contractId',ba_sources#>>'{contracts,0,contractId}')));ba_body:=jsonb_build_object('command','propose','scopeVersion',ba_boot->>'scopeVersion','baseVersion',ba_boot#>>'{configuration,version}','sourceVersion',ba_sources->>'version','proposalId',NULL,'proposalSha256',NULL,'definition',ba_definition,'reason','Synthetic bank metadata with documentary backing','reviewConfirmed',false);`);
 ok("ba_boot->>'complete'='true' AND ba_boot#>>'{configuration,revision}'='0' AND ba_boot->>'transferGenerated'='false' AND ba_boot->>'paymentExecuted'='false'",'Empty catalogue never invents an account or executes a transfer');
 ok("(SELECT count(*)=14 AND count(*) FILTER(WHERE has_function_privilege('municontrol_actions_runtime_app',oid,'EXECUTE'))=4 FROM pg_proc WHERE pronamespace="+q(schema)+"::regnamespace AND proname LIKE 'own_bank_accounts_%') AND NOT has_table_privilege('municontrol_actions_runtime_app','own_bank_account_event','SELECT')",'Only four facades available; helpers and direct private table remain denied');
 reject('ba_body','FORBIDDEN','Read-only identity never writes','reader');
 reject("ba_body||jsonb_build_object('scopeVersion',repeat('f',64))",'SCOPE_CHANGED','Changed actor scope never writes');
 reject("ba_body||jsonb_build_object('baseVersion',repeat('f',64))",'BASE_CHANGED','Changed complete base never writes');
 reject("ba_body||jsonb_build_object('sourceVersion',repeat('f',64))",'BASE_CHANGED','Changed complete own identity source never writes');
 reject("ba_body||jsonb_build_object('actorEmail','forged@example.invalid')",'INPUT_INVALID','Client cannot select the actor');
 for(const[field,value,code]of[['cbu','0'.repeat(22),'INPUT_INVALID'],['cbu',syntheticCbu().slice(0,21)+'0','INPUT_INVALID'],['accountNumber',0,'INPUT_INVALID'],['accountType','UNKNOWN','INPUT_INVALID'],['currency',null,'INPUT_INVALID'],['documentReference','', 'INPUT_INVALID'],['validFrom','2026-02-30','INPUT_INVALID'],['validUntil','2026-09-30','INPUT_INVALID'],['contractId','bbbbbbbb-0000-4000-8000-000000000009','SOURCE_REQUIRED']])reject(`jsonb_set(ba_body,'{definition,accounts,0,${field}}',${j(value)})`,code,'Invalid bank field '+field+' rejects whole proposal');
 reject("jsonb_set(ba_body,'{definition,accounts}',(ba_definition->'accounts')||(ba_definition->'accounts'))",'INPUT_INVALID','Duplicate account identity rejects whole proposal');
 reject("jsonb_set(ba_body,'{definition,accounts}',(ba_definition->'accounts')||jsonb_build_array((ba_definition#>'{accounts,0}')||jsonb_build_object('id',gen_random_uuid())))",'OVERLAP','Two enabled intervals cannot overlap for one contract');
 reject("jsonb_set(ba_body,'{definition,accounts}',(SELECT jsonb_agg(ba_definition#>'{accounts,0}') FROM generate_series(1,10001)))",'LIMIT','Capacity failure never truncates account rows');
 ok('(SELECT count(*) FROM own_bank_account_event)=0','Every invalid command preserves an empty ledger');
 exec('ba_key:=gen_random_uuid();ba_receipt:='+write('maker','ba_body','ba_key')+";ba_id:=(ba_receipt->>'proposalId')::uuid;");
 ok("ba_receipt->'body'=ba_body AND ba_receipt->>'status'='pending' AND own_bank_accounts_bootstrap_v1(maker)#>>'{configuration,revision}'='0'",'Proposal conserves leading-zero metadata without approving');
 ok(write('maker','ba_body','ba_key')+"-'replayed'=ba_receipt-'replayed' AND own_bank_accounts_attempt_v1(maker,ba_key)->>'replayed'='true'",'Original committed receipt replay never creates another version');
 reject("ba_body||jsonb_build_object('reason','Different synthetic bank request')",'IDEMPOTENCY_REUSE','Same key cannot change content','maker','ba_key');
 ok("qa_rejects(format('SELECT own_bank_accounts_attempt_v1(%L::jsonb,%L::uuid)',checker,ba_key),'BANK_ACCOUNTS_NOT_FOUND')",'Another identity cannot recover preparer attempt');
 exec("ba_detail:=own_bank_accounts_detail_v1(checker,ba_id);ba_review:=ba_body||jsonb_build_object('command','approve','scopeVersion',native_salary_scope_v1(native_salary_context_v1(checker)),'proposalId',ba_id,'proposalSha256',ba_receipt->>'requestSha256','definition',NULL,'reason','Independent synthetic bank account review','reviewConfirmed',true);");
 ok("ba_detail->'body'=ba_body AND ba_detail->'sources'=ba_sources AND ba_detail->>'current'='true'",'Reviewer receives all captured sources, base and account data');
 reject("ba_review||jsonb_build_object('scopeVersion',native_salary_scope_v1(native_salary_context_v1(same_person)))",'INDEPENDENT_REQUIRED','Same person with another login cannot approve','same_person');
 reject("ba_review||jsonb_build_object('proposalSha256',repeat('f',64))",'PROPOSAL_CHANGED','Changed reviewed proposal hash never applies','checker');
 exec('ba_approval:='+write('checker','ba_review')+';');
 ok("ba_approval->>'revision'='1' AND own_bank_accounts_bootstrap_v1(maker)#>'{configuration,definition}'=ba_definition AND ba_approval->>'paymentExecuted'='false'",'Independent approval keeps exact CBU, currency and account number');
 reject('ba_review','DECIDED','Second approval never duplicates the decision','checker');
 const archived="ba_sources||jsonb_build_object('contracts','[]'::jsonb)";
 ok(`own_bank_accounts_definition_v1(ba_definition,${archived},ba_definition)=ba_definition`,'Archived contract retains unchanged bank history');
 ok(`own_bank_accounts_definition_v1(jsonb_set(ba_definition,'{accounts,0,status}','"withdrawn"'),${archived},ba_definition)#>>'{accounts,0,status}'='withdrawn'`,'Archived contract permits explicit withdrawal without erasure');
 ok(`qa_rejects(format('SELECT own_bank_accounts_definition_v1(%L::jsonb,%L::jsonb,%L::jsonb)',jsonb_set(ba_definition,'{accounts,0,bankLabel}','"Unauthorized correction"'),${archived},ba_definition),'BANK_ACCOUNTS_SOURCE_REQUIRED')`,'Archived source never enables new/corrected destination');
 exec("ba_boot:=own_bank_accounts_bootstrap_v1(maker);ba_body:=ba_body||jsonb_build_object('baseVersion',ba_boot#>>'{configuration,version}');");
 reject("jsonb_set(ba_body,'{definition,accounts,0,id}',to_jsonb(gen_random_uuid()::text))",'HISTORY_REQUIRED','Approved account reference cannot vanish');
 reject("jsonb_set(ba_body,'{definition,accounts,0,contractId}',to_jsonb(gen_random_uuid()::text))",'HISTORY_REQUIRED','Approved identity cannot be relinked to a person');
 exec("ba_definition:=jsonb_set(ba_definition,'{accounts,0,cbu}',"+j(syntheticCbu('9990001','0000000000002'))+");ba_definition:=jsonb_set(ba_definition,'{accounts,0,documentReference}','\"New synthetic constancy for corrected CBU\"');ba_body:=ba_body||jsonb_build_object('definition',ba_definition);ba_receipt:="+write()+";ba_review:=ba_review||jsonb_build_object('baseVersion',ba_body->>'baseVersion','proposalId',ba_receipt->>'proposalId','proposalSha256',ba_receipt->>'requestSha256');ba_approval:="+write('checker','ba_review')+';');
 ok("ba_approval->>'revision'='2' AND own_bank_accounts_bootstrap_v1(maker)#>'{configuration,definition}'=ba_definition AND (SELECT body FROM own_bank_account_event WHERE id=ba_id)#>>'{definition,accounts,0,cbu}'<>ba_definition#>>'{accounts,0,cbu}'",'Correction creates a new independently reviewed immutable version');
 for(const sql of['UPDATE own_bank_account_event SET body=body','DELETE FROM own_bank_account_event','TRUNCATE own_bank_account_event CASCADE'])ok('qa_rejects('+q(sql)+",'BANK_ACCOUNTS_IMMUTABLE')",'Immutable account versions reject '+sql.split(' ')[0]);
 exec("DELETE FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key='payroll.parameter.prepare';");
 reject('ba_body','FORBIDDEN','Revoked preparation stops original attempt');
 ok("qa_rejects(format('SELECT own_bank_accounts_attempt_v1(%L::jsonb,%L::uuid)',maker,ba_key),'BANK_ACCOUNTS_FORBIDDEN')",'Revocation stops original private receipt');
 exec("INSERT INTO capabilities VALUES((maker->>'membershipId')::uuid,'payroll.parameter.prepare');");
 const block='DECLARE ba_installed jsonb;ba_durable jsonb;ba_boot jsonb;ba_sources jsonb;ba_definition jsonb;ba_body jsonb;ba_review jsonb;ba_detail jsonb;ba_receipt jsonb;ba_approval jsonb;ba_key uuid;ba_id uuid;BEGIN '+statements.join('\n')+' END;',anchor="RAISE EXCEPTION USING ERRCODE='P1121',MESSAGE='RESTORE_SALARY_FIXTURES';";
 assert.equal(base.sql.split(anchor).length,2);const report={...base.report,ownBankAccountsChecksPassed:count,checksPassed:base.report.checksPassed+count,limitations:[...base.report.limitations,'SQL149 synthetic accounts only: no real adoption, bank account configuration, transfer or payment.']};
 // This new, larger harness retains every inherited assertion. Allow a bounded
 // five minutes for the single synthetic regression block (including repeated
 // physical pg_database_size scans on Windows). Runtime/lock limits are unchanged.
 return {...base,report,sql:base.sql.replaceAll('own_payroll_accounting_qa','own_bank_accounts_qa').replace("SET LOCAL statement_timeout='180s'","SET LOCAL statement_timeout='300s'").replace(anchor,()=>block+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{const args={};for(const a of process.argv.slice(2)){if(a==='--ci'){args.ci=true;continue;}const m=/^--(expected-major|write-sql)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}assert.equal(args.ci,true);const qa=buildOwnBankAccountsQa({serverMajor:args['expected-major']}),target=path.resolve(args['write-sql']);assert.ok(!fs.existsSync(target));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,qa.sql,{flag:'wx'});console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,bankChecks:qa.report.ownBankAccountsChecksPassed}));}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}
