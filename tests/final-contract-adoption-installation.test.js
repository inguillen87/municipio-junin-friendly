import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildFinalContractAdoptionInstallation,finalContractAdoptionDefinitions} from '../scripts/lib/final-contract-adoption-installation.mjs';
import {FINAL_CONTRACT_TRANSITION_ROWS_SQL} from '../scripts/lib/grh-final-contract-transition.mjs';
import {prepareFinalContractAdoption} from '../scripts/prepare-final-contract-adoption.mjs';
const options={read:p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),sourceCommit:'a'.repeat(40)};

test('a schema review is limited to the two existing destinations and cannot connect or execute',()=>{
 const b=prepareFinalContractAdoption(options);assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.deepEqual(b.targets.map(t=>[t.projectId,t.major]),[['noisy-poetry-54471701',17],['wild-cake-87689498',18]]);
 for(const t of b.targets){for(const phase of ['preflight','installation','verification'])assert.ok(t[phase].some(s=>s.includes('OWN_INSTALL_DESTINATION_MISMATCH')&&s.includes(t.projectId)&&s.includes(t.branchId)));assert.equal(t.preflight[0],'SET TRANSACTION READ ONLY');assert.equal(t.verification[0],'SET TRANSACTION READ ONLY');}
});

test('each existing function has one authoritative before and after definition',()=>{
 const b=buildFinalContractAdoptionInstallation(options);
 for(const pins of [b.beforePins,b.afterPins,b.newPins])assert.equal(new Set(pins.map(p=>p.signature)).size,pins.length);
 assert.equal(b.beforePins.filter(p=>p.name==='municipal_adoption_ready_v1').length,1);
});

test('the actual nine SQL144 functions and private protections gate first install, repeat and runtime',()=>{
 const b=buildFinalContractAdoptionInstallation(options);
 assert.equal(b.sourcePrerequisite.pins.length,9);
 for(const sql of [b.initial,b.afterCheck,b.afterDefinitions.at(-1)])assert.ok(sql.includes('FINAL_ADOPTION_SOURCE_METADATA')&&sql.includes('FINAL_ADOPTION_SOURCE_PROTECTION'));
 assert.ok(b.sourcePrerequisite.pins.some(p=>p.result==='text[]'));
 assert.ok(b.sourcePrerequisite.pins.some(p=>p.result==='TABLE(row_key text, record jsonb)'&&p.modes.join(',')==='i,i,t,t'));
 assert.match(b.proof,/'objectsFingerprint'/);
 for(const path of ['scripts/migrations/144-final-grh-source-revision.sql','scripts/lib/grh-final-contract-transition.mjs','scripts/lib/municipal-adoption-operator-installation.mjs'])assert.match(b.sourceHashes[path],/^[a-f0-9]{64}$/);
});
test('final adoption preserves the previous allowance verbatim and pins both schemas',()=>{
 const b=buildFinalContractAdoptionInstallation(options);
 const original=b.newDefinitions.find(d=>d.includes('FUNCTION public.employment_adoption_final_original_allowed_v1('));
 assert.equal(original.replace('public.employment_adoption_final_original_allowed_v1(','public.employment_adoption_update_allowed_v1('),b.inactive.afterDefinitions[2]);
 assert.equal(b.newPins.length,7);assert.equal(b.afterPins.length,8);assert.equal(b.newPins.filter(p=>p.runtime).length,2);
 assert.ok(b.newPins.every(p=>['employment_adoption_final_bootstrap_v1','employment_adoption_final_available_v1'].includes(p.name)||!p.runtime));
 assert.ok(b.beforePins.every((p,n)=>p.signature===b.afterPins[n].signature&&p.runtime===b.afterPins[n].runtime));
 assert.match(b.initial,/FINAL_ADOPTION_BEFORE_METADATA/);assert.match(b.initial,/FINAL_ADOPTION_AFTER_METADATA/);
});
test('candidate dates and classifications are applied only through the approved immutable ledger',()=>{
 const b=buildFinalContractAdoptionInstallation(options),decide=b.afterDefinitions.find(d=>d.includes('FUNCTION public.employment_adoption_decide_v1('));
 assert.match(decide,/employment_adoption_final_after_v1\(r,old_contract/);
 for(const field of ['start_date','end_date','status','agreement_code','category_code','organization_unit_source_id','position_source_id','sector_source_id'])assert.ok(decide.includes('n.'+field));
 assert.match(decide,/facts IS DISTINCT FROM s\.facts/);assert.match(decide,/employment_adoption_independent_v1/);
 assert.match(decide,/SET CONSTRAINTS employment_adoption_application_applied,employment_adoption_decision_applied IMMEDIATE/);
 assert.doesNotMatch(decide,/INSERT INTO public\.(employment_contract|person_identity)|UPDATE public\.person_identity/);
 assert.match(b.newDefinitions.find(d=>d.includes('final_update_allowed_v1(')),/to_jsonb\(after_row\)=public\.employment_adoption_final_after_v1/);
});
test('the same original-key/person crosswalk and all ten source seals remain mandatory',()=>{
 const definitions=finalContractAdoptionDefinitions(),source=definitions[1];
 assert.ok(definitions[0].includes(FINAL_CONTRACT_TRANSITION_ROWS_SQL.replaceAll('$1::uuid','p_revision').replaceAll('$2','p_company')));
 assert.match(source,/FOREACH entity IN ARRAY public\.grh_final_source_entities_v1/);
 assert.match(source,/observed IS DISTINCT FROM seal\.fingerprints->entity/);
 assert.match(source,/candidate_rows.*existing_rows/);assert.match(source,/candidate_rows.*core_rows/);
 assert.match(source,/candidate_rows.*10000/);assert.match(source,/8388608/);
 assert.doesNotMatch(source,/LIMIT\s+500|WHERE.*dni\s*=/i);
});
test('old attempts, private facts, inactive pending status and source-scoped decisions remain separate',()=>{
 const b=buildFinalContractAdoptionInstallation(options),propose=b.afterDefinitions[0],after=b.newDefinitions[2],stage=b.afterDefinitions[3];
 assert.match(propose,/IF FOUND THEN IF r\.body IS DISTINCT FROM body_value/);
 assert.ok(propose.indexOf('IF FOUND THEN')<propose.indexOf('raw:=CASE'));
 assert.match(propose,/sourceIssues.*IS DISTINCT FROM '\[\]'::jsonb/);
 assert.match(propose,/body_value-ARRAY\['version','finalSource'\]/);
 assert.match(after,/before_value->'contract' IS DISTINCT FROM old_contract/);
 assert.match(after,/employment_adoption_seal s CROSS JOIN LATERAL jsonb_array_elements\(s.facts\)/);
 assert.match(after,/candidate->'sourceIssues' IS DISTINCT FROM '\[\]'::jsonb/);
 assert.match(after,/finalRevisionId/);assert.match(after,/finalPackageSha256/);
 assert.match(stage,/'rawReview',r.before_snapshot-'finalContracts'/);
 assert.match(b.newDefinitions[3],/raw-'finalContracts'/);
 assert.match(b.newDefinitions.at(-1),/after_row\.status='inactive'/);
 assert.match(b.proof,/'newTables',0/);assert.match(b.proof,/'businessOperations',0/);
 assert.doesNotMatch(b.migration.join('\n'),/DISABLE TRIGGER|session_replication_role|ALTER ROLE|ALTER POLICY|DROP TRIGGER/);
});
