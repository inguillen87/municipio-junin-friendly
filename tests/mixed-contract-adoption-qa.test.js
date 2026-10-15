import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildMixedContractAdoptionQa,mixedQaFinalSourceSeed,mixedQaPendingSourceRows,mixedQaQuery,MIXED_QA_COUNTS,assertMixedQaPredecessorRollbackFailure,mixedQaOctober14Candidate,mixedQaAdmissionContext,mixedQaAdmissionPhase,assertMixedQaPreAdmissionFailure} from '../scripts/lib/mixed-contract-adoption-qa.mjs';
import {ownerDecisionQaHash as hash} from '../scripts/lib/municipal-owner-adoption-decision-qa.mjs';
import {assertMixedQaCohort,mixedQaHtml,mixedQaOptions} from '../scripts/verify-mixed-contract-adoption.mjs';
import {relocateFinalReviewAdmissionInstallation} from '../scripts/lib/final-grh-source-review-admission-qa.mjs';
import {mixedAdoptionRaw} from './fixtures/mixed-contract-adoption-synthetic.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),sourceCommit='a'.repeat(40),schema='mc_qa_fixed_092_'+'c'.repeat(32);
const qa=buildMixedContractAdoptionQa({major:17,sourceCommit,read,schema});
const laterFixtures=new Map(),laterFixture=major=>{if(!laterFixtures.has(major))laterFixtures.set(major,buildMixedContractAdoptionQa({major,sourceCommit,read,schema,profile:'october14'}));return laterFixtures.get(major);};
const body=d=>/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?$/.exec(d)[2];
const assertPendingFinalSourcePlacement=(owner,fixture)=>{
 for(const p of fixture.pendingSourceRows){
  assert.ok(!owner.rows.some(r=>r.legajo===p.legajo),'PENDING_EMPLOYEE_IN_PARENT');
  assert.ok(!owner.rows.some(r=>r.sourcePersonId===p.person_id),'PENDING_PERSON_IN_PARENT');
 }
 const sourceRows=[...fixture.seed.matchAll(/\bWITH source_rows AS\(SELECT value AS record FROM jsonb_array_elements\('((?:''|[^'])*)'::jsonb\)\),\s*pending_rows AS\(/g)];
 assert.equal(sourceRows.length,1,'PENDING_SOURCE_CTE_REQUIRED');
 assert.deepEqual(JSON.parse(sourceRows[0][1].replaceAll("''","'")),fixture.pendingSourceRows,'PENDING_SOURCE_ROWS_CHANGED');
};

test('the complete fictional source partitions71 rows without assigning UUIDs to its6 unknown identities',()=>{
 assert.deepEqual(qa.counts,{source:71,known:65,selected:49,deferred:14,archived:2,pending:6,adopted:0});
 assert.equal(qa.selected.length,49);assert.equal(qa.deferred.length,14);assert.equal(qa.owner.rows.length,65);
 assert.equal(qa.selected.length+qa.deferred.length+qa.owner.rows.filter(r=>!r.active).length,qa.counts.known);
 assert.equal(qa.counts.source,qa.counts.known+qa.pendingSourceRows.length);
 const ids=new Set(qa.selected.map(r=>r.contractId));assert.equal(ids.size,49);assert.ok(qa.selected.every(r=>qa.owner.rows.includes(r)));assert.ok(qa.deferred.every(r=>!ids.has(r.contractId)));
 for(const row of mixedQaPendingSourceRows()){assert.ok(Number.isSafeInteger(row.person_id));assert.equal(row.source_payload.personId,row.person_id);assert.ok(!JSON.stringify(row).match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/));for(const key of['contractId','personId','canonical_id','registrationId'])assert.ok(!Object.hasOwn(row,key));}
 assert.equal(qa.connects,false);assert.equal(qa.executesSql,false);
});

