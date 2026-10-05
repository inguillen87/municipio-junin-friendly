import {closeDetail,closeReceipt,closeCommand} from './own-payroll-close-synthetic.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {uid} from './own-payroll-program-synthetic.js';

// Manufactured immutable snapshots only. Integration derives closures from SQL.
export function reportFixture(count=61){
 const detail=closeDetail(count),snapshot=ownCloseSnapshot(detail,{kind:'all',values:[]});
 const receipt=closeReceipt({body:closeCommand(),snapshot,snapshotSha256:ownRunHash(snapshot)});
 detail.groups=[reportGroup(receipt)];for(const row of detail.rows)Object.assign(row,{state:'closed',groupId:receipt.groupId,canClose:false});
 return {query:{from:detail.period,to:detail.period,types:[detail.liquidationType]},details:[detail],receipts:[receipt]};
}
export function reportGroup(receipt){const s=receipt.snapshot;return {id:receipt.groupId,state:'closed',employeeCount:s.employeeCount,populationCount:s.populationCount,populationComplete:s.populationComplete,recordedAt:receipt.recordedAt,reopenedAt:null,actorLabel:'Revisor exclusivamente sintético',reason:receipt.body.reason,snapshotSha256:receipt.snapshotSha256,canReopen:true};}
export function historicalReportFixture(period,type,number=501){
 const f=reportFixture(2),receipt=f.receipts[0],detail=f.details[0];receipt.id=uid(number);receipt.groupId=receipt.id;receipt.key=uid(number+1000);receipt.body.period=period;receipt.body.liquidationType=type;receipt.bodySha256=ownRunHash(receipt.body);receipt.snapshot.period=period;receipt.snapshot.liquidationType=type;receipt.snapshotSha256=ownRunHash(receipt.snapshot);
 // Historical employees need not appear in the current roster. The original
 // closed snapshot, never current dimensions, governs this report fixture.
 detail.period=period;detail.liquidationType=type;detail.rows=[];detail.captures=[];detail.groups=[reportGroup(receipt)];
 return {query:{from:period,to:period,types:[type]},details:[detail],receipts:[receipt]};
}
export function rehashReportFixture(f){for(const r of f.receipts){r.bodySha256=ownRunHash(r.body);r.snapshotSha256=ownRunHash(r.snapshot);const d=f.details.find(d=>d.period===r.snapshot.period&&d.liquidationType===r.snapshot.liquidationType),g=d.groups.find(g=>g.id===r.groupId);Object.assign(g,reportGroup(r));}return f;}
