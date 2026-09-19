// Synthetic documentary metadata. No municipal records or identities.
import {DOCUMENTARY_FILTERS} from '../../assets/legal-documentary-review.js';
export const documentaryRows=()=>Array.from({length:26},(_,i)=>({id:`${String(i+1).padStart(8,'0')}-1111-4111-8111-111111111111`,kind:'ordenanza',issuer:'HCD',number:String(9000+i),year:1990,version:i===0?2:1,title:`Ficha sintética ${i+1} de revisión`,recorded_at:'2026-09-18T23:00:00Z',flags:{no_articles:i%2===0,no_issue_date:i%3===0,no_publication_date:true,no_effective_date:true,no_topics:i%2===1,no_summary:i%4===0,projects:i%5===0}}));
export function documentaryFixture(filter='all',page=1,rows=documentaryRows()){
 const summary=Object.fromEntries(Object.keys(DOCUMENTARY_FILTERS).map(key=>[key,key==='all'?rows.length:rows.filter(r=>r.flags[key]).length]));
 const selected=rows.filter(r=>filter==='all'||r.flags[filter]);
 return{version:'legal-documentary-review.v1',filter,page,pageSize:25,total:selected.length,summary,rows:selected.slice((page-1)*25,page*25),observedAt:'2026-09-18T23:00:00Z',legalConclusion:false};
}
