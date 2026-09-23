import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {schoolingData,schoolingFilter,schoolingRevision} from '../assets/family-schooling-model.js';
import {schoolingXlsx} from '../assets/family-schooling-export.js';
import {schoolingFixtureV4} from './fixtures/family-schooling-synthetic.js';
import {nativeSchoolingFixture,nativeFamilyIds} from './fixtures/native-family-schooling-synthetic.js';
const queriedAt='2026-09-22T12:00:00Z',filters={asOf:'2026-09-22'};
function workbook(payload){const data=schoolingData(payload,{version:5}),view=schoolingFilter(data,filters);return {data,view,files:unzipSync(schoolingXlsx(data,view,queriedAt))};}
const sheet=files=>strFromU8(files['xl/worksheets/sheet1.xml']);
test('v4 GRH export remains byte identical to the pre-102 workbook',()=>{
 const data=schoolingData(schoolingFixtureV4(3),{version:4}),bytes=schoolingXlsx(data,schoolingFilter(data,filters),queriedAt);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'7b27d7630b905ae3fdc570e69794cea9f95dbbaf147a82ab2d7da4bd95e15911');
});
test('mixed workbook identifies native contract and registration separately from GRH and child declaration',()=>{
 const {files,view}=workbook(nativeSchoolingFixture()),s=sheet(files),control=strFromU8(files['xl/worksheets/sheet2.xml']);
 assert.equal(view.counts.contracts,3);assert.match(s,/<autoFilter ref="A1:AL5"/);assert.match(s,/Origen del legajo/);
 for(const id of [nativeFamilyIds.contract,nativeFamilyIds.otherContract,nativeFamilyIds.registration,nativeFamilyIds.otherRegistration])assert.ok(s.includes(id));
 assert.match(s,/Alta propia de MuniControl/);assert.match(s,/No corresponde: alta propia/);assert.match(s,/2026-08-06T18:15:21Z/);
 assert.match(control,/Ninguna acredita elegibilidad salarial/);assert.match(control,/sin lote ni corte GRH inventados/);assert.doesNotMatch(s,/identityToken|sourceSha256/);
});
test('native paper export preserves absent dates and zero history without inventing PDF or a GRH cutoff',()=>{
 const {files}=workbook(nativeSchoolingFixture({mixed:false})),s=sheet(files);
 assert.match(s,/Sin vencimiento informado/);assert.match(s,/Presentación en papel declarada; sin adjunto/);assert.match(s,/Fecha no informada/);assert.match(s,/>0<\/t>/);
 assert.doesNotMatch(s,/2026-08-06|certificado-sintetico\.pdf|2050/);
});
test('native exported values are inline text and formula-like content never becomes a spreadsheet formula',()=>{
 const p=nativeSchoolingFixture({mixed:false});p.data.rows[0].familyName='=HYPERLINK("https://example.invalid")';p.data.rows[0].employeeName='+SUM(1,2)';p.data.rows[0].certificate.institution='@SUM(2,3)';
 const s=sheet(workbook(p).files);assert.match(s,/=HYPERLINK\(&quot;/);assert.match(s,/\+SUM\(1,2\)/);assert.doesNotMatch(s,/<f(?:>|\s)|<hyperlinks/);
});
for(const [name,mutate] of [
 ['forged source cutoff',r=>r.sourceCutoff='2026-09-22T00:00:00Z'],['GRH reference on native',r=>r.familyRef={kind:'grh',id:'1'}],
 ['missing registration',r=>r.nativeRegistrationId=null],['invalid registration time',r=>r.nativeRegisteredAt='2026-02-30T00:00:00Z'],
 ['invented source dates',r=>r.sourceSchooling={}],['unknown origin',r=>r.employeeOrigin='OTHER'],
])test('native export rejects '+name,()=>{
 const p=nativeSchoolingFixture({mixed:false}),d=schoolingData(p,{version:5}),rows=d.rows.map(r=>({...r}));mutate(rows[0]);const changed={...d,rows};
 assert.throws(()=>schoolingXlsx(changed,schoolingFilter(changed,filters),queriedAt));
});
test('export cannot substitute a foreign filtered row and native provenance changes fresh revision',()=>{
 const {data,view}=workbook(nativeSchoolingFixture({mixed:false}));assert.throws(()=>schoolingXlsx(data,{...view,rows:[{...view.rows[0]}]},queriedAt));
 const p=nativeSchoolingFixture({mixed:false}),before=schoolingRevision(schoolingData(p,{version:5}));p.data.rows[0].nativeRegisteredAt='2026-09-22T10:01:00Z';
 assert.notEqual(schoolingRevision(schoolingData(p,{version:5})),before);
});
