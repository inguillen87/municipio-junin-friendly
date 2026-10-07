import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import {fixedEmployee,fixedForm,fixedList,fixedExportData,fixedOriginLabel} from '../assets/payroll-fixed-novelties-model.js';
import {fixedCorrectionGroupDraft,fixedGroupDraft} from '../assets/payroll-fixed-groups-model.js';
import {fixedCsv,fixedXlsx} from '../assets/payroll-fixed-novelties-export.js';
import {fixedNativeSubject,fixedApprovedRecord,fixedFixture,fixedValues} from './fixtures/payroll-fixed-novelties-synthetic.js';

const own = legajo => ({...fixedNativeSubject(),legajo});
const form = legajo => ({legajo,conceptSourceId:'95',costCenterSourceId:'',payrollType:'monthly',quantityDecimal:'100',amountArs:'',forced:false,forcedReason:'',legalInstrument:'Resolución sintética QA',validFrom:'2026-09-01',validTo:'2026-09-30',reason:'Ensayo sintético de novedad fija'});
const employee = s => fixedEmployee({ok:true,data:{version:'payroll-fixed-employee.v1',subject:s}},{contractId:s.contractId});
const row = legajo => ({...fixedApprovedRecord(0),subject:own(legajo)});

test('UUID selection preserves opaque municipal legajos including leading zeroes, whitespace and Unicode',()=>{
  for(const legajo of ['A/3501','000901',' 901 ','ñ/009','e\u0301/009','🗂'.repeat(64)]){
    const s=employee(own(legajo)),draft=fixedForm(form(legajo),s);
    assert.equal(s.legajo,legajo);assert.equal(draft.legajo,legajo);
    assert.equal(draft.values.conceptSourceId,'95');assert.equal(draft.values.quantityDecimal,'100');assert.equal(draft.values.amountCents,null);
  }
});

test('manual legajo and declared concept rules remain unchanged without a verified own UUID',()=>{
  for(const legajo of ['A/3501','000901'])assert.throws(()=>fixedForm(form(legajo)));
  const s=own('A/3501');
  for(const conceptSourceId of ['095','A/95','95.0'])assert.throws(()=>fixedForm({...form(s.legajo),conceptSourceId},s));
  assert.throws(()=>fixedForm(form('A/3502'),s));assert.throws(()=>fixedForm(form('A/3501'),{...s,contractId:'invalid'}));
});

test('invalid or unbounded own identity is rejected before drafting',()=>{
  for(const legajo of ['', 'x'.repeat(65),'A\n901','A\u0000901','A\u0085901'])assert.throws(()=>employee(own(legajo)));
  const s=own('A/3501');
  for(const change of [{sourceCutoff:'2026-09-01T12:00:00.000000Z'},{registrationId:null},{identityToken:'unknown'}])assert.throws(()=>employee({...s,...change}));
});

test('group correction and annulment keep opaque identities and exact null/zero quantities',()=>{
  const r=row(' A/003501 ');r.approved.values=fixedValues({quantityDecimal:'0',amountCents:null});
  const correction=fixedCorrectionGroupDraft([r],{quantityDecimal:'100'},'Rectificación sintética revisada');
  const annul=fixedGroupDraft([r],'Anulación sintética revisada');
  assert.equal(correction.items[0].legajo,r.subject.legajo);assert.equal(correction.items[0].identityToken,r.subject.identityToken);
  assert.equal(correction.items[0].values.quantityDecimal,'100');assert.equal(correction.items[0].values.amountCents,null);
  assert.equal(annul.items[0].contractId,r.subject.contractId);assert.equal(annul.items[0].legajo,r.subject.legajo);
  assert.equal(r.approved.values.quantityDecimal,'0');assert.equal(r.approved.values.amountCents,null);
});

test('control exports escape a formula-shaped opaque legajo while preserving its complete value',()=>{
  const f=fixedFixture();f.state.records=[row(' =SUM(1;2) ')];
  const list=fixedList({ok:true,data:f.list('2026-09-01')},'2026-09-01');
  const exported=fixedExportData({ok:true,data:f.exporter('2026-09-01')},list);
  const csv=fixedCsv(exported),xml=strFromU8(unzipSync(fixedXlsx(exported))['xl/worksheets/sheet1.xml']);
  assert.match(csv,/"' =SUM\(1;2\) "/);assert.match(xml,/<t xml:space="preserve"> =SUM\(1;2\) <\/t>/);assert.doesNotMatch(xml,/<f[ >]/);
  assert.equal(fixedOriginLabel(exported.rows[0].subject),'Registro propio de MuniControl');
  assert.match(csv,/Fecha de registro propio/);assert.doesNotMatch(csv,/Fecha del alta propia/);
  for(const privateValue of [exported.rows[0].subject.identityToken,exported.rows[0].subject.contractId,exported.rows[0].subject.registrationId])assert.equal(csv.includes(privateValue),false);
});

test('historical GRH subjects are not relabelled as own registrations by the client',()=>{
  const original=fixedApprovedRecord(0).subject;
  assert.equal(fixedOriginLabel(original),'Fuente GRH');assert.throws(()=>employee({...original,legajo:'A/3501'}));
  assert.equal(fixedForm(form(original.legajo),original).legajo,original.legajo);
});
