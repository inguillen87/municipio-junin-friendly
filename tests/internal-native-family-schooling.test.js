import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternalFamilyMembersHandler} from '../api/internal-family-members.js';
import {createInternalFamilyCertificatesHandler} from '../api/internal-family-certificates.js';
import {validateEmployeeFamilyContext,validateEmployeeFamilyDeclaration,readEmployeeFamilyAttempt,readEmployeeFamilyContext,declareEmployeeFamily,prepareEmployeeFamily} from '../lib/internal-family-members.js';
import {validateSchoolCertificateReport,readSchoolCertificates} from '../lib/internal-family-certificates.js';
import {nativeSchoolingFixture,nativeFamilySubject,nativeFamilyIds,syntheticUuid as uuid} from './fixtures/native-family-schooling-synthetic.js';
import {schoolingFixtureV4} from './fixtures/family-schooling-synthetic.js';
// Every identity and document is synthetic and every SQL call is intercepted.
const subject=()=>nativeFamilySubject(),context=()=>({version:'employee-family-context.v2',subject:subject(),canDeclare:true});
const receipt=(duplicate=false)=>({version:'employee-family-declare.v2',contractId:subject().contractId,contractIdentityToken:subject().identityToken,
 familyRef:{kind:'own',id:nativeFamilyIds.child},identityToken:'e'.repeat(64),state:'declared',recordedAt:'2026-09-22T11:00:00.123456Z',duplicate});
const payload=()=>prepareEmployeeFamily({contractId:subject().contractId,contractIdentityToken:subject().identityToken,familyName:'Hijo sintético'});
const session={id:uuid(901),email:'qa@example.invalid',version:1,releaseSha:'a'.repeat(40)};
const principal=(write=true)=>({user:{email:session.email},tenant:{source:'membership',id:uuid(902),membershipId:uuid(903),certifiedReleaseSha:session.releaseSha,
 effectiveCapabilities:['workforce.employee.read',...(write?['employee.record.propose']:[])]}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},end(v){this.bytes=v;return this;}});
const get=(q)=>({method:'GET',query:q,url:'/?'+new URLSearchParams(q),headers:{}});
const post=()=>({method:'POST',query:{version:'2'},url:'/?version=2',body:payload(),headers:{origin:'https://qa.example','content-type':'application/json','idempotency-key':uuid(904)}});
function harness(data,{school=false,write=true}={}){const calls={auth:[],sql:[]};return {calls,handler:(school?createInternalFamilyCertificatesHandler:createInternalFamilyMembersHandler)({
 env:{INTERNAL_APP_ORIGIN:'https://qa.example'},actionMutationSession:()=>session,
 requireCompatibleInternalAccess:async(_r,_s,opts)=>{calls.auth.push(opts);return {mode:'managed',principal:principal(write)};},
 getInternalSql:async()=>({query:async(statement,values)=>{calls.sql.push({statement,values});return [{result:data}];}}),
})};}

