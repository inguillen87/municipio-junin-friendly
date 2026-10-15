import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import{buildMunicipalOwnerAdoptionDecisionInstallation,deriveMunicipalOwnerAdoptionDecisionWriter,assertMunicipalOwnerAdoptionDecisionDurability,ownerDecision185Snapshot,OWNER_ADOPTION_DECISION_SOURCE_PINS,OWNER_ADOPTION_DECISION_SQL}from'../scripts/lib/municipal-owner-adoption-decision-installation.mjs';
import{splitPostgresStatements}from'../scripts/lib/sql-statements.mjs';import{ownInstallationFunctionPin}from'../scripts/lib/own-payroll-installation.mjs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8'),sourceCommit='a'.repeat(40),hash=value=>createHash('sha256').update(value).digest('hex');
let prepared;const build=()=>prepared??=buildMunicipalOwnerAdoptionDecisionInstallation({read,sourceCommit});
const definition=name=>build().definitions.find(d=>d.startsWith('CREATE FUNCTION public.'+name+'('));

test('185 preparation changes only the two guarded consumers and adds one private append-only audit table',()=>{
 const b=build();assert.equal(b.newTables,1);assert.equal(b.newFunctions,13);assert.equal(b.adaptedFunctions,2);assert.equal(b.existingAclChanges,0);assert.equal(b.businessWrites,0);assert.equal(b.identityWrites,0);assert.equal(b.iamWrites,0);assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 assert.deepEqual(b.changedPins.map(p=>p.name),['employment_adoption_decision_guard_v1','municipal_adoption_ready_v1']);
 assert.deepEqual(b.newPins.filter(p=>p.runtime).map(p=>p.name).sort(),['municipal_owner_adoption_attempt_v1','municipal_owner_adoption_command_v1','municipal_owner_adoption_preview_v1']);
 assert.ok(b.newPins.filter(p=>!p.runtime).every(p=>p.definer));assert.equal(b.mutations.filter(s=>/^CREATE TABLE /.test(s)).length,1);
 assert.match(b.mutations.at(-2),/^REVOKE ALL ON FUNCTION .* FROM PUBLIC,municontrol_actions_runtime_app$/);assert.match(b.mutations.at(-1),/^GRANT EXECUTE ON FUNCTION .* TO municontrol_actions_runtime_app$/);
 assert.doesNotMatch(b.mutations.join('\n'),/GRANT\s+.*\s+ON\s+TABLE|ALTER\s+(?:ROLE|USER)|INSERT\s+INTO\s+public\.(?:tenant_membership|platform_role|person_identity)|\b115\b/i);
 for(const[name,args]of[['preview',['p','target']],['command',['p','input','k']],['attempt',['p','k']]]){const p=b.newPins.find(p=>p.name==='municipal_owner_adoption_'+name+'_v1');assert.deepEqual(p.argNames,args);assert.deepEqual(p.config,['search_path=pg_catalog, public, pg_temp','TimeZone=UTC','lock_timeout=2s']);}
});

