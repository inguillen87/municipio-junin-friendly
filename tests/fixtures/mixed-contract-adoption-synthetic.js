import {activeAdoptionRaw} from './active-contract-adoption-synthetic.js';
import {MIXED_ADOPTION_COHORT} from '../../assets/employment-adoption-mixed-cohort.js';
// A complete invented source: 37 selected +15 archived +4 deferred +2 adopted
// +5 pending identities. No municipal population counts or inferred links.
export function mixedAdoptionRaw(){
 const r=activeAdoptionRaw(37),deferred=[2,4,6,8],pending=[11,13,17,19,23],adopted=[26,29],excluded=new Set([...deferred,...pending,...adopted]),selected=Array.from({length:63},(_,i)=>i+1).filter(n=>!excluded.has(n)).slice(0,37);
 r.source.operationalCohort={version:MIXED_ADOPTION_COHORT,sourceTotal:63,knownTotal:58,selectedTotal:37,archivedTotal:15,deferredTotal:4,pendingTotal:5,adoptedTotal:2,deferredSourceRowNumbers:deferred,adoptedSourceRowNumbers:adopted,pendingSourceRows:pending.map((n,i)=>({rowKey:String(i+1).repeat(64),sourceRowNumber:n,factsSha256:'a'.repeat(64),reasons:['CONTRACT_NOT_FOUND',...(i===0?['START_DATE_MISSING']:[])]}))};
 r.rows=r.rows.map((row,i)=>({...row,sourceRowNumber:selected[i]}));return r;
}