test('the published parent remains65 real known contracts; all pending and missing-date facts enter only26 complete final-source deltas before sealing',()=>{
 assert.equal(qa.parentSourceRows,65);assert.deepEqual(qa.deltaCounts,{coreAdd:6,curatedAdd:6,curatedReplace:14,total:26});
 assert.equal((qa.seed.match(/INSERT INTO grh_final_source_delta\(/g)??[]).length,1);
 assert.ok(qa.seed.includes("'core/employmentReconciliation'::text entity"));assert.ok(qa.seed.includes("'curated/grh_employees'"));
 assert.ok(qa.seed.includes('grh_curated_source_record_v1'));assert.ok(qa.seed.includes('jsonb_populate_record(NULL::'+schema+'.grh_employees'));
 assert.ok(qa.seed.indexOf('INTO mixed_deltas')<qa.seed.indexOf('INSERT INTO grh_final_source_revision'));
 assert.ok(qa.seed.indexOf('INSERT INTO grh_final_source_delta')<qa.seed.indexOf('INSERT INTO grh_final_source_seal'));
 assert.ok(qa.seed.includes("'fecha_ingreso',NULL"));assert.ok(!qa.seed.includes('UPDATE '+schema+'.employment_contract SET start_date=NULL'));
 assert.ok(qa.seed.includes('jsonb_array_length(mixed_deltas)<>26'));assert.ok(qa.seed.includes('public.grh_final_source_entities_v1')===false);
 assertPendingFinalSourcePlacement(qa.owner,qa);
});

test('pending-source membership ignores unrelated colliding schema identifiers, UUIDs and hashes but rejects actual parent rows or altered delta JSON',()=>{
 const uuid='00099001-0000-4000-8000-000000000001',digest=hash('QA186 unrelated digest 27918');
 assert.match(uuid,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.ok(digest.includes('99001'));
 const collidingSchema='mc_qa_fixed_092_99001'+'a'.repeat(27),colliding=buildMixedContractAdoptionQa({major:17,sourceCommit,read,schema:collidingSchema});
 const owner={...colliding.owner,seed:colliding.owner.seed+'\n-- unrelated UUID '+uuid+' and SHA256 '+digest},fixture=mixedQaFinalSourceSeed(owner);
 assert.equal(owner.rows.length,65);assert.ok(!owner.rows.some(r=>r.legajo==='99001'));assert.ok(owner.seed.includes(collidingSchema));assert.ok(owner.seed.includes(uuid));assert.ok(owner.seed.includes(digest));
 assert.doesNotThrow(()=>assertPendingFinalSourcePlacement(owner,fixture));
 const pending=fixture.pendingSourceRows[0],known=owner.rows[0];
 assert.throws(()=>assertPendingFinalSourcePlacement({...owner,rows:[...owner.rows,{...known,legajo:pending.legajo}]},fixture),/PENDING_EMPLOYEE_IN_PARENT/);
 assert.throws(()=>assertPendingFinalSourcePlacement({...owner,rows:[...owner.rows,{...known,sourcePersonId:pending.person_id}]},fixture),/PENDING_PERSON_IN_PARENT/);
 const exact=JSON.stringify(fixture.pendingSourceRows),changed=JSON.stringify(fixture.pendingSourceRows.slice(1));
 assert.equal(fixture.seed.split(exact).length,2);
 assert.throws(()=>assertPendingFinalSourcePlacement(owner,{...fixture,seed:fixture.seed.replace(exact,changed)}),/PENDING_SOURCE_ROWS_CHANGED/);
 const altered=structuredClone(fixture.pendingSourceRows);altered[0].source_payload.personId++;
 assert.throws(()=>assertPendingFinalSourcePlacement(owner,{...fixture,seed:fixture.seed.replace(exact,JSON.stringify(altered))}),/PENDING_SOURCE_ROWS_CHANGED/);
});

test('all10 final domains retain complete baseline/candidate fingerprints, exact delta counts and the original seal validation',()=>{
 for(const text of["'baseline',baseline,'candidate',candidate,'changes',changes",'FROM base_rows r WHERE r.entity=e.entity','FROM candidate_rows r WHERE r.entity=e.entity',"FILTER(WHERE d.operation='add')","FILTER(WHERE d.operation='replace')",'grh_final_source_fingerprint_v1','a_final_revision_guard','b_final_revision_seal'])assert.ok(qa.seed.includes(text),text);
 assert.ok(qa.seed.includes("md5(r.row_key||r.record::text)"));assert.ok(!qa.seed.includes('DISABLE TRIGGER'));
 assert.ok(qa.seed.includes('GRH_FINAL_REVISION_CANDIDATE_DRIFT'));assert.ok(qa.seed.includes('GRH_FINAL_REVISION_PREVIOUS_MISMATCH'));
 for(const d of qa.owner.base.originals)assert.ok(qa.owner.definitions.some(v=>body(v)===body(d)));
});

test('all14 new/adapted186 bodies and their nested readiness hashes derive only from canonical source relocation',()=>{
 assert.equal(qa.batch.newPins.length,4);assert.equal(qa.batch.afterPins.length,10);
 for(const d of [...qa.batch.newDefinitions,...qa.batch.afterDefinitions])assert.equal(qa.hashes[hash(body(d))],hash(body(qa.normalized(d))));
 for(const phase of ['rehearsal','installation','repetition','verification','rollback','rollbackVerification'])assert.equal(qa.local[phase].length,qa.batch[phase].length);
 assert.ok(qa.local.installation[1].includes("'install'"));assert.ok(qa.local.repetition[1].includes("'verify'"));
 assert.ok(qa.local.verification[0].includes('transaction_read_only'));assert.ok(qa.local.rollback.join('\n').includes('MIXED_ADOPTION186_ROLLBACK_HAS_HISTORY'));
 assert.ok(qa.ownerLocal.installation.join('\n').includes('OWNER_DECISION185_PRIOR_STATE_CHANGED'));
 assert.ok(qa.local.installation.join('\n').includes('MIXED_ADOPTION186_PRIOR_STATE_CHANGED'));
});

test('the extension fails closed on missing seeds, altered canonical dependencies and non-owned destination descriptors',()=>{
 assert.throws(()=>mixedQaFinalSourceSeed({...qa.owner,seed:qa.owner.seed.replace('DO $parents$','DO $changed$')}),/MIXED_QA_SOURCE_ANCHOR_CHANGED/);
 assert.throws(()=>mixedQaFinalSourceSeed({...qa.owner,rows:qa.owner.rows.slice(1)}));
 assert.throws(()=>buildMixedContractAdoptionQa({major:16,sourceCommit,read,schema}));
 assert.throws(()=>buildMixedContractAdoptionQa({major:17,sourceCommit,read,schema:'public'}));
 assert.throws(()=>buildMixedContractAdoptionQa({major:17,sourceCommit,read:p=>read(p)+(p.endsWith('/184-municipal-owner-adoption-authority.sql')?'\n-- changed':'')}),/OWNER_AUTHORITY184_SOURCE_CHANGED/);
});

test('the HTTP SQL adapter preserves JSON and canonical UUID arguments but cannot append arbitrary SQL or select another namespace',()=>{
 const payload=JSON.stringify({note:"literal ' $() ; SELECT fake"}),text='SELECT public.employment_adoption_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
 const mapped=mixedQaQuery(text,['{}',payload,'abcdef00-0000-4000-8000-000000000001'],schema);assert.ok(mapped.includes("literal '' $() ; SELECT fake"));assert.ok(mapped.startsWith('SELECT '+schema+'.'));
 for(const bad of[text+'; SELECT 1',text.replace('propose','unknown'),text.replace('public.','private.'),'DELETE FROM public.employment_contract'])assert.throws(()=>mixedQaQuery(bad,[],schema));
 assert.throws(()=>mixedQaQuery(text,['{}','{}'],schema));assert.throws(()=>mixedQaQuery(text,['{}',{},'key'],schema));assert.throws(()=>mixedQaQuery(text,['{}','{}','key','extra'],schema));assert.throws(()=>mixedQaQuery(text,['{}','{}','key'],'public'));
 for(const call of['employment_adoption_mixed_available_v1($1::jsonb)','employment_adoption_mixed_bootstrap_v1($1::jsonb,$2::uuid,$3::text)','municipal_adoption_command_v1($1::jsonb,$2::jsonb,$3::uuid)','municipal_owner_adoption_command_v1($1::jsonb,$2::jsonb,$3::uuid)']){const count=[...call.matchAll(/\$/g)].length;assert.ok(mixedQaQuery('SELECT public.'+call+' AS result',Array(count).fill('{}'),schema).startsWith('SELECT '+schema+'.'));}
 assert.ok(Object.isFrozen(MIXED_QA_COUNTS));
});

test('runtime proof rejects a vacuous selection, changed complete partition or nominal pending identity instead of counting only a filtered view',()=>{
 const raw=mixedAdoptionRaw(),cohort=raw.source.operationalCohort,counts={source:63,known:58,selected:37,archived:15,deferred:4,pending:5,adopted:2},ids=raw.rows.map(r=>r.contractId);
 assert.equal(assertMixedQaCohort(cohort,counts,{rows:raw.rows,selectedIds:ids}),true);
 for(const change of[c=>c.knownTotal++,c=>c.pendingTotal--,c=>c.pendingSourceRows.pop(),c=>c.pendingSourceRows[0].contractId=randomUuid(),c=>c.pendingSourceRows[0].reasons.push('CORE_RECORD_MISSING')]){const value=structuredClone(cohort);change(value);assert.throws(()=>assertMixedQaCohort(value,counts,{rows:raw.rows,selectedIds:ids}));}
 assert.throws(()=>assertMixedQaCohort(cohort,counts,{rows:[],selectedIds:ids}));assert.throws(()=>assertMixedQaCohort(cohort,counts,{rows:raw.rows.slice(1),selectedIds:ids}));
 assert.throws(()=>assertMixedQaCohort(cohort,counts,{pendingBefore:cohort.pendingSourceRows.slice(1)}));
 function randomUuid(){return'10000000-1000-4000-8000-000000099999';}
});

test('the fixture page mounts the actual PERSONAL workspace without embedding source rows, identity UUIDs, a proposal or automatic approval',()=>{
 const html=mixedQaHtml();assert.ok(html.includes("await import('/assets/employment-adoption-review-ui.js')"));assert.ok(html.includes('data-adoption-review'));assert.ok(!html.includes('90001'));assert.ok(!html.includes(qa.ids.revision));assert.ok(!html.includes('approve_owner'));assert.ok(!html.includes('native_employee_registration'));
 const runner=read('scripts/verify-mixed-contract-adoption.mjs');assert.ok(runner.includes('finalReviewAdmissionQaCleanup(qa.schema)'));assert.ok(runner.includes('assertOwnerAuthorityQaSourceBookend(sourceClosure)'));assert.ok(runner.includes("command?'READ COMMITTED':'REPEATABLE READ'"));assert.ok(runner.includes('expected:409'));assert.ok(runner.includes('sourceActivated:false'));
});

test('seed keeps184 repeatable-read requirement and independent runtime approval restores the database owner only for its subsequent private observation',()=>{
 const runner=read('scripts/verify-mixed-contract-adoption.mjs');assert.ok(runner.includes("phase='seed';run(tx([qa.seed]));"));assert.ok(!runner.includes('tx([qa.seed],{command:true})'));
 const a=runner.indexOf('normalObservation=run(tx(['),b=runner.indexOf('result=normalObservation.response;',a);assert.ok(a>=0&&b>a);const normal=runner.slice(a,b);
 assert.ok(normal.indexOf('SET LOCAL ROLE municontrol_actions_runtime_app')<normal.indexOf("SELECT set_config('municontrol_mixed_qa.response'"));
 assert.ok(normal.indexOf("'RESET ROLE'")>normal.indexOf("SELECT set_config('municontrol_mixed_qa.response'"));assert.ok(normal.indexOf("'RESET ROLE'")<normal.indexOf("'effects',(${effectsSql})"));
 assert.ok(normal.includes("command:true,end:'ROLLBACK'"));assert.ok(!normal.includes('GRANT '));
});

test('predecessor rollback after186 must refuse exactly its composed readiness function, not merely fail with an unrelated history or SQL error',()=>{
 const observed={status:3,stderr:'psql:qa.sql:12: ERROR:  AGREEMENT_INSTALL_FUNCTION_CHANGED\r\nDETAIL:  '+schema+'.municipal_adoption_ready_v1()\r\nCONTEXT:  fixture\r\n'};
 assert.deepEqual(assertMixedQaPredecessorRollbackFailure(observed,schema),{refused:true,code:'AGREEMENT_INSTALL_FUNCTION_CHANGED',function:schema+'.municipal_adoption_ready_v1()'});
 for(const change of[v=>v.status=0,v=>v.stderr=v.stderr.replace('AGREEMENT_INSTALL_FUNCTION_CHANGED','OWNER_DECISION185_ROLLBACK_HAS_HISTORY'),v=>v.stderr=v.stderr.replace('municipal_adoption_ready_v1','other_function'),v=>v.stderr=v.stderr.replace(schema,'public'),v=>v.stderr+='DETAIL:  '+schema+'.municipal_adoption_ready_v1()\n',v=>v.stderr=v.stderr.replace('DETAIL:','NOT_DETAIL:')]){const wrong=structuredClone(observed);change(wrong);assert.throws(()=>assertMixedQaPredecessorRollbackFailure(wrong,schema));}
 const runner=read('scripts/verify-mixed-contract-adoption.mjs');assert.ok(runner.includes("run(tx(qa.local.rollback),'MIXED_ADOPTION186_ROLLBACK_HAS_HISTORY')"));assert.ok(runner.includes('assert.deepEqual(snapshot(),historyBaseline)'));assert.ok(runner.includes('failure.json'));
});

test('the14October fixture appends a separately identified, coupled canonical source tuple and26 complete deltas without rewriting its original01 review or parents',()=>{
 const next=laterFixture(17),candidate=next.later.sql;
 assert.equal(next.seed,next.owner.seed);assert.notEqual(next.ids.revision,next.owner.ids.revision);assert.equal(next.later.originalRevisionId,next.owner.ids.revision);
 assert.deepEqual(next.later.profile,{profile:'grh-junin-2026-10-14',sha256:'3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4',cutoff:'2026-10-14T15:18:17'});
 assert.ok(next.seed.includes("'grh-junin-2026-10-01','50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f','2026-10-01 15:17:29'"));assert.ok(!next.seed.includes('grh-junin-2026-10-14'));
 assert.ok(!candidate.includes(next.owner.ids.revision));assert.equal(candidate.split(next.ids.revision).length,5);assert.doesNotMatch(candidate,/\b(?:UPDATE|DELETE|CREATE|ALTER|DROP)\b/);assert.ok(candidate.includes("'grh-junin-2026-10-14','3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4','2026-10-14 15:18:17'"));
 for(const piece of['INTO STRICT publication','jsonb_array_length(mixed_deltas)<>26',"'baseline',baseline,'candidate',candidate,'changes',changes",'INSERT INTO grh_final_source_delta','grh_final_source_fingerprint_v1'])assert.ok(candidate.includes(piece));
 assert.ok(candidate.indexOf('INTO mixed_deltas')<candidate.indexOf('INSERT INTO grh_final_source_revision'));assert.ok(candidate.indexOf('INSERT INTO grh_final_source_delta')<candidate.indexOf('INSERT INTO grh_final_source_seal'));
 assert.deepEqual(next.counts,qa.counts);assert.deepEqual(next.deltaCounts,qa.deltaCounts);assert.equal(next.admission.migration.length,1);assert.equal(next.admission.sourcePrerequisite.pins.length,9);assert.equal(next.admission.sourceHashes['scripts/migrations/183-final-grh-source-review-admission.sql'],'a85c01c1bf2ae620b1af32a2e1564c52544562f39235557ee5e5549717f47e94');
 assert.throws(()=>mixedQaOctober14Candidate(next.owner,next.owner.ids.revision));assert.throws(()=>mixedQaOctober14Candidate(next.owner,next.ids.revision.toUpperCase()));assert.throws(()=>buildMixedContractAdoptionQa({major:17,sourceCommit,read,schema,profile:'latest'}));
});

test('183 composes with the real185/186 fixture using its canonical nine source bodies, exact protections and strict four phases',()=>{
 for(const major of[17,18]){
  const next=laterFixture(major),local=relocateFinalReviewAdmissionInstallation(next.admission,mixedQaAdmissionContext(next,"IF current_database()<>'own_payroll_run_qa' THEN RAISE EXCEPTION 'TEST_GUARD';END IF;"),{read,databaseOid:12345});
  assert.equal(local.relocation.metadataChecksRemoved,0);assert.equal(local.relocation.functionSemanticsChanged,false);assert.equal(local.relocation.sourceTuplesChanged,false);assert.equal(local.sourcePrerequisite.pins.length,9);
  for(const p of local.sourcePrerequisite.pins)assert.equal(next.hashes[next.admission.sourcePrerequisite.pins.find(v=>v.name===p.name).sha256],p.sha256);
  let expected=next.owner.relocate(next.admission.sourcePrerequisite.check);for(const p of next.admission.sourcePrerequisite.pins)expected=expected.replace(p.sha256,next.hashes[p.sha256]);assert.equal(local.sourcePrerequisite.check,expected);assert.ok(!expected.includes("'public'||'.'"));
  for(const phase of['rehearsal','install','durable','repeat']){const t=local.transactions[phase];assert.equal(t.statements.length,next.admission.transactions[phase].statements.length);const adapted=mixedQaAdmissionPhase(t);assert.deepEqual(adapted.options,{readOnly:t.readOnly,end:t.completion});assert.ok(!adapted.statements.some(s=>s.startsWith('SET TRANSACTION ')));assert.deepEqual(adapted.statements,t.statements.filter(s=>!s.startsWith('SET TRANSACTION ')));}
  assert.ok(mixedQaAdmissionPhase({begin:'BEGIN',statements:local.preflight,completion:'COMMIT',readOnly:true}).options.readOnly);
  assert.equal(local.transactions.rehearsal.completion,'ROLLBACK');assert.equal(local.transactions.durable.readOnly,true);assert.equal(local.transactions.repeat.readOnly,false);assert.ok(local.guardedRollback.statements.join('\n').includes('FINAL_REVIEW_ROLLBACK_NEW_SOURCE_EXISTS'));
 }
 const runner=read('scripts/verify-mixed-contract-adoption.mjs');assert.ok(runner.includes('assertFinalGrhSourceReviewAdmissionDurability'));assert.ok(runner.includes('assert.deepEqual(originalSourceFootprint(),originalSourceBefore)'));assert.ok(runner.includes("name:'Revisar activos conocidos · '"));assert.ok(runner.includes('qa.later?2:1'));assert.ok(runner.includes('selectedRpc.values[1],qa.ids.revision'));
});

test('the later-source mode must be explicitly selected and cannot alter a destination, choose latest or reuse an evidence directory',()=>{
 const args=['--major=17','--source-commit='+sourceCommit,'--output=verification/mixed186-example'];assert.equal(mixedQaOptions(args).profile,'october01');assert.equal(mixedQaOptions([...args,'--profile=october14']).profile,'october14');
 for(const option of['--profile=latest','--profile=october14\n','--profile=2026-10-14','--host=127.0.0.1','--profile=october01','--output=verification/../outside'])assert.throws(()=>mixedQaOptions([...args,'--profile=october14',option]));
 assert.equal(qa.admission,null);assert.equal(qa.later,null);assert.equal(qa.seed,mixedQaFinalSourceSeed(qa.owner).seed);
});

test('183 transaction adaptation moves exactly its canonical RR and optional READ ONLY characteristics before all queries and rejects phase drift',()=>{
 const isolation='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',phase={begin:'BEGIN',statements:['SET TRANSACTION READ ONLY',isolation,'SELECT 1'],completion:'COMMIT',readOnly:true};assert.deepEqual(mixedQaAdmissionPhase(phase),{statements:['SELECT 1'],options:{readOnly:true,end:'COMMIT'}});assert.deepEqual(phase.statements,['SET TRANSACTION READ ONLY',isolation,'SELECT 1']);
 for(const changed of[{...phase,begin:'BEGIN READ COMMITTED'},{...phase,readOnly:false},{...phase,completion:'END'},{...phase,statements:['SELECT 1']},{...phase,statements:['SET TRANSACTION READ ONLY','SET TRANSACTION READ ONLY',isolation]},{...phase,statements:['SET TRANSACTION READ WRITE',isolation]},{...phase,statements:['SET TRANSACTION READ ONLY','SET TRANSACTION ISOLATION LEVEL SERIALIZABLE']},{...phase,statements:[isolation,'SET TRANSACTION READ ONLY']}])assert.throws(()=>mixedQaAdmissionPhase(changed));
 assert.deepEqual(mixedQaAdmissionPhase({begin:'BEGIN',statements:[isolation,'SELECT 2'],completion:'ROLLBACK',readOnly:false}),{statements:['SELECT 2'],options:{readOnly:false,end:'ROLLBACK'}});
});

test('pre183 requires one of its three exact old tuple CHECK errors without assuming PostgreSQL CHECK evaluation order',()=>{
 const error=constraint=>'psql:fixture.sql:34: ERROR:  new row for relation "grh_final_source_revision" violates check constraint "'+constraint+'"\r\nDETAIL:  exclusively fictional row\r\n';
 for(const component of['profile','sha256','cutoff']){const constraint='grh_final_source_revision_source_'+component+'_check';assert.deepEqual(assertMixedQaPreAdmissionFailure({status:3,stderr:error(constraint)}),{refused:true,constraint});assert.deepEqual(assertMixedQaPreAdmissionFailure({status:3,stderr:error(constraint),sqlState:'23514'}),{refused:true,constraint});assert.throws(()=>assertMixedQaPreAdmissionFailure({status:3,stderr:error(constraint),sqlState:'23505'}));}
 for(const bad of[{status:0,stderr:error('grh_final_source_revision_source_cutoff_check')},{status:3,stderr:error('grh_final_source_revision_source_tuple_check')},{status:3,stderr:error('unrelated_check')},{status:3,stderr:error('grh_final_source_revision_source_cutoff_check').replace('grh_final_source_revision"','other_relation"')},{status:3,stderr:error('grh_final_source_revision_source_cutoff_check').replace('new row for relation','query on relation')},{status:3,stderr:error('grh_final_source_revision_source_cutoff_check')+error('grh_final_source_revision_source_profile_check')},{status:3,stderr:'ERROR:  syntax error\nCONTEXT: '+error('grh_final_source_revision_source_cutoff_check')}])assert.throws(()=>assertMixedQaPreAdmissionFailure(bad));
});
