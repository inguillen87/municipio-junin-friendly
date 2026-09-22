// API/contract tests with explicit synthetic responses, not SQL or municipal acceptance.
import test from 'node:test';import assert from 'node:assert/strict';
import {createInternalPayrollFixedNoveltiesHandler} from '../api/internal-payroll-fixed-novelties.js';
import {validateFixedResponse} from '../lib/internal-payroll-fixed-novelties.js';
import {fixedEmployee,fixedList,fixedDetail,fixedExportData,fixedOriginLabel} from '../assets/payroll-fixed-novelties-model.js';
import {fixedCsv,fixedXlsx} from '../assets/payroll-fixed-novelties-export.js';
import {fixedFixture,fixedNativeSubject,fixedSubject,fixedValues,fixedUuid as uuid} from './fixtures/payroll-fixed-novelties-synthetic.js';
import {unzipSync,strFromU8} from 'fflate';
const native=fixedNativeSubject(),wrap=data=>({ok:true,data});
const session={id:uuid(900),email:'preparer@example.invalid',version:1,releaseSha:'a'.repeat(40)};
const principal={user:{email:session.email},tenant:{source:'membership',id:uuid(1),membershipId:uuid(2),certifiedReleaseSha:session.releaseSha,effectiveCapabilities:['payroll.novelty.read','payroll.novelty.nominal.read','payroll.fixed.prepare']}};
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
function handler(result){const calls=[];return{calls,handler:createInternalPayrollFixedNoveltiesHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireCompatibleInternalAccess:async()=>({mode:'managed',principal}),actionMutationSession:()=>session,getInternalSql:async()=>({query:async(text,values)=>{calls.push({text,values});if(result instanceof Error)throw result;return[{result}];}})})};}
test('exact contract lookup binds canonical UUID and reuses nominal authority without adding permissions',async()=>{
 const data={version:'payroll-fixed-employee.v1',subject:native},{handler:run,calls}=handler(data),res=response();
 await run({method:'GET',query:{resource:'employee',contractId:native.contractId.toUpperCase()}},res);
 assert.equal(res.statusCode,200);assert.match(calls[0].text,/payroll_fixed_registry_employee_by_contract_v1\(\$1::jsonb,\$2::uuid\)/);assert.equal(calls[0].values[1],native.contractId);
 assert.equal(JSON.parse(calls[0].values[0]).tenantId,uuid(1));assert.deepEqual(fixedEmployee(res.body,{contractId:native.contractId}),native);assert.equal(fixedOriginLabel(native),'Alta propia de MuniControl');
});
test('lookup rejects mixed selectors, missing selector, malformed UUID and tenant injection before SQL',async()=>{
 for(const query of [{resource:'employee',contractId:native.contractId,legajo:native.legajo},{resource:'employee'},{resource:'employee',contractId:'9001'},{resource:'employee',contractId:'00000000-0000-0000-0000-000000000000'},{resource:'employee',contractId:native.contractId,tenantId:uuid(99)}]){
  const {handler:run,calls}=handler(null),res=response();await run({method:'GET',query},res);assert.equal(res.statusCode,400);assert.equal(calls.length,0);
 }
});
test('native source metadata is a closed shape and can never masquerade as a GRH cutoff',()=>{
 const good={version:'payroll-fixed-employee.v1',subject:native};assert.doesNotThrow(()=>validateFixedResponse(good,'employee',{contractId:native.contractId}));
 for(const patch of [{origin:'GRH'},{origin:undefined},{registrationId:null},{registrationId:'00000000-0000-0000-0000-000000000000'},{registeredAt:null},{sourceCutoff:'2026-09-01T12:00:00Z'},{extra:'x'},{contractId:uuid(999)}]){
  const data={...good,subject:{...native,...patch}};assert.throws(()=>validateFixedResponse(data,'employee',{contractId:native.contractId}));assert.throws(()=>fixedEmployee(wrap(data),{contractId:native.contractId}));
 }
 assert.throws(()=>validateFixedResponse(good,'employee',{legajo:native.legajo}));assert.throws(()=>fixedEmployee(wrap(good),native.legajo));
});
test('legacy GRH lookup and exact historical snapshot remain compatible',async()=>{
 const subject=fixedSubject(),data={version:'payroll-fixed-employee.v1',subject},{handler:run,calls}=handler(data),res=response();
 await run({method:'GET',query:{resource:'employee',legajo:subject.legajo}},res);assert.equal(res.statusCode,200);assert.match(calls[0].text,/payroll_fixed_registry_employee_v1/);
 assert.deepEqual(fixedEmployee(res.body,subject.legajo),subject);assert.equal(fixedOriginLabel(subject),'Fuente GRH');
 assert.deepEqual(fixedEmployee(res.body,{contractId:subject.contractId}),subject);
});
test('a foreign or withdrawn native contract never becomes an empty success',async()=>{
 for(const code of ['PAYROLL_FIXED_NOT_FOUND','PAYROLL_FIXED_IDENTITY_CHANGED','PAYROLL_FIXED_CAPABILITY_REQUIRED']){
  const {handler:run}=handler(Error(code)),res=response();await run({method:'GET',query:{resource:'employee',contractId:native.contractId}},res);assert.ok([403,404,409].includes(res.statusCode));assert.equal(res.body.ok,false);assert.equal(res.body.code,code);
 }
});
test('native proposal sends exact contract snapshot; response loss does not change wire identity',async()=>{
 const payload={recordId:null,expectedVersion:0,contractId:native.contractId,legajo:native.legajo,identityToken:native.identityToken,operation:'set',values:fixedValues(),reason:'Alta propia con acto declarado'};
 const receipt={version:'payroll-fixed-receipt.v1',command:'propose',recordId:uuid(40),proposalId:uuid(50),recordVersion:1,duplicate:true};
 const {handler:run,calls}=handler(receipt),req={method:'POST',query:{},headers:{origin:'https://municipio.example','content-type':'application/json','idempotency-key':uuid(777)},body:{command:'propose',payload}},res=response();
 await run(req,res);assert.equal(res.statusCode,200);assert.equal(res.headers['Idempotency-Replayed'],'true');assert.deepEqual(JSON.parse(calls[0].values[1]),payload);assert.equal(calls[0].values[2],uuid(777));
 const modified=response();await run({...req,body:{command:'propose',payload:{...payload,origin:'GRH'}}},modified);assert.equal(modified.statusCode,422);assert.equal(calls.length,1);
});
test('native history and exports preserve origin, absent cutoff and original approved values',()=>{
 const f=fixedFixture();f.state.subjects.set(native.contractId,native);
 const p={recordId:null,expectedVersion:0,contractId:native.contractId,legajo:native.legajo,identityToken:native.identityToken,operation:'set',values:fixedValues(),reason:'Alta propia de ensayo revisable'};
 const first=f.mutate('propose',p,uuid(81));f.state.role='reviewer';f.mutate('review',{recordId:first.data.recordId,proposalId:first.data.proposalId,expectedVersion:1,decision:'approve',reason:'Revisión independiente sintética'},uuid(82));f.state.role='preparer';
 f.mutate('propose',{...p,recordId:first.data.recordId,expectedVersion:2,values:fixedValues({quantityDecimal:'2'})},uuid(83));
 const list=fixedList(wrap(f.list('2026-09-01')),'2026-09-01'),detail=fixedDetail(wrap(f.detail(first.data.recordId)),first.data.recordId),exported=fixedExportData(wrap(f.exporter('2026-09-01')),list);
 assert.equal(list.rows[0].subject.origin,'MUNICONTROL');assert.equal(detail.record.approved.values.quantityDecimal,'1');assert.equal(detail.record.pending.values.quantityDecimal,'2');
 assert.equal(exported.rows[0].values.quantityDecimal,'1');assert.equal(exported.rows[0].subject.sourceCutoff,null);
 const csv=fixedCsv(exported),files=unzipSync(fixedXlsx(exported)),sheet=strFromU8(files['xl/worksheets/sheet1.xml']);
 for(const text of ['Alta propia de MuniControl','No corresponde · alta propia',native.registeredAt]){assert.ok(csv.includes(text));assert.ok(sheet.includes(text));}
 for(const secret of [native.registrationId,native.contractId,native.identityToken]){assert.equal(csv.includes(secret),false);assert.equal(sheet.includes(secret),false);}
 const drift=structuredClone(f.exporter('2026-09-01'));drift.rows[0].subject.registrationId=uuid(999);assert.throws(()=>fixedExportData(wrap(drift),list));
});