test('v2 accepts a native subject only with real registration provenance and a null GRH cutoff',()=>{
 assert.equal(validateEmployeeFamilyContext(context(),subject().contractId,2).subject.origin,'MUNICONTROL');
 for(const change of [c=>delete c.subject.registrationId,c=>c.subject.sourceCutoff='2026-09-22T10:00:00Z',c=>c.subject.origin='GRH',c=>c.subject.registeredAt=null,c=>c.subject.sourceBatchId=uuid(10),c=>c.subject.employeeName=null]){
  const c=context();change(c);assert.throws(()=>validateEmployeeFamilyContext(c,subject().contractId,2));
 }
 assert.throws(()=>validateEmployeeFamilyContext(context(),subject().contractId,1));
 const c=context();delete c.subject.origin;delete c.subject.registrationId;delete c.subject.registeredAt;c.subject.sourceCutoff='2026-09-10T15:17:30Z';
 assert.equal(validateEmployeeFamilyContext(c,subject().contractId,2).subject.sourceCutoff,c.subject.sourceCutoff);
});
test('v2 receipt is closed and bound to the original contract and identity token',()=>{
 assert.equal(validateEmployeeFamilyDeclaration(receipt(),2,payload()).duplicate,false);
 for(const change of [r=>r.contractId=uuid(999),r=>r.contractIdentityToken='d'.repeat(64),r=>r.sourceBatchId=uuid(9),r=>r.state='approved',r=>r.familyRef.kind='grh',r=>r.version='employee-family-declare.v1']){
  const r=receipt();change(r);assert.throws(()=>validateEmployeeFamilyDeclaration(r,2,payload()));
 }
 assert.throws(()=>validateEmployeeFamilyDeclaration(receipt(),1));
});
test('v2 adapters route explicit version and bind the six authority values',async()=>{
 const calls=[],sql={query:async(statement,values)=>{calls.push({statement,values});return [{result:statement.includes('context_')?context():receipt(statement.includes('attempt_'))}];}};
 await readEmployeeFamilyContext(sql,principal(),session,subject().contractId,{version:2});
 await declareEmployeeFamily(sql,principal(),session,payload(),uuid(904),{version:2});
 await readEmployeeFamilyAttempt(sql,principal(),session,uuid(904));
 assert.deepEqual(calls[0].values.slice(0,6),[session.email,session.id,1,session.releaseSha,uuid(902),uuid(903)]);
 assert.match(calls[0].statement,/context_v2/);assert.match(calls[1].statement,/declare_v2/);assert.match(calls[2].statement,/attempt_v2/);
 assert.equal(calls[2].values[6],uuid(904));assert.deepEqual(JSON.parse(calls[1].values[6]),payload());
 await assert.rejects(readEmployeeFamilyContext(sql,principal(),session,subject().contractId,{version:'2;DROP'}));assert.equal(calls.length,3);
 await assert.rejects(readEmployeeFamilyAttempt({query:async()=>[{result:receipt(false)}]},principal(),session,uuid(904)));
});
test('native declaration and lost-ack recovery require current write authority and stable replay headers',async()=>{
 for(const [req,data,status]of [[post(),receipt(),201],[post(),receipt(true),200],[get({resource:'attempt',version:'2',key:uuid(904)}),receipt(true),200]]){
  const h=harness(data),res=response();await h.handler(req,res);assert.equal(res.statusCode,status);assert.equal(h.calls.sql.length,1);
  assert.deepEqual(h.calls.auth[0].requiredCapabilities,['workforce.employee.read','employee.record.propose']);
  if(data.duplicate)assert.equal(res.headers['Idempotency-Replayed'],'true');
  const denied=harness(data,{write:false}),d=response();await denied.handler(req,d);assert.equal(d.statusCode,403);assert.equal(denied.calls.sql.length,0);
 }
});
test('read-only native context remains readable with declaration disabled',async()=>{
 const h=harness(context(),{write:false}),res=response();await h.handler(get({resource:'context',version:'2',contractId:subject().contractId}),res);
 assert.equal(res.statusCode,200);assert.equal(res.body.data.canDeclare,false);
});
test('family routing rejects unknown versions, duplicate URL keys and ambiguous resources before auth',async()=>{
 for(const req of [get({resource:'context',version:'3',contractId:subject().contractId}),get({resource:'attempt',key:uuid(904)}),get({resource:'attempt',version:'2',contractId:uuid(904)}),
  {...post(),query:{version:'1'},url:'/?version=1'},{...get({resource:'context',version:'2',contractId:subject().contractId}),url:'/?resource=context&version=2&version=2&contractId='+subject().contractId},
  {...post(),query:{version:['2']}}]){const h=harness(receipt()),res=response();await h.handler(req,res);assert.equal(res.statusCode,400);assert.equal(h.calls.auth.length,0);}
});
test('v5 mixed family report keeps native and imported provenance distinct without altering manual date precedence',()=>{
 const data=nativeSchoolingFixture().data;assert.equal(validateSchoolCertificateReport(data,null,5),data);
 const native=data.rows.find(r=>r.employeeOrigin==='MUNICONTROL');assert.equal(native.sourceCutoff,null);assert.equal(native.effectiveDates.expiresOn,null);
 assert.throws(()=>validateSchoolCertificateReport(data,null,4));assert.equal(validateSchoolCertificateReport(schoolingFixtureV4(2).data,null,4).version,'family-schooling.v4');
 for(const change of [r=>r.sourceCutoff='2026-09-22T10:00:00Z',r=>r.sourceSchooling=data.rows[0].sourceSchooling,r=>r.nativeRegistrationId=null,r=>r.nativeRegisteredAt='yesterday',r=>r.familyRef={kind:'grh',id:'1'},r=>r.employeeOrigin='OTHER',r=>r.approved=true,r=>delete r.employeeOrigin]){
  const d=structuredClone(data);change(d.rows.find(r=>r.employeeOrigin==='MUNICONTROL'));assert.throws(()=>validateSchoolCertificateReport(d,null,5));
 }
 const d=structuredClone(data);d.rows[0].nativeRegistrationId=uuid(800);assert.throws(()=>validateSchoolCertificateReport(d,null,5));
});
test('v5 report API uses only the v5 reader; schooling writes and downloads keep their existing version',async()=>{
 const data=nativeSchoolingFixture().data,h=harness(data,{school:true}),res=response();await h.handler(get({resource:'report',version:'5'}),res);
 assert.equal(res.statusCode,200);assert.match(h.calls.sql[0].statement,/school_certificate_read_v5/);
 for(const req of [{...post(),query:{version:'5'},url:'/?version=5'},get({resource:'download',version:'5',certificateId:uuid(800)}),get({resource:'attempt',version:'5',key:uuid(800)})]){
  const bad=harness(data,{school:true}),r=response();await bad.handler(req,r);assert.equal(r.statusCode,400);assert.equal(bad.calls.auth.length,0);
 }
 const sql={query:async()=>[{result:data}]};await assert.rejects(readSchoolCertificates(sql,principal(),session,null,{version:6}));
});
