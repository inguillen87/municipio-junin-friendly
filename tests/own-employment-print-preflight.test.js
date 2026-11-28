import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightOwnEmploymentPrintTitles} from '../lib/own-employment-print-preflight.js';
import {ownEmploymentJobTitleReasons,ownRunEmploymentPrintFacts,OWN_EMPLOYMENT_JOB_TITLE_ERROR} from '../assets/own-payroll-employment-print-facts.js';
import {changeValues} from '../assets/native-employment-change-model.js';
import {employmentPrintFixture} from './fixtures/own-employment-print-synthetic.js';
import {employmentTitleUnicodeCases} from './fixtures/own-employment-print-unicode-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';

const row=(index,jobTitle)=>({contractId:uid(1000+index),registrationId:uid(2000+index),jobTitle});
const suppliedOnly=report=>{
 assert.equal(report.version,'own-employment-print-preflight.v1');
 assert.equal(report.scope,'supplied_rows_only');
 assert.equal(report.populationCoverageVerified,false);assert.equal(report.installationReady,false);
};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('preflight accepts compatible supplied values without changing, completing or declaring a population',()=>{
 const rows=freeze([row(1,'Técnico sintético'),row(2,null),row(3,'a'.repeat(120)),row(4,'😀'.repeat(60)),row(5,'Cargo\u00a0interior')]);
 const before=JSON.stringify(rows),report=preflightOwnEmploymentPrintTitles(rows);
 suppliedOnly(report);assert.equal(report.checkedRows,5);assert.equal(report.compatibleRows,5);assert.deepEqual(report.rejectedRows,[]);
 assert.equal(JSON.stringify(rows),before);
});

test('an empty input never claims complete coverage or installation readiness',()=>{
 const report=preflightOwnEmploymentPrintTitles([]);suppliedOnly(report);
 assert.equal(report.checkedRows,0);assert.equal(report.compatibleRows,0);assert.deepEqual(report.rejectedRows,[]);
});

test('capture compatibility does not impose a PDF font encoding on valid Unicode',()=>{
 const report=preflightOwnEmploymentPrintTitles([row(1,'Cargo → área sintética')]);
 suppliedOnly(report);assert.equal(report.compatibleRows,1);assert.deepEqual(report.rejectedRows,[]);
});

test('each incompatible supplied row is identified only by ordinal, UUIDs and fixed causes',()=>{
 const privateSentinel='TEXTO_SINTETICO_QUE_NO_DEBE_SALIR';
 const cases=[
  [privateSentinel+'\u202e','bidirectional_controls'],['\u00a0'+privateSentinel,'exterior_whitespace'],
  [privateSentinel+'\ufeff','exterior_whitespace'],[privateSentinel+'e\u0301','non_nfc'],['😀'.repeat(61),'utf16_length'],
 ];
 const rows=freeze([row(0,null),...cases.map(([value],index)=>row(index+1,value))]),before=JSON.stringify(rows);
 const report=preflightOwnEmploymentPrintTitles(rows);suppliedOnly(report);
 assert.equal(report.checkedRows,6);assert.equal(report.compatibleRows,1);assert.equal(report.rejectedRows.length,5);
 for(const [index,rejected]of report.rejectedRows.entries()){
  assert.deepEqual(Object.keys(rejected).sort(),['rowOrdinal','contractId','registrationId','code','reasons'].sort());
  assert.equal(rejected.rowOrdinal,index+2);assert.equal(rejected.contractId,rows[index+1].contractId);
  assert.equal(rejected.registrationId,rows[index+1].registrationId);assert.equal(rejected.code,OWN_EMPLOYMENT_JOB_TITLE_ERROR);
  assert.ok(rejected.reasons.some(reason=>reason.code===cases[index][1]));
  for(const reason of rejected.reasons){assert.deepEqual(Object.keys(reason).sort(),['code','message']);assert.equal(typeof reason.message,'string');assert.ok(reason.message.length>12);}
 }
 const serialized=JSON.stringify(report);
 assert.ok(!serialized.includes(privateSentinel));assert.ok(!serialized.includes('jobTitle'));
 assert.ok(!serialized.includes('😀'));assert.ok(!serialized.includes('Técnico'));
 assert.equal(JSON.stringify(rows),before);
});

