// Manufactured native contracts and normative rows only. No municipal source.
import {comparisonFixture,uid} from './position-comparison-synthetic.js';
import {definition} from './annual-position-budget-synthetic.js';
import {budgetHash} from '../../assets/annual-position-budget-model.js';
export async function comparisonPdfFixture(count=57,normCount=53){
 const v=await comparisonFixture(count),p=v.annual.proposals[0];p.body.definition=definition(normCount);
 p.requestSha256=await budgetHash(p.body);v.annual.catalog.definition=p.body.definition;v.annual.catalog.definitionSha256=await budgetHash(p.body.definition);
 for(const c of v.captures){for(const e of c.positions.payload.employees)for(const a of e.allocations){a.definitionSha256=v.annual.catalog.definitionSha256;a.normative.row=p.body.definition.rows.find(r=>r.code===a.rowCode);a.normative.source=p.body.definition.source;}c.positions.payloadSha256=await budgetHash(c.positions.payload);}
 return v;
}
export async function addComparisonPdfRevision(v,{removeAssigned=false,quantity='999'}={}){
 const p=structuredClone(v.annual.proposals[0]);p.id=uid(20);p.decision={...p.decision,id:uid(21),revision:2};
 if(removeAssigned)p.body.definition.rows=p.body.definition.rows.filter(r=>r.code!=='QA0001');
 else p.body.definition.rows.find(r=>r.code==='QA0001').quantity=quantity;
 p.requestSha256=await budgetHash(p.body);v.annual.proposals.push(p);v.annual.proposalCount=2;
 v.annual.catalog={version:'c'.repeat(64),revision:2,definition:p.body.definition,definitionSha256:await budgetHash(p.body.definition),proposalId:p.id,approvalId:p.decision.id};return v;
}
