// Disposable synthetic integration with the unchanged native authority/lifecycle suite.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {buildNativeEmploymentLifecycleQa} from './verify-native-employment-lifecycle-sql.mjs';
import {ADOPTION_REVIEW_SQL} from '../lib/internal-employment-adoption-review.js';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
export function buildAdoptionReviewQa(options){
 const base=buildNativeEmploymentLifecycleQa(options),{ids,schema}=base,anchor='-- LIFECYCLE_ROSTER_QA_ANCHOR';assert.equal(base.sql.split(anchor).length,2);
 const database=({17:'fixed_novelties_qa',18:'own_payroll_run_qa'})[Number(options.serverMajor)];assert.ok(database);
 // Earlier published synthetic dependencies use minimal source-version stubs.
 // Supply their missing columns/curated version, never alter an authority function.
 const defaults=`tenant_id uuid DEFAULT ${q(ids.tenant)}::uuid,source_binding_id uuid DEFAULT ${q(ids.binding)}::uuid,baseline_batch_id uuid DEFAULT ${q(ids.sourceBatch)}::uuid,
 source_sha256 text DEFAULT repeat('a',64),manifest_sha256 text DEFAULT repeat('b',64),source_cutoff timestamp DEFAULT timestamp '2026-09-10 15:17:30'`;
 let sql=base.sql.replace('CREATE TABLE grh_core_source_version(id uuid PRIMARY KEY,source_company_id bigint NOT NULL);',`CREATE TABLE grh_core_source_version(id uuid PRIMARY KEY,source_company_id bigint NOT NULL,${defaults});`)
 .replace('CREATE TABLE grh_effective_source_binding(id integer);',`CREATE TABLE grh_effective_source_binding(id integer,tenant_id uuid DEFAULT ${q(ids.tenant)}::uuid,source_binding_id uuid DEFAULT ${q(ids.binding)}::uuid,import_run_id bigint DEFAULT 1,publication_sha256 text DEFAULT repeat('d',64));`)
 .replace('CREATE TABLE grh_curated_source_version(id integer);',`CREATE TABLE grh_curated_source_version(id uuid DEFAULT gen_random_uuid(),core_version_id uuid,tenant_id uuid DEFAULT ${q(ids.tenant)}::uuid,source_binding_id uuid DEFAULT ${q(ids.binding)}::uuid,source_batch_id uuid,import_run_id bigint DEFAULT 1,baseline_batch_id uuid DEFAULT ${q(ids.sourceBatch)}::uuid,manifest_sha256 text DEFAULT repeat('c',64));`)
 .replaceAll('INSERT INTO grh_core_source_version VALUES(','INSERT INTO grh_core_source_version(id,source_company_id) VALUES(');
 for(const field of ['source_sha256 text DEFAULT','publication_sha256 text DEFAULT','core_version_id uuid'])assert.ok(sql.includes(field));
 const query=ADOPTION_REVIEW_SQL.replaceAll('public.',schema+'.'),statements=[];let checks=0;
 const read=(actor='maker',limit=10001)=>'EXECUTE '+q(query)+' INTO review_result USING '+actor+','+limit+';';
 const check=(expression,label)=>{statements.push('PERFORM qa_assert(('+expression+'),'+q(label)+'); checks:=checks+1;');checks++;};
 statements.push(`INSERT INTO grh_curated_source_version(core_version_id,source_batch_id) SELECT source_version_id,source_batch_id FROM grh_effective_source_binding;`,read());
 const population=`FROM employment_contract c WHERE c.source_system='GRH' AND c.tenant_id IS NULL AND c.legacy_company_id=(own_context->>'sourceCompanyId')::bigint AND c.source_batch_id IN(SELECT source_batch_id FROM grh_effective_source_binding UNION SELECT baseline_batch_id FROM grh_effective_source_binding UNION SELECT baseline_batch_id FROM grh_core_source_version UNION SELECT baseline_batch_id FROM grh_curated_source_version)`;
 check(`(review_result->>'total')::int=(SELECT count(*) ${population}) AND jsonb_array_length(review_result->'rows')=(review_result->>'total')::int`,'review returns the entire selected historical cohort');
 check(`NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review_result->'rows') r JOIN employment_contract c ON c.id=(r->>'contractId')::uuid WHERE c.source_system<>'GRH' OR c.tenant_id IS NOT NULL OR c.legacy_company_id<>(own_context->>'sourceCompanyId')::bigint)`,'native and foreign-company contracts are excluded without dropping selected legacy rows');
 check(`review_result#>>'{scope,tenantId}'=maker->>'tenantId' AND review_result#>>'{scope,membershipId}'=maker->>'membershipId' AND review_result#>>'{scope,bindingId}'=${q(ids.binding)}`,'scope comes from the unchanged authoritative session validator');
 check(`NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review_result->'rows') r WHERE r ? 'dni' OR r ? 'cuil' OR r ? 'personId' OR r ? 'source_payload')`,'projection excludes documents, person identifiers and raw source payloads');
 check(`NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review_result->'rows') WITH ORDINALITY r(item,ordinal) WHERE (item->>'rowNumber')::int<>ordinal)`,'ordinals preserve a single complete revision');
 check(`EXISTS(SELECT 1 FROM jsonb_array_elements(review_result->'rows') r WHERE (r->>'contractId')::uuid=${q(ids.targetContract)}::uuid)`,'known imported contract is conserved by canonical UUID');
 check(`(SELECT count(*) FROM native_employee_registration)>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review_result->'rows') r JOIN native_employee_registration n ON n.contract_id=(r->>'contractId')::uuid)`,'the existing own hires remain separate from contracts pending adoption');
 statements.push(`before_result:=review_result;`,read('maker',1));
 check(`review_result->>'total'=before_result->>'total' AND jsonb_array_length(review_result->'rows')=1`,'capacity probe retains full cohort count so the server rejects partial rows');
 statements.push(read('checker'));
 check(`review_result#>>'{scope,membershipId}'=checker->>'membershipId' AND review_result->'rows'=before_result->'rows'`,'independent authorized reader sees identical facts with its own scope');
 check(`native_employee_context_v1(${j(base.qaFoundation.actors.outsider)})->>'membershipId'=${q(ids.outsider)}`,'an actor with existing workforce read permission can review without receiving write permission');
 const stale={...base.qaFoundation.actors.maker,actorSessionVersion:999999};
 check(`qa_rejects(${q(query.replace('$1::jsonb',j(stale)).replace('$2','10001'))},'ACTION_SESSION_INVALID')`,'stale authoritative session is rejected before any contract can be returned');
 // Existing suite already exercises authoritative revocation and tenant isolation.
 const report={...base.report,adoptionReviewChecksPassed:checks,checksPassed:base.report.checksPassed+checks};
 sql=sql.replace(anchor,()=>`\nDECLARE review_result jsonb;before_result jsonb;BEGIN\n${statements.join('\n')}\nEND;\n`+anchor)
 .replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report))
 .replaceAll('native_employment_lifecycle_qa',database)
 .replace("IF nullif(current_setting('neon.project_id',true)","IF inet_server_addr() IS DISTINCT FROM inet '127.0.0.1' OR inet_server_port() IS DISTINCT FROM "+(Number(options.serverMajor)===17?55417:55418)+" THEN RAISE EXCEPTION 'ADOPTION_REVIEW_QA_LOOPBACK_REQUIRED'; END IF;\n IF nullif(current_setting('neon.project_id',true)");
 return {...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const arg of process.argv.slice(2)){const m=/^--(expected-major|write-sql)=(.+)$/.exec(arg);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
 assert.ok(args['write-sql']);const result=buildAdoptionReviewQa({serverMajor:Number(args['expected-major'])}),file=path.resolve(args['write-sql']);assert.ok(!fs.existsSync(file));fs.writeFileSync(file,result.sql,{flag:'wx'});console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:result.report.checksPassed,adoptionReviewChecksPlanned:result.report.adoptionReviewChecksPassed}));
}
