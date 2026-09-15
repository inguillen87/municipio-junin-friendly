import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { createInternalFamilyMembersHandler } from '../api/internal-family-members.js';
import { createInternalFamilyCertificatesHandler } from '../api/internal-family-certificates.js';
import {
  prepareEmployeeFamily, readEmployeeFamilyContext, declareEmployeeFamily,
  validateEmployeeFamilyContext, validateEmployeeFamilyDeclaration, employeeFamilySafeError,
} from '../lib/internal-family-members.js';
import { prepareSchoolCertificate, validateSchoolCertificateReport, downloadSchoolCertificate } from '../lib/internal-family-certificates.js';

// Generated fixtures only. This suite opens no database connection.
const CONTRACT='fedcba98-7654-0321-0123-456789abcdef', OWN='11111111-1111-4111-8111-111111111111';
const TENANT='22222222-2222-4222-8222-222222222222', MEMBER='33333333-3333-4333-8333-333333333333';
const SESSION='44444444-4444-4444-8444-444444444444', KEY='55555555-5555-4555-8555-555555555555';
const TOKEN='f'.repeat(64), RELEASE='a'.repeat(40), EMAIL='family-fixture@example.invalid';
const AT='2026-09-14T12:00:00.123456Z', now=new Date('2026-09-14T12:00:00Z');
const principal={user:{email:EMAIL},tenant:{id:TENANT,membershipId:MEMBER,source:'membership',certifiedReleaseSha:RELEASE,effectiveCapabilities:['workforce.employee.read','employee.record.propose']}};
const session={id:SESSION,email:EMAIL,version:1,releaseSha:RELEASE};
const body=(patch={})=>({contractId:CONTRACT,contractIdentityToken:TOKEN,familyName:'Álvaro QA',...patch});
const declaration=(patch={})=>({version:'employee-family-declare.v1',familyRef:{kind:'own',id:OWN},identityToken:TOKEN,state:'declared',recordedAt:AT,duplicate:false,...patch});
const context=()=>({version:'employee-family-context.v1',subject:{contractId:CONTRACT,legajo:'SYN-1',employeeName:null,sourceCutoff:AT,identityToken:TOKEN},canDeclare:true});
const response=()=>({headers:{},statusCode:null,payload:null,setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.payload=v;return this;},end(v){this.bytes=v;return this;}});
const req=(value=body())=>({method:'POST',query:{},headers:{origin:'https://municipio.example','sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':KEY},body:value});
function setup(overrides={}, certificate=false){
 const calls={auth:0,sql:[],pdf:0};
 const dependencies={env:{INTERNAL_APP_ORIGIN:'https://municipio.example',INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:RELEASE},
  requireCompatibleInternalAccess:async(_q,_s,options)=>{calls.auth++;calls.options=options;return {mode:'managed',principal:structuredClone(principal),session};},
  getInternalSql:async()=>({query:async(statement,values)=>{calls.sql.push({statement,values});return [{result:declaration()}];}}),
  validatePdf:async()=>{calls.pdf++;},...overrides};
 return {handler:(certificate?createInternalFamilyCertificatesHandler:createInternalFamilyMembersHandler)(dependencies),calls};
}
function schooling(){return {version:'family-schooling.v2',rows:[{contractId:CONTRACT,legajo:'SYN-1',employeeName:null,familyRef:{kind:'own',id:OWN},
 familyName:'Hija sintética',birthDate:null,familyEndDate:null,validFrom:null,familyRecordedAt:AT,declarationState:'declared',identityReviewRequired:false,
 identityToken:TOKEN,sourceCutoff:AT,administrativeActive:true,certificate:null,historyCount:0}],canRegister:true,
 storage:{mode:'database_pilot',usedBytes:0,remainingBytes:8388608,capacityBytes:8388608},
 scope:{cohort:'contract_children',sourceCutoffFrom:AT,sourceCutoffTo:AT,currentCensusCertified:false,payrollEligibilityCertified:false,unresolvedFamilyRows:0}};}
function certificateBody(ref={kind:'own',id:OWN}){
 const bytes=Buffer.from('%PDF-1.4\nGenerated unit-test transport fixture\n%%EOF');
 return {contractId:CONTRACT,familyRef:ref,identityToken:TOKEN,filename:'certificado-sintetico.pdf',contentBase64:bytes.toString('base64'),
  sha256:createHash('sha256').update(bytes).digest('hex'),presentedOn:'2026-09-14',expiresOn:null};
}

