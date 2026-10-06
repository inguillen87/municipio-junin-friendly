// Invented arithmetic only. None of these concepts or rates is municipal law.
import { program, definitions } from './own-payroll-program-synthetic.js';
import { payrollInput, employee, fact, binary } from './own-payroll-synthetic.js';
export function adoptedRunProgram() {
  const p = program();
  p.rules.find(r => r.code === '120').expression = binary('add', fact('addition'), fact('fixedAddition'));
  p.bindings.push({ agreementCode:'1', key:'fixedAddition', unit:'money', sourceKind:'fixed_amount', sourceCode:'121', onMissing:'zero', combine:'sum', ruleReference:'Importe fijo inventado QA' });
  return p;
}
export function adoptedRunDefinitions() {
  return [...definitions(), { active:true, agreementCode:'1', categoryCode:null, code:'121', dependencies:[], kind:'concept', label:'Fuente fija inventada QA', nature:'non_remuneration', precision:2, ruleReference:'Sólo QA; sin norma municipal', unit:'money', validFrom:'2026-10', validUntil:null, value:null }];
}
export function adoptedRunInput(period, employeeNumber, addition='0.00000000', fixedAddition='0.00000000') {
  return payrollInput({ period, rules:adoptedRunProgram().rules, employees:[employee(1, { employeeNumber, departmentCode:'20', inputs:[
    {key:'base',unit:'money',value:'100.10000000',sourceReference:'Catálogo sintético QA'},
    {key:'addition',unit:'money',value:addition,sourceReference:'Novedad mensual sintética QA'},
    {key:'fixedAddition',unit:'money',value:fixedAddition,sourceReference:'Novedad fija sintética QA'},
  ]})] });
}
