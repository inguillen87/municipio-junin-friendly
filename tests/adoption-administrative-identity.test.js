import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {ADOPTION_ADMINISTRATIVE_CONTEXT,buildAdoptionAdministrativeIdentityInstallation} from '../scripts/lib/adoption-administrative-identity-installation.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {adoptionPreparationError} from '../lib/internal-employment-adoption.js';
const options={sourceCommit:'a'.repeat(40),read:p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')};
test('adoption upgrade changes only the preparation, retry, writer, decision context and readiness bodies',()=>{
 const b=buildAdoptionAdministrativeIdentityInstallation(options);
 assert.deepEqual(b.afterPins.map(p=>p.name),['employment_adoption_bootstrap_v1','employment_adoption_attempt_v1','employment_adoption_context_v1','employment_adoption_propose_v1','municipal_adoption_ready_v1']);
 assert.equal(b.helperPin.runtime,false);assert.equal(b.helperPin.signature,'public.employment_adoption_administrative_context_v1(jsonb,text)');
 assert.ok(b.beforeCheck.includes(b.operative.afterPins.at(-1).sha256));
 b.beforePins.forEach((p,n)=>assert.deepEqual({...p,sha256:null},{...b.afterPins[n],sha256:null}));
 assert.doesNotMatch(b.mutations.join('\n'),/CREATE (?:OR REPLACE )?FUNCTION public\.(?:native_employee_context|native_employment_change_context|native_employment_lifecycle_|own_|payroll_)/);
 assert.doesNotMatch(b.mutations.join('\n'),/CREATE TABLE|GRANT |ALTER TABLE|UPDATE public\.tenant_|INSERT INTO public\.tenant_/);
});
test('audit identity never supplies an active employment identifier or changes an employment state',()=>{
 const s=ADOPTION_ADMINISTRATIVE_CONTEXT;
 assert.match(s,/native_employee_context_v1\(p\)/);assert.match(s,/l\.active AND l\.revoked_at IS NULL/);
 assert.match(s,/b\.source_database=ctx->>'sourceDatabase'/);assert.match(s,/b\.validation_state='published'/);
 assert.match(s,/i\.identity_state IN\('active','provisional'\)/);assert.match(s,/FOR SHARE OF l,c,b,i NOWAIT/);
 assert.match(s,/native_employee_read_projection_v1\(p,linked\)/);
 assert.doesNotMatch(s,/jsonb_build_object\([^;]*'employmentContractId'|\b(?:INSERT|UPDATE|DELETE|GRANT)\b|p->>'(?:actorPersonId|employmentContractId)'/);
});
test('scope, source, person uniqueness, invalid employment states and capability are explicit refusal boundaries',()=>{
 const s=ADOPTION_ADMINISTRATIVE_CONTEXT;
 for(const value of ['l.membership_id','l.tenant_id','l.source_binding_id','c.legacy_company_id','c.tenant_id=l.tenant_id','b.legacy_import_run_id IS NOT NULL','INTO STRICT','TOO_MANY_ROWS','EMPLOYMENT_ADOPTION_IDENTITY_CHANGED'])assert.ok(s.includes(value));
 assert.match(s,/required_capability NOT IN\('employee.record.propose','employee.record.approve'\)/);
 assert.match(s,/c\.status IN\('active','inactive'\)/);assert.match(s,/EMPLOYMENT_ADOPTION_ACTOR_REQUIRED/);
});
test('old request validation, body, key, hashes and source checks remain byte-identical outside the authority calls',()=>{
 const b=buildAdoptionAdministrativeIdentityInstallation(options),old=b.originals[3],updated=b.changed[3];
 assert.equal(updated.replaceAll("public.employment_adoption_administrative_context_v1(p,'employee.record.propose')","public.native_employment_change_context_v1(p,'employee.record.propose')"),old);
 assert.ok(updated.includes('Revalidate authority at persistence'));
 const attempt=b.changed[1].replace('public.employment_adoption_administrative_context_v1(p)','public.native_employment_lifecycle_adopted_context_v2(p)');assert.equal(attempt,b.originals[1]);
 assert.ok(b.changed[2].includes("(p,'employee.record.approve')"));
});
test('readiness pins the helper and every changed function while preserving existing command guards',()=>{
 const b=buildAdoptionAdministrativeIdentityInstallation(options),ready=b.changed.at(-1);
 for(const p of b.afterPins.slice(0,-1))assert.ok(ready.includes(p.sha256),p.name);
 assert.ok(ready.includes(b.helperPin.sha256));
 for(const pair of b.commands.pairs){assert.ok(b.beforeCheck.includes(pair.afterPin.sha256));assert.ok(b.afterCheck.includes(pair.afterPin.sha256));assert.ok(!b.mutations.some(s=>s.includes('CREATE OR REPLACE FUNCTION public.'+pair.afterPin.name+'(')));}
 assert.match(b.apply,/'install'/);assert.match(b.audit,/PRIOR_STATE_CHANGED/);
});
test('administrative identity errors distinguish missing association, changed identity and installation readiness',()=>{
 assert.equal(adoptionPreparationError(new Error('EMPLOYMENT_ADOPTION_ACTOR_REQUIRED')).status,403);
 assert.equal(adoptionPreparationError(new Error('EMPLOYMENT_ADOPTION_IDENTITY_CHANGED')).status,403);
 assert.equal(adoptionPreparationError(new Error('ADOPTION_ADMINISTRATIVE_AFTER_METADATA')).status,503);
 assert.equal(adoptionPreparationError(new Error('EMPLOYMENT_ADOPTION_BUSY')).status,409);
});
test('source drift fails generation before an installation can be produced',()=>{
 assert.throws(()=>buildAdoptionAdministrativeIdentityInstallation({...options,read:p=>options.read(p).replace('ctx:=public.native_employee_context_v1(p);raw:=public.employment_adoption_source_v1(p);','ctx:=public.native_employee_context_v1(p); raw:=public.employment_adoption_source_v1(p);')}),/Unreviewed adoption migration/);
 assert.equal(ownInstallationFunctionPin(ADOPTION_ADMINISTRATIVE_CONTEXT).definer,true);
});
