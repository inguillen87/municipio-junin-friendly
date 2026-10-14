// Committed technical protocol in the existing disposable loopback QA instances.
// No cloud connection override and no municipal actor or record.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {buildMonthlyCorrectionQa} from './verify-monthly-approved-corrections-sql.mjs';
import {nativeMonthlyQaInstallation} from './lib/native-monthly-qa-installation.mjs';
import {relocateMonthlyStorageSql} from './lib/monthly-revision-storage-qa.mjs';
import {buildMonthlyRevisionStorageInstallation,assertMonthlyRevisionStorageDurability} from './lib/monthly-revision-storage-installation.mjs';
import {noeliaCircuitRuntime,noeliaQaApplicationName} from './lib/noelia-circuit-runtime.mjs';
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
export async function verifyMonthlyRevisionStorageDurable(options){
 const root=fs.realpathSync(new URL('..',import.meta.url)),major=Number(options.major),output=path.resolve(root,options.output??'');
 assert.ok([17,18].includes(major)&&output.startsWith(path.join(root,'verification')+path.sep));
 assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),options.sourceCommit);
 const sourceState=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).split(/\r?\n/).some(l=>l&&!l.endsWith('AGENTS.md')&&!l.endsWith('CODEX_TASK.md')&&!l.endsWith('MUNICONTROL_HANDOFF.md')&&!l.endsWith('.handoff/'))?'working-tree':'committed';
 assert.ok(!fs.existsSync(output));
 const runtime=noeliaCircuitRuntime({root,major,transport:options.transport??'local',browser:'none'});
 const qa=buildMonthlyCorrectionQa({serverMajor:major}),{schema}=qa;
 const environment={...runtime.environment,PGAPPNAME:noeliaQaApplicationName(schema)};
 const args=['-X','-q','-t','-A','-h','127.0.0.1','-p',String(55400+major),'-U','postgres','-d','own_payroll_run_qa','-v','ON_ERROR_STOP=1','-f','-'];
 const pins=qa.qaFoundation.pins.replace("current_database()<>'fixed_novelties_qa'","current_database()<>'own_payroll_run_qa'");
 const destination=`DO $destination$ BEGIN ${pins} IF current_user<>'postgres' THEN RAISE EXCEPTION 'MONTHLY_STORAGE_QA_OWNER_CHANGED';END IF;END $destination$;`;
 const prefix=`BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL statement_timeout='45s';SET LOCAL lock_timeout='5s';${destination}SET LOCAL search_path=${schema},pg_catalog,public,pg_temp;`;
 const run=sql=>new Promise((resolve,reject)=>{
  const child=execFile(runtime.executable,args,{windowsHide:true,env:environment,maxBuffer:4*1024*1024,timeout:55000},(error,stdout,stderr)=>{
   if(error){error.stderr=stderr;reject(error);return;}const lines=stdout.split(/\r?\n/).filter(l=>l.startsWith('{'));resolve(lines.length?JSON.parse(lines.at(-1)):null);
  });child.stdin.on('error',()=>{});child.stdin.end(sql,'utf8');
 });
 const relocate=s=>relocateMonthlyStorageSql(s,schema),read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const protocol=buildMonthlyRevisionStorageInstallation({read,sourceCommit:options.sourceCommit,verifiedBudgetBytes:1073741824});
 const beforeCheck=relocate(protocol.beforeCheck),afterCheck=relocate(protocol.afterCheck),mutation=relocate(protocol.mutations[0]);
 const statements=protocol.statements.map(s=>s===protocol.choose?`DO $choose$ BEGIN IF current_setting('municontrol_monthly_storage.mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`:s===protocol.apply?`DO $apply$ BEGIN IF current_setting('municontrol_monthly_storage.mode')='install' THEN EXECUTE ${q(mutation)};END IF;END $apply$`:relocate(s));
 let seeded=false,result;
 try{
  // Same published 026/029/032/097/101 composition as the full monthly suite.
  // Its initial synthetic IAM table has no primary key; add the original key
  // required by the reviewed composition rather than bypassing that check.
  const monthly=nativeMonthlyQaInstallation(schema);
  const ledgers=['120-monthly-approved-annulments.sql','121-monthly-approved-corrections.sql'].map(f=>'EXECUTE '+q(relocate(read('scripts/migrations/'+f)))+';').join('\n');
  await run(`${prefix}DO $setup$ BEGIN ${qa.qaFoundation.setup}\nALTER TABLE iam_role ADD PRIMARY KEY(role_key);${monthly}\n${ledgers} END $setup$;COMMIT;`);seeded=true;
  const installed=await run(prefix+statements.join(';')+';COMMIT;');
  const durable=await run(prefix+protocol.verification.map(relocate).join(';')+';COMMIT;');
  assertMonthlyRevisionStorageDurability(installed,durable);assert.equal(installed.mode,'install');
  const repeated=await run(prefix+statements.join(';')+';COMMIT;');assertMonthlyRevisionStorageDurability(installed,repeated);assert.equal(repeated.mode,'verify');
  const security=await run(prefix+`SELECT jsonb_build_object('updatedTargets',(SELECT count(*) FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname IN('payroll_monthly_annul_command_v1','payroll_monthly_correction_command_v1') AND position('1056964608' in p.prosrc)>0 AND has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE')));COMMIT;`);
  assert.equal(security.updatedTargets,2);
  result={ok:true,major,syntheticOnly:true,productiveBusinessWrites:0,sourceState,installed,durable,repeated,security,qaSchema:schema,qaSchemaRemoved:false};
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
 }catch(error){fs.writeFileSync(output+'.failure.txt',error.stderr??error.stack??String(error),{flag:'wx'});throw error;}
 finally{if(seeded){assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);await run(`${prefix}DROP SCHEMA ${schema} CASCADE;COMMIT;`);if(result){result.qaSchemaRemoved=true;fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');}}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};for(const arg of process.argv.slice(2)){const m=/^--(major|output|source-commit|transport)=(.+)$/.exec(arg);assert.ok(m&&!Object.hasOwn(options,m[1]));options[m[1]]=m[2];}
 try{const r=await verifyMonthlyRevisionStorageDurable({major:options.major,output:options.output,sourceCommit:options['source-commit'],transport:options.transport});console.log(JSON.stringify({ok:r.ok,major:r.major,adaptedFunctions:2,durable:true,verifyOnlyRepeat:true,syntheticOnly:true}));}catch(e){console.error(e.message);process.exitCode=1;}
}
