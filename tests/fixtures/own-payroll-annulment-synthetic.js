import {detail} from './own-payroll-liquidation-synthetic.js';
import {uid,hash} from './own-payroll-program-synthetic.js';
import {saved} from './own-payroll-run-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {ownAnnulReview} from '../../assets/own-payroll-annulment-model.js';
export function annulDetail(count=41){
 const runs=[detail(count),detail(count)];for(const[index,r]of runs.entries()){
  r.id=uid(90+index);r.capture.id=r.id;r.capture.key=uid(9+index);
  r.capture.version='own-payroll-run.v2';r.capture.body={...r.capture.body,version:'own-payroll-run-command.v2',liquidationDate:'2026-10-31'};r.capture.bodySha256=ownRunHash(r.capture.body);r.capture.saved=saved(r.capture);
  for(const[i,e]of r.employees.entries())if((i%2)===index){e.state='confirmed';e.version=1;e.liquidationVersion=1;e.allowedCommands=['annul'];e.events=[{id:uid(500+index),command:'confirm',version:1,liquidationVersion:1,recordedAt:'2026-10-09T10:00:00Z',actorLabel:'Autoridad sintética QA',reason:'Confirmación exclusivamente sintética QA'}];}else e.allowedCommands=[];
 }
 return {version:'own-annul-detail.v1',period:'2026-10',liquidationType:'monthly',scopeVersion:hash('a'),stateVersion:hash('c'),runs,closed:[],complete:true};
}
export function annulCommand(d=annulDetail(),selection={kind:'all',values:[]}){return {period:d.period,liquidationType:d.liquidationType,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,selection,reason:'Anulación completa exclusivamente sintética QA',reviewConfirmed:true};}
export function annulReceipt(d=annulDetail(),body=annulCommand(d),key=uid(11)){
 const v=ownAnnulReview(d,body.selection),receipts=[];
 for(const[id,r]of d.runs.entries()){
  const rows=v.rows.filter(e=>e.runId===r.id);if(!rows.length)continue;
  const b={runId:r.id,resultSha256:r.capture.saved.resultSha256,scopeVersion:d.scopeVersion,stateVersion:r.stateVersion,command:'annul',selection:{kind:'contracts',values:rows.map(e=>e.contractId).sort()},reason:body.reason,reviewConfirmed:true};
  receipts.push({version:'own-liquidation-receipt.v1',id:uid(600+id),key:uid(700+id),body:b,bodySha256:ownRunHash(b),runId:r.id,resultSha256:b.resultSha256,affected:rows.map(e=>({contractId:e.contractId,state:'annulled',version:e.version+1,liquidationVersion:e.liquidationVersion})),recordedAt:'2026-10-09T11:00:00Z',replayed:false});
 }
 return {version:'own-annul-receipt.v1',id:uid(800),key,body,bodySha256:ownRunHash(body),affected:v.rows.map(e=>({runId:e.runId,resultSha256:e.resultSha256,contractId:e.contractId,liquidationDate:e.liquidationDate,version:e.version+1,liquidationVersion:e.liquidationVersion})),receipts,recordedAt:'2026-10-09T11:00:00Z',replayed:false};
}
export function afterAnnul(d,r){const next=structuredClone(d);for(const c of r.receipts)for(const a of c.affected){const e=next.runs.find(v=>v.id===c.runId).employees.find(e=>e.contractId===a.contractId);e.state='annulled';e.version=a.version;e.allowedCommands=[];e.events.push({id:c.id,command:'annul',version:a.version,liquidationVersion:a.liquidationVersion,recordedAt:c.recordedAt,actorLabel:'Autoridad sintética QA',reason:c.body.reason});}return next;}