test('185 independent review is byte preserved and current composed writer is completely recoverable from the constrained owner fork',()=>{
 const b=build(),d=b.derived;assert.equal(b.guard.replace(b.guardPrefix,''),b.originalGuard);
 assert.match(b.originalGuard,/NEW.actor_membership_id=r.actor_membership_id OR NEW.actor_person_id=r.actor_person_id OR NEW.actor_email=r.actor_email/);
 let restored=d.writer.replace('public.municipal_owner_adoption_apply_v1(p jsonb,input jsonb,k uuid,owner_stage jsonb,owner_command jsonb)','public.employment_adoption_decide_v1(p jsonb,input jsonb,k uuid)')
 .replace("SET timezone='UTC' SET lock_timeout='2s' AS $$",()=>"SET timezone='UTC' AS $$").replaceAll('public.municipal_owner_adoption_context_v1(p)','public.employment_adoption_context_v1(p)')
 .replace(d.authority,d.independent).replace('  raw:=public.municipal_owner_adoption_source_for_proposal_v1(p,r);',d.sourceLine)
 .replace('   new_contract:=public.municipal_owner_adoption_after_v1(r,old_contract,new_contract);',d.afterLine)
 .replace(' PERFORM public.municipal_owner_adoption_record_v1(decision_id,owner_stage,owner_command);\n','');
 assert.equal(restored,b.legacyWriter);assert.equal(ownInstallationFunctionPin(restored).sha256,'7f3c86ccd71be4e494c17d210c6883ebf42ca45aa27c4f9418d04056fc908a8c');
 assert.ok(d.writer.includes('FOR f,entry IN SELECT x.v,(r.body->\'rows\')->(x.n::integer-1)'));assert.ok(d.writer.includes('SET CONSTRAINTS employment_adoption_application_applied,employment_adoption_decision_applied IMMEDIATE'));
 assert.ok(d.sourceRouter.includes(d.sourceLine.trim().slice('raw:='.length,-1)));assert.ok(d.afterRouter.includes('employment_adoption_final_after_v1'));
 assert.equal(b.mutations.some(s=>/^CREATE (?:OR REPLACE )?FUNCTION public.employment_adoption_decide_v1\(/.test(s)),false);
 for(const changed of[b.legacyWriter.replace('BEGIN\n','BEGIN\n-- changed\n'),b.legacyWriter.replace('employment_adoption_operational_source_v1','employment_adoption_active_source_v1'),b.legacyWriter.replace('changed<>r.total','changed<>2')])assert.throws(()=>deriveMunicipalOwnerAdoptionDecisionWriter(changed),/CURRENT_WRITER_CHANGED/);
 const old=splitPostgresStatements(read('scripts/migrations/133-employment-adoption-application.sql')).find(s=>s.startsWith('CREATE FUNCTION public.employment_adoption_decide_v1('));assert.ok(old);assert.throws(()=>deriveMunicipalOwnerAdoptionDecisionWriter(old),/CURRENT_WRITER_CHANGED/);
});

test('185 idempotent recovery precedes source refresh and returns current authorization separately from immutable original evidence',()=>{
 const command=definition('municipal_owner_adoption_command_v1'),attempt=definition('municipal_owner_adoption_attempt_v1'),context=definition('municipal_owner_adoption_context_v1');
 assert.ok(command.indexOf('RETURN public.municipal_owner_adoption_attempt_v1(p,k)')<command.indexOf('stage:=public.municipal_owner_adoption_preview_v1'));
 assert.ok(command.indexOf('pg_try_advisory_xact_lock')<command.indexOf('SELECT * INTO d'));
 assert.match(command,/v\.command IS DISTINCT FROM input OR v\.command_sha256 IS DISTINCT FROM public\.employment_adoption_hash_v1\(input\)/);
 for(const clause of["actor_membership_id=(ctx->>'membershipId')::uuid","d.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid","d.actor_email IS DISTINCT FROM ctx->>'actorEmail'","v.preview->'scope' IS DISTINCT FROM ctx#>'{ownerResolved,scope}'","'authorization',ctx->'ownerResolved'","'preview',v.preview,'rawReview',v.raw_review,'command',v.command","'receipt',v.receipt||jsonb_build_object('replayed',true)"])assert.ok(attempt.includes(clause),clause);
 assert.doesNotMatch(attempt,/source_for_proposal_v1\(|preview_v1\(|employment_adoption_facts_v1\(|INSERT\s+INTO|UPDATE\s+public\./i);
 assert.match(context,/resolved:=public\.municipal_owner_adoption_authority_v1\(p\)/);assert.match(context,/employment_adoption_administrative_context_v1\(p,'employee.record.propose'\)/);
 assert.doesNotMatch(read(OWNER_ADOPTION_DECISION_SQL),/INSERT[\s\S]{0,250}authorization|UPDATE[\s\S]{0,250}authorization/);
});

test('185 provenance cannot relabel earlier decisions and deferred guards require the real same-transaction actor and complete application',()=>{
 const guard=definition('municipal_owner_adoption_provenance_guard_v1'),deferred=definition('municipal_owner_adoption_decision_guard_v1'),check=definition('municipal_owner_adoption_provenance_check_v1'),sql=read(OWNER_ADOPTION_DECISION_SQL);
 assert.ok(guard.indexOf('d.applied_xid=pg_current_xact_id_if_assigned()')<guard.indexOf('provenance_check_v1(NEW)'));
 for(const clause of["d.decision IS DISTINCT FROM 'approve'","d.applied_xid IS DISTINCT FROM pg_current_xact_id_if_assigned()","n<>r.total","resolved:=public.municipal_owner_adoption_authority_v1(","resolved IS DISTINCT FROM jsonb_build_object('scope',v.preview->'scope','authority',v.preview->'authority')"])assert.ok(deferred.includes(clause),clause);
 assert.match(check,/v\.raw_review IS DISTINCT FROM r\.before_snapshot-'finalContracts'/);assert.match(check,/preview_value->>'rawReviewSha256' IS DISTINCT FROM public\.employment_adoption_hash_v1\(v\.raw_review\)/);
 assert.match(check,/v\.receipt IS DISTINCT FROM public\.municipal_owner_adoption_receipt_v1/);assert.match(check,/d\.body_sha256 IS DISTINCT FROM public\.employment_adoption_hash_v1\(d\.body\)/);
 assert.match(sql,/BEFORE UPDATE OR DELETE OR TRUNCATE .* FOR EACH STATEMENT EXECUTE FUNCTION public\.employment_adoption_immutable_v1\(\)/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);assert.match(sql,/REVOKE ALL ON public\.municipal_owner_adoption_provenance FROM PUBLIC,municontrol_actions_runtime_app/);
});

test('185 raw-fact and preview hashes bind the seven source pins without duplicating or trusting derived review observations',()=>{
 const preview=definition('municipal_owner_adoption_preview_v1'),receipt=definition('municipal_owner_adoption_receipt_v1'),record=definition('municipal_owner_adoption_record_v1');
 assert.ok(preview.includes("ARRAY['coreManifestSha256','curatedManifestSha256','cutoff','factsSha256','packageSha256','revisionId','sourceSha256']"));
 assert.match(preview,/raw-'queriedAt'-'today' IS DISTINCT FROM r\.before_snapshot-'queriedAt'-'today'/);
 assert.match(preview,/public\.employment_adoption_facts_v1\(r\) IS DISTINCT FROM s\.facts/);assert.match(preview,/employment_adoption_hash_v1\(s.facts\) IS DISTINCT FROM s.facts_sha256/);
 assert.match(preview,/'rawReviewSha256',public\.employment_adoption_hash_v1\(original\)/);assert.match(preview,/'previewSha256',public\.employment_adoption_hash_v1\(preview_value\)/);
 assert.doesNotMatch(preview,/observations|contractVersion|jsonb_build_object\('review'/);
 assert.match(receipt,/'decisionMode','owner','independence',false/);assert.match(receipt,/'source',raw#>'\{source,finalRevision\}'/);
 assert.match(record,/stage->'preview',stage->'rawReview',input,public\.employment_adoption_hash_v1\(input\)/);
});

test('185 command boundary is closed, normalized and does not accept a client actor, authority, false confirmation or arbitrary source',()=>{
 const sql=definition('municipal_owner_adoption_command_check_v1');
 assert.ok(sql.includes("ARRAY['catalogVersion','operation','previewSha256','proposalId','proposalVersion','reason','reviewConfirmed','reviewVersion','sourceContextVersion','version']"));
 for(const clause of["jsonb_typeof(input) IS DISTINCT FROM 'object'","input->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb","octet_length(input::text)>8192","length(input->>'proposalId')<>36","length(input->>'reason') NOT BETWEEN 10 AND 1000","normalize(input->>'reason',NFC)","jsonb_typeof(input->field_name) IS DISTINCT FROM 'string'"])assert.ok(sql.includes(clause),clause);
 assert.ok(sql.includes('\\2028\\2029'));assert.ok(sql.includes('\\FEFF'));assert.doesNotMatch(sql,/input->>'(?:actor|actorEmail|isOwner|authority|independence|bindingId|sourceSha256)'/);
});

for(const file of Object.keys(OWNER_ADOPTION_DECISION_SOURCE_PINS))test('185 refuses unreviewed prerequisite '+file,()=>{
 assert.throws(()=>buildMunicipalOwnerAdoptionDecisionInstallation({sourceCommit,read:path=>path===file?read(path)+'\n-- unreviewed\n':read(path)}),/OWNER_DECISION185_SOURCE_CHANGED/);
});

test('185 preparation refuses external connection, policy, actor, SQL and source overrides',()=>{
 for(const options of[null,{},[],{read,sourceCommit:'main'},{read,sourceCommit:sourceCommit+'\n'},...['host','policy','actor','input','execute','sourcePins','writer','target','databaseUrl'].map(k=>({read,sourceCommit,[k]:true}))])assert.throws(()=>buildMunicipalOwnerAdoptionDecisionInstallation(options));
 const windows=buildMunicipalOwnerAdoptionDecisionInstallation({sourceCommit,read:file=>read(file).replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n')});assert.deepEqual(windows.mutations,build().mutations);assert.deepEqual(windows.sourceHashes,build().sourceHashes);
});

test('185 table guards reject altered constraints, extra overloads, missing RLS, permissions, triggers, keys and index metadata',()=>{
 const object=build().objects;for(const clause of["p.proname LIKE 'municipal_owner_adoption_%'","<>13","NOT c.relforcerowsecurity","a.grantee<>c.relowner","a.attisdropped","k.contype<>'n'","<>10","pg_get_expr(k.conbin,k.conrelid)","k.confupdtype='a' AND k.confdeltype='a' AND k.confmatchtype='s'","i.indkey::text='1'","i.indexprs IS NULL AND i.indpred IS NULL","t.tgqual IS NOT NULL","RI_FKey_check_ins","RI_FKey_noaction_del"])assert.ok(object.includes(clause),clause);
});

test('185 four phases keep install and repeat modes distinct; verification inspects metadata without invoking locking resolvers or adopting',()=>{
 const b=build();for(const phase of[b.rehearsal,b.installation]){assert.equal(phase.length,9);assert.match(phase[1],/mode'\)<>'install'/);assert.equal(phase[3],b.before);assert.equal(phase[4],b.apply);assert.equal(phase[5],b.afterCheck);assert.equal(phase[7],b.audit);}
 assert.match(b.repetition[1],/mode'\)<>'verify'/);assert.match(b.apply,/IF current_setting\('municontrol_owner_decision185\.mode'\)='install'/);
 assert.equal(b.verification.length,4);assert.match(b.verification[0],/transaction_read_only'\)<>'on'/);assert.equal(b.verification[1],b.afterCheck);
 assert.doesNotMatch(b.verification.join('\n'),/SELECT public\.municipal_owner_adoption_(?:authority|preview|command|attempt)_v1\(/);
 assert.deepEqual(b.transactionContract,{rehearsal:'ROLLBACK',installation:'COMMIT',repetition:'COMMIT',verification:'READ ONLY',rollback:'COMMIT only without owner history'});
 for(const statement of[...b.rehearsal,...b.installation,...b.repetition,...b.verification,...b.rollback])assert.ok(splitPostgresStatements(statement).length>0);
 const proof=b.installation.at(-1);for(const metadata of["'columns'","'indexes'","'triggers'","'policies'","'constraints'","'policy'"])assert.ok(proof.includes(metadata));
 assert.notEqual(hash(b.beforeCheck),hash(b.afterCheck));assert.ok(b.afterCheck.includes(b.changedPins[0].sha256));assert.ok(b.afterCheck.includes(b.changedPins[1].sha256));
});

test('185 preservation covers prior leave/IAM/data, narrowly audits its new FK triggers, and technical rollback refuses owner history',()=>{
 const b=build();for(const slot of['before','after']){const s=ownerDecision185Snapshot(slot,b.newPins,b.changedPins);assert.doesNotMatch(s,/native_leave_event|proname LIKE 'native_leave_%'/);for(const text of["p.relkind IN ('r','p','m')",'pg_auth_members','pg_policy',"fk.conrelid=to_regclass('public.municipal_owner_adoption_provenance')","to_jsonb(p)-'prosrc'"])assert.ok(s.includes(text),text);}
 assert.throws(()=>ownerDecision185Snapshot('skip',b.newPins,b.changedPins));assert.match(b.audit,/before'\)::jsonb IS DISTINCT FROM current_setting/);
 const rollback=b.rollback.join('\n');assert.ok(rollback.indexOf('OWNER_DECISION185_ROLLBACK_HAS_HISTORY')<rollback.indexOf('DROP FUNCTION'));
 const triggerDrop=b.rollback.indexOf('DROP TRIGGER municipal_owner_adoption_provenance_before ON public.municipal_owner_adoption_provenance');
 const guardDrop=b.rollback.indexOf('DROP FUNCTION public.municipal_owner_adoption_provenance_guard_v1()');
 assert.ok(triggerDrop>2&&guardDrop>triggerDrop,'remove the empty technical table trigger before its referenced function');
 assert.ok(b.rollback.indexOf('DROP TABLE public.municipal_owner_adoption_provenance')>guardDrop,'retain the table type until its function dependents are removed');
 assert.ok(rollback.includes(b.originalGuard.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ')));assert.ok(rollback.includes(b.originalReady.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION ')));
 assert.doesNotMatch(rollback,/\bCASCADE\b|\bDELETE\s+FROM\b|\bTRUNCATE\s+public\./i);assert.equal(b.rollbackVerification[1],b.beforeCheck);
});

test('185 executable readiness agrees with the current176/179 novelty prerequisite and preserves the historical before/rollback body',()=>{
 const b=build(),source=b.period.prerequisites.find(p=>p.signature==='public.own_novelty_sources_v1(jsonb,date,text,uuid[])');
 const embedded=[...b.ready.matchAll(/\{"name":"own_novelty_sources_v1","signature":"[^"]+","sha256":"([a-f0-9]{64})"/g)].map(m=>m[1]);
 assert.ok(embedded.length>0);assert.deepEqual([...new Set(embedded)],[source.sha256]);
 assert.doesNotMatch(b.ready,/b2b0a8339bd275e511f2e7fe53c74d1b02763fcf19ddd61772a74dca0d6ed2e0/);
 assert.ok(b.rollback.includes(b.originalReady.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION ')));
 assert.ok(b.beforeCheck.includes(b.period.afterPins.find(p=>p.name==='municipal_adoption_ready_v1').sha256));
});

test('185 durability refuses metadata, source, phase or conservation errors and permits unrelated row changes between connections',()=>{
 const batch=build(),proof=(mode,preserved=true)=>({version:batch.version,sourceCommit,sourceHashes:structuredClone(batch.sourceHashes),mode,policy:structuredClone(batch.policy),newTables:1,newFunctions:13,adaptedFunctions:2,businessWrites:0,identityWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0,transactionDataPreserved:preserved,preservationSha256:'b'.repeat(64),priorMetadataSha256:'e'.repeat(64),objectSha256:'c'.repeat(64)});
 const evidence=()=>({batch,installed:proof('install'),durable:proof('verify',false),repeated:proof('verify')});assert.equal(assertMunicipalOwnerAdoptionDecisionDurability(evidence()).ok,true);
 for(const change of[p=>p.objectSha256='d'.repeat(64),p=>p.priorMetadataSha256='d'.repeat(64),p=>p.transactionDataPreserved=!p.transactionDataPreserved,p=>p.sourceCommit='d'.repeat(40),p=>p.policy.sha256='d'.repeat(64),p=>delete p.sourceHashes[OWNER_ADOPTION_DECISION_SQL],p=>p.mode='install',p=>p.businessWrites=1,p=>p.identityWrites=1,p=>p.iamWrites=1,p=>p.nominalRowsReturned=1,p=>p.newFunctions=14,p=>p.existingAclChanges=1,p=>p.extra=true,p=>p.preservationSha256+='\n'])for(const phase of['durable','repeated']){const wrong=evidence();change(wrong[phase]);assert.throws(()=>assertMunicipalOwnerAdoptionDecisionDurability(wrong));}
 const concurrent=evidence();concurrent.durable.preservationSha256='f'.repeat(64);concurrent.repeated.preservationSha256='a'.repeat(64);assert.equal(assertMunicipalOwnerAdoptionDecisionDurability(concurrent).wholeDatabaseStaticAcrossConnections,false);
 assert.throws(()=>assertMunicipalOwnerAdoptionDecisionDurability({...evidence(),repeated:undefined}));assert.throws(()=>assertMunicipalOwnerAdoptionDecisionDurability({...evidence(),installed:proof('verify')}));
});
