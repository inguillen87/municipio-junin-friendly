// Real API/SQL and calculation, disposable PostgreSQL only, invented data.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyOwnContractWorkingTime} from './verify-own-contract-working-time.mjs';
import {buildNativeSalaryCapacityInstallation} from './lib/native-salary-capacity-installation.mjs';
import {buildSalaryDayUnitsInstallation,assertSalaryDayUnitsDurability} from './lib/salary-day-units-installation.mjs';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {row} from '../tests/fixtures/native-salary-synthetic.js';
import {salaryItems} from '../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {participationRuleKey} from '../assets/own-period-participation-program.js';
import {rule,lit,fact,binary,policy} from '../tests/fixtures/own-payroll-synthetic.js';
const j=v=>q(JSON.stringify(v))+'::jsonb';
export async function verifySalaryDayUnits(options){
 return verifyOwnContractWorkingTime({...options,browser:'none',continuation:async h=>{
  const {qa,db,sql,relocate,api,ok,setActor}=h,{people,period}=h.workingTime;
  // Reproduce the whole already-published salary capacity installation in QA,
  // including its stream facade and grants. No production permission changes.
  const capacity=buildNativeSalaryCapacityInstallation(h.options);
  for(const source of capacity.mutations)await sql(relocate(source));
  const batch=buildSalaryDayUnitsInstallation(h.options),n=s=>relocate(s);
  const before=await db.run("SELECT jsonb_build_object('salary',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM native_salary_event e),'program',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_payroll_program_event e),'captures',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_payroll_run_capture e),'results',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY capture_id)::text) FROM own_payroll_run_result e))");
  const statements=batch.statements.map(s=>s===batch.choose?`DO $choose$ BEGIN IF current_setting('municontrol_day_units.mode')='install' THEN EXECUTE ${q(n(batch.beforeCheck))};ELSE EXECUTE ${q(n(batch.afterCheck))};END IF;END $choose$`:s===batch.apply?`DO $apply$ BEGIN IF current_setting('municontrol_day_units.mode')='install' THEN EXECUTE ${q(n(batch.mutations[0]))};END IF;END $apply$`:n(s));
  const installed=await sql(statements.join(';')),durable=await sql(batch.verification.map(n).join(';')),repeated=await sql(statements.join(';'));
  assertSalaryDayUnitsDurability({installed,durable,batch});assert.equal(installed.mode,'install');assert.equal(repeated.mode,'verify');assert.deepEqual(durable,repeated);
  const after=await db.run("SELECT jsonb_build_object('salary',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM native_salary_event e),'program',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_payroll_program_event e),'captures',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_payroll_run_capture e),'results',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY capture_id)::text) FROM own_payroll_run_result e))");
  assert.deepEqual(after,before);ok(true,'four exact validator changes preserve every old row, ACL, signature and function attribute, with durable verify-only replay');
  setActor(qa.actors.maker);let b=await api('salary');
  const items=salaryItems([...b.catalog.items,row({kind:'auxiliary',code:'9971',nature:'auxiliary',unit:'days',precision:8,value:'1.50000000',validFrom:period}),row({code:'9972',unit:'money',precision:8,validFrom:period})]);
  const salaryBody={command:'propose',scopeVersion:b.scopeVersion,baseVersion:b.catalog.version,classificationVersion:b.classification.version,items,proposalId:null,proposalSha256:null,reason:'Cantidad en días exclusivamente sintética QA',reviewConfirmed:false};
  const salaryKey=randomUUID(),savedSalary=await api('salary',{body:salaryBody,key:salaryKey,expected:201});
  setActor(qa.actors.checker);b=await api('salary');await api('salary',{expected:201,body:{...salaryBody,command:'approve',scopeVersion:b.scopeVersion,items:null,proposalId:savedSalary.proposalId,proposalSha256:savedSalary.requestSha256,reviewConfirmed:true}});
  setActor(qa.actors.maker);const pb=await api('program'),p=structuredClone(pb.program.definition),newRule=rule('9972',binary('multiply',lit('201.00','money'),binary('divide',fact('declaredDays','days'),lit('30','days'))),{validFrom:period,rounding:policy('exact',8)});
  p.rules.push(newRule);p.periodParticipation.treatments.push({ruleKey:participationRuleKey(newRule),treatment:'declared_formula',reference:'Aritmética exclusivamente sintética; no norma municipal'});
  p.bindings.push({agreementCode:'1',key:'declaredDays',unit:'days',sourceKind:'auxiliary_parameter',sourceCode:'9971',combine:'single',onMissing:'error',ruleReference:'Cantidad explícita exclusivamente sintética QA'});
  const program=ownProgramDefinition(p,pb.salaryCatalog.items),bad=structuredClone(program);bad.rules.find(r=>r.code==='9972').expression.right.right.unit='hours';
  await assert.rejects(()=>sql('SELECT own_program_definition_v1('+j(bad)+','+j(pb.salaryCatalog.items)+')'),/OWN_PROGRAM_UNIT_MISMATCH/);
  ok(true,'SQL independently refuses a days/hours ratio before persisting a program');
  const body={command:'propose',scopeVersion:pb.scopeVersion,baseVersion:pb.program.version,salaryVersion:pb.salaryCatalog.version,program,proposalId:null,proposalSha256:null,reason:'Programa de días exclusivamente sintético QA',reviewConfirmed:false},programKey=randomUUID(),saved=await api('program',{body,key:programKey,expected:201});
  setActor(qa.actors.samePerson);const same=await api('program');assert.equal(same.proposals.find(x=>x.id===saved.proposalId).canReview,false);
  setActor(qa.actors.checker);const review=await api('program');await api('program',{expected:201,body:{...body,command:'approve',scopeVersion:review.scopeVersion,program:null,proposalId:saved.proposalId,proposalSha256:saved.requestSha256,reviewConfirmed:true}});
  setActor(qa.actors.maker);const runBoot=await api('run'),key=randomUUID(),runBody={...h.oldBody,period,scopeVersion:runBoot.scopeVersion,programVersion:runBoot.programVersion,selection:{kind:'contracts',values:people.map(e=>e.contractId).sort()}},run=await api('run',{body:runBody,key,expected:201});
  const dayRows=run.saved.result.rows.filter(r=>r.conceptCode==='9972');assert.equal(dayRows.length,people.length);assert.ok(dayRows.every(r=>r.amount==='10.05000000'));
  assert.ok(run.saved.input.employees.every(e=>e.inputs.some(i=>i.key==='declaredDays'&&i.unit==='days'&&i.value==='1.50000000')));
  const recovered=await api('run',{query:{resource:'attempt',key}});assert.deepEqual(recovered.saved,run.saved);assert.deepEqual(recovered.payload,run.payload);
  const salaryRecovered=await api('salary',{query:{resource:'attempt',key:salaryKey}});assert.deepEqual(salaryRecovered.body,salaryBody);
  const programRecovered=await api('program',{query:{resource:'attempt',key:programKey}});assert.deepEqual(programRecovered.body,body);
  ok(true,'real independent salary/program approval and full native-only cohort calculate exact fractional days, preserving original attempts and units');
  if(options.browser&&options.browser!=='none'){
   const stream=await api('salary',{query:{resource:'stream',page:'0'}});assert.equal(stream.version,'native-salary-stream.v1');
   ok(true,'fixture provides the complete already-published stream facade before the product browser reads');
   const {verifySalaryDayUnitsBrowser}=await import('./lib/salary-day-units-browser.mjs');
   await verifySalaryDayUnitsBrowser({handlers:h.handlers,env:h.env,actor:qa.actors.maker,output:h.destination,browserName:options.browser,check:ok});
  }
  const result={version:'salary-day-units-qa.v1',syntheticOnly:true,productiveBusinessWrites:0,employees:people.length,dayRows:dayRows.length,amountPerSyntheticRow:'10.05000000',installed,durable,repeated};
  fs.writeFileSync(path.join(h.destination,'day-units-proof.json'),JSON.stringify(result,null,2)+'\n');
  if(options.continuation)return options.continuation({...h,dayUnits:{people,period,result}});
  return result;
 }});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const o=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(a);assert.ok(m);return[m[1],m[2]];}));
 try{const r=await verifySalaryDayUnits({major:Number(o.major),transport:o.transport,sourceCommit:o['source-commit'],output:o.output,browser:o.browser??'none'});console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,syntheticOnly:true}));}catch(e){console.error(e.stack);process.exitCode=1;}
}
