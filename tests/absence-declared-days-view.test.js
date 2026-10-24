// Standalone source/VM test: only literal view functions and injected formatters.
// No page bootstrap, browser, network, PDF, SQL or application import.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const absence=fs.readFileSync(new URL('../ausentismo-control.html',import.meta.url),'utf8');
const assistant=fs.readFileSync(new URL('../asistente.html',import.meta.url),'utf8');
function section(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'literal function boundaries');return source.slice(a,b);}
function absenceView(){
  const script=section(absence,'      function object(value)','      function buildParams(resource)');
  return vm.runInNewContext(script+';({normalizeAnalytics,normalizeComparison,normalizeEvent})',{
    integerFormat:new Intl.NumberFormat('es-AR'),decimalFormat:new Intl.NumberFormat('es-AR'),
    dateFormat:new Intl.DateTimeFormat('es-AR'),monthFormat:new Intl.DateTimeFormat('es-AR'),state:{page:1,pageSize:25},
  });
}
const complete={events:1,affectedContracts:1,sourceDeclaredDays:5,knownSourceDeclaredDays:5,eventsWithDeclaredDays:1,eventsWithoutDeclaredDays:0};
const unknown={events:1,affectedContracts:1,sourceDeclaredDays:null,knownSourceDeclaredDays:null,eventsWithDeclaredDays:0,eventsWithoutDeclaredDays:1};
function payload(row=unknown){return{ok:true,data:{summary:{...row,days:999},days:888,series:[{...row,period:'2026-09-01',days:777}],reasons:[{...row,label:'QA'}],sectors:[{...row,label:'QA'}],comparison:{available:true,current:{...row,days:666},previous:complete,changePercent:{events:0,affectedContracts:0,sourceDeclaredDays:-100}}}};}
test('canonical null survives aliases and root fallback in summary, series and both comparison windows',()=>{
  const view=absenceView(),d=view.normalizeAnalytics(payload());
  assert.equal(d.summary.declaredDays,null);assert.equal(d.summary.eventsWithoutDeclaredDays,1);
  assert.equal(d.monthly[0].declaredDays,null);assert.equal(d.reasons[0].declaredDays,null);assert.equal(d.sectors[0].declaredDays,null);
  assert.equal(d.comparison.current.days,null);assert.equal(d.comparison.change.days,null);
  const reverse=payload(complete);reverse.data.comparison.previous={...unknown,days:555};
  const r=view.normalizeAnalytics(reverse);assert.equal(r.comparison.previous.days,null);assert.equal(r.comparison.change.days,null);
});
test('event days and quantity are separate and their canonical nulls override conflicting aliases',()=>{
  const view=absenceView(),event=view.normalizeEvent({sourceDeclaredDays:null,days:99,quantity:4,sourceQuantity:null});
  assert.equal(event.declaredDays,null);assert.equal(event.sourceQuantity,null);
  assert.equal(view.normalizeEvent({quantity:4}).declaredDays,null);
  assert.equal(view.normalizeEvent({sourceDeclaredDays:0,sourceQuantity:3}).declaredDays,0);
  assert.equal(view.normalizeEvent({sourceDeclaredDays:-2,sourceQuantity:-3}).declaredDays,-2);
});
test('explicit zero and negative aggregate values remain numbers; inconsistent complete claims are rejected',()=>{
  const view=absenceView();for(const value of [0,-2]){const row={...complete,sourceDeclaredDays:value,knownSourceDeclaredDays:value};assert.equal(view.normalizeAnalytics(payload(row)).summary.declaredDays,value);}
  assert.throws(()=>view.normalizeAnalytics(payload({...unknown,sourceDeclaredDays:0})),/cobertura/);
  const missing={...unknown};delete missing.eventsWithDeclaredDays;delete missing.eventsWithoutDeclaredDays;
  assert.throws(()=>view.normalizeAnalytics(payload(missing)),/cobertura/,'both coverage counts are required');
});
function assistantView(){
  const script=section(assistant,'      function normalizeFacts(value)','      function normalizeSources(value, fallbackCutoff)');
  const cleanText=(value,fallback='')=>value===null||value===undefined||value===''?fallback:String(value).trim();
  return vm.runInNewContext(script+';({factsFromPayload,normalizeResultView})',{
    cleanText,boundedText:(value,n)=>cleanText(value).slice(0,n),factValue:value=>typeof value==='number'?String(value):cleanText(value),readableCode:cleanText,
  });
}
test('assistant absence facts/view and executive facts retain No informado and exact coverage',()=>{
  const view=assistantView(),p={intent:'absence_analysis',data:{summary:unknown,range:{effective:{from:'2026-09-01',to:'2026-09-10'}}}};
  const facts=view.factsFromPayload(p).join(' | '),render=view.normalizeResultView(p);
  assert.match(facts,/Días declarados.*No informado/);assert.match(facts,/Días informados en 0 de 1 eventos/);
  assert.ok(render.metrics.some(row=>row.label==='Días declarados en origen'&&row.value==='No informado'));
  assert.ok(render.metrics.some(row=>row.label==='Cobertura de días'&&row.value.includes('0 de 1')));
  const exec=view.factsFromPayload({intent:'executive_analysis',data:{absence:{summary:unknown}}}).join(' | ');
  assert.match(exec,/Días declarados.*No informado/);assert.match(exec,/Días informados en 0 de 1 eventos/);
});
test('partial known sum is explicitly partial in assistant facts, not a replacement for total',()=>{
  const row={events:2,affectedContracts:2,sourceDeclaredDays:null,knownSourceDeclaredDays:2,eventsWithDeclaredDays:1,eventsWithoutDeclaredDays:1};
  const facts=assistantView().factsFromPayload({intent:'absence_analysis',data:{summary:row}}).join(' | ');
  assert.match(facts,/No informado/);assert.match(facts,/1 de 2 eventos/);assert.match(facts,/Suma parcial informada: 2/);
});
