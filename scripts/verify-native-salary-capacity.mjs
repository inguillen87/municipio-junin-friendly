// Real handler/PostgreSQL, wholly synthetic fixture and disposable schema.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {verifySalaryAuxiliaryNamespace} from './verify-salary-auxiliary-namespace.mjs';
import {buildNativeSalaryCapacityInstallation} from './lib/native-salary-capacity-installation.mjs';
import {createNativeSalaryHandler} from '../api/internal-native-salary.js';
import {fullSalaryCatalogFixture} from '../tests/fixtures/native-salary-full-catalog-synthetic.js';
import {salaryItems,salarySerialized,salaryJsonbBytes} from '../assets/native-salary-catalog-model.js';
import {readSalaryBootstrap} from '../assets/native-salary-stream-model.js';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';

export async function verifyNativeSalaryCapacity({major,transport='local',sourceCommit,output,browser='none'}){
 return verifySalaryAuxiliaryNamespace({major,transport,sourceCommit,output,browser:'none',continuation:async context=>{
  const {options,qa,db,relocate,sql,adapter,deps,env,ok,setActor,destination}=context;
  const batch=buildNativeSalaryCapacityInstallation(options);
  const n=s=>relocate(s);
  const statements=batch.statements.map(s=>s.startsWith('DO $check$')?`DO $check$ BEGIN IF current_setting('municontrol_salary_capacity.mode')='install' THEN EXECUTE ${q(n(batch.beforeCheck))};ELSE EXECUTE ${q(n(batch.afterCheck))};END IF;END $check$`:s.startsWith('DO $install$')?`DO $install$ BEGIN IF current_setting('municontrol_salary_capacity.mode')='install' THEN ${batch.mutations.map(x=>'EXECUTE '+q(n(x))+';').join('\n')} END IF;END $install$`:n(s));
  const before=await db.run("SELECT jsonb_build_object('salary',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM native_salary_event e),'contracts',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM employment_contract e))");
  const oldSalary=await db.run('SELECT jsonb_build_object(\'body\',body,\'key\',request_key) FROM native_salary_event WHERE command=\'propose\' AND actor_membership_id='+q(qa.actors.maker.membershipId)+'::uuid ORDER BY recorded_at,id LIMIT 1');
  assert.ok(oldSalary?.body&&oldSalary.key,'PRIOR_SALARY_ATTEMPT_REQUIRED');
  const installed=await sql(statements.join(';'));
  const durable=await sql(batch.verification.map(n).join(';'));
  const repeated=await sql(statements.join(';'));
  assert.equal(installed.mode,'install');assert.equal(repeated.mode,'verify');
  assert.equal(installed.preservationSha256,durable.preservationSha256);assert.equal(installed.preservationSha256,repeated.preservationSha256);
  const after=await db.run("SELECT jsonb_build_object('salary',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM native_salary_event e),'contracts',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM employment_contract e))");
  assert.deepEqual(before,after);ok(true,'capacity install, durable verification and repetition preserve all prior event bodies and contracts');
  let streamQueries=0,readRevoked=false;const timings=[];
  const streamAdapter={query:async(query,values)=>{
   if(!query.startsWith('SELECT public.native_salary_stream_v1('))return adapter.query(query,values);
   streamQueries++;
   assert.equal(values.length,3);return[{result:await db.run(query.replaceAll('public.',qa.schema+'.').replace(/\$(\d+)/g,(_,k)=>values[Number(k)-1]===null?'NULL':q(values[Number(k)-1])),true)}];
  }};
  const handler=createNativeSalaryHandler({...deps,requireAccess:async(...args)=>{const access=await deps.requireAccess(...args);return readRevoked?{...access,principal:{...access.principal,tenant:{...access.principal.tenant,effectiveCapabilities:[]}}}:access;},getSql:()=>streamAdapter});
  const request=async(query,{body,key,expected=200}={})=>{
   const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(v){this.value=v;return this;}};
   const started=performance.now();await handler({method:body?'POST':'GET',url:'/api/internal-native-salary'+(body?'':'?'+new URLSearchParams(query)),query:body?{}:query,headers:body?{origin:env.INTERNAL_APP_ORIGIN,'content-type':'application/json','idempotency-key':key}:{},...(body?{body:JSON.stringify({operation:'command',payload:body})}:{})},res);timings.push({resource:body?'command':query.resource,ms:performance.now()-started,status:res.statusCode});
   assert.equal(res.statusCode,expected,res.value?.error);return res.value;
  };
  const fetchPage=async(page,snapshot)=>(await request({resource:'stream',page:String(page),...(snapshot?{snapshot}:{})})).data;
  setActor(qa.actors.maker);let boot=await readSalaryBootstrap(fetchPage);
  fs.writeFileSync(path.join(destination,'capacity-classification.json'),JSON.stringify({syntheticOnly:true,classification:boot.classification},null,2)+'\n');
  const category=boot.classification.items.find(r=>r.kind==='categories'&&r.agreementCode==='1');
  assert.ok(category,'SYNTHETIC_CLASS_REQUIRED');
  const {items,history}=fullSalaryCatalogFixture();
  // Use a class explicitly present in this inherited synthetic QA catalog.
  // All new codes stay fictional
  // and independent of the original compact namespace regression.
  const additions=items.map((r,index)=>({...r,code:String(r.kind==='concept'?400000+index:r.kind==='auxiliary'?400000+index-2033:600000+index),...(r.kind==='scale'?{categoryCode:category.code}:{})}));
  const antecedents=history.map((r,index)=>({...r,code:String(700000+index)}));
  const all=salaryItems([...boot.catalog.items,...antecedents,...additions]),baselineCount=boot.catalog.items.length;
  assert.equal(all.length,baselineCount+3279);
  assert.equal(await db.run('SELECT octet_length('+q(JSON.stringify(all))+'::jsonb::text)'),salaryJsonbBytes(all));ok(true,'frontend byte count matches the actual complete PostgreSQL JSONB representation');
  const body={command:'propose',scopeVersion:boot.scopeVersion,baseVersion:boot.catalog.version,classificationVersion:boot.classification.version,proposalId:null,proposalSha256:null,items:all,reason:'Maestro completo ficticio de QA; no decisión municipal',reviewConfirmed:false},key=randomUUID();
  const proposed=(await request({}, {body,key,expected:201})).data;
  setActor(qa.actors.checker);const review=await readSalaryBootstrap(fetchPage);
  const decision={...body,command:'approve',scopeVersion:review.scopeVersion,items:null,proposalId:proposed.proposalId,proposalSha256:proposed.requestSha256,reviewConfirmed:true};
  const approved=(await request({}, {body:decision,key:randomUUID(),expected:201})).data;
  assert.equal(approved.status,'approved');setActor(qa.actors.maker);boot=await readSalaryBootstrap(fetchPage);
  assert.deepEqual(boot.catalog.items,all);ok(true,'real SQL and actual handler independently approve the whole3204 new definitions and75 antecedents');
  const replayed=(await request({}, {body,key})).data;assert.equal(replayed.replayed,true);assert.equal(salarySerialized(replayed.body),salarySerialized(body));
  const legacyReplayed=(await request({}, {body:oldSalary.body,key:oldSalary.key})).data;assert.equal(legacyReplayed.replayed,true);assert.equal(salarySerialized(legacyReplayed.body),salarySerialized(oldSalary.body));
  ok(true,'old and full-volume voluntary requests preserve their exact body and key after approval');
  // Multiple complete proposals exceed a single platform response; never crop.
  for(let attempt=0;attempt<2;attempt++){
   const changed=all.map(r=>({...r,label:r.label+' QA'+attempt})),next={...body,scopeVersion:boot.scopeVersion,baseVersion:boot.catalog.version,classificationVersion:boot.classification.version,items:changed,reason:'Otra versión completa ficticia para verificar el transporte'};
   await request({}, {body:next,key:randomUUID(),expected:201});
  }
  const first=await fetchPage(0,null);assert.ok(first.totalBytes>4.5*1024*1024);
  boot=await readSalaryBootstrap(fetchPage);assert.deepEqual(boot.catalog.items,all);
  assert.equal(boot.proposals.filter(p=>p.items.length===all.length).length,3);ok(true,'all full-volume pending/approved proposals survive a source larger than4.5MiB');
  setActor(qa.actors.checker);const changedScope=await request({resource:'stream',page:'1',snapshot:first.snapshotSha256},{expected:409});assert.equal(changedScope.code,'NATIVE_SALARY_SNAPSHOT_CHANGED');
  setActor(qa.actors.maker);ok(true,'scope change between pages never exposes a mixed complete master');
  const recordCount=await db.run('SELECT count(*) FROM native_salary_event');
  await sql('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid');
  const preparationRevoked=await request({resource:'stream',page:'1',snapshot:first.snapshotSha256},{expected:409});assert.equal(preparationRevoked.code,'NATIVE_SALARY_SNAPSHOT_CHANGED');
  ok(true,'withdrawn preparation link invalidates the snapshot without falsely revoking the remaining read authority');
  await sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid');
  readRevoked=true;const previousReads=streamQueries;
  const revoked=await request({resource:'stream',page:'1',snapshot:first.snapshotSha256},{expected:403});assert.ok(revoked.code);assert.equal(streamQueries,previousReads);readRevoked=false;
  assert.equal(await db.run('SELECT count(*) FROM native_salary_event'),recordCount);ok(true,'read revocation between blocks opens no SQL query, writes no salary event and preserves every prior attempt');
  if(browser!=='none'){const {verifyNativeSalaryCapacityBrowser}=await import('./lib/native-salary-capacity-browser.mjs');await verifyNativeSalaryCapacityBrowser({handler,env,actor:{...qa.actors.maker,bindingId:qa.ids.binding},output:destination,check:ok,all,classification:boot.classification.items,browserName:browser,setReadRevoked:value=>{readRevoked=value;},eventCount:()=>db.run('SELECT count(*) FROM native_salary_event')});}
  fs.writeFileSync(path.join(destination,'capacity-timings.json'),JSON.stringify(timings,null,2)+'\n');
  assert.ok(timings.every(t=>t.ms<25000),'HANDLER_EXCEEDS_EXISTING_CLIENT_DEADLINE');
  const proof={installed,durable,repeated,completeDefinitions:all.length,priorDefinitions:baselineCount,snapshotBytes:first.totalBytes,pages:first.pageCount,maxHandlerMs:Math.max(...timings.map(t=>t.ms)),businessWritesInProduction:0};
  fs.writeFileSync(path.join(destination,'capacity-proof.json'),JSON.stringify(proof,null,2)+'\n');return proof;
 }});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const arg of process.argv.slice(2)){const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(arg);assert.ok(m&&!Object.hasOwn(args,m[1]));args[m[1]]=m[2];}
 try{const result=await verifyNativeSalaryCapacity({major:Number(args.major),transport:args.transport,sourceCommit:args['source-commit'],output:args.output,browser:args.browser??'none'});console.log(JSON.stringify({ok:result.ok,checks:result.checksPassed,syntheticOnly:true,capacity:result.continuation}));}catch(e){console.error(e);process.exitCode=1;}
}
