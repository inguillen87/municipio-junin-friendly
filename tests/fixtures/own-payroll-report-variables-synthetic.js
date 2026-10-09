import {closeDetail,closeReceipt,closeCommand} from './own-payroll-close-synthetic.js';
import {reportGroup} from './own-payroll-report-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {rule,lit,fact} from './own-payroll-synthetic.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {normalizeOwnPayrollInput,calculateOwnPayroll} from '../../assets/own-payroll-engine.js';
import {ownProgramStructure} from '../../assets/own-payroll-program-model.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';

// Invented captured variables and arithmetic only; no municipal salary policy.
export function variableReportFixture(count=61,{period='2026-10',type='monthly',ordinal=0,age=false,historical=false,declaredDate=null,opaqueNumber=null}={}){
 const detail=closeDetail(count);detail.period=period;detail.liquidationType=type;
 for(const [index,c]of detail.captures.entries()){
  const previous=c.id;c.id=uid(90+ordinal+index*2);c.key=uid(91+ordinal+index*2);c.saved.id=c.id;
  for(const row of detail.rows)if(row.runId===previous)row.runId=c.id;
  c.body.period=period;c.body.liquidationType=type;c.payload.period=period;c.payload.liquidationType=type;
  if(declaredDate){c.version='own-payroll-run.v2';Object.assign(c.body,{version:'own-payroll-run-command.v2',liquidationDate:declaredDate});}
  const p=c.payload.programState,definition=p.program.definition;
  for(const r of definition.rules)r.liquidationTypes=[type];
  if(age){
   definition.rules.push(rule('990',{op:'choose',condition:{op:'compare',operator:'eq',left:lit('1'),right:lit(age==='used'?'1':'0')},then:fact('antiguedad','units'),else:lit('0','units')},{nature:'auxiliary',unit:'units',liquidationTypes:[type],rounding:{mode:'exact',precision:8}}));
   definition.bindings.push({agreementCode:'1',key:'antiguedad',unit:'units',sourceKind:'parameter',sourceCode:'8801',onMissing:'error',combine:'single',ruleReference:'Antigüedad ficticia sólo para QA'});
   const template=structuredClone(p.salaryCatalog.items.find(d=>d.code==='8800'));
   p.salaryCatalog.items.push({...template,code:'8801',label:'Antigüedad reconocida en años, exclusivamente sintética',unit:'units',precision:8,value:'12.12345678'}, {...template,code:'990',label:'Auxiliar condicional sintético',unit:'units',value:null});
  }
  p.program.definition=ownProgramStructure(definition);
  const input=c.saved.input;input.period=period;input.liquidationType=type;input.rules=structuredClone(p.program.definition.rules);input.sourceVersions.rules=ownRunHash({program:p.program,salary:p.salaryCatalog});
  if(opaqueNumber){input.employees[0].employeeNumber=opaqueNumber;c.payload.population.employees.find(e=>e.contractId===input.employees[0].contractId).employeeNumber=opaqueNumber;detail.rows.find(e=>e.contractId===input.employees[0].contractId).employeeNumber=opaqueNumber;}
  if(age)for(const [n,e]of input.employees.entries())e.inputs.push({key:'antiguedad',unit:'units',value:age==='used'?(n===1?'0.00000000':'12.12345678'):n===0?null:n===1?'0.00000000':'12.12345678',sourceReference:'Fuente de antigüedad exclusivamente sintética QA'});
  c.saved.input=normalizeOwnPayrollInput(input);c.saved.result=calculateOwnPayroll(c.saved.input);
  c.bodySha256=ownRunHash(c.body);c.payloadSha256=ownRunHash(c.payload);c.saved.inputSha256=ownRunHash(c.saved.input);c.saved.resultSha256=ownRunHash(c.saved.result);
  for(const row of detail.rows)if(row.runId===c.id)row.resultSha256=c.saved.resultSha256;
 }
 const captures=structuredClone(detail.captures),snapshot=ownCloseSnapshot(detail,{kind:'all',values:[]}),body=closeCommand({period,liquidationType:type}),receipt=closeReceipt({id:uid(400+ordinal),groupId:uid(400+ordinal),key:uid(401+ordinal),body,bodySha256:ownRunHash(body),snapshot,snapshotSha256:ownRunHash(snapshot)});
 detail.groups=[reportGroup(receipt)];for(const row of detail.rows)Object.assign(row,{state:'closed',groupId:receipt.groupId,canClose:false});
 if(historical){detail.rows=[];detail.captures=[];}
 return {query:{from:period,to:period,types:[type]},details:[detail],receipts:[receipt],captures};
}
