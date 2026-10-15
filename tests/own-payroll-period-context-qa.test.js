import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{buildPayrollPeriodContextInstallation}from'../scripts/lib/own-payroll-period-context-installation.mjs';
import{buildPeriodContextQaRelocation,assertPeriodContextPaidRows}from'../scripts/lib/own-payroll-period-context-qa.mjs';
import{periodContextQaOptions,periodContextQaSourceFiles}from'../scripts/verify-own-payroll-period-context.mjs';
import{buildNoeliaCircuitQa}from'../scripts/lib/noelia-payroll-circuit-qa.mjs';
import http from'node:http';import{once}from'node:events';import{randomUUID}from'node:crypto';
import*as periodContextBrowser from'../scripts/lib/own-payroll-period-context-browser.mjs';
import{forwardAgreementQaHttp}from'../scripts/lib/own-agreement-working-time-browser.mjs';
import{createOwnRunHandler}from'../api/internal-own-payroll-run.js';
import{RUN_READ}from'../lib/internal-own-payroll-run.js';
import{OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES,readOwnPayrollResponse}from'../assets/own-payroll-response.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),sourceCommit='a'.repeat(40);

test('182 QA options have no remote host, port, database, SQL or actor override and require an immutable source',()=>{
 assert.deepEqual(periodContextQaOptions(['--major=17','--source-commit='+sourceCommit,'--output=verification/context182-synthetic']),{major:17,sourceCommit,output:'verification/context182-synthetic',transport:'local',browser:'none'});
 for(const extra of['--host=neon.example','--port=5432','--sql=SELECT1','--transport=production','--actor=municipal','--source-commit=main','--major=18','--output=../outside'])assert.throws(()=>periodContextQaOptions(['--major=17','--source-commit='+sourceCommit,'--output=verification/context182-synthetic',extra]));
});

