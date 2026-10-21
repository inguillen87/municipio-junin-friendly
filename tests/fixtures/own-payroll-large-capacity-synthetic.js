// Declared literal capacity inputs only; no municipal values or SQL execution.
import {approvedSources} from './own-payroll-approved-synthetic.js';
import {capture,saved} from './own-payroll-run-synthetic.js';
import {rule,lit} from './own-payroll-synthetic.js';
import {uid,hash} from './own-payroll-program-synthetic.js';
import {ownProgramStructure} from '../../assets/own-payroll-program-model.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
export function largeCapacityDetail(){
 const source=approvedSources(855);
 const rules=Array.from({length:20},(_,n)=>rule(String(100+n),lit('1.00','money'),{
  ruleReference:'Referencia exclusivamente sintetica de capacidad; sin norma ni importe municipal. '.padEnd(180,'x')
 }));
 source.programState.program.definition=ownProgramStructure({rules,bindings:[],totalsPrecision:2});
 source.programState.salaryCatalog.items=rules.map(r=>({active:true,agreementCode:r.agreementCode,categoryCode:null,
  code:r.code,dependencies:[],kind:'concept',label:'Concepto sintetico de capacidad',nature:r.nature,
  precision:2,ruleReference:r.ruleReference,unit:'money',validFrom:r.validFrom,validUntil:null,value:null}));
 source.monthly.batches=[];
 const c=capture();c.payload={...source,sourceInventory:{populationDomain:'native_registered'}};
 c.payloadSha256=ownRunHash(c.payload);c.saved=saved(c);
 return {version:'own-liquidation-detail.v1',id:c.id,scopeVersion:hash('a'),stateVersion:hash('b'),
  reviewAccessRequired:true,capture:c,employees:c.saved.result.employeeTotals.map(e=>({contractId:e.contractId,
  state:'calculated',version:0,liquidationVersion:null,blockedBy:null,allowedCommands:['confirm'],events:[]})),
  effects:{paymentExecuted:false,accountingPosted:false,periodClosed:false}};
}

export function largeCapacityCloseDetail(copies=1){
 const first=largeCapacityDetail().capture,captures=Array.from({length:copies},(_,index)=>{const c=structuredClone(first);c.id=uid(90+index);c.key=uid(9+index);c.saved.id=c.id;return c;});
 const rows=first.saved.input.employees.map((e,index)=>({contractId:e.contractId,employeeNumber:e.employeeNumber,agreementCode:e.agreementCode,departmentCode:e.departmentCode,state:'confirmed',runId:captures[index%copies].id,resultSha256:first.saved.resultSha256,liquidationVersion:1,groupId:null,canClose:true}));
 return {version:'own-close-detail.v1',period:first.body.period,liquidationType:first.body.liquidationType,scopeVersion:hash('a'),stateVersion:hash('b'),populationDomain:'native_registered',rosterVersion:hash('d'),rows,captures,groups:[],canWrite:true,complete:true};
}
