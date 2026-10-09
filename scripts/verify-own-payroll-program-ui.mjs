// Actual built UI + actual handlers + independent committed PostgreSQL connections.
// Municipal authentication and directory projection are declared synthetic fixtures.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {buildOwnPayrollDurableQa,qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {createOwnPayrollPsqlQa} from './lib/own-payroll-psql-qa.mjs';
import {createOwnProgramHandler} from '../api/internal-own-payroll-program.js';
import {createOwnRunHandler} from '../api/internal-own-payroll-run.js';
import {createEmploymentCatalogHandler} from '../api/internal-employment-catalog.js';
import {PROGRAM_READ,PROGRAM_CAPS} from '../lib/internal-own-payroll-program.js';
import {RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
import {exactProgram as syntheticProgram} from '../tests/fixtures/own-payroll-exact-program-synthetic.js';
import {program as historicalProgram,command as syntheticCommand} from '../tests/fixtures/own-payroll-program-synthetic.js';
import {ownProgramRuleKey} from '../assets/own-payroll-program-model.js';
import {prepareProgramCopies} from '../assets/own-payroll-program-copy-model.js';
import {buildOwnReferenceScaleInstallation} from './lib/own-payroll-reference-scale-sql.mjs';
import {buildExactProgramPrecisionInstallation} from './lib/exact-program-precision-installation.mjs';
const root=path.resolve(import.meta.dirname,'..'),execute=promisify(execFile),args={};
for(const a of process.argv.slice(2)){if(a==='--ci'||a==='--built'||a==='--reference-scales'||a==='--multi-copy'){args[a.slice(2)]=true;continue;}const m=/^--(major|psql|output|browser)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
assert.ok(!(args['reference-scales']&&args['multi-copy']),'each variant has its own complete isolated fixture');
assert.equal(args.ci,true);const major=Number(args.major);assert.ok([17,18].includes(major));assert.ok(['chrome','chromium','msedge'].includes(args.browser));
const pageRoot=args.built?path.join(root,'public'):root,output=path.resolve(args.output),prefix=output.replace(/\.json$/,'');assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
const qa=buildOwnPayrollDurableQa(major,{seedProgram:false,declaredDate:true}),executable=args.psql??'psql',db=createOwnPayrollPsqlQa({executable,major,port:55400+major,schema:qa.schema,pins:qa.pins});
const seed=prefix+'-seed.sql';assert.ok(!fs.existsSync(seed));fs.writeFileSync(seed,qa.sql,{flag:'wx'});
let installed=false,server,browser,diagnosticPage,held=null,hold=false,lose=false,unregisteredSend=false,expired=false,changedSession=false,checks=0,posts=0,bootRequests=0;
const writes=[],errors=[],sqlDiagnostics=[],check=(value,label)=>{assert.ok(value,label);checks++;},env={};let report;
const permissions=key=>[...new Set([...PROGRAM_READ,...PROGRAM_CAPS[key==='maker'?'propose':'approve'],...(key==='maker'?[...PROGRAM_CAPS.approve,...RUN_CALCULATE,'payroll.read']:[])])];
const actorKey=req=>req.headers['x-qa-actor']==='checker'?'checker':'maker';
const session=key=>{const a=qa.actors[key];return {email:a.actorEmail,id:a.actorSessionId,version:a.actorSessionVersion,releaseSha:a.releaseSha};};
const principal=key=>{const a=qa.actors[key];return {user:{email:a.actorEmail},tenant:{source:'membership',id:a.tenantId,membershipId:a.membershipId,effectiveCapabilities:permissions(key)}};};
const renderQuery=(query,values)=>query.replaceAll('public.own_program_',qa.schema+'.own_program_').replaceAll('public.native_employment_catalog_',qa.schema+'.native_employment_catalog_').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);});
const deps={env,requireAccess:async req=>({mode:'managed',principal:principal(actorKey(req)),qaActor:actorKey(req)}),sessionFor:access=>session(access.qaActor),getSql:async()=>({query:async(query,values)=>{
 try{
  if(query.startsWith('SELECT public.own_run_'))return await db.query(query,values);
  assert.match(query,/^SELECT public\.(?:own_program_(?:bootstrap|attempt|command)|native_employment_catalog_bootstrap)_v1\(/);
  if(query.includes('own_program_command_v1'))writes.push({key:values[2],body:JSON.parse(values[1])});
  const result=await db.run(renderQuery(query,values),true);
  if(lose&&query.includes('own_program_command_v1')){lose=false;throw Error('QA_LOST_PROGRAM_ACK_AFTER_COMMIT');}
  return [{result}];
 }catch(e){sqlDiagnostics.push({message:e.message});throw e;}
}})};
try{
 const seeded=await execute(executable,[...db.args,'-f',seed],{timeout:90000,maxBuffer:4*1024*1024,windowsHide:true});installed=true;fs.writeFileSync(prefix+'-seed.log',seeded.stdout+seeded.stderr);
 const precision=buildExactProgramPrecisionInstallation({read:p=>fs.readFileSync(path.join(root,p),'utf8'),sourceCommit:'a'.repeat(40)});
 await db.run(precision.changed.replaceAll('public.',qa.schema+'.').replaceAll(qa.schema+'.digest(','public.digest(').replace('SET search_path=pg_catalog,public,pg_temp',`SET search_path=pg_catalog,${qa.schema},public,pg_temp`)+"; SELECT '{}'::jsonb");
 let referenceInstallation=null;
 if(args['reference-scales']){
  const batch=buildOwnReferenceScaleInstallation({read:f=>fs.readFileSync(path.join(root,f),'utf8'),sourceCommit:'a'.repeat(40)});
  const relocate=s=>s.replaceAll('public.',qa.schema+'.').replaceAll(qa.schema+'.digest(','public.digest(').replaceAll("'public'::regnamespace",q(qa.schema)+'::regnamespace').replaceAll("s.nspname='public'",'s.nspname='+q(qa.schema)).replace(/SET search_path\s*=\s*pg_catalog,public,pg_temp/g,'SET search_path=pg_catalog,'+qa.schema+',public,pg_temp').replaceAll('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+qa.schema+', public, pg_temp').replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(qa.schema+'.')+",'public'||'.')");
  const installation=await db.run(relocate(batch.installation.join(';'))),durable=await db.run(relocate(batch.durableVerification.join(';')));
  assert.equal(installation.beforeFingerprint,installation.afterFingerprint);assert.deepEqual(durable,Object.fromEntries(Object.entries(installation).filter(([k])=>k!=='beforeFingerprint')));checks++;
  await assert.rejects(db.run(relocate(batch.installation.join(';'))),/SQL131_PREREQUISITE_CHANGED/);checks++;
  await assert.rejects(db.run('ALTER FUNCTION '+qa.schema+'.own_program_definition_v1(jsonb,jsonb) COST 101;'+relocate(batch.durableVerification.join(';'))),/SQL131_METADATA_CHANGED/);checks++;
  referenceInstallation={installation,durable,priorStatePreserved:true,negativeMetadataCases:2};
  const scales=[{active:true,agreementCode:'4',categoryCode:'13',code:'8900',dependencies:[],kind:'scale',label:'Referencia inventada QA',nature:null,precision:2,ruleReference:'Fuente sintética; ninguna norma municipal',unit:'money',validFrom:'2026-10',validUntil:null,value:'201.35'},{active:true,agreementCode:'4',categoryCode:'14',code:'8900',dependencies:[],kind:'scale',label:'Otra clase inventada QA',nature:null,precision:2,ruleReference:'Fuente sintética; ninguna norma municipal',unit:'money',validFrom:'2026-10',validUntil:null,value:'999.99'}];
  await db.run(`DO $reference$ DECLARE maker jsonb:=${q(JSON.stringify(qa.actors.maker))}::jsonb;checker jsonb:=${q(JSON.stringify(qa.actors.checker))}::jsonb;b jsonb;r jsonb;body jsonb;BEGIN
   b:=native_employment_catalog_bootstrap_v1(maker);body:=jsonb_build_object('scopeVersion',b->>'scopeVersion','baseVersion',b#>>'{catalog,version}','reason','Clases de referencia sintéticas propias QA','items',(b#>'{catalog,items}')||'[{"kind":"agreements","code":"4","label":"Convenio inventado QA","key":"a4","agreementCode":null},{"kind":"categories","code":"13","label":"Referencia inventada QA","key":"c413","agreementCode":"4"},{"kind":"categories","code":"14","label":"Otra clase inventada QA","key":"c414","agreementCode":"4"}]'::jsonb);
   r:=native_employment_catalog_propose_v1(maker,body,gen_random_uuid());PERFORM native_employment_catalog_review_v1(checker,jsonb_build_object('scopeVersion',native_employment_catalog_bootstrap_v1(checker)->>'scopeVersion','proposalId',r->>'proposalId','decision','approve','reason','Revisión independiente de clases sintéticas QA'),gen_random_uuid());
   b:=native_salary_bootstrap_v1(maker);body:=jsonb_build_object('command','propose','scopeVersion',b->>'scopeVersion','baseVersion',b#>>'{catalog,version}','classificationVersion',b#>>'{classification,version}','proposalId',NULL,'proposalSha256',NULL,'items',(b#>'{catalog,items}')||${q(JSON.stringify(scales))}::jsonb,'reason','Escalas sintéticas propias; ninguna homologación municipal','reviewConfirmed',false);
   r:=native_salary_command_v1(maker,body,gen_random_uuid());PERFORM native_salary_command_v1(checker,body||jsonb_build_object('command','approve','scopeVersion',native_salary_bootstrap_v1(checker)->>'scopeVersion','items',NULL,'proposalId',r->>'proposalId','proposalSha256',r->>'requestSha256','reviewConfirmed',true),gen_random_uuid());END $reference$`);
 }
 if(args['multi-copy']){
  // Approve target classifications and exact salary definitions through the real writers.
  await db.run(`DO $targets$ DECLARE maker jsonb:=${q(JSON.stringify(qa.actors.maker))}::jsonb;checker jsonb:=${q(JSON.stringify(qa.actors.checker))}::jsonb;b jsonb;r jsonb;body jsonb;BEGIN
   b:=native_employment_catalog_bootstrap_v1(maker);body:=jsonb_build_object('scopeVersion',b->>'scopeVersion','baseVersion',b#>>'{catalog,version}','reason','Convenios sintéticos de copia conjunta QA','items',(b#>'{catalog,items}')||'[{"kind":"agreements","code":"2","label":"Convenio dos inventado QA","key":"a2","agreementCode":null},{"kind":"agreements","code":"4","label":"Convenio cuatro inventado QA","key":"a4","agreementCode":null}]'::jsonb);
   r:=native_employment_catalog_propose_v1(maker,body,gen_random_uuid());PERFORM native_employment_catalog_review_v1(checker,jsonb_build_object('scopeVersion',native_employment_catalog_bootstrap_v1(checker)->>'scopeVersion','proposalId',r->>'proposalId','decision','approve','reason','Revisión independiente de destinos sintéticos QA'),gen_random_uuid());
   b:=native_salary_bootstrap_v1(maker);body:=jsonb_build_object('command','propose','scopeVersion',b->>'scopeVersion','baseVersion',b#>>'{catalog,version}','classificationVersion',b#>>'{classification,version}','proposalId',NULL,'proposalSha256',NULL,'items',(b#>'{catalog,items}')||(SELECT jsonb_agg(i||jsonb_build_object('agreementCode',a)) FROM jsonb_array_elements(b#>'{catalog,items}') i CROSS JOIN unnest(ARRAY['2','4']) a),'reason','Definiciones de destinos sintéticas; ninguna homologación municipal','reviewConfirmed',false);
   r:=native_salary_command_v1(maker,body,gen_random_uuid());PERFORM native_salary_command_v1(checker,body||jsonb_build_object('command','approve','scopeVersion',native_salary_bootstrap_v1(checker)->>'scopeVersion','items',NULL,'proposalId',r->>'proposalId','proposalSha256',r->>'requestSha256','reviewConfirmed',true),gen_random_uuid());END $targets$`);
 }
 // Synthetic dual capability proves that SQL still forbids reviewing one's own proposal.
 await db.run("INSERT INTO capabilities VALUES("+q(qa.ids.maker)+"::uuid,'payroll.parameter.approve')");
 const sources=await db.run("SELECT jsonb_build_object('contractId',(SELECT contract_id FROM native_employee_registration),'period',greatest('2026-10',to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM')))");
 const handlers={'/api/internal-own-payroll-program':createOwnProgramHandler(deps),'/api/internal-own-payroll-run':createOwnRunHandler(deps),'/api/internal-employment-catalog':createEmploymentCatalogHandler(deps)};
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://local.invalid');res.setHeader('Cache-Control','no-store');const json=(status,value)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(value));
  if(req.method==='GET'&&url.pathname==='/api/internal-auth'){
   const key=actorKey(req),a=qa.actors[key];json(200,{ok:true,authenticated:true,sessionVersion:2,user:{id:changedSession?'another-qa-session':a.actorSessionId,email:a.actorEmail},access:{context:'tenant',tenant:{id:a.tenantId,roleKey:'QA'},tenantCapabilities:permissions(key),platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+(expired?-3600000:3600000)).toISOString()});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/internal-data'){
   if(url.searchParams.get('resource')==='employees'){const page=Number(url.searchParams.get('page'));json(200,{ok:true,version:'employee-picker.v1',data:page===1?[{contractId:sources.contractId,legajo:'19041',nombre:'Corrida propia QA',sector:'20',convenio:'1',activo:true,statusSnapshotDate:null,recordOrigin:'MUNICONTROL'}]:[],pagination:{page,limit:20,total:1,pages:1},scope:{status:'administrative_active',payrollEligibilityCertified:false,sourceCutoffFrom:null,sourceCutoffTo:null}});return;}
   json(503,{ok:false,error:'Synthetic historical dashboard unavailable'});return;
  }
  if(handlers[url.pathname]){
   req.query=Object.fromEntries(url.searchParams);res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');
    if(hold&&req.method==='GET'&&url.pathname==='/api/internal-own-payroll-program'&&url.searchParams.get('resource')==='bootstrap'){hold=false;held=()=>{if(!res.destroyed)res.end(JSON.stringify(value));};}else res.end(JSON.stringify(value));return res;};
   if(url.pathname==='/api/internal-own-payroll-program'&&req.method==='GET')bootRequests++;
   if(req.method==='POST'){posts++;if(unregisteredSend&&url.pathname==='/api/internal-own-payroll-program'){unregisteredSend=false;json(503,{ok:false,error:'Synthetic request did not reach the SQL writer'});return;}}handlers[url.pathname](req,res).catch(e=>json(500,{ok:false,error:e.message}));return;
  }
  if(req.method!=='GET'){json(405,{ok:false});return;}const file=url.pathname==='/nomina-control.html'?path.join(pageRoot,'nomina-control.html'):path.resolve(pageRoot,'.'+decodeURIComponent(url.pathname));
  if(!(url.pathname==='/nomina-control.html'||file.startsWith(path.join(pageRoot,'assets')+path.sep)&&/\.(?:js|css|png|svg|webp)$/.test(file))||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/svg+xml'}).end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;env.INTERNAL_APP_ORIGIN=origin;
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:args.browser==='chromium'?{}:{channel:args.browser})});
 const makerContext=await browser.newContext({viewport:{width:1440,height:1000}}),page=await makerContext.newPage();diagnosticPage=page;page.on('pageerror',e=>errors.push(e.message));
 const select=key=>page.locator('[data-program-'+key+']'),settled=()=>page.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false'&&!document.querySelector('[data-program-content]').hidden,{},{timeout:20000});
 await page.goto(origin+'/nomina-control.html#reglas');await settled();check(posts===0,'opening actual rules task never saves or calculates');
 check(await page.locator('.own-program h2').innerText()==='Reglas de cálculo','actual product task is visible');
 check(await select('rule-select').locator('option').count()===0&&await select('binding-select').locator('option').count()===0,'first installation starts without inventing an approved program');
 const fixture=syntheticProgram();
 const exactBoot=await db.run('SELECT own_program_bootstrap_v1('+q(JSON.stringify(qa.actors.maker))+'::jsonb)');
 const unsafe=syntheticCommand({program:historicalProgram(),scopeVersion:exactBoot.scopeVersion,baseVersion:exactBoot.program.version,salaryVersion:exactBoot.salaryCatalog.version});
 await assert.rejects(db.run('SELECT own_program_command_v1('+q(JSON.stringify(qa.actors.maker))+'::jsonb,'+q(JSON.stringify(unsafe))+'::jsonb,gen_random_uuid())'),/OWN_PROGRAM_PRECISION_REQUIRED/);checks++;
 check((await db.run('SELECT own_program_bootstrap_v1('+q(JSON.stringify(qa.actors.maker))+'::jsonb)')).proposals.length===0,'direct non-exact command cannot bypass the editor or leave a partial proposal');
 if(args['reference-scales']){
  Object.assign(fixture.bindings.find(b=>b.key==='base'),{sourceKind:'scale_reference',sourceCode:'8900',sourceAgreementCode:'4',sourceCategoryCode:'13'});
  const definition=p=>'SELECT own_program_definition_v1('+q(JSON.stringify(p))+'::jsonb,own_program_bootstrap_v1('+q(JSON.stringify(qa.actors.maker))+'::jsonb)#>\'{salaryCatalog,items}\')';
  assert.deepEqual(await db.run(definition(fixture)),fixture);checks++;
  assert.deepEqual(await db.run(definition(syntheticProgram())),syntheticProgram());checks++;
  for(const [change,code] of [[b=>delete b.sourceCategoryCode,'BINDING_INVALID'],[b=>b.sourceAgreementCode='9','SOURCE_DEFINITION_MISSING'],[b=>b.sourceCategoryCode='6-D','BINDING_INVALID'],[b=>b.sourceCategoryCode='99','SOURCE_DEFINITION_MISSING'],[b=>b.sourceCategoryCode=13,'BINDING_INVALID'],[b=>b.onMissing='zero','BINDING_INVALID'],[b=>b.combine='sum','BINDING_INVALID'],[b=>b.unit='hours','BINDING_INVALID']]){
   const p=structuredClone(fixture);change(p.bindings.find(b=>b.key==='base'));await assert.rejects(db.run(definition(p)),new RegExp('OWN_PROGRAM_'+code));checks++;
  }
  await assert.rejects(db.run('SELECT own_program_definition_v1('+q(JSON.stringify(fixture))+"::jsonb,(SELECT jsonb_agg(CASE WHEN i->>'kind'='scale' AND i->>'categoryCode'='13' THEN i||jsonb_build_object('validUntil','2026-10') ELSE i END) FROM jsonb_array_elements(own_program_bootstrap_v1("+q(JSON.stringify(qa.actors.maker))+"::jsonb)#>'{salaryCatalog,items}') i))"),/OWN_PROGRAM_SOURCE_DEFINITION_MISSING/);checks++;
 }
 for(const binding of fixture.bindings){await select('add-binding').click();const fields=[['binding-agreement','agreementCode',false],['binding-key','key',false],['binding-source','sourceKind',true],...(binding.sourceKind==='scale_reference'?[['binding-source-agreement','sourceAgreementCode',true],['binding-code','sourceCode',true],['binding-source-category','sourceCategoryCode',true]]:[['binding-code','sourceCode',false]]),['binding-unit','unit',true],['binding-missing','onMissing',true],['binding-combine','combine',true],['binding-reference','ruleReference',false]];for(const [field,key,dropdown] of fields){const input=page.locator('[data-program-field="'+field+'"]');if(dropdown)await input.selectOption(binding[key]);else await input.fill(binding[key]);}}
 if(args['reference-scales']){
  await select('binding-select').selectOption('1');
  check(await page.locator('[data-program-field="binding-source-category"]').inputValue()==='13','reference class remains explicitly selected before review');
  for(const width of [390,320]){await page.setViewportSize({width,height:900});for(const label of ['Convenio de la escala de referencia','Código de la escala aprobada','Clase de referencia aprobada']){check(await select('binding-editor').getByLabel(label,{exact:true}).evaluate(el=>el.getBoundingClientRect().width<=innerWidth&&el.getBoundingClientRect().height>=44),'accessible reference choice fits mobile '+width+' · '+label);}}
  await select('binding-editor').screenshot({path:prefix+'-reference-editor-mobile.png'});await page.setViewportSize({width:1440,height:1000});
 }
 async function fillExpression(value,steps=[]){
  await page.locator('[data-program-expression-path="'+steps.join('.')+'"]').selectOption(value.op);
  const key='expression-'+(steps.join('-')||'root'),input=name=>page.locator('[data-program-field="'+key+'-'+name+'"]');
  if(['input','literal','convert'].includes(value.op))await input('unit').selectOption(value.unit);
  if(value.op==='input')await input('key').fill(value.key);if(value.op==='literal')await input('value').fill(value.value);
  if(value.op==='concept'){await input('code').fill(value.code);await input('stage').selectOption(value.stage);}
  if(value.op==='compare')await input('operator').selectOption(value.operator);
  if(value.op==='convert'){await input('factor').fill(value.factor);await input('reference').fill(value.conversionReference);}
  if(value.op==='round'){await input('precision').selectOption(String(value.rounding.precision));await input('rounding').selectOption(value.rounding.mode);}
  for(const child of ['left','right','value','condition','then','else'])if(value[child]&&typeof value[child]==='object')await fillExpression(value[child],[...steps,child]);
 }
 for(const rule of fixture.rules){await select('add-rule').click();check(await page.locator('[data-program-field="result-rounding"]').inputValue()==='exact','new rule starts exact without inventing its decimal precision');for(const [field,key,dropdown] of [['agreementCode','agreementCode',false],['code','code',false],['nature','nature',true],['unit','unit',true],['validFrom','validFrom',false],['ruleReference','ruleReference',false]]){const input=page.locator('[data-program-field="'+field+'"]');if(dropdown)await input.selectOption(rule[key]);else await input.fill(rule[key]);}
  for(const type of rule.liquidationTypes)await page.locator('[data-program-type="'+type+'"]').check();await page.locator('[data-program-field="result-precision"]').selectOption(String(rule.rounding.precision));await page.locator('[data-program-field="result-rounding"]').selectOption(rule.rounding.mode);await fillExpression(rule.expression);
 }
 for(const width of [390,320]){await page.setViewportSize({width,height:900});check(await page.locator('.own-program').evaluate(el=>el.getBoundingClientRect().width<=innerWidth),'complete editor fits mobile '+width);check(await page.locator('[data-program-field="result-rounding"]').evaluate(el=>el.getBoundingClientRect().height>=44&&el.getBoundingClientRect().right<=innerWidth),'exact precision control is accessible on mobile '+width);}
 await page.setViewportSize({width:1440,height:1000});
 await select('precision').selectOption(String(fixture.totalsPrecision));await select('reason').fill('Primer programa sintético completo, sin norma municipal');await select('prepare').click();
 check(await select('impact-table').locator('tbody tr').count()===8,'first complete program is authored through actual forms and formula operations');
 await select('confirm').check();unregisteredSend=true;await select('send').click();await page.waitForFunction(()=>document.querySelector('.own-program').getAttribute('aria-busy')==='false');await select('recover').click();await select('revise').waitFor({state:'visible'});check(await select('fields').evaluate(el=>el.disabled),'a confirmed absent attempt remains locked until explicit review');await select('revise').click();await settled();
 check(await select('rule-select').locator('option').count()===6&&await select('binding-select').locator('option').count()===2&&await select('reason').inputValue()==='Primer programa sintético completo, sin norma municipal'&&posts===1&&await select('send').isHidden(),'review after exact GET404 preserves all draft rules and reason without automatic sending');
 await select('prepare').click();check(await select('send').isDisabled()&&await select('impact-table').locator('tbody tr').count()===8,'restored preparation requires another full review and explicit confirmation');await select('confirm').check();await select('send').click();await select('receipt').waitFor({state:'visible'});
 const firstProposal=await db.run("SELECT jsonb_build_object('id',id,'definition',body->'program') FROM own_payroll_program_event WHERE command='propose'");assert.deepEqual(firstProposal.definition,fixture,'all program fields survive actual form authoring without omission');checks++;
 const initialReviewerContext=await browser.newContext({extraHTTPHeaders:{'x-qa-actor':'checker'}}),initialReviewer=await initialReviewerContext.newPage();initialReviewer.on('pageerror',e=>errors.push(e.message));const initialReview=key=>initialReviewer.locator('[data-program-'+key+']');
 await initialReviewer.goto(origin+'/nomina-control.html#reglas');await initialReviewer.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false'&&!document.querySelector('[data-program-content]').hidden);await initialReview('review-tab').click();await initialReview('proposal-select').selectOption(firstProposal.id);await initialReview('decision').selectOption('approve');await initialReview('decision-reason').fill('Primera aprobación independiente sintética completa');await initialReview('review-decision').click();await initialReview('confirm').check();await initialReview('send').click();await initialReview('receipt').waitFor({state:'visible'});check((await initialReview('receipt').innerText()).includes('revisión 1'),'first approved program starts at revision one');await initialReviewerContext.close();
 await select('new').click();await settled();check(await select('rule-select').locator('option').count()===6&&await select('binding-select').locator('option').count()===2,'all newly approved rules and sources can be edited');
 check(await select('rule-editor').getByRole('button',{name:'Retirar esta regla de la preparación'}).isDisabled(),'approved rule history cannot be removed in the editor');
 await select('rule-select').selectOption('1');await page.locator('[data-program-field="expression-right-value"]').fill('0.13');await page.locator('[data-program-field="ruleReference"]').fill('Cambio de coeficiente inventado QA');await select('reason').fill('Propuesta sintética con revisión completa independiente');await select('prepare').click();
 check(await select('impact-table').locator('tbody tr').count()===8,'preview includes every rule and binding before and after');check(await select('send').isDisabled(),'new proposal requires explicit complete review');
 let copiedDefinition=null;const reviewRows=args['multi-copy']?24:8;
 if(args['multi-copy']){
  const source=structuredClone(fixture);source.rules[1].expression.right.value='0.13';source.rules[1].ruleReference='Cambio de coeficiente inventado QA';
  const current=await db.run('SELECT own_program_bootstrap_v1('+q(JSON.stringify(qa.actors.maker))+'::jsonb)');
  copiedDefinition=prepareProgramCopies(current,source,{sourceKeys:source.rules.map(ownProgramRuleKey),targets:['2','4'],validFrom:'2026-10',validUntil:null,ruleReference:'Cambio conjunto inventado QA',mode:'add'}).program;
  await select('copy').locator('summary').click();await select('copy-multiple').check();await select('copy-select-filtered').click();for(const agreement of ['2','4'])await page.locator('[data-program-copy-target="'+agreement+'"]').check();
  await select('copy-from').fill('2026-10');await select('copy-mode').selectOption('add');await select('copy-reference').fill('Cambio conjunto inventado QA');await select('copy-preview').click();await settled();
  check(await select('copy-comparison').locator('tbody tr').count()===24&&posts===3,'all six formulas and shared sources reviewed for both targets without writes after initial independent approval');
  await select('copy-confirm').check();await select('copy-apply').click();await settled();check(await select('rule-select').locator('option').count()===18&&await select('binding-select').locator('option').count()===6&&posts===3,'whole copied draft has 18 rules, six bindings and no implicit saving after initial independent approval');
  await select('prepare').click();check(await select('impact-table').locator('tbody tr').count()===24&&await select('send').isDisabled(),'one complete copied program requires its ordinary confirmation');
 }
 await select('confirm').check();lose=true;await select('send').click();await page.waitForFunction(()=>document.querySelector('.own-program').getAttribute('aria-busy')==='false');
 const lostState={posts,fieldDisabled:await select('fields').evaluate(el=>el.disabled),inputDisabled:await page.locator('[data-program-field="code"]').isDisabled(),recoverVisible:await select('recover').isVisible()};
 check(lostState.posts===4&&lostState.fieldDisabled&&lostState.inputDisabled&&lostState.recoverVisible,'lost committed reply keeps original attempt and locks editing: '+JSON.stringify(lostState));
 await page.evaluate(()=>document.querySelector('[data-program-reason]').value='Texto distinto forzado en la interfaz');await select('send').click();await select('receipt').waitFor({state:'visible'});
 check(writes.length===4&&writes[2].key===writes[3].key&&JSON.stringify(writes[2].body)===JSON.stringify(writes[3].body),'replay retains exact body and key despite forced DOM edit');
 const pending=await db.run("SELECT jsonb_build_object('id',id,'sha',request_sha256,'body',body) FROM own_payroll_program_event WHERE command='propose' ORDER BY recorded_at DESC LIMIT 1");
 if(copiedDefinition){assert.deepEqual(pending.body.program,copiedDefinition,'the actual SQL ledger preserves every selected formula, destination and source');checks++;}
 const boot=await db.run('SELECT '+qa.schema+'.own_program_bootstrap_v1('+q(JSON.stringify(qa.actors.maker))+'::jsonb)',true);
 const unauthorized={command:'approve',scopeVersion:boot.scopeVersion,baseVersion:pending.body.baseVersion,salaryVersion:pending.body.salaryVersion,proposalId:pending.id,proposalSha256:pending.sha,program:null,reason:'Self approval must be denied in synthetic QA',reviewConfirmed:true};
 const denied=await makerContext.request.post(origin+'/api/internal-own-payroll-program',{headers:{Origin:origin,'Idempotency-Key':randomUUID()},data:{operation:'command',payload:unauthorized}});
 check(denied.status()===403&&(await denied.json()).code==='OWN_PROGRAM_INDEPENDENT_REQUIRED','real SQL forbids self approval even with both capabilities');
 await select('new').click();await settled();await select('review-tab').click();await select('proposal-select').selectOption(pending.id);
 check(await select('decision-fields').evaluate(el=>el.disabled),'own pending proposal cannot be decided in the UI');
 const reviewerContext=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{'x-qa-actor':'checker'}}),reviewer=await reviewerContext.newPage();reviewer.on('pageerror',e=>errors.push(e.message));const review=key=>reviewer.locator('[data-program-'+key+']');
 await reviewer.goto(origin+'/nomina-control.html#reglas');await reviewer.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false'&&!document.querySelector('[data-program-content]').hidden);
 check(await review('fields').evaluate(el=>el.disabled),'review-only account cannot edit a program');await review('review-tab').click();await review('proposal-select').selectOption(pending.id);
 check(await review('proposal-detail').locator('tbody tr').count()===reviewRows&&!(await review('decision-fields').evaluate(el=>el.disabled)),'independent reviewer receives the complete saved proposal');
 await review('decision').selectOption('approve');await review('decision-reason').fill('Aprobación independiente sintética sin norma municipal');await review('review-decision').click();await review('confirm').check();await review('send').click();await review('receipt').waitFor({state:'visible'});
 check((await review('receipt').innerText()).includes('revisión 2'),'actual approval advances the own program revision');
 const beforeCalculation=await db.run("SELECT jsonb_build_object('events',(SELECT count(*) FROM own_payroll_program_event),'runs',(SELECT count(*) FROM own_payroll_run_capture),'program',own_program_bootstrap_v1("+q(JSON.stringify(qa.actors.maker))+"::jsonb)->'program')");
 check(beforeCalculation.events===4&&beforeCalculation.runs===0&&beforeCalculation.program.revision===2,'two proposed programs and their independent approvals, one replay and no hidden payroll calculation: '+JSON.stringify({events:beforeCalculation.events,runs:beforeCalculation.runs,revision:beforeCalculation.program.revision}));
 if(copiedDefinition){assert.deepEqual(beforeCalculation.program.definition,copiedDefinition,'approved program exactly retains the entire joint copy on a new committed connection');checks++;}
 await page.screenshot({path:prefix+'-desktop.png',fullPage:true});
 await reviewer.setViewportSize({width:390,height:844});check(await reviewer.locator('.own-program').evaluate(el=>el.getBoundingClientRect().width<=innerWidth),'review fits mobile viewport');
 check(await reviewer.locator('.own-program button:visible').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)),'visible mobile controls have accessible target size');await reviewer.locator('.own-program').screenshot({path:prefix+'-mobile.png'});
 await reviewer.setViewportSize({width:320,height:760});check(await reviewer.locator('.own-program').evaluate(el=>el.getBoundingClientRect().width<=innerWidth),'complete review fits 320px');await reviewer.screenshot({path:prefix+'-mobile-320.png',fullPage:true});
 // The next actual product task must use the program just approved in this UI.
 await page.getByRole('tab',{name:'Calcular',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.own-run')?.getAttribute('aria-busy')==='false'&&!document.querySelector('[data-own-fields]').disabled);
 await page.locator('[data-own-period]').fill(sources.period);await page.locator('[data-own-period-end]').click();await page.locator('[data-own-type]').selectOption('monthly');await page.locator('[data-own-kind]').selectOption('all');await page.locator('[data-own-confirm]').check();await page.locator('[data-own-send]').click();await page.locator('[data-own-result]').waitFor({state:'visible'});
 const result=await db.run("SELECT jsonb_build_object('programVersion',c.payload#>>'{programState,program,version}','requestProgramVersion',c.body->>'programVersion','rows',r.result->'rows','captures',(SELECT count(*) FROM own_payroll_run_capture)) FROM own_payroll_run_result r JOIN own_payroll_run_capture c ON c.id=r.capture_id");
 const expected110=args['reference-scales']?'26.17550000':'13.01300000';
 check(result.captures===1&&result.rows.find(r=>r.conceptCode==='110')?.amount===expected110,'actual own run uses the approved UI coefficient and exact reference scale when declared');
 check(result.programVersion===beforeCalculation.program.version&&result.requestProgramVersion===beforeCalculation.program.version,'saved own run is linked to the exact newly approved program');
 await page.getByRole('tab',{name:'Reglas de cálculo',exact:true}).click();await settled();hold=true;await select('refresh').click();
 for(let i=0;i<100&&!held;i++)await new Promise(r=>setTimeout(r,50));assert.ok(held,'synthetic delayed read is held');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});held();held=null;
 check(await select('content').isHidden(),'hidden page withdraws programs and proposals');await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForTimeout(100);check(await select('content').isHidden()&&!(await select('refresh').isDisabled()),'late read cannot repopulate and explicit refresh remains available');
 await select('refresh').click();await settled();expired=true;await select('refresh').click();await page.waitForFunction(()=>document.querySelector('.own-program').getAttribute('aria-busy')==='false');
 check(await select('content').isHidden()&&await select('login').isVisible(),'expired HTTP200 auth withdraws all private views');expired=false;
 changedSession=true;await review('refresh').click();await reviewer.waitForFunction(()=>document.querySelector('.own-program').getAttribute('aria-busy')==='false');
 check(await review('content').isHidden()&&(await review('status').innerText()).includes('Cambió la sesión'),'another session cannot recover or resend an approval attempt');changedSession=false;
 await select('refresh').click();await settled();await db.run("DELETE FROM capabilities WHERE membership_id="+q(qa.ids.maker)+"::uuid AND capability_key='payroll.parameter.read'");await select('refresh').click();await page.waitForFunction(()=>document.querySelector('.own-program').getAttribute('aria-busy')==='false');
 check(await select('content').isHidden()&&await select('send').isDisabled(),'actual SQL revocation withdraws program despite stale HTTP capability fixture');
 check(await page.evaluate(()=>![...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes('own-payroll-program')||v.includes('19041')||v.includes('coeficiente inventado'))),'rules and nominal results are not stored in browser storage');
 check(errors.length===0,'no unhandled browser errors: '+errors.join(';'));
 report={passed:true,checks,serverMajor:major,productUiVerified:true,builtPackage:!!args.built,synthetic:true,committed:true,realHttpAndSql:true,firstProgramAuthoredFromEmpty:true,approvalToActualCalculation:true,selfApprovalDeniedInSql:true,absentAttemptPreservesCompleteDraft:true,unregisteredSendFixture:true,authenticationGatewayFixture:true,directoryProjectionFixture:true,historicalDashboardUnavailableFixture:true,posts,programEvents:beforeCalculation.events,programRevision:2,calculatedConcept110:expected110,...(referenceInstallation?{referenceScale:true,referenceInstallation}:{}),...(copiedDefinition?{multiCopy:{sources:6,targets:2,rules:18,bindings:6,exactDefinitionDurable:true}}:{}),separateConnections:new Set(db.connections).size,productiveInstallation:false,municipalApprovalVerified:false,paymentExecuted:false};
}catch(e){report={passed:false,checks,message:e.message,sqlDiagnostics,synthetic:true,productiveInstallation:false};if(diagnosticPage){report.browserDiagnostic=await diagnosticPage.evaluate(()=>({status:document.querySelector('[data-program-status]')?.textContent,busy:document.querySelector('.own-program')?.getAttribute('aria-busy'),url:location.pathname+location.hash,contentHidden:document.querySelector('[data-program-content]')?.hidden})).catch(()=>null);await diagnosticPage.screenshot({path:prefix+'-failure.png',fullPage:true}).catch(()=>{});}process.exitCode=1;}
finally{
 held?.();await browser?.close();if(server)await new Promise(r=>server.close(r));
 if(installed){try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');const removed=await db.run("SELECT jsonb_build_object('removed',to_regnamespace("+q(qa.schema)+") IS NULL)");assert.equal(removed.removed,true);report.syntheticSchemaRemoved=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}}
 fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
