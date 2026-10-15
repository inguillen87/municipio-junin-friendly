import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{IncomingMessage,ServerResponse}from'node:http';
import{buildOwnerDecisionQa,ownerDecisionQaEmbeddedPins,ownerDecisionQaHash,ownerDecisionQaColumnAudit}from'../scripts/lib/municipal-owner-adoption-decision-qa.mjs';
import{ownerDecisionQaHttp,ownerDecisionQaQuery,ownerDecisionQaTransaction}from'../scripts/verify-municipal-owner-adoption-decision.mjs';
import{ownInstallationFunctionPin}from'../scripts/lib/own-payroll-installation.mjs';
import{ownerAdoptionFixture}from'./fixtures/municipal-owner-adoption-synthetic.js';
import{sealAdoptionReview}from'../assets/employment-adoption-review-model.js';
import{ownerDecisionCommand,ownerDecisionPreview}from'../assets/municipal-adoption-owner-decision-model.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),sourceCommit='a'.repeat(40),schema='mc_qa_fixed_092_'+'b'.repeat(32);
const qa=buildOwnerDecisionQa({major:17,sourceCommit,read,schema});
const body=d=>/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?$/.exec(d)[2];

test('wire previews require client verification after HTTP serialization and reject a changed raw-review seal',async()=>{
 const fixture=await ownerAdoptionFixture(1),review=await sealAdoptionReview(fixture.stage.rawReview),payload={...fixture.stage.preview,review};
 await ownerDecisionQaHttp(async(_req,res)=>res.json(payload),async url=>{
  const wire=await(await fetch(url)).json(),expected={...fixture.authorization,source:review.source.finalRevision};
  assert.throws(()=>ownerDecisionCommand(fixture.command,{preview:wire}));
  const verified=await ownerDecisionPreview(wire,expected);assert.deepEqual(ownerDecisionCommand(fixture.command,{preview:verified}),fixture.command);
  await assert.rejects(ownerDecisionPreview({...wire,rawReviewSha256:'f'.repeat(64)},expected));
 });
});

