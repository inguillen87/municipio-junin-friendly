import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildOwnReportCensusAuthorityPins,CENSUS_AUTH_SOURCE_PINS} from '../scripts/lib/own-payroll-report-census-authority.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const prepared=()=>buildOwnReportCensusAuthorityPins({read});

test('subderivación toma un único perfil published107 y el contexto176 actual',()=>{
 const p=prepared(),byName=new Map(p.pins.map(v=>[v.name,v]));
 assert.equal(byName.get('own_run_context_v1').sha256,'7902263d0b7208fc259abf58bbc7a225b301956abe04db73b57d6c2c42ff3e30');
 assert.equal(byName.get('tenant_iam_reviewed_operational_pair_v1').sha256,'0da6f93827fc83001121e191e17885eae2ffc73814178e6e26ca8efe7276f759');
 assert.equal(byName.get('native_employee_context_v1').sha256,'0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c');
 assert.equal(byName.get('native_employment_change_context_v1').sha256,'2e333bd185ce509f3f4715d83f48ce6a37341dfd32ef3e56e21942ff6995fe7b');
 assert.equal(byName.get('action_center_assert_tenant_read_session_v2').sha256,'bf2c0d9114c1c3f66636ba8d89f49a96133c9f4addcb49cee32cd5d17cc0e0bc');
 assert.equal(new Set(p.pins.map(v=>v.signature)).size,p.pins.length);
 assert.equal(p.pins.some(v=>/capture|roster|complete|programme|program_|calculation/.test(v.name)),false);
 assert.equal(p.pins.some(v=>/owner|adoption_authority/.test(v.name)),false);
 assert.equal(p.pins.some(v=>v.name==='own_close_context_v1'),false,'root combines the direct close125 pin without duplicates');
});
test('incluye frontera heredada de identidad condicional; no fuerza empleo actual nuevo',()=>{
 const p=prepared(),names=new Set(p.pins.map(v=>v.name));
 for(const name of ['native_salary_administrative_context_v1','native_employment_lifecycle_adopted_context_v2','native_account_contract_v1','native_employee_read_projection_v1'])assert.ok(names.has(name),name);
 assert.equal(p.pins.find(v=>v.name==='native_employee_read_projection_v1').runtime,true);
 assert.equal(p.pins.find(v=>v.name==='native_salary_administrative_context_v1').runtime,false);
});
test('RETURNS TABLE tiene guard completo aparte; no se finge un retorno escalar',()=>{
 const p=prepared();assert.equal(p.checks.length,1);
 assert.equal(p.pins.some(v=>v.name==='tenant_iam_effective_capabilities'),false);
 const guard=p.checks[0];for(const token of ["p.proretset","p.proargmodes","p.proallargtypes","ARRAY['p_membership_id','capability_key']","33cbd5bc0308793ac77ded577740bbaa1347cb3c19dfda73f77a5652d8485b71","a.grantee<>p.proowner"])assert.ok(guard.includes(token),token);
 assert.doesNotMatch(guard,/CREATE|ALTER|GRANT|REVOKE|UPDATE|DELETE|INSERT/);
});
test('ninguna capacidad o baseline se acepta desde el cliente del preparador',()=>{
 for(const options of [{read,operationalPairBaseline:'pre107'},{read,capabilities:[]},{read,sql:()=>{throw Error('not allowed');}},{read,sourceCommit:'a'.repeat(40)}])assert.throws(()=>buildOwnReportCensusAuthorityPins(options));
});
for(const file of Object.keys(CENSUS_AUTH_SOURCE_PINS))test('source drift rechaza '+file,()=>{
 assert.throws(()=>buildOwnReportCensusAuthorityPins({read:path=>path===file?read(path)+'\n-- synthetic source mutation':read(path)}),/CENSUS_AUTH_SOURCE_CHANGED/);
});
test('normalización sólo LF permite bytes Windows sin cambiar el cuerpo esperado',()=>{
 const a=prepared(),b=buildOwnReportCensusAuthorityPins({read:file=>read(file).replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n')});
 assert.deepEqual(b,a);
});
