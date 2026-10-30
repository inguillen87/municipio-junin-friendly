import {lifecycleFixture} from './native-employment-lifecycle-synthetic.js';
export const historyUid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
export function lifecycleHistoryFixture(count=100,{adopted=false}={}){
 const f=lifecycleFixture(),p=f.proposal;
 if(adopted){f.bootstrap.version='native-employment-lifecycle.v2';f.bootstrap.subject.recordKind='adopted';f.bootstrap.employment.datesVerified=true;}
 const proposals=Array.from({length:count},(_,i)=>({id:historyUid(i+1000),status:i===count-1?'pending':'rejected',movement:p.movement,date:p.date,reason:p.reason,legalReference:p.legalReference,createdAt:new Date(Date.UTC(2026,9,20,12,0,count-i)).toISOString(),authorLabel:'PERSONA AUTORA EXCLUSIVAMENTE SINTÉTICA',baseVersion:p.baseVersion,canReview:i===count-1}));
 const bootstrap={...f.bootstrap,proposals:structuredClone(proposals.slice(0,20)),historyTruncated:count>20};
 const history={version:'native-employment-lifecycle-history.v1',bootstrap,proposals,complete:true,total:count};
 const detail=id=>{const row=proposals.find(r=>r.id===id);if(!row)throw Error('Unknown synthetic proposal');return{version:bootstrap.version,proposal:{...structuredClone(f.proposal),...structuredClone(row),subject:structuredClone(bootstrap.subject),review:row.status==='pending'?null:{decision:'reject',reason:'Decisión exclusivamente sintética de prueba',reviewedAt:row.createdAt,reviewerLabel:'PERSONA REVISORA SINTÉTICA'}}};};
 return{...f,bootstrap,history,detail};
}
