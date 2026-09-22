import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import readXlsxFile from 'read-excel-file/node';
import { createPayrollNoveltyCsv, payrollNoveltyCsvFileName } from '../assets/payroll-novelty-exporter.js';
import { createPayrollNoveltyXlsx, payrollNoveltyXlsxFileName } from '../assets/payroll-novelty-xlsx-exporter.js';

function legacy() {
  return {
    id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contractVersion:'payroll-novelty-batch.v1',
    sourceMode:'individual', periodMonth:'2026-09-01', payrollType:'monthly', status:'approved',
    exportable:true, grhMutation:false, payrollCalculated:false, payrollPosted:false, rowCount:1,
    rows:[{rowOrdinal:1, employmentContractId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', legajo:'571',
      conceptSourceId:'120',costCenterSourceId:'42',adjustmentMonth:null,quantityDecimal:'1.000001',
      amountCents:'9223372036854775807',movementType:'standard',legalInstrument:'Acta QA',
      observation:'Control sintético de QA',forced:false}],
  };
}
function native() {
  const snapshot = legacy();
  Object.assign(snapshot,{contractVersion:'payroll-novelty-batch.v2',version:3});
  Object.assign(snapshot.rows[0],{amountCents:'999999999999999999',issues:[],identityCurrent:true,subject:{
    contractId:snapshot.rows[0].employmentContractId,legajo:'571',employeeName:'Persona sintética QA',
    identityToken:'a'.repeat(64),sourceCutoff:null,origin:'MUNICONTROL',
    registrationId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',registeredAt:'2026-09-22T12:30:00.123456Z',
  }});
  return snapshot;
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function sheet(snapshot) {
  const workbook = await readXlsxFile(Buffer.from(createPayrollNoveltyXlsx(snapshot)));
  return Array.isArray(workbook[0]?.data) ? workbook[0].data : workbook;
}
const rejects = snapshot => {
  for (const exporter of [createPayrollNoveltyCsv,createPayrollNoveltyXlsx]) {
    assert.throws(() => exporter(snapshot), error => /^PAYROLL_NOVELTY_EXPORT_/.test(error.code));
  }
};

test('v1 CSV and XLSX match exact pre-change byte fingerprints',()=>{
  assert.equal(hash(createPayrollNoveltyCsv(legacy())),'55b5c33f28c31a144ceae2ccb50988c272e512e58d5275705b5a1e82a142e286');
  assert.equal(hash(createPayrollNoveltyXlsx(legacy())),'ca53eae3902c2923814af6b4163549cf27c4bb9fd561eff310968dbaab5ddaba');
});
test('native control preserves provenance and exact decimal strings in CSV and XLSX',async()=>{
  const snapshot = native(), before=JSON.stringify(snapshot);
  const csv=createPayrollNoveltyCsv(snapshot), rows=await sheet(snapshot);
  assert.equal(rows[0].length,20);
  assert.equal(rows[1][7],'1.000001'); assert.equal(rows[1][8],'999999999999999999');
  assert.deepEqual(rows[1].slice(14,19),['MUNICONTROL',snapshot.rows[0].employmentContractId,
    snapshot.rows[0].subject.registrationId,'2026-09-22T12:30:00.123456Z','Persona sintética QA']);
  assert.match(rows[1][19],/no calcula, liquida ni contabiliza salarios/);
  assert.match(csv,/;1\.000001;999999999999999999;/);
  assert.match(csv,/origen_registro;contrato_uuid;registro_alta_uuid;fecha_alta;nombre_empleado;alcance_control/);
  assert.doesNotMatch(csv,/GRH|homologad|respaldo/i);
  assert.equal(JSON.stringify(snapshot),before);
  assert.equal(createPayrollNoveltyCsv(snapshot),csv);
  assert.deepEqual(createPayrollNoveltyXlsx(snapshot),createPayrollNoveltyXlsx(snapshot));
  assert.equal(payrollNoveltyCsvFileName(snapshot),'control-novedad-alta-propia-2026-09-aaaaaaaa.csv');
  assert.equal(payrollNoveltyXlsxFileName(snapshot),'municontrol_control-novedad-alta-propia-2026-09-aaaaaaaa.xlsx');
});
test('null amount differs from explicit zero; negative decimal remains exact',async()=>{
  const missing=native(); Object.assign(missing.rows[0],{amountCents:null,quantityDecimal:'-0.000001'});
  const zero=structuredClone(missing); zero.rows[0].amountCents='0';
  assert.match(createPayrollNoveltyCsv(missing),/;-0\.000001;;standard;/);
  assert.match(createPayrollNoveltyCsv(zero),/;-0\.000001;0;standard;/);
  assert.equal((await sheet(missing))[1][8],null); assert.equal((await sheet(zero))[1][8],'0');
  const amountOnly=native();Object.assign(amountOnly.rows[0],{amountCents:'0',quantityDecimal:null});
  assert.equal((await sheet(amountOnly))[1][7],null); assert.equal((await sheet(amountOnly))[1][8],'0');
});
test('unapproved, stale, receipt-only and non-native snapshots cannot export',()=>{
  for (const mutate of [
    b=>b.status='draft',b=>b.status='submitted',b=>b.status='rejected',b=>b.status='cancelled',
    b=>b.exportable=false,b=>b.grhMutation=true,b=>b.payrollCalculated=true,b=>b.payrollPosted=true,
    b=>b.sourceMode='bulk',b=>b.payrollType='first_fortnight',b=>b.rowCount=2,
    b=>b.periodMonth=202609,b=>b.version=null,
    b=>b.rows.push({...b.rows[0],rowOrdinal:2}),b=>b.rows[0].identityCurrent=false,
    b=>delete b.rows[0].identityCurrent,b=>b.rows[0].identityCurrent='true',
    b=>b.rows[0].subject.origin='GRH',b=>b.rows[0].subject.sourceCutoff='2026-09-10T15:00:00Z',
    b=>b.rows[0].subject.extra=true,b=>b.rows[0].subject.identityToken='invalid',
    b=>b.rows[0].subject.registrationId=null,b=>b.rows[0].subject.registeredAt='invalid',
    b=>b.rows[0].contractId=b.rows[0].employmentContractId,
  ]) { const value=native();mutate(value);rejects(value); }
});
test('same legajo is insufficient when contract identity or original subject disagrees',()=>{
  for(const mutate of [b=>b.rows[0].employmentContractId='dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    b=>b.rows[0].subject.legajo='572', b=>b.rows[0].legajoSnapshot='572',
    b=>delete b.rows[0].employmentContractId]) {const b=native();mutate(b);rejects(b);}
});
test('native number values cannot silently round or replace absent metadata',()=>{
  for(const changes of [{amountCents:999999999999999999},{amountCents:''},{amountCents:undefined},
    {amountCents:'9223372036854775807'},{quantityDecimal:1.000001},{quantityDecimal:'-0.000000'},
    {quantityDecimal:'1.0000001'},{quantityDecimal:null,amountCents:null},
    {forced:true,amountCents:null},{forced:true,observation:'short'}]){
    const b=native();Object.assign(b.rows[0],changes);rejects(b);
  }
});
test('formula-like names and source text remain inert CSV text and XLSX strings',async()=>{
  const b=native();Object.assign(b.rows[0],{legalInstrument:'@SUM(A1:A2)',observation:'=HYPERLINK("https://invalid.example")'});
  b.rows[0].subject.employeeName='+SUM(A1:A2)';
  const csv=createPayrollNoveltyCsv(b); assert.match(csv,/;'@SUM/);assert.match(csv,/;'\+SUM/);
  assert.match(csv,/"'=HYPERLINK/);
  const rows=await sheet(b);assert.equal(rows[1][18],'+SUM(A1:A2)');
  assert.equal(rows[1][11],b.rows[0].observation);
  const raw=Buffer.from(createPayrollNoveltyXlsx(b)).toString('utf8');
  assert.doesNotMatch(raw,/<f[\s>]|<v>|t="n"/); assert.match(raw,/t="inlineStr"/);
});
