// Static admission checks only. This is not a PostgreSQL execution/integration test.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const sql=fs.readFileSync(new URL('../scripts/migrations/193-own-monthly-day-declaration.sql',import.meta.url),'utf8');
const body=name=>{const s=sql.indexOf('CREATE FUNCTION public.'+name+'(');assert.ok(s>=0);const e=sql.indexOf('END $$;',s);assert.ok(e>s);return sql.slice(s,e);};
test('draft193 adds only its own ledger and fixed facades, without replacing157/192 or installing an engine',()=>{
 assert.match(sql,/PRIVATE DRAFT193\. NOT EXECUTED/);assert.doesNotMatch(sql,/CREATE OR REPLACE|CREATE ROLE|ALTER ROLE|INSERT INTO public\.(?!own_monthly_days_event)|own_run_|own_program_definition|recognizedUnits|baseUnits|generate_series/);
 const creates=[...sql.matchAll(/CREATE FUNCTION public\.(\w+)/g)].map(m=>m[1]);assert.equal(creates.length,12);assert.ok(creates.every(n=>n.startsWith('own_monthly_days_')));
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);assert.match(sql,/BEFORE UPDATE OR DELETE/);assert.match(sql,/BEFORE TRUNCATE/);assert.match(sql,/UNIQUE\(proposal_id\)/);assert.match(sql,/UNIQUE\(tenant_id,source_binding_id,actor_membership_id,request_key\)/);
 const grant=sql.slice(sql.indexOf('GRANT EXECUTE'));assert.equal((grant.match(/public\.own_monthly_days_\w+/g)||[]).length,4);assert.doesNotMatch(grant,/capture|source_v1|current_v1/);
});
test('writer preserves actor triple independence, whole-body idempotency before mutation and exact source/base/tenant guards',()=>{
 const summary=body('own_monthly_days_summary_v1');for(const fragment of ['actor_membership_id<>','actor_person_id<>','actor_email<>'])assert.ok(summary.includes(fragment));
 const w=body('own_monthly_days_command_v1'),replay=w.indexOf('IF FOUND THEN IF prior.request_sha256<>fingerprint OR prior.body<>body');assert.ok(replay>0&&replay<w.indexOf("IF cmd='propose'"));
 for(const fragment of ["body->>'scopeVersion' IS DISTINCT FROM", "body->>'baseVersion' IS DISTINCT FROM", "body->>'sourceVersion' IS DISTINCT FROM",'own_monthly_days_attempt_v1(p,key)','own_monthly_days_summary_v1(ctx,proposal)','tenant_id=(ctx->>\'tenantId\')::uuid','source_binding_id=(ctx->>\'sourceBindingId\')::uuid'])assert.ok(w.includes(fragment),fragment);
 assert.ok(w.indexOf("definition->'recognizedDays'='null'")<w.indexOf('INSERT INTO public.own_monthly_days_event'));assert.match(w,/268435456/);assert.match(w,/134217728/);
});
test('typed quantities require the explicit full-month flag; native labor coverage never substitutes for that declaration',()=>{
 const definition=body('own_monthly_days_definition_v1');for(const key of ['recognizedDays','baseDays','unit','policyVersion','fullMonthDeclared','asOfDate','documentReference'])assert.ok(definition.includes("'"+key+"'"));assert.match(definition,/numeric>30/);assert.match(definition,/\{1,8\}/);
 const source=body('own_monthly_days_source_v1');assert.match(source,/own_participation_source_v1\(ctx,target,period_value\)/);assert.doesNotMatch(source,/recognizedDays|recognizedUnits|baseUnits|coalesce|extract|30/);
 const w=body('own_monthly_days_command_v1');assert.equal((w.match(/fullMonthDeclared/g)||[]).length,2);assert.equal((body('own_monthly_days_capture_v1').match(/fullMonthDeclared/g)||[]).length,1);
 assert.match(w,/definition->>'fullMonthDeclared'\)::boolean AND/);assert.doesNotMatch(w,/IF \(source_value->>'fullPeriod'\)::boolean AND/);
});
test('all capture records require fresh typed approval and whole-source hash; no missing rows or quantities become zeros',()=>{
 const c=body('own_monthly_days_capture_v1');for(const fragment of ['jsonb_array_length(employees)<1','jsonb_array_length(employees)>10000','target=ANY(seen)','sourceVersion\' IS DISTINCT FROM fresh','identityToken\' IS DISTINCT FROM e',"'{definition,recognizedDays}'='null'","'own-monthly-approved-days.v1',period_value,records"])assert.ok(c.includes(fragment),fragment);
 assert.doesNotMatch(c,/coalesce|LIMIT |recognizedUnits|baseUnits|INSERT|UPDATE|DELETE/);
 const statements=splitPostgresStatements(sql);assert.ok(statements.length>15);assert.deepEqual(splitPostgresStatements(statements.join(';\n')),statements);
});
