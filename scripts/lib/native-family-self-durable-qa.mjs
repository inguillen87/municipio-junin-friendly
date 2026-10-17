// Pure canonical fixture composition. No child process, connection or SQL runs.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createHash,randomUUID}from'node:crypto';
import{buildNativeFamilySelfQa}from'../verify-native-family-self-sql.mjs';
import{splitPostgresStatements}from'./sql-statements.mjs';
import{nativeMonthlyQaInstallation}from'./native-monthly-qa-installation.mjs';
import{nativeFamilyFixtureResolverGuard}from'./native-family-self-fixture-lifecycle-qa.mjs';
export const familyQaLiteral=v=>"'"+String(v).replaceAll("'","''")+"'";
const q=familyQaLiteral,j=v=>q(JSON.stringify(v))+'::jsonb',hash=s=>createHash('sha256').update(s).digest('hex');
export function buildNativeFamilyDurableQa({major,sourceCommit,read=p=>fs.readFileSync(path.resolve(import.meta.dirname,'../..',p),'utf8')}){
 assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const source=read('scripts/migrations/195-native-family-self-service.sql').replace(/\r\n?/g,'\n'),regression=buildNativeFamilySelfQa({serverMajor:major,source,requireConcurrency:true,sourceCommit}),{schema,ids,qaFoundation,leaveFixture,selfFixture,familyFixture}=regression;
 const sources={},load=p=>{const s=read('scripts/migrations/'+p).replace(/\r\n?/g,'\n');sources['scripts/migrations/'+p]=hash(s);return s;};
 const n=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace').replaceAll("ARRAY['search_path=public, pg_temp']",`ARRAY['search_path=pg_catalog, ${schema}, public, pg_temp']`).replaceAll("ARRAY['search_path=pg_catalog, public, pg_temp']",`ARRAY['search_path=pg_catalog, ${schema}, public, pg_temp']`).replaceAll("'search_path=public, pg_temp'",q(`search_path=pg_catalog, ${schema}, public, pg_temp`)).replaceAll("'search_path=pg_catalog, public, pg_temp'",q(`search_path=pg_catalog, ${schema}, public, pg_temp`)).replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,`SET search_path=pg_catalog,${schema},public,pg_temp`).replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')",`replace(replace(p.prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`).replaceAll("replace(prosrc,E'\\r\\n',E'\\n')",`replace(replace(prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`);
 const original=(f,name)=>{const rows=splitPostgresStatements(load(f)).filter(s=>new RegExp('CREATE (?:OR REPLACE )?FUNCTION (?:public\\.)?'+name+'\\(').test(s));assert.equal(rows.length,1,name);return n(rows[0])+';';},install=f=>'EXECUTE '+q(n(load(f)))+';';
 const draft={agreementCode:'1',birthDate:'1990-01-01',categoryCode:'1',cuil:'20990000418',dni:'99000041',fullName:'Agente propio exclusivamente sintético195',jobTitle:'Administración QA',legajo:'19541',legalReference:'Resolución exclusivamente sintética195',organizationId:'10',sectorCode:'20',sexCode:'X',startDate:'2026-10-01',jurisdictionCode:'42'};
 // These are the same103 foundation and original104/110 prerequisites used by
 // the durable payroll fixture. No regression mutation/result is carried over.
 const prerequisite=`${qaFoundation.setup}
 GRANT USAGE ON SCHEMA ${schema} TO municontrol_actions_runtime_app;
 ${nativeMonthlyQaInstallation(schema)}
 ALTER TABLE employment_contract ADD COLUMN position_source_id text,ADD COLUMN status_explanation text,ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp(),ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
 ${original('102-native-family-schooling.sql','employee_family_subject_v2')}
 CREATE TABLE grh_core_source_version(id uuid PRIMARY KEY,source_company_id bigint NOT NULL);
 ALTER TABLE grh_effective_source_binding ADD COLUMN source_version_id uuid,ADD COLUMN baseline_batch_id uuid,ADD COLUMN source_batch_id uuid;
 INSERT INTO grh_core_source_version VALUES(${q(ids.sourceBatch)},101);
 INSERT INTO grh_effective_source_binding(id,source_version_id,baseline_batch_id,source_batch_id) VALUES(104,${q(ids.sourceBatch)},${q(ids.sourceBatch)},${q(ids.sourceBatch)});
 ${original('096-grh-effective-source.sql','grh_effective_baseline_guard_v1')}
 REVOKE ALL ON FUNCTION grh_effective_baseline_guard_v1() FROM PUBLIC,municontrol_actions_runtime_app;
 CREATE TRIGGER grh_effective_baseline_rows BEFORE INSERT OR UPDATE OR DELETE ON employment_contract FOR EACH ROW EXECUTE FUNCTION grh_effective_baseline_guard_v1();
 CREATE TRIGGER grh_effective_baseline_truncate BEFORE TRUNCATE ON employment_contract FOR EACH STATEMENT EXECUTE FUNCTION grh_effective_baseline_guard_v1();
 ${install('104-native-employment-changes.sql')}
 CREATE TABLE employee_family_member(id uuid PRIMARY KEY,contract_id uuid,employee_person_id uuid,tenant_id uuid,source_binding_id uuid,native_registration_id uuid,family_name text,birth_date date,valid_to date,identity_token text,identity_snapshot jsonb,valid_from date,recorded_at timestamptz,contract_identity_token text);
 ${original('102-native-family-schooling.sql','school_certificate_native_family_v5')}
 REVOKE ALL ON FUNCTION school_certificate_native_family_v5(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
 ${nativeFamilyFixtureResolverGuard(schema,102)}
 ${install('110-native-employment-lifecycle.sql')}
 boot:=native_employment_catalog_bootstrap_v1(maker);
 receipt:=native_employment_catalog_propose_v1(maker,jsonb_build_object('baseVersion',boot#>>'{catalog,version}','scopeVersion',boot->>'scopeVersion','reason','Catálogo propio exclusivamente sintético195','items',boot#>'{catalog,items}'),gen_random_uuid());
 PERFORM native_employment_catalog_review_v1(checker,jsonb_build_object('proposalId',receipt->>'proposalId','scopeVersion',native_employment_catalog_bootstrap_v1(checker)->>'scopeVersion','decision','approve','reason','Revisión independiente exclusivamente sintética195'),gen_random_uuid());
 new_draft:=${j(draft)};hire:=native_employee_create_v1(maker,new_draft,native_employee_catalog_v1(native_employee_context_v1(maker))->>'version',gen_random_uuid());target_id:=(hire->>'contractId')::uuid;
 ${leaveFixture.setup}
 ${selfFixture.setup}
 ${selfFixture.installation.join('\n')}
 ${selfFixture.link}
 lifecycle_family_before:=coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM employee_family_member m),'[]'::jsonb);
 ${familyFixture.setup.join('\n')}
 PERFORM qa_assert(native_employee_self_bootstrap_v1(reader)#>>'{subject,contractId}'=target_id::text,'committed fixture derives subject via original113 account link');
 PERFORM qa_assert(NOT EXISTS(SELECT 1 FROM grh_employees g JOIN employment_contract c ON c.legacy_company_id=g.company_id AND c.legacy_legajo=g.legajo WHERE c.id=target_id),'native employee has no GRH predecessor');
 SET CONSTRAINTS ALL IMMEDIATE;`;
 const declarations=Object.entries(qaFoundation.actors).map(([k,v])=>k.replace('samePerson','same_person')+' jsonb:='+j(v)+';').join('\n')+'boot jsonb;receipt jsonb;hire jsonb;target_id uuid;new_draft jsonb;lifecycle_family_before jsonb;'+leaveFixture.declarations+selfFixture.declarations+selfFixture.declarationProof;
 const seed=`DO $family_fixture$ DECLARE ${declarations} BEGIN IF to_regnamespace(${q(schema)}) IS NOT NULL THEN RAISE EXCEPTION 'FAMILY195_SCHEMA_NOT_EMPTY';END IF;${prerequisite} END $family_fixture$`;
 assert.doesNotMatch(seed,/RESTORE_(?:LEAVE|SELF|FAMILY_SELF)_FIXTURES|ERRCODE='P(?:1111|1131|1951)'/);assert.equal(regression.report.checksPassed,710);
 const batch=familyFixture.installationBatch;
 return{version:'native-family-durable-qa.v1',major,sourceCommit,schema,ids,actors:qaFoundation.actors,seed,seedSha256:hash(seed),installation:familyFixture.installation,durableVerification:familyFixture.durableVerification,normalized:familyFixture.normalized,batch,regression,sourceHashes:{...sources,'scripts/migrations/195-native-family-self-service.sql':hash(source)},connects:false,executesSql:false};
}
const signatures=Object.freeze(Object.fromEntries(['self','review'].flatMap(v=>[['bootstrap',['jsonb','text','jsonb']],['detail',['jsonb','uuid']],['attempt',['jsonb','uuid']],['document',['jsonb','uuid','integer']],['command',['jsonb','jsonb','uuid','jsonb']]].map(([op,types])=>['native_family_'+v+'_'+op+'_v1',types]))));
export function nativeFamilyQaQuery(text,values,schema){assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);const m=/^SELECT public\.([a-z0-9_]+)\(([^()]*)\) AS result$/.exec(text);assert.ok(m&&Object.hasOwn(signatures,m[1]),'FAMILY195_RUNTIME_FACADE_REQUIRED');const types=signatures[m[1]];assert.equal(m[2],types.map((t,i)=>'$'+(i+1)+'::'+t).join(','));assert.ok(Array.isArray(values)&&values.length===types.length&&values.every((v,i)=>types[i]==='integer'?Number.isInteger(v)&&v>=1&&v<=1000:typeof v==='string'));const used=new Set();const rendered=text.replace('public.',schema+'.').replace(/\$(\d+)\b/g,(_,p)=>{used.add(Number(p));return q(values[Number(p)-1]);});assert.equal(used.size,values.length);return rendered;}
