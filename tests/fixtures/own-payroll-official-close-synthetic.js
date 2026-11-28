import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {salarySerialized} from '../../assets/native-salary-catalog-model.js';
export const officialCloseCorpus=JSON.parse(readFileSync(new URL('./own-payroll-official-close-corpus.json',import.meta.url),'utf8')).cases;
export const hash=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const uid=n=>'70000000-0000-4000-8000-'+String(n).padStart(12,'0');
export function officialCapture(name='days14_both_omitted',number=1){
 const one=structuredClone(officialCloseCorpus.find(c=>c.name===name));if(!one)throw Error('Unknown synthetic corpus case');
 const payload={...one.payload,sourceInventory:{}},body={period:payload.period,liquidationType:payload.liquidationType,selection:payload.selection,scopeVersion:'a'.repeat(64),programVersion:payload.programState.program.version,populationDomain:'native_registered'};
 const id=uid(number),algorithmSha256='e'.repeat(64),createdAt='2026-11-11T15:00:00.000Z';
 return {version:'own-payroll-run.v1',id,key:uid(number+1000),body,bodySha256:hash(body),algorithmSha256,payload,payloadSha256:hash(payload),createdAt,replayed:false,saved:{version:'own-payroll-saved.v1',id,algorithmSha256,inputSha256:hash(one.input),resultSha256:hash(one.result),input:one.input,result:one.result,recordedAt:createdAt}};
}
export function officialCloseDetail(name='days14_both_omitted',number=1){
 const capture=officialCapture(name,number);
 return {version:'own-close-detail.v2',period:capture.body.period,liquidationType:capture.body.liquidationType,scopeVersion:'a'.repeat(64),stateVersion:'b'.repeat(64),populationDomain:'native_registered',rosterVersion:'c'.repeat(64),rows:capture.saved.result.employeeTotals.map(t=>{const e=capture.saved.input.employees.find(e=>e.contractId===t.contractId);return {contractId:e.contractId,employeeNumber:e.employeeNumber,agreementCode:e.agreementCode,departmentCode:e.departmentCode,state:'confirmed',runId:capture.id,resultSha256:capture.saved.resultSha256,liquidationVersion:1,groupId:null,canClose:true};}),captures:[capture],groups:[],canWrite:true,complete:true};
}
export function officialCloseReceipt(snapshot){
 const body={period:snapshot.period,liquidationType:snapshot.liquidationType,scopeVersion:'a'.repeat(64),stateVersion:'b'.repeat(64),selection:snapshot.selection,command:'close',groupId:null,reason:'Cierre sintético V4/V5 para QA aislado',reviewConfirmed:true};
 return {version:'own-close-receipt.v1',id:uid(9001),key:uid(9002),body,bodySha256:hash(body),groupId:uid(9001),snapshot,snapshotSha256:hash(snapshot),recordedAt:'2026-11-11T15:01:00.000Z',replayed:false};
}
