// GET-only regression over the complete real synthetic closed census.
import assert from 'node:assert/strict';
import {verifiedOwnReportBundle} from '../../assets/own-payroll-report-model.js';
import {loadOwnF931Preparation} from '../../assets/own-f931-preparation-client.js';
import {ownF931Proof,ownF931VisibleContracts} from '../../assets/own-f931-preparation-model.js';
const totalKeys=['remuneration','non_remuneration','deduction','employer_contribution','gross','net'];
export async function verifyOwnFiscalF931Jurisdictions({api,params,before,ok}){
 const details=[],receipts=[];
 for(const liquidationType of params.types){
  const detail=await api('close',{query:{resource:'detail',period:params.period,liquidationType}});details.push(detail);
  for(const group of detail.groups.filter(g=>g.state==='closed'))receipts.push(await api('close',{query:{resource:'group',id:group.id}}));
 }
 const bundle=await verifiedOwnReportBundle({from:params.period,to:params.period,types:params.types},details,receipts);
 assert.equal(bundle.employees.length,before.scopeParticipations);assert.equal(bundle.sources.length,before.closedGroups);
 const buckets={'42':0,'55':0,not_reported:0,not_captured:0},members={'42':[],'55':[]};
 for(const row of bundle.employees){
  const e=row.employee,version=row.source.snapshot.version;
  if(version==='own-close-snapshot.v1'){assert.equal(Object.hasOwn(e,'jurisdiction'),false);buckets.not_captured++;continue;}
  assert.ok(['own-close-snapshot.v2','own-close-snapshot.v3'].includes(version));
  assert.ok(e.jurisdiction&&Object.hasOwn(e.jurisdiction,'code'));
  if(e.jurisdiction.basis==='not_captured'){assert.equal(e.jurisdiction.code,null);buckets.not_captured++;continue;}
  if(e.jurisdiction.code===null){buckets.not_reported++;continue;}
  assert.ok(['42','55'].includes(e.jurisdiction.code));buckets[e.jurisdiction.code]++;members[e.jurisdiction.code].push(row);
 }
 for(const [k,v]of Object.entries(buckets))assert.equal(before.jurisdictionCoverage[k],v);
 const precision=Math.max(2,...bundle.sources.map(s=>s.snapshot.precision));assert.ok(Number.isSafeInteger(precision)&&precision>=2&&precision<=8);
 const scaled=value=>{assert.equal(typeof value,'string');const m=/^(-?)([0-9]+)(?:[.]([0-9]+))?$/.exec(value);assert.ok(m);assert.ok((m[3]??'').length<=precision);return(m[1]?-1n:1n)*BigInt(m[2]+(m[3]??'').padEnd(precision,'0'));};
 const globalFiscal=v=>{const{selectedContracts,...rest}=v;return rest;};
 const fiscalStates=v=>v.map(({selectedTypes,selectedParticipations,...rest})=>rest);
 const summary={known:buckets.not_reported+buckets.not_captured===0,closedGroups:bundle.sources.length,scopeContracts:before.scopeContracts,scopeParticipations:before.scopeParticipations,buckets,choices:{}};
 let baselineCalls;
 for(const jurisdiction of ['all','42','55']){
  const calls=[];let sessions=0;
  const read=kind=>async query=>{assert.equal(Object.hasOwn(query,'jurisdiction'),false);calls.push({kind,query:{...query}});return api(kind,{query});};
  const load=()=>loadOwnF931Preparation({...params,jurisdiction},{read:read('close'),readFiscal:read('fiscalFacts'),session:async()=>{sessions++;}});
  if(jurisdiction!=='all'&&!summary.known){
   await assert.rejects(load,/jurisdicciones no capturadas o sin informar/);
   assert.equal(sessions,1);assert.equal(calls.filter(c=>c.kind==='close').length,bundle.sources.length+params.types.length);assert.equal(calls.filter(c=>c.kind==='fiscalFacts').length,1);
   summary.choices[jurisdiction]={rejected:true};continue;
  }
  const report=await load(),chosen=jurisdiction==='all'?bundle.employees:members[jurisdiction],ids=[...new Set(chosen.map(r=>r.employee.contractId))].sort();
  assert.equal(sessions,2);assert.equal(calls.filter(c=>c.kind==='close').length,bundle.sources.length+2*params.types.length);assert.equal(calls.filter(c=>c.kind==='fiscalFacts').length,2);
  if(jurisdiction==='all'){baselineCalls=calls;assert.equal(ownF931Proof(report),ownF931Proof(before));}else{assert.deepEqual(calls,baselineCalls);assert.notEqual(ownF931Proof(report),ownF931Proof(before));}
  assert.equal(report.participations,chosen.length);assert.equal(report.contracts,ids.length);
  for(const key of ['scopeContracts','scopeParticipations','scopeTotals','jurisdictionCoverage','issues','requirements','sourceProof','sourceHashes','fiscalProof','fieldReferences'])assert.deepEqual(report[key],before[key],key);
  assert.deepEqual(globalFiscal(report.fiscalCoverage),globalFiscal(before.fiscalCoverage));assert.deepEqual(fiscalStates(report.fiscalRows),fiscalStates(before.fiscalRows));
  assert.deepEqual(report.fiscalRows.filter(r=>r.selectedParticipations>0).map(r=>r.contractId).sort(),ids);
  for(const row of report.fiscalRows){const selected=chosen.filter(c=>c.employee.contractId===row.contractId);assert.equal(row.selectedParticipations,selected.length);assert.deepEqual([...row.selectedTypes].sort(),[...new Set(selected.map(c=>c.type))].sort());}
  for(const key of totalKeys){if(!chosen.length)assert.equal(report.totals[key],null);else assert.equal(scaled(report.totals[key]),chosen.reduce((sum,r)=>sum+scaled(r.employee.totals[key]),0n),key);}
  const visible=[];let page=1,pages;do{const view=ownF931VisibleContracts(report,'','all',page);pages=view.pages;visible.push(...view.rows.map(r=>r.contractId));page++;}while(page<=pages);
  assert.deepEqual(visible.sort(),ids);assert.equal(report.canGenerate,false);assert.equal(report.canSubmit,false);
  summary.choices[jurisdiction]={rejected:false,contracts:ids.length,participations:chosen.length};
 }
 assert.equal(summary.choices.all.contracts,before.scopeContracts);
 ok(true,summary.known?'native F931 all/42/55 uses identical complete GET censuses, exact captured membership/totals and unchanged global fiscal issues/proofs':'native F931 retains every unknown jurisdiction in all and rejects both narrowed choices without omitting any closed group');
 return summary;
}
