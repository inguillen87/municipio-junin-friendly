import test from 'node:test';
import assert from 'node:assert/strict';
import {salaryItems,SALARY_UNITS} from '../assets/native-salary-catalog-model.js';
import {salaryFileExport,salaryFilePlan} from '../assets/native-salary-file-model.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {PROGRAM_UNITS} from '../assets/own-payroll-program-workspace-model.js';
import {calculateOwnPayroll,OWN_PAYROLL_NAMESPACE_VERSION} from '../assets/own-payroll-engine.js';
import {row} from './fixtures/native-salary-synthetic.js';
import {rule,lit,fact,binary,policy,payrollInput,employee} from './fixtures/own-payroll-synthetic.js';

// Invented arithmetic and codes only. The denominator is not a municipal rule.
const definitions=()=>salaryItems([
 row({code:'100',unit:'money'}),
 row({code:'101',unit:'days',nature:'deduction',precision:8}),
 row({kind:'auxiliary',code:'9001',nature:'auxiliary',unit:'money',value:'201.00'}),
]);
const expression=()=>binary('multiply',fact('base'),binary('divide',fact('days','days'),lit('30','days')));
const program=()=>({namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION,totalsPrecision:8,rules:[rule('100',expression(),{rounding:policy('exact',8)})],bindings:[
 {agreementCode:'1',key:'base',unit:'money',sourceKind:'auxiliary_parameter',sourceCode:'9001',onMissing:'error',combine:'single',ruleReference:'Base inventada exclusivamente QA'},
 {agreementCode:'1',key:'days',unit:'days',sourceKind:'monthly_quantity',sourceCode:'101',onMissing:'error',combine:'sum',ruleReference:'Cantidad en días inventada exclusivamente QA'},
]});
const input=(values=['1.50000000','0.00000000'])=>payrollInput({version:'own-payroll-input.v2',totalsPrecision:8,rules:program().rules,employees:values.map((value,n)=>employee(n+1,{inputs:[{key:'base',unit:'money',value:'201.00',sourceReference:'Base sintética QA'},{key:'days',unit:'days',value,sourceReference:'Novedad en días sintética QA'}]}))});
const error=code=>e=>e.code===code;
const classification=[{kind:'agreements',code:'1'}];

test('días conserva unidad propia en maestro, CSV y revisión de programa',()=>{
 assert.equal(SALARY_UNITS.days,'Días');assert.equal(PROGRAM_UNITS.days,'Días');
 const items=definitions(),csv=salaryFileExport(items),planned=salaryFilePlan([],csv,classification);
 assert.deepEqual(planned.items,items);assert.equal(items.find(r=>r.code==='101').unit,'days');
 assert.equal(items.find(r=>r.code==='101').value,null);
 const zero=salaryItems([row({unit:'days',precision:8,value:'0.00000000'})]);
 assert.equal(zero[0].value,'0.00000000');assert.deepEqual(ownProgramDefinition(program(),items).rules,program().rules);
});
test('cantidad fraccionaria en días conserva su resultado exacto y cero explícito',()=>{
 const result=calculateOwnPayroll(input());assert.equal(result.employeeCount,2);
 assert.deepEqual(result.rows.map(r=>r.amount),['10.05000000','0.00000000']);
 assert.ok(result.rows[0].trace.some(n=>n.operation==='input'&&n.reference==='days'));
});
test('el último contrato sin cantidad bloquea todo el conjunto, sin suponer cero',()=>{
 const values=input(['1.50000000',null]);assert.throws(()=>calculateOwnPayroll(values),error('INPUT_MISSING'));assert.equal(values.employees.length,2);assert.equal(values.employees[1].inputs[1].value,null);
});
test('no mezcla días y horas, minutos ni conteos genéricos',()=>{
 for(const unit of ['hours','minutes','units']){
  const p=input();p.rules[0].expression=binary('multiply',fact('base'),binary('divide',fact('days','days'),lit('30',unit)));
  assert.throws(()=>calculateOwnPayroll(p),error('UNIT_MISMATCH'));
 }
 const p=input();p.employees[1].inputs[1].unit='hours';assert.throws(()=>calculateOwnPayroll(p),error('UNIT_MISMATCH'));
});
test('una cantidad en días no es un importe ni un coeficiente implícito',()=>{
 const p=input();p.rules[0].expression=binary('multiply',fact('base'),fact('days','days'));
 assert.throws(()=>calculateOwnPayroll(p),error('CONVERSION_REQUIRED'));
});
test('el programa exige la misma unidad en la novedad y la definición aprobada',()=>{
 const items=definitions();items.find(r=>r.code==='101').unit='hours';
 assert.throws(()=>ownProgramDefinition(program(),items),error('SOURCE_DEFINITION_MISSING'));
 const p=program();p.bindings.find(b=>b.key==='days').sourceKind='monthly_amount';
 assert.throws(()=>ownProgramDefinition(p,definitions()),error('BINDING_INVALID'));
});
test('una conversión sólo se admite con factor y referencia expresos',()=>{
 const p=input();p.rules[0].expression=binary('multiply',fact('base'),binary('divide',{op:'convert',value:lit('12','hours'),unit:'days',factor:'0.125',conversionReference:'Conversión exclusivamente sintética QA, sin regla municipal'},lit('30','days')));
 assert.equal(calculateOwnPayroll(p).rows[0].amount,'10.05000000');
 delete p.rules[0].expression.right.left.conversionReference;
 assert.throws(()=>calculateOwnPayroll(p),error('CONTRACT_INVALID'));
});
test('los registros anteriores con unidades genéricas y horas conservan sus bytes',()=>{
 for(const unit of ['units','hours']){const items=salaryItems([row({unit,precision:8,value:'1.25000000'})]),original=JSON.stringify(items);assert.deepEqual(salaryFilePlan([],salaryFileExport(items),classification).items,items);assert.equal(JSON.stringify(items),original);}
});
