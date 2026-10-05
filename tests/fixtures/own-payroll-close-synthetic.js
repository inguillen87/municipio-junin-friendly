import {detail as calculatedDetail} from './own-payroll-liquidation-synthetic.js';
import {uid,hash} from './own-payroll-program-synthetic.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';

// Explicit synthetic authority; SQL integration must derive these decisions itself.
export function closeDetail(count=2){
 const one=calculatedDetail(count).capture,two=structuredClone(one);two.id=uid(92);two.key=uid(93);two.saved.id=two.id;
 const rows=one.saved.input.employees.map((employee,i)=>({contractId:employee.contractId,employeeNumber:employee.employeeNumber,agreementCode:employee.agreementCode,departmentCode:employee.departmentCode,state:'confirmed',runId:i%2?two.id:one.id,resultSha256:one.saved.resultSha256,liquidationVersion:i%2?2:1,groupId:null,canClose:true}));
 return {version:'own-close-detail.v1',period:one.body.period,liquidationType:one.body.liquidationType,scopeVersion:hash('a'),stateVersion:hash('b'),populationDomain:'native_registered',rosterVersion:hash('d'),rows,captures:[one,two],groups:[],canWrite:true,complete:true};
}
export function closeCommand(patch={}){const d=closeDetail();return {period:d.period,liquidationType:d.liquidationType,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,selection:{kind:'all',values:[]},command:'close',groupId:null,reason:'Cierre exclusivamente sintético para QA',reviewConfirmed:true,...patch};}
export function closeReceipt(patch={}){const body=closeCommand(),snapshot=ownCloseSnapshot(closeDetail(),body.selection);return {version:'own-close-receipt.v1',id:uid(400),key:uid(9),body,bodySha256:ownRunHash(body),groupId:uid(400),snapshot,snapshotSha256:ownRunHash(snapshot),recordedAt:'2026-10-05T14:00:00.000Z',replayed:false,...patch};}
