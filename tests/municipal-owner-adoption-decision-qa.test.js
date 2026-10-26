import{buildOwnReportCensus067RuntimeFixture}from'../scripts/lib/own-payroll-report-census-067-runtime-fixture.mjs';
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{IncomingMessage,ServerResponse}from'node:http';
import{buildOwnerDecisionQa,buildOwnerDecisionQaDefinitions,ownerDecisionQaEmbeddedPins,ownerDecisionQaHash,ownerDecisionQaColumnAudit}from'../scripts/lib/municipal-owner-adoption-decision-qa.mjs';
import{ownerDecisionQaHttp,ownerDecisionQaQuery,ownerDecisionQaTransaction}from'../scripts/verify-municipal-owner-adoption-decision.mjs';
import{ownInstallationFunctionPin}from'../scripts/lib/own-payroll-installation.mjs';
import{buildOwnCloseSql}from'../scripts/lib/own-payroll-close-sql.mjs';
import{buildSalaryAuxiliaryNamespaceSql}from'../scripts/lib/salary-auxiliary-namespace-installation.mjs';
import{composeOwnFullCapacity190Installation}from'../scripts/lib/own-payroll-full-capacity-190-installation.mjs';
import{splitPostgresStatements}from'../scripts/lib/sql-statements.mjs';
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

