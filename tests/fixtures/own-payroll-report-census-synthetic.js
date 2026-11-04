import {createHash} from 'node:crypto';
import {salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {uid} from './own-payroll-program-synthetic.js';

// Synthetic metadata only; no SQL, employee identities, current roster or pay.
export function rehashCensus(value){
 const {sourceVersion,...source}=value;
 value.sourceVersion=createHash('sha256').update(salarySerialized(source)).digest('hex');return value;
}
export function reportCensusFixture(overrides={}){
 const value=structuredClone({version:'own-report-close-census.v1',period:'2026-09',liquidationType:'sac',scopeVersion:'a'.repeat(64),sourceVersion:'0'.repeat(64),complete:true,eventCount:0,events:[],groups:[],...overrides});
 return rehashCensus(value);
}
export function oneGroupCensus({reopened=false}={}){
 const id=uid(501),at='2026-09-30T12:00:00.000Z',snapshotSha256='b'.repeat(64);
 const events=[{id,groupId:id,command:'close',bodySha256:'c'.repeat(64),snapshotSha256,recordedAt:at}];
 if(reopened)events.push({id:uid(502),groupId:id,command:'reopen',bodySha256:'d'.repeat(64),snapshotSha256,recordedAt:'2026-10-07T12:00:00.000Z'});
 return reportCensusFixture({liquidationType:'monthly',eventCount:events.length,events,groups:[{id,state:reopened?'reopened':'closed',snapshotSha256,employeeCount:2,populationCount:2,populationComplete:true,recordedAt:at,reopenedAt:reopened?'2026-10-07T12:00:00.000Z':null}]});
}
export function censusForReceipt(receipt,scopeVersion='a'.repeat(64)){
 const s=receipt.snapshot;
 return reportCensusFixture({period:s.period,liquidationType:s.liquidationType,scopeVersion,eventCount:1,
  events:[{id:receipt.id,groupId:receipt.groupId,command:'close',bodySha256:receipt.bodySha256,snapshotSha256:receipt.snapshotSha256,recordedAt:receipt.recordedAt}],
  groups:[{id:receipt.groupId,state:'closed',snapshotSha256:receipt.snapshotSha256,employeeCount:s.employeeCount,populationCount:s.populationCount,populationComplete:s.populationComplete,recordedAt:receipt.recordedAt,reopenedAt:null}]});
}