test('source-derived fixture resolves every reviewed readiness/authority prerequisite without an observed pin',()=>{
 assert.ok(qa.graph.desired.length>200);for(const p of qa.graph.desired)assert.ok(qa.graph.pool.has(p.signature+'|'+p.sha256),p.signature);
 assert.equal(qa.connects,false);assert.equal(qa.executesSql,false);assert.equal(qa.base.connects,undefined);
 for(const d of [...qa.base.originals,...qa.base.supportDefinitions])assert.ok(qa.definitions.some(s=>body(s)===body(d)),'canonical authority and support body retained');
 for(const p of [...qa.graph.batch.authority.prerequisitePins,...qa.graph.batch.authority.supportPins]){const d=qa.definitions.find(d=>d.startsWith('CREATE FUNCTION public.'+p.name+'('));assert.ok(d,p.signature);assert.equal(ownInstallationFunctionPin(d).signature,p.signature);assert.equal(ownerDecisionQaHash(body(d)),p.sha256);}
 assert.equal(qa.definitions.filter(d=>d.startsWith('CREATE FUNCTION public.tenant_iam_reviewed_operational_pair_v1(')).length,1);
 assert.doesNotMatch(qa.definitions.find(d=>d.startsWith('CREATE FUNCTION public.tenant_iam_reviewed_operational_pair_v1(')),/employee\.catalog\.approve/);
 assert.equal(qa.definitions.filter(d=>/FUNCTION public\.own_novelty_/.test(d)).length,16);
 assert.equal(qa.definitions.filter(d=>/FUNCTION public\.grh_final_source_/.test(d)).length,9);
});
test('relocation derives nested readiness digests only from relocated source bodies',()=>{
 const b=qa.graph.batch;for(const d of[b.originalReady,b.ready,...b.definitions,...b.changedPins.map(p=>p.name==='municipal_adoption_ready_v1'?b.ready:b.guard)])assert.equal(qa.hashes[ownerDecisionQaHash(body(d))],ownerDecisionQaHash(body(qa.normalized(d))));
 assert.ok(qa.normalized(b.ready).includes('$qa_public$public.$qa_public$'));
 assert.ok(!qa.normalized(b.ready).includes('public.employment_adoption_decision_guard_v1'));
 for(const d of qa.definitions){const header=d.slice(0,d.indexOf(body(d)));assert.ok(!/SET (?:search_path|"TimeZone") TO/.test(header));}
 const node=qa.definitions.find(d=>d.startsWith('CREATE FUNCTION public.own_program_node_v2('));assert.ok(qa.normalized(node).includes('SET search_path=pg_catalog,'+schema+',public,pg_temp'));
 for(const quotes of["'","''","''''"])assert.equal(qa.relocate(quotes+'public'+quotes+'::regnamespace'),quotes+schema+quotes+'::regnamespace');
 for(const statement of Object.values(qa.local).flat())assert.ok(!/('+)public\1::regnamespace/.test(statement));
 assert.equal(qa.relocate('pg_get_indexdef(i.indexrelid)'),`replace(pg_get_indexdef(i.indexrelid),$qa_namespace$${schema}.$qa_namespace$,$qa_public$public.$qa_public$)`);
});
test('source metadata pins, original raw-review hash and exact four-phase protocol survive relocation',()=>{
 assert.deepEqual(Object.fromEntries(Object.entries(qa.local).map(([k,v])=>[k,v.length])),{rehearsal:9,installation:9,repetition:9,verification:4,rollback:23,rollbackVerification:2});
 assert.deepEqual(qa.local.rehearsal,qa.local.installation);assert.ok(qa.local.repetition[1].includes("'verify'"));assert.ok(qa.local.installation[1].includes("'install'"));
 assert.ok(qa.local.verification[0].includes('transaction_read_only'));assert.ok(qa.local.rollback.some(s=>s.includes('OWNER_DECISION185_ROLLBACK_HAS_HISTORY')));
 assert.ok(qa.local.installation.join('\n').includes('rawReviewSha256'));assert.ok(!qa.local.rollback.some(s=>/^\s*(?:DELETE|TRUNCATE)\b|^DROP[^;]*\bCASCADE\b/.test(s)));
 const trigger=qa.local.rollback.findIndex(s=>s.startsWith('DROP TRIGGER municipal_owner_adoption_provenance_before ON ')),guard=qa.local.rollback.findIndex(s=>s.startsWith('DROP FUNCTION '+schema+'.municipal_owner_adoption_provenance_guard_v1('));assert.ok(trigger>=0&&guard>trigger);
});
test('source inventory reads complete five physical GRH declarations and retains all65 synthetic records',()=>{
 assert.equal(qa.syntheticCounts.source,65);assert.equal(qa.rows.length,65);assert.equal(qa.rows.filter(r=>r.active).length,63);assert.equal(qa.rows.filter(r=>!r.active).length,2);
 for(const t of['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'])assert.ok(qa.tables.tables.includes(t));
 assert.ok(qa.seed.includes('person_id bigint'));assert.ok(qa.rows.every(r=>Number.isSafeInteger(r.sourcePersonId)));assert.ok(qa.seed.includes("source_entity,source_id,source_batch_id,canonical_entity"));
 assert.ok(qa.seed.includes('grh_core_source_base_fingerprint_v1'));assert.ok(qa.seed.includes('grh_curated_source_base_fingerprint_v1'));assert.ok(qa.seed.includes('grh_final_source_fingerprint_v1'));
 assert.ok(!qa.seed.includes('allow-source-drift'));assert.ok(qa.sourceHashes['scripts/internal-schema.sql']);
});
test('canonical protections and table revocations run before source rows and seal inserts',()=>{
 const firstSource=qa.seed.indexOf('INSERT INTO grh_employees'),finalSeal=qa.seed.indexOf('INSERT INTO grh_final_source_seal');
 for(const name of['employment_adoption_decision_applied','employment_adoption_application_applied','own_novelty_immutable','native_employee_registration_immutable','native_employee_person_guard','grh_curated_seal_validation','a_final_revision_guard'])assert.ok(qa.seed.indexOf(name)<firstSource,name);
 assert.ok(qa.seed.indexOf('REVOKE ALL ON '+schema+'.grh_final_source_revision')<finalSeal);
 assert.ok(qa.seed.indexOf('END $triggers$')<finalSeal);
 assert.ok(qa.seed.includes('ALTER TABLE employment_contract ALTER COLUMN source_batch_id DROP NOT NULL'));
 assert.ok(qa.seed.includes('ADD CONSTRAINT employment_contract_origin_ck'));
 assert.ok(qa.seed.indexOf('ADD COLUMN IF NOT EXISTS jurisdiction_code text')<firstSource);
 assert.ok(qa.seed.includes('employment_contract_native_jurisdiction_ck'));
 assert.ok(!qa.seed.includes("'active','2000-01-01','1','1','1','1','42')"));
 assert.ok(qa.seed.includes('SELECT native_employment_catalog_items_v1('));
 assert.ok(qa.seed.includes('categories:1:1'));assert.ok(qa.seed.includes('agreements::1'));
});
test('independent checker is a different real account/membership/person, without platform ownership',()=>{
 for(const k of['actorEmail','membershipId','actorSessionId'])assert.notEqual(qa.actor[k],qa.checker[k]);assert.notEqual(qa.ids.person,qa.ids.checkerPerson);
 assert.ok(qa.seed.includes("'QA_ADOPTION_CHECKER'"));assert.ok(qa.seed.includes("'employee.record.approve'"));assert.ok(!qa.seed.includes("VALUES('QA_AUTHORITY_OPERATOR','employee.record.approve')"));
 const hints=[...qa.graph.pinHints.values()].filter(p=>p.name==='municipal_adoption_command_v1');assert.ok(hints.some(p=>p.runtime));
 assert.ok(qa.seed.includes('GRANT EXECUTE ON FUNCTION '+schema+'.municipal_adoption_command_v1'));
});
test('all declared native ledgers retain canonical RLS and179 retains its full trigger/index prerequisite',()=>{
 for(const table of qa.tables.tables.filter(t=>/^(?:own_|native_salary_event$)/.test(t)))assert.ok(qa.seed.includes('ALTER TABLE '+schema+'.'+table+' ENABLE ROW LEVEL SECURITY')||qa.seed.includes('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY'),table);
 const source=read('scripts/migrations/179-own-agreement-working-time.sql').replace(/\r\n?/g,'\n');
 for(const m of source.matchAll(/CREATE (?:UNIQUE INDEX|TRIGGER) (\w+)/g))assert.ok(qa.seed.includes(m[0]),m[1]);
});
test('embedded closed pins reject malformed and unrelated arrays',()=>{
 assert.deepEqual(ownerDecisionQaEmbeddedPins('[{"name":"x","signature":"public.x()","sha256":"a"}]'),[{name:'x',signature:'public.x()',sha256:'a'}]);assert.deepEqual(ownerDecisionQaEmbeddedPins('[{"name":"x","text":"["}]'),[]);assert.deepEqual(ownerDecisionQaEmbeddedPins('[{"name":broken}]'),[]);
});
test('static physical-column audit covers every fixture declaration and actual insert/typed references',()=>{
 assert.deepEqual(qa.columnAudit.unknown,[]);assert.ok(qa.columnAudit.checkedReferences>1000);
 assert.ok(qa.columnAudit.tables.employment_contract.includes('jurisdiction_code'));assert.ok(qa.columnAudit.tables.internal_users.includes('updated_at'));assert.ok(qa.columnAudit.tables.platform_user_role.includes('version'));
 const fixture='CREATE TABLE public.employee(id uuid, jurisdiction_code text);';
 const valid='CREATE FUNCTION public.example() RETURNS void LANGUAGE plpgsql AS $$ DECLARE r public.employee;BEGIN SELECT e.jurisdiction_code FROM public.employee e;INSERT INTO public.employee(id,jurisdiction_code) VALUES(NULL,NULL);END $$';
 assert.deepEqual(ownerDecisionQaColumnAudit(fixture,[valid]).unknown,[]);
 const missing=ownerDecisionQaColumnAudit(fixture.replace(', jurisdiction_code text',''),[valid]);assert.ok(missing.unknown.some(v=>v.column==='jurisdiction_code'&&v.kind==='insert'));assert.ok(missing.unknown.some(v=>v.column==='jurisdiction_code'&&v.kind==='reference'));
 assert.deepEqual(ownerDecisionQaColumnAudit(fixture,[valid.replace('e.jurisdiction_code','e.id')]).unknown,[]);
});
test('source substitutions refuse a changed approved185 source before preparing SQL',()=>{
 assert.throws(()=>buildOwnerDecisionQa({major:17,sourceCommit,read:p=>read(p)+(p==='scripts/migrations/185-municipal-owner-adoption-decision.sql'?'\n-- unreviewed drift':'')}),/OWNER_DECISION185_SOURCE_CHANGED/);
});
test('unknown destination major and non-owned schema are rejected without SQL',()=>{
 assert.throws(()=>buildOwnerDecisionQa({major:16,sourceCommit,read}));assert.throws(()=>buildOwnerDecisionQa({major:17,sourceCommit,read,schema:'public'}));
});
test('RPC adapter preserves literal JSON and UUID values and refuses arbitrary SQL',()=>{
 const input=JSON.stringify({reason:"Prueba ' literal $() sin ejecución"}),sql=ownerDecisionQaQuery('SELECT public.municipal_owner_adoption_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',[input,'{}','abcdef00-0000-4000-8000-000000000001'],schema);
 assert.ok(sql.includes("Prueba '' literal $() sin ejecución"));assert.ok(sql.startsWith('SELECT '+schema+'.'));assert.throws(()=>ownerDecisionQaQuery('DELETE FROM public.employment_contract',[],schema));assert.throws(()=>ownerDecisionQaQuery('SELECT public.municipal_owner_adoption_preview_v1($1::jsonb,$2::uuid) AS result',['{}'],schema));
});
test('technical184 seed and185 phases use RR; locking runtime commands use RC and independent verification uses READ ONLY',()=>{
 const make=(statements,options={})=>ownerDecisionQaTransaction({schema,pins:'IF false THEN RAISE EXCEPTION \'synthetic\';END IF;',statements,...options});
 for(const phase of['rehearsal','installation','repetition','rollback'])assert.ok(make(qa.local[phase]).startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ;'));
 assert.ok(make([qa.seed]).startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ;'));assert.ok(make(qa.local.rehearsal,{end:'ROLLBACK'}).endsWith(';ROLLBACK;'));
 for(const phase of['verification','rollbackVerification'])assert.ok(make(qa.local[phase],{readOnly:true}).startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;'));
 assert.ok(make(['SELECT synthetic_locking_rpc()'],{command:true}).startsWith('BEGIN ISOLATION LEVEL READ COMMITTED;'));
 assert.throws(()=>make(['SELECT synthetic_locking_rpc()'],{command:true,readOnly:true}),/LOCKS_REQUIRE_WRITABLE/);
 assert.throws(()=>make([],{end:'COMMIT;DROP SCHEMA public'}));
});
test('HTTP transport preserves actual Node request/response and complete large streamed response',async()=>{
 const content='x'.repeat(192*1024);await ownerDecisionQaHttp(async(req,res)=>{assert.ok(req instanceof IncomingMessage);assert.ok(res instanceof ServerResponse);assert.equal(req.headers.accept,'application/json');assert.equal(req.query.resource,'authority');res.status(200).setHeader('Content-Type','application/json');res.write('{"value":"');for(let offset=0;offset<content.length;offset+=4096)if(!res.write(content.slice(offset,offset+4096)))await new Promise(resolve=>res.once('drain',resolve));res.end('"}');},async base=>{const response=await fetch(base+'/?resource=authority',{headers:{Accept:'application/json'}});assert.equal(response.status,200);assert.deepEqual(await response.json(),{value:content});});
});
test('HTTP transport preserves explicit handler failures without inventing a successful response',async()=>{
 await ownerDecisionQaHttp(async(req,res)=>res.status(503).json({ok:false,code:'SYNTHETIC_NOT_READY'}),async base=>{const response=await fetch(base);assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,code:'SYNTHETIC_NOT_READY'});});
});
