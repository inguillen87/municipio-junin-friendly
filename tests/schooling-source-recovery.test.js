import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchoolCertificateReport,readSchoolCertificates,prepareSchoolCertificate} from '../lib/internal-family-certificates.js';
import {createInternalFamilyCertificatesHandler} from '../api/internal-family-certificates.js';
import {schoolingFixtureV4,syntheticUuid} from './fixtures/family-schooling-synthetic.js';
import {schoolingData} from '../assets/family-schooling-model.js';
import {validateSchoolingRecoveryPayload,importSchoolingSource} from '../scripts/import-schooling-source.mjs';

const copy=x=>structuredClone(x), source=()=>schoolingFixtureV4(4).data;
const assertSchoolingPayload=p=>schoolingData(p,{version:4});
const email='school-source-qa@example.invalid',release='a'.repeat(40),tenant=syntheticUuid(50),membership=syntheticUuid(51);
const session={email,id:syntheticUuid(52),version:1,releaseSha:release};
const principal={user:{email},tenant:{id:tenant,membershipId:membership,source:'membership',certifiedReleaseSha:release,effectiveCapabilities:['workforce.employee.read','employee.record.propose']}};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(p){this.payload=p;return this;}};}
const recovery=()=>({version:'schooling-source-recovery.v1',sourceSystem:'GRH',sourceDatabase:'qa_grh',sourceSha256:'a'.repeat(64),sourceDeclaredCutoff:'2026-08-06T15:15:21',rows:[{familyId:'1',companyId:101,legajo:'7',identitySha256:'b'.repeat(64),sourceFields:{PRES_14:'2026-03-05',VENC_14:null}}]});

