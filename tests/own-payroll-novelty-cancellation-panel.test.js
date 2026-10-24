import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import * as model from '../assets/own-payroll-novelties-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {createOwnNoveltyCancellation,ownNoveltyCancellationOwnerKey} from '../assets/own-payroll-novelty-cancellation.js';
import {batch,hash,uid} from './fixtures/own-payroll-novelty-cancellation-synthetic.js';

// Execute the actual mounted client source with synthetic DOM/HTTP/auth seams.
// Its workspace import is not evaluated: that closure contains the payroll engine.
class Element{
 constructor(tag='div',text=''){this.tag=tag;this.textContent=text;this.children=[];this.dataset={};this.events=new Map();this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.isConnected=true;this.type='';}
 set innerHTML(html){this.nodes=new Map();for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/g)){const key=match[2].match(/data-n-([a-z-]+)/)?.[1];if(!key)continue;const element=new Element(match[1]);element.hidden=/\bhidden\b/.test(match[2]);element.type=match[2].match(/type="([^"]+)"/)?.[1]??'';this.nodes.set(key,element);}}
 append(...items){this.children.push(...items);}prepend(...items){this.children.unshift(...items);}replaceChildren(...items){this.children=items;}
 setAttribute(key,value){this[key]=value;}addEventListener(name,handler){const list=this.events.get(name)??[];list.push(handler);this.events.set(name,list);}
 async fire(name='click',event={}){for(const handler of this.events.get(name)??[])await handler(event);}
 querySelector(selector){return this.nodes.get(selector.match(/data-n-([a-z-]+)/)?.[1]);}
 querySelectorAll(selector){const tags=selector.split(','),found=[];const walk=element=>{for(const child of element.children??[]){if(tags.includes(child.tag))found.push(child);walk(child);}};if(this.nodes)for(const child of this.nodes.values()){if(tags.includes(child.tag))found.push(child);walk(child);}else walk(this);return found;}
}
function mounted(){
 const document=new Element(),window=new Element(),host=new Element(),locks=[],posts=[],attemptReads=[],saved=new Map(),receipts=new Map(),hooks={};let nonce=80000,sessionId='synthetic-session-S1',email='synthetic@example.invalid';
 document.hidden=false;document.head=new Element('head');document.createElement=tag=>new Element(tag);
 for(let i=1;i<=3;i++){const value=batch(2,{id:uid(20000+i),status:'draft',decidedBy:null,approvals:[]});for(const [index,row]of value.rows.entries()){const id=uid(i*100+index+1),legajo='N/'+(i*100+index+1);Object.assign(row.values,{contractId:id,legajo});Object.assign(row.subject,{contractId:id,legajo,registrationId:uid(10000+i*100+index)});}value.rowsSha256=hash(value.rows.map(({values,subject})=>({values,subject})));saved.set(value.id,value);}
 const caps=new Set([...model.OWN_NOVELTY_READ,'payroll.novelty.prepare']);
 const fetch=async(url,options={})=>{
  let data,status=200;if(url==='/api/internal-auth')return {ok:true,status,json:async()=>({ok:true})};
  const parsed=new URL(url,'https://synthetic.invalid'),resource=parsed.searchParams.get('resource');
  if(resource==='bootstrap')data={version:'own-payroll-novelty-bootstrap.v1',complete:true,subjects:[...saved.values()].flatMap(value=>value.rows.map(row=>row.subject)),batches:[...saved.values()].map(value=>Object.fromEntries(['id','revision','status','periodMonth','payrollType','rowCount','preparedBy'].map(key=>[key,structuredClone(value[key])]))),permissions:{canPrepare:true,canApprove:false}};
  else if(resource==='detail')data=structuredClone(saved.get(parsed.searchParams.get('id')));
  else if(resource==='attempt'){const key=parsed.searchParams.get('key');attemptReads.push(key);data=structuredClone(receipts.get(key));if(!data){status=404;data=null;}}
  else if(options.method==='POST'){
   const body=JSON.parse(options.body).payload,key=options.headers['Idempotency-Key'];posts.push({body,key});await hooks.beforePost?.(posts.length);
   const original=saved.get(body.batchId),snapshot={...structuredClone(original),status:'cancelled',revision:original.revision+1};data={version:'own-payroll-novelty-receipt.v1',requestKey:key,requestSha256:hash(body),body,snapshot,replayed:false};saved.set(snapshot.id,snapshot);receipts.set(key,data);await hooks.afterCommit?.(posts.length);
  }else throw Error('Unexpected synthetic route: '+url);
  return {ok:status===200,status,json:async()=>status===200?{ok:true,data}:{ok:false,error:'No hay registro',code:'OWN_NOVELTY_NOT_FOUND'}};
 };
 const source=fs.readFileSync(new URL('../assets/own-payroll-novelties-panel.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function mountOwnPayrollNovelties','function mountOwnPayrollNovelties').replaceAll('import.meta.url',JSON.stringify(new URL('../assets/own-payroll-novelties-panel.js',import.meta.url).href));
 const names=[...Object.keys(model),'salarySerialized','createOwnNoveltyCancellation','ownNoveltyCancellationOwnerKey','ownRunWorkspaceAccess','OWN_RUN_TYPES','document','window','fetch','crypto','Option'];
 const types={monthly:'Mensual',first_fortnight:'Primera quincena',sac:'Aguinaldo',vacation:'Vacaciones',supplementary:'Suplementaria',final:'Final',other:'Otra'};
 const values=[...Object.values(model),salarySerialized,createOwnNoveltyCancellation,ownNoveltyCancellationOwnerKey,()=>({key:salarySerialized([sessionId,email,uid(99000),'synthetic-role']),caps:new Set(caps)}),types,document,window,fetch,{subtle:webcrypto.subtle,randomUUID:()=>uid(++nonce)},function Option(text,value){const n=new Element('option',text);n.value=value;return n;}];
 const mount=new Function(...names,source+';return mountOwnPayrollNovelties;')(...values),panel=mount(host,value=>locks.push(value));
 const $=key=>host.querySelector('[data-n-'+key+']'),text=element=>element.textContent+' '+element.children.map(text).join(' ');
 return {panel,host,document,window,locks,posts,attemptReads,saved,receipts,hooks,caps,$,text,renewSession(){sessionId='synthetic-session-S2';},changeAccount(){email='another@example.invalid';},async locate(){await $('refresh').fire();$('bulk-period').value='2026-10';$('bulk-type').value='monthly';$('bulk-concept').value='120';await $('bulk-locate').fire();}};
}

test('real mount locates/consents/posts complete batches, locks the parent and shows individual receipts',async()=>{
 const f=mounted();await f.locate();assert.equal(f.posts.length,0);assert.equal(f.$('fields').disabled,true);assert.equal(f.$('open').disabled,true);assert.equal(f.$('bulk-send').disabled,true);assert.equal(f.panel.hasPending(),true);
 assert.match(f.text(f.$('bulk-results')),/concepto 120.*2026-10.*Mensual/);
 f.$('bulk-confirm').checked=true;await f.$('bulk-confirm').fire('change');assert.equal(f.$('bulk-send').disabled,false);await f.$('bulk-send').fire();
 assert.equal(f.posts.length,3);assert.equal(f.$('bulk-send').hidden,true);assert.match(f.text(f.$('bulk-results')),/3 lotes con comprobante \(6 filas\)/);assert.equal(f.locks.at(-1),true,'group results stay locked until explicitly closed');
 await f.$('bulk-close').fire();assert.equal(f.$('fields').disabled,false);assert.equal(f.panel.hasPending(),false);assert.equal(f.locks.at(-1),false);
});
test('real hide→refresh→404 permits renewed consent and same-key retry, preserving immutable filters',async()=>{
 const f=mounted();let release,failOnce=true;f.hooks.beforePost=n=>{if(n===2&&failOnce){failOnce=false;return new Promise((resolve,reject)=>{release=()=>reject(Error('Sin respuesta'));});}};
 await f.locate();f.$('bulk-confirm').checked=true;await f.$('bulk-confirm').fire('change');const sending=f.$('bulk-send').fire();while(!release)await new Promise(resolve=>setImmediate(resolve));
 const pending=structuredClone(f.posts[1]);f.document.hidden=true;await f.document.fire('visibilitychange');assert.equal(f.$('content').hidden,true);assert.equal(f.$('bulk-confirm').checked,false);assert.equal(f.$('bulk-period').value,'');assert.equal(f.$('bulk-results').children.length,0);release();await sending;
 f.document.hidden=false;await f.$('refresh').fire();assert.equal(f.$('recover').hidden,false);await f.$('recover').fire();
 assert.deepEqual(f.attemptReads,[pending.key]);assert.equal(f.$('bulk-confirm').disabled,false,'404 must let the operator confirm the original immutable group again');
 assert.equal(f.$('bulk-period').value,'2026-10');assert.equal(f.$('bulk-type').value,'monthly');assert.equal(f.$('bulk-concept').value,'120');assert.match(f.text(f.$('bulk-results')),/concepto 120.*2026-10.*Mensual/);
 f.$('bulk-confirm').checked=true;await f.$('bulk-confirm').fire('change');assert.equal(f.$('bulk-send').disabled,false);await f.$('bulk-send').fire();
 assert.equal(f.posts.length,4);assert.deepEqual(f.posts[2],pending);assert.equal(f.$('bulk-send').hidden,true);
});
test('real hide with committed B recovers only B and requires a new consent before sending C',async()=>{
 const f=mounted();let release;f.hooks.afterCommit=n=>{if(n===2)return new Promise(resolve=>{release=resolve;});};await f.locate();f.$('bulk-confirm').checked=true;await f.$('bulk-confirm').fire('change');const sending=f.$('bulk-send').fire();while(!release)await new Promise(resolve=>setImmediate(resolve));
 f.document.hidden=true;await f.document.fire('visibilitychange');release();await sending;f.document.hidden=false;f.renewSession();await f.$('refresh').fire();await f.$('recover').fire();assert.equal(f.posts.length,2);assert.equal(f.$('bulk-send').disabled,true);assert.equal(f.$('bulk-confirm').disabled,false);assert.equal(f.$('bulk-period').value,'2026-10');
 f.$('bulk-confirm').checked=true;await f.$('bulk-confirm').fire('change');await f.$('bulk-send').fire();assert.equal(f.posts.length,3);assert.match(f.text(f.$('bulk-results')),/3 lotes con comprobante/);
});
test('real capability event hides group detail and preserves an uncertain key until its recovery',async()=>{
 const f=mounted();let release;f.hooks.afterCommit=n=>{if(n===1)return new Promise(resolve=>{release=resolve;});};await f.locate();f.$('bulk-confirm').checked=true;const sending=f.$('bulk-send').fire();while(!release)await new Promise(resolve=>setImmediate(resolve));
 f.caps.delete('payroll.novelty.prepare');await f.document.fire('municontrol:capabilities-ready',{detail:{tenantCapabilities:[...f.caps]}});assert.equal(f.$('content').hidden,true);assert.equal(f.$('bulk-results').children.length,0);assert.equal(f.panel.hasPending(),true);release();await sending;assert.equal(f.posts.length,1);
});
test('another account cannot recover the retained group key or expose its rows',async()=>{
 const f=mounted();f.hooks.beforePost=()=>{throw Error('Sin respuesta');};await f.locate();f.$('bulk-confirm').checked=true;await f.$('bulk-send').fire();assert.equal(f.posts.length,1);
 f.panel.deny();f.changeAccount();await f.$('refresh').fire();await f.$('recover').fire();assert.equal(f.attemptReads.length,0);assert.equal(f.$('content').hidden,true);assert.equal(f.$('bulk-results').children.length,0);assert.equal(f.panel.hasPending(),true);assert.equal(f.posts.length,1);
});
