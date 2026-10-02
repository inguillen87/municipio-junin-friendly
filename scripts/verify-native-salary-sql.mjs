// Real existing authority/identity/catalog in disposable loopback PG17/18 only.
// Entire original110 regression retained, no productive schema or rows used.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildNativeEmploymentLifecycleQa} from './verify-native-employment-lifecycle-sql.mjs';
import {row,body} from '../tests/fixtures/native-salary-synthetic.js';
import {salaryFingerprint} from '../lib/internal-native-salary.js';
import {prepareNativeSalaryInstallation} from './prepare-native-salary-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb',root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function buildNativeSalaryQa({serverMajor,requireConcurrency=false}){
 const base=buildNativeEmploymentLifecycleQa({serverMajor,requireConcurrency}),{schema,ids}=base,migration=fs.readFileSync(path.join(root,'scripts/migrations/112-native-salary-definitions.sql'),'utf8').replaceAll('\r\n','\n');
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace').replaceAll("s.nspname='public'","s.nspname="+q(schema)).replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp').replaceAll('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+schema+', public, pg_temp').replaceAll('search_path=public, pg_temp','search_path=pg_catalog, '+schema+', public, pg_temp').replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')");
 const installation=prepareNativeSalaryInstallation({read:f=>fs.readFileSync(path.join(root,f),'utf8').replaceAll('\r\n','\n'),sourceCommit:'9'.repeat(40)});
 const statements=[];let count=0;const exec=s=>statements.push(s),ok=(s,label)=>{exec('PERFORM qa_assert(('+s+'),'+q(label)+');checks:=checks+1;');count++;},reject=(sql,code,label)=>ok('qa_rejects('+sql+','+q(code.startsWith('NATIVE_')?code:'NATIVE_SALARY_'+code)+')',label);
 const write=(actor='maker',payload='salary_body',key='gen_random_uuid()')=>'native_salary_command_v1('+actor+','+payload+','+key+')';
 const rejected=(payload,code,label,actor='maker',key='gen_random_uuid()')=>reject('format('+q('SELECT native_salary_command_v1(%1$L::jsonb,%2$L::jsonb,%3$L::uuid)')+','+actor+','+payload+','+key+')',code,label);
 exec(`salary_old_contracts:=(SELECT md5(jsonb_agg(to_jsonb(ec) ORDER BY id)::text) FROM employment_contract ec);
 EXECUTE ${q(relocate(installation.installation.slice(0,-1).join(';\n')))};
 EXECUTE ${q(relocate(installation.proof))} INTO salary_install_proof;
 EXECUTE ${q(relocate(installation.durableVerification.slice(0,-1).join(';\n')))};
 EXECUTE ${q(relocate(installation.durableProof))} INTO salary_durable_proof;`);
 ok("salary_install_proof->>'allChecksPassed'='true' AND salary_install_proof->>'beforeFingerprint'=salary_install_proof->>'afterFingerprint'",'installation retains all prior data and metadata before committing');
 ok("salary_install_proof-'beforeFingerprint'=salary_durable_proof AND salary_install_proof->>'eventRows'='0' AND salary_install_proof->>'functions112'='12' AND salary_install_proof->>'runtimeFacades'='3'",'independent verification queries match every new object and the complete prior state');
 const sqlReject=(sql,code,label)=>ok('qa_rejects('+q(relocate(sql))+','+q(code)+')',label);
 const tamper=(sql,check)=>`DO $tamper$ BEGIN ${sql}; EXECUTE ${q(check)}; END $tamper$`;
 for(const [sql,check,code,label] of [
  ['ALTER TABLE public.native_salary_event ADD COLUMN unreviewed text',installation.newObjectAudit,'SQL112_NEW_TABLE_SHAPE','extra field never passes installation metadata'],
  ['ALTER TABLE public.native_salary_event DISABLE ROW LEVEL SECURITY',installation.newObjectAudit,'SQL112_NEW_TABLE_SECURITY','disabled RLS stops verification'],
  ['GRANT SELECT ON public.native_salary_event TO municontrol_actions_runtime_app',installation.newObjectAudit,'SQL112_NEW_TABLE_SECURITY','direct runtime table access is refused'],
  ['ALTER TABLE public.native_salary_event DISABLE TRIGGER native_salary_immutable',installation.newObjectAudit,'SQL112_IMMUTABLE_GUARD','disabled immutable history guard is refused'],
  ['GRANT EXECUTE ON FUNCTION public.native_salary_catalog_v1(jsonb) TO municontrol_actions_runtime_app',installation.ownCheck,'SQL112_NEW_FUNCTION_METADATA','private helper grant is refused'],
  ['ALTER FUNCTION public.native_salary_bootstrap_v1(jsonb) COST 201',installation.ownCheck,'SQL112_NEW_FUNCTION_METADATA','changed execution metadata is refused'],
  ['ALTER FUNCTION public.native_salary_bootstrap_v1(jsonb) SECURITY INVOKER',installation.ownCheck,'SQL112_NEW_FUNCTION_METADATA','changed function security is refused'],
  ['ALTER FUNCTION public.native_employment_change_context_v1(jsonb,text) COST 201',installation.preflight,'SQL112_PREREQUISITE_METADATA','changed prerequisite metadata is refused'],
 ])sqlReject(tamper(sql,check),code,label);
 sqlReject(tamper('ALTER FUNCTION public.native_employment_catalog_capacity_v1(integer) COST 201',installation.after+';'+installation.audit),'SQL112_PRIOR_STATE_CHANGED','changed prior function is caught by complete conservation audit');
 exec(`
 INSERT INTO capabilities VALUES(${q(ids.maker)},'payroll.parameter.read'),(${q(ids.maker)},'payroll.parameter.prepare'),(${q(ids.checker)},'payroll.parameter.read'),(${q(ids.checker)},'payroll.parameter.approve'),(${q(ids.samePerson)},'payroll.parameter.read'),(${q(ids.samePerson)},'payroll.parameter.approve'),(${q(ids.reader)},'payroll.parameter.read'),(${q(ids.unlinked)},'payroll.parameter.read'),(${q(ids.unlinked)},'payroll.parameter.prepare');
 salary_boot:=native_salary_bootstrap_v1(maker);
 salary_row:=${j(row())}||jsonb_build_object('agreementCode',(SELECT x->>'code' FROM jsonb_array_elements(salary_boot#>'{classification,items}') x WHERE x->>'kind'='agreements' ORDER BY x->>'code' LIMIT 1));
 salary_body:=${j(body())}||jsonb_build_object('scopeVersion',salary_boot->>'scopeVersion','baseVersion',salary_boot#>>'{catalog,version}','classificationVersion',salary_boot#>>'{classification,version}','items',jsonb_build_array(salary_row));`);
 ok("salary_boot->>'complete'='true' AND salary_boot->>'payrollCalculated'='false' AND salary_boot#>'{catalog,items}'='[]'::jsonb",'empty own catalog reports no invented salary values');
 ok("salary_boot#>>'{permissions,canPropose}'='true' AND salary_boot#>>'{permissions,canReview}'='false'",'read/prepare and independent approval remain distinct existing capabilities');
 ok("(SELECT count(*)=12 AND count(*) FILTER(WHERE has_function_privilege('municontrol_actions_runtime_app',oid,'EXECUTE'))=3 FROM pg_proc WHERE pronamespace="+q(schema)+"::regnamespace AND proname LIKE 'native_salary_%') AND NOT has_table_privilege('municontrol_actions_runtime_app','native_salary_event','SELECT')",'three facades only; private helpers and RLS table are not granted');
 ok("encode(public.digest(native_salary_serialized_v1("+j(body())+"),'sha256'),'hex')="+q(salaryFingerprint(body())),'SQL and JavaScript pin the exact complete request bytes');
 for(const[value,precision]of[[null,2],['0.00',2],['999999999999999999.12345678',8],['-12.500',3],['0',0]])ok('native_salary_items_v1('+j([row({value,precision})])+')#>\'{0,value}\'='+j(value),'exact SQL value '+String(value));
 reject(q('SELECT native_salary_items_v1('+j([row(),row({validFrom:'2026-11'})])+')'),'OVERLAP','open ended definitions cannot silently overlap');
 reject(q('SELECT native_salary_items_v1('+j([row({dependencies:['concept:1::88:2026-10']}),row({code:'88',dependencies:['concept:1::95:2026-10']})])+')'),'CYCLE','cyclic metadata cannot be approved as a valid definition graph');
 rejected('salary_body','FORBIDDEN','read-only actor cannot prepare','reader');
 rejected("salary_body||jsonb_build_object('scopeVersion',native_salary_bootstrap_v1(unlinked)->>'scopeVersion')",'EMPLOYMENT_REQUIRED','unlinked actor never proposes despite prepare cap','unlinked');
 rejected("salary_body||jsonb_build_object('scopeVersion',repeat('f',64))",'SCOPE_CHANGED','changed membership scope never writes');
 rejected("salary_body||jsonb_build_object('baseVersion',repeat('f',64))",'BASE_CHANGED','stale complete catalog never writes');
 rejected("salary_body||jsonb_build_object('classificationVersion',repeat('f',64))",'BASE_CHANGED','changed encuadre catalog never writes');
 rejected("salary_body||jsonb_build_object('actorEmail','other@example.invalid')",'INPUT_INVALID','client may not declare an actor');
 for(const[patch,error,label]of[[{precision:2,value:'1.2'},'INPUT_INVALID','no rounding silently corrects a decimal'],[{value:'0'},'INPUT_INVALID','zero still needs declared precision'],[{validFrom:'2026-13'},'INPUT_INVALID','invalid month never becomes a date'],[{dependencies:['missing']},'DEPENDENCY','missing dependency is not omitted']])rejected("salary_body||jsonb_build_object('items',jsonb_build_array(salary_row||"+j(patch)+'))',error,label);
 exec('salary_receipt:='+write('maker','salary_body','salary_key')+';salary_id:=(salary_receipt->>\'proposalId\')::uuid;');
 ok("salary_receipt->>'status'='pending' AND salary_receipt#>'{body,items,0,value}'='null'::jsonb AND native_salary_bootstrap_v1(maker)#>'{catalog,items}'='[]'::jsonb",'propose stores unknown separately from zero and leaves effective catalog empty');
 ok("(SELECT actor_session_id=(maker->>'actorSessionId')::uuid AND actor_session_version=(maker->>'actorSessionVersion')::integer AND release_sha=maker->>'releaseSha' FROM native_salary_event WHERE id=salary_id)",'session and certified release come from the original authenticated context, not body or resolved subject');
 ok(write('maker','salary_body','salary_key')+"-'replayed'=salary_receipt-'replayed' AND native_salary_attempt_v1(maker,salary_key)->>'replayed'='true'",'exact replay and read-only recovery return original receipt');
 rejected("salary_body||jsonb_build_object('reason','Different synthetic document')",'IDEMPOTENCY_REUSE','same key cannot acknowledge a changed body','maker','salary_key');
 exec("salary_review:=salary_body||jsonb_build_object('command','approve','scopeVersion',native_salary_bootstrap_v1(checker)->>'scopeVersion','items',NULL,'proposalId',salary_id,'proposalSha256',salary_receipt->>'requestSha256','reviewConfirmed',true,'reason','Independent synthetic review of all definitions');");
 rejected("salary_review||jsonb_build_object('scopeVersion',native_salary_bootstrap_v1(same_person)->>'scopeVersion')",'INDEPENDENT_REQUIRED','alternate membership of same person cannot approve','same_person');
 rejected("salary_review||jsonb_build_object('reviewConfirmed',false)",'INPUT_INVALID','review must be explicitly confirmed','checker');
 rejected("salary_review||jsonb_build_object('proposalSha256',repeat('f',64))",'PROPOSAL_CHANGED','review pins exact complete proposal','checker');
 exec('salary_receipt:='+write('checker','salary_review','salary_review_key')+';salary_boot:=native_salary_bootstrap_v1(maker);');
 ok("salary_boot#>>'{catalog,revision}'='1' AND salary_boot#>'{catalog,items}'=salary_body->'items' AND salary_boot#>>'{proposals,0,status}'='approved'",'independent approval publishes an own complete version without canonical writes');
 rejected("salary_body||jsonb_build_object('baseVersion',salary_boot#>>'{catalog,version}','items',jsonb_build_array(salary_row||jsonb_build_object('code','96')))",'HISTORY_REQUIRED','complete replacement never drops a previous definition');
 rejected("salary_body||jsonb_build_object('baseVersion',salary_boot#>>'{catalog,version}','items',native_salary_items_v1(jsonb_build_array(salary_row,salary_row||jsonb_build_object('code','96','agreementCode','999999999'))))",'CLASSIFICATION_INVALID','a new agreement must be in the actual encuadre catalog');
 ok(write('checker','salary_review','salary_review_key')+"-'replayed'=salary_receipt-'replayed'",'approval replay never publishes another revision');
 rejected('salary_review','DECIDED','a second decision cannot alter the approved version','checker');
 exec("salary_body:=salary_body||jsonb_build_object('baseVersion',salary_boot#>>'{catalog,version}','items',native_salary_items_v1(jsonb_build_array(salary_row||jsonb_build_object('value','0.00'))));salary_receipt:="+write()+";salary_boot:=native_salary_bootstrap_v1(checker);salary_review:=salary_review||jsonb_build_object('baseVersion',salary_body->>'baseVersion','proposalId',salary_receipt->>'proposalId','proposalSha256',salary_receipt->>'requestSha256','command','reject');salary_receipt:="+write('checker','salary_review')+';salary_boot:=native_salary_bootstrap_v1(maker);');
 ok("salary_boot#>>'{catalog,revision}'='1' AND salary_boot#>'{catalog,items,0,value}'='null'::jsonb AND salary_boot#>>'{proposals,0,status}'='rejected'",'rejecting explicit zero preserves previous unknown value and all history');
 exec("FOR salary_n IN 1..25 LOOP salary_receipt:="+write('maker',"salary_body||jsonb_build_object('reason','Synthetic full history proposal '||salary_n)")+";END LOOP;salary_boot:=native_salary_bootstrap_v1(maker);");
 ok("jsonb_array_length(salary_boot->'proposals')=27 AND salary_boot->>'complete'='true'",'all27 proposals return across more than one display page');
 for(const command of ['UPDATE native_salary_event SET body=body','DELETE FROM native_salary_event','TRUNCATE native_salary_event CASCADE'])reject(q(command),'IMMUTABLE','immutable history '+command.split(' ')[0]);
 ok('(SELECT md5(jsonb_agg(to_jsonb(ec) ORDER BY id)::text) FROM employment_contract ec)=salary_old_contracts','all canonical employee values preserved');
 reject(q(relocate(migration)),'ALREADY_INSTALLED','second installation fails before changing objects');
 const block=`DECLARE salary_boot jsonb;salary_body jsonb;salary_review jsonb;salary_row jsonb;salary_receipt jsonb;salary_install_proof jsonb;salary_durable_proof jsonb;salary_id uuid;salary_key uuid:=gen_random_uuid();salary_review_key uuid:=gen_random_uuid();salary_old_contracts text;salary_n integer;BEGIN BEGIN ${statements.join('\n')} RAISE EXCEPTION USING ERRCODE='P1121',MESSAGE='RESTORE_SALARY_FIXTURES';EXCEPTION WHEN SQLSTATE 'P1121' THEN NULL;END;END;`;
 const anchor='-- LIFECYCLE_ROSTER_QA_ANCHOR';assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,nativeSalaryChecksPassed:count,checksPassed:base.report.checksPassed+count,migration112Sha256:createHash('sha256').update(migration).digest('hex'),limitations:[...base.report.limitations,'112 is a definition ledger tested with synthetic data, no rule homologation, formula evaluation, productive install or municipal acceptance.']};
 const sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));return {...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const args={};for(const a of process.argv.slice(2)){if(a==='--ci'||a==='--require-concurrency'){args[a.slice(2)]=true;continue;}const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}assert.equal(args.ci,true);assert.ok(args['write-sql']);assert.ok(!args['require-concurrency']||args['write-lock-sql']);const qa=buildNativeSalaryQa({serverMajor:args['expected-major'],requireConcurrency:!!args['require-concurrency']});for(const[key,data]of[['write-sql',qa.sql],['write-lock-sql',qa.lockSql]])if(args[key]){const target=path.resolve(args[key]);assert.ok(!fs.existsSync(target));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx'});}console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,nativeSalaryChecksPlanned:qa.report.nativeSalaryChecksPassed}));}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}}
