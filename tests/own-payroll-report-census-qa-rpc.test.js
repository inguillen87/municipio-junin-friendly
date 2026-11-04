import test from 'node:test';
import assert from 'node:assert/strict';
import {OWN_REPORT_CENSUS_QA_QUERY,ownReportCensusQaRpc,ownReportCensusQaResult,ownReportCensusQaStatements} from '../scripts/lib/own-payroll-report-census-qa-rpc.mjs';
const schema='mc_qa_fixed_092_'+'a'.repeat(32),values=['{"actorEmail":"qa@example.invalid"}','2026-10','sac'];
test('the exact census signature, casts and all three values survive relocation',()=>{
 assert.equal(ownReportCensusQaRpc(OWN_REPORT_CENSUS_QA_QUERY,values,schema),'SELECT '+schema+'.own_close_report_census_v1(\'{"actorEmail":"qa@example.invalid"}\'::jsonb,\'2026-10\'::text,\'sac\'::text) AS result');
});
test('a namespace, cast, arity, suffix or operation change is rejected',()=>{
 for(const query of [OWN_REPORT_CENSUS_QA_QUERY.replace('public.','private.'),OWN_REPORT_CENSUS_QA_QUERY.replace('$3::text','$3::uuid'),OWN_REPORT_CENSUS_QA_QUERY+';',OWN_REPORT_CENSUS_QA_QUERY.replace('report_census','report_census_other')])assert.throws(()=>ownReportCensusQaRpc(query,values,schema),/CENSUS_QA_RPC_NOT_ALLOWED/);
 for(const args of [values.slice(0,2),[...values,'extra']])assert.throws(()=>ownReportCensusQaRpc(OWN_REPORT_CENSUS_QA_QUERY,args,schema),/CENSUS_QA_ARITY_REQUIRED/);
 assert.throws(()=>ownReportCensusQaRpc(OWN_REPORT_CENSUS_QA_QUERY,values,'public'),/CENSUS_QA_SCHEMA_REQUIRED/);
});
test('inherited array holes cannot be hidden by one extra own key',()=>{
 const sparse=[values[0],,values[2]],proto=Object.create(Array.prototype);Object.defineProperty(proto,'1',{value:values[1]});Object.setPrototypeOf(sparse,proto);sparse.extra='compensates missing index';
 assert.equal(Reflect.ownKeys(sparse).length,sparse.length+1);
 assert.throws(()=>ownReportCensusQaRpc(OWN_REPORT_CENSUS_QA_QUERY,sparse,schema),/CENSUS_QA_ARITY_REQUIRED/);
});
test('opaque content is quoted only after selecting the finite source statement',()=>{
 const hostile=JSON.stringify({text:"public.own_close_group_v1($2); ' OR true; --"});
 const result=ownReportCensusQaRpc(OWN_REPORT_CENSUS_QA_QUERY,[hostile,...values.slice(1)],schema);
 assert.ok(result.includes("public.own_close_group_v1($2); '' OR true; --"));
 assert.equal(result.split(schema+'.').length,2);
 for(const args of [['[]',...values.slice(1)],['broken',...values.slice(1)],[values[0],'2026-13','sac'],[...values.slice(0,2),'unknown']])assert.throws(()=>ownReportCensusQaRpc(OWN_REPORT_CENSUS_QA_QUERY,args,schema));
});
test('the finite renderer includes exactly the approved vector signatures',()=>{
 const queries=ownReportCensusQaStatements();assert.equal(queries.length,22);assert.equal(new Set(queries).size,22);assert.ok(queries.includes(OWN_REPORT_CENSUS_QA_QUERY));
 assert.ok(queries.every(query=>/^SELECT public\.[a-z0-9_]+\(\$1::jsonb/.test(query)&&!query.includes(';')));
});
test('one native runtime call yields its original result; no retry or error replacement',async()=>{
 let calls=0;const packet={same:true};const success=await ownReportCensusQaResult(async sql=>{calls++;assert.equal(sql,ownReportCensusQaRpc(OWN_REPORT_CENSUS_QA_QUERY,values,schema));return packet;},OWN_REPORT_CENSUS_QA_QUERY,values,schema);
 assert.equal(calls,1);assert.equal(success[0].result,packet);
 const cause=Error('synthetic original cause'),error=Error('synthetic original error',{cause});calls=0;
 await assert.rejects(()=>ownReportCensusQaResult(async()=>{calls++;throw error;},OWN_REPORT_CENSUS_QA_QUERY,values,schema),actual=>actual===error&&actual.cause===cause);assert.equal(calls,1);
});