test('v4 source dates cross API and browser validators without replacing manual metadata',()=>{
 const data=source(),before=copy(data);assert.equal(validateSchoolCertificateReport(data,null,4),data);assertSchoolingPayload({ok:true,data});assert.deepEqual(data,before);
 assert.equal(data.rows[0].effectiveDates.origin,'grh_source');assert.equal(data.rows[0].certificate,null);assert.equal(data.rows[0].historyCount,0);
 assert.equal(data.rows[1].effectiveDates.origin,'manual');assert.equal(data.rows[1].effectiveDates.expiresOn,null);assert.ok(data.rows[1].sourceSchooling.expiresOn);
});
test('unknown, absent and invalid historical fields remain null without expiry or presentation inference',()=>{
 for(const state of ['null','absent','invalid']){const data=source(),r=data.rows[0];r.sourceSchooling.presentationState=state;r.sourceSchooling.expiryState=state;r.sourceSchooling.presentedOn=null;r.sourceSchooling.expiresOn=null;r.effectiveDates.presentedOn=null;r.effectiveDates.expiresOn=null;validateSchoolCertificateReport(data,null,4);assertSchoolingPayload({ok:true,data});}
});
test('source v4 rejects wrong child, date/cutoff, source origin, privileges and silent manual fallback',()=>{
 const mutations=[r=>r.sourceSchooling.sourceKey='99',r=>r.sourceSchooling.sourceKey='01',r=>r.sourceSchooling.sourceSystem='MANUAL',r=>r.sourceSchooling.sourceTable='legajo',r=>r.sourceSchooling.sourceSha256='Z'.repeat(64),r=>r.sourceSchooling.sourceImportRunId=0,r=>r.sourceSchooling.sourceBatchId='bad',r=>r.sourceSchooling.sourceCutoff='2026-08-07T18:15:21Z',r=>r.sourceSchooling.sourceDeclaredCutoff='2026-02-30T15:15:21',r=>r.sourceSchooling.loadedAt='bad',r=>r.sourceSchooling.reviewState='approved',r=>r.sourceSchooling.documentAvailable=true,r=>r.sourceSchooling.presentationState='absent',r=>r.sourceSchooling.expiresOn='2026-02-30',r=>r.sourceSchooling.nominalExtra='forbidden',r=>r.effectiveDates.origin='manual',r=>r.effectiveDates.expiresOn='2050-12-31'];
 for(const mutate of mutations){const data=source();mutate(data.rows[0]);assert.throws(()=>validateSchoolCertificateReport(data,null,4),{code:'SCHOOL_CERTIFICATE_CONTRACT_DRIFT'});}
 const manual=source();manual.rows[1].effectiveDates.expiresOn=manual.rows[1].sourceSchooling.expiresOn;assert.throws(()=>validateSchoolCertificateReport(manual,null,4));
});
test('v4 GET uses the exact existing principal and new read facade; old writes never accept v4',async()=>{
 const calls=[];const sql={query:async(s,v)=>{calls.push({s,v});return {rows:[{result:source()}]};}};
 const r=await readSchoolCertificates(sql,principal,session,null,{version:4});assert.equal(r.version,'family-schooling.v4');
 assert.match(calls[0].s,/public\.school_certificate_read_v4\(/);assert.deepEqual(calls[0].v,[email,session.id,1,release,tenant,membership,null]);
 await assert.rejects(prepareSchoolCertificate({}, {version:4}),{code:'SCHOOL_CERTIFICATE_QUERY_INVALID'});
});
test('only report/family accept version4, and unauthorized readers never query SQL',async()=>{
 let queries=0,auth=0;const handler=createInternalFamilyCertificatesHandler({requireCompatibleInternalAccess:async()=>{auth++;return {mode:'managed',principal,session};},actionMutationSession:()=>session,getInternalSql:async()=>({query:async()=>{queries++;return {rows:[{result:source()}]};}})});
 const q={resource:'report',version:'4'},res=response();await handler({method:'GET',query:q,headers:{},url:'/?'+new URLSearchParams(q)},res);assert.equal(res.statusCode,200);assert.equal(queries,1);
 for(const q2 of [{resource:'attempt',key:syntheticUuid(1),version:'4'},{resource:'download',certificateId:syntheticUuid(1),version:'4'}]){const out=response();await handler({method:'GET',query:q2,headers:{}},out);assert.equal(out.statusCode,400);}
 const out=response();await handler({method:'POST',query:{version:'4'},headers:{}},out);assert.equal(out.statusCode,400);assert.equal(auth,1);
 const denied=createInternalFamilyCertificatesHandler({requireCompatibleInternalAccess:async()=>({mode:'managed',principal:{...principal,tenant:{...principal.tenant,effectiveCapabilities:[]}},session}),getInternalSql:async()=>{throw Error('must never acquire SQL');}});
 const deniedRes=response();await denied({method:'GET',query:q,headers:{}},deniedRes);assert.equal(deniedRes.statusCode,403);
});
test('recovery manifest preserves source null/invalid bytes and rejects identity/payload ambiguity',()=>{
 const p=recovery(),before=copy(p);assert.equal(validateSchoolingRecoveryPayload(p),p);assert.deepEqual(p,before);
 p.rows[0].sourceFields.PRES_14='0000-00-00';validateSchoolingRecoveryPayload(p);assert.equal(p.rows[0].sourceFields.PRES_14,'0000-00-00');
 for(const mutate of [p=>p.rows.push(copy(p.rows[0])),p=>p.rows[0].familyId='01',p=>p.rows[0].identitySha256='x',p=>p.rows[0].sourceFields.FBAJ_14='2026-01-01',p=>p.rows[0].sourceFields.PRES_14=42,p=>p.sourceDeclaredCutoff='2026-02-30T00:00:00']){const bad=recovery();mutate(bad);assert.throws(()=>validateSchoolingRecoveryPayload(bad));}
});
test('technical recovery defaults to read-only and never asserts success before COMMIT',async()=>{
 const payload=recovery(),calls=[];let committed=false;
 const client={query:async(s,v)=>{calls.push({s,v});if(s==='COMMIT'){await new Promise(resolve=>setTimeout(resolve,10));committed=true;return {rows:[]};}return {rows:s.startsWith('SELECT ')?[{result:{version:'schooling-source-import.v1',applied:false,replayed:false,rows:1,matched:1,sourceSha256:payload.sourceSha256,rowsetSha256:'d'.repeat(64),originalRowsModified:0,manualRecordsCreated:0,payrollModified:false}}]:[]};}};
 const result=await importSchoolingSource(client,{tenantId:tenant,bindingId:membership,batchId:syntheticUuid(53),payload,operator:'authorized recovery qa'});
 assert.equal(committed,true);assert.equal(result.applied,false);assert.match(calls[0].s,/READ ONLY$/);assert.equal(calls[2].v[5],false);
});
test('lost commit or malformed source receipt rolls back and cannot announce applied',async()=>{
 const payload=recovery();for(const badReceipt of [false,true]){const calls=[];const client={query:async(s)=>{calls.push(s);if(s==='COMMIT')throw Error('connection lost');return {rows:s.startsWith('SELECT ')?[{result:{version:'schooling-source-import.v1',applied:true,replayed:false,rows:1,matched:badReceipt?0:1,sourceSha256:payload.sourceSha256,rowsetSha256:'d'.repeat(64),originalRowsModified:0,manualRecordsCreated:0,payrollModified:false}}]:[]};}};
 await assert.rejects(importSchoolingSource(client,{tenantId:tenant,bindingId:membership,batchId:syntheticUuid(53),payload,operator:'authorized recovery qa',apply:true}));assert.equal(calls.at(-1),'ROLLBACK');}
});
