import {capture,saved} from './own-payroll-run-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
const full=()=>{const c=capture();c.saved=saved(c);return c;};
const catalog=c=>c.payload.programState.salaryCatalog.items;
const definitionFor=c=>catalog(c).find(d=>d.kind==='concept'&&d.agreementCode===c.saved.result.rows[0].agreementCode&&d.code===c.saved.result.rows[0].conceptCode);
export const seal=c=>{c.bodySha256=ownRunHash(c.body);c.payloadSha256=ownRunHash(c.payload);c.saved.inputSha256=ownRunHash(c.saved.input);c.saved.resultSha256=ownRunHash(c.saved.result);return c;};

// Invented integer arithmetic only. This is a structurally coherent v2 capture,
// not a municipal approval. No programme/current-catalogue callback is involved.
export function namespaceCapture(){
 const c=full(),template=c.saved.input.rules[0];
 const rule=(nature,unit,value,precision)=>({...template,code:'100',nature,unit,expression:{op:'literal',unit,value},rounding:{mode:'exact',precision}});
 const rules=[rule('auxiliary','days','30',0),rule('remuneration','money','1.00',2)];
 c.payload.programState.program.definition={namespaceVersion:'own-payroll-namespaces.v2',rules:structuredClone(rules),bindings:[],totalsPrecision:2};
 const base=definitionFor(c);
 c.payload.programState.salaryCatalog.items=rules.map(r=>({...base,kind:r.nature==='auxiliary'?'auxiliary':'concept',nature:r.nature,unit:r.unit,precision:r.rounding.precision,label:r.nature==='auxiliary'?'Días sintéticos conservados':'Haber sintético conservado'}));
 c.payload.monthly.batches=[];
 c.saved.input={...c.saved.input,version:'own-payroll-input.v2',rules,employees:c.saved.input.employees.map(e=>({...e,inputs:[]}))};
 const evidence=value=>({numerator:value,denominator:'1'});
 c.saved.result={...c.saved.result,version:'own-payroll-result.v2',rows:c.saved.input.employees.flatMap(e=>rules.map(r=>({contractId:e.contractId,employeeNumber:e.employeeNumber,agreementCode:e.agreementCode,departmentCode:e.departmentCode,conceptCode:r.code,nature:r.nature,unit:r.unit,amount:r.nature==='auxiliary'?'30':'1.00',exactValue:evidence(r.nature==='auxiliary'?'30':'1'),rounding:{...r.rounding},ruleReference:r.ruleReference,dependencies:[],trace:[{operation:'literal',reference:null,stage:null,result:evidence(r.nature==='auxiliary'?'30':'1')}]}))),employeeTotals:c.saved.input.employees.map(e=>({contractId:e.contractId,remuneration:'1.00',non_remuneration:'0.00',deduction:'0.00',employer_contribution:'0.00',gross:'1.00',net:'1.00'}))};
 c.saved.result.rowCount=c.saved.result.rows.length;
 return seal(c);
}
