import test from 'node:test';
import assert from 'node:assert/strict';
import readXlsxFile from 'read-excel-file/node';
import { assertNativeMonthlySubject, buildNativeMonthlyDraft, assertNativeMonthlyPrepareReceipt, savedNoveltyBatch, verifyMonthlyEmployee, verifyMonthlyBatch } from '../assets/payroll-native-monthly-model.js';
import { normalizeNativePayrollNoveltyDraft, normalizePayrollNoveltyDraft } from '../lib/internal-payroll-novelty.js';
import { createPayrollNoveltyCsv } from '../assets/payroll-novelty-exporter.js';
import { createPayrollNoveltyXlsx } from '../assets/payroll-novelty-xlsx-exporter.js';
import { noveltyBatchControl, noveltyControlCsv } from '../assets/payroll-novelty-review.js';
import { pickerEmployee, pickerResult, addPickerSelection, noveltySelectionIssue } from '../assets/employee-picker-model.js';
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const subject = legajo => ({contractId:id(1),legajo,employeeName:'Registro adoptado sintético',identityToken:'a'.repeat(64),sourceCutoff:null,origin:'MUNICONTROL',registrationId:id(2),registeredAt:'2026-10-06T12:00:00.123456Z'});
const row = legajo => ({rowOrdinal:1,legajo,conceptSourceId:'95',costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:'100',amountCents:null,movementType:'standard',legalInstrument:null,observation:null,forced:false});
const draft = legajo => ({sourceMode:'individual',periodMonth:'2026-10-01',payrollType:'monthly',rows:[row(legajo)]});
const batch = (legajo,receipt=false) => ({id:id(3),contractVersion:'payroll-novelty-batch.v2',sourceMode:'individual',periodMonth:'2026-10-01',payrollType:'monthly',rowCount:1,status:receipt?'draft':'approved',version:receipt?1:3,exportable:!receipt,grhMutation:false,payrollCalculated:false,payrollPosted:false,...(receipt?{}:{canExport:true,allowedCommands:[]}),rows:[{...row(legajo),subject:subject(legajo),employmentContractId:id(1),issues:[],...(receipt?{}:{identityCurrent:true})}]});

test('directory accepts exact opaque own registrations only with explicit origin and retains ambiguity and authority guards',()=>{
  const employee=legajo=>({contractId:id(1),legajo,nombre:'Registro sintético',sector:null,convenio:null,activo:true,statusSnapshotDate:null,recordOrigin:'MUNICONTROL'});
  const payload=rows=>({ok:true,version:'employee-picker.v1',data:rows,pagination:{page:1,limit:20,total:rows.length,pages:1},scope:{status:'administrative_active',payrollEligibilityCertified:false,sourceCutoffFrom:null,sourceCutoffTo:null}});
  for(const legajo of [' A/009010 ','00095','😀'.repeat(64)]){
    const e=pickerEmployee(employee(legajo));
    assert.equal(pickerResult(payload([e]),1).rows[0].legajo,legajo);
    assert.equal(addPickerSelection([],e)[0].legajo,legajo);
    assert.match(noveltySelectionIssue(e,{mode:'individual',canUseNative:false}),/permiso/);
    assert.match(noveltySelectionIssue(e,{mode:'bulk',canUseNative:true}),/individual mensual/);
    for(const recordOrigin of ['GRH',undefined,null,'native'])assert.throws(()=>pickerEmployee({...e,recordOrigin}));
    assert.throws(()=>pickerResult(payload([e,{...e,contractId:id(2)}]),1));
    assert.throws(()=>pickerResult(payload([e,{...e,legajo:'Otro'}]),1));
  }
  for(const legajo of ['', 'x'.repeat(65),'😀'.repeat(65),'A\n9','A\u00809','A\u009f9'])assert.throws(()=>pickerEmployee(employee(legajo)));
  assert.throws(()=>pickerEmployee({...employee('A/95'),activo:false}));
  assert.equal(pickerEmployee({...employee('95'),recordOrigin:'GRH'}).legajo,'95');
});

