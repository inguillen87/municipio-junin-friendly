import test from 'node:test';import assert from 'node:assert/strict';
import {sealAdoptionReview,verifiedAdoptionReview,adoptionReviewCsv,adoptionReviewObservations,civilDay} from '../assets/employment-adoption-review-model.js';
import {internalAdoptionReview,ADOPTION_REVIEW_SQL} from '../lib/internal-employment-adoption-review.js';
import {capabilitiesForInternalDataResource} from '../lib/internal-resource-access.js';
import {createInternalDataHandler} from '../api/internal-data.js';
import {reviewRaw,reviewRow,reviewId} from './fixtures/employment-adoption-review-synthetic.js';
import {principal,session} from './fixtures/native-employee-synthetic.js';
import {buildAdoptionReviewQa} from '../scripts/verify-employment-adoption-review-sql.mjs';
const reviewed=async raw=>verifiedAdoptionReview(await sealAdoptionReview(raw??reviewRaw()));
for(const major of [17,18])test('SQL integration '+major+' stays disposable and retains unchanged authority regressions',()=>{
 const qa=buildAdoptionReviewQa({serverMajor:major});assert.equal(qa.report.adoptionReviewChecksPassed,11);assert.equal(qa.report.checksPassed,540);
 assert.ok(qa.sql.includes("current_database()<>'"+(major===17?'fixed_novelties_qa':'own_payroll_run_qa')+"'"));assert.match(qa.sql,/current_setting\('neon.project_id',true\)/);assert.match(qa.sql,/inet_server_addr\(\) IS DISTINCT FROM inet '127.0.0.1'/);assert.ok(qa.sql.includes('inet_server_port() IS DISTINCT FROM '+(major===17?55417:55418)));assert.match(qa.sql,/ROLLBACK/);assert.doesNotMatch(qa.sql,/INSERT INTO public\./);
 assert.match(qa.sql,/stale authoritative session is rejected before any contract can be returned/);
});
test('full review spans three pages, keeps immutable rows and exports observations outside a visible search',async()=>{
 const input=reviewRaw(),r=await reviewed(input);input.rows.splice(0,30);assert.equal(r.total,57);assert.equal(r.rows.length,57);assert.ok(Object.isFrozen(r.rows[56].observations));
 const csv=adoptionReviewCsv(r);assert.equal(csv.split('\r\n').length,59);assert.match(csv,/"57";"Jurisdicción por declarar"/);assert.equal(r.rows.filter(row=>row.name.includes('001')).length,1);
 assert.throws(()=>adoptionReviewCsv({...r,rows:r.rows.slice(0,25)}));assert.throws(()=>adoptionReviewCsv(awaitNotVerified));
});
const awaitNotVerified={version:'employment-adoption-review.v1',rows:[]};
test('CSV contains only revision ordinal and fixed status/action; no nominal/free/formula values',async()=>{
 const row=reviewRow(1,{name:'=SUM(1,2) <img src=x>',legajo:'00009999'}),r=await reviewed(reviewRaw(1,{rows:[row]})),csv=adoptionReviewCsv(r);
 assert.match(csv,/Numeración a revisar/);for(const v of [row.name,row.legajo,row.contractId,'SUM','img','salary','DNI','CUIL'])assert.ok(!csv.includes(v));
 assert.ok(csv.startsWith('\ufeff"Fila de la revisión"'));assert.ok(csv.endsWith('\r\n'));assert.equal(csv.match(/"1";/g).length,2);
});
test('missing facts, zero codes, historical dates, multiple relations and contradictory periods remain distinct',()=>{
 const codes=row=>adoptionReviewObservations(row).map(o=>o.code);
 assert.deepEqual(codes(reviewRow(1,{jurisdictionCode:'42'})),[]);assert.deepEqual(codes(reviewRow(1,{startDate:'1899-12-31'})),['HISTORICAL_DATE','JURISDICTION_REQUIRED']);
 assert.deepEqual(codes(reviewRow(1,{startDate:null,organizationId:null,sectorCode:''})),['START_MISSING','ORGANIZATION_MISSING','SECTOR_MISSING','JURISDICTION_REQUIRED']);
 assert.deepEqual(codes(reviewRow(1,{activeContractsForPerson:2})),['JURISDICTION_REQUIRED','MULTIPLE_ACTIVE']);
 assert.deepEqual(codes(reviewRow(1,{endDate:'2000-01-01',status:'state_error'})),['PERIOD_INVALID','STATE_ERROR','JURISDICTION_REQUIRED']);
 assert.deepEqual(codes(reviewRow(1,{status:'inactive',endDate:null})),['INACTIVE_WITHOUT_END','JURISDICTION_REQUIRED']);
 assert.equal(civilDay('2024-02-29'),true);assert.equal(civilDay('2023-02-29'),false);assert.equal(civilDay('0000-01-01'),false);
});
test('complete empty review and zero observations use headers without invented errors',async()=>{
 const empty=await reviewed(reviewRaw(0));assert.equal(empty.counts.observations,0);assert.equal(adoptionReviewCsv(empty).split('\r\n').length,2);
 const r=await reviewed(reviewRaw(1,{rows:[reviewRow(1,{jurisdictionCode:'55'})]}));assert.equal(r.total,1);assert.equal(r.counts.dataReview,0);assert.equal(adoptionReviewCsv(r),adoptionReviewCsv(empty));
});
for(const patch of [{rows:reviewRaw().rows.slice(0,25)},{total:58},{today:'2026-02-30'},{scope:{...reviewRaw().scope,tenantId:'00000000-0000-0000-0000-000000000000'}},{source:{...reviewRaw().source,cutoff:'2026-02-30T12:00:00'}},{rows:[reviewRow(1),reviewRow(2,{contractId:reviewId(1).toUpperCase()})],total:2}])test('raw review rejects incomplete or invalid source '+Object.keys(patch),async()=>assert.rejects(reviewed(reviewRaw(57,patch))));
test('a UUID with a zero final segment is valid; historical and missing dates remain source facts',async()=>{
 const raw=reviewRaw(2,{scope:{...reviewRaw().scope,tenantId:reviewId(0)},rows:[reviewRow(1,{startDate:'1899-12-31'}),reviewRow(2,{startDate:null})]}),r=await reviewed(raw);
 assert.equal(r.scope.tenantId,reviewId(0));assert.equal(r.rows[0].startDate,'1899-12-31');assert.equal(r.rows[1].startDate,null);assert.equal(r.counts.dataReview,2);
});
for(const patch of [{startDate:'2026-02-30'},{jurisdictionCode:'99'},{status:'inventado'},{activeContractsForPerson:-1},{contractId:'bad'},{dni:'99999990'},{rowNumber:2}])test('closed row shape rejects invalid data '+Object.keys(patch),async()=>assert.rejects(reviewed(reviewRaw(1,{rows:[reviewRow(1,patch)]}))));
for(const patch of [{complete:false},{total:1},{snapshot:'e'.repeat(64)},{counts:{active:57}},{sourceContextVersion:'e'.repeat(64)}])test('client verifies complete response and all derived counts/hashes '+Object.keys(patch),async()=>{const r=await reviewed();await assert.rejects(verifiedAdoptionReview({...r,...patch}));});
test('changing only query time preserves the snapshot; every fact, source version and membership changes it',async()=>{
 const first=await reviewed(),next=await reviewed(reviewRaw(57,{queriedAt:'2026-10-06T13:00:00Z'}));assert.equal(first.snapshot,next.snapshot);
 for(const raw of [reviewRaw(57,{rows:[reviewRow(1,{organizationId:null}),...reviewRaw().rows.slice(1)]}),reviewRaw(57,{source:{...reviewRaw().source,publicationSha256:'e'.repeat(64)}}),reviewRaw(57,{scope:{...reviewRaw().scope,membershipId:reviewId(9999)}})])assert.notEqual((await reviewed(raw)).snapshot,first.snapshot);
});
test('quantity limit rejects whole review before any partial result is constructed',async()=>{await assert.rejects(reviewed(reviewRaw(0,{total:10001})),{status:422,code:'ADOPTION_REVIEW_LIMIT'});});
test('server takes scope/session from existing authority in one SELECT and cannot accept search or client tenant',async()=>{
 let calls=0;const sql={query:async(q,values)=>{calls++;assert.equal(q,ADOPTION_REVIEW_SQL);assert.equal(JSON.parse(values[0]).tenantId,principal.tenant.id);assert.equal(values[1],10001);return[{result:reviewRaw()}];}};
 assert.equal((await internalAdoptionReview(sql,{query:{resource:'employmentadoptionreview'}},principal,session)).payload.data.rows.length,57);assert.equal(calls,1);
 for(const query of [{resource:'employmentadoptionreview',search:'001'},{tenantId:reviewId(88)},{resource:['employmentadoptionreview']}])await assert.rejects(internalAdoptionReview(sql,{query},principal,session),{status:400});assert.equal(calls,1);
 assert.match(ADOPTION_REVIEW_SQL,/native_employee_context_v1\(\$1::jsonb\)/);assert.match(ADOPTION_REVIEW_SQL,/source_binding_id=\(a.ctx->>'sourceBindingId'\)::uuid/);assert.match(ADOPTION_REVIEW_SQL,/c.source_batch_id IN\(s.source_batch_id,s.core_baseline,s.curated_baseline\)/);assert.doesNotMatch(ADOPTION_REVIEW_SQL,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b|\.dni|\.cuil/i);
});
test('permission/session revocation runs no SQL; authoritative database denial and wrong scope cannot escape',async()=>{
 let reads=0;const sql={query:async()=>{reads++;return[{result:reviewRaw(1,{scope:{...reviewRaw().scope,tenantId:reviewId(800)}})}];}};
 await assert.rejects(internalAdoptionReview(sql,{query:{}},{...principal,tenant:{...principal.tenant,effectiveCapabilities:[]}},session),{status:403});await assert.rejects(internalAdoptionReview(sql,{query:{}},principal,{...session,email:'other@example.invalid'}),{status:401});assert.equal(reads,0);
 await assert.rejects(internalAdoptionReview(sql,{query:{}},principal,session));
 for(const message of ['NATIVE_EMPLOYEE_FORBIDDEN','NATIVE_EMPLOYEE_SESSION_INVALID'])await assert.rejects(internalAdoptionReview({query:async()=>{throw Error(message);}},{query:{}},principal,session),{status:message.includes('FORBIDDEN')?403:401});
});
test('real handler applies certified managed access, GET only, private/no-store and sanitized errors',async()=>{
 assert.deepEqual(capabilitiesForInternalDataResource('employmentadoptionreview'),['workforce.employee.read']);let options,reads=0;
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}});
 const handler=createInternalDataHandler({env:{},requireCompatibleInternalAccess:async(_req,_res,o)=>{options=o;return{mode:'managed',principal};},actionMutationSession:()=>session,getInternalSql:async()=>({query:async()=>{reads++;return[{result:reviewRaw()}];}})});
 const res=response();await handler({method:'GET',query:{resource:'employmentadoptionreview'}},res);assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'private, no-store, max-age=0');assert.equal(options.allowLegacy,false);assert.equal(options.requireCertifiedDataBinding,true);assert.equal(reads,1);
 const post=response();await handler({method:'POST',query:{resource:'employmentadoptionreview'}},post);assert.equal(post.statusCode,405);assert.equal(reads,1);
 const partial=response();await handler({method:'GET',query:{resource:'employmentadoptionreview',page:'2'}},partial);assert.equal(partial.statusCode,400);assert.equal(reads,1);
});
