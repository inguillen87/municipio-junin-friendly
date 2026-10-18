// Pure verifier scheduling causal. No browser, API, SQL or product import.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const employee={contractId:'10000000-0000-4000-8000-000000000001',employeeNumber:'QA-19001',legajo:'QA-19001',nombre:'Persona sintética QA'};
const period='2026-10';
const waitLine="   await d.waitFor({state:'hidden'});await s('subject').filter({hasText:'Legajo '+employee.employeeNumber+' · '}).waitFor({state:'visible'});\n";
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function selectSource(source){
  const anchor='const select=async employee=>{',start=source.indexOf(anchor),end=source.indexOf('\n  };',start);
  assert.ok(start>=0&&end>start,'The actual verifier select function must be present');
  return source.slice(start+'const select='.length,end+'\n  }'.length);
}
function periodListenerSource(source){
  const anchor="$('period').addEventListener('change',",lines=source.split('\n').filter(value=>value.includes(anchor));
  assert.equal(lines.length,1);assert.ok(lines[0].trim().endsWith('});'));
  return lines[0].slice(lines[0].indexOf(anchor)+anchor.length).trim().slice(0,-2);
}
async function scenario(source,panelSource){
  const gate=deferred(),progress=deferred(),closed=deferred(),events=[];
  let dialogOpen=false,nativeVerificationPending=false,aborted=false,content=false;
  const field={value:''},subject={textContent:'No hay un legajo seleccionado.'},scope={attempt:null,chosen:null};
  const label=()=> 'Legajo '+employee.legajo+' · '+employee.nombre;
  const clearViews=()=>{
    events.push('clear-views');content=false;scope.chosen=null;dialogOpen=false;subject.textContent='No hay un legajo seleccionado.';
    if(nativeVerificationPending){aborted=true;events.push('native-verification-aborted');}
  };
  // Use the real change callback; only DOM/native boundaries are inert.
  Object.assign(scope,{$:key=>{if(key==='period')return field;assert.equal(key,'subject');return subject;},clearViews,controls(){}});
  const changed=vm.runInNewContext('('+periodListenerSource(panelSource)+')',scope);
  const applyClick=async()=>{
    events.push('apply-click');nativeVerificationPending=true;
    // A click completes before the application finishes its awaited native
    // roster verification. No response, permission or SQL is synthesized.
    void (async()=>{
      await gate.promise;
      if(aborted){nativeVerificationPending=false;return;}
      nativeVerificationPending=false;scope.chosen=employee;subject.textContent=label();dialogOpen=false;
      events.push('subject-applied');closed.resolve();
    })();
  };
  const dialog={
    getByLabel(value){assert.equal(value,'Nombre, apellido o legajo');return {async fill(value){assert.equal(value,employee.employeeNumber);}};},
    getByRole(role,{name,exact}){
      assert.equal(role,'button');assert.equal(exact,true);
      if(name==='Buscar')return {async click(){events.push('search');}};
      assert.equal(name,'Usar este legajo');return {click:applyClick};
    },
    locator(selector){assert.equal(selector,'input[value="'+employee.contractId+'"]');return {async check(){events.push('checked-exact-contract');}};},
    async waitFor({state}){assert.equal(state,'hidden');events.push('wait-modal-hidden');progress.resolve();if(dialogOpen)await closed.promise;assert.equal(dialogOpen,false);},
  };
  const s=key=>{
    if(key==='picker')return {async click(){dialogOpen=true;events.push('picker-open');}};
    if(key==='period')return {async fill(value){field.value=value;events.push('period-fill');changed();progress.resolve();}};
    if(key==='refresh')return {async click(){content=Boolean(scope.chosen&&field.value);events.push('refresh');}};
    if(key==='subject')return {filter({hasText}){return {async waitFor({state}){assert.equal(state,'visible');assert.equal(hasText,'Legajo '+employee.employeeNumber+' · ');assert.equal(scope.chosen,employee);assert.equal(subject.textContent,label());assert.ok(subject.textContent.includes(hasText));events.push('wait-subject-applied');}};}};
    assert.equal(key,'content');return {async waitFor({state}){assert.equal(state,'visible');if(!content)throw Error('CONTENT_HIDDEN_WITHOUT_SUBJECT');events.push('content-visible');}};
  };
  const page={locator(selector){assert.equal(selector,'#salaryWorkingTimePicker');return dialog;}};
  const select=vm.runInNewContext('('+selectSource(source)+')',{page,s,period,idle:async()=>{}});
  const outcome=select(employee).then(()=>({passed:true}),error=>({passed:false,message:error.message}));
  await progress.promise;const beforeVerificationFinished=[...events];gate.resolve();
  const result=await outcome;
  return {...result,events,beforeVerificationFinished,aborted,chosen:scope.chosen,subject:subject.textContent,content};
}
test('verifier applies native selection before its real period-change callback',async()=>{
  const current=read('scripts/lib/own-contract-working-time-browser.mjs'),panel=read('assets/own-contract-working-time-panel.js');
  assert.equal(current.split(waitLine).length,2,'The old control removes exactly the one reviewed wait line');
  const previous=current.replace(waitLine,'');
  assert.equal(previous.includes(waitLine),false);
  const old=await scenario(previous,panel);
  assert.equal(old.passed,false);assert.equal(old.message,'CONTENT_HIDDEN_WITHOUT_SUBJECT');
  assert.equal(old.aborted,true);assert.equal(old.chosen,null);assert.equal(old.subject,'No hay un legajo seleccionado.');
  assert.ok(old.beforeVerificationFinished.includes('period-fill'));
  const fixed=await scenario(current,panel);
  assert.equal(fixed.passed,true);assert.equal(fixed.aborted,false);assert.equal(fixed.chosen,employee);assert.equal(fixed.content,true);
  assert.equal(fixed.subject,'Legajo '+employee.legajo+' · '+employee.nombre);
  assert.ok(fixed.beforeVerificationFinished.includes('wait-modal-hidden'));
  assert.ok(!fixed.beforeVerificationFinished.includes('period-fill'));
  for(const event of ['subject-applied','wait-subject-applied'])assert.ok(fixed.events.indexOf(event)<fixed.events.indexOf('period-fill'));
});
