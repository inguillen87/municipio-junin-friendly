// Synthetic catalogue and actual effective-capability SQL in an isolated schema.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {splitPostgresStatements} from './sql-statements.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {readProfilePolicy} from './own-payroll-profile-capabilities.mjs';
const read=f=>fs.readFileSync(new URL('../../'+f,import.meta.url),'utf8');
export function profileQaCatalogue(qa){
 const p=readProfilePolicy(read),effective=splitPostgresStatements(read('scripts/migrations/006-tenant-action-authority.sql')).find(s=>s.includes('CREATE OR REPLACE FUNCTION tenant_iam_effective_capabilities('));assert.ok(effective);
 const sql=`ALTER TABLE iam_role ADD COLUMN label text,ADD COLUMN description text,ADD COLUMN system_managed boolean,ADD COLUMN created_at timestamptz DEFAULT now();
 ALTER TABLE iam_capability ADD COLUMN created_at timestamptz DEFAULT now();
 CREATE TABLE tenant_membership_capability_override(membership_id uuid REFERENCES tenant_membership(id),capability_key text REFERENCES iam_capability(capability_key),allow_override boolean NOT NULL DEFAULT false,deny_override boolean NOT NULL DEFAULT false,PRIMARY KEY(membership_id,capability_key),CHECK(NOT(allow_override AND deny_override)));
 ${p.roles.map(r=>`INSERT INTO iam_role(role_key,label,description,scope_kind,system_managed) VALUES(${[r.role_key,r.label,r.description,r.scope_kind].map(q).join(',')},true);`).join('\n')}
 INSERT INTO iam_capability(capability_key,label,description,scope_kind,sensitivity) SELECT c,'Permiso sintético de catálogo','Sólo QA','tenant','standard' FROM unnest(ARRAY[${[...new Set(p.roles.flatMap(r=>r.capabilities))].map(q).join(',')}]) c ON CONFLICT DO NOTHING;
 ${p.capabilities.map(c=>`INSERT INTO iam_capability(capability_key,label,description,scope_kind,sensitivity) VALUES(${[c.capability_key,c.label,c.description,c.scope_kind,c.sensitivity].map(q).join(',')}) ON CONFLICT(capability_key) DO UPDATE SET label=excluded.label,description=excluded.description,scope_kind=excluded.scope_kind,sensitivity=excluded.sensitivity;`).join('\n')}
 ${p.roles.map(r=>`INSERT INTO iam_role_capability(role_key,capability_key) SELECT ${q(r.role_key)},c FROM unnest(ARRAY[${r.capabilities.map(q).join(',')}]) c;`).join('\n')}
 DROP FUNCTION tenant_iam_effective_capabilities(uuid);
 ${effective.replace('RETURNS TABLE (capability_key varchar(96))','RETURNS TABLE (capability_key text)').replace('SET search_path = public, pg_temp',`SET search_path=pg_catalog,${qa.schema},pg_temp`)};
 REVOKE ALL ON FUNCTION tenant_iam_effective_capabilities(uuid) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION tenant_iam_effective_capabilities(uuid) TO municontrol_actions_runtime_app;`;
 return{policy:p,sql};
}
export function relocateProfileBatch(statement,qa){
 return qa.normalized(statement).replaceAll("s.nspname='public'","s.nspname="+q(qa.schema));
}
export async function profileQaTransaction(db,executable,statement){
 assert.ok(db.prefix.includes('BEGIN ISOLATION LEVEL READ COMMITTED')&&db.prefix.includes("current_database()<>'own_payroll_run_qa'")&&db.prefix.includes("current_setting('neon.project_id',true)"));
 const sql=db.prefix.replace('BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN ISOLATION LEVEL REPEATABLE READ')+'\n'+statement+';COMMIT;';
 const result=await new Promise((resolve,reject)=>{const child=execFile(executable,[...db.args,'-f','-'],{windowsHide:true,maxBuffer:6*1024*1024,timeout:60000,env:{...process.env,PGCLIENTENCODING:'UTF8'}},(error,stdout,stderr)=>error?reject(Error(stderr,{cause:error})):resolve(stdout));child.stdin.on('error',()=>{});child.stdin.end(sql,'utf8');});
 const last=result.trim().split(/\r?\n/).at(-1);return last?JSON.parse(last):null;
}