test('opaque adopted legajos survive selection, preparation, API and immutable receipt exactly',()=>{
  for(const legajo of [' A/009010 ','00095','A-35/1','Área 9','😀'.repeat(64)]){
    const s=subject(legajo),d=buildNativeMonthlyDraft(draft(legajo),s),before=JSON.stringify(d);
    assert.equal(assertNativeMonthlySubject(s),s);
    assert.equal(verifyMonthlyEmployee({version:'payroll-novelty-employee.v2',subject:s},id(1)),s);
    assert.equal(normalizeNativePayrollNoveltyDraft(d).rows[0].legajo,legajo);
    assert.equal(assertNativeMonthlyPrepareReceipt(batch(legajo,true),d,s).rows[0].legajo,legajo);
    assert.equal(savedNoveltyBatch(batch(legajo)).rows[0].legajo,legajo);
    assert.equal(JSON.stringify(d),before);assert.ok(Object.isFrozen(d.rows[0]));
  }
});
test('explicit UUID entry cannot broaden legacy manual/GRH validation or concept grammar',()=>{
  const s=subject(' A/009010 '),d=buildNativeMonthlyDraft(draft(s.legajo),s);
  assert.throws(()=>normalizePayrollNoveltyDraft(draft(s.legajo)),e=>e.code==='PAYROLL_NOVELTY_LEGAJO_INVALID');
  const {origin,registrationId,registeredAt,...legacy}=s;
  assert.throws(()=>verifyMonthlyEmployee({version:'payroll-novelty-employee.v2',subject:{...legacy,sourceCutoff:'2026-10-01T00:00:00Z'}},id(1)));
  for(const conceptSourceId of ['095','A/95','95.0']){
    assert.throws(()=>normalizeNativePayrollNoveltyDraft({...d,rows:[{...d.rows[0],conceptSourceId}]}));
    assert.throws(()=>buildNativeMonthlyDraft({...draft(s.legajo),rows:[{...row(s.legajo),conceptSourceId}]},s));
  }
  assert.throws(()=>buildNativeMonthlyDraft(draft('009010'),s));
});
test('no controls, extra fields, overlong snapshots or alternative identity can enter a native draft',()=>{
  for(const legajo of ['', 'x'.repeat(65),'😀'.repeat(65),'A\n9','A\u00809','A\u009f9']){
    assert.throws(()=>assertNativeMonthlySubject(subject(legajo)));
    assert.throws(()=>normalizeNativePayrollNoveltyDraft({...draft(legajo),rows:[{...row(legajo),contractId:id(1),identityToken:'a'.repeat(64)}]}));
  }
  const s=subject('A/95'),d=buildNativeMonthlyDraft(draft(s.legajo),s);
  assert.throws(()=>normalizeNativePayrollNoveltyDraft({...d,rows:[{...d.rows[0],origin:'MUNICONTROL'}]}));
  assert.throws(()=>normalizeNativePayrollNoveltyDraft({...d,rows:[{...d.rows[0],contractId:null}]}));
  assert.throws(()=>normalizeNativePayrollNoveltyDraft({...d,rows:[d.rows[0],d.rows[0]]}));
});
test('receipt and current-read checks reject substituted legajo, registration, token and revoked identity',()=>{
  const s=subject('A/95'),d=buildNativeMonthlyDraft(draft(s.legajo),s);
  for(const [key,value] of Object.entries({legajo:'95',registrationId:id(4),identityToken:'b'.repeat(64),registeredAt:'2026-10-06T12:00:00.123457Z'})){
    const b=batch(s.legajo,true);b.rows[0].subject[key]=value;
    assert.throws(()=>assertNativeMonthlyPrepareReceipt(b,d,s));
  }
  const b=batch(s.legajo);b.rows[0].identityCurrent=false;
  assert.throws(()=>verifyMonthlyBatch(b,{mode:'export'}));
  assert.throws(()=>createPayrollNoveltyCsv(b));
  assert.throws(()=>createPayrollNoveltyXlsx(b));
});
test('opaque CSV identifiers neutralize formulas including leading spaces and escape separators',()=>{
  for(const legajo of ['=1+1',' +1',' -1',' @SUM(1)','A;"009"']){
    const b=batch(legajo),before=JSON.stringify(b),csv=createPayrollNoveltyCsv(b);
    const expected=/^\s*[=+\-@]/.test(legajo)?"'"+legajo:legajo;
    const cell=/[;"]/.test(expected)?'"'+expected.replaceAll('"','""')+'"':expected;
    assert.ok(csv.split('\r\n')[1].startsWith('2026-10-01;monthly;1;'+cell+';95;'));
    assert.match(csv,/fecha_registro_propio/);assert.doesNotMatch(csv,/fecha_alta/);
    assert.equal(JSON.stringify(b),before);
  }
});
test('Excel preserves opaque raw identity, microseconds, code95 quantity and absent amount',async()=>{
  const b=batch(' A/009010 '),workbook=await readXlsxFile(Buffer.from(createPayrollNoveltyXlsx(b)),{trim:false});
  const rows=Array.isArray(workbook[0]?.data)?workbook[0].data:workbook;
  assert.equal(rows[1][3],' A/009010 ');assert.equal(rows[1][4],'95');assert.equal(rows[1][7],'100');assert.equal(rows[1][8],null);
  assert.equal(rows[0][17],'fecha_registro_propio');assert.equal(rows[1][17],'2026-10-06T12:00:00.123456Z');
  const formula=await readXlsxFile(Buffer.from(createPayrollNoveltyXlsx(batch(' =1+1'))),{trim:false});
  const formulaRows=Array.isArray(formula[0]?.data)?formula[0].data:formula;
  assert.equal(formulaRows[1][3],' =1+1');
});

test('draft and saved arithmetic controls require the same explicit own subject and retain every old numeric rule',()=>{
  const s=subject('😀'.repeat(64)),d=buildNativeMonthlyDraft(draft(s.legajo),s),b=savedNoveltyBatch(batch(s.legajo));
  assert.throws(()=>noveltyBatchControl(d.rows));
  for(const [rows,saved] of [[d.rows,false],[b.rows,true]]){
    const control=noveltyBatchControl(rows,{saved,nativeSubject:s});
    assert.equal(control.rows,1);assert.equal(control.missing,1);assert.equal(control.completeAmountCents,null);
    assert.equal(control.knownAmountCents,'0');assert.equal(control.payrollCalculated,false);assert.equal(control.quantitiesSummed,false);
    assert.throws(()=>noveltyBatchControl([{...rows[0],legajo:'95'}],{saved,nativeSubject:s}));
    assert.throws(()=>noveltyBatchControl([{...rows[0],conceptSourceId:'095'}],{saved,nativeSubject:s}));
    assert.throws(()=>noveltyBatchControl([...rows,...rows],{saved,nativeSubject:s}));
  }
  assert.match(noveltyControlCsv(d.rows,{nativeSubject:s}),/Parcial: faltan importes/);
  assert.throws(()=>noveltyBatchControl([{...d.rows[0],identityToken:'b'.repeat(64)}],{nativeSubject:s}));
  assert.throws(()=>noveltyBatchControl([{...b.rows[0],employmentContractId:id(9)}],{saved:true,nativeSubject:s}));
});
