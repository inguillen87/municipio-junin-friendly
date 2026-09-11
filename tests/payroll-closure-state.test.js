import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createPayrollDetailModel,payrollClosureLabel} from '../assets/payroll-detail-model.js';
import {createPayrollDetailPdf,createPayrollDetailXlsx} from '../assets/payroll-detail-export.js';
import {syntheticDetail} from '../scripts/payroll-detail-synthetic.mjs';
const employee={name:'PERSONA SINTÉTICA QA',legajo:'0012'};
for(const [state,label] of [['closed','Cierre informado por la fuente'],['open','Abierta / preliquidación'],['unknown','Estado de cierre no informado']]){
 test('closure state preserved in model and all documents: '+state,()=>{
  const data={...syntheticDetail(),closureStatus:state};const model=createPayrollDetailModel(data,employee);
  assert.equal(model.closureStatus,state);assert.equal(payrollClosureLabel(state),label);
  assert.equal(model.officialReceipt,false);assert.equal(model.signatureApplied,false);
  assert.match(new TextDecoder().decode(createPayrollDetailXlsx(model)),new RegExp(label));
  const pdf=new TextDecoder().decode(createPayrollDetailPdf(model));
  assert.ok(pdf.includes(Buffer.from(label,'latin1').toString('hex')));
  assert.equal(model.totals['999'],'1025.00');assert.equal(model.exactReconciliation,true);
 });
}
for(const state of [null,undefined,'paid','approved','0','1','UNKNOWN'])test('invalid closure is not silently open: '+String(state),()=>{assert.throws(()=>payrollClosureLabel(state));assert.throws(()=>createPayrollDetailModel({...syntheticDetail(),closureStatus:state},employee))});
test('SQL patch changes only the verified closure expression, preserves source',()=>{const s=fs.readFileSync('scripts/migrations/052-payroll-detail-closure-state.sql','utf8');assert.match(s,/WHEN 0 THEN ''open'' ELSE ''unknown''/);assert.match(s,/PAYROLL_CLOSURE_MAPPING_DRIFT/);assert.match(s,/EXECUTE replace\(definition,old_mapping,new_mapping\)/);assert.doesNotMatch(s,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/);assert.ok(fs.readFileSync('.vercelignore','utf8').split(/\r?\n/).includes('!scripts/migrations/052-payroll-detail-closure-state.sql'))});
