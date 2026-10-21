// Proposed FS-only contracts: no SQL, application builders/imports or runtime writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const hash=v=>createHash('sha256').update(v).digest('hex');
const original=()=>read('scripts/migrations/152-own-payroll-journal.sql');
const successor=()=>read('scripts/migrations/207-own-journal-preparation-authorization.sql');
const changed=['own_journal_source_value_v1','own_journal_detail_v1','own_journal_bootstrap_v1','own_journal_attempt_v1','own_journal_command_v1'];
const runtime=['own_journal_source_v1','own_journal_detail_v1','own_journal_bootstrap_v1','own_journal_attempt_v1','own_journal_command_v1'];
const before='ctx:=public.own_close_context_v1(p,true);',after='ctx:=public.own_run_context_v1(p,true,false);';
function definition(source,name,replace=false){
 const marker=(replace?'CREATE OR REPLACE FUNCTION public.':'CREATE FUNCTION public.')+name+'(',a=source.indexOf(marker);
 assert.ok(a>=0,'missing '+name);assert.equal(source.indexOf(marker,a+marker.length),-1,'duplicate '+name);
 const b=source.indexOf('AS $$',a)+5,e=source.indexOf('$$;',b);assert.ok(b>a&&e>b);return{whole:source.slice(a,e+3),body:source.slice(b,e)};
}
const arrays=s=>s.split("jsonb_array_elements('").slice(1).map(p=>JSON.parse(p.slice(0,p.indexOf("'::jsonb)")).replaceAll("''","'")));

test('only five known154 journal definitions change; source_value stays private and public source is unchanged',()=>{
 const old=original(),s=successor(),known=arrays(read('scripts/migrations/154-accounting-preparation-access.sql'));
 assert.equal(hash(old),'1e79fda4c8b2636d040f0d8c639743095fa40e18c2a850e94ac3735672afa42d');assert.equal(known.length,3);assert.deepEqual(known[0],known[1]);assert.deepEqual(known[0],known[2]);assert.equal(known[0].length,15);
 for(const name of changed){
  const a=definition(old,name),b=definition(s,name,true),row=known[0].find(r=>r[0].startsWith('public.'+name+'('));
  assert.ok(row,name);assert.equal(a.whole.split(before).length-1,1);assert.equal(b.whole.split(after).length-1,1);
  assert.equal(b.whole.replace('CREATE OR REPLACE FUNCTION ','CREATE FUNCTION ').replace(after,before),a.whole,'whole parent '+name);
  assert.equal(hash(a.body),row[1]);assert.equal(hash(b.body),row[2],'known154 after '+name);
 }
 assert.equal((s.match(/CREATE OR REPLACE FUNCTION public\./g)??[]).length,5);
 assert.doesNotMatch(s,/CREATE OR REPLACE FUNCTION public\.own_(?:imputation|reconciliation)_/);
 assert.ok(!s.includes('CREATE OR REPLACE FUNCTION public.own_journal_source_v1('));
 const source=definition(old,'own_journal_source_v1'),[pre,post]=arrays(s);
 assert.ok(!source.body.includes(before));assert.ok(source.body.includes('own_journal_source_value_v1(p,basis_value,id_value)'));
 for(const phase of [pre,post]){
  assert.equal(phase.find(p=>p.name==='own_journal_source_value_v1').runtime,false);
  assert.equal(phase.find(p=>p.name==='own_journal_source_v1').runtime,true);
  assert.equal(phase.find(p=>p.name==='own_journal_source_v1').bodySha256,hash(source.body));
 }
});

