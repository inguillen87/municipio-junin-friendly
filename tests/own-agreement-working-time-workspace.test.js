import test from 'node:test';
import assert from 'node:assert/strict';
import {agreementTimeDraft,agreementTimeView,agreementTimeCsv,agreementTimeFile,agreementTimeComparison} from '../assets/own-agreement-working-time-workspace.js';
import {syntheticAgreementTimeBootstrap as boot,syntheticAgreementTimeItems as items,agreementTimeHash,agreementTimeId} from './fixtures/own-agreement-working-time-synthetic.js';
import {programWorkspaceChanges,PROGRAM_SOURCES} from '../assets/own-payroll-program-workspace-model.js';
import {exactProgram} from './fixtures/own-payroll-exact-program-synthetic.js';

test('draft conserves all61 own agreements, inactive classifications and unknown hours without a fabricated date',()=>{
  const b=boot(61),d=agreementTimeDraft(b);assert.equal(d.length,61);assert.equal(d[1].agreementCode,'0002');assert.equal(b.source.agreements[1].registrationAllowed,false);assert.deepEqual(d.at(-1).definition,{monthlyHours:null,asOfDate:'',documentReference:''});
});
test('filter and pagination preserve the full61 agreements and a no-match page does not mean missing source',()=>{
  const b=boot(61),d=items(b),last=agreementTimeView(b,d,'0061');assert.equal(last.total,61);assert.equal(last.filtered,1);assert.equal(last.rows[0].index,60);assert.equal(agreementTimeView(b,d,'',3).rows.length,11);assert.equal(agreementTimeView(b,d,'sin coincidencias',8).total,61);assert.equal(d.length,61);
});
test('CSV roundtrip conserves exact monthly hours, null, zero, retained agreements and leading zero codes',()=>{
  const b=boot(61),d=items(b);d[0].definition.monthlyHours=null;d[1].definition.monthlyHours='0';d.at(-1).definition.monthlyHours='160.25000001';assert.deepEqual(agreementTimeFile(b,agreementTimeCsv(b,d)),d);
});
test('empty draft can be downloaded but incomplete date and constancy cannot be accepted as a complete correction',()=>{
  const b=boot(61),d=agreementTimeDraft(b),csv=agreementTimeCsv(b,d);assert.equal(csv.split('\r\n').length,63);assert.throws(()=>agreementTimeFile(b,csv));
});
test('literal CSV protects formula-like classification labels and documentary text',()=>{
  const b=boot(),d=items(b);b.source.agreements[0].label='=2+2';d[0].definition.documentReference='=SUM(1;2) "constancia municipal"';const csv=agreementTimeCsv(b,d);assert.ok(csv.includes('"\'=2+2"'));assert.ok(csv.includes('"\'=SUM'));assert.deepEqual(agreementTimeFile(b,csv),d);
});
test('a literal apostrophe is not lost in an original municipal reference',()=>{
  const b=boot(),d=items(b);d[0].definition.documentReference="'Constancia sintética";assert.deepEqual(agreementTimeFile(b,agreementTimeCsv(b,d)),d);
});
test('a quoted multiline cell cannot evade the single-line document contract',()=>{
  const b=boot(),d=items(b);d[0].definition.documentReference='Constancia\nno admitida';assert.throws(()=>agreementTimeFile(b,agreementTimeCsv(b,d)));
});
test('all-row comparison includes the last page and removed agreement with its original values',()=>{
  const b=boot(61),a=items(b),d=structuredClone(a);d.at(-1).definition.monthlyHours='0';const diff=agreementTimeComparison(a,d);assert.equal(diff.length,1);assert.equal(diff[0].agreementCode,'0061');assert.equal(agreementTimeComparison(a,d.slice(0,-1)).at(-1).after,null);
});
test('an approved agreement cannot be silently retargeted after its catalog identity changes',()=>{
  const b=boot(2);b.configuration={version:agreementTimeHash('e'),revision:1,items:items(b),proposalId:agreementTimeId,approvalId:agreementTimeId};b.source.agreements[1].agreementToken=agreementTimeHash('f');assert.throws(()=>agreementTimeDraft(b),/Cambió un convenio/);
});
for(const[label,change]of[
  ['omitted last row',v=>v.slice(0,-1)],['duplicated agreement',v=>{v[1]=v[0];return v;}],['changed identity',v=>{v[1].agreementToken=agreementTimeHash('f');return v;}],['sparse list',v=>{delete v[0];return v;}],['additional array field',v=>{v.secret='extra';return v;}],
])test('CSV cannot export '+label,()=>{const b=boot(2);assert.throws(()=>agreementTimeCsv(b,change(items(b))));});
test('workspace rejects a getter without executing it',()=>{
  const b=boot(),d=items(b);let calls=0;Object.defineProperty(d[0],'definition',{enumerable:true,get(){calls++;throw Error('getter executed');}});assert.throws(()=>agreementTimeView(b,d));assert.equal(calls,0);
});
test('comparison cannot silently collapse a duplicate agreement',()=>{
  const b=boot(2),d=items(b);d[1]=d[0];assert.throws(()=>agreementTimeComparison([],d));
});
for(const[label,change]of[
  ['missing last row',v=>v.split('\r\n').slice(0,-2).join('\r\n')+'\r\n'],
  ['unexpected column',v=>v.replace('"codigo_convenio"','"dni"')],
  ['changed code',v=>v.replace("'0002","'0003")],
  ['changed catalog label',v=>v.replace('Convenio sintético 2','Convenio sintético 3')],
  ['changed registration flag',v=>v.replace("'no","'si")],
  ['scientific notation',v=>v.replace('160.25000001','1e2')],
  ['decimal comma',v=>v.replace('160.25000001','160,25')],
  ['extra precision',v=>v.replace('160.25000001','160.250000001')],
  ['future documentary date',v=>v.replace('2026-10-01','2026-11-01')],
  ['unterminated quote',v=>v.slice(0,-3)],
  ['ambiguous quoted suffix',v=>v.replace('"codigo_convenio";','"codigo_convenio"x;')],
])test('complete CSV rejects '+label+' atomically',()=>{
  const b=boot(2),d=items(b),original=structuredClone(d);assert.throws(()=>agreementTimeFile(b,change(agreementTimeCsv(b,d))));assert.deepEqual(d,original);
});
test('the complete CSV has an explicit global capacity and is not split',()=>{
  assert.throws(()=>agreementTimeFile(boot(), 'x'.repeat(4*1024*1024+1)),/4 MiB/);
});
test('program review counts an agreement-source opt-in separately from contract hours',()=>{
  const before=exactProgram();before.namespaceVersion='own-payroll-namespaces.v2';const after=structuredClone(before);after.agreementWorkingTimeVersion='own-agreement-working-time.v1';const diff=programWorkspaceChanges(before,after);assert.equal(diff.changed,1);assert.deepEqual(diff.agreementWorkingTimeVersion,{before:null,after:'own-agreement-working-time.v1'});assert.equal(diff.workingTimeVersion,undefined);assert.match(PROGRAM_SOURCES.agreement_time_fact,/convenio/);
});
