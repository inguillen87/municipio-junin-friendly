import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {prepareCuratedImport} from '../scripts/import-rrhh-neon.mjs';

const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const python=process.platform==='win32'?'python':'python3';
const args=['tests/test_extract_rrhh_payroll_fields.py'];
const options={cwd:root,timeout:120000,maxBuffer:2*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}};

test('el SQL sintético conserva hechos originales, referencias y fallos sin reemplazo parcial',async()=>{
 const result=await run(python,args,options);
 assert.match(result.stderr,/Ran 12 tests/);
 assert.match(result.stderr,/\bOK\b/);
});

test('la proyección real de importación conserva todos los contratos y su fuente original completa',async()=>{
 const {stdout}=await run(python,[...args,'--emit-projection-fixture'],options),employees=JSON.parse(stdout);
 assert.equal(employees.length,57);
 // Pure projection test: this invented bundle is not a verified source or an authorized import.
 const names=['absences','leaves','familyMembers','sectors','categories','unions','unionMemberships',
  'agreements','absenceReasons','familyRelationships','jobRoles','organizations','exitReasons','employmentStatuses'];
 const datasets=Object.fromEntries(names.map(k=>[k,[]]));datasets.employees=employees;
 const source={manifest:{schemaVersion:'1.0.0',profile:'grh-junin-2026-08-06',
  source:{sha256:'a'.repeat(64),database:'synthetic_only',dumpCompletedAt:'2026-08-06 15:17:30'},
  validation:{strictSnapshot:false}},manifestSha256:'b'.repeat(64),datasets,embeddedMemberships:0};
 const prepared=prepareCuratedImport(source),rows=prepared.projectTables('7').grh_employees;
 assert.equal(rows.length,57);assert.equal(new Set(rows.map(r=>r.legajo)).size,57);
 for(const [n,row] of rows.entries()){
  const original=employees[n],payload=JSON.parse(row.source_payload);
  assert.deepEqual(payload,original);
  assert.equal(row.legajo,original.sourceKey.employeeNumber);
  assert.equal(row.import_run_id,'7');
  assert.equal(payload.sourceProvenance.primaryKey.LEGA_12,row.legajo);
  assert.equal(payload.sourceFields.SUEL_12,'100.100000000000000001');
  assert.equal(payload.sourceFields.NOLI_12,original.sourceFields.NOLI_12);
  assert.equal(payload.sourceReferences.department.sourceFields.nombre,original.sourceFields.iddepartamento==='7'?'042':'055');
 }
 assert.ok(rows.some(r=>JSON.parse(r.source_payload).sourceFields.NOLI_12===null));
 assert.ok(rows.every(r=>r.activo===true),'active proxy does not reinterpret NOLI_12');
 assert.equal(source.manifest.validation.strictSnapshot,false,'projection never certifies an invented source');
 assert.equal(prepared.qualityFlags.strictSnapshot,false);
});
