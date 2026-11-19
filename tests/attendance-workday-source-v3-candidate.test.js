// Documentary source tests only: SQL is read as text and is never submitted to a database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const original=read('scripts/migrations/065-clock-workday-source-continuous.sql');
const candidate=read('scripts/candidates/attendance-clock-workday-source-v3.sql.txt');
const BASE_SHA='437c2df864bbf0bec9e31228bb9150a9f2a87cd7b246a0f69d4236e420ce73dc';

test('v3 candidate pins the unchanged v2 source and remains a rollback-only review artifact',()=>{
  assert.equal(createHash('sha256').update(original).digest('hex'),BASE_SHA);
  assert.match(candidate,new RegExp('Base SHA-256: '+BASE_SHA));
  assert.match(candidate,/^-- Prospective T4 source identity contract\. NOT INSTALLED\./);
  assert.equal((candidate.match(/^BEGIN;$/gm)||[]).length,1);
  assert.equal((candidate.match(/^ROLLBACK;$/gm)||[]).length,1);
  assert.match(candidate,/\nROLLBACK;\n$/);assert.doesNotMatch(candidate,/^COMMIT;$/m);
  assert.equal((candidate.match(/^CREATE OR REPLACE FUNCTION /gm)||[]).length,1);
  assert.doesNotMatch(candidate,/attendance_clock_workday_source_v2\(/);
});

test('the additive SQL differs only by explicit day, gated identity and the new facade/revision namespace',()=>{
  let expected=original.slice(original.indexOf('CREATE OR REPLACE FUNCTION'));
  const replace=(before,after,count=1)=>{
    assert.equal(expected.split(before).length-1,count,'pinned transformation: '+before);
    expected=expected.replaceAll(before,after);
  };
  replace('attendance_clock_workday_source_v2','attendance_clock_workday_source_v3',3);
  replace("p_site text DEFAULT 'pm-10',p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_snapshot uuid DEFAULT NULL",
    'p_site text,p_day date,p_snapshot uuid DEFAULT NULL');
  replace(' OR (p_from IS NULL)<>(p_to IS NULL)\n OR (p_from IS NOT NULL AND (p_to<p_from OR p_to-p_from>92)) THEN',
    ' OR p_day IS NULL THEN');
  replace(" period AS MATERIALIZED (\n  SELECT coalesce(p_to,(max(local_timestamp) FILTER(WHERE cardinality(issue_codes)=0))::date,\n   (statement_timestamp() AT TIME ZONE coalesce((SELECT timezone FROM site),'America/Argentina/Mendoza'))::date) to_day\n  FROM unique_rows\n ), bounds AS MATERIALIZED (\n  SELECT coalesce(p_from,to_day) from_day,to_day FROM period\n )",
    ' bounds AS MATERIALIZED (\n  SELECT p_day from_day,p_day to_day\n )');
  replace('   CASE WHEN a.nominal THEN legacy_legajo ELSE NULL END legajo,',
    "   CASE WHEN a.nominal THEN legacy_legajo ELSE NULL END legajo,\n   CASE WHEN a.nominal AND r.identity_state='mapped' THEN r.contract_id ELSE NULL END visible_contract_id,");
  replace("    'legajo',legajo,'identityState',identity_state,'code',punch_code)",
    "    'legajo',legajo,'identityState',identity_state,'contractId',visible_contract_id,'code',punch_code)");
  replace("'clock-workday-source.v2'","'clock-workday-source.v3'",2);
  replace("'anchoredToLatest',p_from IS NULL","'anchoredToLatest',false");
  replace('(text,uuid,integer,text,uuid,uuid,text,date,date,uuid)',
    '(text,uuid,integer,text,uuid,uuid,text,date,uuid)',2);
  const actual=candidate.slice(candidate.indexOf('CREATE OR REPLACE FUNCTION'),candidate.lastIndexOf('\nROLLBACK;'));
  assert.ok(actual===expected,'the candidate must contain only the pinned source transformations');
});
