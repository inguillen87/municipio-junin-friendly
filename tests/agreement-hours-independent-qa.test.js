import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {forwardAgreementQaHttp,observeAgreementQaPost,agreementQaHttpTasks} from '../scripts/lib/own-agreement-working-time-browser.mjs';
import {createOwnAgreementWorkingTimeHandler,config as agreementHttpConfig} from '../api/internal-own-agreement-working-time.js';
import {syntheticAgreementTimeCommand,syntheticAgreementTimeDetail,agreementTimeId,agreementTimeKey} from './fixtures/own-agreement-working-time-synthetic.js';
import {agreementIndependentOptions,assertIndependentProcessStart} from '../scripts/verify-agreement-hours-independent.mjs';
import {deriveAgreementWorkingTimeConsumers} from '../scripts/lib/own-agreement-working-time-consumers.mjs';
import {buildOwnAgreementWorkingTimeInstallation} from '../scripts/lib/own-agreement-working-time-installation.mjs';
import {buildAgreementWorkingTimeCatalogQa} from '../scripts/lib/own-agreement-working-time-catalog-qa.mjs';
import {buildNoeliaCircuitQa} from '../scripts/lib/noelia-payroll-circuit-qa.mjs';
import {qaLiteral} from '../scripts/lib/own-payroll-durable-qa.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
import {readAgreementWorkingTimeReportQa} from '../scripts/verify-own-agreement-working-time.mjs';
import {variableReportFixture} from './fixtures/own-payroll-report-variables-synthetic.js';
import {detail as liquidationDetail} from './fixtures/own-payroll-liquidation-synthetic.js';
import {reportGroup} from './fixtures/own-payroll-report-synthetic.js';
import {ownCloseSnapshot} from '../assets/own-payroll-close-model.js';
import {ownReportBundle} from '../assets/own-payroll-report-model.js';
import {auxiliarySources} from './fixtures/own-payroll-auxiliary-synthetic.js';
import {conditionSources,conditionMatch} from './fixtures/own-payroll-conditions-synthetic.js';
import {fact,binary,lit,policy} from './fixtures/own-payroll-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';

const sourceCommit='d5e035037595f61a8596ece8f8e3e512dc5fb056',read=file=>fs.readFileSync(file,'utf8');
const seal=s=>{s.workingTime.version=ownRunHash(['own-contract-working-time.v1',s.period,s.workingTime.records]);s.agreementWorkingTime.version=ownRunHash(['own-agreement-working-time.v1',s.period,s.agreementWorkingTime.records]);s.salaryConditions.version=ownRunHash(['own-contract-salary-conditions.v1',s.period,s.salaryConditions.records]);s.population.version=ownRunHash({employees:s.population.employees,workingTime:s.workingTime,agreementWorkingTime:s.agreementWorkingTime,salaryConditions:s.salaryConditions});return s;};
function r1Fixture(){
 const s=auxiliarySources(1),p=s.programState.program.definition;p.salaryConditionsVersion='own-contract-salary-conditions.v1';p.workingTimeVersion='own-contract-working-time.v1';p.agreementWorkingTimeVersion='own-agreement-working-time.v1';p.totalsPrecision=3;s.population.employees[0].categoryCode='0007';
 p.bindings.find(b=>b.key==='auxiliaryValue').key='U1';p.rules.find(r=>r.code==='88'&&r.nature==='auxiliary').expression=fact('U1');
 for(const[key,unit,sourceKind,sourceField]of[['classCode','code','classification_fact','categoryCode'],['L15','hours','agreement_time_fact','monthlyHours'],['L17','hours','working_time_fact','monthlyHours']])p.bindings.push({agreementCode:'1',key,unit,sourceKind,sourceField,onMissing:'error',combine:'single',ruleReference:'Fuentes R1 exclusivamente sintéticas QA independiente'});
 const r=p.rules.find(r=>r.code==='95');r.expression={op:'choose',condition:conditionMatch('classCode','code','0007'),then:binary('multiply',fact('U1'),binary('divide',fact('L17','hours'),fact('L15','hours'))),else:lit('0','money')};r.rounding=policy('exact',3);
 const e=s.population.employees[0];s.workingTime={complete:true,version:'a'.repeat(64),records:[{contractId:e.contractId,identityToken:e.identityToken,configuration:{version:'b'.repeat(64),revision:1,proposalId:uid(8001),approvalId:uid(8002),identityToken:e.identityToken,definition:{dailyHours:null,monthlyHours:'80.125',asOfDate:s.period+'-01',documentReference:'Jornada contractual ficticia independiente'}}}]};
 s.agreementWorkingTime={complete:true,version:'a'.repeat(64),records:[{agreementCode:'1',agreementToken:'c'.repeat(64),revision:1,definition:{monthlyHours:'160.250',asOfDate:s.period+'-01',documentReference:'Jornada de convenio ficticia independiente'},approvalId:uid(8003),approvedAgreementToken:'c'.repeat(64)}]};s.salaryConditions=conditionSources(1).salaryConditions;return seal(s);
}