test('nineteen exact pre/post pins retain OIDs, metadata and existing ACLs without grants or capacity changes',()=>{
 const s=successor(),[pre,post]=arrays(s);assert.equal(pre.length,19);assert.equal(post.length,19);
 assert.deepEqual(pre.map(p=>p.signature),post.map(p=>p.signature));
 for(let i=0;i<pre.length;i++){
  assert.deepEqual({...pre[i],bodySha256:null,definitionSha256:null},{...post[i],bodySha256:null,definitionSha256:null});
  assert.equal(pre[i].bodySha256===post[i].bodySha256,!changed.includes(pre[i].name));
 }
 for(const phase of [pre,post]){
  assert.deepEqual(phase.filter(p=>p.runtime&&p.name.startsWith('own_journal_')).map(p=>p.name).sort(),runtime.toSorted());
  assert.equal(phase.find(p=>p.name==='own_imputation_detail_v1').runtime,true);
  assert.equal(phase.find(p=>p.name==='own_imputation_detail_v1').bodySha256,'7de9e3f8adbbecfb1460182b8ba5cab9169b23e170deea35944ee6369b7b2dbd');
  assert.equal(phase.find(p=>p.name==='native_salary_administrative_context_v1').result,'jsonb');
  for(const name of ['own_journal_source_v1','own_journal_attempt_v1'])assert.deepEqual(phase.find(p=>p.name===name).config,['search_path=pg_catalog, public, pg_temp']);
  for(const name of changed.filter(n=>n!=='own_journal_attempt_v1'))assert.deepEqual(phase.find(p=>p.name===name).config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']);
 }
 assert.ok(s.includes("SELECT * INTO actual FROM pg_proc WHERE oid=(prior->>'oid')::oid"));
 assert.ok(s.includes("(to_jsonb(actual)-'prosrc') IS DISTINCT FROM(prior-'prosrc')"));
 assert.ok(s.includes('to_jsonb(actual) IS DISTINCT FROM prior'));
 assert.equal(s.split("proname LIKE 'own_journal_%')<>13").length-1,2);
 assert.doesNotMatch(s,/\bCREATE FUNCTION\b|\b(?:GRANT|REVOKE|ALTER TABLE)\b|_full_v1/);
 assert.equal((s.match(/INSERT INTO public\.own_payroll_journal_event\(/g)??[]).length,1);
 const body=definition(s,'own_journal_command_v1',true).whole;
 for(const token of ['octet_length(body_value::text)>8388608','+8192>16777216','>536870912','>268435456',">=1000 THEN RAISE EXCEPTION 'JOURNAL_LIMIT'"])assert.ok(body.includes(token),token);
});

test('known default values are checked before and after, not inferred from count',()=>{
 const s=successor(),phases=arrays(s);assert.equal(phases.length,2);
 const source={own_run_context_v1:read('scripts/migrations/176-own-payroll-administrative-operator.sql'),own_close_context_v1:read('scripts/migrations/125-own-payroll-close.sql')};
 for(const phase of phases)for(const pin of phase){
  const defaults=Object.hasOwn(source,pin.name);assert.equal(pin.defaults,defaults?2:0);assert.equal(pin.defaultExpressions,defaults?'false, false':'');
  if(defaults){const whole=definition(source[pin.name],pin.name,pin.name==='own_run_context_v1').whole,head=whole.slice(0,whole.indexOf('AS $$'));assert.equal((head.match(/ DEFAULT false/g)??[]).length,2);assert.equal((head.match(/ DEFAULT /g)??[]).length,2);}
 }
 assert.equal(s.split("coalesce(pg_get_expr(actual.proargdefaults,0),'') IS DISTINCT FROM expected->>'defaultExpressions'").length-1,2);
 assert.equal(s.split("actual.pronargdefaults<>(expected->>'defaults')::integer").length-1,2);
 assert.ok(read('scripts/lib/native-leave-installation.mjs').includes("coalesce(pg_get_expr(p.proargdefaults,0),'')<>x->>'defaults'"));
});

test('nominal administrative identity and journal operation authority remain exact; preparation adds no calculation approval',()=>{
 const s=successor(),model=read('assets/own-payroll-journal-model.js'),imputation=read('assets/own-payroll-imputation-workspace-model.js'),run=read('scripts/migrations/176-own-payroll-administrative-operator.sql');
 assert.ok(model.includes('JOURNAL_READ=IMPUTATION_READ'));
 assert.ok(model.includes("JOURNAL_CAPS=Object.freeze({propose:['payroll.parameter.prepare'],post:['payroll.parameter.approve'],reject:['payroll.parameter.approve']})"));
 assert.ok(imputation.includes('IMPUTATION_READ=Object.freeze([...OWN_RUN_NOMINAL])'));
 const ctx=definition(run,'own_run_context_v1',true);assert.equal(hash(ctx.body),'7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30');
 assert.ok(ctx.body.includes("WHEN nominal THEN ARRAY['payroll.calculation.read','payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export']"));
 assert.ok(ctx.body.includes('ctx:=public.native_salary_administrative_context_v1(p);'));
 assert.ok(ctx.body.includes("IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)"));
 const command=definition(s,'own_journal_command_v1',true).whole,attempt=definition(s,'own_journal_attempt_v1',true).whole,source=definition(s,'own_journal_source_value_v1',true).whole;
 for(const token of ["CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END",'fingerprint:=public.own_run_hash_v1(body_value);','prior.request_sha256<>fingerprint OR prior.body<>body_value',"public.own_journal_summary_v1(ctx,proposal)->>'canReview'","'JOURNAL_INDEPENDENT_REQUIRED'",'captured_journal IS DISTINCT FROM journal_value'])assert.ok(command.includes(token),token);
 assert.ok(attempt.includes("e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid"));
 assert.ok(attempt.includes("CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END"));
 assert.ok(source.includes('d:=public.own_imputation_detail_v1(p,id_value)'));
 assert.ok(source.includes("d#>>'{proposal,status}' IS DISTINCT FROM 'approved' OR d->'sourceCurrent' IS DISTINCT FROM 'true'::jsonb"));
 const [pre]=arrays(s);assert.equal(pre.find(p=>p.name==='native_salary_administrative_context_v1').bodySha256,'346e45cc443193a34b8f000d988cd8e5b4356ec961173a82df91350fd0159451');
 assert.ok(read('scripts/migrations/125-own-payroll-close.sql').includes("IF nominal AND NOT public.action_center_context_has_capability(ctx,'payroll.calculation.approve')"));
 const detail205=definition(read('scripts/migrations/205-own-imputation-preparation-authorization.sql'),'own_imputation_detail_v1',true);
 assert.equal(hash(detail205.body),pre.find(p=>p.name==='own_imputation_detail_v1').bodySha256);
});
