// Proposed source/FS contracts only. No SQL/parser/app-builder imports or writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const hash=v=>createHash('sha256').update(v).digest('hex');
const sql=()=>read('scripts/migrations/206-own-journal-full-capacity.sql');
const proof=()=>JSON.parse(read('tests/fixtures/own-journal-full-capacity-source-projection.json'));
function definition(s,n){const markers=['CREATE FUNCTION public.','CREATE OR REPLACE FUNCTION public.'].map(p=>p+n+'('),found=markers.map(m=>s.indexOf(m)).filter(n=>n>=0);assert.equal(found.length,1,n);const a=found[0],b=s.indexOf('AS $$',a)+5,e=s.indexOf('$$;',b);assert.ok(b>a&&e>b);return{whole:s.slice(a,e+3),head:s.slice(a,b),body:s.slice(b,e)};}
const arrays=s=>s.split("jsonb_array_elements('").slice(1).map(p=>JSON.parse(p.slice(0,p.indexOf("'::jsonb)")).replaceAll("''","'")));
const byName=(phase,n)=>{const p=phase.find(p=>p.name===n);assert.ok(p,n);return p;};

test('three shared cores reconstruct their complete207 parents; one original command writer and public source wrapper remain',()=>{
 const s=sql(),p=proof(),parent=read('scripts/migrations/207-own-journal-preparation-authorization.sql');
 assert.equal(hash(parent),'91da7466c0eb0d570a7c53e3b52420640d5d05a21e3d689240004989744e2db7');
 assert.equal(p.coreRebuilds.length,3);for(const r of p.coreRebuilds){const d=definition(s,r.coreName),old=definition(parent,r.legacyName);assert.equal(hash(d.whole),r.coreDefinitionSha256);assert.equal(hash(d.body),r.coreBodySha256);let body=d.body;for(const change of r.bodyTextDeltas.toReversed()){assert.equal(body.split(change.after).length-1,1);body=body.replace(change.after,change.before);}assert.equal(r.predecessorHeader+body+'$$;',old.whole,'entire207 source '+r.legacyName);}
 assert.equal((s.match(/INSERT INTO public\.own_payroll_journal_event\(/g)??[]).length,1);
 assert.ok(!s.includes('CREATE OR REPLACE FUNCTION public.own_journal_source_v1('));
 const [pre,post]=arrays(s);assert.equal(byName(pre,'own_journal_source_v1').bodySha256,byName(post,'own_journal_source_v1').bodySha256);
 for(const [name,args,core]of [['own_journal_source_value_v1','p,basis_value,id_value','source'],['own_journal_detail_v1','p,id_value','detail'],['own_journal_command_v1','p,body_value,key','command']])assert.ok(definition(s,name).body.includes('public.own_journal_'+core+'_capacity_core_v1('+args+',16777216)'));
});

test('full profile propagates through imputation, original detail, currentness and writer while historical reversal is retained',()=>{
 const s=sql(),source=definition(s,'own_journal_source_capacity_core_v1').body,detail=definition(s,'own_journal_detail_capacity_core_v1').body,command=definition(s,'own_journal_command_capacity_core_v1').body;
 for(const body of [source,detail,command]){assert.ok(body.includes('maximum_bytes IS NULL OR maximum_bytes NOT IN(16777216,33554432)'));assert.ok(body.includes('ctx:=public.own_run_context_v1(p,true,false);'));}
 assert.ok(source.includes('IF maximum_bytes=33554432 THEN d:=public.own_imputation_detail_full_v1(p,id_value);ELSE d:=public.own_imputation_detail_v1(p,id_value);END IF;'));
 assert.ok(source.includes("d:=public.own_journal_detail_capacity_core_v1(p,id_value,maximum_bytes);IF d->>'status' IS DISTINCT FROM 'posted' OR d->>'kind' IS DISTINCT FROM 'initial'"));
 const reversalBranch=source.slice(source.indexOf("ELSIF basis_value='journal'"),source.indexOf("ELSE RAISE EXCEPTION"));
 assert.ok(!reversalBranch.includes('sourceCurrent'),'historical posted original does not require a current imputation');
 for(const token of ["(p,'imputation',(e.body->>'sourceId')::uuid,maximum_bytes)","(p,'journal',e.original_id,maximum_bytes)"])assert.ok(detail.includes('public.own_journal_source_capacity_core_v1'+token));
 assert.equal(command.split("public.own_journal_source_capacity_core_v1(p,basis_value,(body_value->>'sourceId')::uuid,maximum_bytes)").length-1,2);
 for(const token of ["CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END",'fingerprint:=public.own_run_hash_v1(body_value);','prior.request_sha256<>fingerprint OR prior.body<>body_value',"RETURN public.own_journal_attempt_v1(p,key)","'JOURNAL_INDEPENDENT_REQUIRED'",'captured_journal IS DISTINCT FROM journal_value'])assert.ok(command.includes(token),token);
 for(const op of ['detail','command'])assert.ok(definition(s,'own_journal_'+op+'_full_v1').body.includes('public.own_journal_'+op+'_capacity_core_v1(')&&definition(s,'own_journal_'+op+'_full_v1').body.includes(',33554432)'));
 assert.ok(definition(s,'own_journal_source_full_v1').body.includes('public.own_journal_source_capacity_core_v1(p,basis_value,id_value,33554432)'));
});

test('forty-four known dependencies merge exactly and fifty post pins retain defaults, metadata, OIDs and private-core ACLs',()=>{
 const s=sql(),p=proof(),[pre,post]=arrays(s);
 assert.equal(pre.length,44);assert.equal(post.length,50);assert.equal(new Set(pre.map(p=>p.signature)).size,44);
 const imputation=read('scripts/migrations/203-own-imputation-full-capacity.sql');assert.equal(hash(imputation),'5f07dd3914ae43f3a895205d4a43b7281a85eb57ee9f24520f19177b921c2193');
 const imputationPost=arrays(imputation)[1];for(const row of imputationPost)assert.deepEqual(pre.find(p=>p.signature===row.signature),row);
 const journalPost=arrays(read('scripts/migrations/207-own-journal-preparation-authorization.sql'))[1];for(const row of journalPost.filter(p=>p.name!=='own_imputation_detail_v1'))assert.deepEqual(pre.find(p=>p.signature===row.signature),row);
 assert.equal(byName(pre,'own_imputation_detail_v1').bodySha256,'260e79a4ee556a993fdf46edbc6551327f96985dee646b41eca30becaaee608c');
 assert.equal(p.deduplicatedExactSignatures.length,3);
 for(const phase of [pre,post])for(const row of phase){const hasDefaults=['own_run_context_v1','own_close_context_v1'].includes(row.name);assert.equal(row.defaults,hasDefaults?2:0);assert.equal(row.defaultExpressions,hasDefaults?'false, false':'');}
 for(const n of ['source','detail','command']){assert.equal(byName(post,'own_journal_'+n+'_capacity_core_v1').runtime,false);assert.equal(byName(post,'own_journal_'+n+'_full_v1').runtime,true);assert.ok(s.includes('REVOKE ALL ON FUNCTION '+byName(post,'own_journal_'+n+'_capacity_core_v1').signature+' FROM PUBLIC,municontrol_actions_runtime_app;'));}
 assert.equal((s.match(/GRANT EXECUTE ON FUNCTION/g)??[]).length,3);assert.doesNotMatch(s,/GRANT EXECUTE ON FUNCTION public\.own_journal_\w+_capacity_core_v1/);
 assert.ok(s.includes('effective_function_defaults:=coalesce('));assert.ok(s.includes("a.grantee NOT IN(0,current_user::regrole,runtime_oid)"));assert.equal(s.split("coalesce(pg_get_expr(actual.proargdefaults,0),'') IS DISTINCT FROM expected->>'defaultExpressions'").length-1,2);
 assert.ok(s.includes("(to_jsonb(actual)-'prosrc') IS DISTINCT FROM(prior-'prosrc')"));assert.ok(s.includes('to_jsonb(actual) IS DISTINCT FROM prior'));
});

test('only two snapshot constraints grow; legacy aggregate and request8MiB remain, full prewrite and late read are bounded',()=>{
 const s=sql(),source=definition(s,'own_journal_source_capacity_core_v1').body,detail=definition(s,'own_journal_detail_capacity_core_v1').body,command=definition(s,'own_journal_command_capacity_core_v1').body;
 assert.equal((s.match(/DROP CONSTRAINT own_payroll_journal_event_/g)??[]).length,2);assert.equal((s.match(/ADD CONSTRAINT own_payroll_journal_event_/g)??[]).length,2);
 for(const col of ['source_snapshot','journal_snapshot'])for(const limit of [16777216,33554432])assert.ok(s.includes("((jsonb_typeof("+col+") = ANY (ARRAY[''object''::text, ''null''::text])) AND (octet_length(("+col+")::text) <= "+limit+"))"));
 assert.equal(s.split("((jsonb_typeof(body) = ''object''::text) AND (octet_length((body)::text) <= 8388608))").length-1,2);assert.ok(!s.includes('regexp_replace'));
 assert.ok(source.includes('octet_length(s::text)+19>maximum_bytes'));assert.ok(detail.includes('octet_length(e.body::text)+16384>maximum_bytes'));assert.ok(detail.includes('octet_length(d::text)+(CASE WHEN maximum_bytes=33554432 THEN 19 ELSE 0 END)>maximum_bytes'));
 assert.ok(command.includes('octet_length(body_value::text)>8388608'));assert.ok(command.includes('(CASE WHEN maximum_bytes=33554432 THEN 16384 ELSE 8192 END)>maximum_bytes'));
 assert.ok(command.includes('+added>536870912'));assert.ok(command.includes('+added>268435456'));assert.ok(command.includes(">=1000 THEN RAISE EXCEPTION 'JOURNAL_LIMIT'"));
 const insert=command.indexOf('INSERT INTO public.own_payroll_journal_event('),late=command.indexOf("IF maximum_bytes=33554432 AND cmd='propose' THEN"),readDetail=command.indexOf('detail_value:=public.own_journal_detail_capacity_core_v1(p,pid,maximum_bytes)');
 assert.ok(insert>0&&late>insert&&readDetail>late&&command.indexOf(' RETURN receipt_value;')>readDetail);assert.ok(!command.includes('EXCEPTION WHEN'));
 assert.ok(detail.includes("IF SQLERRM NOT IN('JOURNAL_SOURCE_CHANGED','JOURNAL_DECIDED') THEN RAISE;END IF;END;"),'capacity errors are not swallowed');
 for(const token of ['columns_before IS DISTINCT FROM','constraints_before IS DISTINCT FROM','indexes_before IS DISTINCT FROM','triggers_before IS DISTINCT FROM'])assert.ok(s.includes(token),token);
});
