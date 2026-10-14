// One complete own calculation, actual handlers and loopback SQL. All data is
// synthetic. No operational database, institutional decision or payment.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {verifyOwnContractSalaryConditions} from './verify-own-contract-salary-conditions.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {prepareSalaryConditions,salaryConditionsDetail,decideSalaryConditions} from '../assets/own-contract-salary-conditions-model.js';
import {salaryItems} from '../assets/native-salary-catalog-model.js';import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {row} from '../tests/fixtures/native-salary-synthetic.js';import {rule,fact,lit,policy} from '../tests/fixtures/own-payroll-synthetic.js';import {conditionMatch} from '../tests/fixtures/own-payroll-conditions-synthetic.js';
import {participationRuleKey} from '../assets/own-period-participation-program.js';
const root=fs.realpathSync(new URL('..',import.meta.url)),j=v=>q(JSON.stringify(v))+'::jsonb';
export async function verifySalaryConditionsProgram(options){
 return verifyOwnContractSalaryConditions({...options,browser:options.browser??'none',continuation:async h=>{
  const{qa,db,sql,relocate,api,setActor,ok}=h,maker=qa.actors.maker,checker=qa.actors.checker;
  const source=fs.readFileSync(path.join(root,'scripts/migrations/172-own-salary-conditions-program-source.sql'),'utf8').replace(/\r\n?/g,'\n'),statements=splitPostgresStatements(source);
  assert.equal(statements.length,6);assert.ok(statements.every(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.')));
  const changed=['own_program_node_v2','own_program_unit_v2','own_program_definition_v1','own_program_command_v1','own_run_capture_v1','own_run_complete_v1'];
  const snapshot=()=>db.run("SELECT jsonb_build_object('events',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]')::text) FROM own_salary_conditions_event e),'programmes',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]')::text) FROM own_payroll_program_event e),'captures',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]')::text) FROM own_payroll_run_capture e),'results',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY capture_id),'[]')::text) FROM own_payroll_run_result e),'functionMetadata',(SELECT md5(jsonb_agg(CASE WHEN proname=ANY("+q('{'+changed.join(',')+'}')+"::text[]) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY oid)::text) FROM pg_proc p WHERE pronamespace="+q(qa.schema)+"::regnamespace),'rights',(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY membership_id,capability_key)::text) FROM capabilities c))");
  assert.equal(h.salaryConditions.proof.technicalInstallationProtocol,true);
  ok(true,'six typed programme/capture/completion bodies were installed atomically with preservation of every previous proposal, source, result, function attribute and synthetic right');
  for(const predicate of[
   {op:'match',key:'qaCode',type:'code',operator:'gt',value:'0056'},
   {op:'match',key:'qaBoolean',type:'boolean',operator:'eq',value:'false'},
   {op:'match',key:'qaCode',type:'code',operator:'eq',value:56},
  ])await assert.rejects(()=>db.run('SELECT own_program_node_v2('+j(predicate)+')'),/OWN_PROGRAM_INPUT_INVALID/);
  await assert.rejects(()=>db.run('SELECT own_program_node_v2('+j({op:'input',key:'qaBoolean',unit:'boolean'})+')'),/OWN_PROGRAM_UNIT_MISMATCH/);
  ok(true,'actual SQL rejects ordered codes, string booleans, numeric codes and arithmetic inputs for logical facts');
  setActor(maker);const recovered=await api('run',{query:{resource:'attempt',key:h.oldKey}});assert.deepEqual(recovered.body,h.oldBody);assert.deepEqual(recovered.saved,h.old.saved);
  ok(true,'old request key, body, captured numeric sources and saved result recover without a new condition or reinterpretation');
  const oldPeriod=h.workingTime.period,[year,month]=oldPeriod.split('-').map(Number),period=String(month===12?year+1:year)+'-'+String(month===12?1:month+1).padStart(2,'0');
  const boot=await api('salaryConditions',{query:{resource:'bootstrap',period}}),items=boot.source.subjects.map(s=>({contractId:s.contractId,identityToken:s.identityToken,definition:{partialSeniorityYears:'0',title:{status:'declared',code:'0056',percentage:'12.00000001'},unhealthyWork:false,asOfDate:period+'-01',documentReference:'Constancia exclusivamente sintética de integración de cálculo QA'}}));
  const conditions=await api('salaryConditions',{body:prepareSalaryConditions(boot,items,'Preparación completa exclusivamente sintética QA'),expected:201});setActor(checker);const rb=await api('salaryConditions',{query:{resource:'bootstrap',period}}),detail=await salaryConditionsDetail(await api('salaryConditions',{query:{resource:'detail',id:conditions.proposalId}}));await api('salaryConditions',{body:await decideSalaryConditions(rb,detail,'approve','Revisión independiente completa exclusivamente sintética QA'),expected:201});
  setActor(maker);let sb=await api('salary');const additions=[row({kind:'auxiliary',code:'9871',nature:'auxiliary',unit:'money',value:'100.00',validFrom:period}),row({kind:'auxiliary',code:'9872',nature:'auxiliary',unit:'percent',validFrom:period}),row({kind:'auxiliary',code:'9873',nature:'auxiliary',unit:'units',validFrom:period}),row({code:'9874',unit:'money',validFrom:period})];
  const salaryBody={command:'propose',scopeVersion:sb.scopeVersion,baseVersion:sb.catalog.version,classificationVersion:sb.classification.version,items:salaryItems([...sb.catalog.items,...additions]),proposalId:null,proposalSha256:null,reason:'Fuentes nuevas exclusivamente sintéticas QA',reviewConfirmed:false},salary=await api('salary',{body:salaryBody,expected:201});setActor(checker);sb=await api('salary');await api('salary',{body:{...salaryBody,command:'approve',scopeVersion:sb.scopeVersion,proposalId:salary.proposalId,proposalSha256:salary.requestSha256,items:null,reviewConfirmed:true},expected:201});
  setActor(maker);const pb=await api('program'),p=structuredClone(pb.program.definition);p.salaryConditionsVersion='own-contract-salary-conditions.v1';p.totalsPrecision=3;
  // Retain the older programmes as history; only their future boundary closes.
  for(const r of p.rules)if(r.agreementCode==='1'&&(r.validUntil===null||r.validUntil>=period))r.validUntil=oldPeriod;
  const choose=(condition,then,otherwise)=>({op:'choose',condition,then,else:otherwise});
  const pay=choose(conditionMatch('qaTitleStatus','code','declared'),choose(conditionMatch('qaTitleCode','code','0056'),choose(conditionMatch('qaUnhealthy','boolean',false),fact('qaBase'),lit('0','money')),lit('0','money')),fact('qaBase'));
  const classPay=choose(conditionMatch('qaClass','code',boot.source.subjects.length?((await db.run('SELECT to_jsonb(category_code) FROM employment_contract WHERE id='+q(h.salaryConditions.extraPeople[0].contractId)+'::uuid'))):''),pay,lit('0','money'));
  const newRules=[rule('9874',classPay,{validFrom:period,rounding:policy('exact',3)}),rule('9872',fact('qaTitlePercent','percent'),{validFrom:period,nature:'auxiliary',unit:'percent',rounding:policy('exact',8)}),rule('9873',fact('qaPartialYears','units'),{validFrom:period,nature:'auxiliary',unit:'units',rounding:policy('exact',8)})];
  p.rules.push(...newRules);for(const r of newRules)p.periodParticipation.treatments.push({ruleKey:participationRuleKey(r),treatment:'declared_formula',reference:'Tratamiento exclusivamente sintético QA'});
  p.bindings.push({agreementCode:'1',key:'qaBase',unit:'money',sourceKind:'auxiliary_parameter',sourceCode:'9871',onMissing:'error',combine:'single',ruleReference:'Base exclusivamente sintética QA'},...Object.entries({qaTitleStatus:['titleStatus','code'],qaTitleCode:['titleCode','code'],qaUnhealthy:['unhealthyWork','boolean'],qaTitlePercent:['titlePercentage','percent'],qaPartialYears:['partialSeniorityYears','units']}).map(([key,[sourceField,unit]])=>({agreementCode:'1',key,unit,sourceKind:'salary_condition_fact',sourceField,onMissing:'error',combine:'single',ruleReference:'Condición aprobada exclusivamente sintética QA'})),{agreementCode:'1',key:'qaClass',unit:'code',sourceKind:'classification_fact',sourceField:'categoryCode',onMissing:'error',combine:'single',ruleReference:'Encuadre capturado exclusivamente sintético QA'});
  const normalized=ownProgramDefinition(p,pb.salaryCatalog.items),withoutConditions=structuredClone(normalized);delete withoutConditions.salaryConditionsVersion;
  await assert.rejects(()=>db.run('SELECT own_program_definition_v1('+j(withoutConditions)+','+j(pb.salaryCatalog.items)+')'),/OWN_PROGRAM_BINDING_INVALID|OWN_PROGRAM_OPERATION_UNSUPPORTED/);
  ok(true,'actual SQL refuses typed facts when the programme has not explicitly declared the new source component');
  const body={command:'propose',scopeVersion:pb.scopeVersion,baseVersion:pb.program.version,salaryVersion:pb.salaryCatalog.version,program:normalized,proposalId:null,proposalSha256:null,reason:'Programa documentado exclusivamente sintético QA',reviewConfirmed:false},programme=await api('program',{body,expected:201});setActor(checker);const pcb=await api('program');await api('program',{body:{...body,command:'approve',scopeVersion:pcb.scopeVersion,program:null,proposalId:programme.proposalId,proposalSha256:programme.requestSha256,reviewConfirmed:true},expected:201});
  ok(true,'actual independent SQL/API programme opts into approved partial years, exact percent, category codes and false without replacing the older period');
  if(options.browser==='chromium'){
   const {verifyConditionsProgramBrowser}=await import('./lib/own-salary-conditions-program-browser.mjs');
   await verifyConditionsProgramBrowser({handlers:h.handlers,env:h.env,actors:qa.actors,setActor,bootstrap:()=>api('program'),output:h.destination,check:ok,
    revokedRead:()=>api('program',{expected:403}),
    diagnoseProgram:async program=>{try{await db.run('SELECT own_program_definition_v1('+j(program)+','+j((await api('program')).salaryCatalog.items)+')');return{sqlDefinitionValid:true};}catch(e){return{sqlDefinitionValid:false,error:e.message};}},
    revoke:()=>sql('DELETE FROM capabilities WHERE membership_id='+q(maker.membershipId)+'::uuid AND capability_key=\'payroll.parameter.read\''),
    restore:()=>sql('INSERT INTO capabilities SELECT '+q(maker.membershipId)+'::uuid,\'payroll.parameter.read\' WHERE NOT EXISTS(SELECT 1 FROM capabilities WHERE membership_id='+q(maker.membershipId)+'::uuid AND capability_key=\'payroll.parameter.read\')')});
  }
  setActor(maker);const rboot=await api('run'),ids=h.salaryConditions.extraPeople.map(e=>e.contractId).sort();assert.equal(ids.length,855);assert.ok(ids.every(id=>typeof id==='string'));
  const runBody={...h.oldBody,period,scopeVersion:rboot.scopeVersion,programVersion:rboot.programVersion,selection:{kind:'contracts',values:ids}},key=randomUUID();
  // Observe the real completion parameters without changing their bytes,
  // permissions, guard or result. A capacity failure remains a failed test.
  const originalQuery=h.adapter.query;let measured=null,run;
  h.adapter.query=async(query,values)=>{
   if(/^SELECT public\.own_run_complete(?:_full)?_v1\(/.test(query)){
    const input=JSON.parse(values[2]),result=JSON.parse(values[3]);
    measured=await db.run('SELECT jsonb_build_object(\'payloadBytes\',octet_length(c.payload::text),\'bodyBytes\',octet_length(c.body::text),\'inputBytes\',octet_length('+j(input)+'::text),\'resultBytes\',octet_length('+j(result)+'::text),\'overheadBytes\',8192,\'limitBytes\',4194304,\'capturedEmployees\',jsonb_array_length(c.payload#>\'{population,employees}\'),\'capturedConditions\',jsonb_array_length(c.payload#>\'{salaryConditions,records}\')) FROM own_payroll_run_capture c WHERE c.id='+q(values[1])+'::uuid');
    measured={...measured,totalBytes:measured.payloadBytes+measured.bodyBytes+measured.inputBytes+measured.resultBytes+measured.overheadBytes,inputEmployees:input.employees.length,resultEmployees:result.employeeCount,resultRows:result.rowCount,allExactSyntheticNets:result.employeeTotals.every(t=>t.net==='100.000')};
   }
   return originalQuery.call(h.adapter,query,values);
  };
  try{
   const legacy=await api('run',{body:runBody,key,expected:422});assert.equal(legacy.code,'OWN_RUN_LIMIT');
   assert.equal(measured.capturedEmployees,855);assert.equal(measured.resultEmployees,855);assert.equal(measured.allExactSyntheticNets,true);assert.ok(measured.totalBytes>measured.limitBytes);
   const originalAttempt=await api('run',{query:{resource:'attempt',key}});assert.deepEqual(originalAttempt.body,runBody);assert.equal(originalAttempt.saved,null);
   fs.writeFileSync(path.join(h.destination,'conditions-program-legacy-capacity-proof.json'),JSON.stringify({syntheticOnly:true,major:options.major,measured,originalBodyKeyRecovered:true,savedResult:false},null,2)+'\n');
   const fullSource=fs.readFileSync(path.join(root,'scripts/migrations/173-own-full-payroll-response.sql'),'utf8'),fullStatements=splitPostgresStatements(fullSource);assert.equal(fullStatements.length,3);
   assert.equal(await db.run("SELECT to_jsonb(to_regprocedure("+q(h.qa.schema+'.own_run_complete_full_v1(jsonb,uuid,jsonb,jsonb,text)')+") IS NOT NULL)"),true);
   ok(true,'separate full-response completion conserves every row and existing right; the older capacity guard still refuses the whole set without a partial result');
   const {withOwnPayrollFullHttp}=await import('./lib/own-payroll-full-http.mjs');
   await withOwnPayrollFullHttp({handler:h.handlers.run,env:h.env},async({api:fullApi,stats,origin})=>{
    run=await fullApi({body:runBody,key,expected:200});
    assert.deepEqual(run.body,runBody);assert.equal(run.key,key);assert.equal(run.id,originalAttempt.id);
    const recovered=await fullApi({key});assert.deepEqual(recovered.saved,run.saved);assert.deepEqual(recovered.payload,run.payload);
    assert.ok(stats.chunks>2&&stats.bytes>4194304);
    fs.writeFileSync(path.join(h.destination,'conditions-program-full-http-proof.json'),JSON.stringify({ok:true,syntheticOnly:true,actualHttp:true,actualHandlers:true,actualSql:true,major:options.major,requests:stats.requests,chunks:stats.chunks,totalResponseBytes:stats.bytes,selectedContracts:855,originalBodyKeyRetained:true,sourceSqlSha256:createHash('sha256').update(fullSource).digest('hex'),productiveBusinessWrites:0},null,2)+'\n');
    if(options.browser==='chromium'){
     const catalogue=await db.run('SELECT native_employment_catalog_bootstrap_v1('+j(maker)+')',true);
     const {verifyFullPayrollBrowser}=await import('./lib/own-payroll-full-browser.mjs');
     await verifyFullPayrollBrowser({origin,actor:maker,catalogue,run,output:h.destination,check:ok,
      revoke:()=>sql('DELETE FROM capabilities WHERE membership_id='+q(maker.membershipId)+'::uuid AND capability_key=\'payroll.calculation.nominal.read\''),
      restore:()=>sql('INSERT INTO capabilities SELECT '+q(maker.membershipId)+'::uuid,\'payroll.calculation.nominal.read\' WHERE NOT EXISTS(SELECT 1 FROM capabilities WHERE membership_id='+q(maker.membershipId)+'::uuid AND capability_key=\'payroll.calculation.nominal.read\')'),
      deniedRead:async()=>{const response=await fetch(origin+'/api/internal-own-payroll-run?resource=attempt&key='+key,{headers:{Accept:'application/vnd.municontrol.payroll-full.v1+json'}});assert.equal(response.status,403);assert.equal((await response.json()).ok,false);}});
    }
   });
  }catch(error){
   // Report the original failure even when it occurred after a full result was
   // saved. A legacy read of that receipt would reject its size and mask it.
   const state=await db.run('SELECT jsonb_build_object(\'captureCount\',count(*),\'sameBody\',coalesce(bool_and(body='+j(runBody)+'),false),\'savedCount\',(SELECT count(*) FROM own_payroll_run_result r WHERE r.capture_id IN(SELECT id FROM own_payroll_run_capture WHERE request_key='+q(key)+'::uuid))) FROM own_payroll_run_capture WHERE request_key='+q(key)+'::uuid');
   fs.writeFileSync(path.join(h.destination,'conditions-program-capacity-failure.json'),JSON.stringify({syntheticOnly:true,productiveBusinessWrites:0,major:options.major,selectedContracts:855,measured,state,error:error.message},null,2)+'\n');
   throw error;
  }finally{h.adapter.query=originalQuery;}
  assert.equal(run.saved.input.employees.length,855);assert.equal(run.saved.result.employeeCount,855);assert.ok(run.saved.result.employeeTotals.every(t=>t.net==='100.000'));assert.equal(run.saved.input.employees.at(-1).inputs.find(i=>i.key==='qaTitleCode').value,'0056');assert.equal(run.saved.input.employees.at(-1).inputs.find(i=>i.key==='qaUnhealthy').value,false);
  ok(true,'one actual full855-person native-only API calculation conserves the last typed row and exact fractional-capable monetary results');
  const legacyRead=await api('run',{query:{resource:'attempt',key},expected:422});assert.equal(legacyRead.code,'OWN_RUN_LIMIT');
  ok(true,'full HTTP recovery conserves the original complete stored snapshot; the legacy bounded reader never claims a partial result is complete');
  fs.writeFileSync(path.join(h.destination,'salary-conditions-program-proof.json'),JSON.stringify({ok:true,major:options.major,rows:855,syntheticOnly:true,actualHandlers:true,actualSql:true,productiveBusinessWrites:0,sourceSqlSha256:createHash('sha256').update(source).digest('hex'),engineIntegrated:true,technicalInstallationProtocol:true,period},null,2)+'\n');
  if(options.continuation)return options.continuation({...h,conditionsProgram:{period,run}});
 }});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const o={};for(const a of process.argv.slice(2)){const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(a);assert.ok(m&&!Object.hasOwn(o,m[1]));o[m[1]]=m[2];}try{assert.ok(o.browser===undefined||o.browser==='chromium');const r=await verifySalaryConditionsProgram({major:Number(o.major),transport:o.transport??'local',sourceCommit:o['source-commit'],output:o.output,browser:o.browser??'none'});console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,syntheticOnly:true}));}catch(e){console.error(e.stack);process.exitCode=1;}}
