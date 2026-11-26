import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {employeeBulkRows,EmployeeBulkError,EMPLOYEE_BULK_VERSION,EMPLOYEE_BULK_MAX} from '../assets/native-employee-bulk-model.js';
import {draft,bootstrap} from './fixtures/native-employee-synthetic.js';

const person=(patch={})=>({...draft({jurisdictionCode:'42',...patch})});
const file=employees=>JSON.stringify({version:EMPLOYEE_BULK_VERSION,employees});

test('a prepared file yields one validated draft per employee, with catalogue labels for the review',()=>{
 const rows=employeeBulkRows(file([person(),person({fullName:'OTRA PERSONA QA',dni:'99999991',cuil:'20999999914',legajo:'5002'})]),bootstrap);
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(row=>row.error),[null,null]);
 assert.equal(rows[0].labels.agreement,'Convenio QA 1');
 assert.equal(rows[0].labels.category,'6-D');
 assert.equal(rows[1].draft.legajo,'5002');
});

test('a row that fails the individual contract or the catalogue is reported and never becomes a draft',()=>{
 const rows=employeeBulkRows(file([person({cuil:'20999999999'}),person({categoryCode:'13'}),person({extra:'x'}),person()]),bootstrap);
 assert.equal(rows[0].draft,null);assert.match(rows[0].error,/CUIL/);
 assert.equal(rows[1].draft,null);assert.match(rows[1].error,/categoría/);
 assert.equal(rows[2].draft,null);
 assert.equal(rows[3].error,null);
});

test('repeated identities inside one file are refused after the first',()=>{
 const rows=employeeBulkRows(file([person(),person()]),bootstrap);
 assert.equal(rows[0].error,null);assert.match(rows[1].error,/Repite DNI/);
});

test('anything that is not the declared file format is refused whole',()=>{
 for(const text of ['','[]','{"version":"x","employees":[]}',file([]),file(Array.from({length:EMPLOYEE_BULK_MAX+1},()=>person())),JSON.stringify({version:EMPLOYEE_BULK_VERSION,employees:[person()],extra:1})])
  assert.throws(()=>employeeBulkRows(text,bootstrap),EmployeeBulkError);
});

test('the bulk screen keeps nothing in browser storage, creates through the individual service and stops when a result is uncertain',()=>{
 const source=fs.readFileSync(new URL('../assets/native-employee-bulk.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB/);
 assert.match(source,/\/api\/internal-native-employees/);
 assert.match(source,/Idempotency-Key/);
 assert.match(source,/employeeReceipt\(receipt,row\.draft\)/);
 assert.match(source,/No se envió ninguna más/);
 assert.match(fs.readFileSync(new URL('../internal-dashboard.html',import.meta.url),'utf8'),/assets\/native-employee-bulk\.js/);
});
test('bulk registration files are part of the published build',()=>{const b=fs.readFileSync('scripts/build-friendly.mjs','utf8');assert.match(b,/'assets\/native-employee-bulk-model\.js'/);assert.match(b,/'assets\/native-employee-bulk\.js'/);});
test('review table is built with calls that return the created node',()=>{const s=fs.readFileSync('assets/native-employee-bulk.js','utf8');assert.doesNotMatch(s,/\.append\([^;]*\)\.append\(/);});
