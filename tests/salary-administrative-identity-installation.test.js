import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildSalaryAdministrativeIdentityInstallation,SALARY_ADMINISTRATIVE_CONTEXT} from '../scripts/lib/salary-administrative-identity-installation.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const build=()=>buildSalaryAdministrativeIdentityInstallation({read,sourceCommit:'c'.repeat(40)});
test('technical batch preserves every existing object except eight parameter function bodies',()=>{
 const b=build();assert.equal(b.originals.length,8);assert.equal(b.afterPins.length,9);
 assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.ok(b.mutations.every(s=>/^CREATE(?: OR REPLACE)? FUNCTION public\./.test(s)||s==='REVOKE ALL ON FUNCTION public.native_salary_administrative_context_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app'));
 assert.match(b.before,/to_jsonb\(p\)-'prosrc'/);assert.match(b.before,/native_salary_administrative_context_v1/);
 assert.match(b.before,/defaultAcl/);assert.match(b.before,/roles/);assert.match(b.conservation,/IS DISTINCT FROM/);
 assert.equal(b.afterPins.filter(p=>p.runtime).length,6);assert.equal(b.helperPin.runtime,false);
 assert.ok(!b.beforePins.some(p=>p.name==='native_salary_context_v1'));
});
test('exact precision and original request recovery ordering are retained',()=>{
 const b=build();for(const name of ['native_salary_command_v1','own_program_command_v1']){
  const s=b.changed.find(s=>s.includes('FUNCTION public.'+name+'('));
  const original=b.originals.find(s=>s.includes('FUNCTION public.'+name+'('));
  assert.equal(s.indexOf('_attempt_v1(p,key)')<s.indexOf("parameterActorVerified"),original.indexOf('_attempt_v1(p,key)')<original.indexOf("ctx->>'actorPersonId' IS NULL"));
  assert.match(s,/prior\.request_sha256<>fingerprint/);
 }
 const s=b.changed.find(s=>s.includes('FUNCTION public.own_program_command_v1('));assert.match(s,/OWN_PROGRAM_PRECISION_REQUIRED/);
 assert.doesNotMatch(b.changed.join('\n'),/CREATE OR REPLACE FUNCTION public\.(?:native_employment|own_run|payroll_novelty)/);
});
test('existing authenticated context and enabled scoped association are required',()=>{
 assert.match(SALARY_ADMINISTRATIVE_CONTEXT,/native_employment_change_context_v1\(p\)/);
 assert.equal(SALARY_ADMINISTRATIVE_CONTEXT.split('l.revoked_at IS NULL').length,3);
 assert.equal(SALARY_ADMINISTRATIVE_CONTEXT.split('INTO STRICT').length,3);
 assert.match(SALARY_ADMINISTRATIVE_CONTEXT,/source_database=ctx->>'sourceDatabase'/);
 assert.match(SALARY_ADMINISTRATIVE_CONTEXT,/n.id::text=c.source_payload/);
 assert.doesNotMatch(SALARY_ADMINISTRATIVE_CONTEXT,/p->>'actorPersonId'|jsonb_build_object\('employmentContractId'/);
});
test('source drift fails generation rather than silently rebuilding another installation',()=>{
 assert.throws(()=>buildSalaryAdministrativeIdentityInstallation({read:f=>read(f)+'\n-- drift',sourceCommit:'c'.repeat(40)}));
 assert.throws(()=>buildSalaryAdministrativeIdentityInstallation({read,sourceCommit:'not-a-commit'}));
});
