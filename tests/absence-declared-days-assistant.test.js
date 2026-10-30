// Standalone assistant protocol tests: all data, SQL, authority, quota and
// provider transport are injected. No real HTTP/PDF/SQL/browser or credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternalAssistantHandler} from '../api/internal-assistant.js';

const caps=['assistant.use','absence.analytics.read','workforce.summary.read','workforce.structure.read','payroll.read','quality.read','lineage.read'];
const metric=(withDays,withoutDays,known)=>({events:withDays+withoutDays,affectedContracts:withDays+withoutDays,sourceDeclaredDays:withoutDays?null:known,knownSourceDeclaredDays:withDays?known:withoutDays?null:0,eventsWithDeclaredDays:withDays,eventsWithoutDeclaredDays:withoutDays});
function absenceResult(current,previous=metric(6,0,12)){
  const range={from:'2026-08-01',to:'2026-09-10'};
  return{status:200,payload:{ok:true,data:{summary:current,reasons:[{label:'Motivo QA',...current}],sectors:[{label:'Sector QA',...current}],
    comparison:{available:true,basis:'previous_year_same_calendar_window',current:{range,...current},previous:{range:{from:'2025-08-01',to:'2025-09-10'},...previous},changePercent:{events:0,affectedContracts:0,sourceDeclaredDays:-100}}},
    range:{requested:range,effective:range,clamped:{from:false,to:false}},quality:{sourceCutoff:'2026-09-10',unitSemantics:'Eventos administrativos, no jornadas perdidas',sectorSemantics:'Sector al corte'},meta:{ratesAvailable:false,sectorSemantics:'Sector al corte'}}};
}
async function read(current,{previous,intent='absence_analysis',enhance=false}={}){
  const providerBodies=[],result=absenceResult(current,previous),sqlCalls=[];
  result.payload.data.rows=[{name:'PRIVATE_TRAP',contractId:'PRIVATE_CONTRACT',dni:'PRIVATE_DOCUMENT'}];
  const handler=createInternalAssistantHandler({
    requireCompatibleInternalAccess:async()=>({mode:'managed',session:{id:'absence-source-test',email:'qa@example.invalid'},principal:{user:{email:'qa@example.invalid'},tenant:{id:'00000000-0000-4000-8000-000000000101',effectiveCapabilities:caps}}}),
    effectiveSourceSnapshot:async()=>'synthetic-publication',assertEffectiveSourceSnapshot:async()=>{},
    getInternalSql:async()=>({query:async(...args)=>{sqlCalls.push(args);return[];}}),getTenantIdentitySql:async()=>({query:async()=>[]}),
    takeIdentityRateLimit:async()=>({allowed:true,remaining:10}),
    absenceAnalytics:async()=>result,
    integrationQuality:async()=>({status:'ready',source:{cutoff:'2026-09-10'},workforceControl:{administrative:{value:6},liquidable:{value:6},difference:{value:0}},identityEnrichment:{crosswalk:{}}}),
    payrollControl:async()=>({status:'ready',quality:{},source:{cutoff:'2026-09-10'}}),
    canonicalScope:async()=>({totalContracts:6,totalPeople:6,asOf:'2026-09-10'}),
    qualityOverview:async()=>({status:503,payload:{ok:false,error:'QA unavailable'}}),
    env:{AI_ASSISTANT_EXTERNAL_ENRICHMENT_ENABLED:'true',AI_ASSISTANT_DURABLE_QUOTA_CERTIFIED:'true',AI_ASSISTANT_QUOTA_PEPPER:'synthetic-absence-quota-pepper-32bytes',OPENAI_API_KEY:'synthetic-openai-key',HF_TOKEN:'synthetic-provider-token'},
    fetch:async(url,options)=>{
      if(url==='https://api.openai.com/v1/responses')return{ok:false,status:503,async json(){return{error:{code:'synthetic_unavailable'}};}};
      assert.ok(String(url).startsWith('https://router.huggingface.co/'),'only the injected provider branch is expected');
      providerBodies.push(JSON.parse(options.body));
      return{ok:true,async json(){return{choices:[{message:{content:'Resumen agregado QA.'}}]};}};
    },
    now:()=>Date.parse('2026-10-24T12:00:00Z'),quotaStore:new Map(),logger:{info(){}},requestIdFactory:()=> 'absence-days-source-test',
  });
  const response={statusCode:null,payload:null,setHeader(){},status(value){this.statusCode=value;return this;},json(value){this.payload=value;return value;}};
  await handler({method:'POST',headers:{'content-type':'application/json'},body:{intent,enhance,from:'2026-08-01',to:'2026-09-10'}},response);
  return{response,providerBodies,sqlCalls};
}
test('assistant narrative and internal DTO retain unknown total and coverage without a zero-day claim',async()=>{
  const {response,providerBodies,sqlCalls}=await read(metric(0,6,0));
  assert.equal(response.statusCode,200);assert.equal(response.payload.data.summary.sourceDeclaredDays,null);
  assert.equal(response.payload.data.summary.knownSourceDeclaredDays,null);assert.equal(response.payload.data.summary.eventsWithoutDeclaredDays,6);
  assert.match(response.payload.answer,/Días declarados no informados/);assert.match(response.payload.answer,/Días informados en 0 de 6 eventos/);
  assert.doesNotMatch(response.payload.answer,/\b0 días declarados/);assert.equal(response.payload.data.comparison.changePercent.sourceDeclaredDays,null);
  assert.equal(response.payload.data.comparison.declaredDaysComparison.reason,'incomplete_declared_days');
  assert.equal(providerBodies.length,0);assert.equal(sqlCalls.length,0);
  const missing={...metric(0,6,0)};delete missing.eventsWithDeclaredDays;delete missing.eventsWithoutDeclaredDays;
  const invalid=await read(missing);assert.notEqual(invalid.response.statusCode,200);assert.equal(invalid.response.payload.ok,false);
  assert.doesNotMatch(JSON.stringify(invalid.response.payload),/"sourceDeclaredDays":0/,'missing coverage cannot be published as zero');
});
test('safe provider projection retains partial coverage/null and cannot restore a fabricated day percentage',async()=>{
  const {response,providerBodies}=await read(metric(5,1,10),{enhance:true});
  assert.equal(response.statusCode,200);assert.equal(providerBodies.length,1);
  const wrapper=JSON.stringify(providerBodies[0]),body=providerBodies[0].messages[1].content;assert.match(body,/"sourceDeclaredDays":null/);
  assert.match(body,/"knownSourceDeclaredDays":10/);assert.match(body,/"eventsWithDeclaredDays":5/);assert.match(body,/"eventsWithoutDeclaredDays":1/);
  assert.match(body,/"reason":"incomplete_declared_days"/);assert.doesNotMatch(wrapper,/PRIVATE_TRAP|PRIVATE_CONTRACT|PRIVATE_DOCUMENT/);
  assert.equal(response.payload.data.summary.sourceDeclaredDays,null);assert.match(response.payload.answer,/Suma parcial/);
});
test('complete zero and negative historical days remain values rather than missing data',async()=>{
  for(const known of [0,-2]){
    const {response}=await read(metric(6,0,known));assert.equal(response.statusCode,200);
    assert.equal(response.payload.data.summary.sourceDeclaredDays,known);assert.equal(response.payload.data.summary.eventsWithoutDeclaredDays,0);
    assert.doesNotMatch(response.payload.answer,/Días declarados no informados|Total de días no informado/);
  }
});
test('executive aggregate reuses the same null and coverage without turning absence availability into zero days',async()=>{
  const {response}=await read(metric(0,6,0),{intent:'executive_analysis'});
  assert.equal(response.statusCode,200);assert.equal(response.payload.data.absence.summary.sourceDeclaredDays,null);
  assert.equal(response.payload.data.absence.summary.eventsWithoutDeclaredDays,6);assert.match(response.payload.answer,/Días declarados no informados/);
  assert.doesNotMatch(response.payload.answer,/\b0 días declarados/);
});
