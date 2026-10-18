import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{monthly194Options}from'../scripts/verify-own-monthly-day-engine-source.mjs';
import{monthly194SqlFixture}from'./fixtures/own-monthly-day-engine-source-sql-synthetic.js';
import{buildMonthly194Qa,monthly194QaRpc}from'../scripts/lib/own-monthly-day-engine-source-qa.mjs';
import{monthly194CapacityDrafts,monthly194CapacitySql}from'../scripts/lib/own-monthly-day-engine-capacity-qa.mjs';
import{buildMonthlyDayCircuitFixture}from'../scripts/lib/own-monthly-day-engine-circuit-fixture.mjs';
import{verifyMonthlyDayEngineCircuit}from'../scripts/lib/own-monthly-day-engine-circuit-qa.mjs';
import{createOwnRunHandler}from'../api/internal-own-payroll-run.js';import{RUN_READ}from'../lib/internal-own-payroll-run.js';
test('194 only accepts the guarded native CI interface, both major versions and explicit baselines',()=>{const o={major:17,sourceCommit:'a'.repeat(40),output:'verification/synthetic194',transport:'ci',operationalPairBaseline:'pre107'};assert.deepEqual(monthly194Options(o),o);assert.equal(monthly194Options({...o,major:18,operationalPairBaseline:'published107'}).major,18);for(const p of[{transport:'local'},{operationalPairBaseline:undefined},{major:16},{extra:true},{output:'../other'}])assert.throws(()=>monthly194Options({...o,...p}));});
test('synthetic formula keeps193,157 and192 as distinct explicit units/sources',()=>{const only=monthly194SqlFixture(),generic=monthly194SqlFixture({generic:true}),both=monthly194SqlFixture({generic:true,fullMonth192:true});assert.equal(only.municipalFormula,false);assert.equal(only.approvalFabricated,false);assert.deepEqual(only.items,generic.items);assert.deepEqual(only.items,both.items);assert.ok(only.definition.bindings.every(b=>b.sourceKind==='monthly_day_declaration_fact'&&b.unit==='days'));assert.ok(generic.definition.bindings.some(b=>b.sourceKind==='period_fact'&&b.unit==='units'));assert.ok(both.definition.bindings.some(b=>b.sourceKind==='monthly_day_fact'&&b.unit==='days'));assert.equal(both.definition.monthlyDaysPolicy.partial,'reject');assert.equal(only.expectedNet,'160.00000000');});
test('normal RPC194 only composes admitted193 and predecessor192 signatures',()=>{const schema='mc_qa_fixed_092_'+'0'.repeat(32),actor='{}';assert.match(monthly194QaRpc('SELECT public.own_monthly_days_bootstrap_v1($1::jsonb,$2::uuid,$3::text) AS result',[actor,'10000000-0000-4000-8000-000000000001','2026-10'],schema),new RegExp(schema+'\\.own_monthly_days_bootstrap_v1'));assert.match(monthly194QaRpc('SELECT public.own_run_bootstrap_v1($1::jsonb) AS result',[actor],schema),new RegExp(schema+'\\.own_run_bootstrap_v1'));assert.throws(()=>monthly194QaRpc('SELECT public.own_monthly_days_capture_v1($1::jsonb) AS result',[actor],schema));assert.throws(()=>monthly194QaRpc('SELECT public.other($1::jsonb) AS result',[actor],schema));});
test('capacity601 authors only synthetic drafts and invokes normal067/193 commands',()=>{const drafts=monthly194CapacityDrafts();assert.equal(drafts.length,601);for(const key of['legajo','dni','cuil'])assert.equal(new Set(drafts.map(d=>d[key])).size,601);assert.equal(drafts[600].startDate,'2026-10-16');assert.ok(drafts.slice(0,600).every(d=>d.startDate==='2026-01-01'));const sql=monthly194CapacitySql({schema:'mc_qa_fixed_092_'+'0'.repeat(32),maker:{membershipId:'maker'},checker:{membershipId:'checker'}});for(const name of['native_employee_create_v1','own_monthly_days_bootstrap_v1','own_monthly_days_command_v1','own_monthly_days_capture_v1','MONTHLY194_CAPACITY_LAST_ROW_NOT_REJECTED','legacyCounterparts','adoptionApplications'])assert.ok(sql.includes(name),name);assert.equal(/INSERT INTO public\.(employment_contract|native_employee_registration|own_monthly_days_event)/.test(sql),false);});
test('circuit adapter maps only whole canonical public facade signatures',()=>{const schema='mc_qa_fixed_092_'+'0'.repeat(32),id='10000000-0000-4000-8000-000000000001';for(const[name,types,values]of[['own_close_group_v1',['jsonb','uuid'],['{}',id]],['own_liquidation_detail_v1',['jsonb','uuid'],['{}',id]],['own_receipt_preview_v1',['jsonb','jsonb'],['{}','{}']]])assert.match(monthly194QaRpc('SELECT public.'+name+'('+types.map((t,n)=>'$'+(n+1)+'::'+t).join(',')+') AS result',values,schema),new RegExp(schema+'\\.'+name));assert.throws(()=>monthly194QaRpc('SELECT public.own_receipt_snapshot_v1($1::jsonb) AS result',['{}'],schema));});
test('receipt supplement preserves three modern bodies and grants only synthetic roles',()=>{const schema='mc_qa_fixed_092_'+'0'.repeat(32),names=['own_receipt_params_v1','own_receipt_snapshot_v1','own_receipt_self_v1','own_liquidation_bootstrap_v1','own_liquidation_detail_v1','own_liquidation_attempt_v1','own_liquidation_command_v1','own_close_detail_v1','own_close_attempt_v1','own_close_group_v1','own_close_command_v1'],foundationSeed=names.map(n=>'CREATE FUNCTION '+schema+'.'+n+'() RETURNS jsonb LANGUAGE sql AS $$ SELECT \'{}\'::jsonb $$').join(';\n'),options={schema,foundationSeed,read:p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),normalized:s=>s.replaceAll('public.',schema+'.'),actors:{maker:{membershipId:'10000000-0000-4000-8000-000000000001',actorEmail:'maker@example.invalid'},checker:{membershipId:'10000000-0000-4000-8000-000000000002',actorEmail:'checker@example.invalid'}}},fixture=buildMonthlyDayCircuitFixture(options);assert.equal(fixture.existingFunctionsReplaced,0);assert.equal(fixture.productRoleAssignments,0);assert.equal(fixture.newReceiptDefinitions.length,11);assert.equal(fixture.preservedDefinitions.length,3);assert.equal(fixture.capabilities.checker.includes('payroll.calculation.prepare'),false);assert.throws(()=>buildMonthlyDayCircuitFixture({...options,foundationSeed:foundationSeed+';CREATE FUNCTION '+schema+'.own_receipt_unexpected_v1() RETURNS jsonb LANGUAGE sql AS $$ SELECT \'{}\'::jsonb $$'}));});
test('full-circuit continuation refuses execution outside admitted CI custody',async()=>{await assert.rejects(()=>verifyMonthlyDayEngineCircuit({synthetic:false,transport:'ci'}),/Only the guarded synthetic194 runner/);await assert.rejects(()=>verifyMonthlyDayEngineCircuit({synthetic:true,transport:'local'}),/SQL execution belongs/);});
test('real run handler permits a read-only checker bootstrap and blocks POST before body/DB access',async()=>{const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0'),principal={user:{email:'checker@example.invalid'},tenant:{source:'membership',id:id(1),membershipId:id(2),effectiveCapabilities:RUN_READ}},session={email:principal.user.email,id:id(3),version:1,releaseSha:'a'.repeat(40)},data={version:'own-payroll-bootstrap.v1',scopeVersion:'b'.repeat(64),programVersion:'c'.repeat(64),canCalculate:false,runs:[],complete:true};let queries=0,bodyReads=0;const handler=createOwnRunHandler({env:{INTERNAL_APP_ORIGIN:'https://qa194.example.invalid'},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>({query:async()=>{queries++;return[{result:data}];}})}),response=()=>({setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}});const res=response();await handler({method:'GET',url:'/api/internal-own-payroll-run?resource=bootstrap',query:{resource:'bootstrap'},headers:{}},res);assert.equal(res.statusCode,200);assert.equal(res.value.data.canCalculate,false);assert.equal(queries,1);const post={method:'POST',url:'/api/internal-own-payroll-run',query:{},headers:{origin:'https://qa194.example.invalid','content-type':'application/json','idempotency-key':id(4)}};Object.defineProperty(post,'body',{get(){bodyReads++;throw Error('POST must stop before reading the body');}});const denied=response();await handler(post,denied);assert.equal(denied.statusCode,403);assert.equal(bodyReads,0);assert.equal(queries,1);});


// Causal no-row result-mode regression. No SQL statement or runner is executed.
import {monthlyDayQaNativeResult as native194GuardResult} from '../scripts/verify-own-monthly-day-policy.mjs';
test('194 readonly beforeCheck selects command result handling and preserves the expected installation-phase rejection',()=>{
 const source=fs.readFileSync(new URL('../scripts/verify-own-monthly-day-engine-source.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("run(tx([qa.normalized(qa.batch.beforeCheck)],{readOnly:true}))"),'The pin-only DO guard must run in the original readonly transaction without requiring a JSON output row');
 assert.equal(source.includes("json([qa.normalized(qa.batch.beforeCheck)],{readOnly:true})"),false);
 assert.ok(source.includes("expect(qa.local.installation,'MONTHLY194_PHASE_CHANGED')"),'The expected wrong-phase negative must stay intact');
 assert.ok(source.includes('run(tx(qa.local.rollback))'));assert.ok(source.includes('run(tx(qa.local.installation))'));assert.ok(source.includes('assert.deepEqual(outer(),installedBaseline)'));
});
test('194 readonly beforeCheck native parser accepts no-row command success but never relaxes JSON or failure contracts',()=>{
 const empty={status:0,signal:null,error:null,stdout:'',stderr:''};
 assert.deepEqual(native194GuardResult(empty),{status:0});assert.throws(()=>native194GuardResult(empty,{json:true}),/MONTHLY192_SINGLE_JSON_ROW_REQUIRED/);
 const valid={...empty,stdout:'{"verified":true}\n'};assert.deepEqual(native194GuardResult(valid,{json:true}),{verified:true});
 for(const failed of [{...empty,status:1,stderr:'guard failed'},{...empty,status:3,stderr:'MONTHLY194_PHASE_CHANGED'},{...empty,signal:'SIGTERM'},{...empty,error:Error('synthetic client failure')}])assert.throws(()=>native194GuardResult(failed));
 assert.deepEqual(native194GuardResult({...empty,status:3,stderr:'ERROR: MONTHLY194_PHASE_CHANGED'},{expectedCode:'MONTHLY194_PHASE_CHANGED'}),{rejected:true,code:'MONTHLY194_PHASE_CHANGED',status:3});
 assert.throws(()=>native194GuardResult({...empty,status:0},{expectedCode:'MONTHLY194_PHASE_CHANGED'}));assert.throws(()=>native194GuardResult({...empty,status:3,stderr:'a different guard'},{expectedCode:'MONTHLY194_PHASE_CHANGED'}));
});

// Source-composition regression for the native034 SOD failure. These tests
// construct SQL text only; the four native CI cells still prove actual SOD.
import {splitPostgresStatements as monthly194SodStatements} from '../scripts/lib/sql-statements.mjs';
// A bounded projection of the actual fixture's top-level parameter grants.
// It does not evaluate SQL, function bodies, session claims or authorization.
function monthly194ParameterAuthority(qa,circuit){
 const schema=qa.schema,strip=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim(),prefix='(?:'+schema+'\\.)?';
 const source=[qa.qa192.qa.seed,qa.qa192.legacyCompatibilitySeed,...qa.qa192.qa.predecessorInstallation,...qa.qa192.qa.local.installation,qa.qa192.runtimeGrantSeed,qa.qa192.capabilitySeed,qa.fixtureCapabilitySeed,...circuit.statements];
 const statements=source.flatMap(s=>monthly194SodStatements(s).map(strip));
 const roles=new Map(),grants=new Map();
 for(const s of statements){
  if(new RegExp('^INSERT INTO '+prefix+'tenant_membership\\(').test(s)){
   const row=/ VALUES\('([a-f0-9-]{36})','[a-f0-9-]{36}','[^']+','([^']+)','active',/.exec(s);assert.ok(row,'Bounded active membership declaration required');assert.equal(roles.has(row[1]),false);roles.set(row[1],row[2]);
  }
 }
 assert.notEqual(roles.get(qa.actor.membershipId),roles.get(qa.checker.membershipId));
 const add=(role,caps)=>{assert.equal(typeof role,'string');const set=grants.get(role)??new Set();for(const cap of caps)if(cap.startsWith('payroll.parameter.'))set.add(cap);grants.set(role,set);};
 for(const s of statements){
  assert.equal(new RegExp('^(?:INSERT INTO|UPDATE|DELETE FROM) '+prefix+'tenant_membership_capability_override\\b').test(s),false,'Unexpected override: this projection must not silently ignore it');
  assert.equal(new RegExp('^(?:UPDATE|DELETE FROM) '+prefix+'iam_role_capability\\b').test(s),false,'Unexpected grant mutation');
  if(!new RegExp('^INSERT INTO '+prefix+'iam_role_capability\\b').test(s)||!s.includes('payroll.parameter.'))continue;
  const direct=/ VALUES\('([^']+)','(payroll\.parameter\.[^']+)'\)$/.exec(s);if(direct){add(direct[1],[direct[2]]);continue;}
  const member=/ WHERE (?:member\.)?id='([a-f0-9-]{36})'(?:::uuid)?(?: ON CONFLICT| AND NOT EXISTS|$)/.exec(s);assert.ok(member,'Explicit target membership required');
  const knownSelect=new RegExp(' SELECT (?:role_key,(?:capability_key|c\\.capability_key)|member\\.role_key,c\\.key) FROM '+prefix+'tenant_membership(?: member)? CROSS JOIN').test(s);
  let caps;if(knownSelect){const values=/ CROSS JOIN\(VALUES([\s\S]*?)\) c\((?:capability_key|key)\) WHERE /.exec(s);assert.ok(values,'Bounded one-column capability VALUES required');assert.match(values[1],/^\('[a-z0-9_.]+'\)(?:,\('[a-z0-9_.]+'\))*$/);caps=[...values[1].matchAll(/\('([^']+)'\)/g)].map(m=>m[1]);}
  else{const literal=new RegExp(" SELECT role_key,'(payroll\\.parameter\\.[^']+)' FROM "+prefix+'tenant_membership WHERE ').exec(s);assert.ok(literal,'Unknown parameter grant shape');caps=[literal[1]];}
  add(roles.get(member[1]),caps);
 }
 const effective=actor=>[...(grants.get(roles.get(actor.membershipId))??[])].sort();
 return{maker:effective(qa.actor),checker:effective(qa.checker),conflict:statements.some(s=>new RegExp('^INSERT INTO '+prefix+'iam_capability_conflict\\b').test(s)&&s.includes("('payroll.parameter.approve','payroll.parameter.prepare'"))};
}
for(const operationalPairBaseline of ['pre107','published107'])test('194 composed fixture keeps parameter SOD for '+operationalPairBaseline,()=>{
 const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),schema='mc_qa_fixed_092_'+'d'.repeat(32);
 const qa=buildMonthly194Qa({major:18,sourceCommit:'a'.repeat(40),schema,read,operationalPairBaseline});
 assert.equal(qa.connects,false);assert.equal(qa.executesSql,false);assert.equal(qa.operationalPairBaseline,operationalPairBaseline);
 assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);assert.notEqual(qa.actor.actorEmail,qa.checker.actorEmail);
 const circuit=buildMonthlyDayCircuitFixture({read,normalized:qa.normalized,schema,foundationSeed:qa.qa192.qa.seed,actors:{maker:qa.actor,checker:qa.checker}}),authority=monthly194ParameterAuthority(qa,circuit);
 assert.equal(authority.conflict,true,'The actual canonical parameter conflict must remain installed');
 for(const kind of ['maker','checker'])assert.equal(authority[kind].includes('payroll.parameter.prepare')&&authority[kind].includes('payroll.parameter.approve'),false,'MONTHLY194_FIXTURE_EFFECTIVE_SOD_CONFLICT:'+kind);
 assert.deepEqual(authority.maker,['payroll.parameter.prepare','payroll.parameter.read']);
 assert.deepEqual(authority.checker,['payroll.parameter.approve','payroll.parameter.read']);
 // This additional source guard preserves native SOD checks for both actors;
 // it is not used to substitute the real SQL guard with this projection.
 assert.doesNotMatch(qa.fixtureCapabilitySeed,/\b(?:INSERT|UPDATE|DELETE|GRANT|REVOKE|CREATE|ALTER|DROP|TRUNCATE)\b/i,'MONTHLY194_FIXTURE_MUST_NOT_WRITE_AUTHORITY');
 const supplement=monthly194SodStatements(qa.fixtureCapabilitySeed);assert.equal(supplement.length,1);
 const calls=[...supplement[0].matchAll(new RegExp('PERFORM '+schema+'\\.tenant_iam_assert_no_sod_conflict\\(\'([a-f0-9-]{36})\'::uuid\\)','g'))].map(m=>m[1]);
 assert.deepEqual(calls,[qa.actor.membershipId,qa.checker.membershipId],'Both independent actors must pass the existing SOD guard before scenarios');
 assert.match(supplement[0],/^DO \$monthly194_fixture_sod\$ BEGIN /);assert.match(supplement[0],/END \$monthly194_fixture_sod\$$/);
});
