import {directoryQueryRows} from './fixtures/internal-directory-query.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {employeeDraft,EMPLOYEE_FIELDS,LEGACY_EMPLOYEE_FIELDS,EMPLOYEE_JURISDICTION_CODES} from '../assets/native-employee-contract.js';
import {employeeOperation,validateReceipt} from '../lib/internal-native-employees.js';
import {nativeEmployeeDetail} from '../lib/native-employee-directory.js';
import {employees,employee} from '../api/internal-data.js';
import {buildNativeJurisdictionQa} from '../scripts/verify-native-jurisdiction-sql.mjs';
import {ID,CONTRACT,TENANT,draft,catalog,receipt,principal,session} from './fixtures/native-employee-synthetic.js';
const today='2026-09-21';
const input=code=>({...draft(),jurisdictionCode:code});
const mockSql=value=>({calls:[],async query(sql,values){this.calls.push({sql,values});return[{result:value}];}});

test('jurisdiction is explicit: old13 input preserves exact JSON and no new default',()=>{
 const legacy=draft();const parsed=employeeDraft(legacy,today);
 assert.equal(LEGACY_EMPLOYEE_FIELDS.length,13);assert.equal(EMPLOYEE_FIELDS.length,14);assert.deepEqual(EMPLOYEE_JURISDICTION_CODES,['42','55']);
 assert.deepEqual(parsed,legacy);assert.equal(Object.hasOwn(parsed,'jurisdictionCode'),false);
 assert.throws(()=>employeeDraft(legacy,today,{requireJurisdiction:true}),{field:'jurisdictionCode'});
});
for(const code of ['42','55'])test('new native input accepts declared jurisdiction '+code,()=>{
 const parsed=employeeDraft(input(code),today,{requireJurisdiction:true});assert.equal(parsed.jurisdictionCode,code);assert.equal(Object.keys(parsed).length,14);assert.ok(Object.isFrozen(parsed));
});
for(const code of [null,undefined,42,55,'','43','042',' 42 ','42 ','55\n',['42'],{code:'42'}])test('reject noncanonical jurisdiction '+JSON.stringify(code),()=>{
 assert.throws(()=>employeeDraft(input(code),today),{field:'jurisdictionCode'});
});
test('agreement and sector never supply a jurisdiction',()=>{
 for(const changes of [{agreementCode:'42'},{agreementCode:'55'},{sectorCode:'42'},{organizationId:'55'}])assert.equal(Object.hasOwn(employeeDraft(draft(changes),today),'jurisdictionCode'),false);
 assert.throws(()=>employeeDraft({...input('42'),fiscalActivity:'invented'},today));
});
for(const code of ['42','55'])test('API passes declared jurisdiction to the real create facade and verifies receipt '+code,async()=>{
 const sql=mockSql({...receipt,jurisdictionCode:code});const r=await employeeOperation(sql,principal,session,'create',{key:ID,body:{draft:input(code),catalogVersion:catalog.version}});
 assert.equal(r.jurisdictionCode,code);assert.equal(sql.calls.length,1);assert.equal(JSON.parse(sql.calls[0].values[1]).jurisdictionCode,code);assert.match(sql.calls[0].sql,/native_employee_create_v1/);
});
test('API still sends historical13 JSON without adding null or defaults',async()=>{
 const sql=mockSql(receipt);await employeeOperation(sql,principal,session,'create',{key:ID,body:{draft:draft(),catalogVersion:catalog.version}});
 assert.deepEqual(JSON.parse(sql.calls[0].values[1]),draft());assert.equal(Object.hasOwn(JSON.parse(sql.calls[0].values[1]),'jurisdictionCode'),false);
});
for(const value of [receipt,{...receipt,jurisdictionCode:'55'},{...receipt,jurisdictionCode:null},{...receipt,jurisdictionCode:42}])test('changed or missing declaration never becomes a confirmed new receipt '+JSON.stringify(value.jurisdictionCode),async()=>{
 const sql=mockSql(value);await assert.rejects(employeeOperation(sql,principal,session,'create',{key:ID,body:{draft:input('42'),catalogVersion:catalog.version}}),{code:'NATIVE_EMPLOYEE_CONTRACT_INVALID',status:503});
});
test('historical receipt cannot acquire a declaration not present in original request',async()=>{
 await assert.rejects(employeeOperation(mockSql({...receipt,jurisdictionCode:'42'}),principal,session,'create',{key:ID,body:{draft:draft(),catalogVersion:catalog.version}}),{code:'NATIVE_EMPLOYEE_CONTRACT_INVALID'});
});
for(const jurisdictionCode of [null,'',43,'43'])test('receipt validation fails closed for jurisdiction '+JSON.stringify(jurisdictionCode),()=>assert.throws(()=>validateReceipt({...receipt,jurisdictionCode}),{code:'NATIVE_EMPLOYEE_CONTRACT_INVALID'}));
test('lost receipt recovery supports both original and declared immutable receipts',async()=>{
 for(const value of [{...receipt,replayed:true},{...receipt,jurisdictionCode:'55',replayed:true}]){
  const r=await employeeOperation(mockSql(value),principal,session,'attempt',{key:ID});assert.deepEqual(r,value);
 }
});
test('invalid declaration fails before executing a write',async()=>{
 const sql=mockSql(receipt);await assert.rejects(employeeOperation(sql,principal,session,'create',{key:ID,body:{draft:input('43'),catalogVersion:catalog.version}}),{code:'NATIVE_EMPLOYEE_INPUT_INVALID'});assert.equal(sql.calls.length,0);
});
test('native detail projects declared value and legacy null without inferring it from encuadre',()=>{
 const row={contractId:CONTRACT,rawFields:{employment:{agreementName:'42',sectorName:'55'},native:{legalReference:'QA'}}};
 assert.equal(nativeEmployeeDetail(row).payload.data.jurisdictionCode,null);
 assert.equal(nativeEmployeeDetail({...row,jurisdictionCode:'55'}).payload.data.jurisdictionCode,'55');
});
test('directory and detail select jurisdiction only from canonical native column',async()=>{
 const mock=()=>({calls:[],async query(sql,values){this.calls.push({sql,values});return directoryQueryRows();}});
 const directory=mock();await employees(directory,{query:{status:'all',includeFacets:'0'}},{database:'qa',companyId:7,tenantId:TENANT});
 assert.ok(directory.calls.some(x=>/CASE WHEN contract.source_system='MUNICONTROL' THEN contract.jurisdiction_code ELSE NULL END AS "jurisdictionCode"/.test(x.sql)));
 const detail=mock();await employee(detail,{query:{contractId:CONTRACT}},TENANT);assert.match(detail.calls[0].sql,/contract.jurisdiction_code ELSE NULL END AS "jurisdictionCode"/);
});
for(const major of ['17','18'])test('095 offline QA wraps actual migrations with preserved legacy and rollback '+major,()=>{
 const qa=buildNativeJurisdictionQa({serverMajor:major,requireConcurrency:true});
 assert.equal(qa.report.jurisdictionChecksPassed,59);assert.equal(qa.report.checksPassed,268);assert.match(qa.sql,/095 preserves original registration JSON/);assert.match(qa.sql,/14-field exact replay/);assert.match(qa.sql,/095 refuses altered jurisdiction constraint/);assert.match(qa.sql,/095 rejects a changed literal in the observed/);assert.match(qa.sql,/095 reapplies over retained observed guards/);assert.match(qa.sql,/ROLLBACK;/);assert.match(qa.lockSql,/FIXED_NOVELTIES_QA_LOCK_READY/);
 assert.doesNotMatch(qa.sql,/INSERT\s+INTO\s+public\./i);
});
test('095 keeps historical sources unchanged and pins full original or installed bodies',()=>{
 const sql=fs.readFileSync('scripts/migrations/095-native-employee-jurisdiction.sql','utf8');assert.match(sql,/ADD COLUMN IF NOT EXISTS jurisdiction_code text/);assert.match(sql,/NOT IN\(item.original_sha256,item.installed_sha256,item.observed_067_sha256\)/);assert.match(sql,/jsonb_object_keys\(d-'jurisdictionCode'\)/);assert.match(sql,/NOT IN \('42','55'\)/);assert.doesNotMatch(sql,/INSERT INTO iam_|UPDATE public.employment_contract|CREATE OR REPLACE FUNCTION public.payroll_fixed_/);
});
