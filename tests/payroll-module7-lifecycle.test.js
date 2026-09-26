import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../scripts/migrations/109-payroll-module7-lifecycle.sql',import.meta.url),'utf8');
test('109 only evolves lifecycle schema/functions and keeps payroll side effects false',()=>{
 assert.match(sql,/MODULE7_BASELINE_CHANGED/);
 assert.match(sql,/status IN \('prepared','submitted','approved','closed','annulled','rejected','cancelled'\)/);
 assert.match(sql,/closed_for_history/);assert.match(sql,/annulled_by_authority/);
 assert.match(sql,/OLD\.status = 'approved'.*'closed','annulled'/s);
 assert.match(sql,/OLD\.status = 'closed' AND NEW\.status = 'annulled'/);
 assert.match(sql,/jsonb_build_array\('close','annul'\)/);assert.match(sql,/jsonb_build_array\('annul'\)/);
 assert.match(sql,/p_command NOT IN \('submit','approve','reject','cancel','close','annul'\)/);
 assert.match(sql,/approved_value := p_command IN \('approve','close'\)/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO employment_contract|UPDATE person_identity|DELETE FROM payroll_monthly_close_run|TRUNCATE)\b/i);
});
test('109 preserves the original approver on close/annul and records the later actor in event history',()=>{
 assert.match(sql,/decided_by_membership_id = CASE\s+WHEN p_command IN \('approve','reject'\).*WHEN p_command IN \('close','annul'\) THEN item\.decided_by_membership_id/s);
 assert.match(sql,/decided_by_person_id = CASE\s+WHEN p_command IN \('approve','reject'\).*WHEN p_command IN \('close','annul'\) THEN item\.decided_by_person_id/s);
 assert.match(sql,/decided_at = CASE WHEN p_command = 'submit' THEN NULL WHEN p_command IN \('close','annul'\) THEN item\.decided_at ELSE now\(\) END/);
 assert.match(sql,/actor_membership_id/);
});
test('109 keeps closed periods unique and lets an annulled period be prepared again',()=>{
 assert.match(sql,/WHERE status IN \('prepared','submitted','approved','closed'\)/);
 assert.doesNotMatch(sql,/WHERE status IN \([^\n]*annulled/);
});
test('module 7 source semantics are explicit in UI and never claim accounting',()=>{
 const html=fs.readFileSync(new URL('../nomina-control.html',import.meta.url),'utf8');
 assert.match(html,/MÓDULO 7 · LIQUIDACIÓN/);
 assert.match(html,/7\.1 · Anular/);assert.match(html,/7\.2 · Confirmar/);assert.match(html,/7\.3 · Cerrar/);
 assert.match(html,/no contabiliza por sí solo/);assert.match(html,/No transmite a GRH, banco ni contabilidad/);
});
