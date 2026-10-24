// Standalone injected-SQL tests. No connection, HTTP, PDF, browser or native work.
import test from 'node:test';
import assert from 'node:assert/strict';
import {absenceAnalytics} from '../api/internal-data.js';

function aggregate(values){
  const known=values.filter(value=>value!==null);
  // The old SQL alias is also supplied faithfully for a causal baseline.
  // The successor query/mapper uses knownSourceDeclaredDays and the counts.
  return {events:values.length,affectedContracts:values.length,sourceDeclaredDays:known.reduce((sum,value)=>sum+value,0),knownSourceDeclaredDays:values.length>0&&known.length===0?null:known.reduce((sum,value)=>sum+value,0),eventsWithDeclaredDays:known.length,eventsWithoutDeclaredDays:values.length-known.length};
}
function fixture({current=[null],previous=[5],groups=null,globalMissing=999}={}){
  const calls=[];
  const sql={async query(statement,values=[]){
    const marker=/\/\* absence:([^* ]+)/.exec(statement)?.[1];calls.push({marker,statement,values});
    if(marker==='source')return[{importId:7,sourceCutoff:'2026-09-10T00:00:00Z',status:'completed'}];
    if(marker==='analytics-summary')return[aggregate(current)];
    if(marker==='comparison')return[aggregate(previous)];
    if(marker==='series')return (groups??[current]).map((group,index)=>({...aggregate(group),period:`2026-0${8+index}-01`,partial:false}));
    if(marker==='reasons')return (groups??[current]).map((group,index)=>({...aggregate(group),code:String(index),label:'Motivo QA '+index}));
    if(marker==='sectors')return (groups??[current]).map((group,index)=>({...aggregate(group),label:'Sector QA '+index}));
    if(marker==='quality')return[{sourceRows:1000,missingSourceDeclaredDays:globalMissing}];
    if(marker==='facet-reasons'||marker==='facet-sectors')return[];
    throw Error('Unexpected query '+marker);
  }};
  return{calls,sql,read:()=>absenceAnalytics(sql,{query:{from:'2026-08-01',to:'2026-09-10',sector:'QA sector',reasonCode:'QA'}})};
}
test('all unknown current days do not become zero or a false minus100 percent',async()=>{
  const f=fixture(),r=await f.read(),d=r.payload.data;
  assert.equal(r.status,200);assert.equal(d.summary.events,1);
  assert.equal(d.summary.sourceDeclaredDays,null);assert.equal(d.summary.knownSourceDeclaredDays,null);
  assert.equal(d.summary.eventsWithDeclaredDays,0);assert.equal(d.summary.eventsWithoutDeclaredDays,1);
  assert.equal(d.comparison.changePercent.sourceDeclaredDays,null);
  assert.deepEqual(d.comparison.declaredDaysComparison,{available:false,reason:'incomplete_declared_days'});
  assert.equal(d.comparison.changePercent.events,0);assert.equal(d.comparison.changePercent.affectedContracts,0);
});
test('an explicitly declared zero remains zero and its complete comparison is valid',async()=>{
  const d=(await fixture({current:[0]}).read()).payload.data;
  assert.equal(d.summary.sourceDeclaredDays,0);assert.equal(d.summary.eventsWithDeclaredDays,1);
  assert.equal(d.summary.eventsWithoutDeclaredDays,0);assert.equal(d.comparison.changePercent.sourceDeclaredDays,-100);
  assert.deepEqual(d.comparison.declaredDaysComparison,{available:true,reason:null});
});
test('partial known sum is a separate field and every month/reason/sector has its own coverage',async()=>{
  const f=fixture({current:[2,null],previous:[5,0],groups:[[2],[null]],globalMissing:777}),d=(await f.read()).payload.data;
  assert.equal(d.summary.sourceDeclaredDays,null);assert.equal(d.summary.knownSourceDeclaredDays,2);
  assert.equal(d.summary.eventsWithDeclaredDays,1);assert.equal(d.summary.eventsWithoutDeclaredDays,1);
  for(const rows of [d.series,d.reasons,d.sectors]){
    assert.equal(rows.length,2);assert.equal(rows[0].sourceDeclaredDays,2);assert.equal(rows[0].eventsWithoutDeclaredDays,0);
    assert.equal(rows[1].sourceDeclaredDays,null);assert.equal(rows[1].knownSourceDeclaredDays,null);assert.equal(rows[1].eventsWithoutDeclaredDays,1);
  }
  const relevant=f.calls.filter(call=>['analytics-summary','series','reasons','sectors'].includes(call.marker));
  assert.equal(relevant.length,4);
  for(const call of relevant){
    assert.ok(call.values.includes('QA sector'));assert.ok(call.values.includes('QA'));
    assert.match(call.statement,/count\(absence\.dias\)::int AS "eventsWithDeclaredDays"/);
    assert.match(call.statement,/count\(\*\) FILTER \(WHERE absence\.dias IS NULL\)::int AS "eventsWithoutDeclaredDays"/);
    assert.doesNotMatch(call.statement,/AS "sourceDeclaredDays"/);
  }
  assert.match(f.calls.find(call=>call.marker==='series').statement,/AS partial,\s*count\(absence\.dias\)[\s\S]*GROUP BY 1, 5 ORDER BY 1/);
});
test('unknown previous coverage also prevents comparison, independent of current completeness',async()=>{
  const d=(await fixture({current:[2],previous:[null]}).read()).payload.data;
  assert.equal(d.summary.sourceDeclaredDays,2);assert.equal(d.comparison.previous.sourceDeclaredDays,null);
  assert.equal(d.comparison.changePercent.sourceDeclaredDays,null);assert.equal(d.comparison.declaredDaysComparison.reason,'incomplete_declared_days');
});
test('an empty scope is explicitly zero events and does not borrow the global missing count',async()=>{
  const d=(await fixture({current:[],previous:[5],globalMissing:777}).read()).payload.data;
  assert.deepEqual(d.summary,{events:0,affectedContracts:0,sourceDeclaredDays:0,knownSourceDeclaredDays:0,eventsWithDeclaredDays:0,eventsWithoutDeclaredDays:0});
  assert.equal(d.comparison.changePercent.sourceDeclaredDays,-100);
});
test('zero previous total still yields no percentage while complete negative historical values remain visible',async()=>{
  const zero=(await fixture({current:[2],previous:[0]}).read()).payload.data;
  assert.equal(zero.comparison.changePercent.sourceDeclaredDays,null);assert.equal(zero.comparison.declaredDaysComparison.reason,'zero_previous_declared_days');
  const negative=(await fixture({current:[-2],previous:[5]}).read()).payload.data;
  assert.equal(negative.summary.sourceDeclaredDays,-2);assert.equal(negative.summary.knownSourceDeclaredDays,-2);
  assert.equal(negative.comparison.changePercent.sourceDeclaredDays,-140);
});
test('inconsistent coverage is rejected rather than asserted complete or silently repaired',async()=>{
  const f=fixture(),query=f.sql.query;f.sql.query=async(statement,values)=>{
    const rows=await query(statement,values);return statement.includes('absence:analytics-summary')?[{...rows[0],eventsWithDeclaredDays:2}]:rows;
  };
  await assert.rejects(f.read(),/ABSENCE_DECLARED_DAYS_CONTRACT_INVALID/);
  const missing=fixture(),original=missing.sql.query;
  missing.sql.query=async(statement,values)=>{
    const rows=await original(statement,values);
    if(statement.includes('absence:analytics-summary')){delete rows[0].eventsWithDeclaredDays;delete rows[0].eventsWithoutDeclaredDays;}
    return rows;
  };
  await assert.rejects(missing.read(),/ABSENCE_DECLARED_DAYS_CONTRACT_INVALID/,'both coverage counts are required');
});