test('own child preparation requires only name and current subject token; optional data stays null',()=>{
 assert.deepEqual(prepareEmployeeFamily(body(),{now}),{...body(),birthDate:null,dni:null,validFrom:null,validTo:null});
 const value=prepareEmployeeFamily(body({contractId:CONTRACT.toUpperCase(),familyName:'  A\u0301lvaro   QA ',dni:'12.345.678',birthDate:'2016-02-29'}),{now});
 assert.equal(value.familyName,'Álvaro QA');assert.equal(value.dni,'12345678');assert.equal(value.contractId,CONTRACT);
 assert.equal(prepareEmployeeFamily(body({familyName:'李'}),{now}).familyName,'李');
});
test('own child preparation rejects malformed identity/documents and does not accept approval or payroll fields',()=>{
 for(const patch of [{contractId:OWN+'x'},{contractIdentityToken:'x'},{familyName:' '},{familyName:'123'},{familyName:'<script>'},{familyName:'A\nB'},{familyName:'A'.repeat(181)},
  {dni:12345678},{dni:'00000000'},{dni:'12x34567'},{dni:'1234'},{dni:'1234567890123'},{state:'approved'},{amount:'1000.00'},{personId:OWN},{sourceBatchId:OWN},{relationship:'prenatal'},{contentBase64:'pdf'}])
  assert.throws(()=>prepareEmployeeFamily(body(patch),{now}));
 for(const invalid of [null,[],{...body(),familyName:null}])assert.throws(()=>prepareEmployeeFamily(invalid,{now}));
});
test('civil dates reject impossible/future birth and reversed validity while missing dates remain unknown',()=>{
 for(const patch of [{birthDate:'2026-02-30'},{birthDate:'2026-09-15'},{birthDate:'1899-01-01'},{validFrom:'2101-01-01'},{validFrom:'2026-02-02',validTo:'2026-01-01'},
  {birthDate:'2016-01-01',validFrom:'2015-01-01'},{birthDate:'2016-01-01',validTo:'2015-01-01'},{validTo:1}])
  assert.throws(()=>prepareEmployeeFamily(body(patch),{now}),{code:'EMPLOYEE_FAMILY_DATES_INVALID'});
 assert.equal(prepareEmployeeFamily(body({validFrom:'2026-09-14',validTo:null}),{now}).validTo,null);
});
test('own child response validation excludes extra identity data and unauthorized approval claims',()=>{
 assert.equal(validateEmployeeFamilyContext(context(),CONTRACT).canDeclare,true);
 assert.equal(validateEmployeeFamilyDeclaration(declaration()).familyRef.id,OWN);
 for(const patch of [{state:'approved'},{duplicate:1},{familyRef:{kind:'grh',id:'7'}},{identityToken:null},{dni:'12345678'},{recordedAt:'yesterday'}])
  assert.throws(()=>validateEmployeeFamilyDeclaration(declaration(patch)),{code:'EMPLOYEE_FAMILY_CONTRACT_DRIFT'});
 const c=context();c.subject.personId=OWN;assert.throws(()=>validateEmployeeFamilyContext(c,CONTRACT));
 assert.throws(()=>validateEmployeeFamilyContext(context(),OWN));
});
test('own child SQL adapters bind the managed principal and UUID without source-derived or caller-supplied tenant context',async()=>{
 const calls=[];const sql={query:async(statement,values)=>{calls.push({statement,values});return {rows:[{result:statement.includes('context_v1')?context():declaration()}]};}};
 await readEmployeeFamilyContext(sql,principal,session,CONTRACT.toUpperCase());
 const input=prepareEmployeeFamily(body(),{now});await declareEmployeeFamily(sql,principal,session,input,KEY);
 assert.deepEqual(calls[0].values,[EMAIL,SESSION,1,RELEASE,TENANT,MEMBER,CONTRACT]);
 assert.match(calls[1].statement,/employee_family_declare_v1/);assert.deepEqual(JSON.parse(calls[1].values[6]),input);assert.equal(calls[1].values[7],KEY);
 const bad=structuredClone(principal);bad.tenant.source='owner';await assert.rejects(declareEmployeeFamily(sql,bad,session,input,KEY));assert.equal(calls.length,2);
});
test('own child POST saves independently of a PDF, returning stable retry acknowledgement',async()=>{
 for(const duplicate of [false,true]){
  const calls=[];const {handler}=setup({getInternalSql:async()=>({query:async(statement,values)=>{calls.push({statement,values});return [{result:declaration({duplicate})}];}})});
  const res=response();await handler(req(),res);assert.equal(res.statusCode,duplicate?200:201);assert.equal(res.payload.data.state,'declared');
  assert.equal(calls.length,1);assert.match(calls[0].statement,/employee_family_declare_v1/);assert.doesNotMatch(calls[0].statement,/school_certificate_register|payroll/);
  assert.equal(res.headers['Cache-Control'],'private, no-store, max-age=0');if(duplicate)assert.equal(res.headers['Idempotency-Replayed'],'true');
 }
});
test('context GET supports an empty source family and exposes declaration capability independently of document quota',async()=>{
 const {handler,calls}=setup({getInternalSql:async()=>({query:async()=>[{result:context()}]})});const res=response();
 await handler({method:'GET',query:{resource:'context',contractId:CONTRACT},headers:{},url:`/api/internal-family-members?resource=context&contractId=${CONTRACT}`},res);
 assert.equal(res.statusCode,200);assert.equal(res.payload.data.canDeclare,true);assert.deepEqual(calls.options.requiredCapabilities,['workforce.employee.read']);
 const access={mode:'managed',principal:structuredClone(principal),session};access.principal.tenant.effectiveCapabilities=['workforce.employee.read'];
 const readOnly=setup({requireCompatibleInternalAccess:async()=>access,getInternalSql:async()=>({query:async()=>[{result:context()}]})});const denied=response();
 await readOnly.handler({method:'GET',query:{resource:'context',contractId:CONTRACT},headers:{}},denied);assert.equal(denied.payload.data.canDeclare,false);
});
test('own child authorization rejects missing session, capability, stale identity and cross-municipal context before storage',async()=>{
 for(const modify of [a=>{a.mode='legacy';},a=>{a.principal.tenant.source='owner';},a=>{a.principal.tenant.effectiveCapabilities=['workforce.employee.read'];},
  a=>{a.session={...session,releaseSha:'b'.repeat(40),email:'another@example.invalid'};}]){
  const access={mode:'managed',principal:structuredClone(principal),session:{...session}};modify(access);
  const {handler,calls}=setup({requireCompatibleInternalAccess:async()=>access});const res=response();await handler(req(),res);
  assert.ok([401,403].includes(res.statusCode));assert.equal(calls.sql.length,0);
 }
 const absent=setup({requireCompatibleInternalAccess:async()=>null});await absent.handler(req(),response());assert.equal(absent.calls.sql.length,0);
});
test('own child transport rejects bad origins, duplicate headers, methods and query ambiguity before authentication',async()=>{
 const inputs=[{...req(),method:'DELETE'}, {...req(),headers:{...req().headers,origin:'https://foreign.example'}},
  {...req(),headers:{...req().headers,Origin:'https://municipio.example'}}, {...req(),query:{resource:'context'}},
  {...req(),headers:{...req().headers,'content-type':'text/plain'}},
  {method:'GET',query:{resource:'context',contractId:CONTRACT},url:`/?resource=context&resource=context&contractId=${CONTRACT}`,headers:{}},
  {method:'GET',query:{resource:'context',contractId:[CONTRACT]},headers:{}}];
 for(const input of inputs){const {handler,calls}=setup();const res=response();await handler(input,res);assert.ok(res.statusCode>=400);assert.equal(calls.auth,0);assert.equal(calls.sql.length,0);}
});
test('own child body is bounded to 8KiB and duplicate/escaped keys never reach SQL',async()=>{
 const inputs=[req(JSON.stringify(body()).replace('"familyName"','"familyName":"Other","familyName"')),
  req('{"familyName":"A","family\\u004eame":"B"}'),req('x'.repeat(8193)),req({...body(),dni:{value:'12345678'}}),
  {...req(),headers:{...req().headers,'content-length':'8193'}}, {...req(),headers:{...req().headers,'idempotency-key':''}}];
 const streamed=Readable.from([Buffer.alloc(5000),Buffer.alloc(5000)]);Object.assign(streamed,req());delete streamed.body;inputs.push(streamed);
 for(const input of inputs){const {handler,calls}=setup();const res=response();await handler(input,res);assert.ok(res.statusCode>=400);assert.equal(calls.sql.length,0);}
});
test('own child SQL rejection exposes only safe errors and a retry header for concurrent updates',async()=>{
 for(const [message,status,code] of [['EMPLOYEE_FAMILY_DUPLICATE',409,'DUPLICATE'],['EMPLOYEE_FAMILY_IDENTITY_CHANGED',409,'IDENTITY_CHANGED'],
  ['EMPLOYEE_FAMILY_IDEMPOTENCY_REUSE',409,'IDEMPOTENCY_REUSE'],['EMPLOYEE_FAMILY_SESSION_BUSY',409,'SESSION_BUSY'],['SCHOOL_CERTIFICATE_SESSION_INVALID',401,'SESSION_INVALID'],
  ['private database row and credentials',503,'SERVICE_UNAVAILABLE']]){
  const {handler}=setup({getInternalSql:async()=>({query:async()=>{throw new Error(message);}})});const res=response();await handler(req(),res);
  assert.equal(res.statusCode,status);assert.equal(res.payload.code,`EMPLOYEE_FAMILY_${code}`);assert.doesNotMatch(JSON.stringify(res.payload),/private database|credentials/);
  if(code==='SESSION_BUSY')assert.equal(res.headers['Retry-After'],'1');
 }
 assert.equal(employeeFamilySafeError(new Error('EMPLOYEE_FAMILY_UNKNOWN')).code,'EMPLOYEE_FAMILY_SERVICE_UNAVAILABLE');
});
test('certificate v2 validates discriminated family references and preserves the legacy numeric literal',async()=>{
 for(const ref of [{kind:'own',id:OWN.toUpperCase()},{kind:'grh',id:'0007'}]){
  const data=await prepareSchoolCertificate(certificateBody(ref),{version:2,validatePdf:async()=>{}});
  assert.deepEqual(data.familyRef,{kind:ref.kind,id:ref.kind==='own'?ref.id.toLowerCase():ref.id});assert.ok(!Object.hasOwn(data,'familyId'));
 }
 for(const ref of [{kind:'own',id:'7'},{kind:'grh',id:OWN},{kind:'other',id:'7'},{kind:'own',id:OWN,tenantId:TENANT},null])
  await assert.rejects(prepareSchoolCertificate(certificateBody(ref),{version:2,validatePdf:async()=>{}}));
 await assert.rejects(prepareSchoolCertificate(certificateBody(),{validatePdf:async()=>{}}));
});
test('certificate v2 is explicitly selected; default v1 cannot accidentally accept an own child',async()=>{
 const {handler,calls}=setup({getInternalSql:async()=>({query:async(statement,values)=>{calls.sql.push({statement,values});return [{result:{version:'family-schooling-register.v2',certificateId:OWN,duplicate:false}}];}})},true);
 const request=req(certificateBody());request.query={version:'2'};request.url='/api/internal-family-certificates?version=2';
 const res=response();await handler(request,res);assert.equal(res.statusCode,201);assert.match(calls.sql[0].statement,/school_certificate_register_v2/);assert.equal(calls.pdf,1);
 const rejected=response();await handler(req(certificateBody()),rejected);assert.equal(rejected.statusCode,422);assert.equal(calls.sql.length,1);
});
test('v2 unified report keeps distinct references and exposes unresolved matches without claiming unique children',()=>{
 const report=schooling();const legacy={...report.rows[0],familyRef:{kind:'grh',id:'7'},familyRecordedAt:null,declarationState:'source',identityReviewRequired:true};
 report.rows[0].identityReviewRequired=true;report.rows.push(legacy);report.scope.unresolvedFamilyRows=2;
 assert.equal(validateSchoolCertificateReport(report,CONTRACT,2).rows.length,2);
 for(const alter of [d=>{d.scope.unresolvedFamilyRows=0;},d=>{d.rows[0].declarationState='approved';},d=>{d.rows[0].dni='12345678';},
  d=>{d.rows[0].familyRef={kind:'own',id:'7'};},d=>{d.rows.push({...d.rows[0]});},d=>{d.version='family-schooling.v1';},d=>{d.rows[1].familyRecordedAt=AT;}]){
  const changed=structuredClone(report);alter(changed);assert.throws(()=>validateSchoolCertificateReport(changed,CONTRACT,2));
 }
 assert.throws(()=>validateSchoolCertificateReport(report,CONTRACT));
});
test('v2 report API supports explicit family/report reads and checks the returned requested scope',async()=>{
 for(const resource of ['family','report']){
  const data=schooling();if(resource==='report')data.scope.cohort='administrative_active_with_children';
  const calls=[];const {handler}=setup({getInternalSql:async()=>({query:async(statement,values)=>{calls.push({statement,values});return [{result:data}];}})},true);
  const q={resource,version:'2',...(resource==='family'?{contractId:CONTRACT}:{})};const res=response();
  await handler({method:'GET',query:q,url:'/api/internal-family-certificates?'+new URLSearchParams(q),headers:{}},res);
  assert.equal(res.statusCode,200);assert.match(calls[0].statement,/school_certificate_read_v2/);
 }
});
test('v2 download preserves byte verification/private attachment naming and cannot fall back to v1 on denial',async()=>{
 const file=certificateBody();const sqlCalls=[];
 const sql={query:async(statement,values)=>{sqlCalls.push({statement,values});return [{result:{version:'family-schooling-download.v2',filename:'source-name.pdf',contentBase64:file.contentBase64,sha256:file.sha256,byteLength:Buffer.from(file.contentBase64,'base64').length}}];}};
 const result=await downloadSchoolCertificate(sql,principal,session,OWN,{version:2});assert.equal(result.filename,`certificado-escolar-${OWN}.pdf`);assert.match(sqlCalls[0].statement,/download_v2/);
 let failures=0;await assert.rejects(downloadSchoolCertificate({query:async()=>{failures++;throw new Error('SCHOOL_CERTIFICATE_NOT_FOUND');}},principal,session,OWN,{version:2}),{code:'SCHOOL_CERTIFICATE_NOT_FOUND'});assert.equal(failures,1);
});
