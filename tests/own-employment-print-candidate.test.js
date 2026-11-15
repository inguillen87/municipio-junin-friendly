// These tests derive text from pinned original sources. They do not parse or
// execute PostgreSQL, synthesize an attester, install functions or change ACLs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildEmploymentPrintCandidate,EMPLOYMENT_PRINT_ORIGINALS} from '../scripts/lib/own-employment-print-candidate.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sources=()=>({captureSource:read('scripts/migrations/237-own-approved-period-values.sql'),
 printFactsSource:read('scripts/candidates/originals/own-receipt-print-facts-v6.sql.txt'),
 helperSource:read('scripts/candidates/own-employment-print-facts-v1.source.sql.txt'),
 familyMembersSource:read('scripts/candidates/originals/receipt-v6-family-members.json')});
const hash=text=>createHash('sha256').update(text).digest('hex');

test('the pure proposal derives two original bodies and only two new helpers within the original family limit',()=>{
 const input=sources(),before=JSON.stringify(input),proposal=buildEmploymentPrintCandidate(input);
 assert.equal(proposal.installable,false);assert.equal(proposal.connects,false);assert.equal(proposal.executesSql,false);assert.equal(proposal.requiresReviewedAttestation,true);
 assert.equal(proposal.functions.filter(fn=>fn.kind==='new').length,2);assert.equal(proposal.functions.filter(fn=>fn.kind==='derived_original').length,2);
 assert.equal(proposal.familyCapacity.official.proposedTotal,64);assert.equal(proposal.familyCapacity.quantity.proposedTotal,32);
 assert.equal(proposal.familyCapacity.official.unchangedLimit,64);assert.equal(proposal.familyCapacity.official.attestationClosed,false);
 assert.equal(JSON.stringify(input),before);
 const historicalMembers=JSON.parse(input.familyMembersSource);
 for(const rows of Object.values(historicalMembers))assert.equal(rows.find(row=>row.signature==='public.own_run_capture_v1(jsonb,jsonb,uuid,text)').sha256,EMPLOYMENT_PRINT_ORIGINALS.captureFamilyMember);
 assert.notEqual(EMPLOYMENT_PRINT_ORIGINALS.captureFamilyMember,EMPLOYMENT_PRINT_ORIGINALS.captureBody);
 assert.doesNotMatch(proposal.sql,/own_employment_print_capture_candidate_v1\(|own_receipt_print_facts_job_title_candidate_v1\(/);
 assert.match(proposal.sql,/^--[^\n]+\nBEGIN;\nDO \$source_only\$ BEGIN RAISE EXCEPTION/);assert.match(proposal.sql,/ROLLBACK;\s*$/);
 assert.doesNotMatch(proposal.sql,/\b(?:GRANT|REVOKE)\b|CREATE OR REPLACE FUNCTION public\.own_run_(?:release_attest_c1|quantity_family|official_family)_v1/);
 for(const fn of proposal.functions){assert.equal(fn.bodySha256,hash(fn.body));assert.equal(fn.definitionSha256,hash(fn.sql));}
});

test('new capture evidence is inserted after classification and before derived family inventory, with original replay and authority retained',()=>{
 const p=buildEmploymentPrintCandidate(sources()),capture=p.functions.find(fn=>fn.name==='own_run_capture_v1');
 assert.equal(capture.beforeBodySha256,EMPLOYMENT_PRINT_ORIGINALS.captureBody);assert.notEqual(capture.bodySha256,capture.beforeBodySha256);
 assert.equal(capture.beforeDefinitionSha256,EMPLOYMENT_PRINT_ORIGINALS.captureDefinition);
 const body=capture.body,anchor=body.indexOf("'employmentPrintFacts',component"),replay=body.indexOf('RETURN public.own_run_receipt_v1(prior,true)');
 assert.ok(replay>=0&&replay<anchor);assert.ok(body.indexOf("'periodClassifications',jsonb_build_object")<anchor);
 assert.ok(anchor<body.indexOf('own_run_family_tariff_native_capture_candidate_v2(payload_value)'));
 assert.match(body,/PERFORM public\.own_salary_conditions_session_live_v1\(p\)/);
 assert.match(body,/resolved IS DISTINCT FROM classification-'identityToken'/);
 assert.match(body,/source_value#>'\{provenance,requestSha256\}' IS DISTINCT FROM to_jsonb\(registration\.request_sha256\)/);
 assert.match(body,/public\.own_run_capacity_v1/);assert.match(body,/public\.own_close_guard_v1/);
});

test('the derived print producer keeps all original guards and adds only a frozen title/hash branch',()=>{
 const p=buildEmploymentPrintCandidate(sources()),print=p.functions.find(fn=>fn.name==='own_receipt_print_facts_v6_candidate_v1');
 assert.equal(print.beforeBodySha256,EMPLOYMENT_PRINT_ORIGINALS.printFactsBody);
 assert.match(print.body,/job_title_value jsonb:='null'/);assert.match(print.body,/'jobTitle',job_title_value/);
 assert.match(print.body,/IF payload->'sourceInventory' \? 'employmentPrintFacts' THEN/);
 assert.match(print.body,/capture->>'payloadSha256' IS DISTINCT FROM public\.own_run_hash_v1\(payload\)/);
 assert.match(print.body,/saved->>'inputSha256' IS DISTINCT FROM public\.own_run_hash_v1\(input_value\)/);
 assert.match(print.body,/saved->>'resultSha256' IS DISTINCT FROM public\.own_run_hash_v1\(result_value\)/);
 assert.doesNotMatch(print.body,/employment_contract|native_employee_registration|source_payload|positionStructure',job_title/);
 assert.match(print.body,/'positionStructure',NULL/);
});

test('the checked-in source and manifest are the exact pure derivation for review',()=>{
 const input=sources(),proposal=buildEmploymentPrintCandidate(input);
 const sql=read('scripts/candidates/own-employment-print-facts-v1.derived.sql.txt');
 const manifest=JSON.parse(read('scripts/candidates/own-employment-print-facts-v1.derived.manifest.json'));
 assert.equal(sql,proposal.sql);assert.equal(manifest.output.sha256,hash(sql));assert.equal(manifest.output.bytes,Buffer.byteLength(sql));
 assert.equal(manifest.installable,false);assert.equal(manifest.executesSql,false);assert.equal(manifest.requiresReviewedAttestation,true);
 assert.deepEqual(manifest.originals,proposal.originals);assert.deepEqual(manifest.familyCapacity,proposal.familyCapacity);
 assert.deepEqual(manifest.functions,proposal.functions.map(({body,sql,...metadata})=>metadata));
 for(const [name,text]of Object.entries(input))assert.equal(manifest.inputs[name].sha256,hash(text));
});

for(const [name,mutate]of[
 ['capture original changed',s=>s.captureSource=s.captureSource.replace("native_batches jsonb:='[]'","native_batches jsonb:='[1]' ")],
 ['capture signature changed with its body intact',s=>s.captureSource=s.captureSource.replace('own_run_capture_v1(p jsonb, body jsonb, key uuid, algorithm text)','own_run_capture_v1(p jsonb, body jsonb, key text, algorithm text)')],
 ['capture parameter renamed with its body intact',s=>s.captureSource=s.captureSource.replace('own_run_capture_v1(p jsonb, body jsonb, key uuid, algorithm text)','own_run_capture_v1(actor jsonb, body jsonb, key uuid, algorithm text)')],
 ['capture result type changed with its body intact',s=>s.captureSource=s.captureSource.replace(/(own_run_capture_v1\([^\n]+\)\n )RETURNS jsonb/,'$1RETURNS json')],
 ['capture language changed with its body intact',s=>s.captureSource=s.captureSource.replace(/(own_run_capture_v1\([^\n]+\)\n RETURNS jsonb\n )LANGUAGE plpgsql/,'$1LANGUAGE sql')],
 ['capture security changed with its body intact',s=>s.captureSource=s.captureSource.replace(/(own_run_capture_v1\([^\n]+\)\n RETURNS jsonb\n LANGUAGE plpgsql\n )SECURITY DEFINER/,'$1SECURITY INVOKER')],
 ['capture search path changed with its body intact',s=>s.captureSource=s.captureSource.replace(/(own_run_capture_v1\([^\n]+\)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO )'pg_catalog', 'public', 'pg_temp'/,"$1'public', 'pg_temp'")],
 ['print original changed',s=>s.printFactsSource=s.printFactsSource.replace("'jobTitle',NULL","'jobTitle','Inventado'")],
 ['print original line endings changed',s=>s.printFactsSource=s.printFactsSource.replaceAll('\n','\r\n')],
 ['family literal changed',s=>s.familyMembersSource=s.familyMembersSource.replace('quantity','quantities')],
 ['duplicate capture definition',s=>s.captureSource+='\nCREATE FUNCTION public.own_run_capture_v1() RETURNS void AS $$ BEGIN END $$;'],
 ['missing capture source anchor',s=>s.helperSource=s.helperSource.replace('RETURN component;','RETURN rows_value;')],
])test('derivation rejects '+name,()=>{const input=sources(),before=JSON.stringify(input);mutate(input);assert.notEqual(JSON.stringify(input),before);assert.throws(()=>buildEmploymentPrintCandidate(input));});
