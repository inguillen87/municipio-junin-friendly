// Existing invented payroll sources only. No SQL, municipal rules or approvals.
import {annulDetail,annulCommand,annulReceipt,afterAnnul} from './own-payroll-annulment-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';

export function sealAnnulReviewIndex(value){value.stateVersion=ownRunHash({scopeVersion:value.scopeVersion,period:value.period,liquidationType:value.liquidationType,runs:value.index.map(row=>({id:row.id,stateVersion:row.stateVersion,bodySha256:row.bodySha256,resultSha256:row.resultSha256})),closed:value.closed,closeHistory:value.closeHistory});const {reviewSha256,...administrative}=value;value.reviewSha256=ownRunHash(administrative);return value;}
export function annulReviewIndexFor(details,{closed=[],closeHistory=[],liquidationHistory=null}={}){
 const events=new Map();for(const run of details)for(const employee of run.employees)for(const event of employee.events)events.set(event.id,{id:event.id,runId:run.id,bodySha256:ownRunHash(['Synthetic event reference',event.id,run.id])});
 const index=details.map(run=>{const c=run.capture,s=c.saved;return{id:run.id,stateVersion:run.stateVersion,bodySha256:c.bodySha256,payloadSha256:c.payloadSha256,inputSha256:s.inputSha256,resultSha256:s.resultSha256,algorithmSha256:c.algorithmSha256,employeeCount:s.result.employeeCount,conceptRowCount:s.result.rowCount,totalsPrecision:s.input.totalsPrecision,createdAt:c.createdAt,liquidationDate:c.body.liquidationDate??null,states:Object.fromEntries(['calculated','confirmed','annulled','cancelled'].map(state=>[state,run.employees.filter(row=>row.state===state).length])),confirmedContractIds:run.employees.filter(row=>row.state==='confirmed').map(row=>row.contractId).sort(),reviewAccessRequired:run.reviewAccessRequired};}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 return sealAnnulReviewIndex({version:'own-annul-review.v2',period:'2026-10',liquidationType:'monthly',scopeVersion:details[0].scopeVersion,stateVersion:'a'.repeat(64),reviewSha256:'b'.repeat(64),index,closed:structuredClone(closed).sort((a,b)=>a.contractId<b.contractId?-1:a.contractId>b.contractId?1:0),liquidationHistory:structuredClone(liquidationHistory??[...events.values()]).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),closeHistory:structuredClone(closeHistory).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),complete:true});
}
// Synthetic construction only: child receipts retain their real v1 shape;
// the aggregate has an explicit v2 body and hashes those exact bytes.
export function annulReviewReceipt(detail,body,key=uid(11)){
 const receipt=annulReceipt(detail,body,key);return{...receipt,version:'own-annul-receipt.v2',bodySha256:ownRunHash(body)};
}
export function annulReviewScenario({count=9,includeHistory=true}={}){
 const legacy=structuredClone(annulDetail(count)),third=structuredClone(legacy.runs[0]);third.id=uid(92);third.capture.id=third.id;third.capture.saved.id=third.id;third.capture.key=uid(12);legacy.runs.push(third);
 for(const [runIndex,run]of legacy.runs.entries())for(const [i,row]of run.employees.entries()){
  const confirmed=i%3===runIndex;Object.assign(row,{state:confirmed?'confirmed':'calculated',version:confirmed?1:0,liquidationVersion:confirmed?1:null,blockedBy:null,allowedCommands:confirmed?['annul']:[],events:confirmed?[{id:uid(500+runIndex),command:'confirm',version:1,liquidationVersion:1,recordedAt:'2026-10-09T10:00:00Z',actorLabel:'Autoridad exclusivamente sintética',reason:'Confirmación exclusivamente sintética QA'}]:[]});
 }
 if(includeHistory){const history=structuredClone(legacy.runs[0]);history.id=uid(93);history.capture.id=history.id;history.capture.saved.id=history.id;history.capture.key=uid(13);for(const row of history.employees)Object.assign(row,{state:'calculated',version:0,liquidationVersion:null,blockedBy:null,allowedCommands:[],events:[]});legacy.runs.push(history);}
 const index=annulReviewIndexFor(legacy.runs),legacyBody={...annulCommand(legacy),stateVersion:index.stateVersion},body={version:'own-annul-command.v2',...legacyBody,reviewSha256:index.reviewSha256},receipt=annulReviewReceipt(legacy,body,uid(11)),legacyReceipt=annulReceipt(legacy,legacyBody,uid(11)),afterLegacy=afterAnnul(legacy,receipt),afterIndex=annulReviewIndexFor(afterLegacy.runs);
 return{index,details:legacy.runs,legacy,receipt,legacyReceipt,after:{index:afterIndex,details:afterLegacy.runs}};
}
