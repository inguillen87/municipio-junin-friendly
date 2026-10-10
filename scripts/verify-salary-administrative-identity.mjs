// All accounts, contracts, definitions and writes below are synthetic.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {buildNoeliaCircuitQa,createNoeliaCircuitPsqlQa} from './lib/noelia-payroll-circuit-qa.mjs';
import {buildSalaryAdministrativeIdentityInstallation} from './lib/salary-administrative-identity-installation.mjs';
import {buildExactProgramPrecisionInstallation} from './lib/exact-program-precision-installation.mjs';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {createNativeSalaryHandler} from '../api/internal-native-salary.js';
import {createOwnProgramHandler} from '../api/internal-own-payroll-program.js';
import {row} from '../tests/fixtures/native-salary-synthetic.js';import {salaryItems} from '../assets/native-salary-catalog-model.js';
import {command as programCommand} from '../tests/fixtures/own-payroll-program-synthetic.js';
import {verifySalaryAdministrativeBrowser} from './lib/salary-administrative-identity-browser.mjs';
const root=fs.realpathSync(new URL('..',import.meta.url)),j=v=>q(JSON.stringify(v))+'::jsonb';
export async function verifySalaryAdministrativeIdentity({major,transport='local',sourceCommit,output,browser='none'}){
 assert.ok([17,18].includes(major));assert.ok(['none','chrome','chromium'].includes(browser));assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const destination=path.resolve(root,output);assert.ok(destination.startsWith(root+path.sep+'verification'+path.sep));assert.ok(!fs.existsSync(destination));fs.mkdirSync(destination);
 const qa=buildNoeliaCircuitQa(major),batch=buildSalaryAdministrativeIdentityInstallation({read:f=>fs.readFileSync(path.join(root,f),'utf8'),sourceCommit});
 const db=createNoeliaCircuitPsqlQa({major,port:55400+major,schema:qa.schema,pins:qa.pins,transport});
 const n=s=>{
  // Normalize embedded metadata before SQL-quoting it, so nested DO blocks
  // check the same canonical body hashes as the actual production batch.
  if(s.startsWith('DO $check$'))return `DO $check$ BEGIN IF current_setting('municontrol_salary_identity.mode')='install' THEN EXECUTE ${q(n(batch.beforeCheck))};ELSE EXECUTE ${q(n(batch.afterCheck))};END IF;END $check$`;
  return qa.normalized(s).replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(qa.schema+'.')+",'public'||'.')");
 },checks=[],ok=(v,label)=>{assert.ok(v,label);checks.push(label);};
 const sql=async s=>{fs.appendFileSync(path.join(destination,'synthetic-executed.sql'),s+';\n');return await db.run(s);};
 const rpc=(name,actor=qa.actors.maker,args='')=>db.run('SELECT '+qa.schema+'.'+name+'('+j(actor)+(args?','+args:'')+')',true);
 const mutationProof=()=>db.run("SELECT jsonb_build_object('contracts',(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY id)::text) FROM employment_contract c),'links',(SELECT md5(jsonb_agg(to_jsonb(l) ORDER BY membership_id)::text) FROM tenant_action_employment_link l),'salaryEvents',(SELECT count(*) FROM native_salary_event),'programEvents',(SELECT count(*) FROM own_payroll_program_event),'captures',(SELECT count(*) FROM own_payroll_run_capture),'results',(SELECT count(*) FROM own_payroll_run_result))");
 const rejected=async(fn,code,label)=>{await assert.rejects(fn,new RegExp(code));checks.push(label);};
 let current=qa.actors.maker;
 const caps=['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve'];
 const adapter={query:async(query,values)=>{
  assert.match(query,/^SELECT public\.(?:native_salary|own_program)_(?:bootstrap|command|attempt)_v1\([\s\S]+\) AS result$/);
  return [{result:await db.run(query.replaceAll('public.',qa.schema+'.').replace(/\$(\d+)/g,(_,k)=>{assert.ok(Number(k)>0&&Number(k)<=values.length);return q(values[Number(k)-1]);}),true)}];
 }};
 const env={INTERNAL_APP_ORIGIN:'https://salary-identity-qa.example'},deps={env,requireAccess:()=>({mode:'managed',principal:{user:{email:current.actorEmail},tenant:{source:'membership',id:current.tenantId,membershipId:current.membershipId,effectiveCapabilities:caps}}}),sessionFor:()=>({email:current.actorEmail,id:current.actorSessionId,version:current.actorSessionVersion,releaseSha:current.releaseSha}),getSql:()=>adapter};
 const handlers={salary:createNativeSalaryHandler(deps),program:createOwnProgramHandler(deps)};
 const api=async(kind,{resource='bootstrap',key,body,expected=200}={})=>{
  const query=body?{}:{resource,...(key?{key}:{})},res={setHeader(){},status(s){this.statusCode=s;return this;},json(v){this.value=v;return this;}};
  await handlers[kind]({method:body?'POST':'GET',url:'/api/qa-'+kind+(body?'':'?'+new URLSearchParams(query)),query,headers:body?{origin:env.INTERNAL_APP_ORIGIN,'content-type':'application/json','idempotency-key':key}:{},...(body?{body:JSON.stringify({operation:'command',payload:body})}:{})},res);
  assert.equal(res.statusCode,expected,JSON.stringify(res.value));return res.value.data??res.value;
 };
 let seeded=false,failure,report;
 try{
  await sql(qa.sql);seeded=true;
  // Install the previously published dependency chain in this synthetic schema.
  await sql(qa.adaptation);
  await sql(n(batch.context));
  const precision=buildExactProgramPrecisionInstallation({read:f=>fs.readFileSync(path.join(root,f),'utf8'),sourceCommit});await sql(n(precision.changed));
  // Earlier fixtures omit this production column; model the actual revocation fact.
  await sql('ALTER TABLE tenant_action_employment_link ADD COLUMN revoked_at timestamptz');
  const activeBoot=await api('salary'),programBefore=await api('program');
  ok(activeBoot.permissions.canPropose&&programBefore.permissions.canPropose,'existing active parameter author is enabled before the upgrade');
  const key=randomUUID(),oldBody={command:'propose',scopeVersion:activeBoot.scopeVersion,baseVersion:activeBoot.catalog.version,classificationVersion:activeBoot.classification.version,proposalId:null,proposalSha256:null,items:salaryItems([...activeBoot.catalog.items,row({code:'99991',unit:'money',value:'0.01'})]),reason:'Propuesta exclusivamente sintética anterior al cambio de identidad administrativa',reviewConfirmed:false};
  const oldReceipt=await api('salary',{body:oldBody,key,expected:201}),originalBytes=JSON.stringify({key,body:oldBody});
  // Historical status is test setup, not a change made by the installation.
  await sql("ALTER TABLE employment_contract DISABLE TRIGGER grh_effective_baseline_rows;UPDATE employment_contract SET status='inactive',end_date=DATE '2026-09-30' WHERE id="+q(qa.ids.makerContract)+"::uuid;ALTER TABLE employment_contract ENABLE TRIGGER grh_effective_baseline_rows");
  const historicalBefore=await api('salary');ok(!historicalBefore.permissions.canPropose,'regression reproduced: enabled identity with historical employment cannot prepare parameters');
  const before=await mutationProof(),installed=await sql(batch.statements.map(n).join(';\n'));
  ok(installed.mode==='install'&&installed.newTables===0&&installed.newFunctions===1&&installed.adaptedFunctions===8,'only one private helper and eight exact parameter function bodies are installed');
  assert.deepEqual(await mutationProof(),before);ok(true,'installation preserves all contracts, associations, program and salary events and calculations');
  const durable=await sql(batch.verification.map(n).join(';\n'));ok(durable.preservationSha256===installed.preservationSha256,'fresh connection verifies durable prior-state conservation');
  const repeated=await sql(batch.statements.map(n).join(';\n'));ok(repeated.mode==='verify'&&repeated.preservationSha256===installed.preservationSha256,'second execution is verification only with no additional writes');
  const boot=await api('salary'),program=await api('program');ok(boot.permissions.canPropose&&program.permissions.canPropose,'real HTTP and SQL enable both parameter masters for the historical linked author');
  ok(boot.scopeVersion===activeBoot.scopeVersion,'verified real audit person preserves the previously issued scope');
  const context=await db.run('SELECT native_salary_administrative_context_v1('+j(qa.actors.maker)+')');ok(context.actorPersonId===qa.ids.makerPerson&&context.employmentContractId===null&&context.parameterActorVerified,'only the parameter audit person is restored; employment stays absent');
  const sharedContext=await db.run('SELECT native_salary_context_v1('+j(qa.actors.maker)+')');ok(sharedContext.actorPersonId===null&&sharedContext.employmentContractId===null&&!sharedContext.parameterActorVerified,'shared context remains unchanged for calculations, novelties and other consumers');
  const recovered=await api('salary',{resource:'attempt',key});assert.deepEqual(recovered.body,oldBody);ok(recovered.requestSha256===oldReceipt.requestSha256&&JSON.stringify({key,body:oldBody})===originalBytes,'original pending body, key and hash recover unchanged after historical status');
  const replay=await api('salary',{body:oldBody,key});ok(replay.replayed&&replay.requestSha256===oldReceipt.requestSha256,'same request replays without a duplicate proposal');
  current=qa.actors.samePerson;const same=await api('salary');ok(!same.proposals.find(p=>p.id===oldReceipt.proposalId).canReview,'another membership of the same real person cannot review the proposal');
  current=qa.actors.checker;const independent=await api('salary');ok(independent.proposals.find(p=>p.id===oldReceipt.proposalId).canReview,'a different authenticated person retains independent review');
  const review={...oldBody,command:'approve',scopeVersion:independent.scopeVersion,items:null,proposalId:oldReceipt.proposalId,proposalSha256:oldReceipt.requestSha256,reason:'Revisión independiente exclusivamente sintética de la propuesta anterior',reviewConfirmed:true};await api('salary',{body:review,key:randomUUID(),expected:201});ok(true,'independent real HTTP writer decides the complete synthetic proposal');
  current=qa.actors.maker;
  const historicalContract=await db.run('SELECT to_jsonb(c) FROM employment_contract c WHERE id='+q(qa.ids.makerContract)+'::uuid');ok(historicalContract.status==='inactive'&&historicalContract.end_date==='2026-09-30','parameter decisions never reactivate historical employment');
  const assertNoEffect=async(mut,actor,label,expected=false)=>{
   await sql(mut);const p=await mutationProof(),s=await api('salary');ok(s.permissions.canPropose===expected,label);assert.deepEqual(await mutationProof(),p);
  };
  await assertNoEffect('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(qa.ids.maker)+'::uuid',current,'revoking the existing identity link immediately removes parameter preparation');
  await sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id='+q(qa.ids.maker)+'::uuid');
  await rejected(()=>db.run('SELECT native_salary_administrative_context_v1('+j({...current,actorPersonId:qa.ids.checkerPerson,employmentContractId:qa.ids.checkerContract,parameterActorVerified:true})+')'),'SESSION_INVALID','caller supplied person, contract and verification flag are rejected by the original authenticated context');
  current=qa.actors.unlinked;const unlinked=await api('salary');ok(!unlinked.permissions.canPropose,'an account without a verified enabled municipal association remains blocked');
  current=qa.actors.maker;
  const p=await mutationProof();await rejected(()=>rpc('native_salary_bootstrap_v1',{...current,actorSessionVersion:2}),'SESSION','obsolete session version remains rejected');assert.deepEqual(await mutationProof(),p);
  await rejected(()=>rpc('native_salary_bootstrap_v1',{...current,membershipId:qa.ids.checker}),'MEMBERSHIP|SESSION','foreign membership cannot be supplied as audit authority');
  await rejected(()=>db.run('SELECT native_employment_change_context_v1('+j(current)+','+q('employee.record.propose')+')'),'EMPLOYMENT_REQUIRED','employment changes still require active employment');
  for(const [mutation,label] of [
   ['UPDATE person_identity SET identity_state=\'rejected\' WHERE id='+q(qa.ids.makerPerson)+'::uuid','rejected person identity cannot audit parameters'],
   ['UPDATE source_import_batch SET validation_state=\'staged\' WHERE id='+q(qa.ids.sourceBatch)+'::uuid','unpublished import provenance cannot be used as verified identity'],
   ['UPDATE tenant_action_employment_link SET source_binding_id='+q(qa.ids.foreignBinding)+'::uuid WHERE membership_id='+q(qa.ids.maker)+'::uuid','an association from another binding cannot be used'],
  ]){
   await rejected(()=>sql(mutation+';DO $$ BEGIN IF coalesce((native_salary_administrative_context_v1('+j(current)+')->>\'parameterActorVerified\')::boolean,false) THEN RAISE EXCEPTION \'QA_IDENTITY_WAS_ACCEPTED\';END IF;RAISE EXCEPTION \'QA_EXPECTED_IDENTITY_REFUSED\';END $$'),'QA_EXPECTED_IDENTITY_REFUSED',label);
   assert.deepEqual(await mutationProof(),p);
  }
  await rejected(()=>sql('ALTER FUNCTION '+qa.schema+'.native_salary_administrative_context_v1(jsonb) COST 201;'+n(batch.afterCheck)),'SALARY_IDENTITY_FUNCTION_CHANGED','unreviewed helper metadata fails durable verification');
  await rejected(()=>sql('GRANT EXECUTE ON FUNCTION '+qa.schema+'.native_salary_administrative_context_v1(jsonb) TO municontrol_actions_runtime_app;'+n(batch.afterCheck)),'SALARY_IDENTITY_FUNCTION_CHANGED','direct helper grants fail verification and roll back');
  await rejected(()=>sql(n(batch.before)+';ALTER TABLE internal_users ADD COLUMN unreviewed_identity_fact text;'+n(batch.after)+';'+batch.conservation),'SALARY_IDENTITY_CONSERVATION_FAILED','unrelated prior table metadata changes fail complete conservation and roll back');
  const programBoot=await api('program'),programKey=randomUUID(),programBody=programCommand({scopeVersion:programBoot.scopeVersion,baseVersion:programBoot.program.version,salaryVersion:programBoot.salaryCatalog.version,program:{...programBoot.program.definition,rules:programBoot.program.definition.rules.map(r=>({...r,validUntil:r.validFrom}))},reason:'Acotar todas las vigencias exclusivamente sintéticas sin dejar referencias fuera de período'});
  const programSaved=await api('program',{body:programBody,key:programKey,expected:201});ok(programSaved.body.program.rules[0].validUntil===programBody.program.rules[0].validUntil,'historical administrative author proposes a complete program through the actual writer');
  const recoveredProgram=await api('program',{resource:'attempt',key:programKey});assert.deepEqual(recoveredProgram.body,programBody);ok(recoveredProgram.requestSha256===programSaved.requestSha256,'program recovery keeps the original definition, key and precise hash');
  current=qa.actors.samePerson;const sameProgram=await api('program');ok(!sameProgram.proposals.find(e=>e.id===programSaved.proposalId).canReview,'same person through another membership cannot approve program configuration');
  current=qa.actors.checker;const independentProgram=await api('program');await api('program',{body:{...programBody,command:'approve',scopeVersion:independentProgram.scopeVersion,program:null,proposalId:programSaved.proposalId,proposalSha256:programSaved.requestSha256,reviewConfirmed:true,reason:'Revisión independiente del programa exclusivamente sintético'},key:randomUUID(),expected:201});ok(true,'independent reviewer approves the full synthetic program without calculating payroll');
  current=qa.actors.maker;
  const nativeContract=await db.run("SELECT to_jsonb(c) FROM employment_contract c WHERE legacy_legajo='19041' AND source_system='MUNICONTROL'");assert.ok(nativeContract?.id);
  await sql('UPDATE tenant_action_employment_link SET employment_contract_id='+q(nativeContract.id)+'::uuid WHERE membership_id='+q(qa.ids.maker)+'::uuid');
  const nativeActive=await api('salary');ok(nativeActive.permissions.canPropose,'an employee created only in MuniControl can already audit parameters');
  // Inactive status is exclusively synthetic fixture setup; both real guards
  // are restored before executing the application or checking any metadata.
  await sql('ALTER TABLE employment_contract DISABLE TRIGGER employment_contract_batch_system;UPDATE employment_contract SET status=\'inactive\',end_date=DATE \'2026-10-31\' WHERE id='+q(nativeContract.id)+'::uuid;ALTER TABLE employment_contract ENABLE TRIGGER employment_contract_batch_system');
  const nativeHistorical=await api('salary');ok(nativeHistorical.permissions.canPropose&&nativeHistorical.scopeVersion===nativeActive.scopeVersion,'native-only historical contract keeps its verified administrative audit person and scope');
  const nativeContext=await db.run('SELECT native_salary_administrative_context_v1('+j(current)+')');ok(nativeContext.actorPersonId===nativeContract.person_id&&nativeContext.employmentContractId===null,'native historical audit does not advertise active employment');
  ok(await db.run("SELECT to_jsonb(NOT has_function_privilege('municontrol_actions_runtime_app','"+qa.schema+".native_salary_administrative_context_v1(jsonb)','EXECUTE'))"),'new audit helper is private and cannot be invoked by runtime directly');
  if(browser!=='none')await verifySalaryAdministrativeBrowser({handlers,env,actor:{...current,bindingId:qa.ids.binding},output:destination,check:ok,browserName:browser,
   revoke:()=>sql('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(current.membershipId)+'::uuid'),
   restore:()=>sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id='+q(current.membershipId)+'::uuid')});
  report={ok:true,sourceCommit,major,checksPassed:checks.length,checks,syntheticOnly:true,productiveBusinessWrites:0,nominalRowsReturned:0,installed,durable,repeated};
 }catch(e){failure=e;fs.writeFileSync(path.join(destination,'failure.txt'),e.stack+'\n'+(e.cause?.stderr??''));fs.writeFileSync(path.join(destination,'partial-checks.json'),JSON.stringify({checksPassed:checks.length,checks},null,2));}
 finally{if(seeded)try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');}catch(e){failure??=e;}}
 if(failure)throw failure;fs.writeFileSync(path.join(destination,'result.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};for(const arg of process.argv.slice(2)){const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(arg);assert.ok(m&&!Object.hasOwn(options,m[1]));options[m[1]]=m[2];}
 try{const r=await verifySalaryAdministrativeIdentity({major:Number(options.major),transport:options.transport,sourceCommit:options['source-commit'],output:options.output,browser:options.browser??'none'});console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,syntheticOnly:true}));}catch(e){console.error(e);process.exitCode=1;}
}
