// Proposed filesystem/source contracts only. No installer, parser or SQL import.
// These do not prove identity resolution or PL/pgSQL execution; native cases
// must later use the actual audited MUNICONTROL link and independent reviewers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
const parent=()=>read('scripts/migrations/147-own-payroll-accounting-mappings.sql');
const candidate=()=>read('scripts/migrations/204-own-accounting-administrative-actor.sql');
const names=['own_accounting_summary_v1','own_accounting_bootstrap_v1','own_accounting_detail_v1','own_accounting_attempt_v1','own_accounting_command_v1'];
const oldCall='ctx:=public.native_salary_context_v1(p);',newCall='ctx:=public.native_salary_administrative_context_v1(p);';
const beforePositive="ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL";
const afterPositive="ctx->>'actorPersonId' IS NOT NULL AND (ctx->>'employmentContractId' IS NOT NULL OR ctx->'parameterActorVerified' IS NOT DISTINCT FROM 'true'::jsonb)";
const beforeNegative="ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL";
const afterNegative="ctx->>'actorPersonId' IS NULL OR (ctx->>'employmentContractId' IS NULL AND ctx->'parameterActorVerified' IS DISTINCT FROM 'true'::jsonb)";
function definition(source,name,replace=false){
 const marker=(replace?'CREATE OR REPLACE FUNCTION public.':'CREATE FUNCTION public.')+name+'(',a=source.indexOf(marker);
 assert.ok(a>=0,'missing exact source definition '+name);assert.equal(source.indexOf(marker,a+marker.length),-1,'duplicate definition '+name);
 const b=source.indexOf('AS $$',a)+5,e=source.indexOf('$$;',b);assert.ok(b>a&&e>b);return source.slice(a,e+3);
}
test('all five administrative accounting successors reconstruct the complete147 definitions exactly',()=>{
 const old=parent(),next=candidate();assert.equal(hash(old),'7ad5a7e143a2e03437b5e3077581c32220a730bc3f72f2a6711fb2bc70ab2360');
 for(const name of names){
  const before=definition(old,name),after=definition(next,name,true);
  assert.equal(after.split(newCall).length-1,name==='own_accounting_summary_v1'?0:1,'administrative context '+name);
  assert.equal(after.split(afterPositive).length-1,name==='own_accounting_bootstrap_v1'?2:name==='own_accounting_summary_v1'?1:0,'positive readiness '+name);
  assert.equal(after.split(afterNegative).length-1,name==='own_accounting_command_v1'?1:0,'writer readiness '+name);
  const reconstructed=after.replace('CREATE OR REPLACE FUNCTION ','CREATE FUNCTION ').replace(newCall,oldCall).replaceAll(afterPositive,beforePositive).replace(afterNegative,beforeNegative);
  assert.equal(reconstructed,before,'whole original writer/reader/summary '+name);
 }
});
test('the pre-existing audit-person resolver remains exact and has an independent native MUNICONTROL link path',()=>{
 const source=read('scripts/lib/salary-administrative-identity-installation.mjs'),marker='export const SALARY_ADMINISTRATIVE_CONTEXT=`',a=source.indexOf(marker)+marker.length,b=source.indexOf('`;\n',a);assert.ok(a>=marker.length&&b>a);
 const helper=source.slice(a,b),body=helper.slice(helper.indexOf('AS $$')+5,helper.lastIndexOf('$$'));
 assert.equal(hash(body),'346e45cc443193a34b8f000d988cd8e5b4356ec961173a82df91350fd0159451');
 for(const atom of["ctx:=public.native_employment_change_context_v1(p)","'payroll.parameter.read'","c.source_system='MUNICONTROL'","n.id::text=c.source_payload#>>'{native,registrationId}'","l.membership_id=(ctx->>'membershipId')::uuid","l.tenant_id=(ctx->>'tenantId')::uuid","l.source_binding_id=(ctx->>'sourceBindingId')::uuid","'parameterActorVerified',person_value IS NOT NULL"] )assert.ok(helper.includes(atom),atom);
 assert.equal(helper.split('l.active AND l.revoked_at IS NULL').length-1,2);
 assert.doesNotMatch(helper,/p->>'actorPersonId'|jsonb_build_object\('employmentContractId'|\b(?:UPDATE|INSERT|DELETE)\b/);
});
test('204 preserves exact authority/OIDs/ACL and employed contexts while rejecting coerced administrative markers by source',()=>{
 const source=candidate();assert.equal((source.match(/CREATE OR REPLACE FUNCTION public\./g)??[]).length,5);
 assert.doesNotMatch(source,/\bCREATE FUNCTION\b|\b(?:GRANT|REVOKE|ALTER TABLE|INSERT INTO public\.tenant_action_employment_link)\b/);
 assert.ok(source.includes(afterPositive));assert.ok(source.includes(afterNegative));assert.ok(source.includes("RAISE EXCEPTION 'ACCOUNTING_EMPLOYMENT_REQUIRED'"));
 assert.ok(source.includes("'ACCOUNTING_INDEPENDENT_REQUIRED'"));assert.ok(source.includes("'ACCOUNTING_IDEMPOTENCY_REUSE'"));
 const arrays=source.split("jsonb_array_elements('").slice(1).map(part=>JSON.parse(part.slice(0,part.indexOf("'::jsonb)")).replaceAll("''","'")));
 assert.equal(arrays.length,2);for(const pins of arrays){assert.equal(pins.length,16);assert.equal(pins.find(p=>p.name==='native_salary_administrative_context_v1').result,'jsonb','helper has a literal return type, never a multiline declaration');assert.equal(pins.find(p=>p.name==='native_salary_administrative_context_v1').runtime,false);assert.equal(pins.filter(p=>p.runtime).length,4);}
 assert.ok(source.includes("SELECT * INTO actual FROM pg_proc WHERE oid=(prior->>'oid')::oid"));
 assert.ok(source.includes("(to_jsonb(actual)-'prosrc') IS DISTINCT FROM(prior-'prosrc')"));assert.ok(source.includes('to_jsonb(actual) IS DISTINCT FROM prior'));
 // Strict JSONtrue is a declared SQL contract, not a JS predicate replica.
 // The employed OR fallback is retained by the whole-body projection above.
 assert.doesNotMatch(source,/parameterActorVerified'\)::boolean|coalesce\(\(ctx->>'parameterActorVerified'/);
});

test('204 pins every default expression including the exact NULL jsonb baseline in both epochs',()=>{
 const sql=candidate(),guard="coalesce(pg_get_expr(actual.proargdefaults,0),'') IS DISTINCT FROM expected->>'defaultExpressions'";
 assert.equal(sql.split(guard).length-1,2,'both metadata epochs must reject an expression drift with the same default count');
 const arrays=sql.split("jsonb_array_elements('").slice(1).map(part=>JSON.parse(part.slice(0,part.indexOf("'::jsonb)")).replaceAll("''","'")));
 for(const pins of arrays){
  assert.equal(pins.length,16);
  for(const pin of pins)assert.equal(pin.defaultExpressions,pin.name==='own_accounting_definition_v1'?'NULL::jsonb':'',pin.name);
  assert.equal(pins.filter(p=>p.defaults>0).length,1);
 }
 assert.match(parent(),/own_accounting_definition_v1\(d jsonb,sources jsonb,baseline jsonb DEFAULT NULL\)/);
});