test('182 QA source inventory retains the full177/179/180/178 chain, independent90pin guards, source compiler and original stream handler',()=>{
 assert.equal(new Set(periodContextQaSourceFiles).size,periodContextQaSourceFiles.length);
 for(const file of['scripts/migrations/167-classification-registration-use.sql','scripts/migrations/176-own-payroll-administrative-operator.sql','scripts/migrations/177-own-period-classification.sql','scripts/migrations/178-adopted-documentary-read.sql','scripts/migrations/179-own-agreement-working-time.sql','scripts/migrations/180-own-agreement-working-time-program.sql','scripts/migrations/182-own-payroll-period-context.sql','api/internal-own-period-classification.js','scripts/lib/own-agreement-working-time-browser.mjs','assets/own-payroll-period-context.js','lib/own-payroll-programme-source-preparation.js'])assert.ok(periodContextQaSourceFiles.includes(file),file);
 const runner=read('scripts/verify-own-payroll-period-context.mjs');assert.match(runner,/verifyOwnAgreementWorkingTime\(\{/);assert.match(runner,/runPeriodContextQa\(h,options\)/);assert.match(runner,/otherClients,0/);assert.match(runner,/postmasterStartEpoch,expected.start/);assert.match(runner,/documentary\.probe|sentinel\.probe/);assert.match(runner,/detailLibraryPdfBytesPreserved/);
});

test('182 disposable relocation derives the known readiness adaptation from sources and preserves strict phases/table guards without observing a database',()=>{
 const batch=buildPayrollPeriodContextInstallation({read,sourceCommit}),qa=buildNoeliaCircuitQa(17),f=buildPeriodContextQaRelocation({read,sourceCommit,schema:qa.schema,relocate:s=>qa.normalized(s),batch});
 assert.equal(f.productionCompatible,false);assert.equal(f.connects,false);assert.equal(f.executesSql,false);assert.equal(f.mutations.length,4);assert.equal(f.rehearsal.length,10);assert.equal(f.installation.length,10);assert.equal(f.repetition.length,10);assert.equal(f.verification.length,5);
 assert.notEqual(f.fixtureBeforeSha256,batch.beforePins[3].sha256);assert.notEqual(f.fixtureAfterSha256,batch.afterPins[3].sha256);assert.notEqual(f.fixtureBeforeSha256,f.fixtureAfterSha256);
 for(const sql of[f.beforeCheck,f.afterCheck]){assert.ok(sql.includes('AGREEMENT_INSTALL_TABLE_SECURITY'));assert.ok(sql.includes('AGREEMENT_INSTALL_FUNCTION_COUNT'));assert.ok(sql.includes('own_agreement_working_time_event'));assert.ok(sql.includes(qa.schema));}
 assert.ok(f.installation[2].includes("<>'install'"));assert.ok(f.repetition[2].includes("<>'verify'"));assert.ok(f.verification[1].includes("transaction_read_only')<>'on'"));assert.ok(f.mutations[3].includes(batch.afterPins[2].sha256));
 assert.throws(()=>buildPeriodContextQaRelocation({read,sourceCommit,schema:'public',relocate:s=>s,batch}));
});

test('deployment includes only the182 code source and new context asset, with no private input whitelist',()=>{
 assert.match(read('.vercelignore'),/^!scripts\/migrations\/182-own-payroll-period-context\.sql$/m);assert.match(read('scripts/build-friendly.mjs'),/'assets\/own-payroll-period-context\.js'/);assert.doesNotMatch(read('.vercelignore'),/^!\.handoff|^!.*Downloads|^!.*\.backup/m);
});

test('paid-row proof refuses empty, omitted, duplicate, foreign, misvalued or wrong-nature rows even when the declared employee count remains37',()=>{
 const ids=Array.from({length:37},(_,i)=>'synthetic-'+i),capture={saved:{input:{employees:ids.map(contractId=>({contractId}))},result:{employeeCount:37,rows:ids.map(contractId=>({contractId,conceptCode:'9888',amount:'1.110',unit:'money',nature:'remuneration'}))}}};assert.equal(assertPeriodContextPaidRows(capture,ids,'1.110').length,37);
 for(const change of[c=>c.saved.result.rows=[],c=>c.saved.result.rows.pop(),c=>c.saved.result.rows.push(c.saved.result.rows[0]),c=>c.saved.result.rows[0].contractId='foreign',c=>c.saved.result.rows[0].contractId=c.saved.result.rows[1].contractId,c=>c.saved.result.rows[0].conceptCode='9999',c=>c.saved.result.rows[0].amount='1.11',c=>c.saved.result.rows[0].nature='auxiliary',c=>c.saved.input.employees.pop()]){const wrong=structuredClone(capture);change(wrong);assert.throws(()=>assertPeriodContextPaidRows(wrong,ids,'1.110'));}
});

test('built GUI uses the actual run-history buttons and original-variable report with all pages and exact37-row assertions',()=>{
 const browser=read('scripts/lib/own-payroll-period-context-browser.mjs'),qa=read('scripts/lib/own-payroll-period-context-qa.mjs');
 for(const component of['own-payroll-run-panel.js','mountOwnPayrollRun','own-payroll-report-panel.js','mountOwnPayrollReports'])assert.ok(browser.includes(component),component);
 assert.ok(browser.includes('[data-own-open="'));assert.match(browser,/report\('view'\)\.selectOption\('variables'\)/);assert.match(browser,/collectPages\(r\('rows'\),r\('next'\)\)/);assert.match(browser,/collectPages\(report\('rows'\),report\('next'\)\)/);assert.match(browser,/assert\.equal\(rows\.length,37,'PERIOD_CONTEXT_GUI_RESULT_ROWS_INCOMPLETE'\)/);assert.match(browser,/assert\.equal\(rows\.length,37,'PERIOD_CONTEXT_GUI_VARIABLE_ROWS_INCOMPLETE'\)/);assert.match(browser,/row\[monthColumn\]===capture\.payload\.periodContext\.monthNumber/);assert.match(browser,/row\[3\]===formatted/);assert.match(browser,/actualRunWorkspaceDom:true,actualOriginalVariablesDom:true/);
 assert.match(qa,/setActor\(checker\);for\(const capture of captures\)/);assert.match(qa,/PERIOD_CONTEXT_GUI_CHANGED_BUSINESS_ROWS/);assert.match(browser,/if\(req.method!=='GET'\)/);assert.match(browser,/assert\.deepEqual\(commands,\[\]\)/);
});

test('182 run bridge retains the real request and response and streams a complete dated history through actual HTTP backpressure',async()=>{
 const data={version:'own-payroll-bootstrap.v2',scopeVersion:'a'.repeat(64),programVersion:'b'.repeat(64),canCalculate:false,complete:true,runs:Array.from({length:1000},()=>({id:randomUUID(),key:randomUUID(),period:'2028-02',liquidationType:'monthly',selectionKind:'contracts',selectionValueCount:37,createdAt:'2026-10-15T12:00:00Z',state:'calculated',inputSha256:'c'.repeat(64),resultSha256:'d'.repeat(64),liquidationDate:'2099-01-01'}))};
 const principal={user:{email:'stream-182@example.invalid'},tenant:{source:'membership',id:randomUUID(),membershipId:randomUUID(),effectiveCapabilities:RUN_READ}},session={email:principal.user.email,id:randomUUID(),version:1,releaseSha:'a'.repeat(40)},queries=[],failures=[],writes=[],drains=[];
 let incoming,response,authorizedRequest,authorizedResponse,ended;
 const handler=createOwnRunHandler({requireAccess:async(req,res)=>{authorizedRequest=req;authorizedResponse=res;assert.equal(req.readableFlowing,null);await new Promise(resolve=>setImmediate(resolve));return{mode:'managed',principal};},sessionFor:()=>session,getSql:async()=>({query:async(query,values)=>{queries.push({query,values});return[{result:data}];}})});
 const server=http.createServer({highWaterMark:1024},(req,res)=>{
  incoming=req;response=res;const write=res.write.bind(res);res.write=(chunk,...args)=>{const accepted=write(chunk,...args);writes.push({bytes:Buffer.byteLength(chunk),accepted});return accepted;};res.on('drain',()=>drains.push(true));
  Promise.resolve().then(()=>periodContextBrowser.forwardPeriodContextRunHttp(req,res,new URL(req.url,'http://127.0.0.1'),handler)).then(value=>{ended=res.writableEnded;assert.equal(value.status,200);},error=>{failures.push(error.message);if(res.headersSent)res.destroy(error);else res.writeHead(500,{'Content-Type':'application/json'}).end('{"ok":false}');});
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const result=await fetch('http://127.0.0.1:'+server.address().port+'/api/internal-own-payroll-run?resource=bootstrap&contractVersion=2',{headers:{Accept:OWN_RUN_FULL_JSON}});
  assert.equal(result.status,200);assert.deepEqual(await readOwnPayrollResponse(result,{maxBytes:OWN_RUN_FULL_MAX_BYTES}),{ok:true,data});
  assert.equal(authorizedRequest,incoming);assert.equal(authorizedResponse,response);assert.ok(incoming instanceof http.IncomingMessage);assert.ok(response instanceof http.ServerResponse);assert.equal(Object.hasOwn(incoming,'body'),false);assert.equal(incoming.headers.accept,OWN_RUN_FULL_JSON);assert.equal(ended,true);
  assert.equal(queries.length,1);assert.equal(queries[0].query,'SELECT public.own_run_bootstrap_v2($1::jsonb) AS result');assert.equal(JSON.parse(queries[0].values[0]).actorSessionId,session.id);
  const bytes=Buffer.byteLength(JSON.stringify({ok:true,data}));assert.ok(bytes>64*1024);assert.equal(writes.reduce((total,value)=>total+value.bytes,0),bytes);assert.ok(writes.length>1);assert.ok(writes.some(value=>!value.accepted));assert.ok(drains.length>0);
  assert.equal(result.headers.get('content-type'),OWN_RUN_FULL_JSON+'; charset=utf-8');assert.equal(result.headers.get('x-municontrol-json-bytes'),String(bytes));assert.equal(result.headers.get('content-length'),null);assert.deepEqual(failures,[]);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('182 preserves the actual API refusal before authorization or SQL when a negotiated full response has no stream support',async()=>{
 let authorizations=0,connections=0;const handler=createOwnRunHandler({requireAccess:async()=>{authorizations++;throw Error('must not authorize');},getSql:async()=>{connections++;throw Error('must not connect');}}),url=new URL('http://127.0.0.1/api/internal-own-payroll-run?resource=bootstrap&contractVersion=2');
 const result=await forwardAgreementQaHttp({method:'GET',url:url.pathname+url.search,headers:{accept:OWN_RUN_FULL_JSON}},url,handler);
 assert.equal(result.status,503);assert.equal(result.payload.ok,false);assert.equal(result.payload.code,'OWN_RUN_UNAVAILABLE');assert.equal(authorizations,0);assert.equal(connections,0);
});

test('182 run bridge refuses a handler that returns without ending its real HTTP response',async()=>{
 const failures=[],server=http.createServer((req,res)=>{
  periodContextBrowser.forwardPeriodContextRunHttp(req,res,new URL(req.url,'http://127.0.0.1'),async()=>{}).then(()=>res.end('unexpected'),error=>{failures.push(error.message);res.writeHead(500,{'Content-Type':'application/json'}).end('{"ok":false}');});
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const result=await fetch('http://127.0.0.1:'+server.address().port+'/api/internal-own-payroll-run?resource=bootstrap&contractVersion=2');assert.equal(result.status,500);assert.deepEqual(await result.json(),{ok:false});assert.equal(failures.length,1);assert.match(failures[0],/PERIOD_CONTEXT_RUN_HTTP_RESPONSE_UNFINISHED/);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
