// Proposed FS contracts only. No SQL parser, installer or application imports.
// Native authority/IAM/MFA/SoD and mutations must be verified separately later.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const hash=v=>createHash('sha256').update(v).digest('hex');
const original=()=>read('scripts/migrations/148-own-payroll-imputation.sql');
const successor=()=>read('scripts/migrations/205-own-imputation-preparation-authorization.sql');
const names=['own_imputation_bootstrap_v1','own_imputation_source_v1','own_imputation_detail_v1','own_imputation_attempt_v1','own_imputation_command_v1'];
const before='ctx:=public.own_close_context_v1(p,true);',after='ctx:=public.own_run_context_v1(p,true,false);';
function definition(source,name,replace=false){
 const marker=(replace?'CREATE OR REPLACE FUNCTION public.':'CREATE FUNCTION public.')+name+'(',a=source.indexOf(marker);assert.ok(a>=0,'missing definition '+name);assert.equal(source.indexOf(marker,a+marker.length),-1,'duplicate '+name);
 const b=source.indexOf('AS $$',a)+5,e=source.indexOf('$$;',b);assert.ok(b>a&&e>b);return{whole:source.slice(a,e+3),body:source.slice(b,e)};
}
const arrays=source=>source.split("jsonb_array_elements('").slice(1).map(p=>JSON.parse(p.slice(0,p.indexOf("'::jsonb)")).replaceAll("''","'")));
test('five complete148 definitions retain every byte except the documented154 context transition',()=>{
 const old=original(),next=successor(),known=arrays(read('scripts/migrations/154-accounting-preparation-access.sql'));
 assert.equal(hash(old),'aff78937747b45cdcf36b35a308f46c31fc6329e8c08f8f6fac83f96b3753bf9');assert.equal(known.length,3);assert.deepEqual(known[0],known[1]);assert.deepEqual(known[0],known[2]);assert.equal(known[0].length,15);
 for(const name of names){
  const a=definition(old,name),b=definition(next,name,true);assert.equal(a.whole.split(before).length-1,1);assert.equal(b.whole.split(after).length-1,1);assert.equal(b.whole.split(before).length-1,0);
  assert.equal(b.whole.replace('CREATE OR REPLACE FUNCTION ','CREATE FUNCTION ').replace(after,before),a.whole,'entire body/header preserved '+name);
  const row=known[0].find(v=>v[0].startsWith('public.'+name+'('));assert.ok(row,name);assert.equal(hash(a.body),row[1]);assert.equal(hash(b.body),row[2],'known after hash154 '+name);
 }
 assert.equal((next.match(/CREATE OR REPLACE FUNCTION public\./g)??[]).length,5);assert.doesNotMatch(next,/CREATE OR REPLACE FUNCTION public\.own_(journal|reconciliation)_/);
});
test('pre/post retain exact facade/helper metadata, ownership, ACL and OIDs without new grants or data',()=>{
 const s=successor(),[pre,post]=arrays(s);assert.equal(pre.length,16);assert.equal(post.length,16);
 assert.deepEqual(pre.map(p=>p.signature),post.map(p=>p.signature));
 for(let n=0;n<pre.length;n++){
  const a=pre[n],b=post[n];assert.deepEqual({...a,bodySha256:null,definitionSha256:null},{...b,bodySha256:null,definitionSha256:null});
  assert.equal(a.bodySha256===b.bodySha256,!names.includes(a.name),'only five bodies change '+a.name);
 }
 for(const pins of[pre,post]){
  assert.equal(pins.filter(p=>p.runtime).length,5);assert.equal(pins.find(p=>p.name==='native_salary_administrative_context_v1').result,'jsonb');assert.equal(pins.find(p=>p.name==='native_salary_administrative_context_v1').runtime,false);
  assert.deepEqual(pins.find(p=>p.name==='own_imputation_attempt_v1').config,['search_path=pg_catalog, public, pg_temp']);
  for(const name of names.filter(n=>n!=='own_imputation_attempt_v1'))assert.deepEqual(pins.find(p=>p.name===name).config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']);
 }
 assert.ok(s.includes("SELECT * INTO actual FROM pg_proc WHERE oid=(prior->>'oid')::oid"));assert.ok(s.includes("(to_jsonb(actual)-'prosrc') IS DISTINCT FROM(prior-'prosrc')"));assert.ok(s.includes('to_jsonb(actual) IS DISTINCT FROM prior'));
 assert.doesNotMatch(s,/\bCREATE FUNCTION\b|\b(?:GRANT|REVOKE|ALTER TABLE)\b/);assert.equal((s.match(/INSERT INTO public\.own_payroll_imputation_event\(/g)??[]).length,1);
});
test('normal nominal capabilities and current176 audit identity remain authoritative; calculation approval is not preparation',()=>{
 const s=successor(),run=read('scripts/migrations/176-own-payroll-administrative-operator.sql'),workspace=read('assets/own-payroll-imputation-workspace-model.js'),access=read('assets/own-payroll-run-workspace-model.js');
 assert.ok(workspace.includes('IMPUTATION_READ=Object.freeze([...OWN_RUN_NOMINAL])'));
 assert.ok(workspace.includes("propose:['payroll.parameter.prepare'],approve:['payroll.parameter.approve'],reject:['payroll.parameter.approve']"));
 assert.ok(access.includes("OWN_RUN_READ = Object.freeze(['workforce.employee.read','payroll.parameter.read','payroll.calculation.read'])"));
 assert.ok(access.includes("OWN_RUN_NOMINAL = Object.freeze([...OWN_RUN_READ,'payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export'])"));
 const context=definition(run,'own_run_context_v1',true);assert.equal(hash(context.body),'7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30');
 assert.ok(context.body.includes("WHEN nominal THEN ARRAY['payroll.calculation.read','payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export']"));
 assert.ok(context.body.includes('ctx:=public.native_salary_administrative_context_v1(p);'));assert.ok(context.body.includes("IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)"));
 const [pre]=arrays(s);assert.equal(pre.find(p=>p.name==='native_salary_administrative_context_v1').bodySha256,'346e45cc443193a34b8f000d988cd8e5b4356ec961173a82df91350fd0159451');
 const close=read('scripts/migrations/125-own-payroll-close.sql');assert.ok(close.includes("IF nominal AND NOT public.action_center_context_has_capability(ctx,'payroll.calculation.approve')"));
 const command=definition(s,'own_imputation_command_v1',true).whole,attempt=definition(s,'own_imputation_attempt_v1',true).whole;
 for(const token of["CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END",'fingerprint:=public.own_run_hash_v1(body_value);','prior.request_sha256<>fingerprint OR prior.body<>body_value',"'IMPUTATION_INDEPENDENT_REQUIRED'",'allocation_value IS DISTINCT FROM proposal.allocation'])assert.ok(command.includes(token),token);
 assert.ok(attempt.includes("e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid"));assert.ok(attempt.includes("CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END"));
});

test('known defaults values are pinned in both phases, not merely their count',()=>{
 const s=successor(),phases=arrays(s);assert.equal(phases.length,2);
 const sources={own_run_context_v1:read('scripts/migrations/176-own-payroll-administrative-operator.sql'),own_close_context_v1:read('scripts/migrations/125-own-payroll-close.sql')};
 for(const pins of phases)for(const pin of pins){
  const hasDefaults=Object.hasOwn(sources,pin.name),expected=hasDefaults?'false, false':'';
  assert.equal(pin.defaultExpressions,expected,pin.name+' exact known expression');
  assert.equal(pin.defaults,hasDefaults?2:0,pin.name+' known count retained');
  if(hasDefaults){
   const whole=definition(sources[pin.name],pin.name,pin.name==='own_run_context_v1').whole;
   const header=whole.slice(0,whole.indexOf('AS $$'));
   assert.equal((header.match(/ DEFAULT false/g)??[]).length,2);assert.equal((header.match(/ DEFAULT /g)??[]).length,2);
  }
 }
 const guard="coalesce(pg_get_expr(actual.proargdefaults,0),'') IS DISTINCT FROM expected->>'defaultExpressions'";
 assert.equal(s.split(guard).length-1,2,'preflight and postflight reject changed values even with count2');
 assert.equal(s.split("actual.pronargdefaults<>(expected->>'defaults')::integer").length-1,2);
 assert.ok(read('scripts/lib/native-leave-installation.mjs').includes("coalesce(pg_get_expr(p.proargdefaults,0),'')<>x->>'defaults'"));
});