test('current native creation keeps the095 jurisdiction receipt in the graph and seed instead of compact067',()=>{
 const receipts=qa.definitions.filter(d=>d.startsWith('CREATE FUNCTION public.native_employee_receipt_v1('));assert.equal(receipts.length,1);
 const actual=receipts[0],pin=ownInstallationFunctionPin(actual),migration=read('scripts/migrations/095-native-employee-jurisdiction.sql').replace(/\r\n?/g,'\n');
 const expected=/CREATE OR REPLACE FUNCTION public\.native_employee_receipt_v1\(r native_employee_registration\) RETURNS jsonb[\s\S]*?\bAS (\$\$[\s\S]*?\$\$);/.exec(migration);assert.ok(expected);
 assert.equal(pin.sha256,'1a57c2445f344f37d59c8c798237efefa0bb4671d101d9a177744c8fbac2c18e');assert.equal(body(actual),body(expected[0]));
 assert.match(body(actual),/CASE WHEN c\.jurisdiction_code IS NULL THEN '\{\}'::jsonb ELSE jsonb_build_object\('jurisdictionCode',c\.jurisdiction_code\) END/);
 const selected=qa.graph.desired.filter(p=>p.signature===pin.signature);assert.equal(selected.length,1);assert.equal(selected[0].sha256,pin.sha256);assert.equal(selected[0].runtime,false);
 const historical=JSON.parse(read('tests/fixtures/native-employee-installed-067.json')).functions.find(f=>f.name==='native_employee_receipt_v1');
 assert.equal(historical.sha256,'4e7160053e38011b59431a6113b0cd96239c6d863e008be032d9509656ccef86');assert.equal(ownerDecisionQaHash(historical.body),historical.sha256);assert.doesNotMatch(historical.body,/jurisdictionCode/);
 assert.ok(qa.graph.pool.has(pin.signature+'|'+historical.sha256));assert.ok(qa.graph.pool.has(pin.signature+'|'+pin.sha256));
 assert.ok(qa.seed.includes(qa.normalized(actual.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '))));
 assert.ok(qa.seed.includes('REVOKE ALL ON FUNCTION '+qa.relocate(pin.signature)+' FROM PUBLIC,municontrol_actions_runtime_app'));
 assert.ok(!qa.seed.includes('GRANT EXECUTE ON FUNCTION '+qa.relocate(pin.signature)+' TO municontrol_actions_runtime_app'));
});
test('canonical190 seeds the complete reviewed146 predecessor before the unchanged201 capacity preflight',()=>{
 const file='scripts/migrations/146-own-consolidated-annulment.sql',source=read(file).replace(/\r\n?/g,'\n');
 assert.equal(ownerDecisionQaHash(source),'8337df26dc3c22fe8c156e19d7511db6c537f08b219633f6add981c774a48fe6');assert.equal(qa.sourceHashes[file],ownerDecisionQaHash(source),'146 must enter the actual canonical source closure');
 const definitions=qa.definitions.filter(d=>d.startsWith('CREATE FUNCTION public.own_annul_')),byName=new Map(definitions.map(d=>{const p=ownInstallationFunctionPin(d);return[p.name,{definition:d,pin:p}];}));assert.equal(definitions.length,5);
 const expected=[['own_annul_immutable_v1','674be08de85b0719bb676f9623ff0e93c8a5ef51f658d68e8e9abadc33fc6ac6',false],['own_annul_detail_v1','a0ac76f463360ad15daec6aa8b6f21e28c241bec48c5d45048140519eb1cabe0',true],['own_annul_selected_v1','e191fd94787a93e809e79b97d751b1c9c9371833eb7275fe4d3c272eceeadd31',false],['own_annul_attempt_v1','f09145af9a84cd88483b2c8cef3df711cc7328775798e2977a1d487f6d1e4a8d',true],['own_annul_command_v1','a8f41f70ef76c9266348721fa531b78e115c793921491b35ace436737b16c92f',true]];
 const sql201=read('scripts/migrations/201-own-full-payroll-decision-capacity.sql'),end=sql201.indexOf('END $capacity_preflight$;');assert.ok(end>0);const preflight=sql201.slice(0,end);
 for(const [name,sha256,runtime] of expected){
  const current=byName.get(name);assert.ok(current,name);const {definition,pin}=current;assert.equal(pin.sha256,sha256,name+' exact146 body');assert.equal(qa.graph.pool.get(pin.signature+'|'+sha256),definition);
  const selected=qa.graph.desired.filter(p=>p.signature===pin.signature);assert.equal(selected.length,1);assert.equal(selected[0].sha256,sha256);assert.equal(selected[0].runtime,runtime,name+' source-declared146 ACL');
  assert.ok(qa.seed.includes(qa.normalized(definition.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '))),name+' is installed by the existing canonical seed, not merely discoverable in an auxiliary pool');
  assert.ok(qa.seed.includes('REVOKE ALL ON FUNCTION '+qa.relocate(pin.signature)+' FROM PUBLIC,municontrol_actions_runtime_app'));
  assert.equal(qa.seed.includes('GRANT EXECUTE ON FUNCTION '+qa.relocate(pin.signature)+' TO municontrol_actions_runtime_app'),runtime);
  if(name!=='own_annul_immutable_v1'){assert.ok(preflight.includes('"name":"'+name+'","signature":"'+pin.signature+'"'));assert.ok(preflight.includes('"bodySha256":"'+sha256+'"'),'unchanged201 preflight requires this exact146 predecessor');}
 }
 assert.ok(qa.tables.tables.includes('own_payroll_annul_event'));assert.ok(qa.tables.statements.some(s=>s.startsWith('CREATE TABLE public.own_payroll_annul_event(')));
 for(const token of ['CREATE TABLE public.own_payroll_annul_event(','ALTER TABLE public.own_payroll_annul_event ENABLE ROW LEVEL SECURITY','REVOKE ALL ON public.own_payroll_annul_event FROM PUBLIC,municontrol_actions_runtime_app','CREATE TRIGGER own_annul_event_immutable BEFORE UPDATE OR DELETE ON public.own_payroll_annul_event','CREATE TRIGGER own_annul_event_no_truncate BEFORE TRUNCATE ON public.own_payroll_annul_event'])assert.ok(qa.seed.includes(qa.relocate(token)),'complete146 table protection: '+token);
});

test('canonical190 preserves both125 close guards required by197 without reverting capture/readiness',()=>{
 const close=buildOwnCloseSql(read),expected=[['own_liquidation_command_v1','d9cb410d0ba21a298d50c23672e0afb9e3b661cc4fd23ba63175ab47c1eb3753','575d80c105d2ebf149e914bbfd975f21dbafa8c8bdd64d0eaf3e55ff357b96bc',true],['own_liquidation_rows_v1','c3698d0ea703d4d87028c5b414a1f244dfe0158bd2a8ff7caaeda115b89acb17','7220b153509fc944c787104ce52c12af15678b8db29dbebf1dbecb32f993ea25',false]];
 for(const[name,beforeSha,afterSha,runtime]of expected){
  const current=qa.definitions.find(d=>d.startsWith('CREATE FUNCTION public.'+name+'(')),before=close.before.find(d=>d.startsWith('CREATE FUNCTION public.'+name+'(')),after=close.adapted.find(d=>d.startsWith('CREATE OR REPLACE FUNCTION public.'+name+'('));
  assert.ok(current&&before&&after,name);assert.equal(ownerDecisionQaHash(body(before)),beforeSha);assert.equal(ownerDecisionQaHash(body(after)),afterSha);assert.equal(ownerDecisionQaHash(body(current)),afterSha,name+' retains the close125 protection');assert.ok(body(current)===body(after));
  const pin=ownInstallationFunctionPin(current),selected=qa.graph.desired.find(p=>p.signature===pin.signature);assert.equal(pin.sha256,afterSha);assert.equal(selected.sha256,afterSha);assert.equal(selected.runtime,runtime);
  assert.ok(qa.graph.pool.has(pin.signature+'|'+beforeSha));assert.ok(qa.graph.pool.has(pin.signature+'|'+afterSha));
  assert.deepEqual({...ownInstallationFunctionPin(before),sha256:null},{...ownInstallationFunctionPin(after),sha256:null},'signature and security metadata unchanged');
  assert.ok(qa.seed.includes(qa.normalized(current.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '))));
  assert.ok(qa.seed.includes('REVOKE ALL ON FUNCTION '+qa.relocate(pin.signature)+' FROM PUBLIC,municontrol_actions_runtime_app'));
  assert.equal(qa.seed.includes('GRANT EXECUTE ON FUNCTION '+qa.relocate(pin.signature)+' TO municontrol_actions_runtime_app'),runtime);
 }
 const rows=qa.definitions.find(d=>d.startsWith('CREATE FUNCTION public.own_liquidation_rows_v1(')),command=qa.definitions.find(d=>d.startsWith('CREATE FUNCTION public.own_liquidation_command_v1('));
 assert.match(rows,/own_close_active_v1/);assert.match(command,/PERFORM public\.own_close_guard_v1/);
});

test('a future early124 requirement cannot be silently overwritten by the125 seed selection',()=>{
 const before=buildOwnCloseSql(read).before.find(d=>d.startsWith('CREATE FUNCTION public.own_liquidation_rows_v1(')),pin=ownInstallationFunctionPin(before);
 const batch={...qa.graph.batch,originalReady:qa.graph.batch.originalReady+'\n-- '+JSON.stringify([pin])};
 assert.throws(()=>buildOwnerDecisionQaDefinitions({read,sourceCommit,batch}),/OWNER_DECISION_QA125_EARLY_EPOCH_DEPENDENCY/);
});

test('canonical seed owns the exact namespace close snapshot and resolves every201 predecessor from source',()=>{
 const namespace=buildSalaryAuxiliaryNamespaceSql({read,sourceCommit}),expected=namespace.changed.find(d=>d.startsWith('CREATE OR REPLACE FUNCTION public.own_close_snapshot_v1('));assert.ok(expected);
 const current=qa.definitions.filter(d=>d.startsWith('CREATE FUNCTION public.own_close_snapshot_v1('));assert.equal(current.length,1);assert.equal(body(current[0]),body(expected));
 const pin=ownInstallationFunctionPin(current[0]);assert.equal(pin.sha256,'11d46e478ab606b0a9d4602e83a072a16924e47d7b8d2da064ed1d7abd2885b0');
 assert.equal(qa.graph.pool.get(pin.signature+'|'+pin.sha256),current[0]);const selected=qa.graph.desired.find(p=>p.signature===pin.signature);assert.equal(selected.sha256,pin.sha256);assert.equal(selected.runtime,false);
 assert.ok(qa.seed.includes(qa.normalized(current[0].replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '))));
 assert.ok(qa.seed.includes('REVOKE ALL ON FUNCTION '+qa.relocate(pin.signature)+' FROM PUBLIC,municontrol_actions_runtime_app'));assert.ok(!qa.seed.includes('GRANT EXECUTE ON FUNCTION '+qa.relocate(pin.signature)+' TO municontrol_actions_runtime_app'));
 const original=splitPostgresStatements(buildOwnCloseSql(read).base).map(d=>d.replace(/^(?:\s*--[^\n]*(?:\n|$))+/g,'').trim()).find(d=>d.startsWith('CREATE FUNCTION public.own_close_snapshot_v1('));
 for(const before of [original,namespace.originals.find(d=>d.startsWith('CREATE OR REPLACE FUNCTION public.own_close_snapshot_v1('))]){assert.ok(before);const old=ownInstallationFunctionPin(before);assert.ok(qa.graph.pool.has(old.signature+'|'+old.sha256),'complete historical snapshot stays available');assert.deepEqual({...old,sha256:null},{...pin,sha256:null});}
 const h={read,sourceCommit,qa:{schema,operationalPairBaseline:'published107',normalized:qa.normalized,foundation:{foundation:{foundation:{owner:{graph:qa.graph}}}}}};
 const plan=composeOwnFullCapacity190Installation(h);assert.equal(plan.preLocal.length,11);assert.equal(plan.postLocal.length,27);assert.equal(plan.preLocal.find(p=>p.name===pin.name).runtime,false);
});

test('an earlier snapshot obligation cannot be overwritten by the namespace source selection',()=>{
 const pin=ownInstallationFunctionPin(qa.definitions.find(d=>d.startsWith('CREATE FUNCTION public.own_close_snapshot_v1('))),batch={...qa.graph.batch,originalReady:qa.graph.batch.originalReady+'\n-- '+JSON.stringify([{...pin,sha256:'02ef5825c524bb7b7168b2ec8f567c323482fee8ac7ac7fbfeba8071c37ee14f'}])};
 assert.throws(()=>buildOwnerDecisionQaDefinitions({read,sourceCommit,batch}),/OWNER_DECISION_QA_SNAPSHOT_EARLY_EPOCH_DEPENDENCY/);
});

test('physical-column aliases are scoped per statement and nested SELECT, including lateral JSON rows',()=>{
 const seed='CREATE TABLE public.employee(id uuid);';
 const audit=sql=>ownerDecisionQaColumnAudit(seed,['CREATE FUNCTION public.example() RETURNS void LANGUAGE plpgsql AS $$ DECLARE r public.employee;BEGIN '+sql+' END $$']).unknown;
 const json="SELECT e.value FROM jsonb_array_elements('[]'::jsonb) r CROSS JOIN LATERAL jsonb_array_elements(r.value) e;";
 assert.deepEqual(audit(json+'SELECT e.id FROM public.employee e;'),[]);
 assert.ok(audit(json+'SELECT e.missing FROM public.employee e;').some(x=>x.column==='missing'&&x.tables.includes('employee')));
 const ordinal="SELECT e.value,e.ordinal FROM jsonb_array_elements('[]'::jsonb) WITH ORDINALITY AS e(value,ordinal);";
 assert.deepEqual(audit(ordinal+'SELECT e.id FROM public.employee e;'),[]);
 assert.ok(audit(ordinal+'SELECT e.missing FROM public.employee e;').some(x=>x.column==='missing'));
 assert.ok(audit("SELECT e.missing,(SELECT e.value FROM jsonb_array_elements('[]'::jsonb) e) FROM public.employee e;").some(x=>x.column==='missing'));
 assert.ok(audit("SELECT e.value,(SELECT e.missing FROM public.employee e) FROM jsonb_array_elements('[]'::jsonb) e;").some(x=>x.column==='missing'));
 assert.ok(audit("SELECT (SELECT x.value FROM jsonb_array_elements('[]'::jsonb) x WHERE e.missing IS NULL) FROM public.employee e;").some(x=>x.column==='missing'));
 assert.deepEqual(audit('SELECT e.id FROM public.employee e;SELECT r.id;'),[]);
 assert.ok(audit('SELECT e.id FROM public.employee e;SELECT r.missing;').some(x=>x.column==='missing'));
 const parameterSql='CREATE FUNCTION public.example(e public.employee) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM e.missing;END $$';
 assert.ok(ownerDecisionQaColumnAudit(seed,[parameterSql]).unknown.some(x=>x.column==='missing'&&x.tables.includes('employee')));
 const unionJson=" UNION ALL SELECT e.value FROM jsonb_array_elements('[]'::jsonb) r CROSS JOIN LATERAL jsonb_array_elements(r.value) e;";
 assert.ok(audit('SELECT e.missing FROM public.employee e'+unionJson).some(x=>x.column==='missing'));
 assert.deepEqual(audit('SELECT e.id FROM public.employee e'+unionJson),[]);
});

test('canonical seed preserves all eight published124/125 facade grants on their final source bodies',()=>{
 const published=buildOwnerDecisionQa({major:17,sourceCommit,read,schema,operationalPairBaseline:'published107'});
 const groups=[
  ['scripts/migrations/124-own-payroll-liquidation-decisions.sql','03035e3f7e126b1561222f1a894bcf1000dd586b6d05fb579cb4722d9aa41f4a',[
   ['own_liquidation_bootstrap_v1','jsonb','cb2ff7973e93ad71e32045b2566a9bced4bac8a29fe71335aaf67b7482cc7a3b'],
   ['own_liquidation_detail_v1','jsonb,uuid','806b3743cfb193dbc96de8ea9924f348854f484cde1a255d1d195e41f7668ded'],
   ['own_liquidation_attempt_v1','jsonb,uuid','58a99622dc7c8270d18d5c01fab3d9a8ab8c3a480201c672e7972cd61ef0084b'],
   ['own_liquidation_command_v1','jsonb,jsonb,uuid','575d80c105d2ebf149e914bbfd975f21dbafa8c8bdd64d0eaf3e55ff357b96bc'],
  ]],
  ['scripts/migrations/125-own-payroll-close.sql','443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5',[
   ['own_close_detail_v1','jsonb,text,text','cf59ba377c978346872f88d3dfd144fac13d7c0615ec0ed289839451513b540f'],
   ['own_close_attempt_v1','jsonb,uuid','4a0b209001ef38f926e6fc36109820298fd041150ee28b1ae5824225c7858e25'],
   ['own_close_group_v1','jsonb,uuid','a3ce164f8ec9ebe298c76d4b9d88967f3add104457df7ca07f47d605faa75a86'],
   ['own_close_command_v1','jsonb,jsonb,uuid','eb3df3a03688835055b365ff58961f677210987e523ce973c9fa3441e5c30b94'],
  ]],
 ];
 const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/g,'').trim();
 for(const currentQa of [qa,published]){
  const emitted=splitPostgresStatements(currentQa.seed).map(clean);
  for(const[file,sourceSha,entries]of groups){
   const source=read(file).replace(/\r\n?/g,'\n');assert.equal(ownerDecisionQaHash(source),sourceSha);
   assert.equal(currentQa.sourceHashes[file],sourceSha);
   const original=splitPostgresStatements(source).map(clean),signatures=entries.map(([name,types])=>'public.'+name+'('+types+')');
   assert.ok(original.includes('GRANT EXECUTE ON FUNCTION '+signatures.join(',')+' TO municontrol_actions_runtime_app'));
   for(const[name,types,finalSha]of entries){
    const signature='public.'+name+'('+types+')',localSignature=currentQa.relocate(signature);
    const revoke='REVOKE ALL ON FUNCTION '+localSignature+' FROM PUBLIC,municontrol_actions_runtime_app';
    const grant='GRANT EXECUTE ON FUNCTION '+localSignature+' TO municontrol_actions_runtime_app';
    // Actual emitted ACL is the causal observation, not a pin boolean alone.
    assert.equal(emitted.filter(s=>s===grant).length,1,name+' emitted published facade GRANT');
    assert.equal(emitted.filter(s=>s===revoke).length,1,name+' emitted exact revocation first');
    assert.ok(emitted.indexOf(grant)>emitted.indexOf(revoke),name+' grants only after revoking inherited exposure');
    const definitions=currentQa.definitions.filter(d=>d.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(definitions.length,1,name);
    const definition=definitions[0],pin=ownInstallationFunctionPin(definition);
    assert.equal(pin.signature,signature);assert.equal(pin.sha256,finalSha,name+' keeps its current epoch body');
    const sourceDefinition=original.filter(d=>d.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(sourceDefinition.length,1);
    const originalPin=ownInstallationFunctionPin(sourceDefinition[0]);
    assert.deepEqual({...pin,sha256:null,runtime:null},{...originalPin,sha256:null,runtime:null},name+' preserves complete signature/security metadata');
    assert.ok(currentQa.graph.pool.has(signature+'|'+originalPin.sha256),name+' source predecessor remains available');
    assert.equal(currentQa.graph.pool.get(signature+'|'+finalSha),definition);
    const selected=currentQa.graph.desired.filter(p=>p.signature===signature);assert.equal(selected.length,1);
    assert.equal(selected[0].sha256,finalSha);assert.equal(selected[0].runtime,true);
    const expected=currentQa.normalized(definition.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '));
    assert.equal(emitted.filter(s=>s===expected).length,1,name+' actual emitted full definition, not only a discoverable pool pin');
    assert.ok(emitted.indexOf(expected)<emitted.indexOf(revoke),name+' ACL applied to the selected definition');
   }
  }
  for(const[name,types,sha256]of[
   ['own_close_snapshot_v1','jsonb,jsonb','11d46e478ab606b0a9d4602e83a072a16924e47d7b8d2da064ed1d7abd2885b0'],
   ['own_annul_selected_v1','jsonb,jsonb','e191fd94787a93e809e79b97d751b1c9c9371833eb7275fe4d3c272eceeadd31'],
  ]){
   const signature='public.'+name+'('+types+')',localSignature=currentQa.relocate(signature);
   const selected=currentQa.graph.desired.filter(p=>p.signature===signature);assert.equal(selected.length,1);
   assert.equal(selected[0].sha256,sha256);assert.equal(selected[0].runtime,false);
   assert.ok(emitted.includes('REVOKE ALL ON FUNCTION '+localSignature+' FROM PUBLIC,municontrol_actions_runtime_app'));
   assert.ok(!emitted.some(s=>s.startsWith('GRANT EXECUTE ON FUNCTION ')&&s.includes(localSignature)),name+' stays private even in grouped grants');
  }
 }
 assert.equal(ownerDecisionQaHash(read('scripts/migrations/201-own-full-payroll-decision-capacity.sql').replace(/\r\n?/g,'\n')),'46de1308360a076eff1453f57a9e4f4d6c14ba176d73cf8531b7b0821ed35b1b');
});

test('an earlier explicit private facade obligation is rejected instead of overwritten',()=>{
 const definition=qa.definitions.find(d=>d.startsWith('CREATE FUNCTION public.own_liquidation_detail_v1('));assert.ok(definition);
 const pin=ownInstallationFunctionPin(definition),batch={...qa.graph.batch,originalReady:qa.graph.batch.originalReady+'\n-- '+JSON.stringify([{...pin,runtime:false}])};
 assert.throws(()=>buildOwnerDecisionQaDefinitions({read,sourceCommit,batch}),/OWNER_DECISION_QA124125_EARLY_EPOCH_ACL_CONFLICT/);
});

test('all eleven201 predecessor ACLs agree with the emitted seed and separate200 facade',()=>{
 const h={read,sourceCommit,qa:{schema,operationalPairBaseline:'published107',normalized:qa.normalized,foundation:{foundation:{foundation:{owner:{graph:qa.graph}}}}}};
 const plan=composeOwnFullCapacity190Installation(h),emitted=splitPostgresStatements(qa.seed).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/g,'').trim());
 assert.equal(plan.preLocal.length,11);assert.equal(plan.preLocal.filter(p=>p.runtime).length,9);
 for(const p of plan.preLocal){
  const grant='GRANT EXECUTE ON FUNCTION '+p.signature+' TO municontrol_actions_runtime_app';
  const revoke='REVOKE ALL ON FUNCTION '+p.signature+' FROM PUBLIC,municontrol_actions_runtime_app';
  if(p.name==='own_close_report_census_v1'){
   assert.equal(p.runtime,true);assert.equal(plan.census.ownPin.runtime,true);
   assert.equal(plan.census.migration[1],'REVOKE ALL ON FUNCTION public.own_close_report_census_v1(jsonb,text,text) FROM PUBLIC,municontrol_actions_runtime_app');
   assert.equal(plan.census.migration[2],'GRANT EXECUTE ON FUNCTION public.own_close_report_census_v1(jsonb,text,text) TO municontrol_actions_runtime_app');
   assert.ok(plan.censusStatements.join('\n').includes(revoke));assert.ok(plan.censusStatements.join('\n').includes(grant));
  }else{
   assert.equal(emitted.filter(s=>s===revoke).length,1,p.name);
   assert.equal(emitted.filter(s=>s===grant).length,p.runtime?1:0,p.name+' actual201 predecessor exposure');
  }
 }
});

test('the QA seed preserves all three published067 facade ACLs and the final167 create body',()=>{
 const published=buildOwnerDecisionQa({major:17,sourceCommit,read,schema,operationalPairBaseline:'published107'});
 const entries=[
  ['native_employee_bootstrap_v1','jsonb','9a31f55e678327485aeb28ac49246b5cffcc348d60119077b07728fa5a967b02'],
  ['native_employee_attempt_v1','jsonb,uuid','68eba7e75a68d2150f54557d2f629b21154c8a69017e2817257b3d5b2d07d7f5'],
  ['native_employee_create_v1','jsonb,jsonb,text,uuid','6cf784e1b026c158548692c84c000592919a26f6aa42109807c0687f943158d6'],
 ];
 const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/g,'').trim();
 const source=read('scripts/migrations/067-native-employee-registration.sql').replace(/\r\n?/g,'\n');
 assert.equal(ownerDecisionQaHash(source),'aa33538cea459a275de8056b8316f3eb4465ebb88ad1de54578bb24380c4d749');
 const canonical=splitPostgresStatements(source).map(clean);
 assert.ok(canonical.includes('GRANT EXECUTE ON FUNCTION '+entries.map(([name,types])=>name+'('+types+')').join(',')+' TO municontrol_actions_runtime_app'));
 for(const currentQa of[qa,published]){
  const emitted=splitPostgresStatements(currentQa.seed).map(clean);
  for(const[name,types,sha256]of entries){
   const signature='public.'+name+'('+types+')',local=currentQa.relocate(signature);
   const revoke='REVOKE ALL ON FUNCTION '+local+' FROM PUBLIC,municontrol_actions_runtime_app';
   const grant='GRANT EXECUTE ON FUNCTION '+local+' TO municontrol_actions_runtime_app';
   assert.equal(emitted.filter(s=>s===revoke).length,1,name+' exact inherited revocation');
   assert.equal(emitted.filter(s=>s===grant).length,1,name+' actual emitted runtime grant');
   assert.ok(emitted.indexOf(grant)>emitted.indexOf(revoke));
   const definitions=currentQa.definitions.filter(d=>d.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(definitions.length,1);
   const definition=definitions[0],pin=ownInstallationFunctionPin(definition);
   assert.equal(pin.sha256,sha256,name+' current source epoch retained');
   assert.equal(pin.runtime,false,'generic own_program/own_run parser was not broadened');
   const sourceDefinitions=canonical.filter(d=>d.startsWith('CREATE OR REPLACE FUNCTION '+name+'('));assert.equal(sourceDefinitions.length,1);
   const sourcePin=ownInstallationFunctionPin(sourceDefinitions[0]);
   assert.deepEqual({...pin,sha256:null,runtime:null},{...sourcePin,sha256:null,runtime:null});
   assert.ok(currentQa.graph.pool.has(signature+'|'+sourcePin.sha256),'original067 remains in source history');
   const selected=currentQa.graph.desired.filter(p=>p.signature===signature);assert.equal(selected.length,1);
   assert.equal(selected[0].sha256,sha256);assert.equal(selected[0].runtime,true);
   const definitionSql=currentQa.normalized(definition.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '));
   assert.equal(emitted.filter(s=>s===definitionSql).length,1);assert.ok(emitted.indexOf(definitionSql)<emitted.indexOf(revoke));
  }
  for(const[name,types]of[
   ['native_employee_contract_guard_v1',''],['native_employee_person_guard_v1',''],
   ['native_employee_context_v1','jsonb,boolean'],['native_employee_catalog_v1','jsonb'],
   ['native_employee_next_number_v1','bigint'],['native_employee_receipt_v1','native_employee_registration'],
  ]){
   const local=currentQa.relocate('public.'+name+'('+types+')');
   assert.ok(emitted.includes('REVOKE ALL ON FUNCTION '+local+' FROM PUBLIC,municontrol_actions_runtime_app'));
   assert.ok(!emitted.some(s=>s.startsWith('GRANT EXECUTE ON FUNCTION ')&&s.includes(local)),name+' remains private');
  }
  const receipt=currentQa.graph.desired.find(p=>p.signature==='public.native_employee_receipt_v1(native_employee_registration)');
  assert.equal(receipt.sha256,'1a57c2445f344f37d59c8c798237efefa0bb4671d101d9a177744c8fbac2c18e');assert.equal(receipt.runtime,false);
 }
});

test('the existing census067 profile derives an already exposed seed without weakening metadata checks',()=>{
 const published=buildOwnerDecisionQa({major:17,sourceCommit,read,schema,operationalPairBaseline:'published107'});
 const censusQa={...published,operationalPairBaseline:'published107',foundation:{foundation:{foundation:{owner:{graph:published.graph}}}}};
 const plan=buildOwnReportCensus067RuntimeFixture({qa:censusQa,read});
 assert.deepEqual(plan.beforeRuntime,[
  {signature:'public.native_employee_bootstrap_v1(jsonb)',runtime:true},
  {signature:'public.native_employee_attempt_v1(jsonb,uuid)',runtime:true},
  {signature:'public.native_employee_create_v1(jsonb,jsonb,text,uuid)',runtime:true},
 ]);
 assert.equal(plan.restoredFacades,0);assert.equal(plan.newRoles,0);assert.equal(plan.newFunctions,0);assert.equal(plan.definitionsChanged,0);
 assert.ok(plan.statements[0].includes('CENSUS067_BEFORE_METADATA_CHANGED'));
 assert.ok(plan.statements[3].includes('CENSUS067_AFTER_METADATA_CHANGED'));
 assert.ok(plan.statements[4].includes('CENSUS067_UNRELATED_METADATA_CHANGED'));
});

test('an earlier explicit private067 facade obligation cannot be silently replaced',()=>{
 const definition=qa.definitions.find(d=>d.startsWith('CREATE FUNCTION public.native_employee_bootstrap_v1('));assert.ok(definition);
 const pin=ownInstallationFunctionPin(definition),batch={...qa.graph.batch,originalReady:qa.graph.batch.originalReady+'\n-- '+JSON.stringify([{...pin,runtime:false}])};
 assert.throws(()=>buildOwnerDecisionQaDefinitions({read,sourceCommit,batch}),/OWNER_DECISION_QA067_EARLY_EPOCH_ACL_CONFLICT/);
});