test('the actual current rectification model admits bidi and 61 supplementary characters that printing rejects',()=>{
 for(const [value,reason]of [['Cargo\u202e','bidirectional_controls'],['😀'.repeat(61),'utf16_length']]){
  const written=changeValues({agreementCode:'1',categoryCode:'1',organizationId:'1',sectorCode:'1',jobTitle:value});
  assert.equal(written.jobTitle,value);
  const report=preflightOwnEmploymentPrintTitles([row(1,written.jobTitle)]);
  assert.equal(report.compatibleRows,0);assert.equal(report.rejectedRows[0].reasons[0].code,reason);
  const captured=employmentPrintFixture();captured.capture.payload.sourceInventory.employmentPrintFacts.rows[0].jobTitle=written.jobTitle;
  assert.throws(()=>ownRunEmploymentPrintFacts(captured.capture),error=>error.code===OWN_EMPLOYMENT_JOB_TITLE_ERROR&&error.reasons.includes(reason));
 }
});

test('supplied legacy NBSP and NFD bytes are reported without applying a writer normalization',()=>{
 // The original SQL registration writer uses ordinary-space btrim and no NFC
 // normalization. This fixture checks supplied bytes, not PostgreSQL execution.
 for(const [value,reason]of [['\u00a0Cargo','exterior_whitespace'],['Cargo\ufeff','exterior_whitespace'],['Te\u0301cnico','non_nfc']]){
  const rows=[row(1,value)],before=JSON.stringify(rows),report=preflightOwnEmploymentPrintTitles(rows);
  assert.equal(report.compatibleRows,0);assert.equal(report.rejectedRows[0].reasons[0].code,reason);
  assert.equal(JSON.stringify(rows),before);
 }
});

test('preflight and the capture reader share the complete existing Unicode acceptance matrix',()=>{
 for(const {name,value,accepted}of employmentTitleUnicodeCases){
  const reasons=ownEmploymentJobTitleReasons(value),report=preflightOwnEmploymentPrintTitles([row(1,value)]);
  assert.equal(reasons.length===0,accepted,name);assert.equal(report.compatibleRows,accepted?1:0,name);
  if(!accepted)assert.deepEqual(report.rejectedRows[0].reasons.map(reason=>reason.code),reasons,name);
 }
});

test('diagnostics cover type, empty text, controls, markup and malformed Unicode without echoing input',()=>{
 for(const [value,reason]of [[123,'invalid_type'],['','empty'],['\u0000','control_characters'],['\u009f','control_characters'],
  ['<cargo>','markup_characters'],['\ud800','invalid_unicode'],['\udfff','invalid_unicode']]){
  const report=preflightOwnEmploymentPrintTitles([row(1,value)]);
  assert.equal(report.compatibleRows,0);assert.ok(report.rejectedRows[0].reasons.some(item=>item.code===reason));
 }
 const report=preflightOwnEmploymentPrintTitles([row(1,'\u00a0e\u0301\u202e')]);
 assert.deepEqual(report.rejectedRows[0].reasons.map(reason=>reason.code),['exterior_whitespace','non_nfc','bidirectional_controls']);
});

test('repeated supplied identities remain separate diagnostics rather than a claimed unique population',()=>{
 const rows=[row(1,'\u00a0Cargo'),row(1,'Cargo\u202e')],report=preflightOwnEmploymentPrintTitles(rows);
 suppliedOnly(report);assert.equal(report.checkedRows,2);assert.deepEqual(report.rejectedRows.map(item=>item.rowOrdinal),[1,2]);
 assert.equal(new Set(report.rejectedRows.map(item=>item.contractId)).size,1);
});

test('malformed or over-limit inputs fail before producing a partial compatibility report',()=>{
 let accessed=false;const accessor=row(1,'Cargo');Object.defineProperty(accessor,'jobTitle',{enumerable:true,get(){accessed=true;return 'Cargo';}});
 const inputs=[null,{},Array(1),Array(10001).fill(row(1,null)),[null],[{...row(1,null),privateField:'NO_ECHO'}],
  [{contractId:uid(1),registrationId:uid(2)}],[{...row(1,null),contractId:'NO_ECHO'}],
  [{...row(1,null),registrationId:'00000000-0000-0000-0000-000000000000'}],[accessor]];
 for(const input of inputs)assert.throws(()=>preflightOwnEmploymentPrintTitles(input),error=>{
  assert.equal(error.code,'OWN_EMPLOYMENT_PRINT_PREFLIGHT_INPUT_INVALID');assert.ok(!error.message.includes('NO_ECHO'));return true;
 });
 assert.equal(accessed,false);
});