function reportCensusFixture(){
 const f=variableReportFixture(4),d=f.details[0],open=structuredClone(d);open.groups=[];for(const row of open.rows)Object.assign(row,{state:'confirmed',groupId:null,canClose:true});
 const receipts=[0,1].map(index=>{const original=f.receipts[0],selection={kind:'contracts',values:open.rows.slice(index*2,index*2+2).map(r=>r.contractId).sort()},snapshot=ownCloseSnapshot(open,selection),body={...original.body,selection};return{...original,id:uid(7200+index),groupId:uid(7200+index),key:uid(7210+index),body,bodySha256:ownRunHash(body),snapshot,snapshotSha256:ownRunHash(snapshot)};});
 d.groups=receipts.map(reportGroup);d.groups.push({...d.groups[0],id:uid(7220),state:'reopened',reopenedAt:'2026-10-06T12:00:00.000Z',canReopen:false});
 for(const row of d.rows)row.groupId=receipts.find(r=>r.snapshot.employees.some(e=>e.contractId===row.contractId)).groupId;
 ownReportBundle(f.query,[d],receipts,f.captures);
 const calls=[];const api=async(kind,{query})=>{calls.push({kind,query});if(kind==='close'&&query.resource==='detail')return structuredClone(d);if(kind==='close'&&query.resource==='group'){const value=receipts.find(r=>r.groupId===query.id);assert.ok(value,'no invented or reopened group may be requested');return structuredClone(value);}assert.equal(kind,'liquidation');assert.equal(query.resource,'detail');const capture=f.captures.find(c=>c.id===query.id);assert.ok(capture,'unknown original capture');return{...liquidationDetail(4),id:capture.id,capture:structuredClone(capture)};};
 return{f,detail:d,receipts,calls,api};
}
test('agreement QA forwards an actual IncomingMessage untouched through deferred authorization and the canonical raw JSON parser',async()=>{
 assert.equal(agreementHttpConfig.api.bodyParser,false);
 const env={},calls=[],flowingBeforeAuthorization=[],caps=['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve'];
 const principal={user:{email:'hours-stream-qa@example.invalid'},tenant:{source:'membership',id:agreementTimeId,membershipId:agreementTimeKey,effectiveCapabilities:caps}},session={email:principal.user.email,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',version:1,releaseSha:'d'.repeat(40)};
 const d=await syntheticAgreementTimeDetail(),receipt={version:d.version,eventId:agreementTimeId,proposalId:agreementTimeId,requestKey:agreementTimeKey,requestSha256:d.proposal.requestSha256,body:d.body,status:'pending',revision:0,configurationVersion:d.body.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false};
 let incoming,handlerRequest;
 const handler=createOwnAgreementWorkingTimeHandler({env,requireAccess:async req=>{handlerRequest=req;flowingBeforeAuthorization.push(req.readableFlowing);await new Promise(resolve=>setImmediate(resolve));return{mode:'managed',principal};},sessionFor:()=>session,getSql:async()=>({query:async(q,v)=>{calls.push({q,v});return[{result:receipt}];}})});
 const failures=[],server=http.createServer((req,res)=>{incoming=req;forwardAgreementQaHttp(req,new URL(req.url,env.INTERNAL_APP_ORIGIN),handler).then(({status,payload,headers})=>{res.writeHead(status,headers);res.end(JSON.stringify(payload));},error=>{failures.push(error.message);res.writeHead(500);res.end('{}');});});
 server.listen(0,'127.0.0.1');await once(server,'listening');env.INTERNAL_APP_ORIGIN='http://127.0.0.1:'+server.address().port;
 const post=async raw=>{const bytes=Buffer.from(raw),split=Math.max(1,bytes.findIndex(v=>v>=0xc0)+1);return new Promise((resolve,reject)=>{const req=http.request(env.INTERNAL_APP_ORIGIN+'/api/internal-own-agreement-working-time',{method:'POST',headers:{origin:env.INTERNAL_APP_ORIGIN,'content-type':'application/json','content-length':bytes.length,'idempotency-key':agreementTimeKey}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.once('error',reject);res.once('end',()=>resolve({status:res.statusCode,payload:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));});req.once('error',reject);req.write(bytes.subarray(0,split));setImmediate(()=>req.end(bytes.subarray(split)));});};
 try{
  const command=syntheticAgreementTimeCommand(),result=await post(JSON.stringify({operation:'command',payload:command}));
  assert.equal(result.status,201,result.payload.error);assert.equal(handlerRequest,incoming);assert.equal(incoming instanceof http.IncomingMessage,true);assert.equal(Object.hasOwn(incoming,'body'),false);assert.deepEqual(flowingBeforeAuthorization,[null]);
  assert.equal(calls.length,1);assert.deepEqual(JSON.parse(calls[0].v[1]),command);assert.equal(calls[0].v[2],agreementTimeKey);assert.equal(result.payload.data.requestKey,agreementTimeKey);
  const duplicate=await post('{"operation":"command","operati\\u006fn":"command","payload":'+JSON.stringify(command)+'}');assert.equal(duplicate.status,400);assert.equal(calls.length,1);assert.deepEqual(failures,[]);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('browser proposal auditing accepts only the exact loopback endpoint and bounds the client copy without touching any server stream',()=>{
 const origin='http://127.0.0.1:54321',body=syntheticAgreementTimeCommand(),request={method:()=> 'POST',url:()=>origin+'/api/internal-own-agreement-working-time',headers:()=>({'idempotency-key':agreementTimeKey}),postDataBuffer:()=>Buffer.from(JSON.stringify({operation:'command',payload:body}))};
 assert.deepEqual(observeAgreementQaPost(request,origin),{key:agreementTimeKey,body,matched:false});
 for(const url of ['http://foreign.invalid/api/internal-own-agreement-working-time',origin+'/api/internal-own-agreement-working-time-other',origin+'/api/internal-own-payroll-program'])assert.equal(observeAgreementQaPost({...request,url:()=>url,postDataBuffer:()=>{throw Error('unrelated private request must not be read');}},origin),null);
 assert.equal(observeAgreementQaPost({...request,method:()=> 'GET',postDataBuffer:()=>{throw Error('GET must not be read');}},origin),null);
 assert.throws(()=>observeAgreementQaPost({...request,postDataBuffer:()=>Buffer.alloc(4*1024*1024+1024)},origin),/OBSERVED_BODY_INVALID/);
 assert.throws(()=>observeAgreementQaPost({...request,url:()=>request.url()+'?extra=1'},origin),/POST_QUERY_CHANGED/);
 assert.throws(()=>observeAgreementQaPost({...request,headers:()=>({})},origin),/OBSERVED_KEY_MISSING/);
});
test('HTTP handler drain includes work added during another request, awaits failures, and fails with a bounded useful timeout',async()=>{
 const tasks=agreementQaHttpTasks({timeoutMs:1000});let release;const first=tasks.run(async()=>{await new Promise(resolve=>{release=resolve;});await tasks.run(async()=>{await new Promise(resolve=>setImmediate(resolve));});});
 assert.equal(tasks.count,1);const draining=tasks.drain();await new Promise(resolve=>setImmediate(resolve));assert.equal(tasks.count,1);release();await draining;await first;assert.equal(tasks.count,0);
 const failed=tasks.run(async()=>{throw Error('synthetic handler failed');});await assert.rejects(failed,/synthetic handler failed/);await tasks.drain();assert.equal(tasks.count,0);
 const blocked=agreementQaHttpTasks({timeoutMs:20});let finish;const pending=blocked.run(()=>new Promise(resolve=>{finish=resolve;}));try{await assert.rejects(blocked.drain(),/HTTP_DRAIN_TIMEOUT: 1 handlers remain/);}finally{finish();await pending;await blocked.drain();}
});
test('independent local QA rejects executable, URL, transport and ambiguous output overrides',()=>{
 const base=['--major=17','--source-commit='+sourceCommit,'--output=verification/independent-hours'];assert.equal(agreementIndependentOptions(base).browser,'chromium');
 for(const extra of ['--transport=ci','--host=localhost','--url=postgres://foreign','--executable=psql','--major=18'])assert.throws(()=>agreementIndependentOptions([...base,extra]));
 assert.throws(()=>agreementIndependentOptions(base.map(s=>s.startsWith('--output=')?'--output=verification/../foreign':s)));assert.throws(()=>agreementIndependentOptions(base.map(s=>s==='--major=17'?'--major=16':s)));
});

test('agreement CI uses the complete canonical176/177 and179/180 chain on both disposable PostgreSQL engines',()=>{
 const workflow=read('.github/workflows/own-agreement-working-time.yml'),canonical=read('scripts/verify-own-agreement-working-time.mjs');
 assert.match(workflow,/pg: \[17, 18\]/);assert.match(workflow,/fail-fast: false/);assert.match(workflow,/contents: read/);assert.match(workflow,/persist-credentials: false/);
 assert.match(workflow,/POSTGRES_DB: own_payroll_run_qa/);assert.match(workflow,/ports: \['554\$\{\{ matrix\.pg \}\}:5432'\]/);assert.match(workflow,/psql -X -h 127\.0\.0\.1 -p 554\$\{\{ matrix\.pg \}\} -U postgres -d own_payroll_run_qa -v ON_ERROR_STOP=1/);
 assert.match(workflow,/node scripts\/verify-own-agreement-working-time\.mjs --major=\$\{\{ matrix\.pg \}\} --transport=ci --source-commit=\$\{\{ github\.sha \}\} --browser=chromium --output=verification\/agreement-hours-pg\$\{\{ matrix\.pg \}\}/);
 assert.match(workflow,/NODE_OPTIONS: --import \.\/scripts\/lib\/project-chromium\.mjs/);assert.match(workflow,/install-project-chromium\.mjs --purpose=release-verification/);assert.match(workflow,/if: always\(\)/);assert.match(workflow,/\/\*proof\.json/);assert.match(workflow,/\/failure\.txt/);
 for(const file of['api/internal-own-period-classification.js','tests/own-period-classification-api.test.js','tests/own-period-read-recovery-delay.test.js','scripts/install-project-chromium.mjs','scripts/lib/project-chromium.mjs','scripts/lib/patched-chromium-diagnostic-manifest.mjs','scripts/lib/own-synthetic-browser.mjs'])assert.equal(workflow.split("'"+file+"'").length-1,2,'PR and master must verify an isolated prerequisite/runtime change: '+file);
 assert.doesNotMatch(workflow,/continue-on-error|workflow_run|pull_request_target|secrets\.|NEON_|DATABASE_URL|verify-agreement-hours-independent\.mjs --/);
 const entry=canonical.slice(canonical.indexOf('export async function verifyOwnAgreementWorkingTime('),canonical.indexOf('export async function runOwnAgreementWorkingTimeQa('));
 assert.ok(entry.indexOf('runOwnPayrollAdministrativeOperatorQa(h)')<entry.indexOf('runOwnPeriodClassificationQa(h,'));assert.ok(entry.indexOf('runOwnPeriodClassificationQa(h,')<entry.indexOf('return runOwnAgreementWorkingTimeQa(h,options)'));assert.match(entry,/finalAdoptedHistory\(\{\.\.\.args,major:options.major,transport:options.transport\}\)/);
 for(const phase of ['const rehearsal=await sql(preface+steps.join','const installed=await sql(steps.join','const durable=await sql(preface.replace','const repeated=await sql(steps.join'])assert.ok(canonical.includes(phase),phase);
 assert.match(canonical,/assertOwnAgreementWorkingTimeDurability\(\{installed,durable,batch\}\)/);assert.match(canonical,/assertOwnAgreementWorkingTimeDurability\(\{installed:repeated,durable,batch\}\)/);
});
test('180 composes four consumers and its capture preserves complete177 declarations',()=>{
 const c=deriveAgreementWorkingTimeConsumers({read,sourceCommit}),b=buildOwnAgreementWorkingTimeInstallation({read,sourceCommit});assert.equal(c.capture177Preserved,true);assert.equal(c.changed.length,4);assert.equal(b.newPins.length,15);assert.equal(b.afterConsumerPins.length,4);assert.equal(b.newPins.filter(p=>p.runtime).length,4);
 for(const token of ['periodClassifications','jurisdictions','salaryConditions','populationDomain'])assert.ok(c.originals[2].includes(token)&&c.changed[2].includes(token),token);
 assert.ok(!c.changed.some(s=>/CREATE OR REPLACE FUNCTION public\.(native_salary_administrative_context_v1|employee_payroll_detail_v1|employee_payroll_documents_v1|payroll_export_roster_v1)\(/.test(s)));
 assert.match(b.verification[0],/transaction_read_only/);assert.match(b.verification[0],/repeatable read/);assert.match(b.afterCheck,/aclexplode/);assert.match(b.afterCheck,/AGREEMENT_INSTALL_TABLE_SECURITY/);
});

test('old-parent catalog prerequisite uses exact167 pins, private administrative helper and parseable four-phase SQL',()=>{
 const qa=buildNoeliaCircuitQa(17),relocate=s=>qa.normalized(s).replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+qaLiteral('search_path=pg_catalog, '+qa.schema+', public, pg_temp')+",'search_path=pg_catalog, public, pg_temp'),"+qaLiteral(qa.schema)+",'public')"),b=buildAgreementWorkingTimeCatalogQa({read,sourceCommit,schema:qa.schema,relocate});
 assert.equal(b.batch.beforePins.length,5);assert.equal(b.batch.afterPins.length,5);assert.equal(b.statements.length,9);assert.equal(b.verification.length,5);assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.match(b.prerequisite,/CLASSIFICATION_USE_ADMINISTRATIVE_PREREQUISITE/);assert.match(b.prerequisite,/p\.oid IS NULL/);assert.match(b.helperCheck,/AGREEMENT_CATALOG_QA_HELPER_CHANGED/);assert.match(b.helperCheck,/45c74402dff395e2795b525a16136150171964ec73d9bb3be830ac1ff8a1e12a/);
 assert.match(b.helper,/IF to_regprocedure\('[^']+employment_adoption_administrative_context_v1\(jsonb,text\)'\) IS NULL THEN/);assert.match(b.helper,/REVOKE ALL ON FUNCTION/);assert.doesNotMatch(b.helper,/CREATE OR REPLACE|GRANT |UPDATE |INSERT INTO/);
 assert.match(b.beforeCheck,/37d7be04b2f5f3c5b5eb13ad7fc824e8823c7da44bfe45750f617961a79b5798/);assert.match(b.afterCheck,/939dc2cc92b03ab045b23c3178c05a79bbaa6284a3997fc3f00c230e84b665c0/);assert.match(b.afterCheck,/30aa07e730091240796987fa7c699bf0962308944ba34202ee0051ec4eefb697/);
 for(const s of[b.guard,b.helper,b.helperCheck,...b.statements,...b.verification])assert.equal(splitPostgresStatements(s).length,1);
 assert.ok(b.statements[4].includes('replace(replace(replace(updated.prosrc'));assert.ok(b.statements[4].includes('replace(replace(replace(f.prosrc'));
 const canonical=read('scripts/verify-own-agreement-working-time.mjs');assert.ok(canonical.indexOf('await runAgreementWorkingTimeCatalogQa(h)')<canonical.indexOf('const batch=buildOwnAgreementWorkingTimeInstallation(h.options)'));
});

test('missing or changed167 source and a foreign relocation cannot generate the catalog QA prerequisite',()=>{
 const schema='mc_qa_fixed_092_'+'a'.repeat(32),relocate=s=>s.replaceAll('public.',schema+'.');
 assert.throws(()=>buildAgreementWorkingTimeCatalogQa({read:()=>{throw Error('missing canonical167 source');},sourceCommit,schema,relocate}),/missing canonical167 source/);
 assert.throws(()=>buildAgreementWorkingTimeCatalogQa({read:p=>read(p)+(p==='scripts/migrations/167-classification-registration-use.sql'?'\n-- different source':''),sourceCommit,schema,relocate}),/CLASSIFICATION_USE_SOURCE_CHANGED/);
 assert.throws(()=>buildAgreementWorkingTimeCatalogQa({read,sourceCommit,schema,relocate:s=>s}),/AGREEMENT_CATALOG_QA_RELOCATION_REQUIRED/);
});

test('report QA reads both closed groups and all original runs while conserving the reopened history',async()=>{
 const x=reportCensusFixture(),before=JSON.stringify({detail:x.detail,receipts:x.receipts,captures:x.f.captures});assert.throws(()=>ownReportBundle(x.f.query,[x.detail],[x.receipts[1]],[x.f.captures[1]]),/Falta un grupo cerrado/);
 const bundle=await readAgreementWorkingTimeReportQa({api:x.api,period:'2026-10',detail:x.detail});assert.equal(bundle.sources.length,2);assert.equal(bundle.captures.length,2);assert.equal(bundle.employees.length,4);assert.deepEqual(x.calls.filter(c=>c.query.resource==='group').map(c=>c.query.id),x.receipts.map(r=>r.groupId));assert.equal(x.calls.filter(c=>c.kind==='liquidation').length,2);assert.equal(x.calls.at(-1).query.resource,'detail');assert.equal(x.calls.at(-1).kind,'close');assert.equal(JSON.stringify({detail:x.detail,receipts:x.receipts,captures:x.f.captures}),before);
});

test('report QA refuses a missing group, changed original capture or final census instead of exporting a subset',async()=>{
 for(const fault of ['missing-group','changed-capture','changed-census']){
  const x=reportCensusFixture(),api=async(kind,args)=>{if(fault==='missing-group'&&kind==='close'&&args.query.resource==='group'&&args.query.id===x.receipts[0].groupId)throw Error('required original closed group absent');const value=await x.api(kind,args);if(fault==='changed-capture'&&kind==='liquidation')value.capture.saved.inputSha256='f'.repeat(64);if(fault==='changed-census'&&kind==='close'&&args.query.resource==='detail')value.stateVersion='f'.repeat(64);return value;};
  await assert.rejects(()=>readAgreementWorkingTimeReportQa({api,period:'2026-10',detail:x.detail}),fault==='missing-group'?/original closed group absent/:fault==='changed-census'?/AGREEMENT_REPORT_STATE_CHANGED/:/integridad|verificar|liquidación|decisión/i);
 }
});
test('a source mutation cannot generate an independent installation against a different capture177',()=>{
 const file='scripts/migrations/177-own-period-classification.sql',source=read(file);assert.ok(source.includes('approved_own_period_classification'));
 assert.throws(()=>deriveAgreementWorkingTimeConsumers({sourceCommit,read:p=>p===file?source.replace('approved_own_period_classification','unreviewed-period-classification'):read(p)}));
});

test('independent process-start audit rejects a different PID, data directory or process start before SQL',()=>{
 const identity={processId:5988,directory:path.resolve('verification'),executable:process.execPath},pidFile='5988\n'+identity.directory+'\n1000\n',cim={ProcessId:5988,ExecutablePath:process.execPath,CreationDate:'1970-01-01T00:16:40.000Z'};
 assert.equal(assertIndependentProcessStart({identity,pidFile,cim}).postmasterStartEpoch,1000);
 for(const wrong of['5989\n'+identity.directory+'\n1000\n','5988\n'+path.resolve('tests')+'\n1000\n','5988\n'+identity.directory+'\n1005\n'])assert.throws(()=>assertIndependentProcessStart({identity,pidFile:wrong,cim}));
 assert.throws(()=>assertIndependentProcessStart({identity,pidFile,cim:{...cim,ProcessId:34448}}));
});
test('invented R1 keeps class code and U1 typed, L15 independent from L17, and half a cent exact',()=>{
 const s=r1Fixture(),input=prepareOwnPayrollInput(s),result=createOwnPayrollSnapshot(input).result,inputs=input.employees[0].inputs;
 assert.equal(inputs.find(v=>v.key==='classCode').value,'0007');assert.equal(inputs.find(v=>v.key==='classCode').unit,'code');assert.equal(inputs.find(v=>v.key==='U1').value,'100.11000000');assert.equal(inputs.find(v=>v.key==='U1').unit,'money');
 assert.equal(inputs.find(v=>v.key==='L15').value,'160.25000000');assert.equal(inputs.find(v=>v.key==='L17').value,'80.12500000');assert.notEqual(inputs.find(v=>v.key==='L15').sourceReference,inputs.find(v=>v.key==='L17').sourceReference);assert.equal(result.rows.find(r=>r.conceptCode==='95').amount,'50.055');
});
test('numeric class coercion and an implicit source opt-in are refused, preserving legacy behavior',()=>{
 const s=r1Fixture();s.population.employees[0].categoryCode=7;assert.throws(()=>prepareOwnPayrollInput(seal(s)));const t=r1Fixture();delete t.programState.program.definition.agreementWorkingTimeVersion;assert.throws(()=>prepareOwnPayrollInput(t));
 const legacy=auxiliarySources(1),before=prepareOwnPayrollInput(legacy);legacy.agreementWorkingTime=r1Fixture().agreementWorkingTime;assert.throws(()=>prepareOwnPayrollInput(legacy));delete legacy.agreementWorkingTime;assert.deepEqual(prepareOwnPayrollInput(legacy),before);
});
test('unknown agreement hours refuse the cohort; declared zero remains zero and division fails explicitly',()=>{
 const unknown=r1Fixture();unknown.agreementWorkingTime.records[0].definition.monthlyHours=null;assert.throws(()=>prepareOwnPayrollInput(seal(unknown)));
 const zero=r1Fixture();zero.agreementWorkingTime.records[0].definition.monthlyHours='0';const input=prepareOwnPayrollInput(seal(zero));assert.equal(input.employees[0].inputs.find(v=>v.key==='L15').value,'0.00000000');assert.throws(()=>createOwnPayrollSnapshot(input),e=>e.code==='DIVISION_BY_ZERO');
});
test('changing L15 changes only a new explicit fingerprint and leaves prior captured inputs intact',()=>{
 const s=r1Fixture(),first=prepareOwnPayrollInput(s);s.agreementWorkingTime.records[0].definition.monthlyHours='80.125';assert.throws(()=>prepareOwnPayrollInput(s));const next=prepareOwnPayrollInput(seal(s));assert.notEqual(first.sourceVersions.population,next.sourceVersions.population);assert.equal(first.employees[0].inputs.find(v=>v.key==='L15').value,'160.25000000');assert.equal(createOwnPayrollSnapshot(next).result.rows.find(r=>r.conceptCode==='95').amount,'100.110');
});
