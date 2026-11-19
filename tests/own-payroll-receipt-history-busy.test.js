// Pure timing regressions execute actual controls/perform/history/clear/binding bodies in VM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read=()=>fs.readFileSync(new URL('../assets/own-payroll-receipt-panel.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function functionBody(source,name,next){
 const start=source.indexOf(name),end=source.indexOf('\n '+next,start);
 assert.ok(start>=0&&end>start,'ACTUAL_PANEL_FUNCTION_REQUIRED');return source.slice(start,end).trim();
}
class Element{
 constructor(tag='div',text=''){this.tagName=tag;this.textContent=text;this.dataset={};this.disabled=false;this.hidden=false;this.checked=false;this.children=[];this.listeners={};this.attributes={};}
 append(...rows){this.children.push(...rows);}
 replaceChildren(...rows){this.children=[...rows];}
 addEventListener(type,listener){this.listeners[type]=listener;}
 setAttribute(name,value){this.attributes[name]=value;}
 querySelectorAll(selector){assert.equal(selector,'[data-receipt-open]');const walk=x=>[...(x.dataset.receiptOpen?[x]:[]),...x.children.flatMap(walk)];return this.children.flatMap(walk);}
}
function fixture(){
 const source=read(),elements=new Map(),host=new Element(),events=[],batchReads=[],authSeen=deferred(),authRelease=deferred(),listSeen=deferred(),listRelease=deferred();
 let holdAuth=false,holdList=false;
 const $=key=>{if(!elements.has(key))elements.set(key,new Element());return elements.get(key);};
 const data={version:'own-receipt-list.v1',scopeVersion:'a'.repeat(64),period:'2026-11',items:[{id:'22222222-2222-4222-8222-222222222222',preparedAt:'2026-11-14T10:00:00Z',preparedBy:'PERSONA FICTICIA',recordCount:3,types:['monthly']}]};
 const context=vm.createContext({$,host,busy:false,attempt:null,preview:null,batch:null,list:null,issuerProfile:null,scopeDirty:false,page:1,seq:0,controller:null,access:{},notFound:false,definitiveRejection:null,
  AbortController,setTimeout,clearTimeout,active:true,stopped:false,
  live:()=>context.active&&!context.stopped,
  has:required=>required.every(v=>v==='read'),OWN_RECEIPT_PREPARE:['prepare'],OWN_RECEIPT_APPROVE:['approve'],OWN_RECEIPT_READ:['read'],commandCaps:()=>['approve'],
  typeControls(){},receiptGuidance(){},snapshot:()=>null,node:(tag,text)=>new Element(tag,text),howMany:(n,one,many)=>n+' '+(n===1?one:many),ownReceiptList:value=>value,
  status:(message,state)=>events.push({message,state}),invalidate(){context.seq++;context.busy=false;},
  async session(){if(holdAuth){holdAuth=false;authSeen.resolve();await authRelease.promise;}return true;},
  async request(query){assert.equal(query.resource,'list');if(holdList){holdList=false;listSeen.resolve();await listRelease.promise;}return structuredClone(data);},
  async loadBatch(id){batchReads.push(id);throw Error('SYNTHETIC_PROBE_STOPS_BEFORE_BATCH_TRANSPORT');},render(){throw Error('NO_FAKE_BATCH_MAY_BE_RENDERED');}
 });
 const controls=functionBody(source,'function controls(){','function clear(){'),clear=functionBody(source,'function clear(){','function invalidate('),perform=functionBody(source,'async function perform(work){','async function loadIssuer('),history=functionBody(source,'async function history(){','async function settle(');
 const journey=functionBody(source,'function receiptJourney(){','function controls(){');
 const model=fs.readFileSync(new URL('../assets/own-payroll-receipt-model.js',import.meta.url),'utf8'),textHelper=model.split('\n').find(line=>line.startsWith('const text=')),reasonStart=model.indexOf('export function ownReceiptReasonProblem('),reasonEnd=model.indexOf('\n}',reasonStart)+2;
 assert.ok(textHelper&&reasonStart>0&&reasonEnd>reasonStart);const reasonHelper=model.slice(reasonStart,reasonEnd).replace('export function','function');
 vm.runInContext([textHelper,reasonHelper,journey,controls,clear,perform,history].join('\n'),context,{timeout:1000});
 const begin=source.indexOf("$('history').addEventListener('click',"),end=source.indexOf(';for(const kind',begin);assert.ok(begin>0&&end>begin);
 vm.runInContext(source.slice(begin,end)+';',context,{timeout:1000});
 return{context,$,host,events,batchReads,data,authSeen,authRelease,listSeen,listRelease,hold(){holdAuth=true;holdList=true;},buttons:()=>$('list').querySelectorAll('[data-receipt-open]')};
}

test('receipt history locks existing rows throughout an active query',async()=>{
 const f=fixture();await f.context.history();const row=f.buttons()[0];assert.equal(row.disabled,false);
 f.context.busy=true;f.context.controls();assert.equal(row.disabled,true);assert.equal(f.host.attributes['aria-busy'],'true');
 f.context.busy=false;f.context.controls();assert.equal(row.disabled,false);
});
test('receipt history creates rows locked until the original operation settles',async()=>{
 const f=fixture();f.context.busy=true;await f.context.history();assert.equal(f.buttons()[0].disabled,true);
 f.context.busy=false;f.context.controls();assert.equal(f.buttons()[0].disabled,false);
});
test('deferred authentication and list response keep old rows locked and permit the exact new selection after settlement',async()=>{
 const f=fixture();await f.context.history();const old=f.buttons()[0];f.hold();
 const refreshing=f.$('history').listeners.click();await f.authSeen.promise;
 assert.equal(f.context.busy,true);assert.equal(f.buttons()[0],old);assert.equal(old.disabled,true);assert.deepEqual(f.batchReads,[]);
 f.authRelease.resolve();await f.listSeen.promise;assert.equal(f.buttons().length,0);assert.equal(f.host.attributes['aria-busy'],'true');
 f.listRelease.resolve();await refreshing;assert.equal(f.context.busy,false);
 const current=f.buttons()[0];assert.notEqual(current,old);assert.equal(current.disabled,false);
 await current.listeners.click();assert.deepEqual(f.batchReads,[f.data.items[0].id]);
 assert.equal(f.events.at(-1).message,'SYNTHETIC_PROBE_STOPS_BEFORE_BATCH_TRANSPORT');
});
test('an original pending command keeps historical selection locked without replacing its context',async()=>{
 const f=fixture();await f.context.history();const attempt={body:{command:'approve'}};f.context.attempt=attempt;f.context.controls();
 assert.equal(f.buttons()[0].disabled,true);assert.equal(f.$('history').disabled,true);assert.equal(f.context.attempt,attempt);
 f.context.attempt=null;f.context.controls();assert.equal(f.buttons()[0].disabled,false);
});
test('leaving the live panel keeps old history rows unavailable',async()=>{
 const f=fixture();await f.context.history();f.context.active=false;f.context.controls();
 assert.equal(f.buttons()[0].disabled,true);assert.equal(f.$('history').disabled,true);
});
